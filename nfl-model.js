/* Sharpline NFL projection model. Pure functions, shared by the app and the backtest (scripts/nfl-backtest.mjs).
   Inputs are only what ESPN's free feeds provide (data/nfl/stats.json): box-score lines per game (passing, rushing,
   receiving incl. targets, kicking), final scores, closing spread and total, positions. It does NOT use snap counts,
   air yards, depth of target, pressure rate, offensive-line grades or weather: none of those are in the free feeds.

   For one player, stat and line:
   1. Usage: recency-weighted average over his games this season (most recent counts most; 0.8 decay per game).
   2. Shrink toward the posted line when he has few games (the line is the market's own estimate).
   3. Opponent: how much this defense allows to his position for this stat vs league average, shrunk by games played.
   4. Game script: his team's implied points (from spread and total) vs his team's season average, applied mildly
      to passing and receiving, and to rushing by favorite/underdog. Never applied to the same stat twice.
   5. Distribution: yards are lognormal (skewed, a line sits near the median), small counts are Poisson,
      volume counts (attempts, completions, carries) are normal.
   6. The resulting chance is moved toward 50% by a per-stat factor the backtest measured (k), because the posted
      line already holds most of the information. Without a measured k the default is 0.4.
   Nothing here sees the game being predicted: the backtest passes only earlier games. */
