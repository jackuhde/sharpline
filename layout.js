/* Sharpline screenshot layout reader (Nov 24 2026).
   The old scanner handed Tesseract's own text lines to the parser. On sportsbook screens that loses which numbers belong
   together: a button that shows "O 27.5" over "-115" comes out as two separate lines, side-by-side Over and Under buttons
   get split or merged with the player name, column headers ("OVER  UNDER") are read as just another line, and two-column
   card grids interleave players. This module rebuilds the layout from word positions instead:
     1. words are grouped into visual lines, and lines into cells (separated by wide gaps)
     2. cells stacked inside one button (line on top, price below) are joined
     3. a two-column card grid is split into its columns, each read on its own
     4. cells are grouped into rows by vertical overlap and read left to right
     5. a header row of side words (Over / Under, More / Less) labels the numbers under each column
     6. a market tab bar keeps only the visibly selected tab (darker ink); if none stands out, no market is taken from it
     7. a pick'em line number is joined to its More / Less buttons
   Every output row keeps the recognition confidence of each number so uncertain lines and prices can be flagged.
   Pure function of the word list: no pixels, no network. Used by scanner.js, tested by tests/layout.test.js. */
(function(root){
const SIDE_RE=/^(over|under|more|less|higher|lower|yes|no|o|u)$/i;
const ODDS_RE=/^[+-]\d{3,4}$/,LINE_RE=/^\d{1,3}(\.5|\.0)?$/,NUM_RE=/\d/;
const HALF={n:0,ints:0};
const med=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const box=ws=>({x0:Math.min(...ws.map(w=>w.x0)),y0:Math.min(...ws.map(w=>w.y0)),x1:Math.max(...ws.map(w=>w.x1)),y1:Math.max(...ws.map(w=>w.y1))});
const vOverlap=(a,b)=>Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
const hOverlap=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0));
/* clean one recognized token: unify minus signs, fix O/0 and l/1 inside prices, cents marks */
function cleanTok(t,prev){t=String(t||"").replace(/[–—−~]/g,"-").replace(/[|]/g,"");if(/^[uU]{2}$/.test(t))t="U";if(/^[oO0]{2}$/.test(t))t="O";
  if(/^[+-][\dOolI]{3,4}$/.test(t))t=t[0]+t.slice(1).replace(/[Oo]/g,"0").replace(/[lI]/g,"1");
  if(/^\d{1,3}[,]5$/.test(t))t=t.replace(",",".");
  if(/^[oOuU]?[\dlI]{1,3}\.5$/.test(t)&&/[lI]/.test(t.replace(/^[oOuU]/,""))&&/\d|[lI]{2}/.test(t)){const m=t.match(/^([oOuU]?)(.*)$/);t=(m[1]?m[1].toUpperCase()+" ":"")+m[2].replace(/[lI]/g,"1")}
  if(prev&&/^(yes|no)$/i.test(prev)&&/^\d{1,2}[¢cCeé€]$/.test(t))t=t.replace(/[^\d]$/,"¢");
  return t}
function lines(words){const L=[];[...words].sort((a,b)=>(a.y0+a.y1)/2-(b.y0+b.y1)/2).forEach(w=>{const h=w.y1-w.y0;
    const hit=L.find(l=>vOverlap(l,w)>=.5*Math.min(h,l.y1-l.y0));if(hit){hit.ws.push(w);Object.assign(hit,box(hit.ws))}else L.push({ws:[w],...box([w])})});
  return L}
function cells(line){const ws=[...line.ws].sort((a,b)=>a.x0-b.x0),h=med(ws.map(w=>w.y1-w.y0))||10,out=[];let cur=[ws[0]];
  for(let i=1;i<ws.length;i++){const gap=ws[i].x0-ws[i-1].x1;if(gap>1.1*h){out.push(cur);cur=[ws[i]]}else cur.push(ws[i])}out.push(cur);
  return out.map(c=>({ws:c,...box(c)}))}
