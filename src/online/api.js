/* Client for the Worker's /api (same address as the site, so the session cookie is first-party on every phone). Every JSON answer
 * carries the server time; the broadcast is timed by that clock, never the phone's (a phone a minute off still joins the right moment). */
let offset=0;
export const serverNow=()=>Date.now()+offset;
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}

async function call(method,path,{json,bytes}={}){
  const t0=Date.now();let res;
  try{res=await fetch(path,{method,credentials:'same-origin',headers:json!==undefined?{'content-type':'application/json'}:bytes?{'content-type':'application/octet-stream'}:{},body:json!==undefined?JSON.stringify(json):bytes});}
  catch{throw new ApiError(0,'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');}
  if((res.headers.get('content-type')??'').includes('application/json')){
    const data=await res.json();if(typeof data.now==='number')offset=data.now-(t0+Date.now())/2;
    if(!res.ok)throw new ApiError(res.status,data.error??'Bir şeyler ters gitti.');return data;
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
  state:()=>call('GET','/api/state'),
  match:id=>call('GET',`/api/matches/${id}`),
  bet:(id,market,code,stake)=>call('POST',`/api/matches/${id}/bets`,{json:{market,code,stake}}),
  people:()=>call('GET','/api/people').then(d=>d.people),
  requestDinar:(to,amount)=>call('POST','/api/requests',{json:{to,amount}}),
  answerRequest:(id,send)=>call('POST',`/api/requests/${id}/${send?'send':'decline'}`),
  recording:id=>call('GET',`/api/matches/${id}/recording`).then(bytesOf),
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
    cancel:id=>call('DELETE',`/api/admin/matches/${id}`),
    users:()=>call('GET','/api/admin/users').then(d=>d.users),
    reset:username=>call('POST',`/api/admin/users/${encodeURIComponent(username)}/reset`),
  },
};
