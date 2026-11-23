/* Sharpline ranking math: odds conversion, EV, no-vig, milestone-line pricing and Top List selection.
   Pure functions only (no DOM, no network), shared by the app and tests/rank.test.js. */
(function(root){
"use strict";
/* American odds -> decimal payout per $1 staked (stake included). -110 -> 1.909, +150 -> 2.5 */
function dec(a){a=+a;if(!isFinite(a)||(a>-100&&a<100))return NaN;return a>0?1+a/100:1+100/Math.abs(a)}
/* chance the price charges, vig included */
function imp(a){return 1/dec(a)}
/* expected profit per $1 at American odds a when the bet wins with probability p (pushes not counted) */
function ev(p,a){return p*dec(a)-1}
/* decimal -> American, rounded to whole odds */
function toAm(d){d=+d;if(!(d>1))return NaN;return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1))}
/* probability -> fair American odds */
function fairAm(p){return toAm(1/p)}
/* remove the vig from a two-way market (power method: pa^k + pb^k = 1). Returns [pa, pb] */
function devig(a,b){const pa=imp(a),pb=imp(b);let lo=.5,hi=3,k=1;for(let i=0;i<60;i++){k=(lo+hi)/2;if(Math.pow(pa,k)+Math.pow(pb,k)>1)lo=k;else hi=k}return[Math.pow(pa,k),Math.pow(pb,k)]}
function erf(x){const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y}
const Phi=z=>.5*(1+erf(z/Math.SQRT2));
function invPhi(p){p=Math.min(.9999,Math.max(.0001,p));let lo=-8,hi=8;for(let i=0;i<70;i++){const m=(lo+hi)/2;if(Phi(m)<p)lo=m;else hi=m}return(lo+hi)/2}
function poisOver(lam,L){let k=Math.floor(L),c=0,t=Math.exp(-lam);for(let i=0;i<=k;i++){c+=t;t*=lam/(i+1)}return 1-c}
function poisMean(pO,L){let lo=.01,hi=60;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(poisOver(m,L)<pO)lo=m;else hi=m}return(lo+hi)/2}
const COUNT={"3-Pointers":1,"Steals":1,"Blocks":1,"Turnovers":1};
function sdFor(st,l){l=Math.max(.5,+l||0);switch(st){
  case"Points":return Math.max(3,.32*l+2.2);case"Rebounds":return Math.max(1.6,.35*l+1.2);case"Assists":return Math.max(1.3,.38*l+1);
  case"3-Pointers":case"Steals":case"Blocks":case"Turnovers":return 1.1*Math.sqrt(l)+.3;
  case"Pts+Reb+Ast":return .26*l+3.2;case"Pts+Reb":case"Pts+Ast":return .27*l+2.8;case"Reb+Ast":return .3*l+1.8;default:return Math.max(1,.3*l+1)}}
/* Milestone ("25+") lines: the model's chance of going over another line, from its chance at the main line.
   Count stats use a Poisson with the mean that matches the main line; the rest a normal whose spread follows the stat. */
function overAt(st,L0,p0,L){if(L===L0)return p0;
  if(COUNT[st]){const lam=poisMean(p0,L0);return poisOver(lam,L)}
  const sd=sdFor(st,L0),m=L0-sd*invPhi(1-p0);return 1-Phi((L-m)/sd)}
/* ---------- full price of one prop at any line (Nov 22 2026) ----------
   Spread of outcomes per stat, checked out of sample: the normal curve's spread was fit on games before Nov 9 and scored on
   later games (log score of the actual result). Where the fitted scale did better on the later games it is used; Points and
   Pts+Reb did not improve, so they keep 1.0. Count stats (3-Pointers, Steals, Blocks) use a Poisson.
   Combined stats (Pts+Reb+Ast...) are fit on the combined total itself, so the correlation between points, rebounds and
   assists is already in their spread; they are never built by adding independent parts. */
const SD_SCALE={"Rebounds":.84,"Assists":.86,"Pts+Reb+Ast":.86,"Pts+Ast":.9,"Reb+Ast":.8};
const sdFit=(st,l)=>sdFor(st,l)*(SD_SCALE[st]||1);
function poisPmf(lam,k){let t=Math.exp(-lam);for(let i=0;i<k;i++)t*=lam/(i+1);return t}
/* Over, Under and push chances at line L, given the no-vig Over chance p0 at line L0. They always add to 1.
   Whole-number lines get a push chance (landing exactly on L); Over means beating L, Under means falling short of it.
   Also returns the implied mean and an 80% range for the result. */
