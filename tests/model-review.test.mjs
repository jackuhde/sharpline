// Run: node tests/model-review.test.mjs
// Regression tests for the problems found in the Nov 23 2026 NBA pick review (scripts/props-model/review.mjs).
import fs from "node:fs";import {createRequire} from "node:module";
import {fitMove,remaining,timeLeft,NBA_TIERS,MV,FM,openOf} from "../scripts/props-model/move.mjs";
const RK=createRequire(import.meta.url)("../rank.js");
let pass=0,fail=0;const t=(n,ok)=>{ok?pass++:(fail++,console.log("FAIL",n))};const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;

/* 1. No level term: the old model's intercept and flags pushed ~95% of props to the Under. The corrected model has no
      intercept, so a player whose numbers sit exactly on the line gets no move at all, even if every training prop moved one way. */
{const tr=[];for(let i=0;i<400;i++){const s=10+(i%7)-3;tr.push({st:"Points",l:10.5,s,s10:s,s5:s,miss:0,pm:.5,pClose:.44})}// every prop moved toward the Under
  const M=fitMove(tr);t("no intercept: on-the-line player gets zero move",near(M.f({st:"Points",l:10.5,s:10.5,s10:10.5,s5:10.5,miss:0}),0));}
/* "teammates out" is never negative; with no intercept it worked as a constant Over push (Nov 23 review), so it is not a feature */
t("no never-negative feature in the move model",!MV.includes("miss"));
/* the move follows the player's numbers in both directions, symmetrically */
{const tr=[];for(let i=0;i<600;i++){const g=(i%11-5)/2,s=20+g*5;tr.push({st:"Points",l:20.5,s,s10:s,s5:s,miss:0,pm:.5,pClose:1/(1+Math.exp(-.1*(s-20.5)/8.76))})}
  const M=fitMove(tr),up=M.f({st:"Points",l:20.5,s:26,s10:26,s5:26,miss:0}),dn=M.f({st:"Points",l:20.5,s:15,s10:15,s5:15,miss:0});
  t("average above the line moves toward Over",up>0);t("average below the line moves toward Under",dn<0);t("symmetric",near(up,-dn,1e-3));}

/* 2. Only the part of the move still to come is counted */
t("nothing moved yet: full predicted move",remaining(.2,0)===.2);
t("DraftKings already moved half: half remains",near(remaining(.2,.1),.1));
t("DraftKings already moved past it: nothing remains",remaining(.2,.3)===0);
t("DraftKings moved the other way: defer to the market",remaining(.2,-.05)===0);
t("negative predictions mirror",near(remaining(-.2,-.05),-.15));
t("8+ hours before tip: all of the remaining move",timeLeft(9)===1);t("at tip: none (the move did not beat the closing price)",timeLeft(0)===0);t("4 hours: half",timeLeft(4)===.5);t("after tip: none",timeLeft(-1)===0);

/* 3. Over and Under from the same chance: chances sum to 1 and each side's EV uses its own price */
{const p=.53,eo=RK.ev(p,-110),eu=RK.ev(1-p,-110);t("sides sum to 1",near(p+(1-p),1));t("better side is the one the chance favors at equal prices",eo>eu);
  const eo2=RK.ev(p,-150),eu2=RK.ev(1-p,120);t("price can flip the better side",eu2>eo2);}

