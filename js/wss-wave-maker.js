/* Declared motor boundary, not a prescribed water wave. */
(function(root){
  'use strict';
  function create(options){
    var L=options.liquid,r=options.rect,stroke=options.stroke,period=options.period;
    if(!L || !r || ![r.x,r.y,r.width,r.height,stroke,period,L.simulationClock].every(Number.isFinite) || r.width<=0 || r.height<=0 || stroke<0 || period<=0)throw Error('Wave paddle needs finite geometry and a positive native period.');
    var phase=0,last=L.simulationClock,on=options.motor!==false,retired=false,omega=2*Math.PI/period,pulseRemaining=0;
    function pose(){
      var now=L.simulationClock;if(!Number.isFinite(now))throw Error('Wave paddle lost its native clock.');
      if(on && !retired){var advance=Math.max(0,now-last)*omega;if(pulseRemaining>0){advance=Math.min(advance,pulseRemaining);pulseRemaining-=advance;if(pulseRemaining<=1e-10)on=false;}phase=(phase+advance)%(2*Math.PI);}last=now;
      return {x:r.x+stroke*Math.sin(phase),y:r.y,width:r.width,height:r.height,vx:on && !retired ? stroke*omega*Math.cos(phase) : 0};
    }
    return {
      guest:function(){
        if(retired)return {pts:null};var p=pose(),x=p.x,y=p.y,w=p.width,h=p.height,v=p.vx;
        return {x:x+w*.5,y:y+h*.5,hw:w*.5+.01,hh:h*.5+.01,mvx:v,mvy:0,skin:true,convex:1,
          pts:[x,y,v,0,x+w,y,v,0,x+w,y+h,v,0,x,y+h,v,0]};
      },
      toggle:function(){if(retired)return false;pose();pulseRemaining=0;on=!on;return on;},
      setPeriod:function(value){if(!Number.isFinite(value)||value<.5||value>20)throw Error('Paddle period must be between 0.5 and 20 seconds.');pose();period=value;omega=2*Math.PI/period;return period;},
      setStroke:function(value){if(!Number.isFinite(value)||value<0||value>64)throw Error('Paddle stroke must be between 0 and 64 pixels.');pose();stroke=value;return stroke;},
      pulse:function(){pose();phase=0;pulseRemaining=2*Math.PI;on=true;return true;},
      setMotor:function(value){pose();on=!!value;return on;},
      stats:function(){var p=pose();return {motor:on && !retired,clock:last,phase:phase,frontX:p.x+p.width,velocity:p.vx,period:period,stroke:stroke,retired:retired};},
      draw:function(c,colors){
        if(retired)return;var p=pose(),front=p.x+p.width;
        c.save();c.strokeStyle=colors.accent;c.fillStyle=colors.accent;c.lineWidth=2;
        c.beginPath();c.moveTo(r.x+24,p.y+20);c.lineTo(front,p.y+20);c.stroke();
        c.globalAlpha=.32;c.fillRect(front-4,p.y,4,p.height);c.globalAlpha=1;
        c.strokeRect(front-4,p.y,4,p.height);c.fillStyle=colors.text;c.font='14px "Commit Mono", monospace';
        c.fillText(on?'Motor paddle on':'Motor paddle off',r.x+8,p.y-12);c.restore();
      },
      destroy:function(){retired=true;on=false;}
    };
  }
  root.WSSWaveMaker={create:create};
})(typeof window!=='undefined'?window:globalThis);
