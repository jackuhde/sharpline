// Builds the scanner's screenshot test set: phone-sized screenshots rendered in headless Chrome from layouts modeled on
// common sportsbook and social formats, each with an exact answer key (truth.json). These are synthetic screenshots with
// known lines and odds, not captures from real apps; add real screenshots to tests/screens/real/ with a matching
// <name>.json answer key and the harness scores them the same way.
// Run: node tests/screens/make.js   (needs puppeteer-core and Chrome)
const fs=require("fs"),path=require("path");const pp=require(process.env.PP||"puppeteer-core");
const OUT=path.join(__dirname,"img");fs.mkdirSync(OUT,{recursive:true});
const css=`*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;width:390px}`;
const T={};const shots=[];
const add=(name,html,truth,opt)=>{shots.push({name,html,opt:opt||{}});T[name]=truth};
const sd=a=>(a>0?"+":"")+a;

/* 1. stacked buttons, light (line on top, odds below, inside each button), market tabs across the top */
{const rows=[["Tyrese Maxey","PHI",27.5,-115,-105],["Joel Embiid","PHI",30.5,-110,-110],["Jaylen Brown","PHI",22.5,+100,-120],["Kevin Durant","HOU",26.5,-125,+105]];
 add("01-stacked-light",`<div style="background:#fff;padding:14px">
  <div style="font-weight:700;font-size:15px;color:#111">HOU @ PHI</div><div style="font-size:12px;color:#777;margin:2px 0 10px">Tonight 7:30 PM</div>
  <div style="display:flex;gap:16px;font-size:13px;color:#888;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:6px"><b style="color:#111;border-bottom:2px solid #1a7f37">Points</b><span>Rebounds</span><span>Assists</span><span>Threes</span></div>
  ${rows.map(([n,t,l,o,u])=>`<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #eee">
   <div style="flex:1"><div style="font-size:15px;font-weight:600;color:#111">${n}</div><div style="font-size:11px;color:#888">${t}</div></div>
   ${[["O",l,o],["U",l,u]].map(([s,l2,p])=>`<div style="width:78px;margin-left:8px;background:#f3f4f6;border-radius:8px;padding:6px 0;text-align:center"><div style="font-size:13px;color:#333">${s} ${l2}</div><div style="font-size:14px;font-weight:700;color:#1a7f37">${sd(p)}</div></div>`).join("")}</div>`).join("")}</div>`,
  rows.map(([p,,l,o,u])=>({player:p,stat:"Points",line:l,over:o,under:u})))}

/* 2. column headers OVER / UNDER, buttons show only the line and odds */
{const rows=[["Victor Wembanyama",11.5,-130,+110],["Stephon Castle",4.5,-105,-115],["Alperen Sengun",9.5,+105,-125],["Amen Thompson",7.5,-110,-110]];
 add("02-headers-light",`<div style="background:#fff;padding:14px;color:#14171f">
  <div style="font-size:18px;font-weight:800;margin-bottom:8px">Player Rebounds</div>
  <div style="display:flex;font-size:11px;font-weight:700;color:#6b7280;padding:4px 0"><span style="flex:1"></span><span style="width:84px;text-align:center">OVER</span><span style="width:84px;text-align:center;margin-left:8px">UNDER</span></div>
  ${rows.map(([n,l,o,u])=>`<div style="display:flex;align-items:center;padding:9px 0;border-top:1px solid #e5e7eb">
   <div style="flex:1;font-size:15px;font-weight:600">${n}</div>
   ${[o,u].map(p=>`<div style="width:84px;margin-left:8px;border:1px solid #cfd8e3;border-radius:6px;padding:5px 0;text-align:center;color:#1463ff"><div style="font-size:13px">${l}</div><div style="font-size:13px;font-weight:700">${sd(p)}</div></div>`).join("")}</div>`).join("")}</div>`,
  rows.map(([p,l,o,u])=>({player:p,stat:"Rebounds",line:l,over:o,under:u})))}

