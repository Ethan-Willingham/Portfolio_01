import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packager} from '@electron/packager';
import {prepare} from './prepare.mjs';
import {buildIcons} from './icons.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),platform=args[0]||process.platform,arch=args[1]||process.arch;
if(!['darwin','win32','linux'].includes(platform)||!['x64','arm64'].includes(arch))throw Error('Use a supported platform (darwin, win32, linux) and architecture (x64, arm64).');
const out=path.join(here,'dist'),prior=await fs.lstat(out).catch(()=>null);if(prior?.isSymbolicLink())throw Error('Dist must not be a symbolic link.');
const {stage,version}=await prepare(),pkg=JSON.parse(await fs.readFile(path.join(here,'package.json'),'utf8'));
await buildIcons(path.join(stage,'icons'));
const builds=await packager({dir:stage,out,name:'Widewake',platform,arch,electronVersion:pkg.devDependencies.electron,appVersion:version,appBundleId:'com.ethanwillingham.widewake',asar:true,overwrite:true,prune:false,
  icon:path.join(stage,'icons','widewake.'+(platform==='darwin'?'icns':platform==='win32'?'ico':'png'))});
for(const build of builds)console.log('Built '+build);
