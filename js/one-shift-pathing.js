(function (root) {
  'use strict';
  const O=root.OneShift;
  // Missing orientation identifies the original south-dock saves and layouts.
  const side=s=>s.map.dockSide||'south';
  O.docks={side,entrance:(s,d)=>side(s)==='east'?{x:d.x+1,y:d.y}:{x:d.x,y:d.y+1},slot:(s,d,i)=>side(s)==='east'?{x:d.x+1+Math.floor(i/2),y:d.y+i%2}:{x:d.x+i%2,y:d.y+1+Math.floor(i/2)},
    lane(s,kind){const b=s.map.building;return side(s)==='east'?{x:b.x+b.w-5,y:kind==='receiving'?b.y+4:b.y+b.h-7,w:4,h:6}:{x:kind==='receiving'?b.x+3:b.x+b.w-10,y:b.y+b.h-5,w:6,h:4};},
    stack(s){const b=s.map.building;return side(s)==='east'?{x:b.x+b.w-7,y:b.y+b.h-3}:{x:b.x+1,y:b.y+b.h-3};},
    spawn(s){const b=s.map.building;return side(s)==='east'?{x:b.x+b.w-3,y:b.y+Math.min(10,b.h-2)}:{x:b.x+Math.min(12,b.w-2),y:b.y+b.h-2};}
  };
  const grids=new WeakMap();
  function obstacles(s){let q=grids.get(s.map);if(q?.revision===s.map.revision)return q.cells;const cells=new Set(),b=s.map.building,key=(x,y)=>y*s.map.w+x;for(let y=b.y-1;y<=b.y+b.h;y++){cells.add(key(b.x-1,y));cells.add(key(b.x+b.w,y));}for(let x=b.x-1;x<=b.x+b.w;x++){cells.add(key(x,b.y-1));cells.add(key(x,b.y+b.h));}for(const d of s.map.doors){cells.delete(key(d.x,d.y));cells.delete(key(d.x+(side(s)==='east'?0:1),d.y+(side(s)==='east'?1:0)));}for(const r of s.map.racks){cells.add(key(r.x,r.y));cells.add(key(r.x+1,r.y));}for(const r of s.map.blocks)cells.add(key(r.x,r.y));grids.set(s.map,{revision:s.map.revision,cells});return cells;}
  function inside(s,x,y) { const b=s.map.building; return x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h; }
  function blocked(s,x,y,vehicle=false) {
    const b=s.map.building;
    if(x<0||y<0||x>=s.map.w||y>=s.map.h) return true;
    if(obstacles(s).has(y*s.map.w+x))return true;
    // Turning clearance is validated when racks are placed, not by closing the aisle.
    return false;
  }
  const caches=new WeakMap();
  const less=(a,b)=>a.f<b.f||a.f===b.f&&a.g>b.g;
  function push(heap,q){let i=heap.length;heap.push(q);while(i){const p=(i-1)>>1;if(!less(q,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=q;}
  function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],last))break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
  function path(s,start,end,vehicle=false) {
    let cache=caches.get(s.map);if(!cache){cache=new Map();caches.set(s.map,cache);}
    const cacheKey=[s.map.revision,Math.round(start.x),Math.round(start.y),Math.round(end.x),Math.round(end.y),vehicle].join('/');
    if(cache.has(cacheKey)){const old=cache.get(cacheKey);return old&&old.map(p=>({...p}));}
    const remember=result=>{if(cache.size>4096)cache.clear();cache.set(cacheKey,result);return result&&result.map(p=>({...p}));};
    const sx=Math.round(start.x),sy=Math.round(start.y),ex=Math.round(end.x),ey=Math.round(end.y);
    const key=(x,y)=>y*s.map.w+x, goal=key(ex,ey), first=key(sx,sy);
    const open=[{x:sx,y:sy,k:first,g:0,f:Math.abs(ex-sx)+Math.abs(ey-sy)}],cost=new Map([[first,0]]),parent=new Map(),closed=new Set();
    let tries=0;
    while(open.length&&tries++<s.map.w*s.map.h) {
      const a=pop(open); if(closed.has(a.k))continue; closed.add(a.k);
      if(a.k===goal) { const points=[];let k=goal;while(k!==first){points.push({x:k%s.map.w,y:Math.floor(k/s.map.w)});k=parent.get(k);}return remember(points.reverse()); }
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const x=a.x+dx,y=a.y+dy,k=key(x,y);
        if(closed.has(k)||((k!==goal&&k!==first)&&blocked(s,x,y,vehicle)))continue;
        // A rack is approached from its aisle, never walked through.
        if(k===goal&&blocked(s,x,y,vehicle))continue;
        const g=a.g+1;if(g>=(cost.get(k)??Infinity))continue;
        cost.set(k,g);parent.set(k,a.k);push(open,{x,y,k,g,f:g+Math.abs(ex-x)+Math.abs(ey-y)});
      }
    }
    return remember(null);
  }
  O.pathing={inside,blocked,path};
})(typeof globalThis !== 'undefined' ? globalThis : window);
