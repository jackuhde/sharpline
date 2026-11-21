/* Sharpline game model on the Lines tabs (NBA and NFL). Team ratings come from data/<sport>/gamemodel.json, built daily
   from earlier games only (scripts/game-model.mjs). Every market shows the model's projected score, its chances and how
   its walk-forward backtest went against DraftKings' closing line. A market only gives picks when that backtest passed;
   otherwise the numbers are shown for reference and labeled as having no edge. */
(function(){
const M={},busy={};const ALIAS={GSW:"GS",NOP:"NO",NYK:"NY",SAS:"SA",UTA:"UTAH",WAS:"WSH"};
function load(sp){if(M[sp]||busy[sp])return;busy[sp]=1;fetch(`data/${sp}/gamemodel.json?v=${Math.floor(Date.now()/36e5)}`).then(r=>r.ok?r.json():null).then(j=>{M[sp]=j||{};if(j&&window.GameModel.onload)window.GameModel.onload(sp)}).catch(()=>{M[sp]={}})}
const Phi=x=>{const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p};
function project(sp,home,away){load(sp);const m=M[sp];if(!m||!m.R)return null;const a=x=>ALIAS[x]||x;const H=m.R[a(home)],A=m.R[a(away)];if(!H||!A)return null;
  const hs=m.avg+m.hfa/2+H[0]-A[1],as=m.avg-m.hfa/2+A[0]-H[1];return{hs,as,m:hs-as,t:hs+as,M:m}}
const r1=v=>Math.round(v*10)/10,pc=p=>Math.round(p*100)+"%";
/* sp: home spread (negative = home favored), tot: total */
function html(sp,home,away,spH,tot){const P=project(sp,home,away);if(!P)return M[sp]?"":`<div class="gm-box dim">Loading Sharpline's game model…</div>`;
  const m=P.M,mk=m.markets||{},fav=P.m>=0?home:away,by=Math.abs(P.m);
  const cov=spH!=null?Phi((P.m+spH)/m.sdM):null,ovr=tot!=null?1-Phi((tot-P.t)/m.sdT):null,win=Phi(P.m/m.sdM);
  const shrink=(p,k)=>p==null?null:.5+(k||0)*(p-.5);
  const row=(lbl,txt,mkk)=>{const t=mk[mkk]||{};return`<div class="gm-r"><b>${lbl}</b><span>${txt}</span><em class="${t.trusted?"ok":"no"}">${t.trusted?"backtested edge":"model alone · no tested edge"}</em></div>`};
  const lean=(p,a,b)=>p==null?"–":p>=.5?`${a} ${pc(p)}`:`${b} ${pc(1-p)}`;
  return`<div class="gm-box"><div class="gm-h">Sharpline game model <span>${h(away)} ${r1(P.as)} · ${h(home)} ${r1(P.hs)}</span></div>
    ${row("Winner",`${h(fav)} ${pc(Math.max(win,1-win))} (by ${r1(by)})`,"ml")}
    ${spH!=null?row("Spread",`${lean(cov,h(home)+" "+(spH>0?"+":"")+spH,h(away)+" "+(spH<0?"+":"")+(-spH))}`,"spread"):""}
    ${tot!=null?row("Total",lean(ovr,"Over "+tot,"Under "+tot)+` (projects ${r1(P.t)})`,"total"):""}
    <details class="gm-d"><summary>How it's built and how it tested</summary><p>Each team's offense and defense rating comes from this season's scores, fitted only on games before the one predicted. Tested on every game from early in the season on: ${Object.entries(mk).filter(([k])=>k!=="ml").map(([k,v])=>`<b>${k}</b>: ${h(v.note)}`).join("; ")}. DraftKings' closing line has been the better predictor so far, so these numbers are for reference and don't reach the Top List. If a later backtest passes, they will.</p></details></div>`}
const h=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
window.GameModel={load,project,html,onload:sp=>{try{if(sp==="nfl"&&window.NFL)NFL.paint();if(sp==="nba"&&typeof renderLines==="function")renderLines()}catch(e){}}};
})();
