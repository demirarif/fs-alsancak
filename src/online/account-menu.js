import { api } from './api.js';

/* Signed-in account menu (2026-11-05). It sits right of the brand on every screen: the right end of the top bar belongs to the squad and
 * tactics screens' stage steps (fixed there) and to the match screen's own buttons, so nothing is added on that side. */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function mountAccountMenu(user){
  const items=user.isAdmin?[['#yonetim','Yönetim paneli'],['#kadrolar','Kadro seçimi'],['#gunun-maci','Oyuncu görünümü']]:[['#gunun-maci','Günün maçı']];
  const root=document.createElement('div');root.className='account-menu';
  root.innerHTML=`<button type="button" class="account-button" aria-haspopup="menu" aria-expanded="false" aria-label="Hesap: ${esc(user.displayName)}">
      <span class="account-initial" aria-hidden="true">${esc(user.displayName.slice(0,1).toLocaleUpperCase('tr-TR'))}</span><span class="account-name">${esc(user.displayName)}</span>${user.isAdmin?'<span class="account-role">Admin</span>':''}
      <svg class="ui-icon account-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button>
    <div class="account-pop" role="menu" hidden>${items.map(([href,label])=>`<a role="menuitem" href="${href}">${label}</a>`).join('')}<hr><button type="button" role="menuitem" data-logout>Çıkış yap</button></div>`;
  document.querySelector('.topbar .brand').after(root);
  const button=root.querySelector('.account-button'),pop=root.querySelector('.account-pop');
  const close=()=>{pop.hidden=true;button.setAttribute('aria-expanded','false');};
  button.addEventListener('click',()=>{const open=pop.hidden;pop.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)pop.querySelector('[role=menuitem]')?.focus();});
  pop.addEventListener('click',async event=>{const t=event.target.closest('[role=menuitem]');if(!t)return;close();if(t.dataset.logout!==undefined){try{await api.logout();}catch{}location.replace('/');}});
  document.addEventListener('click',event=>{if(!root.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!pop.hidden){close();button.focus();}});
  return {current(hash){for(const a of pop.querySelectorAll('a')){const href=a.getAttribute('href');a.toggleAttribute('aria-current',hash===href||hash.startsWith(`${href}/`));}}};
}
