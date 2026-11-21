// Team-strength game model for spreads, totals and moneylines (NBA and NFL), with an honest walk-forward backtest.
// Each team gets an offense and a defense rating in points; home edge is fitted too. Ratings are a ridge regression on
// earlier games only, weighted toward recent games. Prediction: home points = avg + home/2 + home offense - away defense.
// Backtest: every game is predicted from games before it, then compared with DraftKings' closing line. The trust factor k
// (how far to move from the market toward the model) is fitted on the first half of the season and scored on the second.
// A market only produces picks if the second half beats the closing line with enough picks. Output: data/<sport>/gamemodel.json
import fs from "fs";
const sport=process.argv[2];const CFG={nfl:{lam:6,hl:999,sdM:13.5,sdT:10,burn:48,minPicks:30},nba:{lam:4,hl:25,sdM:12,sdT:18,burn:120,minPicks:60}}[sport];
let G;if(sport==="nfl"){const S=JSON.parse(fs.readFileSync("data/nfl/stats.json","utf8"));const ab=id=>(S.teams[id]||[id])[0];
  G=S.games.filter(g=>g.h&&g.a&&g.h[1]!=null).map(g=>({id:g.id,d:g.d,h:ab(g.h[0]),a:ab(g.a[0]),hs:+g.h[1],as:+g.a[1],sp:g.sp,tot:g.tot}))}
else{const N=JSON.parse(fs.readFileSync("data/nba/games.json","utf8"));G=N.games.map(g=>({id:g.id,d:g.d,h:g.h[0],a:g.a[0],hs:g.h[1],as:g.a[1],sp:g.sp,tot:g.tot,mlh:g.mlh,mla:g.mla}))}
G.sort((a,b)=>a.d<b.d?-1:1);
const Phi=x=>{const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p};
function fit(games){const teams=[...new Set(games.flatMap(g=>[g.h,g.a]))],ix=Object.fromEntries(teams.map((t,i)=>[t,i])),T=teams.length,P=2*T+2;
  const A=Array.from({length:P},()=>new Float64Array(P)),b=new Float64Array(P),n=games.length;
  const rows=[];games.forEach((g,k)=>{const w=Math.pow(.5,(n-1-k)/CFG.hl);const h=ix[g.h],a=ix[g.a];
    rows.push([w,[[2*T,1],[2*T+1,.5],[h,1],[T+a,-1]],g.hs]);rows.push([w,[[2*T,1],[2*T+1,-.5],[a,1],[T+h,-1]],g.as])});
  rows.forEach(([w,x,y])=>{x.forEach(([i,vi])=>{b[i]+=w*vi*y;x.forEach(([j,vj])=>A[i][j]+=w*vi*vj)})});
  for(let i=0;i<2*T;i++)A[i][i]+=CFG.lam;A[2*T+1][2*T+1]+=1;
  for(let i=0;i<P;i++){let m=i;for(let r=i+1;r<P;r++)if(Math.abs(A[r][i])>Math.abs(A[m][i]))m=r;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];
    for(let r=0;r<P;r++){if(r===i)continue;const f=A[r][i]/A[i][i];if(!f)continue;for(let c=i;c<P;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}}
  const x=b.map((v,i)=>v/A[i][i]);const R={};teams.forEach((t,i)=>R[t]=[+x[i].toFixed(2),+x[T+i].toFixed(2)]);return{avg:+x[2*T].toFixed(2),hfa:+x[2*T+1].toFixed(2),R,n}}
function predict(M,h,a){const H=M.R[h],A=M.R[a];if(!H||!A)return null;const hs=M.avg+M.hfa/2+H[0]-A[1],as=M.avg-M.hfa/2+A[0]-H[1];return{hs,as,m:hs-as,t:hs+as}}
/* walk-forward */
const rows=[];for(let i=CFG.burn;i<G.length;i++){const g=G[i];const prior=G.slice(0,i).filter(x=>x.d<g.d);if(prior.length<CFG.burn)continue;const M=fit(prior);const P=predict(M,g.h,g.a);if(!P)continue;
  rows.push({g,P,mar:g.hs-g.as,tot:g.hs+g.as})}
const half=Math.floor(rows.length/2),A1=rows.slice(0,half),A2=rows.slice(half);
/* chance the home side covers, from the model alone and shrunk toward the market by k */
const sides={
  spread:r=>r.g.sp==null||r.mar+r.g.sp===0?null:{raw:Phi((r.P.m+r.g.sp)/CFG.sdM),y:r.mar+r.g.sp>0?1:0},
  total:r=>r.g.tot==null||r.tot===r.g.tot?null:{raw:1-Phi((r.g.tot-r.P.t)/CFG.sdT),y:r.tot>r.g.tot?1:0}};
function score(set,f,k,edge){let n=0,w=0,ll=0,ln=0;set.forEach(r=>{const s=f(r);if(!s)return;const p=.5+k*(s.raw-.5);ll+=-(s.y?Math.log(p):Math.log(1-p));ln++;
  if(Math.abs(p-.5)>=edge){n++;if((p>.5)===(s.y===1))w++}});return{n,hit:n?w/n:null,ll:ln?ll/ln:null,ln}}
const out={sport,updated:new Date().toISOString(),cfg:CFG,games:G.length,tested:rows.length,markets:{}};
for(const[mk,f]of Object.entries(sides)){let best={k:0,ll:Infinity};for(let k=0;k<=1.001;k+=.05){const s=score(A1,f,k,0);if(s.ll<best.ll)best={k:+k.toFixed(2),ll:s.ll}}
  const edge=.524*1+0-.5+.03;/* a side is a pick when its chance is at least 55.4%, a few points past -110's 52.4% break-even */
  const s1=score(A1,f,best.k,edge),s2=score(A2,f,best.k,edge),base=score(A2,f,0,0);
  const trusted=best.k>=.1&&s2.n>=CFG.minPicks&&s2.hit>=.54&&s2.ll<base.ll;
  out.markets[mk]={k:best.k,firstHalf:s1,secondHalf:s2,marketLogLoss:+base.ll.toFixed(4),modelLogLoss:s2.ll&&+s2.ll.toFixed(4),trusted,
    note:trusted?`right side ${(s2.hit*100).toFixed(1)}% of ${s2.n} picks in games the fit never saw`:best.k<.1?"the model adds nothing to DraftKings' closing line":`${s2.n} picks, ${s2.hit!=null?(s2.hit*100).toFixed(1)+"% right":"none"} on unseen games: not enough to trust`}}
out.markets.ml={trusted:out.markets.spread.trusted,k:out.markets.spread.k,note:"moneyline chances come from the spread model"};
const M=fit(G);Object.assign(out,{avg:M.avg,hfa:M.hfa,R:M.R,sdM:CFG.sdM,sdT:CFG.sdT});
/* residual spread of the model on unseen games, for reference */
const res=rows.map(r=>r.mar-r.P.m),rt=rows.map(r=>r.tot-r.P.t),sd=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/Math.max(1,a.length));out.residSd={margin:+sd(res).toFixed(2),total:+sd(rt).toFixed(2)};
fs.mkdirSync(`data/${sport}`,{recursive:true});fs.writeFileSync(`data/${sport}/gamemodel.json`,JSON.stringify(out));
console.log(sport,`${G.length} games, ${rows.length} tested, hfa ${M.hfa}, resid sd`,out.residSd);for(const[k,v]of Object.entries(out.markets))console.log(k,JSON.stringify(v));
