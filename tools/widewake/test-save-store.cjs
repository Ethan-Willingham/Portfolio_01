/* The storage generation may change without changing portable campaign JSON. */
const assert=require('node:assert/strict'),{Store,SAVE,BACKUP,LEGACY}=require('../../js/widewake-saves.js');
const old=JSON.stringify({day:3}),newer=JSON.stringify({day:9}),backup=JSON.stringify({day:2});
function fixture(entries={},options={}){
  const values=new Map(Object.entries(entries)),writes=[];
  const storage={getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key),setItem(key,text){
    writes.push(key);if(options.fail?.(key,text)||options.capacity&&[...values].reduce((n,[k,v])=>n+(k===key?0:v.length),text.length)>options.capacity)throw new DOMException('Full','QuotaExceededError');values.set(key,text);
  }};
  const store=new Store({storage,limit:1000,validate:text=>{const value=JSON.parse(text);if(!Number.isInteger(value.day))throw Error('Invalid fleet');return value;}});return{store,storage,values,writes};
}
{
  const f=fixture({[LEGACY[0]]:old,[LEGACY[1]]:backup});assert.equal(f.store.read().value.day,3);assert.equal(f.writes.length,0);f.store.write(newer);assert.equal(f.values.get(SAVE),newer);assert.equal(f.values.get(BACKUP),old);assert.ok(LEGACY.every(k=>!f.values.has(k)));
}
{
  const f=fixture({[SAVE]:'broken',[BACKUP]:backup,[LEGACY[0]]:old});const result=f.store.read();assert.equal(result.value.day,2);assert.ok(result.recovered);f.store.write(newer);assert.equal(f.values.get(BACKUP),backup);assert.equal(f.values.get(LEGACY[0]),old);
  const bad=fixture({[SAVE]:'broken',[LEGACY[0]]:old});assert.equal(bad.store.read().value,null,'Do not revive an unrelated old generation after current storage exists.');
}
{
  const f=fixture({[SAVE]:old,[BACKUP]:backup},{fail:key=>key===SAVE});f.store.read();assert.throws(()=>f.store.write(newer));assert.equal(f.values.get(SAVE),old);assert.equal(f.values.get(BACKUP),backup,'A failed primary cannot overwrite the backup.');
}
for(const source of [0,1]){
  const copies=source?[old.replace('3','x'),backup]:[old,backup],f=fixture(Object.fromEntries(LEGACY.map((k,i)=>[k,copies[i]])),{capacity:old.length*2});
  assert.ok(f.store.read().value);assert.equal(f.store.write(newer).backup,true);assert.equal(f.values.get(SAVE),newer);assert.equal(f.values.get(BACKUP),copies[source]);assert.ok(LEGACY.every(k=>!f.values.has(k)));
  const failed=fixture(Object.fromEntries(LEGACY.map((k,i)=>[k,copies[i]])),{fail:key=>key===SAVE});failed.store.read();assert.throws(()=>failed.store.write(newer));assert.equal(failed.values.get(LEGACY[source]),copies[source],'The validated source survives both failed writes.');assert.equal(failed.values.get(LEGACY[1-source]),copies[1-source]);
}
{
  const f=fixture({[LEGACY[0]]:old,[LEGACY[1]]:backup});f.store.read();f.storage.setItem(LEGACY[0],newer);f.store.write(newer);assert.equal(f.values.get(LEGACY[0]),newer,'A late old client write stays isolated, not deleted.');assert.equal(f.values.get(SAVE),newer);
}
{
  const f=fixture({[SAVE]:old,[BACKUP]:backup},{fail:key=>key===BACKUP});f.store.read();assert.equal(f.store.write(newer).backup,false);assert.equal(f.values.get(SAVE),newer);assert.equal(f.values.get(BACKUP),backup);assert.throws(()=>f.store.write('x'.repeat(1001)));assert.equal(f.values.get(SAVE),newer);
}
console.log('PASS migration, recovery, primary-first writes, full storage retry, surviving source, old-client isolation and partial-backup status');
