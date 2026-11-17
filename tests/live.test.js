// Run: node tests/live.test.js   (ESPN parsing and automatic grading; box score is the real Knicks 112, Raptors 108 OT final from Nov 15, 2026)
const L=require("../live.js"),fs=require("fs"),path=require("path");
const bx=L.parseBox(JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures","box_401909990.json"),"utf8")));
const game={home:"Toronto Raptors",away:"New York Knicks",homeScore:108,awayScore:112,completed:true,statusName:"STATUS_FINAL"};
let pass=0,fail=0;const t=(n,ok)=>{ok?pass++:(fail++,console.log("FAIL",n))};const G=(spec,g=game)=>(L.grade(spec,g,bx)||{}).res;
t("box parsed",bx.completed&&bx.players["jalen brunson"].pts===28&&bx.players["jalen brunson"].tpm===3);
t("apostrophe name",bx.players[L.norm("Ja'Kobe Walter")].pts===7);
t("prop over win",G({kind:"prop",player:"Jalen Brunson",stat:"Points",line:25.5,side:"o"})==="W");
t("prop under loss",G({kind:"prop",player:"Jalen Brunson",stat:"Points",line:25.5,side:"u"})==="L");
t("prop push",G({kind:"prop",player:"Jalen Brunson",stat:"Points",line:28,side:"o"})==="P");
t("rebounds",G({kind:"prop",player:"Karl-Anthony Towns",stat:"Rebounds",line:12.5,side:"o"})==="W");
t("threes",G({kind:"prop",player:"Scottie Barnes",stat:"3-Pointers",line:2.5,side:"o"})==="W");
t("PRA combo 38 under 38.5",G({kind:"prop",player:"Jalen Brunson",stat:"Pts+Reb+Ast",line:38.5,side:"u"})==="W");
t("dnp voids",G({kind:"prop",player:"Pacome Dadiet",stat:"Points",line:4.5,side:"o"})==="V");
t("not in box voids",G({kind:"prop",player:"Kawhi Leonard",stat:"Points",line:20.5,side:"o"})==="V");
t("ml win",G({kind:"ml",team:"New York Knicks"})==="W");t("ml loss",G({kind:"ml",team:"Toronto Raptors"})==="L");
t("spread cover dog",G({kind:"sp",team:"Toronto Raptors",line:4.5})==="W");t("spread fav no cover",G({kind:"sp",team:"New York Knicks",line:-4.5})==="L");
t("spread push",G({kind:"sp",team:"New York Knicks",line:-4})==="P");
t("total over",G({kind:"tot",line:216.5,side:"o"})==="W");t("total push",G({kind:"tot",line:220,side:"u"})==="P");
t("not final stays pending",L.grade({kind:"ml",team:"New York Knicks"},{...game,completed:false},bx)===null);
t("postponed voids",G({kind:"ml",team:"New York Knicks"},{...game,completed:false,statusName:"STATUS_POSTPONED"})==="V");
t("unknown team stays pending",G({kind:"ml",team:"Boston Celtics"})===undefined);
// scoreboard odds parsing (shape of ESPN's NYK at TOR entry on Nov 17)
const sb=L.parseScoreboard({events:[{id:"401910002",date:"2026-11-18T00:30Z",competitions:[{status:{type:{state:"pre",completed:false,name:"STATUS_SCHEDULED",shortDetail:"11/17 - 7:30 PM EST"}},
 competitors:[{homeAway:"home",score:"0",team:{displayName:"Toronto Raptors",abbreviation:"TOR"}},{homeAway:"away",score:"0",team:{displayName:"New York Knicks",abbreviation:"NY"}}],
 odds:[{provider:{name:"DraftKings"},overUnder:214.5,moneyline:{home:{close:{odds:"+150"},open:{odds:"+128"}},away:{close:{odds:"-179"},open:{odds:"-152"}}},
  pointSpread:{home:{close:{line:"+4.5",odds:"-114"},open:{line:"+3.5"}},away:{close:{line:"-4.5",odds:"-106"},open:{line:"-3.5"}}},
  total:{over:{close:{line:"o214.5",odds:"-108"},open:{line:"o216.5"}},under:{close:{line:"u214.5",odds:"-112"}}}}]}]}]})[0];
t("sb ml",sb.odds.ml.home===150&&sb.odds.ml.away===-179&&sb.odds.ml.awayOpen===-152);
t("sb spread",sb.odds.spread.away===-4.5&&sb.odds.spread.awayOdds===-106&&sb.odds.spread.homeOpen===3.5);
t("sb total",sb.odds.total.line===214.5&&sb.odds.total.over===-108&&sb.odds.total.open===216.5);
const inj=L.parseInjuries({injuries:[{displayName:"Toronto Raptors",injuries:[{status:"Day-To-Day",shortComment:"Barnes (illness) is questionable for Tuesday",date:"2026-11-17T17:29Z",athlete:{displayName:"Scottie Barnes"},details:{fantasyStatus:{abbreviation:"GTD"}}},
 {status:"Out",shortComment:"",athlete:{displayName:"Kawhi Leonard"},details:{fantasyStatus:{abbreviation:"OUT"}}},{status:"Day-To-Day",shortComment:"Smith has been ruled out for Tuesday's game",athlete:{displayName:"Joe Smith"},details:{}}]}]});
t("inj quest",inj["scottie barnes"].level==="quest");t("inj out",inj["kawhi leonard"].level==="out");t("inj out from note",inj["joe smith"].level==="out");
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
