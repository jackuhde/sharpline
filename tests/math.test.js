// Run: node tests/math.test.js   (pulls the real math out of index.html, no copies)
const fs=require("fs"),path=require("path");
const src=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const grab=re=>{const m=src.match(re);if(!m)throw new Error("not found: "+re);return m[0]};
const code=[
 /const dec=a=>[^\n]*/, /const imp=a=>[^\n]*/, /const toAm=p=>[^\n]*/, /const decToAm=d=>[^\n]*/,
 /const evOf=[^\n]*/, /const evPush=[^\n]*/, /const fairAmPush=[^\n]*/,
 /function devig\(a,b\)\{[^\n]*/, /function sdFor\(st,l\)\{[\s\S]*?default:return[^\n]*/, /function invPhi\(p\)\{[^\n]*/, /function shiftP\([^\n]*/, /const pushAt=[^\n]*/, /function erf\(x\)\{[^\n]*/, /const Phi=[^\n]*/, /function poisOver\(lam,L\)\{[^\n]*/
].map(grab).join("\n");
const M=new Function(code+";return{dec,imp,toAm,decToAm,evOf,evPush,fairAmPush,devig,Phi,poisOver,sdFor,invPhi,shiftP,pushAt}")();
let pass=0,fail=0;const near=(a,b,t=1e-3)=>Math.abs(a-b)<=t;
function t(name,ok){ok?pass++:(fail++,console.log("FAIL",name))}
// American odds -> implied probability
t("imp -110",near(M.imp(-110),110/210));t("imp +150",near(M.imp(150),100/250));t("imp -200",near(M.imp(-200),200/300));t("imp +100",near(M.imp(100),.5));
// decimal odds
t("dec +150",near(M.dec(150),2.5));t("dec -125",near(M.dec(-125),1.8));
// fair odds round trip
t("toAm .6",M.toAm(.6)===-150);t("toAm .4",M.toAm(.4)===150);t("toAm .5",Math.abs(M.toAm(.5))===100);
t("decToAm 3",M.decToAm(3)===200);t("decToAm 1.5",M.decToAm(1.5)===-200);
// vig removal: symmetric -110/-110 -> 50/50, sums to 1, favorite keeps more
const [a,b]=M.devig(-110,-110);t("devig sym",near(a,.5)&&near(b,.5));
const [c,d]=M.devig(-150,130);t("devig sums to 1",near(c+d,1));t("devig fav",c>.55&&c<.6);
// EV: 55% at -110 = .55*1.909-1 = +5.0%; 50% at -110 = -4.5%
t("ev 55@-110",near(M.evOf(.55,-110),.55*(1+100/110)-1));t("ev 50@-110 neg",near(M.evOf(.5,-110),-.0455,1e-3));
t("ev 40@+150",near(M.evOf(.4,150),0));
// push-aware EV: no push equals plain EV; push returns stake
t("evPush no push",near(M.evPush(.55,0,-110),M.evOf(.55,-110)));
t("evPush with push",near(M.evPush(.48,.04,-110),.48*(100/110)-.48));
t("fair with push",M.fairAmPush(.48,.04)===100);
// distributions
t("Phi 0",near(M.Phi(0),.5));t("Phi 1.96",near(M.Phi(1.96),.975,2e-3));
t("poisson over 2.5 lam 3",near(M.poisOver(3,2.5),1-Math.exp(-3)*(1+3+4.5),1e-6));
// parlay math (independent legs): two 52.4% legs at fair need about +264
const P=.524*.524;t("parlay fair",Math.abs(M.decToAm(1/P)-264)<=2);
// bell-curve line moves
t("invPhi .975",near(M.invPhi(.975),1.96,5e-3));t("invPhi round trip",near(M.Phi(M.invPhi(.3)),.3,1e-4));
t("shift same line",M.shiftP(.55,25.5,25.5,10)===.55);
t("shift up lowers over",M.shiftP(.5,25.5,27.5,10.4)<.5);t("shift symmetric",near(M.shiftP(.5,25.5,27.5,10)+M.shiftP(.5,25.5,23.5,10),1,1e-6));
t("total 3pt slope near 2.4%/pt",near((.5-M.shiftP(.5,220.5,223.5,M.sdFor("Total")))/3,.022,.003));
t("spread slope near 3%/pt",near((.5-M.shiftP(.5,0,1,M.sdFor("Spread"))),.032,.003));
t("push on 7 about 3%",near(M.pushAt(.5,6.5,7,M.sdFor("Spread")),.032,.004));
t("push sane for points",M.pushAt(.5,24.5,25,M.sdFor("Points",25))>.02&&M.pushAt(.5,24.5,25,M.sdFor("Points",25))<.06);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
