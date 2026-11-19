// Shared math, copied from Sharpline's index.html so the backtest scores the same model the app runs.
export const dec=a=>a>0?1+a/100:1+100/Math.abs(a);export const imp=a=>1/dec(a);export const evOf=(p,am)=>p*dec(am)-1;
export function erf(x){const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y}
export const Phi=z=>.5*(1+erf(z/Math.SQRT2));
export function invPhi(p){p=Math.min(.9999,Math.max(.0001,p));let lo=-8,hi=8;for(let i=0;i<70;i++){const m=(lo+hi)/2;if(Phi(m)<p)lo=m;else hi=m}return(lo+hi)/2}
export function poisOver(lam,L){let k=Math.floor(L),c=0,t=Math.exp(-lam);for(let i=0;i<=k;i++){c+=t;t*=lam/(i+1)}return 1-c}
export function poisMean(pO,L){let lo=.01,hi=40;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(poisOver(m,L)<pO)lo=m;else hi=m}return(lo+hi)/2}
export function devig(a,b){const pa=imp(a),pb=imp(b);let lo=.5,hi=3,k=1;for(let i=0;i<60;i++){k=(lo+hi)/2;if(Math.pow(pa,k)+Math.pow(pb,k)>1)lo=k;else hi=k}return[Math.pow(pa,k),Math.pow(pb,k)]}
export function sdFor(st,l){l=Math.max(.5,+l||0);switch(st){
  case"Points":return Math.max(3,.32*l+2.2);case"Rebounds":return Math.max(1.6,.35*l+1.2);case"Assists":return Math.max(1.3,.38*l+1);
  case"3-Pointers":case"Steals":case"Blocks":case"Turnovers":return 1.1*Math.sqrt(l)+.3;
  case"Pts+Reb+Ast":return .26*l+3.2;case"Pts+Reb":case"Pts+Ast":return .27*l+2.8;case"Reb+Ast":return .3*l+1.8;default:return Math.max(1,.3*l+1)}}
export const COMP={"Points":["pts"],"Rebounds":["reb"],"Assists":["ast"],"3-Pointers":["tpm"],"Steals":["stl"],"Blocks":["blk"],"Pts+Reb+Ast":["pts","reb","ast"],"Pts+Reb":["pts","reb"],"Pts+Ast":["pts","ast"],"Reb+Ast":["reb","ast"]};
export const COUNT={"3-Pointers":1,"Steals":1,"Blocks":1};
export const K=["min","pts","reb","ast","tpm","stl","blk","to"];
