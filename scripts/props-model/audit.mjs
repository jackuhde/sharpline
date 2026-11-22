// Bias audit of Sharpline's NBA prop model (Nov 22 2026). Run: node scripts/props-model/audit.mjs
// Uses every graded DraftKings line this season (data/props-history.json), pre-game information only (rows.mjs).
// Before vs after are scored the same way: walk-forward by week, each week priced by a model and per-stat k fit only on
// earlier weeks. "Before" is the old k rule (floor 0.3, pulled toward 0.8) and the old Top List rule; "after" is the new k
// rule (shrunk toward the market, no floor), no level terms with features centered per stat, and the overlap-aware Top List. Writes data/nba/audit.json.
import fs from "node:fs";import {createRequire} from "node:module";import {buildRows,appModel} from "./rows.mjs";import {dec,evOf,sdFor} from "./lib.mjs";
const require=createRequire(import.meta.url);const RK=require("../../rank.js");
const OLD=(()=>{try{const src=fs.readFileSync(process.argv[2]||"scripts/props-model/rank-before-audit.js","utf8");const m={exports:{}};new Function("module","window",src)(m,undefined);return m.exports}catch(e){return null}})();
const {rows}=buildRows("data/props-history.json");
const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),cl=(v,a)=>Math.max(-a,Math.min(a,v)),pct=v=>v==null?null:+(100*v).toFixed(1),r2=v=>+v.toFixed(2);
const F={mkt:r=>lg(Math.min(.97,Math.max(.03,r.pm))),gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),
  hot:r=>(r.hitRate10??.5)-.5,bench:r=>r.min<24?1:0,miss:r=>Math.min(3,r.miss),minTr:r=>cl(r.min3/r.min-1,.5),b2b:r=>r.b2b?1:0,
  combo:r=>/\+/.test(r.st)?1:0,count:r=>/3-Pointers|Steals|Blocks/.test(r.st)?1:0};
const names=Object.keys(F);const memo={};
/* before: the pre-audit model (intercept, combo/count flags, raw features). after: no level terms, features centered per stat
   on the training weeks, DraftKings' no-vig chance as a fixed starting point (same as fit.mjs) */
const NEW=["gapS","gap10","hot","bench","minTr","b2b"];
function fit(W,old=true){const key=W+":"+old;if(memo[key])return memo[key];const tr=base.filter(r=>wk(r.d)<W);let xr,nm=old?names:["mkt",...NEW];
  if(old)xr=r=>[1,...names.map(n=>F[n](r))];else{const A={},mu={};tr.forEach(r=>{const a=A[r.st]=A[r.st]||{n:0};a.n++;NEW.forEach(n=>a[n]=(a[n]||0)+F[n](r))});
    for(const st in A){mu[st]={};NEW.forEach(n=>mu[st][n]=A[st][n]/A[st].n)}xr=r=>[1,F.mkt(r),...NEW.map(n=>F[n](r)-((mu[r.st]||{})[n]||0))]}
  const X=tr.map(xr),y=tr.map(r=>r.over);let w=new Array(nm.length+1).fill(0);w[1]=1;
  for(let it=0;it<500;it++){const g=new Array(w.length).fill(0);X.forEach((x,i)=>{const p=sg(x.reduce((a,v,j)=>a+v*w[j],0));x.forEach((v,j)=>g[j]+=(p-y[i])*v)});
    w=w.map((v,j)=>old?v-.5*(g[j]/X.length+(j>1?2*v/X.length:0)):j<2?v:v-.5*(g[j]/X.length+2*v/X.length))}
  w.xr=xr;w.nm=nm;return memo[key]=w}
const pred=(w,r)=>sg(w.xr(r).reduce((a,v,j)=>a+v*w[j],0));
const base=rows.filter(r=>r.gp>=3&&r.s!=null);
const wk=d=>Math.floor((Date.parse(d+"T12:00:00Z")-Date.parse("2026-10-19T12:00:00Z"))/(7*864e5));
const weeks=[...new Set(base.map(r=>wk(r.d)))].sort((a,b)=>a-b),trainable=weeks.filter(W=>base.filter(r=>wk(r.d)<W).length>=4000);
const kRules={before:(num,den)=>den?Math.max(.3,Math.min(1,.5*num/den+.4)):.8,after:(num,den)=>Math.max(0,Math.min(1,num/(den+.5)))};
function kFrom(W,rule){const A={};trainable.filter(V=>V<W).forEach(V=>{const w=fit(V,rule==="before");base.filter(r=>wk(r.d)===V).forEach(r=>{const d=pred(w,r)-r.pm,B=A[r.st]=A[r.st]||[0,0];B[0]+=d*(r.over-r.pm);B[1]+=d*d})});
  const def=rule==="before"?.8:0;return st=>A[st]?kRules[rule](A[st][0],A[st][1]):def}
