/* Sharpline universal bet scanner.
   1) Input: screenshots (tap, drag and drop, or paste), pasted text, or a bet typed by hand. Screenshots are read on the
      device with Tesseract (free OCR, text only).
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
async function prepNFL(){if(!window.NFL)return;try{await Promise.race([NFL.ensure(),new Promise(r=>setTimeout(r,15000))])}catch(e){}}

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
  else if(out.sameGame)out.pNote="Two or more legs are from the same game, so they aren't independent: results in one game move together (a quarterback's yards and his receiver's yards, or a big scoring night and the game total). Sharpline doesn't have a tested correlation model, so it won't give a combined chance, and multiplying the legs would be wrong. The legs are graded one by one below.";
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
    ${pmNote}${L.missing.length?`<div class="sc-miss">Couldn't read: ${h(L.missing.join(", "))}</div>`:""}<div class="sc-raw">“${h(L.raw)}”</div></div>`}
function reviewHTML(){if(!S.bets.length)return"";const n=S.bets.filter(b=>b.on!==false).length;
  return`<div class="sc-h2"><b>Check what Sharpline read</b><span>Fix anything wrong, then analyze. Nothing is graded yet.</span></div>`+
  S.bets.map(b=>`<div class="sc-card ${b.on===false?"off":""}" data-b="${b.id}">
    <div class="sc-ch"><label class="ck"><input type="checkbox" data-scon="${b.id}" ${b.on!==false?"checked":""}></label>
      <b>${b.kind==="parlay"?`${b.pickem?"Pick'em entry":b.sgp?"Same-game parlay":"Parlay"} · ${b.legs.length} legs`:b.board?"Board line (no side picked)":"Single bet"}</b>
      <input class="sc-book" data-scbf="book" value="${h(b.book||"")}" placeholder="Book or app"></div>
    ${b.dup?`<div class="sc-miss">Duplicate of another bet in this scan</div>`:""}${b.board?`<div class="sc-m">Both sides are listed, so Sharpline will show the better side and won't treat it as your pick.</div>`:""}
    ${b.legs.map((L,j)=>legEditor(b,L,j)).join("")}
    <div class="sc-row sc-money">${b.kind==="parlay"?`<label>Parlay odds<input data-scbf="parlayOdds" value="${b.parlayOdds!=null?am(b.parlayOdds):""}" placeholder="${b.pickem?"e.g. +400 for 5x":"from the slip"}"></label>`:""}
      <label>Stake $<input data-scbf="stake" inputmode="decimal" value="${b.stake??""}" placeholder="optional"></label></div>
    ${b.payMismatch?`<div class="sc-miss">The payout on the slip doesn't match the odds read. Check both.</div>`:""}</div>`).join("")+
  `<button class="go2" data-scanalyze="1" ${n?"":"disabled"}>Analyze ${n} bet${n===1?"":"s"}</button>`}

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
    <header><div><b>${h(pickTxt(L,R.A))}</b><span>${h(R.A.game||"")}${R.A.sport?` · ${R.A.sport.toUpperCase()}`:""}</span></div><em class="sc-v ${R.v}">${VLBL[R.v]}</em></header>
    ${b.board?`<p class="sc-p sc-note">The screenshot listed both sides, so this isn't a pick you made. Shown: the side Sharpline rates better at the listed prices.</p>`:""}
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
  return`<article class="sc-res v-${o.v}" id="scr${i}"><header><div><b>${b.legs.length}-leg ${b.pickem?"pick'em entry":o.sameGame?"same-game parlay":"parlay"}</b><span>${h(b.book||"Book not shown")}</span></div><em class="sc-v ${o.v}">${VLBL[o.v]}</em></header>
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
function savedHTML(){const L=savedGet();if(!L.length)return"";return`<details class="sc-saved"><summary>Saved analyses (${L.length})</summary>${L.map((x,i)=>`<div><span><b>${h(x.title)}</b><small>${new Date(x.ts).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · then ${VLBL[x.v]||""}${x.ev!=null?" "+evs(x.ev):""}</small></span><button class="addbtn" data-screopen="${i}">Re-check now</button><button class="sc-x" data-scdel="${i}" aria-label="Delete">×</button></div>`).join("")}</details>`}

/* ---------- flow ---------- */
const $=id=>document.getElementById(id);
function paint(){const box=$("scanRes");if(!box)return;box.innerHTML=S.res?resultsHTML():reviewHTML();const sv=$("scSaved");if(sv)sv.innerHTML=S.res?"":savedHTML();$("scIn").style.display=S.res?"none":""}
function addFiles(fs){fs=[...fs].filter(f=>/^image\//.test(f.type));if(!fs.length)return;S.files=[...S.files,...fs].slice(0,8);thumbs();}
function thumbs(){const t=$("thumbs");t.innerHTML=S.files.map((f,i)=>`<div><img src="${URL.createObjectURL(f)}" alt=""><button class="sc-x" data-scrmimg="${i}" aria-label="Remove">×</button></div>`).join("");goBtn()}
function goBtn(){const g=$("scanGo"),n=S.files.length,txt=($("scText")||{}).value||"";g.disabled=S.busy||(!n&&!txt.trim());g.textContent=S.busy?"Reading…":n&&txt.trim()?`Read ${n} screenshot${n>1?"s":""} and text`:n?`Read ${n} screenshot${n>1?"s":""}`:"Read text"}
async function read(){if(S.busy)return;S.busy=true;goBtn();const st=$("scanStat");S.res=null;let bets=[],fails=0;
  st.textContent="Loading player lists…";await prepNFL();const ctx=ctxAll();
  try{if(S.files.length){const w=await getWorker(st);const th=[...document.querySelectorAll("#thumbs div")];
      for(let i=0;i<S.files.length;i++){st.dataset.i=`${i+1} of ${S.files.length}`;st.textContent=`Reading screenshot ${i+1} of ${S.files.length}…`;th[i]&&th[i].classList.add("scanning");stage(1);
        try{const cv=await prepImage(S.files[i]);stage(2);const{data}=await w.recognize(cv);stage(3);const got=SB.parse((data.lines||[]).map(l=>l.text),ctx,{image:1});bets.push(...got);th[i]&&th[i].classList.replace("scanning",got.length?"done":"err");if(!got.length)fails++}
        catch(e){fails++;th[i]&&th[i].classList.replace("scanning","err")}}stage(0);delete st.dataset.i}
    const txt=$("scText").value;if(txt.trim())bets.push(...SB.parse(txt,ctx))}
  catch(e){st.innerHTML=`<span class="bad">The screenshot reader couldn't load. Check your connection, or paste the text instead.</span>`;S.busy=false;goBtn();return}
  bets.forEach((b,i)=>{b.id="b"+(i+1)});const seen=new Map();bets.forEach(b=>{const k=JSON.stringify(b.legs.map(L=>[L.player,L.stat,L.mk,L.side,L.line,L.odds]));if(seen.has(k))b.dup=seen.get(k);else{seen.set(k,b.id);delete b.dup}});
  S.bets=bets;S.busy=false;goBtn();
  st.innerHTML=bets.length?`Found ${bets.length} bet${bets.length===1?"":"s"}${fails?` · ${fails} screenshot${fails>1?"s":""} had nothing readable`:""}.`:`<span class="bad">No bets found. Try a sharper, full-screen screenshot, paste the text, or enter it manually.</span>`;paint()}
function manual(){const sp=typeof SPORT!=="undefined"?SPORT:"nba";S.res=null;S.bets.push({id:"m"+Date.now(),kind:"single",book:typeof BOOK!=="undefined"?BOOK:"",legs:[{sport:sp,mk:"prop",player:"",cands:[],team:null,teams:[],stat:null,side:"over",line:null,odds:null,missing:[],raw:"entered by hand"}],stake:null,missing:[]});paint()}
async function analyze(){const st=$("scanStat");st.textContent="Checking players, games and markets…";if(S.bets.some(b=>b.legs.some(L=>L.sport!=="nba")))await prepNFL();
  S.at=Date.now();S.res=S.bets.filter(b=>b.on!==false).map(b=>{try{return analyzeBet(b)}catch(e){console.error(e);return{b,legs:[],R:{leg:b.legs[0],A:{checks:[{ok:false,t:"Something went wrong checking this bet"}],market:{rows:[]}},v:"na",vt:String(e.message)},v:"na"}}});
  st.textContent="";paint();const r=$("scanRes");if(r)r.scrollIntoView({block:"start",behavior:"smooth"})}
const parseAm=v=>{const s=String(v||"").trim();if(!s)return null;if(/^\d+(\.\d+)?$/.test(s)&&+s>1&&+s<30&&s.includes("."))return toAm(+s);const n=parseFloat(s.replace(/[^\d.+-]/g,""));return isNaN(n)||Math.abs(n)<100?null:Math.round(n)};
function edit(t){const lg=t.closest(".sc-leg"),card=t.closest(".sc-card");if(!card)return;const b=S.bets.find(x=>x.id===card.dataset.b);if(!b)return;
  if(t.dataset.scbf){const f=t.dataset.scbf,v=t.value;if(f==="book")b.book=v.trim()||null;if(f==="stake")b.stake=v.trim()?+v.replace(/[^\d.]/g,""):null;if(f==="parlayOdds")b.parlayOdds=parseAm(v);return}
  if(!lg)return;const L=b.legs[+lg.dataset.l],f=t.dataset.scf,v=t.value;
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
  const a=L.over!=null?tryS("over"):null,c=L.under!=null?tryS("under"):null;return[a,c].filter(Boolean).sort((x,y)=>(y.ev??-9)-(x.ev??-9))[0]}

document.addEventListener("click",async e=>{const t=e.target.closest("[data-scango],[data-scmanual],[data-scanalyze],[data-scback],[data-scnew],[data-sctrack],[data-sctracksel],[data-scsave],[data-screopen],[data-scdel],[data-scrmleg],[data-scrmimg],[data-scnfprof],[data-scnfm],[data-sclive],[data-scuse],#scDrop");if(!t||e.target.id==="scanFiles")return;
  const d=t.dataset;if(t.id==="scDrop"){if(!e.target.closest("button"))$("scanFiles").click();return}
  e.preventDefault();e.stopPropagation();
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
  if(t.closest&&t.closest("#scanRes")&&(t.dataset.scf||t.dataset.scbf))edit(t)},true);
document.addEventListener("input",e=>{const t=e.target;if(t.id==="scText"){goBtn();return}if(t.closest&&t.closest("#scanRes")&&(t.dataset.scf||t.dataset.scbf)&&t.tagName==="INPUT")edit(t)});
/* paste a screenshot anywhere while the scanner is open; drag and drop on desktop */
document.addEventListener("paste",e=>{const sh=$("scanSheet");if(!sh||!sh.classList.contains("on"))return;const it=[...(e.clipboardData||{}).items||[]].filter(x=>x.kind==="file"&&/^image\//.test(x.type)).map(x=>x.getAsFile()).filter(Boolean);
  if(it.length){e.preventDefault();addFiles(it);toast(`Pasted ${it.length} image${it.length>1?"s":""}`)}});
["dragenter","dragover"].forEach(ev=>document.addEventListener(ev,e=>{const z=e.target.closest&&e.target.closest("#scDrop");if(!z)return;e.preventDefault();z.classList.add("over")}));
["dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{const z=e.target.closest&&e.target.closest("#scDrop");if(!z)return;e.preventDefault();z.classList.remove("over");if(ev==="drop")addFiles(e.dataTransfer.files)}));
/* board rows have no side; pick the better one at analysis time */
const _an=analyzeBet;analyzeBet=function(b){if(b.board){const R=boardPick(b);if(R)return{b,legs:[R],R}}return _an(b)};
window.Scanner={S,paint,read,analyze,analyzeBet,analyzeLeg,pmCost,ctxAll,open:()=>{$("scanSheet").classList.add("on");paint()}};
})();
