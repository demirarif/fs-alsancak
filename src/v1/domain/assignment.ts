import type { PlayerCatalog } from './players.js';
import type { FormationId, Lineup, TeamSelection } from './teams.js';
import { FORMATIONS } from '../config/formations.ts';

/** Exact maximum-weight assignment, O(n²2ⁿ) for ten outfield players. */
export function assignFormation(team:TeamSelection,formationId:FormationId,catalog:PlayerCatalog):Lineup {
  const roster=team.playerIds.map(id=>catalog.players.find(p=>p.id===id)!);
  const keeper=roster.find(p=>p.kind==='goalkeeper');
  const players=roster.filter(p=>p.kind==='outfield').sort((a,b)=>a.id.localeCompare(b.id));
  const slots=FORMATIONS[formationId].slots.filter(s=>s.position!=='GK');
  if(!keeper||players.length!==10)throw new Error('Diziliş için bir kaleci ve on saha oyuncusu gerekli.');
  const size=1<<players.length,score=new Float64Array(size).fill(-Infinity),chosen=new Int16Array(size).fill(-1);score[0]=0;
  for(let mask=0;mask<size;mask++){
    let row=0;for(let bits=mask;bits;bits&=bits-1)row++;
    if(row===10)continue;const slot=slots[row]!;
    for(let j=0;j<10;j++)if(!(mask&(1<<j))){const p=players[j]!,next=mask|(1<<j);
      const value=score[mask]!+(p.kind==='outfield'?p.positionRatings[slot.position]:0);
      if(value>score[next]!+1e-8){score[next]=value;chosen[next]=j;}
    }
  }
  let mask=size-1;const assignments=[{slotId:'GK',playerId:keeper.id}];
  for(let row=9;row>=0;row--){const j=chosen[mask]!;assignments.push({slotId:slots[row]!.id,playerId:players[j]!.id});mask^=1<<j;}
  return {teamId:team.teamId,formationId,provenance:'suggested',assignments};
}