const txt=c=>{let p=null;return c.ws.map(w=>{const t=cleanTok(w.text,p);p=t;return t}).join(" ")};
const toks=c=>txt(c).split(/\s+/).filter(Boolean);
const isOdds=c=>toks(c).some(t=>ODDS_RE.test(t)||/^\d{1,2}¢$/.test(t)||/^even$/i.test(t));
const hasLineOrSide=c=>toks(c).some(t=>LINE_RE.test(t.replace(/^[ou]/i,""))||SIDE_RE.test(t));
const isSideOnly=c=>toks(c).length&&toks(c).every(t=>SIDE_RE.test(t));
const nameLike=c=>{const t=txt(c);return/^[A-Z][a-zA-Z.'’-]+(\s+[A-Z][a-zA-Z.'’-]+){1,3}$/.test(t)&&!NUM_RE.test(t)};
/* 2. a button's two stacked parts become one cell */
function stack(C){const used=new Set(),out=[];const S=[...C].sort((a,b)=>a.y0-b.y0);
  S.forEach((a,i)=>{if(used.has(a))return;const ha=a.y1-a.y0;
    const b=S.find((b,j)=>j>i&&!used.has(b)&&b.y0>=a.y1-ha*.3&&b.y0-a.y1<1.1*Math.max(ha,b.y1-b.y0)&&hOverlap(a,b)>=.5*Math.min(a.x1-a.x0,b.x1-b.x0)&&
      toks(a).length<=3&&toks(b).length<=3&&((hasLineOrSide(a)&&isOdds(b)&&!isOdds(a))||(isSideOnly(b)===false&&isOdds(a)&&hasLineOrSide(b)&&!isOdds(b))));
    if(b){used.add(b);const ws=[...a.ws,...b.ws];out.push({ws,...box(ws),stacked:1})}else out.push(a)});
  return out}
/* 3. two-column card grid: a clear vertical gap with player names on both sides */
function splitGrid(C,W){if(C.length<6)return[C];let best=null;
  for(let x=W*.3;x<=W*.7;x+=W/100){if(C.some(c=>c.x0<x&&c.x1>x))continue;const L=C.filter(c=>c.x1<=x),R=C.filter(c=>c.x0>=x);
    if(L.filter(nameLike).length>=2&&R.filter(nameLike).length>=2&&L.length>=3&&R.length>=3){best=x;break}}
  if(best==null)return[C];return[C.filter(c=>c.x1<=best),C.filter(c=>c.x0>=best)]}
/* 4. rows by vertical overlap */
function rows(C){const R=[];[...C].sort((a,b)=>a.y0-b.y0||a.x0-b.x0).forEach(c=>{const h=c.y1-c.y0;
    const hit=R.find(r=>r.cs.some(o=>vOverlap(o,c)>=.4*Math.min(h,o.y1-o.y0)));if(hit){hit.cs.push(c);Object.assign(hit,box(hit.cs.flatMap(x=>x.ws)))}else R.push({cs:[c],...box(c.ws)})});
  R.forEach(r=>r.cs.sort((a,b)=>a.x0-b.x0||a.y0-b.y0));return R.sort((a,b)=>a.y0-b.y0)}
