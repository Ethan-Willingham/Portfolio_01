/* Immutable floor and lower cliff art. No simulation or input runs here. */
'use strict';
const version=new URL(self.location.href).search;
globalThis.document={createElement(name){if(name!=='canvas')throw new Error('Scenery only creates canvases.');return new OffscreenCanvas(1,1);}};
importScripts(...['stock','terrain','course','physics','view'].map(name=>'four-wheels-'+name+'.js'+version));
let view,level,generation;
self.onmessage=({data})=>{
  if(data.kind==='init'){level=data.level;generation=data.generation;view=CartView.create(data.palette);return;}
  if(data.generation!==generation)return;
  try{
    const canvas=view.renderSceneryTile(level,data.kind,data.x,data.y),bitmap=canvas.transferToImageBitmap();
    self.postMessage({kind:data.kind,key:data.key,generation,bitmap},[bitmap]);
  }catch(error){self.postMessage({generation,error:String(error)});}
};
