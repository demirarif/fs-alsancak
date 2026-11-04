import type { Result } from '../domain/common.js';
import type { Player, PlayerCatalog } from '../domain/players.js';
import type { PlayerCatalogRepository } from './catalog.js';
import { deepFreeze, validatePlayerCatalog } from './catalog-validation.ts';
import { createBrowserDatabase, transactionComplete as complete, requestValue } from './browser-database.ts';

function storageProblem(error: unknown): Result<never> {
  const name=error instanceof Error?error.name:'';
  const message=name==='ConstraintError'?'Bu oyuncu zaten kaydedilmiş. Envanterden açabilirsin.'
    :name==='QuotaExceededError'?'Tarayıcı depolama alanı dolu. Oyuncu kaydedilmedi.'
    :name==='BlockedError'?'Başka bir sekme veri güncellemesini bekletiyor. Diğer Alsancak sekmesini kapatıp tekrar dene.'
    :'Yerel kayıt alanına erişilemedi. Tarayıcı izinlerini kontrol edip tekrar dene.';
  return {ok:false,problems:[{code:name==='ConstraintError'?'GUEST_EXISTS':'STORAGE_ERROR',message}]};
}

export interface LocalCatalogRepository extends PlayerCatalogRepository { close():void }

export function createLocalCatalogRepository(seed:PlayerCatalog, options:{readonly indexedDB?:IDBFactory;readonly databaseName?:string}={}):LocalCatalogRepository {
  const database=createBrowserDatabase(options),open=()=>database.open();
  function incrementRevision(tx:IDBTransaction){
    const store=tx.objectStore('preferences'),request=store.get('catalog-revision');
    request.onsuccess=()=>store.put({key:'catalog-revision',value:(request.result?.value??0)+1});
  }
  return {
    async load(){
      try{
        const db=await open(),tx=db.transaction(['guest-players','preferences'],'readonly'),done=complete(tx);
        const guestsRequest=requestValue<Player[]>(tx.objectStore('guest-players').getAll());
        const revisionRequest=requestValue(tx.objectStore('preferences').get('catalog-revision'));
        const [guests,revision]=await Promise.all([guestsRequest,revisionRequest,done]);
        const merged={...seed,version:`${seed.version}+local-${revision?.value??0}`,players:[...seed.players,...guests]};
        const validation=validatePlayerCatalog(merged);
        if(!validation.ok)return {ok:false,problems:[{code:'CORRUPT_LOCAL_CATALOG',message:'Yerel oyuncu kaydı doğrulanamadı. Mevcut kayıtlar korundu; yeni kayıt eklenmedi.'}]};
        return {ok:true,value:deepFreeze(merged)};
      }catch(error){return storageProblem(error);}
    },
    async saveGuest(player){
      if(player.origin.kind!=='guest'||!player.id.startsWith('guest-')||seed.players.some(p=>p.id===player.id))return {ok:false,problems:[{code:'GUEST_ONLY',message:'Yalnızca yeni misafir oyuncular kaydedilebilir.'}]};
      const validation=validatePlayerCatalog({...seed,players:[player]});
      if(!validation.ok)return {ok:false,problems:validation.problems};
      try{const db=await open(),tx=db.transaction(['guest-players','preferences'],'readwrite'),done=complete(tx);
        tx.objectStore('guest-players').add(structuredClone(player));incrementRevision(tx);await done;
        return {ok:true,value:player.id};
      }catch(error){return storageProblem(error);}
    },
    async archiveGuest(playerId){
      if(seed.players.some(p=>p.id===playerId))return {ok:false,problems:[{code:'CATALOG_READ_ONLY',message:'Kaynak envanter oyuncuları arşivlenemez.'}]};
      try{
        const db=await open(),tx=db.transaction(['guest-players','preferences'],'readwrite'),done=complete(tx);
        const request=tx.objectStore('guest-players').get(playerId);let found=false;
        request.onsuccess=()=>{const player:Player|undefined=request.result;if(!player)return;found=true;
          if(!player.archived){tx.objectStore('guest-players').put({...player,archived:true});incrementRevision(tx);}};
        await done;return found?{ok:true,value:undefined}:{ok:false,problems:[{code:'PLAYER_NOT_FOUND',message:'Misafir oyuncu bulunamadı.'}]};
      }catch(error){return storageProblem(error);}
    },
    close(){database.close();},
  };
}