function read(words,opt){opt=opt||{};const statOf=opt.statOf||(()=>null);
  const W=opt.width||Math.max(1,...words.map(w=>w.x1));
  words=words.filter(w=>String(w.text||"").trim()&&!(w.conf<25&&!/\d|[A-Za-z]{2}/.test(w.text)));if(!words.length)return[];
  {const ts=words.flatMap(w=>String(w.text).split(/\s+/));HALF.n=ts.filter(t=>/^[oOuU]?\d{1,3}\.5$/.test(t)).length;HALF.ints=ts.filter(t=>/^[oOuU]?\d{1,3}\.0$/.test(t)).length}
  let C=lines(words).flatMap(cells);C=stack(C);
  const out=[];
  splitGrid(C,W).forEach(group=>{let cols=null,pendNum=null;
    rows(group).forEach(r=>{const cs=r.cs,T=cs.map(txt),all=T.join(" ");
      /* 5. header of side words: remember each side's column */
      const sideCells=cs.filter(isSideOnly);
      if(sideCells.length>=2&&!pendNum&&!cs.some(c=>c.stacked)&&cs.every(c=>isSideOnly(c)||(!NUM_RE.test(txt(c))&&!nameLike(c)))){
        cols=sideCells.map(c=>({side:/^(over|more|higher|yes|o)$/i.test(txt(c))?"Over":"Under",x:(c.x0+c.x1)/2}));return}
      /* 7. pick'em: a lone line number, then More / Less buttons below it */
      if(cs.length===1&&/^\d{1,3}(\.5)?$/.test(T[0])){pendNum=cs[0];return}
      if(cs.length===1){const m=T[0].match(/^(\d{1,3}\.5)\s+(\D.*)$/);if(m&&statOf(m[2])){const nw=cs[0].ws.find(w=>cleanTok(w.text)===m[1]);
        if(nw){out.push({t:m[2],conf:{}});pendNum={...cs[0],ws:[nw]};return}}}
      /* a player's name with the line beside it ("Brayden Burries   1.5"), prices on a later row */
      if(cs.length===2&&nameLike(cs[0])&&/^\d{1,3}\.5$/.test(T[1])){out.push(row([cs[0]]));pendNum=cs[1];return}
      const sideWordCells=cs.filter(c=>SIDE_RE.test(toks(c)[0]||""));
      if(pendNum&&sideWordCells.length>=2&&!cs.some(c=>toks(c).some(t=>LINE_RE.test(t)&&/\./.test(t)))){const n=txt(pendNum);
        out.push(row(cs.map(c=>SIDE_RE.test(toks(c)[0]||"")?{...c,ws:[c.ws[0],{...c.ws[0],text:n,conf:pendNum.ws[0].conf},...c.ws.slice(1)]}:c),null,[pendNum]));pendNum=null;return}
      /* 6. tab bar: three or more markets on one row with no numbers */
      const sts=cs.filter(c=>!NUM_RE.test(txt(c))&&statOf(txt(c)));
      if(sts.length>=3&&!cs.some(c=>NUM_RE.test(txt(c)))){const ink=sts.map(c=>Math.max(...c.ws.map(w=>w.ink||0)));const s=[...ink].sort((a,b)=>b-a);
        if(s[0]>0&&s[0]>=1.3*s[1]){const sel=sts[ink.indexOf(s[0])];out.push({t:txt(sel),conf:{},tab:1})}else out.push({t:"",conf:{},tabUnclear:1});return}
      /* label numbers under a header column with that column's side */
      if(cols&&!cs.some(c=>toks(c).some(t=>SIDE_RE.test(t)))&&cs.some(isOdds)){const lab=cs.map(c=>{if(!NUM_RE.test(txt(c))||nameLike(c))return null;const xc=(c.x0+c.x1)/2;
          const k=cols.reduce((b,col)=>Math.abs(col.x-xc)<Math.abs(b.x-xc)?col:b,cols[0]);return Math.abs(k.x-xc)<=Math.max(60,1.2*(c.x1-c.x0))?k.side:null});
        out.push(row(cs,null,null,lab));return}
      out.push(row(cs))})});
  return out.filter(r=>r.t.trim()||r.tabUnclear)}