/* 3. dark mode, white text on dark buttons with a colored accent */
{const rows=[["Luka Doncic","Pts + Reb + Ast",50.5,-115,-105],["Quentin Grimes","Points",13.5,+110,-140],["Luka Doncic","Assists",8.5,-120,+100]];
 add("03-dark-buttons",`<div style="background:#0d1117;padding:14px;color:#e6edf3">
  <div style="font-size:12px;color:#8b949e;margin-bottom:10px">LAL vs MEM · 10:00 PM</div>
  ${rows.map(([n,st,l,o,u])=>`<div style="background:#161b22;border-radius:12px;padding:12px;margin-bottom:10px">
   <div style="font-size:16px;font-weight:700">${n}</div><div style="font-size:12px;color:#8b949e;margin:2px 0 8px">${st}</div>
   <div style="display:flex;gap:8px">${[["Over",o],["Under",u]].map(([s,p])=>`<div style="flex:1;background:#21262d;border-left:3px solid #2ea043;border-radius:8px;padding:8px;font-size:14px;display:flex;justify-content:space-between"><span>${s} ${l}</span><b style="color:#3fb950">${sd(p)}</b></div>`).join("")}</div></div>`).join("")}</div>`,
  rows.map(([p,st,l,o,u])=>({player:p,stat:st==="Pts + Reb + Ast"?"Pts+Reb+Ast":st,line:l,over:o,under:u})))}

/* 4. bet slip, one straight bet with stake and to-win */
add("04-slip-single",`<div style="background:#fff;padding:16px;color:#111">
  <div style="font-size:13px;color:#1463ff;font-weight:700;margin-bottom:12px">FanDuel</div>
  <div style="font-size:12px;color:#666">STRAIGHT BET</div>
  <div style="font-size:17px;font-weight:700;margin:4px 0">Donovan Mitchell Over 25.5 Points</div>
  <div style="display:flex;justify-content:space-between;font-size:13px;color:#555"><span>CLE @ PHX</span><b style="color:#111">-112</b></div>
  <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:14px"><span>Wager $25.00</span><span>To Win $22.32</span></div></div>`,
  [{player:"Donovan Mitchell",stat:"Points",line:25.5,side:"over",odds:-112}]);

/* 5. parlay slip, dark */
{const legs=[["Devin Booker","Under",24.5,"Points",-110],["Scottie Barnes","Over",7.5,"Rebounds",-125],["Immanuel Quickley","Over",2.5,"Threes",-140]];
 add("05-parlay-dark",`<div style="background:#111;padding:16px;color:#f1f1f1">
  <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;margin-bottom:10px"><span>3-Leg Parlay</span><span style="color:#4ade80">+596</span></div>
  ${legs.map(([n,s,l,st,o])=>`<div style="border-top:1px solid #333;padding:10px 0"><div style="font-size:15px;font-weight:700">${n}</div><div style="font-size:13px;color:#bbb;display:flex;justify-content:space-between"><span>${s} ${l} ${st}</span><span>${sd(o)}</span></div></div>`).join("")}
  <div style="border-top:1px solid #333;padding-top:10px;font-size:13px;color:#bbb">Wager $10.00 · To Win $59.60</div></div>`,
  legs.map(([p,s,l,st,o])=>({player:p,stat:st==="Threes"?"3-Pointers":st,line:l,side:s.toLowerCase(),odds:o,parlay:true})))}

/* 6. two-column pick'em grid with More / Less and no odds (odds must be reported missing, never invented) */
{const cards=[["Ace Bailey","UTA vs MIL",17.5,"Points"],["Jared McCain","OKC @ NOP",14.5,"Points"],["Jeremiah Fears","NOP vs OKC",5.5,"Assists"],["Cedric Coward","MEM @ LAL",6.5,"Rebounds"]];
 add("06-grid-more-less",`<div style="background:#f7f7fb;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
  ${cards.map(([n,g,l,st])=>`<div style="background:#fff;border-radius:12px;padding:10px;text-align:center;color:#111"><div style="font-size:14px;font-weight:700">${n}</div><div style="font-size:11px;color:#777">${g}</div>
   <div style="font-size:22px;font-weight:800;margin:6px 0">${l}</div><div style="font-size:12px;color:#555">${st}</div>
   <div style="display:flex;gap:6px;margin-top:8px"><div style="flex:1;background:#eef;border-radius:6px;padding:5px;font-size:13px">Less</div><div style="flex:1;background:#eef;border-radius:6px;padding:5px;font-size:13px">More</div></div></div>`).join("")}</div>`,
  cards.map(([p,,l,st])=>({player:p,stat:st,line:l,over:null,under:null,noOdds:true})))}

