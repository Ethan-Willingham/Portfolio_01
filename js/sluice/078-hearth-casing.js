  // Shared foundry ironwork: the bath inset and working view use the same
  // aperture, cast rim, hinge barrels and removable ash drawer.
  function hearthChamfer(c, x, y, w, h, cut) {
    c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + w - cut, y);
    c.lineTo(x + w, y + cut); c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h); c.lineTo(x + cut, y + h);
    c.lineTo(x, y + h - cut); c.lineTo(x, y + cut); c.closePath();
  }
  function hearthIronBolt(c, x, y, radius) {
    c.fillStyle = BLD.outline; c.beginPath(); c.arc(x, y, radius + 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = BLD.metalBase; c.beginPath(); c.arc(x, y - 0.5, radius, 0, Math.PI * 2); c.fill();
    c.strokeStyle = BLD.metalLight; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x - radius * 0.6, y - radius * 0.5); c.lineTo(x + radius * 0.4, y - radius * 0.5); c.stroke();
    c.strokeStyle = BLD.outline;
    c.beginPath(); c.moveTo(x - radius * 0.5, y + radius * 0.4); c.lineTo(x + radius * 0.5, y - radius * 0.4); c.stroke();
  }
  function hearthDrawCasing(c, box, bed, hover) {
    var s = Math.min(1.15, box.w / HEARTH_WIDTH), w = box.w / s, h = box.h / s;
    c.save(); c.translate(box.x, box.y); c.scale(s, s);
    // Two stepped ledges separate the casting from its refractory backing.
    c.fillStyle = BLD.outline; hearthChamfer(c, -24, -26, w + 48, h + 61, 9); c.fill();
    c.fillStyle = BLD.stoneDark; hearthChamfer(c, -22, -24, w + 44, h + 55, 8); c.fill();
    c.strokeStyle = BLD.stoneBase; c.lineWidth = 1; c.stroke();
    var iron = c.createLinearGradient(0, -20, 0, h + 32);
    iron.addColorStop(0, BLD.metalBase); iron.addColorStop(0.08, BLD.metalDark);
    iron.addColorStop(0.8, BLD.metalDark); iron.addColorStop(1, BLD.outline);
    c.fillStyle = iron; hearthChamfer(c, -17, -20, w + 34, h + 48, 7); c.fill();
    c.strokeStyle = hover ? BLD.goldBase : BLD.metalLight; c.lineWidth = 1; c.stroke();
    // Recessed, uninterrupted mouth. No guard bars across the flame or coal.
    c.fillStyle = BLD.outline; c.fillRect(-7, -7, w + 14, h + 14);
    c.fillStyle = BLD.metalBase; c.fillRect(-6, -6, w + 12, 2);
    c.fillStyle = BLD.metalDark; c.fillRect(-5, -4, 5, h + 4); c.fillRect(w, -4, 5, h + 4);
    c.fillStyle = BLD.metalLight; c.fillRect(-5, h + 2, w + 10, 1);
    for (var side = 0; side < 2; side++) for (var end = 0; end < 2; end++) {
      hearthIronBolt(c, side ? w + 11 : -11, end ? h - 12 : 12, 2.3);
    }
    // Hinges sit on the jamb; a wood grip closes the opposite latch.
    for (var hinge = 0; hinge < 2; hinge++) {
      var hy = h * (hinge ? 0.75 : 0.25);
      c.fillStyle = BLD.outline; c.fillRect(-23, hy - 12, 13, 26);
      c.fillStyle = BLD.metalBase; c.fillRect(-21, hy - 10, 8, 22);
      c.fillStyle = BLD.metalLight; c.fillRect(-20, hy - 10, 2, 22);
      c.fillStyle = BLD.metalDark; c.fillRect(-21, hy - 1, 8, 2);
    }
    c.fillStyle = BLD.outline; c.fillRect(w + 9, h * 0.48 - 5, 16, 10);
    c.fillStyle = BLD.goldDark; c.fillRect(w + 10, h * 0.48 - 3, 14, 5);
    c.fillStyle = BLD.woodDark; c.fillRect(w + 20, h * 0.48 - 17, 7, 30);
    c.fillStyle = BLD.woodLight; c.fillRect(w + 21, h * 0.48 - 16, 1, 27);
    // Under-grate ash drawer, with recessed air slots and a loop pull.
    c.fillStyle = BLD.outline; c.fillRect(9, h + 9, w - 18, 14);
    c.fillStyle = BLD.metalDark; c.fillRect(10, h + 10, w - 20, 12);
    c.fillStyle = BLD.metalBase; c.fillRect(10, h + 10, w - 20, 1);
    for (var vent = 24; vent < w - 20; vent += 18) {
      c.fillStyle = BLD.outline; c.fillRect(vent, h + 14, 10, 3);
      c.fillStyle = BLD.metalBase; c.fillRect(vent, h + 17, 10, 1);
    }
    c.fillStyle = BLD.metalDark; c.fillRect(w / 2 - 25, h + 12, 50, 9);
    c.strokeStyle = BLD.metalLight; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w / 2 - 17, h + 13); c.lineTo(w / 2 - 17, h + 20);
    c.lineTo(w / 2 + 17, h + 20); c.lineTo(w / 2 + 17, h + 13); c.stroke();
    // Small cast maker's plate, integrated into the lintel.
    c.fillStyle = BLD.outline; c.fillRect(w / 2 - 72, -20, 144, 13);
    c.strokeStyle = BLD.goldDark; c.lineWidth = 0.7; c.strokeRect(w / 2 - 70, -18, 140, 9);
    hearthText(c, 'S L U I C E  /  B A N Y A', w / 2, -13, 7, BLD.goldPale, 'center');
    c.restore();
    hearthDrawFirebox(c, bed, box.x, box.y, box.w, box.h, hearthToolTime);
  }
