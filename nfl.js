/* Sharpline NFL. Same app, same tracker and parlay slip; NFL-specific data, model and views.
   Data, all free and read live from ESPN on the phone (no key):
   - scoreboard by week: schedule, real game status, scores, records, DraftKings moneyline/spread/total, live situation
   - propBets (DraftKings): player prop LINES and team/period lines. ESPN's NFL feed carries no prop PRICES, so a prop
     only gets an expected value once you enter your book's price or scan a screenshot.
   - injuries: the league injury report with dates
   - summary: box scores (live and final) for Live, grading and live chances
   Season history, opponent splits and the backtest come from data/nfl/*.json, rebuilt every 3 hours in GitHub Actions. */
(function(){
const SB="https://site.api.espn.com/apis/site/v2/sports/football/nfl",CORE="https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const M=window.SLNFLModel,RK=window.SLRank;
const h=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const LSg=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const am=a=>a==null||isNaN(a)?"–":(a>0?"+":"")+Math.round(a),pc=p=>p==null?"–":Math.round(p*100)+"%",pc1=p=>p==null?"–":(p*100).toFixed(1)+"%";
const evs=v=>v==null?"–":(v>=0?"+":"−")+Math.abs(v*100).toFixed(1)+"%",r1=v=>v==null?"–":(Math.round(v*10)/10).toString();
const num=v=>{if(v==null||v==="")return null;const n=parseFloat(String(v).replace(/^[ou]/i,""));return isNaN(n)?null:n};
const ago=t=>{if(!t)return"never";const s=(Date.now()-t)/1e3;return s<60?"just now":s<3600?Math.round(s/60)+"m ago":Math.round(s/3600)+"h ago"};
async function getJSON(u,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms||12000);try{const r=await fetch(u,{signal:c.signal,cache:"no-store"});if(r.status===404)return null;if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}}
const STAT_ORDER=["pYds","pTD","cmp","att","int","pRYds","pLng","rYds","car","rLng","rRecYds","recYds","rec","recLng","td","kPts","fgM","xpM","tkl","ast","tklAst","sacks"];
const LBL=Object.assign({pLng:"Longest completion",tkl:"Tackles",ast:"Tackle assists",tklAst:"Tackles + assists",sacks:"Sacks",td1:"First touchdown",td2:"2+ touchdowns"},Object.fromEntries(Object.entries(M.STATS).map(([k,v])=>[k,v.lbl])));
const SHORT={pYds:"Pass Yds",pTD:"Pass TD",cmp:"Comp",att:"Pass Att",int:"INT",pRYds:"Pass+Rush Yds",pLng:"Long Comp",rYds:"Rush Yds",car:"Rush Att",rLng:"Long Rush",rRecYds:"Rush+Rec Yds",recYds:"Rec Yds",rec:"Rec",recLng:"Long Rec",td:"Anytime TD",kPts:"Kick Pts",fgM:"FG Made",xpM:"XP Made",tkl:"Tackles",ast:"Ast",tklAst:"Tkl+Ast",sacks:"Sacks"};
const PROP={8:"pYds",9:"cmp",10:"pTD",11:"car",12:"rYds",13:"recYds",14:"rec",15:"int",16:"att",17:"pLng",18:"pRYds",19:"recLng",20:"rRecYds",21:"rLng",22:"kPts",23:"xpM",24:"fgM",25:"ast",26:"tkl",27:"tklAst",28:"sacks"};
const YN={31:"td",29:"td1",32:"td2"};
const TEAMMK={72:["1H","Total"],73:["1H","Moneyline"],74:["1H","Spread"],75:["Q1","Total"],76:["Q1","Moneyline"],77:["Q1","Spread"],78:["Q2","Total"],80:["Q2","Spread"],81:["Q3","Total"],83:["Q3","Spread"],84:["Q4","Total"],86:["Q4","Spread"],98:["Game","Team total"],99:["1H","Team total"],104:["Game","Team TDs"]};

const N={on:false,view:"top",stats:null,I:null,DEF:null,model:null,season:null,stype:2,week:null,curWeek:null,cal:[],events:[],sbTs:0,props:{},inj:{},injTs:0,
  px:LSg("sl_nfl_px",{}),f:Object.assign({g:"all",pos:"all",st:"all",q:"",sort:"gap",side:"all"},LSg("sl_nfl_f",{})),open:{},box:{},loading:{},err:null};
const savePx=()=>LSs("sl_nfl_px",N.px),saveF=()=>LSs("sl_nfl_f",N.f);
const T=id=>(N.stats&&N.stats.teams[id])||[String(id),String(id),"#444","#888",String(id)];
const ath=id=>(N.stats&&N.stats.ath[id])||null;
const posOf=id=>{const a=ath(id);return a?M.grp(a[1]):"X"};
const posLbl=id=>{const a=ath(id);return a?a[1]:""};
function jersey(id,cls){const a=ath(id),t=a?T(a[2]):T(""),n=a&&a[3]?a[3]:"";return`<span class="nf-av ${cls||""}" style="--c1:${t[2]};--c2:${t[3]}"><b>${h(n)||"–"}</b><i>${h(t[0])}</i></span>`}
const logo=tid=>{const t=T(tid);return`<span class="nf-logo" style="--c1:${t[2]};--c2:${t[3]}">${h(t[0])}</span>`};

/* ---------- static history and backtest ---------- */
async function loadStatic(){if(N.stats)return;const hr=Math.floor(Date.now()/36e5);
  const [s,m]=await Promise.all([getJSON("data/nfl/stats.json?t="+hr,20000).catch(()=>null),getJSON("data/nfl/model.json?t="+hr,15000).catch(()=>null)]);
  if(!s){N.err="NFL history file didn't load";return}N.stats=s;N.model=m;N.I=M.index(s);N.DEF=M.defense(N.I,null);N.season=s.season;N.stype=s.stype;if(N.week==null){N.week=s.week;N.curWeek=s.week}}
const kOf=st=>N.model&&N.model.k&&N.model.k[st]!=null?N.model.k[st]:.3;
/* a stat earns a Top List place only if its out-of-sample hit rate cleared 54% on 100+ picks */
const trusted=st=>{const b=N.model&&N.model.byStat&&N.model.byStat[st];return!!(b&&b.picks>=100&&b.hit>=.54)};
function btNote(st){const b=N.model&&N.model.byStat&&N.model.byStat[st];if(!b)return"Not backtested";if(!b.picks||b.hit==null)return`Backtest: no edge found (${b.n} lines)`;
  return`Backtest: right side ${pc1(b.hit)} of ${b.picks} picks${trusted(st)?"":" · not enough to trust"}`}

/* ---------- schedule ---------- */
function parseEvent(e){const c=e.competitions[0],st=c.status.type,cs=c.competitors,H=cs.find(x=>x.homeAway==="home"),A=cs.find(x=>x.homeAway==="away"),o=(c.odds||[])[0];
  const tm=x=>({id:x.team.id,ab:x.team.abbreviation,name:x.team.displayName,short:x.team.shortDisplayName,score:+x.score||0,rec:(x.records||[])[0]&&x.records[0].summary,color:"#"+(x.team.color||"444"),alt:"#"+(x.team.alternateColor||"888")});
  let odds=null;if(o){const ao=o.awayTeamOdds||{},ho=o.homeTeamOdds||{},m=String(o.details||"").match(/^([A-Z]{2,4})\s+([+-]?\d+(\.\d)?)$/);
    const hsp=m?(m[1]===H.team.abbreviation?+m[2]:-m[2]):/^(EVEN|PK)/i.test(o.details||"")?0:null;
    /* the scoreboard keeps prices under moneyline/pointSpread/total with open and close; the core odds feed uses team objects */
    const cl=x=>(x&&(x.close||x.current))||{},op=x=>(x&&x.open)||{},ml=o.moneyline||{},ps=o.pointSpread||{},tt=o.total||{};
    odds={book:(o.provider&&(o.provider.displayName||o.provider.name))||"DraftKings",spread:hsp??num(cl(ps.home).line),total:num(o.overUnder)??num(cl(tt.over).line),
      mlH:num(cl(ml.home).odds)??num(ho.moneyLine),mlA:num(cl(ml.away).odds)??num(ao.moneyLine),spH:num(cl(ps.home).odds)??num(ho.spreadOdds),spA:num(cl(ps.away).odds)??num(ao.spreadOdds),
      ov:num(cl(tt.over).odds)??num(o.overOdds),un:num(cl(tt.under).odds)??num(o.underOdds),
      openSpread:num(op(ps.home).line),openTotal:num(op(tt.over).line),openMlH:num(op(ml.home).odds),openMlA:num(op(ml.away).odds)}}
  const sit=c.situation||null;
  return{id:e.id,date:e.date,state:st.state,completed:!!st.completed,detail:st.shortDetail||st.detail||"",name:st.name,period:+(c.status.period||0),clock:c.status.displayClock||"",clockSec:num(c.status.clock),
    home:tm(H),away:tm(A),odds,sit:sit&&{poss:sit.possession,dd:sit.downDistanceText||sit.shortDownDistanceText||"",yl:sit.possessionText||"",rz:!!sit.isRedZone,last:sit.lastPlay&&sit.lastPlay.text},
    venue:c.venue&&c.venue.fullName,bcast:(c.broadcasts||[]).flatMap(b=>b.names||[]).join(", ")}}
async function loadWeek(force){if(!force&&N.events.length&&N.evWeek===N.week+"|"+N.stype&&Date.now()-N.sbTs<60000)return;
  const j=await getJSON(`${SB}/scoreboard?seasontype=${N.stype}&week=${N.week}&dates=${N.season||""}`);if(!j)return;
  N.events=(j.events||[]).map(parseEvent).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);N.evWeek=N.week+"|"+N.stype;N.sbTs=Date.now();
  N.bye=((j.week&&j.week.teamsOnBye)||[]).map(t=>t.abbreviation);N.cal=((j.leagues||[])[0]||{}).calendar||N.cal;
  if(!N.season&&j.season)N.season=j.season.year}
