/* NFL model and grading tests (run: node tests/nfl.test.js) */
global.window=global;const fs=require("fs");
const M=require("../nfl-model.js");global.SLRank=require("../rank.js");global.SLNFLModel=M;
let pass=0,fail=0;const t=(n,c)=>{if(c)pass++;else{fail++;console.log("FAIL",n)}};
/* tiny synthetic season: a receiver averaging ~70 yards, a defense that allows a lot */
const S={season:2026,stype:2,week:5,cols:["cmp","att","pYds","pTD","int","sk","car","rYds","rTD","rLng","rec","recYds","recTD","recLng","tgt","fgM","fgA","xpM","kPts"],
  teams:{1:["AAA","A","#111","#222"],2:["BBB","B","#333","#444"],3:["CCC","C","#555","#666"]},ath:{10:["Rec One","WR","1","11",""],20:["QB Two","QB","1","12",""],30:["Wr Three","WR","3","81",""]},games:[]};
const row=(team,o)=>{const v=S.cols.map(c=>o[c]||0);return[team,...v]};
for(let w=1;w<=4;w++)S.games.push({id:"g"+w,t:2,w,d:`2026-10-0${w}T17:00Z`,h:["1",24],a:[w%2?"2":"3",20],sp:-3,tot:44,p:{10:row("1",{rec:5,recYds:60+w*5,tgt:8}),20:row("1",{cmp:20,att:32,pYds:240,pTD:2}),30:row(w%2?"2":"3",{rec:3,recYds:30})}});
const I=M.index(S);
const a=M.project(I,"10","recYds",{line:50.5,k:1}),b=M.project(I,"10","recYds",{line:90.5,k:1});
t("higher line, lower over chance",a.pOver>b.pOver);t("mean near history",a.m>55&&a.m<80);
t("k shrinks toward 50%",Math.abs(M.project(I,"10","recYds",{line:50.5,k:.3}).p-.5)<Math.abs(a.p-.5));
t("one game is not enough",M.project(I,"10","recYds",{line:50.5,before:"2026-10-02T00:00Z"}).p==null);
t("only earlier games used",M.project(I,"10","recYds",{line:50.5,before:"2026-10-04T00:00Z",k:1}).n===3);
const r=M.project(I,"10","rec",{line:4.5,k:1});t("poisson over 4.5 with mean ~5 is near 56%",r.pOver>.45&&r.pOver<.7);
t("live: already over is certain",M.liveChance(a,60,50.5,"o",.5,"recYds")===1);
t("live: no time left, under line loses over",M.liveChance(a,40,50.5,"o",0,"recYds")===0);
t("live: more time, more chance",M.liveChance(a,30,50.5,"o",.5,"recYds")>M.liveChance(a,30,50.5,"o",.1,"recYds"));
t("live: halftime 68 yds vs 90.5 is between 10% and 90%",(x=>x>.1&&x<.9)(M.liveChance(a,68,90.5,"o",.5,"recYds")));
const D=M.defense(I,null);t("defense factor bounded",(x=>x.x>=.85&&x.x<=1.15)(D("1","WR","rec")));
/* backtest output exists and has k per stat */
const mj=JSON.parse(fs.readFileSync(__dirname+"/../data/nfl/model.json","utf8"));t("backtest file has k",mj.k&&Object.keys(mj.k).length>5);t("backtest scored thousands of lines",mj.lines>1000);
/* grading through nfl.js with a stubbed page */
global.document={addEventListener(){},getElementById(){return null}};global.localStorage={getItem:()=>null,setItem(){}};global.BETS=[];global.setTimeout=()=>0;global.setInterval=()=>0;
require("../nfl.js");const G=window.NFL._eval;
const B={completed:true,comp:[{id:"1",home:true,score:24},{id:"2",home:false,score:20}],players:{10:{t:"1",v:{recYds:67,rec:5,rTD:0,recTD:1},tkl:0,ast:0,sacks:0}}};
t("prop over wins",G.gradeSpec({kind:"prop",ath:"10",stat:"recYds",line:60.5,side:"o",player:"Rec One"},B).res==="W");
t("prop under loses",G.gradeSpec({kind:"prop",ath:"10",stat:"recYds",line:60.5,side:"u",player:"Rec One"},B).res==="L");
t("did not play is void",G.gradeSpec({kind:"prop",ath:"99",stat:"recYds",line:60.5,side:"o",player:"X"},B).res==="V");
t("home -3.5 loses by half a point",G.gradeSpec({kind:"sp",team:"1",line:-3.5},B).res==="W"&&G.gradeSpec({kind:"sp",team:"1",line:-4.5},B).res==="L");
t("away +3 pushes? no: +4 covers",G.gradeSpec({kind:"sp",team:"2",line:4},B).res==="P");
t("moneyline",G.gradeSpec({kind:"ml",team:"2"},B).res==="L");
t("total over 43.5",G.gradeSpec({kind:"tot",line:43.5,side:"o"},B).res==="W");
t("not final is ungraded",G.gradeSpec({kind:"ml",team:"1"},{...B,completed:false})===null);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
