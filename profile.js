/* Sharpline player profiles.
   Opens over the current screen (the list underneath is never re-rendered or scrolled), so going back keeps
   filters, sort and place. Data: tonight's props and projections from the board, DraftKings live prices, ESPN game logs.
   Actual results and model numbers are labeled separately everywhere. */
(function(){
const ESPN_AB={NY:"NYK",SA:"SAS",GS:"GSW",NO:"NOP",UTAH:"UTA",WSH:"WAS"};
const ab2=a=>ESPN_AB[a]||a;
const PF={open:false,name:"",tm:"",gi:-1,id:null,key:null,st:"Points",range:10,view:"l10",logN:10,anim:true};
const ROWS={};/* athlete id -> {cur:[], prev:[], ts, err} */
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const r1=v=>v==null||isNaN(v)?"–":(Math.round(v*10)/10).toFixed(1);
const DD_K=["pts","reb","ast","stl","blk"];
function valOf(r,st){if(st==="Double Double"||st==="Triple Double")return DD_K.filter(k=>(r[k]||0)>=10).length;
  const c=STAT_COMP[st];if(!c)return null;if(c.some(k=>r[k]==null))return null;return c.reduce((a,k)=>a+r[k],0)}
const lineFor=(st,L)=>st==="Double Double"?1.5:st==="Triple Double"?2.5:L;
function athIdOf(name){const n=normN(name);return Object.keys(LIVE.ids||{}).find(k=>normN(LIVE.ids[k].name)===n)||null}
function seasonYear(){const d=new Date((DATA_DATE||new Date().toISOString().slice(0,10))+"T12:00:00");return d.getMonth()>=8?d.getFullYear()+1:d.getFullYear()}
window.pfAttr=o=>`data-prof="${esc(new URLSearchParams(Object.entries(o).filter(([,v])=>v!=null&&v!=="")).toString())}"`;
window.pfKeyAttr=key=>{if(!key)return"";const k=key[0];if(k==="p"&&PROPS[+key.slice(1)])return pfAttr({k:key});if(k==="c"){const C=custOf(+key.slice(1));if(C)return pfAttr({n:C.p,t:C.tm,s:C.st})}return""};

/* ---------- open / close ---------- */
window.openProfile=function(o){if(o.sp==="nfl"&&window.NFL){if(o.a)return NFL.openProfileId(o.a);const id=NFL.N.stats&&Object.keys(NFL.N.stats.ath).find(k=>normN(NFL.N.stats.ath[k][0])===normN(o.n||""));if(id)return NFL.openProfileId(id);if(window.toast)toast("NFL data is still loading; open the NFL tab and try again");return}
  let name=o.n,tm=o.t,st=o.s,key=o.k||null,gi=-1;
  if(key&&key[0]==="p"){const x=PROPS[+key.slice(1)];if(x){name=x.p;tm=x.tm;st=x.st;gi=x.g}else key=null}
  if(!name)return;const id=o.a||athIdOf(name);
  if(!tm&&id&&LIVE.ids[id]){const T=LIVE.ids[id].tm;Object.keys(LIVE.ev).forEach(g=>{const e=LIVE.ev[g];if(e.homeId===T)tm=SNAP[g].home;if(e.awayId===T)tm=SNAP[g].away})}
  if(gi<0&&tm)gi=SNAP.findIndex(G=>G.home===tm||G.away===tm);
  if(!key&&gi>=0){const i=PROPS.findIndex(x=>x.g===gi&&normN(x.p)===normN(name)&&x.st===(st||"Points"));if(i>=0)key="p"+i}
  Object.assign(PF,{open:true,name,tm:tm||"",gi,id,key,st:st||"Points",range:10,view:"l10",logN:10,anim:true,altL:null,dvpRole:null});if(window.SLF)SLF.seen(name,tm);
  const el=document.getElementById("prof");el.classList.add("on");el.scrollTop=0;document.body.classList.add("pf-lock");
  if(!(history.state&&history.state.sl==="prof"))history.pushState({sl:"prof"},"");
  renderProfile();loadRows()};
function hideProfile(){PF.open=false;const el=document.getElementById("prof");el.classList.add("out");if(!document.getElementById("lg").classList.contains("on"))document.body.classList.remove("pf-lock");
  setTimeout(()=>{el.classList.remove("on","out");el.innerHTML=""},260)}
window.closeProfile=()=>{if(history.state&&history.state.sl==="prof")history.back();else hideProfile()};
window.addEventListener("popstate",()=>{if(PF.open)hideProfile()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&PF.open)closeProfile()});

async function loadRows(){const id=PF.id;if(!id){renderProfile();return}const c=ROWS[id];
  if(c&&(c.cur||c.err)&&Date.now()-c.ts<30*60000)return;ROWS[id]={ts:Date.now(),loading:true};
  const y=seasonYear();
  const [cur,prev]=await Promise.all([SharpLive.gamelogRows(id).catch(()=>null),SharpLive.gamelogRows(id,y-1).catch(()=>[])]);
  ROWS[id]={cur,prev:prev||[],ts:Date.now(),err:cur==null};if(PF.open&&PF.id===id){PF.anim=true;renderProfile()}}

/* ---------- pieces ---------- */
function marketsOf(){if(PF.gi<0)return[];return PROPS.map((x,i)=>({x,i})).filter(o=>o.x.g===PF.gi&&normN(o.x.p)===normN(PF.name)).sort((a,b)=>statRank(a.x.st)-statRank(b.x.st))}
function oppAb(){const e=LIVE.ev[PF.gi],G=SNAP[PF.gi];if(!G)return"";const home=G.home===PF.tm;
  if(e)return home?e.awayAb:e.homeAb;return team(home?G.away:G.home)[0]}
function bestAt(x,l,side){const liveAt=x.q.some(q=>q.live&&q.l===l&&(side==="o"?q.o:q.u)!=null);
  const ps=x.q.filter(q=>q.l===l&&(!liveAt||q.live)).map(q=>({o:side==="o"?q.o:q.u,src:q.src})).filter(v=>v.o!=null);
  return ps.reduce((b,v)=>!b||dec(v.o)>dec(b.o)?v:b,null)}
function statusHTML(){const n=normN(PF.name),j=(LIVE.inj||{})[n];let h="";
  if(j&&nick(j.team)===nick(PF.tm)){const lv=j.level==="dtd"&&j.ret&&j.ret>DATA_DATE?"doubt":j.level,lbl={out:"Out",doubt:"Doubtful",quest:"Questionable",dtd:"Day-to-day"}[lv];
    h=`<span class="pf-chip inj-${lv}">${lbl}</span><span class="pf-note">${esc(j.note||j.status)}${j.date?` · ${esc(j.src)}, ${new Date(j.date).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`:""}</span>`}
  else if(OUT.has(n))h=`<span class="pf-chip inj-out">Out</span><span class="pf-note">Ruled out tonight (morning research)</span>`;
  else h=`<span class="pf-chip ok">No injury listed</span><span class="pf-note">ESPN injury report${LIVE.injTs?`, checked ${ago(LIVE.injTs)}`:""}</span>`;
  const e=LIVE.ev[PF.gi];if(e&&e.state==="in")h+=`<span class="pf-chip live">Live · ${esc(e.detail)}</span>`;else if(e&&e.state==="post")h+=`<span class="pf-chip">Final</span>`;
  return h}

function propPanel(){const ms=marketsOf();if(!PF.key)return ms.length?"":`<div class="pf-empty">No ${PF.gi<0?"game tonight":"prop posted yet"} for ${esc(PF.name.split(" ").pop())}${PF.gi<0?"":". DraftKings usually posts props by early afternoon"}. Stats below are his actual results.</div>`;
  const i=+PF.key.slice(1),x=PROPS[i],g=SUG[i];if(!x)return"";const yn=YN[x.st],pt=g.pt;
  const pO=g.s==="o"?g.p:1-g.p,bo=bestAt(x,g.l,"o"),bu=yn?null:bestAt(x,g.l,"u");
  const evO=bo?evOf(pO,bo.o):null,evU=bu?evOf(1-pO,bu.o):null,f=freshOf(PF.key),lv=x.q.find(q=>q.live);
  const side=(lbl,p,b,ev,on)=>`<div class="pf-side ${on?"on":""}"><div class="k">${lbl}</div><div class="v">${b?fmtAm(b.o):"–"}</div><div class="s">${b?esc(b.src.replace(" (live)","")):"no price"}</div>
    <div class="pf-prob"><i style="width:${Math.round(p*100)}%"></i></div><div class="s2"><b>${pct(p)}</b> model${ev!=null?` · <span class="${ev>=0?"pos":"neg"}">${ev>=0?"+":""}${(ev*100).toFixed(1)}% EV</span>`:""}</div></div>`;
  const projTxt=yn?(pt&&pt.mPlayer!=null?`${Math.round(pt.mPlayer*100)}% of his games`:"–"):(g.proj!=null?g.proj:"–");
  const stale=f.lv==="stale"||f.lv==="aging"?`<div class="pf-warn">${f.lv==="stale"?"This price is old.":"Check this price."} It was last confirmed ${f.txt.replace(/^.*from /,"at ")}. Confirm at your book before betting.</div>`:f.lv==="started"?`<div class="pf-warn">The game has started. These are pregame numbers.</div>`:"";
  const grade=gradeNow(PF.key),cf=g.bp!=null?baseConf(PF.key,(g.s==="o"?"Over ":"Under ")+g.l,g.p,g.bp,g.l):null;
  return`<section class="pf-card pf-prop pf-swap">
    <div class="pf-ph"><div><div class="eyebrow">Selected prop</div><h3>${STAT_LBL[x.st]||x.st} ${yn?"":`<span class="ln">${g.l}</span>`}</h3></div><div class="pf-gr">${gradeTag(grade,"md")}${cf?confTag(cf):""}</div></div>
    <div class="pf-sides">${side(yn?"Yes":"Over "+g.l,pO,bo,evO,g.s==="o")}${yn?`<div class="pf-side"><div class="k">No</div><div class="v">–</div><div class="s">DraftKings posts Yes only</div><div class="pf-prob"><i style="width:${Math.round((1-pO)*100)}%"></i></div><div class="s2"><b>${pct(1-pO)}</b> model</div></div>`:side("Under "+g.l,1-pO,bu,evU,g.s==="u")}</div>
    <div class="pf-model"><div><div class="k">Projection <em>model</em></div><div class="v">${projTxt}</div></div><div><div class="k">Lean</div><div class="v ${g.s==="o"?"o":"u"}">${yn?(g.s==="o"?"Yes":"No"):(g.s==="o"?"Over":"Under")}</div></div><div><div class="k">Fair price</div><div class="v">${fmtAm(toAm(g.p))}</div></div></div>
    <div class="pf-why">${esc(g.why)}</div>
    <div class="pf-fresh">${freshTag(f)}${lv&&lv.note?`<span>DraftKings ${esc(lv.note.replace(/^opened/,"line opened at").replace(/^Over opened/,"Over opened at"))}</span>`:""}${LIVE.propsTs?`<span>Prices checked ${ago(LIVE.propsTs)}</span>`:""}</div>
    ${x.q.length>1?`<details class="pf-books"><summary>All posted lines (${x.q.length})</summary>${x.q.map(q=>`<div class="qrow"><span><b>${yn?"Yes":q.l}</b> · ${[q.o!=null?(yn?"":"Over ")+fmtAm(q.o):"",q.u!=null?"Under "+fmtAm(q.u):"",q.oc!=null?"Over "+q.oc+"¢":"",q.uc!=null?"Under "+q.uc+"¢":""].filter(Boolean).join(" / ")||"line only"}</span><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.src)}</a></div>`).join("")}</details>`:""}
    ${stale}<div class="pf-act">${addBtn(PF.key)}</div></section>`}

/* DraftKings alternate lines ("25+ points" milestones). These are one-sided Over prices, so there is no
   no-vig fair price or EV for them; the panel shows the price, its implied chance and his actual hit rate. */
function altsHTML(){if(PF.gi<0||!PF.id||YN[PF.st])return"";const P=LIVE.props&&LIVE.props[PF.gi];
  const alts=(P&&P.alts||[]).filter(a=>a.ath===PF.id&&a.st===PF.st&&a.o!=null).sort((a,b)=>a.l-b.l);if(!alts.length)return"";
  const R=ROWS[PF.id],last=R&&R.cur?R.cur.slice(0,10):[],imp=o=>o<0?-o/(-o+100):100/(o+100);
  const hit=l=>{const v=last.map(r=>valOf(r,PF.st)).filter(x=>x!=null);return v.length?`${v.filter(x=>x>l).length}/${v.length} last ${v.length}`:""};
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">DraftKings alternate lines</div><h3>Over only<span class="pf-sub"> · tap one to chart his games against it</span></h3></div></div>
    <div class="pf-alt">${alts.map(a=>`<button class="${PF.altL===a.l?"on":""}" data-pfalt="${a.l}"><span>Over <b>${a.l}</b> <small>(${a.l+.5}+)</small></span><span><b>${fmtAm(a.o)}</b> <small>implied ${Math.round(imp(a.o)*100)}%${hit(a.l)?" · hit "+hit(a.l):""}</small></span></button>`).join("")}</div>
    <div class="pf-sub2">One-sided prices, so Sharpline can't strip the vig or show EV on these. Hit rates are his actual results.</div></section>`}

/* Opponent vs position: what tonight's opponent allows per 36 minutes to players at his position, split into starters and
   bench (ESPN box scores, built nightly into dvp.json by scripts/build-dvp.mjs). A backup is compared with bench players.
   Context only: it is not added to the projection, which has no validated matchup term. */
let DVP=null,DVPload=null;
function loadDVP(){if(DVP||DVPload)return;DVPload=fetch("dvp.json?t="+Math.floor(Date.now()/36e5),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>{DVP=j||{};if(PF.open)renderProfile(true)}).catch(()=>{DVP={}})}
const posOfAbbr=raw=>{raw=String(raw||"").toUpperCase();return raw==="C"?"C":/^(G|PG|SG)$/.test(raw)?"G":/^(F|SF|PF)$/.test(raw)?"F":raw.includes("C")?"C":raw.includes("G")?"G":raw.includes("F")?"F":null};
function matchupHTML(){loadDVP();if(PF.gi<0)return"";const G=SNAP[PF.gi];if(!G)return"";const opp=G.home===PF.tm?G.away:G.home;
  const card=(h,body)=>`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Opponent vs position</div><h3>${h}</h3></div></div><div class="pf-empty">${body}</div></section>`;
  if(!DVP)return`<section class="pf-card pf-load"><i></i><i></i><i></i><span>Loading matchup data…</span></section>`;
  if(!(DVP.v>=3))return card("Rebuilding","Matchup stats are being rebuilt with per-minute and bench numbers. Check back in a few minutes.");
  const rr=DVP.roles&&PF.id?DVP.roles[PF.id]:null;
  const who=PF.id&&LIVE.ids[PF.id]||{},pos=(rr&&rr[4])||posOfAbbr(who.pos);
  const auto=rr&&rr[3]?(rr[2]/rr[3]>=.6?"S":"B"):"S",role=PF.dvpRole||auto;
  const T=DVP.teams&&(DVP.teams[opp]||Object.entries(DVP.teams).filter(([k])=>k.split(" ").pop()===opp.split(" ").pop()).map(([,v])=>v)[0]);
  if(!pos||!T)return card("Not available yet",!pos?"ESPN doesn't list a position for him.":"Matchup stats haven't been built for this opponent yet.");
  const posW={G:"guards",F:"forwards",C:"centers"}[pos],roleW=role==="S"?"starting":"bench";
  const D=T[role][pos],L=DVP.league[role][pos],rows=[["pts","Points"],["reb","Rebounds"],["ast","Assists"],["tpm","3-pointers"],["stl","Steals"],["blk","Blocks"]];
  const hot=STAT_COMP[PF.st]||[],ord=n=>n==null?"–":n+(["th","st","nd","rd"][(n%100-20)%10]||["th","st","nd","rd"][n%100]||"th");
  const tone=r=>r==null?"":r<=8?"fav":r>=23?"unf":"";
  const why=rr&&rr[3]?`He started ${rr[2]} of his last ${rr[3]} game${rr[3]>1?"s":""} (${rr[1]} of ${rr[0]} this season), so ${auto==="S"?"he is compared with starters":"he is compared with bench players"} by default.`:"No starts on record for him yet, so starters are shown.";
  const thin=D.s.min<300?` Only ${D.s.min} minutes from ${D.s.n} player-games behind this group, so treat it as a rough signal.`:"";
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Opponent vs position</div><h3>${esc(opp.split(" ").pop())} vs ${roleW} ${posW}<span class="pf-sub"> · ${T.gp} games this season</span></h3></div>
    <div class="seg">${[["S","Starters"],["B","Bench"]].map(([v,l])=>`<button class="${role===v?"on":""}" data-pfdvp="${v}">${l}${auto===v&&rr?" •":""}</button>`).join("")}</div></div>
    <div class="pf-tw"><table class="pf-log pf-dvp"><thead><tr><th>Allowed per 36 min</th><th>Season</th><th>Rank</th><th>Last ${T.l10gp}</th><th>Rank</th><th>League avg</th></tr></thead><tbody>
    ${rows.map(([k,l])=>`<tr class="${hot.includes(k)?"hot":""}"><td>${l}</td><td><b>${D.s[k]??"–"}</b></td><td class="${tone(D.sr[k])}">${ord(D.sr[k])}</td><td>${D.l10[k]??"–"}</td><td class="${tone(D.l10r[k])}">${ord(D.l10r[k])}</td><td>${L[k]??"–"}</td></tr>`).join("")}</tbody></table></div>
    <div class="pf-sub2">${why} Rates are per 36 minutes played by the opposing ${roleW} ${posW}, so a team starting three guards doesn't inflate the guard numbers.${role==="B"?` Bench counts players who came off the bench and played ${DVP.benchMin||10}+ minutes.`:""} ${roleW[0].toUpperCase()+roleW.slice(1)} ${posW} averaged ${D.s.mpg} minutes against them.${thin} Rank 1st means the defense allows the most (friendliest matchup), 30th the least. ESPN labels players only guard, forward or center. Box scores through ${esc(DVP.through)}. Context only; it isn't added to Sharpline's projection.</div></section>`}
function chartHTML(rows){const st=PF.st,yn=YN[st];const opp=oppAb();
  let list=PF.range==="opp"?rows.all.filter(r=>r.opp===opp):rows.cur.slice(0,PF.range);
  list=list.filter(r=>valOf(r,st)!=null).slice(0,20).reverse();
  const g=PF.key?SUG[+PF.key.slice(1)]:null,L=lineFor(st,PF.altL!=null?PF.altL:g?g.l:null);
  const tabs=[[5,"L5"],[10,"L10"],[20,"L20"],["opp","vs "+ab2(opp)]].filter(t=>t[0]!=="opp"||opp);
  const head=`<div class="pf-ch"><div><div class="eyebrow">Actual results</div><h3>${yn?st.toLowerCase().replace(/^./,c=>c.toUpperCase())+" history":(STAT_LBL[st]||st)+" by game"}</h3></div>
    <div class="seg">${tabs.map(([v,l])=>`<button class="${PF.range===v?"on":""}" data-pfr="${v}">${l}</button>`).join("")}</div></div>`;
  if(!list.length)return`<section class="pf-card">${head}<div class="pf-empty">${PF.range==="opp"?`No games against ${ab2(opp)} this season or last.`:"No games yet."}</div></section>`;
  const vals=list.map(r=>valOf(r,st)),max=Math.max(...vals,L||0,1)*1.12,W=340,H=170,pad=22,bw=Math.min(28,(W-8)/list.length-6),gap=(W-8-bw*list.length)/Math.max(1,list.length);
  const y=v=>H-pad-(v/max)*(H-pad-14);
  let hit=0;const bars=list.map((r,j)=>{const v=vals[j],x0=4+gap/2+j*(bw+gap),ov=L!=null&&v>L,un=L!=null&&v<L;if(ov)hit++;
    const cls=L==null?"n":ov?"o":un?"u":"p",h=Math.max(2,H-pad-y(v));
    return`<g class="bar ${cls}" style="--d:${j*28}ms"><rect x="${x0}" y="${y(v)}" width="${bw}" height="${h}" rx="5"/>
      <text class="bv" x="${x0+bw/2}" y="${y(v)-5}">${yn?(v>=(st==="Double Double"?2:3)?"✓":"✗"):v}</text>
      <text class="bo" x="${x0+bw/2}" y="${H-7}">${PF.range==="opp"?new Date(r.t).toLocaleDateString([], {month:"numeric",year:"2-digit"}):(r.home?"":"@")+esc(ab2(r.opp))}</text>
      <title>${new Date(r.t).toLocaleDateString([], {month:"short",day:"numeric"})} ${r.home?"vs":"@"} ${esc(ab2(r.opp))}: ${v} ${(STAT[st]||st)}${r.res?`, ${r.res} ${r.score}`:""}</title></g>`}).join("");
  const lineSvg=L!=null?`<line class="ln" x1="0" x2="${W}" y1="${y(L)}" y2="${y(L)}"/>`:"";
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  const sum=L!=null?`<b class="${hit/list.length>=.5?"pos":"neg"}">${yn?"Yes":"Over"} in ${hit} of ${list.length}</b> (${Math.round(hit/list.length*100)}%)`:"";
  return`<section class="pf-card">${head}
    <svg class="pf-chart ${PF.anim?"anim":""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(STAT_LBL[st]||st)} in his last ${list.length} games">${lineSvg}${bars}</svg>
    <div class="pf-sum">${sum}${yn?"":`${sum?" · ":""}Average <b>${r1(avg)}</b>`}${PF.range==="opp"?` · ${list.length} game${list.length>1?"s":""}, this season and last`:""}${!yn&&L!=null?`<span class="pf-leg"><i class="o"></i>Over <i class="u"></i>Under <i class="l"></i>Line ${L}</span>`:""}</div></section>`}

function avgsHTML(rows){const opp=oppAb();const views=[["season","Season"],["l5","L5"],["l10","L10"],["l20","L20"],["home","Home"],["away","Away"],["opp","vs "+ab2(opp)]].filter(v=>v[0]!=="opp"||opp);
  const sel={season:rows.cur,l5:rows.cur.slice(0,5),l10:rows.cur.slice(0,10),l20:rows.cur.slice(0,20),home:rows.cur.filter(r=>r.home),away:rows.cur.filter(r=>!r.home),opp:rows.all.filter(r=>r.opp===opp)}[PF.view]||[];
  const A=k=>{const v=sel.map(r=>r[k]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
  const fg=sel.reduce((a,r)=>a+(r.fgm||0),0),fga=sel.reduce((a,r)=>a+(r.fga||0),0),tpa=sel.reduce((a,r)=>a+(r.tpa||0),0),tpm=sel.reduce((a,r)=>a+(r.tpm||0),0);
  const comp=STAT_COMP[PF.st]||[];const cards=[["PTS","pts"],["REB","reb"],["AST","ast"],["3PM","tpm"],["STL","stl"],["BLK","blk"],["TO","tov"],["MIN","min"],["PRA",null]];
  const card=([l,k])=>{const v=k?A(k):(A("pts")!=null?A("pts")+A("reb")+A("ast"):null),hot=k?comp.includes(k):PF.st==="Pts+Reb+Ast";return`<div class="pf-sc ${hot?"hot":""}"><div class="v">${r1(v)}</div><div class="k">${l}</div></div>`};
  const note=PF.view==="l20"&&rows.cur.length<20?` · only ${rows.cur.length} games this season`:PF.view==="opp"?" · this season and last":"";
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Actual averages</div><h3>${sel.length} game${sel.length===1?"":"s"}<span class="pf-sub">${note}</span></h3></div></div>
    <div class="seg wide">${views.map(([v,l])=>`<button class="${PF.view===v?"on":""}" data-pfv="${v}">${l}</button>`).join("")}</div>
    ${sel.length?`<div class="pf-grid">${cards.map(card).join("")}</div><div class="pf-sub2">FG ${fga?Math.round(fg/fga*100)+"%":"–"} · 3PT ${tpa?Math.round(tpm/tpa*100)+"%":"–"} (${r1(tpa/sel.length)} attempts a game)${PF.view==="season"&&rows.cur.length?` · ${rows.cur.filter(r=>DD_K.filter(k=>(r[k]||0)>=10).length>=2).length} double doubles`:""}</div>`:`<div class="pf-empty">No games in this view.</div>`}</section>`}

function logHTML(rows){const st=PF.st,yn=YN[st],g=PF.key?SUG[+PF.key.slice(1)]:null,L=lineFor(st,PF.altL!=null?PF.altL:g?g.l:null),combo=!["Points","Rebounds","Assists","3-Pointers","Steals","Blocks"].includes(st);
  const list=rows.cur.slice(0,PF.logN);if(!list.length)return"";
  const hi=k=>(STAT_COMP[st]||[]).length===1&&STAT_COMP[st][0]===k?"hot":"";
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Actual results</div><h3>Game log</h3></div></div>
    <div class="pf-tw"><table class="pf-log"><thead><tr><th>Date</th><th>Opp</th><th>Result</th><th>MIN</th><th class="${hi("pts")}">PTS</th><th class="${hi("reb")}">REB</th><th class="${hi("ast")}">AST</th><th class="${hi("tpm")}">3PM</th><th class="${hi("stl")}">STL</th><th class="${hi("blk")}">BLK</th><th>TO</th>${combo?`<th class="hot">${esc(STAT[st]||st)}</th>`:""}</tr></thead><tbody>
    ${list.map(r=>{const v=valOf(r,st),cls=L==null||v==null?"":v>L?"o":v<L?"u":"";
      return`<tr><td>${new Date(r.t).toLocaleDateString([], {month:"numeric",day:"numeric"})}</td><td>${r.home?"vs":"@"} ${esc(ab2(r.opp))}</td><td class="res ${r.res==="W"?"w":"l"}">${esc(r.res)} ${esc(r.score)}</td><td>${Math.round(r.min)}</td>
      <td class="${hi("pts")} ${hi("pts")?cls:""}">${r.pts??"–"}</td><td class="${hi("reb")} ${hi("reb")?cls:""}">${r.reb??"–"}</td><td class="${hi("ast")} ${hi("ast")?cls:""}">${r.ast??"–"}</td><td class="${hi("tpm")} ${hi("tpm")?cls:""}">${r.tpm??"–"}${r.tpa!=null?`<small>/${r.tpa}</small>`:""}</td><td class="${hi("stl")} ${hi("stl")?cls:""}">${r.stl??"–"}</td><td class="${hi("blk")} ${hi("blk")?cls:""}">${r.blk??"–"}</td><td>${r.tov??"–"}</td>
      ${combo?`<td class="hot ${cls}">${yn?(v>=(st==="Double Double"?2:3)?"Yes":"No"):v??"–"}</td>`:""}</tr>`}).join("")}</tbody></table></div>
    ${rows.cur.length>10?`<button class="pf-more" data-pflog="1">${PF.logN>10?"Show fewer":rows.cur.length>20?"Show last 20":"Show all "+rows.cur.length}</button>`:""}</section>`}

window.renderProfile=function(keep){const el=document.getElementById("prof");if(!PF.open||!el)return;const st0=el.scrollTop;
  const [ab,c1,c2]=team(PF.tm),G=SNAP[PF.gi],who=PF.id&&LIVE.ids[PF.id]||{},ms=marketsOf(),opp=oppAb();
  const home=G&&G.home===PF.tm;
  const mu=G?`${home?"vs":"@"} ${esc(home?G.away:G.home)}`:"No game on tonight's slate";
  const when=G?`${new Date(G.tip).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"})} · ${tipT(G)}`:"";
  const R=PF.id&&ROWS[PF.id];const rows=R&&R.cur?{cur:R.cur,all:R.cur.concat(R.prev||[])}:null;
  const chips=ms.length?`<div class="pf-mk">${ms.map(({x,i})=>{const g=SUG[i];return`<button class="${"p"+i===PF.key?"on":""}" data-pfk="p${i}"><span>${STAT_LBL[x.st]||x.st}</span><b>${YN[x.st]?"Yes":g.l}</b></button>`}).join("")}</div>`
    :`<div class="pf-mk">${["Points","Rebounds","Assists","3-Pointers","Pts+Reb+Ast"].map(s=>`<button class="${PF.st===s?"on":""}" data-pfs="${s}"><span>${STAT_LBL[s]}</span><b>stats</b></button>`).join("")}</div>`;
  el.innerHTML=`<div class="pf-in">
    <div class="pf-bar"><button class="pf-back" data-pfclose="1" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Back</button><span class="pf-tt">Player</span>${window.SLF?`<button class="pf-star ${SLF.isF(PF.name)?"on":""}" data-pffollow="1" aria-pressed="${SLF.isF(PF.name)}">${SLF.isF(PF.name)?"★ Following":"☆ Follow"}</button>`:""}</div>
    <header class="pf-hero" style="--c1:${c1};--c2:${c2}">
      <div class="pf-av">${avatar(PF.name,PF.tm,"pf-j")}</div>
      <div class="pf-id"><div class="eyebrow">${esc(ab)}${who.pos?" · "+esc(who.pos):""}${who.jersey?" · #"+esc(who.jersey):""}</div><h2>${esc(PF.name)}</h2>
        <div class="pf-mu">${mu}${when?`<span>${when}</span>`:""}</div></div>
    </header>
    <div class="pf-status">${statusHTML()}</div>
    ${chips}
    <div id="pfBody">${window.liveForPlayer&&liveForPlayer(PF.name)||""}${propPanel()}${altsHTML()}
    ${!PF.id?`<div class="pf-empty">Stats aren't available for this player right now. Profiles load stats for players on tonight's slate.</div>`
      :!R||R.loading?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading his game log from ESPN…</span></div>`
      :R.err?`<div class="pf-empty">Couldn't reach ESPN for his game log. Pull down to refresh, or try again in a minute.</div>`
      :chartHTML(rows)+avgsHTML(rows)+matchupHTML()+logHTML(rows)}
    <p class="pf-foot">Actual results come from ESPN box scores (regular season). Projections, chances and fair prices are Sharpline's model, not results.</p></div></div>`;
  if(keep)el.scrollTop=st0;
  if(PF.anim)requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=el.querySelector(".pf-chart");if(c)c.classList.add("go")}));PF.anim=false};

/* clicks inside the profile */
document.addEventListener("click",e=>{const pf=e.target.closest("[data-prof]");
  if(pf&&!e.target.closest("#prof")&&!e.target.closest("[data-track]")){e.preventDefault();e.stopImmediatePropagation();openProfile(Object.fromEntries(new URLSearchParams(pf.dataset.prof)));return}
  if(!e.target.closest("#prof"))return;const t=e.target.closest("button");if(!t)return;const d=t.dataset;
  if(d.pfclose){closeProfile();return}
  if(d.pffollow){const on=SLF.toggle(PF.name,PF.tm);renderProfile(true);if(window.toast)toast(on?`Following ${PF.name}. Injury changes for him will show on this phone.`:`Stopped following ${PF.name}`);return}
  if(d.pfdvp){PF.dvpRole=d.pfdvp;renderProfile(true);return}
  if(d.pfalt!=null){const v=+d.pfalt;PF.altL=PF.altL===v?null:v;PF.anim=true;renderProfile(true);return}
  if(d.pfk){PF.altL=null;PF.key=d.pfk;PF.st=PROPS[+d.pfk.slice(1)].st;PF.anim=true;renderProfile(true);return}
  if(d.pfs){PF.altL=null;PF.st=d.pfs;PF.anim=true;renderProfile(true);return}
  if(d.pfr){PF.range=d.pfr==="opp"?"opp":+d.pfr;PF.anim=true;renderProfile(true);return}
  if(d.pfv){PF.view=d.pfv;renderProfile(true);return}
  if(d.pflog){PF.logN=PF.logN>10?10:20;renderProfile(true);return}},true);
window.PF=PF;
})();
