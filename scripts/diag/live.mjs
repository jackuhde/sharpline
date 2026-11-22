// Live-site diagnostic: loads the deployed Sharpline in headless Chrome (GitHub runner, real ESPN data) and records what
// the app actually computes. Run by .github/workflows/diag.yml; writes diag/live.json.
import fs from "node:fs";import pp from "puppeteer-core";
const URL=process.env.SITE||"https://jackuhde.github.io/sharpline/";const out={url:URL,at:new Date().toISOString(),errors:[],console:[]};
const b=await pp.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox"]});const pg=await b.newPage();
pg.on("pageerror",e=>out.errors.push(String(e.message).slice(0,300)));pg.on("console",m=>{if(["error","warning"].includes(m.type()))out.console.push(m.text().slice(0,200))});
await pg.evaluateOnNewDocument(()=>{window.__long=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__long.push([Math.round(e.startTime),Math.round(e.duration)]))).observe({type:"longtask",buffered:true})}catch(e){}
  localStorage.setItem("sl_sport","nba")});
const t0=Date.now();await pg.goto(URL+"?diag="+Date.now(),{waitUntil:"domcontentloaded",timeout:60000});
const waitFor=async(fn,ms)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await pg.evaluate(fn))return true}catch(e){}await new Promise(r=>setTimeout(r,2000))}return false};
out.nbaReady=await waitFor(()=>typeof PROPS!=="undefined"&&PROPS.length>0&&SUG.some(g=>g&&g.model),120000);out.nbaReadyMs=Date.now()-t0;
await new Promise(r=>setTimeout(r,15000));
out.nba=await pg.evaluate(()=>{const R={};try{
  R.meta={scripts:[...document.scripts].map(s=>s.src.split("/").pop()).filter(Boolean),dataDate:typeof DATA_DATE!=="undefined"?DATA_DATE:null,boardSrc:typeof BOARD_SRC!=="undefined"?BOARD_SRC:null,
    model:typeof PM_META!=="undefined"&&PM_META?{updated:PM_META.updated,b0:PM_META.weights&&PM_META.weights.b0,mkt:PM_META.weights&&PM_META.weights.mkt,center:!!PM_META.center,mktCal:!!PM_META.mktCal,catK:PM_META.catK}:null,
    props:PROPS.length,sug:SUG.length,games:SNAP.length,sw:navigator.serviceWorker&&navigator.serviceWorker.controller?"controlled":"none"};
  const rows=PROPS.map((x,i)=>{const g=SUG[i]||{},q=(x.q||[]).find(q=>q.l===g.l&&q.o!=null&&q.u!=null),MD=g.model;let gr=null;try{gr=baseGrade("p"+i)}catch(e){gr="ERR "+e.message}
    return{i,p:x.p,st:x.st,g:x.g,l:g.l,o:q&&q.o,u:q&&q.u,pm:MD&&+MD.pm.toFixed(4),raw:MD&&+MD.p.toFixed(4),pAdj:MD&&MD.pAdj!=null?+MD.pAdj.toFixed(4):null,pShown:g.p!=null?+g.p.toFixed(4):null,side:g.s,bp:g.bp,ev:g.bp!=null&&g.p!=null?+evOf(g.p,g.bp).toFixed(4):null,model:!!MD,noModel:!!g.noModel,grade:gr,two:!!q}});
  R.rows=rows;
  let T=[];try{T=topItems()}catch(e){R.topErr=e.message}R.top=T.map(c=>({name:c.name,st:c.st,side:c.side,line:c.line,price:c.price,p:c.p,ev:c.ev,evLo:c.evLo,grade:c.grade,src:c.src}));
  R.watch=(topItems.watch||[]).slice(0,8).map(c=>({name:c.name,st:c.st,side:c.side,ev:c.ev,grade:c.grade}));
  try{const cov=slateReport(new Set(T.map(c=>c.base)));R.byReason=cov.byReason;R.cov=cov&&cov.markets?cov.markets.map(m=>({name:m.name,st:m.st,side:m.side,why:m.why,ev:m.ev,lean:m.lean})):null}catch(e){}
  }catch(e){R.err=e.stack}return R});
await pg.evaluate(()=>setSport("nfl"));
out.nflReady=await waitFor(()=>window.NFL&&NFL.N&&NFL.N.events&&NFL.N.events.length&&NFL.allProps().length>0,120000);await new Promise(r=>setTimeout(r,10000));
out.nfl=await pg.evaluate(()=>{const R={};try{const L=NFL.allProps();R.n=L.length;R.rows=L.map(x=>({name:x.name,st:x.st,yn:!!x.yn,l:x.l,side:x.side,p:x.p!=null?+x.p.toFixed(4):null,price:x.price,ev:x.ev,fair:x.fair,trusted:x.trusted,far:!!x.far,inj:!!x.inj,state:x.e&&x.e.state}));
  R.cards=[...document.querySelectorAll("#nfTop .top, .nf-tops .top")].length;R.cardGrades=[...document.querySelectorAll(".nf-tops .top")].map(c=>{const g=c.querySelector(".grade");return g?g.textContent:null});}catch(e){R.err=e.stack}return R});
out.long=await pg.evaluate(()=>window.__long);out.totalMs=Date.now()-t0;
fs.mkdirSync("diag",{recursive:true});fs.writeFileSync("diag/live.json",JSON.stringify(out));
console.log(JSON.stringify({nbaReady:out.nbaReady,nbaReadyMs:out.nbaReadyMs,meta:out.nba&&out.nba.meta,props:out.nba&&out.nba.rows&&out.nba.rows.length,top:out.nba&&out.nba.top&&out.nba.top.length,nfl:out.nfl&&out.nfl.n,errors:out.errors.slice(0,5),long:(out.long||[]).filter(x=>x[1]>1000)}));
await b.close();
