// Sharpline NBA corrected prop model (Nov 23 2026): anticipate where DraftKings' price is heading.
// Shared by fit.mjs (writes model.json "move"), review.mjs (backtest) and predict.mjs (server-side pregame predictions).
// The app (index.html propModel) runs the same formula with the weights from model.json.
//
// Evidence (scripts/props-model/review.mjs, data/nba/review.json): DraftKings' opening NBA prop lines are slow to absorb a
// player's season and recent averages (and teammates out, not used: see MV). By tip the price has moved toward them, in every
// period this season (t 9 to 17). Out of sample the realized move was 0.8 to 1.5 times the predicted one. The same
// information does NOT beat the closing price (its effect on results flips sign week to week), so the model only predicts
// the part of the move still to come, and that part fades to nothing by tip.
import {sdFor,devig} from "./lib.mjs";
/* "miss" (regular teammates out) predicted the move too, but it is never negative, so with no intercept it acted as a level:
   it pushed ~75-80% of props toward the Over while DraftKings moved toward the Over only 46-48% of the time. It also can't be
   counted the same way live (the app sees the injury report; training saw box-score DNPs), so it is not used. */
export const MV=["gapS","gap10","gap5"];
const cl=(v,a)=>Math.max(-a,Math.min(a,v));
export const FM={gapS:r=>cl((r.s-r.l)/sdFor(r.st,r.l),2),gap10:r=>cl((r.s10-r.l)/sdFor(r.st,r.l),2),gap5:r=>cl((r.s5-r.l)/sdFor(r.st,r.l),2),miss:r=>Math.min(3,r.miss||0)};
export const MOVE_LAMBDA=200;
export const lg=p=>Math.log(p/(1-p)),sg=z=>1/(1+Math.exp(-z)),clp=p=>Math.min(.97,Math.max(.03,p));
/* Ridge least squares of the move in log-odds (closing chance at the opening line minus opening chance) on the features,
   with NO intercept: a constant would push every prop the same way, which is what produced the old all-Under board. */
export function fitMove(train){const X=train.map(r=>MV.map(k=>FM[k](r))),Y=train.map(r=>lg(clp(r.pClose))-lg(clp(r.pm)));
  const n=MV.length,A=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?MOVE_LAMBDA:0)),b=new Array(n).fill(0);
  X.forEach((x,t)=>{for(let i=0;i<n;i++){b[i]+=x[i]*Y[t];for(let j=0;j<n;j++)A[i][j]+=x[i]*x[j]}});
  for(let i=0;i<n;i++)for(let r=0;r<n;r++){if(r===i)continue;const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}
  const w=b.map((v,i)=>v/A[i][i]),res=Y.map((y,t)=>y-X[t].reduce((s,v,j)=>s+v*w[j],0)),my=Y.reduce((a,c)=>a+c,0)/Math.max(1,Y.length);
  return{w:Object.fromEntries(MV.map((k,i)=>[k,+w[i].toFixed(4)])),sdRes:Math.sqrt(res.reduce((s,v)=>s+v*v,0)/Math.max(1,res.length)),
    r2:1-res.reduce((s,v)=>s+v*v,0)/Math.max(1e-9,Y.reduce((s,v)=>s+(v-my)**2,0)),n:train.length,f:r=>MV.reduce((s,k,i)=>s+FM[k](r)*w[i],0)}}
/* the share of the predicted move still to come: all of it 8+ hours before tip, none at tip */
export const timeLeft=hoursToTip=>Math.max(0,Math.min(1,hoursToTip/8));
/* the remaining move given what DraftKings has already done since it opened (both in log-odds at the current line):
   same direction -> only what is left; DraftKings moved the other way -> trust the market (0) */
export function remaining(pred,obs){if(!pred)return 0;if(!obs)return pred;if(Math.sign(obs)!==Math.sign(pred))return 0;return Math.sign(pred)*Math.max(0,Math.abs(pred)-Math.abs(obs))}
/* opening view of a history row: the prop at DraftKings' opening line and prices, plus where the closing price puts that line */
export function openOf(r,RK){if(r.lOpen==null||r.oOpen==null||r.uOpen==null||r.actual===r.lOpen)return null;
  let pClose=r.pm;if(r.l!==r.lOpen){const pr=RK.probsAt(r.st,r.l,r.pm,r.lOpen);pClose=pr.over/(1-(pr.push||0))}
  return{...r,l:r.lOpen,o:r.oOpen,u:r.uOpen,pm:devig(r.oOpen,r.uOpen)[0],over:r.actual>r.lOpen?1:0,open:1,pClose,hitRate10:r.lOpen===r.l?r.hitRate10:null}}
/* NBA tier cut points on conservative expected return (evLo), set on the weeks before the untouched test week */
export const NBA_TIERS={S:.10,A:.05,B:.01,C:-.01,D:-.05};
