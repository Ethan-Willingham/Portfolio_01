/* Terrain preparation and route searches stay off the input/render thread. */
importScripts('widewake-waterways.js?v=0.43.1','widewake-estuary-core.js?v=0.43.1');
const E=WidewakeEstuary,field=new E.Field();
// The same surveyed bank and working footprints seat every harbor. Grade only
// dry ground, leaving the physical waterway and its depths untouched.
const yardDistance=(x,y)=>E.harborGrade(field.harbors,x,y).distance;
const bankHeight=(edge,x,y)=>E.bankHeight(edge,x,y,field.harbors);

function point(x,y){
  const p=field.sample(x,y),n=E.noise(Math.floor(x/19),Math.floor(y/19)),d=p.depth,s=p.salinity;
  let r,g,b,z=0;
  if(d>0){const shallow=Math.max(0,1-d/5),fresh=1-s;r=.045+fresh*.035+shallow*.11;g=.17+fresh*.045+shallow*.11;b=.255-fresh*.065+shallow*.025;}
  else{const bank=Math.max(0,1+p.edge/10),patch=E.noise(Math.floor(x/96),Math.floor(y/96));z=bankHeight(p.edge,x,y);r=.23+n*.035+patch*.04+bank*.17;g=.285+n*.04+patch*.035+bank*.11;b=.20+n*.025+bank*.04;const colors={jungle:[.20,.34,.25],bells:[.30,.36,.34],glass:[.30,.32,.34],furnace:[.30,.28,.27],crown:[.32,.33,.37],pottery:[.43,.34,.24]};const tint=colors[p.region.name==='Gorilla Narrows'?'jungle':Object.keys(WidewakeWaterways.regions).find(k=>WidewakeWaterways.regions[k]===p.region)];if(tint){r=tint[0]+n*.025+bank*.08;g=tint[1]+n*.025+bank*.06;b=tint[2]+n*.025;}}
  if(d<=0){const grade=E.harborGrade(field.harbors,x,y),wear=E.noise(Math.floor(x/4),Math.floor(y/4)),yard=E.clamp(1-grade.distance/8,0,1),road=E.clamp(1-grade.road/3,0,1),mix=Math.max(yard*.68,road*.94);r=r*(1-mix)+(.47+wear*.035)*mix;g=g*(1-mix)+(.44+wear*.03)*mix;b=b*(1-mix)+(.33+wear*.025)*mix;}
  return[x,y,z,r,g,b,d,s,p.currentX,p.currentY];
}
function tile({x,y,size,step}){
  const n=Math.round(size/step),vertices=new Float32Array(n*n*6*10),rows=[];
  for(let j=0;j<=n;j++){const row=[];for(let i=0;i<=n;i++)row.push(point(x+i*step,y+j*step));rows.push(row);}
  let at=0;for(let j=0;j<n;j++)for(let i=0;i<n;i++)for(const p of [rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j][i],rows[j+1][i+1],rows[j+1][i]]){vertices.set(p,at);at+=10;}
  const props=[];
  if(step<64)for(let j=Math.ceil(y/8)*8;j<y+size;j+=8)for(let i=Math.ceil(x/8)*8;i<x+size;i+=8){const seed=E.noise(i,j),px=i+(seed-.5)*7,py=j+(E.noise(j,i)-.5)*7,p=field.sample(px,py),cluster=(Math.sin(px*.023)+Math.sin(py*.017)+Math.sin(px*.007+py*.011))*.16+.5;let kind=-1,scale=.6+seed*.75;
    if(p.depth<.45&&p.depth>-.85&&p.habitat!=='salt'&&seed>.22)kind=0;
    else if(!['Blackglass Strait','Furnace Passage','Crown Water'].includes(p.region.name)&&p.edge<-10&&p.edge>-210&&seed>.65-cluster*.22&&cluster>.35&&p.habitat!=='salt')kind=1;
    else if(p.edge<-1&&p.edge>-18&&seed>.68)kind=2;
    if(kind>=0&&yardDistance(px,py)>5&&!WidewakeWaterways.landmarks.some(m=>Math.hypot(px-m.x,py-m.y)<({volcano:110,gorilla:27,ribs:65,canopy:55,wheel:52,bell:20,falls:45,basalt:60}[m.kind]||30)*m.scale)&&!field.harbors.some(h=>h.connections.some(p=>Math.abs(px-h.port.x-p.x)<(p.alongY?p.width:p.length)/2+2&&Math.abs(py-h.port.y-p.y)<(p.alongY?p.length:p.width)/2+2)))props.push(px,py,kind===0?Math.max(0,Math.min(.9,-p.depth)):bankHeight(p.edge,px,py),kind,scale);
  }
  return{vertices,props:new Float32Array(props)};
}
self.onmessage=({data})=>{try{
  if(data.kind==='route'){field.time=data.ship.departureTime||0;const result=field.route(data.ship,data.destination);self.postMessage({id:data.id,kind:'route',result});return;}
  const result=tile(data);self.postMessage({id:data.id,key:data.key,kind:'tile',...result},[result.vertices.buffer,result.props.buffer]);
}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
