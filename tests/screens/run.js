// Scores the scanner on the screenshot test set: loads the app in headless Chrome, reads every image in tests/screens/img
// (and tests/screens/real if present) with the app's own reader, and compares each wager with the answer key.
// Run: (serve the repo on :8765) node tests/screens/run.js [--json out.json]
const fs=require("fs"),path=require("path");const pp=require(process.env.PP||"puppeteer-core");
const truth=JSON.parse(fs.readFileSync(path.join(__dirname,process.env.HOLD==="fresh"?"truth-fresh.json":process.env.HOLD?"truth-holdout.json":"truth.json")));
const realDir=path.join(__dirname,"real");if(fs.existsSync(realDir))fs.readdirSync(realDir).filter(f=>f.endsWith(".json")).forEach(f=>truth["real/"+f.slice(0,-5)]=JSON.parse(fs.readFileSync(path.join(realDir,f))));
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z ]/g," ").replace(/\b(jr|sr|ii|iii)\b/g,"").replace(/\s+/g," ").trim();
(async()=>{const b=await pp.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox"]});const pg=await b.newPage();
  pg.on("pageerror",e=>console.log("pageerror",e.message));
  await pg.goto(process.env.SITE||"http://localhost:8765/index.html",{waitUntil:"networkidle2",timeout:60000}).catch(()=>{});await new Promise(r=>setTimeout(r,3000));
  const out={},M={wagers:0,player:0,market:0,line:0,odds:0,oddsN:0,assoc:0,extra:0,shots:0,shotsOk:0,flagN:0,flagOk:0};
  for(const name of Object.keys(truth)){const file=name.startsWith("real/")?path.join(realDir,name.slice(5)+".png"):path.join(__dirname,"img",name+".png");if(!fs.existsSync(file))continue;
    const b64=fs.readFileSync(file).toString("base64");
    const legs=await pg.evaluate(async b64=>{const blob=await (await fetch("data:image/png;base64,"+b64)).blob();const f=new File([blob],"s.png",{type:"image/png"});
      const st=document.getElementById("scanStat")||document.createElement("div");
      const bets=window.Scanner.readImage?await window.Scanner.readImage(f,st):await (async()=>{const w=await getWorker(st);const cv=await prepImage(f);const{data}=await w.recognize(cv);return SharpBets.parse((data.lines||[]).map(l=>l.text),Scanner.ctxAll(),{image:1})})();
      return bets.flatMap(bt=>bt.legs.map(L=>({player:L.player,stat:L.stat,line:L.line,side:L.side,odds:L.odds,over:L.over,under:L.under,missing:L.missing,unc:L.unc||[],kind:bt.kind,raw:L.raw})))},b64);
    const T=truth[name],used=new Set();let shotOk=true;M.shots++;const rep=[];
    T.forEach(w=>{const cand=legs.map((L,i)=>({L,i})).filter(({L,i})=>!used.has(i)&&norm(L.player)===norm(w.player));
      const pick=cand.find(({L})=>L.stat===w.stat&&L.line===w.line)||cand.find(({L})=>L.stat===w.stat)||cand[0];
      if(w.cutOff){M.flagN++;const bad=pick&&(pick.L.over!=null||pick.L.under!=null||pick.L.odds!=null);if(pick)used.add(pick.i);if(!bad)M.flagOk++;else shotOk=false;rep.push([w.player,"cut off",bad?"INVENTED":"ok"]);return}
      M.wagers++;if(!pick){shotOk=false;rep.push([w.player,"MISSING"]);return}used.add(pick.i);const L=pick.L;M.player++;
      const mOk=L.stat===w.stat,lOk=L.line===w.line;if(mOk)M.market++;if(lOk)M.line++;
      let oOk;if(w.noOdds){M.flagN++;oOk=L.over==null&&L.under==null&&L.odds==null&&(L.missing||[]).some(x=>/odds/.test(x));if(oOk)M.flagOk++}
      else{M.oddsN++;oOk=w.side?L.side===w.side&&L.odds===w.odds:L.over===w.over&&L.under===w.under;if(oOk)M.odds++}
      if(!mOk||!lOk||!oOk)shotOk=false;
      /* association: right player, but stat or line belongs to a different wager in the same screenshot */
      if((!mOk||!lOk)&&T.some(o=>o!==w&&(o.stat===L.stat&&o.line===L.line)))M.assoc++;
      rep.push([w.player,w.stat,w.line,mOk?"":"MARKET "+L.stat,lOk?"":"LINE "+L.line,oOk?"":"ODDS "+JSON.stringify(w.side?[L.side,L.odds]:[L.over,L.under])])});
    legs.forEach((L,i)=>{if(!used.has(i)){M.extra++;shotOk=false;rep.push(["EXTRA",L.player,L.stat,L.line,L.over,L.under,L.odds])}});
    if(shotOk)M.shotsOk++;out[name]={ok:shotOk,rep};console.log((shotOk?"PASS ":"FAIL ")+name);rep.forEach(r=>console.log("   ",r.filter(x=>x!=="").join(" · ")))}
  const p=(a,b)=>b?(100*a/b).toFixed(0)+"% ("+a+"/"+b+")":"n/a";
  const S={screenshotsFullyCorrect:p(M.shotsOk,M.shots),player:p(M.player,M.wagers),market:p(M.market,M.wagers),line:p(M.line,M.wagers),odds:p(M.odds,M.oddsN),
    wrongAssociation:p(M.assoc,M.wagers),inventedOrExtraLegs:M.extra,unreadableCorrectlyFlagged:p(M.flagOk,M.flagN)};
  console.log(JSON.stringify(S,null,1));const j=process.argv.indexOf("--json");if(j>0)fs.writeFileSync(process.argv[j+1],JSON.stringify({summary:S,shots:out},null,1));await b.close()})();
