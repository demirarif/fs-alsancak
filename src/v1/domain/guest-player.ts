import type { Problem, Result } from './common.js';
import type { BaseAttributes, GuestPlayerRequest, GuestScaling, Player, PlayerCatalog } from './players.js';
import type { GuestPlayerFactory } from '../data/catalog.js';
import { ATTRIBUTE_KEYS } from './players.ts';
import { calculatePositionRatings, roundRating } from './ratings.ts';
import { ATTRIBUTE_GROUPS, GUEST_POLICY } from '../config/defaults.ts';
import { deepFreeze } from './immutable.ts';

export interface GuestFactoryDependencies {
  readonly createId?: () => string;
  readonly now?: () => string;
}

export function normalizePlayerName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function validateScaling(scaling: GuestScaling): boolean {
  const valid = (n: number) => Number.isInteger(n) && n >= GUEST_POLICY.percent.min && n <= GUEST_POLICY.percent.max;
  return scaling.mode === 'overall' ? valid(scaling.overallPercent)
    : scaling.mode === 'split' && valid(scaling.physicalPercent) && valid(scaling.gamePercent);
}

export function createGuestPlayerFactory(dependencies: GuestFactoryDependencies = {}): GuestPlayerFactory {
  function build(request: GuestPlayerRequest, catalog: PlayerCatalog, preview: boolean): Result<Player> {
    const problems: Problem[] = [];
    const reference = catalog.players.find(p => p.id === request.referencePlayerId && !p.archived);
    const name = normalizePlayerName(request.name);
    if ((!preview || name.length > 0) && (name.length < 2 || name.length > 40)) problems.push({code:'GUEST_NAME',field:'name',message:'Oyuncu adı 2–40 karakter olmalı.'});
    if (/[\u0000-\u001f\u007f]/u.test(request.name)) problems.push({code:'GUEST_NAME',field:'name',message:'Oyuncu adı kontrol karakteri içeremez.'});
    if (!reference) problems.push({code:'GUEST_REFERENCE',field:'referencePlayerId',message:'Envanterden kullanılabilir bir referans oyuncu seç.'});
    if (!validateScaling(request.scaling)) problems.push({code:'GUEST_PERCENT',field:'scaling',message:'Yüzdeler 60–120 arasında tam sayı olmalı.'});
    if (reference && (reference.kind !== request.kind || reference.kind === 'goalkeeper' && request.scaling.mode !== 'overall')) problems.push({code:'GUEST_KIND',field:'referencePlayerId',message:'Kaleci için yalnızca genel yüzde kullanılabilir.'});
    if (problems.length || !reference) return {ok:false,problems};
    const id = preview ? `preview-${reference.id}` : dependencies.createId?.() ?? `guest-${crypto.randomUUID()}`;
    const createdAt = preview ? catalog.importedAt : dependencies.now?.() ?? new Date().toISOString();
    if (!id.startsWith(preview ? 'preview-' : 'guest-') || catalog.players.some(p => p.id === id) || !Number.isFinite(Date.parse(createdAt))) {
      return {ok:false,problems:[{code:'GUEST_IDENTITY',message:'Oyuncu kimliği oluşturulamadı. Tekrar dene.'}]};
    }
    const common = { id, name: name || 'Yeni oyuncu', archived:false,
      suitability:structuredClone(reference.suitability), preferredPositions:[...reference.preferredPositions], notes:[],
      origin:{kind:'guest',referencePlayerId:reference.id,referenceCatalogVersion:catalog.version,scaling:structuredClone(request.scaling),createdAt,adaptation:'unfamiliar'} as const };
    if (reference.kind === 'goalkeeper' && request.scaling.mode === 'overall') {
      return {ok:true,value:deepFreeze({...common,kind:'goalkeeper',mainPosition:'GK',goalkeeperRating:roundRating(Math.max(0,Math.min(100,reference.goalkeeperRating*request.scaling.overallPercent/100)))})};
    }
    if (reference.kind !== 'outfield') return {ok:false,problems:[{code:'GUEST_KIND',message:'Referans türü geçersiz.'}]};
    const scaling = request.scaling;
    const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map(key => {
      const percent = scaling.mode === 'overall' ? scaling.overallPercent
        : (ATTRIBUTE_GROUPS.physical as readonly string[]).includes(key) ? scaling.physicalPercent : scaling.gamePercent;
      return [key,roundRating(Math.max(1,Math.min(10,reference.attributes[key]*percent/100)))];
    })) as BaseAttributes;
    return {ok:true,value:deepFreeze({...common,kind:'outfield',mainPosition:reference.mainPosition,attributes,
      positionRatings:calculatePositionRatings(attributes,reference.suitability)})};
  }
  return {preview:(request,catalog)=>build(request,catalog,true),create:(request,catalog)=>build(request,catalog,false)};
}
