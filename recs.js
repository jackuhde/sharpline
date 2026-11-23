/* Sharpline's own record: every bet the Top List recommends at a DraftKings price is logged the first time it is shown,
   with the exact line, price, chance, EV, time and model version, and is never edited afterwards. If the line or price
   later changes and the bet is still recommended at the new number, that is logged as a separate recommendation.
   After the final it is graded from ESPN's box score, and closing-line value is measured against DraftKings' closing
   price for the same player and stat. Your own bets live in the tracker separately; these are the model's picks. */
(function(){
const KEY="sl_recs",LSg=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const h=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const R=window.SLRank;
function athOf(name){const n=normN(name);return Object.keys(LIVE.ids||{}).find(k=>normN(LIVE.ids[k].name)===n)||null}
/* log what the Top List shows right now (model picks at DraftKings' price only; your own entered odds are not the model's record) */
function log(items){if(!items||!items.length||typeof DATA_DATE==="undefined")return;const L=LSg(KEY,[]),have=new Set(L.map(r=>r.k));let ch=0;
  items.forEach((c,rank)=>{if(c.src!=="live"||c.mine||!c.parts||c.book!=="DraftKings")return;const e=LIVE.ev[c.gi];if(!e||!e.id||(e.state&&e.state!=="pre"))return;
    const k=[DATA_DATE,e.id,normN(c.name),c.st,c.side,c.line,c.price].join("|");if(have.has(k))return;
    L.push({k,id:Date.now()+rank,d:DATA_DATE,ts:new Date().toISOString(),ver:(typeof PM_META!=="undefined"&&PM_META&&PM_META.updated)||"built-in",ev:e.id,home:e.home,away:e.away,
      name:c.name,ath:athOf(c.name),st:c.st,line:c.line,side:c.side,price:c.price,book:"DraftKings",p:+c.p.toFixed(4),pRaw:c.pRaw!=null?+c.pRaw.toFixed(4):null,
      evAt:+c.ev.toFixed(4),evLo:c.evLo!=null?+c.evLo.toFixed(4):null,grade:c.grade||null,conf:c.conf&&c.conf.lv||null,rank:rank+1,res:null});have.add(k);ch=1});
  if(ch)LSs(KEY,L)}
const CLOSE={};
async function closeFor(evId){if(CLOSE[evId])return CLOSE[evId];try{const r=await SharpLive.propBets(evId);CLOSE[evId]=r;return r}catch(e){return null}}
async function grade(){const L=LSg(KEY,[]),pend=L.filter(r=>!r.res);if(!pend.length)return 0;let n=0;
  const days=[...new Set(pend.map(r=>r.d))];
  for(const d of days){let list;try{list=await sbFor(d)}catch(e){continue}
    for(const ev of list.filter(x=>x.completed||/POSTPONED|CANCEL/i.test(x.statusName||""))){const rs=pend.filter(r=>r.d===d&&r.ev===ev.id);if(!rs.length)continue;
      let bx=null;try{bx=BOX_CACHE[ev.id]||(BOX_CACHE[ev.id]=await SharpLive.box(ev.id))}catch(e){continue}
      const cl=await closeFor(ev.id);
      rs.forEach(r=>{const g=SharpLive.grade({kind:"prop",player:r.name,stat:r.st,line:r.line,side:r.side},ev,bx);if(!g)return;r.res=g.res;r.detail=g.detail;r.gat=Date.now();n++;
        /* closing-line value: the closing no-vig chance for this side at this line, and the EV the taken price had against it */
        const m=cl&&r.ath&&cl.find(x=>x.ath===r.ath&&x.st===r.st&&x.o!=null&&x.u!=null);
        if(m){const pO=R.devig(m.o,m.u)[0],pOat=R.overAt(r.st,m.l,pO,r.line),pS=r.side==="o"?pOat:1-pOat;r.close={l:m.l,o:m.o,u:m.u,p:+pS.toFixed(4)};r.clv=+(pS*R.dec(r.price)-1).toFixed(4)}})}}
  if(n)LSs(KEY,L);return n}
function agg(list){const s={n:0,W:0,L:0,P:0,V:0,u:0,expW:0,evSum:0,clvN:0,clv:0,beat:0};
  list.forEach(r=>{if(!r.res)return;s.n++;s[r.res]++;if(r.res==="W")s.u+=R.dec(r.price)-1;else if(r.res==="L")s.u-=1;
    if(r.res==="W"||r.res==="L"){s.expW+=r.p;s.evSum+=r.evAt}if(r.clv!=null){s.clvN++;s.clv+=r.clv;if(r.clv>0)s.beat++}});
  const dec2=s.W+s.L;s.wr=dec2?s.W/dec2:null;s.roi=dec2?s.u/dec2:null;s.expRoi=dec2?s.evSum/dec2:null;s.avgClv=s.clvN?s.clv/s.clvN:null;return s}
const pc=x=>x==null?"–":(x>=0?"+":"")+(x*100).toFixed(1)+"%",pp=x=>x==null?"–":(x*100).toFixed(1)+"%";
function row(l,s){return`<div class="tr rc6"><span>${h(l)}</span><span>${s.W}-${s.L}${s.P?"-"+s.P:""}${s.V?` (${s.V}v)`:""}</span><span>${pp(s.wr)}</span><span>${s.n?(s.u>=0?"+":"")+s.u.toFixed(2):"–"}</span><span>${pc(s.roi)}</span><span>${pc(s.avgClv)}</span></div>`}
function html(){const L=LSg(KEY,[]);const head=`<div class="eyebrow tk-h">Sharpline's Top List record</div><div class="tsum"><div class="hint" style="margin:0 0 8px">Every Top List pick at a DraftKings price, logged the moment it was shown and never edited: the exact line, price, chance and EV, the time and the model version. Graded from ESPN box scores. Units are 1 unit flat per pick. Closing-line value (CLV) is the EV the logged price had against DraftKings' closing no-vig price; beating the close consistently is the strongest early sign of real skill. NBA only. These are the model's picks, not your bets.</div>`;
  if(!L.length)return head+`<div class="hint">Nothing logged yet. Picks are recorded when the Top List shows them.</div></div>`;
  const exp=`<div class="addall" style="justify-content:center;margin-top:12px"><button class="addbtn" data-recexport="1">Export this record (JSON)</button></div>`;
  const g=L.filter(r=>r.res),A=agg(L),open=L.length-g.length;
  const by=(f,lbls)=>{const m={};g.forEach(r=>{const k=f(r);if(k!=null)(m[k]=m[k]||[]).push(r)});return(lbls||Object.keys(m)).filter(k=>m[k]).map(k=>row(k,agg(m[k]))).join("")};
  const pb=r=>r.p<.52?"Under 52%":r.p<.55?"52 to 55%":r.p<.58?"55 to 58%":"58% and up",eb=r=>r.evAt<.03?"2 to 3%":r.evAt<.05?"3 to 5%":r.evAt<.08?"5 to 8%":"8% and up";
  const th=`<div class="tr th rc6"><span></span><span>W-L-P</span><span>Win %</span><span>Units</span><span>ROI</span><span>CLV</span></div>`;
  const recent=L.slice().reverse().slice(0,12);
  return head+`<div class="stats"><div class="st"><div class="k">Record</div><div class="v">${A.W}-${A.L}${A.P?"-"+A.P:""}</div></div><div class="st"><div class="k">Units</div><div class="v" style="color:${A.u>0?"var(--over)":A.u<0?"var(--under)":""}">${A.n?(A.u>=0?"+":"")+A.u.toFixed(2):"–"}</div></div><div class="st"><div class="k">ROI</div><div class="v">${pc(A.roi)}</div></div></div>
    <div class="stats"><div class="st"><div class="k">Expected ROI</div><div class="v">${pc(A.expRoi)}</div></div><div class="st"><div class="k">Avg CLV</div><div class="v">${pc(A.avgClv)}</div></div><div class="st"><div class="k">Beat the close</div><div class="v">${A.clvN?Math.round(A.beat/A.clvN*100)+"%":"–"}</div></div></div>
    <div class="hint" style="margin-top:8px">${g.length} graded${open?`, ${open} waiting`:""}. Wins expected from the logged chances: ${A.expW.toFixed(1)}, actual: ${A.W}. ${g.length<100?`<b style="color:var(--gold)">Under 100 graded picks: too few to judge the model. Watch CLV first.</b>`:""}</div>
    ${g.length?`<div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>By stat</span>")}${by(r=>STAT_LBL[r.st]||r.st)}</div>
    <div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>Sharpline's chance</span>")}${by(pb,["Under 52%","52 to 55%","55 to 58%","58% and up"])}</div>
    <div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>Grade when shown</span>")}${by(r=>r.grade?"Grade "+r.grade:"Before grades were logged",["Grade S","Grade A","Grade B","Before grades were logged"])}</div>
    <div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>Side</span>")}${by(r=>r.side==="o"?"Over":"Under",["Over","Under"])}</div>
    <div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>EV when logged</span>")}${by(eb,["2 to 3%","3 to 5%","5 to 8%","8% and up"])}</div>
    <div class="list tk-t" style="margin-top:10px">${th.replace("<span></span>","<span>Side</span>")}${by(r=>r.side==="o"?"Over":"Under",["Over","Under"])}</div>`:""}
    <div class="eyebrow" style="margin:14px 0 6px">Latest logged picks</div><div class="list">${recent.map(r=>`<div class="tb${r.res?" done":""}"><div class="nm">${h(r.name)} · ${r.side==="o"?"Over":"Under"} ${r.line} ${h(STAT[r.st]||r.st)} ${r.res?`<span class="rc r-${r.res}">${{W:"Won",L:"Lost",P:"Push",V:"Void"}[r.res]}</span>`:""}</div>
      <div class="sub">${h(r.d)} · ${new Date(r.ts).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})} · DraftKings ${fmtAm(r.price)} · ${pp(r.p)} · EV ${pc(r.evAt)}${r.close?` · closed ${r.close.l} ${fmtAm(r.side==="o"?r.close.o:r.close.u)}, CLV ${pc(r.clv)}`:""} · model ${h(String(r.ver).slice(0,10))}</div></div>`).join("")}</div>${exp}</div>`}
