// Sharpline NBA prop model: historical pick review, miss diagnosis and corrected-model backtest (Nov 23 2026).
// Run: node scripts/props-model/review.mjs   (writes data/nba/review.json and prints the report numbers)
//
// Strict chronology. Weeks start Monday (week 0 = Oct 20). Each week is priced only by models, calibration and k fitted on
// earlier weeks. Week of Nov 9 = validation (used to choose the corrected model and the tier rules). Week of Nov 16 =
// untouched test (scored once, after every choice was fixed). Postgame fields (row.post) are used only to describe misses.
//
// What "Sharpline's historical picks" means here: the picks the app logged live sit on the user's phone (sl_recs) and in
// their signed-in account, which this script cannot read. They are reconstructed by replaying the model and grade rules the
// app ran before the Nov 22 audit (logistic model with intercept and combo/count flags, k floor 0.3, old EV grade scale,
// S limited to 3 a night) on DraftKings' real opening and closing prices. The app logged a pick the first time it showed it,
// usually well before tip, so the opening price is the closer match; both are reported.
import fs from "node:fs";import {createRequire} from "node:module";import {buildRows} from "./rows.mjs";import {MV,FM,fitMove,openOf as openOfM,NBA_TIERS,MOVE_LAMBDA} from "./move.mjs";import {devig,sdFor,dec,invPhi,Phi,poisOver} from "./lib.mjs";
const require=createRequire(import.meta.url);const RK=require("../../rank.js");
const {rows}=buildRows("data/props-history.json");
const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),cl=(v,a)=>Math.max(-a,Math.min(a,v)),clp=p=>Math.min(.97,Math.max(.03,p));
const pct=v=>v==null||!isFinite(v)?null:+(100*v).toFixed(1),r3=v=>v==null||!isFinite(v)?null:+v.toFixed(3);
const base=rows.filter(r=>r.gp>=3&&r.s!=null);
const wk=d=>Math.floor((Date.parse(d+"T12:00:00Z")-Date.parse("2026-10-19T12:00:00Z"))/(7*864e5));
const weeks=[...new Set(base.map(r=>wk(r.d)))].sort((a,b)=>a-b);
const VALID=wk("2026-11-09"),TEST=wk("2026-11-16");
const span=W=>{const a=base.filter(r=>wk(r.d)===W).map(r=>r.d).sort();return[a[0],a.at(-1)]};
const openOf=r=>openOfM(r,RK);
const closeOf=r=>({...r,pClose:r.pm});

/* ================= models ================= */
const FO={mkt:r=>lg(clp(r.pm)),gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),hot:r=>(r.hitRate10??.5)-.5,bench:r=>r.min<24?1:0,
  miss:r=>Math.min(3,r.miss),minTr:r=>cl(r.min3/r.min-1,.5),b2b:r=>r.b2b?1:0,combo:r=>/\+/.test(r.st)?1:0,count:r=>/3-Pointers|Steals|Blocks/.test(r.st)?1:0};
const OLDN=Object.keys(FO),NEWN=["gapS","gap10","hot","bench","minTr","b2b"];
function logit(train,xr,n,ridgeFrom){const X=train.map(xr),y=train.map(r=>r.over);let w=new Array(n).fill(0);w[1]=1;
  for(let it=0;it<500;it++){const g=new Array(n).fill(0);X.forEach((x,i)=>{const p=sg(x.reduce((a,v,j)=>a+v*w[j],0));x.forEach((v,j)=>g[j]+=(p-y[i])*v)});
    w=w.map((v,j)=>ridgeFrom==="old"?v-.5*(g[j]/X.length+(j>1?2*v/X.length:0)):j<2?v:v-.5*(g[j]/X.length+2*v/X.length))}return w}
