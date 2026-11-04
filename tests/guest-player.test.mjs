import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {createGuestPlayerFactory} from '../src/v1/domain/guest-player.ts';
import {createLocalCatalogRepository} from '../src/v1/data/local-catalog.ts';
import {createCatalogIndex} from '../src/v1/data/catalog-index.ts';
import {buildPlayerProfile} from '../src/v1/features/player-profile/model.ts';
import {playerProfileMarkup} from '../src/v1/features/player-profile/view.ts';
import {attributeOnTwenty,gradeClass,roleOnTwenty,roleStarUnits} from '../src/v1/features/player-profile/presentation.ts';
import {validatePlayerCatalog} from '../src/v1/data/catalog-validation.ts';
import {STORAGE_STORES} from '../src/v1/data/persistence.ts';

const seed=getBundledCatalog(),baran=seed.players.find(p=>p.id==='baran');
let serial=0;
const factory=createGuestPlayerFactory({createId:()=>`guest-test-${++serial}`,now:()=> '2026-11-03T09:00:00.000Z'});
const request=(overrides={})=>({kind:'outfield',name:'Deniz',referencePlayerId:'baran',scaling:{mode:'overall',overallPercent:95},...overrides});
function guest(overrides={}){const result=factory.create(request(overrides),seed);assert.equal(result.ok,true,JSON.stringify(result));return result.value;}
function repository(){const indexedDB=new IDBFactory();return {indexedDB,repo:createLocalCatalogRepository(seed,{indexedDB,databaseName:'test-alsancak'})};}

test('95% reference produces a separate two-decimal player without copied chemistry',()=>{
  const player=guest();
  assert.notEqual(player.id,baran.id);assert.equal(player.origin.kind,'guest');
  assert.equal(player.attributes.passing,8.08);assert.equal(player.attributes.speed,7.13);
  assert.equal(player.attributes.finishing,3.8);
  assert.deepEqual(player.suitability,baran.suitability);assert.deepEqual(player.preferredPositions,baran.preferredPositions);
  assert.equal(player.mainPosition,'CM');assert.deepEqual(player.notes,[]);
  assert.equal(player.origin.referenceCatalogVersion,seed.version);assert.equal(player.origin.adaptation,'unfamiliar');
  assert.notEqual(player.positionRatings.CM,Math.round(baran.positionRatings.CM*.95*100)/100);
  assert.equal(validatePlayerCatalog({...seed,players:[player]}).ok,true);
  assert.equal(baran.attributes.passing,8.5);assert.ok(baran.notes.length>0);
});

test('split controls cover physical and all nine remaining attributes',()=>{
  const player=guest({scaling:{mode:'split',physicalPercent:80,gamePercent:110}});
  assert.equal(player.attributes.speed,6);assert.equal(player.attributes.stamina,6.8);assert.equal(player.attributes.strength,5.6);
  assert.equal(player.attributes.passing,9.35);assert.equal(player.attributes.vision,8.8);
  assert.equal(player.attributes.control,8.8);assert.equal(player.attributes.dribbling,7.7);
  assert.equal(player.attributes.shooting,7.15);assert.equal(player.attributes.finishing,4.4);
  assert.equal(player.attributes.defending,9.35);assert.equal(player.attributes.pressing,8.25);assert.equal(player.attributes.positioning,9.35);
});

test('percentage limits and attribute caps keep extremes inside the data model',()=>{
  const high=guest({referencePlayerId:'taha',scaling:{mode:'overall',overallPercent:120}});
  const low=guest({referencePlayerId:'akin',scaling:{mode:'overall',overallPercent:60}});
  assert.equal(high.attributes.speed,10);assert.equal(high.attributes.strength,9.6);assert.equal(low.attributes.speed,1);
  for(const p of [high,low])assert.ok(Object.values(p.attributes).every(value=>value>=1&&value<=10));
  for(const percent of [59,121,95.5,NaN])assert.equal(factory.create(request({scaling:{mode:'overall',overallPercent:percent}}),seed).ok,false);
});