(function(root){
const Phi=z=>{const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p};
const poisCdf=(k,l)=>{let s=0,t=Math.exp(-l);for(let i=0;i<=k;i++){s+=t;t*=l/(i+1)}return Math.min(1,s)};
/* stat key -> how to read it from a box row, its distribution, default spread and which adjustments apply */
const STATS={
  pYds:{f:v=>v.pYds,d:"logn",cv:.30,opp:"pass",gs:"pass",lbl:"Passing yards",pos:["QB"]},
  cmp:{f:v=>v.cmp,d:"norm",cv:.20,opp:"pass",gs:"pass",lbl:"Completions",pos:["QB"]},
  att:{f:v=>v.att,d:"norm",cv:.17,gs:"pass",lbl:"Pass attempts",pos:["QB"]},
  pTD:{f:v=>v.pTD,d:"pois",opp:"passTD",gs:"pts",lbl:"Passing TDs",pos:["QB"]},
  int:{f:v=>v.int,d:"pois",lbl:"Interceptions",pos:["QB"]},
  pRYds:{f:v=>v.pYds+v.rYds,d:"logn",cv:.28,opp:"pass",gs:"pass",lbl:"Pass + rush yards",pos:["QB"]},
  car:{f:v=>v.car,d:"norm",cv:.33,gs:"rush",lbl:"Rush attempts",pos:["RB","QB"]},
  rYds:{f:v=>v.rYds,d:"logn",cv:.55,opp:"rush",gs:"rush",lbl:"Rushing yards",pos:["RB","QB","WR"]},
  rLng:{f:v=>v.rLng,d:"logn",cv:.60,lbl:"Longest rush",pos:["RB","QB"]},
  rec:{f:v=>v.rec,d:"pois",opp:"recs",gs:"pass",lbl:"Receptions",pos:["WR","TE","RB"]},
  recYds:{f:v=>v.recYds,d:"logn",cv:.70,opp:"rec",gs:"pass",lbl:"Receiving yards",pos:["WR","TE","RB"]},
  recLng:{f:v=>v.recLng,d:"logn",cv:.60,lbl:"Longest reception",pos:["WR","TE","RB"]},
  rRecYds:{f:v=>v.rYds+v.recYds,d:"logn",cv:.45,opp:"scrim",gs:"rush",lbl:"Rush + rec yards",pos:["RB","WR"]},
  kPts:{f:v=>v.kPts,d:"norm",cv:.45,gs:"pts",lbl:"Kicking points",pos:["K","PK"]},
  fgM:{f:v=>v.fgM,d:"pois",gs:"pts",lbl:"Field goals made",pos:["K","PK"]},
  xpM:{f:v=>v.xpM,d:"pois",gs:"pts",lbl:"Extra points made",pos:["K","PK"]},
  td:{f:v=>v.rTD+v.recTD,d:"pois",opp:"td",gs:"pts",lbl:"Anytime touchdown",pos:["RB","WR","TE","QB"],yn:1}};
/* what a defense "allows" for each opponent key, per position group */
const OPPF={pass:v=>v.pYds,passTD:v=>v.pTD,rush:v=>v.rYds,recs:v=>v.rec,rec:v=>v.recYds,scrim:v=>v.rYds+v.recYds,td:v=>v.rTD+v.recTD};
const grp=p=>/^(QB)$/.test(p)?"QB":/^(RB|FB)$/.test(p)?"RB":/^WR$/.test(p)?"WR":/^TE$/.test(p)?"TE":/^(PK|K)$/.test(p)?"K":"X";

function index(S){const cols=S.cols;const P={},T={},games=S.games||[];
  games.forEach(g=>{const ht=g.h[0],at=g.a[0];
    [[ht,at,1,g.h[1],g.a[1]],[at,ht,0,g.a[1],g.h[1]]].forEach(([t,o,home,pf,pa])=>{(T[t]=T[t]||[]).push({gid:g.id,d:g.d,w:g.w,opp:o,home,pf,pa,sp:g.sp!=null?(home?g.sp:-g.sp):null,tot:g.tot})});
    const wx=g.ven&&g.ven.in?null:g.wx||null;const tt={};Object.values(g.p).forEach(r=>{tt[r[0]]=(tt[r[0]]||0)+(r[cols.indexOf("tgt")+1]||0)});
    Object.entries(g.p).forEach(([id,r])=>{const v={};cols.forEach((c,i)=>v[c]=r[i+1]||0);const t=r[0],o=t===ht?at:ht;(P[id]=P[id]||[]).push({gid:g.id,d:g.d,w:g.w,t,opp:o,home:t===ht?1:0,v,x:(g.x&&g.x[id])||{},wx,teamTgt:tt[t]||0})})});
  Object.values(P).forEach(a=>a.sort((x,y)=>x.d<y.d?-1:1));Object.values(T).forEach(a=>a.sort((x,y)=>x.d<y.d?-1:1));
  /* pressure each defense generated: share of the opposing QB's dropbacks under pressure (PFR via nflverse) */
  const PR={};games.forEach(g=>{Object.entries(g.x||{}).forEach(([id,x])=>{if(x.prs==null)return;const r=g.p[id];if(!r)return;const o=r[0]===g.h[0]?g.a[0]:g.h[0];(PR[o]=PR[o]||[]).push({d:g.d,v:x.prs})})});
  return{S,P,T,PR,pos:id=>grp((S.ath[id]||[])[1]||""),name:id=>(S.ath[id]||[])[0]||"",team:id=>(S.ath[id]||[])[2]||null}}

/* what each defense allowed to each position group, per game, using only games before `before` */
function defense(I,before){const D={},L={};const seen={};
  I.S.games.forEach(g=>{if(before&&g.d>=before)return;const ht=g.h[0],at=g.a[0];
    Object.entries(g.p).forEach(([id,r])=>{const pos=I.pos(id);if(pos==="X")return;const t=r[0],o=t===ht?at:ht;const v={};I.S.cols.forEach((c,i)=>v[c]=r[i+1]||0);
      const k=o+"|"+pos,gk=g.id+"|"+k;const d=D[k]||(D[k]={n:0});if(!seen[gk]){seen[gk]=1;d.n++;(L[pos]=L[pos]||{n:0}).n++}
      Object.entries(OPPF).forEach(([f,fn])=>{d[f]=(d[f]||0)+fn(v);L[pos][f]=(L[pos][f]||0)+fn(v)})})});
  return(team,pos,f)=>{const d=D[team+"|"+pos],l=L[pos];if(!d||!l||!l.n||!l[f])return{x:1,n:0};const ra=(d[f]/d.n)/(l[f]/l.n);const w=d.n/(d.n+6);return{x:Math.max(.85,Math.min(1.15,1+(ra-1)*w)),n:d.n,ra}}}

function teamAvg(I,team,before){const g=(I.T[team]||[]).filter(x=>!before||x.d<before);return g.length?g.reduce((a,x)=>a+x.pf,0)/g.length:null}

/* the projection itself. ctx: {opp, before (ISO date), line, spread (this player's team, negative = favored), total, home, k} */
function project(I,id,st,ctx,DEF){const M=STATS[st];if(!M)return null;const pos=I.pos(id);
  const hist=(I.P[id]||[]).filter(x=>!ctx.before||x.d<ctx.before);
  /* games he actually played in this role: for QBs at least 10 attempts, otherwise any recorded touch */
  const used=hist.filter(x=>pos==="QB"?x.v.att>=10||st==="car"||st==="rYds":true);
  if(used.length<2)return{n:used.length,why:"Fewer than 2 games this season"};
  const vals=used.map(x=>M.f(x.v));let ws=0,s=0;vals.slice().reverse().forEach((v,i)=>{const w=Math.pow(.8,i);ws+=w;s+=w*v});const m0=s/ws;
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length,sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,vals.length-1));
  const neff=Math.min(used.length,8),L=ctx.line;
  let m=L!=null&&!M.yn?(neff*m0+2*L)/(neff+2):m0;const parts=[`${used.length} games, recent-weighted ${r1(m0)}`];
  if(L!=null&&!M.yn)parts.push(`blended toward the line ${L} for sample size`);
  let fo=1,fg=1;const F0=Object.assign({},DEFAULT_F,(ctx.use&&ctx.use[st])||{},ctx.f||{});
  if(F0.ogs&&M.opp&&ctx.opp){const D=(DEF||defense(I,ctx.before))(ctx.opp,pos,M.opp);fo=D.x;if(D.n)parts.push(`opponent allows ${r1((D.ra||1)*100)}% of league average to ${pos}s (${D.n} games, counted ${Math.round((fo-1)*100)}%)`)}
  if(F0.ogs&&M.gs&&ctx.spread!=null&&ctx.total!=null){const imp=ctx.total/2-ctx.spread/2,ta=teamAvg(I,I.team(id),ctx.before);
    if(M.gs==="pts"&&ta)fg=Math.max(.85,Math.min(1.15,1+.6*(imp/ta-1)));
    if(M.gs==="pass"&&ta)fg=Math.max(.92,Math.min(1.08,1+.3*(imp/ta-1)+.006*ctx.spread));
    if(M.gs==="rush")fg=Math.max(.92,Math.min(1.08,1-.008*ctx.spread));
    if(fg!==1)parts.push(`team implied ${r1(imp)} pts${ta?` vs ${r1(ta)} average`:""}, ${fg>1?"+":""}${Math.round((fg-1)*100)}% for game script`)}
  const F=F0;let fs=1,fw=1,fp=1;
  /* role: snap share over his last 2 games vs his average this season (nflverse); a real change in role moves usage */
  if(F.snap&&pos!=="QB"&&pos!=="K"){const sn=used.map(x=>x.x&&x.x.snap).filter(v=>v!=null);if(sn.length>=3){const rec=(sn.at(-1)+sn.at(-2))/2,avg=sn.reduce((a,b)=>a+b,0)/sn.length;
    if(avg>.05&&/^(car|rYds|rRecYds|rec|recYds|td)$/.test(st)){fs=Math.max(.8,Math.min(1.2,Math.pow(rec/avg,.6)));if(Math.abs(fs-1)>=.02)parts.push(`snap share ${Math.round(rec*100)}% lately vs ${Math.round(avg*100)}% average (${fs>1?"+":""}${Math.round((fs-1)*100)}%)`)}}}
  /* targets: recent target share x his team's usual targets x his yards per target, blended with the usage average */
  if(F.tgt&&/^(rec|recYds)$/.test(st)){const tr=used.filter(x=>x.x&&x.x.ts!=null&&x.teamTgt>0);if(tr.length>=3){const w=tr.slice(-4);const ts=w.reduce((a,x)=>a+x.x.ts,0)/w.length;
      const team=(I.T[I.team(id)]||[]).filter(x=>!ctx.before||x.d<ctx.before);const tAvg=tr.reduce((a,x)=>a+x.teamTgt,0)/tr.length;const tg=tr.reduce((a,x)=>a+x.v.tgt,0);
      if(tg>=8){const per=st==="rec"?tr.reduce((a,x)=>a+x.v.rec,0)/tg:tr.reduce((a,x)=>a+x.v.recYds,0)/tg;const est=ts*tAvg*per;m=.5*m+.5*est;parts.push(`target share ${Math.round(ts*100)}% (last ${w.length}) of about ${r1(tAvg)} team targets at ${r1(per)} ${st==="rec"?"catches":"yards"} per target: ${r1(est)}`)}}}
  /* pressure: how often this defense pressured QBs vs league (PFR via nflverse) */
  if(F.prs&&pos==="QB"&&ctx.opp&&/^(pYds|cmp|pRYds|pTD)$/.test(st)&&I.PR){const all=[];Object.values(I.PR).forEach(a=>a.forEach(x=>{if(!ctx.before||x.d<ctx.before)all.push(x.v)}));const mine=(I.PR[ctx.opp]||[]).filter(x=>!ctx.before||x.d<ctx.before).map(x=>x.v);
    if(mine.length>=3&&all.length>20){const lg=all.reduce((a,b)=>a+b,0)/all.length,dv=mine.reduce((a,b)=>a+b,0)/mine.length;const w=mine.length/(mine.length+6);fp=Math.max(.9,Math.min(1.1,1-.6*(dv-lg)*w));if(Math.abs(fp-1)>=.01)parts.push(`opponent pressures ${Math.round(dv*100)}% of dropbacks vs ${Math.round(lg*100)}% league (${fp>1?"+":""}${Math.round((fp-1)*100)}%)`)}}
  /* weather at kickoff, outdoor games only (Open-Meteo): wind and rain cut passing and kicking */
  if(F.wx&&ctx.wx&&/^(pYds|cmp|pRYds|recYds|rec|recLng|kPts|fgM|pTD)$/.test(st)){const w=ctx.wx.wind||0,rn=ctx.wx.rain||0;fw=Math.max(.8,1-.012*Math.max(0,w-12)-(rn>=1?.03:0));if(fw<.995)parts.push(`${w} mph wind${rn>=1?", rain":""} at kickoff (${Math.round((fw-1)*100)}%)`)}
  m=m*fo*fg*fs*fp*fw;
  const cv=sd&&mean?Math.max(.5*(M.cv||.4),Math.min(1.6*(M.cv||.4),(used.length*(sd/mean)+4*(M.cv||.4))/(used.length+4))):(M.cv||.4);
  let pOver=null;
  /* touchdowns: no posted line to anchor to, so the rate is shrunk toward a typical rate for the position
     (about 4 games' weight) and the chance is capped; anytime-TD chances are not backtested */
  const L0=L;const Le=ctx.evalLine!=null?ctx.evalLine:L;
  if(M.yn){const prior={RB:.38,WR:.3,TE:.2,QB:.1}[pos]||.15;const lam=(Math.min(used.length,10)*m+4*prior*fo*fg)/(Math.min(used.length,10)+4);m=lam;pOver=Math.min(.65,1-Math.exp(-Math.max(.01,lam)));parts.push(`touchdown rate shrunk toward a typical ${pos} (${prior}/game)`)}
  else if(Le!=null){if(M.d==="pois")pOver=1-poisCdf(Math.floor(Le),Math.max(.05,m));
    else if(M.d==="logn"){if(m<=0)pOver=0;else{const s2=Math.log(1+cv*cv),mu=Math.log(m)-s2/2;pOver=Le<=0?1:1-Phi((Math.log(Le)-mu)/Math.sqrt(s2))}}
    else pOver=1-Phi((Le-m)/Math.max(.5,cv*m))}
  const hits=Le!=null&&!M.yn?vals.filter(v=>v>Le).length:null;
  /* the trust factor k pulls the model toward the market. At DraftKings' line the market is 50/50; at your book's number
     the market's view is DraftKings' line carried over with the same shape (median at that line), not 50%. */
  let pM=.5;if(!M.yn&&Le!=null&&L0!=null&&Le!==L0){if(M.d==="pois"){let lo=.01,hi=60;for(let i=0;i<50;i++){const md=(lo+hi)/2;(1-poisCdf(Math.floor(L0),md))<.5?lo=md:hi=md}pM=1-poisCdf(Math.floor(Le),(lo+hi)/2)}
    else if(M.d==="logn"){const s2=Math.log(1+cv*cv);pM=Le<=0?1:1-Phi((Math.log(Le)-Math.log(Math.max(.01,L0)))/Math.sqrt(s2))}else pM=1-Phi((Le-L0)/Math.max(.5,cv*Math.max(m,L0)))}
  const k=ctx.k!=null?ctx.k:.4,pAdj=pOver==null?null:M.yn?pOver:pM+k*(pOver-pM);
  return{n:used.length,m,m0,cv,pOver,p:pAdj,pM,k,parts,hits,last:vals.slice(-5),fo,fg,L:Le,L0}}
const r1=v=>Math.round(v*10)/10;
/* which new factors are on; the backtest turns each off in turn and keeps only what improves out-of-sample results */
const DEFAULT_F={snap:1,tgt:1,prs:1,wx:1,ogs:1};
/* live: chance the bet still wins given what he has so far and the share of the game left */
function liveChance(proj,cur,line,side,fracLeft,st){if(!proj||proj.m==null)return null;const M=STATS[st];const need=line-cur;
  if(need<0)return side==="o"?1:0;const rem=proj.m*Math.max(0,fracLeft);if(fracLeft<=0)return side==="o"?(cur>line?1:0):(cur<line?1:0);
  let pOver;if(M&&M.d==="pois"||(M&&M.yn))pOver=1-poisCdf(Math.floor(need),Math.max(.01,rem));
  else{const sd=Math.max(.5,(proj.cv||.5)*proj.m*Math.sqrt(Math.max(.02,fracLeft)));pOver=1-Phi((need-rem)/sd)}
  return side==="o"?pOver:1-pOver}
const api={DEFAULT_F,STATS,index,defense,project,liveChance,grp,teamAvg,Phi,poisCdf};
root.SLNFLModel=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
