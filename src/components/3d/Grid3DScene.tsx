import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { Consumer, Reading, Alert, TrAcc } from '../../types'

interface Grid3DSceneProps {
  consumers: Consumer[]
  readings: Reading[]
  alerts: Alert[]
  transformers: TrAcc[]
  selectedConsumerId: string | null
  selectedTransformerId: string | null
  onSelectConsumer: (id: string) => void
  onSelectTransformer: (id: string) => void
}

// Fixed positions for transformers in the 3D space
const TR_POSITIONS: Record<string, [number, number, number]> = {
  'T-01': [-18, 2.0, -8],
  'T-02': [-6, 2.0, -8],
  'T-03': [6, 2.0, -8],
  'T-04': [18, 2.0, -8]
}

const SUBSTATION_POS: [number, number, number] = [0, 6.5, -26]

// Deterministic positioning of 12 consumers around each transformer
function getConsumerPosition(trId: string, indexInTr: number): [number, number, number] {
  const [tx, , tz] = TR_POSITIONS[trId] || [0, 2, -8]
  const row = Math.floor(indexInTr / 4) // 0, 1, 2
  const col = indexInTr % 4 // 0, 1, 2, 3

  const xOffset = (col - 1.5) * 2.8 + (row % 2 === 1 ? 0.6 : -0.6)
  const zOffset = 9 + row * 4.2 + (col % 2 === 0 ? 0.4 : -0.4)

  return [tx + xOffset, 0, tz + zOffset]
}

// Helper to create crisp, high-res canvas text sprites in 3D
function createLabelSprite(text: string, subtext?: string, isMain = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Background rounded card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(8, 8, 496, 112, 16)
  } else {
    ctx.rect(8, 8, 496, 112)
  }
  ctx.fill()

  // Border
  ctx.strokeStyle = isMain ? '#2563eb' : '#cbd5e1'
  ctx.lineWidth = isMain ? 4 : 2
  ctx.stroke()

  // Main text
  ctx.font = 'bold 36px sans-serif'
  ctx.fillStyle = isMain ? '#1e3a8a' : '#0f172a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, subtext ? 48 : 64)

  // Subtext if present
  if (subtext) {
    ctx.font = 'normal 22px sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText(subtext, 256, 88)
  }

  const texture = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(isMain ? 6.5 : 4.5, isMain ? 1.6 : 1.1, 1)
  return sprite
}

