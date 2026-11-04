import { createMatchRenderer } from './match-renderer.js';
import { sampleReplay } from './replay-sampling.js';
import { REEL, planReel, reelCameraPath, reelReplayPath } from './reel-plan.js';
import { createMp4Muxer } from './mp4-muxer.js';
import { SHIRT_PATH, COLLAR_PATH, kitOf } from './kit-icon.js';
import { BALL_STATE } from '../v1/engine/replay.ts';

/* Vertical highlight reel (user decision: 9:16, the goals edited for hype, at most a minute, for Instagram). Rendered offline frame by frame
 * with the match renderer and portrait cameras, then H.264 MP4 through WebCodecs; browsers without it record the canvas in real time. */
// Same language as the match screen and the player cards: slate panels, gold accents, Manrope.
const FONT='Manrope,"Segoe UI",Arial,sans-serif',GOLD='#e7c181',INK='rgba(23,31,43,.9)',EDGE='#3f4b5e',KITS=[kitOf(0),kitOf(1)],ACCENT=['#8cb4ed','#e598a8'];
const OVERVIEW={position:{x:-62,y:34,z:0},target:{x:0,y:0,z:0},verticalFovDegrees:56};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),upper=s=>String(s).toLocaleUpperCase('tr-TR'),minute=s=>`${Math.floor(Math.min(s,3599.9)/60)+1}'`;
const easeOutBack=k=>1+2.7*(k-1)**3+1.7*(k-1)**2,teamIndex=id=>id==='team-2'?1:0;

export async function exportHighlights({snapshot,lineups,halves,teamNames,onProgress=()=>{}}){
  const plan=planReel(halves),output=await pickOutput(),fps=REEL.fps,W=output.width,H=output.height,S=W/REEL.width;
  await loadFonts();
  const gl=createMatchRenderer(document.createElement('div'),null,{snapshot,lineups:lineups[0],preserveDrawingBuffer:true,size:{width:W,height:H}});
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d',{alpha:false}),names=new Map(snapshot.players.map(p=>[p.id,p.name])),goals=goalList(halves,names);
  const final=[0,1].map(i=>goals.filter(g=>g.team===i).length),info={teamNames,final,goals,date:new Date(snapshot.createdAt).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})};
  const base=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(gl.canvas,0,0,W,H);ctx.setTransform(S,0,0,S,0,0);};
  const sink=await output.open(canvas);let done=0;
  const emit=async()=>{await sink.frame();done++;if(done%6===0||done===plan.frames)onProgress(done/plan.frames);};
  const intro=async()=>{for(let k=0;k<plan.introFrames;k++){base();drawIntro(ctx,k/fps,plan.introFrames/fps,info);await emit();}};
  try{
    if(!plan.clips.length){const r=halves.find(Boolean);gl.render(sampleReplay(r,r.startSeconds),{seeked:true,pose:OVERVIEW});await intro();}
    let goalNo=0;
    for(const [ci,clip] of plan.clips.entries()){
      const replay=halves[clip.half-1],slow=clip.kind==='replay',path=slow?reelReplayPath(replay,clip):reelCameraPath(replay,clip),caption=captionFor(clip,replay,names);
      if(!slow&&clip.event.kind==='goal')goalNo++;
      for(let i=0;i<clip.frames;i++){
        const t=clip.start+i/fps*clip.speed,state=sampleReplay(replay,t);
        gl.render(state,{realDt:1/fps,simDt:i?clip.speed/fps:0,events:replay.events,seeked:i===0,pose:path[i]});
        if(ci===0&&i===0)await intro();
        base();
        if(slow)drawReplayTag(ctx,caption,i/fps);
        else{drawNameTag(ctx,gl,state,names);drawScoreBug(ctx,state.score,t,clip.half,teamNames,clip.event.kind==='goal'?`GOL ${goalNo}/${plan.goals}`:'');drawCaption(ctx,caption,t);}
        // Hype cut: a white flash into every clip.
        if(i<3){ctx.fillStyle=`rgba(255,255,255,${[.75,.42,.16][i]})`;ctx.fillRect(0,0,REEL.width,REEL.height);}
        await emit();
      }
    }
    for(let k=0;k<plan.outroFrames;k++){base();drawOutro(ctx,k/fps,info);await emit();}
    const blob=await sink.finish();
    return {blob,filename:`alsancak-ozet-${snapshot.createdAt.slice(0,10)}-${final[0]}-${final[1]}.${output.ext}`,seconds:plan.seconds,mime:output.mime};
  }catch(error){sink.abort();throw error;}
  finally{gl.dispose();}
}

