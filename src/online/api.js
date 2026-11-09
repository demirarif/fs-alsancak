/* Client for the Worker's /api (same address as the site, so the session cookie is first-party on every phone). Every JSON answer
 * carries the server time; the broadcast is timed by that clock, never the phone's (a phone a minute off still joins the right moment). */
let offset=0;
export const serverNow=()=>Date.now()+offset;
export class ApiError extends Error{constructor(status,message,data=null){super(message);this.status=status;this.data=data;}}

async function call(method,path,{json,bytes}={}){
  const t0=Date.now();let res;
  try{res=await fetch(path,{method,credentials:'same-origin',headers:json!==undefined?{'content-type':'application/json'}:bytes?{'content-type':'application/octet-stream'}:{},body:json!==undefined?JSON.stringify(json):bytes});}
  catch{throw new ApiError(0,'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');}
  if((res.headers.get('content-type')??'').includes('application/json')){
    const data=await res.json();if(typeof data.now==='number')offset=data.now-(t0+Date.now())/2;
    if(!res.ok)throw new ApiError(res.status,data.error??'Bir şeyler ters gitti.',data);return data;
  }
  if(!res.ok)throw new ApiError(res.status,'Bir şeyler ters gitti.');
  return res;
}
const bytesOf=async res=>new Uint8Array(await res.arrayBuffer());

export const api={
  /** {user} when logged in, {user:null} when not, {local:true} when there is no server (the Vite dev server answers with the page). */
  async session(){
    let res;try{res=await fetch('/api/me',{credentials:'same-origin'});}catch{return {local:true};}
    if(!(res.headers.get('content-type')??'').includes('application/json'))return {local:true};
    const data=await res.json();if(typeof data.now==='number')offset=data.now-Date.now();return {user:res.ok?data.user:null};
  },
  login:(username,password)=>call('POST','/api/login',{json:{username,password}}).then(d=>d.user),
  logout:()=>call('POST','/api/logout'),
  changePassword:next=>call('POST','/api/password',{json:{next}}).then(d=>d.user),
  /** The page's state; with `v` (from the last answer) the server answers {same:true} while nothing has changed. */
  state:(v=null)=>call('GET',v?`/api/state?v=${encodeURIComponent(v)}`:'/api/state'),
  /** Older results, five at a time, before a kick-off time. */
  recent:before=>call('GET',`/api/recent?before=${before}`),
  match:id=>call('GET',`/api/matches/${id}`),
  /** A bet: one pick or a coupon of several ({market, code} each); `replaces` edits one of one's open bets until kick-off. */
  /** `seen` is the odds on the screen: if they have dropped since, the bet is refused with the new ones (e.data.changed). */
  bet:(id,legs,stake,replaces=null,seen=null)=>call('POST',`/api/matches/${id}/bets`,{json:{legs,stake,...(replaces?{replaces}:{}),...(seen?{seen}:{})}}),
  quote:(id,legs)=>call('POST',`/api/matches/${id}/quote`,{json:{legs}}),
  cancelBet:betId=>call('POST',`/api/bets/${betId}/cancel`),
  people:()=>call('GET','/api/people').then(d=>d.people),
  coupons:()=>call('GET','/api/coupons'),
  requestCoins:(to,amount)=>call('POST','/api/requests',{json:{to,amount}}),
  answerRequest:(id,send)=>call('POST',`/api/requests/${id}/${send?'send':'decline'}`),
  recording:id=>call('GET',`/api/matches/${id}/recording`).then(bytesOf),
  /** The trimmed copy the live broadcast plays (the full recording where a match has none). */
  live:id=>call('GET',`/api/matches/${id}/live`).then(bytesOf),
  reel:id=>call('GET',`/api/matches/${id}/reel`).then(bytesOf),
  admin:{
    create:match=>call('POST','/api/admin/matches',{json:match}),
    upload:(id,kind,bytes)=>call('PUT',`/api/admin/matches/${id}/${kind}`,{bytes}),
    publish:id=>call('POST',`/api/admin/matches/${id}/publish`),
    saveBook:(id,book)=>call('PUT',`/api/admin/matches/${id}/book`,{json:{book}}),
    openBulletin:id=>call('POST',`/api/admin/matches/${id}/open`),
    addObserver:name=>call('POST','/api/admin/observers',{json:{name}}),
    setListed:(username,listed)=>call('POST',`/api/admin/users/${encodeURIComponent(username)}/listed`,{json:{listed}}),
    result:id=>call('GET',`/api/admin/matches/${id}/result`).then(d=>d.result),
    /** Deletes a match: open bets are refunded; a finished one either keeps what it paid (undo false) or takes it all back (undo true). */
    remove:(id,undo=false)=>call('DELETE',`/api/admin/matches/${id}${undo?'?undo=1':''}`),
    users:()=>call('GET','/api/admin/users').then(d=>d.users),
    reset:username=>call('POST',`/api/admin/users/${encodeURIComponent(username)}/reset`),
    /** `change` is {balance} (set it) or {add} (add to it; a minus takes away). */
    setBalance:(username,change)=>call('POST',`/api/admin/users/${encodeURIComponent(username)}/balance`,{json:change}),
    addAll:(add,who=null)=>call('POST','/api/admin/balances',{json:{add,who}}),
    moveMatch:(id,kickoffAt)=>call('POST',`/api/admin/matches/${id}/time`,{json:{kickoffAt}}),
    uploadSamples:(id,samples)=>call('PUT',`/api/admin/matches/${id}/samples`,{json:{samples}}),
  },
};