/* ---------- injuries ---------- */
async function loadInj(){if(Date.now()-N.injTs<15*60000)return;const j=await getJSON(SB+"/injuries").catch(()=>null);if(!j)return;const out={};
  (j.injuries||[]).forEach(t=>(t.injuries||[]).forEach(i=>{const href=((i.athlete||{}).links||[]).map(l=>l.href).find(x=>/\/id\/\d+/.test(x||""))||"";const m=href.match(/\/id\/(\d+)/);if(!m)return;
    if(/^active$/i.test(i.status||""))return;out[m[1]]={st:i.status,date:i.date,txt:i.shortComment||"",lv:/^out|injured reserve|^ir|suspend|physically unable|non-football/i.test(i.status)?"out":/doubt/i.test(i.status)?"doubt":/quest/i.test(i.status)?"quest":"note"}}));
  N.inj=out;N.injTs=Date.now()}
/* ---------- props (DraftKings lines, no prices) ---------- */
async function loadProps(eid,force){const P=N.props[eid];if(!force&&P&&Date.now()-P.ts<5*60000)return P;if(N.loading[eid])return N.loading[eid];
  N.loading[eid]=(async()=>{let items=[];for(let p=1;p<=3;p++){const j=await getJSON(`${CORE}/events/${eid}/competitions/${eid}/odds/100/propBets?lang=en&region=us&limit=1000&page=${p}`,15000).catch(()=>null);if(!j)break;items=items.concat(j.items||[]);if(p>=(j.pageCount||1))break}
    const out={ts:Date.now(),raw:items.length,lines:{},yn:{},team:[]};const seen={};
    items.forEach(x=>{const tid=x.type&&String(x.type.id),cur=x.current&&x.current.target,opn=x.open&&x.open.target;
      if(PROP[tid]&&x.athlete){const m=String(x.athlete.$ref||"").match(/athletes\/(\d+)/);if(!m||!cur)return;const k=m[1]+"|"+PROP[tid];out.lines[k]={ath:m[1],st:PROP[tid],l:+cur.value,lo:opn?+opn.value:null,upd:x.lastUpdated}}
      else if(YN[tid]&&x.athlete){const m=String(x.athlete.$ref||"").match(/athletes\/(\d+)/);if(m)(out.yn[YN[tid]]=out.yn[YN[tid]]||new Set()).add(m[1])}
      else if(TEAMMK[tid]){const t=x.team&&String(x.team.$ref||"").match(/teams\/(\d+)/);const k=tid+"|"+(t?t[1]:"")+"|"+(cur?cur.value:"");if(seen[k])return;seen[k]=1;out.team.push({type:tid,per:TEAMMK[tid][0],mk:TEAMMK[tid][1],team:t?t[1]:null,l:cur?+cur.value:null,lo:opn?+opn.value:null,upd:x.lastUpdated})}});
    N.props[eid]=out;delete N.loading[eid];return out})();return N.loading[eid]}
async function loadAllProps(){const pre=N.events.filter(e=>e.state==="pre");let i=0;await Promise.all([0,1,2].map(async()=>{while(i<pre.length){const e=pre[i++];try{await loadProps(e.id)}catch(err){}}}))}

/* ---------- the model on one prop ---------- */
const gameOf=eid=>N.events.find(e=>e.id===eid);
function teamSide(e,tid){return e.home.id===tid?"home":e.away.id===tid?"away":null}
function ctxFor(e,id){const a=ath(id);if(!a||!e)return null;const side=teamSide(e,a[2]);if(!side)return null;const opp=side==="home"?e.away.id:e.home.id;
  const sp=e.odds&&e.odds.spread!=null?(side==="home"?e.odds.spread:-e.odds.spread):null;return{opp,spread:sp,total:e.odds?e.odds.total:null,home:side==="home"?1:0,side}}
function priceOf(key){return N.px[key]||null}
const pxKey=(eid,id,st,l)=>[eid,id,st,l].join("|");
/* one priced or unpriced prop with the model's chance, fair price, and EV when a price exists */
function evalProp(e,L){const st=L.st,id=L.ath,c=ctxFor(e,id);const inj=N.inj[id];
  const base={e,id,st,l:L.l,lo:L.lo,upd:L.upd,name:(ath(id)||[])[0]||"Player "+id,pos:posOf(id),posL:posLbl(id),tid:(ath(id)||[])[2],inj,key:pxKey(e.id,id,st,L.l)};
  if(!M.STATS[st]||M.STATS[st].yn)return{...base,why:"notModeled"};if(!c)return{...base,why:"noPlayer"};
  /* your book may hang a different number: the model prices YOUR line; DraftKings' line still anchors the projection */
  const px0=priceOf(base.key),myL=px0&&px0.L!=null&&px0.L!==L.l?px0.L:null;
  const P=M.project(N.I,id,st,{use:N.model&&N.model.use,opp:c.opp,line:L.l,evalLine:myL,spread:c.spread,total:c.total,k:kOf(st),wx:N.stats.next&&N.stats.next[e.id]&&N.stats.next[e.id].wx},N.DEF);
  if(!P||P.p==null)return{...base,c,why:"noHist",P};
  if(myL!=null){base.dkL=L.l;base.l=myL;base.alt=1;const sd=Math.max(.5,(P.cv||.4)*P.m);base.far=Math.abs(myL-L.l)>(M.STATS[st].d==="pois"?1:.6*sd)}
  const side=P.p>=.5?"o":"u",p=side==="o"?P.p:1-P.p,px=priceOf(base.key);const price=px?(side==="o"?px.o:px.u):null;
  /* if a price was entered for the other side only, use that side */
  let s2=side,p2=p,pr2=price;if(px&&price==null){const os=side==="o"?"u":"o",op=os==="o"?px.o:px.u;if(op!=null){s2=os;p2=1-p;pr2=op}}
  return{...base,c,P,side:s2,p:p2,fair:RK.fairAm(p2),price:pr2,bk:px&&px.bk,ev:pr2!=null?RK.ev(p2,pr2):null,why:null,nolean:Math.abs(p2-.5)<.005}}
function evalTD(e,id,kind){const c=ctxFor(e,id);if(!c)return null;const P=M.project(N.I,id,"td",{use:N.model&&N.model.use,opp:c.opp,spread:c.spread,total:c.total},N.DEF);if(!P||P.n<2)return null;
  let p=P.pOver;if(kind==="td2"){const l=-Math.log(1-p);p=1-Math.exp(-l)*(1+l)}if(kind==="td1")return null;
  const key=pxKey(e.id,id,kind,0),px=priceOf(key),price=px?px.o:null;
  return{e,id,st:kind==="td2"?"td2":"td",l:kind==="td2"?1.5:.5,name:(ath(id)||[])[0],pos:posOf(id),posL:posLbl(id),tid:(ath(id)||[])[2],inj:N.inj[id],c,P,side:"o",p,fair:RK.fairAm(p),price,bk:px&&px.bk,ev:price!=null?RK.ev(p,price):null,key,yn:1}}
function allProps(){const out=[];N.events.forEach(e=>{const P=N.props[e.id];if(!P)return;Object.values(P.lines).forEach(L=>out.push(evalProp(e,L)));
  ["td","td2"].forEach(k=>(P.yn[k]||new Set()).forEach(id=>{const r=evalTD(e,id,k);if(r)out.push(r)}))});return out}

/* ---------- game lines ---------- */
function gameMarkets(e){const o=e.odds;if(!o)return[];const out=[];const dv=(a,b)=>a!=null&&b!=null?RK.devig(a,b):null;
  const ml=dv(o.mlA,o.mlH);out.push({k:"ml",lbl:"Moneyline",a:{t:e.away,line:null,price:o.mlA,fair:ml&&ml[0],open:o.openMlA},b:{t:e.home,line:null,price:o.mlH,fair:ml&&ml[1],open:o.openMlH}});
  const sp=dv(o.spA,o.spH);if(o.spread!=null)out.push({k:"sp",lbl:"Spread",a:{t:e.away,line:-o.spread,price:o.spA,fair:sp&&sp[0],open:o.openSpread!=null?-o.openSpread:null},b:{t:e.home,line:o.spread,price:o.spH,fair:sp&&sp[1],open:o.openSpread}});
  const tt=dv(o.ov,o.un);if(o.total!=null)out.push({k:"tot",lbl:"Total",a:{t:null,side:"o",line:o.total,price:o.ov,fair:tt&&tt[0],open:o.openTotal},b:{t:null,side:"u",line:o.total,price:o.un,fair:tt&&tt[1],open:o.openTotal}});
  return out}

