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
    const FULL=process.env.FULL!=="0";const P=M.project(I,id,st,FULL?{opp,before:g.d,line,spread,total:g.tot??null,k:1}:{opp:null,before:g.d,line,k:1},DEF);if(!P||P.pOver==null)continue;
    const P0=M.project(I,id,st,{opp:null,before:g.d,line,k:1},DEF);
    rows.push({w:g.w,st,p:P.pOver,p0:P0&&P0.pOver,y:y>line?1:0,pos:I.pos(id)})}}
const half=weeks[Math.floor(weeks.length/2)];
function slope(rs,f){let n=0,d=0;rs.forEach(r=>{const x=f(r)-.5;n+=x*(r.y-.5);d+=x*x});return d?n/d:0}
const out={updated:new Date().toISOString(),lines:rows.length,weeks:weeks.length,k:{},byStat:{},bands:[],ablation:{}};
const stats=[...new Set(rows.map(r=>r.st))];
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
/* does the opponent and game-script adjustment help? same rows without them */
const sl=f=>{const R=rows.filter(r=>f(r)!=null);let b=0;R.forEach(r=>{const q=.5+.4*(f(r)-.5);b+=(q-r.y)**2});return b/R.length};
out.ablation={full:sl(r=>r.p),usageOnly:sl(r=>r.p0)};
fs.writeFileSync("data/nfl/model.json",JSON.stringify(out,null,1));
console.log(JSON.stringify({lines:out.lines,half,k:out.k,bands:out.bands,ablation:out.ablation},null,0));
for(const[st,b]of Object.entries(out.byStat))console.log(st.padEnd(8),String(b.n).padStart(5),"over",(b.overRate*100).toFixed(1),"brier",b.brier.toFixed(4),"picks",b.picks,"hit",b.hit&&(b.hit*100).toFixed(1),"k",b.k);
