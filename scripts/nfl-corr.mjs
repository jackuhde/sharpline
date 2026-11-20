// How NFL player stats move together within a game, measured on this season's box scores.
// For each player-stat, results are standardized against that player's own season (z = (x - mean) / sd), then
// correlated across games for three kinds of pairs: same player, teammates, opponents (by position group).
// Correlations are shrunk toward 0 by sample size, so thin pairs count for little. Output: data/nfl/corr.json
import fs from "fs";
const S=JSON.parse(fs.readFileSync("data/nfl/stats.json","utf8"));const C=S.cols,ix=Object.fromEntries(C.map((c,i)=>[c,i+1]));
const STATS={pYds:r=>r[ix.pYds],pTD:r=>r[ix.pTD],cmp:r=>r[ix.cmp],att:r=>r[ix.att],int:r=>r[ix.int],pRYds:r=>r[ix.pYds]+r[ix.rYds],
  rYds:r=>r[ix.rYds],car:r=>r[ix.car],rLng:r=>r[ix.rLng],recYds:r=>r[ix.recYds],rec:r=>r[ix.rec],recLng:r=>r[ix.recLng],rRecYds:r=>r[ix.rYds]+r[ix.recYds],
  td:r=>(r[ix.rTD]||0)+(r[ix.recTD]||0),kPts:r=>r[ix.kPts],fgM:r=>r[ix.fgM],xpM:r=>r[ix.xpM]};
const REL={QB:["pYds","pTD","cmp","att","int","pRYds","rYds","car","rLng","td"],RB:["rYds","car","rLng","rec","recYds","rRecYds","recLng","td"],
  WR:["rec","recYds","recLng","rRecYds","td"],TE:["rec","recYds","recLng","td"],K:["kPts","fgM","xpM"]};
const grp=p=>p==="FB"?"RB":p==="PK"?"K":REL[p]?p:null;
const ath=S.ath;const per={};// id -> stat -> [values]
S.games.forEach(g=>Object.entries(g.p||{}).forEach(([id,r])=>{const a=ath[id];const G=a&&grp(a[1]);if(!G)return;per[id]=per[id]||{};REL[G].forEach(st=>{(per[id][st]=per[id][st]||[]).push(STATS[st](r)||0)})}));
const norm={};Object.entries(per).forEach(([id,o])=>{norm[id]={};Object.entries(o).forEach(([st,v])=>{if(v.length<4)return;const m=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(v.length-1));if(sd>0)norm[id][st]=[m,sd]})});
const acc={};const add=(k,x,y)=>{const A=acc[k]||(acc[k]={n:0,sx:0,sy:0,sxx:0,syy:0,sxy:0});A.n++;A.sx+=x;A.sy+=y;A.sxx+=x*x;A.syy+=y*y;A.sxy+=x*y};
S.games.forEach(g=>{const rows=Object.entries(g.p||{}).map(([id,r])=>{const a=ath[id];const G=a&&grp(a[1]);if(!G||!norm[id])return null;
    const z={};REL[G].forEach(st=>{const nm=norm[id][st];if(nm)z[st]=((STATS[st](r)||0)-nm[0])/nm[1]});return{id,G,tm:r[0],z}}).filter(Boolean);
  rows.forEach((A,i)=>{const sts=Object.keys(A.z);sts.forEach((s1,a)=>sts.slice(a+1).forEach(s2=>{const[x,y]=[s1,s2].sort();add(`S|${x}|${y}`,A.z[x],A.z[y])}));
    rows.slice(i+1).forEach(B=>{const rel=A.tm===B.tm?"T":"O";Object.keys(A.z).forEach(s1=>Object.keys(B.z).forEach(s2=>{const k1=`${A.G}:${s1}`,k2=`${B.G}:${s2}`;
      const[p,q,x,y]=k1<=k2?[k1,k2,A.z[s1],B.z[s2]]:[k2,k1,B.z[s2],A.z[s1]];add(`${rel}|${p}|${q}`,x,y)}))})})});
const out={};Object.entries(acc).forEach(([k,A])=>{if(A.n<15)return;const cov=A.sxy/A.n-(A.sx/A.n)*(A.sy/A.n),vx=A.sxx/A.n-(A.sx/A.n)**2,vy=A.syy/A.n-(A.sy/A.n)**2;
  if(vx<=0||vy<=0)return;const r=cov/Math.sqrt(vx*vy),sh=r*A.n/(A.n+40);out[k]=[Math.round(sh*1000)/1000,A.n]});
fs.writeFileSync("data/nfl/corr.json",JSON.stringify({updated:new Date().toISOString(),note:"within-game correlation of player-standardized stats, shrunk by n/(n+40)",pairs:out}));
const show=k=>console.log(k,out[k]);["S|rLng|rRecYds","S|rLng|rYds","T|QB:pYds|WR:recYds","O|RB:rLng|RB:rLng","T|QB:pTD|WR:td","S|pTD|pYds"].forEach(show);
console.log(Object.keys(out).length,"pairs");
