/* Keeps long ocean route searches off the animation/input thread. */
importScripts('widewake-world.js?v=0.9.0');
let earth;
self.onmessage=e=>{const m=e.data;try{
  if(m.type==='init'){earth=new WidewakeWorld.Earth(m.geojson);earth.makeGrid();self.postMessage({type:'ready'});}
  else if(m.type==='route'){if(!earth)throw new Error('The chart is still loading.');self.postMessage({type:'route',id:m.id,path:earth.route(m.from,m.to)});}
  else if(m.type==='distances'){
    if(!earth)throw new Error('The chart is still loading.');
    const distances=m.targets.map(target=>{const path=earth.route(m.from,target);if(!path)return{id:target.id,distance:null};let previous=m.from,distance=0;for(const point of path){distance+=WidewakeWorld.distance(previous,point);previous=point;}return{id:target.id,distance};});
    self.postMessage({type:'distances',id:m.id,distances});
  }
}catch(err){self.postMessage({type:'error',id:m.id,message:err.message});}};
