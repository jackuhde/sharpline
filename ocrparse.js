/* Turns recognized screenshot text into bet rows. Works on sportsbook layouts (player, stat, then
   "Over 25.5 -115  Under 25.5 -105", also O/U, o25.5, More/Less), bet slips, and plain-text tips
   ("Brunson over 26.5 pts -115"). Decimal (1.91) and fractional (10/11) odds are converted to American. */
(function(root){
const STAT_RE=[[/pts\s*\+\s*reb\s*\+\s*ast|points\s*\+\s*rebounds\s*\+\s*assists|\bpra\b/i,"Pts+Reb+Ast"],[/pts\s*\+\s*reb|points\s*\+\s*rebounds/i,"Pts+Reb"],[/pts\s*\+\s*ast|points\s*\+\s*assists/i,"Pts+Ast"],[/reb\s*\+\s*ast|rebounds\s*\+\s*assists/i,"Reb+Ast"],[/three|3[\s-]*p(t|oint)|3pm|made 3|3s made/i,"3-Pointers"],[/rebound|\breb(s)?\b/i,"Rebounds"],[/assist|\bast(s)?\b/i,"Assists"],[/point|\bpts\b/i,"Points"],[/steal/i,"Steals"],[/block/i,"Blocks"],[/turnover/i,"Turnovers"]];
const norm=x=>(x||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z ]/g," ").replace(/\s+/g," ").trim();
const BOOKS=[["draftkings","DraftKings"],["fanduel","FanDuel"],["betmgm","BetMGM"],["caesars","Caesars"],["fanatics","Fanatics"],["espn ?bet","ESPN BET"],["bet ?365","bet365"],["hard ?rock","Hard Rock"],["bally","Bally Bet"],["fliff","Fliff"],["prizepicks","PrizePicks"],["underdog","Underdog"],["novig","Novig"],["kalshi","Kalshi"],["polymarket","Polymarket"],["prophet ?x","ProphetX"],["sporttrade","Sporttrade"],["robinhood","Robinhood"],["crypto\\.com","Crypto.com"],["betr\\b","Betr"],["dabble","Dabble"],["betrivers","BetRivers"],["bovada","Bovada"],["pinnacle","Pinnacle"]];
function detectBook(all){const t=(all||"").toLowerCase();for(const[re,n]of BOOKS)if(new RegExp("\\b"+re).test(t))return n;return null}
/* a parlay needs parlay words, or slip words with more than one leg; one bet with a payout is still one bet */
const isSlip=(all,n)=>/\bparlay\b|\b\d+[- ]?leg\b|\bsgp\b|same game/i.test(all||"")||(n>1&&/\bbet slip\b|\bto win\b|\bpayout\b/i.test(all||""));
const decToAm=d=>d>=2?Math.round((d-1)*100):-Math.round(100/(d-1));
/* rewrite decimal and fractional odds as American so the rest of the parser sees one format */
/* prediction-market contracts: a YES at 48 cents is a 48% implied chance, the same as +108; fees are not included */
const c2am=c=>{const p=c/100;return p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p)};
function normPM(t){
  /* "25+ points" means 25 or more, which is Over 24.5 */
  t=t.replace(/\b(\d{1,3})\+\s*(?=(?:pts|points|reb|rebs|rebounds|ast|asts|assists|threes|3pm|3-pointers|three|made threes|pra|steals|blocks)\b)/gi,(m,n)=>"Over "+(+n-0.5)+" ");
  const yn=(m,w,c)=>{c=+c;if(!(c>=1&&c<=99))return m;const am=c2am(c);return(/yes/i.test(w)?"Over ":"Under ")+(am>0?"+":"")+am+"⁽ᵖ⁾"};
  t=t.replace(/\b(?:buy\s+)?(yes|no)\b\s*[:·•-]?\s*(\d{1,2}(?:\.\d)?)\s*(?:¢|c\b|cents?\b|%)/gi,yn);
  t=t.replace(/\b(?:buy\s+)?(yes|no)\b\s*[:·•-]?\s*\$0?\.(\d{2})\b/gi,yn);
  return t}
