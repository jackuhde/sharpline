// Fits Sharpline's pregame prop model on every graded DraftKings line this season and writes model.json for the app.
// Model: logistic regression starting from DraftKings' no-vig Over chance, adjusted by the player's own numbers.
// Each prop is used twice, at its opening and at its closing line and prices. Honesty check: the model is also scored each
// week by a model fit only on earlier weeks (walk-forward), and those out-of-sample results are written next to the weights.
import fs from "node:fs";import {buildRows} from "./rows.mjs";import {dec,evOf,sdFor,devig} from "./lib.mjs";
const IN=process.argv[2]||"data/props-history.json",OUT=process.argv[3]||"model.json";
const {rows,games}=buildRows(IN);
const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),cl=(v,a)=>Math.max(-a,Math.min(a,v));
const F={mkt:r=>lg(Math.min(.97,Math.max(.03,r.pm))),gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),
  hot:r=>(r.hitRate10??.5)-.5,bench:r=>r.min<24?1:0,miss:r=>Math.min(3,r.miss),minTr:r=>cl(r.min3/r.min-1,.5),b2b:r=>r.b2b?1:0};
const names=Object.keys(F),base=rows.filter(r=>r.gp>=3&&r.s!=null);
const open=r=>{if(r.lOpen==null||r.oOpen==null||r.uOpen==null||r.actual===r.lOpen)return null;
  return{...r,l:r.lOpen,o:r.oOpen,u:r.uOpen,pm:devig(r.oOpen,r.uOpen)[0],over:r.actual>r.lOpen?1:0,hitRate10:r.lOpen===r.l?r.hitRate10:null,snap:"open"}};
const S=[...base,...base.map(open).filter(Boolean)];
/* No level terms. The model starts exactly at DraftKings' no-vig chance (fixed weight 1, no intercept) and every player feature is
   centered on its average for that stat in the training data, so the features can only say "this player, tonight, compared with
   the typical prop of this stat". Nothing in the model can move all props of a stat, or all props, toward one side.
   Why (audit Nov 22 2026): a season intercept, and after it was removed the combo and count flags and the uncentered averages,
   kept pushing 97% of moved markets toward the Under. Fit on earlier weeks those pushes were 2 to 3 times larger than what
   happened, and with the level taken out the remaining player information did not beat DraftKings' price out of sample. */
function fit(train,iters=500){const mu={},A={};train.forEach(r=>{const a=A[r.st]=A[r.st]||{n:0};a.n++;names.forEach(n=>{if(n!=="mkt")a[n]=(a[n]||0)+F[n](r)})});
  for(const st in A){mu[st]={};names.forEach(n=>{if(n!=="mkt")mu[st][n]=+(A[st][n]/A[st].n).toFixed(4)})}
  const xr=r=>[1,...names.map(n=>n==="mkt"?F.mkt(r):F[n](r)-((mu[r.st]||{})[n]||0))];
  const X=train.map(xr),y=train.map(r=>r.over);let w=new Array(names.length+1).fill(0);w[1]=1;
  for(let it=0;it<iters;it++){const g=new Array(w.length).fill(0);X.forEach((x,i)=>{const p=sg(x.reduce((a,v,j)=>a+v*w[j],0));x.forEach((v,j)=>g[j]+=(p-y[i])*v)});w=w.map((v,j)=>j<2?v:v-.5*(g[j]/X.length+2*v/X.length))}
  w.mu=mu;w.xr=xr;return w}
