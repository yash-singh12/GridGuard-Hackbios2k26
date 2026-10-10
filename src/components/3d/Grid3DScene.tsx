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

// ─── Layout constants (matching v2 HTML) ─────────────────────────────────────
// Transformer x positions: [-15, -5, 5, 15], z = -3 (same as HTML TX array)
const TX_X = [-15, -5, 5, 15]

const TR_POSITIONS: Record<string, [number, number, number]> = {
  'T-01': [TX_X[0], 0, -3],
  'T-02': [TX_X[1], 0, -3],
  'T-03': [TX_X[2], 0, -3],
  'T-04': [TX_X[3], 0, -3],
}

// Substation sits behind transformers at z = -16 (matches HTML)
const SUBSTATION_POS: [number, number, number] = [0, 0, -16]

// ─── Colour palette (matches CSS variables from v2 HTML dark theme) ─────────
const COLOR = {
  scene:  0xdfe6f2,
  ground: 0xcbd5e6,
  pad:    0xeef2f9,
  amber:  0xffc766,
  ok:     0x46d19a,
  theft:  0xff2d55, // vibrant unmistakable alert red
  comm:   0x0284c7, // vibrant electric blue
  fault:  0x9333ea, // vibrant electric violet
  wire:   0x8a97b2,
}

// ─── Material shorthand ───────────────────────────────────────────────────────
const M = (color: number, extra?: Record<string, unknown>) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra })

// ─── Glowing dot canvas for energy particles ──────────────────────────────────
function makeGlowCanvas(): HTMLCanvasElement {
  const gc = document.createElement('canvas')
  gc.width = gc.height = 64
  const ctx = gc.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0,    'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return gc
}

