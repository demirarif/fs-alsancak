/** Presentation-only motion. Domain commands and persistence stay synchronous. */
export function createPrepMotion(host:HTMLElement){
  const running=new Set<Animation>(),ghosts=new Set<HTMLElement>();
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play=(node:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>{
    if(reduced())return;
    const animation=node.animate(frames,options);running.add(animation);
    void animation.finished.then(()=>running.delete(animation),()=>running.delete(animation));
    return animation;
  };
  function capture(){
    return new Map([...host.querySelectorAll<HTMLElement>('[data-motion-key]')].map(node=>[node.dataset.motionKey!,node.getBoundingClientRect()]));
  }
  function settle(before:ReturnType<typeof capture>){
    if(reduced()||host.hidden)return;
    host.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(node=>{
      const old=before.get(node.dataset.motionKey!);if(!old)return;
      const next=node.getBoundingClientRect(),dx=old.left-next.left,dy=old.top-next.top;
      if(Math.abs(dx)+Math.abs(dy)<2)return;
      play(node,[{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}],{duration:460,easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  }
  function transfer(source:DOMRect,avatar:string,name:string,target:HTMLElement){
    if(reduced())return;
    const end=target.getBoundingClientRect(),ghost=document.createElement('div');
    ghost.className='prep-transfer';ghost.setAttribute('aria-hidden','true');
    const picture=document.createElement('span');picture.className='prep-transfer-avatar';picture.innerHTML=avatar;
    const label=document.createElement('strong');label.textContent=name;ghost.append(picture,label);
    Object.assign(ghost.style,{left:`${source.left}px`,top:`${source.top}px`,width:`${source.width}px`,height:`${source.height}px`});
    host.append(ghost);ghosts.add(ghost);
    const dx=end.left-source.left,dy=end.top-source.top;
    const animation=play(ghost,[
      {transform:'translate(0,0) scale(1)',opacity:1},
      {transform:`translate(${dx*.5}px,${dy*.5-26}px) scale(.97)`,opacity:1,offset:.48},
      {transform:`translate(${dx}px,${dy}px) scale(.9)`,opacity:0},
    ],{duration:420,easing:'cubic-bezier(.25,.7,.25,1)',fill:'forwards'});
    play(target,[{backgroundColor:'#e6c18122',opacity:.35},{backgroundColor:'transparent',opacity:1}],{duration:380,delay:160,easing:'ease-out'});
    void animation?.finished.then(()=>{ghost.remove();ghosts.delete(ghost);},()=>{ghost.remove();ghosts.delete(ghost);});
  }
  return {capture,settle,transfer,dispose(){for(const animation of running)animation.cancel();for(const ghost of ghosts)ghost.remove();running.clear();ghosts.clear();}};
}
