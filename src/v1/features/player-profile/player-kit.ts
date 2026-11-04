import type { Player } from '../../domain/players.js';
import type { TeamId } from '../../domain/common.js';

export type ClubId='galatasaray'|'fenerbahce'|'trabzonspor'|'besiktas';
export interface PlayerVisualIdentity {
  readonly club:ClubId;
  readonly clubName:string;
  /** True only for the supporters explicitly named by the user. */
  readonly confirmed:boolean;
  readonly portraitUrl?:string;
}

/** Presentation metadata only: supporter colours never affect a player's football data. */
export const CONFIRMED_PLAYER_CLUBS:Readonly<Record<string,ClubId>>=Object.freeze({
  'm-emre':'fenerbahce',akin:'fenerbahce',ugur:'fenerbahce','kamil-reis':'fenerbahce',
  utku:'fenerbahce',goktug:'fenerbahce','arda-barin':'fenerbahce','ali-efe':'fenerbahce',
  'hakan-goktug':'fenerbahce',alper:'fenerbahce',barkuz:'fenerbahce',
  baran:'galatasaray',arif:'galatasaray',eren:'galatasaray',onur:'galatasaray',
  servan:'galatasaray',fuat:'galatasaray',taha:'trabzonspor',
});

/** Photo-backed portraits keyed by stable ID. Framing, sources and prompts: docs/portraits/batch-03.md. */
export const PLAYER_PORTRAITS:Readonly<Record<string,string>>=Object.freeze({
  baran:new URL('../../../assets/portraits/baran-v2.png',import.meta.url).href,
  onur:new URL('../../../assets/portraits/onur-v1.png',import.meta.url).href,
  goktug:new URL('../../../assets/portraits/goktug-v1.png',import.meta.url).href,
  utku:new URL('../../../assets/portraits/utku-v1.png',import.meta.url).href,
  'akin':new URL('../../../assets/portraits/akin-v1.png',import.meta.url).href,
  'arif':new URL('../../../assets/portraits/arif-v1.png',import.meta.url).href,
  'arda-barin':new URL('../../../assets/portraits/arda-barin-v1.png',import.meta.url).href,
  'barkuz':new URL('../../../assets/portraits/barkuz-v1.png',import.meta.url).href,
  'batu':new URL('../../../assets/portraits/batu-v1.png',import.meta.url).href,
  'kamil-reis':new URL('../../../assets/portraits/kamil-reis-v1.png',import.meta.url).href,
  'mamadou':new URL('../../../assets/portraits/mamadou-v1.png',import.meta.url).href,
  'ugur':new URL('../../../assets/portraits/ugur-v1.png',import.meta.url).href,
  'fuat':new URL('../../../assets/portraits/fuat-v1.png',import.meta.url).href,
});

const CLUB_NAMES:Readonly<Record<ClubId,string>>={
  galatasaray:'Galatasaray',fenerbahce:'Fenerbahçe',trabzonspor:'Trabzonspor',besiktas:'Beşiktaş',
};
const CLUBS:readonly ClubId[]=['galatasaray','fenerbahce','trabzonspor','besiktas'];

function fallbackClub(id:string):ClubId {
  // Stable on refresh, independent of sorting, filtering or catalog insertions.
  let hash=2166136261;
  for(const character of id){hash^=character.codePointAt(0)!;hash=Math.imul(hash,16777619);}
  return CLUBS[(hash>>>0)%CLUBS.length]!;
}

export function playerVisualIdentity(player:Player):PlayerVisualIdentity {
  const confirmedClub=player.origin.kind==='catalog'&&Object.hasOwn(CONFIRMED_PLAYER_CLUBS,player.id)?CONFIRMED_PLAYER_CLUBS[player.id]:undefined;
  const club=confirmedClub??fallbackClub(player.id);
  const portraitUrl=Object.hasOwn(PLAYER_PORTRAITS,player.id)?PLAYER_PORTRAITS[player.id]:undefined;
  return {club,clubName:CLUB_NAMES[club],confirmed:confirmedClub!==undefined,...(portraitUrl?{portraitUrl}:{})};
}

