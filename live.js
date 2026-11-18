/* Sharpline live layer.
   Free public ESPN feeds, read straight from the phone (no key, nothing secret):
   - scoreboard: game status, scores, and DraftKings game lines (moneyline, spread, total, with opening numbers)
   - injuries:   league-wide injury report (status, latest note, time)
   - summary:    box score for a game, used to grade tracked bets automatically
   - propBets:   DraftKings player props for every player (core API), Over listed first in each pair
   - gamelog:    each player's games this season, for season and last-10 averages */
(function(root){
const BASE="https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[.'’-]/g,"").replace(/\b(jr|sr|ii|iii|iv)\b/g,"").replace(/[^a-z ]/g," ").replace(/\s+/g," ").trim();
const num=v=>{if(v==null||v==="")return null;if(/^even$/i.test(String(v)))return 100;const n=parseFloat(String(v).replace(/^[ou]/i,""));return isNaN(n)?null:n};

async function getJSON(url,timeout){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout||10000);
  try{const r=await fetch(url,{signal:c.signal,cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}}

/* ---------- scoreboard ---------- */
function parseScoreboard(j){return(j.events||[]).map(e=>{const c=(e.competitions||[])[0]||{};const cs=c.competitors||[];
  const H=cs.find(x=>x.homeAway==="home")||{},A=cs.find(x=>x.homeAway==="away")||{},st=(c.status||e.status||{}).type||{};
  const o=(c.odds||[])[0];let odds=null;
  if(o){const ml=o.moneyline||{},ps=o.pointSpread||{},tt=o.total||{},cl=x=>x&&x.close||{},op=x=>x&&x.open||{};
    odds={book:(o.provider&&(o.provider.displayName||o.provider.name))||"ESPN",
      ml:{home:num(cl(ml.home).odds),away:num(cl(ml.away).odds),homeOpen:num(op(ml.home).odds),awayOpen:num(op(ml.away).odds)},
      spread:{home:num(cl(ps.home).line),homeOdds:num(cl(ps.home).odds),away:num(cl(ps.away).line),awayOdds:num(cl(ps.away).odds),homeOpen:num(op(ps.home).line),awayOpen:num(op(ps.away).line)},
      total:{line:num(cl(tt.over).line)??num(o.overUnder),over:num(cl(tt.over).odds),under:num(cl(tt.under).odds),open:num(op(tt.over).line)}}}
  const tm=x=>x.team||{};
  return{id:e.id,date:e.date,homeId:tm(H).id,awayId:tm(A).id,home:tm(H).displayName,away:tm(A).displayName,homeAb:tm(H).abbreviation,awayAb:tm(A).abbreviation,
    homeColor:tm(H).color,awayColor:tm(A).color,homeScore:+H.score||0,awayScore:+A.score||0,
    state:st.state||"pre",completed:!!st.completed,statusName:st.name||"",detail:st.shortDetail||st.detail||"",odds,
    period:+(c.status||{}).period||0,clock:(c.status||{}).displayClock||"",clockSec:num((c.status||{}).clock)}})}
/* minutes left in regulation (or the current overtime) from period and clock */
function gameMinLeft(period,clockSec){if(!period)return 48;const c=(clockSec||0)/60;return period<=4?(4-period)*12+c:c}
const ymd=d=>d.replace(/-/g,"");
async function scoreboard(dateISO){return parseScoreboard(await getJSON(`${BASE}/scoreboard?dates=${ymd(dateISO)}`))}

/* ---------- rosters: jersey numbers ---------- */
function parseRoster(j){const out={};const list=(j.athletes||[]).flatMap(a=>a.items?a.items:[a]);
  list.forEach(a=>{if(a.displayName&&a.jersey!=null&&a.jersey!=="")out[norm(a.displayName)]=String(a.jersey)});return out}
async function roster(teamId){return parseRoster(await getJSON(`${BASE}/teams/${teamId}/roster`,12000))}
/* ---------- injuries ---------- */
/* status buckets: out (will not play), doubt, quest (questionable / game-time decision), dtd (day-to-day, usually playing) */
function bucket(inj){const s=(inj.status||"").toLowerCase(),f=((inj.details||{}).fantasyStatus||{}).abbreviation||"",txt=(inj.shortComment||"").toLowerCase();
  if(s==="out"||f==="OUT"||/\bruled out\b|\bwill not play\b|\bwon't play\b|\bout for\b/.test(txt))return"out";
  if(/doubtful/.test(s)||/\bdoubtful\b/.test(txt))return"doubt";
  if(/questionable/.test(s)||f==="GTD"||/\bquestionable\b|\bgame-time\b/.test(txt))return"quest";
  return"dtd"}
function parseInjuries(j){const out={};(j.injuries||[]).forEach(t=>(t.injuries||[]).forEach(inj=>{const a=inj.athlete||{};if(!a.displayName)return;
  out[norm(a.displayName)]={name:a.displayName,team:t.displayName||((a.team||{}).displayName)||"",status:inj.status||"",level:bucket(inj),
    note:inj.shortComment||"",date:inj.date||null,ret:(inj.details||{}).returnDate||null,src:((((a.notes||{}).items||[])[0])||{}).source||"ESPN"}}));return out}
async function injuries(){return parseInjuries(await getJSON(`${BASE}/injuries`,15000))}

/* ---------- box score ---------- */
const splitMade=v=>{const m=String(v||"").match(/^(\d+)-(\d+)$/);return m?+m[1]:null};
function parseBox(j){const comp=(((j.header||{}).competitions)||[])[0]||{},st=(comp.status||{}).type||{};
  const players={};(((j.boxscore||{}).players)||[]).forEach(T=>{const team=(T.team||{}).displayName||"";
    (T.statistics||[]).forEach(S=>{const L=(S.labels||S.names||[]).map(x=>String(x).toUpperCase()),ix=k=>L.indexOf(k);
      (S.athletes||[]).forEach(A=>{const a=A.athlete||{},s=A.stats||[];if(!a.displayName)return;
        const g=k=>{const i=ix(k);return i<0||s[i]==null||s[i]===""?null:s[i]};const n=k=>{const v=g(k);return v==null?null:parseFloat(v)};
        const min=n("MIN");const dnp=!!A.didNotPlay||!s.length||!min;
        players[norm(a.displayName)]={id:a.id,name:a.displayName,team,teamId:(T.team||{}).id,dnp,min:min||0,pts:n("PTS"),reb:n("REB"),ast:n("AST"),tpm:splitMade(g("3PT")),stl:n("STL"),blk:n("BLK"),to:n("TO"),pf:n("PF"),pm:g("+/-"),
          fg:g("FG"),tp:g("3PT"),ft:g("FT"),starter:!!A.starter,active:A.active!==false,ejected:!!A.ejected}})})});
  const cs=comp.competitors||[],H=cs.find(x=>x.homeAway==="home")||{},A=cs.find(x=>x.homeAway==="away")||{};
  const metaPost=((j.meta||{}).gameState)==="post";
  return{state:st.state||((j.meta||{}).gameState)||null,completed:!!st.completed||metaPost,statusName:st.name||"",home:(H.team||{}).displayName,away:(A.team||{}).displayName,
    homeScore:H.score!=null?+H.score:null,awayScore:A.score!=null?+A.score:null,players,
    period:+(comp.status||{}).period||0,clock:(comp.status||{}).displayClock||"",clockSec:num((comp.status||{}).clock),detail:st.shortDetail||st.detail||"",
    homeId:(H.team||{}).id,awayId:(A.team||{}).id,homeAb:(H.team||{}).abbreviation,awayAb:(A.team||{}).abbreviation,
    plays:(j.plays||[]).slice(-25).reverse().map(p=>({text:p.text||"",clock:(p.clock||{}).displayValue||"",period:((p.period||{}).number)||0,home:p.homeScore,away:p.awayScore,score:!!p.scoringPlay,teamId:(p.team||{}).id})),
    teams:(((j.boxscore||{}).teams)||[]).map(T=>({id:(T.team||{}).id,ab:(T.team||{}).abbreviation,stats:Object.fromEntries((T.statistics||[]).map(x=>[x.label||x.name,x.displayValue]))})),
    winProb:(()=>{const w=j.winprobability||[];const l=w[w.length-1];return l&&l.homeWinPercentage!=null?l.homeWinPercentage:null})()}}
async function box(eventId){return parseBox(await getJSON(`${BASE}/summary?event=${eventId}`,15000))}


/* ---------- player props (DraftKings via ESPN core API) ----------
   Items come in pairs per player, market and line: the first is the Over (or Yes), the second the Under.
   Verified against DraftKings' own milestone prices (e.g. Over 25.5 Pts+Ast = "26+" at the same price). */
const CORE="https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const PROP_TYPES={"1":"Points","2":"Assists","3":"Rebounds","4":"3-Pointers","5":"Steals","6":"Blocks",
  "87":"Pts+Ast","88":"Pts+Reb","89":"Reb+Ast","90":"Pts+Reb+Ast","92":"Double Double","93":"Triple Double"};
const YESNO={"Double Double":1,"Triple Double":1};
function parsePropBets(items){const groups={},order=[];
  (items||[]).forEach(x=>{if(!x||!x.athlete||!x.type)return;const st=PROP_TYPES[String(x.type.id)];if(!st)return;
    const m=String(x.athlete.$ref||"").match(/athletes\/(\d+)/);if(!m)return;const o=x.odds||{},am=num((o.american||{}).value);if(am==null)return;
    const L=YESNO[st]?.5:num((o.total||{}).value);if(L==null)return;const k=m[1]+"|"+st+"|"+L;
    if(!groups[k]){groups[k]={ath:m[1],st,l:L,px:[],open:[],lOpen:YESNO[st]?.5:num((o.total||{}).open),upd:x.lastUpdated||null};order.push(k)}
    const g=groups[k];g.px.push(am);g.open.push(num((o.american||{}).open));if(x.lastUpdated&&(!g.upd||x.lastUpdated>g.upd))g.upd=x.lastUpdated});
  return order.map(k=>{const g=groups[k];if(g.px.length>2)return null;
    return{ath:g.ath,st:g.st,l:g.l,o:g.px[0],u:YESNO[g.st]?null:(g.px[1]??null),oOpen:g.open[0],uOpen:g.open[1]??null,lOpen:g.lOpen,upd:g.upd,yn:!!YESNO[g.st]}}).filter(Boolean)}
/* DraftKings milestone markets ("25+ points") are alternate Over lines: 25+ is Over 24.5, one price only */
const ALT_TYPES={"Points Milestones":"Points","Assists Milestones":"Assists","Rebounds Milestones":"Rebounds","3-Point Field Goals Milestones":"3-Pointers",
  "Steals Milestones":"Steals","Blocks Milestones":"Blocks","Points + Assists + Rebounds Milestones":"Pts+Reb+Ast","Points + Assists Milestones":"Pts+Ast",
  "Points + Rebounds Milestones":"Pts+Reb","Rebounds + Assists Milestones":"Reb+Ast"};
function parseAltLines(items){const seen={},out=[];(items||[]).forEach(x=>{if(!x||!x.athlete||!x.type)return;const st=ALT_TYPES[x.type.name];if(!st)return;
  const m=String(x.athlete.$ref||"").match(/athletes\/(\d+)/),o=x.odds||{},v=String((o.total||{}).value||"").match(/^(\d+)\+$/),am=num((o.american||{}).value);if(!m||!v||am==null)return;
  const k=m[1]+"|"+st+"|"+v[1];if(seen[k])return;seen[k]=1;out.push({ath:m[1],st,l:+v[1]-.5,o:am})});return out}
async function fetchProps(eventId,provider,pages){const url=p=>`${CORE}/events/${eventId}/competitions/${eventId}/odds/${provider}/propBets?lang=en&region=us&limit=1000&page=${p}`;
  const first=await getJSON(url(1),15000);let items=first.items||[];
  for(let p=2;p<=Math.min(first.pageCount||1,pages||2);p++){const j=await getJSON(url(p),15000);items=items.concat(j.items||[])}
  const r=parsePropBets(items);r.alts=parseAltLines(items);r.count=first.count||items.length;return r}
/* live in-game DraftKings props (provider 200). Missing or empty means no live market right now. */
async function liveProps(eventId){try{return await fetchProps(eventId,200,2)}catch(e){if(/404/.test(String(e)))return Object.assign([],{alts:[],count:0,none:true});throw e}}
/* live in-game game lines (provider 200) with where live betting opened */
function parseLiveOdds(j){if(!j||!j.provider)return null;const A=j.awayTeamOdds||{},H=j.homeTeamOdds||{},am=x=>num(x&&(x.american??x.alternateDisplayValue));
  const cur=x=>(x||{}).current||{},opn=x=>(x||{}).open||{},sp=x=>num(((x||{}).pointSpread||{}).american);
  return{book:j.provider.name||"DraftKings Live",spread:{home:sp(cur(H))??num(j.spread),away:sp(cur(A)),homeOdds:am(cur(H).spread),awayOdds:am(cur(A).spread),homeOpen:sp(opn(H)),awayOpen:sp(opn(A))},
    ml:{home:num(H.moneyLine)??am(cur(H).moneyLine),away:num(A.moneyLine)??am(cur(A).moneyLine),homeOpen:am(opn(H).moneyLine),awayOpen:am(opn(A).moneyLine)},
    total:{line:num(j.overUnder),over:num(j.overOdds),under:num(j.underOdds),open:num(((((j.open||{}).total)||{}).american)||((((j.open||{}).total)||{}).alternateDisplayValue))}}}
async function liveOdds(eventId){try{return parseLiveOdds(await getJSON(`${CORE}/events/${eventId}/competitions/${eventId}/odds/200`,10000))}catch(e){if(/404/.test(String(e)))return null;throw e}}
async function propBets(eventId){return fetchProps(eventId,100,4)}

/* ---------- player game log: season and last-10 averages ---------- */
function parseGamelog(j){const names=j.names||[],ix=k=>names.indexOf(k);const ev=j.events||{};
  const reg=(j.seasonTypes||[]).find(t=>/regular/i.test(t.displayName||""));if(!reg)return null;
  const rows=[];(reg.categories||[]).forEach(c=>(c.events||[]).forEach(e=>{if(!e.stats||!e.stats.length)return;
    const s=e.stats,n=k=>{const i=ix(k);if(i<0)return null;const v=parseFloat(String(s[i]).split("-")[0]);return isNaN(v)?null:v};
    const min=n("minutes");if(!min)return;
    rows.push({id:e.eventId,t:(ev[e.eventId]||{}).gameDate||"",min,pts:n("points"),reb:n("totalRebounds"),ast:n("assists"),
      tpm:n("threePointFieldGoalsMade-threePointFieldGoalsAttempted"),stl:n("steals"),blk:n("blocks"),tov:n("turnovers")})}));
  if(!rows.length)return null;rows.sort((a,b)=>a.t<b.t?1:a.t>b.t?-1:0);
  const K=["min","pts","reb","ast","tpm","stl","blk","tov"];
  const avg=list=>{const o={gp:list.length};K.forEach(k=>{const v=list.map(r=>r[k]).filter(x=>x!=null);o[k]=v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10:null});return o};
  /* double-double and triple-double rates, counted from the games themselves */
  const cnt=r=>["pts","reb","ast","stl","blk"].filter(k=>(r[k]||0)>=10).length;
  const out={season:avg(rows),l10:rows.length>=3?avg(rows.slice(0,10)):null,dd:rows.filter(r=>cnt(r)>=2).length/rows.length,td:rows.filter(r=>cnt(r)>=3).length/rows.length,last:rows[0].t};
  return out}
/* every regular-season game as a row (newest first), for player profiles: date, opponent, home/away, result, full line */
function parseGamelogRows(j){const names=j.names||[],ix=k=>names.indexOf(k),ev=j.events||{};
  const reg=(j.seasonTypes||[]).find(t=>/regular/i.test(t.displayName||""));if(!reg)return[];const rows=[];
  (reg.categories||[]).forEach(c=>(c.events||[]).forEach(e=>{const s=e.stats||[];if(!s.length)return;const E=ev[e.eventId]||{},o=E.opponent||{};
    const raw=k=>{const i=ix(k);return i<0?null:s[i]},n=k=>{const v=parseFloat(String(raw(k)).split("-")[0]);return isNaN(v)?null:v},att=k=>{const m=String(raw(k)||"").match(/^(\d+)-(\d+)$/);return m?+m[2]:null};
    const min=n("minutes");
    rows.push({id:e.eventId,t:E.gameDate||"",opp:o.abbreviation||"",oppName:o.displayName||"",home:E.atVs==="vs",res:E.gameResult||"",score:E.score||"",
      min:min||0,dnp:!min,pts:n("points"),reb:n("totalRebounds"),ast:n("assists"),tpm:n("threePointFieldGoalsMade-threePointFieldGoalsAttempted"),tpa:att("threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
      fgm:n("fieldGoalsMade-fieldGoalsAttempted"),fga:att("fieldGoalsMade-fieldGoalsAttempted"),stl:n("steals"),blk:n("blocks"),tov:n("turnovers")})}));
  return rows.filter(r=>!r.dnp).sort((a,b)=>a.t<b.t?1:a.t>b.t?-1:0)}
async function gamelogRows(athId,season){return parseGamelogRows(await getJSON(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athId}/gamelog${season?"?season="+season:""}`,12000))}
async function gamelog(athId){return parseGamelog(await getJSON(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athId}/gamelog`,12000))}
/* roster with ESPN athlete ids, so prop feed ids can be turned into names */
function parseRosterIds(j){const out={};(j.athletes||[]).flatMap(a=>a.items?a.items:[a]).forEach(a=>{if(a.id&&a.displayName)out[a.id]={name:a.displayName,jersey:a.jersey!=null?String(a.jersey):"",pos:(a.position||{}).abbreviation||""}});return out}
async function rosterIds(teamId){return parseRosterIds(await getJSON(`${BASE}/teams/${teamId}/roster`,12000))}

/* ---------- grading ---------- */
const VOID_STATUS=/POSTPONED|CANCELED|CANCELLED|ABANDONED|FORFEIT|SUSPENDED/i;
const STAT_SUM={"Points":["pts"],"Rebounds":["reb"],"Assists":["ast"],"3-Pointers":["tpm"],"Steals":["stl"],"Blocks":["blk"],"Turnovers":["to"],
  "Pts+Reb+Ast":["pts","reb","ast"],"Pts+Reb":["pts","reb"],"Pts+Ast":["pts","ast"],"Reb+Ast":["reb","ast"],"Stl+Blk":["stl","blk"],"Double Double":"dd","Triple Double":"td"};
const cmp=(v,L,side)=>v===L?"P":(side==="o"?(v>L?"W":"L"):(v<L?"W":"L"));
/* spec: {kind:"ml"|"sp"|"tot"|"prop", team (full name), line, side "o"|"u", player, stat}
   game: {statusName, completed, home, away, homeScore, awayScore}, bx: parseBox result (needed for props)
   returns {res:"W"|"L"|"P"|"V", detail} or null when it can't be graded yet (never guesses) */
function grade(spec,game,bx){if(!spec||!game)return null;
  if(VOID_STATUS.test(game.statusName||""))return{res:"V",detail:"Game "+(game.statusName||"").replace("STATUS_","").toLowerCase()};
  if(!game.completed)return null;
  const hs=game.homeScore,as=game.awayScore;if(hs==null||as==null)return null;
  if(spec.kind==="ml"||spec.kind==="sp"){const isHome=spec.team===game.home,isAway=spec.team===game.away;if(!isHome&&!isAway)return null;
    const mine=isHome?hs:as,opp=isHome?as:hs;
    if(spec.kind==="ml")return{res:mine>opp?"W":mine<opp?"L":"P",detail:`Final ${game.away} ${as}, ${game.home} ${hs}`};
    const m=mine+spec.line-opp;return{res:m>0?"W":m<0?"L":"P",detail:`Final ${as}-${hs}, ${spec.line>0?"+":""}${spec.line} → ${m>0?"covered":m<0?"did not cover":"push"}`}}
  if(spec.kind==="tot"){const t=hs+as;return{res:cmp(t,spec.line,spec.side),detail:`Final total ${t} vs ${spec.line}`}}
  if(spec.kind==="prop"){if(!bx||!Object.keys(bx.players||{}).length)return null;const keys=STAT_SUM[spec.stat];if(!keys)return null;
    const p=bx.players[norm(spec.player)];
    if(!p)return{res:"V",detail:`${spec.player} not in the box score (did not play)`};
    if(p.dnp)return{res:"V",detail:`${spec.player} did not play`};
    if(Array.isArray(keys)&&keys.some(k=>p[k]==null))return null;
    if(keys==="dd"||keys==="td"){const need=keys==="dd"?2:3,c=["pts","reb","ast","stl","blk"].filter(k=>(p[k]||0)>=10).length,v=c>=need?1:0;
      return{res:cmp(v,spec.line,spec.side),detail:`${p.name} ${v?"got":"did not get"} a ${keys==="dd"?"double double":"triple double"}`}}
    const v=keys.reduce((a,k)=>a+p[k],0);return{res:cmp(v,spec.line,spec.side),detail:`${p.name} ${v} ${spec.stat.toLowerCase()} vs ${spec.line}`}}
  return null}

root.SharpLive={liveProps,liveOdds,parseLiveOdds,parseAltLines,fetchProps,gameMinLeft,norm,scoreboard,injuries,box,roster,parseRoster,propBets,parsePropBets,gamelog,parseGamelog,gamelogRows,parseGamelogRows,rosterIds,parseRosterIds,PROP_TYPES,parseScoreboard,parseInjuries,parseBox,grade,STAT_SUM};
})(typeof window!=="undefined"?window:globalThis);
if(typeof module!=="undefined")module.exports=globalThis.SharpLive||window.SharpLive;
