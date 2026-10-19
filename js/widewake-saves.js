/* One writing window, explicit handoff, and a storage slot older clients cannot overwrite. */
(function(root){
  'use strict';
  const SAVE='widewake-save-v2',BACKUP='widewake-save-backup-v2',LEGACY=['widewake-save-v1','widewake-save-backup-v1'];
  const CHANNEL='widewake-session-v2',SIGNAL='widewake-session-message-v2',LOCK='widewake-fleet-v2';
  const uid=()=>root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  class Store{
    constructor({storage,validate,limit}){this.storage=storage;this.validate=validate;this.limit=limit;this.legacy=null;}
    read(){
      const result={value:null,recovered:false,damaged:false,unavailable:false};this.legacy=null;
      try{
        const current=[this.storage.getItem(SAVE),this.storage.getItem(BACKUP)];
        const legacy=current.every(text=>text===null),texts=legacy?LEGACY.map(key=>this.storage.getItem(key)):current;
        for(let i=0;i<texts.length;i++)if(texts[i]!==null){try{
          result.value=this.validate(texts[i]);result.recovered=i===1;
          if(legacy)this.legacy={texts,source:i};return result;
        }catch{result.damaged=true;}}
      }catch{result.unavailable=true;}
      return result;
    }
    write(text){
      if(new TextEncoder().encode(text).byteLength>this.limit)throw Error('Save too large');
      const storage=this.storage,old=storage.getItem(SAVE),migration=this.legacy;let previous=null;
      if(old!==null){try{this.validate(old);previous=old;}catch{}}
      else if(migration)previous=migration.texts[migration.source];
      try{storage.setItem(SAVE,text);}catch(error){
        // A dense old primary and backup may leave no room for the new slot.
        // Free only the other legacy copy; the validated source stays intact.
        const index=migration?1-migration.source:-1,key=LEGACY[index],duplicate=migration?.texts[index];
        if(error.name!=='QuotaExceededError'||!duplicate||storage.getItem(key)!==duplicate)throw error;
        storage.removeItem(key);
        try{storage.setItem(SAVE,text);}catch(retry){try{if(storage.getItem(key)===null)storage.setItem(key,duplicate);}catch{}throw retry;}
      }
      // The new primary is durable before retiring observed legacy copies.
      // A late write from an old client is left alone in its separate slot.
      if(migration){for(let i=0;i<LEGACY.length;i++){try{if(migration.texts[i]!==null&&storage.getItem(LEGACY[i])===migration.texts[i])storage.removeItem(LEGACY[i]);}catch{}}this.legacy=null;}
      let backup=true;if(previous!==null){try{storage.setItem(BACKUP,previous);}catch{backup=false;}}
      return{backup};
    }
  }
  class Session{
    constructor({standalone=false,schedule,cancel,canTake,onYield,onLost,onStorage}){
      this.standalone=standalone;this.schedule=schedule;this.cancel=cancel;this.canTake=canTake;this.onYield=onYield;this.onLost=onLost;this.onStorage=onStorage;
      this.id=uid();this.owner=false;this.localOnly=false;this.closed=true;this.generation=0;this.channel=null;this.pending=null;this.holding=null;this.releaseLock=null;this.acquiring=null;this.yielding=false;
      this.storageEvent=event=>{if(event.key===SIGNAL&&event.newValue){try{this.receive(JSON.parse(event.newValue));}catch{}}else if([SAVE,BACKUP,...LEGACY].includes(event.key)||event.key===null)this.onStorage();};
    }
    get writable(){return this.owner&&!this.localOnly&&!this.closed;}
    async open(){
      if(!this.closed)return this.tryAcquire();this.closed=false;
      if(this.standalone||this.localOnly){this.owner=true;return true;}
      if(!root.navigator.locks?.request){this.owner=true;this.localOnly=true;return true;}
      root.addEventListener('storage',this.storageEvent);
      try{this.channel=new root.BroadcastChannel(CHANNEL);this.channel.onmessage=event=>this.receive(event.data);}catch{}
      return this.tryAcquire();
    }
    tryAcquire(){
      if(this.closed)return Promise.resolve(false);if(this.owner)return Promise.resolve(true);if(this.acquiring)return this.acquiring;
      const generation=this.generation;
      const ready=new Promise(resolve=>{
        this.holding=Promise.resolve().then(()=>root.navigator.locks.request(LOCK,{ifAvailable:true},lock=>{
          if(!lock||this.closed||generation!==this.generation){resolve(false);return;}
          this.owner=true;const held=new Promise(release=>{this.releaseLock=release;});resolve(true);return held;
        })).catch(()=>{
          if(this.closed||generation!==this.generation){resolve(false);return;}
          // Private or older browser contexts can still play and export. They
          // never become an uncoordinated writer to the shared device save.
          this.localOnly=true;this.owner=true;resolve(true);
        });
      });
      const acquiring=ready.finally(()=>{if(this.acquiring===acquiring)this.acquiring=null;});this.acquiring=acquiring;return acquiring;
    }
    send(message){
      if(this.closed)return;message={...message,from:this.id};
      try{if(this.channel){this.channel.postMessage(message);return;}}catch{}
      try{root.localStorage.setItem(SIGNAL,JSON.stringify(message));root.localStorage.removeItem(SIGNAL);}catch{}
    }
    async receive(message){
      if(this.closed||!message||typeof message.from!=='string'||message.from===this.id||message.to&&message.to!==this.id||typeof message.request!=='string'||message.request.length>100)return;
      if(message.type==='request'&&this.owner&&!this.localOnly&&!this.yielding){
        this.yielding=true;
        try{
          if(!this.onYield()){this.send({type:'denied',to:message.from,request:message.request});return;}
          const holding=this.holding;this.owner=false;this.releaseLock?.();this.releaseLock=null;this.onLost();
          await holding;this.send({type:'released',to:message.from,request:message.request});
        }finally{this.yielding=false;}
      }else if(this.pending?.id===message.request&&['released','denied'].includes(message.type)){
        if(message.type==='denied')this.finish({ok:false,reason:'unsaved'});else this.completeRequest();
      }
    }
    request(){
      if(this.closed||!this.canTake())return Promise.resolve({ok:false,reason:'inactive'});
      if(this.owner)return Promise.resolve({ok:true,changed:false});if(this.pending)return this.pending.promise;
      const id=uid();let resolve;const promise=new Promise(r=>{resolve=r;});this.pending={id,promise,resolve,timer:null,resolving:false};
      this.tryAcquire().then(acquired=>{
        if(!this.pending||this.pending.id!==id)return;
        if(acquired){this.finishAcquisition();return;}
        this.pending.timer=this.schedule(()=>this.completeRequest(),6000);this.send({type:'request',request:id});
      });return promise;
    }
    async completeRequest(){
      const pending=this.pending;if(!pending||pending.resolving)return;pending.resolving=true;
      if(!this.canTake()||this.closed){this.finish({ok:false,reason:'inactive'});return;}
      const acquired=await this.tryAcquire();if(this.pending!==pending)return;
      if(acquired)this.finishAcquisition();else this.finish({ok:false,reason:'busy'});
    }
    finishAcquisition(){
      if(this.closed||!this.canTake()){this.owner=false;this.releaseLock?.();this.releaseLock=null;this.finish({ok:false,reason:'inactive'});}
      else this.finish({ok:true,changed:true});
    }
    finish(result){const pending=this.pending;if(!pending)return;this.pending=null;if(pending.timer!==null)this.cancel(pending.timer);pending.resolve(result);}
    close(){
      this.closed=true;this.generation++;this.acquiring=null;this.finish({ok:false,reason:'inactive'});this.owner=false;this.releaseLock?.();this.releaseLock=null;
      this.channel?.close();this.channel=null;root.removeEventListener('storage',this.storageEvent);
    }
  }
  const api={SAVE,BACKUP,LEGACY,Store,Session};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeSaves=api;
})(globalThis);
