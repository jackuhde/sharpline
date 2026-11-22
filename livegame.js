/* Sharpline Live: in-game scores, live DraftKings lines and player props, and Sharpline's in-game projections.
   Sources (all free, read from this phone): ESPN scoreboard (score, period, clock), ESPN game summary (box score, plays,
   win probability), ESPN core odds provider 200 "DraftKings - Live Odds" (live game lines and live player props).
   Nothing here is simulated. If a feed is missing or old, the screen says so and hides edges.
   ESPN keeps no line history, so movement charts show only changes this phone saw while Sharpline was open. */
(function(){
const POLL=20000,PROPS_OPEN=25000,PROPS_BG=60000,BOX_BG=40000,FRESH=75000;
const LV={sb:[],sbTs:0,sbOk:null,g:{},timer:null,open:null,tab:"props",stat:"all",valOnly:false,exp:{},busy:false};
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const r1=v=>v==null||isNaN(v)?"–":(Math.round(v*10)/10).toString();
const ALPHA={pts:2.6,reb:1.5,ast:1.5,tpm:1.2,stl:1.1,blk:1.1};
const LIVE_ST=["Points","Rebounds","Assists","3-Pointers","Pts+Reb+Ast","Pts+Reb","Pts+Ast","Reb+Ast","Steals","Blocks"];
const ESPN_AB={NY:"NYK",SA:"SAS",GS:"GSW",NO:"NOP",UTAH:"UTA",WSH:"WAS"},ab2=a=>ESPN_AB[a]||a;
let HIST={},HIST_D=null;try{const h=JSON.parse(localStorage.getItem("sl_lhist")||"{}");HIST=h.h||{};HIST_D=h.d||null}catch(e){}
const saveHist=()=>{if(HIST_D!==DATA_DATE){if(HIST_D)HIST={};HIST_D=DATA_DATE}try{localStorage.setItem("sl_lhist",JSON.stringify({d:DATA_DATE,h:HIST}))}catch(e){}};
const gameOf=id=>LV.g[id]||(LV.g[id]={odds:null,oddsTs:0,props:{},propsTs:0,propsOk:null,propsFetched:0,noMarket:false,pre:null,box:null,boxTs:0,boxOk:null,lines:[]});

/* ---------- polling ---------- */
/* poll whenever the app is open and any game is in progress, on every tab, so live prices, the tracker's live chances
   and player profiles stay current; otherwise only while the Live tab or a game is open */
function anyLive(){return LV.sb.some(e=>e.state==="in")||Object.values((window.LIVE&&LIVE.ev)||{}).some(e=>e&&e.state==="in")}
function wanted(){return document.getElementById("v-live")?.classList.contains("on")||!!LV.open||anyLive()}
async function poll(force){if(LV.busy||document.hidden)return;if(!force&&!wanted())return;LV.busy=true;document.body.classList.add("lv-busy");
  try{try{LV.sb=await SharpLive.scoreboard(DATA_DATE);LV.sbTs=Date.now();LV.sbOk=true}catch(e){LV.sbOk=false}
    const live=LV.sb.filter(e=>e.state==="in"),now=Date.now();
    await Promise.all(live.map(async e=>{const G=gameOf(e.id),isOpen=LV.open===e.id;
      const jobs=[!G.preOddsTried&&(G.preOddsTried=1,SharpLive.preOdds(e.id).then(o=>{G.preOdds=o}).catch(()=>{G.preOddsTried=0})),SharpLive.liveOdds(e.id).then(o=>{if(o){recLine(e.id,o);G.odds=o}G.oddsTs=Date.now()}).catch(()=>{})];
      if(isOpen||now-G.boxTs>BOX_BG)jobs.push(SharpLive.box(e.id).then(b=>{G.box=b;G.boxTs=Date.now();G.boxOk=true}).catch(()=>{G.boxOk=false}));
      if(isOpen||now-G.propsFetched>PROPS_BG||force)jobs.push(SharpLive.liveProps(e.id).then(r=>{mergeProps(e.id,r);G.propsTs=Date.now();G.propsOk=true}).catch(()=>{G.propsOk=false}).finally(()=>{G.propsFetched=Date.now()}));
      if(!G.pre)jobs.push(SharpLive.fetchProps(e.id,100,1).then(r=>{G.pre={};r.forEach(m=>{G.pre[m.ath+"|"+m.st]=m})}).catch(()=>{}));
      await Promise.all(jobs)}));
    /* season stats for anyone with a live market but no averages yet (bench players without pregame props) */
    const need=[];live.forEach(e=>Object.values(gameOf(e.id).props).forEach(m=>{if(LIVE.ids[m.ath]&&!(m.ath in LIVE.logs)&&!need.includes(m.ath))need.push(m.ath)}));
    if(need.length){await Promise.all(need.slice(0,6).map(a=>SharpLive.gamelog(a).then(v=>{LIVE.logs[a]=v||0}).catch(()=>{LIVE.logs[a]=0})));buildProj()}
    saveHist()}finally{LV.busy=false;document.body.classList.remove("lv-busy")}
  render()}
function start(){if(LV.timer)return;LV.timer=setInterval(()=>poll(false),POLL);poll(true)}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&wanted())poll(true)});

/* record line and price changes this phone sees */
function push(k,pt){const h=HIST[k]||(HIST[k]=[]),l=h[h.length-1];if(l&&l.l===pt.l&&l.o===pt.o&&l.u===pt.u)return;h.push(pt);if(h.length>80)h.splice(0,h.length-80)}
function recLine(id,o){push(id+"|total",{t:Date.now(),l:o.total.line,o:o.total.over,u:o.total.under});push(id+"|spread",{t:Date.now(),l:o.spread.home,o:o.spread.homeOdds,u:o.spread.awayOdds})}
/* ESPN's per-market update times run on a shifted clock, so compare each market only with the newest one in the same feed:
   a line that hasn't moved for minutes while the game keeps going is treated as outdated */
const LAG_MAX=4*60000;
function mergeProps(id,r){const G=gameOf(id),now=Date.now(),seen=new Set();G.noMarket=!!r.none||!r.length;
  const ts=r.map(m=>Date.parse(m.upd)).filter(x=>!isNaN(x)),newest=ts.length?Math.max(...ts):null;
  r.forEach(m=>{const k=m.ath+"|"+m.st;seen.add(k);const p=G.props[k]||(G.props[k]={ath:m.ath,st:m.st});
    const u=Date.parse(m.upd);Object.assign(p,{l:m.l,o:m.o,u:m.u,lOpen:m.lOpen,oOpen:m.oOpen,uOpen:m.uOpen,yn:m.yn,seen:now,gone:false,lag:newest!=null&&!isNaN(u)?newest-u:null});push(id+"|"+k,{t:now,l:m.l,o:m.o,u:m.u})});
  Object.keys(G.props).forEach(k=>{if(!seen.has(k)&&!G.props[k].gone){G.props[k].gone=true;G.props[k].goneTs=now}});
  G.alts=r.alts||[]}

/* ---------- live model ---------- */
const comps=st=>STAT_COMP[st]||null;
function curOf(pl,st){const c=comps(st);if(!c||!pl)return 0;return c.reduce((a,k)=>a+(pl[k]||0),0)}
/* expected minutes still to play: his usual share of what's left, cut for foul trouble and blowouts */
function minutesLeft(pl,P,e,box){const left=SharpLive.gameMinLeft(e.period,e.clockSec);const smin=P&&(P.min||P.l10min);if(!smin)return null;
  if(pl&&(pl.ejected||(pl.pf||0)>=6))return{m:0,why:pl.ejected?"ejected":"fouled out"};
  let share=Math.min(.92,smin/48),m=left*share;const why=[];
  const pf=(pl&&pl.pf)||0;if(pf===5){m*=.75;why.push("5 fouls")}else if(pf===4&&e.period<=3){m*=.85;why.push("4 fouls")}else if(pf===3&&e.period<=2){m*=.93;why.push("3 fouls in the first half")}
  const mar=Math.abs((e.homeScore||0)-(e.awayScore||0));if(e.period>=4&&mar>=20){m*=.5;why.push(`${mar}-point game, starters may sit`)}else if(e.period>=4&&mar>=15){m*=.75;why.push(`${mar}-point game`)}else if(e.period===3&&mar>=25){m*=.8;why.push(`${mar}-point game`)}
  return{m,why,left}}
