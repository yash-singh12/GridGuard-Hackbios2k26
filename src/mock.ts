import type {Cause,Risk,Priority,Flags,Diag,Consumer,Alert,TrAcc} from './types'
export const USE_MOCK=import.meta.env.VITE_USE_MOCK!=='false'
const T:Cause='Probable theft/tampering',M:Cause='Meter malfunction',CF:Cause='Communication failure',L:Cause='Legitimate abnormal consumption',SV:Cause='Seasonal variation',DQ:Cause='Data quality issue',R:Cause='Requires review',N:Cause='Normal consumption'
export const ALLC:Cause[]=[T,M,CF,L,SV,DQ,R]
export const TRS=['T-01','T-02','T-03','T-04']
export const MONTHS=['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep']
const ACT:Record<string,string[]>={[T]:['Field inspection recommended','Inspect meter and service connection','Compare with peer consumers','Inspect transformer context'],[M]:['Inspect meter','Review meter event log','Compare peer consumers'],[CF]:['Verify communication module / network','Re-poll meter; backfill readings','Review consumption history'],[L]:['Verify approved reason with consumer record','Review consumption history'],[SV]:['No field visit; monitor next period'],[DQ]:['Review data pipeline and meter status'],[R]:['Review consumption history','Escalate for analyst review'],[N]:['No action']}
export function diagnose(f:Flags):Diag{
 const ab=Math.abs(f.dev)>=30||f.comm||f.meter
 const S=[
 {k:'Below baseline',on:f.dev<=-30,t:`Consumption ${Math.abs(f.dev)}% below own baseline`,c:[T,M,L,SV],w:3},
 {k:'Above baseline',on:f.dev>=30,t:`Consumption ${f.dev}% above own baseline`,c:[L,R],w:2},
 {k:'Persistence',on:f.persist>=2&&Math.abs(f.dev)>=30,t:`Pattern persists across ${f.persist} periods`,c:[T,L,SV],w:2},
 {k:'Comms normal',on:!f.comm&&ab,t:'Communication remained normal',c:[T,M,L,SV],w:1.5},
 {k:'Comms failure',on:f.comm,t:'Communication failed during the period (readings missing)',c:[CF,DQ],w:8},
 {k:'Meter status',on:!f.meter&&ab,t:'Meter status normal, no fault flags',c:[T,L,SV,CF],w:1},
 {k:'Meter fault',on:f.meter,t:'Meter fault flags / flat-lined readings',c:[M,DQ],w:6},
 {k:'Peers stable',on:f.peers&&ab,t:'Similar consumers remained stable',c:[T,M,CF,L],w:1.5},
 {k:'Peers dropped',on:!f.peers,t:'Similar consumers dropped as well',c:[SV],w:5},
 {k:'Transformer gap',on:f.trGap>3,t:`Transformer unexplained energy ${f.trGap.toFixed(1)}% of input`,c:[T,M],w:3},
 {k:'Approved reason',on:f.known,t:'Approved reason on record (e.g. planned shutdown)',c:[L],w:6},
 {k:'No approved reason',on:!f.known&&ab&&!f.comm,t:'No approved reason on record',c:[T,M],w:2}]
 const raw:Record<string,number>={};[...ALLC,N].forEach(c=>raw[c]=.3);raw[R]=6;raw[N]=ab?0:10
 const act=S.filter(s=>s.on);act.forEach(s=>s.c.forEach(c=>raw[c]+=s.w))
 const ks=Object.keys(raw),ex=ks.map(c=>Math.exp(raw[c]/3)),tot=ex.reduce((a,b)=>a+b,0)
 const scores=ks.map((c,i)=>({cause:c as Cause,score:ex[i]/tot})).sort((a,b)=>b.score-a.score)
 const top:Cause=scores[0].score<.35&&scores[0].cause!==N?R:scores[0].cause,margin=scores[0].score-scores[1].score
 const anomaly=ab?Math.min(99,Math.round(Math.abs(f.dev)*.7+f.persist*6+(f.comm?25:0)+(f.meter?25:0)+f.trGap*3)):Math.round(Math.abs(f.dev))
 let risk:Risk=anomaly<20?'Normal':anomaly<40?'Watch':anomaly<60?'Medium':anomaly<85?'High':'Critical'
 const ord:Risk[]=['Normal','Watch','Medium','High','Critical'],cap=(m:Risk)=>{if(ord.indexOf(risk)>ord.indexOf(m))risk=m}
 if(top===CF||top===DQ)cap('Medium');if(top===L||top===SV)cap('Watch');if(top===R)cap('Medium');if(top===N)risk='Normal'
 const priority:Priority=risk==='High'||risk==='Critical'?'P1':risk==='Medium'?'P2':risk==='Watch'?'P3':'P4'
 const evidence=act.map(s=>({signal:s.k,text:s.t,direction:(s.c.includes(top)?'supports':'contradicts') as 'supports'|'contradicts',weight:s.w}))
 const whyNot=[CF,M,SV].filter(c=>c!==top).map(c=>({cause:c,reasons:[...act.filter(s=>!s.c.includes(c)),...act.filter(s=>s.c.includes(c))].map(s=>(s.c.includes(c)?'Supports: ':'Contradicts: ')+s.t).slice(0,4)}))
 return{scores,top,anomaly,risk,priority,conf:margin>=.25?'High':margin>=.12?'Medium':'Low',margin,evidence,whyNot,actions:ACT[top]}}
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647
const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0}
const CATS=['Residential','Commercial','Industrial','Agricultural'],TAR:Record<string,number>={Residential:6.5,Commercial:9,Industrial:7.5,Agricultural:4},LD:Record<string,number>={Residential:5,Commercial:15,Industrial:60,Agricultural:10},BS:Record<string,number>={Residential:340,Commercial:900,Industrial:4200,Agricultural:600}
export type Branch='A'|'B'
function build(br:Branch){
 seed=7
 const raw=Array.from({length:48},(_,k)=>{const i=k+1,cat=i<=34?CATS[0]:i<=42?CATS[1]:i<=45?CATS[3]:CATS[2],b=i===17?375:BS[cat]*(.85+rnd()*.3)
  const hist:(number|null)[]=Array.from({length:12},(_,m)=>Math.round(b*(1+.12*Math.sin((m+1)/12*6.283))*(.96+rnd()*.08)))
  const fl:Flags={dev:0,persist:0,comm:false,meter:false,peers:true,known:false,trGap:0},base=Math.round(med(hist.slice(0,9) as number[]))
  const set=(v:(number|null)[],p:number)=>{v.forEach((x,j)=>hist[12-v.length+j]=x);fl.persist=p}
  if(cat==='Agricultural'&&i!==44)set([.6,.6,.6].map(x=>Math.round(base*x)),0)
  if(i===17){hist.fill(null,9);for(let m=0;m<9;m++)hist[m]=[372,381,365,390,378,369,384,375,371][m];br==='A'?set([92,88,95],3):(set([null,null,null],3),fl.comm=true)}
  if(i===9){set([null,null],2);fl.comm=true}
  if(i===31){set([42,41],2);fl.meter=true}
  if(i===40){set([.35,.34,.36].map(x=>Math.round(base*x)),3);fl.known=true}
  if(i===44){set([.65,.64,.66].map(x=>Math.round(base*x)),3);fl.peers=false}
  if(i===5)set([.18,.19,.2].map(x=>Math.round(base*(1+x*4))),2)
  const v=hist.slice(9).filter((x):x is number=>x!=null),actual=v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null
  const stolen=i===17&&br==='A'?base-(actual??0):0
  return{id:'C-'+String(i).padStart(3,'0'),cat,load:LD[cat],tariff:TAR[cat],tr:TRS[Math.floor(k/12)],feeder:'F-01',hist,base,actual,dev:actual==null?0:Math.round((actual/base-1)*100),stolen,flags:fl}})
 const gapOf=(c:typeof raw[0])=>Math.round(c.base*c.hist.slice(9).filter(x=>x==null).length/3)
 const tr:TrAcc[]=TRS.map(id=>{const cs=raw.filter(c=>c.tr===id),rep=cs.reduce((a,c)=>a+(c.actual??0),0),st=cs.reduce((a,c)=>a+c.stolen,0),gap=cs.reduce((a,c)=>a+gapOf(c),0)
  const input=Math.round((rep+st+gap)/(1-.032)),tech=Math.round(input*.032),un=input-rep-tech
  return{id,input,consumer:rep,tech,unexpl:un,gap,lossPct:+((input-rep)/input*100).toFixed(1),gapPct:+(gap/input*100).toFixed(1)}})
 const sum=(k:'input'|'consumer'|'tech'|'unexpl'|'gap')=>tr.reduce((a,t)=>a+t[k],0)
 const feeder:TrAcc={id:'F-01',input:sum('input'),consumer:sum('consumer'),tech:sum('tech'),unexpl:sum('unexpl'),gap:sum('gap'),lossPct:+((sum('input')-sum('consumer'))/sum('input')*100).toFixed(1),gapPct:+(sum('gap')/sum('input')*100).toFixed(1)}
 const cons:Consumer[]=raw.map(c=>{const t=tr.find(x=>x.id===c.tr)!,flags={...c.flags,dev:c.dev,trGap:+((t.unexpl-t.gap)/t.input*100).toFixed(1)}
  const peer=MONTHS.map((_,m)=>Math.round(med(raw.filter(p=>p.cat===c.cat&&p.id!==c.id).map(p=>p.hist[m]).filter((x):x is number=>x!=null))))
  return{...c,flags,peer,d:diagnose(flags)}})
 return{cons,tr,feeder}}
