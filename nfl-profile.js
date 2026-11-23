/* Sharpline NFL player profile. Same design language and layout as the NBA profile (profile.js), built on NFL data:
   - season box scores per game from data/nfl/stats.json (ESPN, rebuilt every 3 hours), defensive box scores from data/nfl/def.json
   - snap share, target share, air yards and QB pressure from nflverse (joined nightly in the same file)
   - this week's DraftKings lines (ESPN core feed: lines only, no prices), the injury report and the schedule, read live
   - projections, chances and grades from the NFL model and grading pipeline in nfl.js / nfl-model.js (nothing re-derived here)
   Actual results and model numbers are labeled separately, and every average shows how many games it covers. */
(function(){
const NP={open:false,id:null,st:null,key:null,range:"l10",view:"season",logN:10,anim:true};
const X=()=>window.NFL&&NFL._p;
let D=null;/* derived league tables, rebuilt when stats.json changes */
let DEF=null,DEFload=null;/* def.json, loaded on first defender profile */

/* ---------- small helpers ---------- */
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const f1=v=>v==null||!isFinite(v)?"–":(Math.round(v*10)/10).toFixed(1);
const f0=v=>v==null||!isFinite(v)?"–":String(Math.round(v));
const pct0=v=>v==null||!isFinite(v)?"–":Math.round(v*100)+"%";
const ord=n=>n==null?"–":n+(["th","st","nd","rd"][(n%100-20)%10]||["th","st","nd","rd"][n%100]||"th");
const fpts=v=>(v.pYds||0)/25+4*(v.pTD||0)-2*(v.int||0)+(v.rYds||0)/10+6*(v.rTD||0)+(v.rec||0)+(v.recYds||0)/10+6*(v.recTD||0)-2*(v.fumL||0);
function rating(cmp,att,yds,td,int){if(!att)return null;const c=x=>Math.max(0,Math.min(2.375,x));
  return(c((cmp/att-.3)*5)+c((yds/att-3)*.25)+c(td/att*20)+c(2.375-int/att*25))/6*100}
const isDef=pos=>/^(DE|DT|LB|S|CB|DB|NT|OLB|ILB|MLB|SS|FS)$/.test(pos||"");
const grpOf=raw=>{const p=X().M.grp(raw||"");return p==="X"&&isDef(raw)?"DEF":p};
const POSN={QB:"quarterbacks",RB:"running backs",WR:"wide receivers",TE:"tight ends",K:"kickers",DEF:"defenders"};

/* stat value for one game row; covers model stats, raw columns and a few derived ones */
function sv(st,v){const M=X().M;if(st==="td")return(v.rTD||0)+(v.recTD||0);if(st==="fpts")return Math.round(fpts(v)*10)/10;
  if(st==="ast")return Math.max(0,(v.tklT||0)-(v.tkl||0));if(st==="tklAst")return v.tklT||0;
  if(M.STATS[st]&&!M.STATS[st].yn)return M.STATS[st].f(v);return v[st]!=null?v[st]:null}
const STAT_NAME={pYds:"Passing yards",pTD:"Passing TDs",cmp:"Completions",att:"Pass attempts",int:"Interceptions",pRYds:"Pass + rush yards",rYds:"Rushing yards",car:"Rush attempts",rLng:"Longest rush",
  rec:"Receptions",recYds:"Receiving yards",recLng:"Longest reception",rRecYds:"Rush + rec yards",tgt:"Targets",td:"Touchdowns",fpts:"Fantasy points",kPts:"Kicking points",fgM:"Field goals",xpM:"Extra points",
  tkl:"Solo tackles",ast:"Tackle assists",tklAst:"Tackles + assists",sacks:"Sacks",pd:"Passes defended",dInt:"Interceptions"};
const STAT_CHIPS={QB:["pYds","pTD","cmp","att","int","rYds","fpts"],RB:["rYds","car","rec","recYds","rRecYds","td","fpts"],WR:["recYds","rec","tgt","recLng","td","fpts"],TE:["recYds","rec","tgt","recLng","td","fpts"],
  K:["kPts","fgM","xpM"],DEF:["tklAst","tkl","ast","sacks","pd"]};

/* ---------- derived league tables (one pass over the season file) ---------- */
function derive(){const {N,M}=X();const S=N.stats;if(D&&D.S===S)return D;
  const ci=Object.fromEntries(S.cols.map((c,i)=>[c,i+1])),gById={},vol={},allow={},teamG={};
  S.games.forEach(g=>{gById[g.id]=g;[g.h[0],g.a[0]].forEach(t=>(teamG[t]=teamG[t]||new Set()).add(g.id));
    for(const[id,r]of Object.entries(g.p)){const t=r[0],o=t===g.h[0]?g.a[0]:g.h[0],val=c=>r[ci[c]]||0;
      const V=((vol[t]=vol[t]||{})[g.id]=vol[t][g.id]||{att:0,sk:0,car:0,tgt:0,cmp:0,pYds:0,rYds:0});["att","sk","car","tgt","cmp","pYds","rYds"].forEach(c=>V[c]+=val(c));
      const pos=M.grp((S.ath[id]||[])[1]||"");if(pos==="X"||pos==="K")continue;
      const A=((allow[o]=allow[o]||{})[pos]=allow[o][pos]||{});["att","cmp","pYds","pTD","int","sk","car","rYds","rTD","tgt","rec","recYds","recTD"].forEach(c=>A[c]=(A[c]||0)+val(c))}});
  const gp=t=>teamG[t]?teamG[t].size:0;
  /* what each defense allows per game to a position group, plus efficiency rates; rank 1 = friendliest for that position */
  const MET={QB:[["pYds","Passing yards",1],["att","Pass attempts",1],["cmpP","Completion %",1,"pct"],["ypa","Yards per attempt",1],["pTD","Passing TDs",1],["int","Interceptions",-1],["sk","Sacks",-1]],
    RB:[["rYds","Rushing yards",1],["car","Carries",1],["ypc","Yards per carry",1],["rTD","Rushing TDs",1],["tgt","Targets",1],["rec","Receptions",1],["recYds","Receiving yards",1]],
    WR:[["tgt","Targets",1],["rec","Receptions",1],["recYds","Receiving yards",1],["ypt","Yards per target",1],["recTD","Receiving TDs",1]]};MET.TE=MET.WR;
  const valOf=(A,n,k)=>!A||!n?null:k==="cmpP"?(A.att?A.cmp/A.att:null):k==="ypa"?(A.att?A.pYds/A.att:null):k==="ypc"?(A.car?A.rYds/A.car:null):k==="ypt"?(A.tgt?A.recYds/A.tgt:null):(A[k]||0)/n;
  const tbl={};Object.entries(MET).forEach(([pos,ms])=>{const T={},lg={},lgN={n:0};
    Object.keys(teamG).forEach(t=>{const A=(allow[t]||{})[pos],n=gp(t);T[t]={n};ms.forEach(([k])=>T[t][k]=valOf(A,n,k));if(A){lgN.n+=n;Object.entries(A).forEach(([k,v])=>lg[k]=(lg[k]||0)+v)}});
    const league={};ms.forEach(([k])=>league[k]=valOf(lg,lgN.n,k));
    ms.forEach(([k,,dir])=>{const L=Object.keys(T).filter(t=>T[t][k]!=null).sort((a,b)=>dir*(T[b][k]-T[a][k]));L.forEach((t,i)=>{(T[t].rk=T[t].rk||{})[k]=i+1})});
    tbl[pos]={T,league,ms,teams:Object.keys(T).length}});
  /* team tendencies: pass rate, volume */
  const team={};Object.entries(vol).forEach(([t,G])=>{const g=Object.values(G),s=k=>g.reduce((a,x)=>a+x[k],0),db=s("att")+s("sk");team[t]={n:g.length,passRate:db+s("car")?db/(db+s("car")):null,att:s("att")/g.length,car:s("car")/g.length,tgt:s("tgt")/g.length,db:db/g.length}});
  const lgTeam={passRate:avg(Object.values(team).map(x=>x.passRate).filter(x=>x!=null)),att:avg(Object.values(team).map(x=>x.att)),car:avg(Object.values(team).map(x=>x.car)),tgt:avg(Object.values(team).map(x=>x.tgt))};
  /* opponent pressure on QBs (nflverse / PFR) */
  const prs={};Object.entries(N.I.PR||{}).forEach(([t,a])=>prs[t]=avg(a.map(x=>x.v)));const prsL=avg(Object.values(N.I.PR||{}).flat().map(x=>x.v));
  const prsRank={};Object.keys(prs).sort((a,b)=>prs[a]-prs[b]).forEach((t,i)=>prsRank[t]=i+1);
  /* positional baselines: the average starting-role player at each position, per game */
  const QUAL={QB:v=>v.att>=15,RB:v=>v.car>=8||v.car+v.tgt>=12,WR:v=>v.tgt>=4,TE:v=>v.tgt>=3};const base={};
  Object.entries(N.I.P).forEach(([id,rows])=>{const pos=M.grp((S.ath[id]||[])[1]||"");const q=QUAL[pos];if(!q)return;rows.forEach(r=>{if(q(r.v))(base[pos]=base[pos]||[]).push(r)})});
  D={S,gById,vol,team,lgTeam,tbl,gp,prs,prsL,prsRank,base,ci};return D}

async function loadDef(){if(DEF||DEFload)return DEFload;const {getJSON}=X();
  DEFload=getJSON("data/nfl/def.json?t="+Math.floor(Date.now()/36e5),20000).then(j=>{DEF=j||{games:{},cols:[]};if(NP.open)render(true)}).catch(()=>{DEF={games:{},cols:[],err:1};if(NP.open)render(true)});return DEFload}

/* ---------- one player's games ---------- */
function rowsOf(id){const {N,ath}=X(),a=ath(id),d=derive();if(!a)return[];const pos=grpOf(a[1]);
  let rows;if(pos==="DEF"){if(!DEF||!DEF.games)return null;const cols=DEF.cols||[];rows=[];Object.entries(DEF.games).forEach(([gid,G])=>{const r=G[id];if(!r)return;const g=d.gById[gid];if(!g)return;const t=r[0],v={};cols.forEach((c,i)=>v[c]=r[i+1]||0);
      rows.push({gid,d:g.d,w:g.w,t,opp:t===g.h[0]?g.a[0]:g.h[0],home:t===g.h[0]?1:0,v,x:{}})});rows.sort((x,y)=>x.d<y.d?-1:1)}
  else rows=(N.I.P[id]||[]).slice();
  return rows.map(r=>{const g=d.gById[r.gid],mine=g&&(r.t===g.h[0]?g.h[1]:g.a[1]),theirs=g&&(r.t===g.h[0]?g.a[1]:g.h[1]);const tg=(N.I.T[r.t]||[]).find(x=>x.gid===r.gid);
    return{...r,res:g?(mine>theirs?"W":mine<theirs?"L":"T"):"",score:g?`${mine}-${theirs}`:"",sp:tg?tg.sp:null}}).reverse()/* newest first */}

/* this week's game and his lines */
function gameFor(tid){const {N}=X();return N.events.find(e=>e.home.id===tid||e.away.id===tid)||null}
function propsFor(id,e){const {N,evalProp,evalTD,STAT_ORDER}=X();if(!e||!N.props[e.id])return[];const P=N.props[e.id];
  const out=Object.values(P.lines).filter(L=>L.ath===id).map(L=>evalProp(e,L));
  ["td","td2"].forEach(k=>{if(P.yn[k]&&P.yn[k].has(id)){const r=evalTD(e,id,k);if(r)out.push(r)}});
  const o=s=>{const i=STAT_ORDER.indexOf(s==="td2"?"td":s);return i<0?99:i};return out.sort((a,b)=>o(a.st)-o(b.st)||(a.st==="td2")-(b.st==="td2"))}

/* ---------- pieces ---------- */
function heroHTML(id,a,e,c){const {T,h,N,nflAvatar}=X(),tm=T(a[2]),pos=a[1];const opp=c?T(c.opp):null;
  const when=e?new Date(e.date).toLocaleString([],{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
  const odds=c&&c.spread!=null?`${h(tm[0])} ${c.spread>0?"+":""}${c.spread} · total ${c.total??"–"}`:"";
  return`<header class="pf-hero" style="--c1:${tm[2]};--c2:${tm[3]}"><div class="pf-av">${nflAvatar(id)}</div>
    <div class="pf-id"><div class="eyebrow">${h(tm[0])} · ${h(pos||"–")}${a[3]?" · #"+h(a[3]):""} · ${h(N.stats.season)} season</div><h2>${h(a[0])}</h2>
      <div class="pf-mu"><span class="nfp-tm">${X().logo(a[2])}${h(tm[1])}</span>
      ${e&&c?`${c.side==="home"?"vs":"@"} ${h(opp[1])}<span>${when}${odds?" · "+odds:""}</span>`:`<span>No game for ${h(tm[4]||tm[0])} in week ${h(N.week)}${N.bye&&N.bye.includes(tm[0])?" (bye)":""}</span>`}</div></div></header>`}

function statusHTML(id,a,e){const {N,h,ago}=X(),inj=N.inj[id];let s="";
  if(inj){const lv=inj.lv==="out"?"out":inj.lv==="doubt"?"doubt":inj.lv==="quest"?"quest":"";s+=`<span class="pf-chip ${lv?"inj-"+lv:""}">${h(inj.st)}</span><span class="pf-note">${h(inj.txt||"")}${inj.date?` · ESPN injury report, ${new Date(inj.date).toLocaleDateString([],{month:"short",day:"numeric"})}`:""}</span>`}
  else if(a[4]&&!/^active$/i.test(a[4]))s+=`<span class="pf-chip ${/out|reserve/i.test(a[4])?"inj-out":"inj-quest"}">${h(a[4])}</span><span class="pf-note">ESPN roster status</span>`;
  else s+=`<span class="pf-chip ok">No injury listed</span><span class="pf-note">ESPN injury report${N.injTs?`, checked ${ago(N.injTs)}`:""}</span>`;
  if(e&&e.state==="in")s+=`<span class="pf-chip live">Live · ${h(e.detail)}</span>`;else if(e&&e.state==="post")s+=`<span class="pf-chip">Final ${e.away.ab} ${e.away.score}-${e.home.score} ${e.home.ab}</span>`;
  return`<div class="pf-status">${s}</div>`}

function chipsHTML(pos,props){const {h,SHORT}=X();
  if(props.length)return`<div class="pf-mk">${props.map(x=>`<button class="${x.key===NP.key?"on":""}" data-nfpk="${h(x.key)}"><span>${h(x.yn?(x.st==="td2"?"2+ TDs":"Anytime TD"):SHORT[x.st]||x.st)}</span><b>${x.yn?"Yes":x.l}</b></button>`).join("")}</div>`;
  return`<div class="pf-mk">${(STAT_CHIPS[pos]||[]).map(s=>`<button class="${NP.st===s?"on":""}" data-nfps="${s}"><span>${h(STAT_NAME[s]||s)}</span><b>stats</b></button>`).join("")}</div>`}

/* the selected prop: every number below comes from the same evalProp/evalTD row (same market, line and side) */
function propPanel(x,e){const {h,am,pc,RK,gradeNfl,priceOf,btNote,NFL_STANDIN,ago,N,rel,SHORT,r1}=X();
  if(!x)return"";const yn=!!x.yn,name=yn?(x.st==="td2"?"2+ touchdowns":"Anytime touchdown"):(STAT_NAME[x.st]||SHORT[x.st]||x.st);
  if(x.p==null){const GN=gradeNfl(x);return`<section class="pf-card pf-prop pf-swap"><div class="pf-ph"><div><div class="eyebrow">Selected prop · DraftKings</div><h3>${h(name)} <span class="ln">${yn?"":x.l}</span></h3></div></div>
    <div class="pf-empty" style="margin-top:0">${x.why==="notModeled"?`Sharpline doesn't model ${h(name.toLowerCase())} yet, so there's no projection, chance or grade for it. His actual results against this line are in the chart below.`:`No estimate: ${h(typeof GN.why==="string"?GN.why:"not enough data")}.`}</div>
    ${x.lo!=null&&x.lo!==x.l?`<div class="pf-fresh"><span>Opened at ${x.lo}</span></div>`:""}</section>`}
  const pO=x.side==="o"?x.p:1-x.p,px=priceOf(x.key)||{},oO=px.o??null,oU=yn?null:(px.u??null);
  const evO=oO!=null?RK.ev(pO,oO):null,evU=oU!=null?RK.ev(1-pO,oU):null;
  const mk=oO!=null&&oU!=null?RK.devig(oO,oU)[0]:oO!=null?RK.imp(oO):null;
  const mkTxt=mk!=null?`${pc(mk)}${oO!=null&&oU!=null?" no-vig":" with vig"}`:yn?"needs a price":"≈50% at DK's line";
  const side=(lbl,p,o,ev,on)=>`<div class="pf-side ${on?"on":""}"><div class="k">${lbl}</div><div class="v">${o!=null?am(o):"–"}</div><div class="s">${o!=null?h(px.bk||"Your book"):"no price yet"}</div>
    <div class="pf-prob"><i style="width:${Math.round(p*100)}%"></i></div><div class="s2"><b>${pc(p)}</b> model${ev!=null?` · <span class="${ev>=0?"pos":"neg"}">${ev>=0?"+":""}${(ev*100).toFixed(1)}% EV</span>`:""}</div></div>`;
  const GN=gradeNfl(x),R=rel().R[x.key],gt=typeof gradeTag==="function"?gradeTag:(g=>`<span class="grade g-${g}">${g}</span>`);
  const why=Array.isArray(GN.why)?GN.why.filter(Boolean).join("; "):GN.why||"";
  const proj=yn?`${pc(x.p)} chance`:r1(x.P&&x.P.m);const started=e&&e.state!=="pre";
  const lineAge=x.upd?ago(Date.parse(x.upd)):null,P=N.props[e.id];
  return`<section class="pf-card pf-prop pf-swap">
    <div class="pf-ph"><div><div class="eyebrow">Selected prop · DraftKings line</div><h3>${h(name)} ${yn?"":`<span class="ln">${x.l}</span>`}${x.alt?`<span class="pf-sub">your book · DK ${x.dkL}</span>`:""}</h3></div>
      <div class="pf-gr">${GN.g?gt(GN.g,"md"):""}${R?`<span class="grade g-${R.g} rel" title="Slate rank ${R.rank} of ${rel().n}">${R.g}</span>`:""}</div></div>
    <div class="pf-sides">${side(yn?"Yes":"Over "+x.l,pO,oO,evO,x.side==="o")}${yn?`<div class="pf-side"><div class="k">No</div><div class="v">–</div><div class="s">DraftKings posts Yes only</div><div class="pf-prob"><i style="width:${Math.round((1-pO)*100)}%"></i></div><div class="s2"><b>${pc(1-pO)}</b> model</div></div>`:side("Under "+x.l,1-pO,oU,evU,x.side==="u")}</div>
    <div class="pf-model nfp-model"><div><div class="k">Projection <em>model</em></div><div class="v">${proj}</div></div><div><div class="k">Lean</div><div class="v ${x.side}">${x.nolean?"None":yn?"Yes":x.side==="o"?"Over":"Under"}</div></div><div><div class="k">Fair price</div><div class="v">${am(x.fair)}</div></div><div><div class="k">Market</div><div class="v sm">${mkTxt}</div></div></div>
    <div class="pf-why">${GN.g?`<b>Grade ${GN.g}</b>${GN.assumed?` at an assumed ${NFL_STANDIN} (no price entered; B or better needs your real price)`:` at ${am(GN.o)}`}${why?`: ${h(why)}`:""}. `:GN.why?`<b>No grade:</b> ${h(why)}. `:""}${x.P&&x.P.hits!=null?`Over this line in ${x.P.hits} of his ${x.P.n} games. `:""}${h(btNote(x.st==="td2"?"td":x.st))}.</div>
    ${x.P&&x.P.parts&&x.P.parts.length?`<details class="pf-books"><summary>How the projection was built</summary><div class="pf-why">${h(x.P.parts.join("; "))}${x.P.k!=null&&!yn?`; model chance moved toward the line's 50% by the backtested trust factor (k ${x.P.k})`:""}.</div></details>`:""}
    <div class="pf-fresh">${started?`<span class="fr fr-started">Game started</span>`:lineAge?`<span class="fr ${Date.now()-Date.parse(x.upd)<6*3600e3?"fr-live":"fr-aging"}">Line updated ${lineAge}</span>`:""}${x.lo!=null&&x.lo!==x.l?`<span>Opened ${x.lo}</span>`:""}${P?`<span>Lines checked ${ago(P.ts)}</span>`:""}${px.ts?`<span>Your price saved ${ago(px.ts)}</span>`:""}</div>
    ${started?`<div class="pf-warn">The game has started. These are pregame numbers.</div>`:""}
    <div class="pf-act nfp-act"><button class="addbtn" data-nfpx="${h(x.key)}">${oO!=null||oU!=null?"Edit price":"Enter price"}</button><button class="addbtn" data-nfparlay="${h(x.key)}">+ Parlay</button><button class="addbtn go" data-nftrack="${h(x.key)}">Track</button></div></section>`}

/* every line he has this week, compact; tap one to make it the selected prop */
function allPropsHTML(list){const {h,pc,r1,gradeNfl,SHORT,priceOf,am}=X();if(list.length<2)return"";
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">This week · DraftKings</div><h3>All his lines<span class="pf-sub"> · ${list.length}</span></h3></div></div>
    <div class="pf-tw"><table class="pf-log nfp-pl"><thead><tr><th>Market</th><th>Line</th><th>Proj</th><th>Over</th><th>Under</th><th>Price</th><th>Grade</th></tr></thead><tbody>
    ${list.map(x=>{const pO=x.p==null?null:x.side==="o"?x.p:1-x.p,G=gradeNfl(x),px=priceOf(x.key)||{};return`<tr class="${x.key===NP.key?"hot":""}" data-nfpk="${h(x.key)}"><td>${h(x.yn?(x.st==="td2"?"2+ TDs":"Anytime TD"):SHORT[x.st]||x.st)}</td><td>${x.yn?"Yes":x.l}</td><td>${x.yn?"–":x.P&&x.P.m!=null?r1(x.P.m):"–"}</td>
      <td class="${pO!=null&&pO>=.5?"o":""}">${pO==null?"–":pc(pO)}</td><td class="${pO!=null&&pO<.5?"u":""}">${pO==null||x.yn?"–":pc(1-pO)}</td><td>${px.o!=null||px.u!=null?[px.o!=null?am(px.o):"",px.u!=null?am(px.u):""].filter(Boolean).join(" / "):"–"}</td><td>${G.g?`<span class="grade g-${G.g}">${G.g}</span>`:`<small>${x.why==="notModeled"?"not modeled":"–"}</small>`}</td></tr>`}).join("")}</tbody></table></div>
    <div class="pf-sub2">Chances are Sharpline's model at DraftKings' line. ESPN's free NFL feed has no prices, so EV and B-or-better grades need your book's odds (tap a line, then Enter price).</div></section>`}

function chartHTML(rows,L,e){const {h,T}=X(),st=NP.st;const opp=e?(e.home.id===rows.tid?e.away.id:e.home.id):null;
  const tabs=[["l5","L5"],["l10","L10"],["all","Season"]].concat(opp?[["opp","vs "+T(opp)[0]]]:[]);
  let list=NP.range==="opp"?rows.filter(r=>r.opp===opp):NP.range==="all"?rows.slice():rows.slice(0,NP.range==="l5"?5:10);list=list.reverse();
  const head=`<div class="pf-ch"><div><div class="eyebrow">Actual results</div><h3>${h(STAT_NAME[st]||st)}<span class="pf-sub"> · ${list.length} game${list.length===1?"":"s"}</span></h3></div><div class="seg">${tabs.map(([v,l])=>`<button class="${NP.range===v?"on":""}" data-nfpr="${v}">${l}</button>`).join("")}</div></div>`;
  if(!list.length)return`<section class="pf-card">${head}<div class="pf-empty">${NP.range==="opp"?`No games against ${h(T(opp)[1])} this season.`:"No games recorded this season."}</div></section>`;
  const vals=list.map(r=>sv(st,r.v)??0),max=Math.max(...vals,L||0,1)*1.12,W=340,H=170,pad=22,n=list.length,bw=Math.min(28,(W-8)/n-4),gap=(W-8-bw*n)/Math.max(1,n);const y=v=>H-pad-(v/max)*(H-pad-14);
  let hit=0;const bars=list.map((r,j)=>{const v=vals[j],x0=4+gap/2+j*(bw+gap),ov=L!=null&&v>L;if(ov)hit++;const cls=L==null?"n":ov?"o":v<L?"u":"p";
    return`<g class="bar ${cls}" style="--d:${j*24}ms"><rect x="${x0}" y="${y(v)}" width="${bw}" height="${Math.max(2,H-pad-y(v))}" rx="5"/><text class="bv" x="${x0+bw/2}" y="${y(v)-5}">${v}</text>
      <text class="bo" x="${x0+bw/2}" y="${H-7}">${n>12?r.w:(r.home?"":"@")+h(T(r.opp)[0])}</text><title>Week ${r.w} ${r.home?"vs":"@"} ${h(T(r.opp)[0])}: ${v} ${h(STAT_NAME[st]||st)} (${r.res} ${r.score})</title></g>`}).join("");
  const a=vals.reduce((x,y)=>x+y,0)/vals.length;
  return`<section class="pf-card">${head}<svg class="pf-chart ${NP.anim?"anim":""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(STAT_NAME[st]||st)}, last ${n} games">${L!=null?`<line class="ln" x1="0" x2="${W}" y1="${y(L)}" y2="${y(L)}"/>`:""}${bars}</svg>
    <div class="pf-sum">${L!=null?`<b class="${hit/n>=.5?"pos":"neg"}">Over in ${hit} of ${n}</b> (${Math.round(hit/n*100)}%) · `:""}Average <b>${f1(a)}</b>${n>12?" · bars labeled by week":""}${L!=null?`<span class="pf-leg"><i class="o"></i>Over <i class="u"></i>Under <i class="l"></i>Line ${L}</span>`:""}</div></section>`}

/* averages for a split, by position; every card shows the starting-role positional average for comparison */
function splitRows(rows,view,opp){return{season:rows,l5:rows.slice(0,5),l10:rows.slice(0,10),home:rows.filter(r=>r.home),away:rows.filter(r=>!r.home),fav:rows.filter(r=>r.sp!=null&&r.sp<0),dog:rows.filter(r=>r.sp!=null&&r.sp>0),opp:rows.filter(r=>r.opp===opp)}[view]||rows}
function cardsFor(pos,sel){const S=k=>sel.reduce((a,r)=>a+(r.v[k]||0),0),n=sel.length,A=k=>n?S(k)/n:null,x=r=>r.x||{};
  const xs=k=>{const v=sel.map(r=>x(r)[k]).filter(v=>v!=null);return v.length?{v:avg(v),n:v.length}:null};
  if(pos==="QB")return[["pYds","Pass yds",A("pYds")],["pTD","Pass TD",A("pTD")],["int","INT",A("int")],["cmpatt","Cmp/Att",n?`${f1(A("cmp"))}/${f1(A("att"))}`:null,"raw"],["cmpP","Cmp %",S("att")?S("cmp")/S("att"):null,"pct"],["ypa","Yds/att",S("att")?S("pYds")/S("att"):null],["rate","Rating",rating(S("cmp"),S("att"),S("pYds"),S("pTD"),S("int")),"int"],["rYds","Rush yds",A("rYds")],["rTD","Rush TD",A("rTD")],["sk","Sacked",A("sk")],["fpts","Fantasy",n?avg(sel.map(r=>fpts(r.v))):null]];
  if(pos==="RB")return[["car","Carries",A("car")],["rYds","Rush yds",A("rYds")],["ypc","Yds/carry",S("car")?S("rYds")/S("car"):null],["rTD","Rush TD",A("rTD")],["tgt","Targets",A("tgt")],["rec","Rec",A("rec")],["recYds","Rec yds",A("recYds")],["tch","Touches",n?(S("car")+S("rec"))/n:null],["snap","Snap %",(xs("snap")||{}).v,"pct"],["fpts","Fantasy",n?avg(sel.map(r=>fpts(r.v))):null]];
  if(pos==="WR"||pos==="TE"){const out=[["tgt","Targets",A("tgt")],["rec","Rec",A("rec")],["recYds","Rec yds",A("recYds")],["ypr","Yds/rec",S("rec")?S("recYds")/S("rec"):null],["recTD","Rec TD",A("recTD")],["catch","Catch %",S("tgt")?S("rec")/S("tgt"):null,"pct"],["ts","Tgt share",(xs("ts")||{}).v,"pct"],["adot","aDOT",S("tgt")>=5&&sel.some(r=>x(r).ay!=null)?sel.reduce((a,r)=>a+(x(r).ay||0),0)/S("tgt"):null],["fpts","Fantasy",n?avg(sel.map(r=>fpts(r.v))):null]];
    if(S("car")>=3)out.splice(5,0,["rYds","Rush yds",A("rYds")]);return out}
  if(pos==="K")return[["fgM","FG made",A("fgM")],["fgA","FG att",A("fgA")],["fgP","FG %",S("fgA")?S("fgM")/S("fgA"):null,"pct"],["xpM","XP made",A("xpM")],["kPts","Points",A("kPts")]];
  if(pos==="DEF")return[["tklT","Tackles",A("tklT")],["tkl","Solo",A("tkl")],["ast","Assists",n?(S("tklT")-S("tkl"))/n:null],["sacks","Sacks",A("sacks")],["tfl","TFL",A("tfl")],["qbh","QB hits",A("qbh")],["pd","Pass def",A("pd")],["dInt","INT",A("dInt")],["dTD","Def TD",A("dTD")]];
  return[]}
const fmtC=(v,t)=>v==null?"–":t==="raw"?v:t==="pct"?pct0(v):t==="int"?f0(v):f1(v);
const HOT={pYds:["pYds"],pTD:["pTD"],cmp:["cmpatt"],att:["cmpatt"],int:["int"],pRYds:["pYds","rYds"],rYds:["rYds"],car:["car"],rec:["rec"],recYds:["recYds"],rRecYds:["rYds","recYds"],td:["rTD","recTD"],td2:["rTD","recTD"],tgt:["tgt"],fpts:["fpts"],kPts:["kPts"],fgM:["fgM"],xpM:["xpM"],tklAst:["tklT"],tkl:["tkl"],ast:["ast"],sacks:["sacks"],pd:["pd"]};
function avgsHTML(rows,pos,e){const {h,T}=X(),d=derive();const opp=e?(e.home.id===rows.tid?e.away.id:e.home.id):null;
  const views=[["season","Season"],["l5","L5"],["l10","L10"],["home","Home"],["away","Away"],["fav","Favored"],["dog","Underdog"]].concat(opp?[["opp","vs "+T(opp)[0]]]:[]);
  const sel=splitRows(rows,NP.view,opp),cards=cardsFor(pos,sel),bsel=d.base[pos]||[],bcards=bsel.length?cardsFor(pos,bsel):null,hot=HOT[NP.st]||[];
  const note={season:"",l5:"",l10:"",home:" · home games",away:" · road games",fav:" · his team favored by the closing spread",dog:" · his team the underdog by the closing spread",opp:" · this season"}[NP.view]||"";
  const small=sel.length&&sel.length<4?`<div class="pf-warn">Only ${sel.length} game${sel.length===1?"":"s"} in this view. Treat these averages as a rough signal.</div>`:"";
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Actual averages per game</div><h3>${sel.length} game${sel.length===1?"":"s"}<span class="pf-sub">${note}</span></h3></div></div>
    <div class="seg wide">${views.map(([v,l])=>`<button class="${NP.view===v?"on":""}" data-nfpv="${v}">${l}</button>`).join("")}</div>
    ${sel.length?`<div class="pf-grid">${cards.map(([k,l,v,t],i)=>`<div class="pf-sc ${hot.includes(k)?"hot":""}"><div class="v${t==="raw"?" sm":""}">${fmtC(v,t)}</div><div class="k">${l}</div>${bcards&&bcards[i]&&bcards[i][2]!=null?`<div class="a">${pos} avg ${fmtC(bcards[i][2],t)}</div>`:""}</div>`).join("")}</div>${small}
      <div class="pf-sub2">${bcards?`"${pos} avg" is the average starting-role ${POSN[pos]} game this season (${pos==="QB"?"15+ attempts":pos==="RB"?"8+ carries or 12+ touches and targets":pos==="WR"?"4+ targets":"3+ targets"}; ${bsel.length} games). `:""}${pos==="DEF"?"Counts games where he recorded at least one defensive stat. ":"Games where he recorded no stat at all are not in ESPN's box score, so they don't count. "}${pos!=="K"&&pos!=="DEF"?"Fantasy is PPR with lost fumbles; two-point conversions are not included.":""}</div>`:`<div class="pf-empty">No games in this view.</div>`}</section>`}

/* role and usage (nflverse snap counts, targets, air yards, pressure) plus team volume */
function usageHTML(rows,pos,tid){if(pos==="K"||pos==="DEF")return"";const {h}=X(),d=derive(),tm=d.team[tid]||{},lg=d.lgTeam;const xs=rows.map(r=>r.x||{}),xv=k=>xs.map(x=>x[k]).filter(v=>v!=null);
  const sn=xv("snap"),ts=xv("ts"),as=xv("as"),prs=xv("prs");const l3=a=>a.slice(0,3);
  const tgt=rows.reduce((a,r)=>a+(r.v.tgt||0),0),ay=rows.reduce((a,r)=>a+((r.x||{}).ay||0),0),ayN=rows.filter(r=>(r.x||{}).ay!=null).length;
  const teamCar=rows.reduce((a,r)=>a+(((d.vol[r.t]||{})[r.gid]||{}).car||0),0),car=rows.reduce((a,r)=>a+(r.v.car||0),0);
  const sk=rows.reduce((a,r)=>a+(r.v.sk||0),0),att=rows.reduce((a,r)=>a+(r.v.att||0),0);
  const cells=[sn.length&&["Snap share",pct0(avg(sn)),`last 3: ${pct0(avg(l3(sn)))} · ${sn.length} gm`],
    pos!=="QB"&&ts.length&&["Target share",pct0(avg(ts)),`last 3: ${pct0(avg(l3(ts)))} · ${ts.length} gm`],
    pos!=="QB"&&as.length&&tgt>=5&&["Air-yard share",pct0(avg(as)),`${as.length} gm`],
    pos!=="QB"&&ayN&&tgt>=5&&["Air yards",f1(ay/ayN),`per game · aDOT ${f1(ay/tgt)}`],
    pos==="RB"&&teamCar&&["Carry share",pct0(car/teamCar),`of team carries · ${rows.length} gm`],
    pos==="QB"&&prs.length&&["Pressured",pct0(avg(prs)),`of dropbacks · ${prs.length} gm`],
    pos==="QB"&&att+sk&&["Sack rate",pct0(sk/(att+sk)),`${sk} sacks · ${att+sk} dropbacks`],
    tm.passRate!=null&&["Team pass rate",pct0(tm.passRate),`league ${pct0(lg.passRate)} · ${tm.n} gm`],
    pos==="QB"?["Team pass att",f1(tm.att),`per game · league ${f1(lg.att)}`]:pos==="RB"?["Team carries",f1(tm.car),`per game · league ${f1(lg.car)}`]:["Team targets",f1(tm.tgt),`per game · league ${f1(lg.tgt)}`]].filter(Boolean);
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Role and volume</div><h3>Usage<span class="pf-sub"> · this season</span></h3></div></div>
    <div class="nfp-us">${cells.map(([l,v,s])=>`<div><div class="k">${l}</div><div class="v">${v}</div><div class="s">${h(s)}</div></div>`).join("")}</div>
    <div class="pf-sub2">Snap counts, target share, air yards and pressure: nflverse (free open data), joined nightly${sn.length?"":"; none matched for him yet"}. Team volume from ESPN box scores.</div></section>`}

/* matchup: what this defense allows to his position, with ranks, plus the game environment and expected volume */
function matchupHTML(rows,pos,tid,e,c){if(!e||!c)return"";const {h,T,N}=X(),d=derive(),opp=c.opp,on=T(opp);
  const env=[];const tm=d.team[tid]||{},teamG=(N.I.T[tid]||[]),pf=avg(teamG.map(x=>x.pf));
  if(c.spread!=null&&c.total!=null){const imp=c.total/2-c.spread/2;env.push(["Spread",`${c.spread>0?"+":""}${c.spread}`,c.spread<0?"favored":"underdog"],["Game total",c.total,"DraftKings"],["Implied team total",f1(imp),pf!=null?`scores ${f1(pf)}/g this season`:""])}
  const nx=N.stats.next&&N.stats.next[e.id];if(nx&&nx.ven){if(nx.ven.in)env.push(["Weather","Indoors",h(nx.ven.n||"")]);else if(nx.wx)env.push(["Weather",`${nx.wx.wind} mph wind`,`${nx.wx.temp}°F${nx.wx.rain>=1?`, ${nx.wx.rain} mm rain`:""} · forecast, ${h(nx.ven.n||"")}`]);else env.push(["Weather","Outdoors",`no forecast yet · ${h(nx.ven.n||"")}`])}
  const t=d.tbl[pos];let tbl="";
  if(t&&t.T[opp]){const O=t.T[opp],fmt=(k,v)=>v==null?"–":k==="cmpP"?pct0(v):f1(v),tone=r=>r==null?"":r<=8?"fav":r>=t.teams-7?"unf":"";
    tbl=`<div class="pf-tw"><table class="pf-log pf-dvp"><thead><tr><th>Allowed per game</th><th>${h(on[0])}</th><th>Rank</th><th>League</th></tr></thead><tbody>
      ${t.ms.map(([k,l])=>`<tr><td>${l}</td><td><b>${fmt(k,O[k])}</b></td><td class="${tone(O.rk&&O.rk[k])}">${ord(O.rk&&O.rk[k])}</td><td>${fmt(k,t.league[k])}</td></tr>`).join("")}</tbody></table></div>
      <div class="pf-sub2">Totals allowed to all ${POSN[pos]} per game across ${O.n} ${h(on[4]||on[0])} games (ESPN box scores; rate rows are per attempt, carry or target). Rank 1st is the friendliest matchup for a ${pos}, ${ord(t.teams)} the toughest; for interceptions and sacks, fewer is friendlier.${O.n<6?` Only ${O.n} games, so ranks move a lot.`:""}</div>`}
  /* expected volume */
  const vol=[];const r4=rows.slice(0,4);
  if(pos==="QB"){const pr=d.prs[opp];if(pr!=null)vol.push(["Opponent pressure",pct0(pr),`of dropbacks · ${ord(Object.keys(d.prs).length-(d.prsRank[opp]||0)+1)} most of ${Object.keys(d.prs).length} · league ${pct0(d.prsL)}`]);if(r4.length)vol.push(["His attempts",f1(avg(r4.map(r=>r.v.att))),`per game, last ${r4.length}`])}
  if(pos==="WR"||pos==="TE"||pos==="RB"){const s=r4.map(r=>(r.x||{}).ts!=null?r.x.ts:r.teamTgt?r.v.tgt/r.teamTgt:null).filter(v=>v!=null);if(s.length&&tm.tgt){vol.push(["Expected targets",f1(avg(s)*tm.tgt),`rough: ${pct0(avg(s))} share (last ${s.length}) × ${f1(tm.tgt)} team targets`])}}
  if(pos==="RB"&&r4.length){const cs=r4.map(r=>{const tc=((d.vol[r.t]||{})[r.gid]||{}).car;return tc?r.v.car/tc:null}).filter(v=>v!=null);if(cs.length&&tm.car)vol.push(["Expected carries",f1(avg(cs)*tm.car),`rough: ${pct0(avg(cs))} carry share × ${f1(tm.car)} team carries`])}
  const grid=a=>a.length?`<div class="nfp-us">${a.map(([l,v,s])=>`<div><div class="k">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("")}</div>`:"";
  const miss={QB:"coverage schemes and offensive line grades",RB:"offensive line grades and goal-line or red-zone carries",WR:"coverage schemes and cornerback matchups",TE:"coverage schemes and linebacker/safety matchups"}[pos];
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Matchup</div><h3>${h(on[4]||on[0])} vs ${POSN[pos]||"his position"}<span class="pf-sub"> · ${c.side==="home"?"home":"road"} game</span></h3></div></div>
    ${tbl||`<div class="pf-empty" style="margin-top:0">No position matchup table for ${h(pos)}s.</div>`}
    ${env.length?`<div class="nfp-h">Game environment</div>${grid(env)}`:""}${vol.length?`<div class="nfp-h">Volume</div>${grid(vol)}`:""}
    ${miss?`<div class="pf-sub2">Not in Sharpline's free data: ${miss}. Spread and total are DraftKings via ESPN; weather is the Open-Meteo forecast at kickoff. This is context; the projection applies its own opponent, script, pressure and weather terms (see "How the projection was built").</div>`:""}</section>`}

function logHTML(rows,pos,L){const {h,T}=X();if(!rows.length)return"";const st=NP.st;
  const C={QB:[["cmp","CMP"],["att","ATT"],["pYds","YDS"],["pTD","TD"],["int","INT"],["sk","SK"],["car","CAR"],["rYds","RUSH"]],RB:[["car","CAR"],["rYds","YDS"],["rTD","TD"],["tgt","TGT"],["rec","REC"],["recYds","REC YDS"],["recTD","REC TD"]],
    WR:[["tgt","TGT"],["rec","REC"],["recYds","YDS"],["recLng","LNG"],["recTD","TD"],["car","CAR"],["rYds","RUSH"]],K:[["fgM","FG"],["fgA","FGA"],["xpM","XP"],["kPts","PTS"]],
    DEF:[["tklT","TKL"],["tkl","SOLO"],["sacks","SK"],["tfl","TFL"],["qbh","QBH"],["pd","PD"],["dInt","INT"]]};C.TE=C.WR;
  const cols=C[pos]||C.WR,single=cols.find(([k])=>k===st||(st==="tklAst"&&k==="tklT")),extra=!single&&STAT_NAME[st];const snap=pos!=="K"&&pos!=="DEF"&&rows.some(r=>(r.x||{}).snap!=null);
  const list=rows.slice(0,NP.logN);
  return`<section class="pf-card"><div class="pf-ch"><div><div class="eyebrow">Actual results</div><h3>Game log<span class="pf-sub"> · ${rows.length} games</span></h3></div></div>
    <div class="pf-tw"><table class="pf-log"><thead><tr><th>Wk</th><th>Opp</th><th>Result</th>${snap?"<th>SNAP</th>":""}${cols.map(([k,l])=>`<th class="${single&&single[0]===k?"hot":""}">${l}</th>`).join("")}${extra?`<th class="hot">${h(({rRecYds:"RUSH+REC",pRYds:"PASS+RUSH",td:"TD",fpts:"FPTS",ast:"AST",rLng:"LNG"})[st]||st)}</th>`:""}</tr></thead><tbody>
    ${list.map(r=>{const v=sv(st,r.v),cls=L==null||v==null?"":v>L?"o":v<L?"u":"";return`<tr><td>${r.w}</td><td>${r.home?"vs":"@"} ${h(T(r.opp)[0])}</td><td class="res ${r.res==="W"?"w":"l"}">${r.res} ${r.score}</td>${snap?`<td>${(r.x||{}).snap!=null?pct0(r.x.snap):"–"}</td>`:""}
      ${cols.map(([k])=>{const on=single&&single[0]===k;return`<td class="${on?"hot "+cls:""}">${r.v[k]??0}</td>`}).join("")}${extra?`<td class="hot ${cls}">${v??"–"}</td>`:""}</tr>`}).join("")}</tbody></table></div>
    ${rows.length>10?`<button class="pf-more" data-nfplog="1">${NP.logN>10?"Show fewer":"Show all "+rows.length}</button>`:""}</section>`}

/* ---------- render ---------- */
function render(keep){const el=document.getElementById("nfProf");if(!NP.open||!el)return;const st0=el.scrollTop,x=X();if(!x)return;const {N,ath,h,T,loadProps}=x;
  const id=NP.id,a=ath(id);
  const bar=`<div class="pf-bar"><button class="pf-back" data-nfpclose="1" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Back</button><span class="pf-tt">NFL player</span></div>`;
  if(!N.stats){el.innerHTML=`<div class="pf-in">${bar}<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading NFL season data…</span></div></div>`;return}
  if(!a){el.innerHTML=`<div class="pf-in">${bar}<div class="pf-empty">This player isn't in Sharpline's NFL roster file (ESPN id ${h(id)}).</div></div>`;return}
  const pos=grpOf(a[1]);if(pos==="DEF"&&!DEF)loadDef();
  const e=gameFor(a[2]),c=e?x.ctxFor(e,id):null;
  if(e&&!N.props[e.id]&&!NP.pl){NP.pl=1;loadProps(e.id).then(()=>{NP.pl=0;if(NP.open&&NP.id===id)render(true)}).catch(()=>{NP.pl=0})}
  x.computeRelNfl();const props=propsFor(id,e);
  if(NP.key&&!props.some(p=>p.key===NP.key))NP.key=null;
  if(!NP.key&&props.length&&!NP.statPicked){/* strongest modeled line first: best value grade, then the biggest move from 50% */
    const GO=["S","A","B","C","D","F"],gi=x=>{const g=x.p!=null?x.gradeNfl(x).g:null;return g?GO.indexOf(g):9};
    const best=props.map(p=>({p,g:gi({...p,gradeNfl:X().gradeNfl}),m:p.p!=null?Math.abs(p.p-.5):-1})).sort((a,b)=>a.g-b.g||b.m-a.m)[0];NP.key=best.p.key}
  const sel=NP.key?props.find(p=>p.key===NP.key):null;if(sel)NP.st=sel.st==="td2"?"td":sel.st;
  if(!NP.st)NP.st=(STAT_CHIPS[pos]||["fpts"])[0];
  const L=sel?(sel.yn?(sel.st==="td2"?1.5:.5):sel.l):null;
  const rows=rowsOf(id);if(rows)rows.tid=a[2];
  const body=rows==null?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading defensive box scores…</span></div>`
    :DEF&&DEF.err&&pos==="DEF"?`<div class="pf-empty">Defensive box scores didn't load. Try again in a minute.</div>`
    :!rows.length?`<div class="pf-empty">No ${N.stats.season} games recorded for him yet${pos==="DEF"?" (defensive stats start with the next data update)":""}. ${props.length?"Lines above are DraftKings'; the model needs at least 2 games to project him.":""}</div>`
    :chartHTML(rows,L,e)+avgsHTML(rows,pos,e)+usageHTML(rows,pos,a[2])+matchupHTML(rows,pos,a[2],e,c)+logHTML(rows,pos,L);
  const noProps=e&&e.state==="post"&&!props.length?`<div class="pf-empty">His week ${h(N.week)} game is final. Next week's lines appear once DraftKings posts them; his results below include it once the season file updates (every 3 hours).</div>`:e&&N.props[e.id]&&!props.length?`<div class="pf-empty">No DraftKings lines posted for him this week yet. Stats below are his actual results.</div>`:e&&!N.props[e.id]?`<div class="pf-card pf-load"><i></i><i></i><i></i><span>Loading this week's lines…</span></div>`:"";
  el.innerHTML=`<div class="pf-in">${bar}${heroHTML(id,a,e,c)}${statusHTML(id,a,e)}${chipsHTML(pos,props)}
    <div id="nfpBody">${sel?propPanel(sel,e):noProps}${allPropsHTML(props)}${body}</div>
    <p class="pf-foot">Actual results: ESPN box scores (${h(N.stats.season)} season, through week ${h(Math.max(...N.stats.games.map(g=>g.w)))}; data updated ${x.ago(Date.parse(N.stats.updated))}). Usage: nflverse. Lines: DraftKings via ESPN. Projections, chances, fair prices and grades are Sharpline's NFL model, not results.</p></div>`;
  if(keep)el.scrollTop=st0;
  if(NP.anim)requestAnimationFrame(()=>requestAnimationFrame(()=>{const ch=el.querySelector(".pf-chart");if(ch)ch.classList.add("go")}));NP.anim=false}

function open(id,key){id=String(id);let el=document.getElementById("nfProf");if(!el){el=document.createElement("div");el.id="nfProf";el.className="prof";document.body.appendChild(el)}
  Object.assign(NP,{open:true,id,st:null,key:key||null,statPicked:false,range:"l10",view:"season",logN:10,anim:true,pl:0});
  el.classList.remove("out");el.classList.add("on");el.scrollTop=0;document.body.classList.add("pf-lock");
  if(!(history.state&&history.state.sl==="nfprof"))history.pushState({sl:"nfprof"},"");
  render();const x=X();if(x&&!x.N.stats)Promise.resolve(x.ensure()).then(()=>render(true)).catch(()=>render(true))}
function hide(){NP.open=false;const el=document.getElementById("nfProf");if(!el)return;el.classList.add("out");const nba=document.getElementById("prof");if(!(nba&&nba.classList.contains("on")))document.body.classList.remove("pf-lock");
  setTimeout(()=>{el.classList.remove("on","out");el.innerHTML=""},260)}
function close(){if(history.state&&history.state.sl==="nfprof")history.back();else hide()}
window.addEventListener("popstate",()=>{if(NP.open)hide()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&NP.open)close()});
document.addEventListener("click",e=>{if(!e.target.closest("#nfProf"))return;const t=e.target.closest("[data-nfpk],[data-nfps],[data-nfpr],[data-nfpv],[data-nfplog],[data-nfpclose]");if(!t)return;const d=t.dataset;
  if(d.nfpclose){close();return}
  if(d.nfpk){NP.key=d.nfpk;NP.anim=true;render(true);return}
  if(d.nfps){NP.st=d.nfps;NP.key=null;NP.statPicked=true;NP.anim=true;render(true);return}
  if(d.nfpr){NP.range=d.nfpr;NP.anim=true;render(true);return}
  if(d.nfpv){NP.view=d.nfpv;render(true);return}
  if(d.nfplog){NP.logN=NP.logN>10?10:99;render(true);return}});
window.NFLProfile={open,close,refresh:()=>{if(NP.open)render(true)},_np:NP,_derive:()=>derive(),_rows:id=>rowsOf(id),_fpts:fpts,_rating:rating};
})();
