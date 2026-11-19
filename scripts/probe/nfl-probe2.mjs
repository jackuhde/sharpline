const C="https://sports.core.api.espn.com/v2/sports/football/leagues/nfl",S="https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const j=async u=>{const r=await fetch(u);return r.ok?r.json():{_err:r.status}};
const sb=await j(S+"/scoreboard");const ev=sb.events.find(e=>e.competitions[0].status.type.state==="pre");const id=ev.id;
let items=[];for(const p of [1,2]){const pb=await j(`${C}/events/${id}/competitions/${id}/odds/100/propBets?lang=en&region=us&limit=1000&page=${p}`);items=items.concat(pb.items||[])}
const strip=x=>{const y={...x};delete y.competition;delete y.provider;if(y.athlete)y.athlete=y.athlete.$ref.replace(/.*athletes\//,"A");if(y.team)y.team=y.team.$ref.replace(/.*teams\//,"T");return y};
for(const t of ["13","14","31","29","32","98","72","73","74","104","195","22","26"]){const xs=items.filter(x=>x.type&&x.type.id===t).slice(0,3);console.log("T"+t,JSON.stringify(xs.map(strip)))}
const keys=new Set();items.forEach(x=>Object.keys(x).forEach(k=>keys.add(k)));console.log("KEYS",[...keys].join(","));
const sum=await j(`${S}/summary?event=${id}`);const bx=sum.boxscore||{};console.log("BXTEAMS",JSON.stringify((bx.teams||[]).map(t=>({t:t.team?.abbreviation,stats:(t.statistics||[]).map(s=>s.name).slice(0,30)}))).slice(0,1500));
const done=(await j(S+"/scoreboard?seasontype=2&week=10")).events[0].id;const fs2=await j(`${S}/summary?event=${done}`);
const P=fs2.boxscore.players[0];console.log("BXP",JSON.stringify({team:P.team.id,stats:P.statistics.map(s=>({n:s.name,keys:s.keys,labels:s.labels,a0:s.athletes?.[0]&&{ath:{id:s.athletes[0].athlete.id,n:s.athletes[0].athlete.displayName,pos:s.athletes[0].athlete.position,j:s.athletes[0].athlete.jersey},stats:s.athletes[0].stats}}))}).slice(0,4000));
console.log("TEAMSTATS",JSON.stringify((fs2.boxscore.teams||[])[0]?.statistics?.map(s=>s.name+"="+s.displayValue)).slice(0,1500));
const r=await j(S+"/teams/12/roster");console.log("ROSTER",JSON.stringify((r.athletes||[]).map(g=>({g:g.position,a:(g.items||[]).slice(0,1).map(a=>({id:a.id,n:a.displayName,pos:a.position?.abbreviation,j:a.jersey,st:a.status,inj:a.injuries}))}))).slice(0,2000));
const inj=await j(S+"/injuries");console.log("INJ",JSON.stringify(inj.injuries[0].injuries.slice(0,3).map(i=>({st:i.status,date:i.date,type:i.type,det:i.details,ath:{id:i.athlete?.links?.[0]?.href,pos:i.athlete?.position?.abbreviation}}))).slice(0,1500),JSON.stringify(Object.keys(inj.injuries[0])));
const live=sb.events.find(e=>e.competitions[0].situation);console.log("SIT",JSON.stringify(live&&live.competitions[0].situation));
