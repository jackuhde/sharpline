/* Same-game parlay chance with correlation.
   Each leg is a latent normal variable that hits above its own cutoff (set from the leg's chance). Legs in the same game
   share correlations measured on this season's NFL box scores (data/nfl/corr.json: same player, teammates, opponents,
   by position group and stat). An Under flips the sign. The chance that every leg hits is estimated by simulation
   (fixed seed, so it doesn't jitter). Legs in different games are independent. Pairs with no measured correlation
   (game lines, NBA) count as 0 and are reported, so the number never claims more than the data supports. */
(function(root){
let DATA=null,loading=null;
function load(url){if(DATA||loading||typeof fetch==="undefined")return loading;loading=fetch(url||"data/nfl/corr.json?v="+Math.floor(Date.now()/36e5)).then(r=>r.ok?r.json():null).then(j=>{DATA=j&&j.pairs||{};return DATA}).catch(()=>{DATA={}});return loading}
function setData(p){DATA=p}
const grp=p=>p==="FB"?"RB":p==="PK"?"K":p;
/* leg: {game, ath, pos, tid, stat, dir (+1 over/yes, -1 under/no), p} */
function rho(a,b){if(a.game==null||a.game!==b.game||!a.stat||!b.stat)return null;
  /* game lines: moneyline and spread both ride the final margin (same latent variable); total rides points scored */
  const ga=/^G:/.test(a.stat),gb=/^G:/.test(b.stat);if(ga||gb){if(!(ga&&gb))return null;if(a.stat===b.stat)return .95;
    const r=window.GameModel&&GameModel.rhoMT(a.sport||b.sport);return r}
  if(!DATA||a.ath==null||b.ath==null)return null;
  if(a.ath===b.ath){if(a.stat===b.stat)return .95;const[x,y]=[a.stat,b.stat].sort();const v=DATA[`S|${x}|${y}`];return v?v[0]:null}
  const rel=a.tid===b.tid?"T":"O",k1=`${grp(a.pos)}:${a.stat}`,k2=`${grp(b.pos)}:${b.stat}`;const v=DATA[`${rel}|${k1<=k2?k1:k2}|${k1<=k2?k2:k1}`];return v?v[0]:null}
function Phi(x){const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
function invPhi(p){let lo=-8,hi=8;for(let i=0;i<60;i++){const m=(lo+hi)/2;Phi(m)<p?lo=m:hi=m}return(lo+hi)/2}
function chol(R){const n=R.length,L=R.map(()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=R[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];
  if(i===j){if(s<=1e-9)return null;L[i][i]=Math.sqrt(s)}else L[i][j]=s/L[j][j]}return L}
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function gauss(r){let u=0,v=0;while(!u)u=r();v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
/* returns {p, indep, pairs:[{i,j,rho}], unknown} or null if any leg lacks a chance */
function joint(legs,opt){opt=opt||{};if(!legs.length||legs.some(l=>l.p==null))return null;
  const live=legs.filter(l=>l.p<1);if(live.some(l=>l.p<=0))return{p:0,indep:0,pairs:[],unknown:0};
  const indep=live.reduce((a,l)=>a*l.p,1);if(live.length<2)return{p:indep,indep,pairs:[],unknown:0};
  const n=live.length,R=live.map(()=>Array(n).fill(0)),pairs=[];let unknown=0;
  for(let i=0;i<n;i++){R[i][i]=1;for(let j=0;j<i;j++){if(live[i].game!==live[j].game)continue;const r=rho(live[i],live[j]);
    if(r==null){unknown++;continue}const v=Math.max(-.9,Math.min(.95,r*(live[i].dir||1)*(live[j].dir||1)));R[i][j]=R[j][i]=v;pairs.push({i:legs.indexOf(live[i]),j:legs.indexOf(live[j]),rho:v})}}
  if(!pairs.length)return{p:indep,indep,pairs,unknown};
  let L=chol(R),sh=1;while(!L&&sh>.2){sh*=.9;L=chol(R.map((row,i)=>row.map((v,j)=>i===j?1:v*sh)))}if(!L)return{p:indep,indep,pairs,unknown};
  const cut=live.map(l=>invPhi(1-l.p)),N=opt.n||40000,r=rng(opt.seed||1234567);let hit=0;const z=Array(n);
  for(let s=0;s<N;s++){for(let i=0;i<n;i++)z[i]=gauss(r);let ok=true;for(let i=0;i<n&&ok;i++){let x=0;for(let k=0;k<=i;k++)x+=L[i][k]*z[k];if(x<=cut[i])ok=false}if(ok)hit++}
  return{p:hit/N,indep,pairs,unknown}}
/* a tracked or slip leg in the shape joint() needs. dir: +1 for the home side / over / yes, -1 for the away side / under */
function legOf(l,p){const s=l.spec||{},sport=s.sport||l.sport||"nba",game=s.ev||l.evid||l.game;
  if(s.kind==="ml"||s.kind==="sp"){const home=s.teamName?s.teamName===l.home:s.team===l.home;return{game,sport,stat:"G:mar",dir:home?1:-1,p}}
  if(s.kind==="tot")return{game,sport,stat:"G:tot",dir:s.side==="u"?-1:1,p};
  const A=(sport==="nfl"&&window.NFL&&NFL.N.stats&&NFL.N.stats.ath)||{},a=A[s.ath]||[];
  return{game,sport,ath:s.ath,pos:a[1]||s.pos,tid:a[2],stat:sport==="nfl"?(s.stat==="td2"?"td":s.stat):null,dir:s.side==="u"||s.side==="no"?-1:1,p}}
root.SLCorr={load,setData,rho,joint,legOf,ready:()=>!!DATA};
})(typeof window!=="undefined"?window:module.exports);
