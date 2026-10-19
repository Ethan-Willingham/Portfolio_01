import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
export async function prepare(){
  const stage=path.join(here,'stage'),prior=await fs.lstat(stage).catch(()=>null);if(prior?.isSymbolicLink())throw Error('Stage must not be a symbolic link.');
  const pages=['widewake','widewake-battle','widewake-estuary'];
  const files=new Set(['favicon.svg','js/widewake-estuary-worker.js','widewake-reach.css']);
  for(const page of pages){
    files.add(page+'.html');files.add(page+'.css');
    const html=await fs.readFile(path.join(root,page+'.html'),'utf8'),css=await fs.readFile(path.join(root,page+'.css'),'utf8');
    for(const match of html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g))files.add(match[1]);
    for(const match of css.matchAll(/url\(['"]?([^)'"?]+)[^)]*\)/g))files.add(match[1]);
  }
  require(path.join(root,'js/widewake-battle-core.js'));require(path.join(root,'js/widewake-estuary-core.js'));
  const data=require(path.join(root,'js/widewake-reach-game.js')),version=data.version,contents=new Map(),manifest={version,files:{}};
  for(const file of [...files].sort()){
    if(!/^(?:widewake(?:-battle|-estuary|-reach)?\.(?:html|css)|favicon\.svg|js\/(?:widewake[-\w]*|demo-activity)\.js|assets\/fonts\/[\w-]+\.woff2|assets\/widewake\/earth-land\.geojson)$/.test(file))throw Error('Unexpected game asset: '+file);
    const bytes=await fs.readFile(path.join(root,file));contents.set(file,bytes);manifest.files[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(path.join(stage,'game'),{recursive:true});
  for(const [name,bytes]of contents){const target=path.join(stage,'game',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
  for(const file of ['main.cjs','preload.cjs','policy.cjs'])await fs.copyFile(path.join(here,file),path.join(stage,file));
  await fs.cp(path.join(here,'licenses'),path.join(stage,'licenses'),{recursive:true});
  await fs.copyFile(path.join(here,'ASSETS.md'),path.join(stage,'ASSETS.md'));
  await fs.writeFile(path.join(stage,'game','asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'widewake',productName:'Widewake',version,description:'Build a trading fleet in Bracken Reach.',author:'Ethan Willingham',main:'main.cjs',private:true},null,2)+'\n');
  console.log('Staged Widewake '+version+': '+contents.size+' files, '+[...contents.values()].reduce((sum,b)=>sum+b.length,0)+' bytes.');
  return{stage,version,manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
