/* Sharpline Fantasy Football (Nov 26 2026). A separate tool at the end of the bottom navigation; it reads the same NFL data the
   rest of the app uses and changes nothing else.

   Data, all real and labelled where shown:
   - Actual: every completed game's box score this season (data/nfl/stats.json, from ESPN), snap share and target share
     (nflverse), the league injury report and this week's schedule, spreads and totals (ESPN / DraftKings), and DraftKings
     player prop lines for this week's games when ESPN carries them.
   - Projected: each stat comes from Sharpline's NFL prop model (nfl-model.js: recency-weighted usage, opponent vs position,
     implied team points, snap and target share trends, weather, pass-rush pressure), anchored to the DraftKings line when
     one exists, then scored with YOUR league's settings.
   - Estimated: floor and ceiling (10th and 90th percentile) from each player's own game-to-game spread in your scoring,
     shrunk toward a typical spread for his position; injury and teammate-injury adjustments (rules stated on screen).
   Not available from any free source Sharpline uses, so not modelled (and said so on screen): route participation,
   red-zone usage, two-point conversions, touchdown length, dynasty values (ages and contracts). */
(function(){
const M=window.SLNFLModel;if(!M)return;
const $=id=>document.getElementById(id),esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const LG=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},LSv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const r1=v=>Math.round(v*10)/10,f1=v=>v==null||isNaN(v)?"–":(Math.round(v*10)/10).toFixed(1),POS=["QB","RB","WR","TE","K","DST"];
const Phi=M.Phi,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------- leagues ---------- */
const PRESET={standard:{rec:0},half:{rec:.5},ppr:{rec:1}};
const SC0={pYd:.04,pTD:4,int:-2,rYd:.1,rTD:6,rec:.5,recYd:.1,recTD:6,teRec:0,fum:-2,twoPt:2,b300p:0,b100r:0,b100rec:0,lngTD:0,fg:3,xp:1,dSack:1,dInt:2,dFR:2,dTD:6,pa:"0:10,6:7,13:4,20:1,27:0,34:-1,99:-4"};
const RO0={QB:1,RB:2,WR:2,TE:1,FLEX:1,SFLEX:0,K:1,DST:1,BN:6};
/* which named format the settings match: only the reception value differs between Standard, Half-PPR and PPR */
function presetOf(sc){const strip=o=>JSON.stringify(Object.keys(SC0).filter(k=>k!=="rec").map(k=>[k,o[k]]));if(strip({...SC0,...sc})!==strip(SC0))return"custom";
  return sc.rec===0?"standard":sc.rec===.5?"half":sc.rec===1?"ppr":"custom"}
const newLeague=()=>({id:"L"+Date.now(),name:"My league",teams:10,preset:"half",sc:{...SC0},ro:{...RO0},po:{teams:4,start:15,weeks:3},
  rosters:[{name:"My team",ids:[]}],me:0});
let S=LG("sl_ff",{lgs:[],cur:null,tab:"league",trades:[],ss:{mode:"bal",sel:[]},w:null,rk:{pos:"ALL",type:"week"},wv:{pos:"ALL"},pj:{pos:"ALL",q:""},tr:{to:1,give:[],get:[]}});
const save=()=>LSv("sl_ff",S),lg=()=>S.lgs.find(l=>l.id===S.cur)||null;
const mine=L=>L.rosters[L.me]||{ids:[]};
function teamOf(L,id){const i=L.rosters.findIndex(r=>r.ids.includes(id));return i<0?null:i}


/* ---------- ESPN league import (paste the league's link) ----------
   Reads ESPN's fantasy API for one league: settings, scoring, roster slots, playoffs, every team's roster, and ESPN's own
   weekly projections in that league's scoring. Works for leagues set to be viewable to the public; ESPN refuses private
   leagues without the owner's login cookies, which Sharpline never asks for. Stat ids follow ESPN's API (as catalogued by
   the open-source espn-api project). */
const EBASE="https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const ESLOT={0:"QB",2:"RB",4:"WR",6:"TE",23:"FLEX",3:"FLEX",5:"FLEX",7:"SFLEX",16:"DST",17:"K",20:"BN"};
function espnId(link){const s=String(link||"").trim();const m=s.match(/leagueId=(\d+)/i)||s.match(/leagues\/(\d+)/)||s.match(/^(\d{3,})$/);const y=s.match(/seasonId=(\d{4})/i);return m?{id:m[1],season:y?+y[1]:null}:null}
async function espnGet(id,season,q,hdr){let r;try{r=await fetch(`${EBASE}/seasons/${season}/segments/0/leagues/${id}?${q}`,{headers:hdr||{},credentials:"omit",cache:"no-store"})}
  catch(e){throw new Error("ESPN didn't answer from this browser (blocked or offline). Try again on a different connection.")}
  if(r.status===401||r.status===403)throw new Error("This ESPN league is private. Its commissioner can turn on \"Make league viewable to public\" in ESPN's league settings (Basic Settings); then paste the link again. Sharpline never asks for your ESPN login.");
  if(r.status===404)throw new Error("ESPN has no league with that id for "+season+". Copy the link from your league's page in the ESPN app or site.");
  if(!r.ok)throw new Error("ESPN returned an error ("+r.status+").");return r.json()}
const pid=p=>p<0?"D:"+(-16000-p):String(p);
function espnScoring(items){const sc={...SC0},seen=new Set(),miss=[];const g=id=>{const x=items.find(i=>i.statId===id);return x?x.points:null};
  const set=(k,ids)=>{for(const id of ids){const v=g(id);if(v!=null){sc[k]=v;ids.forEach(i=>seen.add(i));return}}if(!["b300p","b100r","b100rec","lngTD","teRec","twoPt"].includes(k))sc[k]=0;ids.forEach(i=>seen.add(i))};
  set("pYd",[3]);set("pTD",[4]);set("int",[20]);set("rYd",[24]);set("rTD",[25]);set("recYd",[42]);set("recTD",[43]);set("rec",[53,41]);set("fum",[72]);
  set("twoPt",[19,26,44,62]);set("b300p",[17]);set("b100r",[37]);set("b100rec",[56]);set("lngTD",[35,45,15]);set("xp",[86]);set("dSack",[99]);set("dInt",[95]);set("dFR",[96]);set("dTD",[94,103,104,101,102,105]);
  /* field goals by distance: weighted by how often made field goals come from each range (about 45% under 40, 33% 40-49, 22% 50+; estimate) */
  const f0=g(80),f4=g(77),f5=g(74),f=g(83);sc.fg=f!=null?f:[f0,f4,f5].some(v=>v!=null)?+((f0||0)*.45+(f4||f0||0)*.33+(f5||f4||f0||0)*.22).toFixed(2):3;[74,77,80,83].forEach(i=>seen.add(i));
  const te=items.find(i=>(i.statId===53||i.statId===41)&&i.pointsOverrides&&i.pointsOverrides["6"]!=null);if(te)sc.teRec=+(te.pointsOverrides["6"]-sc.rec).toFixed(2);
  const pa=[[0,89],[6,90],[13,91],[17,92],[21,121],[27,122],[34,123],[45,124],[99,125]].map(([lim,id])=>{seen.add(id);const v=g(id);return v==null?null:lim+":"+v}).filter(Boolean);if(pa.length)sc.pa=pa.join(",");
  items.forEach(i=>{if(!seen.has(i.statId)&&i.points)miss.push(i.statId)});return{sc,miss,fgTiers:[f0,f4,f5]}}
function espnProj(entry,season){const st=((entry.playerPoolEntry||{}).player||entry.player||{}).stats||[];const out={},act={};
  st.forEach(x=>{if(x.seasonId!==season||!x.scoringPeriodId||(x.statSplitTypeId!=null&&x.statSplitTypeId!==1))return;if(x.statSourceId===1)out[x.scoringPeriodId]=x.appliedTotal;else if(x.statSourceId===0)act[x.scoringPeriodId]=x.appliedTotal});return{proj:out,act}}
async function importESPN(link,into){const k=espnId(link);if(!k)throw new Error("That doesn't look like an ESPN league link. It should contain leagueId=…");
  const season=k.season||D.season;const j=await espnGet(k.id,season,"view=mSettings&view=mTeam&view=mRoster");const st=j.settings||{};
  const {sc,miss,fgTiers}=espnScoring(((st.scoringSettings||{}).scoringItems)||[]);
  const ro={QB:0,RB:0,WR:0,TE:0,FLEX:0,SFLEX:0,K:0,DST:0,BN:0};const odd=[];Object.entries((st.rosterSettings||{}).lineupSlotCounts||{}).forEach(([sid,n])=>{if(!n)return;const s=ESLOT[sid];if(s)ro[s]+=n;else if(+sid!==21)odd.push(sid)});
  const sch=st.scheduleSettings||{},pt=sch.playoffTeamCount||4,len=sch.playoffMatchupPeriodLength||1;
  const L=into||newLeague();L.name=st.name||"ESPN league";L.teams=st.size||(j.teams||[]).length||L.teams;L.sc=sc;L.preset=presetOf(sc);L.ro=ro;
  L.po={teams:pt,start:clamp((sch.matchupPeriodCount||14)+1,1,18),weeks:clamp(Math.ceil(Math.log2(Math.max(2,pt)))*len,1,6)};
  const keepMe=into&&into.rosters[into.me]?into.rosters[into.me].espnTeam:null;const ep={};
  L.rosters=(j.teams||[]).map(t=>({name:t.name||[t.location,t.nickname].filter(Boolean).join(" ")||t.abbrev||"Team "+t.id,espnTeam:t.id,ids:((t.roster||{}).entries||[]).map(e=>{const id=pid(e.playerId);ep[id]=espnProj(e,season);return id})}));
  L.me=Math.max(0,L.rosters.findIndex(r=>r.espnTeam===keepMe));
  L.src={type:"espn",id:k.id,season,ts:Date.now(),miss,odd,fgTiers};L.espn=ep;
  /* ESPN's projections for players nobody rosters (waiver wire), in this league's scoring; skipped quietly if ESPN refuses */
  try{const flt={players:{filterStatus:{value:["FREEAGENT","WAIVERS"]},limit:250,sortPercOwned:{sortPriority:1,sortAsc:false}}};
    const fa=await espnGet(k.id,season,"view=kona_player_info&scoringPeriodId="+D.cur,{"x-fantasy-filter":JSON.stringify(flt)});(fa.players||[]).forEach(p=>{ep[pid(p.id)]=espnProj(p,season)});L.src.fa=(fa.players||[]).length}catch(e){L.src.fa=0}
  D.cache={};D.rosCache={};D.cal={};return L}
/* ---------- data ---------- */
const D={I:null,DEF:null,sched:{},inj:{},ready:false,err:null,pool:[],cache:{},rosCache:{},allowed:{},cal:{}};
const N=()=>window.NFL&&NFL.N;
async function load(){const n=N();if(!n)throw new Error("NFL data module didn't load");if(!n.stats)await NFL.loadStatic();if(!n.stats)throw new Error("Couldn't load this season's NFL stats");
  try{await NFL.ensure()}catch(e){}
  if(!D.I){D.I=M.index(n.stats);D.DEF=M.defense(D.I)}
  try{await NFL.loadInj()}catch(e){}D.inj=n.inj||{};
  D.cur=n.curWeek||n.week||n.stats.week;D.season=n.season||n.stats.season;
  if((n.evWeek===D.cur+"|2"||n.week===D.cur)&&n.events.length)D.sched[D.cur]=n.events.slice();
  /* DraftKings prop lines for this week's games (the projection anchors to them) */
  await Promise.all((D.sched[D.cur]||[]).filter(e=>e.state==="pre").map(e=>NFL.loadProps(e.id).catch(()=>null)));
  D.ready=true;D.cache={};D.rosCache={}}
async function week(w){if(D.sched[w]&&D.sched[w].length)return D.sched[w];const key="sl_ffsch_"+D.season+"_"+w,c=LG(key,null);if(c&&Date.now()-c.ts<6*3600e3)return D.sched[w]=c.ev;
  const j=await NFL.getJSON(`${NFL.SB}/scoreboard?seasontype=2&week=${w}&dates=${D.season}`).catch(()=>null);if(!j||!(j.events||[]).length)return D.sched[w]=null;
  const ev=(j.events||[]).map(e=>{try{return NFL.parseEvent(e)}catch(x){return null}}).filter(Boolean).map(e=>({id:e.id,date:e.date,state:e.state,home:{id:e.home.id,ab:e.home.ab},away:{id:e.away.id,ab:e.away.ab},odds:e.odds?{spread:e.odds.spread,total:e.odds.total}:null}));
  LSv(key,{ts:Date.now(),ev});return D.sched[w]=ev}
const lastWeek=L=>Math.min(18,L.po.start+L.po.weeks-1);
async function weeksFor(L){const out=[];for(let w=D.cur;w<=lastWeek(L);w++){await week(w);out.push(w)}return out}
const ath=id=>N().stats.ath[id],tAb=t=>((N().stats.teams||{})[t]||[])[0]||t;
const posOf=id=>id.startsWith("D:")?"DST":M.grp((ath(id)||[])[1]||"");
const nameOf=id=>id.startsWith("D:")?((N().stats.teams[id.slice(2)]||[])[1]||"Team")+" D/ST":(ath(id)||[])[0]||id;
const teamIdOf=id=>id.startsWith("D:")?id.slice(2):(ath(id)||[])[2];
function gameFor(w,t){const g=(D.sched[w]||[]).find(e=>e.home.id===t||e.away.id===t);if(!g)return null;const home=g.home.id===t;
  const sp=g.odds&&g.odds.spread!=null?(home?g.odds.spread:-g.odds.spread):null;return{g,opp:home?g.away.id:g.home.id,home,spread:sp,total:g.odds?g.odds.total:null}}

/* ---------- scoring ---------- */
const paTiers=sc=>String(sc.pa||SC0.pa).split(",").map(x=>x.split(":").map(Number)).filter(x=>x.length===2&&!isNaN(x[0])&&!isNaN(x[1])).sort((a,b)=>a[0]-b[0]);
function paPts(sc,pa){const T=paTiers(sc);for(const[lim,p]of T)if(pa<=lim)return p;return T.length?T[T.length-1][1]:0}
function fpGame(v,pos,sc){if(pos==="K")return v.fgM*sc.fg+v.xpM*sc.xp;
  return v.pYds*sc.pYd+v.pTD*sc.pTD+v.int*sc.int+v.rYds*sc.rYd+v.rTD*sc.rTD+v.rec*(sc.rec+(pos==="TE"?sc.teRec:0))+v.recYds*sc.recYd+v.recTD*sc.recTD+v.fumL*sc.fum+
    (v.pYds>=300?sc.b300p:0)+(v.rYds>=100?sc.b100r:0)+(v.recYds>=100?sc.b100rec:0)}
/* team defense per game: sacks and defensive TDs from the defensive box (def.json), interceptions and fumbles recovered from
   what the opposing offense gave up, points allowed from the final score */
let DEFG=null;
async function defGames(){if(DEFG)return DEFG;const j=await fetch("data/nfl/def.json?v="+(N().stats.updated||"")).then(r=>r.json()).catch(()=>null);const out={};
  const col=j&&j.cols?j.cols:[],iS=col.indexOf("sacks")+1,iT=col.indexOf("dTD")+1,cols=N().stats.cols;
  (N().stats.games||[]).forEach(g=>{[[g.h[0],g.a[0],g.a[1]],[g.a[0],g.h[0],g.h[1]]].forEach(([t,o,pa])=>{let sk=0,td=0,int=0,fr=0,osk=0;
    const dg=j&&j.games&&j.games[g.id];if(dg)Object.values(dg).forEach(r=>{if(r[0]===t){sk+=r[iS]||0;td+=r[iT]||0}});
    Object.values(g.p).forEach(r=>{if(r[0]===o){int+=r[cols.indexOf("int")+1]||0;fr+=r[cols.indexOf("fumL")+1]||0;osk+=r[cols.indexOf("sk")+1]||0}});
    (out[t]=out[t]||[]).push({gid:g.id,d:g.d,w:g.w,opp:o,sk:dg?sk:osk,td,int,fr,pa})})});
  Object.values(out).forEach(a=>a.sort((x,y)=>x.d<y.d?-1:1));return DEFG=out}
const dstPts=(x,sc)=>x.sk*sc.dSack+x.int*sc.dInt+x.fr*sc.dFR+x.td*sc.dTD+paPts(sc,x.pa);

/* what each defense allowed per game, by position, in this league's scoring (matchup difficulty) */
function allowed(L){const key=JSON.stringify(L.sc);if(D.allowed[key])return D.allowed[key];const A={},cnt={};const I=D.I;
  Object.entries(I.P).forEach(([id,games])=>{const pos=I.pos(id);if(!/QB|RB|WR|TE|K/.test(pos))return;games.forEach(x=>{const k=x.opp+"|"+pos;(A[k]=A[k]||{})[x.gid]=(A[k][x.gid]||0)+fpGame(x.v,pos,L.sc)})});
  const avg={},lg={};Object.entries(A).forEach(([k,o])=>{const v=Object.values(o);avg[k]=v.reduce((a,b)=>a+b,0)/v.length;const p=k.split("|")[1];(lg[p]=lg[p]||[]).push({t:k.split("|")[0],v:avg[k]})});
  const rank={};Object.entries(lg).forEach(([p,a])=>{a.sort((x,y)=>y.v-x.v);a.forEach((x,i)=>rank[x.t+"|"+p]={r:i+1,n:a.length,v:x.v,lg:a.reduce((s,y)=>s+y.v,0)/a.length})});
  return D.allowed[key]=rank}

/* ---------- projections ---------- */
const PRIORCV={QB:.38,RB:.55,WR:.62,TE:.7,K:.45,DST:.7};
const lnq=(m,cv,z)=>{if(m<=0)return 0;const s2=Math.log(1+cv*cv);return Math.exp(Math.log(m)-s2/2+z*Math.sqrt(s2))};
const pAtLeast=(m,cv,t)=>{if(!m||m<=0)return 0;const s2=Math.log(1+cv*cv),mu=Math.log(m)-s2/2;return 1-Phi((Math.log(t)-mu)/Math.sqrt(s2))};
function usage(id,n){const g=(D.I.P[id]||[]).slice(-n);if(!g.length)return null;const a=k=>g.reduce((s,x)=>s+(x.v[k]||0),0)/g.length;const sn=g.map(x=>x.x&&x.x.snap).filter(v=>v!=null);
  const ts=g.map(x=>x.x&&x.x.ts!=null?x.x.ts:(x.teamTgt?x.v.tgt/x.teamTgt:null)).filter(v=>v!=null);
  return{g:g.length,tgt:a("tgt"),car:a("car"),att:a("att"),snap:sn.length?sn.reduce((s,v)=>s+v,0)/sn.length:null,ts:ts.length?ts.reduce((s,v)=>s+v,0)/ts.length:null}}
/* share of the team's carries (last 4 games) */
function carShare(id){const g=(D.I.P[id]||[]).slice(-4);if(!g.length)return 0;let mine=0,team=0;g.forEach(x=>{mine+=x.v.car;const G=N().stats.games.find(z=>z.id===x.gid);if(G)Object.values(G.p).forEach(r=>{if(r[0]===x.t)team+=r[N().stats.cols.indexOf("car")+1]||0})});return team?mine/team:0}
function injOf(id){const i=D.inj[id];return i||null}
function project(L,id,w){const ck=w+"|"+id;const C=D.cache[L.id+"|"+JSON.stringify(L.sc)]=D.cache[L.id+"|"+JSON.stringify(L.sc)]||{};if(C[ck])return C[ck];
  const pos=posOf(id),t=teamIdOf(id),sc=L.sc,out={id,pos,t,w,factors:[],stats:{},mean:0,floor:0,ceil:0,conf:0};
  if(!D.sched[w]||!D.sched[w].length){out.none="Week "+w+" schedule couldn't be loaded from ESPN";out.nosched=1;return C[ck]=out}const G=gameFor(w,t);
  if(!G){out.bye=true;out.factors.push("Bye week");return C[ck]=out}
  out.opp=G.opp;out.home=G.home;out.game=G.g;out.spread=G.spread;out.total=G.total;out.final=G.g.state==="post";
  if(G.spread!=null&&G.total!=null)out.imp=G.total/2-G.spread/2;
  /* game already played: show what he actually scored, once the box score is in Sharpline's data */
  if(out.final){let act=null;if(pos==="DST"){const g=(DEFG&&DEFG[t]||[]).find(x=>x.gid===G.g.id);if(g)act=dstPts(g,L.sc)}else{const g=(D.I.P[id]||[]).find(x=>x.gid===G.g.id);if(g)act=fpGame(g.v,pos,L.sc);
      else if(N().stats.games.some(x=>x.id===G.g.id))act=0}
    if(act!=null){Object.assign(out,{mean:act,floor:act,ceil:act,conf:100,actual:act,stats:{}});out.factors.push(`Game final: actual ${f1(act)} points`);return C[ck]=out}
    out.factors.push("Game is over, but its box score isn't in Sharpline's data yet: still showing the projection")}
  if(pos==="DST")return C[ck]=projDST(L,id,w,G,out);
  const hist=D.I.P[id]||[];const games=pos==="QB"?hist.filter(x=>x.v.att>=10):hist;
  if(games.length<2){out.none=`Only ${games.length} game${games.length===1?"":"s"} this season in this role: not enough to project`;return C[ck]=out}
  const n=N(),cur=w===D.cur,nx=cur&&n.stats.next&&n.stats.next[G.g.id],wx=nx&&nx.ven&&!nx.ven.in?nx.wx:null,P=cur&&n.props?n.props[G.g.id]:null;
  const ctx=st=>({opp:G.opp,spread:G.spread,total:G.total,wx,line:P&&P.lines[id+"|"+st]?P.lines[id+"|"+st].l:null});
  const pr=st=>{const r=M.project(D.I,id,st,ctx(st),D.DEF);return r&&r.m!=null?r:null};
  let anchored=0;const get=st=>{const r=pr(st);if(r&&r.L!=null)anchored++;return r};
  const S_={};
  if(pos==="K"){const fg=get("fgM"),xp=get("xpM");S_.fgM=fg?fg.m:0;S_.xpM=xp?xp.m:0;out.parts=(fg&&fg.parts)||[]}
  else{const want=pos==="QB"?["pYds","pTD","int","rYds","td"]:["rYds","rec","recYds","td","car"];const R={};want.forEach(st=>R[st]=get(st));
    out.parts=[...new Set(["pYds","rYds","recYds","rec"].flatMap(st=>R[st]?R[st].parts.slice(1):[]))];
    S_.pYds=R.pYds?R.pYds.m:0;S_.pTD=R.pTD?R.pTD.m:0;S_.int=R.int?R.int.m:0;S_.rYds=R.rYds?R.rYds.m:0;S_.rec=R.rec?R.rec.m:0;S_.recYds=R.recYds?R.recYds.m:0;S_.car=R.car?R.car.m:null;
    /* touchdowns: the model's anytime-TD rate, split rush/receiving by his own history (shrunk toward his position) */
    const tdL=R.td?R.td.m:0,rT=hist.reduce((s,x)=>s+x.v.rTD,0),cT=hist.reduce((s,x)=>s+x.v.recTD,0),pri={QB:.95,RB:.72,WR:.04,TE:.02}[pos]||.3,sh=(rT+2*pri)/(rT+cT+2);
    S_.rTD=tdL*sh;S_.recTD=tdL*(1-sh);if(pos==="QB"){S_.rTD=tdL;S_.recTD=0}
    S_.fumL=(hist.reduce((s,x)=>s+x.v.fumL,0)+.4)/(hist.length+6);
    out.cv={pYds:R.pYds&&R.pYds.cv,rYds:R.rYds&&R.rYds.cv,recYds:R.recYds&&R.recYds.cv};
    /* teammates ruled out: their share of targets / carries goes to the others in proportion (capped) */
    if(cur&&pos!=="QB"){const mates=Object.keys(D.I.P).filter(x=>x!==id&&teamIdOf(x)===t);let outTs=0,outCar=0;const who=[];
      mates.forEach(x=>{const i=injOf(x);if(!i||(i.lv!=="out"&&i.lv!=="doubt"))return;const u=usage(x,4);if(!u)return;const ts=u.ts||0,cs=posOf(x)==="RB"?carShare(x):0;
        if(ts>=.12){outTs+=ts;who.push(`${nameOf(x)} (${Math.round(ts*100)}% of targets)`)}if(cs>=.25&&pos==="RB"){outCar+=cs;who.push(`${nameOf(x)} (${Math.round(cs*100)}% of carries)`)}});
      if(outTs>0){const b=Math.min(1.25,1/(1-Math.min(.6,outTs)));S_.rec*=b;S_.recYds*=b;S_.recTD*=b;out.factors.push(`Teammate out: ${who.join(", ")}. His targets projected +${Math.round((b-1)*100)}% (estimate: shared in proportion)`);out.opp_=1}
      if(outCar>0){const b=Math.min(1.35,1/(1-Math.min(.6,outCar)));S_.rYds*=b;S_.rTD*=b;if(S_.car)S_.car*=b;if(!outTs)out.factors.push(`Teammate out: ${who.join(", ")}. Carries projected +${Math.round((b-1)*100)}% (estimate)`);out.opp_=1}}}
  out.stats=S_;
  let m=pos==="K"?S_.fgM*sc.fg+S_.xpM*sc.xp:
    S_.pYds*sc.pYd+S_.pTD*sc.pTD+S_.int*sc.int+S_.rYds*sc.rYd+S_.rTD*sc.rTD+S_.rec*(sc.rec+(pos==="TE"?sc.teRec:0))+S_.recYds*sc.recYd+S_.recTD*sc.recTD+S_.fumL*sc.fum;
  if(pos!=="K"&&out.cv){if(sc.b300p)m+=sc.b300p*pAtLeast(S_.pYds,out.cv.pYds||.3,300);if(sc.b100r)m+=sc.b100r*pAtLeast(S_.rYds,out.cv.rYds||.55,100);if(sc.b100rec)m+=sc.b100rec*pAtLeast(S_.recYds,out.cv.recYds||.7,100)}
  /* spread of outcomes: his own game-to-game fantasy points in this scoring, shrunk toward the position's typical spread */
  const fps=games.map(x=>fpGame(x.v,pos,sc)),avg=fps.reduce((a,b)=>a+b,0)/fps.length,sd=Math.sqrt(fps.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,fps.length-1));
  let cv=avg>0?(Math.min(games.length,10)*(sd/avg)+5*PRIORCV[pos])/(Math.min(games.length,10)+5):PRIORCV[pos];cv=clamp(cv,.25,1.2);
  out.seasonAvg=avg;out.last=fps.slice(-3);out.n=games.length;let confPen=0;
  /* injury report */
  const inj=injOf(id);if(inj&&cur){out.inj=inj;
    if(inj.lv==="out"){m=0;out.factors.unshift(`${inj.st}${inj.txt?": "+inj.txt:""}. Projected 0`)}
    else if(inj.lv==="doubt"){m*=.25;cv=Math.max(cv,1);confPen=30;out.factors.unshift(`Doubtful${inj.txt?": "+inj.txt:""}. Counted as about a 25% chance to play (estimate)`)}
    else if(inj.lv==="quest"){confPen=15;out.factors.unshift(`Questionable${inj.txt?": "+inj.txt:""}. Projected as if he plays; check before kickoff`)}}
  else if(inj&&inj.lv==="out"&&/reserve|^ir/i.test(inj.st)){m=0;out.factors.unshift(`${inj.st}: projected 0 until he's activated`)}
  /* role check: how many of his team's last 3 games he actually played in this role (backups, benched or returning players) */
  const tg=(D.I.T[t]||[]).filter(x=>N().stats.games.some(z=>z.id===x.gid)).slice(-3);
  if(tg.length>=3&&!(out.inj&&out.inj.lv==="out")){const since=tg[0].d,role=x=>pos==="QB"?x.v.att>=10:pos==="K"?(x.v.fgA+x.v.xpM)>0:(x.v.car+x.v.tgt+x.v.rec)>0||(x.x&&x.x.snap>=.2);
    const played=hist.filter(x=>x.d>=since&&role(x)).length,rate=Math.min(1,played/3);
    if(rate<1){m*=rate;confPen+=rate===0?40:20;out.factors.unshift(rate===0?`Hasn't played ${pos==="QB"?"as the starter ":""}in any of his team's last 3 games: projected 0 until that changes`:`Played ${pos==="QB"?"as the starter ":""}in ${played} of his team's last 3 games: projection scaled to ${Math.round(rate*100)}% (estimate)`)}}
  /* past misses: what this model projected for him before each of his last 8 games vs what he scored (shrunk, capped) */
  const cal=calib(L,id,pos);if(cal&&m>0){m*=cal.f;if(Math.abs(cal.f-1)>=.02)out.factors.push(`Track record: scored ${Math.round(cal.r*100)}% of what this model projected before his last ${cal.n} games, so ${cal.f>1?"raised":"lowered"} ${Math.abs(Math.round((cal.f-1)*100))}%`);out.cal=cal}
  /* your app's projection: ESPN's own number for this week, in your league's scoring, blended in when the league was imported */
  const ep=L.espn&&L.espn[id]&&L.espn[id].proj&&L.espn[id].proj[w];if(ep!=null&&!(out.inj&&out.inj.lv==="out")){out.sl=m;out.espn=ep;const wt=.4;m=(1-wt)*m+wt*ep;out.factors.push(`Blended: 60% Sharpline (${f1(out.sl)}), 40% ESPN's projection (${f1(ep)})`)}
  out.mean=Math.max(0,m);out.cvp=cv;out.floor=lnq(out.mean,cv,-1.2816);out.ceil=lnq(out.mean,cv,1.2816);
  /* weather and game script */
  if(wx){out.wx=wx;if((wx.wind||0)>=15||(wx.rain||0)>=1||(wx.temp!=null&&wx.temp<=25))out.factors.push(`Weather: ${wx.temp!=null?wx.temp+"°F, ":""}wind ${wx.wind||0} mph${wx.rain?`, ${wx.rain} mm rain`:""} (forecast)`)}
  else if(nx&&nx.ven&&nx.ven.in)out.dome=1;
  const u=usage(id,3),us=usage(id,99);out.u=u;out.us=us;
  /* confidence: sample size, role stability, market anchor, injury */
  let conf=80;if(games.length<4)conf-=20;else if(games.length<7)conf-=8;if(cur&&!anchored&&pos!=="K")conf-=8;if(!cur)conf-=6;conf-=confPen;if(cv>.75)conf-=8;
  const sn=hist.slice(-5).map(x=>x.x&&x.x.snap).filter(v=>v!=null);if(sn.length>=3){const sm=sn.reduce((a,b)=>a+b,0)/sn.length,ssd=Math.sqrt(sn.reduce((a,b)=>a+(b-sm)**2,0)/sn.length);if(ssd>.15){conf-=10;out.factors.push("Snap share has swung a lot lately: role not settled")}}
  out.conf=clamp(conf,5,95);out.anchored=anchored;return C[ck]=out}