interface KitPalette {
  readonly primary:readonly [string,string,string,string];
  readonly secondary:readonly [string,string,string,string];
  readonly collar:string;
  readonly seam:string;
  readonly trim:string;
  readonly edge:string;
  readonly description:string;
  readonly striped:boolean;
  readonly solid?:boolean;
}
const PALETTES:Readonly<Record<ClubId,KitPalette>>={
  galatasaray:{primary:['#bb7916','#fbbf37','#f2b22b','#d58f1b'],secondary:['#a0162e','#be233b','#ac1931','#721329'],collar:'#561c2b',seam:'#541928',trim:'#f3bd52',edge:'#cf6054',description:'Sarı kırmızı parçalı forma',striped:false},
  fenerbahce:{primary:['#b78911','#f6cf3e','#ebbd23','#c39816'],secondary:['#131c39','#263959','#1c2b49','#0d172d'],collar:'#141d36',seam:'#101a34',trim:'#e9c244',edge:'#64738f',description:'Sarı lacivert çubuklu forma',striped:true},
  trabzonspor:{primary:['#326786','#79bad8','#63a7cc','#3d799d'],secondary:['#59182d','#872d44','#722239','#441626'],collar:'#431a2b',seam:'#41172a',trim:'#7bb8d5',edge:'#ae6476',description:'Bordo mavi çubuklu forma',striped:true},
  besiktas:{primary:['#a6acb6','#f1f0e9','#dcdee0','#b6bdc6'],secondary:['#10151e','#2c3440','#1c2430','#0d121a'],collar:'#171d28',seam:'#17202c',trim:'#dfe1e1',edge:'#7e8999',description:'Siyah beyaz çubuklu forma',striped:true},
};

let illustrationSequence=0;
type FlagId='turkey'|'iran'|'papua-new-guinea';
const FLAG_NAMES:Readonly<Record<FlagId,string>>={turkey:'Türk',iran:'İran','papua-new-guinea':'Papua Yeni Gine'};
const playerFlag=(player?:Pick<Player,'id'>):FlagId=>player?.id==='kiyan'?'iran':player?.id==='mamadou'?'papua-new-guinea':'turkey';

function flagBadge(id:string,flag:FlagId):string {
  if(flag==='turkey')return '<g transform="translate(150 93)"><circle r="13" fill="#f2e6d1"/><circle r="11.3" fill="#d31b36"/><circle cx="-2.8" r="6.7" fill="#fff"/><circle cx="-.9" cy="-.8" r="5.4" fill="#d31b36"/><path d="m5.7-4.1 1.1 2.9 3.1.1-2.4 1.9.9 3-2.7-1.7-2.5 1.8.8-3-2.5-1.9 3.1-.1Z" fill="#fff"/></g>';
  const star='<path d="m0-3 .88 1.79 1.98.29L1.43.47l.34 1.97L0 1.51l-1.77.93.34-1.97-1.43-1.39 1.98-.29Z"/>';
  const artwork=flag==='iran'
    ?'<path fill="#239f40" d="M0 0h60v20H0z"/><path fill="#fff" d="M0 20h60v20H0z"/><path fill="#da0000" d="M0 40h60v20H0z"/><g fill="none" stroke="#da0000" stroke-width="1.6" stroke-linecap="round"><path d="M30 24v13M27 22q3 4 6 0M25 25q-4 8 5 12M35 25q4 8-5 12M23 24q-5 11 7 13M37 24q5 11-7 13"/></g>'
    :`<path fill="#141414" d="M0 0h60v60H0z"/><path fill="#cf233b" d="M0 0h60v60Z"/><g fill="#fff"><g transform="translate(15 28)">${star}</g><g transform="translate(7 39)">${star}</g><g transform="translate(25 39)">${star}</g><g transform="translate(15 52)">${star}</g><g transform="translate(25 49) scale(.6)">${star}</g></g><g fill="#f8cf35"><path d="M46 15q-7-9-19-10l9 8-7-2 12 9-5 1 9 1-5 6 8-7q5-2 4-6l5-2-6-1q-4-3-5 3Z"/><path d="M44 20q-2 9-7 13 7-3 10-9-1 10-7 15 9-6 9-16l2 9q1-9-3-13Z"/></g>`;
  return `<g transform="translate(150 93)"><circle r="13" fill="#f2e6d1"/><g transform="translate(-11.3 -11.3) scale(.376667)"><defs><clipPath id="${id}-flag"><circle cx="30" cy="30" r="30"/></clipPath></defs><g clip-path="url(#${id}-flag)">${artwork}</g></g></g>`;
}

