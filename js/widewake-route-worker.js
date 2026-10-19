/* Keeps long ocean route searches off the animation/input thread. */
importScripts('widewake-world.js?v=0.1.1');
let earth;
self.onmessage=e=>{const m=e.data;try{
  if(m.type==='init'){earth=new WidewakeWorld.Earth(m.geojson);earth.makeGrid();self.postMessage({type:'ready'});}
  else if(m.type==='route'){if(!earth)throw new Error('The chart is still loading.');self.postMessage({type:'route',id:m.id,path:earth.route(m.from,m.to)});}
}catch(err){self.postMessage({type:'error',id:m.id,message:err.message});}};
