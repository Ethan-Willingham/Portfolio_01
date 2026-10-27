  /* Level-one wash plant, drawn from the gold-sluice demo's arrangement.
     This is the batch's visual presentation, not a recovery simulation.
     Counts, time and rewards belong to paydirt state. No frame scheduling,
     randomness or inventory mutation happens here. The caller supplies active
     elapsed time, so closing the view or suspending play cannot skip a batch.

     paydirtDrawMachine(context, {x,y,w,h}, {
       phase:'idle'|'washing'|'ready', progress:0..1, elapsed:seconds,
       color:materialColor, quantity:batchSize, discoveries:actualFindCount,
       reducedMotion:boolean
     });
     The same 960 by 340 apparatus is fitted to every viewport. */

  function paydirtDrawMachine(c, box, state) {
    if (!c || !box || !(box.w > 0) || !(box.h > 0)) return;
    state = state || {};
    var scale = Math.min(box.w / 960, box.h / 340);
    var phase = state.phase || 'idle';
    var running = phase === 'washing';
    var ready = phase === 'ready';
    var progress = Math.max(0, Math.min(1, Number(state.progress) || 0));
    if (ready) progress = 1;
    var time = state.reducedMotion ? 0 : Math.max(0, Number(state.elapsed) || 0);
    var feed = running && progress > 0.08 && progress < 0.72;
    var cleanout = (running && progress >= 0.86) || ready;
    var fed = Math.max(0, Math.min(1, (progress - 0.08) / 0.64));
    var washed = Math.max(0, Math.min(1, (progress - 0.86) / 0.14));
    var material = state.color || BLD.woodLight;
    var hasCharge = (Number(state.quantity) || 0) > 0 && phase !== 'idle';
    var finds = Math.max(0, Math.min(10, Math.floor(Number(state.discoveries) || 0)));
    var font = typeof UI_FONT === 'string' ? UI_FONT : '"Commit Mono", monospace';
    var x0 = 100, x1 = 754, y0 = 151, y1 = 234;

    function bed(x) { return y0 + (x - x0) * (y1 - y0) / (x1 - x0); }
    function path(points) {
      c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (var n = 1; n < points.length; n++) c.lineTo(points[n][0], points[n][1]);
      c.closePath();
    }
    function polygon(points, fill, edge, width) {
      path(points); c.fillStyle = fill; c.fill();
      if (edge) { c.strokeStyle = edge; c.lineWidth = width || 1.5; c.stroke(); }
    }
    function rect(x, y, w, h, fill, edge) {
      c.fillStyle = fill; c.fillRect(x, y, w, h);
      if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.strokeRect(x, y, w, h); }
    }
    function line(points, color, width) {
      c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (var n = 1; n < points.length; n++) c.lineTo(points[n][0], points[n][1]);
      c.strokeStyle = color; c.lineWidth = width || 1.5; c.stroke();
    }
    function bolt(x, y) {
      rect(x - 2, y - 2, 4, 4, BLD.metalDark);
      rect(x - 2, y - 2, 3, 2, BLD.metalPale);
    }
    function label(text, x, y, color) {
      if (scale < 0.56) return;
      c.fillStyle = color || UIT_DIM;
      c.font = Math.max(12, 11 / scale) + 'px ' + font;
      c.textAlign = 'center'; c.fillText(text, x, y);
    }
    function grain(x, y, size, color) {
      polygon([[x-size,y],[x-size*.25,y-size],[x+size,y-size*.3],
        [x+size*.7,y+size*.75],[x-size*.45,y+size]],color);
    }
    function pipe(points, width) {
      line(points, BLD.outline, width + 5);
      line(points, BLD.metalBase, width);
      line(points, BLD.metalLight, Math.max(2, width * 0.23));
    }

    c.save();
    c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
    c.translate(box.x + (box.w - 960 * scale) * 0.5, box.y + (box.h - 340 * scale) * 0.5);
    c.scale(scale, scale);
    c.lineJoin = 'round'; c.lineCap = 'round';

    // The return pipe connects the settling tank to the pump and head valve.
    // It stays behind the table and trough, which makes the loop easy to trace.
    pipe([[862,292],[862,312],[267,312],[267,278],[64,278],[64,91],[111,91],[111,127]], 9);
    if (running) {
      c.strokeStyle = BLD.waterLight; c.lineWidth = 2.5;
      c.setLineDash([9, 15]); c.lineDashOffset = time * 29;
      c.beginPath(); c.moveTo(848,312); c.lineTo(267,312); c.lineTo(267,278);
      c.lineTo(64,278); c.lineTo(64,91); c.lineTo(111,91); c.lineTo(111,127); c.stroke();
      c.setLineDash([]);
    }

    // Salvaged wood trestles on stone feet, with bolted steel braces.
    var legs = [170, 470, 712];
    for (var l = 0; l < legs.length; l++) {
      var lx = legs[l], ly = bed(lx) + 13;
      polygon([[lx-5,ly],[lx+8,ly+2],[lx+25,301],[lx+11,301]], BLD.woodDark, BLD.outline);
      line([[lx-2,ly+4],[lx+16,298]], BLD.woodMid, 3);
      polygon([[lx-10,ly+6],[lx+1,ly+6],[lx-16,301],[lx-28,301]], BLD.woodBase, BLD.outline);
      line([[lx-8,ly+8],[lx-24,297]], BLD.woodLight, 2);
      line([[lx-17,277],[lx+13,289]], BLD.metalDark, 5);
      rect(lx-34,301,65,8,BLD.stoneDark,BLD.outline);
      rect(lx-32,302,60,2,BLD.stoneLight);
      bolt(lx-4,ly+7); bolt(lx+13,289);
    }

    // Quiet recessed shadows under the wash bed and the two receivers.
    c.globalAlpha = 0.35;
    polygon([[104,165],[755,248],[785,266],[132,185]], UIT_INSET_DK);
    c.globalAlpha = 1;

    // The wet bed is open in section, with a thick iron front lip.
    polygon([[x0-4,y0-17],[x1+5,y1-17],[x1+5,y1+12],[x0-4,y0+12]], BLD.metalDark, BLD.outline, 2);
    polygon([[x0,y0-12],[x1,y1-12],[x1,y1],[x0,y0]], BLD.waterBase);
    if (running || ready) {
      c.save();
      path([[x0,y0-19],[x1,y1-19],[x1,y1],[x0,y0]]); c.clip();
      for (var w = 0; w < 32; w++) {
        var wx = x0 + ((w * 31 + time * 83) % (x1 - x0));
        var wy = bed(wx) - 10 + Math.sin(w * 4.3 + time * 3) * 2;
        c.globalAlpha = 0.3 + (w % 3) * 0.15;
        line([[wx,wy],[wx+12+(w%4)*2,wy+1.4]],BLD.waterLight,1.5);
      }
      c.restore();
    }
    line([[x0,y0-13],[x1,y1-13]], BLD.waterLight, 1.7);

    // Most screened grains travel over the riffles. Heavy concentrate gathers
    // in their sheltered pockets. These bounded marks illustrate the process;
    // the model's actual findings alone decide whether a gold glint is drawn.
    if (hasCharge && !ready) {
      var visible = Math.floor(Math.min(1, fed * 4) * 54 * (1 - washed));
      for (var g = 0; g < visible; g++) {
        var journey = ((g * 0.61803398875 + time * 0.19) % 1);
        var gx = 224 + journey * (x1 - 224), gy = bed(gx) - 4 - ((g*7)%9);
        grain(gx,gy,1.3+(g%3)*0.4,g%5===0?BLD.stonePale:material);
      }
    }
    for (var r = 0; r < 7; r++) {
      var rx = 302 + r * 59, ry = bed(rx), rise = cleanout ? 11 * washed : 0;
      if (hasCharge && !ready) {
        var captured = Math.floor(6 * fed * (1-washed));
        for (var k = 0; k < captured; k++) grain(rx+10+(k*13)%31,bed(rx+10+(k*13)%31)-2-(k%2)*2,1.8,
          k === 0 && r < finds ? BLD.goldBright : BLD.stoneDark);
      }
      polygon([[rx,ry-9-rise],[rx+5,ry-9-rise],[rx+8,ry-rise],[rx,ry-rise]], BLD.metalBase, BLD.outline);
      line([[rx,ry-9-rise],[rx+5,ry-9-rise]],BLD.metalPale,1.5);
    }

    // Bolted front rail, dull iron with a narrow lit edge.
    polygon([[x0-4,y0],[x1+5,y1],[x1+5,y1+12],[x0-4,y0+12]], BLD.metalBase, BLD.outline, 2);
    line([[x0-2,y0+1],[x1+3,y1+1]], BLD.metalPale,2);
    line([[x0-2,y0+11],[x1+3,y1+11]], BLD.metalDark,2);
    for (var b = 124; b < x1; b += 65) bolt(b,bed(b)+6);
    polygon([[92,124],[103,124],[103,165],[92,165]],BLD.metalBase,BLD.outline);
    line([[93,125],[102,125]],BLD.metalPale,2);

    // A counted hopper. Stone has already been broken by the drill; the mesh
    // above the bed screens it before it reaches the riffles.
    var hopper = [[183,54],[270,54],[270,73],[240,119],[240,129],[214,129],[214,119],[183,73]];
    polygon(hopper,BLD.metalDark,BLD.outline,2);
    c.save(); path(hopper); c.clip();
    if (hasCharge && fed < 1) {
      var top = 64 + fed * 53;
      polygon([[184,top+7],[208,top],[232,top+5],[270,top+2],[270,125],[184,125]],material);
      for (var h = 0; h < 36; h++) {
        var hx = 188+(h*23)%77, hy = top+10+(h*13)%48;
        grain(hx,hy,1.2,h%4===0?BLD.stonePale:BLD.woodDark);
      }
    }
    c.restore();
    line([[183,54],[270,54]],BLD.metalPale,3);
    line([[184,74],[214,120],[214,129]],BLD.metalLight,3);
    line([[269,74],[240,120],[240,129]],BLD.metalBase,4);
    rect(206,129,42,5,BLD.metalBase,BLD.outline);
    line([[209,135],[feed?217:244,feed?139:135]],BLD.goldDark,3);
    line([[196,143],[258,151]],BLD.metalLight,2);
    for (var mesh=200;mesh<256;mesh+=7) line([[mesh,140],[mesh+5,151]],BLD.metalBase,1);
    if (feed) for (var f=0;f<9;f++) {
      var fy = 137 + ((f * 13 + time * 67) % 22);
      grain(218 + (f * 7) % 18,fy,1.6,material);
    }

    // Valve, pump and the small water inlet. No water inventory is invented:
    // this plant recirculates its own working supply and never takes bathwater.
    rect(101,121,20,8,BLD.metalBase,BLD.outline); line([[103,122],[119,122]],BLD.metalPale,2);
    line([[88,90],[88,77]],BLD.goldDark,4);
    line(running?[[78,77],[98,77]]:[[81,70],[95,84]],BLD.goldBright,4);
    if (running) {
      polygon([[104,129],[118,129],[122,151],[102,150]],BLD.waterBase);
      line([[108,130],[108,147]],BLD.waterLight,3);
      for(var splash=0;splash<5;splash++) {
        var sx=104+splash*5, sy=bed(sx)-8-Math.abs(Math.sin(time*4+splash))*4;
        rect(sx,sy,2,1.5,BLD.waterFoam);
      }
    }
    rect(245,260,45,36,BLD.metalDark,BLD.outline);
    c.beginPath(); c.arc(267,278,13,0,Math.PI*2); c.fillStyle=BLD.metalBase;c.fill();
    c.strokeStyle=BLD.outline;c.lineWidth=2;c.stroke();
    c.save();c.translate(267,278);c.rotate(running?time*3:0);
    line([[-8,0],[8,0]],BLD.metalLight,3);line([[0,-8],[0,8]],BLD.metalLight,3);c.restore();
    bolt(267,278);

    // Cleanout diverts the final concentrate into its own pan. The tailings
    // settle in the larger tank and the working water returns through the pipe.
    polygon([[526,269],[687,269],[674,304],[539,304]],BLD.metalDark,BLD.outline,2);
    polygon([[534,273],[679,273],[669,298],[544,298]],BLD.waterBase);
    line([[526,269],[687,269]],BLD.metalPale,3);
    if (cleanout) {
      polygon([[632,264],[767,241],[769,247],[635,270]],BLD.metalBase,BLD.outline);
      line([[633,264],[766,241]],BLD.metalLight,2);
      if(running) line([[635,263],[760,242]],BLD.waterLight,3);
      line([[766,230],[770,246]],BLD.metalPale,4);
    }
    if(hasCharge && washed>0) {
      for(var p=0;p<28*washed;p++)grain(547+(p*19)%117,291+(p*7)%6,1.8,p%4===0?material:BLD.stonePale);
      for(var n=0;n<finds*washed;n++){
        var nx=560+(n*37)%91,ny=286+(n*13)%9;
        grain(nx,ny,3.1,BLD.goldBright);rect(nx-1,ny-2,2,1,BLD.goldPale);
      }
    }
    polygon([[781,269],[923,269],[923,307],[781,307]],BLD.metalDark,BLD.outline,2);
    rect(785,279,134,23,BLD.waterBase);
    if(hasCharge)polygon([[785,300-fed*9],[813,300-fed*15],[848,300-fed*10],
      [884,300-fed*17],[919,300-fed*9],[919,303],[785,303]],material);
    line([[781,269],[923,269]],BLD.metalPale,3);
    line([[786,279],[918,279]],BLD.waterLight,1.5);
    rect(785,302,134,4,BLD.metalBase);bolt(787,273);bolt(917,273);
    if(running && !cleanout) {
      polygon([[752,222],[761,223],[804,277],[795,277]],BLD.waterBase);
      line([[756,225],[799,274]],BLD.waterLight,2);
      for(var t=0;t<9;t++) {
        var q=((time*.6+t*.13)%1);
        grain(759+q*39,230+q*q*47,1.3,material);
      }
    }

    // Labels stay on the apparatus and retain one arrangement at every size.
    label('WATER',90,53);
    label('HOPPER',226,39);
    label(cleanout?'RIFFLES LIFTED':'RIFFLE BED',487,143);
    if(scale >= 0.56) line([[487,150],[487,bed(487)-17]],UIMAT_WELD,1);
    label('CONCENTRATE',606,335,ready && finds?UIT_GOLD:UIT_DIM);
    label('TAILINGS',851,335);
    label('RETURN WATER',388,303);
    c.restore();
  }
