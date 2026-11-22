// Grade backtest for Sharpline's NBA props (Nov 22 2026). Run: node scripts/props-model/grades.mjs
// Strict chronology: each week is priced by a model, a per-stat k and a market-calibration table built only from earlier weeks.
// The first scored week is the validation period, the last is the untouched test period. Grade thresholds are fixed in
// rank.js (gradeBet) and were not tuned on either. Every market is priced on both sides; the side shown is the one with the
// higher EV at DraftKings' price. Picks are graded at the closing price and, separately, at the opening price, where
// closing-line value (CLV) is measured against DraftKings' closing no-vig price. Writes data/nba/grades.json.
import fs from "node:fs";import {createRequire} from "node:module";import {buildRows} from "./rows.mjs";import {devig,sdFor} from "./lib.mjs";
const require=createRequire(import.meta.url);const RK=require("../../rank.js");
const {rows}=buildRows("data/props-history.json");
const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),cl=(v,a)=>Math.max(-a,Math.min(a,v)),pct=v=>v==null||!isFinite(v)?null:+(100*v).toFixed(1);
const F={mkt:r=>lg(Math.min(.97,Math.max(.03,r.pm))),gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),
  hot:r=>(r.hitRate10??.5)-.5,bench:r=>r.min<24?1:0,miss:r=>Math.min(3,r.miss),minTr:r=>cl(r.min3/r.min-1,.5),b2b:r=>r.b2b?1:0,
  combo:r=>/\+/.test(r.st)?1:0,count:r=>/3-Pointers|Steals|Blocks/.test(r.st)?1:0};
const OLDN=Object.keys(F),NEW=["gapS","gap10","hot","bench","minTr","b2b"];
const base=rows.filter(r=>r.gp>=3&&r.s!=null);
const wk=d=>Math.floor((Date.parse(d+"T12:00:00Z")-Date.parse("2026-10-19T12:00:00Z"))/(7*864e5));
const weeks=[...new Set(base.map(r=>wk(r.d)))].sort((a,b)=>a-b),trainable=weeks.filter(W=>base.filter(r=>wk(r.d)<W).length>=4000);
const scored=trainable.filter(W=>trainable.some(V=>V<W));const VALID=scored[0],TEST=scored[scored.length-1];
const memo={};
function fit(W,old){const key=W+":"+old;if(memo[key])return memo[key];const tr=base.filter(r=>wk(r.d)<W);let xr,n;
  if(old){n=OLDN.length;xr=r=>[1,...OLDN.map(k=>F[k](r))]}
  else{const A={},mu={};tr.forEach(r=>{const a=A[r.st]=A[r.st]||{n:0};a.n++;NEW.forEach(k=>a[k]=(a[k]||0)+F[k](r))});for(const st in A){mu[st]={};NEW.forEach(k=>mu[st][k]=A[st][k]/A[st].n)}
    n=NEW.length+1;xr=r=>[1,F.mkt(r),...NEW.map(k=>F[k](r)-((mu[r.st]||{})[k]||0))]}
  const X=tr.map(xr),y=tr.map(r=>r.over);let w=new Array(n+1).fill(0);w[1]=1;
  for(let it=0;it<500;it++){const g=new Array(w.length).fill(0);X.forEach((x,i)=>{const p=sg(x.reduce((a,v,j)=>a+v*w[j],0));x.forEach((v,j)=>g[j]+=(p-y[i])*v)});
    w=w.map((v,j)=>old?v-.5*(g[j]/X.length+(j>1?2*v/X.length:0)):j<2?v:v-.5*(g[j]/X.length+2*v/X.length))}
  const f=r=>sg(xr(r).reduce((a,v,j)=>a+v*w[j],0));return memo[key]=f}
function kFor(W,old){const A={};trainable.filter(V=>V<W).forEach(V=>{const f=fit(V,old);base.filter(r=>wk(r.d)===V).forEach(r=>{const d=f(r)-r.pm,B=A[r.st]=A[r.st]||[0,0];B[0]+=d*(r.over-r.pm);B[1]+=d*d})});
  return st=>old?(A[st]?Math.max(.3,Math.min(1,.5*A[st][0]/A[st][1]+.4)):.8):(A[st]?Math.max(0,Math.min(1,A[st][0]/(A[st][1]+.5))):0)}
/* market calibration from earlier weeks only (same as model.json mktCal) */
function calFor(W){const C={};const tr=base.filter(r=>wk(r.d)<W);[...new Set(tr.map(r=>r.st))].forEach(st=>{const a=tr.filter(r=>r.st===st),n=a.length,gap=a.reduce((s,r)=>s+r.over-r.pm,0)/n;
  C[st]={n,overGap:gap,underGap:-gap,se:Math.sqrt(a.reduce((s,r)=>s+r.pm*(1-r.pm),0))/n,validated:n>=1000}});return C}
