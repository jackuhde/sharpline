/* Backtests nfl-model.js against every DraftKings NFL prop line ESPN kept this season.
   Each game is predicted from earlier games only. Lines have no prices in ESPN's NFL feed, so results are scored
   against the line itself: hit rate of the side the model picks, against the 52.4% needed at standard -110.
   Writes data/nfl/model.json with per-stat shrink factors (k) and the calibration the app shows. */
import fs from "fs";import M from "../nfl-model.js";
const S=JSON.parse(fs.readFileSync("data/nfl/stats.json","utf8")),LN=JSON.parse(fs.readFileSync("data/nfl/lines.json","utf8"));
const I=M.index(S);const byId=Object.fromEntries(S.games.map(g=>[g.id,g]));const rows=[];
const weeks=[...new Set(S.games.map(g=>g.w))].sort((a,b)=>a-b);
for(const g of S.games){const L=LN.games[g.id];if(!L)continue;const DEF=M.defense(I,g.d);
  for(const[key,[line]]of Object.entries(L.l)){const[id,st]=key.split("|");if(!M.STATS[st]||M.STATS[st].yn)continue;const r=g.p[id];if(!r)continue;
    const v={};S.cols.forEach((c,i)=>v[c]=r[i+1]||0);const y=M.STATS[st].f(v);if(y===line)continue;
    const home=r[0]===g.h[0],opp=home?g.a[0]:g.h[0],spread=g.sp!=null?(home?g.sp:-g.sp):null;
    const FULL=process.env.FULL!=="0";const wx=g.ven&&g.ven.in?null:g.wx||null,base={opp,before:g.d,line,spread,total:g.tot??null,wx,k:1};
    const P=M.project(I,id,st,FULL?base:{opp:null,before:g.d,line,k:1,f:{snap:0,tgt:0,prs:0,wx:0}},DEF);if(!P||P.pOver==null)continue;
    const abl={};for(const f of Object.keys(M.DEFAULT_F)){const Q=M.project(I,id,st,{...base,f:{[f]:0}},DEF);abl[f]=Q&&Q.pOver}
    const Q0=M.project(I,id,st,{...base,opp:null,spread:null,total:null,f:{snap:0,tgt:0,prs:0,wx:0}},DEF);abl.oppGs=Q0&&Q0.pOver;
    const P0=M.project(I,id,st,{opp:null,before:g.d,line,k:1},DEF);
    rows.push({w:g.w,st,p:P.pOver,p0:P0&&P0.pOver,abl,y:y>line?1:0,pos:I.pos(id),id,base})}}
const half=weeks[Math.floor(weeks.length/2)];
function slope(rs,f){let n=0,d=0;rs.forEach(r=>{const x=f(r)-.5;n+=x*(r.y-.5);d+=x*x});return d?n/d:0}
const out={updated:new Date().toISOString(),lines:rows.length,weeks:weeks.length,k:{},byStat:{},bands:[],ablation:{}};
const stats=[...new Set(rows.map(r=>r.st))];
/* does the opponent and game-script adjustment help? same rows without them */
const sl=f=>{const R=rows.filter(r=>f(r)!=null);let b=0;R.forEach(r=>{const q=.5+.4*(f(r)-.5);b+=(q-r.y)**2});return b/R.length};
out.ablation={full:sl(r=>r.p),usageOnly:sl(r=>r.p0)};
/* feature check, out of sample: for each factor, the per-stat k-adjusted Brier score with and without it (lower is better) */
function score(f){const out={};for(const st of stats){const R=rows.filter(r=>r.st===st&&f(r)!=null);let b=0;
  for(const[tr,te]of[[r=>r.w<half,r=>r.w>=half],[r=>r.w>=half,r=>r.w<half]]){const k=Math.max(0,Math.min(1,slope(R.filter(tr),f)));R.filter(te).forEach(r=>{const q=.5+k*(f(r)-.5);b+=(q-r.y)**2})}out[st]=R.length?b/R.length:null}return out}
const full=score(r=>r.p);out.features={};
for(const f of [...Object.keys(M.DEFAULT_F),"oppGs"]){const wo=score(r=>r.abl[f]);out.features[f]={};for(const st of stats)if(full[st]!=null&&wo[st]!=null)out.features[f][st]=Math.round((wo[st]-full[st])*1e5)/1e5}
/* switch a factor on for a stat only where it saved at least 0.0002 Brier out of sample; otherwise off */
out.use={};for(const st of stats){out.use[st]={};for(const f of Object.keys(M.DEFAULT_F)){const k=f==="ogs"?"oppGs":f;const v=(out.features[k]||{})[st];out.use[st][f]=v!=null&&v>=.0002?1:0}}
/* rescore every line with only the chosen factors, then recompute k, per-stat hit rates and bands from that */
for(const g of S.games){const DEF=M.defense(I,g.d);rows.filter(r=>r.base.before===g.d).forEach(r=>{const Q=M.project(I,r.id,r.st,{...r.base,use:out.use},DEF);r.p=Q&&Q.pOver!=null?Q.pOver:r.p})}
for(const st of stats){const R=rows.filter(r=>r.st===st);
  /* k fit on one half, scored on the other, both directions */
  let hit=0,pick=0,br=0,br0=0;for(const[tr,te]of[[r=>r.w<half,r=>r.w>=half],[r=>r.w>=half,r=>r.w<half]]){const k=Math.max(0,Math.min(1,slope(R.filter(tr),r=>r.p)));
    R.filter(te).forEach(r=>{const q=.5+k*(r.p-.5);br+=(q-r.y)**2;br0+=.25;if(Math.abs(q-.5)>=.03){pick++;hit+=(q>.5)===(r.y===1)?1:0}})}
  const kAll=Math.max(0,Math.min(1,slope(R,r=>r.p)));out.k[st]=Math.round(kAll*100)/100;
  out.byStat[st]={n:R.length,overRate:R.filter(r=>r.y).length/R.length,brier:br/R.length,brier50:.25,picks:pick,hit:pick?hit/pick:null,k:out.k[st]}}
/* side hit rate by how far the (k-adjusted) chance is from 50% */
const adj=r=>.5+(out.k[r.st]??.4)*(r.p-.5);
for(const[lo,hi]of[[0,.02],[.02,.04],[.04,.06],[.06,.1],[.1,1]]){const R=rows.filter(r=>{const e=Math.abs(adj(r)-.5);return e>=lo&&e<hi});if(!R.length)continue;
  const h=R.filter(r=>(adj(r)>.5)===(r.y===1)).length;out.bands.push({lo,hi,n:R.length,hit:h/R.length,pred:R.reduce((a,r)=>a+Math.max(adj(r),1-adj(r)),0)/R.length})}
fs.writeFileSync("data/nfl/model.json",JSON.stringify(out,null,1));
console.log(JSON.stringify({lines:out.lines,half,k:out.k,bands:out.bands,ablation:out.ablation},null,0));console.log("FEATURES (positive = factor helps; Brier x1e5 saved):");for(const[f,o]of Object.entries(out.features))console.log(f.padEnd(7),Object.entries(o).map(([k,v])=>k+":"+Math.round(v*1e5)).join(" "));
for(const[st,b]of Object.entries(out.byStat))console.log(st.padEnd(8),String(b.n).padStart(5),"over",(b.overRate*100).toFixed(1),"brier",b.brier.toFixed(4),"picks",b.picks,"hit",b.hit&&(b.hit*100).toFixed(1),"k",b.k);
