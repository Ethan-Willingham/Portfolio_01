// Original 64-pixel cutter badge. Nearest-pixel scaling keeps the game's native style.
import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
const colors={ink:'#182d2b',sea:'#28504c',water:'#35635a',foam:'#91aa92',body:'#627e68',deck:'#c9b889',cream:'#e8dfbf',gold:'#dfc288',wood:'#8e7052'};
function badge(){
  const pixels=new Uint8Array(64*64*4);
  const put=(x,y,color)=>{if(x<0||y<0||x>63||y>63)return;const i=(y*64+x)*4,n=parseInt(color.slice(1),16);pixels.set([n>>16,(n>>8)&255,n&255,255],i);};
  const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)put(i,j,colors[c]);};
  function poly(points,c){for(let y=0;y<64;y++)for(let x=0;x<64;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}if(inside)put(x,y,colors[c]);}}
  rect(4,2,56,60,'ink');rect(2,4,60,56,'ink');rect(6,6,52,52,'sea');
  for(const [x,y,w]of [[9,13,12],[46,18,8],[8,28,8],[44,40,11],[10,48,9],[20,55,23]])rect(x,y,w,2,'water');
  poly([[32,9],[43,26],[43,46],[37,52],[26,52],[21,46],[21,26]],'ink');
  poly([[32,12],[40,27],[40,45],[35,49],[28,49],[24,45],[24,27]],'body');
  rect(27,29,10,16,'deck');rect(29,39,6,5,'wood');rect(32,14,2,32,'wood');
  poly([[30,18],[30,37],[22,34]],'cream');poly([[35,15],[45,31],[35,35]],'cream');
  rect(35,33,7,2,'deck');rect(31,11,6,3,'gold');rect(27,53,3,2,'foam');rect(35,54,3,2,'foam');rect(23,57,6,1,'water');rect(36,58,7,1,'water');
  return pixels;
}
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([head,name,data,tail]);}
function png(source,size){
  const raw=Buffer.alloc(size*(size*4+1)),header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(Math.floor(y*64/size)*64+Math.floor(x*64/size))*4;raw.set(source.subarray(i,i+4),y*(size*4+1)+1+x*4);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function buildIcons(dir){
  await fs.mkdir(dir,{recursive:true});const pixels=badge(),images=new Map([16,32,64,128,256,512,1024].map(n=>[n,png(pixels,n)]));
  await fs.writeFile(path.join(dir,'widewake.png'),images.get(256));
  const icoSizes=[16,32,64,128,256],header=Buffer.alloc(6+icoSizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(icoSizes.length,4);let offset=header.length;
  icoSizes.forEach((n,i)=>{const at=6+i*16,data=images.get(n);header[at]=header[at+1]=n%256;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(data.length,at+8);header.writeUInt32LE(offset,at+12);offset+=data.length;});
  await fs.writeFile(path.join(dir,'widewake.ico'),Buffer.concat([header,...icoSizes.map(n=>images.get(n))]));
  const records=[['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]].map(([type,size])=>{const bytes=images.get(size),h=Buffer.alloc(8);h.write(type);h.writeUInt32BE(bytes.length+8,4);return Buffer.concat([h,bytes]);}),icns=Buffer.alloc(8);icns.write('icns');icns.writeUInt32BE(8+records.reduce((sum,b)=>sum+b.length,0),4);
  await fs.writeFile(path.join(dir,'widewake.icns'),Buffer.concat([icns,...records]));
}
