/* Height fields and six-degree cart dynamics. Ground contacts are unilateral:
 * they can push, never pull. Lost tire support changes the actual contact torque;
 * no boundary crossing switches off recovery. All geometry stays in world space.
 */
(function(root){
  'use strict';
  const G=200, PITCH_INERTIA=480, ROLL_INERTIA=230, YAW_INERTIA=470;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const normalize=p=>{const d=Math.hypot(p.x,p.y,p.z)||1;return {x:p.x/d,y:p.y/d,z:p.z/d};};
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function configure(level){
    level.terrain={
      profiles:[
        {chapter:0,knots:[[0,0],[.14,0],[.28,10],[.4,0],[1,0]]},
        {chapter:3,knots:[[0,0],[.2,0],[.42,18],[.68,18],[.9,0],[1,0]]},
        {chapter:4,knots:[[0,0],[.15,25],[.38,72],[.63,72],[.88,12],[1,0]]},
        {chapter:11,knots:[[0,0],[.1,0],[.75,60],[1,60]]}
      ],
      bumps:{x:590,y:1230,a:-Math.PI/2,width:154,centers:[46,80,114,148],length:30,height:4.5},
      boost:{x:1350,y:410,a:Math.PI,length:45,width:104,acceleration:165},
      ramp:{x:1305,y:410,a:Math.PI,length:55,width:234,height:18},
      gap:{x:1250,y:410,a:Math.PI,length:70,width:248},
      ice:{x:2110,y:495,a:Math.PI/2,length:168,width:76},
      circuit:{table:6,tray:{x:882,y:270,w:50,h:40},terminals:[{x:899,y:290},{x:919,y:290}],
        shutter:{x:947,y:235,w:6,h:110,side:'shutter',poly:[{x:947,y:235},{x:953,y:235},{x:953,y:345},{x:947,y:345}]}}
    };
    for(const f of level.terrain.profiles){const s=level.sections[f.chapter];f.legs=level.legs.filter(l=>l.chapter===f.chapter);f.start=s.startDistance;f.length=s.endDistance-s.startDistance;f.width=s.width/2+s.shoulder+25;f.box={left:Math.min(...s.path.map(p=>p.x))-f.width,right:Math.max(...s.path.map(p=>p.x))+f.width,top:Math.min(...s.path.map(p=>p.y))-f.width,bottom:Math.max(...s.path.map(p=>p.y))+f.width};}
  }
  function coordinates(p,f){const c=Math.cos(f.a),s=Math.sin(f.a),x=p.x-f.x,y=p.y-f.y;return {u:x*c+y*s,v:-x*s+y*c};}
  function inStrip(p,f,margin=0){const q=coordinates(p,f);return q.u>=-margin&&q.u<=f.length+margin&&Math.abs(q.v)<=f.width/2+margin;}
  function profile(p,f){
    // Nearest-leg ordering needs squared distance, not a square root and a
    // temporary object for every segment in every height/gradient sample.
    let bestDistance=Infinity,bestT=0,bestLeg=null;
    for(const l of f.legs){const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,t=clamp(((p.x-l.a.x)*dx+(p.y-l.a.y)*dy)/(l.length*l.length),0,1),x=p.x-l.a.x-t*dx,y=p.y-l.a.y-t*dy,d=x*x+y*y;if(d<bestDistance){bestDistance=d;bestT=t;bestLeg=l;}}
    if(!bestLeg||bestDistance>f.width*f.width)return 0;
    const at=clamp((bestLeg.distance+bestLeg.length*bestT-f.start)/f.length,0,1);
    for(let i=1;i<f.knots.length;i++)if(at<=f.knots[i][0]){const a=f.knots[i-1],b=f.knots[i],u=clamp((at-a[0])/(b[0]-a[0]),0,1),t=u*u*(3-2*u);return a[1]+(b[1]-a[1])*t;}
    return f.knots.at(-1)[1];
  }
  function height(level,p){
    const t=level.terrain;if(!t)return 0;
    let z=0;for(const f of t.profiles)if(p.x>=f.box.left&&p.x<=f.box.right&&p.y>=f.box.top&&p.y<=f.box.bottom)z=Math.max(z,profile(p,f));
    const b=t.bumps,q=coordinates(p,b);
    if(Math.abs(q.v)<b.width/2)for(const center of b.centers){const u=(q.u-center)/(b.length/2);if(Math.abs(u)<1)z+=b.height*(1+Math.cos(u*Math.PI))/2;}
    if(inStrip(p,t.ramp)){const q=coordinates(p,t.ramp);z+=t.ramp.height*q.u/t.ramp.length;}
    return z;
  }
  function sample(level,p,base,gradient=true){
    const t=level.terrain;if(!t)return {...base,height:0,gx:0,gy:0};
    if(inStrip(p,t.gap)&&coordinates(p,t.gap).u>.01&&coordinates(p,t.gap).u<t.gap.length-.01)return null;
    const h=height(level,p),d=.3,gx=gradient?(height(level,{x:p.x+d,y:p.y})-height(level,{x:p.x-d,y:p.y}))/(2*d):0,gy=gradient?(height(level,{x:p.x,y:p.y+d})-height(level,{x:p.x,y:p.y-d}))/(2*d):0;
    const ice=inStrip(p,t.ice),boost=inStrip(p,t.boost);
    return {...base,kind:ice?'ice':base.kind,grip:ice?.07:base.grip,drag:ice?.085:base.drag,height:h,gx,gy,boost};
  }
  // The tilt quaternion has no singularity at a sideways or upside-down pose.
  // Heading remains the planar control axis; pitchRate/rollRate are angular
  // velocity components about that heading's Y/X axes, not Euler derivatives.
  function attitude(b){
    if(b.qw!==undefined&&b.tiltPitch===b.pitch&&b.tiltRoll===b.rollTilt)return {w:b.qw,x:b.qx,y:b.qy,z:b.qz};
    const p=(b.pitch||0)/2,r=(b.rollTilt||0)/2;
    return {w:Math.cos(r)*Math.cos(p),x:Math.sin(r)*Math.cos(p),y:Math.cos(r)*Math.sin(p),z:Math.sin(r)*Math.sin(p)};
  }
  function rotate(q,p){
    const t={x:2*(q.y*p.z-q.z*p.y),y:2*(q.z*p.x-q.x*p.z),z:2*(q.x*p.y-q.y*p.x)};
    return {x:p.x+q.w*t.x+q.y*t.z-q.z*t.y,y:p.y+q.w*t.y+q.z*t.x-q.x*t.z,z:p.z+q.w*t.z+q.x*t.y-q.y*t.x};
  }
  function storeAttitude(b,q){
    const n=Math.hypot(q.w,q.x,q.y,q.z)||1,twist=2*Math.atan2(q.z,q.w),c=Math.cos(twist/2),s=Math.sin(twist/2),old=b.a;
    b.qw=(q.w*c+q.z*s)/n;b.qx=(q.x*c+q.y*s)/n;b.qy=(q.y*c-q.x*s)/n;b.qz=0;
    b.a=wrap(old+twist);b.x+=(b.comX||0)*(Math.cos(old)-Math.cos(b.a));b.y+=(b.comX||0)*(Math.sin(old)-Math.sin(b.a));
    const rx=b.rollRate||0,ry=b.pitchRate||0;b.rollRate=rx*Math.cos(twist)+ry*Math.sin(twist);b.pitchRate=-rx*Math.sin(twist)+ry*Math.cos(twist);
    const up=rotate(attitude({...b,tiltPitch:b.pitch,tiltRoll:b.rollTilt}),{x:0,y:0,z:1});
    b.pitch=Math.atan2(up.x,Math.hypot(up.y,up.z));b.rollTilt=Math.atan2(-up.y,up.z);b.tiltPitch=b.pitch;b.tiltRoll=b.rollTilt;
  }
  function kinematics(b,x,y,z=0){
    const c=Math.cos(b.a),s=Math.sin(b.a),v=rotate(attitude(b),{x:x-(b.comX||0),y,z:z-(b.comHeight||0)}),X=v.x,Y=v.y,Z=v.z;
    return {p:{x:b.x+(b.comX||0)*c+X*c-Y*s,y:b.y+(b.comX||0)*s+X*s+Y*c,z:(b.z||0)+(b.comHeight||0)+Z},
      pitch:{x:c*Z,y:s*Z,z:-X},roll:{x:s*Z,y:-c*Z,z:Y},yaw:{x:-X*s-Y*c,y:X*c-Y*s,z:0}};
  }
  function localVector(b,v){const c=Math.cos(b.a),s=Math.sin(b.a),q=attitude(b);return rotate({w:q.w,x:-q.x,y:-q.y,z:-q.z},{x:c*v.x+s*v.y,y:-s*v.x+c*v.y,z:v.z});}
  function contactAt(b,p,n){
    const v=localVector(b,{x:p.x-b.x-(b.comX||0)*Math.cos(b.a),y:p.y-b.y-(b.comX||0)*Math.sin(b.a),z:p.z-(b.z+b.comHeight)}),k=kinematics(b,v.x+(b.comX||0),v.y,v.z+b.comHeight);
    return {k,n,jp:dot(k.pitch,n),jr:dot(k.roll,n),ja:dot(k.yaw,n),js:0,casterInverse:0};
  }
  function pointImpulse(w,p,j){
    const b=w.body,k=contactAt(b,p,{x:0,y:0,z:1}).k;
    b.vx+=j.x;b.vy+=j.y;b.vz+=j.z;b.pitchRate+=dot(k.pitch,j)/PITCH_INERTIA;b.rollRate+=dot(k.roll,j)/ROLL_INERTIA;b.omega+=dot(k.yaw,j)/YAW_INERTIA;
  }
  function velocity(b,k){return {x:b.vx+b.pitchRate*k.pitch.x+b.rollRate*k.roll.x+b.omega*k.yaw.x,y:b.vy+b.pitchRate*k.pitch.y+b.rollRate*k.roll.y+b.omega*k.yaw.y,z:b.vz+b.pitchRate*k.pitch.z+b.rollRate*k.roll.z};}
  function initShopper(w){
    const b=w.body,c=Math.cos(b.a),s=Math.sin(b.a),x=b.x-16*c,y=b.y-16*s,floor=w.floorAt({x,y});
    w.shopper={x,y,z:(floor?.height??b.z)+18,vx:b.vx,vy:b.vy,vz:b.vz,leanX:0,leanY:0,leanVX:0,leanVY:0,feet:floor?1:0,crouch:0,grip:1};
    w.ragdoll=null;
  }
  // Pelvis, chest, head, then paired hips, shoulders, elbows, hands, knees,
  // ankles. The torso is braced; the limbs keep independent momentum.
  const RAG_PAIRS=[[0,1],[0,3],[0,4],[0,5],[0,6],[1,3],[1,4],[1,5],[1,6],[3,4],[3,5],[3,6],[4,5],[4,6],[5,6],[1,2],[5,7],[7,9],[6,8],[8,10],[3,11],[11,13],[4,12],[12,14]];
  const RAG_RADIUS=[2.8,3.5,4,2.4,2.4,2.5,2.5,1.6,1.6,1.3,1.3,1.8,1.8,2,2];
  const RAG_INVERSE=[1,1,2,2,2,2,2,4,4,5,5,3,3,4,4];
  function ragdollPose(w){
    const p=w.shopper,b=w.body,c=Math.cos(b.a),s=Math.sin(b.a),g=w.gait;
    const at=(x,y,z)=>({x:p.x+x*c-y*s,y:p.y+x*s+y*c,z:p.z+z});
    const vector=(x,y,z)=>({x:x*c-y*s,y:x*s+y*c,z});
    const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
    const joint=(a,b,l1,l2,hint)=>{const delta=sub(b,a),distance=Math.hypot(delta.x,delta.y,delta.z),axis=normalize(delta),scale=Math.max(1,distance/(l1+l2-.06));l1*=scale;l2*=scale;const d=clamp(distance,Math.abs(l1-l2)+.001,l1+l2-.001),along=(l1*l1-l2*l2+d*d)/(2*d),projection=dot(axis,hint);let bend=sub(hint,{x:axis.x*projection,y:axis.y*projection,z:axis.z*projection});if(Math.hypot(bend.x,bend.y,bend.z)<.001)bend=vector(0,1,0);bend=normalize(bend);const radius=Math.sqrt(Math.max(0,l1*l1-along*along));return {x:a.x+axis.x*along+bend.x*radius,y:a.y+axis.y*along+bend.y*radius,z:a.z+axis.z*along+bend.z*radius};};
    const sway=Math.cos(g.phase||0)*clamp((g.stride||0)/2.8,0,1)*.24,lx=p.leanX,ly=p.leanY+sway;
    const nodes=[at(0,0,0),at(lx*10.1/11.5,ly*10.1/11.5,10.1),at(lx,ly,18.5)];
    for(const side of [-1,1])nodes.push(at(0,side*2.65,-.1));
    for(const side of [-1,1])nodes.push(at(lx*10.1/11.5,side*4.7+ly*10.1/11.5,10.1));
    const hands=[-1,1].map(side=>kinematics(b,-6,side*8.7,30).p);
    hands.forEach((hand,i)=>nodes.push(joint(nodes[5+i],hand,8.5,8.8,vector(-.7,(i?1:-1)*.85,-.4))));nodes.push(...hands);
    const ankles=[-1,1].map(side=>{const t=(((g.phase||0)/(Math.PI*2)+(side===1?.5:0))%1+1)%1,swing=Math.max(0,(t-.6)/.4),reach=t<.6?1-t/.3:-1+2*swing*swing*(3-2*swing),travel=reach*(g.stride||0),lift=Math.sin(swing*Math.PI)*clamp((g.stride||0)/2.8,0,1)*3.6;const foot=at(travel*(g.forward??1)-1,side*3.35+travel*(g.sideways||0)*.65,-18+lift),floor=w.floorAt(foot);if(p.feet&&floor)foot.z=floor.height+lift;else foot.z=Math.min(foot.z,p.z-10+lift);foot.z+=2.1;return foot;});
    ankles.forEach((ankle,i)=>nodes.push(joint(nodes[3+i],ankle,10,10,vector(1,(i?1:-1)*.12,0))));nodes.push(...ankles);return nodes;
  }
  function releaseShopper(w){
    if(w.ragdoll)return;
    const b=w.body,p=w.shopper,pose=ragdollPose(w),away=normalize({x:p.x-b.x,y:p.y-b.y,z:0}),side={x:-away.y,y:away.x,z:0},spin={x:side.x*6.8+away.x*2.4,y:side.y*6.8+away.y*2.4,z:(b.omega||0)+2.2};
    const nodes=pose.map(q=>{const r={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z};return {...q,vx:p.vx+away.x*65+spin.y*r.z-spin.z*r.y,vy:p.vy+away.y*65+spin.z*r.x-spin.x*r.z,vz:Math.max(0,p.vz)+132+spin.x*r.y-spin.y*r.x,supported:false};});
    w.ragdoll={nodes,lengths:RAG_PAIRS.map(([i,j])=>Math.hypot(pose[i].x-pose[j].x,pose[i].y-pose[j].y,pose[i].z-pose[j].z)),time:0,impactTime:null};
    p.feet=0;p.grip=0;w.ground.feet=0;
    w.emit('shopper-launch',{x:p.x,y:p.y,z:p.z});
  }
  function validRagdoll(r){
    return r&&Array.isArray(r.nodes)&&r.nodes.length===15&&r.nodes.every(n=>n&&['x','y','z','vx','vy','vz'].every(k=>Number.isFinite(n[k])&&Math.abs(n[k])<20000)&&typeof n.supported==='boolean')&&Array.isArray(r.lengths)&&r.lengths.length===RAG_PAIRS.length&&r.lengths.every(n=>Number.isFinite(n)&&n>.01&&n<70)&&Number.isFinite(r.time)&&r.time>=0&&r.time<30&&(r.impactTime===null||Number.isFinite(r.impactTime)&&r.impactTime>=0&&r.impactTime<=r.time);
  }
  function ragdollStep(w,dt){
    if(dt<=0)return;
    const r=w.ragdoll,old=r.nodes.map(n=>({...n})),planes=[];r.time+=dt;
    for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i];n.vz-=G*dt;n.vx*=Math.exp(-.18*dt);n.vy*=Math.exp(-.18*dt);n.x+=n.vx*dt;n.y+=n.vy*dt;n.z+=n.vz*dt;const f=w.floorAt(n);planes[i]=f&&(old[i].z>=f.height+RAG_RADIUS[i]-1||n.supported)?f.height:w.fall.plane;n.supported=false;}
    // Project bone lengths after ballistic motion. This exchanges momentum
    // between joints without attaching any of them back to the cart.
    for(let pass=0;pass<10;pass++){
      RAG_PAIRS.forEach(([i,j],k)=>{const a=r.nodes[i],b=r.nodes[j],delta={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},d=Math.hypot(delta.x,delta.y,delta.z)||1,correction=(d-r.lengths[k])/d,wa=RAG_INVERSE[i]/(RAG_INVERSE[i]+RAG_INVERSE[j]),wb=1-wa;for(const key of ['x','y','z']){a[key]+=delta[key]*correction*wa;b[key]-=delta[key]*correction*wb;}});
      for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i],z=planes[i]+RAG_RADIUS[i];if(n.z<z){n.z=z;n.supported=true;}}
    }
    for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i],before=old[i];n.vx=(n.x-before.x)/dt;n.vy=(n.y-before.y)/dt;n.vz=(n.z-before.z)/dt;if(n.supported){n.vx*=Math.exp(-10*dt);n.vy*=Math.exp(-10*dt);if(before.vz< -18&&!before.supported)n.vz=Math.max(n.vz,-before.vz*.23);else n.vz=Math.max(0,n.vz);if(r.impactTime===null){r.impactTime=0;w.emit('shopper-impact',{kind:w.fall.kind,x:n.x,y:n.y,z:planes[i],impact:Math.max(0,-before.vz)});}}}
    if(r.impactTime!==null)r.impactTime+=dt;
    const pelvis=r.nodes[0];Object.assign(w.shopper,{x:pelvis.x,y:pelvis.y,z:pelvis.z,vx:pelvis.vx,vy:pelvis.vy,vz:pelvis.vz,feet:0,grip:0});w.ground.feet=0;
  }
  // A spring-mass pelvis, braced legs and two compliant arms. A planted shopper
  // can oppose a tip; an airborne shopper has no ground force to spend.
  function walkingStance(w,hand){
    const b=w.body,c=Math.cos(b.a),s=Math.sin(b.a),stance={x:b.x-16*c,y:b.y-16*s};
    const floor=w.floorAt(stance);
    // Shorten the step toward the handle, or sidestep, at a lip. Tracking an
    // unsupported usual stance would immediately walk a rescued shopper off again.
    if(!floor){const a=Math.atan2(hand.y-stance.y,hand.x-stance.x);
      for(let reach=2;reach<=10;reach+=2)for(const offset of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2]){const p={x:stance.x+Math.cos(a+offset)*reach,y:stance.y+Math.sin(a+offset)*reach},support=w.floorAt(p);if(support&&[[3,0],[-3,0],[0,3],[0,-3]].every(([x,y])=>w.isFloor({x:p.x+x,y:p.y+y})))return {...p,floor:support};}
    }
    return {...stance,floor};
  }
  function shopperStep(w,dt,input){
    if(w.ragdoll){ragdollStep(w,dt);return;}
    const b=w.body,p=w.shopper,c=Math.cos(b.a),s=Math.sin(b.a),hand=kinematics(b,-6,0,30),hv=velocity(b,hand),floor=w.floorAt(p);
    const stance=walkingStance(w,hand.p),gripFloor=floor&&p.z-floor.height<26&&p.z-floor.height>=8&&!w.fall;
    // The supported cart can brace a short step back onto the lip, or help a
    // saved hanging pose stand up. The arms supply the lift until feet actually
    // plant. No foothold, a deep drop or an airborne cart cannot supply this help.
    const replant=!gripFloor&&!w.fall&&!w.ground.airborne&&w.ground.count>=2&&stance.floor&&p.z>=stance.floor.height-6&&p.z<stance.floor.height+26&&hand.p.z>stance.floor.height+12&&Math.hypot(stance.x-p.x,stance.y-p.y)<18;
    p.feet=gripFloor?Math.sqrt(floor.grip):0;
    const turn=clamp(input.turn||0,-1,1)*(p.feet?1:0),push=clamp(input.push||0,-1,1)*(p.feet?1:0);
    const shift=turn*5*p.feet,back=10+push*1.8;
    const target={x:hand.p.x-back*c-shift*s,y:hand.p.y-back*s+shift*c,z:hand.p.z-12};
    if(replant)Object.assign(target,{x:stance.x,y:stance.y,z:stance.floor.height+18});
    // Soft hand tether. It transmits equal/opposite impulses at handle height.
    const f={x:clamp((target.x-p.x)*34+(hv.x-p.vx)*7,-150,150),y:clamp((target.y-p.y)*34+(hv.y-p.vy)*7,-150,150),z:clamp((target.z-p.z)*26+(hv.z-p.vz)*6,-170,170)};
    if(replant){f.x=clamp((target.x-p.x)*60+(b.vx-p.vx)*12,-180,180);f.y=clamp((target.y-p.y)*60+(b.vy-p.vy)*12,-180,180);f.z=clamp((target.z-p.z)*60-p.vz*12+G,-170,480);}
    const extension=Math.hypot(hand.p.x-p.x,hand.p.y-p.y,hand.p.z-(p.z+11));p.grip=clamp(1-(extension-19)/12,.15,1);
    if(gripFloor){
      const crouch=clamp((30-hand.p.z+floor.height)*.35,0,7);p.crouch+=(crouch-p.crouch)*Math.min(1,10*dt);
      p.vz+=clamp((floor.height+18-p.crouch-p.z)*110-p.vz*18+G,-G,420)*dt;
      // Feet track the walking stance, with finite traction rather than a weld.
      const fx=(stance.x-p.x)*28+(b.vx-p.vx)*8,fy=(stance.y-p.y)*28+(b.vy-p.vy)*8;
      p.vx+=clamp(fx,-180,180)*p.feet*dt;p.vy+=clamp(fy,-180,180)*p.feet*dt;
    }else {p.crouch*=Math.exp(-5*dt);}
    p.vx+=f.x*dt;p.vy+=f.y*dt;p.vz+=(f.z-G)*dt;
    // The shopper is lighter than the cart and their legs carry their own weight.
    pointImpulse(w,hand.p,{x:-f.x*.3*dt,y:-f.y*.3*dt,z:-f.z*.3*dt});
    // Shifting the stance loads one hand and unloads the other. This finite
    // torque is available through the same steering/push controls during a tip.
    if(p.feet){
      const rollGain=clamp((Math.abs(b.rollTilt)-.06)/.35,0,1),pitchGain=w.edge.threat?clamp(Math.abs(b.pitch)/.25,0,1):clamp((Math.abs(b.pitch)-.28)/.4,0,1);
      b.rollRate+=turn*1800*rollGain*p.feet*dt/ROLL_INERTIA;
      b.pitchRate+=push*5000*pitchGain*p.feet*dt/PITCH_INERTIA;
    }
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    if(w.fall&&p.z<w.fall.plane+12){p.z=w.fall.plane+12;p.vz=Math.max(0,-p.vz*.08);}
    if(gripFloor&&p.z<floor.height+8){p.z=floor.height+8;p.vz=Math.max(0,p.vz);}
    const localV={x:c*(p.vx-hv.x)+s*(p.vy-hv.y),y:-s*(p.vx-hv.x)+c*(p.vy-hv.y)};
    const lx=clamp(localV.x*.13+push*1.4+(hand.p.z-(p.z+12))*.12,-5,5),ly=clamp(localV.y*.13-turn*2,-5,5);
    p.leanVX+=((lx-p.leanX)*70-p.leanVX*12)*dt;p.leanVY+=((ly-p.leanY)*70-p.leanVY*12)*dt;p.leanX+=p.leanVX*dt;p.leanY+=p.leanVY*dt;
    w.ground.feet=p.feet;
  }
  function init(w,geometry){
    w.terrainGeometry=geometry;
    const b=w.body,ground=w.floorAt(b),c=Math.cos(b.a),s=Math.sin(b.a);
    Object.assign(b,{comX:10,comHeight:16,z:(ground?.height||0)+22*(Math.sqrt(1+(ground?.gx||0)**2+(ground?.gy||0)**2)-1),vz:0,pitch:ground?-Math.atan(ground.gx*c+ground.gy*s):0,rollTilt:ground?Math.atan(-ground.gx*s+ground.gy*c):0,pitchRate:0,rollRate:0});
    const c0=Math.cos(b.a),s0=Math.sin(b.a),heights=[[-4.5,-12],[21.5,-12],[-4.5,12],[21.5,12]].map(([x,y])=>w.floorAt({x:b.x+x*c0-y*s0,y:b.y+x*s0+y*c0})?.height??ground?.height??0);
    b.pitch=-Math.atan(((heights[1]+heights[3])-(heights[0]+heights[2]))/52);b.rollTilt=Math.atan(((heights[2]+heights[3])-(heights[0]+heights[1]))/48);
    b.tiltPitch=NaN;storeAttitude(b,attitude(b));b.z=0;
    b.z=Math.max(...[[-4.5,-12],[21.5,-12],[-4.5,12],[21.5,12]].map(([x,y],i)=>heights[i]-kinematics(b,x,y).p.z));initShopper(w);
    w.wheels.forEach(q=>{q.load=1;q.groundZ=b.z;});
    w.ground={feet:w.shopper.feet,count:4,airborne:false,lastHeight:b.z,hangTime:0,flightTime:0,impact:0,boosting:false};
    w.edge={risk:0,count:4,threat:false};w.circuit={powered:false,connected:false,charge:0,lift:0,clock:0,refillTime:0,path:[]};
    w.level.circuitState=w.circuit;w.terrainStats={jumps:0,landings:0,saves:0,maxHeight:b.z,boosts:0};
  }
  function contacts(w){
    const b=w.body,g=w.terrainGeometry,list=[];
    for(let i=0;i<4;i++){
      const q=w.wheels[i],a=q.fixed?0:q.a-b.a,side=(i%2?-1:1)*g.CASTER.axleOffset,center={x:g.WHEELS[i][0]-g.CASTER.trail*Math.cos(a)-side*Math.sin(a),y:g.WHEELS[i][1]-g.CASTER.trail*Math.sin(a)+side*Math.cos(a),z:4},axle=kinematics(b,center.x,center.y,4).p,f=w.floorAt(axle),n=normalize({x:-(f?.gx||0),y:-(f?.gy||0),z:1}),ln=localVector(b,n),axis={x:-Math.sin(a),y:Math.cos(a),z:0},d=dot(ln,axis),radial=normalize({x:ln.x-axis.x*d,y:ln.y-axis.y*d,z:ln.z});
      // A cylindrical tire meets the floor on its curved tread or sidewall.
      list.push({x:center.x-4*radial.x-2*Math.sign(d)*axis.x,y:center.y-4*radial.y-2*Math.sign(d)*axis.y,z:4-4*radial.z,wheel:i});
    }
    for(const [x,y,z]of [[-1,-12,9],[-1,12,9],[28,-12,9],[28,12,9],[-3,-11,31],[-3,11,31],[31,-11,31],[31,11,31],[-6,-12,30],[-6,12,30]])list.push({x,y,z,wheel:-1});
    return list;
  }
  function impulse(b,q,j){
    b.vx+=j*q.n.x;b.vy+=j*q.n.y;b.vz+=j*q.n.z;
    b.pitchRate+=j*q.jp/PITCH_INERTIA;b.rollRate+=j*q.jr/ROLL_INERTIA;b.omega+=j*q.ja/YAW_INERTIA;if(q.caster)q.caster.omega+=j*q.js*q.casterInverse;
  }
  function advance(w,dt,input={}){
    const b=w.body,ground=w.ground,wasAirborne=ground.airborne;
    if(w.fall&&!w.ragdoll)releaseShopper(w);
    shopperStep(w,dt,input);
    b.vz-=G*dt;
    b.pitchRate*=Math.exp(-.22*dt);b.rollRate*=Math.exp(-.22*dt);
    const list=contacts(w),active=[];let spatial=0,boostCount=0,impact=0;
    w.wheels.forEach(q=>q.load=0);
    for(const q of list){
      const k=kinematics(b,q.x,q.y,q.z);const floor=w.fall?{height:w.fall.plane,gx:0,gy:0,grip:.65}:w.floorAt(k.p);q.k=k;q.floor=floor;
      if(q.wheel>=0&&floor){spatial++;w.wheels[q.wheel].groundZ=floor.height;}
      if(!floor)continue;
      const gap=k.p.z-floor.height;
      // A tire can roll back over the lip while within its radius. A body far
      // below the top cannot teleport through the underside of the platform.
      if(gap>1.3)continue;
      let wall=null;
      if(gap< -4&&!w.fall){
        let best=null;
        for(let i=0;i<8;i++){const a=i*Math.PI/4,nx=Math.cos(a),ny=Math.sin(a);for(let distance=2;distance<=24;distance+=2)if(!w.isFloor({x:k.p.x+nx*distance,y:k.p.y+ny*distance})){if(!best||distance<best.distance)best={nx,ny,distance};break;}}
        if(best&&(!w.isFloor(b)||b.z<ground.lastHeight-20)){wall={x:best.nx,y:best.ny,z:0};q.side=true;q.sideDepth=best.distance;}
      }
      q.n=wall||normalize({x:-floor.gx,y:-floor.gy,z:1});q.jp=dot(k.pitch,q.n);q.jr=dot(k.roll,q.n);q.ja=dot(k.yaw,q.n);
      // Swivel changes tire height on a tilted chassis. Its contact impulse
      // exchanges angular momentum with the fork and the body.
      q.js=0;q.casterInverse=0;if(q.wheel>=0&&!w.wheels[q.wheel].fixed){const pivot=w.terrainGeometry.WHEELS[q.wheel],v=kinematics(b,b.comX-(q.y-pivot[1]),q.x-pivot[0],b.comHeight).p;q.js=dot({x:v.x-b.x-b.comX*Math.cos(b.a),y:v.y-b.y-b.comX*Math.sin(b.a),z:v.z-b.z-b.comHeight},q.n);q.caster=w.wheels[q.wheel];q.casterInverse=1/w.terrainGeometry.CASTER.inertia;q.ja-=q.js;}
      q.mass=1+q.js*q.js*q.casterInverse+q.jp*q.jp/PITCH_INERTIA+q.jr*q.jr/ROLL_INERTIA+q.ja*q.ja/YAW_INERTIA;
      const velocity=b.vx*q.n.x+b.vy*q.n.y+b.vz*q.n.z+b.pitchRate*q.jp+b.rollRate*q.jr+b.omega*q.ja+(q.caster?.omega||0)*q.js;
      q.target=q.side?Math.min(28,q.sideDepth*.12/dt):gap<0?Math.min(28,-gap*.12/dt):-gap/dt;
      if(velocity< -24)q.target=Math.max(q.target,-velocity*(q.wheel>=0?.035:.08));
      q.impulse=0;active.push(q);impact=Math.max(impact,-velocity);
    }
    for(let pass=0;pass<10;pass++)for(const q of active){
      const velocity=b.vx*q.n.x+b.vy*q.n.y+b.vz*q.n.z+b.pitchRate*q.jp+b.rollRate*q.jr+b.omega*q.ja+(q.caster?.omega||0)*q.js;
      const next=Math.max(0,q.impulse+(q.target-velocity)/q.mass),j=next-q.impulse;q.impulse=next;impulse(b,q,j);
    }
    for(const q of active){
      if(q.wheel>=0&&!q.side){w.wheels[q.wheel].load=clamp(q.impulse/(G*dt*.133333),0,2);if(q.floor.boost&&q.impulse>0)boostCount++;}
    }
    ground.count=active.filter(q=>q.impulse>1e-5&&q.wheel>=0&&!q.side).length;ground.airborne=!active.some(q=>q.impulse>1e-5&&!q.side);
    // Basket and frame contacts scrape, rather than spin freely through the road.
    for(const q of active)if(q.wheel<0&&q.impulse>0){const v=velocity(b,q.k),n=q.n,normal=dot(v,n),t={x:v.x-normal*n.x,y:v.y-normal*n.y,z:v.z-normal*n.z},speed=Math.hypot(t.x,t.y,t.z);if(speed>.01){const mag=Math.min(speed*.18,q.impulse*.45);pointImpulse(w,q.k.p,{x:-t.x/speed*mag,y:-t.y/speed*mag,z:-t.z/speed*mag});}}
    // Arms bend freely until taut. Their maximum reach is a unilateral tether,
    // exchanging momentum at the handle rather than stretching the elbows.
    const hand=kinematics(b,-6,0,30),person=w.shopper,delta={x:hand.p.x-person.x,y:hand.p.y-person.y,z:hand.p.z-person.z-11},reach=Math.hypot(delta.x,delta.y,delta.z),n=normalize(delta),arm=contactAt(b,hand.p,n),hv=velocity(b,hand),closing=dot({x:hv.x-person.vx,y:hv.y-person.vy,z:hv.z-person.vz},n);
    if(!w.ragdoll&&reach+closing*dt>22){const mass=1+1/.3+arm.jp*arm.jp/PITCH_INERTIA+arm.jr*arm.jr/ROLL_INERTIA+arm.ja*arm.ja/YAW_INERTIA,j=Math.max(0,(closing+(reach-22)*.18/dt)/mass);pointImpulse(w,hand.p,{x:-n.x*j,y:-n.y*j,z:-n.z*j});person.vx+=n.x*j/.3;person.vy+=n.y*j/.3;person.vz+=n.z*j/.3;}
    // Solve velocities before integrating pose. Resting contact then has zero
    // vertical velocity, instead of a repeated corrective bounce each tick.
    b.z+=b.vz*dt;const attitudeNow=attitude(b),rx=b.rollRate*dt/2,ry=b.pitchRate*dt/2;
    storeAttitude(b,{w:attitudeNow.w-rx*attitudeNow.x-ry*attitudeNow.y,x:attitudeNow.x+rx*attitudeNow.w+ry*attitudeNow.z,y:attitudeNow.y+ry*attitudeNow.w-rx*attitudeNow.z,z:attitudeNow.z+rx*attitudeNow.y-ry*attitudeNow.x});
    ground.flightTime=ground.airborne?ground.flightTime+dt:0;
    if(ground.count){
      if(!w.fall)ground.lastHeight=active.reduce((sum,q)=>sum+q.floor.height,0)/active.length;
      if(!w.fall&&wasAirborne&&ground.hangTime>.12){w.terrainStats.landings++;w.emit('land',{x:b.x,y:b.y,impact});}
      ground.hangTime=0;
    }else ground.hangTime+=dt;
    if(!w.fall&&!wasAirborne&&ground.airborne&&b.vz>8){w.terrainStats.jumps++;w.emit('jump',{x:b.x,y:b.y,vz:b.vz});}
    if(boostCount){const f=w.level.terrain.boost,force=f.acceleration*boostCount/4;b.vx+=Math.cos(f.a)*force*dt;b.vy+=Math.sin(f.a)*force*dt;if(!ground.boosting){w.terrainStats.boosts++;w.emit('boost',{x:b.x,y:b.y});}}
    ground.boosting=boostCount>0;ground.impact=impact;w.terrainStats.maxHeight=Math.max(w.terrainStats.maxHeight,b.z);
    w.unsupported=w.wheels.map(q=>q.load<.02);
    const risk=spatial<4&&!ground.airborne?clamp((4-spatial)/3+Math.abs(b.rollTilt)*.3,0,1):0;
    let threat=w.edge.threat||risk>.3;if(!w.fall&&threat&&spatial===4&&ground.count>=3){w.terrainStats.saves++;w.emit('save-edge',{x:b.x,y:b.y});threat=false;}
    w.edge={risk,count:spatial,threat};
    // Falls become committed only after the body really drops beneath the lip.
    // Until then the usual drive, pull, brake and contact forces remain active.
    if(!w.fall&&((b.z<ground.lastHeight-38&&ground.airborne))){
      const hazard=w.hazardAt(b),back=w.catchPose();w.fall={kind:hazard.kind,time:0,vz:b.vz,pitch:b.pitch,roll:b.rollTilt,catch:back,impactTime:null,plane:hazard.kind==='lake'?-50:-100};
      releaseShopper(w);w.falls++;w.messes++;w.lostDistance=Math.max(0,w.distance-back.distance);w.emit('fall',{kind:hazard.kind,x:b.x,y:b.y,seconds:0,lost:w.lostDistance,catch:back.chapter});
    }
    if(w.fall){const f=w.fall;f.time+=dt;f.vz=b.vz;
      const bottom=Math.min(...list.map(q=>kinematics(b,q.x,q.y,q.z).p.z));
      if(f.impactTime===null&&(bottom<=f.plane+.1||active.some(q=>q.impulse>0))){f.impactTime=0;f.impactSpeed=impact;b.vx*=.65;b.vy*=.65;w.emit('fall-impact',{kind:f.kind,x:b.x,y:b.y,impact:f.impactSpeed});}
      if(f.impactTime!==null){f.impactTime+=dt;b.vx*=Math.exp(-2*dt);b.vy*=Math.exp(-2*dt);}
      if(f.impactTime!==null&&f.impactTime>1&&(w.ragdoll.impactTime!==null&&w.ragdoll.impactTime>.4||f.time>3.5))recover(w);
    }
  }
  function recover(w){
    const pose=w.fall.catch;Object.assign(w.body,{...pose.pose,vx:0,vy:0,omega:0});w.gate=pose.gate;w.roomIndex=pose.chapter;w.distance=pose.distance;
    w.wheels.forEach(q=>Object.assign(q,{a:w.body.a,omega:0,speed:0}));const circuit=w.circuit,stats=w.terrainStats;init(w,w.terrainGeometry);w.circuit=circuit;w.level.circuitState=circuit;w.terrainStats=stats;
    Object.assign(w.gait,{stride:0,leanX:0,leanY:0,speed:0});w.fall=null;w.unsupported=[];w.boundaryContacts=[];w.emit('respawn',{room:w.roomIndex});
  }
  function circuitConnection(w){
    const cells=w.stock.liquids.get('water')?.cells;if(!cells)return [];
    const t=w.level.terrain.circuit,cols=w.stock.cols,CELL=4,wet=new Set();
    for(let y=Math.floor(t.tray.y/CELL)-2;y<=Math.ceil((t.tray.y+t.tray.h)/CELL)+2;y++)for(let x=Math.floor(t.tray.x/CELL)-2;x<=Math.ceil((t.tray.x+t.tray.w)/CELL)+2;x++){const key=y*cols+x;if((cells.get(key)||0)>=.035)wet.add(key);}
    const near=(key,p)=>Math.hypot((key%cols+.5)*CELL-p.x,(Math.floor(key/cols)+.5)*CELL-p.y)<=5;
    const queue=[...wet].filter(k=>near(k,t.terminals[0])),seen=new Set(queue),parents=new Map();
    for(let i=0;i<queue.length;i++){const k=queue[i];if(near(k,t.terminals[1])){const path=[];let at=k;while(at!==undefined){path.push(at);at=parents.get(at);}return path;}
      for(const next of [k-1,k+1,k-cols,k+cols])if(wet.has(next)&&!seen.has(next)){seen.add(next);parents.set(next,k);queue.push(next);}
    }return [];
  }
  function circuitStep(w,dt){
    const c=w.circuit;c.clock+=dt;if(c.clock>=.05){c.clock=0;c.path=circuitConnection(w);c.connected=c.path.length>0;}
    c.charge=clamp(c.charge+(c.connected?dt:-dt*2),0,.3);
    if(!c.powered&&c.charge>=.3){c.powered=true;w.emit('circuit',{x:919,y:290});}
    if(c.powered)c.lift=Math.min(1,c.lift+dt*.8);
  }
  const api={G,PITCH_INERTIA,ROLL_INERTIA,attitude,rotate,storeAttitude,contactAt,pointImpulse,velocity,initShopper,validRagdoll,configure,height,sample,coordinates,inStrip,kinematics,init,advance,recover,circuitStep,circuitConnection};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartTerrain=api;
})(typeof globalThis!=='undefined'?globalThis:this);
