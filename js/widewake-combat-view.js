/* Fleet combat keeps the same water, hulls and controls as the voyage. */
(function(root){
  'use strict';
  const O=root.WidewakeOcean,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  class View extends O.Ocean{
    constructor(canvas,battle){super(canvas,battle);this.lookAhead=true;this.configureCamera();this.zoom=this.targetZoom=this.stops.fleet;this.camera={x:0,y:80};}
    configureCamera(){
      // Even the lightest raider retains a bow, deck and stern at Wide. Keep
      // every hull at physical scale rather than inflating distant sprites.
      const readable=Math.max(...root.WidewakeBattle.enemies.map(s=>O.readableScale(s,12))),wide=Math.max(readable,this.minimumZoom()*this.baseScale),fleet=wide*1.22;
      this.stops={helm:wide*1.55/this.baseScale,fleet:fleet/this.baseScale,survey:wide/this.baseScale};
    }
    resize(){const old=this.stops,stop=old&&Object.keys(old).find(k=>Math.abs(old[k]-this.targetZoom)<.001),scale=this.baseScale;super.resize();if(old){this.configureCamera();this.zoom=clamp(this.zoom*scale/this.baseScale,this.stops.survey,this.stops.helm*1.5);this.targetZoom=stop?this.stops[stop]:clamp(this.targetZoom*scale/this.baseScale,this.stops.survey,this.stops.helm*1.5);this.anchor=null;}}
    setZoom(value,x,y){super.setZoom(value,x,y);this.targetZoom=clamp(value,this.stops.survey,this.stops.helm*1.5);}
    zoomStop(name){if(this.stops[name]){this.anchor=null;this.offset.x=this.offset.y=0;this.targetZoom=this.stops[name];}}
    labels(){
      const c=this.ctx,b=this.battle,z=this.zoom*this.baseScale,p=this.poses[0],q=this.project(p.x,p.y,b.player.height+4);
      c.clearRect(0,0,this.width,this.height);c.lineWidth=.75;c.font='7px "Commit Mono",monospace';c.textAlign='center';
      // A small pennant sits above the flagship, never across its sprite.
      c.strokeStyle='#d7e7dc';c.beginPath();c.moveTo(q.x,q.y-2);c.lineTo(q.x,q.y-10);c.stroke();c.fillStyle='#f0e9cf';c.beginPath();c.moveTo(q.x,q.y-10);c.lineTo(q.x+6,q.y-8);c.lineTo(q.x,q.y-6);c.fill();
      if(b.time<7){c.fillStyle='#e4eadd';c.fillText('YOU',q.x,q.y-15);}
      for(const s of b.ships){if(s.hp<=0||s.id===0||!this.visible(s.x,s.y,20))continue;if(!s.working&&s.hp>s.maxHp*.5)continue;
        const pose=this.poses[s.id],p=this.project(pose.x,pose.y,s.height+5),width=s.working?16:12;
        c.fillStyle='#0e2633';c.fillRect(p.x-width/2-1,p.y-1,width+2,3);c.fillStyle=s.hp<s.maxHp*.3?'#ee967a':'#b4d2bc';c.fillRect(p.x-width/2,p.y,width*s.hp/s.maxHp,1.5);
      }
      // Only sparse, committed ramming lanes get warnings. Ordinary raiders and
      // friendly splash weapons never cover the sea in circles or damage text.
      const a=b.raiders;let warnings=0;
      c.strokeStyle='#ed937aa0';c.setLineDash([3,4]);
      for(let i=0;i<a.count&&warnings<24;i++)if(a.hp[i]>0&&a.kind[i]===3&&a.charge[i]>1&&this.visible(a.x[i],a.y[i],60)){
        const from=this.project(a.x[i],a.y[i]),to=this.project(a.x[i]+a.chargeX[i]*150,a.y[i]+a.chargeY[i]*150);c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();warnings++;
      }c.setLineDash([]);
      // Supply crates stay readable at fleet distance without oversized objects.
      for(const item of b.loot){if(!this.visible(item.x,item.y,10))continue;const p=this.project(item.x,item.y);c.fillStyle='#112f3e';c.fillRect(p.x-4,p.y-4,8,8);c.strokeStyle='#a8dbbf';c.strokeRect(p.x-4,p.y-4,8,8);c.fillStyle='#c4e7d2';c.fillRect(p.x-2.5,p.y-.75,5,1.5);c.fillRect(p.x-.75,p.y-2.5,1.5,5);}
      if(b.player.hit>0&&!this.reduced){c.strokeStyle='#efa184';c.lineWidth=2;c.strokeRect(1,1,this.width-2,this.height-2);}
      this.stats.chargeWarnings=warnings;
    }
  }
  root.WidewakeCombat.View=View;
})(globalThis);
