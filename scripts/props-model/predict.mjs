// Saves Sharpline's NBA prop predictions before tip, so they can be graded against results later (Nov 23 2026).
// Run after each pregame snapshot: node scripts/props-model/predict.mjs [YYYY-MM-DD]
// For every prop in data/pregame/DATE.json it records the line and price available at that moment, the corrected model's
// chance (model.json "move": DraftKings' no-vig chance moved by the predicted move still to come), the side with the better
// expected return, and the grade (rank.js gradeBet with the NBA tier cut points). Each game keeps its FIRST prediction
// (never edited) and its LAST one before tip. scripts/props-model/review.mjs grades both once the games are final.
// Server side, the injury report is not read, so "teammates out" is 0 here (the app counts it); noted in the file.
import fs from "node:fs";import {createRequire} from "node:module";import {buildRows} from "./rows.mjs";import {devig,sdFor} from "./lib.mjs";import {lg,sg,clp,timeLeft,remaining,FM} from "./move.mjs";
const RK=createRequire(import.meta.url)("../../rank.js");
const date=process.argv[2]||new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"});
const SNAPF=`data/pregame/${date}.json`;if(!fs.existsSync(SNAPF)){console.log("no snapshot for",date);process.exit(0)}
const M=JSON.parse(fs.readFileSync("model.json","utf8"));if(!M.move){console.log("model.json has no move model yet");process.exit(0)}
const SN=JSON.parse(fs.readFileSync(SNAPF,"utf8")),{slate}=buildRows("data/props-history.json",SNAPF);
const OUTF=`data/nba/predictions/${date}.json`;fs.mkdirSync("data/nba/predictions",{recursive:true});
const db=fs.existsSync(OUTF)?JSON.parse(fs.readFileSync(OUTF,"utf8")):{date,note:"first = earliest saved prediction for the game (never edited), last = latest before tip. Teammates out is not counted server side.",games:{}};
const W=M.move.weights,full=M.move.fullMoveHoursBeforeTip||8;let n=0;
for(const [gid,G] of Object.entries(SN.games)){const now=Date.parse(G.ts),tip=Date.parse(G.tip);if(!(tip>now))continue;
  const tf=timeLeft((tip-now)/36e5*8/full),open={};(G.main||[]).forEach(m=>open[m[0]+"|"+m[1]]=m);
  const props=slate.filter(r=>r.gid===gid).map(r=>{const m=open[r.ath+"|"+r.st]||[];const [,, ,,,lOpen,oOpen,uOpen]=m;
    const x={...r,miss:0};const pred=Object.keys(W).reduce((a,k)=>a+(W[k]||0)*(FM[k]?FM[k](x):0),0);
    let obs=0;if(oOpen!=null&&uOpen!=null){const p0=devig(oOpen,uOpen)[0],l0=lOpen??r.l;const pO=l0===r.l?p0:(q=>q.over/(1-(q.push||0)))(RK.probsAt(r.st,l0,p0,r.l));obs=lg(clp(r.pm))-lg(clp(pO))}
    const p=sg(lg(clp(r.pm))+remaining(pred,obs)*tf),eo=RK.ev(p,r.o),eu=RK.ev(1-p,r.u),side=eo>=eu?"o":"u",ps=side==="o"?p:1-p,price=side==="o"?r.o:r.u;
    const C=(M.mktCal||{})[r.st],u=(C?Math.max(0,-(side==="o"?C.overGap:C.underGap))+1.28*C.se:.03)+.5*Math.abs(p-r.pm);
    const gb=RK.gradeBet({p:ps,o:price,u,conf:"High",fresh:"live",validated:!!(C&&C.validated),cuts:M.tiers||RK.NBA_TIERS});if(["S","A"].includes(gb.g)&&C&&C.n<300)gb.g="B";
    return{gid,ath:r.ath,name:r.name,st:r.st,l:r.l,o:r.o,u:r.u,lOpen:lOpen??null,side,price,pOver:+p.toFixed(4),pm:+r.pm.toFixed(4),pSide:+ps.toFixed(4),ev:+gb.ev.toFixed(4),evLo:+gb.evLo.toFixed(4),grade:gb.g,
      pred:+pred.toFixed(4),obs:+obs.toFixed(4),tf:+tf.toFixed(2),seasonAvg:+r.s.toFixed(1)}});
  /* one S/A per player */
  const best={};props.filter(x=>["S","A"].includes(x.grade)).sort((a,b)=>b.evLo-a.evLo).forEach(x=>{if(best[x.ath])x.grade="B";else best[x.ath]=1});
  const rec={ts:G.ts,tip:G.tip,model:M.updated,props};const g=db.games[gid]=db.games[gid]||{};if(!g.first)g.first=rec;g.last=rec;n+=props.length}
fs.writeFileSync(OUTF,JSON.stringify(db));console.log(`${date}: ${n} props predicted in ${Object.keys(SN.games).length} games`);
