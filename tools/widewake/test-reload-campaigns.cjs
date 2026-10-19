/* Compare complete earned campaigns, including every 12-second sea checkpoint
   and each trading stop, against the same captain without reconstruction. */
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const [style,seed]of [['balanced',12345],['merchant',91],['gunline',744]]){
  const outcomes=[];
  for(const reload of ['0','1']){
    const run=spawnSync(process.execPath,[path.join(__dirname,'test-playthrough.cjs')],{env:{...process.env,WIDEWAKE_FLEET_STYLE:style,WIDEWAKE_CAPTAIN_SEED:String(seed),WIDEWAKE_CAPTAIN_RELOAD:reload},encoding:'utf8',timeout:180000});
    if(run.status!==0)throw Error(run.stderr||run.stdout||String(run.error));
    const reports=run.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)),ending=reports.find(r=>r.label==='home, campaign complete'),hash=reports.find(r=>r.finalHash)?.finalHash;
    assert.ok(ending&&hash);assert.equal(ending.charters,6);outcomes.push({ending,hash});
  }
  assert.equal(outcomes[0].hash,outcomes[1].hash,style+' resumed campaign must have identical final save values');
  const {ending}=outcomes[1];console.log(JSON.stringify({style,seed,minutes:ending.minutes,reloads:ending.savesChecked+ending.portsChecked,maxSaveBytes:ending.maxSaveBytes,kills:ending.kills,coins:ending.coins,boats:ending.fleet.length+1,identical:true}));
}
console.log('PASS all three earned campaigns finish with identical uninterrupted and reloaded saves');