function projDST(L,id,w,G,out){const t=id.slice(2),sc=L.sc,A=DEFG||{},mineG=(A[t]||[]),oppG=(A[G.opp]||[]);
  if(mineG.length<2){out.none="Not enough games this season to project";return out}
  const rw=a=>{let ws=0,s=0;a.slice().reverse().forEach((v,i)=>{const k=Math.pow(.85,i);ws+=k;s+=k*v});return ws?s/ws:0};
  /* what this defense does vs what the opponent's offense gives up (from the opponent's games as the offense) */
  const offGave=[];Object.values(A).forEach(a=>a.forEach(x=>{if(x.opp===G.opp)offGave.push(x)}));offGave.sort((x,y)=>x.d<y.d?-1:1);
  const half=(k)=>.5*rw(mineG.map(x=>x[k]))+.5*(offGave.length?rw(offGave.map(x=>x[k])):rw(mineG.map(x=>x[k])));
  const sk=half("sk"),int=half("int"),fr=half("fr"),lgTD=Object.values(A).flat().reduce((s,x)=>s+x.td,0)/Math.max(1,Object.values(A).flat().length),td=(mineG.reduce((s,x)=>s+x.td,0)+4*lgTD)/(mineG.length+4);
  let pa=G.total!=null&&G.spread!=null?G.total/2+G.spread/2:.5*rw(mineG.map(x=>x.pa))+.5*rw(offGave.map(x=>x.pa).length?offGave.map(x=>x.pa):mineG.map(x=>x.pa));
  /* expected points-allowed score over a normal spread (sd 9.5 points) */
  let pae=0;for(let z=-3;z<=3;z+=.25){const wgt=Math.exp(-z*z/2);pae+=wgt*paPts(sc,Math.max(0,pa+z*9.5))}pae/=[...Array(25)].reduce((s,_,i)=>s+Math.exp(-((i*.25-3)**2)/2),0);
  out.stats={sk,int,fr,td,pa};out.mean=Math.max(0,sk*sc.dSack+int*sc.dInt+fr*sc.dFR+td*sc.dTD+pae);
  const fps=mineG.map(x=>dstPts(x,sc)),avg=fps.reduce((a,b)=>a+b,0)/fps.length;out.seasonAvg=avg;out.last=fps.slice(-3);out.n=fps.length;
  out.cvp=.75;out.floor=Math.max(-5,out.mean-1.28*Math.max(3,out.mean*.75));out.ceil=out.mean+1.28*Math.max(3,out.mean*.75);
  out.parts=[`${mineG.length} games: blends this defense's recent sacks, takeaways and points allowed with what ${tAb(G.opp)}'s offense has given up`,G.total!=null?`opponent implied ${r1(pa)} points from the spread and total`:"no posted total yet: points allowed from recent games"];
  out.conf=G.total!=null?62:52;return out}