const pred=(w,r)=>sg(w.xr(r).reduce((a,v,j)=>a+v*w[j],0));
function bets(list,f,thr){let n=0,pl=0,win=0;list.forEach(r=>{const p=f(r),eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";if(Math.max(eo,eu)<thr)return;const W=side==="o"?r.over:1-r.over;n++;win+=W;pl+=W?dec(side==="o"?r.o:r.u)-1:-1});
  return{n,hit:n?+(win/n).toFixed(3):null,roi:n?+(pl/n).toFixed(3):null}}
const dates=[...new Set(S.map(r=>r.d))].sort(),mid=dates[Math.floor(dates.length/2)];
/* Honesty test, walk-forward by week: every week is scored by a model fit only on the weeks before it (no future games, no
   later prices). Weeks need at least 4,000 earlier lines to train on. This replaced a half-season split in Nov 2026: scoring
   the first half with a model fit on the second half let late-season information leak backward and made the model look
   better than it was. */
const wk=d=>Math.floor((Date.parse(d+"T12:00:00Z")-Date.parse("2026-10-19T12:00:00Z"))/(7*864e5));
const weeks=[...new Set(base.map(r=>wk(r.d)))].sort((x,y)=>x-y).filter(W=>S.filter(r=>wk(r.d)<W).length>=4000);
const acc={},oos=[];
const test=weeks.map(W=>{const w=fit(S.filter(r=>wk(r.d)<W)),te=base.filter(r=>wk(r.d)===W);
  te.forEach(r=>{const p=pred(w,r),A=acc[r.st]=acc[r.st]||{num:0,den:0,n:0,win:0,pl:0};const d=p-r.pm;A.num+=d*(r.over-r.pm);A.den+=d*d;
    oos.push({st:r.st,d:r.d,ath:r.ath,y:r.over,p,pm:r.pm,o:r.o,u:r.u,wk:W});
    const eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";if(Math.max(eo,eu)>=.02){const Wn=side==="o"?r.over:1-r.over;A.n++;A.win+=Wn;A.pl+=Wn?dec(side==="o"?r.o:r.u)-1:-1}});
  return{split:"week of "+te.map(r=>r.d).sort()[0]+", fit on earlier weeks only",lines:te.length,ev2:bets(te,r=>pred(w,r),.02),ev4:bets(te,r=>pred(w,r),.04)}});
/* k per stat: the share of the model's move away from DraftKings' price that showed up in later results (least squares of
   result minus market on model minus market). It is shrunk toward 0, the market, with a prior worth 0.5 units of that sum
   of squares, and kept between 0 and 1. There is no floor: a stat whose moves did not hold up out of sample is priced at
   DraftKings' no-vig chance. Before Nov 22 2026 k had a 0.3 floor and was pulled toward 0.8, which forced the model's
   Under lean through even on stats where it lost (3-Pointers raw k -1.8, Assists -0.4, Blocks -1.2). */
const catK={},catRec={};Object.entries(acc).forEach(([st,A])=>{const raw=A.den?A.num/A.den:0;catK[st]=+Math.max(0,Math.min(1,A.num/(A.den+.5))).toFixed(3);
  catRec[st]={n:A.n,hit:A.n?+(A.win/A.n).toFixed(3):null,roi:A.n?+(A.pl/A.n).toFixed(3):null,raw:+raw.toFixed(3)}});
oos.forEach(r=>{r.pr=r.p;r.p=r.pm+(catK[r.st]||0)*(r.p-r.pm)});
/* the old app model for comparison: every pick it rated 3%+ EV at the closing price */
/* calibration and accuracy, out of sample at closing prices: Brier score and log loss for the model and for DraftKings'
   no-vig price, by stat; the model's chance for the side it prefers against how often that side won; realized ROI by EV band */
const ll=(y,p)=>{p=Math.min(.999,Math.max(.001,p));return-(y?Math.log(p):Math.log(1-p))};
const score=list=>({n:list.length,brier:+(list.reduce((a,r)=>a+(r.p-r.y)**2,0)/list.length).toFixed(4),brierMkt:+(list.reduce((a,r)=>a+(r.pm-r.y)**2,0)/list.length).toFixed(4),
  logloss:+(list.reduce((a,r)=>a+ll(r.y,r.p),0)/list.length).toFixed(4),loglossMkt:+(list.reduce((a,r)=>a+ll(r.y,r.pm),0)/list.length).toFixed(4)});
const calib={all:score(oos),byStat:{},bins:[],evBands:[]};
[...new Set(oos.map(r=>r.st))].forEach(st=>calib.byStat[st]=score(oos.filter(r=>r.st===st)));
const sided=oos.map(r=>{const eo=evOf(r.p,r.o),eu=evOf(1-r.p,r.u),o=eo>=eu;return{p:o?r.p:1-r.p,y:o?r.y:1-r.y,ev:Math.max(eo,eu),price:o?r.o:r.u}});
[[.45,.5],[.5,.52],[.52,.54],[.54,.56],[.56,.58],[.58,.6],[.6,.65],[.65,1]].forEach(([lo,hi])=>{const x=sided.filter(r=>r.p>=lo&&r.p<hi);if(x.length)calib.bins.push({lo,hi,n:x.length,pred:+(x.reduce((a,r)=>a+r.p,0)/x.length).toFixed(4),act:+(x.reduce((a,r)=>a+r.y,0)/x.length).toFixed(4)})});
[[-1,0],[0,.02],[.02,.04],[.04,.06],[.06,1]].forEach(([lo,hi])=>{const x=sided.filter(r=>r.ev>=lo&&r.ev<hi);if(x.length)calib.evBands.push({lo,hi,n:x.length,expRoi:+(x.reduce((a,r)=>a+r.ev,0)/x.length).toFixed(4),roi:+(x.reduce((a,r)=>a+(r.y?dec(r.price)-1:-1),0)/x.length).toFixed(4)})});
/* bias monitor (flags only, changes nothing): how often Overs won against how often DraftKings priced them, by week; and the
   side split of out-of-sample picks before (raw model) and after the per-stat k, with their results */
function biasOf(L){const side=(f)=>{const o={n:0,w:0,pl:0},u={n:0,w:0,pl:0};L.forEach(r=>{const p=f(r),eo=evOf(p,r.o),eu=evOf(1-p,r.u),s=eo>=eu?o:u;if(Math.max(eo,eu)<.02)return;
    const Wn=s===o?r.y:1-r.y;s.n++;s.w+=Wn;s.pl+=Wn?dec(s===o?r.o:r.u)-1:-1});const f2=x=>({n:x.n,hit:x.n?+(x.w/x.n).toFixed(3):null,roi:x.n?+(x.pl/x.n).toFixed(3):null});
    return{over:f2(o),under:f2(u),underShare:o.n+u.n?+(u.n/(o.n+u.n)).toFixed(3):null}};
  const byWeek=[...new Set(base.map(r=>wk(r.d)))].sort((a,b)=>a-b).map(W=>{const x=base.filter(r=>wk(r.d)===W);return{from:x.map(r=>r.d).sort()[0],n:x.length,overWon:+(x.filter(r=>r.over).length/x.length).toFixed(3),overPriced:+(x.reduce((a,r)=>a+r.pm,0)/x.length).toFixed(3)}});
  return{rawModel:side(r=>r.pr),afterK:side(r=>r.p),favorsOverRaw:+(L.filter(r=>r.pr>r.pm).length/L.length).toFixed(3),byWeek}}
const W=fit(S);
const out={updated:new Date().toISOString(),games:games.length,lines:base.length,through:dates.at(-1),split:mid,
  catK,catRec,calib,center:W.mu,weights:Object.fromEntries([["b0",+W[0].toFixed(4)],...names.map((n,j)=>[n,+W[j+1].toFixed(4)])]),test,
  bias:biasOf(oos),
  overs:{n:base.length,hit:+(base.filter(r=>r.over).length/base.length).toFixed(3),fair:+(base.reduce((a,r)=>a+r.pm,0)/base.length).toFixed(3)}};
fs.writeFileSync(OUT,JSON.stringify(out,null,1));console.log(JSON.stringify(out,null,1));
