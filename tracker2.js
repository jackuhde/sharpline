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
  return{dec,am:L.length===legs.length&&legs.length?decToAm(dec):null,sgp,p:sgp?null:pAll}}
function paintSlip(){let bar=document.getElementById("slipBar");if(!bar){bar=document.createElement("div");bar.id="slipBar";document.body.appendChild(bar)}
  const C=slipCalc(SLIP);bar.className=SLIP.length?"on":"";bar.innerHTML=SLIP.length?`<button data-slipopen="1"><b>Parlay slip</b> ${SLIP.length} leg${SLIP.length===1?"":"s"}${C.am!=null?` · ${sgnAm(C.am)}`:""}</button>`:""}
function slipSheet(){let el=document.getElementById("slipSheet");if(!el){el=document.createElement("div");el.id="slipSheet";el.className="sheet";document.body.appendChild(el)}
  const C=slipCalc(SLIP);const stake=+(document.getElementById("slipStake")||{}).value||UNIT;
  el.innerHTML=`<div class="sheet-bg" data-slipclose="1"></div><div class="sheet-in"><div class="sheet-h"><div><div class="eyebrow">Parlay</div><h2>${SLIP.length}-leg slip</h2></div><button class="x" data-slipclose="1">×</button></div>
    ${SLIP.length?`<div class="list">${SLIP.map(l=>`<div class="slip-l"><div><b>${h(l.key[0]==="l"?"":l.name+" · ")}${h(l.pick)}</b><small>${h(l.game)}${l.p!=null?` · Sharpline ${Math.round(l.p*100)}%`:""}</small></div>
      <div class="slip-o"><input type="number" inputmode="decimal" data-slipodds="${l.id}" value="${l.odds??""}" placeholder="-110"><button class="x" data-sliprm="${l.id}" aria-label="Remove">×</button></div></div>`).join("")}</div>
      <div class="slip-sum"><div><small>Legs multiplied</small><b>${C.am!=null?sgnAm(C.am):"enter all odds"}</b></div>
        <div><label>Parlay odds you got</label><input type="number" inputmode="decimal" id="slipOdds" placeholder="${C.am!=null?C.am:"+600"}"></div>
        <div><label>Stake $</label><input type="number" inputmode="decimal" id="slipStake" value="${stake}"></div></div>
      ${C.sgp?`<p class="hint">Same-game legs are often correlated, so the book's same-game parlay price can differ a lot from the legs multiplied. Enter the parlay odds you actually got. Sharpline won't show a combined win chance for same-game parlays.</p>`:C.p!=null?`<p class="hint">If the legs were independent, Sharpline's chance that all ${SLIP.length} win is about ${(C.p*100).toFixed(1)}%. The legs multiplied pay ${C.am!=null?sgnAm(C.am):"–"}, which needs ${C.am!=null?(100/amToDec(C.am)).toFixed(1)+"%":"–"}.</p>`:""}
      <div class="slip-b"><button class="ghost" data-slipclear="1">Clear slip</button><button class="go2" data-sliptrack="1" ${SLIP.length<2?"disabled":""}>Track parlay</button></div>`
    :`<div class="empty"><b>Slip is empty</b>Tap "+ Parlay" on any prop or line to add legs.</div>`}</div>`;
  el.classList.add("on")}
function trackParlay(){if(SLIP.length<2)return;const C=slipCalc(SLIP),o=+document.getElementById("slipOdds").value||C.am,stake=+document.getElementById("slipStake").value||UNIT;
  if(o==null||!isFinite(o)){toast("Enter the parlay odds you got");return}
  const legs=SLIP.map(l=>({key:l.key,name:l.name,pick:l.pick,game:l.game,mkt:l.mkt,odds:l.odds,p:l.p,spec:l.spec,ev:l.ev,evid:l.evid,home:l.home,away:l.away,tm:l.tm,ath:l.ath,date:l.date,res:null}));
  BETS.unshift({id:Date.now(),type:"parlay",sgp:C.sgp,date:DATA_DATE,key:"x"+Date.now(),name:`${legs.length}-leg ${C.sgp?"same-game ":""}parlay`,pick:legs.map(l=>(l.key[0]==="l"?"":l.name.split(" ").pop()+" ")+l.pick).join(" + "),
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
  for(const b of P){for(const l of b.legs.filter(x=>!x.res&&x.spec)){let list;try{list=await sbFor(l.date)}catch(e){continue}
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
const F=Object.assign({type:"all",res:"all",when:"all"},LSg("sl_tfilt",{}));
function filter(list){const now=Date.now(),days={d7:7,d30:30}[F.when];return list.filter(b=>{const isP=b.type==="parlay",isLine=!isP&&b.key&&b.key[0]==="l";
  if(F.type==="straight"&&isP)return false;if(F.type==="parlay"&&!isP)return false;if(F.type==="props"&&(isP||isLine))return false;if(F.type==="lines"&&!isLine)return false;
  if(F.res==="W"&&b.res!=="W")return false;if(F.res==="L"&&b.res!=="L")return false;if(F.res==="open"&&b.res)return false;
  if(days&&now-new Date(b.date+"T12:00:00").getTime()>days*864e5)return false;return true})}
function filterBar(){const c=(k,v,l)=>`<button class="chip ${F[k]===v?"on":""}" data-tf="${k}|${v}">${l}</button>`;
  return`<div class="tfilt"><div class="chiprow">${c("type","all","All bets")}${c("type","straight","Straight")}${c("type","parlay","Parlays")}${c("type","props","Player props")}${c("type","lines","Game lines")}</div>
    <div class="chiprow">${c("res","all","Any result")}${c("res","open","Pending")}${c("res","W","Won")}${c("res","L","Lost")}<span class="tf-sp"></span>${c("when","d7","7 days")}${c("when","d30","30 days")}${c("when","all","All time")}<span class="tf-sport">NBA</span></div></div>`}
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
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span></span><span>W-L-P</span><span>Win %</span><span>Profit</span><span>ROI</span></div>${row("All bets",all)}${row("Straight",st)}${row("Parlays",pp)}</div>
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

window.TR2={_settle:settleParlay,_bucket:bucket,filter,filterBar,legsHTML,perfHTML,accHTML,inSlip,paintSlip,logPreds,gradePreds,gradeParlays};
setTimeout(()=>{paintSlip();
  /* add the performance and model-accuracy sections under the tracker */
  const r0=window.renderTrack;if(typeof r0==="function")window.renderTrack=function(){r0();const box=document.getElementById("trackBox");if(box&&BETS.length)box.insertAdjacentHTML("beforeend",perfHTML(filter(BETS)));if(box&&window.SLRecs)box.insertAdjacentHTML("beforeend",SLRecs.html());if(box)box.insertAdjacentHTML("beforeend",accHTML());if(box&&window.SLRecs)box.insertAdjacentHTML("beforeend",SLRecs.backtestHTML())}},0);
})();
