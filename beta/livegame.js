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
function wanted(){return document.getElementById("v-live")?.classList.contains("on")||!!LV.open}
async function poll(force){if(LV.busy||document.hidden)return;if(!force&&!wanted())return;LV.busy=true;
  try{try{LV.sb=await SharpLive.scoreboard(DATA_DATE);LV.sbTs=Date.now();LV.sbOk=true}catch(e){LV.sbOk=false}
    const live=LV.sb.filter(e=>e.state==="in"),now=Date.now();
    await Promise.all(live.map(async e=>{const G=gameOf(e.id),isOpen=LV.open===e.id;
      const jobs=[SharpLive.liveOdds(e.id).then(o=>{if(o){recLine(e.id,o);G.odds=o}G.oddsTs=Date.now()}).catch(()=>{})];
      if(isOpen||now-G.boxTs>BOX_BG)jobs.push(SharpLive.box(e.id).then(b=>{G.box=b;G.boxTs=Date.now();G.boxOk=true}).catch(()=>{G.boxOk=false}));
      if(isOpen||now-G.propsFetched>PROPS_BG||force)jobs.push(SharpLive.liveProps(e.id).then(r=>{mergeProps(e.id,r);G.propsTs=Date.now();G.propsOk=true}).catch(()=>{G.propsOk=false}).finally(()=>{G.propsFetched=Date.now()}));
      if(!G.pre)jobs.push(SharpLive.fetchProps(e.id,100,1).then(r=>{G.pre={};r.forEach(m=>{G.pre[m.ath+"|"+m.st]=m})}).catch(()=>{}));
      await Promise.all(jobs)}));
    saveHist()}finally{LV.busy=false}
  render()}
function start(){if(LV.timer)return;LV.timer=setInterval(()=>poll(false),POLL);poll(true)}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&wanted())poll(true)});

/* record line and price changes this phone sees */
function push(k,pt){const h=HIST[k]||(HIST[k]=[]),l=h[h.length-1];if(l&&l.l===pt.l&&l.o===pt.o&&l.u===pt.u)return;h.push(pt);if(h.length>80)h.splice(0,h.length-80)}
function recLine(id,o){push(id+"|total",{t:Date.now(),l:o.total.line,o:o.total.over,u:o.total.under});push(id+"|spread",{t:Date.now(),l:o.spread.home,o:o.spread.homeOdds,u:o.spread.awayOdds})}
function mergeProps(id,r){const G=gameOf(id),now=Date.now(),seen=new Set();G.noMarket=!!r.none||!r.length;
  r.forEach(m=>{const k=m.ath+"|"+m.st;seen.add(k);const p=G.props[k]||(G.props[k]={ath:m.ath,st:m.st});
    Object.assign(p,{l:m.l,o:m.o,u:m.u,lOpen:m.lOpen,oOpen:m.oOpen,uOpen:m.uOpen,yn:m.yn,seen:now,gone:false});push(id+"|"+k,{t:now,l:m.l,o:m.o,u:m.u})});
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
  const cur=curOf(pl,mk.st),need=mk.l-cur;
  const pOverRaw=need<0?1:mean<=0?0:(COUNT_ST[mk.st]||mean<5)?poisOver(mean,need):1-Phi((need-mean)/Math.sqrt(Math.max(vr,.5)));
  const pm=mk.o!=null&&mk.u!=null?devig(mk.o,mk.u)[0]:mk.o!=null?Math.max(.01,imp(mk.o)-.025):null;
  /* live markets react to things this model can't see (rotations, matchups, pace in real time), so lean on them:
     35% model, 65% DraftKings' no-vig chance, and never more than 4 points from the market */
  const pO=pm!=null?Math.min(pm+.04,Math.max(pm-.04,pm+.35*(pOverRaw-pm))):pOverRaw,side=cur+mean>=mk.l?"o":"u",p=side==="o"?pO:1-pO,price=side==="o"?mk.o:mk.u;
  return{name,pl,P,cur,need,remMean:mean,final:cur+mean,minLeft:ml.m,gameLeft:ml.left,mwhy:ml.why,pOverRaw,pm,pO,side,p,price,ev:price!=null?evOf(p,price):null,capped:pm!=null}}
function fresh(id,mk){const G=gameOf(id);return!mk.gone&&G.propsOk!==false&&Date.now()-G.propsTs<FRESH}

