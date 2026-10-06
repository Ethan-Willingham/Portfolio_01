// Phase 0: material constructions at three zooms and five angles, with source photos.
import { resolve } from 'node:path';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { toolLock } from './core.mjs';
import { serve,browserRun } from './browser.mjs';
const local=process.env.CHAIN_REACTION_RESEARCH,sharpPath=process.env.CHAIN_REACTION_SHARP;
if(!local||!sharpPath)throw Error('Set CHAIN_REACTION_RESEARCH and CHAIN_REACTION_SHARP');
const sharp=createRequire(import.meta.url)(sharpPath),release=await toolLock();
const server=await serve(local),output=resolve(local,'evidence/cycle-2/materials');
await mkdir(output,{recursive:true});
const sources=JSON.parse(await readFile(resolve(local,'reference-board/catalog.json'),'utf8')),report=[];
try {
  await browserRun('chromium',async browser=>{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(server.url+'/local/chain-reaction-lab.html');await page.waitForFunction(()=>window.ChainReactionLab?.ready);
    await page.evaluate(()=>{ChainReactionLab.settings.paused=true;ChainReactionLab.settings.externalFrames=true;});
    const all=[...sources,{...sources.find(x=>x.material==='ceramic'),material:'hero'}];
    const only=process.argv[2]==='--only'?process.argv[3]:null;if(only&&!all.some(s=>s.material===only))throw Error('Unknown sample');
    for(const source of all.filter(s=>!only||s.material===only)){
      const tiles=[],images=[];
      for(const zoom of [0,1,2])for(const angle of [0,45,90,135,180]){
        const metrics=await page.evaluate(([name,zoom,angle])=>ChainReactionLab.sample(name,zoom,angle),[source.material,zoom,angle]);
        const bytes=await page.locator('canvas').screenshot();
        const file=resolve(output,`${source.material}-${zoom}-${angle}.png`);await writeFile(file,bytes);
        images.push({zoom,angle,file,drawCalls:metrics.drawCalls});
        tiles.push({input:await sharp(bytes).resize(240,160,{fit:'contain',background:'#303931'}).png().toBuffer(),left:((angle/45)*240),top:zoom*190+30});
      }
      const labels='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="570"><style>text{font:14px monospace;fill:#e8e2d6}</style>'+[0,1,2].map(z=>[0,45,90,135,180].map((a,i)=>`<text x="${i*240+12}" y="${z*190+20}">${['Wide','Middle','Close'][z]}, ${a} degrees</text>`).join('')).join('')+'</svg>';
      const sheet=await sharp({create:{width:1200,height:570,channels:3,background:'#303931'}}).composite([...tiles,{input:Buffer.from(labels),left:0,top:0}]).png().toBuffer();
      const reference=await sharp(resolve(local,'reference-board',source.file)).resize(350,570,{fit:'contain',background:'#303931'}).png().toBuffer();
      await sharp({create:{width:1550,height:570,channels:3,background:'#303931'}}).composite([{input:sheet,left:0,top:0},{input:reference,left:1200,top:0}]).png().toFile(resolve(output,source.material+'-comparison.png'));
      report.push({material:source.material,source:source.source,license:source.license,images});
    }
    if(errors.length)throw Error(errors.join('\n'));
    await page.close();
  });
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Material rotation/zoom capture PASS: '+report.length+' samples, '+report.reduce((n,r)=>n+r.images.length,0)+' exact captures. No taste approval claimed.');
} finally {await server.close();await release();}
