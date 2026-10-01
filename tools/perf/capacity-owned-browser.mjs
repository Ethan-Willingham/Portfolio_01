// Ownership checks for one dedicated Chrome for Testing process.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
export function testingBinary(){
 const cache=path.join(os.homedir(),'Library/Caches/ms-playwright'),found=[];
 for(const dir of fs.readdirSync(cache).filter(n=>n.startsWith('chromium-')).sort())for(const sub of fs.readdirSync(path.join(cache,dir)).filter(n=>n.startsWith('chrome-mac')).sort()){
  const p=path.join(cache,dir,sub,'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');if(fs.existsSync(p))found.push(fs.realpathSync(p));
 }
 assert(found.length,'Installed Chrome for Testing required');return found.at(-1);
}
export function validateOwnedDescriptor(filename){
 const d=JSON.parse(fs.readFileSync(filename,'utf8'));
 assert(Number.isInteger(d.pid)&&d.pid>1&&Number.isInteger(d.debugPort)&&d.debugPort>1024&&d.debugPort<65536&&typeof d.visible==='boolean','Explicit owned process descriptor');
 const binary=fs.realpathSync(d.binary),profile=fs.realpathSync(d.profile),temp=fs.realpathSync(os.tmpdir());
 assert(binary.startsWith(path.join(os.homedir(),'Library/Caches/ms-playwright')+'/')&&binary.endsWith('/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),'Testing binary only');
 assert(profile.startsWith(temp+'/')&&/^sluice-capacity-owned-/.test(path.basename(profile)),'Dedicated owned temporary profile only');
 assert.equal(fs.statSync(profile).uid,process.getuid(),'Owned profile user');
 const marker=JSON.parse(fs.readFileSync(path.join(profile,'sluice-owned-browser.json'),'utf8'));
 for(const key of ['pid','debugPort','profile','binary','visible'])assert.equal(marker[key],d[key],'Ownership marker '+key);
 process.kill(d.pid,0);
 const command=execFileSync('ps',['-ww','-p',String(d.pid),'-o','command='],{encoding:'utf8'}).trim();
 assert(command.startsWith(binary+' '),'Exact testing process executable');
 assert(command.includes('--user-data-dir='+profile+' ')&&command.includes('--remote-debugging-port='+d.debugPort+' '),'Exact owned profile and debug port');
 assert.equal(command.includes('--headless'),!d.visible,'Visibility matches process flags');
 const listeners=[...new Set(execFileSync('lsof',['-nP','-iTCP:'+d.debugPort,'-sTCP:LISTEN','-t'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean).map(Number))];
 assert.deepEqual(listeners,[d.pid],'Debug socket belongs to exact owned browser PID');
 return {...d,profile,binary};
}
