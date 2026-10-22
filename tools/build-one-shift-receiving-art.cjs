'use strict';
// Lossless delivery encoding only. The original generated PNG artwork is retained.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const dir=path.resolve(__dirname,'../assets/one-shift/receiving');
const files=['trailer-empty','trailer-dock-two','pallet-cargo','pallet-mixed','pallet-low','pallet-tall'];
(async()=>{
  let before=0,after=0;
  for(const name of files){
    const source=path.join(dir,name+'.png'),dest=path.join(dir,name+'.webp');
    await sharp(source).webp({lossless:true,effort:6}).toFile(dest);
    const a=await sharp(source).ensureAlpha().raw().toBuffer(),b=await sharp(dest).ensureAlpha().raw().toBuffer();
    assert.equal(a.length,b.length,name+' dimensions');
    for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3],name+' alpha');if(a[i+3])for(let c=0;c<3;c++)assert.equal(a[i+c],b[i+c],name+' visible pixel');}
    const old=fs.statSync(source).size,bytes=fs.statSync(dest).size;before+=old;after+=bytes;
    console.log(name+': '+Math.round(bytes/1024)+' KiB, visible pixels and alpha unchanged');
  }
  console.log('Runtime artwork: '+(before/1e6).toFixed(2)+' MB -> '+(after/1e6).toFixed(2)+' MB');
})().catch(error=>{console.error(error);process.exitCode=1;});