const memo={};
/* the model the app ran before the Nov 22 audit, and the one it runs now (identical to grades.mjs) */
function fitOld(W){const k="o"+W;if(memo[k])return memo[k];const tr=base.filter(r=>wk(r.d)<W),xr=r=>[1,...OLDN.map(n=>FO[n](r))],w=logit(tr,xr,OLDN.length+1,"old");return memo[k]=r=>sg(xr(r).reduce((a,v,j)=>a+v*w[j],0))}
function fitNew(W){const k="n"+W;if(memo[k])return memo[k];const tr=base.filter(r=>wk(r.d)<W),A={},mu={};tr.forEach(r=>{const a=A[r.st]=A[r.st]||{n:0};a.n++;NEWN.forEach(n=>a[n]=(a[n]||0)+FO[n](r))});
  for(const st in A){mu[st]={};NEWN.forEach(n=>mu[st][n]=A[st][n]/A[st].n)}const xr=r=>[1,FO.mkt(r),...NEWN.map(n=>FO[n](r)-((mu[r.st]||{})[n]||0))],w=logit(tr,xr,NEWN.length+2,"new");
  return memo[k]=r=>sg(xr(r).reduce((a,v,j)=>a+v*w[j],0))}
const trainable=weeks.filter(W=>base.filter(r=>wk(r.d)<W).length>=4000);
function kFor(W,old){const A={};trainable.filter(V=>V<W).forEach(V=>{const f=old?fitOld(V):fitNew(V);base.filter(r=>wk(r.d)===V).forEach(r=>{const d=f(r)-r.pm,B=A[r.st]=A[r.st]||[0,0];B[0]+=d*(r.over-r.pm);B[1]+=d*d})});
  return st=>old?(A[st]?Math.max(.3,Math.min(1,.5*A[st][0]/A[st][1]+.4)):.8):(A[st]?Math.max(0,Math.min(1,A[st][0]/(A[st][1]+.5))):0)}
function calFor(W){const C={};const tr=base.filter(r=>wk(r.d)<W);[...new Set(tr.map(r=>r.st))].forEach(st=>{const a=tr.filter(r=>r.st===st),n=a.length,gap=a.reduce((s,r)=>s+r.over-r.pm,0)/n;
  C[st]={n,overGap:gap,underGap:-gap,se:Math.sqrt(a.reduce((s,r)=>s+r.pm*(1-r.pm),0))/n,validated:n>=1000}});return C}
const oldGrade=(ev,st)=>{let g=ev>=.08?5:ev>=.04?4:ev>=.02?3:ev>=-.015?2:ev>=-.04?1:0;if(/Steals|Blocks/.test(st))g--;return RK.GRADE_ORDER[Math.max(0,g)]};

/* ---------- corrected model: anticipate where DraftKings' price is heading ----------
   Finding (factor scan below): opening lines are slow to absorb a player's season and recent averages and teammates who are
   out; by tip the price has moved toward them (t 9 to 17 in every period). The model predicts that move in log-odds from
   pregame information at the line being priced, by ridge least squares, and counts only the part still to come:
   chance = DraftKings' current no-vig chance moved by the predicted remaining move. At the closing price there is nothing
   left to come, so it is scored there only to show what happens if it were applied too late. */
const OPEN=base.map(openOf).filter(Boolean);
const moveMemo={};const moveFor=W=>moveMemo[W]||(moveMemo[W]=fitMove(OPEN.filter(r=>wk(r.d)<W)));

/* ---------- corrected grades ----------
   Conservative EV (evLo): the chance is lowered by DraftKings' shortfall on that side of that stat so far this season plus
   1.28 standard errors, and by half of the model's own move (a forecast, not a price). Tiers on evLo: S 10%+, A 5%+, B 1%+,
   C -1%+, D EV -5% or better, F worse. The cut points were chosen on the weeks before the untouched test week (price-shopping
   section below), where higher bands earned more; the test week was scored once afterwards. S also needs a stat with 1,000+
   lines; A and S never go to a stat with fewer than 300 lines; one S or A per player per slate (props on one player move
   together), the rest drop to B. */
const TIER=NBA_TIERS;
function tierOf(evLo,ev,validated){let g=evLo>=TIER.S?5:evLo>=TIER.A?4:evLo>=TIER.B?3:evLo>=TIER.C?2:ev>=TIER.D?1:0;if(g===5&&!validated)g=4;return RK.GRADE_ORDER[g]}