// ─── React component ──────────────────────────────────────────────────────────

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
  const [hoveredNode, setHoveredNode] = useState<{
    id: string
    type: 'consumer' | 'transformer'
    data?: any
    x: number
    y: number
  } | null>(null)

  const cameraRef = useRef<{
    pos: THREE.Vector3
    target: THREE.Vector3
    isTransitioning: boolean
  }>({
    pos: new THREE.Vector3(0, 15, 29),
    target: new THREE.Vector3(0, 1, 0),
    isTransitioning: false
  })

  const onSelectConsumerRef = useRef(onSelectConsumer)
  const onSelectTransformerRef = useRef(onSelectTransformer)
  useEffect(() => {
    onSelectConsumerRef.current = onSelectConsumer
    onSelectTransformerRef.current = onSelectTransformer
  }, [onSelectConsumer, onSelectTransformer])

  // Pale Peach / Warm Apricot & Linen light palette
  const CAT_COLORS: Record<string, { wall: number; roof: number }> = {
    res: { wall: 0xfdfbf7, roof: 0xf3c4a5 }, // Residential: Soft linen white (#fdfbf7), Delicate pale peach / warm apricot (#f3c4a5)
    com: { wall: 0xf8f9fa, roof: 0xdfb496 }, // Commercial: Clean linen pearl (#f8f9fa), Soft apricot stone (#dfb496)
    ind: { wall: 0xf5f6f8, roof: 0xd2a88a }, // Industrial: Linen mist (#f5f6f8), Soft warm clay (#d2a88a)
  }

  const consumerMeshesRef = useRef<
    Map<string, { group: THREE.Group; meterMesh: THREE.Mesh; houseMeshes: THREE.Mesh[]; cat: string }>
  >(new Map())
  const transformerMeshesRef = useRef<Map<string, { group: THREE.Group }>>(
    new Map()
  )
  const particleSystemRef = useRef<{
    points: THREE.Points
    curves: THREE.QuadraticBezierCurve3[]
    offsets: Float32Array
    speeds: Float32Array
  } | null>(null)

  const latestReadings = React.useMemo(() => {
    const map = new Map<string, Reading>()
    for (const r of readings) map.set(r.id, r)
    return map
  }, [readings])

  const handleResetCamera = useCallback(() => {
    cameraRef.current.pos.set(0, 15, 29)
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
        const p = entry.group.position
        focusNode(p.x, p.y, p.z, 7)
      }
    }
  }, [selectedConsumerId, focusNode])

  useEffect(() => {
    if (selectedTransformerId) {
      const pos = TR_POSITIONS[selectedTransformerId]
      if (pos) focusNode(pos[0], pos[1], pos[2], 12)
    }
  }, [selectedTransformerId, focusNode])

  // ── Main Three.js setup ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width  = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COLOR.scene)
    scene.fog = new THREE.Fog(COLOR.scene, 60, 120)

    // Camera (FOV 40 matches v2 HTML)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 240)
    camera.position.copy(cameraRef.current.pos)
    camera.lookAt(cameraRef.current.target)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    // Lighting (hemisphere + directional, same as v2 HTML)
    const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x1a2340, 1)
    const moon = new THREE.DirectionalLight(0xffffff, 0.8)
    moon.position.set(-10, 22, 14)
    scene.add(hemi, moon)

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 1 })
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    // ── Substation (mirrors HTML sb group) ──────────────────────────────────
    const sb = new THREE.Group()
    sb.position.set(0, 0, -16)
    const sbAdd = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); sb.add(m); return m
    }
    sbAdd(new THREE.BoxGeometry(17, 0.15, 5), M(0x3a465f), 0, 0.08, 0)
    ;[-3.6, 0, 3.6].forEach(x => {
      sbAdd(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 24), M(0x7a869d), x, 1.8, 0)
      sbAdd(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8), M(0x4cc3ff), x, 4.1, 0)
    })
    ;[-8, 8].forEach(x => sbAdd(new THREE.BoxGeometry(0.4, 6, 0.4), M(0x5d6a85), x, 3, 0))
    sbAdd(new THREE.BoxGeometry(16.4, 0.25, 0.25), M(0x5d6a85), 0, 6, 0)
    scene.add(sb)

    // ── Particle material (glowing amber dot) ────────────────────────────────
    const pm = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(makeGlowCanvas()),
      size: 0.75,
      color: new THREE.Color(COLOR.amber),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const wireMat = new THREE.LineBasicMaterial({ color: COLOR.wire, transparent: true, opacity: 0.75 })

    const allCurves: THREE.QuadraticBezierCurve3[] = []
    const allSpeeds: number[] = []
    const FEEDER_N = 5
    const DROP_N   = 2

    // ── Transformer poles + concrete pads + feeder cables ───────────────────
    const hits: THREE.Object3D[] = []

    TX_X.forEach((x, ti) => {
      const trId = `T-0${ti + 1}`

      // Concrete pad at scene level
      const padMesh = new THREE.Mesh(
        new THREE.BoxGeometry(9.2, 0.08, 14.2),
        new THREE.MeshStandardMaterial({ color: COLOR.pad, roughness: 1 })
      )
      padMesh.position.set(x, 0.04, 3.8)
      scene.add(padMesh)

      // Pole group
      const p = new THREE.Group()
      p.position.set(x, 0, -3)
      p.userData = { id: trId, type: 'transformer' }
      const pAdd = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
        const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); p.add(m); return m
      }
      pAdd(new THREE.CylinderGeometry(0.13, 0.16, 4.4, 10), M(0x75614a), 0, 2.2, 0)
      pAdd(new THREE.BoxGeometry(3.2, 0.12, 0.12), M(0x75614a), 0, 4.1, 0)
      pAdd(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 20), M(0x8c97ad), 0, 3.3, 0.5)
      pAdd(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8), M(0x4cc3ff), 0, 3.9, 0.5)
      ;[-1.05, -0.35, 0.35, 1.05].forEach(dx => pAdd(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6), M(0x4cc3ff), dx, 4.25, 0))

      scene.add(p)
      transformerMeshesRef.current.set(trId, { group: p })

      // Feeder cable: substation → transformer
      const a = new THREE.Vector3(x * 0.5, 6, -16)
      const b = new THREE.Vector3(x, 4.3, -3)
      const feederCurve = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3((a.x + b.x) / 2, 3.5, -9.5), b)
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(feederCurve, 40, 0.06, 6, false), M(0x66738a)))
      allCurves.push(feederCurve)
      for (let i = 0; i < FEEDER_N; i++) allSpeeds.push(0.10)

      // Consumer buildings in 3×4 grid
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 4; k++) {
          const linearIdx = ti * 12 + r * 4 + k
          const consumer = consumers[linearIdx]
          if (!consumer) continue

          const cat: 'res' | 'com' | 'ind' = ti < 3 ? 'res' : (r < 2 ? 'com' : 'ind')
          const mx = x + (k - 1.5) * 2.2
          const mz = 2 + r * 3.2 + (k % 2 === 1 ? 0.5 : 0)

          const g = new THREE.Group()
          g.position.set(mx, 0, mz)
          g.userData = { id: consumer.id, type: 'consumer', consumer }

          const wmat = new THREE.MeshBasicMaterial({ color: COLOR.amber })
          // House body meshes — tracked so we can recolour the whole house on alert
          const houseMeshes: THREE.Mesh[] = []
          const part = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
            const m = new THREE.Mesh(geo, mat)
            m.position.set(px, py, pz)
            m.userData = { id: consumer.id, type: 'consumer', consumer }
            g.add(m); hits.push(m); houseMeshes.push(m); return m
          }
          const win = (wx: number, wy: number, wz: number, ww: number, wh: number) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), wmat)
            m.position.set(wx, wy, wz); g.add(m)
          }

          if (cat === 'res') {
            part(new THREE.BoxGeometry(1.6, 1.1, 1.5), M(CAT_COLORS.res.wall), 0, 0.55, 0)
            const rm = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.7, 3), M(CAT_COLORS.res.roof))
            rm.position.set(0, 1.42, 0); rm.rotation.x = -Math.PI / 2; rm.scale.set(1, 1, 0.55)
            rm.userData = { id: consumer.id, type: 'consumer', consumer }; g.add(rm); hits.push(rm); houseMeshes.push(rm)
            win(-0.4, 0.65, 0.76, 0.34, 0.34); win(0.4, 0.65, 0.76, 0.34, 0.34)
          } else if (cat === 'com') {
            part(new THREE.BoxGeometry(1.7, 1.9, 1.6), M(CAT_COLORS.com.wall), 0, 0.95, 0)
            part(new THREE.BoxGeometry(1.8, 0.14, 1.7), M(CAT_COLORS.com.roof), 0, 1.97, 0)
            ;[0.6, 1.3].forEach(y => [-0.45, 0.45].forEach(wx => win(wx, y, 0.81, 0.5, 0.4)))
          } else {
            part(new THREE.BoxGeometry(2.3, 1.1, 1.8), M(CAT_COLORS.ind.wall), 0, 0.55, 0)
            part(new THREE.BoxGeometry(2.3, 0.35, 1.8), M(CAT_COLORS.ind.roof), 0, 1.27, 0)
            part(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 10), M(CAT_COLORS.ind.roof), 0.8, 1.8, -0.4)
            ;[-0.7, 0, 0.7].forEach(wx => win(wx, 0.7, 0.91, 0.4, 0.3))
          }

          const doorZ = cat === 'res' ? 0.76 : cat === 'com' ? 0.81 : 0.91
          const door = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.12), M(0x8a7768))
          door.position.set(0, 0.2, doorZ); g.add(door)

          // Smart meter LED (tracked for colour updates)
          const ledMat = new THREE.MeshBasicMaterial({ color: COLOR.ok })
          const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.08), ledMat)
          ledMesh.position.set(0, 0.2, doorZ + 0.07); g.add(ledMesh)

          // Selection ring
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide })
          const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 40), ringMat)
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.visible = false; g.add(ring)

          scene.add(g)
          consumerMeshesRef.current.set(consumer.id, { group: g, meterMesh: ledMesh, houseMeshes, cat })

          // Drop wire: transformer → house
          const sa = new THREE.Vector3(x + (k - 1.5) * 0.7, 4.15, -3)
          const sbp = new THREE.Vector3(mx, 1.4, mz - 0.85)
          const sc = new THREE.QuadraticBezierCurve3(sa, new THREE.Vector3((sa.x + sbp.x) / 2, 1.7, (sa.z + sbp.z) / 2), sbp)
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sc.getPoints(16)), wireMat))
          allCurves.push(sc)
          for (let i = 0; i < DROP_N; i++) allSpeeds.push(0.30)
        }
      }
    })

    // ── Particle geometry ────────────────────────────────────────────────────
    const totalParticles = TX_X.length * FEEDER_N + consumers.length * DROP_N
    const particlePositions = new Float32Array(totalParticles * 3)
    const offsets = new Float32Array(totalParticles)
    let pi = 0
    allCurves.forEach((_, ci) => {
      const n = ci < TX_X.length ? FEEDER_N : DROP_N
      for (let p = 0; p < n; p++) { offsets[pi] = p / n; pi++ }
    })
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particlePoints = new THREE.Points(particleGeo, pm)
    particlePoints.frustumCulled = false
    scene.add(particlePoints)
    particleSystemRef.current = { points: particlePoints, curves: allCurves, offsets, speeds: new Float32Array(allSpeeds) }

    // ── Mouse interaction ────────────────────────────────────────────────────
    let isDragging = false
    let prevMouseX = 0, prevMouseY = 0, mouseDownX = 0, mouseDownY = 0
    let lastRaycastTime = 0
    const raycaster = new THREE.Raycaster()
    const mouseVector = new THREE.Vector2()

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true
      prevMouseX = mouseDownX = e.clientX
      prevMouseY = mouseDownY = e.clientY
      cameraRef.current.isTransitioning = false
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseVector.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouseVector.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1

      if (isDragging) {
        const dx = e.clientX - prevMouseX
        const dy = e.clientY - prevMouseY
        prevMouseX = e.clientX; prevMouseY = e.clientY
        if (e.buttons === 1) {
          const angleX = -dx * 0.005, angleY = -dy * 0.005
          const offset = camera.position.clone().sub(cameraRef.current.target)
          const radius = offset.length()
          const theta = Math.atan2(offset.x, offset.z) + angleX
          let phi = Math.acos(Math.max(-0.99, Math.min(0.99, offset.y / radius))) + angleY
          phi = Math.max(0.1, Math.min(Math.PI / 2.1, phi))
          camera.position.x = cameraRef.current.target.x + radius * Math.sin(phi) * Math.sin(theta)
          camera.position.y = cameraRef.current.target.y + radius * Math.cos(phi)
          camera.position.z = cameraRef.current.target.z + radius * Math.sin(phi) * Math.cos(theta)
          camera.lookAt(cameraRef.current.target)
        } else if (e.buttons === 2) {
          const s = 0.04
          camera.position.x -= dx * s; cameraRef.current.target.x -= dx * s
          camera.position.z -= dy * s; cameraRef.current.target.z -= dy * s
        }
      } else {
        const now = performance.now()
        if (now - lastRaycastTime < 32) return
        lastRaycastTime = now
        raycaster.setFromCamera(mouseVector, camera)
        const ch = raycaster.intersectObjects(hits, false)
        if (ch.length > 0 && ch[0].object.userData.id) {
          setHoveredNode({ id: ch[0].object.userData.id, type: ch[0].object.userData.type, data: ch[0].object.userData.consumer, x: e.clientX, y: e.clientY })
        } else {
          const trGroups: THREE.Object3D[] = []
          transformerMeshesRef.current.forEach(v => trGroups.push(v.group))
          const th = raycaster.intersectObjects(trGroups, true)
          if (th.length > 0) {
            let top: THREE.Object3D | null = th[0].object
            while (top && !top.userData.id) top = top.parent
            setHoveredNode(top?.userData.id ? { id: top.userData.id, type: 'transformer', x: e.clientX, y: e.clientY } : null)
          } else { setHoveredNode(null) }
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      const moved = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY)
      isDragging = false
      if (moved > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      mouseVector.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouseVector.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouseVector, camera)
      const ch = raycaster.intersectObjects(hits, false)
      if (ch.length > 0 && ch[0].object.userData.type === 'consumer') {
        onSelectConsumerRef.current(ch[0].object.userData.id); return
      }
      const trGroups: THREE.Object3D[] = []
      transformerMeshesRef.current.forEach(v => trGroups.push(v.group))
      const th = raycaster.intersectObjects(trGroups, true)
      if (th.length > 0) {
        let top: THREE.Object3D | null = th[0].object
        while (top && !top.userData.id) top = top.parent
        if (top?.userData.type === 'transformer') onSelectTransformerRef.current(top.userData.id)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cameraRef.current.isTransitioning = false
      const dir = camera.position.clone().sub(cameraRef.current.target)
      dir.setLength(Math.max(5, Math.min(60, dir.length() + e.deltaY * 0.04)))
      camera.position.copy(cameraRef.current.target).add(dir)
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('contextmenu', e => e.preventDefault())

    // ── Render loop ──────────────────────────────────────────────────────────
    let animId: number
    const clock = new THREE.Clock()
    const tmpV = new THREE.Vector3()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)
      const t  = clock.elapsedTime

      if (cameraRef.current.isTransitioning) {
        camera.position.lerp(cameraRef.current.pos, 0.06)
        camera.lookAt(cameraRef.current.target)
        if (camera.position.distanceTo(cameraRef.current.pos) < 0.05) cameraRef.current.isTransitioning = false
      }

      if (particleSystemRef.current) {
        const { points, curves, offsets: offs, speeds } = particleSystemRef.current
        const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
        const posArr  = posAttr.array as Float32Array
        let pi2 = 0
        curves.forEach((curve, ci) => {
          const n = ci < TX_X.length ? FEEDER_N : DROP_N
          for (let p = 0; p < n; p++) {
            offs[pi2] = (offs[pi2] + speeds[pi2] * dt) % 1
            curve.getPoint(offs[pi2], tmpV)
            posArr[pi2 * 3] = tmpV.x; posArr[pi2 * 3 + 1] = tmpV.y; posArr[pi2 * 3 + 2] = tmpV.z
            pi2++
          }
        })
        posAttr.needsUpdate = true
      }



      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      dom.removeEventListener('wheel', onWheel)
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [consumers])

  // ── Colour / alert updates ───────────────────────────────────────────────
  useEffect(() => {
    const activeAlertMap = new Map<string, Alert>()
    alerts.forEach(a => activeAlertMap.set(a.consumer, a))

    consumers.forEach(c => {
      const entry = consumerMeshesRef.current.get(c.id)
      if (!entry) return
      const liveReading = latestReadings.get(c.id)
      const activeAlert = activeAlertMap.get(c.id)

      // Determine alert colour (undefined = normal / restore originals)
      let alertColorHex: number | null = null

      if (activeAlert) {
        if (activeAlert.cause === 'Probable theft/tampering' || activeAlert.risk === 'Critical' || activeAlert.risk === 'High') {
          alertColorHex = COLOR.theft
        } else if (activeAlert.cause === 'Meter malfunction') {
          alertColorHex = COLOR.fault
        } else if (activeAlert.cause === 'Communication failure' || liveReading?.comm === 'Offline') {
          alertColorHex = COLOR.comm
        } else {
          alertColorHex = COLOR.fault
        }
      } else if (liveReading?.status && liveReading.status !== 'Normal') {
        if (liveReading.status === 'Probable theft/tampering')      alertColorHex = COLOR.theft
        else if (liveReading.status === 'Meter malfunction')         alertColorHex = COLOR.fault
        else if (liveReading.status === 'Communication failure' || liveReading.comm === 'Offline') alertColorHex = COLOR.comm
      }

      // Light defaults for normal houses
      const defaults = CAT_COLORS[entry.cat] ?? CAT_COLORS.res

      // Tint the whole house or restore default colours (solid, non-blinking)
      entry.houseMeshes.forEach((mesh, idx) => {
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (alertColorHex !== null) {
          mat.color.setHex(alertColorHex)
          mat.emissive?.setHex(0x000000)
          mat.emissiveIntensity = 0
        } else {
          // Restore normal colours (alternate wall/roof per mesh index)
          mat.color.setHex(idx === 0 ? defaults.wall : defaults.roof)
          mat.emissive?.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      })

      // LED dot still tracks the alert colour
      ;(entry.meterMesh.material as THREE.MeshBasicMaterial).color.setHex(
        alertColorHex !== null ? alertColorHex : COLOR.ok
      )
    })
  }, [consumers, latestReadings, transformers, alerts])

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full select-none overflow-hidden font-sans" style={{ background: '#dfe6f2' }}>
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Quick Controls */}
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleResetCamera}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          <span>⟲</span> Reset Camera
        </button>
        <button
          onClick={() => focusNode(SUBSTATION_POS[0], 4, SUBSTATION_POS[2], 14)}
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

      {/* Hover Tooltip */}
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
                  <span className="font-semibold text-slate-800">{hoveredNode.data?.d?.top}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Anomaly Risk:</span>
                  <span className={`font-bold ${hoveredNode.data?.d?.risk === 'Critical' ? 'text-red-600' : 'text-slate-800'}`}>
                    {hoveredNode.data?.d?.risk} ({hoveredNode.data?.d?.anomaly}/100)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sanctioned Load:</span>
                  <span className="font-medium">{hoveredNode.data?.load} kW</span>
                </div>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-1 text-[10px] font-semibold text-blue-600">
                Click to inspect &amp; take action →
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="font-mono font-bold text-slate-800">{hoveredNode.id}</span>
                <span className="text-[10px] text-slate-500">Distribution Transformer</span>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-600">12 Connected Meters</div>
              <div className="mt-1 text-[10px] font-semibold text-blue-600">Click to view energy audit →</div>
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-500">
        Tip: Left-click drag to rotate · Scroll to zoom · Click any meter or transformer to inspect
      </div>
    </div>
  )
}
