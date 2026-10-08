/* Raised auroral ribbons. NOAA supplies the geographic probability, not the
   individual folds or rays. Heights and fine structure are illustrative.
   This fixed scaffold is built once; replay only changes its active indices. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GlobeAurora=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DEG=Math.PI/180,SEGMENTS=720,ROWS=6,RINGS=64,GROUP=8;
  // A centered dipole guides the illustrative rays. The NOAA geographic grid
  // remains the authority for both hemispheres, including unusual low latitudes.
  var lat=80.6*DEG,lon=-72.7*DEG,axis=[Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon)];
  var east=[Math.sin(lon),0,Math.cos(lon)],north=[-Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon)];
  function neighbors(n){
    var latitude=Math.asin(Math.max(-1,Math.min(1,n[1])))/DEG+90,longitude=((Math.atan2(-n[2],n[0])/DEG)%360+360)%360;
    var y=Math.min(179,Math.floor(latitude)),x=Math.floor(longitude);
    return [y*360+x,y*360+(x+1)%360,(y+1)*360+x,(y+1)*360+(x+1)%360];
  }
  function scaffold(){
    var groups=[];
    for(var start=0;start<RINGS;start+=GROUP){
      var count=Math.min(GROUP,RINGS-start),vertices=count*(SEGMENTS+1)*ROWS;
      var position=new Float32Array(vertices*3),foot=new Float32Array(vertices*3),pattern=new Float32Array(vertices*2),uv=new Float32Array(vertices*2);
      var cells=[],indices=new Uint16Array(count*SEGMENTS*(ROWS-1)*6);
      for(var ring=0;ring<count;ring++){
        var id=start+ring,hemisphere=id<32?1:-1,band=id%32,base=(1.4+band*2.75)*hemisphere,phase=id*2.399963;
        var last=null;
        for(var j=0;j<=SEGMENTS;j++){
          var angle=j/SEGMENTS*Math.PI*2;
          var fold=.46*Math.sin(angle*7+phase)+.20*Math.sin(angle*19-phase)+.07*Math.sin(angle*43+phase);
          var mlat=(base+fold)*DEG,c=Math.cos(mlat),s=Math.sin(mlat),a=Math.cos(angle),b=Math.sin(angle);
          var n=axis.map(function(v,k){return v*s+c*(east[k]*a+north[k]*b);});
          var dot=n.reduce(function(sum,v,k){return sum+v*axis[k];},0),direction=n.map(function(v,k){return (3*dot*v-axis[k])*hemisphere;});
          // Low-latitude field lines are nearly horizontal. Keep the display
          // above the surface there without excluding any NOAA grid location.
          var radial=direction.reduce(function(sum,v,k){return sum+v*n[k];},0);
          if(radial<.6)direction=direction.map(function(v,k){return v+n[k]*(.6-radial);});
          var length=Math.hypot.apply(null,direction);direction=direction.map(function(v){return v/length;});
          var near=neighbors(n),column=(ring*(SEGMENTS+1)+j)*ROWS;
          for(var row=0;row<ROWS;row++){
            var h=row/(ROWS-1),height=h*(.105+.020*Math.sin(angle*11+phase));
            var index=column+row;
            for(var k=0;k<3;k++){foot[index*3+k]=n[k];position[index*3+k]=n[k]*1.016+direction[k]*height;}
            pattern[index*2]=angle;pattern[index*2+1]=phase;uv[index*2]=j/SEGMENTS;uv[index*2+1]=h;
          }
          if(last)cells.push({vertex:column-ROWS,neighbors:last.concat(near)});
          last=near;
        }
      }
      groups.push({position:position,foot:foot,pattern:pattern,uv:uv,cells:cells,indices:indices,count:0});
    }
    return groups;
  }
  function select(groups,grid,threshold){
    if(threshold===undefined)threshold=8;
    var total=0;
    groups.forEach(function(group){
      var used=0;
      group.cells.forEach(function(cell){
        if(!cell.neighbors.some(function(index){return grid[index]>threshold;}))return;
        for(var row=0;row<ROWS-1;row++){
          var a=cell.vertex+row,b=a+ROWS;
          group.indices[used++]=a;group.indices[used++]=b;group.indices[used++]=a+1;
          group.indices[used++]=b;group.indices[used++]=b+1;group.indices[used++]=a+1;
        }
      });
      group.count=used;total+=used/3;
    });
    return total;
  }
  return {scaffold:scaffold,select:select};
}));
