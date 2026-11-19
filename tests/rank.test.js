// Run: node tests/rank.test.js
const R=require("../rank.js");let pass=0,fail=0;const t=(n,ok)=>{ok?pass++:(fail++,console.log("FAIL",n))};const near=(a,b,e=1e-3)=>Math.abs(a-b)<e;
t("dec -110",near(R.dec(-110),1.90909));t("dec +150",near(R.dec(150),2.5));t("dec +100",near(R.dec(100),2));t("dec -100",near(R.dec(-100),2));
t("dec invalid 50",isNaN(R.dec(50)));t("imp -110",near(R.imp(-110),.52381));
t("ev fair coin at +100 is 0",near(R.ev(.5,100),0));t("ev 55% at -110",near(R.ev(.55,-110),.05));t("ev 75% at -300 is break-even",near(R.ev(.75,-300),0));
t("ev 58% at +110 beats 75% at -300",R.ev(.58,110)>R.ev(.75,-300));
t("toAm 2.5",R.toAm(2.5)===150);t("toAm 1.909",R.toAm(1.90909)===-110);t("fairAm 60%",R.fairAm(.6)===-150);
{const[a,b]=R.devig(-110,-110);t("devig even",near(a,.5)&&near(b,.5));}
{const[a,b]=R.devig(-150,130);t("devig sums to 1",near(a+b,1));t("devig favorite >",a>b);}
t("overAt same line",R.overAt("Points",20.5,.48,20.5)===.48);
t("overAt monotone",R.overAt("Points",20.5,.5,15.5)>.5&&R.overAt("Points",20.5,.5,25.5)<.5);
t("overAt count stat",R.overAt("3-Pointers",2.5,.45,1.5)>.45&&R.overAt("3-Pointers",2.5,.45,3.5)<.45);
t("overAt 50% at main = mean at line",near(R.overAt("Rebounds",8.5,.5,8.5),.5));
/* selection */
const C=(base,ath,gi,ev,conf="High")=>({base,ath,gi,ev,conf});
{const Q=[C("a1","A",0,.08),C("a2","A",0,.07),C("b1","B",0,.05),C("c1","C",1,.03)];const r=R.selectTop(Q,{perPlayer:"1x",perGame:3,max:10,minEdge:.02});
  t("one per player strict",r.out.map(c=>c.base).join()==="a1,b1,c1");t("held reason",r.held.a2==="capP");}
{const Q=[C("a1","A",0,.08),C("a2","A",0,.07),C("b1","B",0,.03)];const r=R.selectTop(Q,{perPlayer:"1",perGame:3,max:10,minEdge:.02});
  t("exceptional second prop allowed",r.out.map(c=>c.base).join()==="a1,b1,a2"&&r.out[2].corr);}
{const Q=[C("a1","A",0,.08),C("a2","A",0,.045),C("b1","B",0,.03)];const r=R.selectTop(Q,{perPlayer:"1",perGame:3,max:10,minEdge:.02});
  t("non-exceptional second prop held",r.out.length===2&&r.held.a2==="capP");}
{const Q=[C("a","A",0,.09),C("b","B",0,.08),C("c","C",0,.07),C("d","D",0,.06),C("e","E",1,.05)];const r=R.selectTop(Q,{perPlayer:"1x",perGame:3,max:10});
  t("per-game cap then refill",r.out.map(c=>c.base).join()==="a,b,c,e,d");}
{const Q=[];for(let i=0;i<15;i++)Q.push(C("p"+i,"P"+i,i%5,.1-i*.001));const r=R.selectTop(Q,{perPlayer:"1x",perGame:3,max:10});
  t("max 10",r.out.length===10);t("rest held as capN",Object.values(r.held).filter(v=>v==="capN").length===5);}
t("empty input gives empty list",R.selectTop([],{}).out.length===0);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
