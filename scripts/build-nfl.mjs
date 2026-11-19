/* NFL data for Sharpline, built in GitHub Actions from ESPN's free feeds and committed to data/nfl/.
   - stats.json: every completed game this season, offensive and kicking box score lines per player (targets included),
     final scores, team list, and each rostered player's position, jersey and roster status.
   - lines.json: DraftKings player-prop lines (no prices: ESPN's NFL feed carries lines only) per game, saved before
     kickoff and kept after it, so the model can be backtested against the lines that were actually posted.
   Completed games are fetched once and cached in the files; later runs only add new games. */
import fs from "fs";
const S="https://site.api.espn.com/apis/site/v2/sports/football/nfl",C="https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const DIR="data/nfl";fs.mkdirSync(DIR,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function j(u,tries=3){for(let i=0;i<tries;i++){try{const r=await fetch(u);if(r.ok)return await r.json();if(r.status===404)return null}catch(e){}await sleep(800*(i+1))}return null}
const load=(f,d)=>{try{return JSON.parse(fs.readFileSync(DIR+"/"+f,"utf8"))}catch(e){return d}};
const num=v=>{const n=parseFloat(v);return isNaN(n)?0:n};
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);await sleep(120)}}));return out}

/* stat columns stored per player per game (order matters: the app reads them by index) */
const COLS=["cmp","att","pYds","pTD","int","sk","car","rYds","rTD","rLng","rec","recYds","recTD","recLng","tgt","fgM","fgA","xpM","kPts"];
function parseBox(sum){const out={};const bx=sum&&sum.boxscore;if(!bx||!bx.players)return out;
  bx.players.forEach(T=>{const tid=T.team&&T.team.id;(T.statistics||[]).forEach(cat=>{const keys=cat.keys||[];(cat.athletes||[]).forEach(a=>{const id=a.athlete&&a.athlete.id;if(!id)return;
    const r=out[id]||(out[id]={t:tid,n:a.athlete.displayName,v:new Array(COLS.length).fill(0)});const st=a.stats||[];const at=k=>st[keys.indexOf(k)];
    if(cat.name==="passing"){const[c,t]=String(at("completions/passingAttempts")||"0/0").split("/");r.v[0]=num(c);r.v[1]=num(t);r.v[2]=num(at("passingYards"));r.v[3]=num(at("passingTouchdowns"));r.v[4]=num(at("interceptions"));r.v[5]=num(String(at("sacks-sackYardsLost")||"0").split("-")[0])}
    if(cat.name==="rushing"){r.v[6]=num(at("rushingAttempts"));r.v[7]=num(at("rushingYards"));r.v[8]=num(at("rushingTouchdowns"));r.v[9]=num(at("longRushing"))}
    if(cat.name==="receiving"){r.v[10]=num(at("receptions"));r.v[11]=num(at("receivingYards"));r.v[12]=num(at("receivingTouchdowns"));r.v[13]=num(at("longReception"));r.v[14]=num(at("receivingTargets"))}
    if(cat.name==="kicking"){const[fm,fa]=String(at("fieldGoalsMade/fieldGoalAttempts")||"0/0").split("/");const[xm]=String(at("extraPointsMade/extraPointAttempts")||"0/0").split("/");r.v[15]=num(fm);r.v[16]=num(fa);r.v[17]=num(xm);r.v[18]=num(at("totalKickingPoints"))}})})});
  return out}
/* two-sided over/under player props ESPN lists for the NFL (type id -> stat key used in the app) */
const PROP={8:"pYds",9:"cmp",10:"pTD",11:"car",12:"rYds",13:"recYds",14:"rec",15:"int",16:"att",17:"pLng",18:"pRYds",19:"recLng",20:"rRecYds",21:"rLng",22:"kPts",23:"xpM",24:"fgM",25:"ast",26:"tkl",27:"tklAst",28:"sacks"};
async function propLines(id){let items=[];for(let p=1;p<=3;p++){const pb=await j(`${C}/events/${id}/competitions/${id}/odds/100/propBets?lang=en&region=us&limit=1000&page=${p}`);if(!pb)break;items=items.concat(pb.items||[]);if(p>=(pb.pageCount||1))break}
  const out={};items.forEach(x=>{const st=x.type&&PROP[x.type.id];if(!st||!x.athlete)return;const m=String(x.athlete.$ref||"").match(/athletes\/(\d+)/);const L=x.current&&x.current.target&&x.current.target.value;if(!m||L==null)return;
    const o=x.open&&x.open.target&&x.open.target.value;out[m[1]+"|"+st]=[+L,o!=null?+o:null]});return out}

