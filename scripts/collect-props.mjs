// Collects, for every completed regular-season NBA game this season: DraftKings' pregame player props as ESPN publishes them
// (provider 100: opening and closing line and prices) and the final box score. Used to backtest Sharpline's prop model
// with only information that existed before each game. Output: data/props-history.json (incremental; only new games are fetched).
import fs from "node:fs";import {createRequire} from "node:module";
const require=createRequire(import.meta.url);const L=require("../live.js");
const BASE="https://site.api.espn.com/apis/site/v2/sports/basketball/nba",OUT="data/props-history.json",ALT="data/alts-history.json";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(f,n=3){for(let i=0;i<n;i++){try{return await f()}catch(e){if(i===n-1)throw e;await sleep(1500*(i+1))}}}
const db=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,"utf8")):{season:null,games:{}};
const sb=await (await fetch(`${BASE}/scoreboard`)).json();const season=sb.season.year,cal=(sb.leagues[0].calendar||[]).map(d=>d.slice(0,10));
if(db.season!==season){db.season=season;db.games={}}
/* DraftKings milestone lines ("25+ points" = Over 24.5, one price): kept in their own file, [athlete, stat, line, price] */
const alts=fs.existsSync(ALT)?JSON.parse(fs.readFileSync(ALT,"utf8")):{season,games:{}};if(alts.season!==season){alts.season=season;alts.games={}}
const today=new Date().toISOString().slice(0,10);let added=0,noProps=0;
for(const d of cal){if(d>=today)continue;
  const raw=await retry(async()=>{const r=await fetch(`${BASE}/scoreboard?dates=${d.replace(/-/g,"")}`);if(!r.ok)throw new Error(r.status);return r.json()});await sleep(250);
  const evs=L.parseScoreboard(raw),types=Object.fromEntries((raw.events||[]).map(e=>[e.id,(e.season||{}).type]));
  for(const e of evs){if(types[e.id]!==2||!e.completed)continue;
    /* DraftKings' closing game total and spread (for pace and blowout tests); the scoreboard drops odds once a game is final */
    if(db.games[e.id]&&db.games[e.id].tot==null&&!db.games[e.id].goTried){db.games[e.id].goTried=1;try{const o=await retry(()=>L.preOdds(e.id));await sleep(200);if(o){db.games[e.id].tot=o.total.line;db.games[e.id].sp=o.spread.home}}catch(err){}}
    if(db.games[e.id]&&!alts.games[e.id]){try{const pr=await retry(()=>L.fetchProps(e.id,100,8));await sleep(250);alts.games[e.id]=(pr.alts||[]).map(a=>[a.ath,a.st,a.l,a.o]);added++}catch(err){console.log("skip alts",e.id,String(err))}continue}
    if(db.games[e.id])continue;
    let bx,props,go=null;try{go=await retry(()=>L.preOdds(e.id))}catch(err){}
    try{bx=await retry(()=>L.box(e.id));await sleep(250);props=await retry(()=>L.fetchProps(e.id,100,8));await sleep(250)}catch(err){console.log("skip",e.id,String(err));continue}
    if(!props.length)noProps++;
    db.games[e.id]={d,h:e.home,a:e.away,hid:e.homeId,aid:e.awayId,hs:e.homeScore,as:e.awayScore,
      sp:go?go.spread.home:e.odds&&e.odds.spread.home,tot:go?go.total.line:e.odds&&e.odds.total.line,
      pl:Object.values(bx.players).map(p=>[p.id,p.name,p.teamId,p.dnp?0:1,p.starter?1:0,p.min,p.pts,p.reb,p.ast,p.tpm,p.stl,p.blk,p.to]),
      pr:props.filter(p=>!p.yn).map(p=>[p.ath,p.st,p.l,p.o,p.u,p.lOpen,p.oOpen,p.uOpen])};
    alts.games[e.id]=(props.alts||[]).map(a=>[a.ath,a.st,a.l,a.o]);
    added++}}
fs.mkdirSync("data",{recursive:true});fs.writeFileSync(OUT,JSON.stringify(db));fs.writeFileSync(ALT,JSON.stringify(alts));
console.log(`season ${season}: ${Object.keys(db.games).length} games (${added} new, ${noProps} with no props)`);