/* ---------- price every market, both sides, with every model ---------- */
const scored=trainable.filter(W=>trainable.some(V=>V<W));
const moveWeeks=weeks.filter(W=>OPEN.filter(r=>wk(r.d)<W).length>=3000);
function price(snap){const out=[];
  for(const W of weeks){const old=scored.includes(W),mv=moveWeeks.includes(W);if(!old&&!mv)continue;
    const fo=old?fitOld(W):null,fn=old?fitNew(W):null,ko=old?kFor(W,true):null,kn=old?kFor(W,false):null,C=calFor(W),M=mv?moveFor(W):null;
    for(const r0 of base.filter(r=>wk(r.d)===W)){const r=snap==="open"?openOf(r0):closeOf(r0);if(!r)continue;const c=C[r.st];
      const side=(p)=>{const eo=RK.ev(p,r.o),eu=RK.ev(1-p,r.u);return eo>=eu?{s:"o",p,o:r.o,ev:eo,pm:r.pm,won:r.over}:{s:"u",p:1-p,o:r.u,ev:eu,pm:1-r.pm,won:1-r.over}};
      const clvOf=S=>snap==="open"?RK.ev(S.s==="o"?r.pClose:1-r.pClose,S.o):null;
      const row={W,d:r.d,gid:r.gid,ath:r.ath,name:r.name,st:r.st,l:r.l,o:r.o,u:r.u,pm:r.pm,y:r.over,actual:r.actual,pClose:r.pClose,lClose:r0.l,
        s:r.s,s10:r.s10,min:r.min,min10:r.min10,startRate:r.startRate,starter:r.starter,miss:r.miss,b2b:r.b2b,spread:r.spread,post:r.post,m:{}};
      /* DraftKings itself */
      row.m.market={p:r.pm};
      /* simple statistical baseline: season average against the line (normal for most stats, Poisson for counts) */
      {const sd=sdFor(r.st,r.l),pb=/3-Pointers|Steals|Blocks/.test(r.st)?poisOver(Math.max(.05,r.s),r.l):1-Phi((r.l-r.s)/sd);const S=side(pb);row.m.baseline={p:pb,...S,grade:S.ev>=.02?"pick":null,clv:clvOf(S),proj:r.s}}
      if(old){/* original (pre-audit) */const raw=fo(r),p=r.pm+ko(r.st)*(raw-r.pm),S=side(p);row.m.original={p,...S,grade:oldGrade(S.ev,r.st),clv:clvOf(S)};
        /* current (Nov 22) */const rawN=fn(r),pN=r.pm+kn(r.st)*(rawN-r.pm),SN=side(pN),u=(c?Math.max(0,-(SN.s==="o"?c.overGap:c.underGap))+1.28*c.se:.03)+.5*Math.abs(SN.p-SN.pm);
        row.m.current={p:pN,...SN,grade:RK.gradeBet({p:SN.p,o:SN.o,u,conf:"High",fresh:"live",validated:!!(c&&c.validated)}).g,clv:clvOf(SN)}}
      if(mv){const mvz=M.f(r),p=sg(lg(clp(r.pm))+mvz),S=side(p),u=(c?Math.max(0,-(S.s==="o"?c.overGap:c.underGap))+1.28*c.se:.03)+.5*Math.abs(S.p-S.pm);
        const pLo=Math.max(.001,S.p-u),evLo=RK.ev(pLo,S.o);row.m.corrected={p,...S,move:mvz,evLo,grade:tierOf(evLo,S.ev,!!(c&&c.validated)&&(c.n>=1000)),thin:!(c&&c.n>=300),clv:clvOf(S),proj:null}}
      out.push(row)}}
  /* old S rule: only the 3 biggest EVs of a night keep S */
  const byD={};out.forEach(x=>{const m=x.m.original;if(m&&m.grade==="S")(byD[x.d]=byD[x.d]||[]).push(m)});Object.values(byD).forEach(a=>a.sort((x,y)=>y.ev-x.ev).slice(3).forEach(m=>m.grade="A"));
  /* corrected: one S/A per player per night (correlated props), thin stats capped at B */
  const byP={};out.forEach(x=>{const m=x.m.corrected;if(!m)return;if(m.thin&&["S","A"].includes(m.grade))m.grade="B";if(["S","A"].includes(m.grade))(byP[x.d+"|"+x.ath]=byP[x.d+"|"+x.ath]||[]).push(m)});
  Object.values(byP).forEach(a=>a.sort((x,y)=>y.evLo-x.evLo).slice(1).forEach(m=>m.grade="B"));
  return out}
console.error("pricing opening and closing snapshots…");
const OPENP=price("open"),CLOSEP=price("close");