/** Canvas text needs the web font loaded first; offline it falls back to Segoe UI. */
async function loadFonts(){
  if(!document.fonts?.load)return;
  await Promise.race([Promise.all(['800 40px Manrope','700 30px Manrope','600 30px Manrope'].map(f=>document.fonts.load(f))).catch(()=>{}),sleep(2500)]);
}
async function pickOutput(){
  if(typeof VideoEncoder==='function'&&typeof VideoFrame==='function'){
    // Level 4.0 fits 1080×1920 at 30 fps, 3.1 fits 720×1280.
    for(const [width,height,level] of [[1080,1920,'28'],[720,1280,'1f']])for(const profile of ['6400','4d00','42e0']){
      const config={codec:`avc1.${profile}${level}`,width,height,bitrate:width>=1080?6_000_000:4_000_000,framerate:REEL.fps,avc:{format:'avc'}};
      try{if((await VideoEncoder.isConfigSupported(config)).supported)return webCodecsOutput(config);}catch{/* try the next profile */}
    }
  }
  const mime=typeof MediaRecorder==='function'&&typeof HTMLCanvasElement.prototype.captureStream==='function'
    &&['video/mp4;codecs=avc1.42E01F','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(mime)return recorderOutput(mime);
  throw new Error('Bu tarayıcı video üretemiyor; Chrome ya da Edge ile dene.');
}
function webCodecsOutput(config){
  return {width:config.width,height:config.height,mime:'video/mp4',ext:'mp4',
    async open(canvas){
      const mux=createMp4Muxer({width:config.width,height:config.height});let failure=null,index=0;
      const encoder=new VideoEncoder({output:(chunk,meta)=>mux.addChunk(chunk,meta),error:e=>{failure=e;}});encoder.configure(config);
      return {
        async frame(){
          if(failure)throw failure;
          const frame=new VideoFrame(canvas,{timestamp:Math.round(index*1e6/REEL.fps),duration:Math.round(1e6/REEL.fps)});
          encoder.encode(frame,{keyFrame:index%(REEL.fps*2)===0});frame.close();index++;
          while(encoder.encodeQueueSize>4){if(failure)throw failure;await sleep(2);}
          if(index%4===0)await sleep(0);
        },
        async finish(){await encoder.flush();encoder.close();if(failure)throw failure;return mux.finalize();},
        abort(){try{encoder.close();}catch{/* already closed */}},
      };
    }};
}
function recorderOutput(mime){
  const type=mime.split(';')[0];
  return {width:REEL.width,height:REEL.height,mime:type,ext:type==='video/mp4'?'mp4':'webm',
    async open(canvas){
      const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],chunks=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.start(1000);
      const t0=performance.now();let index=0;
      return {
        // MediaRecorder stamps frames as they arrive, so this path runs in real time.
        async frame(){track.requestFrame();index++;const wait=t0+index*1000/REEL.fps-performance.now();await sleep(Math.max(0,wait));},
        async finish(){await sleep(150);recorder.stop();await stopped;track.stop();return new Blob(chunks,{type});},
        abort(){try{recorder.stop();}catch{/* not started */}track.stop();},
      };
    }};
}

