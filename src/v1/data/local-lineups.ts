import type { LineupDraft } from '../domain/teams.js';
import type { Result } from '../domain/common.js';
import { validateLineupShape } from '../domain/lineups.ts';
import { createBrowserDatabase, requestValue, transactionComplete, type DatabaseOptions } from './browser-database.ts';
export function createLineupRepository(options:DatabaseOptions={}){
  const database=createBrowserDatabase(options);
  const error=(code='LINEUP_STORAGE',message='Diziliş kaydedilemedi. Tekrar dene.'):Result<never>=>({ok:false,problems:[{code,message}]});
  return {
    async loadLineups(selectionId:string):Promise<Result<LineupDraft|null>>{
      try{const db=await database.open(),tx=db.transaction('lineup-drafts','readonly'),done=transactionComplete(tx);const draft=await requestValue(tx.objectStore('lineup-drafts').get(selectionId));await done;return draft?validateLineupShape(draft):{ok:true,value:null};}catch{return error();}
    },
    async saveLineups(draft:LineupDraft):Promise<Result<void>>{
      const valid=validateLineupShape(draft);if(!valid.ok)return valid;
      try{const db=await database.open(),tx=db.transaction(['lineup-drafts','selection-drafts'],'readwrite'),done=transactionComplete(tx);let failure:Result<never>|null=null;
        const selected=tx.objectStore('selection-drafts').get(draft.selectionId);
        selected.onsuccess=()=>{
          if(selected.result?.revision!==draft.selectionRevision){failure=error('STALE_SELECTION','Kadro değişti; diziliş kaydı durduruldu. Kadro ekranına dön.');return;}
          const stored=tx.objectStore('lineup-drafts').get(draft.selectionId);
          stored.onsuccess=()=>{const previous=stored.result;
            if(previous?.selectionRevision===draft.selectionRevision){
              if(previous.revision===draft.revision&&JSON.stringify(previous)===JSON.stringify(draft))return;
              if(previous.revision!==draft.revision-1){failure=error('LINEUP_CONFLICT','Diziliş başka sekmede değişti. Son kaydı yükle.');return;}
            }else if(draft.revision!==0){failure=error('LINEUP_CONFLICT','Dizilişi yeniden yükle.');return;}
            tx.objectStore('lineup-drafts').put(structuredClone(draft));
          };
        };await done;return failure??{ok:true,value:undefined};
      }catch{return error();}
    },
    close(){database.close();},
  };
}