/* how a player has done against this model's own pregame numbers, recomputed from past games (only data from before each game) */
function calib(L,id,pos){const key=JSON.stringify(L.sc);const C=D.cal[key]=D.cal[key]||{};if(C[id]!==undefined)return C[id];
  const hist=D.I.P[id]||[];const games=pos==="QB"?hist.filter(x=>x.v.att>=10):hist;if(games.length<5)return C[id]=null;let sp=0,sa=0,n=0;
  games.slice(-8).forEach(x=>{const before=games.filter(y=>y.d<x.d);if(before.length<3)return;const ctx={opp:x.opp,before:x.d};const pr=st=>{const r=M.project(D.I,id,st,ctx,D.DEF);return r&&r.m!=null?r.m:0};
    let p;if(pos==="K")p=pr("fgM")*L.sc.fg+pr("xpM")*L.sc.xp;else{const td=pr("td");p=pr("pYds")*L.sc.pYd*(pos==="QB"?1:0)+pr("pTD")*L.sc.pTD*(pos==="QB"?1:0)+pr("rYds")*L.sc.rYd+(pos==="QB"?td*L.sc.rTD:0)+
      (pos==="QB"?0:pr("rec")*(L.sc.rec+(pos==="TE"?L.sc.teRec:0))+pr("recYds")*L.sc.recYd+td*(pos==="RB"?(.72*L.sc.rTD+.28*L.sc.recTD):L.sc.recTD))}
    if(p>0){sp+=p;sa+=fpGame(x.v,pos,L.sc);n++}});
  if(n<3||sp<=0)return C[id]=null;const r=sa/sp,f=clamp(1+(r-1)*n/(n+10),.88,1.12);return C[id]={r,f,n}}
