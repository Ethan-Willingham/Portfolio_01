import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function checkFieldCalibration({load,evaluate,send,sleep,dump}){
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,mobile:true,deviceScaleFactor:2});
 await load({initialCharge:false});
 assert.equal(await evaluate('__toy.camera().zoom'),3.4,'landscape starts with a useful close view');
 assert.equal(await evaluate('document.getElementById("sluice-field-status").textContent'),'No measured field runs. A real-world recovery forecast is unavailable.');
 await evaluate('document.getElementById("sluice-setup").click()');
 await evaluate('document.getElementById("sluice-field-form").scrollIntoView({block:"center"})');
 await sleep(100);
 const frame=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 fs.writeFileSync(path.join(dump,'field-calibration-landscape.png'),Buffer.from(frame.data,'base64'));
 for(const recovered of [70,75,80]){
  await evaluate(`(()=>{
   const set=(id,value)=>document.getElementById('sluice-field-'+id).value=value;
   set('liner','Expanded metal over ribbed mat');set('size','fine');set('slope',8);set('flow',15);set('feed',4);
   set('in',100);set('out',${recovered});document.getElementById('sluice-field-form').requestSubmit();
  })()`);
 }
 assert.match(await evaluate('document.getElementById("sluice-field-result").textContent'),/Measured-run estimate: 75\.0% recovered/);
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("wss-sluice-field-runs-v1")).length'),3);
 await evaluate('document.getElementById("sluice-field-liner").value="Other lining";document.getElementById("sluice-field-estimate").click()');
 assert.match(await evaluate('document.getElementById("sluice-field-result").textContent'),/No measured run matches/,'unrelated equipment has no estimate');
 await load({initialCharge:false});
 assert.match(await evaluate('document.getElementById("sluice-field-status").textContent'),/3 measured runs saved/,'measurements persist across reload');
 await evaluate('document.getElementById("sluice-field-remove").click()');
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("wss-sluice-field-runs-v1")).length'),2,'removing a run updates storage');
 console.log('PASS landscape close view and field-run form, same-hardware estimate, refusal for another lining and local persistence');
}