/* ---------- tracking and parlays (shared tracker) ---------- */
function betFromProp(x){if(!x||!x.e)return null;const e=x.e,lbl=x.yn?(x.st==="td2"?"2+ touchdowns":"Anytime TD"):`${x.side==="o"?"Over":"Under"} ${x.l} ${SHORT[x.st]||x.st}`;
  return{id:Date.now(),type:"straight",sport:"nfl",date:localDate(e.date),key:"n:"+x.key,name:x.name,game:`${e.away.ab} @ ${e.home.ab}`,tip:e.date,mkt:SHORT[x.st]||x.st,book:x.bk||(typeof BOOK!=='undefined'&&BOOK)||"Book",stake:(typeof UNIT!=='undefined'&&UNIT)||10,res:null,
    pick:lbl,odds:x.price??null,p:x.p,push:0,ev:x.ev,grade:null,conf:null,src:x.price!=null?"your odds":"NFL board",
    spec:{sport:"nfl",kind:"prop",ev:e.id,ath:x.id,stat:x.st,line:x.l,side:x.side,player:x.name,pos:x.pos},home:e.home.name,away:e.away.name,evid:e.id,tm:x.tid,ath:x.id}}
function betFromLine(e,mk,s){const m=gameMarkets(e).find(z=>z.k===mk);if(!m)return null;const S=s==="a"?m.a:m.b;const p=S.fair;
  const team=S.t,pick=mk==="ml"?`${team.short} ML`:mk==="sp"?`${team.short} ${S.line>0?"+":""}${S.line}`:`${S.side==="o"?"Over":"Under"} ${S.line}`;
  return{id:Date.now(),type:"straight",sport:"nfl",date:localDate(e.date),key:`nl:${e.id}|${mk}|${s}`,name:`${e.away.ab} @ ${e.home.ab}`,game:`${e.away.ab} @ ${e.home.ab}`,tip:e.date,mkt:m.lbl,book:"DraftKings",stake:(typeof UNIT!=='undefined'&&UNIT)||10,res:null,
    pick,odds:S.price,p,push:0,ev:p!=null&&S.price!=null?RK.ev(p,S.price):null,grade:null,conf:null,src:"DraftKings",
    spec:{sport:"nfl",kind:mk,ev:e.id,team:team?team.id:null,teamName:team?team.name:null,line:S.line,side:S.side||null},home:e.home.name,away:e.away.name,evid:e.id}}