function model(id,mk){const e=LV.sb.find(x=>x.id===id),G=gameOf(id);if(!e||mk.yn)return null;const c=comps(mk.st);if(!c)return null;
  const who=LIVE.ids[mk.ath],name=who?who.name:null,pl=G.box&&name?G.box.players[SharpLive.norm(name)]:null,P=name?projOf(name):null;if(!P)return null;
  const ml=minutesLeft(pl,P,e,G.box);if(!ml)return null;const smin=P.min||P.l10min,pmin=(pl&&pl.min)||0,w=pmin/(pmin+36);
  let mean=0,vr=0;c.forEach(k=>{const rs=P.l10&&P.l10[k]!=null&&P.l10min?(.5*P[k]/smin+.5*P.l10[k]/P.l10min):P[k]/smin,rg=pmin?((pl[k]||0)/pmin):rs,rate=(1-w)*rs+w*rg;mean+=rate*ml.m;vr+=(ALPHA[k]||1.4)*rate*ml.m});
  const cur=curOf(pl,mk.st),need=mk.l-cur,pois=COUNT_ST[mk.st]||mean<5,sdR=Math.sqrt(Math.max(vr,.5));
  const over=(mu,nd)=>nd<0?1:mu<=0?0:pois?poisOver(mu,nd):1-Phi((nd-mu)/sdR);
  const pOverRaw=over(mean,need);
  let pm=mk.o!=null&&mk.u!=null?devig(mk.o,mk.u)[0]:mk.o!=null?Math.max(.01,imp(mk.o)-.025):null;
  /* DraftKings' live line at another number still says where the market thinks he'll finish: find the remaining-stat
     mean that matches its price at its line, then read the chance at the bet's line from that */
  let anch=null;const A=mk.anchor;if(pm==null&&A&&A.l!=null&&A.o!=null&&A.u!=null&&mean>0){const pA=devig(A.o,A.u)[0],nA=A.l-cur;
    if(nA>=0&&pA>.02&&pA<.98){let lo=0,hi=Math.max(4*mean,mean+40);for(let i=0;i<50;i++){const md=(lo+hi)/2;over(md,nA)<pA?lo=md:hi=md}pm=over((lo+hi)/2,need);anch=A.l}}
  /* live markets react to things this model can't see (rotations, matchups, pace in real time), so lean on them:
     35% model, 65% DraftKings' no-vig chance, and never more than 4 points from the market */
  const pO=pm!=null?Math.min(pm+.04,Math.max(pm-.04,pm+.35*(pOverRaw-pm))):pOverRaw;
  return withSides({name,pl,P,cur,need,remMean:mean,final:cur+mean,minLeft:ml.m,gameLeft:ml.left,mwhy:ml.why,pOverRaw,pm,pO,anch,thin:!!(P.gp!=null&&P.gp<5),capped:pm!=null},mk.o,mk.u,cur+mean>=mk.l?"o":"u")}
/* Both sides judged at their own posted prices. A bet is only "good value" when Sharpline's chance beats the price,
   never just because the projection is past the line. */
function withSides(m,o,u,lean){const sd=(p,price)=>price==null?null:{p,price,imp:imp(price),ev:evOf(p,price),gap:p-imp(price)};
  m.sides={o:sd(m.pO,o),u:sd(1-m.pO,u)};m.oneSide=o==null||u==null;
  const best=!m.oneSide?(m.sides.o.ev>=m.sides.u.ev?"o":"u"):lean;m.side=best;const S=m.sides[best];
  m.p=best==="o"?m.pO:1-m.pO;m.price=S?S.price:null;m.imp=S?S.imp:null;m.ev=S&&!m.oneSide?S.ev:null;return m}
/* value verdict used everywhere in Live: positive, marginal, negative, or not enough to say */
function verdict(m,isFresh){if(!m)return{k:"na",t:"No estimate"};if(!isFresh)return{k:"na",t:"Price not current"};if(m.oneSide||m.ev==null)return{k:"na",t:"Only one side posted"};
  if(m.thin)return{k:"na",t:"Too few games to rate"};if(m.ev>=.03)return{k:"pos",t:"Good value"};if(m.ev>=0)return{k:"mid",t:"Close to fair"};return{k:"neg",t:"Poor price"}}
function fresh(id,mk){const G=gameOf(id);return!mk.gone&&G.propsOk!==false&&Date.now()-G.propsTs<FRESH&&!(mk.lag>LAG_MAX)}

/* ---------- views ---------- */
const teamTag=(ab,full)=>{const[,c1,c2]=team(full||"");return`<span class="lv-tm" style="--c1:${c1};--c2:${c2}">${esc(ab2(ab))}</span>`};
const statusTxt=e=>e.state==="in"?(/^0(\.0)?$|^0:00$/.test(e.clock||"")||!e.clockSec?(e.detail||"Break"):(e.period>4?"OT"+(e.period>5?e.period-4:""):"Q"+e.period)+" · "+e.clock):e.state==="post"?"Final":tipLocal(e);
const tipLocal=e=>new Date(e.date).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
const upd=ts=>ts?ago(ts):"never";
function feedBar(){const age=LV.sbTs?Date.now()-LV.sbTs:null,old=age==null||age>FRESH;
  /* quiet by default: a time stamp, a spinner only while fetching, and a warning only when data is stale or failed */
  if(LV.sbOk===false)return`<div class="lv-feed old"><span class="dot"></span>Can't reach ESPN right now. Showing the update from ${hm(LV.sbTs)}.</div>`;
  if(old&&LV.sbTs)return`<div class="lv-feed old"><span class="dot"></span>Scores may be out of date. Last update ${hm(LV.sbTs)}.</div>`;
  return`<div class="lv-feed"><span class="dot"></span>${LV.sbTs?"Updated "+hm(LV.sbTs):"Updating…"}</div>`}