/* 1. raw facts, no model */
const factsOf=a=>({n:a.length,overWon:pct(a.filter(r=>r.over).length/a.length),overPriced:pct(a.reduce((s,r)=>s+r.pm,0)/a.length),
  lineMinusActual:r2(a.reduce((s,r)=>s+(r.l-r.actual),0)/a.length),seasonAvgMinusActual:r2(a.reduce((s,r)=>s+(r.s-r.actual),0)/a.length),
  last10MinusActual:r2(a.reduce((s,r)=>s+((r.s10??r.s)-r.actual),0)/a.length),appProjMinusActual:r2(a.reduce((s,r)=>s+(appModel(r).m-r.actual),0)/a.length),
  appProjMinusLine:r2(a.reduce((s,r)=>s+(appModel(r).m-r.l),0)/a.length)});
const group=(list,key)=>{const g={};list.forEach(r=>{const k=key(r);(g[k]=g[k]||[]).push(r)});return g};
const facts={all:factsOf(base),byStat:Object.fromEntries(Object.entries(group(base,r=>r.st)).map(([k,a])=>[k,factsOf(a)])),
  byWeek:Object.entries(group(base,r=>wk(r.d))).sort((a,b)=>a[0]-b[0]).map(([W,a])=>({from:a.map(r=>r.d).sort()[0],...factsOf(a)}))};