export const Grid3DScene: React.FC<Grid3DSceneProps> = ({
  consumers,
  readings,
  alerts,
  transformers,
  selectedConsumerId,
  selectedTransformerId,
  onSelectConsumer,
  onSelectTransformer
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<{ id: string; type: 'consumer' | 'transformer'; data?: any; x: number; y: number } | null>(null)

  // Camera animation target
  const cameraRef = useRef<{
    pos: THREE.Vector3
    target: THREE.Vector3
    isTransitioning: boolean
  }>({
    pos: new THREE.Vector3(0, 24, 26),
    target: new THREE.Vector3(0, 1, 0),
    isTransitioning: false
  })

  // Keep references to 3D objects for dynamic color/pulse updates
  const consumerMeshesRef = useRef<Map<string, { group: THREE.Group; meterMesh: THREE.Mesh; beaconMesh?: THREE.Mesh }>>(new Map())
  const transformerMeshesRef = useRef<Map<string, { group: THREE.Group; auraMesh: THREE.Mesh }>>(new Map())
  const particleSystemRef = useRef<{ points: THREE.Points; curves: THREE.QuadraticBezierCurve3[]; offsets: Float32Array } | null>(null)

  const latestReadings = React.useMemo(() => {
    const map = new Map<string, Reading>()
    for (const r of readings) {
      map.set(r.id, r)
    }
    return map
  }, [readings])

  const handleResetCamera = useCallback(() => {
    cameraRef.current.pos.set(0, 26, 28)
    cameraRef.current.target.set(0, 1, 0)
    cameraRef.current.isTransitioning = true
  }, [])

  const focusNode = useCallback((x: number, y: number, z: number, dist = 9) => {
    cameraRef.current.target.set(x, y, z)
    cameraRef.current.pos.set(x, y + dist * 0.7, z + dist)
    cameraRef.current.isTransitioning = true
  }, [])

  useEffect(() => {
    if (selectedConsumerId) {
      const entry = consumerMeshesRef.current.get(selectedConsumerId)
      if (entry) {
        const pos = entry.group.position
        focusNode(pos.x, pos.y, pos.z, 7)
      }
    }
  }, [selectedConsumerId, focusNode])

  useEffect(() => {
    if (selectedTransformerId) {
      const pos = TR_POSITIONS[selectedTransformerId]
      if (pos) {
        focusNode(pos[0], pos[1], pos[2], 12)
      }
    }
  }, [selectedTransformerId, focusNode])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf1f5f9) // Soft slate daylight
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.014)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
    camera.position.copy(cameraRef.current.pos)
    camera.lookAt(cameraRef.current.target)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      precision: 'mediump'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)

    // 2. Daytime Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4)
    dirLight.position.set(35, 55, 30)
    scene.add(dirLight)

    const skyFillLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.2)
    scene.add(skyFillLight)

    // 3. Clean Architectural Floor
    const floorGeo = new THREE.PlaneGeometry(120, 120)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.position.y = -0.05
    scene.add(floorMesh)

    const gridHelper = new THREE.GridHelper(100, 50, 0xcbd5e1, 0xe2e8f0)
    gridHelper.position.y = -0.04
    scene.add(gridHelper)

    // 4. Procedural Substation (High-Voltage 33kV Power Source)
    const substationGroup = new THREE.Group()
    substationGroup.position.set(...SUBSTATION_POS)

    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.3 })
    const towerGeo = new THREE.BoxGeometry(0.6, 9, 0.6)

    const leftTower = new THREE.Mesh(towerGeo, gantryMat)
    leftTower.position.set(-6, 0, 0)
    const rightTower = new THREE.Mesh(towerGeo, gantryMat)
    rightTower.position.set(6, 0, 0)
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.6), gantryMat)
    crossBeam.position.set(0, 4.2, 0)
    substationGroup.add(leftTower, rightTower, crossBeam)

    // Substation Transformer Units
    const subTrMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.3, roughness: 0.4 })
    for (let i = -2; i <= 2; i += 2) {
      const trBox = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 3, 16), subTrMat)
      trBox.position.set(i * 2.2, -2.5, 0)
      substationGroup.add(trBox)

      const insGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8)
      const insMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2 })
      const ins = new THREE.Mesh(insGeo, insMat)
      ins.position.set(i * 2.2, -0.6, 0)
      substationGroup.add(ins)
    }

    // 3D Floating Substation Label Sprite
    const subLabel = createLabelSprite('SUBSTATION (33kV / 11kV)', 'Grid Entry Point · 50.0 Hz', true)
    subLabel.position.set(0, 6.8, 0)
    substationGroup.add(subLabel)

    // Subtle Frequency Ring
    const freqRingGeo = new THREE.TorusGeometry(8, 0.06, 16, 64)
    const freqRingMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.35 })
    const freqRing = new THREE.Mesh(freqRingGeo, freqRingMat)
    freqRing.rotation.x = Math.PI / 2
    freqRing.position.set(0, 4.5, 0)
    substationGroup.add(freqRing)

    scene.add(substationGroup)

    // 5. Feeders & Catenary Cables
    const feederCurves: THREE.QuadraticBezierCurve3[] = []
    const feederMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 })

    Object.entries(TR_POSITIONS).forEach(([trId, trPos]) => {
      const start = new THREE.Vector3(SUBSTATION_POS[0] + (trPos[0] * 0.25), SUBSTATION_POS[1] + 4, SUBSTATION_POS[2])
      const end = new THREE.Vector3(trPos[0], trPos[1] + 2.5, trPos[2])
      const mid = new THREE.Vector3(
        (start.x + end.x) / 2,
        Math.min(start.y, end.y) - 1.5,
        (start.z + end.z) / 2
      )

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
      feederCurves.push(curve)

      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.1, 8, false)
      const tubeMesh = new THREE.Mesh(tubeGeo, feederMaterial)
      scene.add(tubeMesh)
    })

    // 6. Secondary Distribution Drop Lines (Transformers -> Consumers)
    const dropCurves: THREE.QuadraticBezierCurve3[] = []
    const dropMaterial = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.6 })

    consumers.forEach(consumer => {
      const trPos = TR_POSITIONS[consumer.tr] || [0, 2, -8]
      const indexInTr = parseInt(consumer.id.split('-')[1] || '1', 10) - 1
      const cPos = getConsumerPosition(consumer.tr, indexInTr % 12)

      const start = new THREE.Vector3(trPos[0], trPos[1] + 1.2, trPos[2])
      const end = new THREE.Vector3(cPos[0], cPos[1] + 1.1, cPos[2])
      const mid = new THREE.Vector3((start.x + end.x) / 2, Math.min(start.y, end.y) + 0.4, (start.z + end.z) / 2)

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
      dropCurves.push(curve)

      const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.035, 6, false)
      const tubeMesh = new THREE.Mesh(tubeGeo, dropMaterial)
      scene.add(tubeMesh)
    })

    // 7. Instanced Energy Particles moving along all curves
    const totalCurves = [...feederCurves, ...dropCurves]
    const particlesPerCurve = 4
    const totalParticles = totalCurves.length * particlesPerCurve

    const particleGeo = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(totalParticles * 3)
    const particleColors = new Float32Array(totalParticles * 3)
    const particleOffsets = new Float32Array(totalParticles)

    for (let i = 0; i < totalParticles; i++) {
      particleOffsets[i] = Math.random()
      particleColors[i * 3] = 0.14 // Electric Blue
      particleColors[i * 3 + 1] = 0.38
      particleColors[i * 3 + 2] = 0.92
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3))

    const particleMat = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    })

    const particleSystem = new THREE.Points(particleGeo, particleMat)
    scene.add(particleSystem)
    particleSystemRef.current = { points: particleSystem, curves: totalCurves, offsets: particleOffsets }

    // 8. Procedural Distribution Transformers (T-01 to T-04)
    Object.entries(TR_POSITIONS).forEach(([trId, trPos]) => {
      const trGroup = new THREE.Group()
      trGroup.position.set(...trPos)
      trGroup.userData = { id: trId, type: 'transformer' }

      // Concrete mounting pad
      const padGeo = new THREE.BoxGeometry(3.4, 0.4, 3.4)
      const padMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 })
      const padMesh = new THREE.Mesh(padGeo, padMat)
      padMesh.position.y = -1.8
      trGroup.add(padMesh)

      // Main transformer tank
      const tankGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.2, 16)
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.3, roughness: 0.5 })
      const tankMesh = new THREE.Mesh(tankGeo, tankMat)
      trGroup.add(tankMesh)

      // Cooling fins
      const finGeo = new THREE.BoxGeometry(0.08, 1.8, 1.8)
      const finMat = new THREE.MeshStandardMaterial({ color: 0x334155 })
      for (let angle = 0; angle < Math.PI; angle += Math.PI / 4) {
        const fin = new THREE.Mesh(finGeo, finMat)
        fin.rotation.y = angle
        trGroup.add(fin)
      }

      // Bushings
      for (let b = -0.5; b <= 0.5; b += 0.5) {
        const bGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8)
        const bMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 })
        const bMesh = new THREE.Mesh(bGeo, bMat)
        bMesh.position.set(b, 1.4, 0)
        trGroup.add(bMesh)
      }

      // 3D Floating Transformer Label Sprite
      const trLabel = createLabelSprite(trId, 'Distribution DTU')
      trLabel.position.set(0, 3.2, 0)
      trGroup.add(trLabel)

      // Ground Aura Ring
      const auraGeo = new THREE.RingGeometry(1.8, 2.1, 32)
      const auraMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      const auraMesh = new THREE.Mesh(auraGeo, auraMat)
      auraMesh.rotation.x = Math.PI / 2
      auraMesh.position.y = -1.78
      trGroup.add(auraMesh)

      scene.add(trGroup)
      transformerMeshesRef.current.set(trId, { group: trGroup, auraMesh })
    })

    // 9. Procedural 3D Consumer Buildings & Mounted Smart Meters
    consumers.forEach(c => {
      const indexInTr = parseInt(c.id.split('-')[1] || '1', 10) - 1
      const pos = getConsumerPosition(c.tr, indexInTr % 12)

      const cGroup = new THREE.Group()
      cGroup.position.set(...pos)
      cGroup.userData = { id: c.id, type: 'consumer', consumer: c }

      const wallMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 })
      const roofMat = new THREE.MeshStandardMaterial({
        color: c.cat === 'Industrial' ? 0x64748b : c.cat === 'Commercial' ? 0x0284c7 : c.cat === 'Agricultural' ? 0x16a34a : 0xb45309,
        roughness: 0.6
      })

      if (c.cat === 'Commercial') {
        const baseBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.8), wallMat)
        baseBox.position.y = 1.1
        const topBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), roofMat)
        topBox.position.y = 2.6
        cGroup.add(baseBox, topBox)
      } else if (c.cat === 'Industrial') {
        const shed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.0), wallMat)
        shed.position.y = 0.7
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), roofMat)
        roof.position.y = 1.8
        roof.rotation.y = Math.PI / 4
        cGroup.add(shed, roof)
      } else if (c.cat === 'Agricultural') {
        const shed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), wallMat)
        shed.position.y = 0.5
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), roofMat)
        tank.position.set(1.1, 0.7, 0)
        cGroup.add(shed, tank)
      } else {
        const walls = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), wallMat)
        walls.position.y = 0.6
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), roofMat)
        roof.position.y = 1.6
        roof.rotation.y = Math.PI / 4
        cGroup.add(walls, roof)
      }

      // Smart Meter Box mounted on the front wall
      const meterGeo = new THREE.BoxGeometry(0.3, 0.45, 0.2)
      const meterMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 })
      const meterMesh = new THREE.Mesh(meterGeo, meterMat)
      meterMesh.position.set(0, 0.7, 0.95)
      cGroup.add(meterMesh)

      // Alert Warning Pillar
      const beaconGeo = new THREE.CylinderGeometry(0.08, 0.25, 12, 16)
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.65 })
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat)
      beaconMesh.position.set(0, 6.0, 0)
      beaconMesh.visible = false
      cGroup.add(beaconMesh)

      scene.add(cGroup)
      consumerMeshesRef.current.set(c.id, { group: cGroup, meterMesh, beaconMesh })
    })

    // 10. Mouse Interaction
    let isDragging = false
    let prevMouseX = 0
    let prevMouseY = 0
    let lastRaycastTime = 0
    const raycaster = new THREE.Raycaster()
    const mouseVector = new THREE.Vector2()

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true
      prevMouseX = e.clientX
      prevMouseY = e.clientY
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      if (isDragging) {
        cameraRef.current.isTransitioning = false
        const dx = e.clientX - prevMouseX
        const dy = e.clientY - prevMouseY
        prevMouseX = e.clientX
        prevMouseY = e.clientY

        if (e.buttons === 1) {
          const angleX = -dx * 0.005
          const angleY = -dy * 0.005
          const offset = camera.position.clone().sub(cameraRef.current.target)

          const radius = offset.length()
          let theta = Math.atan2(offset.x, offset.z) + angleX
          let phi = Math.acos(Math.max(-0.99, Math.min(0.99, offset.y / radius))) + angleY
          phi = Math.max(0.1, Math.min(Math.PI / 2.1, phi))

          camera.position.x = cameraRef.current.target.x + radius * Math.sin(phi) * Math.sin(theta)
          camera.position.y = cameraRef.current.target.y + radius * Math.cos(phi)
          camera.position.z = cameraRef.current.target.z + radius * Math.sin(phi) * Math.cos(theta)
          camera.lookAt(cameraRef.current.target)
        } else if (e.buttons === 2) {
          const panSpeed = 0.03
          camera.position.x -= dx * panSpeed
          cameraRef.current.target.x -= dx * panSpeed
          camera.position.z -= dy * panSpeed
          cameraRef.current.target.z -= dy * panSpeed
        }
      } else {
        const nowMs = performance.now()
        if (nowMs - lastRaycastTime < 32) return
        lastRaycastTime = nowMs

        raycaster.setFromCamera(mouseVector, camera)
        const allGroups: THREE.Object3D[] = []
        consumerMeshesRef.current.forEach(v => allGroups.push(v.group))
        transformerMeshesRef.current.forEach(v => allGroups.push(v.group))

        const intersects = raycaster.intersectObjects(allGroups, true)
        if (intersects.length > 0) {
          let topObj: THREE.Object3D | null = intersects[0].object
          while (topObj && !topObj.userData.id) {
            topObj = topObj.parent
          }
          if (topObj && topObj.userData.id) {
            setHoveredNode({
              id: topObj.userData.id,
              type: topObj.userData.type,
              data: topObj.userData.consumer,
              x: e.clientX,
              y: e.clientY
            })
          } else {
            setHoveredNode(null)
          }
        } else {
          setHoveredNode(null)
        }
      }
    }

    const onMouseUp = () => {
      isDragging = false
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cameraRef.current.isTransitioning = false
      const zoomFactor = e.deltaY * 0.04
      const dir = camera.position.clone().sub(cameraRef.current.target)
      const newLen = Math.max(6, Math.min(65, dir.length() + zoomFactor))
      dir.setLength(newLen)
      camera.position.copy(cameraRef.current.target).add(dir)
    }

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouseVector, camera)
      const allGroups: THREE.Object3D[] = []
      consumerMeshesRef.current.forEach(v => allGroups.push(v.group))
      transformerMeshesRef.current.forEach(v => allGroups.push(v.group))

      const intersects = raycaster.intersectObjects(allGroups, true)
      if (intersects.length > 0) {
        let topObj: THREE.Object3D | null = intersects[0].object
        while (topObj && !topObj.userData.id) {
          topObj = topObj.parent
        }
        if (topObj && topObj.userData.id) {
          if (topObj.userData.type === 'consumer') {
            onSelectConsumer(topObj.userData.id)
          } else if (topObj.userData.type === 'transformer') {
            onSelectTransformer(topObj.userData.id)
          }
        }
      }
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('click', onClick)
    dom.addEventListener('contextmenu', e => e.preventDefault())

    // 11. Render Loop
    let animationFrameId: number
    let clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      const delta = clock.getDelta()

      freqRing.rotation.z += 0.015

      if (cameraRef.current.isTransitioning) {
        camera.position.lerp(cameraRef.current.pos, 0.05)
        camera.lookAt(cameraRef.current.target)
        if (camera.position.distanceTo(cameraRef.current.pos) < 0.2) {
          cameraRef.current.isTransitioning = false
        }
      }

      if (particleSystemRef.current) {
        const { points, curves, offsets } = particleSystemRef.current
        const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
        const posArray = posAttr.array as Float32Array
        const numCurves = curves.length

        for (let i = 0; i < offsets.length; i++) {
          const curveIdx = Math.floor(i / 4) % numCurves
          const curve = curves[curveIdx]
          offsets[i] = (offsets[i] + delta * 0.35) % 1.0

          const pt = curve.getPoint(offsets[i])
          posArray[i * 3] = pt.x
          posArray[i * 3 + 1] = pt.y
          posArray[i * 3 + 2] = pt.z
        }
        posAttr.needsUpdate = true
      }

      renderer.render(scene, camera)
    }

    animate()

    const onResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', onResize)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('click', onClick)
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [consumers, onSelectConsumer, onSelectTransformer])

  // Update node colors & alert beacons
  useEffect(() => {
    // Set of consumers with active alerts right now
    const activeAlertMap = new Map<string, Alert>()
    alerts.forEach(a => activeAlertMap.set(a.consumer, a))

    consumers.forEach(c => {
      const entry = consumerMeshesRef.current.get(c.id)
      if (!entry) return

      const liveReading = latestReadings.get(c.id)
      const activeAlert = activeAlertMap.get(c.id)

      let colorHex = 0x10b981 // Normal green
      let isCriticalAlert = false

      if (activeAlert) {
        if (activeAlert.cause === 'Probable theft/tampering' || activeAlert.risk === 'Critical' || activeAlert.risk === 'High') {
          colorHex = 0xef4444 // Red
          isCriticalAlert = true
        } else if (activeAlert.cause === 'Meter malfunction') {
          colorHex = 0xf59e0b // Amber
          isCriticalAlert = true
        } else if (activeAlert.cause === 'Communication failure' || liveReading?.comm === 'Offline') {
          colorHex = 0x0284c7 // Blue/Offline
          isCriticalAlert = false
        } else {
          colorHex = 0xf59e0b
        }
      } else if (liveReading?.status && liveReading.status !== 'Normal') {
        if (liveReading.status === 'Probable theft/tampering') {
          colorHex = 0xef4444
          isCriticalAlert = true
        } else if (liveReading.status === 'Meter malfunction') {
          colorHex = 0xf59e0b
          isCriticalAlert = true
        } else if (liveReading.status === 'Communication failure' || liveReading.comm === 'Offline') {
          colorHex = 0x0284c7
        }
      }

      const mat = entry.meterMesh.material as THREE.MeshStandardMaterial
      mat.color.setHex(colorHex)

      if (entry.beaconMesh) {
        entry.beaconMesh.visible = isCriticalAlert
        const bMat = entry.beaconMesh.material as THREE.MeshBasicMaterial
        bMat.color.setHex(colorHex)
      }
    })

    transformers.forEach(t => {
      const entry = transformerMeshesRef.current.get(t.id)
      if (!entry) return

      const lossGap = (t.unexpl - t.gap) / t.input
      let auraColor = 0x10b981
      if (lossGap > 0.05) {
        auraColor = 0xef4444
      } else if (lossGap > 0.02) {
        auraColor = 0xf59e0b
      }

      const mat = entry.auraMesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(auraColor)
    })
  }, [consumers, latestReadings, transformers, alerts])

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-slate-100 font-sans">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Clean Floating Quick Controls */}
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleResetCamera}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          <span>⟲</span> Reset Camera
        </button>
        <button
          onClick={() => focusNode(SUBSTATION_POS[0], SUBSTATION_POS[1], SUBSTATION_POS[2], 14)}
          className="rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          Substation 33kV
        </button>
        {Object.keys(TR_POSITIONS).map(tr => (
          <button
            key={tr}
            onClick={() => onSelectTransformer(tr)}
            className={`rounded-md border px-2.5 py-1.5 font-mono text-xs shadow-sm transition ${
              selectedTransformerId === tr
                ? 'border-blue-600 bg-blue-600 font-bold text-white'
                : 'border-slate-300 bg-white/95 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tr}
          </button>
        ))}
      </div>

      {/* Floating 3D Node Tooltip on Hover */}
      {hoveredNode && (
        <div
          style={{ left: `${hoveredNode.x + 14}px`, top: `${hoveredNode.y - 12}px` }}
          className="pointer-events-none fixed z-50 min-w-[220px] rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-800 shadow-xl"
        >
          {hoveredNode.type === 'consumer' ? (
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="font-mono font-bold text-blue-600">{hoveredNode.id}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {hoveredNode.data?.cat || 'Consumer'}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transformer:</span>
                  <span className="font-mono font-medium">{hoveredNode.data?.tr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold text-slate-800">{hoveredNode.data?.d.top}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Anomaly Risk:</span>
                  <span className={`font-bold ${hoveredNode.data?.d.risk === 'Critical' ? 'text-red-600' : 'text-slate-800'}`}>
                    {hoveredNode.data?.d.risk} ({hoveredNode.data?.d.anomaly}/100)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sanctioned Load:</span>
                  <span className="font-medium">{hoveredNode.data?.load} kW</span>
                </div>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-1 text-[10px] font-semibold text-blue-600">
                Click to inspect & take action →
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="font-mono font-bold text-slate-800">{hoveredNode.id}</span>
                <span className="text-[10px] text-slate-500">Distribution Transformer</span>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-600">
                Feeder: <span className="font-mono font-medium">F-01</span> · 12 Connected Meters
              </div>
              <div className="mt-1 text-[10px] font-semibold text-blue-600">Click to view energy audit →</div>
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-500">
        Tip: Left-Click to rotate · Scroll to zoom · Click any meter to inspect
      </div>
    </div>
  )
}