function normOdds(t){t=normPM(t);
  t=t.replace(/(^|[\s(@])([1-9]\d?\.\d{2})(?=$|[\s)])/g,(m,a,d)=>{const v=parseFloat(d);if(v<1.01||v>51)return m;const am=decToAm(v);return a+(am>0?"+":"")+am+"⁽ᵈ⁾"});
  t=t.replace(/(^|[\s(@])(\d{1,3})\/(\d{1,3})(?=$|[\s)])/g,(m,a,n,dn)=>{n=+n;dn=+dn;if(![1,2,3,4,5,6,7,8,9,10,11,13,15,20].includes(dn)||!n)return m;const am=decToAm(1+n/dn);return a+(am>0?"+":"")+am+"⁽ᶠ⁾"});
  return t}
function fixText(t){return normOdds((t||"").replace(/\b([oOuU])(\d{1,3}\.5)\b/g,"$1 $2")).replace(/[–—−]/g,"-").replace(/(?<=[+-]\d{0,3})[lI|!]/g,"1").replace(/(?<=\d)[oO](?=\d)/g,"0").replace(/(?<=\d)[,](?=5\b)/g,".").replace(/\bEVEN\b|\bEVN\b/gi,"+100")}
function findName(t,names){const n=norm(t);if(!n||/\d/.test(t)&&!/^[^\d]*$/.test(t.replace(/\d+(\.\d)?\s*(pm|am)?/gi,"")))return null;
  const toks=n.split(" ");if(toks.length>5)return null;
  let best=null;names.forEach(x=>{const xn=norm(x.p),parts=xn.split(" "),last=parts[parts.length-1];
    if(n.includes(xn)){best={x,score:3};return}
    if(toks.includes(last)&&last.length>2){const sc=toks.includes(parts[0])?2.5:(toks.some(tk=>tk[0]===parts[0][0])?1.5:1);if(!best||sc>best.score)best={x,score:sc,amb:best&&best.score===sc}}});
  if(best&&!best.amb)return best.x;return null}
let CUR_RE=null;
function findStat(t){for(const[re,st]of(CUR_RE||STAT_RE))if(re.test(t))return st;return null}
function findTeam(t,teams){const n=" "+norm(t)+" ",up=" "+t.toUpperCase().replace(/[^A-Z ]/g," ")+" ";
  for(const T of teams){if(n.includes(" "+norm(T.full)+" ")||n.includes(" "+T.nick+" ")||up.includes(" "+T.ab+" "))return T}return null}
