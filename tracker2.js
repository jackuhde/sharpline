/* Sharpline tracker, part 2: parlays, tracker filters, bet performance, and the model-accuracy log.
   Two different things are measured and never mixed:
   - Your bets: what you actually tracked, settled at the odds you got (win rate, profit, ROI, units).
   - Sharpline's predictions: every priced pregame player prop the model rated, graded against the box score
     (accuracy by stat, by grade, by estimated chance, over time). Nothing here is a bet unless you tracked it. */
(function(){
const LSg=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const h=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const amToDec=a=>a>0?1+a/100:1+100/Math.abs(a),decToAm=d=>d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));
const sgnAm=a=>a==null?"–":(a>0?"+":"")+a;

/* ---------- parlay slip ---------- */
let SLIP=LSg("sl_slip",[]);const saveSlip=()=>LSs("sl_slip",SLIP);
function inSlip(key){const b=baseOf(key);return SLIP.some(l=>l.key===b&&l.date===DATA_DATE)}
function addLeg(key){const b=baseOf(key);if(inSlip(key)){SLIP=SLIP.filter(l=>!(l.key===b&&l.date===DATA_DATE));saveSlip();paintSlip();renderAll();return}
  const R=betRec(key);if(!R)return;if(SLIP.some(l=>l.evid&&R.evid&&l.evid===R.evid&&l.spec&&R.spec&&JSON.stringify(l.spec)===JSON.stringify(R.spec))){toast("Already in the slip");return}
  SLIP.push({...R,id:Date.now()+Math.random(),res:null});saveSlip();paintSlip();renderAll();toast(`Added to parlay slip (${SLIP.length} leg${SLIP.length===1?"":"s"})`)}
function slipCalc(legs){const L=legs.filter(l=>l.odds!=null);const dec=L.reduce((a,l)=>a*amToDec(l.odds),1);
  const sgp=new Set(legs.map(l=>l.evid||l.game)).size<legs.length;const pAll=legs.every(l=>l.p!=null)?legs.reduce((a,l)=>a*l.p,1):null;
  let p=sgp?null:pAll,J=null;
  if(sgp&&pAll!=null&&window.SLCorr){SLCorr.load();if(window.GameModel){GameModel.load("nba");GameModel.load("nfl")}if(SLCorr.ready()){J=SLCorr.joint(legs.map(l=>SLCorr.legOf(l,l.p)));if(J)p=J.p}}
  return{dec,am:L.length===legs.length&&legs.length?decToAm(dec):null,sgp,p,J,pAll}}
function paintSlip(){let bar=document.getElementById("slipBar");if(!bar){bar=document.createElement("div");bar.id="slipBar";document.body.appendChild(bar)}
  const C=slipCalc(SLIP);bar.className=SLIP.length?"on":"";bar.innerHTML=SLIP.length?`<button data-slipopen="1"><b>Parlay slip</b> ${SLIP.length} leg${SLIP.length===1?"":"s"}${C.am!=null?` · ${sgnAm(C.am)}`:""}</button>`:""}