function probsAt(st,L0,p0,L){L=L==null?L0:L;const whole=Number.isInteger(L);let over,push=0,mean,lo,hi;
  if(COUNT[st]){const lam=poisMean(p0,L0);mean=lam;over=poisOver(lam,L);if(whole)push=poisPmf(lam,L);
    let c=0,k=0;while(c+poisPmf(lam,k)<.1){c+=poisPmf(lam,k);k++}lo=k;while(c+poisPmf(lam,k)<.9){c+=poisPmf(lam,k);k++}hi=k}
  else{const sd=sdFit(st,L0);mean=L0-sd*invPhi(1-p0);
    if(whole){over=1-Phi((L+.5-mean)/sd);push=Phi((L+.5-mean)/sd)-Phi((L-.5-mean)/sd)}else over=L===L0?p0:1-Phi((L-mean)/sd);
    lo=Math.max(0,mean-1.2816*sd);hi=mean+1.2816*sd}
  over=Math.min(.999,Math.max(.001,over));push=Math.max(0,Math.min(1-over,push));
  return{over,under:Math.max(0,1-over-push),push,mean,lo,hi}}
/* expected profit per $1 with a push chance: a push returns the stake */
function evPush(p,push,a){return p*(dec(a)-1)-(1-p-(push||0))}
/* the worst American price that still breaks even, given win chance p and push chance */
function fairPrice(p,push){if(!(p>0))return NaN;return toAm(1+(1-p-(push||0))/p)}
/* ---------- letter grades from the conservative edge (Nov 22 2026) ----------
   A grade is earned by the expected return at the LOW end of the win chance (p minus its uncertainty u), not by the
   projection's distance from the line or by the midpoint estimate alone:
     S  conservative EV >= 7%    A  >= 3.5%    B  >= 1%    C  >= -1%    D  >= -5%    F below, or data missing
   Gates, applied after: S needs High confidence, a current price, no injury question and a stat whose fair price is
   validated (1,000+ graded lines); A needs at least Medium confidence and a current price with no injury question;
   anything with an injury question or a price that needs verifying tops out at C; a stale price or missing data is F.
   There is no limit on how many A or S grades a slate can have. */
const GRADE_ORDER=["F","D","C","B","A","S"];
/* NBA prop tiers on conservative expected return (Nov 23 2026 review): S 10%+, A 5%+, B 1%+, C -1%+, D EV -5%+, F worse */
const NBA_TIERS={S:.10,A:.05,B:.01,C:-.01,D:-.05};
function gradeBet(b){if(!b||!(b.p>0)||!isFinite(dec(b.o)))return{g:"F",ev:null,evLo:null,why:["no usable price or chance"]};
  const push=b.push||0,u=Math.max(0,b.u||0),ev=evPush(b.p,push,b.o),pLo=Math.max(.001,b.p-u),evLo=evPush(pLo,push,b.o),why=[];
  /* cut points: the default scale (NFL and game lines), or b.cuts (NBA props: NBA_TIERS, validated in scripts/props-model/review.mjs) */
  const K=b.cuts||{S:.07,A:.035,B:.01,C:-.01,D:-.05};
  let g=evLo>=K.S?5:evLo>=K.A?4:evLo>=K.B?3:evLo>=K.C?2:ev>=K.D?1:0;
  const conf=b.conf||"Low",fresh=b.fresh||"live";
  if(b.missing){g=0;why.push("missing data")}
  if(fresh==="stale"||fresh==="started"){g=0;why.push(fresh==="started"?"game started":"price is stale")}
  if(g>=5&&!(conf==="High"&&fresh==="live"&&!b.inj&&b.validated)){g=4;why.push("S needs high confidence, a live price, no injury question and a validated stat")}
  if(g>=4&&!((conf==="High"||conf==="Medium")&&fresh!=="aging"&&!b.inj)){g=3;why.push("A needs medium or high confidence, a current price and no injury question")}
  if(g>=3&&(b.inj||fresh==="aging")){g=2;why.push(b.inj?"injury question":"price needs verifying")}
  return{g:GRADE_ORDER[g],ev,evLo,pLo,why}}
/* Top List selection. Q: qualifying candidates already sorted best first, each {base, ath (player key), gi (game), ev, conf}.
   opts: {max, perPlayer: "1" | "1x" | number, perGame, minEdge}. Pass 1 spreads across players and games; pass 2 lets other
   games fill remaining slots past the per-game limit; with perPlayer "1", a second prop from a player only when its edge is
   exceptional (2x the minimum and 5%+, High confidence). Returns {out, held} where held[base] says why it was left off. */