export const WORLD={A:build('A'),B:build('B')}
const EV:Record<string,string>={[T]:'Abnormal consumption',[M]:'Meter error',[CF]:'Communication failure',[L]:'Abnormal consumption (approved)',[SV]:'Seasonal variation',[DQ]:'Missing reading',[R]:'Sudden load change'}
export const mkAlert=(id:string,tr:string,d:Diag,time:string,n:number):Alert=>({id:'AL-'+n,time,consumer:id,tr,event:EV[d.top]??'Anomaly',risk:d.risk,cause:d.top,conf:d.conf,score:d.anomaly,priority:d.priority,status:'New'})
export const seedAlerts=():Alert[]=>WORLD.A.cons.filter(c=>c.d.top!==N&&c.d.anomaly>=40).sort((a,b)=>b.d.anomaly-a.d.anomaly).map((c,i)=>mkAlert(c.id,c.tr,c.d,'09:'+String(50-i*4).padStart(2,'0'),100+i))
export const estLoss=(c:Consumer)=>Math.round(c.stolen*c.tariff)
export const api={consumers:(b:Branch='A')=>WORLD[b].cons,consumer:(id:string,b:Branch='A')=>WORLD[b].cons.find(c=>c.id===id),transformers:()=>WORLD.A.tr,feeder:()=>WORLD.A.feeder,search:(q:string)=>[...WORLD.A.cons.map(c=>c.id),...TRS,'F-01'].filter(x=>x.toLowerCase().includes(q.toLowerCase())).slice(0,8)}
