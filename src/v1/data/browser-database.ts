import { STORAGE_STORES } from './persistence.ts';

const keyPaths:Readonly<Record<typeof STORAGE_STORES[number],string|string[]>>={
  'guest-players':'id','weekly-forms':['weekId','playerId'],'selection-drafts':'id','lineup-drafts':'selectionId',
  'match-snapshots':'id','replay-manifests':'matchId','replay-chunks':['matchId','index'],'preferences':'key',
};
export interface DatabaseOptions { readonly indexedDB?:IDBFactory; readonly databaseName?:string }
export function createBrowserDatabase(options:DatabaseOptions={}) {
  let opened:Promise<IDBDatabase>|null=null;
  return {
    open():Promise<IDBDatabase>{
      if(opened)return opened;
      opened=new Promise<IDBDatabase>((resolve,reject)=>{
        const factory=options.indexedDB??globalThis.indexedDB;
        if(!factory){reject(new Error('IndexedDB kullanılamıyor.'));return;}
        const request=factory.open(options.databaseName??'alsancak-match-engine',1);let settled=false;
        request.onupgradeneeded=()=>{const db=request.result;for(const store of STORAGE_STORES)if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:keyPaths[store]});};
        request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();opened=null;};resolve(db);};
        request.onerror=()=>{if(!settled){settled=true;reject(request.error);}};
        request.onblocked=()=>{if(!settled){settled=true;const error=new Error('Başka bir Alsancak sekmesi kayıt güncellemesini bekletiyor.');error.name='BlockedError';reject(error);}};
      }).catch(error=>{opened=null;throw error;});
      return opened;
    },
    close(){const current=opened;opened=null;void current?.then(db=>db.close()).catch(()=>{});},
  };
}
export function transactionComplete(tx:IDBTransaction):Promise<void> {
  return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('İşlem iptal edildi.'));tx.onerror=()=>{};});
}
export function requestValue<T>(request:IDBRequest<T>):Promise<T> {
  return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
