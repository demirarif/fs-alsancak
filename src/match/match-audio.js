/* Match sound (2026-11-10, the user: "hakem ve sesler", then "türkçe spiker olarak serhanı alalım" — "x pas verdi, x'ten güzel bir
 * pas gibi şeyler de ekle, top kaybı falan ... golde falan duygu ekle"). The crowd, the referee's whistle and the ball being struck are
 * made here with the Web Audio API, so the match is never silent. The Turkish commentator speaks from recordings when they exist
 * (public/sounds/spiker/manifest.json, made by scripts/generate-commentary.mjs with "Alsancak Spiker", an ElevenLabs voice designed
 * from a description and chosen by ear): general lines per situation and, for each player, lines with his name ("Top Alper'de.",
 * "Alper'den harika bir pas!", "Ve gol gol gol! Alper attı!"), calm for the run of play, livelier for a through ball, excited for chances.
 * Browsers start audio only after a click or a key: unlock() is called on the first one. The mute choice is kept on this device. */
const BASE='/sounds/spiker/',MANIFEST=`${BASE}manifest.json`,STORE='alsancak.sound';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** The referee's whistle for an event (the commentator is separate): its pattern, or null. */
export function refereeWhistle(e){
  if(e.kind==='foul')return /PENALTI/.test(e.reason?.explanation??'')?'long':'short';
  if(e.kind==='goal'||e.kind==='kick-off')return 'short';
  if(e.kind==='half-time')return 'double';
  if(e.kind==='full-time')return 'final';
  return null;
}
const isShot=e=>(e.kind==='shot'||e.kind==='header'||e.kind==='penalty')&&!!e.outcome;
/** What the commentator says for an event: the situation, whose name (an event's actor or target), how much it matters
 * (prio: 10 a goal ... 1 a routine pass), and how long after the event. half: 1 or 2 (each half's replay starts at 0 s). null: nothing. */
export function commentaryFor(e,half=1){
  const text=e.reason?.explanation??'',coin=Math.random()<.5;
  switch(e.kind){
    // An own goal is not the defender's goal: the general line, without his name.
    case 'goal':return {situation:'goal',player:e.outcome==='own-goal'?null:e.actorId,prio:10};
    case 'shot':case 'header':case 'penalty':{
      if(!e.outcome)return null;
      if(/direk!/i.test(text))return {situation:'post',prio:8};
      if(e.kind==='penalty')return {situation:'penalty-kick',prio:7};
      if(e.importance<.6&&e.outcome!=='goal')return null;
      return e.kind==='header'?{situation:'header-shot',prio:6}:{situation:'shot',player:e.actorId,prio:6};
    }
    case 'save':return e.outcome==='parry'?{situation:'parry',prio:8}:e.outcome==='spill'?{situation:'spill',prio:8}:{situation:'save',player:e.actorId,prio:7};
    case 'foul':return /PENALTI/.test(text)?{situation:'penalty',prio:9,afterWhistle:true}:{situation:'foul',player:e.actorId,prio:5,afterWhistle:true};
    case 'corner':return /^Korner ·/.test(text)?{situation:'corner',prio:4}:{situation:'cross',prio:3};
    case 'cross':return {situation:'cross',prio:3};
    case 'free-kick':return {situation:'free-kick',prio:3};
    case 'through-pass':return {situation:'pass-good',player:e.actorId,prio:3};
    case 'diagonal-pass':return coin?{situation:'pass-good',player:e.actorId,prio:2}:{situation:'ball',player:e.targetPlayerId,prio:2,namedOnly:true};
    case 'pass':return coin?{situation:'ball',player:e.targetPlayerId,prio:1,namedOnly:true}:{situation:'pass',player:e.actorId,prio:1,namedOnly:true};
    // Only the dribbles that matter (in the other half, or a nutmeg): the small escapes in a duel are left to the pictures.
    case 'beat':return /bacak arası/i.test(text)?{situation:'nutmeg',prio:6}:e.importance>=.18?{situation:'beat',player:e.actorId,prio:3,namedOnly:true}:null;
    case 'tackle':return coin?{situation:'tackle',player:e.actorId,prio:3}:{situation:'loss',player:e.targetPlayerId,prio:3};
    case 'interception':return {situation:e.importance>=.1?'interception':'tackle',player:e.actorId,prio:e.importance>=.1?3:2};
    case 'bad-touch':return {situation:'bad-touch',player:e.actorId,prio:2};
    case 'keeper-claim':return {situation:'keeper-claim',prio:3};
    case 'kick-off':return e.seconds<3?{situation:half>=2?'second-half':'kick-off-start',prio:6,afterWhistle:true}:{situation:'restart',prio:2,afterWhistle:true};
    case 'half-time':return {situation:'half-time',prio:9,afterWhistle:true};
    case 'full-time':return {situation:'full-time',prio:9,afterWhistle:true};
    default:return null;
  }
}
/** The shot's outcome that the commentator calls a moment later, while the ball is on its way (a goal, save or post has its own event). */
const shotFollowUp=e=>isShot(e)&&e.kind!=='penalty'?(e.outcome==='wide'?{situation:'wide',prio:7,delay:1200}:e.outcome==='block'?{situation:'block',prio:7,delay:500}:null):null;
/** Silence needed before a line of this weight: big moments at once, small talk only in a lull. */
const gapFor=prio=>prio>=5?.2:prio>=3?.9:2.6;
/** Turn-taking for one line c at time now (seconds), given the line being spoken ({prio, ends}) and when the last one ended.
 * 'cut': stop the current line and say this one (a goal over anything; a save or the post over "Alper vuruyor!"); 'wait': say it as
 * soon as the current line ends (a foul or a corner while a short line finishes); 'play': say it now; 'drop': let it go. */