/* ================= metrics ================= */
const ll=(y,p)=>{p=Math.min(.999,Math.max(.001,p));return-(y?Math.log(p):Math.log(1-p))};
function rec(a){if(!a.length)return{n:0};const won=a.filter(x=>x.won).length;return{n:a.length,won:pct(won/a.length),predicted:pct(a.reduce((s,x)=>s+x.p,0)/a.length),
  roi:pct(a.reduce((s,x)=>s+(x.won?RK.dec(x.o)-1:-1),0)/a.length),clv:a.some(x=>x.clv!=null)?pct(a.reduce((s,x)=>s+(x.clv||0),0)/a.length):null}}
const by=(a,f)=>{const m={};a.forEach(x=>{const k=f(x);if(k!=null)(m[k]=m[k]||[]).push(x)});return Object.fromEntries(Object.entries(m).map(([k,v])=>[k,rec(v)]))};
const PICK={original:m=>["S","A","B"].includes(m.grade),current:m=>["S","A","B"].includes(m.grade),corrected:m=>["S","A","B"].includes(m.grade),baseline:m=>m.grade==="pick"};
function modelReport(P,name,period){const L=P.filter(x=>x.W===period&&x.m[name]);if(!L.length)return null;const M=L.map(x=>({...x.m[name],st:x.st,y:x.y,pm:x.pm,pOver:x.m[name].p,d:x.d,ath:x.ath}));
  /* note: for non-market models .p on the side object is the side's chance; pOver is the Over chance */
  const pO=x=>name==="market"?x.p:(x.s==="o"?x.p:1-x.p);
  const prob={n:M.length,brier:r3(M.reduce((s,x)=>s+(pO(x)-x.y)**2,0)/M.length),brierMarket:r3(M.reduce((s,x)=>s+(x.pm-x.y)**2,0)/M.length),
    logLoss:+(M.reduce((s,x)=>s+ll(x.y,pO(x)),0)/M.length).toFixed(4),logLossMarket:+(M.reduce((s,x)=>s+ll(x.y,x.pm),0)/M.length).toFixed(4)};
  if(name==="market")return{prob};
  const lean=M.filter(x=>Math.abs(pO(x)-.5)>=.005);
  const acc={allLeans:rec(lean),overLeans:rec(lean.filter(x=>x.s==="o")),underLeans:rec(lean.filter(x=>x.s==="u"))};
  const picks=M.filter(PICK[name]);
  const cal=[[0,.48],[.48,.5],[.5,.52],[.52,.54],[.54,.56],[.56,.58],[.58,.62],[.62,1]].map(([lo,hi])=>{const x=M.filter(z=>z.p>=lo&&z.p<hi);return x.length?{range:`${Math.round(lo*100)}-${Math.round(hi*100)}%`,n:x.length,predicted:pct(x.reduce((s,z)=>s+z.p,0)/x.length),won:pct(x.filter(z=>z.won).length/x.length)}:null}).filter(Boolean);
  const per=Object.values(picks.reduce((m,x)=>{const k=x.d+x.ath;(m[k]=m[k]||[]).push(x);return m},{}));
  return{prob,accuracy:acc,calibration:cal,picks:{...rec(picks),over:rec(picks.filter(x=>x.s==="o")),under:rec(picks.filter(x=>x.s==="u")),byStat:by(picks,x=>x.st),
      samePlayerNights2plus:per.filter(a=>a.length>=2).length,maxOnOnePlayer:Math.max(0,...per.map(a=>a.length))},
    byTier:name==="baseline"?null:Object.fromEntries(["S","A","B","C","D","F"].map(g=>[g,rec(M.filter(x=>x.grade===g))]))}}
const MODELS=["original","current","baseline","corrected","market"];
const periods={validation:VALID,test:TEST};
const report={};for(const snap of["open","close"]){const P=snap==="open"?OPENP:CLOSEP;report[snap]={};
  for(const [pn,W] of Object.entries(periods)){report[snap][pn]={};MODELS.forEach(m=>{report[snap][pn][m]=modelReport(P,m,W)})}}

/* tiers before the validation week (the period the cut points were set on), for the corrected model at opening prices */
const tierFit=Object.fromEntries(["S","A","B","C","D","F"].map(g=>[g,rec(OPENP.filter(x=>x.W<VALID&&x.m.corrected&&x.m.corrected.grade===g).map(x=>x.m.corrected))]));