/* rest of season, week by week, through the end of the league's playoffs */
function ros(L,id,weeks){const ck=id+"|"+weeks.join(",");const C=D.rosCache[L.id+"|"+JSON.stringify(L.sc)]=D.rosCache[L.id+"|"+JSON.stringify(L.sc)]||{};if(C[ck])return C[ck];
  const per=weeks.map(w=>{const p=project(L,id,w);return{w,m:p.bye||p.none&&!p.n?0:p.mean,bye:!!p.bye,final:p.final}});
  const play=per.filter(x=>x.w>=L.po.start);const reg=per.filter(x=>x.w<L.po.start);
  return C[ck]={per,tot:per.reduce((s,x)=>s+x.m,0),po:play.reduce((s,x)=>s+x.m,0),reg:reg.reduce((s,x)=>s+x.m,0),wk:per.filter(x=>!x.bye).length?per.reduce((s,x)=>s+x.m,0)/per.length:0}}

/* ---------- player pool ---------- */
function buildPool(L){const I=D.I,ids=Object.keys(I.P).filter(id=>{const p=I.pos(id);if(!/^(QB|RB|WR|TE|K)$/.test(p))return false;const g=I.P[id];if(g.length<2)return false;
    const a=g.reduce((s,x)=>s+fpGame(x.v,p,L.sc),0)/g.length;return a>=2||L.rosters.some(r=>r.ids.includes(id))});
  const dst=Object.keys(N().stats.teams||{}).map(t=>"D:"+t);L.rosters.forEach(r=>r.ids.forEach(x=>{if(!ids.includes(x)&&!x.startsWith("D:"))ids.push(x)}));return D.pool=ids.concat(dst)}

/* ---------- lineups ---------- */
const elig=(slot,pos)=>slot===pos||(slot==="FLEX"&&/^(RB|WR|TE)$/.test(pos))||(slot==="SFLEX"&&/^(QB|RB|WR|TE)$/.test(pos));
const SLOTS=L=>{const s=[];["QB","RB","WR","TE","K","DST","FLEX","SFLEX"].forEach(k=>{for(let i=0;i<(+L.ro[k]||0);i++)s.push(k)});return s};
function lineup(L,ids,w,val){const left=ids.slice(),slots=SLOTS(L),out=[];val=val||(id=>project(L,id,w).mean||0);
  slots.forEach(sl=>{let b=-1,bv=-1e9;left.forEach((id,i)=>{if(!elig(sl,posOf(id)))return;const v=val(id);if(v>bv){bv=v;b=i}});
    if(b>=0){out.push({slot:sl,id:left[b],v:bv});left.splice(b,1)}else out.push({slot:sl,id:null,v:0})});
  return{start:out,bench:left,tot:out.reduce((s,x)=>s+x.v,0)}}
