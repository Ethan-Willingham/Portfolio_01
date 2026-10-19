/* Real coastlines, wrapped geography, water-only routing, and spatial queries. */
(function(root){
  'use strict';
  const SCALE=480, W=360*SCALE, H=180*SCALE;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap=x=>((x%W)+W)%W;
  const dx=(a,b)=>((b-a+W*1.5)%W)-W*.5;
  const point=(lon,lat)=>({x:wrap((lon+180)*SCALE),y:(90-lat)*SCALE});
  const geo=(x,y)=>({lon:wrap(x)/SCALE-180,lat:90-y/SCALE});
  const distance=(a,b)=>Math.hypot(dx(a.x,b.x),b.y-a.y);
  function inside(x,y,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }return yes;}
  function indexRing(ring){const rows=Array.from({length:181},()=>[]);
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if(a[1]===b[1])continue;
      const edge=[a[0],a[1],b[0],b[1],(b[0]-a[0])/(b[1]-a[1])];
      for(let row=Math.max(0,Math.floor(Math.min(a[1],b[1])+90));row<=Math.min(180,Math.floor(Math.max(a[1],b[1])+90));row++)rows[row].push(edge);
    }return rows;
  }
  function insideIndexed(x,y,rows){let yes=false;for(const e of rows[Math.floor(y+90)]||[])if((e[1]>y)!==(e[3]>y)&&x<e[4]*(y-e[1])+e[0])yes=!yes;return yes;}
  class Heap{
    constructor(){this.a=[];}
    push(n){const a=this.a;let i=a.length;a.push(n);while(i){const p=(i-1)>>1;if(a[p].f<=n.f)break;a[i]=a[p];i=p;}a[i]=n;}
    pop(){const a=this.a,r=a[0],n=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=n.f)break;a[i]=a[c];i=c;}a[i]=n;}return r;}
  }
  class Earth{
    constructor(json){
      this.polygons=[];this.bins=new Map();this.grid=null;this.edges=new Int8Array(64800*9);this.links=new Map();
      for(const f of json.features){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
        for(const rings of polys){
          const outer=rings[0];let minX=180,maxX=-180,minY=90,maxY=-90;
          for(const p of outer){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
          const p={rings,indexed:rings.map(indexRing),minX,maxX,minY,maxY};const id=this.polygons.push(p)-1;
          for(let y=Math.floor((minY+90)/10);y<=Math.floor((maxY+90)/10);y++)for(let x=Math.floor((minX+180)/10);x<=Math.floor((maxX+180)/10);x++){
            const key=y*37+x;if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(id);
          }
        }
      }
    }
    land(x,y){
      if(y<5*SCALE||y>174*SCALE)return true;
      const g=geo(x,y),ids=this.bins.get(Math.floor((g.lat+90)/10)*37+Math.floor((g.lon+180)/10))||[];
      for(const id of ids){const p=this.polygons[id];if(g.lon<p.minX||g.lon>p.maxX||g.lat<p.minY||g.lat>p.maxY)continue;
        if(insideIndexed(g.lon,g.lat,p.indexed[0])){let hole=false;for(let i=1;i<p.indexed.length;i++)if(insideIndexed(g.lon,g.lat,p.indexed[i])){hole=true;break;}if(!hole)return true;}
      }return false;
    }
    water(x,y,r=0){return !this.land(x,y)&&(!r||!this.land(x+r,y)&&!this.land(x-r,y)&&!this.land(x,y+r)&&!this.land(x,y-r));}
    clear(a,b,r=15){const vx=dx(a.x,b.x),vy=b.y-a.y,n=Math.max(1,Math.ceil(Math.hypot(vx,vy)/20));
      for(let i=0;i<=n;i++){const t=i/n;if(!this.water(a.x+vx*t,a.y+vy*t,r))return false;}
      // Sampling alone can jump a thin coastal sliver. Check the swept center
      // and clearance rays against real coastline edges as well.
      const ga=geo(a.x,a.y),bx=ga.lon+vx/SCALE,by=ga.lat-vy/SCALE,margin=r/SCALE;
      const minX=Math.min(ga.lon,bx)-margin,maxX=Math.max(ga.lon,bx)+margin,minY=Math.min(ga.lat,by)-margin,maxY=Math.max(ga.lat,by)+margin;
      const rays=r?[[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]]:[[0,0]];
      for(const polygon of this.polygons){if(polygon.maxY<minY||polygon.minY>maxY)continue;
        for(const shift of [-360,0,360]){if(polygon.maxX+shift<minX||polygon.minX+shift>maxX)continue;
          const seen=new Set();for(const rows of polygon.indexed)for(let row=Math.max(0,Math.floor(minY+90));row<=Math.min(180,Math.floor(maxY+90));row++)for(const e of rows[row]||[]){
            if(seen.has(e))continue;seen.add(e);const cx=e[0]+shift,cy=e[1],ex=e[2]-e[0],ey=e[3]-e[1];if(Math.max(cx,cx+ex)<minX||Math.min(cx,cx+ex)>maxX)continue;
            for(const [ox,oy]of rays){const ax=ga.lon+ox,ay=ga.lat+oy,sx=bx-ga.lon,sy=by-ga.lat,den=sx*ey-sy*ex;if(Math.abs(den)<1e-12)continue;const qx=cx-ax,qy=cy-ay,t=(qx*ey-qy*ex)/den,u=(qx*sy-qy*sx)/den;if(t>1e-9&&t<1-1e-9&&u>=0&&u<=1)return false;}
          }
        }
      }return true;
    }
    nearestWater(p,r=32){if(this.water(p.x,p.y,r))return {...p};
      for(let d=24;d<1600;d+=24)for(let a=0;a<Math.PI*2;a+=Math.min(.3,24/d)){
        const q={x:wrap(p.x+Math.cos(a)*d),y:p.y+Math.sin(a)*d};if(this.water(q.x,q.y,r))return q;
      }throw new Error('Could not find a safe anchorage.');
    }
    move(ship,x,y){x=wrap(x);y=clamp(y,5*SCALE+20,174*SCALE-20);
      if(this.water(x,y,ship.radius||12)){ship.x=x;ship.y=y;return true;}
      if(this.water(x,ship.y,ship.radius||12)){ship.x=x;return false;}
      if(this.water(ship.x,y,ship.radius||12)){ship.y=y;return false;}return false;
    }
    makeGrid(){if(this.grid)return;this.grid=new Uint8Array(360*180);
      for(let y=0;y<180;y++)for(let x=0;x<360;x++)this.grid[y*360+x]=this.water((x+.5)*SCALE,(y+.5)*SCALE,20)?1:0;
      // The strait is narrower than a grid cell. Keep its real water corridor
      // as an explicit graph edge rather than letting routes cross either coast.
      const via=[[-6.5,35.9],[-5.75,35.87],[-5.5,35.85],[-5.25,35.87],[-4.5,35.9]].map(p=>point(...p));
      const from=this.cell(via[0]),to=this.cell(via[via.length-1]);
      if(from>=0&&to>=0){const path=[this.cellPoint(from),...via,this.cellPoint(to)];if(path.slice(1).every((p,i)=>this.clear(path[i],p,18))){
        const cost=path.slice(1).reduce((n,p,i)=>n+distance(path[i],p)/SCALE,0);
        this.links.set(from,[{to,via,cost}]);this.links.set(to,[{to:from,via:via.slice().reverse(),cost}]);
      }}
    }
    cell(p){this.makeGrid();const cx=Math.floor(wrap(p.x)/SCALE),cy=Math.floor(p.y/SCALE);
      let best=-1,bd=Infinity;for(let r=0;r<9;r++){for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
        const x=(cx+ox+360)%360,y=cy+oy;if(y<0||y>=180)continue;const id=y*360+x;if(!this.grid[id])continue;
        const q=this.cellPoint(id),d=distance(p,q);if(d<bd&&this.clear(p,q)){best=id;bd=d;}
      }if(best>=0)return best;}return -1;
    }
    cellPoint(id){return {x:((id%360)+.5)*SCALE,y:(Math.floor(id/360)+.5)*SCALE};}
    route(start,end){
      end=this.nearestWater(end,25);if(this.clear(start,end))return [end];
      const from=this.cell(start),to=this.cell(end);if(from<0||to<0)return null;
      const g=new Float64Array(64800);g.fill(Infinity);g[from]=0;
      const prev=new Int32Array(64800);prev.fill(-1);const special=new Map(),closed=new Uint8Array(64800),heap=new Heap();
      const target=this.cellPoint(to),heuristic=id=>distance(this.cellPoint(id),target)/SCALE;
      heap.push({id:from,f:heuristic(from)});let found=false;
      while(heap.a.length){const id=heap.pop().id;if(closed[id])continue;if(id===to){found=true;break;}closed[id]=1;
        const x=id%360,y=Math.floor(id/360),a=this.cellPoint(id);
        for(const link of this.links.get(id)||[]){const n=link.to,ng=g[id]+link.cost;if(!closed[n]&&ng<g[n]){g[n]=ng;prev[n]=id;special.set(n,link.via);heap.push({id:n,f:ng+heuristic(n)});}}
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
          if((!ox&&!oy)||y+oy<5||y+oy>173)continue;const nx=(x+ox+360)%360,n=(y+oy)*360+nx;
          if(!this.grid[n]||closed[n])continue;
          if(ox&&oy&&(!this.grid[y*360+nx]||!this.grid[(y+oy)*360+x]))continue;
          const ng=g[id]+(ox&&oy?Math.SQRT2:1);if(ng>=g[n])continue;
          const edge=id*9+(oy+1)*3+ox+1;
          if(!this.edges[edge])this.edges[edge]=this.clear(a,this.cellPoint(n),18)?1:-1;
          if(this.edges[edge]<0)continue;
          g[n]=ng;prev[n]=id;special.delete(n);heap.push({id:n,f:ng+heuristic(n)});
        }
      }
      if(!found)return null;
      const raw=[end];let id=to;while(id!==from&&id>=0){raw.push(this.cellPoint(id));if(special.has(id))raw.push(...special.get(id).slice().reverse());id=prev[id];}raw.push(this.cellPoint(from));raw.reverse();
      const result=[];let origin=start,i=0;
      while(i<raw.length){let next=i;for(let j=i+1;j<raw.length&&j<i+24;j++){if(this.clear(origin,raw[j],24))next=j;else break;}result.push(raw[next]);origin=raw[next];i=next+1;}
      return result;
    }
  }
  class SpatialHash{
    constructor(size=150){this.size=size;this.map=new Map();this.cols=Math.ceil(W/size);}
    key(x,y){return Math.floor(y/this.size)*this.cols+Math.floor(wrap(x)/this.size);}
    rebuild(items){this.map.clear();for(const s of items){if(s.hp<=0)continue;const key=this.key(s.x,s.y);let b=this.map.get(key);if(!b)this.map.set(key,b=[]);b.push(s);}}
    query(x,y,r,fn){const minY=Math.floor((y-r)/this.size),maxY=Math.floor((y+r)/this.size),minX=Math.floor((x-r)/this.size),maxX=Math.floor((x+r)/this.size);
      for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){
        const key=cy*this.cols+((cx%this.cols)+this.cols)%this.cols,b=this.map.get(key);if(b)for(const s of b)fn(s);
      }
    }
    nearest(x,y,r){let hit=null,d2=r*r;this.query(x,y,r,s=>{if(s.hp<=0)return;const d=dx(x,s.x)**2+(s.y-y)**2;if(d<d2){d2=d;hit=s;}});return hit;}
  }
  const api={Earth,SpatialHash,point,geo,distance,dx,wrap,clamp,SCALE,W,H};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeWorld=api;
})(typeof globalThis!=='undefined'?globalThis:this);
