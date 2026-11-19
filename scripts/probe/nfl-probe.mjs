// One-off audit of what ESPN's free feeds return for the NFL. Writes probe-out/*.json (not committed).
import fs from "fs";fs.mkdirSync("probe-out",{recursive:true});
const S="https://site.api.espn.com/apis/site/v2/sports/football/nfl",C="https://sports.core.api.espn.com/v2/sports/football/leagues/nfl",W="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl";
const j=async u=>{try{const r=await fetch(u);return r.ok?await r.json():{_err:r.status,u}}catch(e){return{_err:String(e),u}}};
const save=(n,o)=>fs.writeFileSync("probe-out/"+n+".json",JSON.stringify(o,null,1));
const sb=await j(S+"/scoreboard");save("scoreboard",sb);
const out={week:sb.week,season:sb.season,calendarTypes:(sb.leagues?.[0]?.calendar||[]).map(c=>({label:c.label,entries:(c.entries||[]).length})),games:[]};
for(const e of sb.events||[]){const c=e.competitions[0];out.games.push({id:e.id,date:e.date,name:e.shortName,state:c.status.type.state,detail:c.status.type.shortDetail,odds:!!(c.odds&&c.odds.length),provider:c.odds?.[0]?.provider?.name,records:c.competitors.map(t=>t.records?.[0]?.summary),situation:!!c.situation})}
const ev=(sb.events||[]).find(e=>e.competitions[0].status.type.state==="pre")||sb.events?.[0];
if(ev){const id=ev.id;
  const odds=await j(`${C}/events/${id}/competitions/${id}/odds`);save("odds-list",odds);out.providers=(odds.items||[]).map(o=>({id:o.provider?.id,name:o.provider?.name,details:o.details,spread:o.spread,ou:o.overUnder}));
  for(const p of [100,200,1002,58,59,40,1004]){const pb=await j(`${C}/events/${id}/competitions/${id}/odds/${p}/propBets?lang=en&region=us&limit=1000&page=1`);
    if(pb._err){out["prov"+p]=pb._err;continue}const types={};(pb.items||[]).forEach(x=>{const k=(x.type&&(x.type.id+"|"+x.type.name))||"?";types[k]=(types[k]||0)+1});
    out["prov"+p]={count:pb.count,pages:pb.pageCount,types};if(p===100)save("propbets-100-p1",pb)}
  const sum=await j(`${S}/summary?event=${id}`);save("summary-pre",{keys:Object.keys(sum),pickcenter:sum.pickcenter,injuries:sum.injuries?.map(t=>({team:t.team?.abbreviation,n:t.injuries?.length,sample:t.injuries?.slice(0,3)})),odds:sum.odds});
}
const done=(sb.events||[]).find(e=>e.competitions[0].status.type.completed);
const prevWeek=await j(S+`/scoreboard?seasontype=2&week=${(sb.week?.number||2)-1}`);const pe=(prevWeek.events||[])[0];out.prevWeekGames=(prevWeek.events||[]).length;
const did=(done||pe)?.id;if(did){const sum=await j(`${S}/summary?event=${did}`);save("summary-final",{boxscore:sum.boxscore,keys:Object.keys(sum)});
  out.boxCats=(sum.boxscore?.players?.[0]?.statistics||[]).map(s=>({name:s.name,labels:s.labels,n:s.athletes?.length}));
  const ath=sum.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.[0]?.athlete;out.sampleAth=ath&&{id:ath.id,name:ath.displayName};
  if(ath){const gl=await j(`${W}/athletes/${ath.id}/gamelog`);save("gamelog",gl);out.gamelogLabels=gl.labels;out.gamelogNames=gl.names;
    const bio=await j(`${W}/athletes/${ath.id}`);save("athlete",{athlete:{headshot:bio.athlete?.headshot,position:bio.athlete?.position,jersey:bio.athlete?.jersey,status:bio.athlete?.status,injuries:bio.athlete?.injuries}})}}
const inj=await j(S+"/injuries");out.injuries={teams:(inj.injuries||[]).length,sample:(inj.injuries||[])[0]?.injuries?.slice(0,2)};
const tm=await j(S+"/teams/12/roster");out.roster={groups:(tm.athletes||[]).map(g=>g.position+":"+(g.items||[]).length),sample:tm.athletes?.[0]?.items?.[0]&&{n:tm.athletes[0].items[0].displayName,pos:tm.athletes[0].items[0].position?.abbreviation,head:tm.athletes[0].items[0].headshot?.href,jersey:tm.athletes[0].items[0].jersey}};
const dc=await j(`${C}/seasons/${sb.season?.year||2026}/teams/12/depthcharts`);out.depthchart=dc._err?dc._err:{count:dc.count};
save("summary",out);console.log(JSON.stringify(out,null,1).slice(0,6000));
