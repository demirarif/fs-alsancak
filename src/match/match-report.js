import { factsOf, manOfTheMatch } from '../v1/online/markets.ts';
import { attackDir, teamIndex } from './highlight-edit.js';
import { teamKitMarkup, PLAYER_PORTRAITS } from '../v1/features/player-profile/player-kit.ts';

/* Full-time report (2026-11-09): the man of the match, a 10-point rating for each player and a shot map, from what the engine already
 * records. The man of the match is the same pick as the "Maçın oyuncusu" bet (markets.ts); the 10-point rating is for the screen only and
 * changes nothing in the match. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const shirt=team=>`<span class="match-kit" aria-hidden="true">${teamKitMarkup(team===0?'team-1':'team-2')}</span>`;
const SHOT_KINDS=new Set(['shot','header','penalty']),ON_TARGET=new Set(['save','parry']);

const clampTo=(v,a)=>Math.max(-a,Math.min(a,v));
/** 10-point match rating from a player's line, around this engine's match averages (2026-11-09, 144 player games: 8 balls won, 25
 * passes completed, 8 headers won a man), so an ordinary game is ~6.5 and a 10 needs a hat-trick-and-more day. */
export function playerRating(s,{keeper=false,won=false,lost=false,conceded=0}={}){
  let r=6.3+.7*Math.min(s.goals,3)+.35*Math.max(0,s.goals-3)+.45*s.assists+.08*s.onTarget-.05*Math.max(0,s.shots-s.onTarget)
    +clampTo(.06*(s.tackles+s.interceptions-8),.7)+clampTo(.02*(s.completed-25),.6)+clampTo(.015*(s.headersWon-8),.3)-.15*(s.fouls??0)+(won?.3:lost?-.3:0);
  // A keeper has no outfield numbers to speak of: his saves and the goals he let in.
  if(keeper)r+=.6+.15*s.saves-.15*conceded;
  return Math.round(Math.min(10,Math.max(4,r))*10)/10;
}
const tone=r=>r>=8?'top':r>=7?'good':r>=6?'ok':'low';
/** A player's cut-out photo, when there is one (catalog players; guests have none). */
export const portraitOf=id=>id&&Object.hasOwn(PLAYER_PORTRAITS,id)?PLAYER_PORTRAITS[id]:'';
/** What a player's line says in a few words: goals, assists, a keeper's saves, else the balls he won. */
const statLine=r=>[r.stats.goals?`${r.stats.goals} gol`:'',r.stats.assists?`${r.stats.assists} asist`:'',r.keeper&&r.stats.saves?`${r.stats.saves} kurtarış`:'',
  !r.stats.goals&&!r.stats.assists&&!r.keeper&&r.stats.tackles+r.stats.interceptions?`${r.stats.tackles+r.stats.interceptions} top kazanma`:''].filter(Boolean).join(' · ');
/** One engine result's players rated on the 10-point scale, the result's score deciding who won. */
function rated(result,players){
  const score=result.score,info=new Map(players.map(p=>[p.id,p]));
  return result.players.filter(p=>info.has(p.id)).map(p=>{const team=p.team,me=info.get(p.id);
    return {id:p.id,name:me.name,team,keeper:!!me.keeper,stats:p.stats,rating:playerRating(p.stats,{keeper:!!me.keeper,won:score[team]>score[1-team],lost:score[team]<score[1-team],conceded:score[1-team]})};});
}
/** The best-rated player of one half (the half-time screen's "İlk yarının adamı"), or null. */
export function bestOfHalf({result,players}){
  if(!result?.players?.length)return null;
  const best=rated(result,players).sort((a,b)=>b.rating-a.rating||b.stats.goals-a.stats.goals)[0];
  return best?{id:best.id,name:best.name,team:best.team,rating:best.rating,line:statLine(best)}:null;
}