/* ---------- views ---------- */
const teamTag=(ab,full)=>{const[,c1,c2]=team(full||"");return`<span class="lv-tm" style="--c1:${c1};--c2:${c2}">${esc(ab2(ab))}</span>`};
const statusTxt=e=>e.state==="in"?(/^0(\.0)?$|^0:00$/.test(e.clock||"")||!e.clockSec?(e.detail||"Break"):(e.period>4?"OT"+(e.period>5?e.period-4:""):"Q"+e.period)+" · "+e.clock):e.state==="post"?"Final":tipLocal(e);
const tipLocal=e=>new Date(e.date).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
const upd=ts=>ts?ago(ts):"never";
function feedBar(){const age=LV.sbTs?Date.now()-LV.sbTs:null,old=age==null||age>FRESH;
  return`<div class="lv-feed ${old?"old":""}"><span class="dot"></span>${LV.sbOk===false?"Can't reach ESPN right now. Showing the last update.":`Scores ${upd(LV.sbTs)} · refreshes every ${POLL/1000}s while this screen is open`}</div>`}
function valueCount(id){const G=gameOf(id);let n=0;Object.values(G.props).forEach(mk=>{if(!fresh(id,mk))return;const m=model(id,mk);if(m&&m.ev!=null&&m.ev>=.03)n++});return n}
function topPerf(id){const G=gameOf(id);if(!G.box)return"";const ps=Object.values(G.box.players).filter(p=>!p.dnp).sort((a,b)=>(b.pts||0)-(a.pts||0)).slice(0,3);
  return ps.map(p=>`<span>${esc(p.name.split(" ").slice(-1)[0])} <b>${p.pts}</b>p ${p.reb}r ${p.ast}a</span>`).join("")}
function gameCard(e){const G=gameOf(e.id),o=G.odds,n=Object.values(G.props).filter(m=>!m.gone).length,v=valueCount(e.id);
  return`<button class="lv-card" data-lvg="${e.id}"><div class="lv-row"><div class="lv-teams">
    <div class="lv-t">${teamTag(e.awayAb,e.away)}<b class="sc" data-sc="${e.id}a">${e.awayScore}</b></div>
    <div class="lv-t">${teamTag(e.homeAb,e.home)}<b class="sc" data-sc="${e.id}h">${e.homeScore}</b></div></div>
    <div class="lv-clock"><span class="lv-live">Live</span><b>${esc(statusTxt(e))}</b></div></div>
    <div class="lv-mk">${o?`<span>Live total <b>${o.total.line??"–"}</b></span><span>Spread <b>${ab2(e.homeAb)} ${o.spread.home>0?"+":""}${o.spread.home??"–"}</b></span>`:`<span>No live game line right now</span>`}
      <span>${n?`<b>${n}</b> live player markets`:G.propsFetched?"No live player markets":"Loading markets"}</span>${v?`<span class="lv-val">${v} with potential value</span>`:""}</div>
    ${G.box?`<div class="lv-perf">${topPerf(e.id)}</div>`:""}
    <div class="lv-upd">Odds ${upd(G.oddsTs)} · props ${upd(G.propsTs)}</div></button>`}