/* one output row: text left to right, with the confidence of every number */
function row(cs,suffix,extra,lab){const conf={};
  /* the same line printed on both buttons: a copy that lost its decimal point ("275" next to "27.5") is the same number */
  const lines=cs.flatMap(c=>c.ws.flatMap(w=>String(w.text).split(/\s+/).map(v=>cleanTok(v)))).filter(v=>/^\d{1,3}\.5$/.test(v.replace(/^[ou0]/i,"")));
  const parts=cs.map((c,i)=>{let p=null;const ts=c.ws.flatMap(w=>String(w.text).split(/\s+/).filter(Boolean).map(t=>({...w,text:t}))).map(w=>{let v=cleanTok(w.text,p);
      if(/^\d{2,4}$/.test(v)){const m=lines.find(l=>l.replace(/^[ou0]/i,"").replace(".","")===v);if(m)v=m.replace(/^[ou0]/i,"");
        else{const m2=lines.find(l=>"0"+l.replace(/^[ou0]/i,"").replace(".","")===v);if(m2){v="0 "+m2.replace(/^[ou0]/i,"")}}}
      p=v;if(NUM_RE.test(v))conf[v]=Math.min(conf[v]??100,w.conf??100);return v});
    const ts2=ts.join(" ").split(" ");ts.length=0;ts.push(...ts2);
    /* a side letter read as zero: "0 27.5" or "027.5" inside a button is "O 27.5" */
    for(let k=0;k<ts.length;k++){if(ts[k]==="0"&&ts[k+1]&&/^\d{1,3}\.5$/.test(ts[k+1]))ts[k]="O";else if(/^0\d{1,3}\.5$/.test(ts[k])){const v=ts[k].slice(1);conf[v]=conf[ts[k]];ts[k]="O "+v}}
    const t=ts.join(" ");return lab&&lab[i]?lab[i]+" "+t:t});
  /* both buttons print the same line: a copy that isn't a real prop line (".9" where the other says ".5") takes the other */
  {const L=[];parts.forEach((t,i)=>{(t.match(/\b\d{1,3}\.\d\b/g)||[]).forEach(v=>L.push({i,v}))});const good=L.filter(x=>/\.5$/.test(x.v)),bad=L.filter(x=>!/\.[05]$/.test(x.v));
    if(good.length===1&&bad.length===1&&good[0].i!==bad[0].i&&Math.abs(parseFloat(good[0].v)-parseFloat(bad[0].v))<10){parts[bad[0].i]=parts[bad[0].i].replace(bad[0].v,good[0].v);conf[good[0].v]=Math.min(conf[good[0].v]??100,65)}}
  /* both buttons print the same line: one that lost its first digit ("9.5" beside "19.5") takes the longer reading, flagged */
  {const L=[];parts.forEach((t,i)=>{(t.match(/\b\d{1,3}\.5\b/g)||[]).forEach(v=>L.push({i,v}))});
    if(L.length===2&&L[0].i!==L[1].i&&L[0].v!==L[1].v){const[a,b]=L[0].v.length>L[1].v.length?L:[L[1],L[0]];if(a.v.endsWith(b.v)){parts[b.i]=parts[b.i].replace(new RegExp("(^|\\s)"+b.v.replace(".","\\.")+"(?=\\s|$)"),"$1"+a.v);conf[a.v]=Math.min(conf[a.v]??100,60)}}}
  /* both buttons lost the decimal point ("095" and "U 95") on a screen whose other lines all end in .5: read as 9.5, flagged */
  if(HALF.n>=2&&!HALF.ints){const I=[];parts.forEach((t,i)=>{const m=t.match(/(?:^|\s)(?:([OUou])\s?)?(0?)(\d{2,3})(?=\s|$)/);if(m&&/5$/.test(m[3])&&!/^[+-]/.test(m[3]))I.push({i,m})});
    if(I.length===2&&I[0].i!==I[1].i&&I[0].m[3]===I[1].m[3]&&parts.some(t=>/(^|\s)[+-]\d{3}/.test(t))){const v=I[0].m[3].slice(0,-1)+".5";
      I.forEach((x,k)=>{const sd=x.m[1]?x.m[1].toUpperCase():x.m[2]?"O":null;parts[x.i]=parts[x.i].replace(x.m[0],(x.m[0].match(/^\s/)?" ":"")+(sd?sd+" ":"")+v)});conf[v]=60}}
  /* two buttons with the same line where only one side letter was read: the other is the opposite side */
  const bl=parts.map(t=>{const m=t.match(/(?:^|\s)([OUou])?\s?(\d{1,3}\.5)(?:\s|$)/);return m?{s:m[1]?m[1].toUpperCase():null,l:m[2]}:null});
  const withL=bl.map((b,i)=>b?i:-1).filter(i=>i>=0);
  if(withL.length===2&&bl[withL[0]].l===bl[withL[1]].l){const[a,b]=withL.map(i=>bl[i]);if(a.s&&!b.s)parts[withL[1]]=parts[withL[1]].replace(b.l,(a.s==="O"?"U ":"O ")+b.l);else if(b.s&&!a.s)parts[withL[0]]=parts[withL[0]].replace(a.l,(b.s==="O"?"U ":"O ")+a.l)}(extra||[]).forEach(c=>c.ws.forEach(w=>{const v=cleanTok(w.text);conf[v]=Math.min(conf[v]??100,w.conf??100)}));
  return{t:parts.join("   ")+(suffix||""),conf}}
root.SharpLayout={read,cleanTok};
})(typeof window!=="undefined"?window:module.exports);
