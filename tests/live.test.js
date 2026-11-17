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

// DraftKings prop feed (shape of ESPN core propBets, Scottie Barnes on Nov 17): first of each pair is the Over
const it=(ath,tid,tn,tot,am,op)=>({athlete:{$ref:`http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2027/athletes/${ath}?lang=en`},type:{id:String(tid),name:tn},odds:{american:{value:am,open:op},total:{value:tot,open:tot}},lastUpdated:"2026-11-17T20:25Z"});
const pb=L.parsePropBets([it(4433134,1,"Total Points","20.5","-121","-112"),it(4433134,1,"Total Points","20.5","-105","-114"),
  it(4433134,2,"Total Assists","4.5","-153","+119"),it(4433134,2,"Total Assists","4.5","+116","-157"),
  {type:{id:"72",name:"1st Half Total"},odds:{american:{value:"-110"}}},
  it(4433134,92,"To Record a Double Double",undefined,"+262","+253"),it(4433134,218,"Points Milestones","25+","+192","-112")]);
t("props parsed",pb.length===3);
t("over first",pb[0].st==="Points"&&pb[0].l===20.5&&pb[0].o===-121&&pb[0].u===-105&&pb[0].ath==="4433134");
t("assists pair",pb[1].st==="Assists"&&pb[1].o===-153&&pb[1].u===116&&pb[1].oOpen===119);
t("double double yes only",pb[2].st==="Double Double"&&pb[2].l===.5&&pb[2].o===262&&pb[2].u===null&&pb[2].yn);
t("milestones and game markets ignored",!pb.some(x=>/Milestone/.test(x.st)));
// game log averages
const gl=L.parseGamelog({names:["minutes","fieldGoalsMade-fieldGoalsAttempted","fieldGoalPct","threePointFieldGoalsMade-threePointFieldGoalsAttempted","threePointPct","freeThrowsMade-freeThrowsAttempted","freeThrowPct","totalRebounds","assists","blocks","steals","fouls","turnovers","points"],
  events:{a:{gameDate:"2026-11-15T00:00Z"},b:{gameDate:"2026-11-13T00:00Z"},c:{gameDate:"2026-10-30T00:00Z"},d:{gameDate:"2026-10-28T00:00Z"}},
  seasonTypes:[{displayName:"2026-27 Regular Season",categories:[{events:[{eventId:"a",stats:["36","13-27","48.1","4-8","50","0-3","0","9","4","2","1","3","0","30"]},{eventId:"b",stats:["32","7-15","46.7","1-2","50","2-4","50","6","6","0","3","1","6","17"]}]},
    {events:[{eventId:"c",stats:["39","19-34","55.9","1-2","50","2-3","66.7","5","5","0","2","6","4","41"]},{eventId:"d",stats:["0","0-0","0","0-0","0","0-0","0","0","0","0","0","0","0","0"]}]}]},{displayName:"Preseason",categories:[]}]});
t("gamelog games played skip DNP",gl.season.gp===3);
t("gamelog season pts",gl.season.pts===29.3&&gl.season.tpm===2&&gl.season.min===35.7);
t("gamelog last10 present",gl.l10&&gl.l10.gp===3);
t("gamelog dd rate",Math.abs(gl.dd-0)<1e-9);
// double double grading
const bxDD={players:{"scottie barnes":{name:"Scottie Barnes",pts:22,reb:11,ast:4,stl:1,blk:0,dnp:false,min:34}}};
t("dd graded",L.grade({kind:"prop",player:"Scottie Barnes",stat:"Double Double",line:.5,side:"o"},game,bxDD).res==="W");
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
