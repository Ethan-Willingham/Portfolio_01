/* Daylight Globe camera optics. No DOM, renderer or network dependencies.
   Occlusion uses the displayed spheres, not an eclipse prediction for Earth.
   Spherical-cap area is analytic; limb-weighted flux integrates continuous
   angular arc unions with 16-point Gaussian quadrature. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GlobeOptics = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PI = Math.PI, TAU = 2 * PI;
  var NODES = [.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
  var WEIGHTS = [.1894506104550685,.1826034150449236,.1691565193950025,.1495959888165767,.1246289712555339,.09515851168249278,.06225352393864789,.027152459411754095];
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function dot(a,b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
  function subtract(a,b) { return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}; }
  function cross(a,b) { return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}; }
  function unit(vector) {
    var length=Math.hypot(vector.x,vector.y,vector.z);
    if(!Number.isFinite(length)||length===0) throw new RangeError('Invalid optics vector');
    return {x:vector.x/length,y:vector.y/length,z:vector.z/length};
  }
  function angleBetween(a,b) { a=unit(a);b=unit(b);var c=cross(a,b);return Math.atan2(Math.hypot(c.x,c.y,c.z),dot(a,b)); }
  function positiveRadius(value) { if(!Number.isFinite(value)||value<0) throw new RangeError('Invalid optics radius');return value; }
  function circleOverlapArea(firstRadius,secondRadius,separation) {
    var a=positiveRadius(firstRadius),b=positiveRadius(secondRadius),d=positiveRadius(separation);
    if(!a||!b||d>=a+b)return 0;
    if(d<=Math.abs(a-b))return PI*Math.min(a,b)*Math.min(a,b);
    var x=clamp((d*d+a*a-b*b)/(2*d*a),-1,1),y=clamp((d*d+b*b-a*a)/(2*d*b),-1,1);
    var triangle=Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
    return clamp(a*a*Math.acos(x)+b*b*Math.acos(y)-triangle/2,0,PI*Math.min(a,b)*Math.min(a,b));
  }
  function capArea(radius) { return 4*PI*Math.pow(Math.sin(radius/2),2); }
  function capOverlapArea(firstRadius,secondRadius,separation) {
    var a=positiveRadius(firstRadius),b=positiveRadius(secondRadius),d=positiveRadius(separation);
    if(a>PI/2||b>PI/2||d>PI)throw new RangeError('Spherical disk exceeds hemisphere');
    if(!a||!b||d>=a+b)return 0;
    if(d<=Math.abs(a-b))return capArea(Math.min(a,b));
    // Replacing cosine subtraction with sine products preserves small disks.
    var cosA=(2*Math.sin((d+b)/2)*Math.sin((d-b)/2)+Math.cos(d)*2*Math.pow(Math.sin(a/2),2))/(Math.sin(a)*Math.sin(d));
    var cosB=(2*Math.sin((d+a)/2)*Math.sin((d-a)/2)+Math.cos(d)*2*Math.pow(Math.sin(b/2),2))/(Math.sin(b)*Math.sin(d));
    var A=Math.acos(clamp(cosA,-1,1)),B=Math.acos(clamp(cosB,-1,1)),s=(a+b+d)/2;
    var excess=4*Math.atan(Math.sqrt(Math.max(0,Math.tan(s/2)*Math.tan((s-a)/2)*Math.tan((s-b)/2)*Math.tan((s-d)/2))));
    return clamp(4*A*Math.pow(Math.sin(a/2),2)+4*B*Math.pow(Math.sin(b/2),2)-2*excess,0,capArea(Math.min(a,b)));
  }
  function sphereDisk(camera,center,radius) {
    radius=positiveRadius(radius);var delta=subtract(center,camera),distance=Math.hypot(delta.x,delta.y,delta.z);
    if(!Number.isFinite(distance))throw new RangeError('Invalid sphere center');
    var inside=distance<=radius;
    return {direction:distance?unit(delta):{x:0,y:0,z:1},distance:distance,radius:radius,angularRadius:inside?PI/2:Math.asin(clamp(radius/distance,0,1)),inside:inside};
  }
  function tangentBasis(direction) {
    var helper=Math.abs(direction.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
    var first=unit(cross(helper,direction));return {first:first,second:cross(direction,first)};
  }
  function intervalUnionLength(intervals) {
    if(!intervals.length)return 0;
    intervals.sort(function(a,b){return a[0]-b[0];});
    var total=0,left=intervals[0][0],right=intervals[0][1];
    for(var i=1;i<intervals.length;i++){
      if(intervals[i][0]<=right)right=Math.max(right,intervals[i][1]);
      else{total+=right-left;left=intervals[i][0];right=intervals[i][1];}
    }
    return total+right-left;
  }
  function blockedArc(theta,occluders) {
    var intervals=[];
    for(var i=0;i<occluders.length;i++){
      var disk=occluders[i],d=disk.separation,b=disk.angularRadius;
      if(d<1e-12){if(theta<=b)return TAU;continue;}
      var q=(2*Math.sin((d+b)/2)*Math.sin((d-b)/2)+Math.cos(d)*2*Math.pow(Math.sin(theta/2),2))/(Math.sin(d)*Math.sin(theta));
      if(q>=1)continue;if(q<=-1)return TAU;
      var half=Math.acos(clamp(q,-1,1)),left=disk.azimuth-half,right=disk.azimuth+half;
      if(left<0){intervals.push([left+TAU,TAU]);left=0;}
      if(right>TAU){intervals.push([0,right-TAU]);right=TAU;}
      intervals.push([left,right]);
    }
    return intervalUnionLength(intervals);
  }
  function integrateVisibility(source,occluders,limbDarkening) {
    var a=source.angularRadius,k=Math.sin(a),cuts=[0,1],area=0,totalArea=0,flux=0,totalFlux=0,samples=0;
    // mu is the photosphere normal/view cosine. Tangent rings divide the
    // integral, avoiding point-sample popping at first and last contact.
    occluders.forEach(function(disk){
      [Math.abs(disk.separation-disk.angularRadius),disk.separation+disk.angularRadius].forEach(function(theta){
        if(theta>0&&theta<a)cuts.push(Math.sqrt(Math.max(0,1-Math.pow(Math.sin(theta)/k,2))));
      });
    });
    cuts.sort(function(x,y){return x-y;});
    for(var segment=1;segment<cuts.length;segment++){
      var half=(cuts[segment]-cuts[segment-1])/2,middle=(cuts[segment]+cuts[segment-1])/2;
      if(half<1e-14)continue;
      for(var n=0;n<NODES.length;n++)for(var sign=-1;sign<=1;sign+=2){
        var mu=middle+sign*half*NODES[n],sinTheta=k*Math.sqrt(Math.max(0,1-mu*mu)),theta=Math.asin(sinTheta);
        var weight=WEIGHTS[n]*half*k*k*mu/Math.sqrt(1-sinTheta*sinTheta),visible=clamp(1-blockedArc(theta,occluders)/TAU,0,1),intensity=1-limbDarkening+limbDarkening*mu;
        totalArea+=weight;area+=weight*visible;totalFlux+=weight*intensity;flux+=weight*intensity*visible;samples++;
      }
    }
    return {visibleFraction:clamp(area/totalArea,0,1),fluxFraction:clamp(flux/totalFlux,0,1),samples:samples};
  }
  // source and occluders are {center:{x,y,z},radius:Number,name?:String}.
  // All occluders must lie wholly nearer than the source. The Sun/Earth/Moon
  // scene satisfies this; intersecting source/occluder depth is unsupported.
  function sunVisibility(camera,sourceSphere,occluderSpheres,options) {
    var source=sphereDisk(camera,sourceSphere.center,sourceSphere.radius),basis=tangentBasis(source.direction),occluders=[];
    var limbDarkening=options&&options.limbDarkening!==undefined?Number(options.limbDarkening):.6;
    if(!Number.isFinite(limbDarkening)||limbDarkening<0||limbDarkening>1)throw new RangeError('Invalid limb darkening');
    if(source.inside||source.radius===0)throw new RangeError('Camera must be outside the Sun');
    if(occluderSpheres.length>2)throw new RangeError('At most Earth and Moon are supported');
    for(var i=0;i<occluderSpheres.length;i++){
      var sphere=occluderSpheres[i],disk=sphereDisk(camera,sphere.center,sphere.radius);
      if(disk.distance-disk.radius>=source.distance+source.radius)continue;
      if(disk.inside)return {visibleFraction:0,fluxFraction:0,samples:0,source:source,occluders:occluders};
      if(disk.distance+disk.radius>=source.distance-source.radius)throw new RangeError('Overlapping source depth is unsupported');
      disk.name=sphere.name||'';disk.separation=angleBetween(source.direction,disk.direction);
      disk.azimuth=(Math.atan2(dot(disk.direction,basis.second),dot(disk.direction,basis.first))+TAU)%TAU;
      disk.coveredFraction=capOverlapArea(source.angularRadius,disk.angularRadius,disk.separation)/capArea(source.angularRadius);
      if(disk.separation>=source.angularRadius+disk.angularRadius)continue;
      occluders.push(disk);
      if(disk.angularRadius>=disk.separation+source.angularRadius)return {visibleFraction:0,fluxFraction:0,samples:0,source:source,occluders:occluders};
    }
    if(!occluders.length)return {visibleFraction:1,fluxFraction:1,samples:0,source:source,occluders:occluders};
    // Remove a smaller foreground cap wholly inside another cap. A Moon
    // already hidden by Earth cannot dim the Sun a second time.
    if(occluders.length===2){
      var separation=angleBetween(occluders[0].direction,occluders[1].direction);
      if(separation+occluders[0].angularRadius<=occluders[1].angularRadius)occluders.shift();
      else if(separation+occluders[1].angularRadius<=occluders[0].angularRadius)occluders.pop();
    }
    var result=integrateVisibility(source,occluders,limbDarkening);
    if(occluders.length===1)result.visibleFraction=clamp(1-occluders[0].coveredFraction,0,1);
    if(limbDarkening===0&&occluders.length===1)result.fluxFraction=result.visibleFraction;
    result.source=source;result.occluders=occluders;return result;
  }
  function frameEarthSun(cameraRadius,earthRadius,sunSeparation,sunAngularRadius,margin) {
    positiveRadius(cameraRadius);positiveRadius(earthRadius);positiveRadius(sunSeparation);positiveRadius(sunAngularRadius);
    if(cameraRadius<=earthRadius||sunSeparation>PI)throw new RangeError('Invalid Earth/Sun framing');
    margin=margin===undefined?4*PI/180:positiveRadius(margin);
    var earthAngularRadius=Math.asin(earthRadius/cameraRadius),left=Math.min(-earthAngularRadius,sunSeparation-sunAngularRadius),right=Math.max(earthAngularRadius,sunSeparation+sunAngularRadius);
    return {earthAngularRadius:earthAngularRadius,aimShift:(left+right)/2,horizontalFov:right-left+2*margin,left:left,right:right};
  }
  function projectDirection(direction,camera,target,up,verticalFov,aspect) {
    var forward=unit(subtract(target,camera)),right=unit(cross(forward,up)),vertical=cross(right,forward),ray=unit(direction);
    if(!Number.isFinite(verticalFov)||verticalFov<=0||verticalFov>=PI||!Number.isFinite(aspect)||aspect<=0)throw new RangeError('Invalid camera projection');
    var x=dot(ray,right),y=dot(ray,vertical),z=dot(ray,forward),tangent=Math.tan(verticalFov/2),ndcX=z?x/(z*tangent*aspect):Infinity,ndcY=z?y/(z*tangent):Infinity;
    return {x:ndcX,y:ndcY,forward:z,horizontalAngle:Math.atan2(x,z),verticalAngle:Math.atan2(y,z),inside:z>0&&Math.abs(ndcX)<=1&&Math.abs(ndcY)<=1};
  }
  return {angleBetween:angleBetween,circleOverlapArea:circleOverlapArea,capOverlapArea:capOverlapArea,sphereDisk:sphereDisk,sunVisibility:sunVisibility,frameEarthSun:frameEarthSun,projectDirection:projectDirection};
}));