/** The approved Baran silhouette, folds, fabric weave and round flag badge. */
export function playerKitMarkup(player:Player):string {
  const {club}=playerVisualIdentity(player),palette=PALETTES[club];
  return renderKit(palette,`data-kit-club="${club}"`,playerFlag(player));
}

const MATCH_PALETTES={
  blue:{primary:['#20477d','#5998eb','#397bd2','#214b88'],secondary:['#20477d','#5998eb','#397bd2','#214b88'],collar:'#172a45',seam:'#153052',trim:'#b2c9e9',edge:'#7ba4d5',description:'Mavi takım forması',striped:false,solid:true},
  red:{primary:['#8d2436','#e05a6a','#c63c51','#8d2439'],secondary:['#8d2436','#e05a6a','#c63c51','#8d2439'],collar:'#481e2a',seam:'#6c1b30',trim:'#f0bec2',edge:'#b96373',description:'Kırmızı takım forması',striped:false,solid:true},
  white:{primary:['#b0bac9','#f4f5f0','#e3e8ec','#aeb9ca'],secondary:['#b0bac9','#f4f5f0','#e3e8ec','#aeb9ca'],collar:'#2c3a50',seam:'#64738a',trim:'#c7d1df',edge:'#8f9db4',description:'Mavi takımın beyaz kaleci forması',striped:false,solid:true},
  black:{primary:['#101620','#3d4757','#2a3342','#141b27'],secondary:['#101620','#3d4757','#2a3342','#141b27'],collar:'#10151e',seam:'#0e1420',trim:'#c6cbd4',edge:'#778397',description:'Kırmızı takımın siyah kaleci forması',striped:false,solid:true},
} as const satisfies Readonly<Record<string,KitPalette>>;

/** Same silhouette and fabric as the player card; colours identify the match team. */
export function teamKitMarkup(teamId:TeamId,goalkeeper=false,player?:Pick<Player,'id'>):string {
  const palette=teamId==='team-1'?MATCH_PALETTES[goalkeeper?'white':'blue']:MATCH_PALETTES[goalkeeper?'black':'red'];
  return renderKit(palette,`data-kit-team="${teamId}" data-kit-role="${goalkeeper?'goalkeeper':'outfield'}"`,playerFlag(player));
}

