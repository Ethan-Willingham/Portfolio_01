/* Bracken Reach. Metres, authored waterways, shared depth and full-hull clearance.
   Pure simulation. This review region never opens the campaign save. */
(function(root){
  'use strict';
  const W=root.WidewakeWaterways||(typeof require==='function'?require('./widewake-waterways.js'):null);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=Math.PI*2;
  const bounds=Object.freeze({left:-4000,right:4000,top:-8000,bottom:4000});
  const vessels=Object.freeze({
    launch:{name:'Kite',label:'Launch',length:6,width:2.3,height:1.6,draft:.45,speed:12,hp:200,radius:2},
    gunboat:{name:'Wren',label:'Escort',length:38,width:12,height:7,draft:2.6,speed:31,hp:1500,radius:12},
    oilrig:{name:'Cairn',label:'Industrial',length:61,width:32,height:30,draft:4.2,speed:16,hp:3400,radius:23}
  });
  // x, y, half width, centre depth. All branches share their actual junctions.
  const channels=[
    {id:'main',name:'Main channel',nodes:[[500,1800,900,17],[450,1100,500,13],[100,500,230,10],[-100,-200,150,9],[-350,-900,100,8],[-50,-1600,75,7],[1100,-2100,80,7],[1400,-2700,75,7],[300,-3300,70,6.5],[-550,-3700,95,7],[-750,-4300,85,7],[-350,-4800,120,7],[100,-5100,110,7]]},
    {id:'yard',name:'Tern Yard',nodes:[[100,500,130,9],[-200,650,115,9],[-550,600,115,9]]},
    {id:'cut',name:'Reed cut',nodes:[[-50,-1600,16,1.65],[-200,-1900,15,1.55],[-380,-2200,25,1.8],[-100,-2450,14,1.5],[0,-2800,17,1.65],[300,-3300,18,1.7]]}
  ];
  channels.push(...W.channels);
  const ports=Object.freeze([
    {id:'yard',name:'Tern Yard',x:-550,y:600,description:'Sheltered boatyard',piers:[{x:0,y:-88,length:65,width:8,alongY:true},{x:-7,y:-56,length:22,width:6,alongY:false}]},
    {id:'mill',name:'Lockmill',x:100,y:-5100,description:'Freshwater mill',piers:[{x:-42,y:-100,length:56,width:9,alongY:true},{x:-54,y:-73,length:32,width:7,alongY:false}]},
    {id:'reeds',name:'Reed Landing',x:-380,y:-2200,description:'Shallow access',piers:[{x:-23,y:0,length:25,width:3,alongY:false}]}
  ,...W.ports]);
  const noise=(x,y)=>{const t=Math.sin(x*12.9898+y*78.233)*43758.5453;return t-Math.floor(t);};
  function spline(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
  function samples(channel){const result=[],n=channel.nodes;
    for(let i=0;i<n.length-1;i++){const a=n[Math.max(0,i-1)],b=n[i],c=n[i+1],d=n[Math.min(n.length-1,i+2)],steps=Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/24);
      for(let j=0;j<steps;j++){const t=j/steps;result.push({x:spline(a[0],b[0],c[0],d[0],t),y:spline(a[1],b[1],c[1],d[1],t),width:b[2]+(c[2]-b[2])*t,depth:b[3]+(c[3]-b[3])*t,channel:channel.id});}}
    const last=n.at(-1);result.push({x:last[0],y:last[1],width:last[2],depth:last[3],channel:channel.id});return result;
  }
  class Field{
    constructor(){this.time=0;this.segments=[];this.grid=new Map();this.paths=channels.map(c=>({...c,points:samples(c)}));this.nodes=[];this.obstacles=ports.flatMap(port=>port.piers.map(p=>({x:port.x+p.x,y:port.y+p.y,hx:(p.alongY?p.width:p.length)*.5,hy:(p.alongY?p.length:p.width)*.5})));
      const junctions=new Map();
      for(const path of this.paths){let previous;
        for(const point of path.points){const key=Math.round(point.x)+','+Math.round(point.y);let index=junctions.get(key);
          if(index===undefined){index=this.nodes.length;this.nodes.push({...point,edges:[]});junctions.set(key,index);}
          point.node=index;
          if(previous!==undefined){const a=this.nodes[previous],b=this.nodes[index],distance=Math.hypot(a.x-b.x,a.y-b.y);a.edges.push({to:index,distance,channel:path.id});b.edges.push({to:previous,distance,channel:path.id});}
          previous=index;
        }
        for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,r=Math.max(a.width,b.width)+24,segment={a,b,dx,dy,d2,id:path.id},index=this.segments.length;this.segments.push(segment);
          for(let y=Math.floor((Math.min(a.y,b.y)-r)/256);y<=Math.floor((Math.max(a.y,b.y)+r)/256);y++)for(let x=Math.floor((Math.min(a.x,b.x)-r)/256);x<=Math.floor((Math.max(a.x,b.x)+r)/256);x++){const key=x+','+y;let bucket=this.grid.get(key);if(!bucket)this.grid.set(key,bucket=[]);bucket.push(index);}}
      }
    }
    sample(x,y,out={}){
      const shore=1280+Math.sin(x*.0017)*90+Math.sin(x*.0041)*32,sea=y-shore;
      let edge=sea,depth=sea>0?Math.min(22,sea*.035):sea*.12,cx=0,cy=sea>0?.22:0,channel=sea>0?'sea':null;
      const bucket=this.grid.get(Math.floor(x/256)+','+Math.floor(y/256));
      if(bucket)for(const index of bucket){const s=this.segments[index],t=clamp(((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/s.d2,0,1),dx=x-s.a.x-s.dx*t,dy=y-s.a.y-s.dy*t,d=Math.hypot(dx,dy),r=s.a.width+(s.b.width-s.a.width)*t,e=r-d;
        edge=Math.max(edge,e);const base=s.a.depth+(s.b.depth-s.a.depth)*t,value=e>0?base*(1-(d/r)**4):e*.12;
        if(value>depth){depth=value;channel=s.id;const speed=s.id==='yard'?.08:s.id==='cut'?.45:clamp(.65+(-y/5000),.3,1.3),direction=s.id==='main'?-1:1,len=Math.sqrt(s.d2);cx=s.dx/len*speed*direction;cy=s.dy/len*speed*direction;}}
      const border=Math.min(x-bounds.left,bounds.right-x,y-bounds.top,bounds.bottom-y);if(border<0){edge=border;depth=border*.2;channel=null;}
      out.depth=depth;out.edge=edge;out.salinity=clamp((y+2400)/3900,0,1);out.currentX=depth>0?cx:0;out.currentY=depth>0?cy:0;out.channel=channel;out.habitat=channel==='cut'?'reeds':y<-2200?'river':y<800?'estuary':'salt';out.region=W.region(x,y,channel);out.heat=0;out.hazard=null;if(depth>0)W.flow(x,y,this.time,out);return out;
    }
    obstruction(ship,x=ship.x,y=ship.y,angle=ship.angle){
      // Separating axes catch even the three-metre pier, independently of the
      // depth grid. These are the same metre-scale footprints used by the art.
      const c=Math.cos(angle),s=Math.sin(angle),ac=Math.abs(c),as=Math.abs(s),hx=ship.length*.5,hy=ship.width*.5;
      for(const p of this.obstacles){const dx=x-p.x,dy=y-p.y;if(Math.abs(dx)>p.hx+hx*ac+hy*as+.15||Math.abs(dy)>p.hy+hx*as+hy*ac+.15)continue;if(Math.abs(dx*c+dy*s)>hx+p.hx*ac+p.hy*as+.15||Math.abs(-dx*s+dy*c)>hy+p.hx*as+p.hy*ac+.15)continue;return true;}return false;
    }
    clearance(ship,x=ship.x,y=ship.y,angle=ship.angle,margin=.12){
      if(this.obstruction(ship,x,y,angle))return -1;
      const radius=Math.hypot(ship.length,ship.width)*.5,border=Math.min(x-bounds.left,bounds.right-x,y-bounds.top,bounds.bottom-y),bucket=this.grid.get(Math.floor(x/256)+','+Math.floor(y/256));
      // A containing circle gives a conservative fast acceptance in clear water.
      // Close to a bank, fall through to the oriented hull and its interior.
      if(border>radius){
        const sea=y-(1280+Math.sin(x*.0017)*90+Math.sin(x*.0041)*32)-radius*1.3;
        if(sea*.035>ship.draft+margin)return Math.min(22,sea*.035)-ship.draft;
        if(bucket)for(const index of bucket){const s=this.segments[index],t=clamp(((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/s.d2,0,1),d=Math.hypot(x-s.a.x-s.dx*t,y-s.a.y-s.dy*t)+radius,r=Math.min(s.a.width,s.b.width),depth=Math.min(s.a.depth,s.b.depth)*(1-(d/r)**4);if(d<r&&depth>=ship.draft+margin)return depth-ship.draft;}
      }
      const cos=Math.cos(angle),sin=Math.sin(angle),nx=Math.ceil(ship.length/3),ny=Math.ceil(ship.width/3),sample={};let min=Infinity;
      // The whole conservative hull rectangle, including its interior, is sampled.
      // No obstacle in this region is thinner than this three-metre sampling grid.
      for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){const a=(i/nx-.5)*ship.length,b=(j/ny-.5)*ship.width,d=this.sample(x+cos*a-sin*b,y+sin*a+cos*b,sample).depth-ship.draft;min=Math.min(min,d);if(d<margin)return min;}
      return min;
    }
    legClear(ship,a,b){const angle=Math.atan2(b.y-a.y,b.x-a.x),distance=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(distance/6));
      for(let i=0;i<=n;i++){const t=i/n;if(this.clearance(ship,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,angle,.2)<.2)return false;}return true;
    }
    route(ship,destination){
      const target=typeof destination==='object'&&destination&&Number.isFinite(destination.x)&&Number.isFinite(destination.y)?destination:ports.find(p=>p.id===destination);if(!target)return null;
      const sheltered=ship.routePolicy!=='direct';
      const nodes=this.nodes,count=nodes.length,dist=new Float64Array(count).fill(Infinity),prev=new Int32Array(count).fill(-1),used=new Uint8Array(count),via=new Array(count);
      const candidates=nodes.map((n,i)=>({i,d:Math.hypot(n.x-ship.x,n.y-ship.y)})).sort((a,b)=>a.d-b.d).slice(0,16);
      for(const c of candidates)if(this.legClear(ship,ship,nodes[c.i]))dist[c.i]=c.d;
      const goal=nodes.reduce((best,n,i)=>Math.hypot(n.x-target.x,n.y-target.y)<Math.hypot(nodes[best].x-target.x,nodes[best].y-target.y)?i:best,0);
      for(let k=0;k<count;k++){let at=-1,best=Infinity;for(let i=0;i<count;i++)if(!used[i]&&dist[i]<best){best=dist[i];at=i;}if(at<0)break;if(at===goal)break;used[at]=1;
        for(const edge of nodes[at].edges){const to=nodes[edge.to],cost=edge.distance*(1+(sheltered?W.passageRisk((nodes[at].x+to.x)/2,(nodes[at].y+to.y)/2):0));if(used[edge.to]||dist[edge.to]<=best+cost)continue;if(!this.legClear(ship,nodes[at],to))continue;dist[edge.to]=best+cost;prev[edge.to]=at;via[edge.to]=edge.channel;}}
      if(!Number.isFinite(dist[goal])||!this.legClear(ship,nodes[goal],target))return null;
      const points=[],branches=new Set();for(let at=goal;at!==-1;at=prev[at]){points.push({x:nodes[at].x,y:nodes[at].y});if(via[at])branches.add(via[at]);}points.reverse();if(Math.hypot(points.at(-1).x-target.x,points.at(-1).y-target.y)>1)points.push({x:target.x,y:target.y});
      let distance=0,seconds=4,tier=0,last=ship,heading=ship.angle||0;const hazards=new Set(),speed=ship.cruiseSpeed||ship.speed||12;
      for(const point of points){const dx=point.x-last.x,dy=point.y-last.y,d=Math.hypot(dx,dy);if(d>.01){const water=this.sample((last.x+point.x)/2,(last.y+point.y)/2),angle=Math.atan2(dy,dx),bend=Math.abs(Math.atan2(Math.sin(angle-heading),Math.cos(angle-heading)));distance+=d;seconds+=d/Math.max(2,speed*.98+(water.currentX*dx+water.currentY*dy)/d)+bend*.6;heading=angle;tier=Math.max(tier,water.region.tier);if(water.hazard)hazards.add(water.hazard);}last=point;}
      const named=[...branches].filter(id=>!['main','yard','cut'].includes(id));
      return{destination:target,points,distance,seconds,tier,hazards:[...hazards],policy:sheltered?'sheltered':'direct',name:named.length?channels.find(c=>c.id===named[0]).name:branches.has('cut')?'Reed cut':'Main channel',index:0};
    }
  }
  function createShip(type='launch'){const spec=vessels[type],port=ports[0];return{id:0,type,...spec,maxHp:spec.hp,x:port.x,y:port.y,px:port.x,py:port.y,angle:0,previousAngle:0,vx:0,vy:0,hit:0,working:false};}
  class Navigation{
    constructor({type='launch',field=new Field()}={}){
      this.field=field;this.ships=[createShip(type)];this.visualRoles=vessels;this.time=0;this.tick=0;this.control={x:0,y:0};this.mounts=[];this.raiders={count:0};this.shots={count:0};this.effects={count:0};this.burstCursor=48;this.lastHit={time:-10};this.contact='';this.contactTime=0;this.route=null;this.arrived=null;this.visited=new Set(['yard']);this.distance=0;this.water={};this.field.sample(this.player.x,this.player.y,this.water);
    }
    get player(){return this.ships[0];}
    plan(id){return this.field.route(this.player,id);}
    setCourse(plan){if(!plan)return false;this.route={...plan,index:0};this.arrived=null;return true;}
    cancel(){this.route=null;}
    move(input,dt){
      const B=root.WidewakeBattle,s=this.player,old={x:s.x,y:s.y,angle:s.angle};B.helmStep(s,input,dt);
      const current=this.field.sample(old.x,old.y,this.water);s.x+=current.currentX*dt;s.y+=current.currentY*dt;
      const dx=s.x-old.x,dy=s.y-old.y,da=B.angleDelta(s.angle,old.angle),steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)+Math.abs(da)*s.length*.5));let safe=0;
      let pier=false;for(let i=1;i<=steps;i++){const t=i/steps,x=old.x+dx*t,y=old.y+dy*t,angle=old.angle+da*t;if(this.field.clearance(s,x,y,angle)<.12){pier=this.field.obstruction(s,x,y,angle);break;}safe=t;}
      if(safe<1){s.x=old.x+dx*safe;s.y=old.y+dy*safe;s.angle=old.angle+da*safe;s.vx=s.vy=s.turn=s.throttle=0;this.contact=pier?'Pier ahead':this.water.depth<s.draft+.3?'Shallow water':'Bank ahead';this.contactTime=2.5;this.route=null;}
      return Math.hypot(s.x-old.x,s.y-old.y);
    }
    step(dt,input={x:0,y:0}){
      dt=clamp(dt,0,1/30);const s=this.player;s.px=s.x;s.py=s.y;s.previousAngle=s.angle;this.time+=dt;this.field.time=this.time;this.tick++;this.control=input;this.contactTime=Math.max(0,this.contactTime-dt);if(!this.contactTime)this.contact='';
      const manual=Math.hypot(input.x||0,input.y||0)>.04||Math.abs(input.throttle||0)>.04||Math.abs(input.steer||0)>.04;if(manual){this.route=null;this.arrived=null;}
      let drive=input;
      if(this.route){const r=this.route;while(r.index<r.points.length-1&&Math.hypot(r.points[r.index].x-s.x,r.points[r.index].y-s.y)<Math.max(7,s.speed*.65))r.index++;
        const p=r.points[r.index],dx=p.x-s.x,dy=p.y-s.y,d=Math.hypot(dx,dy),end=r.index===r.points.length-1,amount=end?Math.min(.65,d/(s.speed*1.6)):1;
        // Slow before bends instead of discovering the bank at full speed.
        const next=r.points[Math.min(r.index+2,r.points.length-1)],bend=Math.abs(root.WidewakeBattle.angleDelta(Math.atan2(next.y-p.y,next.x-p.x),s.angle)),throttle=amount*(bend>.65?.45:bend>.3?.72:1);
        drive={x:dx/(d||1)*throttle,y:dy/(d||1)*throttle};
        if(end&&d<Math.max(5,s.length*.25)&&Math.hypot(s.vx,s.vy)<3){this.arrived=r.destination;this.visited.add(r.destination.id);this.route=null;drive={x:0,y:0};}
      }
      if(this.arrived&&!manual){s.vx=s.vy=s.turn=s.throttle=0;this.field.sample(s.x,s.y,this.water);return;}
      this.distance+=this.move(drive,dt);this.field.sample(s.x,s.y,this.water);
    }
    report(){const s=this.player;return{type:s.type,x:s.x,y:s.y,distance:this.distance,depth:this.water.depth,clearance:this.field.clearance(s),salinity:this.water.salinity,contact:this.contact,route:this.route?.destination.id||null,arrived:this.arrived?.id||null,visited:[...this.visited]};}
  }
  const api={Field,Navigation,vessels,ports,channels,bounds,noise,clamp};root.WidewakeEstuary=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