/* replacement level: the best player at each position left over once every team in the league has filled its starters */
function replacement(L,w,vals){const byPos={};D.pool.forEach(id=>{const p=posOf(id);(byPos[p]=byPos[p]||[]).push({id,v:vals(id)})});Object.values(byPos).forEach(a=>a.sort((x,y)=>y.v-x.v));
  const need={QB:L.ro.QB,RB:L.ro.RB,WR:L.ro.WR,TE:L.ro.TE,K:L.ro.K,DST:L.ro.DST},n=L.teams;const used={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  POS.forEach(p=>used[p]=n*(+need[p]||0));
  for(let i=0;i<n*(+L.ro.FLEX||0);i++){let b=null;["RB","WR","TE"].forEach(p=>{const c=(byPos[p]||[])[used[p]];if(c&&(!b||c.v>b.v))b={p,v:c.v}});if(b)used[b.p]++}
  for(let i=0;i<n*(+L.ro.SFLEX||0);i++){let b=null;["QB","RB","WR","TE"].forEach(p=>{const c=(byPos[p]||[])[used[p]];if(c&&(!b||c.v>b.v))b={p,v:c.v}});if(b)used[b.p]++}
  const rep={},starterAvg={};POS.forEach(p=>{const a=byPos[p]||[];rep[p]=(a[used[p]]||a[a.length-1]||{v:0}).v;const st=a.slice(0,Math.max(1,used[p]));starterAvg[p]=st.reduce((s,x)=>s+x.v,0)/st.length});return{rep,starterAvg,used}}

/* ---------- UI helpers ---------- */
const confLbl=c=>c>=70?"High":c>=50?"Medium":"Low",confCls=c=>c>=70?"hi":c>=50?"md":"lo";
const injTag=id=>{const i=D.inj[id];if(!i)return"";return`<span class="ff-inj ${i.lv}">${esc(i.lv==="out"?(/reserve|^ir/i.test(i.st)?"IR":"OUT"):i.lv==="doubt"?"D":i.lv==="quest"?"Q":"note")}</span>`};
function oppTxt(p){if(!p)return"";if(p.bye)return"Bye";if(p.none&&!p.opp)return"";return`${p.home?"vs":"@"} ${esc(tAb(p.opp))}${p.final?" · final":""}`}
function mu(L,p){if(!p||!p.opp||p.pos==="DST")return null;const R=allowed(L)[p.opp+"|"+p.pos];if(!R)return null;return{r:R.r,n:R.n,v:R.v,lg:R.lg,lbl:R.r<=8?"Easy":R.r>=R.n-7?"Hard":"Average"}}
const bar=(p,max)=>{const w=x=>clamp(x/max*100,0,100);return`<div class="ff-bar" title="Floor ${f1(p.floor)} · projection ${f1(p.mean)} · ceiling ${f1(p.ceil)}"><i style="left:${w(Math.max(0,p.floor))}%;width:${Math.max(1,w(p.ceil)-w(Math.max(0,p.floor)))}%"></i><b style="left:${w(p.mean)}%"></b></div>`};
function pRow(L,id,w,extra){const p=project(L,id,w),own=teamOf(L,id);
  return`<div class="ff-pr" data-ffx="${esc(id)}"><div class="ff-pn"><b>${esc(nameOf(id))}${injTag(id)}</b><small>${esc(p.pos)} · ${esc(tAb(p.t))} · ${oppTxt(p)}${own!=null&&own!==L.me?` · ${esc(L.rosters[own].name)}`:""}</small></div>
    ${p.bye?`<div class="ff-pv dim">Bye</div>`:p.actual!=null?`<div class="ff-pv"><b>${f1(p.actual)}</b><small>actual</small></div>`:p.none?`<div class="ff-pv dim" title="${esc(p.none)}">n/a</div>`:`<div class="ff-pv"><b>${f1(p.mean)}</b><small>${f1(p.floor)}–${f1(p.ceil)}</small></div>`}${extra||""}</div>`}
function detail(L,id,w){const p=project(L,id,w),m=mu(L,p),st=p.stats||{},S_=[];
  if(p.pos==="QB")S_.push(`${Math.round(st.pYds||0)} pass yds`,`${f1(st.pTD)} pass TD`,`${f1(st.int)} INT`,`${Math.round(st.rYds||0)} rush yds`,`${f1(st.rTD)} rush TD`);
  else if(p.pos==="K")S_.push(`${f1(st.fgM)} FG`,`${f1(st.xpM)} XP`);else if(p.pos==="DST")S_.push(`${f1(st.sk)} sacks`,`${f1(st.int)} INT`,`${f1(st.fr)} fum rec`,`${f1(st.td)} TD`,`${f1(st.pa)} pts allowed`);
  else S_.push(st.car!=null?`${f1(st.car)} car`:"",`${Math.round(st.rYds||0)} rush yds`,`${f1(st.rec)} rec`,`${Math.round(st.recYds||0)} rec yds`,`${f1((st.rTD||0)+(st.recTD||0))} TD`);
  const u=p.u,us=p.us;
  return`<div class="ff-det">${p.none?`<p class="ff-warn">${esc(p.none)}</p>`:""}
    <div class="ff-kv"><span>Projected</span><b>${p.bye?"Bye":f1(p.mean)+" pts"}</b><span>Range (estimated)</span><b>${f1(p.floor)} to ${f1(p.ceil)}</b><span>Confidence</span><b class="ff-c ${confCls(p.conf)}">${confLbl(p.conf)}</b>
    ${p.espn!=null?`<span>Sharpline / ESPN</span><b>${f1(p.sl)} / ${f1(p.espn)}</b>`:""}${p.cal?`<span>Vs past projections</span><b>${Math.round(p.cal.r*100)}% of projected, last ${p.cal.n} games</b>`:""}
    ${p.seasonAvg!=null?`<span>Actual this season</span><b>${f1(p.seasonAvg)}/g in ${p.n} g</b>`:""}${p.last&&p.last.length?`<span>Actual last ${p.last.length}</span><b>${p.last.map(f1).join(", ")}</b>`:""}
    ${m?`<span>Matchup</span><b>${m.lbl}: ${esc(tAb(p.opp))} allows ${f1(m.v)} to ${p.pos}s (${m.r}${["st","nd","rd"][m.r-1]||"th"} most of ${m.n})</b>`:""}
    ${p.imp!=null?`<span>Game script</span><b>${p.spread<0?`Favored by ${-p.spread}`:p.spread>0?`${p.spread}-point underdog`:"Pick'em"}, implied ${f1(p.imp)} pts</b>`:p.opp?`<span>Game script</span><b>No line posted yet</b>`:""}
    ${u?`<span>Workload (last ${u.g})</span><b>${[u.snap!=null?Math.round(u.snap*100)+"% snaps":"",u.ts!=null&&p.pos!=="QB"?Math.round(u.ts*100)+"% of targets":"",p.pos==="QB"?f1(u.att)+" att":"",u.car>=.5?f1(u.car)+" car":"",u.tgt>=.5?f1(u.tgt)+" tgt":""].filter(Boolean).join(" · ")}${us&&us.snap!=null&&u.snap!=null?` (season ${Math.round(us.snap*100)}%)`:""}</b>`:""}
    ${p.wx?`<span>Weather</span><b>${p.wx.temp!=null?p.wx.temp+"°F · ":""}wind ${p.wx.wind||0} mph${p.wx.rain?` · ${p.wx.rain} mm rain`:""} (forecast)</b>`:p.dome?`<span>Weather</span><b>Indoors</b>`:""}
    ${D.inj[id]?`<span>Injury report</span><b>${esc(D.inj[id].st)}${D.inj[id].txt?": "+esc(D.inj[id].txt):""}</b>`:`<span>Injury report</span><b>Not listed</b>`}</div>
    ${!p.bye&&!p.none?`<div class="ff-stl"><span>Projected stats</span> ${S_.filter(Boolean).join(" · ")}</div>`:""}
    ${(p.factors||[]).concat(p.parts||[]).length?`<ul class="ff-fac">${(p.factors||[]).concat(p.parts||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}</div>`}
function search(ctx,ph){return`<div class="ff-srch"><input data-ffq="${ctx}" placeholder="${esc(ph||"Add a player or D/ST")}" autocomplete="off"><div class="ff-res" id="ffres-${ctx}"></div></div>`}
function searchRes(L,ctx,q){const nq=q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();if(nq.length<2)return"";
  const cand=D.pool.filter(id=>nameOf(id).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").includes(nq)).slice(0,8);
  if(!cand.length)return`<div class="ff-ri dim">No player matches. Only players with at least 2 games this season are listed.</div>`;
  return cand.map(id=>{const o=teamOf(L,id);return`<button class="ff-ri" data-ffadd="${ctx}|${esc(id)}" ${o!=null&&ctx.startsWith("r")?"disabled":""}><b>${esc(nameOf(id))}</b> <small>${posOf(id)} · ${esc(tAb(teamIdOf(id)))}${o!=null?` · on ${esc(L.rosters[o].name)}`:""}</small></button>`}).join("")}

/* ---------- tabs ---------- */
const TABS=[["start","Start / Sit"],["proj","Projections"],["league","My League"],["trade","Trade"],["waiver","Waivers"],["rank","Rankings"]];
function weekSel(){const w=S.w||D.cur;const opts=[];for(let i=D.cur;i<=18;i++)opts.push(i);return`<label class="ff-wk">Week <select data-ffw>${opts.map(i=>`<option ${i===w?"selected":""} value="${i}">${i}${i===D.cur?" (this week)":""}</option>`).join("")}</select></label>`}
async function render(){const el=$("ffBody");if(!el)return;
  if(!D.ready){el.innerHTML=`<div class="empty">${D.err?esc(D.err):"Loading this season's NFL data…"}</div>`;return}
  const L=lg();
  const head=`<div class="ff-top">${S.lgs.length?`<label class="ff-lgs">League <select data-fflg>${S.lgs.map(l=>`<option value="${l.id}" ${l.id===S.cur?"selected":""}>${esc(l.name)}</option>`).join("")}</select></label>`:""}
    <button class="addbtn" data-ffnew="1">+ New league</button>${L?weekSel():""}</div>
    ${L?`<div class="seg wide ff-tabs">${TABS.map(([k,t])=>`<button class="${S.tab===k?"on":""}" data-fftab="${k}">${t}</button>`).join("")}</div>`:""}`;
  if(!L){el.innerHTML=head+`<div class="ff-card"><h3>Create your league</h3><p class="hint">Every projection, ranking, start/sit call and trade grade uses your league's scoring and roster settings. Set them up first.</p><button class="go2" data-ffnew="1">Create a league by hand</button></div>`+importBox(null);return}
  const w=S.w||D.cur;await week(w);if(S.tab==="trade"||S.tab==="waiver"||S.tab==="rank"||S.tab==="league")await weeksFor(L);
  if(L.sc.dSack!=null)await defGames();buildPool(L);
  const miss=[];for(let i=D.cur;i<=(S.tab==="start"||S.tab==="proj"?w:lastWeek(L));i++)if(!D.sched[i]||!D.sched[i].length)miss.push(i);
  const warn=miss.length?`<p class="ff-warn">Couldn't load the NFL schedule for week${miss.length>1?"s":""} ${miss.join(", ")} from ESPN, so those weeks have no projections. Check your connection and reopen this page.</p>`:"";
  const body={start:tStart,proj:tProj,league:tLeague,trade:tTrade,waiver:tWaiver,rank:tRank}[S.tab]||tLeague;
  el.innerHTML=head+warn+body(L,w)+`<p class="ff-src">Actual stats: ESPN box scores (updated ${esc(new Date(N().stats.updated).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}))}), nflverse snap and target shares, ESPN injury report. Projections: Sharpline's NFL model in your league's scoring, anchored to DraftKings player prop lines when posted, corrected for each player's record against the model's past projections, and blended 40% with ESPN's projection when your league is imported from ESPN. Floors, ceilings and injury adjustments are estimates. Not modelled (no free source): route participation, red-zone usage, two-point conversions, touchdown length.</p>`}

function tStart(L,w){const R=mine(L);if(!R.ids.length)return`<div class="empty">Add players to your team in My League first.</div>`;
  const lu=lineup(L,R.ids,w);const sel=(S.ss.sel||[]).filter(id=>R.ids.includes(id));
  const mode=S.ss.mode||"bal";
  const lineupHTML=`<div class="ff-card"><h3>Best lineup for week ${w}</h3><p class="hint">Highest projected total from your roster, filled slot by slot. Tap players below to compare any of them head to head.</p>
    ${lu.start.map(s=>`<div class="ff-slot"><span class="ff-sl">${s.slot==="SFLEX"?"SUPERFLEX":s.slot}</span>${s.id?pRow(L,s.id,w,`<label class="ff-ck"><input type="checkbox" data-ffss="${esc(s.id)}" ${sel.includes(s.id)?"checked":""}></label>`):`<div class="ff-pr dim">Empty: no eligible player on your roster</div>`}</div>`).join("")}
    <div class="ff-bn">Bench</div>${lu.bench.map(id=>`<div class="ff-slot"><span class="ff-sl">BN</span>${pRow(L,id,w,`<label class="ff-ck"><input type="checkbox" data-ffss="${esc(id)}" ${sel.includes(id)?"checked":""}></label>`)}</div>`).join("")||`<p class="hint">No bench players.</p>`}
    <p class="ff-tot">Projected starters: <b>${f1(lu.tot)}</b> pts</p></div>`;
  let cmp="";if(sel.length>=2)cmp=compare(L,sel,w,mode,lu);else cmp=`<div class="ff-card"><h3>Start / Sit</h3><p class="hint">Check two or more players above to compare them.</p></div>`;
  return`<div class="ff-card ff-mode"><span>Your week:</span><div class="seg">${[["safe","Favored: play safe"],["bal","Balanced"],["up","Underdog: need upside"]].map(([k,t])=>`<button class="${mode===k?"on":""}" data-ffmode="${k}">${t}</button>`).join("")}</div></div>`+cmp+lineupHTML}
function compare(L,ids,w,mode,lu){const k={safe:-.45,bal:0,up:.45}[mode];const P=ids.map(id=>project(L,id,w));
  const sd=p=>Math.max(1,(p.ceil-p.floor)/2.563);
  /* decision score: projection, moved by spread of outcomes for your situation, minus a reliability penalty for shaky roles */
  const score=p=>p.bye||p.none&&!p.mean?-99:p.mean+k*sd(p)-(p.conf<50?.12*sd(p):0)-(p.inj&&p.inj.lv==="quest"&&mode!=="up"?.08*p.mean:0);
  const ranked=P.slice().sort((a,b)=>score(b)-score(a)),best=ranked[0],second=ranked[1];
  const pBeat=(a,b)=>Phi((a.mean-b.mean)/Math.sqrt(sd(a)**2+sd(b)**2));
  const sameSlot=ids.every(id=>posOf(id)===posOf(ids[0]));const pos=posOf(best.id);
  const why=[];const top=P.slice().sort((a,b)=>b.mean-a.mean)[0];
  if(best.bye)why.push("Every player you picked is on a bye or can't be projected.");
  else{if(best.id===top.id)why.push(`Highest projection: ${f1(best.mean)} vs ${f1(second.mean)} for ${esc(nameOf(second.id))}, and he outscores him about ${Math.round(pBeat(best,second)*100)}% of the time.`);
    else why.push(`${esc(nameOf(top.id))} projects higher (${f1(top.mean)} vs ${f1(best.mean)}), but ${mode==="up"?`${esc(nameOf(best.id))}'s ceiling is ${f1(best.ceil)} vs ${f1(top.ceil)}, and you need a big score this week`:mode==="safe"?`${esc(nameOf(best.id))}'s floor is ${f1(best.floor)} vs ${f1(top.floor)}, and a steady score is what wins you a week you're favored in`:`${esc(nameOf(top.id))}'s projection comes with more risk (${top.inj?"injury listing, ":""}${confLbl(top.conf).toLowerCase()} confidence)`}.`);
    const mb=mu(L,best),ms=mu(L,second);if(mb&&ms&&mb.r!==ms.r)why.push(`Matchup: ${esc(nameOf(best.id))} faces the ${mb.r}${["st","nd","rd"][mb.r-1]||"th"} most generous defense to ${best.pos}s, ${esc(nameOf(second.id))} the ${ms.r}${["st","nd","rd"][ms.r-1]||"th"}.`);
    if(best.u&&second.u&&best.u.snap!=null&&second.u.snap!=null&&Math.abs(best.u.snap-second.u.snap)>=.1)why.push(`Workload: ${Math.round(best.u.snap*100)}% of snaps lately vs ${Math.round(second.u.snap*100)}%.`);
    if(second.inj)why.push(`${esc(nameOf(second.id))} is listed ${esc(second.inj.st)}.`);
    if(Math.abs(score(best)-score(second))<.75)why.unshift("Close call.");}
  /* lineup context: is a bench player better than the ones you compared? */
  const ctxNote=lu?(()=>{const bench=lu.bench.filter(id=>!ids.includes(id)&&ids.some(x=>elig(slotOf(lu,x)||posOf(x),posOf(id))));const b=bench.map(id=>project(L,id,w)).sort((a,b)=>b.mean-a.mean)[0];
    return b&&b.mean>best.mean?`<p class="ff-warn">${esc(nameOf(b.id))} on your bench projects ${f1(b.mean)}, more than any player you compared. He may be the better start.</p>`:""})():"";
  const max=Math.max(...P.map(p=>p.ceil||0),10);
  return`<div class="ff-card"><h3>Start ${esc(nameOf(best.id))}</h3>${sameSlot?"":`<p class="hint">Comparing across positions: make sure the slot you're filling (FLEX or SUPERFLEX) allows all of them.</p>`}
    <div class="ff-why">${why.map(x=>`<p>${x}</p>`).join("")}</div>${ctxNote}
    ${ranked.map((p,i)=>`<div class="ff-cmp ${i===0?"win":""}"><div class="ff-cmph"><b>${i===0?"Start":"Sit"} · ${esc(nameOf(p.id))}</b> ${injTag(p.id)}<small>${p.pos} · ${oppTxt(p)}</small></div>${p.bye||p.none?`<p class="hint">${p.bye?"Bye week":esc(p.none)}</p>`:bar(p,max)}${detail(L,p.id,w)}</div>`).join("")}</div>`}
const slotOf=(lu,id)=>{const s=lu.start.find(x=>x.id===id);return s?s.slot:null};

function tProj(L,w){const f=S.pj;const ids=D.pool.filter(id=>(f.pos==="ALL"||posOf(id)===f.pos)&&(!f.q||nameOf(id).toLowerCase().includes(f.q.toLowerCase())));
  const P=ids.map(id=>project(L,id,w)).filter(p=>!p.none&&!p.bye).sort((a,b)=>b.mean-a.mean);const rk={};POS.forEach(p=>{let i=0;P.forEach(x=>{if(x.pos===p)rk[x.id]=++i})});
  const max=Math.max(10,...P.slice(0,5).map(p=>p.ceil));
  return`<div class="ff-card"><div class="chiprow">${["ALL",...POS].map(p=>`<button class="chip s ${f.pos===p?"on":""}" data-ffpp="${p}">${p==="ALL"?"All":p}</button>`).join("")}</div>
    <input class="ff-in" data-ffpq placeholder="Search players" value="${esc(f.q||"")}">
    <p class="hint">Week ${w} projections in your scoring. Bar: estimated floor to ceiling, dot: projection. Tap a player for the stat line, matchup, workload, weather and every factor.</p>
    ${P.slice(0,f.q?40:60).map(p=>`<div class="ff-prw" data-ffopen="${esc(p.id)}"><span class="ff-rk">${p.pos}${rk[p.id]}</span>${pRow(L,p.id,w,`<div class="ff-cf ff-c ${confCls(p.conf)}">${confLbl(p.conf)}</div>`)}${bar(p,max)}${S.open===p.id?detail(L,p.id,w):""}</div>`).join("")||`<div class="empty">No projections for this filter.</div>`}</div>`}

function importBox(L){const src=L&&L.src;
  return`<div class="ff-card"><h3>${src?"Linked to ESPN":"Import from ESPN"}</h3>${src?`<p class="hint">League ${esc(src.id)} · ${src.season} · imported ${esc(new Date(src.ts).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}))}. Refresh after trades, waiver moves or lineup news; it reloads rosters, settings and ESPN's projections.${src.miss&&src.miss.length?` Scoring rules ESPN uses that Sharpline can't project: stat ${src.miss.join(", ")}.`:""}${src.odd&&src.odd.length?" Some roster slots weren't recognised.":""}${src.fgTiers&&src.fgTiers.some(v=>v!=null)?` Field goals by distance (${src.fgTiers.map(v=>v==null?"–":v).join(" / ")}) are averaged to ${L.sc.fg} per kick (estimate).`:""}</p>
      <button class="addbtn" data-ffimp="refresh">Refresh from ESPN</button>`:`<p class="hint">Paste your league's link from the ESPN app or site (it contains <b>leagueId=</b>). Sharpline copies your scoring, roster slots, playoffs and every team's roster. The league must be viewable to the public; Sharpline never asks for your ESPN login.</p>
      <div class="ff-imp"><input class="ff-in" id="ffLink" placeholder="https://fantasy.espn.com/football/league?leagueId=…" autocomplete="off" inputmode="url"><button class="addbtn" data-ffimp="new">Import</button></div>`}
    <p class="ff-warn" id="ffImpMsg" hidden></p></div>`}
function tLeague(L,w){const ro=L.ro,sc=L.sc,num=(k,v,step,lbl,o)=>`<label class="ff-f"><span>${lbl}</span><input type="number" step="${step}" data-ffset="${o}.${k}" value="${v}"></label>`;
  const R=mine(L);
  const set=`<details class="ff-card" ${L.rosters[L.me].ids.length?"":"open"}><summary><h3>League settings</h3><small>${L.teams} teams · ${({standard:"Standard",half:"Half-PPR",ppr:"PPR",custom:"Custom"})[L.preset]} · ${SLOTS(L).length} starters</small></summary>
    <div class="ff-grid"><label class="ff-f w2"><span>League name</span><input data-ffset="name" value="${esc(L.name)}"></label>${num("teams",L.teams,1,"Teams","lg")}</div>
    <div class="ff-sub">Scoring</div><div class="seg">${["standard","half","ppr","custom"].map(k=>`<button class="${L.preset===k?"on":""}" data-ffpre="${k}">${({standard:"Standard",half:"Half-PPR",ppr:"PPR",custom:"Custom"})[k]}</button>`).join("")}</div>
    <div class="ff-grid">${num("pYd",sc.pYd,.01,"Pass yard","sc")}${num("pTD",sc.pTD,1,"Pass TD","sc")}${num("int",sc.int,1,"Interception","sc")}${num("rYd",sc.rYd,.01,"Rush yard","sc")}${num("rTD",sc.rTD,1,"Rush TD","sc")}
      ${num("rec",sc.rec,.5,"Reception","sc")}${num("recYd",sc.recYd,.01,"Rec yard","sc")}${num("recTD",sc.recTD,1,"Rec TD","sc")}${num("teRec",sc.teRec,.5,"TE premium (per rec)","sc")}${num("fum",sc.fum,1,"Fumble lost","sc")}
      ${num("twoPt",sc.twoPt,1,"2-pt conversion *","sc")}${num("b300p",sc.b300p,1,"300+ pass yd bonus","sc")}${num("b100r",sc.b100r,1,"100+ rush yd bonus","sc")}${num("b100rec",sc.b100rec,1,"100+ rec yd bonus","sc")}${num("lngTD",sc.lngTD,1,"40+ yd TD bonus *","sc")}
      ${num("fg",sc.fg,1,"Field goal","sc")}${num("xp",sc.xp,1,"Extra point","sc")}${num("dSack",sc.dSack,1,"D/ST sack","sc")}${num("dInt",sc.dInt,1,"D/ST interception","sc")}${num("dFR",sc.dFR,1,"D/ST fumble rec","sc")}${num("dTD",sc.dTD,1,"D/ST touchdown","sc")}
      <label class="ff-f w2"><span>D/ST points allowed (up to:points)</span><input data-ffset="sc.pa" value="${esc(sc.pa)}"></label></div>
    <p class="hint">* Saved with your league, but not in any projection: no free data source records two-point conversions or touchdown length. Yardage bonuses are projected from each player's chance of reaching the mark. Field goals use one value for every distance.</p>
    <div class="ff-sub">Starting lineup</div><div class="ff-grid">${["QB","RB","WR","TE","FLEX","SFLEX","K","DST","BN"].map(k=>num(k,ro[k],1,k==="FLEX"?"FLEX (RB/WR/TE)":k==="SFLEX"?"SUPERFLEX (QB/RB/WR/TE)":k==="BN"?"Bench":k,"ro")).join("")}</div>
    <div class="ff-sub">Playoffs</div><div class="ff-grid">${num("teams",L.po.teams,1,"Playoff teams","po")}${num("start",L.po.start,1,"Playoffs start (week)","po")}${num("weeks",L.po.weeks,1,"Playoff weeks","po")}</div>
    <button class="addbtn" data-ffdel="1">Delete league</button></details>`;
  const weeks=[];for(let i=D.cur;i<=lastWeek(L);i++)weeks.push(i);
  const teams=`<div class="ff-card"><h3>Teams and rosters</h3><p class="hint">Add your roster, and other teams' rosters if you want waiver availability and trade impact on the other team. Players not on any roster here count as available.</p>
    ${L.rosters.map((r,i)=>`<div class="ff-team ${i===L.me?"me":""}"><div class="ff-th"><input class="ff-tn" data-fftn="${i}" value="${esc(r.name)}">${i===L.me?`<span class="ff-me">You</span>`:`<button class="lnk" data-ffme="${i}">This is me</button> <button class="lnk" data-ffrmt="${i}">Remove</button>`}<small>${r.ids.length}/${SLOTS(L).length+(+ro.BN||0)} players</small></div>
      ${r.ids.map(id=>`<div class="ff-slot">${pRow(L,id,w,`<button class="ff-x" data-ffrm="${i}|${esc(id)}" aria-label="Remove">✕</button>`)}</div>`).join("")}${search("r"+i,"Add a player to "+r.name)}</div>`).join("")}
    ${L.rosters.length<L.teams?`<button class="addbtn" data-ffaddt="1">+ Add another team</button>`:""}</div>`;
  return importBox(L)+set+(R.ids.length?evalCard(L,weeks):"")+teams}
function evalCard(L,weeks){const R=mine(L);const val=id=>ros(L,id,weeks).wk;const rp=replacement(L,weeks[0],val);const lu=lineup(L,R.ids,null,val);
  const byPos={};lu.start.forEach(s=>{if(!s.id)return;const p=posOf(s.id);(byPos[p]=byPos[p]||[]).push(s.v)});
  const rows=POS.filter(p=>byPos[p]).map(p=>{const a=byPos[p],avg=a.reduce((x,y)=>x+y,0)/a.length,d=avg-rp.starterAvg[p];return{p,avg,d,pct:rp.starterAvg[p]?d/rp.starterAvg[p]:0}}).sort((a,b)=>b.pct-a.pct);
  const missing=SLOTS(L).filter(sl=>!lu.start.some(s=>s.slot===sl&&s.id));const strong=rows[0],weak=rows[rows.length-1];
  const avail=D.pool.filter(id=>teamOf(L,id)==null);const tips=[];
  if(weak){const best=avail.filter(id=>posOf(id)===weak.p).map(id=>({id,v:val(id)})).sort((a,b)=>b.v-a.v)[0];const worst=lu.start.filter(s=>s.id&&posOf(s.id)===weak.p).sort((a,b)=>a.v-b.v)[0];
    if(best&&worst&&best.v>worst.v)tips.push(`Waivers: ${esc(nameOf(best.id))} (${f1(best.v)}/wk rest of season) beats your ${esc(nameOf(worst.id))} (${f1(worst.v)}).`);
    const surplus=lu.bench.map(id=>({id,v:val(id),p:posOf(id)})).filter(x=>x.p!==weak.p&&x.v>=rp.starterAvg[x.p]*.85).sort((a,b)=>b.v-a.v)[0];
    if(surplus)tips.push(`Trade: ${esc(nameOf(surplus.id))} (${surplus.p}, ${f1(surplus.v)}/wk) sits on your bench but would start on most teams. Packaging him for a ${weak.p} upgrade helps your lineup.`)}
  if(missing.length)tips.unshift(`You have no eligible player for: ${missing.join(", ")}.`);
  return`<div class="ff-card"><h3>Roster evaluation</h3><p class="hint">Your starters' projected points per week, rest of season (weeks ${weeks[0]} to ${weeks.at(-1)}), against the average starter at that position in a ${L.teams}-team league.</p>
    ${rows.map(r=>`<div class="ff-ev"><b>${r.p}</b><div class="ff-evb"><i class="${r.d>=0?"up":"dn"}" style="width:${Math.min(50,Math.abs(r.pct)*100)}%;${r.d>=0?"left:50%":"right:50%"}"></i></div><span class="${r.d>=0?"pos":"neg"}">${r.d>=0?"+":""}${f1(r.d)}</span></div>`).join("")}
    ${strong&&weak&&strong!==weak?`<p>Strongest: <b>${strong.p}</b>. Weakest: <b>${weak.p}</b>.</p>`:""}${tips.map(t=>`<p class="ff-tip">${t}</p>`).join("")}</div>`}

function tTrade(L,w){const weeks=[];for(let i=D.cur;i<=lastWeek(L);i++)weeks.push(i);const T=S.tr,others=L.rosters.map((r,i)=>i).filter(i=>i!==L.me);if(T.to===L.me||!L.rosters[T.to])T.to=others[0]??-1;
  const R=mine(L),P=T.to>=0?L.rosters[T.to]:null;
  const pick=(ids,side)=>ids.map(id=>`<button class="chip s ${T[side].includes(id)?"on":""}" data-fftr="${side}|${esc(id)}">${esc(nameOf(id))} <small>${posOf(id)}</small></button>`).join("");
  let res="";if(T.give.length||T.get.length)res=tradeEval(L,weeks,T.give,T.get,T.to);
  return`<div class="ff-card"><h3>Build a trade</h3>
    <label class="ff-f"><span>Trading with</span><select data-fftto><option value="-1" ${T.to<0?"selected":""}>A team not entered</option>${others.map(i=>`<option value="${i}" ${T.to===i?"selected":""}>${esc(L.rosters[i].name)}</option>`).join("")}</select></label>
    <div class="ff-sub">You give</div><div class="ff-chips">${pick(R.ids,"give")||`<p class="hint">Your roster is empty.</p>`}</div>
    <div class="ff-sub">You receive</div><div class="ff-chips">${P&&P.ids.length?pick(P.ids,"get"):""}${T.get.filter(id=>!P||!P.ids.includes(id)).map(id=>`<button class="chip s on" data-fftr="get|${esc(id)}">${esc(nameOf(id))} <small>${posOf(id)}</small></button>`).join("")}</div>
    ${!P||!P.ids.length?search("tget","Find a player you'd receive"):""}
    ${T.give.length||T.get.length?`<button class="addbtn" data-fftclr="1">Clear</button>`:""}</div>${res}${savedTrades(L)}`}
function tradeEval(L,weeks,give,get,to){const val=(id,w)=>project(L,id,w).mean||0;const po=weeks.filter(x=>x>=L.po.start);
  const team=(ids)=>{let reg=0,pl=0;weeks.forEach(w=>{const t=lineup(L,ids,w,id=>{const p=project(L,id,w);return p.bye?0:p.mean||0}).tot;if(w>=L.po.start)pl+=t;else reg+=t});return{reg,pl,tot:reg+pl}};
  const myB=mine(L).ids,myA=myB.filter(id=>!give.includes(id)).concat(get);
  const me0=team(myB),me1=team(myA);const P=to>=0?L.rosters[to]:null;let th0=null,th1=null;
  if(P&&P.ids.length){const tb=P.ids,ta=tb.filter(id=>!get.includes(id)).concat(give);th0=team(tb);th1=team(ta)}
  const rosV=id=>ros(L,id,weeks),rp=replacement(L,weeks[0],id=>rosV(id).wk);
  const sum=a=>a.reduce((s,id)=>s+rosV(id).tot,0),vor=a=>a.reduce((s,id)=>s+Math.max(0,rosV(id).wk-rp.rep[posOf(id)])*weeks.length,0);
  const gv=sum(give),rv=sum(get),gvor=vor(give),rvor=vor(get);const nW=weeks.length,dMe=(me1.tot-me0.tot)/nW,dTh=th0?(th1.tot-th0.tot)/nW:null;
  const inj=[...give,...get].filter(id=>D.inj[id]).map(id=>`${esc(nameOf(id))}: ${esc(D.inj[id].st)}`);
  const posD={};POS.forEach(p=>{const a=give.filter(id=>posOf(id)===p).length,b=get.filter(id=>posOf(id)===p).length;if(a||b)posD[p]=b-a});
  const roomOk=myA.length<=SLOTS(L).length+(+L.ro.BN||0);
  let verdict,cls;if(dMe>=1){verdict="Accept";cls="pos"}else if(dMe>=.3){verdict="Lean accept";cls="pos"}else if(dMe>-.3){verdict="Even";cls="md"}else if(dMe>-1){verdict="Lean decline";cls="neg"}else{verdict="Decline";cls="neg"}
  const why=[];why.push(`Your starting lineup ${dMe>=0?"gains":"loses"} ${f1(Math.abs(dMe))} projected points per week (${f1(me0.tot)} → ${f1(me1.tot)} over weeks ${weeks[0]} to ${weeks.at(-1)}).`);
  if(po.length)why.push(`Playoff weeks (${po[0]} to ${po.at(-1)}): ${me1.pl-me0.pl>=0?"+":""}${f1(me1.pl-me0.pl)} points for you.`);
  if(rv>gv&&dMe<0)why.push("You receive more total points, but not where your lineup needs them: what matters is who you'd actually start.");
  if(gvor>rvor+5&&dMe>0)why.push(`You give up more value above replacement (${f1(gvor)} vs ${f1(rvor)}). Good for your lineup now, but the other side gets the better assets.`);
  if(dTh!=null)why.push(`Their lineup ${dTh>=0?"gains":"loses"} ${f1(Math.abs(dTh))} per week${dMe>0&&dTh>0?": it helps both teams, which makes it easier to get accepted":dMe>0&&dTh<0?": hard to get accepted as is":""}.`);
  else why.push("Their roster isn't entered, so the effect on their team can't be measured. Add it in My League to see it.");
  if(!roomOk)why.push(`You'd have ${myA.length} players, more than your ${SLOTS(L).length+(+L.ro.BN||0)} roster spots: you'd need to drop someone.`);
  if(inj.length)why.push(`Injury report: ${inj.join("; ")}.`);
  T_last={give:give.slice(),get:get.slice(),to,dMe,dTh,gv,rv,verdict,ts:Date.now(),lg:L.id};
  return`<div class="ff-card"><h3 class="${cls}">${verdict}</h3><div class="ff-why">${why.map(x=>`<p>${x}</p>`).join("")}</div>
    <div class="ff-kv"><span>Value given (rest of season)</span><b>${f1(gv)} pts</b><span>Value received</span><b>${f1(rv)} pts</b><span>Difference</span><b class="${rv-gv>=0?"pos":"neg"}">${rv-gv>=0?"+":""}${f1(rv-gv)}</b>
    <span>Above replacement given / received</span><b>${f1(gvor)} / ${f1(rvor)}</b><span>Your lineup per week</span><b class="${dMe>=0?"pos":"neg"}">${dMe>=0?"+":""}${f1(dMe)}</b>${dTh!=null?`<span>Their lineup per week</span><b class="${dTh>=0?"pos":"neg"}">${dTh>=0?"+":""}${f1(dTh)}</b>`:""}
    <span>Positions</span><b>${Object.entries(posD).map(([p,d])=>`${p} ${d>0?"+":""}${d}`).join(" · ")}</b></div>
    <details><summary>Week by week (your lineup)</summary>${weeks.map(w2=>{const a=lineup(L,myB,w2).tot,b=lineup(L,myA,w2).tot;return`<div class="ff-wkr"><span>Week ${w2}${w2>=L.po.start?" (playoffs)":""}</span><span>${f1(a)} → ${f1(b)}</span><b class="${b-a>=0?"pos":"neg"}">${b-a>=0?"+":""}${f1(b-a)}</b></div>`}).join("")}</details>
    <button class="addbtn" data-fftsave="1">Save this trade</button></div>`}
let T_last=null;
function savedTrades(L){const a=(S.trades||[]).filter(t=>t.lg===L.id);if(!a.length)return"";
  return`<div class="ff-card"><h3>Saved trades</h3><p class="hint">Compare scenarios. Numbers were computed when saved; reopen one to re-run it with today's projections.</p>
    <div class="ff-tt"><div class="ff-ttr hd"><span>Give / receive</span><span>You /wk</span><span>Them /wk</span><span></span></div>
    ${a.map(t=>`<div class="ff-ttr"><span><b>${t.give.map(nameOf).map(esc).join(", ")||"Nothing"}</b> for <b>${t.get.map(nameOf).map(esc).join(", ")||"nothing"}</b><small>${esc(t.verdict)} · ${new Date(t.ts).toLocaleDateString([], {month:"short",day:"numeric"})}</small></span><span class="${t.dMe>=0?"pos":"neg"}">${t.dMe>=0?"+":""}${f1(t.dMe)}</span><span>${t.dTh==null?"–":(t.dTh>=0?"+":"")+f1(t.dTh)}</span><span><button class="lnk" data-fftload="${t.ts}">Open</button> <button class="lnk" data-fftdel="${t.ts}">Delete</button></span></div>`).join("")}</div></div>`}

function tWaiver(L,w){const weeks=[];for(let i=D.cur;i<=lastWeek(L);i++)weeks.push(i);const f=S.wv;const R=mine(L);
  const entered=L.rosters.filter(r=>r.ids.length).length;const val=id=>ros(L,id,weeks).wk;const rp=replacement(L,weeks[0],val);
  const lu=lineup(L,R.ids,null,val);
  const av=D.pool.filter(id=>teamOf(L,id)==null&&(f.pos==="ALL"||posOf(id)===f.pos)).map(id=>{const p=project(L,id,w),r=ros(L,id,weeks);return{id,p,r,score:r.wk*.7+(p.bye?0:p.mean||0)*.3}}).filter(x=>x.r.wk>0).sort((a,b)=>b.score-a.score).slice(0,30);
  const vs=x=>{const pos=posOf(x.id);const cand=lu.start.filter(s=>s.id&&elig(s.slot,pos)).sort((a,b)=>a.v-b.v)[0];if(cand&&x.r.wk>cand.v)return`<span class="pos">Would start over ${esc(nameOf(cand.id))} (+${f1(x.r.wk-cand.v)}/wk)</span>`;
    const bn=lu.bench.filter(id=>posOf(id)===pos).map(id=>({id,v:val(id)})).sort((a,b)=>a.v-b.v)[0];if(bn&&x.r.wk>bn.v)return`Upgrade on your bench over ${esc(nameOf(bn.id))}`;return`<span class="dim">Depth only for you</span>`};
  const trend=x=>{const u=usage(x.id,3),us=usage(x.id,99);if(!u||!us)return"";const t=[];if(u.snap!=null&&us.snap!=null&&u.snap-us.snap>=.08)t.push(`snaps up to ${Math.round(u.snap*100)}% (season ${Math.round(us.snap*100)}%)`);
    if(u.tgt-us.tgt>=1.5)t.push(`targets up to ${f1(u.tgt)}/g`);if(u.car-us.car>=3)t.push(`carries up to ${f1(u.car)}/g`);return t.length?"Trending up: "+t.join(", "):""};
  return`<div class="ff-card"><div class="chiprow">${["ALL",...POS].map(p=>`<button class="chip s ${f.pos===p?"on":""}" data-ffwp="${p}">${p==="ALL"?"All":p}</button>`).join("")}</div>
    ${entered<=1?`<p class="ff-warn">Only your roster is entered, so every other player counts as available. Add the other teams' rosters in My League (or the players they own) to see what's really on your waiver wire.</p>`:""}
    <p class="hint">Ranked by rest-of-season points per week (weeks ${weeks[0]} to ${weeks.at(-1)}) and this week's projection, in your scoring. Replacement level at each position in your league: ${POS.map(p=>`${p} ${f1(rp.rep[p])}`).join(" · ")}.</p>
    ${av.map(x=>`<div class="ff-prw" data-ffopen="${esc(x.id)}">${pRow(L,x.id,w,`<div class="ff-pv"><b>${f1(x.r.wk)}</b><small>ROS /wk</small></div>`)}<div class="ff-wv">${vs(x)}${x.p.opp_?` · <span class="pos">teammate injury opening</span>`:""}${trend(x)?` · ${trend(x)}`:""}</div>${S.open===x.id?detail(L,x.id,w):""}</div>`).join("")||`<div class="empty">No available players with a projection.</div>`}</div>`}

function tRank(L,w){const weeks=[];for(let i=D.cur;i<=lastWeek(L);i++)weeks.push(i);const f=S.rk;
  const types=[["week",`Week ${w}`],["ros","Rest of season"],["floor","Floor"],["ceil","Ceiling"],["dyn","Dynasty"]];
  if(f.type==="dyn")return`<div class="ff-card"><div class="seg wide">${types.map(([k,t])=>`<button class="${f.type===k?"on":""}" data-ffrt="${k}">${t}</button>`).join("")}</div><p class="ff-warn">Dynasty rankings aren't available: they depend on ages, contracts and long-term role, and Sharpline has no reliable free source for those. Rather than guess, this view stays empty.</p></div>`;
  const ids=D.pool.filter(id=>f.pos==="ALL"||posOf(id)===f.pos);
  const v=id=>{if(f.type==="ros")return ros(L,id,weeks).tot;const p=project(L,id,w);if(p.bye||p.none)return null;return f.type==="floor"?p.floor:f.type==="ceil"?p.ceil:p.mean};
  const a=ids.map(id=>({id,v:v(id)})).filter(x=>x.v!=null&&x.v>0).sort((x,y)=>y.v-x.v).slice(0,f.pos==="ALL"?150:60);
  return`<div class="ff-card"><div class="seg wide">${types.map(([k,t])=>`<button class="${f.type===k?"on":""}" data-ffrt="${k}">${t}</button>`).join("")}</div>
    <div class="chiprow">${["ALL",...POS].map(p=>`<button class="chip s ${f.pos===p?"on":""}" data-ffrp="${p}">${p==="ALL"?"All":p}</button>`).join("")}</div>
    <p class="hint">${f.type==="ros"?`Projected points, weeks ${weeks[0]} to ${weeks.at(-1)}, byes included`:f.type==="floor"?"Estimated 10th-percentile outcome this week: the safest options":f.type==="ceil"?"Estimated 90th-percentile outcome this week: the biggest upside":"Projected points this week"}, in your league's scoring.</p>
    <div class="ff-rl">${a.map((x,i)=>{const own=teamOf(L,x.id);return`<div class="ff-rr" data-ffopen="${esc(x.id)}"><span class="ff-rn">${i+1}</span><span class="ff-pn"><b>${esc(nameOf(x.id))}${injTag(x.id)}</b><small>${posOf(x.id)} · ${esc(tAb(teamIdOf(x.id)))}${own!=null?` · ${own===L.me?"your team":esc(L.rosters[own].name)}`:""}</small></span><b>${f1(x.v)}</b></div>${S.open===x.id?detail(L,x.id,w):""}`}).join("")}</div></div>`}

/* ---------- events ---------- */
const rer=()=>{save();render()};
function onClick(e){const t=e.target.closest("[data-ffimp],[data-fftab],[data-ffnew],[data-ffpre],[data-ffdel],[data-ffaddt],[data-ffme],[data-ffrmt],[data-ffrm],[data-ffadd],[data-ffmode],[data-ffpp],[data-ffwp],[data-ffrp],[data-ffrt],[data-fftr],[data-fftclr],[data-fftsave],[data-fftload],[data-fftdel],[data-ffopen]");
  if(!t||!t.closest("#v-ff"))return;const d=t.dataset,L=lg();
  if(d.ffimp){const msg=$("ffImpMsg"),L0=lg();const link=d.ffimp==="refresh"&&L0&&L0.src?`leagueId=${L0.src.id}&seasonId=${L0.src.season}`:(($("ffLink")||{}).value||"");
    if(msg){msg.hidden=false;msg.textContent="Importing from ESPN…"}t.disabled=true;
    (async()=>{try{if(!D.ready)await loading;const into=d.ffimp==="refresh"?L0:(L0&&!L0.src&&!L0.rosters.some(r=>r.ids.length)?L0:null);const L=await importESPN(link,into);
      if(!S.lgs.includes(L))S.lgs.push(L);S.cur=L.id;S.tab="league";save();await render();if(window.toast)toast(`Imported ${L.name}: ${L.rosters.length} teams`);
      const m2=$("ffImpMsg");if(m2&&d.ffimp==="new"){m2.hidden=false;m2.textContent="Imported. Tap \u201cThis is me\u201d on your team."}}
    catch(err){const m2=$("ffImpMsg");if(m2){m2.hidden=false;m2.textContent=err.message}t.disabled=false}})();return}
  if(d.fftab){S.tab=d.fftab;S.open=null;return rer()}
  if(d.ffnew){const l=newLeague();l.name=`League ${S.lgs.length+1}`;if(!S.lgs.length)l.name="My league";S.lgs.push(l);S.cur=l.id;S.tab="league";return rer()}
  if(!L)return;
  if(d.ffpre){L.preset=d.ffpre;if(PRESET[d.ffpre])L.sc={...SC0,pa:L.sc.pa,fg:L.sc.fg,xp:L.sc.xp,dSack:L.sc.dSack,dInt:L.sc.dInt,dFR:L.sc.dFR,dTD:L.sc.dTD,...PRESET[d.ffpre]};D.cache={};D.rosCache={};return rer()}
  if(d.ffdel){if(!confirm(`Delete "${L.name}" and its rosters? This can't be undone.`))return;S.lgs=S.lgs.filter(x=>x!==L);S.cur=S.lgs[0]?S.lgs[0].id:null;return rer()}
  if(d.ffaddt){L.rosters.push({name:`Team ${L.rosters.length+1}`,ids:[]});return rer()}
  if(d.ffme){L.me=+d.ffme;return rer()}
  if(d.ffrmt){const i=+d.ffrmt;if(L.rosters[i].ids.length&&!confirm(`Remove ${L.rosters[i].name} and its roster?`))return;L.rosters.splice(i,1);if(L.me>i)L.me--;return rer()}
  if(d.ffrm){const[i,id]=d.ffrm.split("|");L.rosters[+i].ids=L.rosters[+i].ids.filter(x=>x!==id);return rer()}
  if(d.ffadd){const[ctx,id]=d.ffadd.split("|");if(ctx.startsWith("r")){const i=+ctx.slice(1);const o=teamOf(L,id);if(o!=null)return;L.rosters[i].ids.push(id)}else if(ctx==="tget"){if(!S.tr.get.includes(id))S.tr.get.push(id)}return rer()}
  if(d.ffmode){S.ss.mode=d.ffmode;return rer()}
  if(d.ffpp){S.pj.pos=d.ffpp;return rer()}if(d.ffwp){S.wv.pos=d.ffwp;return rer()}if(d.ffrp){S.rk.pos=d.ffrp;return rer()}if(d.ffrt){S.rk.type=d.ffrt;return rer()}
  if(d.fftr){const[side,id]=d.fftr.split("|");const a=S.tr[side];const i=a.indexOf(id);i<0?a.push(id):a.splice(i,1);return rer()}
  if(d.fftclr){S.tr.give=[];S.tr.get=[];return rer()}
  if(d.fftsave){if(T_last){S.trades=(S.trades||[]).concat([T_last]);T_last=null;if(window.toast)toast("Trade saved")}return rer()}
  if(d.fftload){const x=(S.trades||[]).find(z=>String(z.ts)===d.fftload);if(x){S.tr={to:x.to,give:x.give.slice(),get:x.get.slice()}}return rer()}
  if(d.fftdel){S.trades=(S.trades||[]).filter(z=>String(z.ts)!==d.fftdel);return rer()}
  if(d.ffopen){if(e.target.closest("input,button,select,label"))return;S.open=S.open===d.ffopen?null:d.ffopen;return rer()}}
function onChange(e){const t=e.target;if(!t.closest||!t.closest("#v-ff"))return;const L=lg(),d=t.dataset;
  if(d.fflg!=null){S.cur=t.value;S.open=null;return rer()}if(!L&&d.ffw==null)return;
  if(d.ffw!=null){S.w=+t.value;return rer()}
  if(d.ffset){const[o,k]=d.ffset.includes(".")?d.ffset.split("."):[null,d.ffset];let v=t.type==="number"?parseFloat(t.value):t.value;if(t.type==="number"&&isNaN(v))return;
    if(o==="lg"||!o){if(k==="teams")v=clamp(Math.round(v),2,32);L[k]=v}else if(o==="sc"){L.sc[k]=v;L.preset=presetOf(L.sc)}
    else if(o==="ro")L.ro[k]=clamp(Math.round(v),0,10);else if(o==="po")L.po[k]=clamp(Math.round(v),k==="start"?D.cur:1,k==="start"?18:16);
    D.cache={};D.rosCache={};D.cal={};return rer()}
  if(d.fftn!=null){L.rosters[+d.fftn].name=t.value||"Team";return rer()}
  if(d.fftto!=null){S.tr.to=+t.value;S.tr.get=[];return rer()}
  if(d.ffss!=null){const a=S.ss.sel=(S.ss.sel||[]);const id=d.ffss;t.checked?a.includes(id)||a.push(id):a.splice(a.indexOf(id),1);return rer()}}
function onInput(e){const t=e.target;if(!t.closest||!t.closest("#v-ff"))return;const L=lg();if(!L)return;
  if(t.dataset.ffq!=null){const box=$("ffres-"+t.dataset.ffq);if(box)box.innerHTML=searchRes(L,t.dataset.ffq,t.value)}
  if(t.dataset.ffpq!=null){S.pj.q=t.value;clearTimeout(onInput.t);onInput.t=setTimeout(()=>{const pos=t.selectionStart;render().then(()=>{const n=document.querySelector("[data-ffpq]");if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(x){}}})},250)}}
document.addEventListener("click",onClick);document.addEventListener("change",onChange);document.addEventListener("input",onInput);

let loading=null;
async function show(){if(!$("ffBody"))return;if(!D.ready){render();if(!loading)loading=load().catch(e=>{D.err="Couldn't load NFL data: "+(e&&e.message||e)}).then(()=>{loading=null});await loading}
  else if(Date.now()-(show.ts||0)>10*60000){try{await NFL.loadInj()}catch(e){}D.inj=N().inj||{};D.cache={};D.rosCache={}}
  show.ts=show.ts||Date.now();if(!S.cur&&S.lgs[0])S.cur=S.lgs[0].id;await render()}
window.FF={show,render,_D:D,_S:()=>S,_project:project,_lineup:lineup,_fp:fpGame,_ros:ros,_replacement:replacement};
})();
