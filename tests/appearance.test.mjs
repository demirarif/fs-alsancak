import test from 'node:test';
import assert from 'node:assert/strict';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {appearanceFor,assignAppearances,SKIN_TONES,BOOT_COLORS,HAIR_COLORS} from '../src/v1/config/appearance.ts';

const ids=getBundledCatalog().players.map(p=>p.id);
test('Mamadou is Black; nobody else gets that tone',()=>{
  assert.equal(appearanceFor('mamadou').skinId,'siyahi');assert.equal(assignAppearances(ids).get('mamadou').skinId,'siyahi');
  for(const id of ids.filter(id=>id!=='mamadou'))assert.ok(SKIN_TONES.some(t=>t.id===assignAppearances(ids).get(id).skinId),id);
});
test('the other 47 players are spread evenly from fair to dark olive',()=>{
  const counts=new Map(SKIN_TONES.map(t=>[t.id,0]));for(const [id,a] of assignAppearances(ids))if(id!=='mamadou')counts.set(a.skinId,counts.get(a.skinId)+1);
  const values=[...counts.values()];assert.equal(values.reduce((a,b)=>a+b,0),47);assert.ok(Math.max(...values)-Math.min(...values)<=1,JSON.stringify([...counts]));
  const eleven=assignAppearances(ids.slice(0,22)),tones=new Set([...eleven.values()].map(a=>a.skinId));assert.ok(tones.size>=5,'a 22-player match shows the whole range');
});
test('looks are stable per player and valid for guests',()=>{
  assert.deepEqual(appearanceFor('baran'),appearanceFor('baran'));assert.deepEqual(assignAppearances(ids).get('eren'),assignAppearances([...ids].reverse()).get('eren'));
  const guest=appearanceFor('guest-1234');assert.ok(SKIN_TONES.some(t=>t.color===guest.skin));assert.ok(BOOT_COLORS.includes(guest.boots));assert.ok(HAIR_COLORS.includes(guest.hair));
  assert.ok(new Set(ids.map(id=>appearanceFor(id).boots)).size>=5,'boots vary across the squad');
});
test('hair: some long, some short, stable per player and pinnable for samples',()=>{
  const styles=ids.map(id=>appearanceFor(id).hairStyle),count=s=>styles.filter(x=>x===s).length;
  for(const s of ['long','short','medium','buzz'])assert.ok(count(s)>=3,`${s}: ${count(s)}`);
  assert.equal(appearanceFor('baran').hairStyle,appearanceFor('baran').hairStyle);assert.equal(appearanceFor('x',{hairStyle:'long'}).hairStyle,'long');
  assert.equal(assignAppearances(ids).get('eren').hairStyle,appearanceFor('eren').hairStyle,'skin balancing never changes hair');
});
