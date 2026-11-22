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
const C=(base,ath,gi,ev,conf="High",st)=>({base,ath,gi,ev,conf,st:st||{a2:"Rebounds"}[base]||"Points"});
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
/* correlated stats on one player: never two picks built from the same stat */
{const Q=[C("u1","A",0,.09,"High","Pts+Reb+Ast"),C("u2","A",0,.085,"High","Pts+Reb"),C("u3","A",0,.08,"High","Pts+Ast"),C("u4","A",0,.075,"High","Points"),C("u5","A",0,.07,"High","Reb+Ast"),C("b1","B",0,.03)];
  for(const pp of["1","2","3"]){const r=R.selectTop(Q,{perPlayer:pp,perGame:9,max:10,minEdge:.02});
    t("one PRA-family pick per player at cap "+pp,r.out.filter(c=>c.ath==="A").length===1&&r.out[0].base==="u1"&&r.held.u2==="overlap"&&r.held.u4==="overlap");}}
{const Q=[C("x1","A",0,.08,"High","Points"),C("x2","A",0,.07,"High","Rebounds"),C("x3","A",0,.06,"High","Pts+Reb")];const r=R.selectTop(Q,{perPlayer:"2",perGame:9,max:10});
  t("distinct stats allowed under a cap of 2, overlapping held",r.out.map(c=>c.base).join()==="x1,x2"&&r.held.x3==="overlap");}
t("overlap: 3-Pointers inside Points",R.overlaps("3-Pointers","Points")&&!R.overlaps("Rebounds","Assists")&&R.overlaps("Unknown","Rebounds"));
t("empty input gives empty list",R.selectTop([],{}).out.length===0);
{const E=R.expertWeight,base={graded:true,n:1000,roi:.05,clv:.01,days:0,quarters:[.02,.03,-.01,.04]};
  t("ungraded record gets 0",E({...base,graded:false}).w===0);
  t("small sample gets 0",E({...base,n:43}).w===0);
  t("no CLV gets 0",E({...base,clv:-.002}).w===0);
  t("losing record gets 0",E({...base,roi:-.01}).w===0);
  t("good record gets a small weight",E(base).w>0&&E(base).w<=.15);
  t("bigger sample, more weight",E({...base,n:5000}).w>E(base).w);
  t("stale record decays",E({...base,days:120}).w<E(base).w/5);
  t("inconsistent record weighs less",E({...base,quarters:[.1,-.02,-.03,-.01]}).w<E(base).w);
  t("weight never above 15%",E({...base,n:1e6,roi:.5}).w<=.15);
  t("same source counted once",R.blendExperts(.5,[{src:"A",side:"o",rec:base},{src:"A",side:"o",rec:base}])===R.blendExperts(.5,[{src:"A",side:"o",rec:base}]));
  t("no graded experts leaves market chance",R.blendExperts(.53,[{src:"X",side:"o",rec:{graded:false}}])===.53);}
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
