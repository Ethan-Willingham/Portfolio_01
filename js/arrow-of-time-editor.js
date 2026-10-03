import { motifAt } from './arrow-of-time-model.js?v=3';
export function linearInk(hex) {
  return [1,3,5].map(i => { const value = parseInt(hex.slice(i,i+2),16)/255; return value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4; });
}
export function createDrawingEditor({ canvas, firstInk, secondInk, clear, eraser, template, render, note, onRender, onPalette, signal }) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let dragging = false, last = null, removing = false, pen = false, cursor = { x: canvas.width/2, y: canvas.height/2 };
  function listen(target,event,callback) { target.addEventListener(event,callback,{signal}); }
  function gradient() { const g=ctx.createLinearGradient(0,0,0,canvas.height);g.addColorStop(0,firstInk.value);g.addColorStop(1,secondInk.value);return g; }
  function palette() { ctx.globalCompositeOperation='source-in';ctx.fillStyle=gradient();ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';onPalette(linearInk(firstInk.value),linearInk(secondInk.value)); }
  function moth() {
    const pixels=ctx.createImageData(canvas.width,canvas.height);
    for(let row=0;row<canvas.height;row++)for(let col=0;col<canvas.width;col++){if(motifAt(col,row,canvas.width,canvas.height,'moth')){const i=(row*canvas.width+col)*4;pixels.data[i]=255;pixels.data[i+1]=255;pixels.data[i+2]=255;pixels.data[i+3]=255;}}
    ctx.putImageData(pixels,0,0);palette();note.textContent='Edit the moth, or clear the pad and draw a new shape.';
  }
  function point(event) { const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(event.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(event.clientY-r.top)*canvas.height/r.height))}; }
  function stroke(a,b) { note.textContent='Render drawing to explore this image.';ctx.globalCompositeOperation=removing?'destination-out':'source-over';ctx.strokeStyle=gradient();ctx.fillStyle=gradient();ctx.lineWidth=removing?20:9;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.arc(b.x,b.y,ctx.lineWidth/2,0,2*Math.PI);ctx.fill();ctx.globalCompositeOperation='source-over'; }
  listen(canvas,'pointerdown',event=>{if(!event.isPrimary || event.button!==0)return;event.preventDefault();canvas.setPointerCapture(event.pointerId);dragging=true;last=point(event);stroke(last,last);});
  listen(canvas,'pointermove',event=>{if(!dragging)return;const next=point(event);stroke(last,next);last=next;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,()=>{dragging=false;last=null;});
  listen(canvas,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pen=!pen;if(pen)stroke(cursor,cursor);note.textContent=`Keyboard pen ${pen?'down':'up'}. Use arrow keys to move.`;return;}const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!directions[event.key])return;event.preventDefault();const [dx,dy]=directions[event.key],distance=event.shiftKey?20:5,next={x:Math.max(0,Math.min(canvas.width,cursor.x+dx*distance)),y:Math.max(0,Math.min(canvas.height,cursor.y+dy*distance))};if(pen)stroke(cursor,next);cursor=next;note.textContent=`Brush at ${Math.round(cursor.x)}, ${Math.round(cursor.y)}. Pen ${pen?'down':'up'}.`;});
  listen(clear,'click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);note.textContent='The pad is clear. Draw a shape, then render it.';});
  listen(eraser,'click',()=>{removing=!removing;eraser.setAttribute('aria-pressed',String(removing));});
  listen(template,'click',moth);listen(firstInk,'input',palette);listen(secondInk,'input',palette);
  listen(render,'click',async()=>{const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,mask=new Uint8Array(canvas.width*canvas.height);let marks=0;for(let i=0;i<mask.length;i++){mask[i]=rgba[i*4+3]>96?1:0;marks+=mask[i];}if(!marks){note.textContent='Draw a shape first.';return;}render.disabled=true;note.textContent='Rendering the full dissolve and return.';try{await onRender({width:canvas.width,height:canvas.height,mask});note.textContent='Ready. Drag the timeline to explore your drawing.';}finally{render.disabled=false;}});
  moth();
}
