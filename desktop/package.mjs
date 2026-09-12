// A portable, unpacked build. Signing and Steam integration are separate release work.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
if(process.platform!=='win32')throw Error('This prototype packager currently targets Windows');
const dest=path.join(here,'dist','Sluice-win32-x64');
if(!dest.startsWith(here+path.sep)||fs.existsSync(path.join(here,'dist'))&&fs.lstatSync(path.join(here,'dist')).isSymbolicLink())throw Error('Unsafe output directory');
fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
fs.cpSync(path.join(here,'node_modules/electron/dist'),dest,{recursive:true});
fs.renameSync(path.join(dest,'electron.exe'),path.join(dest,'Sluice.exe'));
const appDir=path.join(dest,'resources/app');
fs.mkdirSync(appDir,{recursive:true});
for(const name of ['main.cjs','stage'])fs.cpSync(path.join(here,name),path.join(appDir,name),{recursive:true});
fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'sluice',version:'0.1.0',main:'main.cjs'},null,2));
console.log('Portable build: '+path.join(dest,'Sluice.exe'));
