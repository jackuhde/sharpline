/* Sharpline: followed players, recently viewed profiles and injury alerts for followed players.
   Everything is stored on this phone only (localStorage). Nothing is sent anywhere.
   Cross-device sync would need an account backend, which has not been approved. */
(function(){
  const LS=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
  const SV=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
  const esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const N=s=>(typeof normN==="function"?normN(s):String(s||"").toLowerCase());
  const LBL={out:"Out",doubt:"Doubtful",quest:"Questionable",dtd:"Day-to-day",prob:"Probable",none:"No injury listed"};
  /* the ESPN injury report entry for this player on his current team, or "none" */
  function injOf(n,t){const j=(typeof LIVE!=="undefined"&&LIVE.inj||{})[N(n)];if(!j)return"none";if(t&&typeof nick==="function"&&nick(j.team)!==nick(t))return"none";return j.level||"none"}
  const F={
    follows:()=>LS("sl_follow",[]),recent:()=>LS("sl_recent",[]),alerts:()=>LS("sl_alerts",[]),
    isF(n){return F.follows().some(x=>N(x.n)===N(n))},
    toggle(n,t){let L=F.follows();const on=!F.isF(n);
      if(on)L.unshift({n,t,ts:Date.now(),inj:typeof LIVE!=="undefined"&&LIVE.injTs?injOf(n,t):undefined});else L=L.filter(x=>N(x.n)!==N(n));
      SV("sl_follow",L.slice(0,40));F.paint();return on},
    seen(n,t){if(!n)return;const L=F.recent().filter(x=>N(x.n)!==N(n));L.unshift({n,t:t||"",ts:Date.now()});SV("sl_recent",L.slice(0,12));F.paint()},
    paint(){const el=document.getElementById("slFollow");if(el)el.innerHTML=F.strip()},
    clearRecent(){SV("sl_recent",[])},
    dismiss(i){const A=F.alerts();A.splice(i,1);SV("sl_alerts",A)},
    /* called after each ESPN injury refresh: records a change in a followed player's status since the last check */
    checkInj(){if(typeof LIVE==="undefined"||!LIVE.injTs)return 0;const L=F.follows();let A=F.alerts(),n=0;
      L.forEach(f=>{const cur=injOf(f.n,f.t);if(f.inj===undefined){f.inj=cur;return}
        if(cur!==f.inj){A.unshift({n:f.n,t:f.t,from:f.inj,to:cur,ts:Date.now()});f.inj=cur;n++}});
      SV("sl_follow",L);A=A.filter(a=>Date.now()-a.ts<3*864e5).slice(0,20);SV("sl_alerts",A);
      if(n&&window.toast)toast(n===1?`Injury update: ${A[0].n} is now ${LBL[A[0].to]||A[0].to}`:`${n} injury updates for players you follow`);
      return n},
    label:l=>LBL[l]||l,
    strip(){const fl=F.follows(),rc=F.recent().filter(r=>!F.isF(r.n)).slice(0,8),al=F.alerts().slice(0,4);
      if(!fl.length&&!rc.length&&!al.length)return"";
      const chip=(x,star)=>{const lv=typeof LIVE!=="undefined"&&LIVE.injTs?injOf(x.n,x.t):null;
        return`<button class="sl-fc" ${pfAttr({n:x.n,t:x.t})}>${star?`<i class="star">★</i>`:""}${esc(x.n)}${lv&&lv!=="none"?`<em class="lv-${lv}">${esc(LBL[lv]||lv)}</em>`:""}</button>`};
      return`<div class="sl-follow">
        ${al.length?`<div class="sl-al">${al.map((a,i)=>`<div class="sl-ai"><span><b ${pfAttr({n:a.n,t:a.t})} class="pfn">${esc(a.n)}</b> ${esc(LBL[a.from]||a.from)} → <b>${esc(LBL[a.to]||a.to)}</b></span><small>${new Date(a.ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} · ESPN</small><button data-sldis="${i}" aria-label="Dismiss">×</button></div>`).join("")}</div>`:""}
        ${fl.length?`<div class="sl-row"><span class="sl-h">Following</span>${fl.map(x=>chip(x,true)).join("")}</div>`:""}
        ${rc.length?`<div class="sl-row"><span class="sl-h">Recently viewed</span>${rc.map(x=>chip(x,false)).join("")}<button class="sl-clr" data-slclr="1">Clear</button></div>`:""}
        <div class="sl-note">Saved on this phone only.</div></div>`}
  };
  /* "Live" link on a started game's pregame card */
  document.addEventListener("click",e=>{if(e.target.closest("[data-golive]")&&window.go){e.preventDefault();go("live");scrollTo(0,0)}});
  document.addEventListener("click",e=>{const t=e.target.closest("[data-sldis],[data-slclr]");if(!t)return;
    if(t.dataset.sldis!=null)F.dismiss(+t.dataset.sldis);else F.clearRecent();
    const el=document.getElementById("slFollow");if(el)el.innerHTML=F.strip()});
  window.SLF=F;
})();