const hm=ts=>ts?new Date(ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"–";
function staleNote(G){const s=[],old=ts=>ts&&Date.now()-ts>FRESH*2;if(G.oddsOk===false||old(G.oddsTs))s.push("game lines "+hm(G.oddsTs));if(G.propsOk===false||old(G.propsTs))s.push("props "+hm(G.propsTs));
  return s.length?`<div class="lv-upd warn">Last good update: ${s.join(", ")}. Prices may have moved.</div>`:""}
function valueCount(id){const G=gameOf(id);let n=0;Object.values(G.props).forEach(mk=>{if(!fresh(id,mk))return;const m=model(id,mk);if(m&&m.ev!=null&&m.ev>=.03)n++});return n}
function topPerf(id){const G=gameOf(id);if(!G.box)return"";const ps=Object.values(G.box.players).filter(p=>!p.dnp).sort((a,b)=>(b.pts||0)-(a.pts||0)).slice(0,3);
  return ps.map(p=>`<span>${esc(p.name.split(" ").slice(-1)[0])} <b>${p.pts}</b>p ${p.reb}r ${p.ast}a</span>`).join("")}
function gameCard(e){const G=gameOf(e.id),o=G.odds,n=Object.values(G.props).filter(m=>!m.gone).length,v=valueCount(e.id);
  return`<div class="lv-row"><div class="lv-teams">
    <div class="lv-t">${teamTag(e.awayAb,e.away)}<b class="sc" data-sc="${e.id}a">${e.awayScore}</b></div>
    <div class="lv-t">${teamTag(e.homeAb,e.home)}<b class="sc" data-sc="${e.id}h">${e.homeScore}</b></div></div>
    <div class="lv-clock"><span class="lv-live">Live</span><b>${esc(statusTxt(e))}</b></div></div>
    <div class="lv-mk">${o?`<span>Live total <b>${o.total.line??"–"}</b></span><span>Spread <b>${ab2(e.homeAb)} ${o.spread.home>0?"+":""}${o.spread.home??"–"}</b></span>`:`<span>No live game line right now</span>`}
      <span>${n?`<b>${n}</b> live player markets`:G.propsFetched?"No live player markets":"Loading markets"}</span>${v?`<span class="lv-val">${v} with potential value</span>`:""}</div>
    ${G.box?`<div class="lv-perf">${topPerf(e.id)}</div>`:""}
    ${staleNote(G)}`}
const SC={};
function syncCards(box,live){const have=new Map([...box.querySelectorAll("[data-lvg]")].map(b=>[b.dataset.lvg,b]));
  live.forEach((e,i)=>{let b=have.get(e.id);if(!b){b=document.createElement("button");b.className="lv-card";b.dataset.lvg=e.id}have.delete(e.id);
    const h=gameCard(e);if(b._h!==h){b.innerHTML=h;b._h=h}
    const prev=SC[e.id];if(prev&&(prev.a!==e.awayScore||prev.h!==e.homeScore)){const el=b.querySelector(prev.a!==e.awayScore?'[data-sc$="a"]':'[data-sc$="h"]');if(el){el.classList.remove("bump");void el.offsetWidth;el.classList.add("bump")}}
    SC[e.id]={a:e.awayScore,h:e.homeScore};if(box.children[i]!==b)box.insertBefore(b,box.children[i]||null)});
  have.forEach(b=>b.remove())}
let lastList="",lastGame="";
function renderList(){const el=document.getElementById("liveBody");if(!el)return;
  const live=LV.sb.filter(e=>e.state==="in"),pre=LV.sb.filter(e=>e.state==="pre"),post=LV.sb.filter(e=>e.state==="post");
  const html=feedBar()+(!LV.sbTs?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Checking for games in progress…</span></div>`:
    (live.length?`<div class="lv-h">In progress <em>${live.length}</em></div><div id="lvCards"></div>`
      :`<div class="pf-empty"><b style="color:var(--ink)">No games in progress right now.</b> Live scores, live lines and live player props appear here once a game tips off. ${pre.length?`Next tip: ${esc(ab2(pre[0].awayAb))} @ ${esc(ab2(pre[0].homeAb))} at ${tipLocal(pre[0])}.`:""}</div>`)+
    (pre.length?`<div class="lv-h">Up next</div><div class="lv-mini">${pre.map(e=>`<div><span>${esc(ab2(e.awayAb))} @ ${esc(ab2(e.homeAb))}</span><b>${/DELAYED/.test(e.statusName)?"Delayed":/POSTPONED|CANCELED/.test(e.statusName)?"Postponed":tipLocal(e)}</b></div>`).join("")}</div>`:"")+
    (post.length?`<div class="lv-h">Final</div><div class="lv-mini">${post.map(e=>`<div><span>${esc(ab2(e.awayAb))} ${e.awayScore} @ ${esc(ab2(e.homeAb))} ${e.homeScore}</span><b>Final</b></div>`).join("")}</div>`:""))+
    `<p class="pf-foot">Live lines and live player props are DraftKings' in-game markets as published through ESPN. Projections are Sharpline's model. Bet only after confirming the price at your book; live prices change in seconds.</p>`;
  const cards=document.getElementById("lvCards"),keep=cards&&cards.parentNode===el?cards:null;
  if(html!==lastList){if(keep)keep.remove();el.innerHTML=html;lastList=html;const slot=document.getElementById("lvCards");if(keep&&slot)slot.replaceWith(keep)}
  const box=document.getElementById("lvCards");if(box)syncCards(box,live);
  const nb=document.querySelector('.nav [data-v="live"]');if(nb)nb.classList.toggle("haslive",live.length>0)}

/* ---------- game view ---------- */
function moveChart(k,pre,mk){const h=(HIST[k]||[]).filter(p=>p.l!=null);const pts=[];if(pre&&pre.l!=null)pts.push({lbl:"Pregame",l:pre.l});if(mk.lOpen!=null)pts.push({lbl:"Live open",l:mk.lOpen});
  h.forEach(p=>pts.push({lbl:new Date(p.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}),l:p.l,o:p.o,u:p.u}));if(pts.length<2)return`<div class="lv-nomove">No movement recorded yet. Sharpline records changes while this screen is open.</div>`;
  const ls=pts.map(p=>p.l),mn=Math.min(...ls),mx=Math.max(...ls),W=320,H=70,pad=12,x=i=>pad+i*(W-2*pad)/(pts.length-1),y=l=>mx===mn?H/2:H-pad-(l-mn)/(mx-mn)*(H-2*pad);
  let d="";pts.forEach((p,i)=>{d+=i?`H${x(i)}V${y(p.l)}`:`M${x(0)} ${y(p.l)}`});
  const changes=[];for(let i=1;i<h.length;i++){const a=h[i-1],b=h[i];if(a.l!==b.l)changes.push(`<li><b>Line</b> ${a.l} → ${b.l}<span>${new Date(b.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></li>`);else if(a.o!==b.o||a.u!==b.u)changes.push(`<li><b>Price</b> O ${fmtAm(a.o)} / U ${fmtAm(a.u)} → O ${fmtAm(b.o)} / U ${fmtAm(b.u)}<span>${new Date(b.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></li>`)}
  return`<svg class="lv-move" viewBox="0 0 ${W} ${H}"><path d="${d}"/>${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.l)}" r="3.5"><title>${esc(p.lbl)}: ${p.l}${p.o!=null?` (O ${fmtAm(p.o)} / U ${fmtAm(p.u)})`:""}</title></circle>`).join("")}
    <text x="${pad}" y="${H-1}">${esc(pts[0].lbl)} ${pts[0].l}</text><text x="${W-pad}" y="${H-1}" text-anchor="end">Now ${pts[pts.length-1].l}</text></svg>
    ${changes.length?`<ul class="lv-ch">${changes.slice(-6).reverse().join("")}</ul>`:""}`}
function lean(pre,mk){const base=mk.lOpen??(pre&&pre.l);if(base==null)return"";if(mk.l>base)return`<span class="lv-dir o">Moving toward Over (line up ${r1(mk.l-base)})</span>`;if(mk.l<base)return`<span class="lv-dir u">Moving toward Under (line down ${r1(base-mk.l)})</span>`;
  if(mk.oOpen!=null&&mk.o!=null&&mk.o!==mk.oOpen)return`<span class="lv-dir ${dec(mk.o)<dec(mk.oOpen)?"o":"u"}">Same line, ${dec(mk.o)<dec(mk.oOpen)?"Over":"Under"} price shortened</span>`;return""}
function propRow(id,k,mk,pre){const m=model(id,mk),f=fresh(id,mk),st=mk.gone?"susp":f?"live":"old",open=LV.exp[k];
  const chip=st==="susp"?`<span class="lv-st susp">Suspended or pulled ${mk.goneTs?ago(mk.goneTs):""}</span>`:st==="old"?`<span class="lv-st old">${mk.lag>LAG_MAX?`Not updated for ${Math.round(mk.lag/60000)} min`:"Outdated"}</span>`:`<span class="lv-st live">Live</span>`;
  const V=verdict(m,f),val=V.k==="pos";
  return`<div class="lv-pr ${st} ${val?"val":""} ${open?"open":""}" data-lvx="${esc(k)}"><div class="lv-pr-top">
      <div class="lv-pr-l"><b>${STAT_LBL[mk.st]||mk.st}</b> ${chip}<div class="s">${m?`Now <b>${r1(m.cur)}</b> · needs ${m.need<0?"none, already over":r1(m.need)+" more"}`:""}${pre&&pre.l!=null?` · pregame ${pre.l}`:""}</div></div>
      <div class="lv-pr-r"><div class="ln">${mk.yn?"Yes":mk.l}</div><div class="px">O ${fmtAm(mk.o)}${mk.yn?"":` · U ${fmtAm(mk.u)}`}</div></div></div>
    ${m?valuePanel(m,V,mk.l,mk.st)
      :`<div class="lv-pr-m"><span class="muted">${mk.yn?"Yes/No markets aren't modeled live.":"No season data for a live projection; showing the market only."}</span></div>`}
    ${open?`<div class="lv-pr-x">${m?`<p>${esc(m.name)} has ${r1(m.cur)} in ${Math.round((m.pl&&m.pl.min)||0)} minutes${m.pl&&m.pl.pf!=null?` with ${m.pl.pf} fouls`:""}. About ${r1(m.gameLeft)} game minutes are left; Sharpline expects him to play about ${r1(m.minLeft)} of them${m.mwhy.length?` (${esc(m.mwhy.join(", "))})`:""}, adding about ${r1(m.remMean)} for a projected ${r1(m.final)}. Chance he reaches ${Math.floor(mk.l)+1}+: ${pct(m.pO)}, so Over ${mk.l} wins ${pct(m.pO)} of the time and Under ${mk.l} ${pct(1-m.pO)}${m.pm!=null?` (Sharpline's in-game model alone says ${pct(m.pOverRaw)}; blended with DraftKings' no-vig ${pct(m.pm)}, which sees rotations and matchups this model can't)`:""}.</p>`:""}
      ${lean(pre,mk)}${moveChart(id+"|"+k,pre,mk)}
      ${m&&f&&m.price!=null?`<button class="lv-track" data-lvtrack="${esc(id+"|"+k)}">+ Track ${m.side==="o"?"Over":"Under"} ${mk.l} at ${fmtAm(m.price)}</button>`:""}</div>`:""}</div>`}
function valuePanel(m,V,line,st){const sgn=x=>(x>=0?"+":"")+(x*100).toFixed(1),S=m.sides[m.side],lbl=(m.side==="o"?"Over ":"Under ")+line;
  return`<div class="lv-val-p ${V.k}"><div class="vt"><span class="vb ${V.k}">${V.t}</span><b>${lbl}</b>${S?` at ${fmtAm(S.price)}`:""}</div>
    <div class="vg"><div><small>Sharpline</small><b>${pct(m.p)}</b></div><div><small>Price needs</small><b>${S?pct1(S.imp):"–"}</b></div>
      <div><small>Edge</small><b class="${S&&S.gap>=0?"pos":"neg"}">${S?sgn(S.gap)+" pts":"–"}</b></div><div><small>EV</small><b class="${m.ev!=null&&m.ev>=0?"pos":"neg"}">${m.ev!=null?sgn(m.ev)+"%":"–"}</b></div>
      <div><small>Proj. final</small><b>${r1(m.final)}</b></div></div></div>`}
function boxTable(G,teamId){const ps=Object.values(G.box.players).filter(p=>p.teamId===teamId).sort((a,b)=>(b.starter-a.starter)||(b.min-a.min));
  return`<div class="pf-tw"><table class="pf-log lv-box"><thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>
  ${ps.map(p=>`<tr class="${p.dnp?"dnp":""}"><td><span class="pfn" ${pfAttr({n:p.name})}>${esc(p.name)}</span></td><td>${p.dnp?"DNP":Math.round(p.min)}</td><td>${p.pts??"–"}</td><td>${p.reb??"–"}</td><td>${p.ast??"–"}</td><td>${p.tpm??"–"}</td><td>${p.stl??"–"}</td><td>${p.blk??"–"}</td><td>${p.to??"–"}</td><td class="${(p.pf||0)>=5?"neg":""}">${p.pf??"–"}</td></tr>`).join("")}</tbody></table></div>`}
/* Live game-line model. Start from the pregame closing total and spread (DraftKings), then update with the score,
   tonight's scoring pace and the minutes left. Remaining points and margin are treated as normal:
   full-game spread about 12 points for margin and 19 for total, shrinking with the square root of time left.
   Like props, the result is blended 35/65 with DraftKings' no-vig price and kept within 4 points of it. */
function gameModel(e,G){const o=G.odds,pre=G.preOdds;if(!o||!pre||pre.total.line==null||pre.spread.home==null)return null;
  const L=SharpLive.gameMinLeft(e.period,e.clockSec),played=Math.max(0,(e.period<=4?Math.min(e.period,4)*12:48+(e.period-4)*5)-L);if(L<=0)return null;
  const cur=e.homeScore+e.awayScore,margin=e.homeScore-e.awayScore,w=played/(played+24),rate=(1-w)*pre.total.line/48+w*(played?cur/played:pre.total.line/48);
  const f=Math.sqrt(L/48),sdT=Math.max(19*f,2.5),sdM=Math.max(12*f,2);let totMean=cur+rate*L,marMean=margin+(-pre.spread.home)*(L/48);
  /* lean on DraftKings' live lines: they see rotations, injuries and foul trouble this model can't (65% market, 35% model) */
  const fr=Date.now()-G.oddsTs<FRESH;
  if(fr&&o.total.line!=null&&o.total.over!=null&&o.total.under!=null){const pm=devig(o.total.over,o.total.under)[0],mu=o.total.line-sdT*invPhi(1-pm);totMean=.65*mu+.35*totMean}
  if(fr&&o.spread.home!=null&&o.spread.homeOdds!=null&&o.spread.awayOdds!=null){const pm=devig(o.spread.homeOdds,o.spread.awayOdds)[0],mu=sdM*invPhi(pm)-o.spread.home;marMean=.65*mu+.35*marMean}
  else if(fr&&o.ml.home!=null&&o.ml.away!=null){const pm=devig(o.ml.home,o.ml.away)[0],mu=sdM*invPhi(pm);marMean=.65*mu+.35*marMean}
  const blend=(raw,a,b)=>{if(a==null||b==null)return{p:raw,raw,pm:null};const pm=devig(a,b)[0];return{p:Math.min(pm+.04,Math.max(pm-.04,pm+.35*(raw-pm))),raw,pm}};
  const out={totMean,marMean,L,rate,sdT,sdM,mk:[]},add=(key,lbl,line,a,b,rawA,la,lb)=>{if(a==null&&b==null)return;const B=blend(rawA,a,b);
    out.mk.push({key,lbl,line,raw:B.raw,pm:B.pm,...withSides({pO:B.p},a,b,rawA>=.5?"o":"u"),la,lb})};
  if(o.total.line!=null)add("total","Total",o.total.line,o.total.over,o.total.under,1-Phi((o.total.line-totMean)/sdT),"Over "+o.total.line,"Under "+o.total.line);
  if(o.spread.home!=null){const h=o.spread.home,sg=v=>(v>0?"+":"")+v;add("spread","Spread",h,o.spread.homeOdds,o.spread.awayOdds,Phi((marMean+h)/sdM),ab2(e.homeAb)+" "+sg(h),ab2(e.awayAb)+" "+sg(-h))}
  if(o.ml.home!=null||o.ml.away!=null)add("ml","Moneyline",null,o.ml.home,o.ml.away,Phi(marMean/sdM),ab2(e.homeAb)+" ML",ab2(e.awayAb)+" ML");
  return out}
function gameValueHTML(e,G){const M=gameModel(e,G),fr=G.odds&&Date.now()-G.oddsTs<FRESH;
  if(!M)return`<div class="lv-nomove">${!G.preOdds?"Waiting for DraftKings' pregame line, which the live game-line model starts from.":"Game lines aren't posted right now."}</div>`;
  const sgn=x=>(x>=0?"+":"")+(x*100).toFixed(1);
  return`<div class="pf-tw"><table class="pf-log lv-gv"><thead><tr><th>Bet</th><th>Price</th><th>Sharpline</th><th>Price needs</th><th>Edge</th><th>EV</th><th></th></tr></thead><tbody>
    ${M.mk.map(m=>["o","u"].map(s=>{const S=m.sides[s];if(!S)return"";const V=verdict({...m,ev:m.oneSide?null:S.ev},fr);
      return`<tr class="${s===m.side&&V.k==="pos"?"best":""}"><td>${esc(s==="o"?m.la:m.lb)}</td><td>${fmtAm(S.price)}</td><td><b>${pct(S.p)}</b></td><td>${pct1(S.imp)}</td><td class="${S.gap>=0?"pos":"neg"}">${sgn(S.gap)}</td><td class="${S.ev>=0?"pos":"neg"}">${m.oneSide?"–":sgn(S.ev)+"%"}</td><td><span class="vb ${V.k}">${V.t}</span></td></tr>`}).join("")).join("")}</tbody></table></div>
    <p class="lv-note">Projected final: ${esc(ab2(e.homeAb))} by ${r1(M.marMean)} (${r1(M.totMean)} total points), from the pregame line, tonight's pace (${r1(M.rate*48)} per 48 minutes) and ${r1(M.L)} minutes left.${G.box&&G.box.winProb!=null?` ESPN's own win model: ${esc(ab2(e.homeAb))} ${Math.round(G.box.winProb*100)}%.`:""} Only DraftKings' live prices are available free, so there is no best-price comparison across books.</p>`}
function linesTable(e,G){const o=G.odds,gi=SNAP.findIndex(S=>nick(S.home)===nick(e.home)),pre=G.preOdds||null;
  const row=(lbl,p,op,cur,extra)=>`<tr><td>${lbl}</td><td>${p??"–"}</td><td>${op??"–"}</td><td><b>${cur??"–"}</b>${extra?`<small>${extra}</small>`:""}</td></tr>`;
  const sg=v=>v==null?null:(v>0?"+":"")+v,oc=(a,b)=>b==null?null:a!=null&&a!==b?`${a} → ${b}`:b;
  return`<div class="pf-tw"><table class="pf-log lv-lines"><thead><tr><th>Market</th><th>Pregame open → close</th><th>Live open</th><th>Live now</th></tr></thead><tbody>
    ${row("Total",pre&&oc(pre.total.open,pre.total.line),o&&o.total.open,o&&o.total.line,o?`O ${fmtAm(o.total.over)} / U ${fmtAm(o.total.under)}`:"")}
    ${row(ab2(e.homeAb)+" spread",pre&&oc(sg(pre.spread.homeOpen),sg(pre.spread.home)),o&&sg(o.spread.homeOpen),o&&sg(o.spread.home),o?fmtAm(o.spread.homeOdds):"")}
    ${row(ab2(e.homeAb)+" moneyline",pre&&oc(pre.ml.homeOpen!=null?fmtAm(pre.ml.homeOpen):null,fmtAm(pre.ml.home)),o&&fmtAm(o.ml.homeOpen),o&&fmtAm(o.ml.home),"")}
    ${row(ab2(e.awayAb)+" moneyline",pre&&oc(pre.ml.awayOpen!=null?fmtAm(pre.ml.awayOpen):null,fmtAm(pre.ml.away)),o&&fmtAm(o.ml.awayOpen),o&&fmtAm(o.ml.away),"")}</tbody></table></div>
    ${o?moveChart(e.id+"|total",pre?{l:pre.total.line}:null,{lOpen:o.total.open,l:o.total.line}).replace("No movement recorded yet.","No total-line movement recorded yet."):`<div class="lv-nomove">DraftKings has no live game line posted right now (it may be suspended).</div>`}`}
function renderGame(keep){const el=document.getElementById("lg");if(!el||!LV.open)return;const st0=el.scrollTop,e=LV.sb.find(x=>x.id===LV.open);if(!e)return;const G=gameOf(e.id);
  const[,ca]=team(e.away),[,ch]=team(e.home),wp=G.box&&G.box.winProb;
  const tabs=[["props","Live props"],["box","Players"],["game","Game"]];
  let body="";
  if(LV.tab==="props"){const all=Object.entries(G.props).filter(([k,mk])=>LIVE_ST.includes(mk.st)||mk.yn);
    const want=LV.stat==="all"?null:LV.stat==="combo"?["Pts+Reb+Ast","Pts+Reb","Pts+Ast","Reb+Ast"]:[LV.stat];
    const byP={};all.forEach(([k,mk])=>{if(want&&!want.includes(mk.st))return;if(mk.yn&&want)return;const m=LV.valOnly?model(e.id,mk):null;if(LV.valOnly&&!(m&&fresh(e.id,mk)&&m.ev!=null&&m.ev>=.03))return;(byP[mk.ath]=byP[mk.ath]||[]).push([k,mk])});
    const players=Object.keys(byP).map(a=>{const who=LIVE.ids[a],nm=who?who.name:"Player "+a,pl=G.box&&who?G.box.players[SharpLive.norm(nm)]:null;return{a,nm,pl,tm:who&&(who.tm===e.homeId?e.home:e.away)}}).sort((x,y)=>((y.pl&&y.pl.pts)||0)-((x.pl&&x.pl.pts)||0));
    body=`<div class="lv-filt">${[["all","All"],["Points","Points"],["Rebounds","Rebounds"],["Assists","Assists"],["3-Pointers","Threes"],["combo","Combos"]].map(([v,l])=>`<button class="${LV.stat===v?"on":""}" data-lvs="${v}">${l}</button>`).join("")}<button class="${LV.valOnly?"on":""}" data-lvv="1">Potential edges only</button></div>
      ${G.propsOk===false?`<div class="pf-warn">Couldn't refresh live props. Edges are hidden until prices are current again.</div>`:""}
      ${!G.propsFetched?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading DraftKings live props…</span></div>`:G.noMarket&&!all.length?`<div class="pf-empty">DraftKings has no live player props posted for this game right now. They often pause during reviews and timeouts and between quarters.</div>`:
      players.length?players.map(P=>`<div class="lv-pl" data-k="${P.a}"><div class="lv-pl-h"><span class="pfa" ${pfAttr({n:P.nm,t:P.tm})}>${avatar(P.nm,P.tm||"","av")}</span><div><b class="pfn" ${pfAttr({n:P.nm,t:P.tm})}>${esc(P.nm)}</b><div class="s">${P.pl&&!P.pl.dnp?`${P.pl.pts} PTS · ${P.pl.reb} REB · ${P.pl.ast} AST · ${P.pl.tpm??0} 3PM · ${Math.round(P.pl.min)} MIN · ${P.pl.pf??0} PF`:"Hasn't played yet"}</div></div></div>
        ${byP[P.a].sort((x,y)=>statRank(x[1].st)-statRank(y[1].st)).map(([k,mk])=>propRow(e.id,k,mk,G.pre&&G.pre[k])).join("")}</div>`).join(""):`<div class="pf-empty">Nothing matches this filter right now.</div>`}`}
  else if(LV.tab==="box")body=!G.box?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading box score…</span></div>`:`<div class="lv-h">${esc(e.away)}</div>${boxTable(G,e.awayId)}<div class="lv-h">${esc(e.home)}</div>${boxTable(G,e.homeId)}`;
  else{const T=G.box&&G.box.teams||[],tA=T.find(t=>t.id===e.awayId),tH=T.find(t=>t.id===e.homeId),ks=["FG","Field Goal %","3PT","Three Point %","Rebounds","Assists","Turnovers","Fast Break Points","Points in Paint","Largest Lead"];
    body=`<div class="lv-h">Live value</div>${gameValueHTML(e,G)}<div class="lv-h">Line history</div>${linesTable(e,G)}
      ${tA&&tH?`<div class="lv-h">Team stats</div><div class="pf-tw"><table class="pf-log lv-ts"><thead><tr><th>${esc(ab2(e.awayAb))}</th><th></th><th>${esc(ab2(e.homeAb))}</th></tr></thead><tbody>${ks.filter(k=>tA.stats[k]!=null).map(k=>`<tr><td>${esc(tA.stats[k])}</td><td>${esc(k)}</td><td>${esc(tH.stats[k])}</td></tr>`).join("")}</tbody></table></div>`:""}
      ${G.box&&G.box.plays.length?`<div class="lv-h">Recent plays</div><ul class="lv-plays">${G.box.plays.slice(0,15).map(p=>`<li class="${p.score?"sc":""}"><span>Q${p.period} ${esc(p.clock)}</span>${esc(p.text)}<b>${p.away}-${p.home}</b></li>`).join("")}</ul>`:""}`}
  const parts={bar:`<div class="pf-bar"><button class="pf-back" data-lvclose="1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Live</button><span class="pf-tt">${e.state==="in"?`<span class="lv-live">Live</span>`:esc(statusTxt(e))}</span></div>`,
    sb:`<header class="lv-sb" style="--ca:${ca};--ch:${ch}"><div class="lv-sbt">${teamTag(e.awayAb,e.away)}<b class="sc">${e.awayScore}</b><span>${esc(e.away)}</span></div>
      <div class="lv-sbc"><b>${esc(statusTxt(e))}</b>${wp!=null?`<div class="lv-wp" title="ESPN win probability"><i style="width:${Math.round((1-wp)*100)}%"></i></div><small>${esc(ab2(e.awayAb))} ${Math.round((1-wp)*100)}% · ${esc(ab2(e.homeAb))} ${Math.round(wp*100)}% (ESPN)</small>`:""}</div>
      <div class="lv-sbt r">${teamTag(e.homeAb,e.home)}<b class="sc">${e.homeScore}</b><span>${esc(e.home)}</span></div></header>`,
    feed:`${feedBar()}${staleNote(G)}`,
    tabs:`<div class="seg wide lv-tabs">${tabs.map(([v,l])=>`<button class="${LV.tab===v?"on":""}" data-lvt="${v}">${l}</button>`).join("")}</div>`,
    body,
    foot:`<p class="pf-foot">Live markets are DraftKings in-game lines via ESPN. "Projected final" is Sharpline's model: current stats plus his usual per-minute production over the minutes he's expected to play from here. Movement is only what this phone recorded while open.</p>`};
  /* patch only the pieces that changed, so taps and scroll position survive the 20-second refreshes */
  const sig=e.id+"|"+LV.tab;
  if(!keep||el._sig!==sig||!el.querySelector(".pf-in")){el.innerHTML=`<div class="pf-in">${Object.keys(parts).map(k=>`<div data-part="${k}">${parts[k]}</div>`).join("")}</div>`;el._sig=sig;el._parts={...parts};return}
  Object.keys(parts).forEach(k=>{if(el._parts[k]===parts[k])return;const box=el.querySelector(`[data-part="${k}"]`);if(!box)return;el._parts[k]=parts[k];
    if(k==="body")patchKeyed(box,parts[k]);else box.innerHTML=parts[k]});
  if(keep)el.scrollTop=st0}
/* replace only the children whose markup changed; fall back to a full swap when the set or order of keyed blocks changes */
function patchKeyed(box,html){const t=document.createElement("div");t.innerHTML=html;const nw=[...t.children],old=[...box.children];
  if(nw.length!==old.length||nw.some((n,i)=>n.className!==old[i].className||n.dataset.k!==old[i].dataset.k)){box.innerHTML=html;return}
  /* avatars carry a fresh SVG id on every render, so ignore those ids when deciding what changed */
  const sig=h=>h.replace(/\bj\d+\b/g,"j");nw.forEach((n,i)=>{if(sig(n.outerHTML)!==sig(old[i].outerHTML))old[i].replaceWith(n)})}
function render(){renderList();paintTracker();if(LV.open)renderGame(true);if(window.PF&&PF.open)renderProfile(true)}
function openGame(id){lastGame="";const g0=document.getElementById("lg");if(g0)g0._sig="";LV.open=id;LV.tab="props";const el=document.getElementById("lg");el.classList.add("on");el.scrollTop=0;document.body.classList.add("pf-lock");
  history.pushState({sl:"lg"},"");renderGame();poll(true)}
function hideGame(){LV.open=null;const el=document.getElementById("lg");el.classList.add("out");if(!(window.PF&&PF.open))document.body.classList.remove("pf-lock");setTimeout(()=>{el.classList.remove("on","out");el.innerHTML=""},260)}
window.addEventListener("popstate",()=>{if(LV.open&&!(history.state&&history.state.sl==="lg")&&!(window.PF&&PF.open))hideGame()});
function trackLive(ref){const[id,ath,st]=ref.split("|"),G=gameOf(id),mk=G.props[ath+"|"+st],e=LV.sb.find(x=>x.id===id);if(!mk||!e)return;const m=model(id,mk);if(!m||!fresh(id,mk)){toast("This price isn't current. Not tracked.");return}
  const side=m.side;BETS.unshift({id:Date.now(),date:DATA_DATE,key:"x"+id+"_"+ath+"_"+st,name:m.name,game:`${ab2(e.awayAb)} @ ${ab2(e.homeAb)}`,tip:e.date,mkt:st,book:BOOK,stake:UNIT,res:null,
    pick:`${side==="o"?"Over":"Under"} ${mk.l} ${STAT[st]||st} (live)`,odds:m.price,p:m.p,push:0,ev:m.ev,grade:null,conf:null,src:"live",live:1,
    spec:{kind:"prop",player:m.name,stat:st,line:mk.l,side},home:e.home,away:e.away,ev2:id,ath});
  saveBets();renderAll();toast(`Tracked live ${side==="o"?"Over":"Under"} ${mk.l} at ${fmtAm(m.price)}`)}
document.addEventListener("click",e=>{const t=e.target.closest("[data-lvg],[data-lvclose],[data-lvt],[data-lvs],[data-lvv],[data-lvx],[data-lvtrack]");if(!t||e.target.closest("[data-prof]"))return;const d=t.dataset;
  if(d.lvtrack){e.stopPropagation();trackLive(d.lvtrack);return}
  if(d.lvg){openGame(d.lvg);return}if(d.lvclose){if(history.state&&history.state.sl==="lg")history.back();else hideGame();return}
  if(d.lvt){LV.tab=d.lvt;renderGame(true);return}if(d.lvs){LV.stat=d.lvs;renderGame(true);return}if(d.lvv){LV.valOnly=!LV.valOnly;renderGame(true);return}
  if(d.lvx!=null){LV.exp[d.lvx]=!LV.exp[d.lvx];renderGame(true)}});

/* used by player profiles: this player's live markets, if his game is in progress */
window.liveForPlayer=function(name){const n=SharpLive.norm(name);const id=Object.keys(LIVE.ids).find(k=>SharpLive.norm(LIVE.ids[k].name)===n);if(!id)return null;
  for(const e of LV.sb){if(e.state!=="in")continue;const G=gameOf(e.id),ms=Object.entries(G.props).filter(([k,mk])=>mk.ath===id&&LIVE_ST.includes(mk.st));
    const pl=G.box&&G.box.players[n];if(!ms.length&&!pl)continue;
    return`<section class="pf-card lv-inprof"><div class="pf-ph"><div><div class="eyebrow"><span class="lv-live">Live</span> ${esc(ab2(e.awayAb))} ${e.awayScore} @ ${esc(ab2(e.homeAb))} ${e.homeScore} · ${esc(statusTxt(e))}</div><h3>${pl&&!pl.dnp?`${pl.pts} PTS · ${pl.reb} REB · ${pl.ast} AST`:"Hasn't played yet"}</h3></div><button class="lv-open" data-lvg="${e.id}">Open game</button></div>
      ${ms.sort((x,y)=>statRank(x[1].st)-statRank(y[1].st)).map(([k,mk])=>propRow(e.id,k,mk,G.pre&&G.pre[k])).join("")||`<div class="pf-empty">No live player markets for him right now.</div>`}
      <p class="pf-sub2">Live lines are separate from tonight's pregame line shown below.</p></section>`}
  return null};

/* ---------- live chance for tracked bets ----------
   For an open bet whose game is in progress: Sharpline's current chance that it wins, from the same live models used in
   the Live tab. When DraftKings has a live market at the bet's exact line, the chance is blended with that price (35/65,
   within 4 points). At any other line there is no matching price, so it is the model alone and is labeled that way.
   These live chances are not yet graded for calibration. */
function evOfBet(home,away){return LV.sb.find(e=>nick(e.home)===nick(home)&&nick(e.away)===nick(away))||null}
function betChance(spec,home,away){if(spec&&spec.sport==="nfl")return window.NFL?NFL.betChance(spec):null;if(!spec||!home)return null;const e=evOfBet(home,away);if(!e)return null;
  if(e.state==="pre")return{st:"pre"};if(e.state!=="in")return{st:"post"};const G=gameOf(e.id),fr=G.odds&&Date.now()-G.oddsTs<FRESH;
  const clock=statusTxt(e),score=`${ab2(e.awayAb)} ${e.awayScore}, ${ab2(e.homeAb)} ${e.homeScore}`;
  if(spec.kind==="prop"){const n=SharpLive.norm(spec.player||""),ath=Object.keys(LIVE.ids).find(k=>SharpLive.norm(LIVE.ids[k].name)===n);
    const pl=G.box&&G.box.players[n],cur=pl?curOf(pl,spec.stat):null,need=spec.side==="o"?"over":"under";
    if(!comps(spec.stat))return{st:"na",why:"No live model for this stat",clock,score};
    if(pl&&pl.dnp)return{st:"na",why:"Hasn't played",clock,score};
    if(cur!=null&&cur>spec.line)return{st:"done",p:spec.side==="o"?1:0,clock,score,now:`${cur} now, already ${need==="over"?"over":"past"} ${spec.line}`};
    if(!ath)return{st:"na",why:"Player not matched to ESPN",clock,score};
    const live=G.props[ath+"|"+spec.stat],same=live&&!live.gone&&live.l===spec.line&&fresh(e.id,live);
    const anchor=live&&!live.gone&&fresh(e.id,live)&&live.l!==spec.line?live:null;
    const m=model(e.id,same?live:{ath,st:spec.stat,l:spec.line,o:null,u:null,anchor});if(!m)return{st:"na",why:"Not enough data for a live estimate",clock,score};
    const p=spec.side==="o"?m.pO:1-m.pO;
    return{st:"live",p,src:same?"blend":m.anch!=null?"anchor":"model",anch:m.anch,clock,score,now:`${cur??0} now, projected ${r1(m.final)}`,mkt:live&&!live.gone?live:null,thin:m.thin}}
  const M=gameModel(e,G);if(!M)return{st:"na",why:!G.preOdds?"Waiting for the pregame line the live model starts from":"Game lines not posted right now",clock,score};
  const home_=nick(spec.team||"")===nick(e.home);let p,raw,mk=M.mk.find(x=>x.key===(spec.kind==="tot"?"total":spec.kind==="sp"?"spread":"ml"));
  if(spec.kind==="tot"){raw=1-Phi((spec.line-M.totMean)/M.sdT);if(spec.side==="u")raw=1-raw;
    p=mk&&mk.line===spec.line&&fr?(spec.side==="o"?mk.sides.o&&mk.sides.o.p:mk.sides.u&&mk.sides.u.p):null}
  else{const mar=home_?M.marMean:-M.marMean;raw=spec.kind==="ml"?Phi(mar/M.sdM):Phi((mar+spec.line)/M.sdM);
    const s=home_?"o":"u";p=mk&&fr&&(spec.kind==="ml"||(home_?mk.line===spec.line:mk.line===-spec.line))?(mk.sides[s]&&mk.sides[s].p):null}
  const proj=`projected ${ab2(e.homeAb)} ${M.marMean>=0?"by "+r1(M.marMean):"down "+r1(-M.marMean)}, ${r1(M.totMean)} total`;
  return{st:"live",p:p??raw,src:p!=null?"blend":"model",clock,score,now:proj}}
/* ---------- a chance for every tracked bet (Nov 22 2026) ----------
   betChance is the full live model. When it can't run (stat it doesn't model, player not matched, no game log, no pregame
   line to start from) or a bet has no pregame chance (added by hand), these fall back to simpler, labeled estimates:
   - pregame: DraftKings' no-vig price moved to your line along the stat's distribution (rank.js probsAt), else the
     player's averages, else the posted game line's fair chance
   - live: the same starting estimate scaled to the time left, blended with the player's (or game's) pace so far
   Nothing is shown as a live market price unless it is one. */
const STAT_KEYS=st=>st==="Turnovers"?["to"]:comps(st);
function preMean(l){const sp=l.spec||{},st=sp.stat,R=window.SLRank;if(!R||!st)return null;
  if(l.p!=null&&sp.line!=null){const pO=sp.side==="u"?1-l.p:l.p;if(pO>.01&&pO<.99)return{m:R.probsAt(st,sp.line,pO,sp.line).mean,src:"your pregame chance"}}
  const n=normN(sp.player||""),i=(typeof PROPS!=="undefined"?PROPS:[]).findIndex(x=>x.st===st&&normN(x.p)===n);
  if(i>=0){const x=PROPS[i],q=x.q.find(q=>q.o!=null&&q.u!=null&&typeof q.l==="number");if(q){const g=SUG[i],pm=g&&g.model&&g.l===q.l?g.model.pAdj??g.model.pm:devig(q.o,q.u)[0];return{m:R.probsAt(st,q.l,pm,q.l).mean,src:"DraftKings' pregame line"}}}
  const P=projOf(sp.player||""),K=STAT_KEYS(st);if(P&&K&&K.every(k=>P[k]!=null))return{m:K.reduce((a,k)=>a+P[k],0),src:"his season averages"};
  return null}
function overFrom(st,mean,need,sd){if(need<0)return 1;if(mean<=0)return 0;const R=window.SLRank;
  if((COUNT_ST[st]||mean<5))return R.poisOver(mean,need);return 1-Phi((need-mean)/Math.max(.5,sd))}
/* pregame chance for a bet that doesn't have one */
function preChanceNBA(l){const sp=l.spec;if(!sp)return null;const R=window.SLRank;
  if(sp.kind==="prop"){const M=preMean(l);if(!M)return null;const pO=overFrom(sp.stat,M.m,sp.line,R.sdFit(sp.stat,M.m));return{p:sp.side==="u"?1-pO:pO,src:M.src}}
  const gi=(typeof SNAP!=="undefined"?SNAP:[]).findIndex(G=>nick(G.home)===nick(l.home)&&nick(G.away)===nick(l.away));if(gi<0)return null;
  const Ls=LINES.filter(x=>x.g===gi&&x.p!=null);
  if(sp.kind==="tot"){const L=Ls.find(x=>x.m==="Total");if(!L)return null;const l0=parseFloat(L.pick.split(" ")[1]),pO0=/^Over/.test(L.pick)?L.p:1-L.p,mu=l0-sdFor("Total")*invPhi(1-pO0),pO=1-Phi((sp.line-mu)/sdFor("Total"));return{p:sp.side==="u"?1-pO:pO,src:"DraftKings' game total"}}
  const L=Ls.find(x=>x.m==="Spread");if(!L)return null;const w=L.pick.split(" "),pickHome=nick(fullOfAbbr(w[0])||"")===nick(SNAP[gi].home),ln=parseFloat(w[1]);
  const homeMar=(pickHome?1:-1)*(sdFor("Spread")*invPhi(L.p)-ln),mine=nick(sp.team||"")===nick(SNAP[gi].home)?homeMar:-homeMar;
  return{p:sp.kind==="ml"?Phi(mine/sdFor("Spread")):Phi((mine+sp.line)/sdFor("Spread")),src:"DraftKings' spread"}}
/* no player data at all: a book's line sits near the middle of the outcomes, so start from the line itself */
function lineCentered(sp){if(!sp||sp.kind!=="prop"||sp.line==null)return null;const R=window.SLRank,m=Math.max(.5,sp.line),pO=overFrom(sp.stat,m,sp.line,R.sdFit(sp.stat,m));return{p:sp.side==="u"?1-pO:pO,src:"the line itself (no player data)"}}
/* live chance when the full model can't run */
function roughLiveNBA(l,e,G){const sp=l.spec,R=window.SLRank,left=SharpLive.gameMinLeft(e.period,e.clockSec),fl=Math.max(0,Math.min(1,left/48)),played=1-fl;
  const clock=statusTxt(e),score=`${ab2(e.awayAb)} ${e.awayScore}, ${ab2(e.homeAb)} ${e.homeScore}`;
  if(sp.kind==="prop"){const K=STAT_KEYS(sp.stat);if(!K)return null;
    if(!G.box){const pb=preChanceNBA(l)||lineCentered(sp);return pb?{st:"live",p:l.p??pb.p,src:"rough",clock,score,now:"waiting for the box score, pregame chance for now"}:null}
    const pl=G.box.players[SharpLive.norm(sp.player||"")];
    const cur=pl?K.reduce((a,k)=>a+(pl[k]||0),0):0;if(cur>sp.line)return{st:"done",p:sp.side==="o"?1:0,clock,score,now:`${cur} now, past ${sp.line}`};
    if(pl&&pl.dnp)return{st:"na",why:"Hasn't played",clock,score};
    const M=preMean(l)||{m:sp.line,src:"the line (no player data)"};const P=projOf(sp.player||""),expMin=(P&&(P.min||P.l10min))||(pl&&played>.05?pl.min/played:30);
    const remMin=Math.min(expMin*fl,left),rem0=M.m*fl,pace=pl&&pl.min>3?cur/pl.min*remMin:rem0,w=played/(played+1),rem=Math.max(0,(1-w)*rem0+w*pace);
    const pO=overFrom(sp.stat,rem,sp.line-cur,R.sdFit(sp.stat,Math.max(1,M.m))*Math.sqrt(fl));
    return{st:"live",p:sp.side==="u"?1-pO:pO,src:"rough",clock,score,now:`${pl?cur+" now":"not in the box score yet"}, about ${r1(cur+rem)} projected (from ${M.src}${pl?" and his pace":""})`}}
  const tot=(e.homeScore||0)+(e.awayScore||0),mar=(e.homeScore||0)-(e.awayScore||0),home_=nick(sp.team||"")===nick(e.home);
  const preTot=(()=>{const gi=SNAP.findIndex(S=>nick(S.home)===nick(e.home));const L=LINES.find(x=>x.g===gi&&x.m==="Total"&&x.p!=null);return L?parseFloat(L.pick.split(" ")[1]):null})();
  const paceTot=played>.05?tot/played:preTot||224,remT=fl*((1-played)*(preTot||paceTot)+played*paceTot);
  if(sp.kind==="tot"){const pO=1-Phi((sp.line-tot-remT)/Math.max(1,18*Math.sqrt(fl)));return{st:"live",p:sp.side==="u"?1-pO:pO,src:"rough",clock,score,now:`${tot} points so far, about ${Math.round(tot+remT)} projected`}}
  const preHome=(()=>{const c=preChanceNBA({...l,spec:{kind:"ml",team:e.home}});return c?sdFor("Spread")*invPhi(Math.min(.99,Math.max(.01,c.p))):0})();
  const muHome=mar+preHome*fl,mine=home_?muHome:-muHome,sd=Math.max(1,12.5*Math.sqrt(fl));
  return{st:"live",p:sp.kind==="ml"?Phi(mine/sd):Phi((mine+sp.line)/sd),src:"rough",clock,score,now:`${home_?(mar>=0?"up":"down"):(mar<=0?"up":"down")} ${Math.abs(mar)}`}}
/* every bet: full model first, then the fallbacks */
function chanceFor(l){const sp=l.spec;let c=null;try{c=betChance(sp,l.home,l.away)}catch(e){c=null}
  if(sp&&sp.sport==="nfl"){if((!c||c.st==="pre")&&l.p==null&&window.NFL&&NFL.preBet){const pb=NFL.preBet(sp);if(pb)return{st:"pre",p:pb.p,src:pb.src}}return c}
  const e=l.home?evOfBet(l.home,l.away):null;
  if(e&&e.state==="in"&&(!c||c.st==="na")){const G=gameOf(e.id);let r=null;try{r=roughLiveNBA(l,e,G)}catch(err){r=null}if(r)return r}
  if((!c||c.st==="pre")&&l.p==null){const pb=preChanceNBA(l)||lineCentered(sp);if(pb)return{st:"pre",p:pb.p,src:pb.src}}
  return c}
/* same-game parlays: combined chance with this season's within-game correlations (corr.js) */
function sgpChance(legs,ps){if(!window.SLCorr)return null;SLCorr.load();
  if(window.NFL&&!NFL.N.stats&&!sgpChance.t&&legs.some(l=>l.spec&&l.spec.sport==="nfl")){sgpChance.t=1;try{NFL.ensure()}catch(e){}}
  if(!SLCorr.ready())return null;if(window.GameModel){GameModel.load("nba");GameModel.load("nfl")}
  const L=legs.map((l,i)=>SLCorr.legOf(l,ps[i]));
  return SLCorr.joint(L)}
function sgpNote(J,legs){if(!J)return"Loading this season's correlation data…";const nm=i=>{const l=legs[i];return(l.name||"").split(" ").pop()+" "+(l.pick||"").replace(/^(Over|Under) [\d.]+ /,"")};
  const top=J.pairs.slice().sort((a,b)=>Math.abs(b.rho)-Math.abs(a.rho))[0];
  return J.pairs.length?`Adjusted for same-game correlation${top&&Math.abs(top.rho)>=.1?`: ${esc(nm(top.i))} and ${esc(nm(top.j))} move together (${top.rho.toFixed(2)})`:""}. Treated as independent it would be ${Math.round(J.indep*100)}%.${J.unknown?" Some pairs have no measured correlation and count as independent.":""}`:
    "No measured correlation for these legs, so they're treated as independent."}
function chanceHTML(b){const legs=b.type==="parlay"?b.legs:null;
  const show=c=>c.st==="done"?`<b class="${c.p?"pos":"neg"}">${c.p?"Won already":"Lost already"}</b> · ${esc(c.now)}`:c.st==="live"?`<b>${Math.round(c.p*100)}%</b> to win · ${esc(c.now)}${c.src==="rough"?" · rough estimate":c.src==="model"?" · model only, no live price at this line":""}${c.thin?" · few games":""}`:c.st==="na"?esc(c.why):"";
  if(!legs){const c=chanceFor(b);if(!c||c.st==="pre"||c.st==="post")return"";
    return`<span class="lv-live">Live</span> ${esc(c.score)} · ${esc(c.clock)}<br>${show(c)}`}
  const rows=legs.map(l=>({l,c:l.res?null:chanceFor(l)}));if(!rows.some(r=>r.c&&r.c.st!=="pre"&&r.c.st!=="post"))return"";
  let all=1,ok=true;rows.forEach(({l,c})=>{if(l.res==="W"||l.res==="P"||l.res==="V")return;if(l.res==="L"){all=0;return}
    if(c&&(c.st==="live"||c.st==="done"))all*=c.p;else ok=false});
  let J=null;if(b.sgp&&ok){J=sgpChance(rows.map(r=>r.l),rows.map(({l,c})=>l.res==="W"||l.res==="P"||l.res==="V"?1:l.res==="L"?0:c?c.p:null))}
  const tot=b.sgp?(J?`<b>${Math.round(J.p*100)}%</b> all remaining legs win (same-game correlation included)`:`Combined chance shown once every pending leg is in progress`):ok?`<b>${Math.round(all*100)}%</b> all remaining legs win (legs treated as independent)`:`Combined chance shown once every pending leg is in progress`;
  return`<span class="lv-live">Live</span> ${tot}<div class="tlegs">${rows.filter(r=>r.c&&r.c.st!=="pre"&&r.c.st!=="post").map(({l,c})=>`<div>${esc(l.key[0]==="l"?"":l.name.split(" ").pop()+" ")}${esc(l.pick)}: ${show(c)}</div>`).join("")}</div>`}
/* ---------- hit-chance panel beside each open bet ----------
   Before tip: Sharpline's pregame estimate (legs multiplied, treated as independent; separate games).
   During games: each leg's live chance from betChance, settled legs count as 1 (won) or 0 (lost), multiplied.
   A leg with no live estimate yet keeps its pregame chance and is labeled that way.
   Same-game parlays get leg chances but no combined number, because those legs are correlated.
   A short history of the combined chance is kept on this device so the panel can show how it moved. */
const CH_KEY="sl_chist";
function chHist(){try{return JSON.parse(localStorage.getItem(CH_KEY))||{}}catch(e){return{}}}
function chSave(H){try{localStorage.setItem(CH_KEY,JSON.stringify(H))}catch(e){}}
function chPush(id,p){if(p==null||isNaN(p))return;const H=chHist(),a=H[id]||(H[id]=[]),now=Date.now(),last=a[a.length-1];
  if(!last||Math.abs(last[1]-p)>=.005||now-last[0]>5*60e3){a.push([now,Math.round(p*1000)/1000]);if(a.length>240)a.splice(0,a.length-240);
    Object.keys(H).forEach(k=>{if(!BETS.some(b=>String(b.id)===k&&!b.res))delete H[k]});chSave(H)}}
function spark(a){if(!a||a.length<2)return"";const W=260,Hh=54,t0=a[0][0],t1=a[a.length-1][0]||t0+1,x=t=>((t-t0)/Math.max(1,t1-t0))*W,y=p=>Hh-4-p*(Hh-8);
  const d=a.map(([t,p],i)=>`${i?"L":"M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(""),up=a[a.length-1][1]>=a[0][1];
  return`<svg class="tp-sp" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(.5)}" y2="${y(.5)}" class="tp-mid"/><path d="${d}" class="${up?"up":"dn"}"/></svg>`}
function legState(l){if(l.res==="W"||l.res==="P"||l.res==="V")return{k:"won",p:1,txt:l.res==="W"?"Won":l.res==="P"?"Push":"Void"};if(l.res==="L")return{k:"lost",p:0,txt:"Lost"};
  const c=chanceFor(l),e=l.home?evOfBet(l.home,l.away):null;
  if(c&&c.st==="done")return{k:c.p?"won":"lost",p:c.p,txt:c.now};
  if(c&&c.st==="live")return{k:"live",p:c.p,txt:`${c.now} · ${c.clock}`,model:c.src==="model",rough:c.src==="rough",anch:c.anch};
  if(c&&c.st==="post")return{k:"wait",p:l.p,txt:"Final · grading"};
  const pre=e&&e.state==="pre"?`Tips ${new Date(e.date).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:c&&c.st==="na"?c.why:"Pregame";
  if(l.p==null&&c&&c.st==="pre"&&c.p!=null)return{k:"pre",p:c.p,txt:`${pre} · from ${c.src}`};
  return{k:"pre",p:l.p??null,txt:pre}}
function panelHTML(b){const legs=b.type==="parlay"?b.legs:[{...b,res:null,name:b.name,pick:b.pick}];
  const L=legs.map(l=>({l,s:legState(l)})),anyLive=L.some(x=>x.s.k==="live"||x.s.k==="won"||x.s.k==="lost"),dead=L.some(x=>x.s.k==="lost");
  let p=null,J=null;if(!b.sgp||legs.length===1){p=1;for(const x of L){if(x.s.p==null){p=null;break}p*=x.s.p}}
  else if(L.every(x=>x.s.p!=null)){J=sgpChance(legs,L.map(x=>x.s.p));p=J?J.p:null}
  if(dead)p=0;if(p!=null&&anyLive)chPush(b.id,p);
  const H=chHist()[b.id]||[],start=b.p??(H[0]&&H[0][1]),delta=p!=null&&start!=null&&anyLive?p-start:null;
  const cls=p==null?"":p>=.5?"pos":p>=.2?"mid":"neg",pc=v=>v==null?"–":v>=.995?"99%+":v<.005&&v>0?"<1%":Math.round(v*100)+"%";
  const head=dead?"Busted":anyLive?"Live chance to hit":"Pregame chance to hit";
  return`<div class="tp-h"><span class="${anyLive&&!dead?"lv-live":"tp-tag"}">${anyLive&&!dead?"Live":dead?"Final":"Pregame"}</span>${head}</div>
    <div class="tp-big ${cls}">${pc(p)}</div>
    <div class="tp-sub">${b.sgp&&legs.length>1&&!anyLive?sgpNote(J,legs):delta!=null&&Math.abs(delta)>=.005?`<b class="${delta>0?"pos":"neg"}">${delta>0?"▲":"▼"} ${Math.abs(Math.round(delta*100))} pts</b> since tracked (${pc(start)})`:!anyLive?`Updates every 20 seconds once games tip`:"Even with when you tracked it"}</div>
    ${spark(H)}
    <div class="tp-legs">${L.map(({l,s})=>`<div class="tp-leg ${s.k}"><div class="tp-lt"><span>${esc(l.key&&l.key[0]==="l"?"":(l.name||"").split(" ").pop()+" ")}${esc(l.pick)}</span><b>${s.k==="won"?"✓":s.k==="lost"?"✕":pc(s.p)}</b></div>
      <div class="tp-bar"><i style="width:${s.p==null?0:Math.round(Math.max(.02,s.p)*100)}%"></i></div><small>${esc(s.txt)}${s.rough?" · rough estimate":s.model?" · model only, no live DraftKings price for this market":s.anch!=null?` · from DraftKings' live line ${s.anch}`:""}${s.k==="pre"&&s.p!=null?" · pregame estimate":""}</small></div>`).join("")}</div>
    <div class="tp-f">${legs.length>1?(b.sgp?"Same-game legs adjusted with within-game correlations from this season's box scores (NFL). ":"Legs treated as independent. "):""}Live chances use the box score, game clock and DraftKings' live price when it has one at your line. Not yet graded for calibration.</div>`}
function paintTracker(){document.querySelectorAll("[data-tlive]").forEach(el=>{const b=BETS.find(x=>String(x.id)===el.dataset.tlive);const h=b&&!b.res?chanceHTML(b):"";
  if(el._h!==h){el._h=h;el.innerHTML=h;el.style.display=h?"":"none"}});
  document.querySelectorAll("[data-tpanel]").forEach(el=>{const b=BETS.find(x=>String(x.id)===el.dataset.tpanel);let h="";try{h=b&&!b.res?panelHTML(b):""}catch(e){console.warn(e)}
    if(el._h!==h){el._h=h;el.innerHTML=h}})}
window.LiveUI={start,poll,render,LV,openGame,model,betChance,chanceFor,paintTracker};
})();