export function turn(speaking,quietSince,c,now){
  if(speaking&&now<speaking.ends){
    if(c.prio>=speaking.prio+3||(c.prio>=7&&c.prio>speaking.prio))return 'cut';
    return c.prio>=4&&speaking.ends-now<1.6?'wait':'drop';
  }
  return now-quietSince>=gapFor(c.prio)?'play':'drop';
}

export function createMatchAudio(){
  // crowdBus carries every crowd sound (the murmur and the swells), so the crowd can dip while the commentator speaks.
  // voiceBus gives the commentator a TV broadcast tone (the "Maçta" versions on the listening page the user liked).
  let ctx=null,master=null,crowdBus=null,voiceBus=null,crowdGain=null,crowdFilter=null,noise=null,manifest=null,muted=false,excitement=0;
  let speaking=null,quietSince=-1e9,waiting=null;
  const buffers=new Map(),rotation=new Map(),timers=new Set();
  try{muted=localStorage.getItem(STORE)==='off';}catch{}

  function noiseBuffer(seconds){
    const n=Math.floor(ctx.sampleRate*seconds),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);let p=0;
    // Pinkish noise (a running average of white noise): a crowd's murmur rather than a hiss.
    for(let i=0;i<n;i++){p=.97*p+.03*(Math.random()*2-1);d[i]=p*6;}
    return b;
  }
  function start(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:.9;master.connect(ctx.destination);
    crowdBus=ctx.createGain();crowdBus.connect(master);
    // Broadcast tone: the voice's lows and the very top trimmed, a little presence at 3 kHz, gently compressed so it sits on the crowd.
    const hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor();
    hp.type='highpass';hp.frequency.value=140;lp.type='lowpass';lp.frequency.value=7500;
    presence.type='peaking';presence.frequency.value=3000;presence.Q.value=1.2;presence.gain.value=3;
    comp.threshold.value=-18;comp.ratio.value=4;comp.attack.value=.005;comp.release.value=.12;comp.knee.value=6;
    voiceBus=ctx.createGain();voiceBus.gain.value=1.25;
    hp.connect(lp).connect(presence).connect(comp).connect(voiceBus).connect(master);voiceBus.input=hp;
    noise=noiseBuffer(4);
    // The crowd: looped murmur through a band around the voice range, its level following the play.
    const src=ctx.createBufferSource();src.buffer=noise;src.loop=true;crowdFilter=ctx.createBiquadFilter();crowdFilter.type='bandpass';crowdFilter.frequency.value=700;crowdFilter.Q.value=.6;
    crowdGain=ctx.createGain();crowdGain.gain.value=0;src.connect(crowdFilter).connect(crowdGain).connect(crowdBus);src.start();
    fetch(MANIFEST).then(r=>r.ok?r.json():null).then(m=>{manifest=m;}).catch(()=>{});
    return true;
  }
  /** Call on a click or key press: browsers keep audio off until then. */
  function unlock(){if(!ctx&&!start())return;if(ctx.state==='suspended')ctx.resume();}
  function buffer(file){
    if(buffers.has(file))return buffers.get(file);
    const p=fetch(BASE+file).then(r=>{if(!r.ok)throw new Error(file);return r.arrayBuffer();}).then(a=>ctx.decodeAudioData(a)).catch(()=>null);
    buffers.set(file,p);return p;
  }
  /** One of a list's recordings, in turn (so the same line is not heard twice running). */
  function next(key,list){if(!list?.length)return null;const k=(rotation.get(key)??Math.floor(Math.random()*list.length))+1;rotation.set(key,k);return list[k%list.length];}
  function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);}

  /** A pea whistle: a ~3 kHz tone trilled by the pea about 30 times a second, with a breath of noise. */
  function blow(t0,len,level=.32){
    const o=ctx.createOscillator(),lfo=ctx.createOscillator(),depth=ctx.createGain(),amp=ctx.createGain(),env=ctx.createGain(),bp=ctx.createBiquadFilter();
    o.type='sine';o.frequency.setValueAtTime(2750,t0);o.frequency.linearRampToValueAtTime(3050,t0+.05);o.frequency.setValueAtTime(3050,t0+len-.05);o.frequency.linearRampToValueAtTime(2900,t0+len);
    lfo.type='sine';lfo.frequency.value=31;depth.gain.value=.45;amp.gain.value=.55;lfo.connect(depth).connect(amp.gain);
    bp.type='bandpass';bp.frequency.value=3000;bp.Q.value=3;
    env.gain.setValueAtTime(0,t0);env.gain.linearRampToValueAtTime(level,t0+.018);env.gain.setValueAtTime(level,t0+len-.06);env.gain.linearRampToValueAtTime(0,t0+len);
    o.connect(amp).connect(bp).connect(env).connect(master);
    const n=ctx.createBufferSource(),nf=ctx.createBiquadFilter(),ng=ctx.createGain();n.buffer=noise;nf.type='bandpass';nf.frequency.value=3200;nf.Q.value=1.5;ng.gain.value=.12;n.connect(nf).connect(ng).connect(env);
    for(const x of [o,lfo,n]){x.start(t0);x.stop(t0+len+.02);}
  }
  const WHISTLES={short:[[0,.3]],long:[[0,1.05]],double:[[0,.35],[.5,.95]],final:[[0,.42],[.6,.42],[1.2,1.3]]};
  /** Blows the pattern (a recorded one when the manifest has it); returns about how long it lasts. */
  async function playFile(file,gain=1,bus=master){const b=await buffer(file);if(!b||!ctx)return null;const s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=gain;s.buffer=b;s.connect(g).connect(bus);s.start();return {source:s,seconds:b.duration};}
  function whistle(kind){
    const pattern=WHISTLES[kind]??WHISTLES.short,length=Math.max(...pattern.map(([at,len])=>at+len));
    const file=next(`whistle-${kind}`,manifest?.effects?.[`whistle-${kind}`]);if(file){playFile(file,.9);return length;}
    const t=ctx.currentTime+.02;for(const [at,len] of pattern)blow(t+at,len);
    return length;
  }
  /** The ball struck: a short low thump, harder for a shot. */
  function kick(power){
    const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain(),n=ctx.createBufferSource(),nf=ctx.createBiquadFilter(),ng=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(55,t+.09);g.gain.setValueAtTime(.32*power,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);
    n.buffer=noise;nf.type='lowpass';nf.frequency.value=1100;ng.gain.setValueAtTime(.18*power,t);ng.gain.exponentialRampToValueAtTime(.001,t+.06);
    o.connect(g).connect(master);n.connect(nf).connect(ng).connect(master);o.start(t);o.stop(t+.13);n.start(t,Math.random()*3,.07);
  }
  /** The crowd's reaction: a rising "ooh" for a chance, a roar for a goal. */
  function swell(level,seconds,bright){
    const file=bright?next('crowd-goal',manifest?.effects?.['crowd-goal']):null;if(file){playFile(file,.8,crowdBus);return;}
    const t=ctx.currentTime,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;s.loop=true;
    f.type='bandpass';f.frequency.setValueAtTime(bright?650:500,t);f.frequency.linearRampToValueAtTime(bright?1100:800,t+.4);f.Q.value=.7;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.35);g.gain.setValueAtTime(level,t+seconds*.45);g.gain.linearRampToValueAtTime(0,t+seconds);
    s.connect(f).connect(g).connect(crowdBus);s.start(t,Math.random()*3);s.stop(t+seconds+.05);
  }

  /** The commentator. A line with the player's name when there is one (mostly), else a general line for the situation. Only one line
   * at a time (see turn()): a bigger moment cuts in, a middling one waits for the current line to end, small talk needs a lull. */
  async function say(c,queued=false){
    if(!ctx||muted||!manifest)return;
    // A queued line skips the lull, but not a line that started meanwhile.
    const now=ctx.currentTime,busy=speaking&&now<speaking.ends,decision=queued&&!busy?'play':turn(speaking,quietSince,c,now);
    if(decision==='drop')return;
    if(decision==='wait'){if(!waiting||c.prio>=waiting.c.prio)waiting={c,until:speaking.ends+.8};return;}
    if(decision==='cut'){waiting=null;try{speaking.source.stop();}catch{}}
    const named=c.player?manifest.players?.[c.player]?.[c.situation]:null,general=manifest.generic?.[c.situation];
    const useNamed=named?.length&&(c.namedOnly||!general?.length||Math.random()<.75);
    const file=useNamed?next(`${c.player}:${c.situation}`,named):c.namedOnly?null:next(c.situation,general);
    if(!file)return;
    const claim={prio:c.prio,ends:now+3,source:null};speaking=claim;
    const played=await playFile(file,1,voiceBus.input);
    if(!played||!ctx||speaking!==claim){if(speaking===claim)speaking=null;return;}
    const t=ctx.currentTime;claim.source=played.source;claim.ends=t+played.seconds;
    // The crowd dips under the voice (less under a shout, which rides the roar).
    crowdBus.gain.cancelScheduledValues(t);crowdBus.gain.setTargetAtTime(c.prio>=8?.75:.55,t,.06);crowdBus.gain.setTargetAtTime(1,t+played.seconds,.3);
    played.source.onended=()=>{
      if(speaking!==claim||!ctx)return;
      speaking=null;quietSince=ctx.currentTime;
      const w=waiting;waiting=null;if(w&&ctx.currentTime<=w.until)later(()=>say(w.c,true),120);
    };
  }

  return {
    unlock,
    get muted(){return muted;},
    /** QA: 'off' before the first click, then the audio context's state. */
    get state(){return ctx?.state??'off';},
    /** QA: what the commentator is saying now (its weight), or null. */
    get speaking(){return speaking&&ctx&&ctx.currentTime<speaking.ends?{prio:speaking.prio}:null;},
    setMuted(value){muted=value;try{localStorage.setItem(STORE,value?'off':'on');}catch{}if(master)master.gain.setTargetAtTime(value?0:.9,ctx.currentTime,.05);if(value&&speaking?.source){try{speaking.source.stop();}catch{}}},
    /** Events just crossed in normal play. live: the match as it happens (not a replay); speed: playback rate (highlights count as 1);
     * half: 1 or 2. The whistle up to 2x, the commentator, kicks and the crowd's swells only at normal speed. */
    events(list,{live=true,speed=1,half=1}={}){
      if(!ctx||ctx.state!=='running'||muted||!list.length)return;
      for(const e of list){
        const pattern=live&&speed<=2?refereeWhistle(e):null,blown=pattern?whistle(pattern):0;
        if(speed>1)continue;
        if(live){
          const c=commentaryFor(e,half);
          if(c){const wait=c.afterWhistle&&blown?Math.round((blown+.15)*1000):0;if(wait)later(()=>say(c),wait);else say(c);}
          const f=shotFollowUp(e);if(f)later(()=>say(f),f.delay);
        }
        if(isShot(e)){kick(e.kind==='header'?.5:1);if(live&&!/direk!/i.test(e.reason?.explanation??''))swell(e.importance>=.6?.2:.12,2.2,false);}
        else if(['pass','through-pass','diagonal-pass','cross','clearance','corner','kick-off','free-kick'].includes(e.kind))kick(e.kind==='clearance'?.8:.45);
        if(e.kind==='goal'&&live)swell(.42,5.5,true);
      }
    },
    /** Every frame: the crowd's murmur rises as the ball nears a goal. */
    frame(ball,realDt,{playing=true}={}){
      if(!ctx||!crowdGain)return;
      const near=clamp((Math.abs(ball.x)-22)/26,0,1);excitement+=(near-excitement)*(1-Math.exp(-realDt*1.5));
      crowdGain.gain.setTargetAtTime(playing?.05+.07*excitement:.035,ctx.currentTime,.25);crowdFilter.frequency.setTargetAtTime(650+350*excitement,ctx.currentTime,.3);
    },
    /** Quiet crowd (cards, half time) or none (the screen is closed). */
    hush(off=false){if(crowdGain)crowdGain.gain.setTargetAtTime(off?0:.03,ctx.currentTime,.3);},
    /** Off while the match screen is not shown; back on when it is. */
    sleep(){if(ctx?.state==='running')ctx.suspend();},
    wake(){if(ctx?.state==='suspended')ctx.resume();},
    dispose(){for(const id of timers)clearTimeout(id);timers.clear();ctx?.close();ctx=null;speaking=null;waiting=null;},
  };
}
