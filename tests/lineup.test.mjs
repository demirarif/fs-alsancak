import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {createSelectionRepository} from '../src/v1/data/local-selection.ts';
import {createLineupRepository} from '../src/v1/data/local-lineups.ts';
import {createSelectionDraft,validateSelectionDraft} from '../src/v1/domain/selection.ts';
import {selectionService} from '../src/v1/application/selection-service.ts';
import {lineupService} from '../src/v1/application/lineup-service.ts';
import {optimizeLineups} from '../src/v1/application/lineup-optimizer.ts';
import {assignFormation} from '../src/v1/domain/assignment.ts';
import {makeLineupDraft,rebaseLineupDraft,validateLineups,validateLineupShape} from '../src/v1/domain/lineups.ts';
import {assessLineups,evaluationScore} from '../src/v1/domain/lineup-evaluation.ts';
import {resolveMatchCatalog,BARKUZ_DISTRIBUTION} from '../src/v1/domain/match-players.ts';
import {keeperDistributionAbility} from '../src/v1/engine/keeper-distribution.ts';
import {createGuestPlayerFactory} from '../src/v1/domain/guest-player.ts';
import {CHEMISTRY_RULEBOOK} from '../src/v1/config/chemistry-rulebook.ts';
import {FORMATIONS} from '../src/v1/config/formations.ts';
import {GUEST_POLICY} from '../src/v1/config/defaults.ts';

const catalog=getBundledCatalog();
// 4-2-3-1 slot order: GK, LB, LCB, RCB, RB, LDM, RDM, LW, CAM, RW, ST.
const SAFE_BLUE=['kiyan','yigit-cetinkaya','berkin','m-emre','batu','arif','baran','kamil-reis','suleyman','alper','barkuz'];
const SAFE_RED=['sahin','eren-emeksiz','eto','oguz','fuat','caca','mamadou','emir','eren','mensur','ismail'];
const CORE_BLUE=['kiyan','onur','omer','m-emre','batu','baran','arif','alper','eren','taha','goktug'];
const CORE_RED=['sahin','yigit-cetinkaya','tevfik','utku','eren-emeksiz','mamadou','caca','emir','melih','mensur','servan'];

function ok(result){assert.equal(result.ok,true,JSON.stringify(result.problems??result));return result.value;}
function selectionOf(blue,red,{barkuzGoalkeeper=false,source=catalog}={}){
  let d=createSelectionDraft('lineup-test','2026-11-03');const history=[d];const step=command=>{d=ok(selectionService.apply(d,command,source));if(d!==history.at(-1))history.push(d);};
  [blue,red].forEach((ids,i)=>{step({kind:'activate-team',teamId:`team-${i+1}`});ids.forEach(playerId=>step({kind:'add-player',playerId}));});
  if(barkuzGoalkeeper)step({kind:'set-barkuz-goalkeeper',enabled:true});
  return {selection:d,history};
}
const contextOf=(selection,source=catalog)=>({selection,catalog:source,rulebook:CHEMISTRY_RULEBOOK,forms:[]});
const lineupOf=(teamId,ids,formationId='4-2-3-1')=>({teamId,formationId,provenance:'manual',assignments:FORMATIONS[formationId].slots.map((slot,i)=>({slotId:slot.id,playerId:ids[i]}))});
function scenario(blue,red,options){const {selection,history}=selectionOf(blue,red,options),context=contextOf(selection,options?.source);
  const draft=makeLineupDraft(selection,[lineupOf('team-1',blue),lineupOf('team-2',red)]);ok(validateLineups(draft,context));return {selection,history,context,draft,assessment:assessLineups(draft,context)};}
const ruleIds=assessment=>new Set(assessment.applied.map(a=>a.ruleId));
const value=(assessment,id,attribute)=>assessment.effective[id].values[attribute];