/* 7. social media post */
add("07-social-post",`<div style="background:#fff;padding:16px;color:#0f1419;font-size:15px;line-height:1.45">
  <div style="font-weight:700">Sharp Hoops <span style="color:#536471;font-weight:400">@sharphoops · 2h</span></div>
  <div style="margin-top:6px">Tonight's card</div><div>Andrew Nembhard o6.5 ast (-120)</div><div>Isaiah Hartenstein u9.5 reb (+105)</div><div>Michael Porter Jr. over 22.5 pts -110</div>
  <div style="color:#536471;font-size:13px;margin-top:8px">12 Replies · 40 Reposts · 210 Likes</div></div>`,
  [{player:"Andrew Nembhard",stat:"Assists",line:6.5,side:"over",odds:-120},{player:"Isaiah Hartenstein",stat:"Rebounds",line:9.5,side:"under",odds:105},{player:"Michael Porter Jr.",stat:"Points",line:22.5,side:"over",odds:-110}]);

/* 8. one player, several markets, OVER / UNDER headers */
{const mk=[["Points",30.5,-110,-110],["Rebounds",11.5,-120,+100],["Assists",3.5,+120,-150],["Pts + Reb",42.5,-115,-105]];
 add("08-one-player-markets",`<div style="background:#fff;padding:14px;color:#111">
  <div style="font-size:20px;font-weight:800">Joel Embiid</div><div style="font-size:12px;color:#777;margin-bottom:10px">PHI vs HOU</div>
  <div style="display:flex;font-size:11px;color:#777;font-weight:700"><span style="flex:1">MARKET</span><span style="width:80px;text-align:center">OVER</span><span style="width:80px;text-align:center;margin-left:6px">UNDER</span></div>
  ${mk.map(([st,l,o,u])=>`<div style="display:flex;align-items:center;padding:9px 0;border-top:1px solid #eee"><div style="flex:1;font-size:14px">${st} <b>${l}</b></div>
   ${[o,u].map(p=>`<div style="width:80px;margin-left:6px;background:#f1f5f9;border-radius:6px;padding:7px 0;text-align:center;font-weight:700;font-size:14px">${sd(p)}</div>`).join("")}</div>`).join("")}</div>`,
  mk.map(([st,l,o,u])=>({player:"Joel Embiid",stat:st==="Pts + Reb"?"Pts+Reb":st,line:l,over:o,under:u})))}

/* 9. cropped: no header, last row cut off mid-button (that row must not be invented) */
{const rows=[["Kevin Durant",6.5,-105,-115],["Alperen Sengun",5.5,+110,-130]];
 add("09-cropped",`<div style="background:#fff;padding:0 14px;color:#111;height:186px;overflow:hidden">
  <div style="font-size:13px;color:#555;padding:6px 0">Assists</div>
  ${[...rows,["Amen Thompson",4.5,-120,+100]].map(([n,l,o,u])=>`<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #eee"><div style="flex:1;font-size:15px;font-weight:600">${n}</div>
   ${[["O",o],["U",u]].map(([s,p])=>`<div style="width:78px;margin-left:8px;background:#f3f4f6;border-radius:8px;padding:6px 0;text-align:center"><div style="font-size:13px">${s} ${l}</div><div style="font-size:14px;font-weight:700">${sd(p)}</div></div>`).join("")}</div>`).join("")}</div>`,
  rows.map(([p,l,o,u])=>({player:p,stat:"Assists",line:l,over:o,under:u})).concat([{player:"Amen Thompson",stat:"Assists",cutOff:true}]))}

/* 10. small, low-resolution version of layout 1 */
shots.push({...shots[0],name:"10-lowres",opt:{scale:1}});T["10-lowres"]=T["01-stacked-light"];

/* 11. prediction market */
add("11-kalshi",`<div style="background:#fff;padding:16px;color:#111">
  <div style="font-size:13px;color:#00a36c;font-weight:800;margin-bottom:8px">Kalshi</div>
  <div style="font-size:16px;font-weight:700">Victor Wembanyama: 25+ points</div>
  <div style="display:flex;gap:10px;margin-top:10px"><div style="flex:1;background:#e7f6ef;border-radius:8px;padding:10px;text-align:center;font-weight:700;color:#00a36c">Yes 54¢</div><div style="flex:1;background:#fdecec;border-radius:8px;padding:10px;text-align:center;font-weight:700;color:#d33">No 47¢</div></div></div>`,
  [{player:"Victor Wembanyama",stat:"Points",line:24.5,over:-117,under:113}]);

