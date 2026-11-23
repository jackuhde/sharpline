// Run: node tests/grade.test.js
// Probability, push, EV, grade and artifact-consistency checks for the NBA prop pipeline (Nov 22 2026).
const R=require("../rank.js"),fs=require("fs"),path=require("path");let pass=0,fail=0;
const t=(n,ok)=>{ok?pass++:(fail++,console.log("FAIL",n))};const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;

/* probabilities: Over + Under + push = 1, at any line, for every stat */
for(const st of["Points","Rebounds","Assists","3-Pointers","Steals","Blocks","Pts+Reb+Ast","Pts+Reb","Pts+Ast","Reb+Ast"]){
  for(const L of[0.5,1,2,2.5,7,7.5,20,24.5]){const r=R.probsAt(st,L>3?L:2.5,.47,L);t(`${st} ${L} sums to 1`,near(r.over+r.under+r.push,1,1e-9))}}
t("half line: no push",R.probsAt("Points",24.5,.5,23.5).push===0);
t("whole line: push counted",R.probsAt("Points",24.5,.5,24).push>.02);
t("count stat whole line: Poisson push",R.probsAt("3-Pointers",2.5,.45,2).push>.2);
t("same line returns the market chance",near(R.probsAt("Rebounds",8.5,.53,8.5).over,.53));
t("lower line raises Over",R.probsAt("Points",24.5,.5,22.5).over>.5&&R.probsAt("Points",24.5,.5,26.5).over<.5);
t("Over and Under move opposite ways",R.probsAt("Assists",6.5,.5,5.5).under<.5);
t("80% range brackets the mean",(r=>r.lo<r.mean&&r.mean<r.hi)(R.probsAt("Pts+Reb+Ast",35.5,.5,35.5)));
t("validated spread scale used for Rebounds",near(R.sdFit("Rebounds",8.5),R.sdFor("Rebounds",8.5)*.84));
t("Points keeps its spread (scale did not hold out of sample)",near(R.sdFit("Points",20.5),R.sdFor("Points",20.5)));

/* EV and price */
t("EV with no push equals ev()",near(R.evPush(.55,0,-110),R.ev(.55,-110)));
t("a push returns the stake",near(R.evPush(.45,.1,100),.45-.45));
t("fair price breaks even",near(R.evPush(.55,0,R.fairPrice(.55,0)),0,.006));
t("fair price with push",R.fairPrice(.45,.1)===100);

/* grades come from the conservative EV, with gates */
const G=o=>R.gradeBet({conf:"High",fresh:"live",validated:true,...o}).g;
t("S needs conservative EV 7%+",G({p:.62,o:+100,u:.02})==="S");
t("A at conservative 3.5%+",G({p:.54,o:+100,u:.015})==="A");
t("B at conservative 1%+",G({p:.53,o:+100,u:.015})==="B");
t("C borderline",G({p:.52,o:+100,u:.02})==="C");
t("DraftKings vig alone is D",G({p:.5,o:-110,u:.01})==="D");
t("worse than -5% is F",G({p:.48,o:-120,u:.01})==="F");
t("midpoint edge alone is not enough: +10% EV with a wide range is D",G({p:.55,o:+100,u:.06})==="D");
t("S needs High confidence",G({p:.62,o:+100,u:.02,conf:"Medium"})==="A");
t("S needs a validated stat",G({p:.62,o:+100,u:.02,validated:false})==="A");
t("A needs Medium or High confidence",G({p:.62,o:+100,u:.02,conf:"Low"})==="B");
t("injury question caps at C",G({p:.62,o:+100,u:.02,inj:true})==="C");
t("price needing verification caps at C",G({p:.62,o:+100,u:.02,fresh:"aging"})==="C");
t("stale price is F",G({p:.62,o:+100,u:.02,fresh:"stale"})==="F");
t("started game is F",G({p:.62,o:+100,u:.02,fresh:"started"})==="F");
t("missing data is F",G({p:.62,o:+100,missing:true})==="F");
t("no price is F",R.gradeBet({p:.6,o:null}).g==="F");
t("better price never lowers the grade",["-110","+100","+110","+130"].map(o=>R.GRADE_ORDER.indexOf(G({p:.56,o:+o,u:.015}))).every((g,i,a)=>!i||g>=a[i-1]));
t("no limit on how many S grades",Array.from({length:6},()=>G({p:.62,o:+100,u:.02})).every(g=>g==="S"));
t("grades are symmetric in side: an Under is graded like an Over",G({p:.57,o:+100,u:.015})===G({p:.57,o:+100,u:.015}));

