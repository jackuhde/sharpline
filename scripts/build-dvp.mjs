// Builds dvp.json: what each NBA defense allows to opposing guards, forwards and centers.
// Source: ESPN's free box scores (regular season only). Runs nightly in GitHub Actions; only new games are fetched.
// Starters only: each team's five starters, grouped by ESPN's own box-score label (G, F, C). ESPN does not split guards into PG/SG.
// Bench players are left out so a defense is judged on the opposing starters it faced.
import fs from "node:fs";
const BASE="https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const CACHE="data/dvp-games.json",OUT="dvp.json",K=["min","pts","reb","ast","tpm","stl","blk"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,tries=3){for(let i=0;i<tries;i++){try{const r=await fetch(url,{headers:{"user-agent":"sharpline-dvp"}});if(r.ok)return r.json();if(r.status===404)return null}catch(e){}await sleep(1500*(i+1))}throw new Error("fetch failed "+url)}
const posOf=a=>{const p=((a.position||{}).abbreviation||"").toUpperCase();if(p==="C")return"C";if(/^(G|PG|SG)$/.test(p))return"G";if(/^(F|SF|PF)$/.test(p))return"F";if(p.includes("C"))return"C";if(p.includes("G"))return"G";if(p.includes("F"))return"F";return null};
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,"");

const V=2;/* bump to refetch every game when what is counted changes (v2: starters only) */
const cache=fs.existsSync(CACHE)?JSON.parse(fs.readFileSync(CACHE,"utf8")):{season:null,dates:{},games:{}};
if(cache.v!==V){cache.v=V;cache.dates={};cache.games={}}
const sb=await get(`${BASE}/scoreboard`);const season=sb.season.year,cal=(sb.leagues[0].calendar||[]).map(d=>d.slice(0,10));
if(cache.season!==season){cache.season=season;cache.dates={};cache.games={}}
const today=new Date().toISOString().slice(0,10);
let fetched=0;
for(const d of cal){if(d>=today||cache.dates[d])continue;
  const day=await get(`${BASE}/scoreboard?dates=${d.replace(/-/g,"")}`);await sleep(250);if(!day)continue;
  let allDone=true;
  for(const e of day.events||[]){if(((e.season||{}).type)!==2)continue;const st=((e.competitions||[])[0]||{}).status||e.status||{};
    if(!(st.type||{}).completed){allDone=false;continue}if(cache.games[e.id])continue;
    const s=await get(`${BASE}/summary?event=${e.id}`);await sleep(300);fetched++;if(!s||!s.boxscore)continue;
    const sides=s.boxscore.players||[];if(sides.length!==2)continue;const g={date:d,t:{}};
    sides.forEach((side,i)=>{const def=sides[1-i].team.displayName,st=(side.statistics||[])[0]||{},lab=st.labels||st.names||[],ix=k=>lab.indexOf(k);
      const acc=g.t[def]=g.t[def]||{opp:side.team.displayName,G:K.map(()=>0),F:K.map(()=>0),C:K.map(()=>0)};
      (st.athletes||[]).forEach(a=>{if(!a.starter||a.didNotPlay||!a.stats||!a.stats.length)return;const p=posOf(a.athlete||{});if(!p)return;
        const n=k=>{const v=parseFloat(String(a.stats[ix(k)]||"0").split("-")[0]);return isNaN(v)?0:v};
        [n("MIN"),n("PTS"),n("REB"),n("AST"),n("3PT"),n("STL"),n("BLK")].forEach((v,j)=>acc[p][j]+=v)})});
    cache.games[e.id]=g}
  if(allDone&&(day.events||[]).length)cache.dates[d]=1}

/* aggregate: per team, per position, per game; season and last 10 games */
const teams={};
Object.values(cache.games).sort((a,b)=>a.date<b.date?-1:1).forEach(g=>Object.entries(g.t).forEach(([def,v])=>{(teams[def]=teams[def]||[]).push({date:g.date,...v})}));
const avg=(list,p)=>{const t=K.map(()=>0);list.forEach(x=>x[p].forEach((v,j)=>t[j]+=v));const o={};K.forEach((k,j)=>o[k]=list.length?Math.round(t[j]/list.length*10)/10:null);return o};
const out={updated:new Date().toISOString(),season,starters:true,games:Object.keys(cache.games).length,through:Object.values(cache.games).reduce((m,g)=>g.date>m?g.date:m,""),teams:{},league:{}};
for(const[def,list]of Object.entries(teams)){const l10=list.slice(-10);out.teams[def]={gp:list.length,l10gp:l10.length};
  for(const p of["G","F","C"])out.teams[def][p]={s:avg(list,p),l10:avg(l10,p)}}
/* ranks: 1 = allows the most (friendliest matchup), 30 = allows the least */
for(const p of["G","F","C"]){out.league[p]={};for(const k of K){const T=Object.keys(out.teams);out.league[p][k]=Math.round(T.reduce((a,t)=>a+out.teams[t][p].s[k],0)/T.length*10)/10;
  for(const w of["s","l10"]){const sorted=T.slice().sort((a,b)=>out.teams[b][p][w][k]-out.teams[a][p][w][k]);sorted.forEach((t,i)=>{const r=out.teams[t][p][w+"r"]=out.teams[t][p][w+"r"]||{};r[k]=i+1})}}}
fs.mkdirSync("data",{recursive:true});fs.writeFileSync(CACHE,JSON.stringify(cache));fs.writeFileSync(OUT,JSON.stringify(out));
console.log(`season ${season}: ${out.games} games (${fetched} new), ${Object.keys(out.teams).length} teams, through ${out.through}`);
