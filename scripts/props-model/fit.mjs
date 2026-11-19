// Fits Sharpline's pregame prop model on every graded DraftKings line this season and writes model.json for the app.
// Model: logistic regression starting from DraftKings' no-vig Over chance, adjusted by the player's own numbers.
// Each prop is used twice, at its opening and at its closing line and prices. Honesty check: the model is also fit on one
// half of the season and scored on the other (both ways), and those out-of-sample results are written next to the weights.
import fs from "node:fs";import {buildRows} from "./rows.mjs";import {dec,evOf,sdFor,devig} from "./lib.mjs";
const IN=process.argv[2]||"data/props-history.json",OUT=process.argv[3]||"model.json";
const {rows,games}=buildRows(IN);
const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),cl=(v,a)=>Math.max(-a,Math.min(a,v));
const F={mkt:r=>lg(Math.min(.97,Math.max(.03,r.pm))),gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),
  hot:r=>(r.hitRate10??.5)-.5,bench:r=>r.min<24?1:0,miss:r=>Math.min(3,r.miss),minTr:r=>cl(r.min3/r.min-1,.5),b2b:r=>r.b2b?1:0,
  combo:r=>/\+/.test(r.st)?1:0,count:r=>/3-Pointers|Steals|Blocks/.test(r.st)?1:0};
const names=Object.keys(F),base=rows.filter(r=>r.gp>=3&&r.s!=null);
const open=r=>{if(r.lOpen==null||r.oOpen==null||r.uOpen==null||r.actual===r.lOpen)return null;
  return{...r,l:r.lOpen,o:r.oOpen,u:r.uOpen,pm:devig(r.oOpen,r.uOpen)[0],over:r.actual>r.lOpen?1:0,hitRate10:r.lOpen===r.l?r.hitRate10:null,snap:"open"}};
const S=[...base,...base.map(open).filter(Boolean)];
function fit(train,iters=500){const X=train.map(r=>[1,...names.map(n=>F[n](r))]),y=train.map(r=>r.over);let w=new Array(names.length+1).fill(0);w[1]=1;
  for(let it=0;it<iters;it++){const g=new Array(w.length).fill(0);X.forEach((x,i)=>{const p=sg(x.reduce((a,v,j)=>a+v*w[j],0));x.forEach((v,j)=>g[j]+=(p-y[i])*v)});w=w.map((v,j)=>v-.5*(g[j]/X.length+(j>1?2*v/X.length:0)))}return w}
const pred=(w,r)=>sg(w[0]+names.reduce((a,k,j)=>a+w[j+1]*F[k](r),0));
function bets(list,f,thr){let n=0,pl=0,win=0;list.forEach(r=>{const p=f(r),eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";if(Math.max(eo,eu)<thr)return;const W=side==="o"?r.over:1-r.over;n++;win+=W;pl+=W?dec(side==="o"?r.o:r.u)-1:-1});
  return{n,hit:n?+(win/n).toFixed(3):null,roi:n?+(pl/n).toFixed(3):null}}
const dates=[...new Set(S.map(r=>r.d))].sort(),mid=dates[Math.floor(dates.length/2)];
/* per prop category, out of sample: how much of the model's move away from DraftKings' price actually showed up in results (k),
   and how the model's 2%+ EV picks did. Both halves are scored by a model fit on the other half. */
const acc={};
const test=[[r=>r.d<mid,r=>r.d>=mid,"first half → second half"],[r=>r.d>=mid,r=>r.d<mid,"second half → first half"]].map(([a,b,lbl])=>{const w=fit(S.filter(a)),te=S.filter(b);
  te.filter(r=>!r.snap).forEach(r=>{const p=pred(w,r),A=acc[r.st]=acc[r.st]||{num:0,den:0,n:0,win:0,pl:0};const d=p-r.pm;A.num+=d*(r.over-r.pm);A.den+=d*d;
    const eo=evOf(p,r.o),eu=evOf(1-p,r.u),side=eo>=eu?"o":"u";if(Math.max(eo,eu)>=.02){const W=side==="o"?r.over:1-r.over;A.n++;A.win+=W;A.pl+=W?dec(side==="o"?r.o:r.u)-1:-1}});
  return{split:lbl,ev2:bets(te,r=>pred(w,r),.02),ev4:bets(te,r=>pred(w,r),.04)}});
/* k is pulled halfway toward 0.8 because one month per category is a small sample, and never above 1 (results never inflate an edge) */
const catK={},catRec={};Object.entries(acc).forEach(([st,A])=>{const raw=A.den?A.num/A.den:.8;catK[st]=+Math.max(.3,Math.min(1,.5*raw+.4)).toFixed(3);
  catRec[st]={n:A.n,hit:A.n?+(A.win/A.n).toFixed(3):null,roi:A.n?+(A.pl/A.n).toFixed(3):null,raw:+raw.toFixed(3)}});
/* the old app model for comparison: every pick it rated 3%+ EV at the closing price */
const W=fit(S);
const out={updated:new Date().toISOString(),games:games.length,lines:base.length,through:dates.at(-1),split:mid,
  catK,catRec,weights:Object.fromEntries([["b0",+W[0].toFixed(4)],...names.map((n,j)=>[n,+W[j+1].toFixed(4)])]),test,
  overs:{n:base.length,hit:+(base.filter(r=>r.over).length/base.length).toFixed(3),fair:+(base.reduce((a,r)=>a+r.pm,0)/base.length).toFixed(3)}};
fs.writeFileSync(OUT,JSON.stringify(out,null,1));console.log(JSON.stringify(out,null,1));
