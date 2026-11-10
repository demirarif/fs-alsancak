// The Worker's betting API end to end (2026-11-10), on an in-memory D1 (node:sqlite with the real schema) and KV: every pick playable
// again in each new coupon, the sure-win refusal on the slip's quote and on placing, exact payouts, and a settlement that stops half way
// paying everybody on its next pass. Run with --experimental-transform-types (the Worker has a TypeScript parameter property).
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../worker/index.ts';
import {buildBook,packSample,payoutOf} from '../src/v1/online/markets.ts';

/** D1 over node:sqlite: prepare/bind/first/all/run and batch as one transaction; `fail(list)` can make a batch fail before it runs. */
function d1(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  const reads=sql=>/^\s*(select|with)\b/i.test(sql),value=v=>v===undefined?null:typeof v==='boolean'?Number(v):v;
  const statement=(sql,params=[])=>({sql,bind:(...p)=>statement(sql,p.map(value)),
    async first(col){const r=db.prepare(sql).get(...params);return r?col?r[col]??null:{...r}:null;},
    async all(){if(reads(sql))return {success:true,results:db.prepare(sql).all(...params).map(r=>({...r})),meta:{}};const i=db.prepare(sql).run(...params);return {success:true,results:[],meta:{changes:Number(i.changes)}};},
    async run(){return this.all();}});
  const DB={db,fail:null,prepare:sql=>statement(sql),async exec(sql){db.exec(sql);},
    async batch(list){if(DB.fail?.(list))throw new Error('D1: bağlantı koptu');db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.all());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
  return DB;
}
function kv(){const store=new Map();return {store,async get(k,o){const v=store.get(k);if(v==null)return null;return (typeof o==='string'?o:o?.type)==='json'?JSON.parse(v):v;},async put(k,v){store.set(k,v);},async delete(k){store.delete(k);}};}

const line=(id,team,goals)=>({id,team,goals,assists:0,shots:goals,onTarget:goals,tackles:0,interceptions:0,saves:0,completed:10,headersWon:0});
const factsOf=(a,b)=>({ht:[Math.min(a,1),Math.min(b,1)],ft:[a,b],corners:6,penalties:0,headerGoals:0,players:[line('alper',0,a),line('ismail',1,b)],
  goals:[...Array.from({length:a},(_,i)=>({t:100+i*300,team:0,player:'alper'})),...Array.from({length:b},(_,i)=>({t:250+i*300,team:1,player:'ismail'}))]});
const sims=Array.from({length:400},(_,i)=>factsOf(i%6,(i*7)%5));
const teams={names:['Mavi Takım','Kırmızı Takım'],teams:[{name:'Mavi Takım',formation:'4-2-3-1',players:[{id:'alper',name:'Alper',slot:'ST',label:'Forvet'}]},
  {name:'Kırmızı Takım',formation:'3-5-2',players:[{id:'ismail',name:'İsmail',slot:'RS',label:'Forvet'}]}]};
const book=buildBook(sims,[{name:'Mavi Takım',players:[{id:'alper',name:'Alper'}]},{name:'Kırmızı Takım',players:[{id:'ismail',name:'İsmail'}]}]);
const ft=book.markets.find(x=>x.family==='ft'),total=book.markets.find(x=>x.family==='total'&&x.outcomes.every(o=>o.playable));

/** A Worker with one player (10 000 coins) and one match on the bulletin (kick-off in an hour, ends 2–1); `call` is that player. */
function setup(){
  const env={DB:d1(),FILES:kv(),ASSETS:{fetch:async()=>new Response('',{status:404})}},now=Date.now(),db=env.DB.db,token='tok-alper';
  db.prepare("INSERT INTO users (login, username, display_name, password_hash, must_change, created_at) VALUES ('alper', 'alper', 'Alper', 'x', 0, ?)").run(now);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, 1, ?)').run(createHash('sha256').update(token).digest('hex'),now+86_400_000);
  db.prepare("INSERT INTO ledger (user_id, kind, ref, amount, match_id, created_at) VALUES (1, 'grant', 'grant:1', 10000, NULL, ?)").run(now);
  db.prepare("INSERT INTO matches (id, kickoff_at, broadcast_ms, status, odds_status, teams, result, book, engine_version, created_at) VALUES ('m1', ?, 600000, 'scheduled', 'open', ?, ?, ?, 'test', ?)")
    .run(now+3_600_000,JSON.stringify(teams),JSON.stringify({score:[2,1],halfTime:[1,1],facts:factsOf(2,1)}),JSON.stringify(book),now);
  env.FILES.store.set('samples:m1',JSON.stringify(sims.map(packSample)));
  const call=async(method,path,body)=>{const r=await worker.fetch(new Request(`https://alsancak.test${path}`,{method,headers:{cookie:`als_session=${token}`,'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};};
  const bet=(legs,stake=500,replaces)=>call('POST','/api/matches/m1/bets',{legs:legs.map(([market,code])=>({market:market.id,code})),stake,replaces});
  return {env,db,call,bet};
}

test('payouts are stake × odds in whole coins, without the float shortfall',()=>{
  assert.equal(payoutOf(100,1.15),115);assert.equal(payoutOf(200,2.3),460);assert.equal(payoutOf(100,4.1),410);assert.equal(payoutOf(333,1.57),522);assert.equal(payoutOf(500,0),0);
});

test('every pick is playable again in each new coupon; only a set that wins whatever the result is refused',async()=>{
  const {db,call,bet}=setup(),win=total.outcomes[0].code;
  assert.equal((await bet([[ft,'1']])).status,200,'Mavi kazanır');
  assert.equal((await bet([[ft,'1']])).status,200,'Mavi kazanır again, in a second bet (user: "başka kuponda oynatmıyor")');
  assert.equal((await bet([[ft,'1'],[total,win]])).status,200,'a coupon with it');
  assert.equal((await bet([[ft,'1'],[total,win]])).status,200,'the same coupon again');
  assert.equal((await bet([[ft,'2']])).status,200,'the other side of the market is no longer locked');
  const quote=await call('POST','/api/matches/m1/quote',{legs:[{market:ft.id,code:'X'}]});
  assert.equal(quote.body.ok,false,'the slip says it before "Bahsi yap"');assert.match(quote.body.error,/kesin kazanç/);
  const refused=await bet([[ft,'X']]);assert.equal(refused.status,409);assert.match(refused.body.error,/kesin kazanç/);
  // Editing the Kırmızı bet into Beraberlik leaves it out of the check: then a Kırmızı win loses everything, so it may be played.
  const red=db.prepare("SELECT id FROM bets WHERE code = '2'").get().id;
  assert.equal((await call('POST','/api/matches/m1/quote',{legs:[{market:ft.id,code:'X'}],replaces:red})).body.ok,true);
  assert.equal((await bet([[ft,'X']],500,red)).status,200,'the edit goes through');
  assert.equal(db.prepare("SELECT status FROM bets WHERE id = ?").get(red).status,'withdrawn');
  const {n,sum}=db.prepare("SELECT COUNT(*) AS n, SUM(amount) AS sum FROM ledger WHERE user_id = 1").get();
  assert.equal(n,1+6+1,'grant, six stakes, one refund');assert.equal(sum,10000-6*500+500);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance,sum,'the kept balance is the ledger sum');
});

test('a settlement that stops between its batches pays every winner on the next pass, once',async()=>{
  const {env,db,call,bet}=setup();
  for(let i=0;i<45;i++)assert.equal((await bet([[ft,'1']],100)).status,200);
  db.prepare("UPDATE matches SET kickoff_at = ? WHERE id = 'm1'").run(Date.now()-700_000);
  // 45 bets: more statements than one batch (40); the connection drops on the batch that would mark the match paid.
  let dropped=0;env.DB.fail=list=>!dropped&&list.some(s=>/SET status = 'settled'/.test(s.sql))&&++dropped>0;
  const log=console.error;console.error=()=>{};try{await call('GET','/api/state');}finally{console.error=log;}assert.equal(dropped,1,'the first pass stopped half way');
  assert.equal(db.prepare("SELECT status FROM matches WHERE id = 'm1'").get().status,'scheduled');
  db.prepare("UPDATE matches SET settling_at = settling_at - 31000 WHERE id = 'm1'").run();
  await call('GET','/api/state');
  assert.equal(db.prepare("SELECT status FROM matches WHERE id = 'm1'").get().status,'settled');
  const won=db.prepare('SELECT * FROM bets').all();
  assert.ok(won.length===45&&won.every(b=>b.status==='won'),'every bet judged');
  for(const b of won){
    const rows=db.prepare("SELECT amount FROM ledger WHERE ref = ?").all(`win:${b.id}`);
    assert.equal(rows.length,1,`paid once: ${b.id}`);assert.equal(rows[0].amount,payoutOf(b.stake,b.odds));assert.equal(b.payout,rows[0].amount);
  }
  const sum=db.prepare('SELECT SUM(amount) AS s FROM ledger WHERE user_id = 1').get().s;
  assert.equal(sum,10000-45*100+won.reduce((s,b)=>s+payoutOf(b.stake,b.odds),0)+(db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'bonus'").get().s));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance,sum);
});
