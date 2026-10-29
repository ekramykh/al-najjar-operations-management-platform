/* Presentation only: permissions continue to come from the server. */
function fuelHeaderIdentity(user, permissions) {
  if (!user?.id || permissions?.can_read !== true) return {name:'Not signed in',role:'Sign in required',initials:'—',email:''};
  const email=String(user.email || '');
  const display=user.user_metadata?.full_name || user.user_metadata?.name;
  const name=(typeof display==='string' && display.trim() ? display.trim() : email) || 'Signed-in user';
  const role=permissions.can_manage_users===true?'Administrator':permissions.can_add===true && !permissions.can_edit && !permissions.can_delete?'Add only':!permissions.can_add && !permissions.can_edit && !permissions.can_delete?'Read only':'Custom access';
  const parts=name.includes('@')?name.split('@')[0].split(/[._ -]+/):name.split(/\s+/);
  const initials=parts.filter(Boolean).map(p=>Array.from(p)[0]).slice(0,2).join('').toUpperCase();
  return {name,role,initials:initials || 'U',email};
}
window.renderFuelHeaderIdentity=(user,permissions)=>{
  const model=fuelHeaderIdentity(user,permissions);
  for(const [id,key] of [['fuelHeaderName','name'],['fuelHeaderAvatar','initials'],['fuelAccountName','name'],['fuelAccountEmail','email'],['fuelAccountRole','role']]) {
    const node=document.getElementById(id);if(node)node.textContent=model[key];
  }
  const fullName=user?.user_metadata?.full_name || user?.user_metadata?.name;
  const namePresent=typeof fullName==='string' && !!fullName.trim() && fullName.trim()!==model.email;
  const subtitle=document.getElementById('fuelHeaderRole');if(subtitle){subtitle.textContent=namePresent?model.email:'';subtitle.hidden=!namePresent;}
  window.fuelHeaderAccount=model.email?{id:user.id,email:model.email,fullName:namePresent?fullName.trim():''}:null;
  const button=document.getElementById('fuelHeaderUser');
  if(button){button.title=model.email || model.name;button.setAttribute('aria-label',model.name+'. Open account menu');}
  window.refreshFuelProfilePhoto?.(model.email?user:null);
  if(!model.email) window.closeFuelHeaderMenus?.();
};
(function(){
  const user=document.getElementById('fuelHeaderUser');
  const account=document.getElementById('fuelAccountMenu');
  const anchor=document.getElementById('fuelAccountAnchor');
  const panel=document.getElementById('cloudSyncPanel');
  const toggle=document.getElementById('fuelSyncToggle');
  const body=document.getElementById('fuelSyncBody');
  const signOut=document.getElementById('cloudSignOut');
  if(!user || !account || !panel || !toggle || !body)return;
  let active=null;
  function close(restoreFocus=false){
    const previous=active;active=null;
    account.hidden=true;body.hidden=true;
    panel.classList.remove('fuel-sync-open');
    user.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');
    if(restoreFocus && previous)(previous==='account'?user:toggle).focus();
  }
  window.closeFuelHeaderMenus=close;
  user.addEventListener('click',()=>{
    const opening=active!=='account';close();if(!opening)return;
    active='account';account.hidden=false;user.setAttribute('aria-expanded','true');
    signOut?.focus();
  });
  function toggleSync(){
    const opening=active!=='sync';close();if(!opening)return;
    active='sync';body.hidden=false;panel.classList.add('fuel-sync-open');toggle.setAttribute('aria-expanded','true');
    body.style.setProperty('--fuel-sync-space',Math.max(120,innerHeight-toggle.getBoundingClientRect().bottom-24)+'px');
  }
  toggle.addEventListener('click',toggleSync);
  toggle.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();toggleSync();}});
  signOut?.addEventListener('click',()=>close());
  document.addEventListener('pointerdown',event=>{
    if(active==='account' && !anchor.contains(event.target) || active==='sync' && !panel.contains(event.target))close();
  });
  document.addEventListener('focusin',event=>{
    if(active==='account' && !anchor.contains(event.target) || active==='sync' && !panel.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && active){event.preventDefault();close(true);}});
})();
