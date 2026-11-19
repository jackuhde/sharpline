// Run: node tests/bets.test.js   (universal bet parser: extraction only, no analysis)
const B=require("../betparse.js").SharpBets;
const ctx={names:[["Jayson Tatum","BOS","nba"],["Jaylen Brown","BOS","nba"],["LeBron James","LAL","nba"],["Jalen Brunson","NYK","nba"],["Nikola Jokic","DEN","nba"],
  ["Patrick Mahomes","KC","nfl"],["Derrick Henry","BAL","nfl"],["Justin Jefferson","MIN","nfl"],["Travis Kelce","KC","nfl"],["Josh Allen","BUF","nfl"],["James Cook","BUF","nfl"],["Lamar Jackson","BAL","nfl"],["Mike Williams","PIT","nfl"],["Jameson Williams","DET","nfl"],["Javonte Williams","DAL","nfl"]].map(([p,ab,sport])=>({p,ab,sport})),
  teams:[["Kansas City Chiefs","KC","nfl"],["Baltimore Ravens","BAL","nfl"],["Buffalo Bills","BUF","nfl"],["Minnesota Vikings","MIN","nfl"],["Los Angeles Lakers","LAL","nba"],["Boston Celtics","BOS","nba"],["New York Knicks","NYK","nba"],["Denver Nuggets","DEN","nba"],["Minnesota Timberwolves","MIN","nba"]]
    .map(([full,ab,sport])=>({full,ab,sport,nick:full.toLowerCase().split(" ").pop()}))};