let lastList="",lastGame="";
function renderList(){const el=document.getElementById("liveBody");if(!el)return;
  const live=LV.sb.filter(e=>e.state==="in"),pre=LV.sb.filter(e=>e.state==="pre"),post=LV.sb.filter(e=>e.state==="post");
  const html=feedBar()+(!LV.sbTs?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Checking for games in progress…</span></div>`:
    (live.length?`<div class="lv-h">In progress <em>${live.length}</em></div>${live.map(gameCard).join("")}`
      :`<div class="pf-empty"><b style="color:var(--ink)">No games in progress right now.</b> Live scores, live lines and live player props appear here once a game tips off. ${pre.length?`Next tip: ${esc(ab2(pre[0].awayAb))} @ ${esc(ab2(pre[0].homeAb))} at ${tipLocal(pre[0])}.`:""}</div>`)+
    (pre.length?`<div class="lv-h">Up next</div><div class="lv-mini">${pre.map(e=>`<div><span>${esc(ab2(e.awayAb))} @ ${esc(ab2(e.homeAb))}</span><b>${tipLocal(e)}</b></div>`).join("")}</div>`:"")+
    (post.length?`<div class="lv-h">Final</div><div class="lv-mini">${post.map(e=>`<div><span>${esc(ab2(e.awayAb))} ${e.awayScore} @ ${esc(ab2(e.homeAb))} ${e.homeScore}</span><b>Final</b></div>`).join("")}</div>`:""))+
    `<p class="pf-foot">Live lines and live player props are DraftKings' in-game markets as published through ESPN. Projections are Sharpline's model. Bet only after confirming the price at your book; live prices change in seconds.</p>`;
  if(html!==lastList){el.innerHTML=html;lastList=html}
  const nb=document.querySelector('.nav [data-v="live"]');if(nb)nb.classList.toggle("haslive",live.length>0)}

/* ---------- game view ---------- */
function moveChart(k,pre,mk){const h=(HIST[k]||[]).filter(p=>p.l!=null);const pts=[];if(pre&&pre.l!=null)pts.push({lbl:"Pregame",l:pre.l});if(mk.lOpen!=null)pts.push({lbl:"Live open",l:mk.lOpen});
  h.forEach(p=>pts.push({lbl:new Date(p.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}),l:p.l,o:p.o,u:p.u}));if(pts.length<2)return`<div class="lv-nomove">No movement recorded yet. Sharpline records changes while this screen is open.</div>`;
  const ls=pts.map(p=>p.l),mn=Math.min(...ls),mx=Math.max(...ls),W=320,H=90,pad=14,x=i=>pad+i*(W-2*pad)/(pts.length-1),y=l=>mx===mn?H/2:H-pad-(l-mn)/(mx-mn)*(H-2*pad);
  let d="";pts.forEach((p,i)=>{d+=i?`H${x(i)}V${y(p.l)}`:`M${x(0)} ${y(p.l)}`});
  const changes=[];for(let i=1;i<h.length;i++){const a=h[i-1],b=h[i];if(a.l!==b.l)changes.push(`<li><b>Line</b> ${a.l} → ${b.l}<span>${new Date(b.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></li>`);else if(a.o!==b.o||a.u!==b.u)changes.push(`<li><b>Price</b> O ${fmtAm(a.o)} / U ${fmtAm(a.u)} → O ${fmtAm(b.o)} / U ${fmtAm(b.u)}<span>${new Date(b.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></li>`)}
  return`<svg class="lv-move" viewBox="0 0 ${W} ${H}"><path d="${d}"/>${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.l)}" r="3.5"><title>${esc(p.lbl)}: ${p.l}${p.o!=null?` (O ${fmtAm(p.o)} / U ${fmtAm(p.u)})`:""}</title></circle>`).join("")}
    <text x="${pad}" y="${H-1}">${esc(pts[0].lbl)} ${pts[0].l}</text><text x="${W-pad}" y="${H-1}" text-anchor="end">Now ${pts[pts.length-1].l}</text></svg>
    ${changes.length?`<ul class="lv-ch">${changes.slice(-6).reverse().join("")}</ul>`:""}`}
function lean(pre,mk){const base=mk.lOpen??(pre&&pre.l);if(base==null)return"";if(mk.l>base)return`<span class="lv-dir o">Moving toward Over (line up ${r1(mk.l-base)})</span>`;if(mk.l<base)return`<span class="lv-dir u">Moving toward Under (line down ${r1(base-mk.l)})</span>`;
  if(mk.oOpen!=null&&mk.o!=null&&mk.o!==mk.oOpen)return`<span class="lv-dir ${dec(mk.o)<dec(mk.oOpen)?"o":"u"}">Same line, ${dec(mk.o)<dec(mk.oOpen)?"Over":"Under"} price shortened</span>`;return""}
function propRow(id,k,mk,pre){const m=model(id,mk),f=fresh(id,mk),st=mk.gone?"susp":f?"live":"old",open=LV.exp[k];
  const chip=st==="susp"?`<span class="lv-st susp">Suspended or pulled ${mk.goneTs?ago(mk.goneTs):""}</span>`:st==="old"?`<span class="lv-st old">Outdated</span>`:`<span class="lv-st live">Live</span>`;
  const val=f&&m&&m.ev!=null&&m.ev>=.03;
  return`<div class="lv-pr ${st} ${val?"val":""} ${open?"open":""}" data-lvx="${esc(k)}"><div class="lv-pr-top">
      <div class="lv-pr-l"><b>${STAT_LBL[mk.st]||mk.st}</b> ${chip}<div class="s">${m?`Now <b>${r1(m.cur)}</b> · needs ${m.need<0?"none, already over":r1(m.need)+" more"}`:""}${pre&&pre.l!=null?` · pregame ${pre.l}`:""}</div></div>
      <div class="lv-pr-r"><div class="ln">${mk.yn?"Yes":mk.l}</div><div class="px">O ${fmtAm(mk.o)}${mk.yn?"":` · U ${fmtAm(mk.u)}`}</div></div></div>
    ${m?`<div class="lv-pr-m"><span>Projected final <b>${r1(m.final)}</b> <em>model</em></span><span>${m.side==="o"?"Over":"Under"} <b>${pct(m.p)}</b></span>${f&&m.ev!=null?`<span class="${m.ev>=0?"pos":"neg"}">${m.ev>=0?"+":""}${(m.ev*100).toFixed(1)}% EV</span>`:`<span class="muted">No EV: price not current</span>`}${val?`<span class="lv-val">Potential edge</span>`:""}</div>`
      :`<div class="lv-pr-m"><span class="muted">${mk.yn?"Yes/No markets aren't modeled live.":"No season data for a live projection; showing the market only."}</span></div>`}
    ${open?`<div class="lv-pr-x">${m?`<p>${esc(m.name)} has ${r1(m.cur)} in ${Math.round((m.pl&&m.pl.min)||0)} minutes${m.pl&&m.pl.pf!=null?` with ${m.pl.pf} fouls`:""}. About ${r1(m.gameLeft)} game minutes are left; Sharpline expects him to play about ${r1(m.minLeft)} of them${m.mwhy.length?` (${esc(m.mwhy.join(", "))})`:""}, adding about ${r1(m.remMean)} for a projected ${r1(m.final)}. Chance of Over ${mk.l}: ${pct(m.pO)}${m.pm!=null?` (Sharpline's in-game model alone says ${pct(m.pOverRaw)}; blended with DraftKings' no-vig ${pct(m.pm)}, which sees rotations and matchups this model can't)`:""}.</p>`:""}
      ${lean(pre,mk)}${moveChart(id+"|"+k,pre,mk)}
      ${m&&f&&m.price!=null?`<button class="lv-track" data-lvtrack="${esc(id+"|"+k)}">+ Track ${m.side==="o"?"Over":"Under"} ${mk.l} at ${fmtAm(m.price)}</button>`:""}</div>`:""}</div>`}
function boxTable(G,teamId){const ps=Object.values(G.box.players).filter(p=>p.teamId===teamId).sort((a,b)=>(b.starter-a.starter)||(b.min-a.min));
  return`<div class="pf-tw"><table class="pf-log lv-box"><thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>
  ${ps.map(p=>`<tr class="${p.dnp?"dnp":""}"><td><span class="pfn" ${pfAttr({n:p.name})}>${esc(p.name)}</span></td><td>${p.dnp?"DNP":Math.round(p.min)}</td><td>${p.pts??"–"}</td><td>${p.reb??"–"}</td><td>${p.ast??"–"}</td><td>${p.tpm??"–"}</td><td>${p.stl??"–"}</td><td>${p.blk??"–"}</td><td>${p.to??"–"}</td><td class="${(p.pf||0)>=5?"neg":""}">${p.pf??"–"}</td></tr>`).join("")}</tbody></table></div>`}
function linesTable(e,G){const o=G.odds,gi=SNAP.findIndex(S=>nick(S.home)===nick(e.home)),pre=gi>=0?LIVE.ev[gi]&&LIVE.ev[gi].odds:null;
  const row=(lbl,p,op,cur,extra)=>`<tr><td>${lbl}</td><td>${p??"–"}</td><td>${op??"–"}</td><td><b>${cur??"–"}</b>${extra?`<small>${extra}</small>`:""}</td></tr>`;
  const sg=v=>v==null?null:(v>0?"+":"")+v;
  return`<div class="pf-tw"><table class="pf-log lv-lines"><thead><tr><th>Market</th><th>Pregame</th><th>Live open</th><th>Live now</th></tr></thead><tbody>
    ${row("Total",pre&&pre.total.line,o&&o.total.open,o&&o.total.line,o?`O ${fmtAm(o.total.over)} / U ${fmtAm(o.total.under)}`:"")}
    ${row(ab2(e.homeAb)+" spread",pre&&sg(pre.spread.home),o&&sg(o.spread.homeOpen),o&&sg(o.spread.home),o?fmtAm(o.spread.homeOdds):"")}
    ${row(ab2(e.homeAb)+" moneyline",pre&&fmtAm(pre.ml.home),o&&fmtAm(o.ml.homeOpen),o&&fmtAm(o.ml.home),"")}
    ${row(ab2(e.awayAb)+" moneyline",pre&&fmtAm(pre.ml.away),o&&fmtAm(o.ml.awayOpen),o&&fmtAm(o.ml.away),"")}</tbody></table></div>
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
      players.length?players.map(P=>`<div class="lv-pl"><div class="lv-pl-h"><span class="pfa" ${pfAttr({n:P.nm,t:P.tm})}>${avatar(P.nm,P.tm||"","av")}</span><div><b class="pfn" ${pfAttr({n:P.nm,t:P.tm})}>${esc(P.nm)}</b><div class="s">${P.pl&&!P.pl.dnp?`${P.pl.pts} PTS · ${P.pl.reb} REB · ${P.pl.ast} AST · ${P.pl.tpm??0} 3PM · ${Math.round(P.pl.min)} MIN · ${P.pl.pf??0} PF`:"Hasn't played yet"}</div></div></div>
        ${byP[P.a].sort((x,y)=>statRank(x[1].st)-statRank(y[1].st)).map(([k,mk])=>propRow(e.id,k,mk,G.pre&&G.pre[k])).join("")}</div>`).join(""):`<div class="pf-empty">Nothing matches this filter right now.</div>`}`}
  else if(LV.tab==="box")body=!G.box?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading box score…</span></div>`:`<div class="lv-h">${esc(e.away)}</div>${boxTable(G,e.awayId)}<div class="lv-h">${esc(e.home)}</div>${boxTable(G,e.homeId)}`;
  else{const T=G.box&&G.box.teams||[],tA=T.find(t=>t.id===e.awayId),tH=T.find(t=>t.id===e.homeId),ks=["FG","Field Goal %","3PT","Three Point %","Rebounds","Assists","Turnovers","Fast Break Points","Points in Paint","Largest Lead"];
    body=`<div class="lv-h">Game lines</div>${linesTable(e,G)}
      ${tA&&tH?`<div class="lv-h">Team stats</div><div class="pf-tw"><table class="pf-log lv-ts"><thead><tr><th>${esc(ab2(e.awayAb))}</th><th></th><th>${esc(ab2(e.homeAb))}</th></tr></thead><tbody>${ks.filter(k=>tA.stats[k]!=null).map(k=>`<tr><td>${esc(tA.stats[k])}</td><td>${esc(k)}</td><td>${esc(tH.stats[k])}</td></tr>`).join("")}</tbody></table></div>`:""}
      ${G.box&&G.box.plays.length?`<div class="lv-h">Recent plays</div><ul class="lv-plays">${G.box.plays.slice(0,15).map(p=>`<li class="${p.score?"sc":""}"><span>Q${p.period} ${esc(p.clock)}</span>${esc(p.text)}<b>${p.away}-${p.home}</b></li>`).join("")}</ul>`:""}`}
  const html=`<div class="pf-in"><div class="pf-bar"><button class="pf-back" data-lvclose="1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Live</button><span class="pf-tt">${e.state==="in"?`<span class="lv-live">Live</span>`:esc(statusTxt(e))}</span></div>
    <header class="lv-sb" style="--ca:${ca};--ch:${ch}"><div class="lv-sbt">${teamTag(e.awayAb,e.away)}<b class="sc">${e.awayScore}</b><span>${esc(e.away)}</span></div>
      <div class="lv-sbc"><b>${esc(statusTxt(e))}</b>${wp!=null?`<div class="lv-wp" title="ESPN win probability"><i style="width:${Math.round((1-wp)*100)}%"></i></div><small>${esc(ab2(e.awayAb))} ${Math.round((1-wp)*100)}% · ${esc(ab2(e.homeAb))} ${Math.round(wp*100)}% (ESPN)</small>`:""}</div>
      <div class="lv-sbt r">${teamTag(e.homeAb,e.home)}<b class="sc">${e.homeScore}</b><span>${esc(e.home)}</span></div></header>
    ${feedBar()}<div class="lv-upd c">Live odds ${upd(G.oddsTs)} · props ${upd(G.propsTs)} · box ${upd(G.boxTs)}</div>
    <div class="seg wide lv-tabs">${tabs.map(([v,l])=>`<button class="${LV.tab===v?"on":""}" data-lvt="${v}">${l}</button>`).join("")}</div>
    <div class="lv-body">${body}</div>
    <p class="pf-foot">Live markets are DraftKings in-game lines via ESPN. "Projected final" is Sharpline's model: current stats plus his usual per-minute production over the minutes he's expected to play from here. Movement is only what this phone recorded while open.</p></div>`;
  if(html===lastGame&&keep)return;lastGame=html;el.innerHTML=html;if(keep)el.scrollTop=st0}
function render(){renderList();if(LV.open)renderGame(true);if(window.PF&&PF.open)renderProfile(true)}
function openGame(id){lastGame="";LV.open=id;LV.tab="props";const el=document.getElementById("lg");el.classList.add("on");el.scrollTop=0;document.body.classList.add("pf-lock");
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
window.LiveUI={start,poll,render,LV,openGame,model};
})();
