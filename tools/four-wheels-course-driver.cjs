// Verification pilot. Applies only the same push, turn and brake forces as a player.
function drive(w) {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  const b=w.body,level=w.level,next=level.gates[w.gate],previous=level.gates[Math.max(0,w.gate-1)];
  const at=distance=>{const l=level.legs.find(l=>distance<=l.distance+l.length)||level.legs.at(-1),t=clamp((distance-l.distance)/l.length,0,1);return {x:l.a.x+(l.b.x-l.a.x)*t,y:l.a.y+(l.b.y-l.a.y)*t};};
  let target=level.finish,closest=null;
  if(next){
    for(const l of level.legs){if(l.distance+l.length<previous.distance-60||l.distance>next.distance+1)continue;const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,t=clamp(((b.x-l.a.x)*dx+(b.y-l.a.y)*dy)/(l.length*l.length),0,1),x=l.a.x+dx*t,y=l.a.y+dy*t,d=Math.hypot(b.x-x,b.y-y);if(!closest||d<closest.d)closest={d,distance:l.distance+t*l.length,leg:l};}
    target=at(Math.min(next.distance,(closest?.distance||0)+28));
  }
  const dx=target.x-b.x,dy=target.y-b.y,d=Math.hypot(dx,dy),speed=Math.min(38,d*1.3);
  const vx=d>1?dx/d*speed:0,vy=d>1?dy/d*speed:0,ax=(vx-b.vx)*2.3,ay=(vy-b.vy)*2.3;
  let error=wrap(Math.atan2(ay,ax)-b.a),sign=1;
  if(Math.abs(error)>Math.PI/2){error=wrap(error+Math.PI);sign=-1;}
  return {turn:clamp(error*4.5-b.omega*1.3,-1,1),push:Math.abs(error)<.7?clamp(Math.hypot(ax,ay)/(sign===1?78:50),0,1)*sign:0,brake:Math.abs(error)>.6&&Math.hypot(b.vx,b.vy)>38?1:0};
}
module.exports=drive;