const sb=await j(S+"/scoreboard");if(!sb){console.error("scoreboard unavailable");process.exit(0)}
const season=sb.season.year,stype=sb.season.type,week=sb.week&&sb.week.number;
const teamsJ=await j(S+"/teams");const teams={};((teamsJ&&teamsJ.sports&&teamsJ.sports[0].leagues[0].teams)||[]).forEach(({team:t})=>{teams[t.id]=[t.abbreviation,t.displayName,"#"+(t.color||"444"),"#"+(t.alternateColor||"999"),t.shortDisplayName||t.name]});
/* rosters: position, jersey, roster status for every player */
const ath={};await pool(Object.keys(teams),4,async tid=>{const r=await j(`${S}/teams/${tid}/roster`);((r&&r.athletes)||[]).forEach(g=>(g.items||[]).forEach(a=>{
  const inj=(a.injuries||[])[0];ath[a.id]=[a.displayName,(a.position&&a.position.abbreviation)||"",tid,a.jersey||"",inj?inj.status:(a.status&&a.status.abbreviation)||"",g.position]}))});

const prev=load("stats.json",{});const games={};(prev.season===season?prev.games||[]:[]).forEach(g=>{games[g.id]=g});
const lines=load("lines.json",{});if(lines.season!==season){for(const k of Object.keys(lines))delete lines[k];lines.season=season;lines.games={}}
lines.games=lines.games||{};
const weeks=[];for(let w=1;w<=(stype===2?week:18);w++)weeks.push([2,w]);if(stype===3)for(let w=1;w<=week;w++)weeks.push([3,w]);
const evs=[];await pool(weeks,3,async([t,w])=>{const s=await j(`${S}/scoreboard?seasontype=${t}&week=${w}&dates=${season}`);((s&&s.events)||[]).forEach(e=>evs.push({e,t,w}))});
const todo=evs.filter(({e})=>e.competitions[0].status.type.completed&&!games[e.id]);
console.log(`season ${season} type ${stype} week ${week}: ${evs.length} events, ${Object.keys(games).length} cached, ${todo.length} new finals`);
await pool(todo,3,async({e,t,w})=>{const c=e.competitions[0],H=c.competitors.find(x=>x.homeAway==="home"),A=c.competitors.find(x=>x.homeAway==="away");
  const sum=await j(`${S}/summary?event=${e.id}`);if(!sum)return;const box=parseBox(sum);
  games[e.id]={id:e.id,t,w,d:e.date,h:[H.team.id,+H.score],a:[A.team.id,+A.score],p:Object.fromEntries(Object.entries(box).filter(([,r])=>r.v.some(x=>x)).map(([id,r])=>{if(!ath[id])ath[id]=[r.n,"",r.t,"","",""];return[id,[r.t,...r.v]]}))};
  if(!lines.games[e.id]){const L=await propLines(e.id);if(Object.keys(L).length)lines.games[e.id]={w,t,final:1,l:L}}});
/* upcoming and in-progress games: save lines while still pregame, keep the last pregame snapshot after kickoff */
const open=evs.filter(({e})=>e.competitions[0].status.type.state==="pre");
await pool(open,3,async({e,t,w})=>{const L=await propLines(e.id);if(Object.keys(L).length)lines.games[e.id]={w,t,at:new Date().toISOString(),l:L}});
/* closing DraftKings spread (home, negative = home favored) and total, from the core odds feed; once per game */
const sbById={};evs.forEach(({e})=>sbById[e.id]=e);
await pool(Object.values(games).filter(g=>g.sp==null||g.ven==null||g.venFix!==2),3,async g=>{
  if(g.sp==null){const o=await j(`${C}/events/${g.id}/competitions/${g.id}/odds/100`);if(o&&o.spread!=null){g.sp=+o.spread;g.tot=o.overUnder!=null?+o.overUnder:null}}
  if(g.ven==null||g.venFix!==2){const sum=await j(`${S}/summary?event=${g.id}`);const gi=sum&&sum.gameInfo;const v=gi&&gi.venue;const sv=((sbById[g.id]||{}).competitions||[{}])[0].venue||{};
    g.ven=v||sv.fullName?{n:(v&&v.fullName)||sv.fullName,c:(v&&v.address&&v.address.city)||(sv.address&&sv.address.city),s:(v&&v.address&&v.address.state)||(sv.address&&sv.address.state),in:sv.indoor||(v&&v.indoor)?1:0}:{};g.venFix=2;g.wx=undefined;
    if(gi&&gi.weather)g.wx0={t:gi.weather.temperature,d:gi.weather.displayValue||"",g:gi.weather.gust||null}}});