function renderKit(palette:KitPalette,metadata:string,flag:FlagId):string {
  const id=`player-kit-${++illustrationSequence}`;
  const outline='M107 34 70 47 29 108 64 132 84 106 78 260Q150 278 222 260L216 106 236 132 271 108 230 47 193 34Q150 56 107 34Z';
  const gradient=(name:string,colours:readonly string[],middle:string)=>`<linearGradient id="${id}-${name}" x1="0" x2="1" y2="${middle}"><stop stop-color="${colours[0]}"/><stop offset=".35" stop-color="${colours[1]}"/><stop offset=".74" stop-color="${colours[2]}"/><stop offset="1" stop-color="${colours[3]}"/></linearGradient>`;
  const panels=palette.solid
    ?`<path d="M0 0h300v300H0Z" fill="url(#${id}-primary)"/><path d="m70 47 37-13-23 72-20 26-35-24Zm123-13 37 13 41 61-35 24-20-26Z" fill="${palette.collar}" fill-opacity=".16"/>`
    :palette.striped
    ?`<path d="M0 0h300v300H0Z" fill="url(#${id}-primary)"/><path d="M88 0h24v300H88ZM138 0h24v300h-24ZM188 0h24v300h-24Z" fill="url(#${id}-secondary)"/><path d="m70 47 37-13-23 72-20 26-35-24Zm123-13 37 13 41 61-35 24-20-26Z" fill="url(#${id}-secondary)"/>`
    :`<path d="M0 0h150v300H0Z" fill="url(#${id}-primary)"/><path d="M150 0h150v300H150Z" fill="url(#${id}-secondary)"/><path d="m70 47 37-13-23 72-20 26-35-24Z" fill="url(#${id}-secondary)"/><path d="m193 34 37 13 41 61-35 24-20-26Z" fill="url(#${id}-primary)"/><path d="M150 51v225" stroke="${palette.seam}" stroke-opacity=".23"/>`;
  // All interpolated values below are internal palette constants or a numeric sequence.
  // Names, arbitrary IDs and guest input never enter SVG markup or definition IDs.
  return `<svg class="bp-shirt" ${metadata} data-kit-flag="${flag}" viewBox="0 0 300 292" role="img" aria-label="${palette.description}; göğüste yuvarlak ${FLAG_NAMES[flag]} bayrağı, kulüp logosu yok">
    <defs>
      <clipPath id="${id}-shape"><path d="${outline}"/></clipPath>
      ${gradient('primary',palette.primary,'.3')}${gradient('secondary',palette.secondary,'.2')}
      <linearGradient id="${id}-light" x1="0" x2=".45" y2="1"><stop stop-color="#fff" stop-opacity=".18"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#08060c" stop-opacity=".24"/></linearGradient>
      <linearGradient id="${id}-fold"><stop stop-color="#0b0715" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#090510" stop-opacity="0"/></linearGradient>
      <pattern id="${id}-weave" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0h1v1H0zM2 2h1v1H2z" fill="#fff" fill-opacity=".065"/></pattern>
    </defs>
    <g clip-path="url(#${id}-shape)">
      ${panels}
      <path d="M87 105q15 79 7 157h19q-17-97-26-157M215 105q-17 78-10 157h-23q25-83 33-157M135 64l-7 194h11zM177 72l-12 194h13z" fill="url(#${id}-fold)"/>
      <path d="M77 48q9 17 9 54M223 48q-9 17-9 54" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.4"/>
      <path d="m30 104 37 24m165 0 38-24" stroke="${palette.collar}" stroke-width="9"/>
      <path d="m32 103 35 23m165 0 36-23" stroke="${palette.trim}" stroke-opacity=".35" stroke-width="1"/>
      <path d="M79 254q71 17 142 0" fill="none" stroke="${palette.seam}" stroke-opacity=".33" stroke-width="2"/>
      <path d="${outline}" fill="url(#${id}-light)"/><path d="${outline}" fill="url(#${id}-weave)"/>
    </g>
    <path d="${outline}" fill="none" stroke="#f9dba0" stroke-opacity=".18"/>
    <path d="M107 34q43 22 86 0l-7 13q-36 33-72 0Z" fill="${palette.collar}"/>
    <path d="M108 35q42 27 84 0" fill="none" stroke="${palette.trim}" stroke-width="3"/>
    <path d="M114 47q36 33 72 0" fill="none" stroke="${palette.edge}" stroke-opacity=".5" stroke-width="1.5"/>
    ${flagBadge(id,flag)}
  </svg>`;
}