/** players: [{id,name,team,keeper}] (the 22 on the pitch); results: the two halves' engine results; halves: their replays. */
export function matchReport({results,halves,players}){
  const second=results[1];if(!second?.players?.length||!results[0])return '';
  const facts=factsOf(results[0],second),motmId=manOfTheMatch(facts),rows=rated(second,players);
  const motm=rows.find(r=>r.id===motmId),line=statLine;
  // Premium theme (2026-11-10): his cut-out photo when there is one, a light sweep and the rating filling a ring.
  const face=motm&&portraitOf(motm.id);
  const motmHtml=motm?`<div class="mr-motm ${motm.team?'red':'blue'}${face?' has-face':''}"><i class="mr-sweep" aria-hidden="true"></i>${face?`<img class="mr-face" src="${face}" alt="">`:shirt(motm.team)}<div><small>Maçın oyuncusu</small><b>${esc(motm.name)}</b>${line(motm)?`<span>${esc(line(motm))}</span>`:''}</div><span class="mr-ring" style="--r:${(motm.rating/10).toFixed(2)}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="bg" cx="24" cy="24" r="20"/><circle class="fg" cx="24" cy="24" r="20" pathLength="1"/></svg><em class="mr-rating ${tone(motm.rating)}">${motm.rating.toFixed(1).replace('.',',')}</em></span></div>`:'';
  const list=team=>`<ol class="mr-ratings ${team?'red':'blue'}">${rows.filter(r=>r.team===team).sort((a,b)=>b.rating-a.rating||a.name.localeCompare(b.name,'tr'))
    .map(r=>`<li${r.id===motmId?' class="is-motm"':''}><span>${esc(r.name)}${r.keeper?' <i>KL</i>':''}</span><em class="mr-rating ${tone(r.rating)}">${r.rating.toFixed(1).replace('.',',')}</em></li>`).join('')}</ol>`;
  return `<section class="mr-report">${motmHtml}<div class="mr-grid"><figure class="mr-shots">${shotMap(halves)}<figcaption>Şut haritası · <i class="dot goal"></i>gol <i class="dot on"></i>isabetli <i class="dot off"></i>isabetsiz / blok</figcaption></figure>
    <div class="mr-ratings-wrap"><p class="mr-title">Oyuncu puanları <small>10 üzerinden</small></p><div class="mr-columns">${list(0)}${list(1)}</div></div></div></section>`;
}

/** Both teams' shots on one pitch: Mavi attacks to the right, Kırmızı to the left (each half's ends switched back). */
export function shotMap(halves){
  const shots=halves.filter(Boolean).flatMap(h=>h.events.filter(e=>SHOT_KINDS.has(e.kind)&&e.outcome).map(e=>{
    const team=teamIndex(e.teamId),d=attackDir(team,h.half)*(team===0?1:-1);return {x:e.origin.x*d,z:e.origin.z*d,team,outcome:e.outcome};}));
  const dot=s=>{const c=s.team?'red':'blue';
    if(s.outcome==='goal')return `<circle class="goal ${c}" cx="${s.x.toFixed(1)}" cy="${s.z.toFixed(1)}" r="1.9"/>`;
    return ON_TARGET.has(s.outcome)?`<circle class="on ${c}" cx="${s.x.toFixed(1)}" cy="${s.z.toFixed(1)}" r="1.25"/>`:`<circle class="off ${c}" cx="${s.x.toFixed(1)}" cy="${s.z.toFixed(1)}" r="1.1"/>`;};
  // Pitch 105 × 68 m (engine units), boxes and goals; goals are drawn last so they stay on top.
  const box=sx=>`<rect x="${sx>0?52.5-16.5:-52.5}" y="-20.16" width="16.5" height="40.32"/><rect x="${sx>0?52.5-5.5:-52.5}" y="-9.16" width="5.5" height="18.32"/><rect class="goalmouth" x="${sx>0?52.5:-54.3}" y="-3.66" width="1.8" height="7.32"/>`;
  const order=[...shots.filter(s=>s.outcome!=='goal'),...shots.filter(s=>s.outcome==='goal')];
  return `<svg viewBox="-56 -36.5 112 73" role="img" aria-label="Şut haritası: ${shots.length} şut"><g class="pitch"><rect x="-52.5" y="-34" width="105" height="68"/><line x1="0" y1="-34" x2="0" y2="34"/><circle cx="0" cy="0" r="9.15"/>${box(1)}${box(-1)}</g>${order.map(dot).join('')}</svg>`;
}
