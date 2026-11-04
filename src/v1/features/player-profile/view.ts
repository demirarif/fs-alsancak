import type { Player, PlayerCatalog } from '../../domain/players.js';
import { roleStarUnits } from './presentation.ts';
import { playerCardMarkup } from './player-card.ts';

/** All user/source text is escaped before entering authored templates. */
export const html=(value:unknown)=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const initials=(name:string)=>name.trim().split(/\s+/u).map(s=>s[0]??'').slice(0,2).join('').toLocaleUpperCase('tr-TR');

export function roleStars(rating:number):string {
  const units=roleStarUnits(rating),full=Math.floor(units/2),half=units%2;
  const path='<path d="m10 1 2.75 5.58 6.16.9-4.46 4.34 1.05 6.14L10 15.06l-5.5 2.9 1.05-6.14L1.1 7.48l6.15-.9Z"/>';
  return `<span class="role-stars" role="img" aria-label="5 üzerinden ${full} tam${half?' ve bir yarım':''} yıldız" title="Bu mevkideki seviyesi">${Array.from({length:5},(_,i)=>`<span class="rating-star ${units>=i*2+2?'full':units===i*2+1?'half':'empty'}"><svg viewBox="0 0 20 20" class="star-base" aria-hidden="true">${path}</svg><svg viewBox="0 0 20 20" class="star-fill" aria-hidden="true">${path}</svg></span>`).join('')}</span>`;
}

export function referenceSummary(player:Player,catalog:PlayerCatalog):string {
  if(player.origin.kind!=='guest')return '';
  const origin=player.origin;
  const name=catalog.players.find(p=>p.id===origin.referencePlayerId)?.name??'Oyuncu';
  const scaling=origin.scaling.mode==='overall'?`%${origin.scaling.overallPercent}`:`Fiziksel %${origin.scaling.physicalPercent} · Teknik %${origin.scaling.gamePercent}`;
  return `${name} referansıyla · ${scaling}`;
}

export function playerProfileMarkup(player:Player,catalog:PlayerCatalog):string {
  return playerCardMarkup(player,catalog,{escape:html,stars:roleStars});
}
