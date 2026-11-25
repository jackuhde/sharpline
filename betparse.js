/* Universal bet parser. Text in (lines read from a screenshot, or pasted text), bets out.
   A bet is one selection or a parlay whose legs stay together. Works on wording, not on any one sportsbook's layout:
   one-line tips ("Mahomes O 275.5 pass yds -115"), stacked slip layouts (name / stat / side and line / odds),
   board rows with both sides, game lines (Chiefs -3.5, Ravens ML, Game O 44.5, team totals), "6+ receptions",
   anytime / first TD, pick'em (More/Less with a payout multiplier) and prediction-market YES/NO contracts in cents.
   Nothing is guessed: anything that can't be read is listed in leg.missing, and unmatched names stay as written. */
(function(root){
const SO=(typeof window!=="undefined"&&window.SharpOCR)||require("./ocrparse.js").SharpOCR;
const norm=x=>(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z ]/g," ").replace(/\b(jr|sr|ii|iii|iv)\b/g," ").replace(/\s+/g," ").trim();

/* market words. Specific phrases first: "longest reception" before "reception", "rush + rec yards" before either */
const STATS=[
 ["nfl","pRYds",/pass(ing)?\s*(\+|and|&)\s*rush(ing)?(\s*y(ar)?ds?)?/i],
 ["nfl","rRecYds",/rush(ing)?\s*(\+|and|&)\s*rec(eiving)?(\s*y(ar)?ds?)?|scrimmage\s*y/i],
 ["nfl","pLng",/longest\s*(pass|completion)/i],["nfl","rLng",/longest\s*rush/i],["nfl","recLng",/longest\s*(rec(eption)?|catch)/i],
 ["nfl","pYds",/pass(ing)?\s*y(ar)?ds?/i],["nfl","pTD",/pass(ing)?\s*(td|touchdown)s?|\bptds?\b/i],
 ["nfl","cmp",/completions?|\bcmp\b/i],["nfl","att",/pass(ing)?\s*att(empt)?s?/i],["nfl","int",/interceptions?|\bints?\b/i],
 ["nfl","car",/rush(ing)?\s*att(empt)?s?|\bcarries\b/i],["nfl","rYds",/rush(ing)?\s*y(ar)?ds?/i],
 ["nfl","recYds",/rec(eiving)?\s*y(ar)?ds?/i],["nfl","tgt",/\btargets?\b/i],["nfl","rec",/receptions?|\bcatches\b|\brec\b/i],
 ["nfl","kPts",/kick(ing|er)?\s*(pts|points)/i],["nfl","fgM",/field\s*goals?(\s*made)?|\bfgs?\s*made\b/i],["nfl","xpM",/extra\s*points?(\s*made)?/i],
 ["nfl","td2",/\b2\s*\+\s*(td|touchdown)s?\b/i],["nfl","td1",/first\s*(td|touchdown)|\b1st\s*(td|touchdown)|\bftd\b/i],
 ["nfl","td",/any\s*time\s*(td|touchdown)|\battd\b|to\s*score\s*(a\s*)?(td|touchdown)|\b(td|touchdown)\s*scorer\b/i],
 ["nba","Pts+Reb+Ast",/pts\s*\+\s*reb\s*\+\s*ast|points\s*\+\s*rebounds\s*\+\s*assists|\bpra\b|\bp\s*\+\s*r\s*\+\s*a\b/i],
 ["nba","Pts+Reb",/pts\s*\+\s*rebs?|points\s*\+\s*rebounds|\bp\s*\+\s*r\b/i],["nba","Pts+Ast",/pts\s*\+\s*asts?|points\s*\+\s*assists|\bp\s*\+\s*a\b/i],
 ["nba","Reb+Ast",/rebs?\s*\+\s*asts?|rebounds\s*\+\s*assists|\br\s*\+\s*a\b/i],
 ["nba","3-Pointers",/threes|three\s*pointers?|3[\s-]*p(t|oint)(er)?s?(\s*made)?|\b3pm\b|made\s*3s?|\b3s\b|\b3\w{0,2}\s+made\b/i],
 ["nba","Rebounds",/rebounds?|\brebs?\b/i],["nba","Assists",/assists?|\basts?\b/i],["nba","Steals",/steals?|\bstl\b/i],["nba","Blocks",/blocks?|\bblk\b/i],
 ["nba","Turnovers",/turnovers?|\btov\b/i],["nba","Points",/points|\bpts\b/i]];
const YN_STATS=new Set(["td","td1","td2"]);
const NOT_MODELED={tgt:"Targets",td1:"First touchdown"};
function statOf(t){for(const[sp,st,re]of STATS){const m=re.exec(t);if(m)return{sport:sp,st,m:m[0]}}return null}

const PARLAY_RE=/\bparlay\b|\b\d+\s*[- ]?\s*(leg|pick|team)s?\b(?!\s*total)|\bsgp\+?\b|same[\s-]*game|\bteaser\b|\bpower\s*play\b|\bflex\s*play\b/i;
const SLIP_RE=/\bbet\s*slip\b|\bto\s*win\b|\bpayout\b|\bwager\b|\bbet\s*placed\b|\bpotential\b/i;
const UI_WORDS=new Set("home parlay parlays my bets trades search menu account promos promotions live sports casino popular markets info game lines first half second quarter player props fast featured activity sgp favorites favourites rewards wallet profile settings all upcoming".split(" "));
const isUI=t=>{const w=t.toLowerCase().replace(/[^a-z ]/g," ").split(/\s+/).filter(Boolean);return w.length>=2&&w.every(x=>UI_WORDS.has(x))};
const NOISE_RE=/^(@\w+\s*$|\d+\s*[smhd]\s*$|(like|reply|replies|repost|retweet|share|follow|following|views?|bookmark|translate post|show more|cash ?out|tail|fade)\b|[\d.,]+k?\s*(likes|views|replies|reposts|comments)\b)/i;
const PICKEM=new Set(["PrizePicks","Underdog","Sleeper","Betr","Dabble"]);
const BOOK_EXTRA=[["sleeper","Sleeper"],["rebet","Rebet"],["thrillzz","Thrillzz"]];
function detectBook(all){return SO.detectBook(all)||(()=>{const t=(all||"").toLowerCase();for(const[re,n]of BOOK_EXTRA)if(new RegExp("\\b"+re).test(t))return n;return null})()}

/* names: full name anywhere in the text, else last name (plus first initial when given). Several matches are kept as candidates. */
function matchName(t,names){const n=" "+norm(t)+" ";if(n.trim().length<3)return null;let best=null;
  for(const x of names){const xn=norm(x.p);if(xn.length>4&&n.includes(" "+xn+" ")&&(!best||xn.length>norm(best.p).length))best=x}
  if(best)return{x:best,cands:[best]};
  const toks=n.trim().split(" ");const hits=[];
  names.forEach(x=>{const parts=norm(x.p).split(" "),last=parts[parts.length-1];if(last.length<4||!toks.includes(last))return;
    const fi=parts[0];const i=toks.indexOf(last),prev=toks[i-1]||"";const sc=prev===fi?3:prev.length===1&&prev===fi[0]?2:prev&&/^[a-z]$/.test(prev)?-1:1;if(sc>0)hits.push({x,sc})});
  if(!hits.length){/* close spelling (a misread letter or two): unique match at 80%+ similarity, marked fuzzy so the field is flagged */
    const lev=(a,b)=>{const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
    let fz=[];for(const x of names){const xn=norm(x.p),k=xn.split(" ").length;if(xn.length<10)continue;for(let i=0;i+k<=toks.length;i++){const w=toks.slice(i,i+k).join(" ");const sim=1-lev(w,xn)/Math.max(w.length,xn.length);if(sim>=.75)fz.push({x,sim})}}
    if(!fz.length)return null;const tb=Math.max(...fz.map(f=>f.sim)),fc=[...new Map(fz.filter(f=>f.sim===tb).map(f=>[f.x.sport+"|"+norm(f.x.p),f.x])).values()];
    return fc.length===1?{x:fc[0],cands:fc,fuzzy:true}:{x:null,cands:fc}}
  const top=Math.max(...hits.map(h=>h.sc)),c=hits.filter(h=>h.sc===top).map(h=>h.x);
  const uniq=[...new Map(c.map(x=>[x.sport+"|"+norm(x.p),x])).values()];return uniq.length===1?{x:uniq[0],cands:uniq}:{x:null,cands:uniq}}
function matchTeams(t,teams){const n=" "+norm(t)+" ",up=" "+t.replace(/[^A-Za-z ]/g," ")+" ",out=[];
  teams.forEach(T=>{const full=norm(T.full),nick=T.nick;if(n.includes(" "+full+" ")||(nick.length>3&&n.includes(" "+nick+" "))||(T.city&&T.city.length>3&&n.includes(" "+T.city+" ")&&false)||up.includes(" "+T.ab+" "))out.push({...T,pos:Math.max(n.indexOf(" "+nick+" "),up.indexOf(" "+T.ab+" "))})});
  out.sort((a,b)=>a.pos-b.pos);return out}
const looksName=s=>/^\p{Lu}[\p{L}.'’-]+(\s+\p{Lu}[\p{L}.'’-]+){1,2}(\s+(Jr|Sr|II|III|IV)\.?)?$/u.test((s||"").trim());

/* one line of text into the things a bet is made of */
function feats(raw,ctx){const F={raw:raw.trim(),pm:null,conv:false,thr:false};
  /* social-post furniture: @handles anywhere, and post ages like "· 2h" or "5m ago" */
  let t=" "+raw.replace(/^\s*@\w+:?\s*/,"").replace(/(^|\s)@\w+/g," ").replace(/[·•\-]\s*\d{1,2}\s?[smhdw]\b|\b\d{1,2}\s?(?:min|hr|h|m|d)s?\s+ago\b/gi," ")+" ";
  /* prediction-market contracts: "YES 62¢", "No 37c", "YES contract at 62 cents", "Yes $0.48" */
  const pmRe=/\b(?:buy\s+)?(yes|no)\b[^\d$\n]{0,22}?(?:\$\s?0?\.(\d{2})\b|(\d{1,2}(?:\.\d)?)\s*(?:¢|c\b|cents?\b))/gi;let m;const pmh=[];
  while((m=pmRe.exec(t)))pmh.push({side:m[1].toLowerCase(),c:+(m[2]||m[3])});
  if(pmh.length){F.pm={yes:(pmh.find(x=>x.side==="yes")||{}).c??null,no:(pmh.find(x=>x.side==="no")||{}).c??null,pick:pmh.length===1?pmh[0].side:null};t=t.replace(pmRe," ")}
  const q=t.match(/\b(\d{1,6})\s*(contracts?|shares)\b/i);if(q)F.qty=+q[1];
  /* "6+ receptions" means 6 or more: Over 5.5 (but "2+ TDs" is its own market) */
  t=t.replace(/(^|[\s(])(\d{1,3})\s*\+(?=\s*(?:[A-Za-z]))(?!\s*(?:td|touchdown)s?\b)/gi,(s,a,n)=>{F.thr=true;return a+"Over "+(+n-0.5)+" "});
  t=t.replace(/(^|\s)0(\d{1,3}\.\d)\b/g,"$1o $2");const pre=t;t=SO.fixText(t);F.conv=/⁽[ᵈᶠ]⁾/.test(t);t=t.replace(/⁽.⁾/g,"");
  t=t.replace(/\$\s?[\d,]+(\.\d+)?/g," $$ ").replace(/\b\d{1,2}:\d{2}\s*(am|pm|et|pt|ct)?\b/gi," ").replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g," ").replace(/\b\d+(\.\d+)?\s*%/g," ").replace(/\b\d+(\.\d+)?\s*x\b/gi," ");
  F.t=t;F.ml=/\b(ml|moneyline|money\s*line)\b/i.test(t)||/\bto\s*win\b(?!\s*\$|\s*:)/i.test(pre)&&!/\$/.test(pre);
  F.tt=/\bteam\s*total\b|\btt\b/i.test(t);F.tot=/\b(game\s*)?total\b|\bo\/u\b|\bgame\s+(over|under|o|u)\b/i.test(t);
  F.st=statOf(t);
  const odds=[];const oRe=/(?<![\w.])([+-]\d{3,5})(?![\d.])/g;while((m=oRe.exec(t))){const v=+m[1];if(Math.abs(v)>=100)odds.push({v,i:m.index})}
  if(/\b(even|evens|ev)\b/i.test(pre)&&!odds.length)odds.push({v:100,i:t.search(/\beven/i)});F.odds=odds;
  const sides=[];const sRe=/\b(over|under|more|less|higher|lower)\b|\b([ou])\s*(?=\d)/gi;while((m=sRe.exec(t))){const w=(m[1]||m[2]).toLowerCase();sides.push({s:/^(o|over|more|higher)$/.test(w)?"over":"under",i:m.index})}
  F.sides=sides;
  /* digits that are part of the market's name ("3PT Made", "3-pointers") are not a line */
  if(F.st&&/\d/.test(F.st.m||""))t=t.replace(F.st.m," ".repeat(F.st.m.length));
  const nums=[];const nRe=/(?<![\w.+-])(\d{1,3}(?:\.\d)?)(?![\d.%¢\w])/g;while((m=nRe.exec(t)))nums.push({v:+m[1],i:m.index});F.nums=nums;
  const sp=[];const spRe=/(?<![\w.])([+-]\d{1,2}(?:\.5)?)(?![\d.])|\b(pk|pick'?em)\b/gi;while((m=spRe.exec(t))){const v=m[2]?0:+m[1];if(Math.abs(v)<=45)sp.push({v,i:m.index})}F.sp=sp;
  F.yn=F.st&&YN_STATS.has(F.st.st);
  const nm=matchName(t,ctx.names||[]);F.name=nm&&nm.x;F.cands=nm?nm.cands:[];F.fuzzy=!!(nm&&nm.fuzzy);
  F.teams=matchTeams(t,ctx.teams||[]);
  /* a capitalized name we don't know, written right before the selection */
  if(!F.name&&!F.cands.length){const cut=t.split(/\b(?:over|under|more|less|o|u)\b|\d|\banytime\b|\bto score\b|\b(?:yes|no)\b/i)[0].replace(/[^\p{L}.'’ -]/gu," ").trim();
    const w=cut.split(/\s+/).filter(x=>/^\p{Lu}/u.test(x)).slice(-3).join(" ");if(looksName(w)&&!w.split(" ").some(x=>UI_WORDS.has(x.toLowerCase()))&&!F.teams.some(T=>w.toLowerCase().includes(T.nick))&&!statOf(w))F.rawName=w}
  F.hasSel=!!(sides.length||F.yn||F.pm||F.ml||sp.length||F.thr);
  F.pureOdds=odds.length>=1&&!sides.length&&!nums.length&&!F.name&&!F.rawName&&!F.teams.length&&!F.st&&!F.pm&&t.replace(/[+-]\d{3,5}|odds|\$|[^\w]/gi,"").length<3;
  return F}

const c2am=c=>{const p=c/100;return p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p)};
function newLeg(o){return Object.assign({sport:null,mk:null,player:null,cands:[],team:null,teams:[],stat:null,side:null,line:null,odds:null,over:null,under:null,pm:null,alt:false,raw:"",missing:[]},o)}

/* split "A over 1.5 + B under 2.5 +240" or "A o26.5, B o22.5" into parts when every part is a selection */
function splitCombo(line,ctx){for(const[re,par]of[[/\s\+\s|\s&\s|\s\|\s/,1],[/,\s+|;\s+|\s\/\s/,0]]){const parts=line.split(re).map(s=>s.trim()).filter(Boolean);if(parts.length<2)continue;
    const fs=parts.map(p=>feats(p,ctx));if(fs.every(F=>(F.name||F.rawName||F.teams.length||F.st)&&(F.sides.length||F.yn||F.ml||F.sp.length||F.thr)))return{parts,parlay:par}}return null}

function parseBlock(lines,ctx){const legs=[],loose=[];let player=null,stat=null,secStat=null,teams=[],pend=null;
  const all=lines.join("\n"),book=detectBook(all);
  /* a value on a later line fills a gap in the bet above, but never across a new player's name */
  const fillBack=(field,val,i)=>{const L=legs[legs.length-1];if(!L||i-L._i>3||L._closed)return false;
    if(field==="pm"&&L.mk==="prop"&&(L.side==null||L.alt)&&L.over==null&&L.odds==null&&!L.pm&&val.pm.yes!=null&&val.pm.no!=null){L.side=null;L.over=c2am(val.pm.yes);L.under=c2am(val.pm.no);L.pm={yes:val.pm.yes,no:val.pm.no,qty:val.qty||null};L.missing=[];
      /* a yes/no contract on a whole number ("25 points") is "25 or more", which is Over 24.5; flagged for the user to confirm */
      if(Number.isInteger(L.line)){L.line-=.5;L.lineGuess=1}return true}
    if(field==="pm"&&(L.mk==="prop"||L.mk==="ml")&&L.odds==null&&!L.pm){setPM(L,val);L.missing=[];return true}
    if(field==="player"&&!L.player&&L.mk==="prop"){L.player=val.p;L.sport=L.sport||val.sport;L.cands=[val];return true}
    if(field==="stat"&&!L.stat&&L.mk==="prop"){L.stat=val.st;L.sport=L.sport||val.sport;return true}
    if(field==="odds"&&L.odds==null&&(L.side||L.mk==="spread"||L.mk==="ml")&&L.mk!=="pm"){L.odds=val;return true}
    if(field==="odds"&&L.side==null&&L.mk==="prop"&&L.over!=null&&L.under==null){L.under=val;return true}return false};
  let combo=false;const flat=[];lines.forEach(l=>{
    /* both teams of one market side by side ("DAL +235   DEN -250", "DAL +7.5 -110   DEN -7.5 -110"): two listed prices, not a pick */
    const cols=l.split(/\s{3,}/).map(x=>x.trim()).filter(Boolean);
    if(cols.length===2){const fs=cols.map(c=>feats(c,ctx));if(fs.every(F=>F.teams.length===1&&!F.name&&!F.st&&(F.odds.length||F.pm))&&fs[0].teams[0].ab!==fs[1].teams[0].ab){cols.forEach(c=>flat.push({t:c,pair:1}));return}}
    const s=splitCombo(l,ctx);if(s){if(s.parlay)combo=true;s.parts.forEach(p=>flat.push({t:p,grp:s.parlay}))}else flat.push({t:l})});
  flat.forEach((row,i)=>{const raw=row.t;if(!raw.trim()||NOISE_RE.test(raw.trim())||isUI(raw))return;const F=feats(raw,ctx);
    const nameObj=F.name?{p:F.name.p,sport:F.name.sport,ab:F.name.ab}:F.rawName?{p:F.rawName,sport:null}:null;
    const nums=F.nums.filter(n=>!F.odds.some(o=>Math.abs(o.i-n.i)<2)&&!F.sp.some(s=>s.i===n.i-1||s.i===n.i));
    /* a matchup line ("CLE @ PHX", "Lakers vs Grizzlies") is context, not a bet; a lone price on it belongs to the bet above */
    if(F.teams.length>=2&&/\s(@|vs\.?|at)\s/i.test(raw)&&!F.ml&&!F.sides.length&&!F.sp.length&&!F.tot&&!F.name&&!F.st){teams=F.teams;if(F.odds.length===1)fillBack("odds",F.odds[0].v,i);return}
    /* lines that only set context */
    if(!F.hasSel&&!F.odds.length&&!nums.length){
      if(nameObj){if(!fillBack("player",nameObj,i)){player=nameObj;player.cands=F.cands;stat=F.st;if(legs.length)legs[legs.length-1]._closed=1}return}
      if(F.cands.length>1&&!F.st){player={p:F.cands[0].p.split(" ").pop(),sport:null,cands:F.cands,amb:true};return}
      if(F.st){if(!fillBack("stat",F.st,i)){stat=F.st;if(!player||!legs.length)secStat=F.st}return}
      if(F.teams.length){teams=F.teams;return}return}
    if(F.pureOdds){if(!fillBack("odds",F.odds[0].v,i))loose.push({v:F.odds[0].v,i,raw});return}
    if(PARLAY_RE.test(raw)&&!F.st&&!nameObj&&!F.teams.length){if(F.odds.length)loose.push({v:F.odds[F.odds.length-1].v,i,raw,par:1});return}
    const who=nameObj||(F.cands.length>1?{p:raw,sport:null,amb:true}:null);
    const L=newLeg({raw:raw.trim(),_i:i,conv:F.conv,book:detectBook(raw)||book});
    /* player props */
    const st=F.st||(who||F.sides.length?null:null)||(who?null:stat);
    const pst=F.st||(nameObj?null:stat)||(nameObj&&!F.st?null:null);
    if((who||F.st||(player&&F.sides.length&&!F.teams.length))&&!(F.teams.length&&!who&&!F.st&&(F.sp.length||F.ml||F.tot))&&!(F.tt&&!who)){
      /* a section or tab market ("Points" above a list of players) applies to rows that name a player and show prices */
      const P=who||player;const S=F.st||(who?(secStat&&(F.odds.length||F.sides.length)?secStat:null):stat);
      L.mk=F.pm&&!S&&!P?"pm":"prop";L.player=P?P.p:null;if(who&&F.fuzzy)L.fuzzy=1;L.cands=P?(P.cands||F.cands||[]):[];if(F.cands.length>1&&!F.name){L.cands=F.cands;L.player=null;L.ambName=raw}
      L.stat=S?S.st:null;L.sport=(S&&S.sport)||(P&&P.sport)||null;
      if(L.stat&&YN_STATS.has(L.stat)){L.side="yes";L.line=L.stat==="td2"?1.5:.5;L.odds=F.odds.length?F.odds[0].v:null;if(F.pm)setPM(L,F)}
      else{const ln=nums.length?nums[0].v:null;L.line=ln;L.alt=F.thr;
        if(F.sides.length>=2&&F.odds.length>=2){L.side=null;const o1=F.odds.find(o=>o.i>F.sides[0].i),o2=F.odds.find(o=>o.i>F.sides[1].i);L.over=(F.sides[0].s==="over"?o1:o2||null)?.v??null;L.under=(F.sides[0].s==="over"?o2:o1)?.v??null}
        else if(F.sides.length>=2&&!F.odds.length&&!F.pm&&new Set(F.sides.map(x=>x.s)).size===2){L.side=null;L.noPrice=1}
        else if(F.pm&&F.pm.yes!=null&&F.pm.no!=null){L.side=null;L.over=c2am(F.pm.yes);L.under=c2am(F.pm.no);L.pm={yes:F.pm.yes,no:F.pm.no,qty:F.qty||null};L.book=book}
        else{L.side=F.sides.length?F.sides[0].s:(F.pm&&F.pm.pick?(F.pm.pick==="yes"?"over":"under"):null);L.odds=F.odds.length?F.odds.find(o=>!F.sides.length||o.i>F.sides[0].i)?.v??F.odds[0].v:null;if(F.pm)setPM(L,F)}}
      if(!who&&player&&!F.st&&stat&&L.stat==null){L.stat=stat.st;L.sport=L.sport||stat.sport}
      if(!L.player&&player&&!who&&(F.st||F.sides.length)&&legs.length&&legs[legs.length-1].player===player.p){L.player=player.p;L.cands=player.cands||[];L.sport=L.sport||player.sport}
      else if(!L.player&&player&&!who&&!(legs.length&&legs[legs.length-1]._i===i-1&&!legs[legs.length-1].player)){L.player=player.p;L.cands=player.cands||[];L.sport=L.sport||player.sport}
      /* "Over 25.5 -115" then "Under 25.5 -105" on the next line: one board row with both prices */
      const prev=legs[legs.length-1];
      if(prev&&prev.mk==="prop"&&i-prev._i<=1&&prev.player===L.player&&prev.stat===L.stat&&prev.line===L.line&&prev.side&&L.side&&prev.side!==L.side&&!prev.pm){prev[prev.side]=prev.odds;prev[L.side]=L.odds;prev.side=null;prev.odds=null;prev.raw+=" / "+L.raw;return}
      legs.push(L);if(row.grp)L.grp=1;if(row.pair)L.pair=1;if(nameObj){player=nameObj;player.cands=F.cands}if(F.st)stat=F.st;return}
    /* game lines */
    const tms=F.teams.length?F.teams:teams;
    if(tms.length||F.tot||F.tt){L.teams=tms.slice(0,2).map(T=>({ab:T.ab,sport:T.sport,full:T.full}));L.sport=tms.length&&tms.every(T=>T.sport===tms[0].sport)?tms[0].sport:null;
      if(F.tt&&tms.length){L.mk="teamTotal";L.team=L.teams[0];L.side=F.sides.length?F.sides[0].s:null;L.line=nums.length?nums[0].v:null;L.odds=F.odds.length?F.odds[F.odds.length-1].v:null}
      else if(F.sides.length&&(F.tot||!F.teams.length||F.teams.length>=2||/\bgame\b/i.test(raw))){L.mk="total";L.side=F.sides[0].s;L.line=nums.length?nums[0].v:null;L.odds=F.odds.find(o=>o.i>F.sides[0].i)?.v??null}
      else if((F.teams.length||/\b(spread|handicap|line)\b/i.test(raw))&&F.sp.length&&!F.ml){L.mk="spread";L.team=L.teams[0];L.line=F.sp[0].v;L.odds=F.odds.find(o=>o.i>F.sp[0].i)?.v??null}
      else if((F.teams.length||F.ml)&&(F.ml||F.odds.length||F.pm)){L.mk="ml";L.team=L.teams[0];L.odds=F.odds.length?F.odds[0].v:null;if(F.pm){if(F.pm.pick==="no"){L.missing.push("which team the NO contract is on");L.pmNo=true}setPM(L,F);if(F.pm.pick==="no")L.odds=null}}
      else return;
      if(!F.teams.length&&teams.length)L.ctxTeams=1;if(L.ctxTeams&&L.odds==null&&!L.pm&&L.line==null)return;legs.push(L);if(row.grp)L.grp=1;if(row.pair)L.pair=1;return}
    /* a bare selection whose player or market comes on the next line */
    if(F.sides.length&&nums.length){L.mk="prop";L.side=F.sides[0].s;L.line=nums[0].v;L.odds=F.odds.length?F.odds[0].v:null;L.stat=stat&&!player?stat.st:null;legs.push(L);return}
    if(F.pm&&fillBack("pm",F,i))return;
    if(F.pm){L.mk="pm";setPM(L,F);L.missing.push("the contract's exact question");legs.push(L);return}
    if(F.odds.length)loose.push({v:F.odds[F.odds.length-1].v,i,raw})});
  /* a row of numbers with no team and no price (an alternate-line picker, a total selector) is not a bet */
  for(let k=legs.length-1;k>=0;k--){const L=legs[k];if((L.mk==="spread"||L.mk==="ml"||L.mk==="total")&&L.odds==null&&!L.pm&&!feats(L.raw,ctx).teams.length&&(L.raw.match(/[+-]?\d+(\.5)?/g)||[]).length>=3)legs.splice(k,1)}
  /* an unknown name with no market, no side and no price is not a bet (a post's author line, a caption) */
  for(let k=legs.length-1;k>=0;k--){const L=legs[k];if(L.mk==="prop"&&!L.stat&&!L.side&&L.odds==null&&L.over==null&&L.under==null&&!L.pm&&!(L.cands||[]).length&&!(ctx.names||[]).some(x=>norm(x.p)===norm(L.player||"")))legs.splice(k,1)}
  legs.forEach(L=>{
    if(L.mk==="prop"){if(!L.player)L.missing.push(L.ambName?"which player (several match)":"player");if(!L.stat)L.missing.push("market (stat)");if(L.line==null&&!YN_STATS.has(L.stat))L.missing.push("line");
      if(L.noPrice)L.missing.push("odds");else if(!L.side&&L.over==null&&L.under==null)L.missing.push("over or under");if(L.side&&L.odds==null&&!L.pm)L.missing.push("odds");if(!L.side&&(L.over==null||L.under==null)&&L.over!=null)L.missing.push("one side's odds")}
    if(L.mk==="spread"||L.mk==="total"||L.mk==="teamTotal"){if(L.line==null)L.missing.push("line");if(L.odds==null)L.missing.push("odds");if(L.mk!=="spread"&&!L.side)L.missing.push("over or under")}
    if(L.mk==="ml"&&L.odds==null&&!L.pmNo)L.missing.push("odds");
    if(!L.sport&&L.stat){const s=STATS.find(x=>x[1]===L.stat);if(s)L.sport=s[0]}
    if(!L.sport&&L.cands.length&&new Set(L.cands.map(c=>c.sport)).size===1)L.sport=L.cands[0].sport;
    if(NOT_MODELED[L.stat])L.notModeled=NOT_MODELED[L.stat];delete L._i;delete L._closed});
  return{legs,loose,book,all,combo}}
function setPM(L,F){const pick=F.pm.pick||(L.side==="over"||L.side==="yes"?"yes":"no"),c=pick==="yes"?F.pm.yes:F.pm.no;
  L.pm={pick,cents:c,qty:F.qty||null};if(c!=null)L.odds=c2am(c);if(L.mk==="prop"&&!YN_STATS.has(L.stat))L.side=pick==="yes"?"over":"under";if(YN_STATS.has(L.stat)&&pick==="no")L.side="no"}

const money=(all,re)=>{const m=all.match(re);return m?parseFloat(m[1].replace(/,/g,"")):null};
function slipMoney(all){const stake=money(all,/(?:wager|stake|risk(?:ing)?|bet amount|total cost|cost|entry(?: fee)?|bet)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i)??money(all,/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(?:to win|to pay|on it|bet\b)/i);
  const toWin=money(all,/(?:to win|potential win(?:nings)?|profit)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  const payout=money(all,/(?:potential payout|total payout|payout|to pay|to return|returns?|paid out if right)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  const mult=money(all,/(\d{1,3}(?:\.\d{1,2})?)\s*x\b(?=[^\n]{0,20}(?:payout|power|flex|pays?|play))|(?:payout|pays?)\s*:?\s*(\d{1,3}(?:\.\d{1,2})?)\s*x\b/i)??money(all,/(?:payout|pays?)\s*:?\s*([\d.]+)\s*x\b/i);
  const win=toWin!=null?toWin:(payout!=null&&stake!=null&&payout>stake?+(payout-stake).toFixed(2):null);
  return{stake,toWin:win,payout:payout!=null?payout:(stake!=null&&win!=null?+(stake+win).toFixed(2):null),mult}}
const dec=a=>a>0?1+a/100:1+100/Math.abs(a);
const decToAm=d=>d>=2?Math.round((d-1)*100):-Math.round(100/(d-1));

/* blocks: each screenshot is one block; pasted text splits on blank lines (separate posts / messages) */
function parse(input,ctx,opt){opt=opt||{};const lines=(Array.isArray(input)?input.map(x=>typeof x==="string"?x:x.t):String(input||"").split(/\r?\n/)).map(l=>l.replace(/\b(over|under|more|less|higher|lower)(?=\d)/gi,"$1 "));
  const blocks=[];if(opt.image)blocks.push(lines);else{let cur=[];lines.forEach(l=>{if(!l.trim()){if(cur.length)blocks.push(cur);cur=[]}else cur.push(l)});if(cur.length)blocks.push(cur)}
  const bets=[];const seen=new Map();let n=0;
  blocks.forEach(bl=>{const R=parseBlock(bl,ctx);if(!R.legs.length)return;const M=slipMoney(R.all);
    const sel=R.legs.filter(L=>(L.side!==null||L.mk!=="prop")&&!L.pair),board=R.legs.filter(L=>(L.side===null&&L.mk==="prop")||L.pair);
    const pick=PICKEM.has(R.book);const parTxt=bl.filter(l=>!isUI(l)).map(l=>/[+-]\d{3}|\bleg/i.test(l)||/^\W*sgp\+?\W*$/i.test(l.trim())?l:l.replace(/\bsgp\+?\b/gi,"")).join("\n");
    const isPar=sel.length>1&&(PARLAY_RE.test(parTxt)||R.combo||(SLIP_RE.test(R.all)&&M.stake!=null)||(pick&&M.mult));
    const parOdds=(()=>{const p=R.loose.filter(x=>x.par);if(p.length)return p[p.length-1].v;const l=R.loose.filter(x=>!x.par);if(isPar&&l.length)return l[l.length-1].v;
      if(isPar&&R.combo){const last=sel[sel.length-1];if(last.odds!=null&&sel.slice(0,-1).every(L=>L.odds==null)){const v=last.odds;last.odds=null;if(!last.missing.includes("odds"))last.missing.push("odds");return v}}
      if(pick&&M.mult)return decToAm(M.mult);if(isPar&&M.stake&&M.toWin)return decToAm(1+M.toWin/M.stake);return null})();
    if(isPar){const legs=sel.map(L=>({...L,missing:L.missing.filter(x=>x!=="odds"||!pick)}));
      const b={id:"b"+(++n),kind:"parlay",book:R.book,legs,parlayOdds:parOdds,stake:M.stake,toWin:M.toWin,payout:M.payout,mult:M.mult,pickem:pick,
        sgp:/same[\s-]*game|\bsgp\b/i.test(R.all),missing:[]};if(parOdds==null)b.missing.push("parlay odds");
      if(M.stake!=null&&M.toWin!=null&&parOdds!=null&&Math.abs(dec(parOdds)-(1+M.toWin/M.stake))>.06)b.payMismatch=true;bets.push(b)}
    else sel.forEach(L=>{const b={id:"b"+(++n),kind:"single",book:opt.image?R.book:(detectBook(L.raw)||(R.legs.every(x=>!detectBook(x.raw))?R.book:null)),legs:[L],stake:null,toWin:null,payout:null,missing:[]};
      if(sel.length===1&&M.stake!=null){b.stake=M.stake;b.toWin=M.toWin;b.payout=M.payout;if(L.odds!=null&&M.toWin!=null&&Math.abs(dec(L.odds)-(1+M.toWin/M.stake))>.04)b.payMismatch=true}bets.push(b)});
    board.forEach(L=>bets.push({id:"b"+(++n),kind:"single",board:true,book:R.book,legs:[L],stake:null,missing:[]}))});
  bets.forEach(b=>{const k=b.legs.map(L=>[L.sport,norm(L.player),L.stat,L.mk,L.team&&L.team.ab,L.side,L.line,L.odds].join("|")).join("+");if(seen.has(k))b.dup=seen.get(k);else seen.set(k,b.id)});
  return bets}

root.SharpBets={parse,feats,statOf,matchName,STATS,YN_STATS,NOT_MODELED,c2am,dec,decToAm,norm};
})(typeof window!=="undefined"?window:module.exports);
