// Run: node tests/ocr.test.js   (screenshot text parser)
const O=require("../ocrparse.js").SharpOCR;
const ctx={names:[{p:"Jalen Brunson",ab:"NYK"},{p:"RJ Barrett",ab:"TOR"},{p:"Luka Doncic",ab:"LAL"}],
  teams:[{full:"New York Knicks",ab:"NYK",nick:"knicks"},{full:"Toronto Raptors",ab:"TOR",nick:"raptors"}]};
const run=t=>O.parse(t.split("\n").map(x=>({t:x})),ctx);let pass=0,fail=0;
const t=(n,ok)=>{ok?pass++:(fail++,console.log("FAIL",n))};
let r=run("Jalen Brunson\nPoints\nOver 25.5 -115  Under 25.5 -105");t("book layout",r.length===1&&r[0].over===-115&&r[0].under===-105&&r[0].line===25.5);
r=run("@SharpGuy: Brunson over 26.5 pts -115 tonight");t("tweet",r.length===1&&r[0].player==="Jalen Brunson"&&r[0].over===-115&&r[0].under==null);
r=run("Jalen Brunson u26.5 points (-120)");t("u shorthand",r[0].under===-120&&r[0].line===26.5);
r=run("Cooper Flagg over 19.5 points -110 DraftKings");t("unknown player + book",r[0].player==="Cooper Flagg"&&r[0].book==="DraftKings");
r=run("Luka Doncic\nPoints\nOver 34.5 1.91  Under 34.5 1.95\nbet365");t("decimal odds",r[0].over===-110&&r[0].under===-105&&r[0].conv&&r[0].book==="bet365");
r=run("RJ Barrett Over 21.5 Points 10/11");t("fractional odds",r[0].over===-110&&r[0].conv);
r=run("RJ Barrett Over 21.5 Points 5/2");t("fractional plus",r[0].over===250);
r=run("Tue 11/17 Jalen Brunson Over 25.5 Points -115");t("date not odds",r[0].over===-115&&!r[0].conv);
r=run("3-Leg Parlay +596\nJalen Brunson\nOver 25.5 Points -115\nRJ Barrett\nUnder 21.5 Points -110\nFanDuel");t("parlay slip legs",r.length===2&&r.every(x=>x.slip&&x.book==="FanDuel"));
r=run("Knicks -3.5 -110 O 216.5 -110 -150");t("game line row",r.length===3&&r[0].mk==="spread"&&r[2].odds===-150);
// prediction markets
r=run("Kalshi\nJalen Brunson: 25+ points\nYes 48¢  No 53¢");t("kalshi 25+ yes/no",r.length===1&&r[0].line===24.5&&r[0].over===108&&r[0].under===-113&&r[0].pm&&r[0].book==="Kalshi");
r=run("Polymarket\nRJ Barrett Over 21.5 points\nYes 41c No 60c");t("polymarket cents",r[0].over===144&&r[0].under===-150&&r[0].pm);
r=run("ProphetX\nJalen Brunson Over 25.5 Points -112 Under 25.5 -104");t("prophetx american",r[0].book==="ProphetX"&&r[0].over===-112);
r=run("Knicks Yes 64¢ No 37¢");t("pm team ml",r.length===1&&r[0].mk==="moneyline"&&r[0].odds===-178);
r=run("Knicks No 37¢");t("lone NO is not this team's ML",r.length===0);
r=run("Jalen Brunson Over 25.5 Points -115\nWager $10.00\nTo Win $8.70");t("stake and to-win",r[0].stake===10&&r[0].toWin===8.7&&r[0].payAm===-115&&!r[0].payMismatch);
r=run("Jalen Brunson Over 25.5 Points -115\nWager $10.00\nPayout $21.00");t("payout mismatch flagged",r[0].toWin===11&&r[0].payMismatch);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