function goalList(halves,names){
  const events=halves.filter(Boolean).flatMap(h=>h.events);
  return events.filter(e=>e.kind==='goal').map(e=>({seconds:e.seconds,team:teamIndex(e.teamId),name:names.get(e.actorId)??'',own:e.outcome==='own-goal',
    penalty:events.some(x=>x.kind==='penalty'&&x.actorId===e.actorId&&x.seconds<=e.seconds&&e.seconds-x.seconds<3)}));
}
/** Caption shown when the attempt resolves: shots are logged at the strike, so wait for the ball's flight. */
function captionFor(clip,replay,names){
  const e=clip.event,actor=names.get(e.actorId)??'',other=names.get(e.targetPlayerId)??'',team=teamIndex(e.teamId);
  if(e.kind==='goal'){
    const penalty=replay.events.some(x=>x.kind==='penalty'&&x.actorId===e.actorId&&x.seconds<=e.seconds&&e.seconds-x.seconds<3);
    const sub=e.outcome==='own-goal'?'kendi kalesine':[penalty?'penaltı':e.outcome==='header'?'kafa golü':'',other?`asist ${other}`:''].filter(Boolean).join(' · ');
    return {title:'GOL!',goal:true,name:actor||'Kendi kalesine',sub,at:e.seconds,team};
  }
  if(e.kind==='save')return {title:e.outcome==='spill'?'KALECİ HATASI':'KURTARIŞ!',name:actor,sub:other?`${other} vuruşu`:'',at:e.seconds,team};
  const o=e.outcome,title=o==='post'?'DİREK!':o==='save'||o==='parry'?'KURTARIŞ!':o==='block'?'BLOK!':o==='goal'?'GOL!':'KIL PAYI!';
  return {title,name:actor,sub:e.kind==='header'?'kafa vuruşu':e.kind==='penalty'?'penaltı':'',at:e.seconds+Math.min(1.1,(e.reason.distanceMeters||0)/26),team};
}

function panel(ctx,x,y,w,h,r,fill,edge=EDGE){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fillStyle=fill;ctx.fill();if(edge){ctx.lineWidth=2;ctx.strokeStyle=edge;ctx.stroke();}}
const SHIRT=new Path2D(SHIRT_PATH),COLLAR=new Path2D(COLLAR_PATH);
/** Kit shirt icon centred at x,y, s pixels tall (same silhouette as the match screen). */
function chip(ctx,x,y,s,kit){ctx.save();ctx.translate(x-s/2,y-s/2);ctx.scale(s/40,s/40);ctx.fillStyle=kit.shirt;ctx.fill(SHIRT);ctx.lineJoin='round';ctx.strokeStyle=kit.trim;ctx.lineWidth=1.6;ctx.stroke(SHIRT);ctx.lineWidth=1.4;ctx.stroke(COLLAR);ctx.restore();}
/** Largest font (down to min) that fits; the text is ellipsised if even that is too wide. */
function fitText(ctx,text,weight,size,max,min=20){
  let s=size;for(;s>min;s-=2){ctx.font=`${weight} ${s}px ${FONT}`;if(ctx.measureText(text).width<=max)return text;}
  ctx.font=`${weight} ${min}px ${FONT}`;let t=text;while(t.length>1&&ctx.measureText(`${t}…`).width>max)t=t.slice(0,-1);return t===text?t:`${t}…`;
}
function spaced(ctx,text,x,y,px){if('letterSpacing' in ctx){ctx.letterSpacing=`${px}px`;ctx.fillText(text,x+px/2,y);ctx.letterSpacing='0px';}else ctx.fillText(text,x,y);}

