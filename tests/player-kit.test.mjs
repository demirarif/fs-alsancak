import test from 'node:test';
import assert from 'node:assert/strict';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {resolveMatchCatalog} from '../src/v1/domain/match-players.ts';
import {playerVisualIdentity,playerKitMarkup} from '../src/v1/features/player-profile/player-kit.ts';

const catalog=getBundledCatalog();
const player=id=>{const found=catalog.players.find(p=>p.id===id);assert.ok(found,`Missing source player: ${id}`);return found;};

test('every explicitly requested supporter keeps the requested colours',()=>{
  const groups={fenerbahce:['m-emre','akin','ugur','kamil-reis','utku','goktug','arda-barin','ali-efe','hakan-goktug','alper','barkuz'],galatasaray:['baran','arif','eren','onur','servan','fuat'],trabzonspor:['taha']};
  for(const [club,ids] of Object.entries(groups))for(const id of ids){assert.equal(playerVisualIdentity(player(id)).club,club,id);assert.equal(playerVisualIdentity(player(id)).confirmed,true,id);}
  assert.equal(playerVisualIdentity(player('eren-emeksiz')).confirmed,false);
  assert.equal(playerVisualIdentity(player('talha')).confirmed,false);
});

test('placeholder assignment is stable across sorting and does not alter the catalog',()=>{
  const before=JSON.stringify(catalog);
  const identities=new Map(catalog.players.map(p=>[p.id,playerVisualIdentity(p)]));
  for(const p of [...catalog.players].reverse())assert.deepEqual(playerVisualIdentity(p),identities.get(p.id));
  assert.equal(JSON.stringify(catalog),before);
  assert.equal(playerVisualIdentity(player('yusuf')).confirmed,false);
});

test('Barkuz remains in Fenerbahçe colours in goalkeeper mode',()=>{
  const goalkeeper=resolveMatchCatalog(catalog,{barkuzGoalkeeper:true}).players.find(p=>p.id==='barkuz');
  assert.equal(goalkeeper.kind,'goalkeeper');
  assert.deepEqual(playerVisualIdentity(goalkeeper),playerVisualIdentity(player('barkuz')));
});

test('guest colours depend on their own identity, not a reference or mutable name',()=>{
  const origin={kind:'guest',referencePlayerId:'baran',referenceCatalogVersion:'test',scaling:{mode:'overall',overallPercent:95},createdAt:'2026-11-03',adaptation:'unfamiliar'};
  const guest={...player('baran'),id:'guest-kit-preview',name:'Test',origin};
  assert.equal(playerVisualIdentity(guest).confirmed,false);
  assert.deepEqual(playerVisualIdentity({...guest,name:'Another',origin:{...origin,referencePlayerId:'alper'}}),playerVisualIdentity(guest));
  assert.equal(playerVisualIdentity({...guest,id:'baran'}).confirmed,false);
});

test('inventory and modal illustrations have globally unique, resolved SVG definitions',()=>{
  const markup=[...catalog.players,...catalog.players].map(playerKitMarkup).join('');
  const ids=[...markup.matchAll(/\bid="([^"]+)"/gu)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  const defined=new Set(ids);
  for(const ref of markup.matchAll(/url\(#([^\)]+)\)/gu))assert.ok(defined.has(ref[1]),`Missing SVG definition: ${ref[1]}`);
  assert.equal([...markup.matchAll(/class="bp-shirt"/gu)].length,96);
});

test('untrusted guest names and IDs never enter shirt SVG markup',()=>{
  const injected='\"><image href=x onerror=alert(1) />';
  const markup=playerKitMarkup({...player('baran'),id:injected,name:injected});
  assert.ok(!markup.includes(injected));assert.ok(!markup.includes('<image'));assert.ok(!markup.includes('<text'));
  assert.match(markup,/göğüste yuvarlak Türk bayrağı/u);
  for(const id of ['__proto__','constructor','toString']){
    const identity=playerVisualIdentity({...player('baran'),id});
    assert.equal(identity.confirmed,false);assert.equal(identity.portraitUrl,undefined);
    assert.ok(playerKitMarkup({...player('baran'),id}).includes('class="bp-shirt"'));
  }
});
