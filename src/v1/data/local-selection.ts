import type { Result } from '../domain/common.js';
import type { DraftRepository } from './persistence.js';
import { validateSelectionDraft } from '../domain/selection.ts';
import { createBrowserDatabase, requestValue, transactionComplete, type DatabaseOptions } from './browser-database.ts';

export type SelectionRepository=Pick<DraftRepository,'loadSelection'|'saveSelection'>&{close():void};
const conflict=():Result<never>=>({ok:false,problems:[{code:'SELECTION_CONFLICT',message:'Kadro başka bir sekmede değişti. Son kaydı yükleyip devam et.'}]});
const storageError=():Result<never>=>({ok:false,problems:[{code:'SELECTION_STORAGE',message:'Kadro kaydedilemedi. Seçimlerin bu ekranda duruyor; tekrar kaydetmeyi deneyebilirsin.'}]});

export function createSelectionRepository(options:DatabaseOptions={}):SelectionRepository {
  const database=createBrowserDatabase(options);
  return {
    async loadSelection(){
      try{
        const db=await database.open(),tx=db.transaction(['selection-drafts','preferences'],'readonly'),done=transactionComplete(tx);
        const pointer=await requestValue(tx.objectStore('preferences').get('active-selection'));
        if(!pointer){await done;return {ok:true,value:null};}
        const draft=await requestValue(tx.objectStore('selection-drafts').get(pointer.value));await done;
        return validateSelectionDraft(draft);
      }catch{return storageError();}
    },
    async saveSelection(draft){
      const validation=validateSelectionDraft(draft);if(!validation.ok)return validation;
      try{
        const db=await database.open(),tx=db.transaction(['selection-drafts','preferences'],'readwrite'),done=transactionComplete(tx);
        let rejected:Result<never>|null=null;
        const pointer=tx.objectStore('preferences').get('active-selection');
        pointer.onsuccess=()=>{
          if(pointer.result&&pointer.result.value!==draft.id){rejected=conflict();return;}
          const stored=tx.objectStore('selection-drafts').get(draft.id);
          stored.onsuccess=()=>{
            const current=stored.result;
            if(current){
              const valid=validateSelectionDraft(current);
              if(!valid.ok){rejected=valid;return;}
              if(current.revision===draft.revision&&JSON.stringify(current)===JSON.stringify(draft))return;
              if(current.revision!==draft.revision-1){rejected=conflict();return;}
            }else if(draft.revision!==0){rejected=conflict();return;}
            tx.objectStore('selection-drafts').put(structuredClone(draft));
            tx.objectStore('preferences').put({key:'active-selection',value:draft.id});
          };
        };
        await done;return rejected??{ok:true,value:undefined};
      }catch{return storageError();}
    },
    close(){database.close();},
  };
}
