(function (root) {
  'use strict';
  const O=root.OneShift;
  function inside(s,x,y) { const b=s.map.building; return x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h; }
  function blocked(s,x,y,vehicle=false) {
    const b=s.map.building;
    if(x<0||y<0||x>=s.map.w||y>=s.map.h) return true;
    if((x===b.x-1||x===b.x+b.w)&&y>=b.y-1&&y<=b.y+b.h) return true;
    if(y===b.y-1&&x>=b.x-1&&x<=b.x+b.w) return true;
    if(y===b.y+b.h&&x>=b.x-1&&x<=b.x+b.w&&!s.map.doors.some(d=>x===d.x||x===d.x+1)) return true;
    if(s.map.racks.some(r=>x>=r.x&&x<r.x+2&&y===r.y)) return true;
    if(s.map.blocks.some(r=>x===r.x&&y===r.y)) return true;
    if(vehicle&&s.map.racks.some(r=>x>=r.x&&x<r.x+2&&Math.abs(y-r.y)===1)) return true;
    return false;
  }
  function path(s,start,end,vehicle=false) {
    const sx=Math.round(start.x),sy=Math.round(start.y),ex=Math.round(end.x),ey=Math.round(end.y);
    const key=(x,y)=>y*s.map.w+x, goal=key(ex,ey), first=key(sx,sy);
    const open=[{x:sx,y:sy,k:first,g:0,f:Math.abs(ex-sx)+Math.abs(ey-sy)}],cost=new Map([[first,0]]),parent=new Map(),closed=new Set();
    let tries=0;
    while(open.length&&tries++<s.map.w*s.map.h) {
      let j=0; for(let i=1;i<open.length;i++) if(open[i].f<open[j].f) j=i;
      const a=open.splice(j,1)[0]; if(closed.has(a.k))continue; closed.add(a.k);
      if(a.k===goal) { const points=[];let k=goal;while(k!==first){points.push({x:k%s.map.w,y:Math.floor(k/s.map.w)});k=parent.get(k);}return points.reverse(); }
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const x=a.x+dx,y=a.y+dy,k=key(x,y);
        if(closed.has(k)||((k!==goal&&k!==first)&&blocked(s,x,y,vehicle)))continue;
        // A rack is approached from its aisle, never walked through.
        if(k===goal&&blocked(s,x,y,vehicle))continue;
        const g=a.g+1;if(g>=(cost.get(k)??Infinity))continue;
        cost.set(k,g);parent.set(k,a.k);open.push({x,y,k,g,f:g+Math.abs(ex-x)+Math.abs(ey-y)});
      }
    }
    return null;
  }
  O.pathing={inside,blocked,path};
})(typeof globalThis !== 'undefined' ? globalThis : window);