/* Same-player props built from the same box-score stat (Points, Pts+Reb, Pts+Reb+Ast...) win or lose together, so the list
   never holds two of them: the stronger one is kept and the rest are held as "overlap". A second prop on the same player is
   allowed only when it shares no stat with the first (say Rebounds after Points) and, on the default one-per-player setting,
   only when it is exceptional (EV at least 5% and twice the minimum, High confidence). Unknown stats count as overlapping. */
const COMPS={"Points":["pts"],"Rebounds":["reb"],"Assists":["ast"],"3-Pointers":["tpm","pts"],"Steals":["stl"],"Blocks":["blk"],"Turnovers":["to"],
  "Pts+Reb+Ast":["pts","reb","ast"],"Pts+Reb":["pts","reb"],"Pts+Ast":["pts","ast"],"Reb+Ast":["reb","ast"],"Stl+Blk":["stl","blk"]};
function overlaps(a,b){const x=COMPS[a],y=COMPS[b];if(!x||!y)return true;return x.some(k=>y.includes(k))}
function selectTop(Q,opts){const max=opts.max||10,cap=opts.perPlayer==="1x"?1:+opts.perPlayer||1,gcap=+opts.perGame||99,minE=opts.minEdge||.02;
  const out=[],nP={},nG={},taken=new Set(),held={},stP={};
  const add=c=>{out.push(c);taken.add(c.base);nP[c.ath]=(nP[c.ath]||0)+1;nG[c.gi]=(nG[c.gi]||0)+1;(stP[c.ath]=stP[c.ath]||[]).push(c.st);delete held[c.base]};
  const clash=c=>(stP[c.ath]||[]).some(s=>overlaps(s,c.st));
  for(const c of Q){if(out.length>=max){held[c.base]=held[c.base]||"capN";continue}if(clash(c)){held[c.base]="overlap";continue}
    if((nP[c.ath]||0)>=cap){held[c.base]="capP";continue}if((nG[c.gi]||0)>=gcap){held[c.base]="capG";continue}add(c)}
  for(const c of Q){if(out.length>=max)break;if(taken.has(c.base)||(nP[c.ath]||0)>=cap||clash(c))continue;add(c)}
  if(opts.perPlayer==="1")for(const c of Q){if(out.length>=max)break;if(taken.has(c.base)||clash(c))continue;
    if(c.ev>=Math.max(.05,2*minE)&&c.conf==="High"){c.corr=true;add(c)}}
  Q.forEach(c=>{if(!taken.has(c.base)&&!held[c.base])held[c.base]="capN"});
  return{out,held}}
/* How much an outside pick may move Sharpline's chance, 0 to 1.
   Counts only picks graded at the price the expert actually posted, with time stamps before the game.
   0 when: not independently graded, fewer than 200 graded picks, or no positive closing-line value.
   Otherwise: sample  n/(n+2000)
            × skill   min(1, z/3), z = ROI ÷ its standard error (about 1/sqrt(n) at -110)
            × recency exp(-days since last graded pick / 60)
            × consistency  share of the last 4 quarters with ROI above 0 (needs at least 2 quarters)
   capped at 0.15, so the market price always carries most of the weight. Win rate alone is ignored:
   65% on -400 favorites loses money. Sharpline also counts each pick once, even if several outlets repeat it. */
function expertWeight(r){if(!r||!r.graded||!(r.n>=200))return{w:0,why:!r||!r.graded?"not independently graded at the prices taken":"fewer than 200 graded picks"};
  if(!(r.clv>0))return{w:0,why:"no positive closing-line value"};
  const z=r.roi*Math.sqrt(r.n);if(!(z>0))return{w:0,why:"losing or flat record"};
  const q=r.quarters||[];if(q.length<2)return{w:0,why:"under two quarters of history"};
  const w=Math.min(.15,r.n/(r.n+2000)*Math.min(1,z/3)*Math.exp(-(r.days||0)/60)*(q.filter(x=>x>0).length/q.length));
  return{w,why:"graded record"}}
/* blend: market chance moved toward the expert's side by the weight; each source counted once */
function blendExperts(pMkt,picks){const seen=new Set();let p=pMkt;for(const k of picks||[]){if(!k||seen.has(k.src))continue;seen.add(k.src);const w=expertWeight(k.rec).w;if(w>0)p=p+w*((k.side==="o"?1:0)-p)*.1}return p}
const api={NBA_TIERS,dec,imp,ev,toAm,fairAm,devig,Phi,invPhi,poisOver,poisMean,sdFor,overAt,selectTop,overlaps,probsAt,evPush,fairPrice,sdFit,gradeBet,GRADE_ORDER,expertWeight,blendExperts};
root.SLRank=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
