/** Pointer gestures on the 3D canvas become camera intents.
 * Left drag: angle · right/middle or Shift drag: move · wheel / pinch: distance · double click: resume follow. */
export function attachCameraInput(element,apply){
  const pointers=new Map(),abort=new AbortController(),on={signal:abort.signal};
  let mode=null,pinch=0,middle=null,travel=0;
  const height=()=>element.clientHeight||1;
  const pair=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
  element.style.touchAction='none';
  element.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button>2)return;
    element.setPointerCapture?.(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===1)mode=event.button===1||event.button===2||event.shiftKey||event.ctrlKey?'pan':'orbit';
    else if(pointers.size===2){mode='pinch';const p=pair();pinch=p.distance;middle=p;travel=0;}
    element.classList.add('is-dragging',mode==='pan'?'is-panning':'is-orbiting');event.preventDefault();
  },on);
  element.addEventListener('pointermove',event=>{
    const p=pointers.get(event.pointerId);if(!p)return;
    const dx=event.clientX-p.x,dy=event.clientY-p.y;p.x=event.clientX;p.y=event.clientY;
    if(mode==='orbit'&&pointers.size===1)apply({kind:'orbit',deltaAzimuth:-dx*.0055,deltaElevation:dy*.0045});
    else if(mode==='pan'&&pointers.size===1)apply({kind:'pan',screenDx:dx/height(),screenDy:dy/height()});
    else if(mode==='pinch'&&pointers.size===2){
      const next=pair();if(pinch>0&&next.distance>0)apply({kind:'zoom',factor:pinch/next.distance});
      const mx=next.x-middle.x,my=next.y-middle.y;travel+=Math.hypot(mx,my);
      // A pinch alone must not unlock the automatic camera; only a clear two-finger drag pans.
      if(travel>10)apply({kind:'pan',screenDx:mx/height(),screenDy:my/height()});
      pinch=next.distance;middle=next;
    }
  },on);
  const release=event=>{pointers.delete(event.pointerId);if(!pointers.size){mode=null;element.classList.remove('is-dragging','is-panning','is-orbiting');}else if(pointers.size===1)mode='orbit';};
  element.addEventListener('pointerup',release,on);element.addEventListener('pointercancel',release,on);
  element.addEventListener('wheel',event=>{event.preventDefault();const lines=event.deltaMode===1?16:event.deltaMode===2?height():1;apply({kind:'zoom',factor:Math.exp(Math.max(-120,Math.min(120,event.deltaY*lines))*.0012)});},{signal:abort.signal,passive:false});
  element.addEventListener('contextmenu',event=>event.preventDefault(),on);
  element.addEventListener('dblclick',()=>apply({kind:'resume-follow'}),on);
  return ()=>abort.abort();
}
