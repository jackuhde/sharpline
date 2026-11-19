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
const used=new Set();Object.values(games).forEach(g=>Object.keys(g.p).forEach(id=>used.add(id)));Object.values(lines.games).forEach(g=>Object.keys(g.l).forEach(k=>used.add(k.split("|")[0])));
const athOut={};for(const id of used)if(ath[id])athOut[id]=ath[id];
/* players on current rosters at skill positions are kept even without stats yet (rookies, backups) */
for(const[id,a]of Object.entries(ath))if(/^(QB|RB|FB|WR|TE|PK|K)$/.test(a[1])&&a[5]!=="practiceSquad")athOut[id]=a;
const out={updated:new Date().toISOString(),season,stype,week,cols:COLS,teams,ath:athOut,games:Object.values(games).sort((a,b)=>a.d<b.d?-1:1)};
fs.writeFileSync(DIR+"/stats.json",JSON.stringify(out));fs.writeFileSync(DIR+"/lines.json",JSON.stringify(lines));
console.log(`wrote ${out.games.length} games, ${Object.keys(athOut).length} players, lines for ${Object.keys(lines.games).length} games`);
