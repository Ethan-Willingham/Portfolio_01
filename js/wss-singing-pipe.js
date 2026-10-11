/* A playable quarter-wave estimate driven only by actual E4 vent events. */
(function(root){
  'use strict';
  var GRAINS_PER_KG=15432.35835294143;
  function geometry(definition){var p=definition.steam,length=p.whistleLengthInches;return {x:p.outlet.x,baseY:p.vent.y,tipY:p.vent.y-length*24,length:length};}
  function hit(definition,x,y,scale){var g=geometry(definition),h=Math.max(12,22/scale);return Math.abs(x-g.x)<=h && Math.abs(y-g.tipY)<=h;}
  function extend(definition,steam,tipY){
    var inches=steam.setWhistleLength((definition.steam.vent.y-tipY)/24);if(inches===null)return false;
    definition.steam.whistleLengthInches=inches;definition.steam.outlet.y=geometry(definition).tipY;return true;
  }
  function metrics(definition,steam){
    var vent=steam.vent,last=vent.last,length=vent.whistleLengthInches;
    return {pipeLengthInches:length,capped:vent.capped,escapedDryMassKg:vent.escapedDryMassKg,
      admittedDryMassKg:vent.admittedDryMassKg,events:vent.events,waterParcels:steam.liquidParcels,vaporParcels:steam.vaporParcels,
      massFlowGrainsPerSecond:(last?last.massFlowKgPerSecond:0)*GRAINS_PER_KG,
      escapedDryGrains:vent.escapedDryMassKg*GRAINS_PER_KG,admittedDryGrains:vent.admittedDryMassKg*GRAINS_PER_KG,
      frequencyHz:last && last.soundSpeedMPerSecond>0 ? root.WSSSound.ventFrequency(last.soundSpeedMPerSecond,length*.0254,last.throatAreaM2):null,
      last:last,approximation:'Finite gravity-fed water fills a sealed chamber and expels actual native pocket air through the existing pressure-driven gas port. Fresh vent events drive one procedural pipe voice. Dragging changes the drawn acoustic length and its quarter-wave mode estimate. This is one-way acoustics: pipe load, changing acoustic gas volume, jet feedback and drag work do not feed back into gas transfer. Gas momentum, compressional work, sound loudness, total mechanical work, bird timbre, a draining cycle and a physical owl swivel remain unresolved. This is a sliding-pipe precursor, not the repeating birds or accepted S4/C11.'};
  }
  function draw(c,definition,steam,colors,scale){
    var g=geometry(definition),state=metrics(definition,steam),x=g.x,y=g.tipY,h=22/scale;
    c.save();c.strokeStyle=colors.accent;c.fillStyle=colors.text;c.lineWidth=1;c.font='14px "Commit Mono", monospace';
    // The gas-only acoustic boundary is not another resolved liquid conduit.
    c.beginPath();c.moveTo(x-3,g.baseY);c.lineTo(x-3,y);c.moveTo(x+3,g.baseY);c.lineTo(x+3,y);c.stroke();
    c.globalAlpha=.32;c.fillStyle=colors.accent;c.fillRect(x-4,y,8,g.baseY-y);c.globalAlpha=1;
    c.strokeRect(x-5,g.baseY-34,10,34);c.fillStyle=colors.text;
    c.globalAlpha=.18;c.fillStyle=colors.accent;c.beginPath();c.roundRect(x-h,y-h,h*2,h*2,6/scale);c.fill();c.globalAlpha=1;c.stroke();
    c.beginPath();c.moveTo(x-9/scale,y-3/scale);c.lineTo(x+9/scale,y-3/scale);c.moveTo(x-9/scale,y+3/scale);c.lineTo(x+9/scale,y+3/scale);c.stroke();
    c.fillStyle=colors.text;c.fillText(state.capped?'Whistle capped':g.length.toFixed(2)+' in',x+30/scale,y+4/scale);
    c.fillText('Drag the pipe',332,40);c.fillText('Fill pushes air out',344,212);
    c.fillText(state.massFlowGrainsPerSecond>0?'Air out '+state.massFlowGrainsPerSecond.toFixed(2)+' grains/s':'No outward air flow',344,236);
    if(state.frequencyHz!==null)c.fillText('Mode '+Math.round(state.frequencyHz)+' Hz',344,260);
    var f=definition.primary,o=f.opening;c.beginPath();c.moveTo(o.at,o.start);c.lineTo(o.at,o.end);c.stroke();c.fillText(f.closed?'Feed closed':'Feed open',o.at-38,o.start-12);
    c.restore();
  }
  root.WSSSingingPipe={geometry:geometry,hit:hit,extend:extend,metrics:metrics,draw:draw};
})(typeof window!=='undefined'?window:globalThis);
