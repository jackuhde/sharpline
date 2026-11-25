/* Optional vision-model reader for the scanner (Nov 24 2026). Off unless you add your own Google Gemini API key in the scanner
   (Gemini's free tier: no charge within its daily limits; on the free tier Google may use what you send to improve its
   products). The key is kept only in this browser (localStorage) and sent only to Google's API. The model is asked for the
   wagers as structured fields, including which fields it isn't sure of; its answer is then checked by the same parser,
   player matching and review screen as the on-device reader, so nothing it says skips verification. */
(function(){
const K="sl_vision",get=()=>{try{return JSON.parse(localStorage.getItem(K))||{}}catch(e){return{}}};
const set=v=>{try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}};
const MODEL="gemini-2.5-flash";
const PROMPT=`You read sportsbook and betting screenshots. List every wager visible, exactly as shown. Rules:
- One entry per player and market. Never combine numbers from different rows, players or markets.
- market: the stat as written (Points, Rebounds, Assists, Threes, Pts+Reb+Ast, Passing Yards, ...), or Moneyline, Spread, Total.
- line: the number the bet is on. "25+" means line 24.5 with side over.
- If both sides are offered (Over and Under, More and Less, Yes and No), give over_odds and under_odds and set side to null.
- If a single side was picked (a bet slip, a post), set side and odds.
- Odds in American format (-115, +120). Convert decimal or fractional. Prediction-market prices: give cents in cents_yes / cents_no.
- kind: "board" (both sides offered), "single" (one picked bet), "parlay_leg" (a leg of a parlay; put the parlay's total odds in parlay_odds).
- Use null for anything not visible or cut off. Never guess a number. List every field you are not sure of in "uncertain".
- book: the sportsbook or app if its name or logo is visible, else null.`;
const SCHEMA={type:"OBJECT",properties:{wagers:{type:"ARRAY",items:{type:"OBJECT",properties:{
  player:{type:"STRING",nullable:true},team:{type:"STRING",nullable:true},opponent:{type:"STRING",nullable:true},market:{type:"STRING",nullable:true},
  line:{type:"NUMBER",nullable:true},side:{type:"STRING",nullable:true},odds:{type:"NUMBER",nullable:true},over_odds:{type:"NUMBER",nullable:true},under_odds:{type:"NUMBER",nullable:true},
  cents_yes:{type:"NUMBER",nullable:true},cents_no:{type:"NUMBER",nullable:true},kind:{type:"STRING"},parlay_odds:{type:"NUMBER",nullable:true},book:{type:"STRING",nullable:true},
  uncertain:{type:"ARRAY",items:{type:"STRING"}}},required:["kind"]}}},required:["wagers"]};
const am=v=>v==null?"":(v>0?"+":"")+Math.round(v);
/* turn the model's wagers into plain lines the scanner's parser already understands and checks */
function toLines(ws){const lines=[],unc=new Map();const book=(ws.find(w=>w.book)||{}).book;if(book)lines.push(book);
  const legs=ws.filter(w=>w.kind==="parlay_leg");if(legs.length>1){const po=legs.find(w=>w.parlay_odds!=null);lines.push(`${legs.length}-Leg Parlay ${po?am(po.parlay_odds):""}`.trim())}
  ws.forEach(w=>{const who=[w.player||(w.team&&w.market&&/money|spread|total/i.test(w.market)?w.team:""),w.player?"":""].join("").trim();const mk=w.market||"";const ln=w.line!=null?w.line:"";
    let t;if(w.cents_yes!=null||w.cents_no!=null)t=`${who} ${w.side==="under"?"Under":"Over"} ${ln} ${mk} ${w.cents_yes!=null?"Yes "+w.cents_yes+"¢":""} ${w.cents_no!=null?"No "+w.cents_no+"¢":""}`;
    else if(w.side==null&&(w.over_odds!=null||w.under_odds!=null||w.kind==="board"))t=`${who} ${mk} Over ${ln} ${am(w.over_odds)} Under ${ln} ${am(w.under_odds)}`;
    else if(/money/i.test(mk))t=`${who} ML ${am(w.odds)}`;else if(/spread/i.test(mk))t=`${who} ${ln>0?"+":""}${ln} ${am(w.odds)}`;
    else t=`${who} ${w.side?w.side[0].toUpperCase()+w.side.slice(1):""} ${ln} ${mk} ${am(w.odds)}`;
    t=t.replace(/\s+/g," ").trim();lines.push(t);if(w.player)unc.set(w.player.toLowerCase(),(w.uncertain||[]).map(u=>/odd|price/i.test(u)?"odds":/line/i.test(u)?"line":/player|name/i.test(u)?"player":/market|stat/i.test(u)?"market":u))});
  if(legs.length>1)lines.push("");return{lines,unc}}
async function b64(file){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(file)})}
async function read(file){const c=get();if(!c.key)return null;
  const body={contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:file.type||"image/png",data:await b64(file)}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseSchema:SCHEMA}};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":c.key},body:JSON.stringify(body)});
  if(!r.ok)throw new Error("Gemini "+r.status+" "+(await r.text()).slice(0,200));
  const j=await r.json(),txt=j.candidates&&j.candidates[0]&&j.candidates[0].content.parts.map(p=>p.text||"").join("");const data=JSON.parse(txt||"{}");
  const{lines,unc}=toLines(data.wagers||[]);return{lines,unc:L=>unc.get(String(L.player||"").toLowerCase())||[],raw:data}}
window.SLVision={on:()=>{const c=get();return!!(c.key&&c.on!==false)},get,set,read,toLines,MODEL};
})();
