/* Terrain preparation and route searches stay off the input/render thread. */
importScripts('widewake-estuary-core.js?v=0.23.0');
const E=WidewakeEstuary,field=new E.Field();
function point(x,y){
  const p=field.sample(x,y),n=E.noise(Math.floor(x/19),Math.floor(y/19)),d=p.depth,s=p.salinity;
  let r,g,b,z=0;
  if(d>0){const shallow=Math.max(0,1-d/5),fresh=1-s;r=.045+fresh*.035+shallow*.11;g=.17+fresh*.045+shallow*.11;b=.255-fresh*.065+shallow*.025;}
  else{const bank=Math.max(0,1+p.edge/10),patch=E.noise(Math.floor(x/96),Math.floor(y/96));z=Math.min(7,.8-p.edge*.055);r=.23+n*.035+patch*.04+bank*.17;g=.285+n*.04+patch*.035+bank*.11;b=.20+n*.025+bank*.04;}
  return[x,y,z,r,g,b,d,s,p.currentX,p.currentY];
}
function tile({x,y,size,step}){
  const n=Math.round(size/step),vertices=new Float32Array(n*n*6*10),rows=[];
  for(let j=0;j<=n;j++){const row=[];for(let i=0;i<=n;i++)row.push(point(x+i*step,y+j*step));rows.push(row);}
  let at=0;for(let j=0;j<n;j++)for(let i=0;i<n;i++)for(const p of [rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j][i],rows[j+1][i+1],rows[j+1][i]]){vertices.set(p,at);at+=10;}
  const props=[];
  if(step<64)for(let j=Math.ceil(y/8)*8;j<y+size;j+=8)for(let i=Math.ceil(x/8)*8;i<x+size;i+=8){const seed=E.noise(i,j),px=i+(seed-.5)*7,py=j+(E.noise(j,i)-.5)*7,p=field.sample(px,py),cluster=(Math.sin(px*.023)+Math.sin(py*.017)+Math.sin(px*.007+py*.011))*.16+.5;let kind=-1,scale=.6+seed*.75;
    if(p.depth<.45&&p.depth>-.85&&p.habitat!=='salt'&&seed>.22)kind=0;
    else if(p.edge<-10&&p.edge>-210&&seed>.65-cluster*.22&&cluster>.35&&p.habitat!=='salt')kind=1;
    else if(p.edge<-1&&p.edge>-18&&seed>.68)kind=2;
    if(kind>=0&&!E.ports.some(port=>port.id==='reeds'?Math.abs(px-port.x+40)<17&&Math.abs(py-port.y)<14:Math.hypot(px-port.x,py-port.y)<155))props.push(px,py,kind===0?Math.max(0,Math.min(.9,-p.depth)):Math.min(7,.8-p.edge*.055),kind,scale);
  }
  return{vertices,props:new Float32Array(props)};
}
self.onmessage=({data})=>{try{
  if(data.kind==='route'){const result=field.route(data.ship,data.destination);self.postMessage({id:data.id,kind:'route',result});return;}
  const result=tile(data);self.postMessage({id:data.id,key:data.key,kind:'tile',...result},[result.vertices.buffer,result.props.buffer]);
}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