let pass=0,fail=0;const t=(n,ok,x)=>{ok?pass++:(fail++,console.log("FAIL",n,x!==undefined?JSON.stringify(x,null,0).slice(0,600):""))};
const P=(s,o)=>B.parse(s,ctx,o),L0=b=>b[0]&&b[0].legs[0];
let b,L;
// shorthand from the spec
b=P("Patrick Mahomes O 275.5 pass yards");L=L0(b);t("mahomes o pass yds",L&&L.sport==="nfl"&&L.stat==="pYds"&&L.side==="over"&&L.line===275.5&&L.player==="Patrick Mahomes"&&L.missing.includes("odds"),L);
b=P("Derrick Henry U 85.5 rush yards -115");L=L0(b);t("henry u rush yds",L&&L.stat==="rYds"&&L.side==="under"&&L.line===85.5&&L.odds===-115&&!L.missing.length,L);
b=P("Justin Jefferson 6+ receptions +120");L=L0(b);t("6+ receptions = over 5.5",L&&L.stat==="rec"&&L.side==="over"&&L.line===5.5&&L.alt&&L.odds===120,L);
b=P("Chiefs -3.5 (-110)");L=L0(b);t("chiefs spread",L&&L.mk==="spread"&&L.team.ab==="KC"&&L.line===-3.5&&L.odds===-110&&L.sport==="nfl",L);
b=P("Ravens ML -150");L=L0(b);t("ravens ml",L&&L.mk==="ml"&&L.team.ab==="BAL"&&L.odds===-150,L);
b=P("Ravens ML");L=L0(b);t("ml missing odds",L&&L.mk==="ml"&&L.missing.includes("odds"),L);
b=P("Chiefs vs Bills\nGame O 44.5 -110");L=L0(b);t("game total with matchup context",L&&L.mk==="total"&&L.side==="over"&&L.line===44.5&&L.teams.length===2,L);
b=P("Travis Kelce Anytime TD +140");L=L0(b);t("anytime td",L&&L.stat==="td"&&L.side==="yes"&&L.odds===140&&L.sport==="nfl",L);
b=P("Lakers -4 -110");L=L0(b);t("lakers -4 spread",L&&L.mk==="spread"&&L.line===-4&&L.sport==="nba",L);
b=P("Nikola Jokic points + rebounds over 40.5 -120");L=L0(b);t("pts+reb words",L&&L.stat==="Pts+Reb"&&L.line===40.5&&L.odds===-120,L);
b=P("Kalshi\nJayson Tatum 25+ points\nYES contract at 62 cents, 20 contracts");L=L0(b);t("kalshi yes 62c",L&&L.pm&&L.pm.pick==="yes"&&L.pm.cents===62&&L.pm.qty===20&&L.side==="over"&&L.line===24.5&&b[0].book==="Kalshi",L);
b=P("Chiefs team total O 24.5 -105");L=L0(b);t("team total",L&&L.mk==="teamTotal"&&L.team.ab==="KC"&&L.line===24.5&&L.side==="over",L);
// stacked slip layout
b=P("3-Leg Parlay +596\nJayson Tatum\nOver 26.5 Points\n-110\nJaylen Brown\nUnder 6.5 Rebounds\n-125\nLakers -4\n-110\nWager $10.00\nTo Win $59.60\nDraftKings",{image:1});
t("parlay slip kept together",b.length===1&&b[0].kind==="parlay"&&b[0].legs.length===3&&b[0].parlayOdds===596&&b[0].stake===10&&b[0].book==="DraftKings",b);
t("slip leg odds from next line",b[0]&&b[0].legs[0].odds===-110&&b[0].legs[1].odds===-125&&b[0].legs[1].side==="under",b[0]&&b[0].legs);
// stat line after the selection, player after
b=P("Over 26.5\nPoints\nJayson Tatum\n-110",{image:1});L=L0(b);t("fill back stat and player",L&&L.player==="Jayson Tatum"&&L.stat==="Points"&&L.odds===-110,L);
// board row with both sides is a single, not a parlay, and has no selection
b=P("LeBron James\nPoints\nOver 24.5 -115  Under 24.5 -105",{image:1});L=L0(b);t("board row",b.length===1&&b[0].board&&L.over===-115&&L.under===-105&&L.side===null,b);
b=P("LeBron James Points\nOver 24.5 -115\nUnder 24.5 -105",{image:1});L=L0(b);t("board rows on two lines merge",b.length===1&&L.over===-115&&L.under===-105,b);
// social post with noise
b=P("@SharpGuy · 2h\nLocks for tonight 🔒\nTatum o26.5 pts -115\nBrunson u7.5 ast +100\n1.2K likes\nReply");
t("tweet: two separate bets",b.length===2&&b.every(x=>x.kind==="single")&&b[0].legs[0].player==="Jayson Tatum"&&b[1].legs[0].stat==="Assists"&&b[1].legs[0].odds===100,b);
// group chat text with blank lines = separate messages; a parlay message stays a parlay
b=P("Mahomes over 1.5 pass TD -150\n\nparlay:\nHenry o85.5 rush yds -110\nAllen o240.5 pass yds -115\n\nJokic PRA o50.5 -110");
t("group chat blocks",b.length===3&&b[0].kind==="single"&&b[1].kind==="parlay"&&b[1].legs.length===2&&b[2].legs[0].stat==="Pts+Reb+Ast",b.map(x=>[x.kind,x.legs.length]));
// one-line + combo
b=P("Tatum o26.5 pts + Brown o5.5 reb +260");t("plus combo is a parlay with its own odds",b.length===1&&b[0].kind==="parlay"&&b[0].parlayOdds===260&&b[0].legs.length===2,b);
// comma list: separate bets
b=P("Tatum o26.5 pts -110, Brown o5.5 reb -120");t("comma list singles",b.length===2&&b[1].legs[0].odds===-120,b);
// different NFL markets stay different
b=P("Justin Jefferson over 85.5 receiving yards -115\nJustin Jefferson over 5.5 receptions -130\nJustin Jefferson longest reception over 24.5 -110");
t("rec yds / rec / longest rec distinct",b.length===3&&b[0].legs[0].stat==="recYds"&&b[1].legs[0].stat==="rec"&&b[2].legs[0].stat==="recLng",b.map(x=>x.legs[0].stat));
// current stats are not the line; odds vs probability
b=P("Jayson Tatum 18 PTS 3rd QTR\nOver 26.5 Points -110",{image:1});L=b.find(x=>!x.board).legs[0];t("live stat not taken as line",L.line===26.5&&L.odds===-110,b);
b=P("LeBron James over 24.5 points 62% chance -115");L=L0(b);t("percent not odds",L.odds===-115&&L.line===24.5,L);
// ambiguous player
b=P("Williams over 45.5 receiving yards -110");L=L0(b);t("ambiguous last name -> candidates",L&&!L.player&&L.cands.length===3&&L.missing.some(m=>/which player/.test(m)),L);
// incomplete
b=P("over 26.5 -110");L=L0(b);t("missing player and market listed",L&&L.missing.includes("player")&&L.missing.includes("market (stat)"),L);
// decimal odds and pick'em
b=P("Josh Allen over 1.5 passing TDs 1.80");L=L0(b);t("decimal odds",L&&L.odds===-125&&L.conv,L);
b=P("PrizePicks\n3-Pick Power Play 5x payout\nJayson Tatum More 26.5 Points\nLeBron James Less 24.5 Points\nJalen Brunson More 6.5 Assists\nEntry $10");
t("pick'em entry",b.length===1&&b[0].kind==="parlay"&&b[0].pickem&&b[0].parlayOdds===400&&b[0].legs.every(l=>!l.missing.includes("odds"))&&b[0].stake===10,b);
// prediction market without a question
b=P("YES 41¢");L=L0(b);t("contract with no question",L&&L.mk==="pm"&&L.missing.includes("the contract's exact question"),b);
// duplicates
b=P("Tatum o26.5 pts -115\n\nTatum o26.5 pts -115");t("duplicate flagged",b.length===2&&b[1].dup===b[0].id,b);
// payout mismatch
b=P("Jayson Tatum Over 26.5 Points -110\nWager $10.00\nTo Win $15.00");t("payout mismatch",b[0].payMismatch===true&&b[0].stake===10,b);
// same game parlay flag
b=P("SGP\nPatrick Mahomes Over 275.5 Pass Yds -115\nTravis Kelce Over 65.5 Rec Yds -110\nOdds +264",{image:1});t("sgp",b.length===1&&b[0].sgp&&b[0].parlayOdds===264&&b[0].legs.length===2,b);
// targets recognized but flagged as not modeled
b=P("Justin Jefferson over 8.5 targets -120");L=L0(b);t("targets not modeled",L&&L.stat==="tgt"&&L.notModeled,L);
b=P("Lakers\nSpread -4\n-110",{image:1});L=L0(b);t("team then spread line",L&&L.mk==="spread"&&L.team.ab==="LAL"&&L.line===-4&&L.odds===-110,b);
b=P("Jalen Brunson 025.5 pts -120");L=L0(b);t("OCR o read as 0",L&&L.side==="over"&&L.line===25.5,L);
b=P("Chiefs -3.5 -110\nKalshi Jayson Tatum 25+ points YES 45 cents\nLakers -4 -110");t("book only on the line that names it (text)",b.length===3&&b[0].book===null&&b[1].book==="Kalshi"&&b[2].book===null,b.map(x=>x.book));
b=P("FanDuel\nTatum o26.5 pts -115\nBrown o5.5 reb -120");t("book line on its own applies to the block",b.every(x=>x.book==="FanDuel"),b.map(x=>x.book));
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