function looksLikeName(t){return/^[A-Z][A-Za-z.'’-]+(\s+[A-Z][A-Za-z.'’-]+){1,2}(\s+(Jr|Sr|II|III|IV)\.?)?$/.test(t.trim())}
function parse(lines,ctx){CUR_RE=ctx.statRe||null;const rows=[],names=ctx.names,teams=ctx.teams;let player=null,stat=null,team=null,pend=null,hint=null;
  const flush=()=>{if(pend&&player&&stat&&pend.line!=null&&(pend.over!=null||pend.under!=null))rows.push({k:"P",player:player.p,ab:player.ab||"?",hint,stat,line:pend.line,over:pend.over??null,under:pend.under??null,raw:pend.raw.trim(),conv:/⁽/.test(pend.raw)});pend=null};
  lines.forEach(L=>{const t=fixText(L.t).trim();if(!t)return;
    const mu=t.toUpperCase().match(/\b([A-Z]{2,3})\s*(?:@|VS\.?|AT)\s*([A-Z]{2,3})\b/);if(mu&&!/[+-]\d{3}|\d+\.5/.test(t)){hint=[mu[1],mu[2]];return}
    const nm=findName(t,names),st=findStat(t),tm=findTeam(t,teams);
    const hasNums=/[+-]\d{3}|\d+\.5/.test(t);
    if(nm&&!hasNums){flush();player=nm;team=null;stat=st||null;return}
    if(hasNums&&/\b(over|under|o|u|more|less)\b/i.test(t)){/* one-line tip: "Jalen Brunson over 26.5 pts -115" */
      let who=nm;if(!who){const lead=t.split(/\b(?:over|under|o|u|more|less)\b/i)[0].replace(/[^A-Za-z.'’ -]/g," ").trim();const w=lead.split(/\s+/).filter(x=>/^[A-Z]/.test(x)).slice(-3).join(" ");if(looksLikeName(w))who={p:w,ab:null}}
      if(who&&(st||stat)){flush();player=who;stat=st||stat;team=null}}
    if(!nm&&!st&&!tm&&!hasNums&&looksLikeName(t)){flush();player={p:t,ab:null};team=null;stat=null;return}
    if(st&&!hasNums){flush();stat=st;return}
    if(tm&&!nm){flush();player=null;stat=null;team=tm}
    if(st&&hasNums){if(st!==stat){flush();stat=st}}
    if(!hasNums)return;
    /* tokens in reading order */
    const re=/\b(over|under|more|less|o|u)\b|([+-]?\d{1,3}\.5)|([+-]\d{3,4})(?!\.)/gi;let m,side=null,auto=0;
    if(player&&stat){if(!pend)pend={line:null,over:null,under:null,raw:""};pend.raw+=" "+t;
      while((m=re.exec(t))){if(m[1]){const w=m[1].toLowerCase();side=(w[0]==="o"||w==="more")?"over":"under"}
        else if(m[2]){const v=Math.abs(parseFloat(m[2]));if(pend.line!=null&&v!==pend.line&&pend.over!=null&&pend.under!=null){flush();pend={line:null,over:null,under:null,raw:t}}pend.line=v}
        else if(m[3]){const o=parseInt(m[3]);if(side){pend[side]=o;side=null}else{pend[auto===0&&pend.over==null?"over":"under"]=o;auto++}}}
      if(pend.over!=null&&pend.under!=null)flush();return}
    if(team){/* game line row: TEAM  spread odds  [O/U total odds]  ML */
      let spread=null,sOdds=null,ml=null,tot=null,tSide=null,tOdds=null,expect=null;
      while((m=re.exec(t))){if(m[1]){const w=m[1].toLowerCase();tSide=(w[0]==="o"||w==="more")?"over":"under";expect="tot"}
        else if(m[2]){const v=parseFloat(m[2]);if(expect==="tot"&&tot==null){tot=Math.abs(v)}else if(spread==null){spread=v;expect="sp"}}
        else if(m[3]){const o=parseInt(m[3]);if(expect==="sp"&&sOdds==null){sOdds=o;expect=null}else if(expect==="tot"&&tOdds==null&&tot!=null){tOdds=o;expect=null}else if(ml==null)ml=o}}
      if(spread!=null)rows.push({k:"G",ab:team.ab,mk:"spread",line:spread,odds:sOdds,side:"-",raw:t});
      if(tot!=null)rows.push({k:"G",ab:team.ab,mk:"total",line:tot,odds:tOdds,side:tSide||"over",raw:t});
      if(/⁽ᵖ⁾/.test(t)&&!/\bOver\b/.test(t))ml=null;
      if(ml!=null)rows.push({k:"G",ab:team.ab,mk:"moneyline",line:null,odds:ml,side:"-",raw:t});}
  });flush();
  const all=lines.map(l=>l.t).join("\n"),book=detectBook(all),slip=isSlip(all,rows.length);
  const money=re=>{const m=all.match(re);return m?parseFloat(m[1].replace(/,/g,"")):null};
  const stake=money(/(?:wager|stake|risk|bet amount|total cost|cost)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  const toWin=money(/(?:to win|potential win(?:nings)?|profit)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  const payout=money(/(?:potential payout|total payout|payout|to return|returns?)\s*:?\s*\$\s?([\d,]+(?:\.\d{1,2})?)/i);
  const win=toWin!=null?toWin:(payout!=null&&stake!=null&&payout>stake?+(payout-stake).toFixed(2):null);
  const payAm=stake&&win?decToAm(1+win/stake):null;
  rows.forEach(r=>{r.book=book;r.slip=slip;if(r.raw&&/⁽ᵖ⁾/.test(r.raw))r.pm=true;if(r.raw&&/⁽[ᵈᶠ]⁾/.test(r.raw))r.conv=true;if(r.raw)r.raw=r.raw.replace(/⁽.⁾/g,"");
    if(slip){r.slipStake=stake;r.slipWin=win}
    else if(rows.length===1&&stake!=null){r.stake=stake;r.toWin=win;r.payAm=payAm;const o=r.k==="P"?(r.over!=null?r.over:r.under):r.odds;
      if(payAm!=null&&o!=null&&Math.abs(dec(o)-dec(payAm))>.04)r.payMismatch=true}});
  return rows}
const dec=a=>a>0?1+a/100:1+100/Math.abs(a);
root.SharpOCR={parse,fixText,findName,detectBook,normOdds};
})(typeof window!=="undefined"?window:module.exports);