/* 12. odds hidden under a sticker (partially obscured): line readable, odds not */
add("12-obscured-odds",`<div style="background:#fff;padding:16px;color:#111;position:relative">
  <div style="font-size:16px;font-weight:700">Jaden McDaniels</div><div style="font-size:12px;color:#777">Points</div>
  <div style="display:flex;gap:8px;margin-top:8px">${["Over","Under"].map(s=>`<div style="flex:1;background:#f3f4f6;border-radius:8px;padding:8px;font-size:14px;display:flex;justify-content:space-between"><span>${s} 12.5</span><b>-110</b></div>`).join("")}</div>
  <div style="position:absolute;right:10px;top:58px;width:250px;height:42px;background:#ffd400;border-radius:20px;transform:rotate(-3deg)"></div></div>`,
  [{player:"Jaden McDaniels",stat:"Points",line:12.5,over:null,under:null,noOdds:true}]);


/* ---------- held-out set: written after the reader was tuned on 01-12, scored separately, never tuned on ---------- */
if(process.env.HOLD&&process.env.HOLD!=="fresh"){shots.length=0;for(const k in T)delete T[k];
 {const rows=[["Jalen Smith",7.5,-118,-102],["Isaiah Hartenstein",8.5,+102,-122],["Aday Mara",5.5,-140,+115]];
  add("h1-line-column",`<div style="background:#fbfbfd;padding:12px;font-family:Arial;color:#222">
   <div style="font-size:16px;font-weight:700;margin-bottom:6px">Rebounds</div>
   <div style="display:flex;font-size:10px;letter-spacing:1px;color:#999;padding:4px 0"><span style="flex:1">PLAYER</span><span style="width:60px;text-align:center">LINE</span><span style="width:70px;text-align:center">OVER</span><span style="width:70px;text-align:center">UNDER</span></div>
   ${rows.map(([n,l,o,u])=>`<div style="display:flex;align-items:center;padding:10px 0;border-top:1px solid #e3e3ea;font-size:14px"><span style="flex:1;font-weight:600">${n}</span><span style="width:60px;text-align:center">${l}</span>
    ${[o,u].map(p=>`<span style="width:62px;margin-left:8px;text-align:center;background:#6d28d9;color:#fff;border-radius:6px;padding:6px 0;font-weight:700">${sd(p)}</span>`).join("")}</div>`).join("")}</div>`,
   rows.map(([p,l,o,u])=>({player:p,stat:"Rebounds",line:l,over:o,under:u})))}
 add("h2-two-straights",`<div style="background:#fff;padding:14px;color:#111;font-size:14px">
   <div style="font-weight:800;font-size:15px;margin-bottom:8px">My Bets · Open</div>
   <div style="border:1px solid #ddd;border-radius:10px;padding:10px;margin-bottom:10px"><div style="font-size:11px;color:#888">SINGLE</div><div style="font-weight:700">Scottie Barnes Over 20.5 Points</div><div style="display:flex;justify-content:space-between;color:#555"><span>Odds</span><b style="color:#111">+105</b></div></div>
   <div style="border:1px solid #ddd;border-radius:10px;padding:10px"><div style="font-size:11px;color:#888">SINGLE</div><div style="font-weight:700">Kevin Durant Under 5.5 Assists</div><div style="display:flex;justify-content:space-between;color:#555"><span>Odds</span><b style="color:#111">-125</b></div></div></div>`,
   [{player:"Scottie Barnes",stat:"Points",line:20.5,side:"over",odds:105},{player:"Kevin Durant",stat:"Assists",line:5.5,side:"under",odds:-125}]);
 {const c=[["Brayden Burries","3PT Made",1.5,+130,-160],["Yves Missi","Rebounds",8.5,-108,-112]];
  add("h3-dark-higher-lower",`<div style="background:#1b1b2f;padding:12px;color:#fafafa">
   ${c.map(([n,st,l,o,u])=>`<div style="background:#26264a;border-radius:14px;padding:12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:15px">${n}</b><span style="font-size:20px;font-weight:800">${l}</span></div><div style="font-size:12px;color:#aab">${st}</div>
    <div style="display:flex;gap:8px;margin-top:8px">${[["Higher",o],["Lower",u]].map(([s,p])=>`<div style="flex:1;border:1px solid #4b4b80;border-radius:8px;padding:7px;text-align:center;font-size:13px">${s} <b style="color:#7dd3fc">${sd(p)}</b></div>`).join("")}</div></div>`).join("")}</div>`,
   c.map(([p,st,l,o,u])=>({player:p,stat:st==="3PT Made"?"3-Pointers":st,line:l,over:o,under:u})))}
 add("h4-paren-buttons",`<div style="background:#fff;padding:14px;color:#111">
   <div style="font-size:15px;font-weight:700">Michael Porter Jr.</div><div style="font-size:12px;color:#666;margin-bottom:8px">Pts + Reb + Ast</div>
   <div style="display:flex;gap:8px">${[["Over",-120],["Under",-108]].map(([s,p])=>`<div style="flex:1;background:#ecfdf5;border-radius:20px;padding:9px;text-align:center;font-size:14px">${s} 31.5 (${sd(p)})</div>`).join("")}</div></div>`,
   [{player:"Michael Porter Jr.",stat:"Pts+Reb+Ast",line:31.5,over:-120,under:-108}]);
 {const rows=[["James Harden",8.5,-130,+105],["Donovan Mitchell",5.5,+100,-125],["Jaylen Brown",3.5,-115,-105]];
  add("h5-tiny-2x",`<div style="background:#fff;padding:8px;color:#111;font-size:11px"><div style="font-weight:700;margin-bottom:4px">Assists</div>
   ${rows.map(([n,l,o,u])=>`<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #eee"><div style="flex:1;font-weight:600">${n}</div>
    ${[["O",o],["U",u]].map(([s2,p])=>`<div style="width:62px;margin-left:6px;background:#f3f4f6;border-radius:6px;padding:4px 0;text-align:center"><div>${s2} ${l}</div><div style="font-weight:700">${sd(p)}</div></div>`).join("")}</div>`).join("")}</div>`,
   rows.map(([p,l,o,u])=>({player:p,stat:"Assists",line:l,over:o,under:u})),{scale:2})}
}

