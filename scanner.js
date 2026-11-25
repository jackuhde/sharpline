/* Sharpline universal bet scanner.
   1) Input: screenshots (tap, drag and drop, or paste), pasted text, or a bet typed by hand. Screenshots are read on the
      device (readImage): the image is normalized so dark mode, colored buttons and small text all become dark text on white,
      Tesseract finds every word and its position (sparse-text mode), layout.js rebuilds which line, price and side belong
      together from those positions, and every number keeps its recognition confidence. An optional vision model (your own
      free Gemini key, Settings) can read the screenshot instead; its answer goes through the same checks.
   2) Extraction: betparse.js turns the text into bets (singles, parlays, board rows) and lists anything it couldn't read.
   3) Review: every bet is editable before anything is analyzed.
   4) Verification and analysis: each leg is matched to a real player, team, game and market. The SUBMITTED line and odds
      are what get graded; the current market is shown next to them and never replaces them.
   5) Results: submitted bet, verification, current market, Sharpline's numbers, a plain-language verdict, and links into
      the rest of the app. Tracking keeps the submitted line, odds, book, stake and time. */
(function(){
const SB=window.SharpBets,RK=window.SLRank;
const h=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const am=a=>a==null||isNaN(a)?"–":(a>0?"+":"")+Math.round(a),pc=p=>p==null?"–":(p*100).toFixed(1)+"%",pc0=p=>p==null?"–":Math.round(p*100)+"%";
const evs=v=>v==null?"–":(v>=0?"+":"−")+Math.abs(v*100).toFixed(1)+"%";
const decA=a=>a>0?1+a/100:1+100/Math.abs(a),impA=a=>1/decA(a),toAm=d=>d>=2?Math.round((d-1)*100):-Math.round(100/(d-1));
const ago=t=>{if(!t)return"";const s=(Date.now()-t)/1e3;return s<90?"just now":s<3600?Math.round(s/60)+" min ago":s<172800?Math.round(s/3600)+"h ago":Math.round(s/86400)+" days ago"};
const S={bets:[],res:null,files:[],busy:false};
const NBA_MK=[["Points","Points"],["Rebounds","Rebounds"],["Assists","Assists"],["3-Pointers","Threes made"],["Pts+Reb+Ast","Pts + Reb + Ast"],["Pts+Reb","Pts + Reb"],["Pts+Ast","Pts + Ast"],["Reb+Ast","Reb + Ast"],["Steals","Steals"],["Blocks","Blocks"],["Turnovers","Turnovers"]];
const NFL_MK=[["pYds","Passing yards"],["pTD","Passing TDs"],["cmp","Completions"],["att","Pass attempts"],["int","Interceptions"],["pRYds","Pass + rush yards"],["rYds","Rushing yards"],["car","Rush attempts"],["rLng","Longest rush"],["recYds","Receiving yards"],["rec","Receptions"],["tgt","Targets"],["recLng","Longest reception"],["rRecYds","Rush + rec yards"],["td","Anytime TD"],["td1","First TD"],["td2","2+ TDs"],["kPts","Kicking points"],["fgM","Field goals made"],["xpM","Extra points made"]];
const GAME_MK=[["spread","Spread"],["ml","Moneyline"],["total","Game total"],["teamTotal","Team total"]];
const mkLbl=(sp,st)=>((sp==="nfl"?NFL_MK:NBA_MK).find(x=>x[0]===st)||[])[1]||st||"market?";
const YN=new Set(["td","td1","td2"]);

/* ---------- names and teams for both sports ---------- */
function nbaNames(){try{return ocrCtx().names.map(x=>({...x,sport:"nba"}))}catch(e){return[]}}
function nbaTeams(){return Object.entries(TEAMS).map(([full,v])=>({full,ab:v[0],nick:full.toLowerCase().split(" ").pop(),sport:"nba"}))}
function ctxAll(){const nfl=window.NFL&&NFL.N.stats;return{names:[...nbaNames(),...(nfl?NFL.scanNames():[])],teams:[...nbaTeams(),...(nfl?NFL.scanTeams():[])]}}
async function prepNFL(){if(window.SLCorr)SLCorr.load();if(!window.NFL)return;try{await Promise.race([NFL.ensure(),new Promise(r=>setTimeout(r,15000))])}catch(e){}}

/* ---------- prediction markets: price in cents plus the exchange fee ---------- */
function pmCost(leg,book){if(!leg.pm||leg.pm.cents==null)return null;const P=leg.pm.cents/100,q=leg.pm.qty||1;
  if(book==="Kalshi"){const fee=Math.ceil(.07*q*P*(1-P)*100-1e-9)/100;return{P,q,fee,per:P+fee/q,note:`Kalshi's standard taker fee, 7% × price × (1 − price), rounded up to the cent: $${fee.toFixed(2)} on ${q} contract${q===1?"":"s"}. Resting (maker) orders pay less, and a few markets have their own schedule`}}
  return{P,q,fee:null,per:P,note:`${book||"This exchange"}'s fees aren't known to Sharpline, so none are included`}}
const effOdds=(leg,book)=>{const c=pmCost(leg,book);if(c)return toAm(1/c.per);return leg.odds};

/* ---------- NBA: verify and price one leg with the board's own machinery ---------- */
function nbaEval(key,L,side,odds){const v={L};if(side==="under"||side==="b")v.b=odds??-110;else v.a=odds??-110;
  try{const r=evalEntry({key,v});const b=r.best;if(!b)return{closed:true};return{p:b.p,ev:odds!=null?b.ev:null,why:b.why,conf:b.conf,push:b.push,gap:b.gap,lbl:b.lbl}}catch(e){console.warn(e);return null}}
function nbaGameInfo(A,gi){const G=SNAP[gi];A.gi=gi;A.game=mu(G);A.tip=G.tip;const st=started(gi),e=typeof evFor==="function"?evFor(gi):null;
  A.checks.push(st?{ok:e&&e.state==="post"?false:null,t:e&&e.state==="post"?"Final. This bet is already decided":`Underway${e&&e.detail?": "+e.detail:""}. Pregame prices no longer apply`}:{ok:true,t:`${mu(G)} · tips ${tipT(G)}`});return st}
function nbaProp(leg){const A={sport:"nba",checks:[],market:{rows:[]},an:null};
  if(!leg.player){A.cands=(leg.cands||[]).filter(c=>c.sport==="nba");A.checks.push({ok:false,t:A.cands.length>1?`${A.cands.length} NBA players match. Pick one in review`:"No player name in the submission"});return A}
  const m=SB.matchName(leg.player||"",nbaNames());
  if(!m||!m.x){A.cands=m?m.cands:[];A.checks.push({ok:false,t:A.cands.length>1?`${A.cands.length} NBA players match. Pick one`:`"${leg.player}" isn't on tonight's NBA board or in Sharpline's player list`});return A}
  const name=m.x.p,fp=leg.stat?findProp(name,leg.stat):null,pj=projOf(name);const X=fp&&fp.key[0]==="p"?PROPS[+fp.key.slice(1)]:null;
  const ab=X?team(X.tm)[0]:pj&&normN(pj.p)===normN(name)?pj.ab:m.x.ab;A.player=name;A.ab=ab;
  A.checks.push({ok:true,t:`${name}${ab?" · "+ab:""}`});
  if(leg.team&&leg.team.ab&&ab&&leg.team.ab!==ab)A.checks.push({ok:false,t:`Submitted with ${leg.team.ab}, but Sharpline has him on ${ab}`});
  const gi=ab?gameOfAbbr(ab):-1;if(gi<0){A.checks.push({ok:false,t:`${ab||"His team"} isn't on today's NBA slate`});return A}
  const closed=nbaGameInfo(A,gi);
  if(X&&X.live&&X.live.lv)A.checks.push({ok:X.live.lv==="out"?false:null,t:`Injury report: ${X.live.txt||X.live.lv}`});else if(OUT.has(normN(name)))A.checks.push({ok:false,t:"Listed out"});
  if(!leg.stat){A.checks.push({ok:false,t:"Market not read"});return A}
  if(X){A.checks.push({ok:true,t:`Books have this market: ${STAT_LBL[leg.stat]||leg.stat}`});A.key=fp.key;
    A.market={rows:X.q.filter(q=>typeof q.l==="number").map(q=>({book:q.src,line:q.l,over:q.o??null,under:q.u??null,oc:q.oc,uc:q.uc})),upd:typeof SNAP_TIME!=="undefined"?SNAP_TIME:""}}
  else if(fp){A.key=fp.key;A.checks.push({ok:null,t:"Only on the board from an earlier screenshot"})}
  else A.checks.push({ok:null,t:`No book line for his ${STAT_LBL[leg.stat]||leg.stat} tonight, so there's no market to anchor to`});
  if(closed){A.an={none:"Game has started. Sharpline only grades pregame bets"};return A}
  if(leg.line==null){A.an={none:"No line to price"};return A}
  if(!A.key){if(!projP(name,leg.stat,leg.line)){A.an={none:"No book line and no season averages for this market"};return A}
    const C=ensureCustom({player:name,ab,stat:leg.stat,line:leg.line,over:leg.side!=="under"?leg.odds:null,under:leg.side==="under"?leg.odds:null});if(!C){A.an={none:"Couldn't place him in a game"};return A}A.key="c"+C.id}
  const odds=effOdds(leg,leg._book),r=nbaEval(A.key,leg.line,leg.side,odds);if(!r||r.closed){A.an={none:"Not gradeable right now"};return A}
  const pr=projP(name,leg.stat,leg.line);
  A.an={p:r.p,proj:pr?pr.m:null,why:r.why,conf:r.conf,push:r.push,model:X?"market plus projection":"projection only",anchored:!!X,trusted:!!X,lbl:r.lbl,n:pj&&pj.gp};
  /* every book's price for the SAME side, each graded at its own line */
  A.market.rows.forEach(q=>{const o=leg.side==="under"?q.under:q.over;if(o==null)return;const rr=nbaEval(A.key,q.line,leg.side,o);if(rr){q.ev=rr.ev;q.p=rr.p}});
  return A}
function nbaGame(leg){const A={sport:"nba",checks:[],market:{rows:[]},an:null};const ab=(leg.team||leg.teams[0]||{}).ab;
  const gi=ab?gameOfAbbr(ab):-1;if(gi<0){A.checks.push({ok:false,t:`${ab||"That team"} isn't on today's NBA slate`});return A}
  const closed=nbaGameInfo(A,gi);if(leg.mk==="teamTotal"){A.checks.push({ok:null,t:"Team totals aren't in Sharpline's free feeds"});A.an={none:"No team-total data"};return A}
  const odds=effOdds(leg,leg._book);const row={k:"G",ab,mk:leg.mk==="ml"?"moneyline":leg.mk,line:leg.line,odds:odds??-110,side:leg.side||"-"};
  const {ents}=buildEntries([row]);if(!ents.length){A.checks.push({ok:null,t:"No market line on the board for this"});A.an={none:"No market line to price against"};return A}
  A.key=ents[0].key;A.checks.push({ok:true,t:"Market on the board: "+boardNow(A.key)});A.market={text:boardNow(A.key),rows:[]};
  if(closed){A.an={none:"Game has started"};return A}
  try{const r=evalEntry(ents[0]),b=r.best;if(!b){A.an={none:"Not gradeable right now"};return A}A.an={p:b.p,ev:odds!=null?b.ev:null,why:b.why,conf:b.conf,push:b.push,model:"market no-vig",anchored:true,trusted:true,lbl:b.lbl}}catch(e){A.an={none:"Couldn't grade"}}
  return A}

/* ---------- one leg: sport, adapter, then the numbers for the submitted price ---------- */
function analyzeLeg(leg,book){leg._book=book;let sp=leg.sport;const A0={checks:[],market:{rows:[]}};
  if(!sp){sp=typeof SPORT!=="undefined"?SPORT:"nba";A0.guess=1}
  let A;if(leg.mk==="pm"){A={...A0,sport:sp,checks:[{ok:false,t:"The contract's question isn't in the screenshot. Type the player and market, or the team"}],an:null}}
  else if(sp==="nfl")A=window.NFL&&NFL.N.stats?NFL.scanQuote(leg):{sport:"nfl",checks:[{ok:false,t:"NFL data hasn't loaded"}],market:{rows:[]},an:null};
  else A=leg.mk==="prop"?nbaProp(leg):nbaGame(leg);
  A.guess=A0.guess;if(A.guess)A.checks.unshift({ok:null,t:`Sport not clear from the text, checked as ${sp.toUpperCase()}`});
  if(leg.missing&&leg.missing.length)A.checks.unshift({ok:false,t:"Not in the submission: "+leg.missing.join(", ")});
  if(leg.notModeled)A.checks.push({ok:null,t:`${leg.notModeled} is recognized but Sharpline has no model for it`});
  const odds=effOdds(leg,book),pm=pmCost(leg,book);const an=A.an||{};
  const R={leg,A,odds,pm,p:an.p??null,implied:odds!=null?(pm?pm.per:impA(odds)):null};
  if(R.p!=null&&odds!=null){R.ev=pm?R.p/pm.per-1:an.ev!=null&&A.sport==="nba"?an.ev:R.p*decA(odds)-1;R.edge=R.p-R.implied}
  verdict(R);return R}
function reliability(R){const a=R.A.an||{},out=[];let lv=2;
  if(R.A.sport==="nba"&&a.conf){lv=a.conf.lv==="High"?3:a.conf.lv==="Medium"?2:1;(a.conf.why||[]).forEach(w=>out.push(w))}
  if(R.A.sport==="nfl"&&a.model==="projection"||a.model==="touchdown rate"){if(!a.trusted){lv=1;out.push(a.bt||"this stat hasn't beaten the market in the backtest")}else{lv=2;out.push(a.bt)}
    if(a.n!=null&&a.n<5){lv=1;out.push(`only ${a.n} games of history`)}if(a.far){lv=1;out.push("your line is far from DraftKings', so the estimate is rough")}if(!a.anchored&&a.model==="projection"){lv=1;out.push("no DraftKings line to anchor the projection")}}
  if(a.model==="projection only"){lv=1;out.push("no book line tonight, so this is averages only")}
  if(a.rough){lv=Math.min(lv,1);out.push(a.rough)}
  if(R.A.guess){lv=Math.min(lv,1);out.push("sport was guessed")}
  if(R.A.checks.some(c=>c.ok===false))lv=0;
  return{lv,why:out.filter(Boolean)}}
function verdict(R){const rel=R.rel=reliability(R);
  if(R.p==null){R.v="na";R.vt=R.A.an&&R.A.an.none?R.A.an.none:R.A.checks.find(c=>c.ok===false)?"Couldn't verify this bet":"No probability for this market";return}
  if(R.odds==null){R.v="na";R.vt=`Sharpline gives it ${pc0(R.p)}, but there are no odds to compare. That chance needs ${am(RK.fairAm(R.p))} or better`;return}
  if(rel.lv===0){R.v="na";R.vt="Something didn't verify, so this isn't graded";return}
  if(R.ev>=.02&&rel.lv>=2)R.v="fav";else if(R.ev<=-.02)R.v="unfav";else R.v="neu";
  R.vt=explain(R)}
function explain(R){const a=R.A.an,need=pc(R.implied),got=pc(R.p);let s=`Sharpline gives this ${got}. At ${am(R.odds)}${R.pm?" (contract plus fee)":""} it needs ${need} to break even, `;
  s+=R.ev>=0?`so the price pays more than the chance warrants: about ${evs(R.ev)} per dollar on average.`:`so the price is too short: about ${evs(R.ev)} per dollar on average.`;
  if(a&&a.marketOnly)s+=` For this stat the backtest found no edge in Sharpline's projection, so the chance is DraftKings' line carried to your number; the projection (${Math.round(a.proj*10)/10}) is shown for reference only.`;
  else if(a&&a.proj!=null&&R.leg.line!=null&&R.leg.side){const above=a.proj>R.leg.line;if((R.leg.side==="over")===above&&R.ev<0)s+=` The projection (${Math.round(a.proj*10)/10}) is on your side of ${R.leg.line}, but that's not enough at this price.`}
  if(R.v==="neu"&&R.ev>=.02)s+=" The number looks good, but the estimate isn't reliable enough to call it favorable.";
  return s}

/* ---------- parlays ---------- */
function analyzeBet(b){const book=b.book;const legs=b.legs.map(L=>analyzeLeg(L,book));const out={b,legs};
  if(b.kind!=="parlay"){out.R=legs[0];return out}
  const allOdds=legs.every(r=>r.odds!=null),mult=allOdds?legs.reduce((a,r)=>a*decA(r.odds),1):null;
  out.multAm=mult?toAm(mult):null;out.parAm=b.parlayOdds??(b.pickem?null:out.multAm);out.parSrc=b.parlayOdds!=null?"slip":"legs multiplied";
  const games=legs.map(r=>r.A.eid||(r.A.gi!=null?"g"+r.A.gi:null));const sameGame=games.some((g,i)=>g&&games.indexOf(g)!==i);out.sameGame=sameGame||b.sgp;
  const allP=legs.every(r=>r.p!=null);
  if(!allP)out.pNote="At least one leg has no probability, so there's no combined chance.";
  else if(out.sameGame){const J=window.SLCorr&&SLCorr.ready()?SLCorr.joint(legs.map(r=>({game:r.A.eid||(r.A.gi!=null?"g"+r.A.gi:null),ath:r.A.athId,pos:r.A.pos,tid:r.A.tid,stat:r.A.sport==="nfl"&&r.leg.mk==="prop"?(r.leg.stat==="td2"?"td":r.leg.stat):null,dir:r.leg.side==="under"||r.leg.side==="no"?-1:1,p:r.p}))):null;
    if(J&&J.pairs.length){out.p=J.p;out.pNote=`Same-game legs move together, so this uses within-game correlations measured on this season's NFL box scores (treated as independent it would be ${(J.indep*100).toFixed(1)}%).${J.unknown?" Pairs with no measured correlation count as independent.":""}`}
    else out.pNote="Two or more legs are from the same game, and Sharpline has no measured correlation for this combination (NBA, or game lines), so it won't give a combined chance; multiplying the legs would be wrong."}
  else{out.p=legs.reduce((a,r)=>a*r.p,1);out.pNote="Legs are from different games, so they're treated as independent."}
  if(out.p!=null&&out.parAm!=null){out.ev=out.p*decA(out.parAm)-1;out.implied=impA(out.parAm)}
  if(b.stake!=null&&out.parAm!=null)out.payout=+(b.stake*(b.parlayOdds==null&&mult?mult:decA(out.parAm))).toFixed(2);
  const sc=legs.map((r,i)=>({i,s:r.edge!=null?r.edge:r.p!=null?r.p-.5:null})).filter(x=>x.s!=null).sort((a,c)=>c.s-a.s);
  if(sc.length>1){out.best=sc[0].i;out.worst=sc[sc.length-1].i}
  /* what dropping one leg does, priced at the legs multiplied (a book's price for the smaller parlay can differ) */
  if(out.p!=null&&allOdds&&legs.length>2&&!b.pickem)out.drop=legs.map((r,i)=>{const p=out.p/r.p,d=mult/decA(r.odds);return{i,p,am:toAm(d),ev:p*d-1}});
  out.v=out.ev==null?"na":out.ev>=.02&&legs.every(r=>r.rel.lv>=2)?"fav":out.ev<=-.02?"unfav":"neu";
  return out}

/* ---------- render: review ---------- */
const sel=(opts,v,attr)=>`<select ${attr}>${opts.map(([k,l])=>`<option value="${h(k)}" ${k===v?"selected":""}>${h(l)}</option>`).join("")}</select>`;
function legEditor(b,L,j){const sp=L.sport||"",isGame=L.mk&&L.mk!=="prop"&&L.mk!=="pm",mk=isGame?L.mk:L.stat||"";
  const mkOpts=[["","Market?"],...(sp==="nfl"?NFL_MK:sp==="nba"?NBA_MK:[...NBA_MK,...NFL_MK]),...GAME_MK];
  const side=YN.has(L.stat)?sel([["yes","Yes"],["no","No"]],L.side||"yes",`data-scf="side"`):L.mk==="ml"||L.mk==="spread"?"":sel([["","Side?"],["over","Over"],["under","Under"]],L.side||"",`data-scf="side"`);
  const who=isGame?`<input data-scf="teamab" value="${h((L.team||L.teams[0]||{}).ab||"")}" placeholder="Team (KC, LAL…)">`:
    L.cands&&L.cands.length>1&&!L.player?sel([["","Which player?"],...L.cands.map(c=>[c.p,`${c.p} · ${c.ab||""} ${c.sport.toUpperCase()}`])],"",`data-scf="player"`):`<input data-scf="player" value="${h(L.player||"")}" placeholder="Player">`;
  const pmNote=L.pm?`<div class="sc-m">${L.pm.pick?L.pm.pick.toUpperCase():"Contract"} at ${L.pm.cents}¢${L.pm.qty?` × ${L.pm.qty}`:""} = ${am(L.odds)} before fees</div>`:"";
  return`<div class="sc-leg" data-b="${b.id}" data-l="${j}">
    <div class="sc-row">${sel([["","Sport?"],["nba","NBA"],["nfl","NFL"]],sp,`data-scf="sport"`)}${who}${b.legs.length>1?`<button class="sc-x" data-scrmleg="${b.id}|${j}" aria-label="Remove leg">×</button>`:""}</div>
    <div class="sc-row">${sel(mkOpts,mk,`data-scf="mk"`)}${side}${L.mk==="ml"||YN.has(L.stat)?"":`<input data-scf="line" inputmode="decimal" value="${L.line??""}" placeholder="Line">`}
      ${L.side===null&&L.mk==="prop"?`<input data-scf="over" value="${am(L.over)==="–"?"":am(L.over)}" placeholder="Over odds"><input data-scf="under" value="${am(L.under)==="–"?"":am(L.under)}" placeholder="Under odds">`:`<input data-scf="odds" inputmode="text" value="${L.odds!=null?am(L.odds):""}" placeholder="Odds">`}</div>
    ${pmNote}${L.missing.length?`<div class="sc-miss">Couldn't read: ${h(L.missing.join(", "))}</div>`:""}
    ${(L.unc||[]).length?`<div class="sc-unc">Read with low confidence: ${h(L.unc.map(u=>({line:"the line",odds:"the odds",player:"the player's name (closest match shown)",market:"the market"})[u]||u).join(", "))}. Compare with the screenshot.</div>`:""}
    ${L.tabNote&&!L.stat?`<div class="sc-unc">The screenshot shows several market tabs and none stood out as selected. Pick the market.</div>`:""}
    <div class="sc-raw">${L.via==="vision"?"Vision model: ":""}“${h(L.raw)}”</div></div>`}
function reviewHTML(){if(!S.bets.length)return"";const n=S.bets.filter(b=>b.on!==false).length;
  return`<div class="sc-h2"><b>Check what Sharpline read</b><span>Fix anything wrong, then analyze. Nothing is graded yet.</span></div>`+
  S.bets.map(b=>{const needs=b.legs.some(L=>(L.unc||[]).length||(L.missing||[]).length);return`<div class="sc-card ${b.on===false?"off":""} ${needs&&!b.ok?"needs":""}" data-b="${b.id}">
    <div class="sc-ch"><label class="ck"><input type="checkbox" data-scon="${b.id}" ${b.on!==false?"checked":""}></label>
      <b>${b.kind==="parlay"?`${b.pickem?"Pick'em entry":b.sgp?"Same-game parlay":"Parlay"} · ${b.legs.length} legs`:b.board?"Board line (no side picked)":"Single bet"}</b>
      <input class="sc-book" data-scbf="book" value="${h(b.book||"")}" placeholder="Book or app"></div>
    ${b.dup?`<div class="sc-miss">Duplicate of another bet in this scan</div>`:""}${b.board?`<div class="sc-m">Both sides are listed, so this isn't your pick. Sharpline checks both sides and shows one only if it beats its price; otherwise it says pass.</div>`:""}
    ${b.legs.map((L,j)=>legEditor(b,L,j)).join("")}
    <div class="sc-row sc-money">${b.kind==="parlay"?`<label>Parlay odds<input data-scbf="parlayOdds" value="${b.parlayOdds!=null?am(b.parlayOdds):""}" placeholder="${b.pickem?"e.g. +400 for 5x":"from the slip"}"></label>`:""}
      <label>Stake $<input data-scbf="stake" inputmode="decimal" value="${b.stake??""}" placeholder="optional"></label></div>
    ${b.payMismatch?`<div class="sc-miss">The payout on the slip doesn't match the odds read. Check both.</div>`:""}
    ${needs?`<label class="sc-ok"><input type="checkbox" data-scok="${b.id}" ${b.ok?"checked":""}> I checked this against the screenshot</label>`:""}${b.img?`<div class="sc-raw">From screenshot ${b.img}${b.ocrConf!=null?` · text read at ${b.ocrConf}% average confidence`:""}</div>`:""}</div>`}).join("")+
  (()=>{const wait=S.bets.filter(b=>b.on!==false&&!b.ok&&b.legs.some(L=>(L.unc||[]).length||(L.missing||[]).length)).length;
    return`${wait?`<p class="sc-p dim">${wait} bet${wait>1?"s have":" has"} a field Sharpline couldn't read with confidence. Check ${wait>1?"them":"it"} (or uncheck ${wait>1?"them":"it"}) before analyzing.</p>`:""}<button class="go2" data-scanalyze="1" ${n&&!wait?"":"disabled"}>Analyze ${n} bet${n===1?"":"s"}</button>`})()}

/* ---------- comparative tiers (Nov 24 2026) ----------
   Every scanned bet with a chance and a price is ranked against tonight's whole board (the Props tab's slate ranking) plus
   the other bets in this scan, S top 3%, A next 9%, B next 18%, C next 30%, D next 25%, F the rest. The ranking score is the
   expected return at the submitted price, reduced for what makes it less trustworthy: medium or low reliability (thin
   history, a line far from the market, no market anchor), an injury question, a line that moved away since the screenshot,
   and a second bet on the same player that shares a stat with a stronger one (they win or lose together, so it is not
   independent evidence). The score never uses the projection's distance from the line on its own. */
function scoreOf(R){if(!R||R.ev==null||R.p==null||R.v==="na")return null;let s=R.ev;const lv=R.rel?R.rel.lv:1;s-=lv>=3?0:lv===2?.015:.035;
  if((R.A.checks||[]).some(c=>c.ok===null&&/injur|questionable|doubtful/i.test(c.t)))s-=.03;
  const M=R.A.market||{};if(M.dkL!=null&&R.leg.line!=null&&M.dkL!==R.leg.line&&((R.leg.side==="over")===(M.dkL>R.leg.line)))s-=.01;
  if(R.noEdge)s=Math.min(s,R.ev);return s}
function tierScan(){const items=[];S.res.forEach((o,i)=>{const R=o.R||null,sc=o.b.kind==="parlay"?(o.ev!=null?o.ev-(o.legs.every(r=>r.rel&&r.rel.lv>=2)?.01:.04):null):scoreOf(R);if(sc!=null)items.push({i,sc,R})});
  /* same player, overlapping stat: the weaker one counts as correlated */
  items.sort((a,b)=>b.sc-a.sc);const seen=[];items.forEach(x=>{const L=x.R&&x.R.leg;if(!L||L.mk!=="prop")return;const nm=(x.R.A.player||L.player||"").toLowerCase();
    const hit=seen.find(y=>y.nm===nm&&RK.overlaps(y.st,L.stat));if(hit){x.sc-=.02;S.res[x.i].corrWith=hit.i}else seen.push({nm,st:L.stat,i:x.i})});
  const pool=[];try{if(typeof REL!=="undefined")Object.values(REL).forEach(r=>{if(r&&r.ev!=null)pool.push(r.ev)})}catch(e){}
  try{if(window.NFL&&NFL.relEVs)pool.push(...NFL.relEVs())}catch(e){}
  const all=[...pool,...items.map(x=>x.sc)].sort((a,b)=>b-a),N=all.length;
  items.forEach(x=>{const rank=all.indexOf(x.sc)+1,q=(rank-.5)/N;S.res[x.i].tier={g:q<.03?"S":q<.12?"A":q<.30?"B":q<.60?"C":q<.85?"D":"F",rank,N,sc:x.sc,pool:pool.length}})}
function tierTag(o){const T=o.tier;if(!T)return o.v==="na"?`<span class="grade g-F rel" title="Not ranked: no chance or no price">–</span>`:"";
  return`<span class="grade g-${T.g} rel" title="#${T.rank} of ${T.N} bets ${T.pool?"on tonight's board and this scan":"in this scan"}, by expected return adjusted for reliability">${T.g}</span>`+
    `<small class="sc-tier">#${T.rank} of ${T.N}${o.corrWith!=null?` · overlaps a stronger bet on the same player`:""}</small>`}
/* ---------- render: results ---------- */
const VLBL={fav:"Favorable",neu:"Neutral",unfav:"Unfavorable",na:"Can't assess"};
const ck=c=>`<li class="${c.ok===true?"ok":c.ok===false?"bad":"warn"}"><i>${c.ok===true?"✓":c.ok===false?"✕":"!"}</i>${h(c.t)}</li>`;
function pickTxt(L,A){if(L.mk==="prop"){const nm=A&&A.player||L.player||"Player?";if(YN.has(L.stat))return`${nm} · ${L.side==="no"?"No ":""}${mkLbl("nfl",L.stat)}`;return`${nm} · ${L.side?L.side==="over"?"Over":"Under":"?"} ${L.line??"?"} ${mkLbl(L.sport||A&&A.sport,L.stat)}`}
  const t=(L.team||L.teams[0]||{}).ab||"?";if(L.mk==="ml")return`${t} moneyline`;if(L.mk==="spread")return`${t} ${L.line>0?"+":""}${L.line??"?"}`;if(L.mk==="teamTotal")return`${t} team total ${L.side==="under"?"Under":"Over"} ${L.line??"?"}`;
  if(L.mk==="total")return`${L.teams.map(x=>x.ab).join("/")||"Game"} ${L.side==="under"?"Under":"Over"} ${L.line??"?"}`;return"Contract"}
function marketHTML(R){const A=R.A,M=A.market||{},L=R.leg;let rows=M.rows||[];
  if(M.text)return`<p class="sc-p">${h(M.text)}${M.upd?` · board ${h(M.upd)}`:""}</p><p class="sc-p dim">Only one book's game-line price is on the board, so there's no cross-book comparison for this.</p>`;
  if(!rows.length)return`<p class="sc-p dim">No current market for this in Sharpline's free feeds, so there's nothing to compare with.</p>`;
  const sameLine=rows.filter(q=>q.line===L.line),priced=rows.filter(q=>q.ev!=null);
  let best=null;priced.forEach(q=>{if(!best||q.ev>best.ev)best=q});
  const t=`<div class="sc-t"><div class="th"><span>Book</span><span>Line</span><span>${L.side==="under"?"Under":"Over"}</span><span>EV</span></div>${rows.map(q=>{const o=L.side==="under"?q.under:q.over;
    return`<div class="${q===best?"best":""}"><span>${h(q.book)}</span><span>${q.line??"–"}${q.line!=null&&L.line!=null&&q.line!==L.line?`<small>${q.line>L.line?"+":""}${Math.round((q.line-L.line)*10)/10} vs yours</small>`:""}</span><span>${o!=null?am(o):q.note?`<small>${h(q.note)}</small>`:"–"}</span><span>${q.ev!=null?evs(q.ev):"–"}</span></div>`}).join("")}</div>`;
  const notes=[];
  if(M.dkL!=null&&L.line!=null&&M.dkL!==L.line)notes.push(`Your line is ${L.line}; DraftKings is at ${M.dkL} now. These are different bets, so they're graded separately.`);
  if(M.open!=null&&M.dkL!=null&&M.open!==M.dkL)notes.push(`DraftKings opened at ${M.open}, now ${M.dkL}.`);
  if(best&&R.ev!=null)notes.push(best.ev>R.ev+.003?`Best price now: ${h(best.book)} ${best.line} at ${am(L.side==="under"?best.under:best.over)} (${evs(best.ev)}${best.line!==L.line?", a different line":""}). That's ${((best.ev-R.ev)*100).toFixed(1)} points of EV better than the submitted price.`:"No book on the board beats the submitted price right now.");
  else if(!priced.length&&rows.length)notes.push("No other book's price for this side is in the free feeds, so there's no line shopping for it.");
  if(R.A.an&&R.A.an.pDK!=null&&!R.A.an.marketOnly)notes.push(`At DraftKings' ${M.dkL}, Sharpline's chance for your side would be ${pc(R.A.an.pDK)}.`);
  if(M.upd)notes.push(`Line updated ${typeof M.upd==="number"?ago(M.upd):h(M.upd)}.`);
  return t+notes.map(n=>`<p class="sc-p">${n}</p>`).join("")}
function analysisHTML(R){const a=R.A.an||{};if(R.p==null)return`<p class="sc-p dim">${h(a.none||"No probability: "+(R.A.checks.find(c=>c.ok===false)||{t:"not verified"}).t)}</p>`;
  const cells=[["Sharpline chance",pc(R.p)],["Implied by odds",R.implied!=null?pc(R.implied):"–"],["Difference",R.edge!=null?(R.edge>=0?"+":"−")+Math.abs(R.edge*100).toFixed(1)+" pts":"–"],["Expected value",evs(R.ev)]];
  if(a.proj!=null)cells.push([a.marketOnly?"Projection (reference)":"Projection",String(Math.round(a.proj*10)/10)]);cells.push(["Fair price",am(RK.fairAm(R.p))]);
  const rel=R.rel,relT=["Not graded","Low","Medium","High"][rel.lv];
  const extra=[];if(a.last&&a.last.length)extra.push(`Last ${a.last.length} games: ${a.last.join(", ")}`);if(a.hits!=null&&a.n)extra.push(`${a.hits} of ${a.n} games over DraftKings' line`);
  if(a.parts&&a.parts.length)extra.push("How the projection was built: "+a.parts.join("; "));if(a.why)extra.push(String(a.why).replace(/<[^>]+>/g,""));
  if(R.pm)extra.push(R.pm.note);if(a.push)extra.push(`Whole-number line: about ${pc0(a.push)} chance of a push, counted`);
  return`<div class="sc-nums">${cells.map(([l,v])=>`<div><b>${v}</b><i>${l}</i></div>`).join("")}</div>
    <p class="sc-p"><b>Reliability: ${relT}.</b> ${h(rel.why.join("; "))}${rel.why.length?".":""} Source: ${h(a.marketOnly?"DraftKings' line moved to your number (projection not trusted for this stat)":a.model||"")}.</p>${extra.map(x=>`<p class="sc-p dim">${h(x)}</p>`).join("")}`}
function actionsHTML(o,i){const R=o.R||o.legs[0],A=R.A,L=R.leg;const bt=[];
  if(o.b.kind!=="parlay"){if(A.sport==="nba"&&A.key&&A.key[0]!=="l"&&typeof pfKeyAttr==="function"){const at=pfKeyAttr(A.key);if(at)bt.push(`<button class="addbtn" ${at}>Profile</button>`)}
    if(A.sport==="nfl"&&A.athId)bt.push(`<button class="addbtn" data-scnfprof="${A.athId}">Profile</button>`);
    if(A.sport==="nba"&&A.key)bt.push(`<button class="addbtn" data-jump="${A.key}">Open market</button>`);
    if(A.sport==="nfl"&&A.player)bt.push(`<button class="addbtn" data-scnfm="${h(A.player)}">Open market</button>`);
    if(A.sport==="nfl"&&A.e&&A.e.state==="in")bt.push(`<button class="addbtn" data-sclive="nfl">Live</button>`)}
  if(o.b.kind!=="parlay"&&L.mk==="prop"&&R.odds!=null&&!R.pm&&!YN.has(L.stat)&&L.side&&((A.sport==="nba"&&A.key)||(A.sport==="nfl"&&A.market&&A.market.dkL!=null)))bt.push(`<button class="addbtn ${o.used?"in":""}" data-scuse="${i}" title="Puts this price on the board so it can reach the Top List">${o.used?"✓ On the board":"Use price on board"}</button>`);
  const can=o.b.kind==="parlay"?o.legs.every(r=>r.A.e||r.A.gi!=null)&&o.parAm!=null:R.odds!=null&&(A.e||A.gi!=null);
  bt.push(`<button class="addbtn ${o.tracked?"in":""}" data-sctrack="${i}" ${can?"":"disabled title='Needs a verified game and odds'"}>${o.tracked?"✓ Tracked":"+ Track"}</button>`);
  bt.push(`<button class="addbtn ${o.saved?"in":""}" data-scsave="${i}">${o.saved?"✓ Saved":"Save"}</button>`);
  return`<div class="sc-acts"><label class="ck" title="Select"><input type="checkbox" data-scsel="${i}" ${o.sel?"checked":""}></label>${bt.join("")}</div>`}
function singleHTML(o,i){const R=o.R,L=R.leg,b=o.b;const toWin=b.stake!=null&&R.odds!=null?b.stake*(decA(R.odds)-1):null;
  const subm=[["Selection",pickTxt(L,R.A)],["Line",L.line??(YN.has(L.stat)?"yes/no":"–")],["Odds",L.pm?`${L.pm.pick?L.pm.pick.toUpperCase():""} ${L.pm.cents}¢${L.pm.qty?" × "+L.pm.qty:""}`:am(L.odds)],["Book",b.book||"not shown"],["Stake",b.stake!=null?"$"+b.stake:"–"],["To win",toWin!=null?"$"+toWin.toFixed(2):"–"]];
  return`<article class="sc-res v-${R.v}" id="scr${i}">
    <header><div><b>${h(pickTxt(L,R.A))}</b><span>${h(R.A.game||"")}${R.A.sport?` · ${R.A.sport.toUpperCase()}`:""}</span></div><em class="sc-v ${R.v}">${VLBL[R.v]}</em>${tierTag(o)}</header>
    ${b.board?`<p class="sc-p sc-note">${R.noEdge?"The screenshot listed both sides and neither has an edge at these prices, so no side is recommended.":"The screenshot listed both sides, so this isn't a pick you made. Shown: the side with a positive expected return at the listed price."}</p>`:""}
    <section><h4>Submitted bet</h4><div class="sc-kv">${subm.map(([k,v])=>`<div><i>${k}</i><b>${h(v)}</b></div>`).join("")}</div>${b.dup?`<p class="sc-p dim">Same as another bet in this scan.</p>`:""}</section>
    <section><h4>Verification</h4><ul class="sc-ck">${R.A.checks.map(ck).join("")}</ul>${R.A.cands&&R.A.cands.length>1?`<p class="sc-p">Possible matches: ${h(R.A.cands.slice(0,6).map(c=>c.p+" ("+(c.ab||c.pos||"")+")").join(", "))}. Go back to review and pick one.</p>`:""}</section>
    <section><h4>Current market</h4>${marketHTML(R)}</section>
    <section><h4>Sharpline analysis</h4>${analysisHTML(R)}</section>
    <section class="sc-rec"><h4>Recommendation</h4><p class="sc-p"><b>${VLBL[R.v]}.</b> ${h(R.vt)}</p></section>
    ${actionsHTML(o,i)}</article>`}
function parlayHTML(o,i){const b=o.b;const legRows=o.legs.map((r,j)=>`<div class="${j===o.best?"best":j===o.worst?"worst":""}"><span><b>${h(pickTxt(r.leg,r.A))}</b><small>${h(r.A.game||"")}${r.A.checks.some(c=>c.ok===false)?` · <em class="bad">${h((r.A.checks.find(c=>c.ok===false)||{}).t)}</em>`:""}</small></span>
    <span>${am(r.odds)}</span><span>${pc0(r.p)}</span><span>${r.implied!=null?pc0(r.implied):"–"}</span><span>${evs(r.ev)}</span><span class="sc-v ${r.v}">${VLBL[r.v]}</span></div>`).join("");
  const sum=[["Legs",b.legs.length],["Parlay odds",o.parAm!=null?am(o.parAm)+(o.parSrc==="legs multiplied"?" (legs multiplied)":""):"–"],["Legs multiplied",am(o.multAm)],["Stake",b.stake!=null?"$"+b.stake:"–"],["Payout",o.payout!=null?"$"+o.payout.toFixed(2):"–"],["Combined chance",o.p!=null?pc(o.p):"not estimated"],["Implied",o.implied!=null?pc(o.implied):"–"],["Expected value",evs(o.ev)]];
  const drop=o.drop?`<p class="sc-p"><b>Dropping one leg</b> (priced at the remaining legs multiplied; a book's real price can differ):</p><div class="sc-t sc-dropt">${o.drop.map(d=>`<div><span>Without ${h(pickTxt(o.legs[d.i].leg,o.legs[d.i].A))}</span><span>${pc0(d.p)}</span><span>${am(d.am)}</span><span>${evs(d.ev)}</span></div>`).join("")}</div><p class="sc-p dim">A shorter parlay wins more often but pays less. It's only better if its EV is higher, not just its chance.</p>`:"";
  const vt=o.v==="na"?o.pNote:`${o.pNote} Sharpline's chance that every leg hits is ${pc(o.p)}; ${am(o.parAm)} needs ${pc(o.implied)}, so the expected value is ${evs(o.ev)}.`;
  return`<article class="sc-res v-${o.v}" id="scr${i}">${tierTag(o)}<header><div><b>${b.legs.length}-leg ${b.pickem?"pick'em entry":o.sameGame?"same-game parlay":"parlay"}</b><span>${h(b.book||"Book not shown")}</span></div><em class="sc-v ${o.v}">${VLBL[o.v]}</em></header>
    <section><h4>Legs as submitted, each graded on its own</h4><div class="sc-t sc-legs"><div class="th"><span>Leg</span><span>Odds</span><span>Chance</span><span>Implied</span><span>EV</span><span></span></div>${legRows}</div>
      ${o.best!=null?`<p class="sc-p">Strongest leg: ${h(pickTxt(o.legs[o.best].leg,o.legs[o.best].A))}. Weakest: ${h(pickTxt(o.legs[o.worst].leg,o.legs[o.worst].A))}.</p>`:""}
      ${b.pickem?`<p class="sc-p dim">Pick'em legs have no individual odds, so the leg EVs are blank. The entry is graded at its payout multiplier.</p>`:""}</section>
    <section><h4>Whole parlay</h4><div class="sc-kv">${sum.map(([k,v])=>`<div><i>${k}</i><b>${h(v)}</b></div>`).join("")}</div>${b.payMismatch?`<p class="sc-p bad">The slip's payout doesn't match its odds.</p>`:""}${b.parlayOdds!=null&&o.multAm!=null&&decA(b.parlayOdds)<decA(o.multAm)-.02?`<p class="sc-p">The slip pays ${am(b.parlayOdds)}; the legs multiplied would pay ${am(o.multAm)}. ${o.sameGame?"Books shorten same-game parlays because the legs are correlated.":"The book is paying less than its own leg prices combined."}</p>`:""}${drop}</section>
    <section class="sc-rec"><h4>Recommendation</h4><p class="sc-p"><b>${VLBL[o.v]}.</b> ${h(vt)}</p></section>${actionsHTML(o,i)}</article>`}
function resultsHTML(){const R=S.res;if(!R)return"";const c=k=>R.filter(o=>(o.R||o).v===k&&!o.b.board).length;
  const ranked=R.filter(o=>!o.b.board&&(o.R?o.R.ev:o.ev)!=null).map(o=>({o,ev:o.R?o.R.ev:o.ev})).sort((a,b)=>b.ev-a.ev);
  const nm=o=>o.b.kind==="parlay"?`${o.b.legs.length}-leg parlay`:pickTxt(o.R.leg,o.R.A);
  return`<div class="sc-sum"><div><b>${R.length} bet${R.length===1?"":"s"}</b> · <span class="fav">${c("fav")} favorable</span> · <span class="neu">${c("neu")} neutral</span> · <span class="unfav">${c("unfav")} unfavorable</span>${c("na")?` · <span>${c("na")} can't assess</span>`:""}</div>
    ${ranked.length>1?`<p>Strongest: ${h(nm(ranked[0].o))} (${evs(ranked[0].ev)}). Weakest: ${h(nm(ranked[ranked.length-1].o))} (${evs(ranked[ranked.length-1].ev)}).</p>`:""}
    <p class="dim">Graded at the line and odds you submitted, ${new Date(S.at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}. A favorable grade is an estimate, not a sure thing.</p>
    <div class="sc-sumb"><button class="ghost" data-scback="1">Back to review</button><button class="addbtn" data-sctracksel="1">Track selected</button><button class="addbtn" data-scnew="1">New scan</button></div></div>`+
  R.map((o,i)=>o.b.kind==="parlay"?parlayHTML(o,i):singleHTML(o,i)).join("")}

/* ---------- tracker records keep exactly what was submitted ---------- */
function nbaRecord(r,b){const A=r.A,L=r.leg,gi=A.gi;if(gi==null)return null;const G=SNAP[gi];const key=A.key;const lbl=(A.an&&A.an.lbl)||"";
  const name=L.mk==="prop"?A.player:mu(G);let spec=null;try{spec=specFor(key,lbl,L.line)}catch(e){}
  return{id:Date.now()+Math.floor(Math.random()*1e3),type:"straight",date:DATA_DATE,key,name,game:mu(G),tip:G.tip,mkt:L.mk==="prop"?L.stat:{spread:"Spread",ml:"Moneyline",total:"Total"}[L.mk],book:b.book||BOOK,stake:b.stake??UNIT,res:null,
    pick:L.mk==="prop"?`${lbl} ${STAT_LBL[L.stat]||L.stat}`:lbl,odds:r.odds,p:r.p,push:(A.an&&A.an.push)||0,ev:r.ev??null,grade:null,conf:A.an&&A.an.conf&&A.an.conf.lv,src:"scanner",spec,home:G.home,away:G.away,
    tm:L.mk==="prop"&&A.key[0]==="p"?PROPS[+A.key.slice(1)].tm:null,ath:L.mk==="prop"&&typeof LIVE!=="undefined"?Object.keys(LIVE.ids).find(k=>normN(LIVE.ids[k].name)===normN(A.player))||null:null,evid:typeof LIVE!=="undefined"?(LIVE.ev[gi]||{}).id||null:null}}
function recordOf(r,b){const x=r.A.sport==="nfl"?NFL.scanBet(r.leg,r.A,r.odds,b.stake,b.book):nbaRecord(r,b);if(!x)return null;
  x.scan={line:r.leg.line,odds:r.leg.odds,pm:r.leg.pm||null,book:b.book||null,stake:b.stake??null,ts:S.at,raw:r.leg.raw};if(x.p==null)x.p=r.p;return x}
function trackOne(i){const o=S.res[i];if(!o||o.tracked)return false;const b=o.b;
  if(b.kind!=="parlay"){const x=recordOf(o.R,b);if(!x){toast("Can't track this one: game or odds not verified");return false}BETS.unshift(x)}
  else{const legs=o.legs.map(r=>recordOf(r,{...b,stake:null}));if(legs.some(x=>!x)||o.parAm==null){toast("Every leg needs a verified game, and the parlay needs odds");return false}
    BETS.unshift({id:Date.now(),type:"parlay",sgp:!!o.sameGame,date:legs[0].date,key:"x"+Date.now(),name:`${legs.length}-leg ${o.sameGame?"same-game ":""}parlay`,pick:legs.map(l=>(l.name&&!/@/.test(l.name)?l.name.split(" ").pop()+" ":"")+l.pick).join(" + "),
      game:[...new Set(legs.map(l=>l.game))].join(", "),mkt:"Parlay",odds:Math.round(o.parAm),oddsOrig:Math.round(o.parAm),userOdds:b.parlayOdds!=null,p:o.p??null,stake:b.stake??UNIT,book:b.book||BOOK,res:null,spec:{kind:"parlay"},
      legs:legs.map(l=>({key:l.key,name:l.name,pick:l.pick,game:l.game,mkt:l.mkt,odds:l.odds,p:l.p,spec:l.spec,ev:l.ev,evid:l.evid,home:l.home,away:l.away,tm:l.tm,ath:l.ath,date:l.date,res:null,sport:l.sport,scan:l.scan})),
      sport:legs.every(l=>l.sport==="nfl")?"nfl":undefined,scan:{odds:b.parlayOdds??null,book:b.book||null,stake:b.stake??null,ts:S.at}})}
  o.tracked=true;saveBets();return true}

/* ---------- saved analyses ---------- */
const SAVED_K="sl_scans";const savedGet=()=>{try{return JSON.parse(localStorage.getItem(SAVED_K))||[]}catch(e){return[]}};
function saveOne(i){const o=S.res[i];const list=savedGet();const R=o.R||o;
  list.unshift({ts:Date.now(),at:S.at,bet:JSON.parse(JSON.stringify(o.b)),title:o.b.kind==="parlay"?`${o.b.legs.length}-leg parlay`:pickTxt(o.R.leg,o.R.A),v:R.v,ev:R.ev??null,p:R.p??null});
  try{localStorage.setItem(SAVED_K,JSON.stringify(list.slice(0,60)))}catch(e){}o.saved=true}
/* optional vision model settings (your own key, kept on this device) */
function visHTML(){if(!window.SLVision)return"";const c=SLVision.get();
  return`<p class="sc-p dim">Screenshots are read on your phone for free. For harder layouts you can add your own Google Gemini API key: Gemini's free tier costs nothing within its daily limits (on the free tier Google may use what you send to improve its products). The key stays in this browser and is sent only to Google. Whatever the model reads still goes through the review step.</p>
  ${c.key?`<p class="sc-p">Key saved (ends ${h(c.key.slice(-4))}). ${c.on!==false?"In use.":"Turned off."}</p><button class="addbtn" data-scvis="${c.on!==false?"off":"on"}">${c.on!==false?"Turn off":"Turn on"}</button> <button class="addbtn" data-scvis="del">Remove key</button>`:
  `<input id="scVisKey" type="password" autocomplete="off" placeholder="Gemini API key"> <button class="addbtn" data-scvis="save">Save key</button>`}`}
function savedHTML(){const L=savedGet();if(!L.length)return"";return`<details class="sc-saved"><summary>Saved analyses (${L.length})</summary>${L.map((x,i)=>`<div><span><b>${h(x.title)}</b><small>${new Date(x.ts).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · then ${VLBL[x.v]||""}${x.ev!=null?" "+evs(x.ev):""}</small></span><button class="addbtn" data-screopen="${i}">Re-check now</button><button class="sc-x" data-scdel="${i}" aria-label="Delete">×</button></div>`).join("")}</details>`}

/* ---------- screenshot reading (rebuilt Nov 24 2026) ---------- */
/* Background-normalized grayscale: each pixel is compared with its own neighborhood, so text on any color (white on dark
   mode, white on green buttons, gray on white) becomes dark text on a white page. Also returns each word's ink contrast
   in the original image, used to tell which market tab is selected. */
async function prepScan(file){const bm=await createImageBitmap(file),sc=Math.min(3,Math.max(1,1400/bm.width)),W=Math.round(bm.width*sc),H=Math.round(bm.height*sc);
  const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(bm,0,0,W,H);
  const raw=document.createElement("canvas");raw.width=W;raw.height=H;raw.getContext("2d").drawImage(c,0,0);
  const im=x.getImageData(0,0,W,H),d=im.data,g=new Float32Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++)g[j]=.3*d[i]+.59*d[i+1]+.11*d[i+2];
  /* integral image helper */
  const integ=f=>{const I=new Float64Array((W+1)*(H+1));for(let y=0;y<H;y++){let row=0;for(let xx=0;xx<W;xx++){row+=f(y*W+xx);I[(y+1)*(W+1)+xx+1]=I[y*(W+1)+xx+1]+row}}
    return(x0,y0,x1,y1)=>(I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0])/((x1-x0)*(y1-y0))};
  const r=Math.max(14,Math.round(W/30)),cl=(v,a,b)=>Math.max(a,Math.min(b,v));
  /* 1. polarity: where most of the neighborhood is dark (dark mode, a filled button), the text is light, so flip it */
  const dark=integ(j=>g[j]<128?1:0),o=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const j=y*W+xx,f=dark(cl(xx-r,0,W),cl(y-r,0,H),cl(xx+r+1,0,W),cl(y+r+1,0,H));o[j]=f>.5?255-g[j]:g[j]}
  /* 2. contrast: each pixel against its own neighborhood's average, so faint gray text and colored text both turn dark */
  const mean=integ(j=>o[j]);
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const j=y*W+xx,b=mean(cl(xx-r,0,W),cl(y-r,0,H),cl(xx+r+1,0,W),cl(y+r+1,0,H));const v=cl(255-(b-o[j])*2.4,0,255),k=j*4;d[k]=d[k+1]=d[k+2]=v;d[k+3]=255}
  /* 3. remove big solid shapes (button frames, bars, icons): anything far taller or wider than text */
  {const B=new Uint8Array(W*H);for(let j=0;j<W*H;j++)B[j]=d[j*4]<128?1:0;const lab=new Int32Array(W*H),comps=[];let n=0;const st=new Int32Array(W*H);
    for(let j=0;j<W*H;j++){if(!B[j]||lab[j])continue;n++;let sp=0,x0=W,x1=0,y0=H,y1=0,cnt=0;st[sp++]=j;lab[j]=n;
      while(sp){const q=st[--sp],qx=q%W,qy=(q-qx)/W;cnt++;if(qx<x0)x0=qx;if(qx>x1)x1=qx;if(qy<y0)y0=qy;if(qy>y1)y1=qy;
        if(qx>0&&B[q-1]&&!lab[q-1]){lab[q-1]=n;st[sp++]=q-1}if(qx<W-1&&B[q+1]&&!lab[q+1]){lab[q+1]=n;st[sp++]=q+1}if(qy>0&&B[q-W]&&!lab[q-W]){lab[q-W]=n;st[sp++]=q-W}if(qy<H-1&&B[q+W]&&!lab[q+W]){lab[q+W]=n;st[sp++]=q+W}}
      comps[n]={h:y1-y0+1,w:x1-x0+1,cnt}}
    const hs=comps.filter(c=>c&&c.h>=8&&c.h<=W/8).map(c=>c.h).sort((a,b)=>a-b),mh=hs.length?hs[Math.floor(hs.length*.75)]:40;
    const kill=comps.map(c=>c&&(c.h>2.6*mh||c.w>W*.45||(c.w>4*mh&&c.h>mh*1.3)));
    for(let j=0;j<W*H;j++)if(lab[j]&&kill[lab[j]]){const k=j*4;d[k]=d[k+1]=d[k+2]=255}}
  x.putImageData(im,0,0);
  const ink=bb=>{const v=[];for(let y=Math.max(0,bb.y0);y<Math.min(H,bb.y1);y+=1)for(let xx=Math.max(0,bb.x0);xx<Math.min(W,bb.x1);xx+=1)v.push(g[y*W+xx]);if(!v.length)return 0;v.sort((a,b)=>a-b);return v[Math.floor(v.length*.95)]-v[Math.floor(v.length*.05)]};
  return{canvas:c,raw,ink,W,H}}
let PSM=null;
async function ocrWords(w,P,mode){if(PSM!==mode){await w.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:"1",tessedit_char_whitelist:""});PSM=mode}
  const conv=data=>(data.words||[]).map(x=>({text:x.text,conf:x.confidence,x0:x.bbox.x0,y0:x.bbox.y0,x1:x.bbox.x1,y1:x.bbox.y1,ink:P.ink(x.bbox)}));
  const{data}=await w.recognize(P.canvas);const W=conv(data);
  /* second pass on the untouched image: words the normalized pass missed (text on a filled button can be lost at the button's
     edge) are added where nothing was found */
  try{const{data:d2}=await w.recognize(P.raw);const ov=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
    conv(d2).forEach(x=>{if(x.conf<60||!String(x.text).trim())return;if(!W.some(y=>ov(x,y)>.3*Math.min((x.x1-x.x0)*(x.y1-x.y0),(y.x1-y.x0)*(y.y1-y.y0))))W.push(x)})}catch(e){}
  /* second look at every number: each one is read again on its own, digits and signs only (single-line mode). General text
     recognition often drops a decimal point or a leading digit in prices and lines; this is where those get fixed. */
  const nums=W.filter(x=>/\d/.test(x.text)&&x.text.length<=7);if(!nums.length)return W;
  await w.setParameters({tessedit_pageseg_mode:"7",tessedit_char_whitelist:"0123456789.+-¢OU"});PSM=null;
  const cc=document.createElement("canvas"),cx=cc.getContext("2d");
  for(const x of nums){const h=Math.max(1,x.y1-x.y0),pad=Math.round(h*.3),sx=Math.max(0,x.x0-pad),sy=Math.max(0,x.y0-pad),sw=Math.min(P.W,x.x1+pad)-sx,sh=Math.min(P.H,x.y1+pad)-sy,k=Math.max(1,64/h),b=Math.round(16*k);
    /* the number alone, enlarged to a comfortable size on a white margin */
    cc.width=Math.round(sw*k)+2*b;cc.height=Math.round(sh*k)+2*b;cx.fillStyle="#fff";cx.fillRect(0,0,cc.width,cc.height);cx.imageSmoothingQuality="high";cx.drawImage(P.canvas,sx,sy,sw,sh,b,b,Math.round(sw*k),Math.round(sh*k));
    try{const{data:d}=await w.recognize(cc);let t=(d.text||"").trim().replace(/\s+/g,"");
      /* a side letter read with the number: "O27.5", "U4.5" (O can come back as zero) */
      let lead="";const m=t.match(/^([OUou]|0(?=\d{1,3}\.\d))(.+)$/);if(m&&/^[OUou0]/.test(t)&&/\d/.test(m[2])&&(/[OoUu]/.test(m[1])||/^\d{1,3}\.\d$/.test(m[2]))){lead=m[1]==="0"?"O":m[1].toUpperCase();t=m[2]}
      if(/^([+-]?\d{1,4}(\.\d)?|\d{1,2}¢?|\d{1,3}\+)$/.test(t)&&(d.confidence>=x.conf-5||!/^[+-]?\d+(\.\d)?¢?$/.test(x.text))){
        const lead0=(x.text.match(/^[OoUu](?=\d)/)||[""])[0];const dg=v=>String(v).replace(/[^\d.]/g,"");
        /* two independent reads that agree are trusted; a value only the second read saw keeps the first read's confidence */
        x.conf=dg(x.text)===dg(t)?Math.max(x.conf,92):Math.min(x.conf,70);x.text=(lead?lead+" ":lead0)+t}}catch(e){}}
  await w.setParameters({tessedit_char_whitelist:""});return W}
/* which fields of a leg rest on low-confidence characters */
function flagUnc(bets,rows){bets.forEach(b=>b.legs.forEach(L=>{const R=rows.find(r=>r.t.trim()===String(L.raw||"").trim())||rows.find(r=>L.raw&&r.t.includes(String(L.raw).split(" / ")[0].trim()));L.unc=[];if(!R)return;
  const low=v=>{if(v==null)return false;const keys=Object.keys(R.conf).filter(k=>k.replace(/^[ou]/i,"").replace(/¢$/,"")===String(Math.abs(v)).replace(/^0+/,"")||k===String(v)||k==="+"+v||k===String(v).replace(/^/,"")||parseFloat(k)===v);return keys.length&&Math.min(...keys.map(k=>R.conf[k]))<72};
  if(low(L.line)||L.lineGuess)L.unc.push("line");if(L.fuzzy)L.unc.push("player");if([L.odds,L.over,L.under].some(low))L.unc.push("odds")}))}
/* read one screenshot: vision model when the user set one up, else on-device OCR with layout reconstruction */
async function readImage(file,st){const ctx=ctxAll();
  if(window.SLVision&&SLVision.on()){try{const v=await SLVision.read(file);if(v&&v.lines.length){const bets=SB.parse(v.lines,ctx,{image:1});bets.forEach(b=>b.legs.forEach(L=>{L.unc=v.unc(L);L.via="vision"}));if(bets.length)return bets}}catch(e){console.warn("vision",e);toast("The vision model didn't answer; reading on the device instead")}}
  const w=await getWorker(st),P=await prepScan(file),statOf=t=>SB.statOf(t);
  const tryMode=async mode=>{const words=await ocrWords(w,P,mode),rows=SharpLayout.read(words,{width:P.W,statOf});const bets=SB.parse(rows.map(r=>r.t),ctx,{image:1});flagUnc(bets,rows);
    const conf=words.length?words.reduce((a,x)=>a+x.conf,0)/words.length:0;bets.forEach(b=>{b.ocrConf=Math.round(conf);if(rows.some(r=>r.tabUnclear))b.legs.forEach(L=>{if(L.mk==="prop"&&!L.stat)L.tabNote=1})});return bets};
  let bets=await tryMode("11");const done=B=>B.reduce((a,b)=>a+b.legs.filter(L=>!(L.missing||[]).length).length,0);
  if(!done(bets)){const alt=await tryMode("3");if(done(alt)>done(bets))bets=alt}
  return bets}
/* ---------- flow ---------- */
const $=id=>document.getElementById(id);
function paint(){const vb=$("scVis");if(vb)vb.innerHTML=visHTML();const box=$("scanRes");if(!box)return;box.innerHTML=S.res?resultsHTML():reviewHTML();const sv=$("scSaved");if(sv)sv.innerHTML=S.res?"":savedHTML();$("scIn").style.display=S.res?"none":""}
function addFiles(fs){fs=[...fs].filter(f=>/^image\//.test(f.type));if(!fs.length)return;S.files=[...S.files,...fs].slice(0,8);thumbs();}
function thumbs(){const t=$("thumbs");t.innerHTML=S.files.map((f,i)=>`<div><img src="${URL.createObjectURL(f)}" alt=""><button class="sc-x" data-scrmimg="${i}" aria-label="Remove">×</button></div>`).join("");goBtn()}
function goBtn(){const g=$("scanGo"),n=S.files.length,txt=($("scText")||{}).value||"";g.disabled=S.busy||(!n&&!txt.trim());g.textContent=S.busy?"Reading…":n&&txt.trim()?`Read ${n} screenshot${n>1?"s":""} and text`:n?`Read ${n} screenshot${n>1?"s":""}`:"Read text"}
async function read(){if(S.busy)return;S.busy=true;goBtn();const st=$("scanStat");S.res=null;let bets=[],fails=0;
  st.textContent="Loading player lists…";await prepNFL();const ctx=ctxAll();
  try{if(S.files.length){const w=await getWorker(st);const th=[...document.querySelectorAll("#thumbs div")];
      for(let i=0;i<S.files.length;i++){st.dataset.i=`${i+1} of ${S.files.length}`;st.textContent=`Reading screenshot ${i+1} of ${S.files.length}…`;th[i]&&th[i].classList.add("scanning");stage(1);
        try{stage(2);const got=await readImage(S.files[i],st);stage(3);got.forEach(b=>b.img=i+1);bets.push(...got);th[i]&&th[i].classList.replace("scanning",got.length?"done":"err");if(!got.length)fails++}
        catch(e){fails++;th[i]&&th[i].classList.replace("scanning","err")}}stage(0);delete st.dataset.i}
    const txt=$("scText").value;if(txt.trim())bets.push(...SB.parse(txt,ctx))}
  catch(e){st.innerHTML=`<span class="bad">The screenshot reader couldn't load. Check your connection, or paste the text instead.</span>`;S.busy=false;goBtn();return}
  bets.forEach((b,i)=>{b.id="b"+(i+1)});const seen=new Map();bets.forEach(b=>{const k=JSON.stringify(b.legs.map(L=>[L.player,L.stat,L.mk,L.side,L.line,L.odds]));if(seen.has(k))b.dup=seen.get(k);else{seen.set(k,b.id);delete b.dup}});
  S.bets=bets;S.busy=false;goBtn();
  st.innerHTML=bets.length?`Found ${bets.length} bet${bets.length===1?"":"s"}${fails?` · ${fails} screenshot${fails>1?"s":""} had nothing readable`:""}.`:`<span class="bad">No bets found. Try a sharper, full-screen screenshot, paste the text, or enter it manually.</span>`;paint()}
function manual(){const sp=typeof SPORT!=="undefined"?SPORT:"nba";S.res=null;S.bets.push({id:"m"+Date.now(),kind:"single",book:typeof BOOK!=="undefined"?BOOK:"",legs:[{sport:sp,mk:"prop",player:"",cands:[],team:null,teams:[],stat:null,side:"over",line:null,odds:null,missing:[],raw:"entered by hand"}],stake:null,missing:[]});paint()}
async function analyze(){const st=$("scanStat");st.textContent="Checking players, games and markets…";if(S.bets.some(b=>b.legs.some(L=>L.sport!=="nba")))await prepNFL();
  S.at=Date.now();S.res=S.bets.filter(b=>b.on!==false).map(b=>{try{return analyzeBet(b)}catch(e){console.error(e);return{b,legs:[],R:{leg:b.legs[0],A:{checks:[{ok:false,t:"Something went wrong checking this bet"}],market:{rows:[]}},v:"na",vt:String(e.message)},v:"na"}}});
  try{tierScan()}catch(e){console.warn("tiers",e)}
  st.textContent="";paint();const r=$("scanRes");if(r)r.scrollIntoView({block:"start",behavior:"smooth"})}
const parseAm=v=>{const s=String(v||"").trim();if(!s)return null;if(/^\d+(\.\d+)?$/.test(s)&&+s>1&&+s<30&&s.includes("."))return toAm(+s);const n=parseFloat(s.replace(/[^\d.+-]/g,""));return isNaN(n)||Math.abs(n)<100?null:Math.round(n)};
function edit(t){const lg=t.closest(".sc-leg"),card=t.closest(".sc-card");if(!card)return;const b=S.bets.find(x=>x.id===card.dataset.b);if(!b)return;
  if(t.dataset.scbf){const f=t.dataset.scbf,v=t.value;if(f==="book")b.book=v.trim()||null;if(f==="stake")b.stake=v.trim()?+v.replace(/[^\d.]/g,""):null;if(f==="parlayOdds")b.parlayOdds=parseAm(v);return}
  if(!lg)return;const L=b.legs[+lg.dataset.l],f=t.dataset.scf,v=t.value;
  /* a field the user typed or picked is no longer uncertain */
  if(L.unc){const u={line:"line",odds:"odds",over:"odds",under:"odds",player:"player",mk:"market"}[f];if(u)L.unc=L.unc.filter(x=>x!==u)}if(f==="mk")L.tabNote=0;
  if(f==="sport"){L.sport=v||null;paint();return}
  if(f==="player"){L.player=v.trim();L.cands=[];if(t.tagName==="SELECT"){const c=(L.missing||[]);L.missing=c.filter(x=>!/player/.test(x));paint()}return}
  if(f==="teamab"){const ab=v.trim().toUpperCase();const T=ctxAll().teams.filter(x=>x.ab===ab&&(!L.sport||x.sport===L.sport));L.team=T[0]?{ab,sport:T[0].sport,full:T[0].full}:{ab};L.teams=[L.team];return}
  if(f==="mk"){if(GAME_MK.some(x=>x[0]===v)){L.mk=v;L.stat=null}else{L.mk="prop";L.stat=v||null;if(!L.sport){L.sport=NFL_MK.some(x=>x[0]===v)?"nfl":"nba"}if(YN.has(v)){L.side="yes";L.line=v==="td2"?1.5:.5}}L.missing=L.missing.filter(x=>!/market/.test(x));paint();return}
  if(f==="side"){L.side=v||null;L.missing=L.missing.filter(x=>!/over or under/.test(x));if(L.pm)L.pm.pick=v==="under"||v==="no"?"no":"yes";return}
  if(f==="line"){const n=parseFloat(v.replace(",","."));L.line=isNaN(n)?null:n;L.missing=L.missing.filter(x=>x!=="line");return}
  if(f==="odds"){L.odds=parseAm(v);if(L.pm)L.pm=null;L.missing=L.missing.filter(x=>x!=="odds");return}
  if(f==="over"||f==="under"){L[f]=parseAm(v);return}}
function boardPick(b){/* a board row: grade the side Sharpline likes better at the listed prices */
  const L=b.legs[0];if(L.over==null&&L.under==null)return;const tryS=s=>{const leg={...L,side:s,odds:s==="over"?L.over:L.under};return analyzeLeg(leg,b.book)};
  const a=L.over!=null?tryS("over"):null,c=L.under!=null?tryS("under"):null,both=[a,c].filter(Boolean).sort((x,y)=>(y.ev??-9)-(x.ev??-9)),best=both[0];
  /* neither side beats its price: no side is picked. Showing the "less bad" side would lean Under, because books usually make
     the Over the shorter price; that is the vig, not a reason to bet. */
  if(best&&both.every(x=>x.ev!=null&&x.ev<=0)){best.noEdge=true;best.both=both.map(x=>({side:x.leg.side,ev:x.ev,p:x.p,odds:x.odds}));best.v="neu";
    best.vt=`Neither side beats its price: Over ${evs((both.find(x=>x.leg.side==="over")||{}).ev)}, Under ${evs((both.find(x=>x.leg.side==="under")||{}).ev)} expected return. Pass.`}
  return best}

document.addEventListener("click",async e=>{const t=e.target.closest("[data-scvis],[data-scango],[data-scmanual],[data-scanalyze],[data-scback],[data-scnew],[data-sctrack],[data-sctracksel],[data-scsave],[data-screopen],[data-scdel],[data-scrmleg],[data-scrmimg],[data-scnfprof],[data-scnfm],[data-sclive],[data-scuse],#scDrop");if(!t||e.target.id==="scanFiles")return;
  const d=t.dataset;if(t.id==="scDrop"){if(!e.target.closest("button"))$("scanFiles").click();return}
  e.preventDefault();e.stopPropagation();
  if(d.scvis){const c=SLVision.get();if(d.scvis==="save"){const k=($("scVisKey")||{}).value||"";if(k.trim().length<20){toast("That doesn't look like an API key");return}SLVision.set({key:k.trim(),on:true});toast("Vision model on")}
    else if(d.scvis==="del")SLVision.set({});else SLVision.set({...c,on:d.scvis==="on"});paint();return}
  if(d.scango){read();return}if(d.scmanual){manual();return}if(d.scanalyze){analyze();return}
  if(d.scback){S.res=null;paint();return}if(d.scnew){S.res=null;S.bets=[];S.files=[];$("scText").value="";thumbs();$("scanStat").textContent="";paint();return}
  if(d.sctrack){if(trackOne(+d.sctrack)){toast("Tracked with the submitted line and odds");if(typeof renderAll==="function")renderAll();paint()}return}
  if(d.sctracksel){let n=0;S.res.forEach((o,i)=>{if(o.sel&&trackOne(i))n++});toast(n?`Tracked ${n}`:"Select bets with the checkbox first");if(n){if(typeof renderAll==="function")renderAll();paint()}return}
  if(d.scuse){const o=S.res[+d.scuse],R=o.R,L=R.leg,A=R.A;
    if(A.sport==="nfl")NFL.setPx(A.eid,A.athId,L.stat,A.market.dkL,L.side,R.odds,L.line,o.b.book);
    else{const E=EDV[A.key]=EDV[A.key]||{};delete E.a;delete E.b;setEd(A.key,{L:L.line,[L.side==="under"?"b":"a"]:R.odds});LS.set("sl_edv",EDV);SCANNED.add(A.key);SCANBOOK[A.key]=o.b.book||null;if(typeof renderAll==="function")renderAll();if(typeof syncFind==="function")syncFind(A.key);if(typeof renderTop==="function")renderTop()}
    o.used=true;toast("Price is on the board. If it clears the bar it shows on the Top List");paint();return}
  if(d.scsave){saveOne(+d.scsave);toast("Saved. Find it under Saved analyses on the scan screen");paint();return}
  if(d.screopen){const x=savedGet()[+d.screopen];if(x){S.bets=[x.bet];await analyze();toast(`Saved ${new Date(x.ts).toLocaleDateString()}: was ${VLBL[x.v]||"–"}${x.ev!=null?" "+evs(x.ev):""}`)}return}
  if(d.scdel){const L=savedGet();L.splice(+d.scdel,1);localStorage.setItem(SAVED_K,JSON.stringify(L));paint();return}
  if(d.scrmleg){const[bid,j]=d.scrmleg.split("|");const b=S.bets.find(x=>x.id===bid);if(b){b.legs.splice(+j,1);if(b.legs.length<2)b.kind="single"}paint();return}
  if(d.scrmimg){S.files.splice(+d.scrmimg,1);thumbs();return}
  const close=()=>$("scanSheet").classList.remove("on");
  if(d.scnfprof){close();NFL.openProfileId(d.scnfprof);return}if(d.scnfm){close();NFL.openMarket(d.scnfm);return}
  if(d.sclive){close();if(typeof setSport==="function"&&SPORT!==d.sclive)setSport(d.sclive);go("live");return}},true);
document.addEventListener("keydown",e=>{if(e.target.id==="scDrop"&&(e.key==="Enter"||e.key===" ")){e.preventDefault();$("scanFiles").click()}});
document.addEventListener("change",e=>{const t=e.target;if(t.id==="scanFiles"){addFiles(t.files);t.value="";return}
  if(t.dataset.scon){const b=S.bets.find(x=>x.id===t.dataset.scon);if(b)b.on=t.checked;paint();return}
  if(t.dataset.scsel){S.res[+t.dataset.scsel].sel=t.checked;return}
  if(t.dataset.scok){const b=S.bets.find(x=>x.id===t.dataset.scok);if(b)b.ok=t.checked;paint();return}
  if(t.closest&&t.closest("#scanRes")&&(t.dataset.scf||t.dataset.scbf))edit(t)},true);
document.addEventListener("input",e=>{const t=e.target;if(t.id==="scText"){goBtn();return}if(t.closest&&t.closest("#scanRes")&&(t.dataset.scf||t.dataset.scbf)&&t.tagName==="INPUT")edit(t)});
/* paste a screenshot anywhere while the scanner is open; drag and drop on desktop */
document.addEventListener("paste",e=>{const sh=$("scanSheet");if(!sh||!sh.classList.contains("on"))return;const it=[...(e.clipboardData||{}).items||[]].filter(x=>x.kind==="file"&&/^image\//.test(x.type)).map(x=>x.getAsFile()).filter(Boolean);
  if(it.length){e.preventDefault();addFiles(it);toast(`Pasted ${it.length} image${it.length>1?"s":""}`)}});
["dragenter","dragover"].forEach(ev=>document.addEventListener(ev,e=>{const z=e.target.closest&&e.target.closest("#scDrop");if(!z)return;e.preventDefault();z.classList.add("over")}));
["dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{const z=e.target.closest&&e.target.closest("#scDrop");if(!z)return;e.preventDefault();z.classList.remove("over");if(ev==="drop")addFiles(e.dataTransfer.files)}));
/* board rows have no side; pick the better one at analysis time */
const _an=analyzeBet;analyzeBet=function(b){if(b.board){const R=boardPick(b);if(R)return{b,legs:[R],R}}return _an(b)};
window.Scanner={S,paint,read,readImage,_prep:prepScan,_words:ocrWords,analyze,analyzeBet,analyzeLeg,pmCost,ctxAll,open:()=>{$("scanSheet").classList.add("on");paint()}};
})();