function localDate(iso){const d=new Date(iso);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function track(b){if(!b)return;if(b.odds==null){toast("Enter your book's price first, so the result is graded at the odds you got");return}BETS.unshift(b);saveBets();if(window.renderTrack)renderTrack();toast("Tracked");paint()}
function parlay(b){if(!b)return;if(window.TR2&&TR2.addLegObj)TR2.addLegObj(b)}

/* ---------- grading NFL bets from box scores ---------- */
async function summary(eid,maxAge){const B=N.box[eid];if(B&&Date.now()-B.ts<(maxAge||30000))return B;const j=await getJSON(`${SB}/summary?event=${eid}`).catch(()=>null);if(!j)return B||null;
  const players={};((j.boxscore||{}).players||[]).forEach(t=>(t.statistics||[]).forEach(cat=>{const keys=cat.keys||[];(cat.athletes||[]).forEach(a=>{const id=a.athlete&&a.athlete.id;if(!id)return;
    const v=players[id]||(players[id]={t:t.team.id,n:a.athlete.displayName,v:Object.fromEntries(N.stats.cols.map(c=>[c,0])),tkl:0,ast:0,sacks:0});const s=a.stats||[],at=k=>parseFloat(String(s[keys.indexOf(k)]||"0").split(/[/-]/)[0])||0;
    if(cat.name==="passing"){const ca=String(s[keys.indexOf("completions/passingAttempts")]||"0/0").split("/");v.v.cmp=+ca[0]||0;v.v.att=+ca[1]||0;v.v.pYds=at("passingYards");v.v.pTD=at("passingTouchdowns");v.v.int=at("interceptions")}
    if(cat.name==="rushing"){v.v.car=at("rushingAttempts");v.v.rYds=at("rushingYards");v.v.rTD=at("rushingTouchdowns");v.v.rLng=at("longRushing")}
    if(cat.name==="receiving"){v.v.rec=at("receptions");v.v.recYds=at("receivingYards");v.v.recTD=at("receivingTouchdowns");v.v.recLng=at("longReception");v.v.tgt=at("receivingTargets")}
    if(cat.name==="kicking"){v.v.fgM=at("fieldGoalsMade/fieldGoalAttempts");v.v.xpM=at("extraPointsMade/extraPointAttempts");v.v.kPts=at("totalKickingPoints")}
    if(cat.name==="defensive"){v.tkl=at("soloTackles");v.ast=Math.max(0,at("totalTackles")-at("soloTackles"));v.sacks=at("sacks")}})}));
  const teams=((j.boxscore||{}).teams||[]).map(t=>({id:t.team.id,ab:t.team.abbreviation,s:Object.fromEntries((t.statistics||[]).map(x=>[x.name,x.displayValue]))}));
  const hc=(j.header&&j.header.competitions&&j.header.competitions[0])||{};const st=(hc.status||{}).type||{};
  const out={ts:Date.now(),players,teams,state:st.state,completed:!!st.completed,period:+((hc.status||{}).period||0),clockSec:num((hc.status||{}).clock),
    comp:(hc.competitors||[]).map(c=>({id:c.id||c.team&&c.team.id,home:c.homeAway==="home",score:+c.score||0})),drives:j.drives&&j.drives.current,sit:j.situation};
  N.box[eid]=out;return out}
function statVal(row,st){if(!row)return 0;const v=row.v;if(st==="tkl")return row.tkl;if(st==="ast")return row.ast;if(st==="tklAst")return row.tkl+row.ast;if(st==="sacks")return row.sacks;if(st==="pLng")return null;if(st==="td2")return v.rTD+v.recTD;
  const S=M.STATS[st];return S?S.f(v):null}
function gradeSpec(sp,B){if(!B||!B.completed)return null;const H=B.comp.find(c=>c.home),A=B.comp.find(c=>!c.home);if(!H||!A)return null;
  const cmp=(x,l,s)=>x===l?"P":(x>l)===(s==="o")?"W":"L";
  if(sp.kind==="prop"){const row=B.players[sp.ath];if(!row)return{res:"V",detail:`${sp.player} did not record a stat (check if he played; void if he didn't)`};const x=statVal(row,sp.stat);if(x==null)return null;
    return{res:cmp(x,sp.line,sp.side),detail:`${sp.player} ${x} ${SHORT[sp.stat]||sp.stat} vs ${sp.line}`}}
  const mine=sp.team===H.id?H.score:A.score,opp=sp.team===H.id?A.score:H.score;
  if(sp.kind==="ml")return{res:mine>opp?"W":mine<opp?"L":"P",detail:`Final ${A.score}-${H.score}`};
  if(sp.kind==="sp"){const m=mine-opp+sp.line;return{res:m>0?"W":m<0?"L":"P",detail:`Final ${A.score}-${H.score}, covered by ${r1(m)}`}}
  if(sp.kind==="tot"){const t=H.score+A.score;return{res:cmp(t,sp.line,sp.side),detail:`Final total ${t} vs ${sp.line}`}}return null}
async function gradeAll(){if(!N.stats)await loadStatic();if(!N.stats)return 0;let n=0;const touched=new Set();
  const one=async(x)=>{const sp=x.spec;if(!sp||sp.sport!=="nfl"||x.res)return;const B=await summary(sp.ev,60000);const r=gradeSpec(sp,B);if(r){x.res=r.res;x.gnote=r.detail;x.auto=1;x.gat=Date.now();n++}};
  for(const b of BETS.filter(b=>!b.res&&!b.noAuto)){if(b.type==="parlay"){for(const l of b.legs.filter(l=>!l.res&&l.spec&&l.spec.sport==="nfl")){await one(l);touched.add(b)}}else await one(b)}
  touched.forEach(b=>{const s=window.TR2&&TR2._settle(b);if(s){Object.assign(b,s,{auto:1,gat:Date.now()});n++}});if(n){saveBets();if(window.renderTrack)renderTrack()}return n}

/* ---------- live chance for tracked NFL bets (used by the tracker's live panel) ---------- */
function fracLeft(B){if(!B||!B.period)return 1;if(B.period>4)return Math.max(0,(B.clockSec||0)/600)*.15;return Math.max(0,((4-B.period)*900+(B.clockSec||0))/3600)}
function betChance(sp){if(!sp||sp.sport!=="nfl")return null;if(!N.stats){loadStatic().then(()=>window.LiveUI&&LiveUI.paintTracker());return null}const e=gameOf(sp.ev)||N.liveEv&&N.liveEv[sp.ev];const B=N.box[sp.ev];
  if(!B){summary(sp.ev,20000).then(()=>window.LiveUI&&LiveUI.paintTracker());return e&&e.state==="pre"?{st:"pre"}:null}
  if(B.state==="pre")return{st:"pre"};if(B.completed)return{st:"post"};const H=B.comp.find(c=>c.home),A=B.comp.find(c=>!c.home);
  const fl=fracLeft(B),clock=B.period>4?"OT":`Q${B.period} ${Math.floor((B.clockSec||0)/60)}:${String(Math.round((B.clockSec||0)%60)).padStart(2,"0")}`,score=e?`${e.away.ab} ${A.score}, ${e.home.ab} ${H.score}`:`${A.score}-${H.score}`;
  if(sp.kind==="prop"){const row=B.players[sp.ath],cur=row?statVal(row,sp.stat):0;if(cur==null)return{st:"na",why:"No live box stat for this market",clock,score};
    if(cur>sp.line&&sp.side==="o")return{st:"done",p:1,clock,score,now:`${cur} already over ${sp.line}`};if(cur>sp.line&&sp.side==="u")return{st:"done",p:0,clock,score,now:`${cur}, past ${sp.line}`};
    const Ms=M.STATS[sp.stat==="td2"?"td":sp.stat];if(!Ms)return{st:"na",why:"Not modeled live",clock,score};const g=e||{};const c=ctxFor(g,sp.ath)||{};
    const P=M.project(N.I,sp.ath,sp.stat==="td2"?"td":sp.stat,{use:N.model&&N.model.use,opp:c.opp,line:sp.line,spread:c.spread,total:c.total,k:1},N.DEF);if(!P||P.m==null)return{st:"na",why:"Not enough history for a live estimate",clock,score};
    const p=M.liveChance(P,cur,sp.line,sp.side,fl,sp.stat==="td2"?"td":sp.stat);return{st:"live",p,src:"model",clock,score,now:`${cur} now, about ${r1(cur+P.m*fl)} projected`}}
  const diff=(sp.team===H.id?H.score-A.score:A.score-H.score);const pre=e&&e.odds;const exp=pre&&pre.spread!=null?(sp.team===e.home.id?-pre.spread:pre.spread):0;const sd=13.5*Math.sqrt(Math.max(.01,fl));
  if(sp.kind==="ml"){const mu=diff+exp*fl;return{st:"live",p:RK.Phi(mu/sd),src:"model",clock,score,now:`${diff>=0?"up":"down"} ${Math.abs(diff)}`}}
  if(sp.kind==="sp"){const mu=diff+exp*fl+sp.line;return{st:"live",p:RK.Phi(mu/sd),src:"model",clock,score,now:`${diff>=0?"up":"down"} ${Math.abs(diff)} with ${sp.line>0?"+":""}${sp.line}`}}
  if(sp.kind==="tot"){const t=H.score+A.score,rem=(pre&&pre.total||44)*fl,s2=10*Math.sqrt(Math.max(.01,fl)),po=1-RK.Phi((sp.line-t-rem)/s2);return{st:"live",p:sp.side==="o"?po:1-po,src:"model",clock,score,now:`${t} points so far`}}
  return null}

/* ---------- prices you enter ---------- */
let SHEET=null;
function sheetPreview(){const x=SHEET,el=document.getElementById("nfLive");if(!x||!el||x.yn){if(el)el.textContent="";return}
  const Lv=parseFloat(((document.getElementById("nfL")||{}).value||"").replace(",","."));const dk=x.dkL??x.l,L=isNaN(Lv)?dk:Lv;
  const c=x.c,P=M.project(N.I,x.id,x.st,{use:N.model&&N.model.use,opp:c.opp,line:dk,evalLine:L,spread:c.spread,total:c.total,k:kOf(x.st)},N.DEF);if(!P||P.p==null){el.textContent="";return}
  const o=parseAm((document.getElementById("nfO")||{}).value),u=parseAm((document.getElementById("nfU")||{}).value);
  const bits=[`At ${L}: Over ${pc1(P.p)} (fair ${am(RK.fairAm(P.p))}) · Under ${pc1(1-P.p)} (fair ${am(RK.fairAm(1-P.p))})`];
  if(o!=null)bits.push(`Over EV ${evs(RK.ev(P.p,o))}`);if(u!=null)bits.push(`Under EV ${evs(RK.ev(1-P.p,u))}`);
  const sd=Math.max(.5,(P.cv||.4)*P.m);if(L!==dk&&Math.abs(L-dk)>(M.STATS[x.st].d==="pois"?1:.6*sd))bits.push("far from DraftKings' line, so this is rougher");
  el.textContent=bits.join(" · ")}
function oddsSheet(x){SHEET=x;let el=document.getElementById("nfOdds");if(!el){el=document.createElement("div");el.id="nfOdds";el.className="sheet";document.body.appendChild(el)}
  const px=priceOf(x.key)||{};const yn=x.yn;
  el.innerHTML=`<div class="sheet-bg" data-nfclose="1"></div><div class="sheet-in"><div class="sheet-h"><div><div class="eyebrow">Your book's price</div><h2>${h(x.name)} · ${h(yn?(x.st==="td2"?"2+ TDs":"Anytime TD"):SHORT[x.st]+" "+x.l)}</h2></div><button class="x" data-nfclose="1">×</button></div>
    <p class="sheet-p">DraftKings' NFL prop prices aren't in the free feed, so EV needs your book's numbers. If your book hangs a different number, type it in the line box and Sharpline prices that number instead.</p>
    ${yn?"":`<div class="f one"><div><label>Your book's line (DraftKings: ${x.dkL??x.l})</label><input id="nfL" inputmode="decimal" placeholder="${x.dkL??x.l}" value="${px.L!=null?px.L:""}"></div></div>`}
    <div class="f two"><div><label>${yn?"Yes":"Over"}</label><input id="nfO" inputmode="text" placeholder="-115" value="${px.o!=null?am(px.o):""}"></div>${yn?"":`<div><label>Under</label><input id="nfU" inputmode="text" placeholder="-105" value="${px.u!=null?am(px.u):""}"></div>`}</div>
    <p class="hint" id="nfLive"></p>
    <div class="slip-b"><button class="ghost" data-nfclear="${h(x.key)}">Clear</button><button class="go2" data-nfsave="${h(x.key)}">Save price</button></div></div>`;el.classList.add("on");sheetPreview();setTimeout(()=>{const i=document.getElementById("nfO");i&&i.focus()},50)}
const parseAm=v=>{const n=parseFloat(String(v||"").replace(/[^\d.+-]/g,""));if(isNaN(n))return null;if(Math.abs(n)<100&&n>1&&n<30)return Math.round(n>=2?(n-1)*100:-100/(n-1));return Math.abs(n)>=100?n:null};

/* ---------- views ---------- */
const VIEWS={top:"nflTop",props:"nflProps",lines:"nflLines",live:"nflLive"};
function weekNav(){const cal=(N.cal||[]).find(c=>+c.value===N.stype)||(N.cal||[]).find(c=>/regular/i.test(c.label));const ents=(cal&&cal.entries)||[];const cur=ents.find(x=>+x.value===N.week);
  const lbl=cur?`${cur.label}${cur.startDate?` · ${new Date(cur.startDate).toLocaleDateString([],{month:"short",day:"numeric"})} to ${new Date(cur.endDate).toLocaleDateString([],{month:"short",day:"numeric"})}`:""}`:`Week ${N.week}`;
  return`<div class="nf-week"><button data-nfwk="-1" aria-label="Previous week" ${N.week<=1&&N.stype===2?"disabled":""}>‹</button><div><b>${h(lbl)}</b><small>${N.week===N.curWeek?"This week":N.week<N.curWeek?"Past week":"Upcoming"}${N.bye&&N.bye.length?` · Bye: ${N.bye.join(", ")}`:""}</small></div><button data-nfwk="1" aria-label="Next week">›</button></div>`}
function gameChip(e,on){const s=e.state==="in"?`<em class="nf-lv">${h(e.detail)}</em>`:e.state==="post"?`<em>Final ${e.away.score}-${e.home.score}</em>`:`<em>${new Date(e.date).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})}</em>`;
  return`<button class="chip ${on?"on":""}" data-nfg="${e.id}">${h(e.away.ab)} @ ${h(e.home.ab)} ${s}</button>`}
const fresh=t=>`<span class="nf-fr ${t&&Date.now()-t<10*60000?"ok":"old"}">${ago(t)}</span>`;
const evc=v=>v==null?"ev-na":v>=((typeof SET!=='undefined'&&SET.minEdge)||.02)?"ev-pos":v>-.01?"ev-mid":"ev-neg";

function topHTML(){const L=allProps();const pre=N.events.filter(e=>e.state==="pre"),loaded=pre.filter(e=>N.props[e.id]).length;
  const cand=L.filter(x=>x.p!=null&&!x.why&&x.e.state==="pre"&&!(x.inj&&(x.inj.lv==="out"||x.inj.lv==="doubt")));
  const priced=cand.filter(x=>x.price!=null&&x.ev!=null),minE=(typeof SET!=='undefined'&&SET.minEdge)||.02;
  const qual=priced.filter(x=>x.ev>=minE&&(trusted(x.st)||x.yn)).sort((a,b)=>b.ev-a.ev);
  const sel=RK.selectTop(qual.map(x=>({...x,base:x.key,ath:x.id,gi:x.e.id,conf:"Medium"})),{max:10,perPlayer:(typeof SET!=='undefined'&&SET.perPlayer)||"1",perGame:(typeof SET!=='undefined'&&SET.perGame)||"3",minEdge:minE}).out;
  const watch=[];const seenP=new Set();cand.filter(x=>trusted(x.st)&&x.price==null).sort((a,b)=>b.p-a.p).forEach(x=>{if(seenP.has(x.id)||watch.length>=12)return;seenP.add(x.id);watch.push(x)});
  /* coverage: every line accounted for */
  const all=L.length,mod=L.filter(x=>!x.why).length,why={};L.forEach(x=>{const k=x.why||(!x.e||x.e.state!=="pre"?"started":x.inj&&(x.inj.lv==="out"||x.inj.lv==="doubt")?"inj":!trusted(x.st)&&!x.yn?"untrusted":x.price==null?"noPrice":x.ev<minE?"belowMin":"qualified");why[k]=(why[k]||0)+1});
  const W={notModeled:"Not modeled (defense, longest completion, first TD)",noPlayer:"Player not on this game's rosters",noHist:"Fewer than 2 games this season",started:"Game started or final",inj:"Out or doubtful",untrusted:"Stat had no backtested edge",noPrice:"Trusted stat, waiting for a price",belowMin:"Priced, below your minimum",qualified:"Priced and qualified"};
  const cov=`<details class="gcard cov"><summary><span class="eyebrow">How this week's NFL slate was evaluated</span><b>${pre.length} games to play · ${loaded} with DraftKings lines loaded · ${all} player lines · ${mod} modeled · ${priced.length} priced · ${qual.length} qualified</b>
    <div class="verdict v-${priced.length?"ok":"warn"}"><b>${priced.length?"Priced.":"No prices yet."}</b> ${priced.length?`${priced.length===1?"1 line has":priced.length+" lines have"} a price you entered or scanned.`:"ESPN's free NFL feed has DraftKings' prop lines but not their prices. Enter your book's odds or scan a screenshot and the Top List ranks by EV."}</div></summary>
    <div class="cv-t"><div class="cv-r cv-hd"><span>Where every line ended up</span><span>Lines</span></div>${Object.entries(why).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="cv-r"><span>${h(W[k]||k)}</span><span>${v}</span></div>`).join("")}</div>
    <div class="cv-t"><div class="cv-r cv-hd"><span>Backtest by stat (out of sample, ${N.model?N.model.lines:0} lines)</span><span>Right side</span></div>${N.model?Object.entries(N.model.byStat).sort((a,b)=>(b[1].hit||0)-(a[1].hit||0)).map(([k,b])=>`<div class="cv-r"><span>${h(LBL[k]||k)} ${trusted(k)?"<b class='pos'>trusted</b>":""}</span><span>${b.hit!=null?pc1(b.hit)+" of "+b.picks:"no edge"}</span></div>`).join(""):""}</div>
    <p class="hint">At standard −110 a side has to win 52.4% to break even. Only stats that beat 54% on 100+ out-of-sample picks can reach the Top List. Opponent and game-script adjustments are included; in the backtest they made no measurable difference overall.</p></details>`;
  const card=(x,i,w)=>`<div class="nf-pick ${w?"watch":""}" data-nfrow="${h(x.key)}"><div class="nf-rk">${i+1}</div>${jersey(x.id)}<div class="nf-pm"><div class="nf-pn"><span class="nf-name" data-nfprof="${x.id}">${h(x.name)}</span> <small>${h(x.posL)} · ${h(T(x.tid)[0])} ${x.c.side==="home"?"vs":"@"} ${h(T(x.c.opp)[0])}</small>${x.inj?` <span class="inj inj-${x.inj.lv==="quest"?"quest":"doubt"}">${h(x.inj.st)}</span>`:""}</div>
      <div class="nf-pl"><b class="pick ${x.side}">${x.yn?(x.st==="td2"?"2+ TDs":"Anytime TD"):`${x.side==="o"?"Over":"Under"} ${x.l}`}</b> ${h(x.yn?"":LBL[x.st])}${x.alt?` <span class="nf-alt">your line · DraftKings ${x.dkL}${x.far?" · far from DraftKings, rough":""}</span>`:""}</div>
      <div class="nf-nums"><span><i>Sharpline</i><b>${pc(x.p)}</b></span><span><i>Proj</i><b>${x.yn?"–":r1(x.P.m)}</b></span><span><i>Fair</i><b>${am(x.fair)}</b></span>${x.price!=null?`<span><i>${h(x.bk||"Your price")}</i><b>${am(x.price)}</b></span><span><i>Implied</i><b>${pc(RK.imp(x.price))}</b></span><span><i>EV</i><b class="${evc(x.ev)}">${evs(x.ev)}</b></span>`:`<span><i>Price</i><b class="ev-na">needs one</b></span>`}</div>
      <div class="nf-sub">${h(btNote(x.st))} · DraftKings line ${fresh(Date.parse(x.upd))}</div></div>
      <div class="nf-act"><button class="addbtn" data-nfpx="${h(x.key)}">${x.price!=null?"Edit price":"Enter price"}</button>${x.price!=null?`<button class="addbtn" data-nftrack="${h(x.key)}">+ Track</button><button class="addbtn" data-nfparlay="${h(x.key)}">+ Parlay</button>`:""}</div></div>`;
  return`${weekNav()}${cov}
    ${sel.length?`<div class="eyebrow tk-h">Top NFL bets · priced, positive EV</div><div class="nf-list">${sel.map((x,i)=>card(L.find(y=>y.key===x.key)||x,i)).join("")}</div>`:`<div class="empty"><b>No NFL bet qualifies yet</b>${priced.length?"None of the prices you entered clear your minimum EV on a trusted stat.":"Nothing is priced. Enter your book's odds on the lines below or scan a screenshot."}</div>`}
    ${watch.length?`<div class="eyebrow tk-h">Worth price-checking · strongest model sides on trusted stats</div><p class="hint">Not recommendations: no price yet. "Fair" is the worst price at which the bet still breaks even by Sharpline's chance.</p><div class="nf-list">${watch.map((x,i)=>card(x,i,1)).join("")}</div>`:""}`}

function propsHTML(){const L=allProps().filter(x=>N.f.g==="all"||x.e.id===N.f.g);const f=N.f;
  let rows=L.filter(x=>(f.pos==="all"||x.pos===f.pos)&&(f.st==="all"||x.st===f.st)&&(!f.q||(x.name+" "+T(x.tid)[0]+" "+T(x.tid)[1]).toLowerCase().includes(f.q.toLowerCase()))&&(f.side==="all"||x.side===f.side||f.side==="priced"&&x.price!=null));
  const so={gap:(a,b)=>(trusted(b.st)?1:0)-(trusted(a.st)?1:0)||(b.p??-1)-(a.p??-1),ev:(a,b)=>(b.ev??-9)-(a.ev??-9),line:(a,b)=>b.l-a.l,name:(a,b)=>a.name.localeCompare(b.name),stat:(a,b)=>STAT_ORDER.indexOf(a.st)-STAT_ORDER.indexOf(b.st)||(b.p??0)-(a.p??0)}[f.sort]||(()=>0);rows.sort(so);
  const stats=STAT_ORDER.filter(s=>L.some(x=>x.st===s)),games=N.events;
  const ld=N.events.filter(e=>e.state==="pre"&&!N.props[e.id]).length;
  const row=x=>{const isY=x.yn;return`<div class="nf-tr" data-nfrow="${h(x.key)}"><div class="c-pl">${jersey(x.id,"sm")}<div><span class="nf-name" data-nfprof="${x.id}">${h(x.name)}</span>${x.inj?` <span class="inj inj-${x.inj.lv==="out"?"out":x.inj.lv==="doubt"?"doubt":"quest"}">${h(x.inj.st)}</span>`:""}<small>${h(x.posL)} · ${h(T(x.tid)[0])}${x.c?` ${x.c.side==="home"?"vs":"@"} ${h(T(x.c.opp)[0])}`:""}</small></div></div>
    <div class="c-st">${h(SHORT[x.st]||x.st)}</div><div class="c-ln"><b>${isY?"Yes":x.l}</b>${x.alt?`<small class="nf-alt">yours · DK ${x.dkL}</small>`:x.lo!=null&&x.lo!==x.l?`<small>opened ${x.lo}</small>`:""}</div>
    <div class="c-pj">${x.P&&x.P.m!=null&&!isY?`<b>${r1(x.P.m)}</b>${bar(x)}`:x.why==="noHist"?"<small>under 2 games</small>":x.why?"<small>not modeled</small>":"–"}</div>
    <div class="c-ch">${x.nolean?`<b class="ev-na">No lean</b><small>backtest found no edge</small>`:x.p!=null?`<b class="pick ${x.side}">${isY?"Yes":x.side==="o"?"Over":"Under"} ${pc(x.p)}</b><small>fair ${am(x.fair)}</small>`:"–"}</div>
    <div class="c-ev">${x.price!=null?`<b class="${evc(x.ev)}">${evs(x.ev)}</b><small>${am(x.price)} ${h(x.bk||"")}</small>`:x.p!=null?`<button class="lnk" data-nfpx="${h(x.key)}">Enter price</button>`:""}</div>
    <div class="c-bt" title="${h(btNote(x.st))}">${trusted(x.st)?"<b class='pos'>✓</b>":"<small>–</small>"}</div></div>`};
  return`${weekNav()}<div class="nf-filters">
    <div class="chiprow"><button class="chip ${f.g==="all"?"on":""}" data-nfg="all">All games</button>${games.map(e=>gameChip(e,f.g===e.id)).join("")}</div>
    <div class="chiprow">${["all","QB","RB","WR","TE","K"].map(p=>`<button class="chip s ${f.pos===p?"on":""}" data-nfpos="${p}">${p==="all"?"All positions":p}</button>`).join("")}</div>
    <div class="nf-ctl"><input type="search" id="nfq" placeholder="Search player or team" value="${h(f.q)}"><select id="nfst"><option value="all">All stats</option>${stats.map(s=>`<option value="${s}" ${f.st===s?"selected":""}>${h(LBL[s]||s)}</option>`).join("")}</select>
      <select id="nfsort">${[["gap","Strongest side, backtested stats first"],["ev","Highest EV (priced)"],["stat","By stat"],["line","Line, high to low"],["name","Player name"]].map(([v,l])=>`<option value="${v}" ${f.sort===v?"selected":""}>${l}</option>`).join("")}</select>
      <span class="seg sm">${[["all","Both"],["o","Overs"],["u","Unders"],["priced","Priced"]].map(([v,l])=>`<button class="${f.side===v?"on":""}" data-nfside="${v}">${l}</button>`).join("")}</span></div></div>
    <p class="hint">${rows.length} of ${L.length} lines. DraftKings lines via ESPN; no prices in the free feed, so EV appears once you enter or scan a price. ✓ = stat with a backtested edge.${ld?` Loading ${ld} more game${ld===1?"":"s"}…`:""}</p>
    <div class="nf-table"><div class="nf-tr nf-th"><div>Player</div><div>Stat</div><div>Line</div><div>Projection</div><div>Sharpline</div><div>EV</div><div>BT</div></div>${rows.slice(0,400).map(row).join("")||`<div class="empty"><b>No lines match</b>Try another filter or week.</div>`}</div>
    ${rows.length>400?`<p class="hint">Showing 400 of ${rows.length}. Narrow by game, position or stat.</p>`:""}`}
function bar(x){if(!x.P||x.P.m==null)return"";const mx=Math.max(x.l,x.P.m)*1.25||1,lp=Math.min(100,x.l/mx*100),pp=Math.min(100,x.P.m/mx*100);return`<span class="nf-bar"><i style="width:${pp}%" class="${x.P.m>x.l?"o":"u"}"></i><em style="left:${lp}%"></em></span>`}

function linesHTML(){const evs2=N.events;
  const card=e=>{const mk=gameMarkets(e),P=N.props[e.id];const tl=P?P.team:[];const st=e.state==="in"?`<em class="nf-lv">${h(e.detail)}</em>`:e.state==="post"?`<em>Final</em>`:`<em>${new Date(e.date).toLocaleString([],{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</em>`;
    const side=(m,S,s)=>`<div class="nf-ms"><span>${S.t?h(S.t.ab)+" ":""}${m.k==="tot"?(S.side==="o"?"Over ":"Under "):""}${S.line!=null?`<b>${S.line>0&&m.k==="sp"?"+":""}${S.line}</b>`:""}</span><b class="nf-price">${am(S.price)}</b><small>${S.open!=null?`opened ${S.open>0&&m.k!=="tot"?"+":""}${S.open} · `:""}fair ${pc1(S.fair)}${S.price!=null&&S.fair!=null?` · EV ${evs(RK.ev(S.fair,S.price))}`:""}</small>${e.state==="pre"&&S.price!=null?`<span class="nf-ba"><button class="lnk" data-nflt="${e.id}|${m.k}|${s}">Track</button><button class="lnk" data-nflp="${e.id}|${m.k}|${s}">Parlay</button></span>`:""}</div>`;
    const tg={};tl.forEach(x=>{const k=x.per+" "+x.mk;(tg[k]=tg[k]||[]).push(x)});
    const nx=N.stats&&N.stats.next&&N.stats.next[e.id];const wxs=nx?(nx.ven&&nx.ven.in?"Indoors":nx.wx?`${nx.wx.temp}°F, wind ${nx.wx.wind} mph${nx.wx.rain>=1?", rain":""} (forecast)`:""):"";
    return`<div class="nf-game"><div class="nf-gh">${logo(e.away.id)}<div><b>${h(e.away.short)}</b><small>${h(e.away.rec||"")}</small></div><span class="nf-at">${e.state==="pre"?"@":`${e.away.score}–${e.home.score}`}</span><div><b>${h(e.home.short)}</b><small>${h(e.home.rec||"")}</small></div>${logo(e.home.id)}${st}</div>
      ${mk.length?`<div class="nf-mk">${mk.map(m=>`<div class="nf-mr"><div class="nf-ml">${m.lbl}</div>${side(m,m.a,"a")}${side(m,m.b,"b")}</div>`).join("")}</div>${wxs?`<div class="nf-wx">${h(nx.ven&&nx.ven.n||"")} · ${h(wxs)}</div>`:""}<div class="nf-src">${h(e.odds.book)} via ESPN ${fresh(N.sbTs)} · fair = DraftKings' price with the vig removed, so EV at DraftKings is the vig. Sharpline has no NFL team model, so it shows no edge on game lines.</div>`:`<div class="hint">No DraftKings game line posted.</div>`}
      ${Object.keys(tg).length?`<details class="nf-more"><summary>Team totals, halves and quarters · lines only</summary><div class="nf-tl">${Object.entries(tg).map(([k,xs])=>`<div><b>${h(k)}</b> ${xs.slice(0,6).map(x=>`<span>${x.team?h(T(x.team)[0])+" ":""}${x.l!=null?(x.mk==="Spread"&&x.l>0?"+":"")+x.l:"listed"}</span>`).join(" ")}</div>`).join("")}</div><p class="hint">ESPN lists these DraftKings lines without prices.</p></details>`:""}</div>`};
  return`${weekNav()}<div class="nf-games">${evs2.map(card).join("")||`<div class="empty"><b>No games this week</b></div>`}</div>
    <details class="gcard xp" style="padding:14px"><summary class="eyebrow">Expert check · no influence</summary><p class="hint">Same rule as NBA: outside picks only count with a record graded at the posted price, 200+ picks, positive closing-line value. No free NFL source meets it, so every expert gets 0% and nothing here is opinion.</p></details>`}

async function liveHTML(){const live=N.events.filter(e=>e.state==="in");if(!live.length){const nx=N.events.find(e=>e.state==="pre");return`${weekNav()}<div class="empty"><b>No NFL game in progress</b>${nx?`Next kickoff: ${h(nx.away.ab)} @ ${h(nx.home.ab)}, ${new Date(nx.date).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})}. Games turn live from ESPN's official status, not the clock.`:""}</div>`}
  await Promise.all(live.map(e=>summary(e.id,20000)));
  return`${weekNav()}<p class="hint">ESPN has no live NFL betting prices in its free feed, so in-game chances below are Sharpline's model only (box score, time left, pregame line).</p>${live.map(e=>{const B=N.box[e.id]||{};const ts=(B.teams||[]);const top=Object.entries(B.players||{}).map(([id,r])=>({id,r})).filter(x=>x.r.v.att||x.r.v.car||x.r.v.rec);
    const pl=(fn,lbl,f)=>{const x=top.filter(fn).sort((a,b)=>f(b.r.v)-f(a.r.v)).slice(0,4);return x.length?`<div class="nf-bxh">${lbl}</div>`+x.map(({id,r})=>`<div class="nf-bxr"><span class="nf-name" data-nfprof="${id}">${h(r.n)}</span><span>${h(T(r.t)[0])}</span><span>${lbl==="Passing"?`${r.v.cmp}/${r.v.att}, ${r.v.pYds} yds, ${r.v.pTD} TD, ${r.v.int} INT`:lbl==="Rushing"?`${r.v.car} car, ${r.v.rYds} yds, ${r.v.rTD} TD`:`${r.v.rec}/${r.v.tgt} tgt, ${r.v.recYds} yds, ${r.v.recTD} TD`}</span></div>`).join(""):""};
    const poss=e.sit&&e.sit.poss?(e.sit.poss===e.home.id?e.home.ab:e.sit.poss===e.away.id?e.away.ab:""):"";
    return`<div class="nf-game live"><div class="nf-gh">${logo(e.away.id)}<div><b>${h(e.away.short)}</b><small>${h(e.away.rec||"")}</small></div><span class="nf-at big">${e.away.score}–${e.home.score}</span><div><b>${h(e.home.short)}</b><small>${h(e.home.rec||"")}</small></div>${logo(e.home.id)}<em class="nf-lv">${h(e.detail)}</em></div>
      ${e.sit?`<div class="nf-sit">${poss?`<b>${h(poss)} ball</b> · `:""}${h(e.sit.dd||"")}${e.sit.yl?` · ${h(e.sit.yl)}`:""}${e.sit.rz?` · <b class="neg">Red zone</b>`:""}${e.sit.last?`<small>${h(e.sit.last)}</small>`:""}</div>`:""}
      ${ts.length===2?`<div class="nf-ts">${["totalYards","netPassingYards","rushingYards","turnovers","thirdDownEff","possessionTime"].map(k=>`<div><span>${h(ts[0].s[k]??"–")}</span><i>${{totalYards:"Total yds",netPassingYards:"Pass yds",rushingYards:"Rush yds",turnovers:"Turnovers",thirdDownEff:"3rd down",possessionTime:"Possession"}[k]}</i><span>${h(ts[1].s[k]??"–")}</span></div>`).join("")}</div>`:""}
      <div class="nf-bx">${pl(x=>x.r.v.att>=5,"Passing",v=>v.pYds)}${pl(x=>x.r.v.car>0,"Rushing",v=>v.rYds)}${pl(x=>x.r.v.rec>0||x.r.v.tgt>0,"Receiving",v=>v.recYds)}</div><div class="nf-src">ESPN box score ${fresh(B.ts)}</div></div>`}).join("")}`}

/* ---------- player profile ---------- */
function profileHTML(id){const a=ath(id);if(!a)return`<div class="empty"><b>Player not found</b></div>`;const pos=M.grp(a[1]),games=(N.I.P[id]||[]),tm=T(a[2]);
  const e=N.events.find(x=>x.home.id===a[2]||x.away.id===a[2]);const c=e?ctxFor(e,id):null;const inj=N.inj[id];
  const cols=pos==="QB"?[["cmp","Cmp"],["att","Att"],["pYds","Yds"],["pTD","TD"],["int","INT"],["car","Car"],["rYds","Rush"]]:pos==="RB"?[["car","Car"],["rYds","Rush yds"],["rTD","Rush TD"],["tgt","Tgt"],["rec","Rec"],["recYds","Rec yds"],["recTD","Rec TD"]]:pos==="K"?[["fgM","FG"],["fgA","FGA"],["xpM","XP"],["kPts","Pts"]]:[["tgt","Tgt"],["rec","Rec"],["recYds","Yds"],["recLng","Long"],["recTD","TD"],["car","Car"],["rYds","Rush"]];
  const avg=k=>games.length?r1(games.reduce((s,g)=>s+(g.v[k]||0),0)/games.length):"–";
  const myProps=e&&N.props[e.id]?Object.values(N.props[e.id].lines).filter(L=>L.ath===id).map(L=>evalProp(e,L)):[];
  const oppRows=c?[["pass","Passing yds",v=>v.pYds],["rush","Rushing yds",v=>v.rYds],["rec","Receiving yds",v=>v.recYds],["recs","Receptions",v=>v.rec],["td","TDs",v=>v.rTD+v.recTD]].map(([f,l])=>{const D=N.DEF(c.opp,pos,f);return D.n?`<div class="cv-r"><span>${l} allowed to ${pos}s</span><span>${D.ra!=null?Math.round(D.ra*100)+"% of avg":"–"}</span><span>${D.n} gm</span></div>`:""}).join(""):"";
  return`<div class="nf-ph">${jersey(id,"lg")}<div><h2>${h(a[0])}</h2><div class="nf-pmeta">${h(a[1])} · ${h(tm[1])} · #${h(a[3]||"–")}</div>
      ${inj?`<div class="inj-line"><span class="inj inj-${inj.lv==="out"?"out":inj.lv==="doubt"?"doubt":"quest"}">${h(inj.st)}</span> ${h(inj.txt)} <small>ESPN injury report, ${new Date(inj.date).toLocaleDateString([],{month:"short",day:"numeric"})}</small></div>`:`<div class="nf-pmeta"><small>No injury designation on ESPN's report${N.injTs?` (checked ${ago(N.injTs)})`:""}</small></div>`}
      ${e&&c?`<div class="nf-pmeta">${c.side==="home"?"vs":"@"} ${h(T(c.opp)[1])} · ${new Date(e.date).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})}${c.spread!=null?` · ${h(tm[0])} ${c.spread>0?"+":""}${c.spread}, total ${c.total}`:""}</div>`:""}</div></div>
    <section class="pf-card"><div class="eyebrow">Season · ${games.length} games</div><div class="nf-stats">${cols.map(([k,l])=>`<div><b>${avg(k)}</b><i>${l}/g</i></div>`).join("")}</div>
      ${(()=>{const xs=games.map(g=>g.x||{});const av=f=>{const v=xs.map(f).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};const sn=av(x=>x.snap),ts=av(x=>x.ts),as=av(x=>x.as);
        const ay=games.reduce((a,g)=>a+((g.x||{}).ay||0),0),tg=games.reduce((a,g)=>a+(g.v.tgt||0),0),prs=av(x=>x.prs);const last2=xs.slice(-2).map(x=>x.snap).filter(v=>v!=null);
        const cells=[sn!=null&&["Snap share",pc(sn)+(last2.length===2?` <small>last 2: ${pc((last2[0]+last2[1])/2)}</small>`:"")],ts!=null&&pos!=="QB"&&["Target share",pc(ts)],as!=null&&pos!=="QB"&&["Air-yard share",pc(as)],tg>=5&&pos!=="QB"&&["Depth per target",r1(ay/tg)+" yds"],prs!=null&&["Pressured",pc(prs)+" of dropbacks"]].filter(Boolean);
        return cells.length?`<div class="nf-stats nf-adv">${cells.map(([l,v])=>`<div><b>${v}</b><i>${l}</i></div>`).join("")}</div><p class="hint">Snap counts, targets, air yards and pressure: nflverse (free open data), updated nightly.</p>`:""})()}</section>
    ${myProps.length?`<section class="pf-card"><div class="eyebrow">This week's DraftKings lines</div>${myProps.map(x=>{const hits=x.P&&x.P.hits!=null?`${x.P.hits} of ${x.P.n} games over ${x.l}`:"";const lastN=x.P&&x.P.last?x.P.last.length:0;return`<div class="nf-pp"><div><b>${h(LBL[x.st]||x.st)} ${x.l}</b><small>${hits}${x.P&&x.P.last?` · last ${lastN}: ${x.P.last.join(", ")}`:""}</small><small>${h(btNote(x.st))}</small></div><div>${x.nolean?`<b class="ev-na">No lean</b><small>proj ${r1(x.P.m)} · backtest found no edge</small>`:x.p!=null?`<b class="pick ${x.side}">${x.side==="o"?"Over":"Under"} ${pc(x.p)}</b><small>proj ${r1(x.P.m)} · fair ${am(x.fair)}</small>`:"<small>not modeled</small>"}</div><button class="addbtn" data-nfpx="${h(x.key)}">Price</button></div>`}).join("")}${myProps[0]&&myProps[0].P?`<p class="hint">How the projection was built: ${h((myProps.find(x=>x.P&&x.P.parts)||{P:{parts:[]}}).P.parts.join("; "))}.</p>`:""}</section>`:""}
    ${oppRows?`<section class="pf-card"><div class="eyebrow">${h(T(c.opp)[1])} defense vs ${pos}s this season</div><div class="cv-t">${oppRows}</div><p class="hint">Relative to the league average per game. Under about 8 games this is mostly noise.</p></section>`:""}
    <section class="pf-card"><div class="eyebrow">Game log</div><div class="nf-gl"><div class="nf-glr th"><span>Wk</span><span>Opp</span>${cols.map(([,l])=>`<span>${l}</span>`).join("")}</div>${games.slice().reverse().map(g=>`<div class="nf-glr"><span>${g.w}</span><span>${g.home?"":"@"}${h(T(g.opp)[0])}</span>${cols.map(([k])=>`<span>${g.v[k]??0}</span>`).join("")}</div>`).join("")||`<div class="hint">No games recorded this season.</div>`}</div></section>`}
function openProfile(id){let el=document.getElementById("nfProf");if(!el){el=document.createElement("div");el.id="nfProf";el.className="prof";document.body.appendChild(el)}
  el.innerHTML=`<div class="pf-in"><div class="pf-bar"><button class="pf-back" data-nfprofclose="1"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</button></div>${profileHTML(id)}</div>`;el.classList.add("on");el.scrollTop=0;document.body.classList.add("pf-lock")}
function closeProfile(){const el=document.getElementById("nfProf");if(!el)return;el.classList.add("out");document.body.classList.remove("pf-lock");setTimeout(()=>el.classList.remove("on","out"),260)}

/* ---------- scanner: NFL names, teams and stat words ---------- */
const OCR_STATS=[[/pass(ing)?\s*\+\s*rush(ing)?\s*y/i,"pRYds"],[/rush(ing)?\s*\+\s*rec(eiving)?\s*y/i,"rRecYds"],[/pass(ing)?\s*y(ar)?ds?|pass yds/i,"pYds"],[/pass(ing)?\s*(td|touchdown)/i,"pTD"],[/completions?|\bcmp\b/i,"cmp"],[/pass(ing)?\s*att/i,"att"],[/interception|\bints?\b/i,"int"],
  [/rush(ing)?\s*y(ar)?ds?/i,"rYds"],[/rush(ing)?\s*att|carries/i,"car"],[/longest\s*rush/i,"rLng"],[/longest\s*rec|longest\s*catch/i,"recLng"],[/rec(eiving)?\s*y(ar)?ds?/i,"recYds"],[/receptions?|\bcatches\b|\brec\b/i,"rec"],[/kicking\s*p|kick(er)?\s*pts/i,"kPts"],[/field\s*goals?/i,"fgM"],[/extra\s*points?/i,"xpM"],[/anytime\s*(td|touchdown)/i,"td"]];
function ocrCtx(){const names=[],seen=new Set();N.events.forEach(e=>{const P=N.props[e.id];if(!P)return;Object.values(P.lines).forEach(L=>{const a=ath(L.ath);if(!a||seen.has(L.ath))return;seen.add(L.ath);names.push({p:a[0],ab:T(a[2])[0],id:L.ath,eid:e.id})})});
  const teams=[];N.events.forEach(e=>[e.home,e.away].forEach(t=>teams.push({full:t.name,ab:t.ab,nick:t.name.toLowerCase().split(" ").pop(),id:t.id,eid:e.id})));return{names,teams,statRe:OCR_STATS}}
/* scanned rows: props become entered prices on the matching DraftKings line (exact line only); game lines are checked against DraftKings */
function applyScan(rows){const C=ocrCtx();let n=0;const miss=[];
  rows.forEach(r=>{if(r.k==="P"){const nm=C.names.find(x=>x.p===r.player)||C.names.find(x=>x.p.toLowerCase()===String(r.player||"").toLowerCase());if(!nm){miss.push(`${r.player}: not on this week's NFL board`);return}
      const P=N.props[nm.eid],L=P&&P.lines[nm.id+"|"+r.stat];if(!L){miss.push(`${r.player} ${SHORT[r.stat]||r.stat}: DraftKings has no line for this`);return}
      N.px[pxKey(nm.eid,nm.id,r.stat,L.l)]={o:r.over,u:r.under,L:r.line!==L.l?r.line:undefined,bk:r.book||"Scanned",ts:Date.now()};n++;if(r.line!==L.l)miss.push(`${r.player} ${SHORT[r.stat]}: your book ${r.line}, DraftKings ${L.l}. Priced at your ${r.line}.`)}
    else{const e=N.events.find(x=>x.home.ab===r.ab||x.away.ab===r.ab);if(!e||r.odds==null){miss.push(`${r.ab} ${r.mk}: no game this week to compare with`);return}
      const m=gameMarkets(e).find(z=>z.k===(r.mk==="moneyline"?"ml":r.mk==="spread"?"sp":"tot"));if(!m){miss.push(`${r.ab} ${r.mk}: DraftKings has no line`);return}
      const S=r.mk==="total"?(r.side==="under"?m.b:m.a):(e.home.ab===r.ab?m.b:m.a);
      if(r.mk!=="moneyline"&&r.line!==S.line){miss.push(`${r.ab} ${r.mk} ${r.line}: DraftKings is at ${S.line}, so the no-vig chance doesn't apply to this number`);return}
      miss.push(`${r.ab} ${r.mk}${r.line!=null?" "+r.line:""} at ${am(r.odds)}: DraftKings no-vig chance ${pc1(S.fair)}, EV ${evs(RK.ev(S.fair,r.odds))} (${RK.ev(S.fair,r.odds)>0?"better than the market's fair price":"no edge"})`)}});savePx();paint();return{n,miss}}