// --- Barkuz goalkeeper mode ---------------------------------------------------
test('Barkuz keeper mode uses Yusuf goalkeeping, keeps Barkuz identity and leaves the source forward intact',()=>{
  const source=catalog.players.find(p=>p.id==='barkuz'),before=structuredClone(source),yusuf=catalog.players.find(p=>p.id==='yusuf');
  const resolved=resolveMatchCatalog(catalog,{barkuzGoalkeeper:true}),keeper=resolved.players.find(p=>p.id==='barkuz');
  assert.equal(keeper.kind,'goalkeeper');assert.equal(keeper.goalkeeperRating,yusuf.goalkeeperRating);assert.equal(keeper.goalkeeperReferenceId,'yusuf');
  assert.deepEqual(keeper.specialAbilities.map(a=>a.id),['accurate-long-wide-distribution']);assert.equal(keeper.name,'Barkuz');
  assert.notEqual(resolved.version,catalog.version);assert.equal(resolveMatchCatalog(catalog,{barkuzGoalkeeper:false}),catalog);
  assert.deepEqual(catalog.players.find(p=>p.id==='barkuz'),before);assert.equal(source.kind,'outfield');assert.equal(source.mainPosition,'ST');
  assert.equal(resolved.players.filter(p=>p.kind==='goalkeeper').length,6);assert.equal(resolved.players.find(p=>p.id==='yusuf').goalkeeperRating,yusuf.goalkeeperRating);
});
test('Barkuz toggle is a revisioned command, old drafts default to off and persist across reopen',async()=>{
  const base=createSelectionDraft('barkuz-toggle','2026-11-03');assert.equal(base.barkuzGoalkeeper,undefined);assert.equal(validateSelectionDraft(base).ok,true);
  const on=ok(selectionService.apply(base,{kind:'set-barkuz-goalkeeper',enabled:true},catalog));assert.equal(on.revision,1);assert.equal(on.barkuzGoalkeeper,true);
  assert.equal(ok(selectionService.apply(on,{kind:'set-barkuz-goalkeeper',enabled:true},catalog)),on);
  assert.equal(validateSelectionDraft({...base,barkuzGoalkeeper:'yes'}).ok,false);
  const options={indexedDB:new IDBFactory(),databaseName:'barkuz-toggle'},repo=createSelectionRepository(options);
  ok(await repo.saveSelection(base));ok(await repo.saveSelection(on));repo.close();
  const reopened=createSelectionRepository(options);assert.equal(ok(await reopened.loadSelection()).barkuzGoalkeeper,true);reopened.close();
});
test('Barkuz cannot become a second keeper; the other keeper is never removed silently',()=>{
  let d=createSelectionDraft('barkuz-two','2026-11-03');for(const playerId of ['kiyan','barkuz'])d=ok(selectionService.apply(d,{kind:'add-player',playerId},catalog));
  const blocked=selectionService.apply(d,{kind:'set-barkuz-goalkeeper',enabled:true},catalog);
  assert.equal(blocked.problems[0].code,'GOALKEEPER_FULL');assert.deepEqual(d.teams[0].playerIds,['kiyan','barkuz']);
  d=ok(selectionService.apply(d,{kind:'remove-player',teamId:'team-1',playerId:'kiyan'},catalog));d=ok(selectionService.apply(d,{kind:'set-barkuz-goalkeeper',enabled:true},catalog));
  assert.equal(selectionService.apply(d,{kind:'add-player',playerId:'kiyan'},catalog).problems[0].code,'GOALKEEPER_FULL');
  const {selection}=selectionOf(['barkuz',...SAFE_BLUE.slice(1,-1),'mali'],SAFE_RED,{barkuzGoalkeeper:true});ok(selectionService.validateForLineups(selection,catalog));
  assert.ok(selectionService.validateForLineups({...selection,barkuzGoalkeeper:false},catalog).problems.some(p=>p.code==='GOALKEEPER_REQUIRED'));
});
test('long wide distribution only targets wings beyond halfway from at least 30 m',()=>{
  const keeper=resolveMatchCatalog(catalog,{barkuzGoalkeeper:true}).players.find(p=>p.id==='barkuz'),yusuf=catalog.players.find(p=>p.id==='yusuf');
  const at=(x,z,d)=>keeperDistributionAbility(keeper,{x,z},d)?.id??null;
  assert.equal(at(.7,.2,35),BARKUZ_DISTRIBUTION.id);assert.equal(at(.7,.8,30),BARKUZ_DISTRIBUTION.id);assert.equal(at(.51,.25,40),BARKUZ_DISTRIBUTION.id);assert.equal(at(.51,.75,40),BARKUZ_DISTRIBUTION.id);
  assert.equal(at(.7,.2,29.9),null);assert.equal(at(.5,.2,40),null);assert.equal(at(.4,.1,40),null);assert.equal(at(.8,.5,40),null);assert.equal(at(.8,.26,40),null);assert.equal(at(.8,.74,40),null);
  assert.equal(keeperDistributionAbility(yusuf,{x:.7,z:.1},40),null);assert.equal(keeperDistributionAbility(catalog.players.find(p=>p.id==='barkuz'),{x:.7,z:.1},40),null);
});
test('Arif-Barkuz still lowers Barkuz keeper distribution, never his goalkeeping rating',()=>{
  const blue=['barkuz','yigit-cetinkaya','berkin','m-emre','batu','arif','baran','kamil-reis','suleyman','alper','mali'];
  const {assessment,context}=scenario(blue,SAFE_RED,{barkuzGoalkeeper:true}),keeper=assessment.keeperDistribution.barkuz;
  assert.deepEqual(keeper.base,{passing:BARKUZ_DISTRIBUTION.passing,vision:BARKUZ_DISTRIBUTION.vision});assert.deepEqual(keeper.values,{passing:8.5,vision:8});
  assert.ok(keeper.applied.every(a=>a.ruleId==='arif-barkuz'));assert.equal(value(assessment,'arif','passing'),7);
  assert.equal(resolveMatchCatalog(context.catalog,context.selection).players.find(p=>p.id==='barkuz').goalkeeperRating,catalog.players.find(p=>p.id==='yusuf').goalkeeperRating);
  const note=assessment.evaluation.teams[0].warnings.find(w=>w.text.startsWith('Barkuz kalede'));
  assert.ok(note.text.includes('Arif aynı takımda olduğu için uzun pas isabeti biraz düşer'));assert.doesNotMatch(note.text,/\d/,'no raw numbers in the note');
  const withoutArif=scenario([...blue.slice(0,5),'mamadou',...blue.slice(6)],SAFE_RED.map(id=>id==='mamadou'?'arda-barin':id),{barkuzGoalkeeper:true}).assessment;
  assert.deepEqual(withoutArif.keeperDistribution.barkuz.values,{passing:9,vision:8.5});
  assert.ok(!withoutArif.evaluation.teams[0].warnings.find(w=>w.text.startsWith('Barkuz kalede')).text.includes('Arif'));
});
test('lineups keep Barkuz in goal only while keeper mode is on',()=>{
  const blue=['barkuz',...SAFE_BLUE.slice(1,-1),'mali'],{selection,context}=scenario(blue,SAFE_RED,{barkuzGoalkeeper:true});
  const outfield=makeLineupDraft(selection,[lineupOf('team-1',['mali',...blue.slice(1,-1),'barkuz']),lineupOf('team-2',SAFE_RED)]);
  assert.equal(validateLineups(outfield,context).problems[0].code,'KEEPER_SLOT');
  const optimized=ok(optimizeLineups({runId:'barkuz-run',selectionRevision:selection.revision,context,formations:Object.keys(FORMATIONS)}));
  for(const s of optimized.suggestions['team-1'])assert.equal(s.lineup.assignments.find(a=>a.slotId==='GK').playerId,'barkuz');
});