/* old grade: EV scale S 8% A 4% B 2% C -1.5% D -4%, one step down for Steals/Blocks, S only for the top 3 of a night */
const oldGrade=(ev,st)=>{let g=ev>=.08?5:ev>=.04?4:ev>=.02?3:ev>=-.015?2:ev>=-.04?1:0;if(/Steals|Blocks/.test(st))g--;return RK.GRADE_ORDER[Math.max(0,g)]};
function price(rule,snap){const out=[];scored.forEach(W=>{const f=fit(W,rule==="before"),k=kFor(W,rule==="before"),C=calFor(W);
  base.filter(r=>wk(r.d)===W).forEach(r0=>{let r=r0;if(snap==="open"){if(r0.oOpen==null||r0.uOpen==null||r0.lOpen==null||r0.lOpen!==r0.l)return;r={...r0,o:r0.oOpen,u:r0.uOpen,pm:devig(r0.oOpen,r0.uOpen)[0]}}
    const raw=f(r),p=r.pm+k(r.st)*(raw-r.pm),eo=RK.ev(p,r.o),eu=RK.ev(1-p,r.u),side=eo>=eu?"o":"u",ps=side==="o"?p:1-p,o=side==="o"?r.o:r.u,pmS=side==="o"?r.pm:1-r.pm;
    let grade;if(rule==="before")grade=oldGrade(Math.max(eo,eu),r.st);
    else{const c=C[r.st],u=(c?Math.max(0,-(side==="o"?c.overGap:c.underGap))+1.28*c.se:.03)+.5*Math.abs(ps-pmS);
      grade=RK.gradeBet({p:ps,o,u,conf:"High",fresh:"live",validated:!!(c&&c.validated)}).g}
    const won=side==="o"?r0.over:1-r0.over,closeS=side==="o"?r0.pm:1-r0.pm;
    out.push({W,d:r.d,gid:r.gid,ath:r.ath,name:r.name,st:r.st,side,o,p:ps,pm:pmS,ev:Math.max(eo,eu),grade,won,diff:(side==="o"?1:-1)*(r.s-r.l)/sdFor(r.st,r.l),
      clv:snap==="open"?RK.ev(closeS,o):null})})});
  /* old S rule: only the 3 biggest EVs of a night keep S */
  if(rule==="before"){const byD={};out.filter(x=>x.grade==="S").forEach(x=>(byD[x.d]=byD[x.d]||[]).push(x));Object.values(byD).forEach(a=>a.sort((x,y)=>y.ev-x.ev).slice(3).forEach(x=>x.grade="A"))}
  return out}
const rec=a=>({n:a.length,won:a.length?pct(a.filter(x=>x.won).length/a.length):null,predicted:a.length?pct(a.reduce((s,x)=>s+x.p,0)/a.length):null,
  roi:a.length?pct(a.reduce((s,x)=>s+(x.won?RK.dec(x.o)-1:-1),0)/a.length):null,clv:a.some(x=>x.clv!=null)?pct(a.reduce((s,x)=>s+(x.clv||0),0)/a.length):null});
const group=(a,f)=>{const m={};a.forEach(x=>{const k=f(x);(m[k]=m[k]||[]).push(x)});return Object.fromEntries(Object.entries(m).map(([k,v])=>[k,rec(v)]))};
const REC=["S","A","B"];
function summary(L){const picks=L.filter(x=>REC.includes(x.grade)),pos=L.filter(x=>x.ev>0);const share=a=>a.length?{over:pct(a.filter(x=>x.side==="o").length/a.length),under:pct(a.filter(x=>x.side==="u").length/a.length),n:a.length}:{n:0};
  const ll=a=>a.reduce((s,x)=>s-(x.won?Math.log(x.p):Math.log(1-x.p)),0)/a.length,llm=a=>a.reduce((s,x)=>s-(x.won?Math.log(x.pm):Math.log(1-x.pm)),0)/a.length;
  const br=a=>a.reduce((s,x)=>s+(x.p-x.won)**2,0)/a.length,brm=a=>a.reduce((s,x)=>s+(x.pm-x.won)**2,0)/a.length;
  const perPlayer=Object.values(picks.reduce((m,x)=>{const k=x.d+x.ath;(m[k]=m[k]||[]).push(x);return m},{}));
  return{markets:L.length,sides:{allMarkets:share(L),positiveEV:share(pos),recommended:share(picks)},
    gradeCounts:Object.fromEntries(RK.GRADE_ORDER.slice().reverse().map(g=>[g,L.filter(x=>x.grade===g).length])),
    byGrade:Object.fromEntries(RK.GRADE_ORDER.slice().reverse().map(g=>[g,rec(L.filter(x=>x.grade===g))])),
    recommended:rec(picks),byStat:group(picks,x=>x.st),bySide:group(picks,x=>x.side==="o"?"Over":"Under"),
    byOdds:group(picks,x=>x.o<=-150?"-150 or shorter":x.o<-110?"-149 to -111":x.o<=100?"-110 to +100":"+101 and longer"),
    byProjectionGap:group(L,x=>x.diff>.5?"average well past the line (his side)":x.diff>0?"average slightly past":x.diff>-.5?"average slightly short":"average well short"),
    byPeriod:{validation:rec(picks.filter(x=>x.W===VALID)),test:rec(picks.filter(x=>x.W===TEST))},
    concentration:{slatePlayersWith2Plus:perPlayer.filter(a=>a.length>=2).length,maxOnePlayer:Math.max(0,...perPlayer.map(a=>a.length))},
    vsMarket:{brier:+br(L).toFixed(4),brierMarket:+brm(L).toFixed(4),logLoss:+ll(L).toFixed(4),logLossMarket:+llm(L).toFixed(4)}}}
