// Run: node tests/scanner.test.js   (scanner analysis: verdicts, prediction-market fees, parlays). NFL adapter stubbed.
const listeners=[];global.window=global;global.document={addEventListener:(...a)=>listeners.push(a),getElementById:()=>null};
global.SLRank={fairAm:p=>p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p)};
global.SharpOCR=require("../ocrparse.js").SharpOCR;global.SharpBets=require("../betparse.js").SharpBets;
const P={};global.SPORT="nfl";
global.NFL={N:{stats:{}},scanQuote:leg=>{const x=P[leg.player||((leg.team||{}).ab)];return{sport:"nfl",checks:[{ok:true,t:"ok"}],market:{rows:[]},eid:x.eid,e:{},an:x.p==null?{none:"no model"}:{p:x.p,model:"DraftKings no-vig",trusted:true,anchored:true}}}};
require("../scanner.js");const S=window.Scanner;
let pass=0,fail=0;const t=(n,ok,x)=>{ok?pass++:(fail++,console.log("FAIL",n,x!==undefined?JSON.stringify(x).slice(0,400):""))};
const leg=(player,odds,side,o)=>Object.assign({sport:"nfl",mk:"prop",player,stat:"rYds",side:side||"over",line:50.5,odds,cands:[],teams:[],missing:[],raw:""},o);
P.A={p:.6,eid:"g1"};P.B={p:.55,eid:"g2"};P.C={p:.5,eid:"g3"};P.D={p:.58,eid:"g1"};P.E={p:null,eid:"g4"};
let R=S.analyzeLeg(leg("A",-110),"DraftKings");t("ev at submitted odds",Math.abs(R.ev-(0.6*(1+100/110)-1))<1e-9&&R.v==="fav",R);
R=S.analyzeLeg(leg("A",-200),"DraftKings");t("projection side but price too short is unfavorable",R.v==="unfav"&&R.ev<0,R.v);
R=S.analyzeLeg(leg("C",-102),"DraftKings");t("near zero is neutral",R.v==="neu",R.v);
R=S.analyzeLeg(leg("A",null),"DraftKings");t("no odds: no grade, fair price given",R.v==="na"&&/needs/.test(R.vt),R.vt);
R=S.analyzeLeg(leg("E",-110),"DraftKings");t("no model: can't assess",R.v==="na",R.v);
// Kalshi: 62c YES x20, fee = ceil(0.07*20*.62*.38*100)/100 = 0.33
const pm=S.pmCost({pm:{cents:62,qty:20}},"Kalshi");t("kalshi fee",pm.fee===0.33&&Math.abs(pm.per-(0.62+0.33/20))<1e-9,pm);
t("other exchange: fee unknown, not invented",S.pmCost({pm:{cents:62,qty:1}},"Polymarket").fee===null);
R=S.analyzeLeg(leg("A",null,"over",{pm:{pick:"yes",cents:62,qty:20}}),"Kalshi");t("contract priced with fee",Math.abs(R.implied-(0.62+0.33/20))<1e-9&&Math.abs(R.ev-(0.6/(0.62+0.0165)-1))<1e-6,R);
// parlays
const bet=(legs,o)=>Object.assign({id:"x",kind:"parlay",legs,book:"DK",parlayOdds:null,stake:10},o);
let O=S.analyzeBet(bet([leg("A",-110),leg("B",-110),leg("C",-110)]));
t("independent legs multiply",Math.abs(O.p-.6*.55*.5)<1e-9&&O.parSrc==="legs multiplied"&&O.drop&&O.drop.length===3,O);
t("strongest and weakest",O.best===0&&O.worst===2,[O.best,O.worst]);
t("payout from stake",Math.abs(O.payout-10*Math.pow(1+100/110,3))<.01,O.payout);
O=S.analyzeBet(bet([leg("A",-110),leg("D",-110)],{parlayOdds:260}));t("same game: no combined chance",O.p==null&&O.sameGame&&O.v==="na"&&/same game/.test(O.pNote),O);
O=S.analyzeBet(bet([leg("A",-110),leg("B",-110)],{parlayOdds:300}));t("slip odds used over legs multiplied",O.parAm===300&&Math.abs(O.ev-(.33*4-1))<1e-9,O);
O=S.analyzeBet(bet([leg("A",-110),leg("E",-110)]));t("missing leg probability: no combined",O.p==null&&/no probability/.test(O.pNote),O.pNote);
t("drop-one keeps payout trade-off",(()=>{const o=S.analyzeBet(bet([leg("A",-110),leg("B",-110),leg("C",-110)]));const d=o.drop[2];return d.p>o.p&&d.am<o.parAm})());
// board row: better side chosen, never presented as the user's pick
O=S.analyzeBet({id:"b",kind:"single",board:true,book:"DK",legs:[leg("A",null,null,{over:-110,under:-110})]});t("board picks better side",O.R.leg.side==="over",O.R&&O.R.leg);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
