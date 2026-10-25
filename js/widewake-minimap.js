/* North-up sailing instrument. Bake waterways once; bound the live drawing cost. */
(function(root){
  'use strict';
  const E=root.WidewakeEstuary,R=root.WidewakeReach,W=root.WidewakeWaterways,TAU=Math.PI*2;
  const color={sea:'#173f50',shallow:'#386568',channel:'#27565d',land:'#6b7865',bank:'#99a58d',salt:'#f0e9cf',brass:'#d7b876',fleet:'#8ecfce',enemy:'#ed927d',ink:'#102934'};
  const ranges=[500,1000,2000,4000,8000,16000];
  class Minimap{
    constructor(canvas,panel,caption){this.canvas=canvas;this.panel=panel;this.caption=caption;this.context=canvas.getContext('2d');this.cells=new Uint16Array(32*32);this.game=null;this.field=null;this.base=null;this.last=-Infinity;this.zoom={sailing:2,combat:4};this.stats={draws:0,bakes:0,enemySamples:0,threatCells:0};
      this.zoomIn=panel.querySelector('[data-minimap-zoom="in"]');this.zoomOut=panel.querySelector('[data-minimap-zoom="out"]');
      this.zoomIn.onclick=()=>this.changeZoom(-1);this.zoomOut.onclick=()=>this.changeZoom(1);
    }
    changeZoom(direction){
      if(!this.game||this.panel.hidden)return;
      const mode=this.game.endgame?'combat':'sailing';this.zoom[mode]=E.clamp(this.zoom[mode]+direction,0,ranges.length-1);
      this.draw(this.game,performance.now(),true);
    }
    show(game){
      this.panel.hidden=!game||!!game.port;
      if(this.panel.hidden)return;
      if(this.game!==game){this.game=game;this.last=-Infinity;this.time=-1;}
    }
    bake(field){
      if(this.field===field&&this.base)return;
      this.field=field;this.base=document.createElement('canvas');
      const b=E.bounds,s=1/8,c=this.base.getContext('2d');
      this.base.width=(b.right-b.left)*s;this.base.height=(b.bottom-b.top)*s;
      c.scale(s,s);c.translate(-b.left,-b.top);c.fillStyle=color.land;c.fillRect(b.left,b.top,b.right-b.left,b.bottom-b.top);
      // Navigation uses these same coastline and sampled channel centre lines.
      const coast=(inset,fill)=>{c.fillStyle=fill;c.beginPath();c.moveTo(b.left,b.bottom);for(let x=b.left;x<=b.right;x+=16)c.lineTo(x,1280+Math.sin(x*.0017)*90+Math.sin(x*.0041)*32+inset);c.lineTo(b.right,b.bottom);c.closePath();c.fill();};
      coast(-10,color.bank);coast(0,color.shallow);coast(85,color.channel);coast(240,color.sea);
      c.lineCap='round';
      for(const [fraction,extra,fill]of [[1,12,color.bank],[1,0,color.shallow],[.86,0,color.channel],[.58,0,color.sea]]){
        for(const path of field.paths)for(let i=1;i<path.points.length;i++){
          const a=path.points[i-1],b=path.points[i];c.lineWidth=(a.width+b.width)*fraction+extra;c.strokeStyle=fraction<1&&a.depth<3?color.shallow:fill;
          c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
        }
      }
      this.stats.bakes++;
    }
    draw(game,ms,force=false){
      this.show(game);if(this.panel.hidden)return;
      const size=this.canvas.clientWidth,ratio=Math.min(2,root.devicePixelRatio||1),pixels=Math.round(size*ratio),resized=this.canvas.width!==pixels;
      if(!size||!force&&!resized&&(ms-this.last<100||this.time===game.time))return;
      if(resized){this.canvas.width=this.canvas.height=pixels;}
      this.last=ms;this.time=game.time;this.stats.draws++;
      const index=this.zoom[game.endgame?'combat':'sailing'],c=this.context,p=game.player,span=ranges[index],scale=size/span,half=size/2;
      this.zoomIn.disabled=index===0;this.zoomOut.disabled=index===ranges.length-1;
      this.center={x:p.x,y:p.y};this.span=span;
      const point=(x,y)=>({x:half+(x-p.x)*scale,y:half+(y-p.y)*scale});this.point=point;
      c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,size,size);c.fillStyle=game.field?color.land:color.sea;c.fillRect(0,0,size,size);
      if(game.field){this.bake(game.field);c.save();c.translate(half-p.x*scale,half-p.y*scale);c.scale(scale*8,scale*8);c.drawImage(this.base,E.bounds.left/8,E.bounds.top/8);c.restore();}
      c.strokeStyle='#c5d8ca18';c.lineWidth=.7;
      const spacing=span/4;
      for(let x=Math.ceil((p.x-span/2)/spacing)*spacing;x<p.x+span/2;x+=spacing){const q=point(x,p.y);c.beginPath();c.moveTo(q.x,0);c.lineTo(q.x,size);c.stroke();}
      for(let y=Math.ceil((p.y-span/2)/spacing)*spacing;y<p.y+span/2;y+=spacing){const q=point(p.x,y);c.beginPath();c.moveTo(0,q.y);c.lineTo(size,q.y);c.stroke();}
      const destinations=game.endgame?[]:[...E.ports,...R.sites.filter(s=>game.rank>=s.rank)],objective=game.endgame?null:game.objective();
      const intent=game.endgame?null:root.WidewakeReachUI?.harborIntent(game),next=intent?.action==='chart'&&intent.port?intent.port:objective?.port||objective?.site;
      const target=game.route?.destination||destinations.find(d=>d.id===next);this.target=target||null;
      c.save();c.beginPath();c.rect(2,2,size-4,size-4);c.clip();
      if(game.route){
        c.strokeStyle=color.brass;c.lineWidth=1.5;c.setLineDash([3,3]);c.beginPath();c.moveTo(half,half);
        for(let i=game.route.index||0;i<game.route.points.length;i++){const q=point(game.route.points[i].x,game.route.points[i].y);c.lineTo(q.x,q.y);}c.stroke();c.setLineDash([]);
      }
      if(!game.endgame)for(const h of W.hazards){const q=point(h.x,h.y);if(q.x<0||q.y<0||q.x>size||q.y>size)continue;c.strokeStyle=color.enemy;c.lineWidth=1;c.beginPath();c.arc(q.x,q.y,Math.max(3,h.radius*scale),0,TAU);c.stroke();}
      for(const d of destinations){const q=point(d.x,d.y);if(q.x<3||q.y<3||q.x>size-3||q.y>size-3)continue;c.fillStyle=color.salt;c.strokeStyle=color.ink;c.lineWidth=1.5;c.beginPath();if(d.type)c.arc(q.x,q.y,2.5,0,TAU);else c.rect(q.x-2.5,q.y-2.5,5,5);c.fill();c.stroke();}
      // A fixed density grid keeps swarms from becoming thousands of canvas marks.
      this.cells.fill(0);const enemies=game.raiders;this.stats.enemySamples=enemies.count;this.stats.threatCells=0;
      for(let i=0;i<enemies.count;i++)if(enemies.hp[i]>0){const x=Math.floor(((enemies.x[i]-p.x)/span+.5)*32),y=Math.floor(((enemies.y[i]-p.y)/span+.5)*32);if(x>=0&&y>=0&&x<32&&y<32)this.cells[y*32+x]++;}
      c.fillStyle=color.enemy;
      for(let i=0;i<this.cells.length;i++)if(this.cells[i]){c.globalAlpha=Math.min(1,.55+Math.sqrt(this.cells[i])*.08);c.fillRect(i%32*size/32,Math.floor(i/32)*size/32,Math.max(2,size/32-1),Math.max(2,size/32-1));this.stats.threatCells++;}c.globalAlpha=1;
      for(const s of game.ships)if(s!==p&&s.hp>0){const q=point(s.x,s.y);c.fillStyle=color.fleet;c.strokeStyle=color.ink;c.lineWidth=1;c.beginPath();c.arc(q.x,q.y,2.5,0,TAU);c.fill();c.stroke();}
      if(target&&size>=36){
        const q=point(target.x,target.y),dx=q.x-half,dy=q.y-half,limit=half-9,factor=Math.min(1,limit/Math.max(Math.abs(dx),Math.abs(dy),1)),x=half+dx*factor,y=half+dy*factor;
        c.fillStyle=color.brass;c.strokeStyle=color.ink;c.lineWidth=1.5;c.beginPath();c.moveTo(x,y-5);c.lineTo(x+4,y);c.lineTo(x,y+5);c.lineTo(x-4,y);c.closePath();c.fill();c.stroke();
        if(factor<1){c.strokeStyle=color.brass;c.lineWidth=1.5;const a=Math.atan2(dy,dx);c.beginPath();c.moveTo(x+Math.cos(a)*6,y+Math.sin(a)*6);c.lineTo(x+Math.cos(a)*9,y+Math.sin(a)*9);c.stroke();}
      }
      c.save();c.translate(half,half);c.rotate(p.angle);c.fillStyle=color.salt;c.strokeStyle=color.ink;c.lineWidth=2;c.beginPath();c.moveTo(8,0);c.lineTo(-5,4.5);c.lineTo(-3,0);c.lineTo(-5,-4.5);c.closePath();c.fill();c.stroke();c.restore();c.restore();
      if(size>=76){
        c.font='9px "Commit Mono",monospace';c.textAlign='center';c.fillStyle=color.ink;c.fillRect(size-23,3,20,25);c.fillStyle=color.salt;c.fillText('N',size-13,13);c.beginPath();c.moveTo(size-13,16);c.lineTo(size-16,23);c.lineTo(size-10,23);c.closePath();c.fill();
        const metres=span/4,bar=metres*scale;c.fillStyle=color.ink;c.fillRect(4,size-24,bar+12,21);c.fillStyle=color.salt;c.textAlign='left';c.fillText(metres>=1000?metres/1000+' km':metres+' m',9,size-14);c.strokeStyle=color.salt;c.lineWidth=1;c.beginPath();c.moveTo(9,size-10);c.lineTo(9,size-6);c.lineTo(9+bar,size-6);c.lineTo(9+bar,size-10);c.stroke();
      }
      const distance=target?Math.hypot(target.x-p.x,target.y-p.y):0,label=target?target.name+' / '+(distance>=1000?(distance/1000).toFixed(1)+' km':Math.round(distance/10)*10+' m'):game.endgame?'Fleet watch':'Bracken Reach';
      if(this.caption.textContent!==label){this.caption.textContent=label;this.caption.title=label;}
    }
  }
  root.WidewakeMinimap=Minimap;
})(globalThis);
