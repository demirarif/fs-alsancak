import type { Player, PlayerCatalog, Attribute, Position } from '../../domain/players.js';
import { attributeOnTwenty, gradeClass, roleOnTwenty } from './presentation.ts';
import { playerInsights } from './profile-insights.ts';
import { playerKitMarkup, playerVisualIdentity } from './player-kit.ts';
import { uiIcon } from '../ui/icons.ts';

interface CardFormatters {
  readonly escape:(value:unknown)=>string;
  readonly stars:(rating:number)=>string;
}

export const CARD_POSITIONS:Readonly<Record<Position,string>>={GK:'Kaleci',CB:'Stoper',FB:'Bek',CM:'Merkez orta saha',CAM:'Ofansif orta saha',W:'Kanat',ST:'Forvet'};
let pitchSequence=0;
function positionPitch(player:Player,escape:CardFormatters['escape']):string {
  const id=`profile-pitch-${++pitchSequence}`;
  const points:readonly (readonly [Position,number,number])[]=[['GK',24,71],['CB',55,71],['FB',67,30],['FB',67,112],['CM',125,71],['CAM',175,71],['W',188,30],['W',188,112],['ST',216,71]];
  const positions=[...new Set([player.mainPosition,...player.preferredPositions])];
  return `<svg class="bp-pitch" viewBox="0 0 250 142" role="img" aria-label="Tercih edilen mevkiler: ${escape(positions.map(p=>CARD_POSITIONS[p]).join(', '))}">
    <defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#223b3c"/><stop offset="1" stop-color="#192c30"/></linearGradient></defs>
    <rect x="1" y="1" width="248" height="140" rx="5" fill="url(#${id})"/>
    <g stroke="#91a9a1" stroke-opacity=".27" stroke-width="1" fill="none"><path d="M13 13h224v116H13zM125 13v116M13 40h32v62H13M237 40h-32v62h32M13 55h13v32H13M237 55h-13v32h13"/><circle cx="125" cy="71" r="21"/><circle cx="125" cy="71" r="1"/></g>
    ${points.filter(([position])=>positions.includes(position)).map(([position,x,y])=>`${position===player.mainPosition?`<circle cx="${x}" cy="${y}" r="14" fill="#e8bb68" fill-opacity=".12" stroke="#e8bb68" stroke-opacity=".4"/>`:''}<circle cx="${x}" cy="${y}" r="${position===player.mainPosition?7:6}" fill="${position===player.mainPosition?'#f3d395':'#e8bb68'}" stroke="#17292d" stroke-width="3"/>`).join('')}
  </svg>`;
}

