// Run: node tests/layout.test.js   (screenshot layout reconstruction from word boxes; no OCR needed)
const LY=require("../layout.js").SharpLayout;let pass=0,fail=0;const t=(n,ok,x)=>{ok?pass++:(fail++,console.log("FAIL",n,x!==undefined?JSON.stringify(x):""))};
const W=(text,x0,y0,w,h,o)=>Object.assign({text,conf:95,x0,y0,x1:x0+w,y1:y0+(h||30)},o);
const statOf=t=>/^(points|rebounds|assists|threes)$/i.test(t);
// stacked buttons: line over price, two buttons, player at left
let r=LY.read([W("Tyrese",50,100,140),W("Maxey",200,100,140),W("O",830,95,25),W("27.5",880,95,80),W("-115",850,140,100),W("U",1140,95,25),W("27.5",1190,95,80),W("-105",1155,140,100)],{statOf});
t("stacked buttons join line and price",r.length===1&&/Tyrese Maxey/.test(r[0].t)&&/O 27\.5 -115/.test(r[0].t)&&/U 27\.5 -105/.test(r[0].t),r);
// header columns label bare prices
r=LY.read([W("OVER",820,50,90,20),W("UNDER",1130,50,110,20),W("Victor",50,120,120),W("Wembanyama",180,120,250),W("11.5",830,105,70),W("-130",820,140,90),W("11.5",1160,105,70),W("+110",1150,140,90)],{statOf});
t("OVER/UNDER header labels each column",r.some(x=>/Over 11\.5 -130/.test(x.t)&&/Under 11\.5 \+110/.test(x.t)),r);
// tab bar: only the visibly selected tab is kept
r=LY.read([W("Points",50,20,120,30,{ink:240}),W("Rebounds",250,20,160,30,{ink:120}),W("Assists",500,20,140,30,{ink:120}),W("Threes",700,20,130,30,{ink:120})],{statOf});
t("selected tab kept",r.length===1&&r[0].t==="Points",r);
r=LY.read([W("Points",50,20,120,30,{ink:200}),W("Rebounds",250,20,160,30,{ink:190}),W("Assists",500,20,140,30,{ink:195})],{statOf});
t("no clear tab: no market taken",r.every(x=>!/Points|Rebounds|Assists/.test(x.t)),r);
// zero read for O, and lost decimal fixed from the other button
r=LY.read([W("Joel",50,100,90),W("Embiid",150,100,130),W("0",830,95,25),W("275",880,95,80),W("-110",850,140,100),W("U",1140,95,25),W("27.5",1190,95,80),W("-110",1155,140,100)],{statOf});
t("0 → O and 275 → 27.5",/O 27\.5 -110/.test(r[0].t),r);
// one side letter missing: the other button's side is the opposite
r=LY.read([W("Kevin",50,100,90),W("Durant",150,100,130),W("O",830,95,25),W("6.5",880,95,60),W("-105",850,140,100),W("6.5",1190,95,60),W("-115",1155,140,100)],{statOf});
t("missing side letter inferred",/U 6\.5 -115/.test(r[0].t),r);
// two-column card grid stays separated
const card=(x,y,n1,n2,line)=>[W(n1,x,y,120),W(n2,x+130,y,140),W(line,x+80,y+70,70,40),W("Points",x+70,y+125,100,25),W("Less",x+10,y+170,70),W("More",x+170,y+170,70)];
r=LY.read([...card(20,50,"Ace","Bailey","17.5"),...card(600,50,"Jared","McCain","14.5"),...card(20,320,"Tyrese","Maxey","26.5"),...card(600,320,"Paul","George","15.5")],{statOf,width:1170});
t("grid columns read separately",r.some(x=>/17\.5/.test(x.t))&&r.some(x=>/14\.5/.test(x.t))&&!r.some(x=>/17\.5.*14\.5|14\.5.*17\.5/.test(x.t))&&r.findIndex(x=>/Ace Bailey/.test(x.t))<r.findIndex(x=>/17\.5/.test(x.t)),r);
// confidence of each number is kept for flagging
r=LY.read([W("Jalen",50,100,90),W("Smith",150,100,100),W("7.5",700,100,60,30,{conf:41}),W("Over",900,100,80),W("-118",990,100,90)],{statOf});
t("number confidence kept",r[0].conf["7.5"]===41,r);
console.log(`${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