/* 4. Tiers: S best, F worst, monotone in conservative EV; NBA cut points never leak into the NFL/default scale */
{const g=evLo=>RK.gradeBet({p:.6,o:-110,u:Math.max(0,.6-RK.dec(-110)**-1*(1+evLo)),conf:"High",fresh:"live",validated:true,cuts:NBA_TIERS}).g;
  const seq=[-.2,-.06,-.02,0,.02,.06,.12].map(e=>RK.GRADE_ORDER.indexOf(RK.gradeBet({p:(1+e)/RK.dec(-110),o:-110,u:0,conf:"High",fresh:"live",validated:true,cuts:NBA_TIERS}).g));
  t("grades never fall as conservative EV rises",seq.every((v,i)=>!i||v>=seq[i-1]));
  t("top of the scale is S",RK.gradeBet({p:.62,o:-110,u:0,conf:"High",fresh:"live",validated:true,cuts:NBA_TIERS}).g==="S");
  t("clearly negative is F",RK.gradeBet({p:.4,o:-110,u:0,conf:"High",fresh:"live",validated:true,cuts:NBA_TIERS}).g==="F");
  t("S needs a validated stat",RK.gradeBet({p:.62,o:-110,u:0,conf:"High",fresh:"live",validated:false,cuts:NBA_TIERS}).g==="A");
  t("S needs no injury question",RK.gradeBet({p:.62,o:-110,u:0,conf:"High",fresh:"live",validated:true,inj:true,cuts:NBA_TIERS}).g==="C");
  t("NBA S cut is 10% conservative EV",NBA_TIERS.S===.1&&RK.NBA_TIERS.S===.1);
  /* 8% conservative EV: A on the NBA scale, S on the default (NFL) scale, which is unchanged */
  const p8=1.08/RK.dec(-110);t("NBA 8% is A",RK.gradeBet({p:p8,o:-110,u:0,conf:"High",fresh:"live",validated:true,cuts:NBA_TIERS}).g==="A");
  t("default scale unchanged (8% is S)",RK.gradeBet({p:p8,o:-110,u:0,conf:"High",fresh:"live",validated:true}).g==="S");}

/* 5. Pregame-only inputs and chronology in the review output */
if(fs.existsSync("data/nba/review.json")){const R=JSON.parse(fs.readFileSync("data/nba/review.json","utf8"));
  t("review: validation before test",R.periods.validation[1]<R.periods.test[0]);
  t("review: every weekly move model was fit only on earlier lines",R.moveModel.byWeek.every(w=>w.fitOn>0));
  t("review: move model has no intercept",R.moveModel.intercept==="none");
  t("review: historical picks matched to results",R.historicalPicks.open.picks.every(p=>p.result!=null&&typeof p.won==="boolean"));
  t("review: features are pregame only",MV.every(k=>!/post|actual|min$/.test(k)));
  /* the corrected model does not stack: at most one S or A per player per night */
  const L=R.historicalPicks.open.picks.filter(p=>p.corrected&&["S","A"].includes(p.corrected.grade));const k={};L.forEach(p=>{const x=p.date+p.player;k[x]=(k[x]||0)+1});
  t("review: one S/A per player per night",Object.values(k).every(v=>v<=1));}
/* 6. Saved predictions: no forced tiers, one S/A per player, both sides considered */
const PD="data/nba/predictions";if(fs.existsSync(PD))fs.readdirSync(PD).filter(f=>f.endsWith(".json")).forEach(f=>{const P=JSON.parse(fs.readFileSync(PD+"/"+f,"utf8"));
  Object.values(P.games).forEach(G=>{const a=G.first.props,sa={};a.filter(x=>["S","A"].includes(x.grade)).forEach(x=>sa[x.ath]=(sa[x.ath]||0)+1);
    t(f+": one S/A per player",Object.values(sa).every(v=>v<=1));t(f+": every prop has a side, a price and a grade",a.every(x=>["o","u"].includes(x.side)&&x.price!=null&&"SABCDF".includes(x.grade)));
    t(f+": chance of the chosen side matches the Over chance",a.every(x=>near(x.pSide,x.side==="o"?x.pOver:1-x.pOver,1e-3)))})});
/* 7. Opening view uses the opening line and settles at it */
{const r={st:"Points",l:21.5,lOpen:20.5,oOpen:-110,uOpen:-110,o:-120,u:100,pm:.52,actual:21,s:22,s10:22,s5:22};const O=openOf(r,RK);
  t("opening view prices the opening line",O.l===20.5&&O.over===1);t("closing chance carried to the opening line is higher than at the closing line",O.pClose>r.pm);}

console.log(`${pass} passed, ${fail} failed`);if(fail)process.exit(1);
