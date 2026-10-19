/* The launch scene is a small canvas illustration, independent of campaign time. */
(function(root){
  'use strict';
  const ink='#101b32',cream='#fff0d3',gold='#ffbc66';
  function rect(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
  function shape(c,color,points){c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(Math.round(x),Math.round(y)):c.moveTo(Math.round(x),Math.round(y)));c.closePath();c.fill();}
  const letters={W:['10001','10001','10001','10101','10101','11011','10001'],I:['111','010','010','010','010','010','111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],A:['01110','11011','10001','10001','11111','10001','10001'],K:['10001','10010','10100','11000','10100','10010','10001']};
  function logo(canvas){
    const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);let x=5;
    for(const [i,l] of [...'WIDEWAKE'].entries()){
      const rows=letters[l],y=4+(i===2||i===5?1:0);
      for(const [shade,dx,dy]of [[ink,2,3],['#bd6d67',1,2],[cream,0,0]])for(let r=0;r<7;r++)for(let col=0;col<rows[r].length;col++)if(rows[r][col]==='1')rect(c,shade,x+col*5+dx,y+r*4+dy,5,4);
      x+=(rows[0].length+1)*5;
    }
    for(let i=0;i<36;i++)rect(c,i%5===0?'#8ce2e0':'#508ba8',7+i*6,39+(i%4===0?1:0),i%3===0?3:5,1);
  }
  class Front{
    constructor(canvas,wordmark){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.last=-1;this.width=0;this.height=0;logo(wordmark);}
    draw(time,reduced=false){
      const b=this.canvas.getBoundingClientRect();if(!b.width||!b.height)return;
      const w=Math.max(240,Math.round(b.width/3)),h=Math.max(140,Math.round(b.height/3));
      const changed=w!==this.width||h!==this.height;
      const frame=reduced?0:Math.floor(time*12);if(!changed&&frame===this.last)return;this.last=frame;
      if(changed){this.canvas.width=this.width=w;this.canvas.height=this.height=h;}
      const c=this.ctx,t=frame/12,horizon=Math.round(h*.43),sx=Math.round(w*.75),sy=Math.round(h*.75);
      c.imageSmoothingEnabled=false;
      // Broad bands leave deliberate quiet space around the menu.
      rect(c,'#33446f',0,0,w,h);rect(c,'#735e8a',0,h*.19,w,h*.17);rect(c,'#d68f8d',0,h*.36,w,h*.08);
      rect(c,'#ffd3a0',w*.77,h*.17,15,17);rect(c,'#ffd3a0',w*.77-3,h*.17+4,21,9);rect(c,'#735e8a',w*.77-2,h*.17-1,12,12);
      const cloud='#947a9f';
      for(let i=0;i<7;i++){const x=(i*83+t*(i%2?.25:.4))%(w+80)-50,y=h*.11+(i%3)*h*.07;rect(c,cloud,x,y,39+i%3*14,3);rect(c,cloud,x+10,y-3,19+i%3*9,4);}
      // Low islands and an uneven skyline, interrupted by empty water.
      shape(c,'#455d8a',[[w*.48,horizon],[w*.53,horizon-9],[w*.56,horizon-7],[w*.59,horizon-15],[w*.64,horizon-17],[w*.67,horizon-8],[w*.73,horizon-5],[w*.78,horizon],[w*.78,horizon+5]]);
      rect(c,'#30678c',0,horizon,w,h-horizon);
      for(let i=0;i<12;i++){const x=w*.75+i*8,base=horizon+4,roof=base-6-(i*7%13);rect(c,'#4a648b',x,roof,6+(i%3),base-roof);rect(c,'#ffc394',x+2,roof+4,1,2);}
      rect(c,'#244d79',0,h*.61,w,h*.39);rect(c,'#19375f',0,h*.83,w,h*.17);
      // Long irregular wave clusters. All points stay on the low-resolution grid.
      for(let i=0;i<95;i++){
        const seed=((i*131+17)%997)/997,depth=((i*71+33)%311)/311,y=horizon+4+depth*(h-horizon-4);
        const x=(seed*w+t*(.5+depth)*(i%3===0?-1:1)*2+w*2)%w;
        rect(c,i%4===0?'#4d96af':i%4===1?'#356c97':'#295785',x,y,3+(i*7%17)*depth,1);
        if(i%7===0)rect(c,'#68acc0',x+5,y+2,4,1);
      }
      // A distant freighter, barely a dozen pixels across.
      const tx=(w*.59+t*.3)%w,ty=horizon+11;rect(c,ink,tx,ty,20,3);rect(c,'#d8bca1',tx+6,ty-4,7,4);rect(c,ink,tx+10,ty-7,2,4);
      const bob=reduced?0:Math.round(Math.sin(t*.75));
      this.boat(c,sx,sy+bob,1);
      this.boat(c,sx-65,sy+23+Math.round(reduced?0:Math.sin(t*.8+2)),.38);
      // The foreground quay is cropped, not a matching border on both sides.
      const qx=w*.94,qy=h*.84;
      shape(c,ink,[[qx,qy],[w,qy-7],[w,h],[qx-20,h],[qx-14,qy+13]]);
      for(let i=0;i<5;i++)rect(c,'#3d4c6c',qx-5+i*7,qy+5-i,4,h-qy);
      shape(c,'#b88970',[[qx-15,qy],[w,qy-8],[w,qy-3],[qx-15,qy+5]]);
      rect(c,'#344363',qx+4,qy-12,11,13);rect(c,'#bf947b',qx+5,qy-12,9,2);rect(c,'#ffd3a0',qx+8,qy-11,1,10);
      // Lighthouse light is a few warm pixels, with no flashing or screen bloom.
      const lx=w*.9,ly=horizon-3;
      rect(c,'#6e80a1',lx,ly-31,6,31);rect(c,'#cdd6df',lx+1,ly-31,3,29);rect(c,ink,lx-2,ly-34,10,5);rect(c,gold,lx,ly-33,6,2);rect(c,ink,lx-1,ly-36,8,2);
      if(!reduced){const gx=w*.62+Math.sin(t*.13)*30,gy=h*.28+Math.sin(t*.7)*2;rect(c,'#e7d9d1',gx,gy,3,1);rect(c,'#e7d9d1',gx-2,gy-1,2,1);rect(c,'#e7d9d1',gx+3,gy-1,2,1);}
    }
    boat(c,x,y,scale){
      c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);
      rect(c,'#447a9e',-64,14,125,2);rect(c,'#68acc0',-48,18,82,1);
      shape(c,ink,[[-52,0],[58,-5],[47,13],[34,18],[-36,17],[-47,10]]);
      shape(c,'#477fa2',[[-48,1],[53,-3],[43,9],[31,13],[-35,12],[-43,7]]);
      rect(c,'#f0c898',-45,0,82,3);rect(c,'#a77565',-39,4,66,2);rect(c,'#203b64',-30,8,6,3);rect(c,'#203b64',-17,8,6,3);rect(c,'#203b64',24,5,7,3);
      rect(c,ink,-36,-18,24,18);rect(c,'#d8bca1',-34,-16,20,15);rect(c,'#eed1b0',-36,-19,24,3);rect(c,ink,-30,-13,5,5);rect(c,ink,-21,-13,4,5);
      rect(c,ink,-5,-80,3,80);rect(c,'#c18b72',-4,-78,1,78);rect(c,'#a77565',-31,-64,64,2);
      shape(c,'#d29aa2',[[-1,-73],[29,-61],[36,-43],[35,-21],[24,-9],[-1,-7]]);
      shape(c,cream,[[-1,-73],[25,-60],[31,-44],[30,-24],[21,-13],[-1,-12]]);
      rect(c,'#eecdbd',0,-42,29,2);rect(c,'#d8bca1',22,-15,6,2);
      shape(c,'#eecdbd',[[-8,-61],[-29,-50],[-32,-24],[-26,-11],[-8,-8]]);
      shape(c,'#d29aa2',[[-27,-46],[-29,-24],[-23,-14],[-9,-11],[-9,-14],[-23,-18]]);
      rect(c,ink,2,-83,1,9);shape(c,'#ff855f',[[3,-82],[17,-80],[14,-75],[3,-77]]);
      // A patched seam and tied rigging interrupt the large sail shapes.
      rect(c,'#d29aa2',7,-31,5,6);rect(c,'#d8bca1',9,-30,1,4);
      c.strokeStyle='#75799a';c.lineWidth=1;c.beginPath();c.moveTo(-3,-74);c.lineTo(-42,0);c.moveTo(-3,-73);c.lineTo(44,-2);c.stroke();
      rect(c,ink,9,-9,3,9);rect(c,'#f1ba8e',9,-12,3,3);rect(c,'#4b98b9',8,-8,5,6);
      c.restore();
    }
  }
  root.WidewakeFront=Front;
})(typeof window!=='undefined'?window:globalThis);