/* 2. walk-forward scoring of each version on weeks that have at least one earlier scored week to learn k from */
const evalWeeks=trainable.filter(W=>trainable.some(V=>V<W));
function score(rule){const L=[];evalWeeks.forEach(W=>{const w=fit(W,rule==="before"),k=kFrom(W,rule);base.filter(r=>wk(r.d)===W).forEach(r=>{const raw=pred(w,r),p=r.pm+k(r.st)*(raw-r.pm);
    const eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";L.push({r,raw,p,side,ev:Math.max(eo,eu),price:side==="o"?r.o:r.u,won:side==="o"?r.over:1-r.over})})});
  const picks=L.filter(x=>x.ev>=.02);const rec=a=>({n:a.length,hit:a.length?pct(a.filter(x=>x.won).length/a.length):null,roi:a.length?pct(a.reduce((s,x)=>s+(x.won?dec(x.price)-1:-1),0)/a.length):null});
  const ll=(y,p)=>-(y?Math.log(p):Math.log(1-p));const sided=L.map(x=>({p:x.side==="o"?x.p:1-x.p,y:x.won}));
  const bins=[[.4,.5],[.5,.52],[.52,.54],[.54,.56],[.56,.6],[.6,1]].map(([lo,hi])=>{const a=sided.filter(x=>x.p>=lo&&x.p<hi);return a.length?{range:`${lo}-${hi}`,n:a.length,predicted:pct(a.reduce((s,x)=>s+x.p,0)/a.length),actual:pct(a.filter(x=>x.y).length/a.length)}:null}).filter(Boolean);
  const byPlayer=Object.entries(group(picks,x=>x.r.name)).map(([k,a])=>({player:k,...rec(a),under:a.filter(x=>x.side==="u").length})).sort((a,b)=>b.n-a.n).slice(0,8);
  return{rowSide:{over:pct(L.filter(x=>x.side==="o").length/L.length),under:pct(L.filter(x=>x.side==="u").length/L.length)},lines:L.length,from:base.filter(r=>wk(r.d)===evalWeeks[0]).map(r=>r.d).sort()[0],marketsLeaningOver:pct(L.filter(x=>x.p>x.r.pm).length/L.length),marketsLeaningUnder:pct(L.filter(x=>x.p<x.r.pm).length/L.length),
    picks2:{all:rec(picks),over:rec(picks.filter(x=>x.side==="o")),under:rec(picks.filter(x=>x.side==="u")),underShare:picks.length?pct(picks.filter(x=>x.side==="u").length/picks.length):null},
    picks4:{all:rec(picks.filter(x=>x.ev>=.04)),underShare:picks.filter(x=>x.ev>=.04).length?pct(picks.filter(x=>x.ev>=.04&&x.side==="u").length/picks.filter(x=>x.ev>=.04).length):null},
    byStat:Object.fromEntries(Object.entries(group(picks,x=>x.r.st)).map(([k,a])=>[k,{over:rec(a.filter(x=>x.side==="o")),under:rec(a.filter(x=>x.side==="u"))}])),
    byEvBand:[[.02,.04],[.04,.06],[.06,1]].map(([lo,hi])=>({band:`${lo*100}-${hi<1?hi*100:"up"}%`,...rec(picks.filter(x=>x.ev>=lo&&x.ev<hi))})),byPlayer,
    leanCalibration:(()=>{const u=L.filter(x=>x.p<x.r.pm-.005),o=L.filter(x=>x.p>x.r.pm+.005);return{leanUnder:{n:u.length,predictedUnder:u.length?pct(u.reduce((s,x)=>s+1-x.p,0)/u.length):null,actualUnder:u.length?pct(u.filter(x=>!x.r.over).length/u.length):null,dkUnder:u.length?pct(u.reduce((s,x)=>s+1-x.r.pm,0)/u.length):null},
      leanOver:{n:o.length,predictedOver:o.length?pct(o.reduce((s,x)=>s+x.p,0)/o.length):null,actualOver:o.length?pct(o.filter(x=>x.r.over).length/o.length):null,dkOver:o.length?pct(o.reduce((s,x)=>s+x.r.pm,0)/o.length):null}}})(),
    shiftByWeek:evalWeeks.map(W=>{const a=L.filter(x=>wk(x.r.d)===W);return{from:a.map(x=>x.r.d).sort()[0],modelShiftPts:+(100*a.reduce((s,x)=>s+x.p-x.r.pm,0)/a.length).toFixed(2),rawShiftPts:+(100*a.reduce((s,x)=>s+x.raw-x.r.pm,0)/a.length).toFixed(2),realizedOverMinusDkPts:+(100*a.reduce((s,x)=>s+x.r.over-x.r.pm,0)/a.length).toFixed(2)}}),
    brier:+(L.reduce((s,x)=>s+(x.p-x.r.over)**2,0)/L.length).toFixed(4),brierMarket:+(L.reduce((s,x)=>s+(x.r.pm-x.r.over)**2,0)/L.length).toFixed(4),
    logLoss:+(L.reduce((s,x)=>s+ll(x.r.over,x.p),0)/L.length).toFixed(4),logLossMarket:+(L.reduce((s,x)=>s+ll(x.r.over,x.r.pm),0)/L.length).toFixed(4),calibration:bins,_picks:picks}}
/* 3. Top List concentration per slate: 10 picks, default one-per-player setting, every pick treated as High confidence (the
   most permissive case for the exceptional-second-pick rule) */
function concentration(picks,sel){const days=group(picks,x=>x.r.d);let slates=0,dupSlates=0,overlapPairs=0,maxOne=0,ex=[];
  Object.entries(days).sort().forEach(([d,a])=>{const Q=a.sort((x,y)=>y.ev-x.ev).map(x=>({base:x.r.ath+"|"+x.r.st,ath:x.r.ath,gi:x.r.gid,st:x.r.st,ev:x.ev,conf:"High",name:x.r.name,side:x.side}));
    const out=sel(Q,{max:10,perPlayer:"1",perGame:"3",minEdge:.02}).out;slates++;const per=group(out,c=>c.ath);const top=Object.values(per).sort((x,y)=>y.length-x.length)[0]||[];
    maxOne=Math.max(maxOne,top.length);if(top.length>1)dupSlates++;Object.values(per).forEach(g=>{for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)if(RK.overlaps(g[i].st,g[j].st))overlapPairs++});
    if(top.length>=3&&ex.length<6)ex.push(`${d}: ${top[0].name} ${top.map(c=>(c.side==="u"?"Under ":"Over ")+c.st).join(", ")}`)});
  return{slates,slatesWithAPlayerTwice:dupSlates,overlappingSamePlayerPairs:overlapPairs,mostPicksOnOnePlayer:maxOne,examples:ex}}
/* 4. trace: why the old model faded the same player across his combo props */
function trace(x){const w=fit(wk(x.r.d),true),c=Object.fromEntries(names.map((n,j)=>[n,r2(w[j+1]*F[n](x.r))]));c.intercept=r2(w[0]);c.mktBaseline=r2(w[1]*F.mkt(x.r)-lg(x.r.pm));delete c.mkt;
  return{date:x.r.d,player:x.r.name,stat:x.r.st,line:x.r.l,over:x.r.o,under:x.r.u,dkNoVigOver:pct(x.r.pm),seasonAvg:r2(x.r.s),last10:r2(x.r.s10),overInLast10:x.r.hitRate10,
    rawModelOver:pct(x.raw),countedOver:pct(x.p),side:x.side==="u"?"Under":"Over",ev:pct(x.ev),actual:x.r.actual,result:x.won?"won":"lost",logOddsPushFromMarket:c}}
const B=score("before"),A=score("after");
/* what the app actually showed: the model.json deployed before this audit (weights fit on the whole season, old k), every line
   this season. In-sample, so its results are flattering; it is here to reproduce the side split and concentration. */
const DEP=(()=>{try{return JSON.parse(fs.readFileSync("data/nba/model-before-audit.json","utf8"))}catch(e){return null}})();
function deployed(M){const L=[];base.forEach(r=>{const raw=sg(M.weights.b0+names.reduce((a,k)=>a+(M.weights[k]||0)*F[k](r),0)),k=M.catK[r.st]??.8,p=r.pm+k*(raw-r.pm);
    const eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";L.push({r,raw,p,side,ev:Math.max(eo,eu),price:side==="o"?r.o:r.u,won:side==="o"?r.over:1-r.over})});
  const picks=L.filter(x=>x.ev>=.02),overs=picks.filter(x=>x.side==="o").length;
  return{lines:L.length,marketsLeaningUnder:pct(L.filter(x=>x.p<x.r.pm).length/L.length),picks:picks.length,overPicks:overs,underShare:pct(1-overs/Math.max(1,picks.length)),_picks:picks}}
const D=DEP?deployed(DEP):null;
const conc={deployedOldList:D&&OLD?concentration(D._picks,OLD.selectTop):null,deployedNewList:D?concentration(D._picks,RK.selectTop):null,before:OLD?concentration(B._picks,OLD.selectTop):null,afterSameModelNewList:concentration(B._picks,RK.selectTop),after:concentration(A._picks,RK.selectTop)};
const worst=Object.values(group(B._picks,x=>x.r.d+x.r.ath)).sort((a,b)=>b.length-a.length)[0];
/* the most-faded player of the season under the old rules */
const fadedName=B.byPlayer[0]&&B.byPlayer[0].player,faded=B._picks.filter(x=>x.r.name===fadedName),fadedAll=base.filter(r=>r.name===fadedName&&evalWeeks.includes(wk(r.d)));
const out={updated:new Date().toISOString(),lines:base.length,walkForwardFrom:B.from,facts,deployed:D?{...D,_picks:undefined}:null,
  before:{...B,_picks:undefined},after:{...A,_picks:undefined},concentration:conc,
  mostFaded:fadedName?{player:fadedName,picks:faded.length,unders:faded.filter(x=>x.side==="u").length,won:faded.filter(x=>x.won).length,
    hisLinesOverWon:pct(fadedAll.filter(r=>r.over).length/fadedAll.length),hisLinesOverPriced:pct(fadedAll.reduce((s,r)=>s+r.pm,0)/fadedAll.length),linesThoseWeeks:fadedAll.length}:null,
  trace:worst.sort((a,b)=>b.ev-a.ev).map(trace)};
fs.mkdirSync("data/nba",{recursive:true});fs.writeFileSync("data/nba/audit.json",JSON.stringify(out,null,1));
const show=v=>({lean:v.leanCalibration,shift:v.shiftByWeek,lines:v.lines,leanOver:v.marketsLeaningOver,leanUnder:v.marketsLeaningUnder,picks2:v.picks2,picks4:v.picks4,brier:[v.brier,v.brierMarket],logLoss:[v.logLoss,v.logLossMarket],byEvBand:v.byEvBand,byPlayer:v.byPlayer.slice(0,4)});
console.log(JSON.stringify({deployed:out.deployed,before:show(B),after:show(A),calibBefore:B.calibration,calibAfter:A.calibration,conc,mostFaded:out.mostFaded,trace:out.trace},null,1));
console.log(JSON.stringify(facts.byStat));console.log("before byStat",JSON.stringify(B.byStat));