/* ---------- fresh set (HOLD=fresh): written Nov 24 2026 after all reader changes, run once, not tuned on ---------- */
if(process.env.HOLD==="fresh"){shots.length=0;for(const k in T)delete T[k];
 {const rows=[["Anthony Edwards",26.5,-112,-108],["Julius Randle",19.5,+100,-120],["Rudy Gobert",11.5,-135,+110]];
  add("f1-inline-buttons",`<div style="background:#fff;padding:12px;color:#0f172a;font-family:Arial">
   <div style="font-size:13px;color:#64748b">DEN @ MIN · 8:00 PM</div><div style="font-size:17px;font-weight:800;margin:4px 0 8px">Points</div>
   ${rows.map(([n,l,o,u],i)=>`<div style="display:flex;align-items:center;padding:9px 0;border-top:1px solid #e2e8f0"><div style="flex:1;font-weight:700;font-size:14px">${n}</div>
    ${[["o",o],["u",u]].map(([s2,p])=>`<div style="width:92px;margin-left:6px;border:1px solid #cbd5e1;border-radius:8px;padding:7px 0;text-align:center;font-size:13px">${s2}${l} <b>${sd(p)}</b></div>`).join("")}</div>`).join("")}</div>`,
   rows.map(([p,l,o,u])=>({player:p,stat:"Points",line:l,over:o,under:u})))}
 add("f2-dark-slip",`<div style="background:#0b0f19;padding:14px;color:#e5e7eb;font-family:Arial">
   <div style="font-size:12px;color:#9ca3af">Bet Slip · Straight</div>
   <div style="font-size:16px;font-weight:700;margin-top:6px">Cade Cunningham</div><div style="font-size:13px;color:#9ca3af">Over 8.5 Assists</div>
   <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px"><span>Odds</span><b style="color:#34d399">-118</b></div>
   <div style="display:flex;justify-content:space-between;font-size:13px;color:#9ca3af"><span>Wager $20.00</span><span>To win $16.95</span></div></div>`,
   [{player:"Cade Cunningham",stat:"Assists",line:8.5,side:"over",odds:-118}]);
 add("f3-tweet",`<div style="background:#fff;padding:14px;color:#0f1419;font-family:Arial;font-size:15px;line-height:1.35">
   <div style="font-weight:700">Hoops Picks <span style="color:#536471;font-weight:400">@hooppicks · 3h</span></div>
   <div style="margin-top:6px">Tonight's card:</div><div>Shai Gilgeous-Alexander over 30.5 points (-115)</div><div>Chet Holmgren under 8.5 rebounds (+102)</div></div>`,
   [{player:"Shai Gilgeous-Alexander",stat:"Points",line:30.5,side:"over",odds:-115},{player:"Chet Holmgren",stat:"Rebounds",line:8.5,side:"under",odds:102}]);
 add("f4-parlay-light",`<div style="background:#fff;padding:14px;color:#111;font-family:Arial">
   <div style="display:flex;justify-content:space-between;font-weight:800"><span>3-Leg Parlay</span><span>+596</span></div>
   ${[["Pascal Siakam","Over 21.5 Points",-110],["Tyrese Haliburton","Over 9.5 Assists",-105],["Myles Turner","Under 6.5 Rebounds",-120]].map(([n,d,p])=>`<div style="border-top:1px solid #eee;padding:8px 0"><div style="font-weight:700;font-size:14px">${n}</div><div style="display:flex;justify-content:space-between;font-size:13px;color:#444"><span>${d}</span><span>${sd(p)}</span></div></div>`).join("")}</div>`,
   [{player:"Pascal Siakam",stat:"Points",line:21.5,side:"over",odds:-110,parlay:true},{player:"Tyrese Haliburton",stat:"Assists",line:9.5,side:"over",odds:-105,parlay:true},{player:"Myles Turner",stat:"Rebounds",line:6.5,side:"under",odds:-120,parlay:true}]);
 {const m=[["Points",28.5,-110,-110],["Rebounds",12.5,+105,-125],["Assists",9.5,-120,+100]];
  add("f5-one-player-blue",`<div style="background:#f8fafc;padding:12px;color:#0f172a;font-family:Arial">
   <div style="font-size:17px;font-weight:800">Nikola Jokic</div><div style="font-size:12px;color:#64748b;margin-bottom:6px">DEN vs MIN</div>
   ${m.map(([st,l,o,u])=>`<div style="display:flex;align-items:center;padding:8px 0;border-top:1px solid #e2e8f0"><div style="flex:1;font-size:14px">${st}</div>
    ${[["O",o],["U",u]].map(([s2,p])=>`<div style="width:80px;margin-left:6px;background:#dbeafe;border-radius:8px;padding:5px 0;text-align:center;font-size:13px"><div>${s2} ${l}</div><div style="font-weight:700;color:#1d4ed8">${sd(p)}</div></div>`).join("")}</div>`).join("")}</div>`,
   m.map(([st,l,o,u])=>({player:"Nikola Jokic",stat:st,line:l,over:o,under:u})))}
 {const rows=[["Paolo Banchero",24.5],["Franz Wagner",21.5]];
  add("f6-pickem-dark",`<div style="background:#111827;padding:12px;color:#f9fafb;font-family:Arial">
   ${rows.map(([n,l])=>`<div style="background:#1f2937;border-radius:12px;padding:12px;margin-bottom:8px"><div style="font-weight:700;font-size:15px">${n}</div><div style="font-size:22px;font-weight:800;margin:4px 0">${l} <span style="font-size:13px;color:#9ca3af;font-weight:400">Points</span></div>
    <div style="display:flex;gap:8px">${["Less","More"].map(s2=>`<div style="flex:1;border:1px solid #374151;border-radius:8px;padding:7px;text-align:center;font-size:13px">${s2}</div>`).join("")}</div></div>`).join("")}</div>`,
   rows.map(([p,l])=>({player:p,stat:"Points",line:l,over:null,under:null,noOdds:true})))}
}
(async()=>{const b=await pp.launch({executablePath:process.env.CHROME||"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox"]});
  for(const s of shots){const pg=await b.newPage();await pg.setViewport({width:390,height:300,deviceScaleFactor:s.opt.scale||3});
    await pg.setContent(`<html><head><style>${css}</style></head><body>${s.html}</body></html>`);const el=await pg.$("body > div");
    await el.screenshot({path:path.join(OUT,s.name+".png")});await pg.close()}
  fs.writeFileSync(path.join(__dirname,process.env.HOLD==="fresh"?"truth-fresh.json":process.env.HOLD?"truth-holdout.json":"truth.json"),JSON.stringify(T,null,1));await b.close();console.log("wrote",shots.length,"screenshots")})();
