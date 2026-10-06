/* Wikipedia Pixel Grid. Originals are loaded only near the viewport. */
(() => {
  'use strict';
  const canvas = document.getElementById('grid');
  const context = canvas.getContext('2d', {alpha: false});
  const status = document.getElementById('status');
  const pointers = new Map(), images = new Map(), thumbnails = new Map();
  const styles = getComputedStyle(document.documentElement);
  const colors = ['--bg', '--bg-raised', '--rule'].map(v => styles.getPropertyValue(v).trim());
  const camera = {x: 0, y: 0, scale: 1};
  const SIZE = 256, GAP = 4, STEP = SIZE + GAP, MAX_RESIDENT = 12, MAX_THUMBNAILS = 64;
  let data, width = 0, height = 0, dpr = 1, frame = 0, moving = false;
  let lastGesture, press = null, velocity = {x: 0, y: 0}, lastMove = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let atlas = null, lastFrame = 0;
  function extent() { return {w: data.columns * STEP - GAP, h: Math.ceil(data.tiles.length / data.columns) * STEP - GAP}; }
  function fit(cover = false) {
    if (!data) return;
    const {w,h} = extent();
    camera.scale = cover ? Math.max(width / w, height / h) : Math.min(width / w, height / h) * .96;
    camera.x = (width - w * camera.scale) / 2;
    camera.y = (height - h * camera.scale) / 2;
    velocity.x = velocity.y = 0;
    schedule();
  }
  function limit() {
    const {w,h} = extent();
    const margin = Math.min(width,height) * .35;
    camera.x = Math.min(width - margin, Math.max(margin - w * camera.scale, camera.x));
    camera.y = Math.min(height - margin, Math.max(margin - h * camera.scale, camera.y));
  }
  function zoom(factor, x, y) {
    if (!data) return;
    const {w,h} = extent(), min = Math.min(width/w,height/h) * .3;
    const next = Math.min(16, Math.max(min, camera.scale * factor));
    const ratio = next / camera.scale;
    camera.x = x - (x-camera.x) * ratio;
    camera.y = y - (y-camera.y) * ratio;
    camera.scale = next;
    limit(); schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  function detail(tile, small = false) {
    const cache = small ? thumbnails : images;
    if (!tile.image) return null;
    let entry = cache.get(tile.id);
    if (!entry) {
      const img = new Image();
      entry = {img, ready: false, used: performance.now()};
      cache.set(tile.id, entry);
      img.decoding = "async";
      img.onload = () => {entry.ready = true; schedule();};
      img.onerror = () => {entry.failed = true; schedule();};
      img.src = (small ? tile.thumbnail : tile.image) + "?v=" + encodeURIComponent(data.assetVersion || "1");
    }
    entry.used = performance.now();
    return entry.ready ? entry.img : null;
  }
  function draw(now) {
    frame = 0;
    if (!data) return;
    const elapsed = lastFrame ? Math.min(32, now-lastFrame) / 16 : 1;
    lastFrame = now;
    if (!pointers.size && moving && !reduced.matches) {
      camera.x += velocity.x*elapsed; camera.y += velocity.y*elapsed;
      velocity.x *= Math.pow(.91,elapsed); velocity.y *= Math.pow(.91,elapsed);
      limit();
      moving = Math.hypot(velocity.x,velocity.y) > .1;
    }
    context.setTransform(dpr,0,0,dpr,0,0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = colors[0]; context.fillRect(0,0,width,height);
    const loX = Math.max(0,Math.floor(-camera.x / camera.scale / STEP));
    const hiX = Math.min(data.columns-1,Math.floor((width-camera.x) / camera.scale / STEP));
    const loY = Math.max(0,Math.floor(-camera.y / camera.scale / STEP));
    const hiY = Math.min(Math.ceil(data.tiles.length/data.columns)-1,Math.floor((height-camera.y) / camera.scale / STEP));
    const visible = new Set();
    const candidates = [];
    if (SIZE*camera.scale*dpr > (data.previewSize || 64)) {
      for (let row=loY;row<=hiY;row++) for(let col=loX;col<=hiX;col++) {
        const tile=data.tiles[row*data.columns+col];
        if(tile?.image) candidates.push({id:tile.id,distance:Math.hypot(camera.x+(col*STEP+SIZE/2)*camera.scale-width/2,camera.y+(row*STEP+SIZE/2)*camera.scale-height/2)});
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const wanted = new Set(SIZE*camera.scale*dpr>256 ? candidates.slice(0,MAX_RESIDENT).map(t=>t.id) : []);
    const wantedThumbnails = new Set(candidates.slice(0,MAX_THUMBNAILS).map(t=>t.id));
    for(const [id,entry] of thumbnails) if(!wantedThumbnails.has(id)) {
      entry.img.onload=entry.img.onerror=null;entry.img.src="";thumbnails.delete(id);
    }
    // Release old decoded buffers before allocating the next viewport's images.
    for(const [id,entry] of images) if(!wanted.has(id)) {
      entry.img.onload=entry.img.onerror=null; entry.img.src='';images.delete(id);
    }
    for (let row=loY;row<=hiY;row++) for (let col=loX;col<=hiX;col++) {
      const tile = data.tiles[row*data.columns+col];
      if (!tile) continue;
      const x = camera.x + col*STEP*camera.scale, y = camera.y + row*STEP*camera.scale, size = SIZE*camera.scale;
      context.fillStyle = colors[1]; context.fillRect(x,y,size,size);
      if (atlas && tile.preview) {
        const [sx,sy,sw,sh] = tile.preview;
        context.imageSmoothingEnabled = tile.medium !== 'pixel art';
        context.drawImage(atlas,sx,sy,sw,sh,x,y,size,size);
      }
      if (wantedThumbnails.has(tile.id) && tile.thumbnail) {
        const img = detail(tile,true);
        if(img) {context.imageSmoothingEnabled=tile.medium!=="pixel art";context.drawImage(img,x,y,size,size);}
      }
      if (wanted.has(tile.id)) {
        visible.add(tile.id);
        const img = detail(tile);
        if (img) {context.imageSmoothingEnabled = tile.medium !== 'pixel art'; context.drawImage(img,x,y,size,size);}
      }
      if (!tile.image) {
        context.strokeStyle = colors[2]; context.lineWidth = 1;
        context.strokeRect(x+.5,y+.5,Math.max(0,size-1),Math.max(0,size-1));
      }
    }
    // Drop offscreen decoded images. Previews remain in a single small atlas.
    const evict = [...images].filter(([id])=>!visible.has(id)).sort((a,b)=>a[1].used-b[1].used);
    while (images.size > Math.max(MAX_RESIDENT,visible.size) && evict.length) {
      const [id,entry] = evict.shift(); entry.img.onload = entry.img.onerror = null; entry.img.src = ''; images.delete(id);
    }
    if (moving) schedule();
  }
  function gesture() {
    const points = [...pointers.values()];
    if (!points.length) return null;
    if (points.length === 1) return {...points[0], distance: 0};
    return {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)};
  }
  function tileAt(x, y) {
    if (!data) return null;
    const gx=(x-camera.x)/camera.scale, gy=(y-camera.y)/camera.scale;
    const col=Math.floor(gx/STEP), row=Math.floor(gy/STEP);
    if(col<0 || col>=data.columns || row<0 || gx-col*STEP>=SIZE || gy-row*STEP>=SIZE) return null;
    const tile=data.tiles[row*data.columns+col];
    return tile?.image ? tile : null;
  }
  function openArticle(tile) {
    if(tile) window.open(tile.articleUrl || tile.source,'_blank','noopener,noreferrer');
  }
  canvas.addEventListener('pointerdown', e => {
    if (!data || e.button!==0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    lastGesture = gesture(); moving = false; velocity.x = velocity.y = 0;
    lastMove = performance.now();
    if(pointers.size===1) press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    else if(press) press.moved=true;
  });
  canvas.addEventListener('pointermove', e => {
    if(!pointers.size) {
      const tile=tileAt(e.clientX,e.clientY);
      canvas.title=tile ? `${tile.article}: ${tile.subject}. Open Wikipedia.` : '';
      canvas.style.cursor=tile ? 'pointer' : 'grab';
    }
    if (!pointers.has(e.pointerId)) return;
    if(press && Math.hypot(e.clientX-press.x,e.clientY-press.y)>7) press.moved=true;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const next = gesture(), previous = lastGesture;
    if (next && previous) {
      if (next.distance && previous.distance) zoom(next.distance/previous.distance,previous.x,previous.y);
      const dx = next.x-previous.x, dy = next.y-previous.y;
      camera.x += dx; camera.y += dy;
      const dt = Math.max(8,performance.now()-lastMove);
      velocity.x = dx*16/dt; velocity.y = dy*16/dt;
      lastMove = performance.now(); limit(); schedule();
    }
    lastGesture=next;
  });
  function release(e) {
    if (!pointers.has(e.pointerId)) return;
    if(e.type==='pointerup' && press?.id===e.pointerId && !press.moved && pointers.size===1) {
      openArticle(tileAt(e.clientX,e.clientY));
      velocity.x=velocity.y=0;
    }
    if(press?.id===e.pointerId) press=null;
    pointers.delete(e.pointerId); lastGesture=gesture();
    if (!pointers.size) {moving=e.type!=='pointercancel' && performance.now()-lastMove<80; schedule();}
  }
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); moving=false;
    const delta = e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);
    zoom(Math.exp(-Math.max(-300,Math.min(300,delta))*.003),e.clientX,e.clientY);
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    if (!data) return;
    const shift=e.shiftKey?160:60;
    if(e.key==='Enter') openArticle(tileAt(width/2,height/2));
    else if (e.key==='Home' || e.key==='0') fit();
    else if (e.key==='+' || e.key==='=') zoom(1.3,width/2,height/2);
    else if (e.key==='-') zoom(1/1.3,width/2,height/2);
    else if (e.key==='ArrowLeft') camera.x+=shift;
    else if (e.key==='ArrowRight') camera.x-=shift;
    else if (e.key==='ArrowUp') camera.y+=shift;
    else if (e.key==='ArrowDown') camera.y-=shift;
    else return;
    e.preventDefault(); moving=false; limit(); schedule();
  });
  function resize() {
    const rect=canvas.getBoundingClientRect(), oldW=width, oldH=height;
    width=rect.width; height=rect.height; dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    if (!oldW) fit(true);
    else {camera.x+=(width-oldW)/2;camera.y+=(height-oldH)/2;if(data)limit();schedule();}
  }
  new ResizeObserver(resize).observe(canvas);
  fetch('assets/wiki-pixel-grid/manifest.json?v=2').then(r=>{if(!r.ok)throw Error('Manifest unavailable');return r.json();}).then(manifest=>{
    data=manifest; resize(); fit(true);
    const links=document.getElementById('article-links');
    for(const tile of data.tiles.filter(t=>t.image)) {
      const li=document.createElement('li'), link=document.createElement('a');
      link.href=tile.articleUrl || tile.source;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent=`Tile ${tile.id}: ${tile.subject}, from ${tile.article}`;
      li.append(link);links.append(li);
    }
    status.textContent=`${data.tiles.filter(t=>t.image).length} of ${data.tiles.length} artworks completed.`;
    if(data.atlas){const img=new Image();img.onload=()=>{atlas=img;schedule();};img.src=data.atlas+"?v="+encodeURIComponent(data.assetVersion||"1");}
  }).catch(()=>{status.textContent='The artwork could not load. Reload to try again.';});
})();
