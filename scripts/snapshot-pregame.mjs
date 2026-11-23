// Saves DraftKings' pregame player props for today's games before tip-off, including the milestone ("25+") lines that
// ESPN removes once a game ends. Run several times a day; each run overwrites a game's snapshot only while it is still
// pregame, so the file ends with the last price seen before tip. Output: data/pregame/YYYY-MM-DD.json
// main rows: [athlete, stat, line, over, under, opening line, opening over, opening under] (opening fields since Nov 23 2026)
import fs from "node:fs";import {createRequire} from "node:module";
const require=createRequire(import.meta.url);const L=require("../live.js");
const BASE="https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const et=new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"});
const sb=L.parseScoreboard(await (await fetch(`${BASE}/scoreboard?dates=${et.replace(/-/g,"")}`)).json());
const FILE=`data/pregame/${et}.json`;fs.mkdirSync("data/pregame",{recursive:true});
const db=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,"utf8")):{date:et,games:{}};let n=0;
for(const e of sb){if(e.state!=="pre")continue;
  try{const p=await L.fetchProps(e.id,100,8);await sleep(400);
    db.games[e.id]={ts:new Date().toISOString(),tip:e.date,h:e.home,a:e.away,
      main:p.filter(x=>!x.yn).map(x=>[x.ath,x.st,x.l,x.o,x.u,x.lOpen??null,x.oOpen??null,x.uOpen??null]),alts:(p.alts||[]).map(a=>[a.ath,a.st,a.l,a.o])};n++}
  catch(err){console.log("skip",e.id,String(err))}}
fs.writeFileSync(FILE,JSON.stringify(db));
console.log(`${et}: ${n} pregame games saved, ${Object.values(db.games).reduce((s,g)=>s+g.alts.length,0)} milestone lines total`);