/* ---------- render + events ---------- */
async function ensure(){if(!N.stats)await loadStatic();if(!N.stats)return;if(N.week==null)N.week=N.stats.week;await loadWeek();loadInj().then(()=>paint());
  const pre=N.events.filter(e=>e.state==="pre"&&!N.props[e.id]);if(pre.length&&!N.allBusy){N.allBusy=1;loadAllProps().then(()=>{N.allBusy=0;paint()})}}
let paintT=0;async function paint(){if(!N.on)return;clearTimeout(paintT);const v=N.view,id=VIEWS[v];if(!id)return;const el=document.getElementById(id);if(!el)return;
  if(!N.stats){el.innerHTML=`<div class="empty"><b>${N.err?h(N.err):"Loading NFL…"}</b>${N.err?"Refresh to try again.":""}</div>`;return}
  try{const html=v==="top"?topHTML():v==="props"?propsHTML():v==="lines"?linesHTML():await liveHTML();const q=document.activeElement&&document.activeElement.id==="nfq"?document.activeElement.selectionStart:null;
    el.innerHTML=html;if(q!=null){const i=document.getElementById("nfq");if(i){i.focus();i.setSelectionRange(q,q)}}}catch(err){console.error(err);el.innerHTML=`<div class="empty"><b>Something went wrong showing NFL</b>${h(err.message)}</div>`}}