test('goalkeeper templates only scale their actual goalkeeper rating',()=>{
  const r=factory.create({kind:'goalkeeper',name:'Misafir kaleci',referencePlayerId:'kiyan',scaling:{mode:'overall',overallPercent:95}},seed);
  assert.equal(r.ok,true);assert.equal(r.value.goalkeeperRating,78.38);assert.equal('attributes' in r.value,false);assert.equal('positionRatings' in r.value,false);
  assert.equal(factory.create({kind:'goalkeeper',name:'Kaleci',referencePlayerId:'kiyan',scaling:{mode:'split',physicalPercent:95,gamePercent:95}},seed).ok,false);
  assert.equal(factory.create(request({referencePlayerId:'kiyan'}),seed).ok,false);
});

test('preview does not allocate an identity or depend on a clock',()=>{
  const f=createGuestPlayerFactory({createId:()=>{throw new Error('preview ID allocated');},now:()=>{throw new Error('preview read clock');}});
  const a=f.preview(request({name:''}),seed),b=f.preview(request({name:''}),seed);
  assert.equal(a.ok,true);assert.deepEqual(a,b);assert.equal(a.value.name,'Yeni oyuncu');
  assert.ok(a.value.id.startsWith('preview-'));
});

test('missing names, archived/missing templates and bad identities are rejected',()=>{
  for(const name of ['', 'a', 'a'.repeat(41), 'Ad\nSoyad'])assert.equal(factory.create(request({name}),seed).ok,false);
  assert.equal(factory.create(request({referencePlayerId:'absent'}),seed).ok,false);
  const changed=structuredClone(seed);changed.players.find(p=>p.id==='baran').archived=true;
  assert.equal(factory.create(request(),changed).ok,false);
  assert.equal(createGuestPlayerFactory({createId:()=> 'baran'}).create(request(),seed).ok,false);
  assert.equal(guest({name:'  Deniz   Yılmaz  '}).name,'Deniz Yılmaz');
});

test('profiles contain twelve base values and distinguish pending guest adaptation',()=>{
  const regular=buildPlayerProfile(baran,seed),player=guest(),profile=buildPlayerProfile(player,seed);
  assert.equal(Object.values(profile.sections).flat().length,12);
  assert.ok(Object.values(profile.sections).flat().every(row=>row.effective===null));
  assert.equal(profile.weeklyForm,null);assert.deepEqual(profile.activeModifiers,[]);
  assert.ok(profile.chemistry.every(note=>note.origin==='derived'));
  assert.ok(regular.chemistry.some(note=>note.origin==='source'));
  assert.equal(buildPlayerProfile(seed.players.find(p=>p.id==='kiyan'),seed).sections,null);
});

test('player and source text are escaped in profile markup',()=>{
  const player=guest({name:'<img src=x onerror=alert(1)>'});
  const markup=playerProfileMarkup(player,seed);
  assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.equal(markup.includes('<img'),false);
});