export function playerCardMarkup(player:Player,catalog:PlayerCatalog,format:CardFormatters):string {
  const {escape,stars}=format,insight=playerInsights(player,catalog),identity=playerVisualIdentity(player);
  const columns:readonly (readonly [Attribute,string][])[]=[
    [['passing','Pas'],['control','Top kontrolü'],['dribbling','Dripling'],['vision','Oyun görüşü']],
    [['positioning','Pozisyon alma'],['defending','Savunma'],['pressing','Pres'],['stamina','Dayanıklılık']],
    [['speed','Hız'],['strength','Güç'],['shooting','Şut'],['finishing','Bitiricilik']],
  ];
  const attributes=player.kind==='outfield'?`<div class="bp-stats">${columns.map(column=>`<div class="bp-stat-column">${column.map(([key,label])=>{
    const value=attributeOnTwenty(player.attributes[key]);
    return `<div class="attribute-row bp-stat ${gradeClass(value)}" aria-label="${label}: ${value} / 20"><span>${label}</span><strong>${value}</strong></div>`;
  }).join('')}</div>`).join('')}</div>`:`<div class="bp-keeper-level"><div><span>Kalecilik</span><strong class="${gradeClass(roleOnTwenty(player.goalkeeperRating))}">${roleOnTwenty(player.goalkeeperRating)}<small>/ 20</small></strong>${stars(player.goalkeeperRating)}</div><svg viewBox="0 0 240 120" aria-hidden="true"><path d="M30 97V22h180v75M30 22l17 18h146l17-18M47 40v57M193 40v57M30 97h180M47 40h146"/><path d="M62 40v57M81 40v57M101 40v57M121 40v57M141 40v57M161 40v57M181 40v57M47 58h146M47 77h146" opacity=".35"/><circle cx="120" cy="91" r="7"/></svg></div>`;
  const roles=[...new Set([player.mainPosition,...player.preferredPositions])];
  const origin=player.origin;
  const reference=origin.kind==='guest'?catalog.players.find(p=>p.id===origin.referencePlayerId):null;
  const compact=insight.partners.length===0&&insight.context.length===0;
  return `<article class="player-detail ${player.kind==='goalkeeper'?'is-goalkeeper':''} ${compact?'bp-short-profile':''}" data-player-id="${escape(player.id)}" data-club="${identity.club}" aria-labelledby="profile-title">
    <header class="bp-toolbar"><span class="bp-wordmark">ALSANCAK</span><span class="bp-toolbar-label">Oyuncu detayları</span><button class="bp-export" data-export-profile>${uiIcon('download')}İndir</button><button class="bp-close" data-close-profile aria-label="Profili kapat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></header>
    <div class="bp-layout">
      <aside class="bp-identity">
        <div class="bp-portrait" data-portrait-player="${escape(player.id)}">${identity.portraitUrl?`<img src="${escape(identity.portraitUrl)}" alt="${escape(player.name)}"/>`:playerKitMarkup(player)}</div>
        <div class="bp-name ${player.name.length>12?'bp-long-name':''}"><h2 id="profile-title">${escape(player.name)}</h2><p>${CARD_POSITIONS[player.mainPosition]}</p>${insight.style!==CARD_POSITIONS[player.mainPosition]?`<span class="bp-style">${escape(insight.style)}</span>`:''}${reference?`<span class="bp-guest-reference">Misafir oyuncu · ${escape(reference.name)} referansıyla</span>`:''}</div>
        <section class="bp-positions" aria-labelledby="detail-positions"><h3 id="detail-positions">Oynadığı mevkiler</h3>${positionPitch(player,escape)}
          <div class="bp-role-list">${roles.map(position=>`<div class="bp-role"><span>${CARD_POSITIONS[position]}</span>${stars(player.kind==='goalkeeper'?player.goalkeeperRating:position==='GK'?0:player.positionRatings[position])}</div>`).join('')}</div>
        </section>
      </aside>
      <div class="bp-content">
        <section class="bp-attributes" aria-labelledby="detail-attributes"><div class="bp-heading"><h3 id="detail-attributes">${player.kind==='goalkeeper'?'Kalecilik seviyesi':'Özellikler'}</h3>${player.kind==='outfield'?'<span>/ 20</span>':''}</div>${attributes}</section>
        <section class="bp-observations" aria-labelledby="detail-style"><div class="bp-heading"><h3 id="detail-style">Sahadaki karakteri</h3></div><div class="bp-observation-grid">
          ${insight.observations.map(item=>`<div class="bp-observation ${item.tone==='caution'?'bp-limitation':''}"><h4>${escape(item.title)}</h4><p>${escape(item.text)}</p></div>`).join('')}
        </div></section>
        ${insight.partners.length?`<section class="bp-chemistry" aria-labelledby="detail-chemistry"><div class="bp-heading"><h3 id="detail-chemistry">${player.origin.kind==='guest'?'Takıma alışma':'Saha içi uyumu'}</h3><span class="bp-condition">${player.origin.kind==='guest'?'İlk maçlarında':'Birlikte oynadıklarında'}</span></div>
          <div class="bp-partners ${insight.partners.length===1?'bp-one-partner':''}">${insight.partners.map(partner=>`<article class="bp-partner"><div class="bp-partner-heading"><span class="bp-monogram ${partner.initials.length>1?'bp-monogram-pair':''}" aria-hidden="true">${escape(partner.initials)}</span><h4>${escape(partner.title)}</h4></div><p>${escape(partner.text)}</p></article>`).join('')}</div>
        </section>`:''}
        ${insight.context.length?`<details class="bp-context"><summary><span>Takım yapısına göre</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><div>${insight.context.map(text=>`<p>${escape(text)}</p>`).join('')}</div></details>`:''}
      </div>
    </div>
  </article>`;
}