async function show(v){N.view=v||N.view;paint();await ensure();paint();if(N.view==="live"||N.events.some(e=>e.state==="in"))startPoll()}
let pollT=null;function startPoll(){if(pollT)return;pollT=setInterval(async()=>{if(!N.on||document.hidden)return;const live=N.events.some(e=>e.state==="in");if(!live&&N.view!=="live"){clearInterval(pollT);pollT=null;return}
  await loadWeek(true);if(N.view==="live")paint();if(window.LiveUI)LiveUI.paintTracker();gradeAll()},20000)}
function setOn(on){N.on=on;if(on)show()}
const findRow=k=>allProps().find(x=>x.key===k);
document.addEventListener("click",e=>{const t=e.target.closest("[data-nfwk],[data-nfg],[data-nfpos],[data-nfside],[data-nfpx],[data-nftrack],[data-nfparlay],[data-nfprof],[data-nfprofclose],[data-nfclose],[data-nfsave],[data-nfclear],[data-nflt],[data-nflp]");if(!t)return;const d=t.dataset;
  if(d.nfwk){const w=N.week+(+d.nfwk);if(w<1){return}const cal=(N.cal||[]).find(c=>+c.value===N.stype);const max=cal&&cal.entries?cal.entries.length:18;if(w>max){if(N.stype===2){N.stype=3;N.week=1}else return}else N.week=w;N.events=[];N.f.g="all";paint();ensure().then(paint);return}
  if(d.nfg){N.f.g=d.nfg;saveF();paint();return}if(d.nfpos){N.f.pos=d.nfpos;saveF();paint();return}if(d.nfside){N.f.side=d.nfside;saveF();paint();return}
  if(d.nfpx){const x=findRow(d.nfpx);if(x)oddsSheet(x);return}
  if(d.nftrack){track(betFromProp(findRow(d.nftrack)));return}if(d.nfparlay){const x=findRow(d.nfparlay);if(x&&x.price==null){toast("Enter your book's price first");return}parlay(betFromProp(x));return}
  if(d.nflt||d.nflp){const[eid,mk,s]=(d.nflt||d.nflp).split("|");const ev=gameOf(eid);const b=ev&&betFromLine(ev,mk,s);if(d.nflt)track(b);else parlay(b);return}
  if(d.nfprof){e.stopPropagation();openProfile(d.nfprof);return}if(d.nfprofclose){closeProfile();return}
  if(d.nfclose){document.getElementById("nfOdds").classList.remove("on");return}
  if(d.nfclear){delete N.px[d.nfclear];savePx();document.getElementById("nfOdds").classList.remove("on");paint();toast("Price cleared");return}
  if(d.nfsave){const o=parseAm((document.getElementById("nfO")||{}).value),u=parseAm((document.getElementById("nfU")||{}).value);if(o==null&&u==null){toast("Enter at least one price, like -115");return}
    const Lraw=parseFloat(((document.getElementById("nfL")||{}).value||"").replace(",","."));const x0=findRow(d.nfsave);const dk=x0?(x0.dkL??x0.l):null;
    N.px[d.nfsave]={o,u,L:!isNaN(Lraw)&&dk!=null&&Lraw!==dk?Lraw:undefined,bk:((typeof BOOK!=='undefined'&&BOOK)||"Your book"),ts:Date.now()};savePx();document.getElementById("nfOdds").classList.remove("on");paint();const x=findRow(d.nfsave);toast(x&&x.ev!=null?`EV ${evs(x.ev)} at ${am(x.price)}`:"Price saved");return}},true);
document.addEventListener("input",e=>{if(["nfL","nfO","nfU"].includes(e.target.id)){sheetPreview();return}if(e.target.id==="nfq"){N.f.q=e.target.value;saveF();clearTimeout(paintT);paintT=setTimeout(paint,180)}});
document.addEventListener("change",e=>{if(e.target.id==="nfst"){N.f.st=e.target.value;saveF();paint()}if(e.target.id==="nfsort"){N.f.sort=e.target.value;saveF();paint()}});
/* grade any open NFL bets shortly after load and every few minutes */
setTimeout(()=>{if(BETS.some(b=>!b.res&&(b.sport==="nfl"||(b.legs||[]).some(l=>l.spec&&l.spec.sport==="nfl"))))gradeAll()},4000);
setInterval(()=>{if(!document.hidden&&BETS.some(b=>!b.res&&(b.sport==="nfl"||(b.legs||[]).some(l=>l.spec&&l.spec.sport==="nfl"))))gradeAll()},180000);
window.NFL={N,show,setOn,paint,ensure,betChance,gradeAll,ocrCtx,applyScan,openProfile,allProps,loadStatic,_eval:{evalProp,gradeSpec,statVal}};
})();