// --- Assignment, optimizer and tactics commands ------------------------------
test('every formation gets eleven unique slots with the real keeper fixed in goal',()=>{
  const {selection}=selectionOf(SAFE_BLUE,SAFE_RED);
  for(const formationId of Object.keys(FORMATIONS))for(const team of selection.teams){
    const lineup=assignFormation(team,formationId,catalog),slots=lineup.assignments.map(a=>a.slotId),players=lineup.assignments.map(a=>a.playerId);
    assert.equal(lineup.formationId,formationId);assert.equal(new Set(slots).size,11);assert.deepEqual([...slots].sort(),FORMATIONS[formationId].slots.map(s=>s.id).sort());
    assert.deepEqual([...players].sort(),[...team.playerIds].sort());assert.equal(catalog.players.find(p=>p.id===lineup.assignments.find(a=>a.slotId==='GK').playerId).kind,'goalkeeper');
  }
});
test('role assignment is the exact maximum, checked against all 10! permutations',()=>{
  const {selection}=selectionOf(SAFE_BLUE,SAFE_RED),team=selection.teams[1],formation=FORMATIONS['4-4-2'],slots=formation.slots.filter(s=>s.position!=='GK');
  const players=team.playerIds.map(id=>catalog.players.find(p=>p.id===id)).filter(p=>p.kind==='outfield'),used=new Array(10).fill(false);let best=-Infinity;
  (function go(i,sum){if(i===10){if(sum>best)best=sum;return;}for(let j=0;j<10;j++)if(!used[j]){used[j]=true;go(i+1,sum+players[j].positionRatings[slots[i].position]);used[j]=false;}})(0,0);
  const lineup=assignFormation(team,'4-4-2',catalog),total=lineup.assignments.filter(a=>a.slotId!=='GK').reduce((s,a)=>s+catalog.players.find(p=>p.id===a.playerId).positionRatings[formation.slots.find(x=>x.id===a.slotId).position],0);
  assert.ok(Math.abs(total-best)<1e-9,`${total} != ${best}`);
});
test('optimizer echoes run and revision, returns five valid sorted suggestions per team',()=>{
  const {selection,context}=scenario(SAFE_BLUE,SAFE_RED),result=ok(optimizeLineups({runId:'run-7',selectionRevision:selection.revision,context,formations:Object.keys(FORMATIONS)}));
  assert.equal(result.runId,'run-7');assert.equal(result.selectionRevision,selection.revision);ok(validateLineups(result.initialDraft,context));
  for(const teamId of ['team-1','team-2']){const list=result.suggestions[teamId];
    assert.equal(list.length,5);assert.deepEqual(new Set(list.map(s=>s.lineup.formationId)),new Set(Object.keys(FORMATIONS)));
    for(let i=1;i<list.length;i++)assert.ok(evaluationScore(list[i-1].evaluation)>=evaluationScore(list[i].evaluation));
    for(const s of list){assert.equal(s.lineup.teamId,teamId);ok(validateLineups(makeLineupDraft(selection,teamId==='team-1'?[s.lineup,result.initialDraft.lineups[1]]:[result.initialDraft.lineups[0],s.lineup]),context));}
  }
  const incomplete=selectionOf(SAFE_BLUE.slice(0,10),SAFE_RED).selection;
  assert.equal(optimizeLineups({runId:'x',selectionRevision:incomplete.revision,context:contextOf(incomplete),formations:['4-4-2']}).ok,false);
});
test('tactics commands keep rosters, block keeper swaps and update both evaluations',()=>{
  const {context,draft}=scenario(SAFE_BLUE,SAFE_RED),before=lineupService.evaluate(draft,context);
  const swapped=ok(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-1',firstSlot:'ST',secondSlot:'LB'},context));
  assert.equal(swapped.revision,draft.revision+1);assert.equal(swapped.lineups[0].assignments.find(a=>a.slotId==='ST').playerId,'yigit-cetinkaya');assert.equal(swapped.lineups[1],draft.lineups[1]);
  const after=lineupService.evaluate(swapped,context);assert.notEqual(after.teams[0].metrics.roleStrength.score,before.teams[0].metrics.roleStrength.score);
  assert.notEqual(after.teams[1].metrics.defensiveBalance.score,before.teams[1].metrics.defensiveBalance.score,'opponent threat changes the other team too');
  assert.equal(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-1',firstSlot:'GK',secondSlot:'ST'},context).problems[0].code,'KEEPER_SLOT');
  assert.equal(ok(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-1',firstSlot:'ST',secondSlot:'ST'},context)),draft);
  const formation=ok(lineupService.apply(swapped,{kind:'change-formation',teamId:'team-2',formationId:'3-5-2'},context));
  assert.equal(formation.lineups[1].formationId,'3-5-2');assert.deepEqual(formation.lineups[1].assignments.map(a=>a.playerId).sort(),[...SAFE_RED].sort());
  assert.equal(formation.lineups[1].assignments.find(a=>a.slotId==='GK').playerId,'sahin');
  assert.equal(lineupService.apply(draft,{kind:'change-formation',teamId:'team-1',formationId:'2-3-5'},context).ok,false);
  const suggestion={lineup:assignFormation(context.selection.teams[0],'5-3-2',catalog),evaluation:before.teams[0],explanation:''};
  assert.equal(ok(lineupService.apply(draft,{kind:'apply-suggestion',teamId:'team-1',suggestion},context)).lineups[0].formationId,'5-3-2');
  const foreign={...suggestion,lineup:{...suggestion.lineup,assignments:suggestion.lineup.assignments.map(a=>a.playerId==='baran'?{...a,playerId:'omer'}:a)}};
  assert.equal(lineupService.apply(draft,{kind:'apply-suggestion',teamId:'team-1',suggestion:foreign},context).problems[0].code,'WRONG_ROSTER');
});
test('saved lineup shape rejects duplicates, missing slots and extra teams',()=>{
  const {draft}=scenario(SAFE_BLUE,SAFE_RED),bad=structuredClone(draft);bad.lineups[0].assignments[2].playerId=bad.lineups[0].assignments[1].playerId;
  assert.equal(validateLineupShape(bad).ok,false);
  const missing=structuredClone(draft);missing.lineups[0].assignments[3].slotId='CB';assert.equal(validateLineupShape(missing).ok,false);
  assert.equal(validateLineupShape({...draft,lineups:[draft.lineups[0]]}).ok,false);assert.equal(validateLineupShape({...draft,revision:-1}).ok,false);
  assert.equal(validateLineupShape(structuredClone(draft)).ok,true);
});
test('active team changes keep a manual lineup; roster or keeper-mode changes invalidate it',()=>{
  const {selection,context,draft}=scenario(SAFE_BLUE,SAFE_RED),manual=ok(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-1',firstSlot:'LW',secondSlot:'RW'},context));
  const activeChanged=ok(selectionService.apply(selection,{kind:'activate-team',teamId:'team-1'},catalog));assert.equal(activeChanged.revision,selection.revision+1);
  assert.equal(validateLineups(manual,contextOf(activeChanged)).problems[0].code,'STALE_SELECTION');
  const rebased=rebaseLineupDraft(manual,contextOf(activeChanged));assert.equal(rebased.selectionRevision,activeChanged.revision);assert.equal(rebased.revision,0);assert.deepEqual(rebased.lineups,manual.lineups);
  assert.equal(rebaseLineupDraft(manual,context),manual);
  let roster=ok(selectionService.apply(selection,{kind:'remove-player',teamId:'team-1',playerId:'alper'},catalog));roster=ok(selectionService.apply(roster,{kind:'activate-team',teamId:'team-1'},catalog));
  roster=ok(selectionService.apply(roster,{kind:'add-player',playerId:'taha'},catalog));assert.equal(rebaseLineupDraft(manual,contextOf(roster)),null);
  assert.equal(rebaseLineupDraft(manual,contextOf({...selection,id:'other'})),null);
  const keeperMode=selectionOf(['barkuz',...SAFE_BLUE.slice(1,-1),'mali'],SAFE_RED).selection,keeperDraft=makeLineupDraft(keeperMode,[lineupOf('team-1',['mali',...SAFE_BLUE.slice(1,-1),'barkuz']),lineupOf('team-2',SAFE_RED)]);
  assert.equal(validateLineups(keeperDraft,contextOf(keeperMode)).ok,false,'no real keeper');
});

// --- Persistence -------------------------------------------------------------
test('lineup storage enforces selection revision, ordered revisions and other-tab conflicts',async()=>{
  const options={indexedDB:new IDBFactory(),databaseName:'lineup-storage'},selections=createSelectionRepository(options),a=createLineupRepository(options),b=createLineupRepository(options);
  const {history,context,draft}=scenario(SAFE_BLUE,SAFE_RED);for(const d of history)ok(await selections.saveSelection(d));
  ok(await a.saveLineups(draft));ok(await a.saveLineups(draft));
  const first=ok(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-1',firstSlot:'LW',secondSlot:'RW'},context));ok(await a.saveLineups(first));
  const otherTab=ok(lineupService.apply(draft,{kind:'swap-slots',teamId:'team-2',firstSlot:'LW',secondSlot:'RW'},context));
  assert.equal((await b.saveLineups(otherTab)).problems[0].code,'LINEUP_CONFLICT');assert.deepEqual(ok(await b.loadLineups(draft.selectionId)),first);
  const skipped=ok(lineupService.apply(ok(lineupService.apply(first,{kind:'swap-slots',teamId:'team-1',firstSlot:'ST',secondSlot:'CAM'},context)),{kind:'swap-slots',teamId:'team-1',firstSlot:'ST',secondSlot:'CAM'},context));
  assert.equal((await a.saveLineups(skipped)).problems[0].code,'LINEUP_CONFLICT');
  const active=ok(selectionService.apply(context.selection,{kind:'activate-team',teamId:'team-1'},catalog));ok(await selections.saveSelection(active));
  assert.equal((await a.saveLineups(ok(lineupService.apply(first,{kind:'swap-slots',teamId:'team-1',firstSlot:'ST',secondSlot:'CAM'},context)))).problems[0].code,'STALE_SELECTION');
  const rebased=rebaseLineupDraft(ok(await a.loadLineups(draft.selectionId)),contextOf(active));ok(await a.saveLineups(rebased));
  const reopened=createLineupRepository(options);assert.deepEqual(ok(await reopened.loadLineups(draft.selectionId)).lineups,first.lineups);
  a.close();b.close();reopened.close();selections.close();
});
test('corrupt stored lineup is reported, not silently replaced',async()=>{
  const indexedDB=new IDBFactory(),repo=createLineupRepository({indexedDB,databaseName:'lineup-corrupt'});await repo.loadLineups('x');
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lineup-corrupt',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise(resolve=>{const tx=db.transaction('lineup-drafts','readwrite');tx.objectStore('lineup-drafts').put({selectionId:'x',lineups:[]});tx.oncomplete=resolve;});
  assert.equal((await repo.loadLineups('x')).problems[0].code,'INVALID_LINEUP');db.close();repo.close();
});

// --- Source chemistry rules --------------------------------------------------
test('Arif-Barkuz penalty survives a very positive atmosphere',()=>{
  const {assessment}=scenario(SAFE_BLUE,SAFE_RED),blue=assessment.evaluation.teams[0];
  assert.equal(blue.atmosphere.state,'good');assert.ok(!blue.atmosphere.playerIds.includes('arif'));assert.ok(blue.atmosphere.playerIds.includes('baran'));
  assert.ok(ruleIds(assessment).has('arif-barkuz'));assert.equal(value(assessment,'arif','passing'),7);assert.equal(value(assessment,'arif','vision'),7);
  assert.equal(value(assessment,'barkuz','passing'),4.5);assert.ok(assessment.applied.some(a=>a.ruleId==='arif-barkuz'&&a.effect.kind==='team-atmosphere'&&a.effect.delta===-1));
});
test('Baran-Eren-Arif trio replaces the pair bonus instead of stacking',()=>{
  const {assessment}=scenario(CORE_BLUE,CORE_RED),ids=ruleIds(assessment);
  assert.ok(ids.has('baran-eren-arif'));assert.ok(!ids.has('baran-eren'));assert.equal(value(assessment,'baran','passing'),9);assert.equal(value(assessment,'arif','passing'),8);
  const apart=['kiyan','onur','omer','m-emre','batu','baran','alper','taha','eren','goktug','arif'],pair=scenario(apart,CORE_RED).assessment;
  assert.ok(ruleIds(pair).has('baran-eren'));assert.ok(!ruleIds(pair).has('baran-eren-arif'),'Arif as striker is not a linked build-up role');assert.equal(value(pair,'baran','passing'),9);assert.equal(value(pair,'arif','passing'),7.5);
});
test('Onur-Ömer: +1 on all twelve together, -0.5 as opponents',()=>{
  const together=scenario(CORE_BLUE,CORE_RED).assessment,omer=catalog.players.find(p=>p.id==='omer').attributes;
  assert.equal(value(together,'omer','passing'),omer.passing+1);assert.equal(value(together,'omer','positioning'),10);assert.equal(value(together,'onur','speed'),8);
  const blue=CORE_BLUE.map(id=>id==='omer'?'mali':id),red=CORE_RED.map(id=>id==='utku'?'omer':id),opposed=scenario(blue,red).assessment;
  assert.ok(ruleIds(opposed).has('onur-omer-opposed'));assert.equal(value(opposed,'omer','passing'),3.5);assert.equal(value(opposed,'onur','speed'),6.5);
});
test('Tevfik loses team chemistry only without M.Emre',()=>{
  const apart=scenario(CORE_BLUE,CORE_RED).assessment;assert.ok(apart.applied.some(a=>a.ruleId==='tevfik-without-emre'&&a.effect.kind==='team-atmosphere'&&a.effect.delta===-.5));
  const blue=CORE_BLUE.map(id=>id==='batu'?'tevfik':id),red=CORE_RED.map(id=>id==='tevfik'?'batu':id),together=scenario(blue,red).assessment;
  assert.ok(!ruleIds(together).has('tevfik-without-emre'));assert.ok(!ruleIds(together).has('tevfik-irritated'),'irritation is a match event');
});
test('M.Emre beside Berkin counts once; a second strong defender adds within the cap',()=>{
  const single=scenario(SAFE_BLUE,SAFE_RED).assessment,ids=ruleIds(single);
  assert.ok(ids.has('emre-support-berkin'));assert.ok(!ids.has('berkin-defensive-cover'));assert.ok(!ids.has('berkin-isolated'));
  assert.equal(value(single,'berkin','defending'),7.5);assert.equal(value(single,'berkin','positioning'),8);
  const two=scenario(SAFE_BLUE.map(id=>id==='yigit-cetinkaya'?'mali':id),SAFE_RED.map(id=>id==='mali'?'yigit-cetinkaya':id)).assessment;
  assert.ok(ruleIds(two).has('berkin-defensive-cover'));assert.equal(value(two,'berkin','defending'),8);
  const alone=scenario(SAFE_BLUE.map(id=>id==='m-emre'?'oguz':id),SAFE_RED.map(id=>id==='oguz'?'m-emre':id)).assessment;
  assert.ok(ruleIds(alone).has('berkin-isolated'));assert.equal(value(alone,'berkin','defending'),6.5);
});
test('Eto critical mismatch against fast strong attackers, softened by a strong partner',()=>{
  const exposed=scenario(SAFE_BLUE,SAFE_RED).assessment;assert.ok(ruleIds(exposed).has('eto-critical-mismatch'));assert.ok(!ruleIds(exposed).has('eto-mismatch'));
  assert.equal(value(exposed,'eto','defending'),6);assert.ok(exposed.evaluation.teams[1].warnings.some(w=>w.playerIds.includes('eto')));
  const covered=scenario(SAFE_BLUE.map(id=>id==='m-emre'?'oguz':id),SAFE_RED.map(id=>id==='oguz'?'m-emre':id)).assessment;
  assert.ok(ruleIds(covered).has('eto-cover'));assert.equal(value(covered,'eto','defending'),6.5);
  const milder=scenario(SAFE_BLUE.map(id=>({alper:'mustafa',barkuz:'akin'})[id]??id),SAFE_RED).assessment;
  assert.ok(!ruleIds(milder).has('eto-critical-mismatch'));assert.ok(ruleIds(milder).has('eto-mismatch'));assert.equal(value(milder,'eto','defending'),6.5);
});
test('a guest copied from Arif inherits neither the Barkuz penalty nor named chemistry',()=>{
  const guest=ok(createGuestPlayerFactory({createId:()=>'guest-arif',now:()=>'2026-11-03T00:00:00Z'}).create({kind:'outfield',name:'Konuk Arif',referencePlayerId:'arif',scaling:{mode:'overall',overallPercent:100}},catalog));
  const source={...catalog,players:[...catalog.players,guest]},{assessment}=scenario(SAFE_BLUE.map(id=>id==='arif'?guest.id:id),SAFE_RED,{source});
  assert.ok(!ruleIds(assessment).has('arif-barkuz'));assert.equal(value(assessment,'barkuz','passing'),5);
  assert.equal(value(assessment,guest.id,'passing'),guest.attributes.passing+GUEST_POLICY.adaptation.attributeDeltas.passing);
  assert.ok(assessment.applied.some(a=>a.ruleId==='guest-adaptation-v1'&&a.playerIds.includes(guest.id)));
  assert.ok(assessment.evaluation.teams[0].warnings.some(w=>w.playerIds.includes(guest.id)));
});
test('pregame never invents behavior, score or phase events',()=>{
  const {assessment}=scenario(CORE_BLUE,CORE_RED),ids=ruleIds(assessment);
  for(const id of ['goktug-frustration','servan-disruption','utku-leading','utku-trailing'])assert.ok(!ids.has(id),id);
  for(const id of ['goktug-frustration','servan-disruption','utku-leading'])assert.ok(assessment.pendingRuleIds.includes(id),id);
  assert.equal(assessment.evaluation.teams[1].atmosphere.state,'neutral');
  const base=catalog.players.find(p=>p.id==='goktug').attributes;assert.deepEqual(assessment.effective.goktug.base,base);
});