/* weather at kickoff for outdoor games (Open-Meteo: free, no key). Wind and rain matter for passing and kicking. */
const geo={};async function geocode(c,st){const k=c+"|"+st;if(geo[k]!==undefined)return geo[k];
  const r=await j(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=10&countryCode=US`);const hit=r&&(r.results||[]).find(x=>!st||x.admin1&&x.admin1.toLowerCase().startsWith(String(st).toLowerCase().slice(0,4)))||(r&&r.results||[])[0];
  return geo[k]=hit?[hit.latitude,hit.longitude]:null}
const ST={AL:"Alabama",AZ:"Arizona",CA:"California",CO:"Colorado",FL:"Florida",GA:"Georgia",IL:"Illinois",IN:"Indiana",LA:"Louisiana",MA:"Massachusetts",MD:"Maryland",MI:"Michigan",MN:"Minnesota",MO:"Missouri",NC:"North Carolina",NJ:"New Jersey",NV:"Nevada",NY:"New York",OH:"Ohio",PA:"Pennsylvania",TN:"Tennessee",TX:"Texas",WA:"Washington",WI:"Wisconsin"};
async function weather(g){if(!g.ven||g.ven.in||!g.ven.c)return null;const ll=await geocode(g.ven.c,ST[g.ven.s]||g.ven.s);if(!ll)return null;
  const day=g.d.slice(0,10),past=Date.parse(g.d)<Date.now()-2*864e5;
  const url=past?`https://archive-api.open-meteo.com/v1/archive?latitude=${ll[0]}&longitude=${ll[1]}&start_date=${day}&end_date=${day}&hourly=wind_speed_10m,precipitation,temperature_2m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC`
    :`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&hourly=wind_speed_10m,precipitation,temperature_2m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&forecast_days=10`;
  const r=await j(url);if(!r||!r.hourly){if(!past)console.log("forecast failed",g.ven.c,url.slice(0,160));return null}const hr=g.d.slice(0,13);const i=r.hourly.time.findIndex(t=>t.startsWith(hr));if(i<0){if(!past)console.log('forecast hour missing',hr,r.hourly.time[0],r.hourly.time.at(-1));return null}
  const sl=k=>r.hourly[k].slice(i,i+3);const avg=a=>a.reduce((x,y)=>x+(y||0),0)/a.length;
  return{wind:Math.round(avg(sl("wind_speed_10m"))),rain:Math.round(sl("precipitation").reduce((x,y)=>x+(y||0),0)*10)/10,temp:Math.round(avg(sl("temperature_2m"))),fc:past?0:1}}
await pool(Object.values(games).filter(g=>g.wx===undefined),3,async g=>{g.wx=await weather(g)});

/* nflverse (free, open data on GitHub): snap share, targets, air yards, target and air-yard share, QB pressure.
   Joined to ESPN players through nflverse's ID map, and to games by season, week and team. */
const NV="https://github.com/nflverse/nflverse-data/releases/download";
async function csv(path){try{const r=await fetch(`${NV}/${path}`);if(!r.ok)return[];const t=await r.text();const L=t.split(/\r?\n/).filter(Boolean);const H=splitCsv(L[0]);return L.slice(1).map(l=>{const v=splitCsv(l);return Object.fromEntries(H.map((h,i)=>[h,v[i]]))})}catch(e){return[]}}
function splitCsv(l){const out=[];let cur="",q=false;for(const ch of l){if(ch==='"'){q=!q;continue}if(ch===","&&!q){out.push(cur);cur="";continue}cur+=ch}out.push(cur);return out}
const [pl,sn,ps,adv]=await Promise.all([csv("players/players.csv"),csv(`snap_counts/snap_counts_${season}.csv`),csv(`stats_player/stats_player_week_${season}.csv`),csv(`pfr_advstats/advstats_week_pass_${season}.csv`)]);
const byGsis={},byPfr={};pl.forEach(p=>{if(p.espn_id){if(p.gsis_id)byGsis[p.gsis_id]=p.espn_id;if(p.pfr_id)byPfr[p.pfr_id]=p.espn_id}});
const abToId={};Object.entries(teams).forEach(([id,t])=>abToId[t[0]]=id);const NVAB={LA:"LAR",WAS:"WSH",LV:"LV",JAC:"JAX"};const tid=ab=>abToId[NVAB[ab]||ab]||abToId[ab];
const gByWT={};Object.values(games).forEach(g=>{gByWT[g.w+"|"+g.h[0]]=g;gByWT[g.w+"|"+g.a[0]]=g});
let nvN=0;const xt=(g,eid)=>{g.x=g.x||{};return g.x[eid]=g.x[eid]||{}};
sn.forEach(r=>{if(r.game_type!=="REG"&&r.game_type!=="POST")return;const g=gByWT[r.week+"|"+tid(r.team)];const eid=byPfr[r.pfr_player_id];if(!g||!eid)return;const v=parseFloat(r.offense_pct);if(!isNaN(v)&&v>0){xt(g,eid).snap=Math.round(v*100)/100;nvN++}});
ps.forEach(r=>{const g=gByWT[r.week+"|"+tid(r.team)];const eid=byGsis[r.player_id];if(!g||!eid)return;const x=xt(g,eid);
  const f=k=>{const v=parseFloat(r[k]);return isNaN(v)?undefined:Math.round(v*1000)/1000};x.ay=f("receiving_air_yards");x.ts=f("target_share");x.as=f("air_yards_share");x.pay=f("passing_air_yards");x.tg=f("targets")});
adv.forEach(r=>{const g=gByWT[r.week+"|"+tid(r.team)];const eid=byPfr[r.pfr_player_id];if(!g||!eid)return;const v=parseFloat(r.times_pressured_pct);if(!isNaN(v))xt(g,eid).prs=Math.round(v*1000)/1000});
console.log(`nflverse: ${pl.length} id rows, ${sn.length} snap rows (${nvN} joined), ${ps.length} stat rows, ${adv.length} pressure rows`);
const used=new Set();Object.values(games).forEach(g=>Object.keys(g.p).forEach(id=>used.add(id)));Object.values(lines.games).forEach(g=>Object.keys(g.l).forEach(k=>used.add(k.split("|")[0])));
const athOut={};for(const id of used)if(ath[id])athOut[id]=ath[id];
/* players on current rosters at skill positions are kept even without stats yet (rookies, backups) */
for(const[id,a]of Object.entries(ath))if(/^(QB|RB|FB|WR|TE|PK|K)$/.test(a[1])&&a[5]!=="practiceSquad")athOut[id]=a;
/* this week's games still to play: venue and weather forecast (forecasts change; refreshed every run) */
const next={};await pool(open,3,async({e})=>{const c=e.competitions[0],v=c.venue||{};const g={d:e.date,ven:{n:v.fullName,c:v.address&&v.address.city,s:v.address&&v.address.state,in:v.indoor?1:0}};g.wx=await weather(g);next[e.id]={ven:g.ven,wx:g.wx,at:new Date().toISOString()}});
const out={updated:new Date().toISOString(),season,stype,week,cols:COLS,teams,ath:athOut,next,games:Object.values(games).sort((a,b)=>a.d<b.d?-1:1)};
fs.writeFileSync(DIR+"/stats.json",JSON.stringify(out));fs.writeFileSync(DIR+"/lines.json",JSON.stringify(lines));
console.log(`wrote ${out.games.length} games, ${Object.keys(athOut).length} players, lines for ${Object.keys(lines.games).length} games`);
