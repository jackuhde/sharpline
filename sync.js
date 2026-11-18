/* Sharpline: optional sign-in (Supabase, email and password) that syncs tracked bets, settings,
   followed players and recently viewed players across devices.
   The publishable key below is meant to be public; row level security (supabase/setup.sql)
   lets each signed-in person read and write only their own row. Without sign-in, nothing leaves the phone. */
(function(){
  const CFG={url:"https://hdrdqlffprorqhmlkywg.supabase.co",key:""};   // key: Project Settings > API Keys > publishable
  const LIB="vendor/supabase-2.119.1.js";
  const KEYS=["sl_bets","sl_unit","sl_set","sl_follow","sl_recent","sl_alerts"];
  const META="sl_sync_meta";   // {key: last local change time, _synced: last successful sync, _uid}
  const esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const S={on:!!CFG.key,sb:null,user:null,status:"",busy:false,err:""};
  const raw=Storage.prototype.setItem;
  const meta=()=>{try{return JSON.parse(localStorage.getItem(META))||{}}catch(e){return{}}};
  const setMeta=m=>raw.call(localStorage,META,JSON.stringify(m));
  const val=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};

  /* note every local change to a synced key, then push shortly after */
  let pushT=null;
  if(S.on)Storage.prototype.setItem=function(k,v){raw.call(this,k,v);
    if(this===localStorage&&KEYS.includes(k)&&!S.applying){const m=meta();m[k]=Date.now();setMeta(m);clearTimeout(pushT);pushT=setTimeout(push,1500)}};

  function load(){return new Promise((ok,no)=>{if(window.supabase)return ok();const s=document.createElement("script");s.src=LIB;s.onload=ok;s.onerror=()=>no(new Error("lib"));document.head.appendChild(s)})}

  /* lists that should combine on a first sync rather than one device overwriting the other */
  function union(a,b,id){const out=[],seen=new Set();[...(a||[]),...(b||[])].forEach(x=>{const k=id(x);if(!seen.has(k)){seen.add(k);out.push(x)}});return out}
  const IDS={sl_bets:x=>x&&x.id,sl_follow:x=>x&&String(x.n).toLowerCase(),sl_recent:x=>x&&String(x.n).toLowerCase(),sl_alerts:x=>x&&(x.n+"|"+x.ts)};

  async function pull(){if(!S.user)return;S.busy=true;paint();
    try{const{data,error}=await S.sb.from("user_data").select("data").eq("user_id",S.user.id).maybeSingle();if(error)throw error;
      const remote=(data&&data.data)||{},m=meta(),first=m._uid!==S.user.id;let changed=false,needPush=false;
      S.applying=true;
      KEYS.forEach(k=>{const r=remote[k],lt=m[k]||0,lv=val(k);
        if(first&&r&&IDS[k]&&Array.isArray(r.v)){const merged=union(r.v,lv,IDS[k]);if(k==="sl_bets")merged.sort((a,b)=>(b.id||0)-(a.id||0));
          if(JSON.stringify(merged)!==JSON.stringify(lv)){raw.call(localStorage,k,JSON.stringify(merged));changed=true}m[k]=Date.now();needPush=true}
        else if(r&&r.ts>lt){if(JSON.stringify(r.v)!==JSON.stringify(lv)){raw.call(localStorage,k,JSON.stringify(r.v));changed=true}m[k]=r.ts}
        else if(lv!=null&&(!r||lt>r.ts))needPush=true});
      S.applying=false;m._uid=S.user.id;m._synced=Date.now();setMeta(m);S.err="";
      if(needPush)await push(true);
      if(changed){sessionStorage.setItem("sl_synced_reload","1");location.reload();return}
    }catch(e){S.applying=false;S.err="Couldn't sync. Your data is still saved on this phone.";console.error(e)}
    S.busy=false;paint()}

  async function push(quiet){if(!S.user||!S.sb)return;
    try{const m=meta(),data={};KEYS.forEach(k=>{const v=val(k);if(v!=null)data[k]={v,ts:m[k]||Date.now()}});
      const{error}=await S.sb.from("user_data").upsert({user_id:S.user.id,data,updated_at:new Date().toISOString()});if(error)throw error;
      m._synced=Date.now();setMeta(m);S.err=""}
    catch(e){S.err="Couldn't sync. Your data is still saved on this phone.";console.error(e)}
    if(!quiet)paint()}

  function ago(t){if(!t)return"never";const s=(Date.now()-t)/1000;return s<60?"just now":s<3600?Math.round(s/60)+" min ago":new Date(t).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}

  function html(){if(!S.on)return"";
    if(S.user)return`<div class="acct"><div class="eyebrow">Account</div>
      <div class="acct-row"><div><b>${esc(S.user.email)}</b><small>${S.busy?"Syncing…":S.err?esc(S.err):"Synced "+ago(meta()._synced)}</small></div><button data-acct="out">Sign out</button></div>
      <p class="acct-note">Tracked bets, settings, followed and recently viewed players sync to this account. Signing out keeps a copy on this phone.</p>
      <button class="acct-link" data-acct="sync">Sync now</button></div>`;
    return`<div class="acct"><div class="eyebrow">Account</div>
      <p class="acct-note">Sign in to keep your tracked bets, settings and followed players on every device. Optional; without it everything stays on this phone.</p>
      <form class="acct-f" data-acctform="1"><input type="email" id="acctEmail" autocomplete="email" placeholder="Email" required>
      <input type="password" id="acctPass" autocomplete="current-password" placeholder="Password (8+ characters)" minlength="8" required>
      <div class="acct-b"><button type="submit" data-mode="in">Sign in</button><button type="submit" data-mode="up" class="ghost">Create account</button></div></form>
      <button class="acct-link" data-acct="reset">Forgot password</button>
      ${S.status?`<p class="acct-msg">${esc(S.status)}</p>`:""}</div>`}
  function paint(){const el=document.getElementById("acctBox");if(el)el.innerHTML=html()}

  async function init(){if(!S.on)return;paint();
    try{await load();S.sb=supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"sl_auth"}});
      const{data}=await S.sb.auth.getSession();S.user=data.session&&data.session.user||null;paint();
      S.sb.auth.onAuthStateChange((ev,sess)=>{const was=S.user&&S.user.id;S.user=sess&&sess.user||null;
        if(ev==="PASSWORD_RECOVERY"){const p=prompt("Choose a new password (8+ characters)");if(p&&p.length>=8)S.sb.auth.updateUser({password:p}).then(({error})=>window.toast&&toast(error?"Couldn't change the password":"Password changed"))}
        if(S.user&&S.user.id!==was)pull();paint()});
      if(S.user)pull();
      if(sessionStorage.getItem("sl_synced_reload")){sessionStorage.removeItem("sl_synced_reload");setTimeout(()=>window.toast&&toast("Synced with your account"),1500)}
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.user)pull()});
    }catch(e){S.err="Sign-in is unavailable right now.";console.error(e);paint()}}

  document.addEventListener("submit",async e=>{const f=e.target.closest("[data-acctform]");if(!f)return;e.preventDefault();if(!S.sb)return;
    const mode=(e.submitter&&e.submitter.dataset.mode)||"in",email=f.querySelector("#acctEmail").value.trim(),password=f.querySelector("#acctPass").value;
    S.status=mode==="up"?"Creating your account…":"Signing in…";paint();
    const r=mode==="up"?await S.sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await S.sb.auth.signInWithPassword({email,password});
    if(r.error)S.status=r.error.message;else if(mode==="up"&&!r.data.session)S.status="Check your email and tap the confirmation link, then sign in here.";else S.status="";
    paint()});
  document.addEventListener("click",async e=>{const b=e.target.closest("[data-acct]");if(!b||!S.sb)return;const a=b.dataset.acct;
    if(a==="out"){await push(true);await S.sb.auth.signOut();S.user=null;S.status="Signed out. Your data is still on this phone.";paint()}
    if(a==="sync")pull();
    if(a==="reset"){const em=(document.getElementById("acctEmail")||{}).value;if(!em){S.status="Type your email above, then tap Forgot password.";paint();return}
      const{error}=await S.sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});S.status=error?error.message:"Password reset email sent.";paint()}});

  window.SLSync={init,paint,pull,push,state:S};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
