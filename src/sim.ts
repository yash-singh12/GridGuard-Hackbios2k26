import {useSyncExternalStore} from 'react'
import type {Alert,Reading,Flags,Priority} from './types'
import {WORLD,diagnose,mkAlert,seedAlerts} from './mock'
export const SCEN=['Normal Consumption','Theft/Tampering','Meter Malfunction','Communication Failure','Legitimate Abnormal Consumption','Sudden Load Change'] as const
export type Sc=typeof SCEN[number]
export interface LogRow{scenario:Sc;consumer:string;start:string;alerts:number;result:string}
export const SIM_IDS=['C-017','C-009','C-031','C-040','C-002','C-014','C-026','C-033']
interface S{running:boolean;readings:Reading[];alerts:Alert[];log:LogRow[];ov:Record<string,Sc>;stage:Record<string,string>;outcome:Record<string,string>;lat:number;rate:number}
let s:S={running:false,readings:[],alerts:seedAlerts(),log:[],ov:{},stage:{},outcome:{},lat:0,rate:0}
const subs=new Set<()=>void>();const set=(p:Partial<S>)=>{s={...s,...p};subs.forEach(f=>f())}
const win:Record<string,Reading[]>={},raised=new Set<string>(),energy:Record<string,number>={};let timer:number|undefined,n=200
const now=()=>new Date().toLocaleTimeString('en-GB')
const tick=()=>{const t0=performance.now(),out:Reading[]=[];let alerts=s.alerts,log=s.log
 for(const id of SIM_IDS){const c=WORLD.A.cons.find(x=>x.id===id)!,sc=s.ov[id]??'Normal Consumption',bp=c.base/720
  let p:number|null=bp*(1+(Math.random()-.5)*.1),v:number|null=230+(Math.random()-.5)*6,meter='OK',comm='Online'
  if(sc==='Theft/Tampering')p*=.25;if(sc==='Legitimate Abnormal Consumption')p*=.3;if(sc==='Sudden Load Change')p*=2.2
  if(sc==='Meter Malfunction'){meter='Fault';v=118+Math.random()*4;const w=win[id];p=w?.length?w[w.length-1].p:p}
  if(sc==='Communication Failure'){comm='Offline';p=null;v=null}
  energy[id]=(energy[id]??0)+(p??0)/3600
  const r:Reading={t:now(),id,tr:c.tr,v,i:p!=null&&v?p*1000/v:null,p,e:+energy[id].toFixed(4),meter,comm,status:'Normal'}
  const w=(win[id]=[...(win[id]??[]),r].slice(-6))
  if(w.length>=6){const val=w.filter(x=>x.p!=null),mean=val.length?val.reduce((a,x)=>a+(x.p??0),0)/val.length:bp
   const f:Flags={dev:Math.round((mean/bp-1)*100),persist:3,comm:w.slice(-3).every(x=>x.comm==='Offline'),meter:w.some(x=>x.meter==='Fault'),peers:true,known:sc==='Legitimate Abnormal Consumption',trGap:sc==='Theft/Tampering'?4:0}
   if(f.comm)f.dev=0
   const d=diagnose(f);r.status=d.top==='Normal consumption'?'Normal':d.top
   const key=id+d.top
   if(d.anomaly>=40&&d.top!=='Normal consumption'&&!raised.has(key)){raised.add(key);alerts=[mkAlert(id,c.tr,d,now(),n++),...alerts]
    log=log.map(l=>l.consumer===id&&l.result==='Running'?{...l,alerts:l.alerts+1,result:d.top}:l)}}
  out.push(r)}
 set({readings:[...s.readings,...out].slice(-120),alerts,log,lat:+(performance.now()-t0).toFixed(2),rate:out.length})}
export const sim={
 start:()=>{if(timer)return;set({running:true});timer=window.setInterval(tick,1000);tick()},
 pause:()=>{clearInterval(timer);timer=undefined;set({running:false})},
 reset:()=>{sim.pause();Object.keys(win).forEach(k=>delete win[k]);raised.clear();set({readings:[],alerts:seedAlerts(),log:[],ov:{}})},
 inject:(id:string,sc:Sc)=>{raised.forEach(k=>k.startsWith(id)&&raised.delete(k));set({ov:{...s.ov,[id]:sc},log:[{scenario:sc,consumer:id,start:now(),alerts:0,result:'Running'},...s.log]});sim.start()},
 ack:(id:string)=>set({alerts:s.alerts.map(a=>a.id===id?{...a,status:'Acknowledged'}:a)}),
 resolveAlert:(consumerId:string)=>{
   raised.forEach(k=>k.startsWith(consumerId)&&raised.delete(k));
   set({alerts:s.alerts.filter(a=>a.consumer!==consumerId),ov:{...s.ov,[consumerId]:'Normal Consumption'}})
 },
 dismissAlert:(consumerId:string)=>{
   raised.forEach(k=>k.startsWith(consumerId)&&raised.delete(k));
   set({alerts:s.alerts.filter(a=>a.consumer!==consumerId),ov:{...s.ov,[consumerId]:'Normal Consumption'}})
 },
 stage:(id:string,v:string)=>set({stage:{...s.stage,[id]:v}}),outcome:(id:string,v:string)=>set({outcome:{...s.outcome,[id]:v}})}
export const useSim=()=>useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f)}},()=>s)
export type {Priority}