/* Price-shopping test. The free feed has only DraftKings, so another book's price is simulated by a real stale price: DraftKings'
   own opening line and odds, on props where DraftKings later moved the line. Sharpline prices that old number from DraftKings'
   current (closing) line with the stat's distribution, exactly as the app does when you enter another book's line, grades it,
   and the bet is settled on the real result at the old line. Assumes the stale price can still be bet, as at a slower book. */
function shopping(){const out=[];const C0=calFor(99);base.forEach(r=>{if(r.lOpen==null||r.oOpen==null||r.uOpen==null||r.lOpen===r.l||r.actual===r.lOpen)return;
  const W=wk(r.d),C=calFor(W)[r.st]||C0[r.st],pr=RK.probsAt(r.st,r.l,r.pm,r.lOpen);
  for(const side of["o","u"]){const p=side==="o"?pr.over:pr.under,o=side==="o"?r.oOpen:r.uOpen;
    const u=(C?Math.max(0,-(side==="o"?C.overGap:C.underGap))+1.28*C.se:.03)+.02*Math.abs(r.l-r.lOpen)/RK.sdFit(r.st,r.l);
    const gb=RK.gradeBet({p,push:pr.push,o,u,conf:"High",fresh:"live",validated:!!(C&&C.validated)});
    if(/3-Pointers|Steals|Blocks/.test(r.st)&&["S","A"].includes(gb.g))gb.g="B"; /* same cap as the app: unproven off the posted line */
    if(gb.ev<=0)continue;out.push({W,d:r.d,ath:r.ath,st:r.st,side,o,p,pm:p,grade:gb.g,ev:gb.ev,won:side==="o"?(r.actual>r.lOpen?1:0):(r.actual<r.lOpen?1:0)})}});
  const per=f=>Object.fromEntries(["S","A","B","C","D"].map(g=>[g,rec(out.filter(x=>x.grade===g&&f(x)))]));
  return{note:"DraftKings opening price on props whose line later moved, priced from the later line",n:out.length,
    fitPeriod:per(x=>x.d<"2026-11-09"),validation:per(x=>x.W===VALID),test:per(x=>x.W===TEST),all:per(()=>true),
    recommendedSides:(a=>({over:pct(a.filter(x=>x.side==="o").length/a.length),under:pct(a.filter(x=>x.side==="u").length/a.length),n:a.length}))(out.filter(x=>REC.includes(x.grade))),
    recommendedByStat:group(out.filter(x=>REC.includes(x.grade)),x=>x.st)}}
const dates=W=>{const a=base.filter(r=>wk(r.d)===W).map(r=>r.d).sort();return[a[0],a.at(-1)]};
const out={updated:new Date().toISOString(),validation:dates(VALID),test:dates(TEST),trainingFrom:base.map(r=>r.d).sort()[0],
  before:{close:summary(price("before","close")),open:summary(price("before","open"))},after:{close:summary(price("after","close")),open:summary(price("after","open"))},shopping:shopping()};
fs.mkdirSync("data/nba",{recursive:true});fs.writeFileSync("data/nba/grades.json",JSON.stringify(out,null,1));
const brief=s=>({markets:s.markets,sides:s.sides,grades:s.gradeCounts,rec:s.recommended,periods:s.byPeriod,vs:s.vsMarket,conc:s.concentration});
console.log(JSON.stringify({validation:out.validation,test:out.test,beforeClose:brief(out.before.close),afterClose:brief(out.after.close),beforeOpen:brief(out.before.open),afterOpen:brief(out.after.open)},null,1));
console.log("before byGrade close",JSON.stringify(out.before.close.byGrade));console.log("after byGrade close",JSON.stringify(out.after.close.byGrade));
console.log("after byGrade open",JSON.stringify(out.after.open.byGrade));console.log("shopping",JSON.stringify({test:out.shopping.test,validation:out.shopping.validation,sides:out.shopping.recommendedSides}));console.log("proj gap",JSON.stringify(out.after.close.byProjectionGap));