/* how the model did on this season's games it wasn't fit on (from model.json, refit nightly) */
function backtestHTML(){const M=typeof PM_META!=="undefined"&&PM_META;if(!M||!M.calib)return"";const C=M.calib,b4=x=>x==null?"–":x.toFixed(4);
  const st=Object.entries(C.byStat).sort((a,b)=>b[1].n-a[1].n);
  return`<div class="eyebrow tk-h">Model backtest · out of sample</div><div class="tsum"><div class="hint" style="margin:0 0 8px">${M.lines} DraftKings lines from ${M.games} games (through ${h(M.through)}). Each half of the season is scored by a model fit only on the other half, at closing prices. Lower Brier score and log loss are better; DraftKings' own no-vig price is the benchmark to beat.</div>
    <div class="stats"><div class="st"><div class="k">Brier · model</div><div class="v">${b4(C.all.brier)}</div></div><div class="st"><div class="k">Brier · DraftKings</div><div class="v">${b4(C.all.brierMkt)}</div></div><div class="st"><div class="k">Log loss · model / DK</div><div class="v" style="font-size:14px">${b4(C.all.logloss)} / ${b4(C.all.loglossMkt)}</div></div></div>
    <div class="hint" style="margin-top:8px">${C.all.brier<C.all.brierMkt?"The model is very slightly more accurate than DraftKings' price overall; the difference is small, so most props have no real edge.":"The model is not more accurate than DraftKings' price overall, so most props have no real edge."}</div>
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>Chance on its side</span><span>Bets</span><span>Predicted</span><span>Won</span><span>Gap</span></div>${C.bins.map(x=>`<div class="tr"><span>${Math.round(x.lo*100)} to ${x.hi>=1?"100":Math.round(x.hi*100)}%</span><span>${x.n}</span><span>${pp(x.pred)}</span><span>${pp(x.act)}</span><span>${pc(x.act-x.pred)}</span></div>`).join("")}</div>
    <div class="hint" style="margin-top:6px">Before the per-stat adjustment, the side the model picks wins 1 to 2 points less often than it says. That is why the Top List only counts the share of each stat's edge that held up.</div>
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>Raw EV band</span><span>Bets</span><span>Expected</span><span>Realized</span><span>±</span></div>${C.evBands.map(x=>`<div class="tr"><span>${x.lo<0?"Below 0":`${Math.round(x.lo*100)} to ${x.hi>=1?"+":Math.round(x.hi*100)+"%"}`}</span><span>${x.n}</span><span>${pc(x.expRoi)}</span><span>${pc(x.roi)}</span><span>${(100/Math.sqrt(x.n)).toFixed(1)}</span></div>`).join("")}</div>
    <div class="list tk-t tk5" style="margin-top:10px"><div class="tr th"><span>By stat</span><span>Lines</span><span>Brier</span><span>DK Brier</span><span>Edge counted</span></div>${st.map(([k,x])=>`<div class="tr"><span>${h(STAT_LBL[k]||k)}</span><span>${x.n}</span><span>${b4(x.brier)}</span><span>${b4(x.brierMkt)}</span><span>${M.catK&&M.catK[k]!=null?Math.round(M.catK[k]*100)+"%":"–"}</span></div>`).join("")}</div>
    <div class="hint" style="margin-top:6px">One month of games. Categories under a few hundred lines (steals, blocks) are too small to trust. NBA only; Sharpline has no other sport.</div></div>`}
/* export: the full logged record as JSON, for review outside the app (scripts/props-model/review.mjs can read it) */
function exportRecs(){const L=LSg(KEY,[]);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({exported:new Date().toISOString(),recs:L},null,1)],{type:"application/json"}));a.download="sharpline-record.json";a.click()}
document.addEventListener("click",e=>{if(e.target.closest("[data-recexport]"))exportRecs()});
window.SLRecs={log,grade,html,agg,backtestHTML,exportRecs,_all:()=>LSg(KEY,[])};
})();
