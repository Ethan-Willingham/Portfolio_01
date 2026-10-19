/* Keeps long ocean route searches off the animation/input thread. */
importScripts('widewake-world.js?v=0.13.0');
let earth;
self.onmessage=e=>{const m=e.data;try{
  if(m.type==='init'){earth=new WidewakeWorld.Earth(m.geojson);earth.makeGrid();for(const trip of m.recoveries||[])earth.route(trip.from,trip.to,13,13);self.postMessage({type:'ready',grid:earth.grid,links:[...earth.links],edges:earth.edges,coasts:[...earth.coastRoutes]});}
  else if(m.type==='route'){if(!earth)throw new Error('The chart is still loading.');const path=earth.route(m.from,m.to);self.postMessage({type:'route',id:m.id,path,edges:earth.edges});}
  else if(m.type==='distances'){
    if(!earth)throw new Error('The chart is still loading.');
    const distances=m.targets.map(target=>{const path=earth.route(m.from,target);if(!path)return{id:target.id,distance:null};let previous=m.from,distance=0;for(const point of path){distance+=WidewakeWorld.distance(previous,point);previous=point;}return{id:target.id,distance};});
    self.postMessage({type:'distances',id:m.id,distances});
  }
}catch(err){self.postMessage({type:'error',id:m.id,message:err.message});}};
