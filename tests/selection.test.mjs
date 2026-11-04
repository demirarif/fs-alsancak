import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {createLocalCatalogRepository} from '../src/v1/data/local-catalog.ts';
import {createSelectionRepository} from '../src/v1/data/local-selection.ts';
import {createSelectionDraft,validateSelectionDraft} from '../src/v1/domain/selection.ts';
import {selectionService as service} from '../src/v1/application/selection-service.ts';
import {createGuestPlayerFactory} from '../src/v1/domain/guest-player.ts';

const catalog=getBundledCatalog(),empty=()=>createSelectionDraft('selection-test','2026-11-03');
function apply(draft,command,source=catalog){const result=service.apply(draft,command,source);assert.equal(result.ok,true,JSON.stringify(result));return result.value;}
function full(){let draft=empty();const keepers=catalog.players.filter(p=>p.kind==='goalkeeper'),outfield=catalog.players.filter(p=>p.kind==='outfield');
  for(let t=0;t<2;t++){draft=apply(draft,{kind:'activate-team',teamId:`team-${t+1}`});for(const p of [keepers[t],...outfield.slice(t*10,t*10+10)])draft=apply(draft,{kind:'add-player',playerId:p.id});}return draft;
}
test('selection is immutable, click commands target only the active team',()=>{
  const initial=empty(),blue=apply(initial,{kind:'add-player',playerId:'baran'}),red=apply(blue,{kind:'activate-team',teamId:'team-2'}),added=apply(red,{kind:'add-player',playerId:'eren'});
  assert.deepEqual(initial.teams[0].playerIds,[]);assert.deepEqual(added.teams.map(t=>t.playerIds),[['baran'],['eren']]);
  assert.equal(added.revision,3);assert.ok(Object.isFrozen(added.teams[0].playerIds));assert.equal(apply(added,{kind:'activate-team',teamId:'team-2'}),added);
});
test('a player cannot join both teams and removal never silently transfers',()=>{
  let d=apply(empty(),{kind:'add-player',playerId:'baran'});d=apply(d,{kind:'activate-team',teamId:'team-2'});
  assert.equal(service.apply(d,{kind:'add-player',playerId:'baran'},catalog).problems[0].code,'ALREADY_ASSIGNED');
  d=apply(d,{kind:'remove-player',teamId:'team-1',playerId:'baran'});d=apply(d,{kind:'add-player',playerId:'baran'});
  assert.deepEqual(d.teams.map(t=>t.playerIds),[[],['baran']]);
});
test('capacity is 11 without replacing anyone',()=>{
  const d=full(),original=structuredClone(d),unused=catalog.players.find(p=>!d.teams.some(t=>t.playerIds.includes(p.id)));
  assert.equal(service.apply(d,{kind:'add-player',playerId:unused.id},catalog).problems[0].code,'TEAM_FULL');assert.deepEqual(d,original);
});
test('clearing one team preserves the opponent and all source players',()=>{
  const d=full(),next=apply(d,{kind:'clear-team',teamId:'team-1'});
  assert.deepEqual(next.teams[0].playerIds,[]);assert.deepEqual(next.teams[1],d.teams[1]);assert.equal(next.revision,d.revision+1);
  assert.equal(service.validateForLineups(next,catalog).ok,false);assert.equal(catalog.players.length,48);
});
test('one actual goalkeeper per team; an outfield role does not make a goalkeeper',()=>{
  const keepers=catalog.players.filter(p=>p.kind==='goalkeeper');let d=apply(empty(),{kind:'add-player',playerId:keepers[0].id});
  assert.equal(service.apply(d,{kind:'add-player',playerId:keepers[1].id},catalog).problems[0].code,'GOALKEEPER_FULL');
  d=apply(d,{kind:'remove-player',teamId:'team-1',playerId:keepers[0].id});d=apply(d,{kind:'add-player',playerId:'barkuz'});
  assert.ok(service.validateForLineups(d,catalog).problems.some(p=>p.code==='GOALKEEPER_REQUIRED'));
});
test('both full valid teams pass, incomplete and archived players block readiness',()=>{
  const d=full();assert.equal(service.validateForLineups(d,catalog).ok,true);
  assert.equal(service.validateForLineups(empty(),catalog).ok,false);
  const id=d.teams[0].playerIds[1],changed={...catalog,players:catalog.players.map(p=>p.id===id?{...p,archived:true}:p)};
  assert.ok(service.validateForLineups(d,changed).problems.some(p=>p.code==='PLAYER_UNAVAILABLE'));
  assert.equal(service.apply(empty(),{kind:'add-player',playerId:id},changed).ok,false);
});
test('guest joins by its own ID, keeps adaptation metadata and reference remains selectable',()=>{
  const result=createGuestPlayerFactory({createId:()=> 'guest-selection',now:()=> '2026-11-03T00:00:00Z'}).create({kind:'outfield',name:'Konuk',referencePlayerId:'baran',scaling:{mode:'overall',overallPercent:95}},catalog);
  assert.equal(result.ok,true);const source={...catalog,players:[...catalog.players,result.value]};
  let d=apply(empty(),{kind:'add-player',playerId:result.value.id},source);d=apply(d,{kind:'add-player',playerId:'baran'},source);
  assert.equal(d.teams[0].playerIds.length,2);assert.equal(result.value.origin.adaptation,'unfamiliar');
});
test('persisted data rejects duplicate IDs, extra teams and oversized lists',()=>{
  const d=structuredClone(empty());d.teams[0].playerIds=['baran'];d.teams[1].playerIds=['baran'];assert.equal(validateSelectionDraft(d).ok,false);
  assert.equal(validateSelectionDraft({...empty(),teams:[]}).ok,false);
  assert.equal(validateSelectionDraft({...empty(),revision:-1}).ok,false);
  assert.equal(validateSelectionDraft({...empty(),teams:[{...empty().teams[0],playerIds:Array.from({length:12},(_,i)=>`p${i}`)},empty().teams[1]]}).ok,false);
});
test('draft survives repository reopening alongside saved guest players',async()=>{
  const options={indexedDB:new IDBFactory(),databaseName:'selection-coexist'},repo=createSelectionRepository(options),guests=createLocalCatalogRepository(catalog,options);
  const guest=createGuestPlayerFactory({createId:()=> 'guest-coexist',now:()=> '2026-11-03T00:00:00Z'}).create({kind:'outfield',name:'Konuk',referencePlayerId:'baran',scaling:{mode:'overall',overallPercent:95}},catalog).value;
  assert.equal((await guests.saveGuest(guest)).ok,true);assert.equal((await repo.saveSelection(empty())).ok,true);
  const d=apply(empty(),{kind:'add-player',playerId:guest.id},{...catalog,players:[...catalog.players,guest]});assert.equal((await repo.saveSelection(d)).ok,true);repo.close();
  const reopened=createSelectionRepository(options);assert.deepEqual((await reopened.loadSelection()).value,d);assert.ok((await guests.load()).value.players.some(p=>p.id===guest.id));reopened.close();guests.close();
});
test('rapid ordered commands persist every revision, including active team',async()=>{
  const repo=createSelectionRepository({indexedDB:new IDBFactory(),databaseName:'selection-rapid'});let d=empty();assert.equal((await repo.saveSelection(d)).ok,true);
  const snapshots=[];for(const p of catalog.players.filter(p=>p.kind==='outfield').slice(0,10)){d=apply(d,{kind:'add-player',playerId:p.id});snapshots.push(d);}
  d=apply(d,{kind:'activate-team',teamId:'team-2'});snapshots.push(d);
  for(const snapshot of snapshots)assert.equal((await repo.saveSelection(snapshot)).ok,true);
  assert.deepEqual((await repo.loadSelection()).value,d);assert.equal((await repo.saveSelection(d)).ok,true);repo.close();
});
test('another tab cannot overwrite a newer revision or reset the active draft',async()=>{
  const options={indexedDB:new IDBFactory(),databaseName:'selection-conflict'},a=createSelectionRepository(options),b=createSelectionRepository(options);
  await a.saveSelection(empty());const base=(await b.loadSelection()).value;
  const d=apply(base,{kind:'add-player',playerId:'baran'});await a.saveSelection(d);
  assert.equal((await b.saveSelection(apply(base,{kind:'add-player',playerId:'eren'}))).problems[0].code,'SELECTION_CONFLICT');
  assert.equal((await b.saveSelection(createSelectionDraft('other-id','2026-11-03'))).ok,false);
  assert.deepEqual((await b.loadSelection()).value,d);a.close();b.close();
});
test('corrupt persisted draft is preserved and cannot be overwritten',async()=>{
  const indexedDB=new IDBFactory(),repo=createSelectionRepository({indexedDB,databaseName:'selection-corrupt'});await repo.saveSelection(empty());
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('selection-corrupt',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise(resolve=>{const tx=db.transaction('selection-drafts','readwrite');tx.objectStore('selection-drafts').put({...empty(),teams:[]});tx.oncomplete=resolve;});
  assert.equal((await repo.loadSelection()).problems[0].code,'INVALID_SELECTION');assert.equal((await repo.saveSelection(empty())).ok,false);db.close();repo.close();
});
