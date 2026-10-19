import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
export async function prepare(){
  const stage=path.join(here,'stage'),prior=await fs.lstat(stage).catch(()=>null);if(prior?.isSymbolicLink())throw Error('Stage must not be a symbolic link.');
  const html=await fs.readFile(path.join(root,'widewake.html'),'utf8'),css=await fs.readFile(path.join(root,'widewake.css'),'utf8');
  const files=new Set(['widewake.html','widewake.css','favicon.svg','js/widewake-route-worker.js','assets/widewake/earth-land.geojson']);
  for(const match of html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g))files.add(match[1]);
  for(const match of css.matchAll(/url\(['"]?([^)'"?]+)[^)]*\)/g))files.add(match[1]);
  const data=require(path.join(root,'js/widewake-data.js')),version=data.version,contents=new Map(),manifest={version,files:{}};
  for(const file of [...files].sort()){
    if(!/^(?:widewake\.(?:html|css)|favicon\.svg|js\/(?:widewake[-\w]*|demo-activity)\.js|assets\/fonts\/[\w-]+\.woff2|assets\/widewake\/earth-land\.geojson)$/.test(file))throw Error('Unexpected game asset: '+file);
    const bytes=await fs.readFile(path.join(root,file));contents.set(file,bytes);manifest.files[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(path.join(stage,'game'),{recursive:true});
  for(const [name,bytes]of contents){const target=path.join(stage,'game',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
  for(const file of ['main.cjs','preload.cjs','policy.cjs'])await fs.copyFile(path.join(here,file),path.join(stage,file));
  await fs.cp(path.join(here,'licenses'),path.join(stage,'licenses'),{recursive:true});
  await fs.copyFile(path.join(here,'ASSETS.md'),path.join(stage,'ASSETS.md'));
  await fs.writeFile(path.join(stage,'game','asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'widewake',productName:'Widewake',version,description:'Sail the Earth with a growing convoy.',author:'Ethan Willingham',main:'main.cjs',private:true},null,2)+'\n');
  console.log('Staged Widewake '+version+': '+contents.size+' files, '+[...contents.values()].reduce((sum,b)=>sum+b.length,0)+' bytes.');
  return{stage,version,manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
