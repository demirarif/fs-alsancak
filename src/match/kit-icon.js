import { TEAM_KITS } from '../v1/config/team-presentation.ts';

/** Shirt silhouette (40×40) shared by the match screen (SVG) and the reel (canvas Path2D), in the navy and claret kits. */
export const SHIRT_PATH='M13 5 5 9.5l3 7.5 4-1.6V35h16V15.4l4 1.6 3-7.5L27 5c-1.4 2.6-4 4-7 4s-5.6-1.4-7-4Z';
export const COLLAR_PATH='M15.5 6.4c1.2 1.6 2.7 2.4 4.5 2.4s3.3-.8 4.5-2.4';
export const kitOf=(team,keeper=false)=>{const kit=TEAM_KITS[team===0?'team-1':'team-2'];return keeper?kit.keeper:kit;};
export function shirtIcon(team,{keeper=false,number=null}={}){
  const k=kitOf(team,keeper);
  return `<svg class="kit-shirt" viewBox="0 0 40 40" aria-hidden="true"><path d="${SHIRT_PATH}" fill="${k.shirt}" stroke="${k.trim}" stroke-width="1.6" stroke-linejoin="round"/><path d="${COLLAR_PATH}" fill="none" stroke="${k.trim}" stroke-width="1.4"/>${number===null?'':`<text x="20" y="27.5" text-anchor="middle" font-size="11" font-weight="800" fill="${k.number}">${number}</text>`}</svg>`;
}
