// Verification pilot. Applies only the same push, turn and brake forces as a player.
function drive(w) {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  const b=w.body;
  // Recover a real tip with player controls before resuming route following.
  if(w.shopper?.feet>0&&(Math.abs(b.rollTilt)>.35||w._pilotBalance)){
    const f=w.floorAt(b),groundRoll=f?Math.atan(-f.gx*Math.sin(b.a)+f.gy*Math.cos(b.a)):0,error=wrap(b.rollTilt-groundRoll);
    w._pilotBalance=Math.abs(error)>.08;if(w._pilotBalance)return {turn:-Math.sign(error),push:0,brake:.7};
  }
  const level=w.level,next=level.gates[w.gate],previous=level.gates[Math.max(0,w.gate-1)];
  const at=distance=>{const l=level.legs.find(l=>distance<=l.distance+l.length)||level.legs.at(-1),t=clamp((distance-l.distance)/l.length,0,1);return {x:l.a.x+(l.b.x-l.a.x)*t,y:l.a.y+(l.b.y-l.a.y)*t};};
  let target=level.finish,closest=null;
  if(next){
    for(const l of level.legs){if(l.distance+l.length<previous.distance-60||l.distance>next.distance+1)continue;const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,t=clamp(((b.x-l.a.x)*dx+(b.y-l.a.y)*dy)/(l.length*l.length),0,1),x=l.a.x+dx*t,y=l.a.y+dy*t,d=Math.hypot(b.x-x,b.y-y);if(!closest||d<closest.d)closest={d,distance:l.distance+t*l.length,leg:l};}
    target=at((w.roomIndex===5&&b.x<1400&&b.x>1130)?Math.max(next.distance,(closest?.distance||0)+65):Math.min(next.distance,(closest?.distance||0)+28));
  }
  const dx=target.x-b.x,dy=target.y-b.y,d=Math.hypot(dx,dy),speed=w.roomIndex===7&&!w.circuit.powered&&b.x>790&&b.x<910&&b.y>245&&b.y<330?80:w.roomIndex===5&&b.x<1400&&b.x>1130&&Math.abs(b.y-410)<55?175:w.roomIndex===9&&b.y<700?20:Math.min(38,d*1.3);
  const vx=d>1?dx/d*speed:0,vy=d>1?dy/d*speed:0,floor=w.roomIndex===1?null:w.floorAt(b),ax=(vx-b.vx)*2.3+(floor?.gx||0)*200,ay=(vy-b.vy)*2.3+(floor?.gy||0)*200;
  // The bumps require a steady cart heading. Brake excess speed instead of
  // repeatedly turning the basket backward to apply a small deceleration.
  if(w.roomIndex===1&&b.y>1100&&b.x<630){const error=wrap(-Math.PI/2-b.a),slope=w.wheels.reduce((sum,q,i)=>sum+(w.floorAt(w.stock.geometry.casterPose(b,q,i))?.gy||0),0)/4;return {turn:clamp(error*4.5-b.omega*1.3,-1,1),push:Math.abs(error)<.6?clamp(((38+b.vy)*1.5-slope*200)/110,0,1):0,brake:-b.vy>42?.6:0};}
  let error=wrap(Math.atan2(ay,ax)-b.a),sign=1;
  if(Math.abs(error)>Math.PI/2&&!(floor&&ax*floor.gx+ay*floor.gy>2)){error=wrap(error+Math.PI);sign=-1;}
  return {turn:clamp(error*4.5-b.omega*1.3,-1,1),push:Math.abs(error)<.7?clamp(Math.hypot(ax,ay)/(sign===1?110:80),0,1)*sign:0,brake:Math.abs(error)>.6&&Math.hypot(b.vx,b.vy)>38?1:0};
}
module.exports=drive;