/* ================= historical picks: the original model's picks, one by one ================= */
function diagnose(x,M,all){const sd=sdFor(x.st,x.l),miss=x.actual-x.l,toward=M.s==="o"?miss:-miss,tags=[];
  if(Math.abs(miss)<=.25*sd)tags.push("near miss (within a quarter of a typical game's spread)");
  if(x.post&&x.min10!=null&&x.post.min-x.min10<=-8)tags.push("played 8+ fewer minutes than his last-10 average");
  if(x.post&&x.min10!=null&&x.post.min-x.min10>=8)tags.push("played 8+ more minutes than his last-10 average");
  if(x.post&&x.post.margin!=null&&Math.abs(x.post.margin)>=20)tags.push("blowout (20+ point margin)");
  if(M.s==="u"&&x.miss>0)tags.push("faded him while a regular teammate was out (more shots and minutes available)");
  if(M.s==="u"&&x.s>x.l)tags.push("faded him although his season average was above the line");
  if(M.s==="o"&&x.s<x.l)tags.push("backed the Over although his season average was below the line");
  if(x.starter&&(x.startRate??0)<.5)tags.push("started tonight after mostly coming off the bench (role change)");
  if(!x.starter&&(x.startRate??0)>=.5)tags.push("came off the bench after mostly starting (role change)");
  if(x.b2b)tags.push("back-to-back");
  if(x.pClose!=null){const mvC=(M.s==="o"?1:-1)*(x.pClose-x.pm);if(mvC<=-.02)tags.push("DraftKings' price moved against the pick by close (the market had information)");if(mvC>=.02)tags.push("DraftKings' price moved toward the pick by close")}
  if(all.filter(z=>z.d===x.d&&z.ath===x.ath).length>=2)tags.push("one of several picks on the same player that night (correlated)");
  return tags}
function pickLog(P,snap){const picks=P.filter(x=>x.m.original&&PICK.original(x.m.original));return picks.map(x=>{const M=x.m.original,sd=sdFor(x.st,x.l);
  const tags=diagnose(x,M,picks.map(z=>({d:z.d,ath:z.ath})));const C=x.m.corrected;
  /* where the miss came from */
  let cause=null;if(!M.won){cause=tags.some(t=>t.startsWith("near miss"))?"variance (finished next to the line)":tags.some(t=>/minutes|blowout|role change/.test(t))?"minutes or role changed in the game":
    tags.some(t=>/price moved against/.test(t))?"wrong side: the market moved the other way before tip":"wrong side, no single cause"}
  return{date:x.d,player:x.name,stat:x.st,line:x.l,side:M.s==="o"?"Over":"Under",odds:M.o,snapshot:snap,chance:pct(M.p),ev:pct(M.ev),grade:M.grade,marketChance:pct(M.pm),
    result:x.actual,won:!!M.won,missBy:+((x.actual-x.l)*(M.s==="o"?1:-1)).toFixed(1),missBySd:+(((x.actual-x.l)*(M.s==="o"?1:-1))/sd).toFixed(2),
    seasonAvg:+x.s.toFixed(1),minutesAvg10:x.min10!=null?+x.min10.toFixed(1):null,minutesPlayed:x.post?x.post.min:null,clv:pct(M.clv),
    tags,cause,corrected:C?{side:C.s==="o"?"Over":"Under",chance:pct(C.p),grade:C.grade,ev:pct(C.ev),wouldPick:PICK.corrected(C),sameSide:C.s===M.s}:null}})}
