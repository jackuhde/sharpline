// NBA game results with DraftKings closing lines, for the game model. Source: ESPN's free scoreboard and core odds.
// Incremental: dates already stored are skipped. Output: data/nba/games.json
import fs from "fs";
const S="https://site.api.espn.com/apis/site/v2/sports/basketball/nba",C="https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function j(u,tries=3){for(let i=0;i<tries;i++){try{const r=await fetch(u);if(r.ok)return await r.json();if(r.status===404)return null}catch(e){}await sleep(800*(i+1))}return null}
const F="data/nba/games.json";const out=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,"utf8")):{dates:{},games:[]};
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,"");
const et=new Date(Date.now()-5*3600e3);et.setUTCDate(et.getUTCDate()-1);const end=ymd(et);
let d=new Date(Date.UTC(2026,9,20));let added=0;
const num=v=>v==null||v===""?null:+v;
const amOf=o=>{if(!o)return null;const v=o.close&&o.close.odds||o.odds;return v==null||v==="OFF"?null:+String(v).replace("EVEN","100")};
while(ymd(d)<=end){const k=ymd(d);d.setUTCDate(d.getUTCDate()+1);if(out.dates[k])continue;
  const sb=await j(`${S}/scoreboard?dates=${k}&limit=50`);await sleep(250);if(!sb)continue;let ok=true;
  for(const e of sb.events||[]){const c=e.competitions[0];if((e.season||{}).type!==2)continue;if(!c.status.type.completed){ok=false;continue}
    const H=c.competitors.find(x=>x.homeAway==="home"),A=c.competitors.find(x=>x.homeAway==="away");
    const g={id:e.id,d:e.date,h:[H.team.abbreviation,+H.score],a:[A.team.abbreviation,+A.score],sp:null,tot:null,mlh:null,mla:null};
    const od=(c.odds||[])[0];if(od&&od.spread!=null){g.sp=num(od.spread);g.tot=num(od.overUnder);g.mlh=amOf(od.moneyline&&od.moneyline.home);g.mla=amOf(od.moneyline&&od.moneyline.away)}
    if(g.sp==null){const o=await j(`${C}/events/${e.id}/competitions/${e.id}/odds/100`);await sleep(150);
      if(o&&o.spread!=null){g.sp=num(o.spread);g.tot=num(o.overUnder);g.mlh=num(o.homeTeamOdds&&o.homeTeamOdds.moneyLine);g.mla=num(o.awayTeamOdds&&o.awayTeamOdds.moneyLine)}}
    if(!out.games.some(x=>x.id===g.id)){out.games.push(g);added++}}
  if(ok)out.dates[k]=1}
out.games.sort((a,b)=>a.d<b.d?-1:1);out.updated=new Date().toISOString();
fs.mkdirSync("data/nba",{recursive:true});fs.writeFileSync(F,JSON.stringify(out));console.log(`${out.games.length} games (${added} new), ${out.games.filter(g=>g.sp!=null).length} with closing spread`);
