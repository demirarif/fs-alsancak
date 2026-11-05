import { api } from './api.js';
import './online.css';

/* Login and the first-login password change (user decision 2026-11-05): user name = player name in lower case, first password = the
 * name and "!" (sent to the group by the admin); at first login everybody picks a simple password of their own. */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function sheet(html){const el=document.createElement('div');el.className='auth-screen';el.innerHTML=html;document.body.append(el);el.querySelector('input')?.focus();return el;}
const brand='<div class="auth-brand"><span class="auth-mark">A</span><span>ALSANCAK</span></div>';

export function showLogin(){
  return new Promise(resolve=>{
    const el=sheet(`<form class="auth-card" novalidate>${brand}<h1>Giriş yap</h1><p class="auth-lead">Kullanıcı adın ve ilk şifren gruba atıldı.</p>
      <label>Kullanıcı adı<input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
      <label>Şifre<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="auth-button" type="submit">Giriş yap</button><p class="auth-error" role="alert"></p></form>`);
    const form=el.querySelector('form'),error=el.querySelector('.auth-error');
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('button');button.disabled=true;error.textContent='';
      try{const user=await api.login(form.username.value,form.password.value);el.remove();resolve(user);}
      catch(e){error.textContent=e.message;form.password.select();}finally{button.disabled=false;}
    });
  });
}

export function requirePasswordChange(user){
  return new Promise(resolve=>{
    const el=sheet(`<form class="auth-card" novalidate>${brand}<h1>Şifreni değiştir</h1>
      <p class="auth-lead">Merhaba ${esc(user.displayName)}! İlk girişte herkes kendi şifresini seçiyor. <b>Basit bir şifre seç ama unutma</b>; unutursan Arif'e yaz.</p>
      <label>Yeni şifre<input name="next" type="password" autocomplete="new-password" minlength="4" required></label>
      <label>Yeni şifre (tekrar)<input name="again" type="password" autocomplete="new-password" required></label>
      <button class="auth-button" type="submit">Şifremi kaydet</button><p class="auth-error" role="alert"></p></form>`);
    const form=el.querySelector('form'),error=el.querySelector('.auth-error');
    form.addEventListener('submit',async event=>{
      event.preventDefault();error.textContent='';
      if(form.next.value.trim().length<4){error.textContent='Şifre en az 4 karakter olmalı.';return;}
      if(form.next.value!==form.again.value){error.textContent='İki şifre aynı değil.';form.again.select();return;}
      const button=form.querySelector('button');button.disabled=true;
      try{const next=await api.changePassword(form.next.value);el.remove();resolve(next);}
      catch(e){error.textContent=e.message;}finally{button.disabled=false;}
    });
  });
}
