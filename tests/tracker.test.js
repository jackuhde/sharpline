// Run: node tests/tracker.test.js   (parlay settlement and model-accuracy log)
const fs=require("fs"),path=require("path");let pass=0,fail=0;const t=(n,c)=>{c?pass++:(fail++,console.log("FAIL",n))};
const store={};global.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v)};
global.window=global;global.document={addEventListener(){},getElementById(){return null},createElement(){return{}},body:{appendChild(){}}};
global.UNIT=10;global.money=x=>(x<0?"-$":"$")+Math.abs(x).toFixed(2);
new Function(fs.readFileSync(path.join(__dirname,"..","tracker2.js"),"utf8"))();
const S=TR2._settle,L=(res,odds)=>({res,odds});
t("any losing leg loses",S({legs:[L("W",-110),L("L",-110),L(null,-110)]}).res==="L");
t("pending legs and no loss: not settled",S({legs:[L("W",-110),L(null,-110)]})===null);
t("all win",S({legs:[L("W",-110),L("W",-110)],odds:264}).res==="W");
const pu=S({legs:[L("W",-110),L("P",-110),L("W",+150)],odds:600});
t("push drops a leg and reprices",pu.res==="W"&&pu.odds===Math.round((1.9090909*2.5-1)*100)||pu.odds===377);
t("all pushed returns stake",S({legs:[L("P",-110),L("V",-110)]}).res==="P");
t("probability buckets",TR2._bucket(.49)===0&&TR2._bucket(.52)===1&&TR2._bucket(.7)===4);
console.log(`${pass} passed, ${fail} failed`);process.exit(fail?1:0);