test('profile uses integer 20-point values and role stars without altering stored precision',()=>{
  const before=JSON.stringify(seed);
  assert.equal(attributeOnTwenty(8.08),16);assert.equal(attributeOnTwenty(3.8),8);
  assert.equal(attributeOnTwenty(10),20);assert.equal(roleOnTwenty(76.63),15);
  assert.equal(gradeClass(16),'stat-strong');assert.equal(gradeClass(15),'stat-medium');assert.equal(gradeClass(9),'stat-weak');
  assert.equal(roleStarUnits(87.47),9);assert.equal(roleStarUnits(76.63),8);
  for(const player of seed.players){
    const markup=playerProfileMarkup(player,seed);
    assert.equal(markup.includes('attribute-track'),false);
    assert.equal(markup.includes('class="profile-rating"'),false);assert.ok(markup.includes('role-stars'));
    const values=[...markup.matchAll(/class="attribute-row[^>]+>.*?<strong>(\d+)<\/strong>/gu)].map(match=>Number(match[1]));
    assert.equal(values.length,player.kind==='outfield'?12:0);assert.ok(values.every(value=>Number.isInteger(value)&&value>=1&&value<=20));
  }
  assert.equal(JSON.stringify(seed),before);assert.equal(baran.attributes.passing,8.5);assert.equal(baran.positionRatings.CM,80.23);
});

test('initial migration creates the declared stores and loads the seed',async()=>{
  const {indexedDB,repo}=repository();const result=await repo.load();assert.equal(result.ok,true);assert.equal(result.value.players.length,48);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('test-alsancak',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  assert.deepEqual([...db.objectStoreNames].sort(),[...STORAGE_STORES].sort());db.close();repo.close();
});

test('committed guests survive reopening the repository and retain provenance',async()=>{
  const {indexedDB,repo}=repository(),player=guest();assert.equal((await repo.saveGuest(player)).ok,true);repo.close();
  const reopened=createLocalCatalogRepository(seed,{indexedDB,databaseName:'test-alsancak'}),loaded=await reopened.load();
  assert.equal(loaded.ok,true);assert.equal(loaded.value.players.length,49);
  assert.deepEqual(loaded.value.players.find(p=>p.id===player.id),player);assert.ok(loaded.value.version.endsWith('+local-1'));
  assert.ok(Object.isFrozen(loaded.value.players.find(p=>p.id===player.id).attributes));reopened.close();
});

test('duplicate inserts abort without overwriting data or incrementing the revision',async()=>{
  const {repo}=repository(),player=guest();assert.equal((await repo.saveGuest(player)).ok,true);
  const duplicate=await repo.saveGuest({...player,name:'Başka isim'});assert.equal(duplicate.ok,false);assert.equal(duplicate.problems[0].code,'GUEST_EXISTS');
  const loaded=await repo.load();assert.equal(loaded.value.players.length,49);assert.ok(loaded.value.version.endsWith('+local-1'));
  assert.equal(loaded.value.players.find(p=>p.id===player.id).name,'Deniz');repo.close();
});

test('concurrent inserts keep both players and serialize the revision atomically',async()=>{
  const {repo}=repository(),a=guest(),b=guest({name:'Deniz 2'});
  const results=await Promise.all([repo.saveGuest(a),repo.saveGuest(b)]);assert.ok(results.every(r=>r.ok));
  const loaded=await repo.load();assert.equal(loaded.value.players.length,50);assert.ok(loaded.value.version.endsWith('+local-2'));repo.close();
});

test('source records and preview identities cannot be written as guests',async()=>{
  const {repo}=repository();assert.equal((await repo.saveGuest(baran)).ok,false);
  const preview=factory.preview(request(),seed).value;assert.equal((await repo.saveGuest(preview)).ok,false);
  assert.equal((await repo.archiveGuest('baran')).ok,false);assert.equal((await repo.load()).value.players.length,48);repo.close();
});

test('invalid guest names and fractional percentages cannot bypass the factory at persistence',async()=>{
  const {repo}=repository(),player=guest();
  assert.equal((await repo.saveGuest({...player,name:'a'})).ok,false);
  assert.equal((await repo.saveGuest({...player,origin:{...player.origin,scaling:{mode:'overall',overallPercent:95.5}}})).ok,false);
  assert.equal((await repo.load()).value.players.length,48);repo.close();
});

test('archiving retains the record but removes it from active searches',async()=>{
  const {repo}=repository(),player=guest();await repo.saveGuest(player);assert.equal((await repo.archiveGuest(player.id)).ok,true);
  const loaded=await repo.load();assert.equal(loaded.value.players.length,49);assert.ok(loaded.value.players.find(p=>p.id===player.id).archived);
  assert.equal(createCatalogIndex(loaded.value).search().length,48);assert.ok(loaded.value.version.endsWith('+local-2'));
  await repo.archiveGuest(player.id);assert.ok((await repo.load()).value.version.endsWith('+local-2'));repo.close();
});

test('corrupt local data is reported rather than dropped or silently replaced',async()=>{
  const {indexedDB,repo}=repository(),player=guest();await repo.saveGuest(player);
  const db=await new Promise(resolve=>{const r=indexedDB.open('test-alsancak',1);r.onsuccess=()=>resolve(r.result);});
  const corrupt=structuredClone(player);delete corrupt.attributes.passing;
  await new Promise((resolve,reject)=>{const tx=db.transaction('guest-players','readwrite');tx.objectStore('guest-players').put(corrupt);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const loaded=await repo.load();assert.equal(loaded.ok,false);assert.equal(loaded.problems[0].code,'CORRUPT_LOCAL_CATALOG');db.close();repo.close();
});

test('denied storage yields an explicit failure without a memory-only success',async()=>{
  const repo=createLocalCatalogRepository(seed,{indexedDB:{open(){throw new DOMException('Denied','SecurityError');}}});
  assert.equal((await repo.load()).ok,false);assert.equal((await repo.saveGuest(guest())).ok,false);repo.close();
});