const logOpen=pickLog(OPENP,"open"),logClose=pickLog(CLOSEP,"close");
function patterns(L){const W=L.filter(x=>x.won),Lo=L.filter(x=>!x.won),tags=[...new Set(L.flatMap(x=>x.tags))];
  return{picks:L.length,won:W.length,lost:Lo.length,
    tagLift:tags.map(t=>{const a=Lo.filter(x=>x.tags.includes(t)).length,b=W.filter(x=>x.tags.includes(t)).length;return{tag:t,inLosses:pct(a/Math.max(1,Lo.length)),inWins:pct(b/Math.max(1,W.length)),
      lossRateWithTag:a+b?pct(a/(a+b)):null,n:a+b}}).sort((x,y)=>(y.inLosses-y.inWins)-(x.inLosses-x.inWins)),
    causes:Object.entries(Lo.reduce((m,x)=>{m[x.cause]=(m[x.cause]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]).map(([cause,n])=>({cause,n,share:pct(n/Lo.length)})),
    sides:{over:rec(L.filter(x=>x.side==="Over").map(x=>({won:x.won,p:x.chance/100,o:x.odds,clv:x.clv==null?null:x.clv/100}))),under:rec(L.filter(x=>x.side==="Under").map(x=>({won:x.won,p:x.chance/100,o:x.odds,clv:x.clv==null?null:x.clv/100})))},
    correctedVerdict:(()=>{const c=L.filter(x=>x.corrected);return{compared:c.length,lossesAvoided:c.filter(x=>!x.won&&!x.corrected.wouldPick).length,winsKept:c.filter(x=>x.won&&x.corrected.wouldPick).length,
      winsDropped:c.filter(x=>x.won&&!x.corrected.wouldPick).length,lossesStillMade:c.filter(x=>!x.won&&x.corrected.wouldPick).length,flippedSide:c.filter(x=>!x.corrected.sameSide).length}})()}}

/* ================= which factors carry information (pregame only), by period ================= */
const FS={...FM,hot:FO.hot,minTr:FO.minTr,bench:FO.bench,b2b:FO.b2b,fav:r=>r.spread==null?0:cl(-r.spread/10,2),oppMiss:r=>Math.min(3,r.oppMiss),tot:r=>r.tot==null?0:(r.tot-228)/10,
  starterRate:r=>r.startRate??0,lineSize:r=>Math.log(r.l+1)};
const per3=W=>W<VALID?"beforeValidation":W===VALID?"validation":"test";
function corr(list,fx,fy){let n=0,sx=0,sy=0,sxx=0,sxy=0,syy=0;list.forEach(r=>{const x=fx(r),y=fy(r);n++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;syy+=y*y});const c=(sxy/n-sx/n*sy/n)/Math.sqrt(Math.max(1e-12,(sxx/n-(sx/n)**2)*(syy/n-(sy/n)**2)));return{r:r3(c),t:+(c*Math.sqrt(n)).toFixed(1),n}}
const factors=Object.fromEntries(Object.entries(FS).map(([k,f])=>[k,{
  beatsClosingPrice:Object.fromEntries(["beforeValidation","validation","test"].map(P=>[P,corr(base.filter(r=>per3(wk(r.d))===P),f,r=>r.over-r.pm)])),
  predictsLineMove:Object.fromEntries(["beforeValidation","validation","test"].map(P=>[P,corr(OPEN.filter(r=>per3(wk(r.d))===P),f,r=>lg(clp(r.pClose))-lg(clp(r.pm)))]))}]));
const oversByStat=Object.fromEntries([...new Set(base.map(r=>r.st))].map(st=>[st,Object.fromEntries(["beforeValidation","validation","test"].map(P=>{const a=base.filter(r=>r.st===st&&per3(wk(r.d))===P);return[P,{n:a.length,overWon:pct(a.reduce((s,r)=>s+r.over,0)/a.length),overPriced:pct(a.reduce((s,r)=>s+r.pm,0)/a.length)}]}))]));

/* projection error, closing line, every line with all four estimates */
const projErr=(()=>{const L=base.filter(r=>wk(r.d)>=VALID);const mae=f=>+(L.reduce((s,r)=>s+Math.abs(f(r)-r.actual),0)/L.length).toFixed(2),bias=f=>+(L.reduce((s,r)=>s+(f(r)-r.actual),0)/L.length).toFixed(2);
  return{n:L.length,line:{mae:mae(r=>r.l),bias:bias(r=>r.l)},seasonAverage:{mae:mae(r=>r.s),bias:bias(r=>r.s)},last10:{mae:mae(r=>r.s10),bias:bias(r=>r.s10)},last5:{mae:mae(r=>r.s5),bias:bias(r=>r.s5)}}})();

/* ================= tiers on prices away from Sharpline's fair price =================
   DraftKings alone offers no price to beat (it IS the fair price). Tiers only matter against another book. Stand-in for a
   slower book: DraftKings' own opening price, on props whose line or price later moved; Sharpline's fair chance comes from the
   later DraftKings price (what the app would see) and the bet is settled at the old number. Old grade cut points vs new. */
const shop=(()=>{const cal={},rowsS=[];base.forEach(r=>{if(r.lOpen==null||r.oOpen==null||r.uOpen==null||r.actual===r.lOpen)return;
    if(!(r.lOpen!==r.l||Math.abs(devig(r.oOpen,r.uOpen)[0]-r.pm)>=.01))return;const W=wk(r.d);if(W<1)return;const C=(cal[W]=cal[W]||calFor(W))[r.st];const pr=RK.probsAt(r.st,r.l,r.pm,r.lOpen);
    for(const side of["o","u"]){const p=side==="o"?pr.over:pr.under,o=side==="o"?r.oOpen:r.uOpen,u=(C?Math.max(0,-(side==="o"?C.overGap:C.underGap))+1.28*C.se:.03)+.02*Math.abs(r.l-r.lOpen)/RK.sdFit(r.st,r.l);
      const gb=RK.gradeBet({p,push:pr.push,o,u,conf:"High",fresh:"live",validated:!!(C&&C.n>=1000)}),gn=RK.gradeBet({p,push:pr.push,o,u,conf:"High",fresh:"live",validated:!!(C&&C.n>=1000),cuts:NBA_TIERS});
      if(gb.ev<-.08)continue;rowsS.push({W,d:r.d,ath:r.ath,st:r.st,side,o,p,ev:gb.ev,evLo:gb.evLo,old:gb.g,neu:gn.g,thin:!(C&&C.n>=300),won:side==="o"?(r.actual>r.lOpen?1:0):(r.actual<r.lOpen?1:0)})}});
  /* same correlation rule as the app: one S/A per player per night */
  const byP={};rowsS.forEach(x=>{if(x.thin&&["S","A"].includes(x.neu))x.neu="B";if(["S","A"].includes(x.neu))(byP[x.d+x.ath]=byP[x.d+x.ath]||[]).push(x)});Object.values(byP).forEach(a=>a.sort((x,y)=>y.evLo-x.evLo).slice(1).forEach(x=>x.neu="B"));
  const tiers=k=>Object.fromEntries(["beforeTest","validation","test"].map(P=>[P,Object.fromEntries(["S","A","B","C","D","F"].map(g=>[g,rec(rowsS.filter(x=>x[k]===g&&(P==="beforeTest"?x.W<TEST:P==="validation"?x.W===VALID:x.W===TEST)))]))]));
  return{note:"DraftKings opening price on props whose line or price later moved, priced from the later DraftKings price, settled at the old number",n:rowsS.length,oldCuts:tiers("old"),newCuts:tiers("neu")}})();

/* ================= live record: server-side pregame predictions, graded once games are final ================= */
const live=(()=>{const dir="data/nba/predictions";if(!fs.existsSync(dir))return{days:0,note:"No server-side predictions saved yet (started Nov 23 2026)."};
  const hist=JSON.parse(fs.readFileSync("data/props-history.json","utf8")).games;const res={};
  Object.values(hist).forEach(g=>{const pl={};g.pl.forEach(r=>pl[r[0]]=r);(g.pr||[]).forEach(p=>{const k=p[0]+"|"+p[1];res[g.d+"|"+k]={pl:pl[p[0]],l:p[2],o:p[3],u:p[4]}})});
  const COMPI={"Points":[6],"Rebounds":[7],"Assists":[8],"3-Pointers":[9],"Steals":[10],"Blocks":[11],"Pts+Reb+Ast":[6,7,8],"Pts+Reb":[6,7],"Pts+Ast":[6,8],"Reb+Ast":[7,8]};
  const all=[];fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort().forEach(f=>{const P=JSON.parse(fs.readFileSync(dir+"/"+f,"utf8"));
    Object.values(P.games||{}).forEach(G=>["first","last"].forEach(when=>{const rec0=G[when];if(!rec0)return;rec0.props.forEach(x=>{const R=res[P.date+"|"+x.ath+"|"+x.st];
      if(!R||!R.pl||!R.pl[3]||!COMPI[x.st])return;const a=COMPI[x.st].reduce((s,i)=>s+(R.pl[i]||0),0);if(a===x.l)return;const won=x.side==="o"?a>x.l:a<x.l;
      const clv=R.o!=null&&R.u!=null&&R.l===x.l?RK.ev(x.side==="o"?devig(R.o,R.u)[0]:devig(R.o,R.u)[1],x.price):null;all.push({...x,when,d:P.date,won:won?1:0,p:x.pSide,o:x.price,clv,actual:a})})}))});
  const part=L=>({graded:L.length,byTier:Object.fromEntries(["S","A","B","C","D","F"].map(g=>[g,rec(L.filter(x=>x.grade===g))])),bySide:by(L,x=>x.side==="o"?"Over":"Under"),byStat:by(L,x=>x.st)});
  return{days:new Set(all.map(x=>x.d)).size,note:"Every saved pregame prediction at the DraftKings price available then, graded on the final box score; CLV against DraftKings' closing price at the same line.",
    first:part(all.filter(x=>x.when==="first")),last:part(all.filter(x=>x.when==="last"))}})();

const final=moveFor(99);
const out={updated:new Date().toISOString(),method:"walk-forward by week; validation and untouched test periods",periods:{validation:span(VALID),test:span(TEST),dataFrom:span(weeks[0])[0]},
  lines:base.length,openingLines:OPEN.length,
  historicalPicks:{note:"Reconstructed by replaying the pre-audit model and grade rules on DraftKings' real prices. The picks the app actually logged live on the user's phone (Tracker > Sharpline's record) and in their account, which this script cannot read.",
    open:{patterns:patterns(logOpen),picks:logOpen},close:{patterns:patterns(logClose),picks:logClose}},
  factors,oversByStat,projectionError:projErr,report,priceShopping:shop,liveRecord:live,tierCutsSetOn:{period:"weeks before validation",byTier:tierFit},tierRule:TIER,
  moveModel:{features:MV,lambda:MOVE_LAMBDA,intercept:"none",weights:final.w,sdResidual:+final.sdRes.toFixed(4),r2:+final.r2.toFixed(3),n:final.n,
    byWeek:moveWeeks.map(W=>{const M=moveFor(W),te=OPEN.filter(r=>wk(r.d)===W),Y=te.map(r=>lg(clp(r.pClose))-lg(clp(r.pm))),P=te.map(r=>M.f(r)),my=Y.reduce((a,b)=>a+b,0)/Y.length;
      return{week:span(W),n:te.length,r2:r3(1-Y.reduce((s,y,i)=>s+(y-P[i])**2,0)/Y.reduce((s,y)=>s+(y-my)**2,0)),fitOn:M.n}})}};
fs.mkdirSync("data/nba",{recursive:true});fs.writeFileSync("data/nba/review.json",JSON.stringify(out,null,1));
/* compact console report */
const show=(snap,pn)=>{const R=report[snap][pn];console.log(`\n== ${snap.toUpperCase()} prices, ${pn} ${JSON.stringify(periods[pn]===VALID?span(VALID):span(TEST))}`);
  MODELS.forEach(m=>{const x=R[m];if(!x){console.log(m,"(not scored)");return}const p=x.prob;console.log(`${m.padEnd(10)} logloss ${p.logLoss} (DK ${p.logLossMarket}) brier ${p.brier} (DK ${p.brierMarket})`+(x.picks?` | picks ${x.picks.n} won ${x.picks.won}% roi ${x.picks.roi}% clv ${x.picks.clv}% | O ${x.picks.over.n}/U ${x.picks.under.n}`:""));
    if(x.byTier&&m!=="baseline")console.log("   tiers:",Object.entries(x.byTier).map(([g,v])=>`${g} ${v.n}${v.n?` ${v.won}%/${v.roi}%${v.clv!=null?"/clv "+v.clv:""}`:""}`).join(" · "))})};
for(const snap of["open","close"])for(const pn of["validation","test"])show(snap,pn);
console.log("\ntier cut points set on (before validation, corrected, open):",JSON.stringify(tierFit));
console.log("\nhistorical picks (open):",JSON.stringify(out.historicalPicks.open.patterns,null,0).slice(0,3000));
console.log("\nmove model:",JSON.stringify(out.moveModel));
console.log("\nprice-shopping tiers OLD cuts:",JSON.stringify(shop.oldCuts));console.log("\nprice-shopping tiers NEW cuts:",JSON.stringify(shop.newCuts));console.log("\nlive record:",JSON.stringify(live).slice(0,600));
