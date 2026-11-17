/* Turns recognized screenshot text into bet rows. Works on Fliff-style layouts:
   player name, stat label, then "Over 25.5 -115  Under 25.5 -105" (also O/U, More/Less). */
(function(root){
const STAT_RE=[[/pts\s*\+\s*reb\s*\+\s*ast|points\s*\+\s*rebounds\s*\+\s*assists|\bpra\b/i,"Pts+Reb+Ast"],[/pts\s*\+\s*reb|points\s*\+\s*rebounds/i,"Pts+Reb"],[/pts\s*\+\s*ast|points\s*\+\s*assists/i,"Pts+Ast"],[/reb\s*\+\s*ast|rebounds\s*\+\s*assists/i,"Reb+Ast"],[/three|3[\s-]*p(t|oint)|3pm|made 3|3s made/i,"3-Pointers"],[/rebound|\breb(s)?\b/i,"Rebounds"],[/assist|\bast(s)?\b/i,"Assists"],[/point|\bpts\b/i,"Points"],[/steal/i,"Steals"],[/block/i,"Blocks"],[/turnover/i,"Turnovers"]];
const norm=x=>(x||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z ]/g," ").replace(/\s+/g," ").trim();
function fixText(t){return(t||"").replace(/[–—−]/g,"-").replace(/(?<=[+-]\d{0,3})[lI|!]/g,"1").replace(/(?<=\d)[oO](?=\d)/g,"0").replace(/(?<=\d)[,](?=5\b)/g,".").replace(/\bEVEN\b|\bEVN\b/gi,"+100")}
function findName(t,names){const n=norm(t);if(!n||/\d/.test(t)&&!/^[^\d]*$/.test(t.replace(/\d+(\.\d)?\s*(pm|am)?/gi,"")))return null;
  const toks=n.split(" ");if(toks.length>5)return null;
  let best=null;names.forEach(x=>{const xn=norm(x.p),parts=xn.split(" "),last=parts[parts.length-1];
    if(n.includes(xn)){best={x,score:3};return}
    if(toks.includes(last)&&last.length>2){const sc=toks.includes(parts[0])?2.5:(toks.some(tk=>tk[0]===parts[0][0])?1.5:1);if(!best||sc>best.score)best={x,score:sc,amb:best&&best.score===sc}}});
  if(best&&!best.amb)return best.x;return null}
function findStat(t){for(const[re,st]of STAT_RE)if(re.test(t))return st;return null}
function findTeam(t,teams){const n=" "+norm(t)+" ",up=" "+t.toUpperCase().replace(/[^A-Z ]/g," ")+" ";
  for(const T of teams){if(n.includes(" "+norm(T.full)+" ")||n.includes(" "+T.nick+" ")||up.includes(" "+T.ab+" "))return T}return null}
function looksLikeName(t){return/^[A-Z][A-Za-z.'’-]+(\s+[A-Z][A-Za-z.'’-]+){1,2}(\s+(Jr|Sr|II|III|IV)\.?)?$/.test(t.trim())}
function parse(lines,ctx){const rows=[],names=ctx.names,teams=ctx.teams;let player=null,stat=null,team=null,pend=null,hint=null;
  const flush=()=>{if(pend&&player&&stat&&pend.line!=null&&(pend.over!=null||pend.under!=null))rows.push({k:"P",player:player.p,ab:player.ab||"?",hint,stat,line:pend.line,over:pend.over??null,under:pend.under??null,raw:pend.raw.trim()});pend=null};
  lines.forEach(L=>{const t=fixText(L.t).trim();if(!t)return;
    const mu=t.toUpperCase().match(/\b([A-Z]{2,3})\s*(?:@|VS\.?|AT)\s*([A-Z]{2,3})\b/);if(mu&&!/[+-]\d{3}|\d+\.5/.test(t)){hint=[mu[1],mu[2]];return}
    const nm=findName(t,names),st=findStat(t),tm=findTeam(t,teams);
    const hasNums=/[+-]\d{3}|\d+\.5/.test(t);
    if(nm&&!hasNums){flush();player=nm;team=null;stat=st||null;return}
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
      if(ml!=null)rows.push({k:"G",ab:team.ab,mk:"moneyline",line:null,odds:ml,side:"-",raw:t});}
  });flush();return rows}
root.SharpOCR={parse,fixText,findName};
})(typeof window!=="undefined"?window:module.exports);