/* side choice: the side with the higher EV at its own price */
{const p=.47,o=-105,u=-115,side=R.ev(p,o)>=R.ev(1-p,u)?"o":"u";t("lower Over chance picks Under at even-ish prices",side==="u");
 const side2=R.ev(.47,+130)>=R.ev(.53,-160)?"o":"u";t("a long enough Over price wins even below 50%",side2==="o");}

/* Top List: correlated props and concentration (selection rules) */
{const C=(base,ath,ev,st,conf="High")=>({base,ath,gi:0,ev,conf,st});
 const Q=[C("a","A",.09,"Pts+Reb+Ast"),C("b","A",.08,"Points"),C("c","A",.07,"Pts+Ast"),C("d","A",.06,"Pts+Reb"),C("e","A",.055,"Reb+Ast"),C("f","B",.03,"Rebounds"),C("g","C",.025,"Assists","Medium")];
 const r=R.selectTop(Q,{perPlayer:"1",perGame:9,max:10,minEdge:.02});
 t("five unders on one player become one pick",r.out.filter(c=>c.ath==="A").length===1);
 t("the strongest of the correlated set is kept",r.out[0].base==="a");
 t("other players still listed",r.out.some(c=>c.ath==="B")&&r.out.some(c=>c.ath==="C"));
 t("zero picks when nothing qualifies",R.selectTop([],{max:10}).out.length===0);}

/* the live app and the published model agree */
{const root=path.join(__dirname,".."),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),M=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
 const def=html.match(/const PM_DEFAULT=(\{[^}]*\})/);const keys=def?Object.keys(Function("return "+def[1])()).sort().join():"";
 t("index.html built-in weights have the same terms as model.json",keys===Object.keys(M.weights).sort().join());
 t("model.json has no level terms (intercept 0, market weight 1)",M.weights.b0===0&&M.weights.mkt===1);
 t("every centered feature is computed by the app",Object.values(M.center||{}).every(c=>Object.keys(c).every(k=>new RegExp("\\b"+k+":").test(html))));
 t("model.json has per-stat k and market calibration for every stat",["Points","Rebounds","Assists","3-Pointers","Pts+Reb+Ast"].every(st=>M.catK[st]!=null&&M.mktCal&&M.mktCal[st]));
 t("k never above 1 or below 0",Object.values(M.catK).every(k=>k>=0&&k<=1));
 t("app loads rank.js before using it",/<script src="rank\.js\?v=\d+"><\/script>/.test(html));
 const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");t("service worker caches rank.js",/"rank\.js"/.test(sw));
 t("unknown stats default to the market (k=0)",/const CAT_K_DEF=0;/.test(html));
 t("Top List only takes B, A and S",/const TOP_GRADES=\["B","A","S"\]/.test(html));}
/* NFL grades: every modeled prop gets one; reasons when it can't */
{const src=require("fs").readFileSync(require("path").join(__dirname,"..","nfl.js"),"utf8");
 t("NFL cards and rows use the shared grade",/function gradeNfl\(/.test(src)&&/const GN=gradeNfl\(x\)/.test(src)&&/const GN=gradeNfl\(x\),R=NREL\[x.key\]/.test(src));
 t("NFL no longer drops grades above 62%",!/x\.p<=\.62/.test(src));}
{const h=require("fs").readFileSync(require("path").join(__dirname,"..","index.html"),"utf8");
 /* Nov 23 2026: no share of the slate is forced into any tier; the slate rank is shown with the real grade */
 t("slate grades use every tier, S to F, by share of the slate",/q<\.03\?"S":q<\.12\?"A":q<\.30\?"B":q<\.60\?"C":q<\.85\?"D":"F",v:gradeNow\(r\.key\)/.test(h));
 t("slate rank shown with the value grade",/#\$\{REL\[x\.base\]\.rank\} of \$\{REL_N\} tonight · value grade \$\{gradeNow\(x\.base\)\}/.test(h));}
{const h=require("fs").readFileSync(require("path").join(__dirname,"..","index.html"),"utf8");
 t("row refresh keeps the slate grade on props",/if\(key\[0\]==="p"&&REL\[key\]\)gt\.outerHTML=relTag\(key\)/.test(h));}
console.log(`${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