function drawScoreBug(ctx,score,t,half,teamNames,counter=''){
  const w=860,h=104,x=(REEL.width-w)/2,y=196,mid=y+h/2;
  panel(ctx,x,y,w,h,22,INK);chip(ctx,x+46,mid,48,KITS[0]);chip(ctx,x+w-46,mid,48,KITS[1]);
  ctx.textBaseline='middle';ctx.fillStyle='#f3f6f0';
  ctx.textAlign='left';ctx.fillText(fitText(ctx,upper(teamNames[0]),700,34,240),x+76,mid+1);
  ctx.textAlign='right';ctx.fillText(fitText(ctx,upper(teamNames[1]),700,34,240),x+w-76,mid+1);
  ctx.textAlign='center';ctx.font=`800 58px ${FONT}`;ctx.fillText(`${score[0]} – ${score[1]}`,540,mid+2);
  const label=`${minute(t)}  ·  ${half}. YARI${counter?`  ·  ${counter}`:''}`;ctx.font=`700 34px ${FONT}`;const pw=ctx.measureText(label).width+44;
  panel(ctx,540-pw/2,y+h+12,pw,48,24,INK);ctx.fillStyle=GOLD;ctx.fillText(label,540,y+h+37);
}
function drawNameTag(ctx,gl,state,names){
  if(state.ball.state!==BALL_STATE.feet&&state.ball.state!==BALL_STATE.hands)return;
  let owner=null,best=1.2;for(const p of state.players){const d=Math.hypot(p.x-state.ball.x,p.z-state.ball.z);if(d<best){best=d;owner=p;}}
  const at=owner&&gl.screenPoint(owner.x,2.25,owner.z);if(!at?.visible)return;
  const text=fitText(ctx,names.get(owner.id)??'',700,30,420),w=ctx.measureText(text).width+66,h=46;
  const x=clamp(at.u*REEL.width-w/2,24,REEL.width-24-w),y=clamp(at.v*REEL.height-h-4,340,REEL.height-90);
  panel(ctx,x,y,w,h,10,INK,owner.team?'#e598a866':'#8cb4ed66');chip(ctx,x+24,y+h/2,30,KITS[owner.team]);
  ctx.fillStyle='#f6f8f3';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,x+46,y+h/2+1);
}
function drawCaption(ctx,c,t){
  const age=t-c.at;if(age<0)return;
  const scale=.55+.45*easeOutBack(Math.min(1,age/.24));
  ctx.save();ctx.globalAlpha=Math.min(1,age/.1);ctx.textAlign='center';ctx.textBaseline='middle';ctx.translate(540,1330);ctx.scale(scale,scale);
  ctx.font=`900 ${c.goal?170:104}px ${FONT}`;ctx.lineJoin='round';ctx.lineWidth=c.goal?20:14;ctx.strokeStyle=KITS[c.team].shirt;ctx.strokeText(c.title,0,0);
  ctx.fillStyle=c.goal?'#ffffff':'#f6ead2';ctx.fillText(c.title,0,0);ctx.restore();
  if(age<.18||!c.name)return;
  ctx.save();ctx.globalAlpha=Math.min(1,(age-.18)/.2);ctx.textAlign='center';ctx.textBaseline='middle';
  const name=fitText(ctx,c.name,800,50,880),nameFont=ctx.font,nw=ctx.measureText(name).width;
  ctx.font=`600 38px ${FONT}`;const w=Math.max(nw,c.sub?ctx.measureText(c.sub).width:0)+80;
  panel(ctx,540-w/2,1424,w,c.sub?118:74,14,INK,ACCENT[c.team]);
  ctx.font=nameFont;ctx.fillStyle='#ffffff';ctx.fillText(name,540,1461);
  if(c.sub){ctx.font=`600 38px ${FONT}`;ctx.fillStyle=GOLD;ctx.fillText(c.sub,540,1512);}
  ctx.restore();
}
/** Slow-motion replay: a TEKRAR badge and the scorer, no score bug (the frames are from before the goal). */
function drawReplayTag(ctx,c,age){
  ctx.save();ctx.globalAlpha=Math.min(1,age/.15);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`800 30px ${FONT}`;const label='TEKRAR',w=ctx.measureText(label).width+70;panel(ctx,540-w/2,206,w,58,29,INK,GOLD);
  ctx.fillStyle=GOLD;spaced(ctx,label,540,236,6);
  if(c.name){const name=fitText(ctx,c.name,800,46,820),nw=ctx.measureText(name).width+70;panel(ctx,540-nw/2,1424,nw,70,14,INK,ACCENT[c.team]);ctx.fillStyle='#ffffff';ctx.fillText(name,540,1460);}
  ctx.restore();
}
function teamLine(ctx,name,kit,y){
  const text=fitText(ctx,upper(name),800,70,820),w=ctx.measureText(text).width;
  chip(ctx,540-w/2-52,y,64,kit);ctx.fillStyle='#f3f6f0';ctx.textAlign='left';ctx.fillText(text,540-w/2,y+2);ctx.textAlign='center';
}
function drawIntro(ctx,age,length,info){
  const out=clamp((length-age)/.25,0,1);
  ctx.fillStyle=`rgba(14,20,30,${.84*out})`;ctx.fillRect(0,0,REEL.width,REEL.height);
  ctx.save();ctx.globalAlpha=clamp(age/.3,0,1)*out;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=GOLD;ctx.font=`800 40px ${FONT}`;spaced(ctx,'ALSANCAK',540,560,12);
  ctx.fillStyle='#e9eee6';ctx.font=`600 34px ${FONT}`;spaced(ctx,'MAÇ ÖZETİ',540,620,4);
  // No score up front: the final card reveals it.
  teamLine(ctx,info.teamNames[0],KITS[0],830);
  ctx.fillStyle=GOLD;ctx.font=`800 64px ${FONT}`;ctx.fillText('–',540,990);
  teamLine(ctx,info.teamNames[1],KITS[1],1150);
  ctx.fillStyle='#9eacbf';ctx.font=`600 38px ${FONT}`;ctx.fillText(`${info.date} · 60 dakika`,540,1330);
  ctx.restore();
}
function drawOutro(ctx,age,info){
  const a=clamp(age/.3,0,1);ctx.fillStyle=`rgba(14,20,30,${.88*a})`;ctx.fillRect(0,0,REEL.width,REEL.height);
  ctx.save();ctx.globalAlpha=a;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=GOLD;ctx.font=`800 40px ${FONT}`;spaced(ctx,'MAÇ SONU',540,380,10);
  ctx.fillStyle='#ffffff';ctx.font=`900 160px ${FONT}`;ctx.fillText(`${info.final[0]} – ${info.final[1]}`,540,510);
  [0,1].forEach(i=>{
    const cx=i?800:280,list=info.goals.filter(g=>g.team===i),shown=list.slice(0,list.length>12?11:12);
    const title=fitText(ctx,upper(info.teamNames[i]),800,36,380),w=ctx.measureText(title).width;chip(ctx,cx-w/2-34,650,42,KITS[i]);ctx.fillStyle='#f3f6f0';ctx.fillText(title,cx+8,652);
    shown.forEach((g,k)=>{ctx.font=`600 38px ${FONT}`;ctx.fillStyle=GOLD;ctx.textAlign='right';ctx.fillText(minute(g.seconds),cx-130,730+k*52);
      ctx.fillStyle='#eef2ea';ctx.textAlign='left';ctx.fillText(fitText(ctx,`${g.name||'Kendi kalesine'}${g.own?' (KK)':g.penalty?' (P)':''}`,600,32,300),cx-110,730+k*52);ctx.textAlign='center';});
    ctx.font=`600 38px ${FONT}`;
    if(list.length>shown.length){ctx.fillStyle='#9eacbf';ctx.fillText(`+${list.length-shown.length} gol`,cx,730+shown.length*52);}
    if(!list.length){ctx.fillStyle='#7d8ba0';ctx.fillText('Gol yok',cx,730);}
  });
  ctx.fillStyle='#8391a6';ctx.font=`700 26px ${FONT}`;spaced(ctx,'ALSANCAK MATCH ENGINE',540,1450,6);
  ctx.restore();
}