function slipSheet(){let el=document.getElementById("slipSheet");if(!el){el=document.createElement("div");el.id="slipSheet";el.className="sheet";document.body.appendChild(el)}
  const C=slipCalc(SLIP);const stake=+(document.getElementById("slipStake")||{}).value||UNIT;
  el.innerHTML=`<div class="sheet-bg" data-slipclose="1"></div><div class="sheet-in"><div class="sheet-h"><div><div class="eyebrow">Parlay</div><h2>${SLIP.length}-leg slip</h2></div><button class="x" data-slipclose="1">×</button></div>
    ${SLIP.length?`<div class="list">${SLIP.map(l=>`<div class="slip-l"><div><b>${h(l.key[0]==="l"?"":l.name+" · ")}${h(l.pick)}</b><small>${h(l.game)}${l.p!=null?` · Sharpline ${Math.round(l.p*100)}%`:""}</small></div>
      <div class="slip-o"><input type="number" inputmode="decimal" data-slipodds="${l.id}" value="${l.odds??""}" placeholder="-110"><button class="x" data-sliprm="${l.id}" aria-label="Remove">×</button></div></div>`).join("")}</div>
      <div class="slip-sum"><div><small>${C.sgp?"Legs multiplied (an SGP pays less)":"Legs multiplied"}</small><b>${C.am!=null?sgnAm(C.am):"enter all odds"}</b></div>
        <div><label>Parlay odds you got</label><input type="number" inputmode="decimal" id="slipOdds" placeholder="${C.sgp?"book's SGP odds":C.am!=null?C.am:"+600"}"></div>
        <div><label>Stake $</label><input type="number" inputmode="decimal" id="slipStake" value="${stake}"></div></div>
      ${C.sgp?`<div class="hint"><b style="color:var(--ink)">Same-game parlay.</b> Legs in one game move together, so books don't pay the legs multiplied: they shorten the price, and Fliff's SGP price is the one that counts. Enter the odds your book gives you.
        ${C.pAll==null?"<br>At least one leg has no Sharpline chance, so there's no combined chance.":C.p!=null?`<br>Sharpline's chance all ${SLIP.length} hit, correlation included: <b style="color:var(--ink)">${(C.p*100).toFixed(1)}%</b>${C.pAll!=null?` (treated as independent it would be ${(C.pAll*100).toFixed(1)}%)`:""}. Fair SGP price: <b style="color:var(--ink)">${sgnAm(decToAm(1/C.p))}</b>; take it only at that or better.${C.J&&C.J.unknown?" Some leg pairs (for example a player prop with a game line, or NBA props) have no measured correlation and count as independent.":""}`:"Loading correlation data…"}
        <span id="slipEv"></span></div>`:C.p!=null?`<p class="hint">If the legs were independent, Sharpline's chance that all ${SLIP.length} win is about ${(C.p*100).toFixed(1)}%. The legs multiplied pay ${C.am!=null?sgnAm(C.am):"–"}, which needs ${C.am!=null?(100/amToDec(C.am)).toFixed(1)+"%":"–"}.</p>`:""}
      <div class="slip-b"><button class="ghost" data-slipclear="1">Clear slip</button><button class="go2" data-sliptrack="1" ${SLIP.length<2?"disabled":""}>Track parlay</button></div>`
    :`<div class="empty"><b>Slip is empty</b>Tap "+ Parlay" on any prop or line to add legs.</div>`}</div>`;
  el.classList.add("on")}
function trackParlay(){if(SLIP.length<2)return;const C=slipCalc(SLIP);if(C.sgp&&!+document.getElementById("slipOdds").value){toast("Enter the same-game parlay odds your book gave you");document.getElementById("slipOdds").focus();return}const o=+document.getElementById("slipOdds").value||C.am,stake=+document.getElementById("slipStake").value||UNIT;
  if(o==null||!isFinite(o)){toast("Enter the parlay odds you got");return}
  const legs=SLIP.map(l=>({key:l.key,name:l.name,pick:l.pick,game:l.game,mkt:l.mkt,odds:l.odds,p:l.p,spec:l.spec,ev:l.ev,evid:l.evid,home:l.home,away:l.away,tm:l.tm,ath:l.ath,date:l.date,sport:l.sport,late:l.late,res:null}));
  const allNfl=legs.every(l=>l.spec&&l.spec.sport==="nfl");legs.forEach(l=>{if(l.spec&&l.spec.sport==="nfl")l.sport="nfl"});
  BETS.unshift({id:Date.now(),type:"parlay",sgp:C.sgp,date:legs.map(l=>l.date).filter(Boolean).sort()[0]||DATA_DATE,sport:allNfl?"nfl":undefined,late:SLIP.some(l=>l.late)||undefined,key:"x"+Date.now(),name:`${legs.length}-leg ${C.sgp?"same-game ":""}parlay`,pick:legs.map(l=>(l.key[0]==="l"?"":l.name.split(" ").pop()+" ")+l.pick).join(" + "),
    game:[...new Set(legs.map(l=>l.game))].join(", "),mkt:"Parlay",odds:Math.round(o),oddsOrig:Math.round(o),userOdds:!!+document.getElementById("slipOdds").value,p:C.p,stake,book:BOOK,res:null,legs,spec:{kind:"parlay"}});
  saveBets();SLIP=[];saveSlip();paintSlip();document.getElementById("slipSheet").classList.remove("on");renderAll();toast("Parlay tracked")}
document.addEventListener("click",e=>{const t=e.target.closest("[data-pleg],[data-slipopen],[data-slipclose],[data-sliprm],[data-slipclear],[data-sliptrack]");if(!t)return;const d=t.dataset;e.preventDefault();e.stopPropagation();
  if(d.pleg)addLeg(d.pleg);else if(d.slipopen)slipSheet();else if(d.slipclose)document.getElementById("slipSheet").classList.remove("on");
  else if(d.sliprm){SLIP=SLIP.filter(l=>String(l.id)!==d.sliprm);saveSlip();paintSlip();slipSheet();renderAll()}
  else if(d.slipclear){SLIP=[];saveSlip();paintSlip();slipSheet();renderAll()}else if(d.sliptrack)trackParlay()},true);
document.addEventListener("input",e=>{const t=e.target.closest("[data-slipodds]");if(!t)return;const l=SLIP.find(x=>String(x.id)===t.dataset.slipodds);if(l){const v=+t.value;l.odds=v&&Math.abs(v)>=100?v:null;saveSlip();paintSlip()}});
document.addEventListener("change",e=>{if(e.target.closest("[data-slipodds]"))slipSheet()});

/* ---------- parlay grading: each leg graded like a straight bet, then combined ---------- */
async function gradeParlays(){const P=BETS.filter(b=>b.type==="parlay"&&!b.res&&!b.noAuto);if(!P.length)return 0;let n=0;
  for(const b of P){for(const l of b.legs.filter(x=>!x.res&&x.spec&&x.spec.sport!=="nfl")){let list;try{list=await sbFor(l.date)}catch(e){continue}
      const ev=list.find(e=>(l.ev&&e.id===l.ev)||(nick(e.home)===nick(l.home)&&nick(e.away)===nick(l.away)));if(!ev)continue;
      let bx=null;if(l.spec.kind==="prop"&&ev.completed){try{bx=BOX_CACHE[ev.id]||(BOX_CACHE[ev.id]=await SharpLive.box(ev.id))}catch(e){continue}}
      const r=SharpLive.grade(l.spec,{...ev,home:l.home,away:l.away},bx);if(r){l.res=r.res;l.gnote=r.detail}}
    const s=settleParlay(b);if(s){Object.assign(b,s,{auto:1,gat:Date.now()});n++}}
  if(n)saveBets();return n}
/* Standard settlement: any losing leg loses the parlay. Pushed or void legs drop out and the parlay pays on the
   remaining legs; if every leg pushes or voids, the stake is returned. When a leg drops, the payout is repriced from the
   remaining legs' own odds (books reprice the same way; a same-game parlay may be repriced differently by the book). */
function settleParlay(b){const L=b.legs;if(L.some(l=>l.res==="L"))return{res:"L",gnote:`${L.filter(l=>l.res==="L").length} losing leg${L.filter(l=>l.res==="L").length===1?"":"s"}`};
  if(L.some(l=>!l.res))return null;const live=L.filter(l=>l.res==="W");if(!live.length)return{res:"P",gnote:"every leg pushed or was void, stake returned"};
  if(live.length===L.length)return{res:"W",gnote:`all ${L.length} legs won`};
  const ok=live.every(l=>l.odds!=null);const odds=ok?decToAm(live.reduce((a,l)=>a*amToDec(l.odds),1)):b.odds;
  return{res:"W",odds,gnote:`${L.length-live.length} leg${L.length-live.length===1?"":"s"} pushed or void; paid as a ${live.length}-leg parlay${ok?" at "+sgnAm(odds):""}${b.sgp?" (your book may reprice a same-game parlay differently)":""}`}}

/* ---------- tracker filters ---------- */
const F=Object.assign({type:"all",res:"all",when:"all",sport:"all"},LSg("sl_tfilt",{}));
const sportOf=b=>b.type==="parlay"?([...new Set((b.legs||[]).map(l=>l.spec&&l.spec.sport==="nfl"?"nfl":"nba"))].length>1?"mixed":(b.legs||[]).some(l=>l.spec&&l.spec.sport==="nfl")?"nfl":"nba"):(b.sport||"nba");
const isLineBet=b=>b.type!=="parlay"&&((b.key&&b.key[0]==="l")||(b.spec&&["ml","sp","tot"].includes(b.spec.kind)));
function filter(list){const now=Date.now(),days={d7:7,d30:30}[F.when];return list.filter(b=>{const isP=b.type==="parlay",isLine=isLineBet(b);if(F.sport!=="all"&&sportOf(b)!==F.sport)return false;
  if(F.type==="straight"&&isP)return false;if(F.type==="parlay"&&!isP)return false;if(F.type==="props"&&(isP||isLine))return false;if(F.type==="lines"&&!isLine)return false;
  if(F.res==="W"&&b.res!=="W")return false;if(F.res==="L"&&b.res!=="L")return false;if(F.res==="open"&&b.res)return false;
  if(days&&now-new Date(b.date+"T12:00:00").getTime()>days*864e5)return false;return true})}
function filterBar(){const c=(k,v,l)=>`<button class="chip ${F[k]===v?"on":""}" data-tf="${k}|${v}">${l}</button>`;
  return`<div class="tfilt"><div class="chiprow">${c("type","all","All bets")}${c("type","straight","Straight")}${c("type","parlay","Parlays")}${c("type","props","Player props")}${c("type","lines","Game lines")}</div>
    <div class="chiprow">${c("res","all","Any result")}${c("res","open","Pending")}${c("res","W","Won")}${c("res","L","Lost")}<span class="tf-sp"></span>${c("when","d7","7 days")}${c("when","d30","30 days")}${c("when","all","All time")}</div><div class="chiprow">${c("sport","all","All sports (overall)")}${c("sport","nba","NBA")}${c("sport","nfl","NFL")}</div></div>`}
document.addEventListener("click",e=>{const t=e.target.closest("[data-tf]");if(!t)return;const[k,v]=t.dataset.tf.split("|");F[k]=v;LSs("sl_tfilt",F);renderTrack()});

function legsHTML(b){if(b.type!=="parlay")return"";const icon=r=>r==="W"?'<i class="lg w">✓</i>':r==="L"?'<i class="lg l">✕</i>':r==="P"||r==="V"?'<i class="lg p">–</i>':'<i class="lg o">•</i>';
  return`<div class="legs">${b.legs.map(l=>`<div>${icon(l.res)}<span>${h(l.key[0]==="l"?"":l.name+" · ")}${h(l.pick)}</span><small>${sgnAm(l.odds)}${l.gnote?" · "+h(l.gnote):""}</small></div>`).join("")}
    <div class="legs-s">${b.legs.filter(l=>l.res==="W").length} won · ${b.legs.filter(l=>l.res==="L").length} lost${b.legs.some(l=>l.res==="P"||l.res==="V")?` · ${b.legs.filter(l=>l.res==="P"||l.res==="V").length} push/void`:""}${b.legs.some(l=>!l.res)?` · ${b.legs.filter(l=>!l.res).length} pending`:""} · pays ${money(b.stake*(amToDec(b.odds)-1))} on ${money(+b.stake)}</div></div>`}

/* ---------- your bets: performance (settled at the odds you got) ---------- */
function perf(list){const s=list.filter(b=>b.res&&b.odds!=null),W=s.filter(b=>b.res==="W").length,L=s.filter(b=>b.res==="L").length,PV=s.filter(b=>b.res==="P"||b.res==="V").length;
  const staked=s.filter(b=>b.res!=="V").reduce((a,b)=>a+(+b.stake||0),0),net=s.reduce((a,b)=>a+profitOf(b),0);return{n:s.length,W,L,PV,staked,net,roi:staked?net/staked:null,wr:W+L?W/(W+L):null}}
function perfHTML(list){const all=perf(list),st=perf(list.filter(b=>b.type!=="parlay")),pa=list.filter(b=>b.type==="parlay"),pp=perf(pa);
  const row=(l,x)=>`<div class="tr"><span>${l}</span><span>${x.W}-${x.L}${x.PV?"-"+x.PV:""}</span><span>${x.wr==null?"–":Math.round(x.wr*100)+"%"}</span><span style="color:${x.net>0?"var(--over)":x.net<0?"var(--under)":"var(--mute)"}">${x.n?money(x.net):"–"}</span><span>${x.roi==null?"–":(x.roi>=0?"+":"")+(x.roi*100).toFixed(1)+"%"}</span></div>`;
  const sizes={};pa.filter(b=>b.res).forEach(b=>{const k=b.legs.length>=5?"5+":String(b.legs.length);(sizes[k]=sizes[k]||[]).push(b)});
  const legs=pa.flatMap(b=>b.legs).filter(l=>l.res==="W"||l.res==="L"),lw=legs.filter(l=>l.res==="W").length;
  return`<div class="eyebrow tk-h">Your bets</div><div class="tsum"><div class="hint" style="margin:0 0 8px">Settled at the odds you got. Pushes and voids are not wins or losses. Units use your default stake of ${money(UNIT)}.</div>
    <div class="stats"><div class="st"><div class="k">Profit</div><div class="v" style="color:${all.net>0?"var(--over)":all.net<0?"var(--under)":""}">${all.n?money(all.net):"–"}</div></div><div class="st"><div class="k">Units</div><div class="v">${all.n?(all.net/UNIT>=0?"+":"")+(all.net/UNIT).toFixed(2):"–"}</div></div><div class="st"><div class="k">ROI</div><div class="v">${all.roi==null?"–":(all.roi>=0?"+":"")+(all.roi*100).toFixed(1)+"%"}</div></div></div>
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span></span><span>W-L-P</span><span>Win %</span><span>Profit</span><span>ROI</span></div>${row(F.sport==="all"?"All bets (overall, every sport)":"All "+F.sport.toUpperCase()+" bets",all)}${row("Straight",st)}${row("Parlays",pp)}${F.sport==="all"?["nba","nfl","mixed"].map(sp=>{const l=list.filter(b=>sportOf(b)===sp);return l.length?row(sp==="mixed"?"Parlays mixing sports":sp.toUpperCase(),perf(l)):""}).join(""):""}</div>
    ${(()=>{const nf=list.filter(b=>b.type!=="parlay"&&b.spec&&b.spec.sport==="nfl"&&b.spec.kind==="prop");if(!nf.length)return"";const g={};nf.forEach(b=>{const k=(b.spec.pos||"?")+" · "+(b.mkt||"");(g[k]=g[k]||[]).push(b)});
      return`<div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>NFL props by position</span><span>W-L-P</span><span>Win %</span><span>Profit</span><span>ROI</span></div>${Object.entries(g).sort().map(([k,l])=>row(k,perf(l))).join("")}</div>`})()}
    ${pa.length?`<div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>Parlays</span><span>Placed</span><span>Won</span><span>Void</span><span>Avg legs</span></div><div class="tr"><span>All</span><span>${pa.length}</span><span>${pa.filter(b=>b.res==="W").length}</span><span>${pa.filter(b=>b.res==="P"||b.res==="V").length}</span><span>${(pa.reduce((a,b)=>a+b.legs.length,0)/pa.length).toFixed(1)}</span></div>
      ${Object.entries(sizes).sort().map(([k,l])=>{const x=perf(l);return`<div class="tr"><span>${k} legs</span><span>${l.length}</span><span>${x.W}</span><span>${x.PV}</span><span>${money(x.net)}</span></div>`}).join("")}</div>
      <div class="hint" style="margin-top:8px">Legs inside your parlays: ${legs.length?`${lw} of ${legs.length} won (${Math.round(lw/legs.length*100)}%)`:"none settled yet"}. A parlay can lose with most legs right, so leg accuracy and parlay results are tracked separately.</div>`:""}</div>`}

/* ---------- Sharpline's predictions: logged before tip, graded after the final ---------- */
const PB=[[0,.5,"Under 50%"],[.5,.55,"50 to 55%"],[.55,.6,"55 to 60%"],[.6,.65,"60 to 65%"],[.65,1.01,"65% and up"]];
const bucket=p=>PB.findIndex(([a,b])=>p>=a&&p<b);
function logPreds(){if(typeof PROPS==="undefined"||!DATA_DATE)return;const O=LSg("sl_pred_open",{}),day=O[DATA_DATE]=O[DATA_DATE]||{};let ch=0;
  PROPS.forEach((x,i)=>{const g=SUG[i];if(!g||g.p==null||g.l==null||YN[x.st]||g.bp==null)return;if(gameStatus(x.g).k!=="pre")return;const e=evFor(x.g);if(!e)return;
    const k=normN(x.p)+"|"+x.st+"|"+g.l,rec=[x.p,x.st,g.l,g.s,Math.round(g.p*1000)/1000,gradeNow("p"+i)||"",e.id,e.home,e.away];
    if(JSON.stringify(day[k])!==JSON.stringify(rec)){day[k]=rec;ch=1}});
  Object.keys(O).forEach(d=>{if(!Object.keys(O[d]).length)delete O[d]});if(ch)LSs("sl_pred_open",O)}
async function gradePreds(){const O=LSg("sl_pred_open",{}),A=LSg("sl_pred_agg",{});let n=0;
  for(const d of Object.keys(O)){let list;try{list=await sbFor(d)}catch(e){continue}
    const done=list.filter(e=>e.completed);for(const ev of done){const ks=Object.keys(O[d]).filter(k=>O[d][k][6]===ev.id);if(!ks.length)continue;
      let bx;try{bx=BOX_CACHE[ev.id]||(BOX_CACHE[ev.id]=await SharpLive.box(ev.id))}catch(e){continue}
      for(const k of ks){const[p,st,l,s,pr,gr]=O[d][k];const r=SharpLive.grade({kind:"prop",player:p,stat:st,line:l,side:s},ev,bx);if(!r)continue;
        const D=A[d]=A[d]||{};const add=key=>{const c=D[key]=D[key]||[0,0,0,0];if(r.res==="W")c[0]++;else if(r.res==="L")c[1]++;else if(r.res==="P")c[2]++;c[3]+=pr*(r.res==="W"||r.res==="L"?1:0)};
        add("all");add("st|"+st);add("b|"+bucket(pr));if(gr)add("g|"+gr);delete O[d][k];n++}}
    if(!Object.keys(O[d]).length)delete O[d]}
  Object.keys(O).forEach(d=>{if(Date.now()-new Date(d+"T12:00:00")>5*864e5)delete O[d]});
  if(n){LSs("sl_pred_open",O);LSs("sl_pred_agg",A)}return n}
function accHTML(){const A=LSg("sl_pred_agg",{}),days=Object.keys(A).sort();const open=Object.values(LSg("sl_pred_open",{})).reduce((a,d)=>a+Object.keys(d).length,0);
  const sum=(keyF,dayF)=>{const t=[0,0,0,0];days.filter(dayF||(()=>1)).forEach(d=>Object.entries(A[d]).forEach(([k,c])=>{if(keyF(k))for(let i=0;i<4;i++)t[i]+=c[i]}));return t};
  const acc=c=>c[0]+c[1]?c[0]/(c[0]+c[1]):null,fmt=c=>acc(c)==null?"–":(acc(c)*100).toFixed(1)+"%";
  const all=sum(k=>k==="all");
  const head=`<div class="eyebrow tk-h">Sharpline's prop predictions</div><div class="tsum"><div class="hint" style="margin:0 0 8px">Every priced pregame player prop Sharpline rated on this phone, graded after the final. These are the model's picks, not your bets. Pushes are left out of accuracy.${open?` ${open} waiting for games to finish.`:""}</div>`;
  if(!all[0]&&!all[1])return head+`<div class="hint">No graded predictions yet. They start counting once a game you had loaded before tip-off goes final.</div></div>`;
  const rec=d=>Date.now()-new Date(d+"T12:00:00")<=7*864e5;
  const stats=[...new Set(days.flatMap(d=>Object.keys(A[d]).filter(k=>k.startsWith("st|")).map(k=>k.slice(3))))].sort((a,b)=>statRank(a)-statRank(b));
  const grades=["S","A","B","C","D","F"].filter(g=>days.some(d=>A[d]["g|"+g]));
  const tr=(l,c,extra)=>`<div class="tr"><span>${l}</span><span>${c[0]+c[1]+c[2]}</span><span>${c[0]}-${c[1]}${c[2]?"-"+c[2]:""}</span><span>${fmt(c)}</span>${extra!=null?`<span>${extra}</span>`:""}</div>`;
  return head+`<div class="stats"><div class="st"><div class="k">Predictions</div><div class="v">${all[0]+all[1]+all[2]}</div></div><div class="st"><div class="k">Correct</div><div class="v">${fmt(all)}</div></div><div class="st"><div class="k">Last 7 days</div><div class="v">${fmt(sum(k=>k==="all",rec))}</div></div></div>
    <div class="list tk-t" style="margin-top:10px"><div class="tr th"><span>By stat</span><span>N</span><span>W-L-P</span><span>Correct</span></div>${stats.map(s=>tr(STAT_LBL[s]||s,sum(k=>k==="st|"+s))).join("")}</div>
    ${grades.length?`<div class="list tk-t" style="margin-top:10px"><div class="tr th"><span>By grade</span><span>N</span><span>W-L-P</span><span>Correct</span></div>${grades.map(g=>tr(g,sum(k=>k==="g|"+g))).join("")}</div>`:""}
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>Sharpline's chance</span><span>N</span><span>W-L-P</span><span>Actual</span><span>Expected</span></div>${PB.map((b,i)=>{const c=sum(k=>k==="b|"+i);return c[0]+c[1]+c[2]?tr(b[2],c,c[0]+c[1]?(c[3]/(c[0]+c[1])*100).toFixed(1)+"%":"–"):""}).join("")}</div>
    <div class="hint" style="margin-top:8px">Calibration: if "Actual" stays close to "Expected" in each row, the percentages mean what they say. ${all[0]+all[1]<300?`<b style="color:var(--gold)">Only ${all[0]+all[1]} graded so far; rows under about 100 are mostly noise.</b>`:""}</div>
    <div class="list tk-t" style="margin-top:10px"><div class="tr th"><span>Day</span><span>N</span><span>W-L-P</span><span>Correct</span></div>${days.slice(-10).reverse().map(d=>tr(d,A[d].all||[0,0,0,0])).join("")}</div></div>`}

/* sections under the tracker: your performance vs the model's numbers, the model's own Top List record, prediction accuracy, backtest */
function extras(box){if(!box)return;try{if(BETS.length)box.insertAdjacentHTML("beforeend",perfHTML(filter(BETS)))}catch(e){console.warn(e)}
  try{if(window.SLRecs)box.insertAdjacentHTML("beforeend",SLRecs.html())}catch(e){console.warn(e)}
  try{box.insertAdjacentHTML("beforeend",accHTML())}catch(e){console.warn(e)}
  try{if(window.SLRecs)box.insertAdjacentHTML("beforeend",SLRecs.backtestHTML())}catch(e){console.warn(e)}}
function addLegObj(R){if(!R)return;if(R.odds==null){toast("Enter your book's price first");return}if(SLIP.some(l=>l.key===R.key)){toast("Already in the slip");return}
  SLIP.push({...R,id:Date.now()+Math.random(),res:null});saveSlip();paintSlip();toast(`Added to parlay slip (${SLIP.length} leg${SLIP.length===1?"":"s"})`)}
/* ---------- add a bet by hand: any NBA game on today's slate or any NFL game this week, including games already underway or
   final (for bets you forgot to enter). It keeps exactly what you type: line, odds, stake, book. A bet added after the game
   started has no Sharpline chance or EV (nothing pregame is invented for it) and is marked "added late". Graded automatically
   from the box score like any other bet. ---------- */
const MAN={sport:"nba",gi:"",kind:"prop",player:"",stat:"",line:"",side:"o",team:"a",odds:"",stake:"",book:""};
const NBA_STATS=["Points","Rebounds","Assists","3-Pointers","Pts+Reb+Ast","Pts+Reb","Pts+Ast","Reb+Ast","Steals","Blocks","Turnovers"];
function manGames(){if(MAN.sport==="nfl"){const N=window.NFL&&NFL.N;return N&&N.events?N.events.map(e=>({id:e.id,lbl:`${e.away.ab} @ ${e.home.ab}`,st:e.state,e})):[]}
  return(typeof SNAP!=="undefined"?SNAP:[]).map((G,gi)=>{const e=LIVE.ev[gi]||{};return{id:String(gi),lbl:mu(G),st:e.state||(started(gi)?"in":"pre"),G,gi,e}})}
function manPlayers(g){if(!g)return[];if(MAN.sport==="nfl"){const N=NFL.N;if(!N.stats)return[];const ids=[g.e.home.id,g.e.away.id];
    return Object.entries(N.stats.ath).filter(([,a])=>ids.includes(String(a[2]))||ids.includes(a[2])).map(([id,a])=>({id,name:a[0],pos:a[1],tm:a[2]}))}
  const ids=[g.e.homeId,g.e.awayId].filter(Boolean),out=new Map();Object.entries(LIVE.ids||{}).forEach(([id,w])=>{if(ids.includes(w.tm))out.set(normN(w.name),{id,name:w.name})});
  (typeof PROPS!=="undefined"?PROPS:[]).forEach(x=>{if(x.g===g.gi&&!out.has(normN(x.p)))out.set(normN(x.p),{id:null,name:x.p})});return[...out.values()].sort((a,b)=>a.name.localeCompare(b.name))}
function manSheet(){let el=document.getElementById("manSheet");if(!el){el=document.createElement("div");el.id="manSheet";el.className="sheet";document.body.appendChild(el)}
  if(MAN.sport==="nfl"&&window.NFL&&NFL.ensure&&(!(NFL.N.events||[]).length||!NFL.N.stats)&&!manSheet.loading){manSheet.loading=1;Promise.resolve(NFL.ensure()).then(()=>{manSheet.loading=0;manSheet()}).catch(()=>{manSheet.loading=0})}
  const G=manGames(),g=G.find(x=>x.id===MAN.gi)||null,P=g&&MAN.kind==="prop"?manPlayers(g):[],stats=MAN.sport==="nfl"?Object.entries(NFL.SHORT||{}).filter(([k])=>k!=="pLng"):NBA_STATS.map(x=>[x,(typeof STAT_LBL!=="undefined"&&STAT_LBL[x])||x]);
  const opt=(v,l,sel)=>`<option value="${h(v)}"${sel?" selected":""}>${h(l)}</option>`,chip=(k,v,l)=>`<button class="chip ${MAN[k]===v?"on":""}" data-man="${k}|${v}">${l}</button>`;
  const stL=x=>x==="pre"?"":x==="post"?" · final":" · underway";
  const tms=g?(MAN.sport==="nfl"?[g.e.away.ab,g.e.home.ab]:[team(g.G.away)[0],team(g.G.home)[0]]):["Away","Home"];
  el.innerHTML=`<div class="sheet-bg" data-manclose="1"></div><div class="sheet-in"><div class="sheet-h"><div><div class="eyebrow">Tracker</div><h2>Add a bet by hand</h2></div><button class="x" data-manclose="1">×</button></div>
    <p class="sheet-p">For any bet you placed, including ones you forgot to enter until the game started. It is saved exactly as you type it and graded from the box score.</p>
    <div class="filt">${chip("sport","nba","NBA")}${chip("sport","nfl","NFL")}</div>
    <label class="mlab">Game</label><select class="msel" data-manf="gi">${opt("","Pick a game",!MAN.gi)}${G.map(x=>opt(x.id,x.lbl+stL(x.st),x.id===MAN.gi)).join("")}</select>
    ${!G.length?`<p class="hint">${MAN.sport==="nfl"?"Open the NFL tab once to load this week's games.":"No games on today's slate."}</p>`:""}
    <div class="filt" style="margin-top:10px">${chip("kind","prop","Player prop")}${chip("kind","ml","Moneyline")}${chip("kind","sp","Spread")}${chip("kind","tot","Total")}</div>
    ${MAN.kind==="prop"?`<label class="mlab">Player</label><input class="msel" list="manPl" data-manf="player" value="${h(MAN.player)}" placeholder="Type a name"><datalist id="manPl">${P.map(x=>opt(x.name,x.pos?x.name+" · "+x.pos:x.name)).join("")}</datalist>
      <label class="mlab">Stat</label><select class="msel" data-manf="stat">${opt("","Pick a stat",!MAN.stat)}${stats.map(([k,l])=>opt(k,l,k===MAN.stat)).join("")}</select>`:""}
    ${MAN.kind==="ml"||MAN.kind==="sp"?`<div class="filt" style="margin-top:10px">${chip("team","a",h(tms[0]))}${chip("team","h",h(tms[1]))}</div>`:""}
    ${MAN.kind==="prop"||MAN.kind==="tot"?`<div class="filt" style="margin-top:10px">${chip("side","o","Over")}${chip("side","u","Under")}</div>`:""}
    <div class="mrow3">${MAN.kind!=="ml"&&!(MAN.sport==="nfl"&&MAN.stat==="td")?`<div><label class="mlab">Line</label><input class="msel" type="number" inputmode="decimal" step="0.5" data-manf="line" value="${h(MAN.line)}" placeholder="${MAN.kind==="sp"?"-3.5":"24.5"}"></div>`:""}
      <div><label class="mlab">Odds</label><input class="msel" type="number" inputmode="decimal" data-manf="odds" value="${h(MAN.odds)}" placeholder="-110"></div>
      <div><label class="mlab">Stake $</label><input class="msel" type="number" inputmode="decimal" data-manf="stake" value="${h(MAN.stake)}" placeholder="${typeof UNIT!=="undefined"?UNIT:10}"></div></div>
    <label class="mlab">Book</label><input class="msel" data-manf="book" value="${h(MAN.book)}" placeholder="${typeof BOOK!=="undefined"?h(BOOK):"Fliff"}">
    ${g&&g.st!=="pre"?`<p class="hint">This game has ${g.st==="post"?"finished":"started"}, so the bet is saved as added late, with no Sharpline chance or EV. ${g.st==="post"?"It is graded right away.":""}</p>`:""}
    <div class="slip-b"><button class="ghost" data-manadd="leg">+ Parlay leg</button><button class="go2" data-manadd="straight">Track straight bet</button></div>
    <p class="hint">For a parlay, add each leg here (leg odds optional), then open the parlay slip and enter the parlay odds you got.</p></div>`;
  el.classList.add("on")}
function manRecord(){const G=manGames(),g=G.find(x=>x.id===MAN.gi);if(!g)return toast("Pick a game"),null;
  const odds=+MAN.odds,line=MAN.line===""?null:+MAN.line,stake=+MAN.stake||((typeof UNIT!=="undefined"&&UNIT)||10),book=MAN.book||((typeof BOOK!=="undefined"&&BOOK)||"Book");
  const oddsOk=MAN.odds!==""&&Math.abs(odds)>=100;const late=g.st!=="pre";
  if(MAN.kind!=="ml"&&!(MAN.sport==="nfl"&&MAN.stat==="td")&&(line==null||!isFinite(line)))return toast("Enter the line"),null;
  const base={id:Date.now()+Math.floor(Math.random()*1000),type:"straight",stake,book,res:null,odds:oddsOk?Math.round(odds):null,p:null,push:0,grade:null,conf:null,src:"manual",late:late||undefined};
  if(MAN.sport==="nfl"){const e=g.e,SH=NFL.SHORT||{},date=(d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)(new Date(e.date));
    const B={...base,sport:"nfl",date,game:`${e.away.ab} @ ${e.home.ab}`,tip:e.date,home:e.home.name,away:e.away.name,evid:e.id,ev:null};
    if(MAN.kind==="prop"){const pl=manPlayers(g).find(x=>normN(x.name)===normN(MAN.player));if(!pl)return toast("Pick a player from the list"),null;if(!MAN.stat)return toast("Pick a stat"),null;
      const td=MAN.stat==="td",side=td?"o":MAN.side;const pick=td?"Anytime TD":`${side==="o"?"Over":"Under"} ${line} ${SH[MAN.stat]||MAN.stat}`;
      return{...B,key:`n:man:${e.id}|${pl.id}|${MAN.stat}|${line}|${Date.now()}`,name:pl.name,mkt:SH[MAN.stat]||MAN.stat,pick,ath:pl.id,tm:pl.tm,
        spec:{sport:"nfl",kind:"prop",ev:e.id,ath:pl.id,stat:MAN.stat,line:td?.5:line,side,player:pl.name,pos:pl.pos}}}
    const t=MAN.team==="h"?e.home:e.away,mk=MAN.kind;const pick=mk==="ml"?`${t.short||t.ab} ML`:mk==="sp"?`${t.short||t.ab} ${line>0?"+":""}${line}`:`${MAN.side==="o"?"Over":"Under"} ${line}`;
    return{...B,key:`nl:man:${e.id}|${mk}|${Date.now()}`,name:`${e.away.ab} @ ${e.home.ab}`,mkt:{ml:"Moneyline",sp:"Spread",tot:"Total"}[mk],pick,
      spec:{sport:"nfl",kind:mk,ev:e.id,team:mk==="tot"?null:t.id,teamName:mk==="tot"?null:t.name,line:mk==="ml"?null:line,side:mk==="tot"?MAN.side:null}}}
  const Gm=g.G,evId=g.e.id||null,B={...base,date:DATA_DATE,game:mu(Gm),tip:Gm.tip,home:Gm.home,away:Gm.away,ev:evId,evid:evId};
  if(MAN.kind==="prop"){const pl=manPlayers(g).find(x=>normN(x.name)===normN(MAN.player));const name=pl?pl.name:MAN.player.trim();if(!name)return toast("Enter the player"),null;if(!MAN.stat)return toast("Pick a stat"),null;
    return{...B,key:"m"+Date.now(),name,mkt:MAN.stat,pick:`${MAN.side==="o"?"Over":"Under"} ${line} ${(typeof STAT_LBL!=="undefined"&&STAT_LBL[MAN.stat])||MAN.stat}`,ath:pl&&pl.id||null,tm:null,
      spec:{kind:"prop",player:name,stat:MAN.stat,line,side:MAN.side}}}
  const full=MAN.team==="h"?Gm.home:Gm.away,ab=team(full)[0],mk=MAN.kind;
  return{...B,key:"m"+Date.now(),name:mu(Gm),mkt:{ml:"Moneyline",sp:"Spread",tot:"Total"}[mk],pick:mk==="ml"?`${ab} ML`:mk==="sp"?`${ab} ${line>0?"+":""}${line}`:`${MAN.side==="o"?"Over":"Under"} ${line}`,
    spec:mk==="ml"?{kind:"ml",team:full}:mk==="sp"?{kind:"sp",team:full,line}:{kind:"tot",line,side:MAN.side}}}
document.addEventListener("click",e=>{const t=e.target.closest("[data-manopen],[data-manclose],[data-man],[data-manadd]");if(!t)return;const d=t.dataset;e.preventDefault();
  if(d.manopen){if(window.NFL&&NFL.N&&NFL.N.view)MAN.sport=MAN.sport||"nba";manSheet();return}
  if(d.manclose){document.getElementById("manSheet").classList.remove("on");return}
  if(d.man){const[k,v]=d.man.split("|");MAN[k]=v;if(k==="sport"){MAN.gi="";MAN.player="";MAN.stat=""}manSheet();return}
  if(d.manadd){const R=manRecord();if(!R)return;
    if(d.manadd==="straight"){if(R.odds==null){toast("Enter the odds you got");return}BETS.unshift(R);saveBets();if(typeof renderAll==="function")renderAll();document.getElementById("manSheet").classList.remove("on");
      toast(`Tracked ${R.pick}${R.late?" (added late)":""}`);if(R.sport==="nfl"&&NFL.gradeAll)NFL.gradeAll();else if(typeof gradePending==="function")gradePending().then(n=>{if(n&&typeof renderAll==="function")renderAll()});MAN.player="";MAN.line="";MAN.odds="";return}
    SLIP.push({...R,id:Date.now()+Math.random()});saveSlip();paintSlip();toast(`Added leg (${SLIP.length} in the slip)`);MAN.player="";MAN.line="";MAN.odds="";manSheet()}},true);
document.addEventListener("change",e=>{const t=e.target.closest("[data-manf]");if(!t)return;MAN[t.dataset.manf]=t.value;if(["gi","stat"].includes(t.dataset.manf))manSheet()});
document.addEventListener("input",e=>{const t=e.target.closest("[data-manf]");if(!t||t.tagName==="SELECT")return;MAN[t.dataset.manf]=t.value});
window.TR2={manSheet,extras,addLegObj,sportOf,_settle:settleParlay,_bucket:bucket,filter,filterBar,legsHTML,perfHTML,accHTML,inSlip,paintSlip,logPreds,gradePreds,gradeParlays};
setTimeout(()=>{paintSlip();
},0);
/* typing the book's parlay odds shows EV against Sharpline's chance (correlation included for same-game parlays) */
document.addEventListener("input",e=>{if(e.target.id!=="slipOdds")return;const out=document.getElementById("slipEv");if(!out)return;const C=slipCalc(SLIP),o=+e.target.value;
  if(!o||Math.abs(o)<100||C.p==null){out.innerHTML="";return}const ev=C.p*amToDec(o)-1;
  out.innerHTML=`<br>At ${sgnAm(o)}: EV <b style="color:${ev>=0?"var(--over)":"var(--under)"}">${ev>=0?"+":"−"}${Math.abs(ev*100).toFixed(1)}%</b> (needs ${(100/amToDec(o)).toFixed(1)}%).`});
})();
