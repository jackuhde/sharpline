// Turns data/props-history.json into one row per prop line with only pre-game information plus the result.
import fs from "node:fs";import {dec,imp,devig,COMP,K,sdFor,Phi,poisOver,poisMean,invPhi,COUNT} from "./lib.mjs";
export function buildRows(file,pregame){
  const db=JSON.parse(fs.readFileSync(file,"utf8"));
  const games=Object.entries(db.games).map(([id,g])=>({id,...g})).sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
  const hist={},teamDates={},rows=[];
  const avg=(arr,k)=>arr.length?arr.reduce((a,x)=>a+(x[k]||0),0)/arr.length:null;
  for(const g of games){
    const pl={};g.pl.forEach(r=>{const o={id:r[0],name:r[1],tm:r[2],play:r[3],st:r[4]};K.forEach((k,i)=>o[k]=r[5+i]);pl[o.id]=o});
    const yday=new Date(Date.parse(g.d+"T12:00:00Z")-864e5).toISOString().slice(0,10);
    const b2b={[g.hid]:(teamDates[g.hid]||[]).includes(yday),[g.aid]:(teamDates[g.aid]||[]).includes(yday)};
    /* regulars missing: played 25+ min a game over 3+ games, on this team, not playing tonight */
    const missing={[g.hid]:0,[g.aid]:0},missPts={[g.hid]:0,[g.aid]:0};
    Object.entries(hist).forEach(([pid,H])=>{if(H.length<3)return;const last=H[H.length-1];if(last.tm!==g.hid&&last.tm!==g.aid)return;
      const m=avg(H,"min");if(m<25)return;const p=pl[pid];if(p&&p.play)return;missing[last.tm]++;missPts[last.tm]+=avg(H,"pts")});
    for(const pr of g.pr){const [ath,st,l,o,u,lOpen,oOpen,uOpen]=pr;const c=COMP[st];if(!c||o==null||u==null)continue;
      const p=pl[ath];if(!p||!p.play)continue; /* did not play: book voids */
      const H=hist[ath]||[],gp=H.length;const sum=x=>c.reduce((a,k)=>a+(x[k]||0),0);
      const actual=sum(p);if(actual===l)continue;
      const tm=p.tm,home=tm===g.hid,spread=g.sp==null?null:(home?g.sp:-g.sp);
      const s=gp?H.reduce((a,x)=>a+sum(x),0)/gp:null,l10=H.slice(-10),l5=H.slice(-5);
      const r={gid:g.id,d:g.d,ath,name:p.name,st,l,o,u,lOpen,oOpen,uOpen,over:actual>l?1:0,actual,
        pm:devig(o,u)[0],pmOpen:oOpen!=null&&uOpen!=null?devig(oOpen,uOpen)[0]:null,
        gp,s,s10:l10.length?l10.reduce((a,x)=>a+sum(x),0)/l10.length:null,s5:l5.length?l5.reduce((a,x)=>a+sum(x),0)/l5.length:null,
        min:avg(H,"min"),min10:l10.length?avg(l10,"min"):null,min3:H.length?avg(H.slice(-3),"min"):null,
        startRate:gp?H.filter(x=>x.st).length/gp:null,starter:p.st,home,spread,tot:g.tot,b2b:b2b[tm],miss:missing[tm],missPts:missPts[tm],oppMiss:missing[home?g.aid:g.hid],
        hitRate10:l10.length?l10.filter(x=>sum(x)>l).length/l10.length:null,
        comp:Object.fromEntries(c.map(k=>[k,{s:avg(H,k),r:l10.length?avg(l10,k):null}]))};
      rows.push(r)}
    Object.values(pl).forEach(p=>{if(!p.play)return;(hist[p.id]=hist[p.id]||[]).push({...p,d:g.d})});
    [g.hid,g.aid].forEach(t=>(teamDates[t]=teamDates[t]||[]).push(g.d))}
  /* optional: an upcoming slate (data/pregame/DATE.json) priced with the same pre-game features, no results */
  const slate=[];if(pregame){const P=JSON.parse(fs.readFileSync(pregame,"utf8")),d=P.date,yday=new Date(Date.parse(d+"T12:00:00Z")-864e5).toISOString().slice(0,10);
    Object.entries(P.games).forEach(([gid,g])=>{(g.main||[]).forEach(([ath,st,l,o,u])=>{const c=COMP[st],H=hist[ath]||[];if(!c||o==null||u==null||!H.length)return;
      const gp=H.length,sum=x=>c.reduce((a,k)=>a+(x[k]||0),0),last=H[H.length-1],l10=H.slice(-10),l5=H.slice(-5);
      slate.push({gid,d,ath,name:last.name,st,l,o,u,pm:devig(o,u)[0],gp,s:H.reduce((a,x)=>a+sum(x),0)/gp,s10:l10.reduce((a,x)=>a+sum(x),0)/l10.length,s5:l5.reduce((a,x)=>a+sum(x),0)/l5.length,
        min:avg(H,"min"),min10:avg(l10,"min"),min3:avg(H.slice(-3),"min"),b2b:(teamDates[last.tm]||[]).includes(yday),miss:0,tm:last.tm,
        hitRate10:l10.filter(x=>sum(x)>l).length/l10.length})})})}
  return{rows,games,slate}}
/* Sharpline's pregame prop model as the app runs it with DraftKings only (index.html projTonight, without injury-news boosts) */
export function appModel(r){const pm=r.pm,st=r.st,Lm=r.l,sdM=sdFor(st,Lm);
  const mMarket=COUNT[st]?poisMean(pm,Lm):Lm-sdM*invPhi(1-pm);let mPlayer=null,w=0;
  if(r.gp>=1){const hasL10=r.gp>=3;mPlayer=0;for(const k in r.comp){const C=r.comp[k];let m=hasL10&&C.r!=null?.65*C.s+.35*C.r:C.s;
      if(r.min&&r.min10&&hasL10){const f=Math.min(1.15,Math.max(.85,r.min10/r.min));m=.65*C.s*f+.35*C.r}mPlayer+=m}
    w=hasL10?.45:.35;const sp=Math.abs(r.spread||0);if(sp>7)mPlayer*=Math.max(.94,1-.006*(sp-7))}
  const m=mPlayer==null?mMarket:w*mPlayer+(1-w)*mMarket;
  const raw=COUNT[st]?poisOver(m,Lm):1-Phi((Lm-m)/sdFor(st,m));return{pO:Math.min(.95,Math.max(.05,.5+.85*(raw-.5))),m,mPlayer,mMarket}}
