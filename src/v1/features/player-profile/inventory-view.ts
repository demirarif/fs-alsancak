import type { Player, PlayerCatalog, Attribute, Position } from '../../domain/players.js';
import { mainRating } from '../../data/catalog-index.ts';
import { html, roleStars } from './view.ts';
import { attributeOnTwenty, gradeClass, roleOnTwenty } from './presentation.ts';
import { CARD_POSITIONS } from './player-card.ts';
import { playerKitMarkup, playerVisualIdentity } from './player-kit.ts';
import { playerInsights } from './profile-insights.ts';

export const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
const arrowIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>';
const plusIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';

export function inventoryShell():string {
  return `<dialog class="library-dialog inventory-dialog roster-inventory" aria-labelledby="inventory-title">
    <div class="ri-topline"><span class="bp-wordmark">ALSANCAK</span><button class="bp-close" data-close-inventory aria-label="Envanteri kapat">${closeIcon}</button></div>
    <header class="ri-header"><div><h2 id="inventory-title">Oyuncular</h2><p id="inventory-counts">48 oyuncu</p></div><button class="ri-action" id="new-guest">${plusIcon}<span>Misafir ekle</span></button></header>
    <div class="ri-controls"><div class="ri-tabs" role="group" aria-label="Oyuncu türü"><button data-filter="all" class="active" aria-pressed="true">Tümü <span id="all-count">48</span></button><button data-filter="outfield" aria-pressed="false">Saha oyuncuları</button><button data-filter="goalkeeper" aria-pressed="false">Kaleciler</button><button data-filter="guests" aria-pressed="false">Misafirler <span id="guest-count">0</span></button></div>
      <div class="ri-search-row"><label class="ri-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="inventory-search" type="search" placeholder="Oyuncu ara" aria-label="Oyuncu ara" autocomplete="off"/></label><label class="ri-position"><span class="ri-sr-only">Mevki</span><select id="inventory-position" aria-label="Envanter mevki filtresi"><option value="">Tüm mevkiler</option>${Object.entries(CARD_POSITIONS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div>
    </div>
    <div class="library-alert" id="library-alert" role="status" hidden><span></span><button id="retry-storage">Tekrar dene</button></div>
    <div class="ri-grid" id="inventory-grid"></div><div class="ri-empty" id="inventory-empty" hidden><strong>Oyuncu bulunamadı</strong><p>Aramayı veya mevki filtresini değiştirebilirsin.</p></div>
    <footer class="ri-footer"><span id="inventory-summary" role="status" aria-live="polite">48 oyuncu</span><span class="ri-sr-only" id="storage-status">Kayıtlar hazırlanıyor</span><span>ALSANCAK</span></footer>
  </dialog>`;
}

const cardKeys:Readonly<Record<Exclude<Position,'GK'>,readonly [Attribute,string][]>>={
  CB:[['defending','Savunma'],['positioning','Pozisyon'],['strength','Güç']],
  FB:[['speed','Hız'],['passing','Pas'],['stamina','Dayanıklılık']],
  CM:[['passing','Pas'],['vision','Görüş'],['control','Kontrol']],
  CAM:[['vision','Görüş'],['passing','Pas'],['dribbling','Dripling']],
  W:[['speed','Hız'],['dribbling','Dripling'],['shooting','Şut']],
  ST:[['finishing','Bitiricilik'],['shooting','Şut'],['speed','Hız']],
};

export function inventoryPlayerMarkup(player:Player,catalog:PlayerCatalog):string {
  const identity=playerVisualIdentity(player),insight=playerInsights(player,catalog);
  const stats=player.kind==='goalkeeper'?`<span class="ri-keeper-stat"><span>Kalecilik</span><strong class="${gradeClass(roleOnTwenty(player.goalkeeperRating))}">${roleOnTwenty(player.goalkeeperRating)}<small>/ 20</small></strong></span>`:
    cardKeys[player.mainPosition].map(([key,label])=>{const value=attributeOnTwenty(player.attributes[key]);return `<span class="ri-stat"><span>${label}</span><strong class="${gradeClass(value)}">${value}</strong></span>`;}).join('');
  return `<button class="ri-player" data-player="${html(player.id)}" data-club="${identity.club}" aria-label="${html(player.name)} profilini aç">
    <span class="ri-card-main"><span class="ri-shirt" data-portrait-player="${html(player.id)}" aria-hidden="true">${identity.portraitUrl?`<img src="${html(identity.portraitUrl)}" alt="" loading="lazy" decoding="async"/>`:playerKitMarkup(player)}</span>
    <span class="ri-card-identity"><strong>${html(player.name)}</strong><span>${CARD_POSITIONS[player.mainPosition]}</span>${roleStars(mainRating(player))}${player.origin.kind==='guest'?'<small>Misafir oyuncu</small>':insight.style!==CARD_POSITIONS[player.mainPosition]?`<small>${html(insight.style)}</small>`:''}</span></span>
    <span class="ri-card-stats">${stats}</span><span class="ri-card-bottom"><span>Profili incele</span>${arrowIcon}</span>
  </button>`;
}
