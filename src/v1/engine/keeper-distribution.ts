import type { Player } from '../domain/players.js';
import type { Point2 } from '../domain/common.js';

/** Coordinates follow the team's attack: x=0 own goal, x=1 opposition goal.
 * The future action selector can prefer this target; it is never a guaranteed pass. */
export function keeperDistributionAbility(player:Player,target:Point2,distanceMeters:number){
  if(player.kind!=='goalkeeper')return null;
  return player.specialAbilities?.find(ability=>distanceMeters>=ability.minimumDistanceMeters&&target.x>.5&&
    (target.z<=ability.targetWideFraction||target.z>=1-ability.targetWideFraction))??null;
}
