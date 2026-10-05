/* Preserve the actual EUMETSAT published interval alongside NOAA replay grids. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const data=require('../js/globe-data.js'),aurora=require('./archive-globe-aurora.cjs');
async function captureCloudCatalog(options={}){
 const file=options.file||path.resolve(__dirname,'../assets/data/globe-cloud-catalog.json');
 const catalog=await data.fetchCloudCatalog({timeout:10000,fetch:options.fetch});
 const next={version:1,source:data.CLOUD_SERVICE,layers:data.CLOUD_LAYERS,start:catalog.start.toISOString(),end:catalog.end.toISOString(),step:catalog.step,checkedAt:new Date(options.now===undefined?Date.now():options.now).toISOString()};
 data.parseCloudSnapshot(next);
 if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));data.parseCloudSnapshot(old);if(old.start===next.start&&old.end===next.end)return {changed:false,end:next.end};}
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return {changed:true,end:next.end};
}
async function main(){
 const results=await Promise.allSettled([captureCloudCatalog(),aurora.main([])]);
 results.forEach((result,i)=>{if(result.status==='fulfilled')console.log(JSON.stringify({source:i?'NOAA':'EUMETSAT',...result.value}));else console.error((i?'NOAA':'EUMETSAT')+': '+result.reason.message);});
 if(results.every(result=>result.status==='rejected'))throw new Error('Both weather sources failed; existing data was preserved.');
}
module.exports={captureCloudCatalog};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
