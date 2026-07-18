  // ========================================================================
  // v11.28 — WORKSHOP sub-page. 8 cards (4 gear + 4 special) in a 4x2 grid
  // sharing the same modal aesthetic as SHELF (plate steel + brass header,
  // wooden compartments, BUY rect buttons). Each gear item shows a tier
  // pip strip; specials show INSTALLED/MK x suffix. Re-uses buyUpgrade()
  // for the actual purchase logic so analytics + dev-mode + showMsg fire
  // identically. Uses procedural icons for v1; AI sprite swap is a
  // straightforward future drop-in.
  // ========================================================================
  var WORKSHOP_BUY_RECTS = [];
  var shopHoverWorkshopItem = null;
  var workshopBuyFx = { key: null, t: 0, success: false };
  var workshopHoverFadeT = {};
  var shopWorkshopModalEnterT = 0;

  function drawDrillUpgradeSprite(cx, cy, size, level) {
    var s = size;
    var tier = drillArtTier(level || 1);
    var rusty = tier <= 1;
    var carbide = tier === 3;
    var tungsten = tier === 4;
    var diamond = tier === 5;
    var plasma = tier >= 6;
    var crown = diamond || plasma;

    // The shop icon is a scaled side-view of the actual miner-mounted drill
    // assembly: pivot socket -> short arm -> shank -> rotary cutter head.
    // The clean tier is intentionally the same silhouette the miner used to
    // spawn with; tier 1 is just a rusted/dulled treatment of that form.
    var k = s / 10.9;
    ctx.save();
    ctx.translate(Math.floor(cx), Math.floor(cy));
    ctx.scale(k, k);
    ctx.translate(-5.4, 0);

    // Hydraulic socket / housing at the pivot.
    if (rusty) {
      ctx.fillStyle = '#1a0a05';
      roundRect(ctx, -3.0, -3.0, 6.0, 6.0, 1.4, true);
      ctx.fillStyle = '#2a241a';
      roundRect(ctx, -2.5, -2.4, 5.0, 4.8, 1.1, true);
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(-2.5, -2.4, 5.0, 1.0);
      ctx.fillStyle = '#8a3d22';
      ctx.fillRect(1.1, 0.9, 1.0, 1.0);
      ctx.fillStyle = '#77796d';
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#171b19';
      roundRect(ctx, -3.0, -3.0, 6.0, 6.0, 1.4, true);
      ctx.fillStyle = plasma ? '#5a3a72' : (diamond ? '#6f756e' : (tungsten ? '#5e6666' : (carbide ? '#9ca88f' : '#4a554d')));
      ctx.fillRect(-3.0, -3.0, 6.0, 1.1);
      ctx.fillStyle = plasma ? '#c45cff' : (diamond ? '#b79a50' : (tungsten ? '#737c7b' : (carbide ? '#d1aa55' : '#838b80')));
      ctx.beginPath();
      ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
      if (plasma) {
        ctx.fillStyle = '#080d16';
        ctx.fillRect(-2.2, -0.42, 4.4, 0.84);
        ctx.fillStyle = '#d36bff';
        ctx.fillRect(-1.55, -0.12, 3.1, 0.24);
        ctx.fillStyle = '#78fbff';
        ctx.fillRect(-0.85, 0.22, 1.7, 0.18);
      } else if (diamond) {
        ctx.fillStyle = '#101718';
        ctx.fillRect(-2.2, -0.40, 4.4, 0.80);
        ctx.fillStyle = '#c9b46d';
        ctx.fillRect(-1.4, -0.16, 2.8, 0.32);
      } else if (tungsten) {
        ctx.fillStyle = '#22292a';
        ctx.fillRect(-2.2, -0.45, 4.4, 0.9);
        ctx.fillStyle = '#9aa3a0';
        ctx.fillRect(-1.5, -0.18, 3.0, 0.36);
      } else if (carbide) {
        ctx.fillStyle = '#d8d4af';
        ctx.fillRect(-1.0, -0.35, 2.0, 0.7);
      }
    }

    var armLen = 3.2;
    var bitLen = 3.6;
    var armGrad = ctx.createLinearGradient(0, -1.9, 0, 1.9);
    armGrad.addColorStop(0,   rusty ? '#4a4a40' : (plasma ? '#74518e' : (diamond ? '#858b82' : (tungsten ? '#667071' : (carbide ? '#aebba4' : '#59635a')))));
    armGrad.addColorStop(0.5, rusty ? '#262820' : (plasma ? '#28163a' : (diamond ? '#343d3e' : (tungsten ? '#2d3638' : (carbide ? '#758773' : '#2c3430')))));
    armGrad.addColorStop(1,   rusty ? '#100e0b' : (plasma ? '#090512' : (diamond ? '#121819' : (tungsten ? '#0b1011' : (carbide ? '#344139' : '#111413')))));
    ctx.fillStyle = armGrad;
    ctx.fillRect(2.2, -1.9, armLen, 3.8);
    if (plasma) {
      ctx.fillStyle = '#4ff8ff';
      ctx.fillRect(2.55, -1.46, Math.max(0.6, armLen - 0.7), 0.34);
      ctx.fillStyle = '#d36bff';
      ctx.fillRect(2.55, 1.10, Math.max(0.6, armLen - 0.7), 0.30);
      ctx.fillStyle = '#0b111b';
      ctx.fillRect(2.55, -0.20, Math.max(0.6, armLen - 0.7), 0.40);
    } else if (diamond) {
      ctx.fillStyle = '#c3b475';
      ctx.fillRect(2.55, -1.56, Math.max(0.6, armLen - 0.7), 0.52);
      ctx.fillStyle = '#242b2b';
      ctx.fillRect(2.55, 1.02, Math.max(0.6, armLen - 0.7), 0.42);
    } else if (tungsten) {
      ctx.fillStyle = '#828c8c';
      ctx.fillRect(2.55, -1.55, Math.max(0.6, armLen - 0.7), 0.48);
      ctx.fillStyle = '#171d1e';
      ctx.fillRect(2.55, 0.92, Math.max(0.6, armLen - 0.7), 0.62);
    } else if (carbide) {
      ctx.fillStyle = '#cfd6b6';
      ctx.fillRect(2.6, -1.55, Math.max(0.6, armLen - 0.8), 0.65);
      ctx.fillStyle = '#5a6f5e';
      ctx.fillRect(2.6, 1.05, Math.max(0.6, armLen - 0.8), 0.42);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.6;
    for (var seam = 0; seam < 1; seam++) {
      var sxp = 2.2 + (seam + 1) * (armLen / 2);
      ctx.beginPath();
      ctx.moveTo(sxp, -1.9);
      ctx.lineTo(sxp, 1.9);
      ctx.stroke();
    }
    if (rusty) {
      ctx.fillStyle = '#7a3b1f';
      ctx.fillRect(3.0, 0.9, 1.5, 0.8);
      ctx.fillRect(2.2 + armLen - 1.4, -1.5, 1.2, 0.8);
    }

    var bitStartX = 2.2 + armLen;
    var shankLen = bitLen * 0.30;
    var shankGrad = ctx.createLinearGradient(bitStartX, -1.9, bitStartX, 1.9);
    shankGrad.addColorStop(0,    rusty ? '#4f4a3e' : (plasma ? '#5c3a78' : (diamond ? '#68746f' : (tungsten ? '#5f6869' : (carbide ? '#b9c5ad' : '#5a5a62')))));
    shankGrad.addColorStop(0.5,  rusty ? '#85806f' : (plasma ? '#c66cff' : (diamond ? '#b8aa72' : (tungsten ? '#a1aaaa' : (carbide ? '#d8c98d' : '#9a9aa2')))));
    shankGrad.addColorStop(1,    rusty ? '#34261d' : (plasma ? '#090b18' : (diamond ? '#171d1d' : (tungsten ? '#151a1b' : (carbide ? '#6d7c6d' : '#3a3a42')))));
    ctx.fillStyle = shankGrad;
    ctx.fillRect(bitStartX, -1.9, shankLen + 0.5, 3.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(bitStartX + shankLen, -1.9);
    ctx.lineTo(bitStartX + shankLen, 1.9);
    ctx.stroke();

    var headR = rusty ? 3.65 : 4.0;
    if (tungsten) headR += 0.15;
    var headX = bitStartX + shankLen + headR * 0.28;
    var ringGrad = ctx.createRadialGradient(headX - headR * 0.25, -headR * 0.25, headR * 0.2, headX, 0, headR);
    ringGrad.addColorStop(0,    rusty ? '#8e8c7f' : (plasma ? '#d36bff' : (diamond ? '#aaa17e' : (tungsten ? '#7d8786' : (carbide ? '#d7dfca' : '#9aa098')))));
    ringGrad.addColorStop(0.55, rusty ? '#464a3f' : (plasma ? '#3b1f52' : (diamond ? '#394344' : (tungsten ? '#30393a' : (carbide ? '#81966f' : '#515953')))));
    ringGrad.addColorStop(1,    rusty ? '#15110d' : (plasma ? '#050612' : (diamond ? '#080b0c' : (tungsten ? '#050809' : (carbide ? '#24312b' : '#171a19')))));
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(headX, 0, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070807';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (plasma) {
      ctx.strokeStyle = '#67fbff';
      ctx.lineWidth = 0.78;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#aa4cff';
      ctx.lineWidth = 0.44;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 1.08, -Math.PI * 0.86, Math.PI * 0.22);
      ctx.arc(headX, 0, headR - 1.52, Math.PI * 0.34, Math.PI * 1.18);
      ctx.stroke();
    } else if (diamond) {
      ctx.strokeStyle = '#c9bd92';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#2a1f12';
      ctx.lineWidth = 0.38;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 1.18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tungsten) {
      ctx.strokeStyle = '#111719';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#8e9896';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.95, -Math.PI * 0.86, Math.PI * 0.10);
      ctx.stroke();
    } else if (carbide) {
      ctx.strokeStyle = '#d8d4af';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(headX, 0, headR - 0.55, -Math.PI * 0.82, Math.PI * 0.18);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(headX, 0);
    if (crown) {
      ctx.fillStyle = '#414b49';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.56);
      ctx.lineTo(headR * 0.40, -headR * 0.30);
      ctx.lineTo(headR * 0.56, 0);
      ctx.lineTo(headR * 0.40, headR * 0.30);
      ctx.lineTo(0, headR * 0.56);
      ctx.lineTo(-headR * 0.40, headR * 0.30);
      ctx.lineTo(-headR * 0.56, 0);
      ctx.lineTo(-headR * 0.40, -headR * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = plasma ? '#d36bff' : '#b8aa72';
      ctx.lineWidth = 0.42;
      ctx.stroke();
      ctx.fillStyle = plasma ? '#060912' : '#242b2b';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.34);
      ctx.lineTo(headR * 0.28, 0);
      ctx.lineTo(0, headR * 0.34);
      ctx.lineTo(-headR * 0.28, 0);
      ctx.closePath();
      ctx.fill();
    }
    var bladeCount = crown ? 6 : (tungsten ? 6 : (rusty ? 7 : 8));
    for (var blade = 0; blade < bladeCount; blade++) {
      ctx.save();
      ctx.rotate((blade / bladeCount) * Math.PI * 2);
      var toothGrad = ctx.createLinearGradient(0, -1.0, headR + 2.1, 1.0);
      toothGrad.addColorStop(0, rusty ? '#3a2a1d' : (plasma ? '#070b12' : (diamond ? '#242b2b' : (tungsten ? '#202829' : (carbide ? '#596856' : '#303631')))));
      toothGrad.addColorStop(1, rusty ? '#a8a696' : (plasma ? '#c45cff' : (diamond ? '#d2c391' : (tungsten ? '#9aa4a2' : (carbide ? '#dbe1be' : '#b6bab0')))));
      ctx.fillStyle = toothGrad;
      ctx.beginPath();
      if (tungsten) {
        ctx.moveTo(headR * 0.02, -1.30);
        ctx.lineTo(headR + 2.10, -1.34);
        ctx.lineTo(headR + 1.82, 0);
        ctx.lineTo(headR + 2.10, 1.34);
        ctx.lineTo(headR * 0.02, 1.30);
      } else if (crown) {
        ctx.moveTo(headR * 0.18, -1.05);
        ctx.lineTo(headR + 1.72, -1.06);
        ctx.lineTo(headR + 1.48, -0.28);
        ctx.lineTo(headR + 1.76, 0);
        ctx.lineTo(headR + 1.48, 0.28);
        ctx.lineTo(headR + 1.72, 1.06);
        ctx.lineTo(headR * 0.18, 1.05);
        ctx.lineTo(headR * 0.38, 0);
      } else {
        ctx.moveTo(headR * 0.18, -0.85);
        ctx.lineTo(headR + 2.0, -1.25);
        ctx.lineTo(headR + 1.2, 1.25);
        ctx.lineTo(headR * 0.18, 0.85);
      }
      ctx.closePath();
      ctx.fill();
      if (crown) {
        ctx.fillStyle = '#151a19';
        ctx.beginPath();
        ctx.moveTo(headR + 0.22, -1.42);
        ctx.lineTo(headR + 1.42, -1.66);
        ctx.lineTo(headR + 2.08, -0.36);
        ctx.lineTo(headR + 2.34, 0);
        ctx.lineTo(headR + 2.08, 0.36);
        ctx.lineTo(headR + 1.42, 1.66);
        ctx.lineTo(headR + 0.22, 1.42);
        ctx.lineTo(headR + 0.50, 0);
        ctx.closePath();
        ctx.fill();
        var gemCx = headR + 1.46;
        var gemD = 1.18;
        var gemW = 1.72;
        ctx.fillStyle = '#071318';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.72, -gemW * 0.74);
        ctx.lineTo(gemCx - gemD * 0.22, -gemW * 1.03);
        ctx.lineTo(gemCx + gemD * 0.42, -gemW * 0.94);
        ctx.lineTo(gemCx + gemD * 0.90, -gemW * 0.36);
        ctx.lineTo(gemCx + gemD * 1.18, 0);
        ctx.lineTo(gemCx + gemD * 0.90, gemW * 0.36);
        ctx.lineTo(gemCx + gemD * 0.42, gemW * 0.94);
        ctx.lineTo(gemCx - gemD * 0.22, gemW * 1.03);
        ctx.lineTo(gemCx - gemD * 0.72, gemW * 0.74);
        ctx.lineTo(gemCx - gemD * 0.92, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a9f3ff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.56, -gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.74, -gemW * 0.30);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.lineTo(gemCx + gemD * 0.74, gemW * 0.30);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.lineTo(gemCx - gemD * 0.56, gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.72, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.58, -gemW * 0.26);
        ctx.lineTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#48c8df';
        ctx.beginPath();
        ctx.moveTo(gemCx + gemD * 0.58, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.lineTo(gemCx + gemD * 0.58, gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d5ffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.56, -gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.72, 0);
        ctx.lineTo(gemCx - gemD * 0.56, gemW * 0.62);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.lineTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f7ffff';
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.44, -gemW * 0.18);
        ctx.lineTo(gemCx + gemD * 0.02, -gemW * 0.44);
        ctx.lineTo(gemCx + gemD * 0.48, -gemW * 0.18);
        ctx.lineTo(gemCx + gemD * 0.30, gemW * 0.20);
        ctx.lineTo(gemCx - gemD * 0.30, gemW * 0.20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gemCx - gemD * 0.48, -gemW * 0.62, 0.76, 0.34);
        ctx.strokeStyle = '#237e90';
        ctx.lineWidth = 0.38;
        ctx.beginPath();
        ctx.moveTo(gemCx - gemD * 0.72, 0);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.moveTo(gemCx - gemD * 0.16, -gemW * 0.83);
        ctx.lineTo(gemCx - gemD * 0.16, gemW * 0.83);
        ctx.moveTo(gemCx + gemD * 0.34, -gemW * 0.76);
        ctx.lineTo(gemCx + gemD * 0.34, gemW * 0.76);
        ctx.moveTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.96, 0);
        ctx.moveTo(gemCx - gemD * 0.48, -gemW * 0.26);
        ctx.lineTo(gemCx + gemD * 0.04, gemW * 0.18);
        ctx.stroke();
        ctx.fillStyle = '#151a19';
        ctx.fillRect(gemCx - gemD * 0.92, -0.18, 0.42, 0.36);
        ctx.fillRect(gemCx + gemD * 0.86, -0.18, 0.40, 0.36);
        ctx.fillRect(gemCx - gemD * 0.34, -gemW * 1.02, 0.52, 0.36);
        ctx.fillRect(gemCx - gemD * 0.34, gemW * 0.82, 0.52, 0.36);
        if (plasma) drawPlasmaCrownTooth(headR);
      } else if (tungsten) {
        ctx.fillStyle = '#111718';
        ctx.fillRect(headR + 1.42, -0.72, 0.46, 1.44);
        ctx.fillStyle = '#b9c1bf';
        ctx.fillRect(headR + 0.34, -0.86, 0.74, 0.36);
      } else if (carbide) {
        ctx.fillStyle = '#14241f';
        ctx.beginPath();
        ctx.moveTo(headR + 0.82, -0.72);
        ctx.lineTo(headR + 1.84, -0.88);
        ctx.lineTo(headR + 1.62, 0.62);
        ctx.lineTo(headR + 0.72, 0.70);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#dcd2a6';
        ctx.beginPath();
        ctx.moveTo(headR + 1.02, -0.58);
        ctx.lineTo(headR + 1.72, -0.70);
        ctx.lineTo(headR + 1.48, 0.46);
        ctx.lineTo(headR + 0.88, 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#91bfa9';
        ctx.fillRect(headR + 1.14, -0.16, 0.52, 0.30);
      }
      ctx.restore();
    }
    if (plasma) {
      drawPlasmaCrownHub(headR);
    } else if (diamond) {
      ctx.fillStyle = '#b8aa72';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.34);
      ctx.lineTo(headR * 0.30, 0);
      ctx.lineTo(0, headR * 0.34);
      ctx.lineTo(-headR * 0.30, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#151a19';
      ctx.lineWidth = 0.34;
      ctx.stroke();
      ctx.fillStyle = '#151a19';
      for (var hubBolt = 0; hubBolt < 4; hubBolt++) {
        ctx.save();
        ctx.rotate(Math.PI * 0.25 + hubBolt * Math.PI * 0.5);
        ctx.fillRect(headR * 0.42, -0.14, 0.34, 0.28);
        ctx.restore();
      }
      ctx.fillStyle = '#ded2a3';
      ctx.beginPath();
      ctx.moveTo(0, -headR * 0.16);
      ctx.lineTo(headR * 0.14, 0);
      ctx.lineTo(0, headR * 0.16);
      ctx.lineTo(-headR * 0.14, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = tungsten ? '#050809' : (carbide ? '#111614' : '#0b0d0c');
      ctx.beginPath();
      ctx.arc(0, 0, tungsten ? headR * 0.31 : headR * 0.43, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tungsten ? '#6f7978' : (carbide ? '#c5984e' : '#747d73');
      var boltCount = tungsten ? 8 : 6;
      for (var bolt = 0; bolt < boltCount; bolt++) {
        var boltA = (bolt / boltCount) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(boltA) * headR * 0.62, Math.sin(boltA) * headR * 0.62, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tungsten ? '#9aa3a0' : (carbide ? '#d8d4af' : '#b8bcb2');
      ctx.beginPath();
      ctx.arc(0, 0, headR * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (rusty) {
      ctx.fillStyle = '#8a3d22';
      ctx.fillRect(-headR * 0.64, headR * 0.10, 1.0, 0.9);
      ctx.fillRect(headR * 0.28, -headR * 0.56, 0.9, 0.8);
    }
    ctx.restore();
    ctx.restore();
  }

  function drillShopTierLook(level) {
    if (level <= 1) {
      return { core: '156,74,38', glow: '92,48,24', rim: '#5a2d18', glint: '#8a3d22', shadow: '#1a0a05' };
    }
    if (level === 2) {
      return { core: '202,214,204', glow: '118,135,124', rim: '#66756a', glint: '#c8d0c4', shadow: '#171b19' };
    }
    if (level === 3) {
      return { core: '224,216,150', glow: '124,190,146', rim: '#9aa77e', glint: '#d8d4af', shadow: '#14241f' };
    }
    if (level === 4) {
      return { core: '166,178,178', glow: '68,88,94', rim: '#7f8a8a', glint: '#b9c1bf', shadow: '#050809' };
    }
    if (level === 5) {
      return { core: '244,238,208', glow: '210,184,116', rim: '#fff0b4', glint: '#fff8dc', shadow: '#0d0d09' };
    }
    if (level === 6) {
      return { core: '204,92,255', glow: '126,54,255', rim: '#d36bff', glint: '#f9e6ff', shadow: '#120820' };
    }
    return { core: '222,204,255', glow: '82,40,154', rim: '#f1eaff', glint: '#fff8ff', shadow: '#05020b' };
  }

  function drawDrillShopShowcase(nicheX, nicheY, nicheW, nicheH, level, hoverFade, canBuy, maxed) {
    var look = drillShopTierLook(level || 1);
    var tierT = Math.max(0, Math.min(1, ((level || 1) - 1) / 6));
    var cx = nicheX + nicheW / 2;
    var cy = nicheY + nicheH / 2;
    var innerX = nicheX + 2;
    var innerY = nicheY + 2;
    var innerW = nicheW - 4;
    var innerH = nicheH - 4;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : 0;
    var breath = 0.5 + 0.5 * Math.sin(now * (1.4 + tierT * 0.9) + level * 0.73);
    var affordScale = (!canBuy && !maxed) ? 0.78 : 1;
    var glowA = (0.08 + tierT * 0.18 + hoverFade * 0.09 + breath * tierT * 0.035) * affordScale;
    var washA = (0.035 + tierT * 0.055) * affordScale;

    ctx.fillStyle = 'rgba(' + look.glow + ',' + washA.toFixed(3) + ')';
    ctx.fillRect(innerX, innerY, innerW, innerH);

    var glowR = Math.max(nicheW, nicheH) * (0.50 + tierT * 0.24);
    var glowGrad = ctx.createRadialGradient(cx, cy, 3, cx, cy, glowR);
    glowGrad.addColorStop(0, 'rgba(' + look.core + ',' + Math.min(0.42, glowA + 0.05).toFixed(3) + ')');
    glowGrad.addColorStop(0.42, 'rgba(' + look.glow + ',' + (glowA * 0.58).toFixed(3) + ')');
    glowGrad.addColorStop(1, 'rgba(' + look.glow + ',0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();
    ctx.translate(cx, cy + nicheH * 0.12);
    ctx.scale(1, 0.34);
    var plinth = ctx.createRadialGradient(0, 0, 2, 0, 0, nicheW * (0.28 + tierT * 0.08));
    plinth.addColorStop(0, 'rgba(' + look.core + ',' + (0.15 + tierT * 0.15).toFixed(3) + ')');
    plinth.addColorStop(1, 'rgba(' + look.core + ',0)');
    ctx.fillStyle = plinth;
    ctx.beginPath();
    ctx.arc(0, 0, nicheW * (0.32 + tierT * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = look.shadow;
    ctx.fillRect(innerX, innerY + innerH - 2, innerW, 2);
    ctx.fillStyle = look.rim;
    ctx.globalAlpha = 0.22 + tierT * 0.18;
    ctx.fillRect(innerX + 2, innerY + 2, innerW - 4, 1);
    ctx.fillRect(innerX + 2, innerY + innerH - 4, innerW - 4, 1);
    ctx.globalAlpha = 1;

    if (level === 5) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(innerX, innerY, innerW, innerH);
      ctx.clip();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.34);
      ctx.fillStyle = 'rgba(255,248,220,' + (0.10 * affordScale).toFixed(3) + ')';
      ctx.fillRect(-innerW * 0.70, -innerH * 0.28, innerW * 1.40, 2);
      ctx.fillStyle = 'rgba(255,255,246,' + (0.18 * affordScale).toFixed(3) + ')';
      ctx.fillRect(-innerW * 0.48, innerH * 0.10, innerW * 0.96, 1);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,248,220,' + (0.22 * affordScale).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (var shard = 0; shard < 6; shard++) {
        var shX = innerX + 8 + Math.floor((((shard * 29 + 17) % 100) / 100) * (innerW - 16));
        var shY = innerY + 7 + Math.floor((((shard * 41 + 23) % 100) / 100) * (innerH - 14));
        ctx.beginPath();
        ctx.moveTo(shX, shY);
        ctx.lineTo(shX + 8, shY - 3);
        ctx.lineTo(shX + 14, shY + 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,246,' + (0.70 * affordScale).toFixed(3) + ')';
      for (var flash = 0; flash < 5; flash++) {
        var flX = innerX + 7 + Math.floor((((flash * 43 + 9) % 100) / 100) * (innerW - 14));
        var flY = innerY + 6 + Math.floor((((flash * 31 + 37) % 100) / 100) * (innerH - 12));
        ctx.fillRect(flX - 2, flY, 5, 1);
        ctx.fillRect(flX, flY - 2, 1, 5);
      }
      ctx.restore();
    } else if (level === 6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(innerX, innerY, innerW, innerH);
      ctx.clip();
      ctx.strokeStyle = 'rgba(211,107,255,' + (0.36 * affordScale).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (var arc = 0; arc < 3; arc++) {
        var ax0 = innerX + 8 + arc * Math.floor(innerW / 3);
        var ay0 = innerY + innerH - 8 - arc * 5;
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ax0 + 12, ay0 - 10);
        ctx.lineTo(ax0 + 20, ay0 - 5);
        ctx.lineTo(ax0 + 30, ay0 - 18);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,251,255,' + (0.20 * affordScale).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(innerW, innerH) * 0.33, -Math.PI * 0.70, Math.PI * 0.18);
      ctx.arc(cx, cy, Math.min(innerW, innerH) * 0.22, Math.PI * 0.25, Math.PI * 1.10);
      ctx.stroke();
      ctx.restore();
    }

    var tickCount = Math.min(7, Math.max(2, level || 1));
    var tickGap = Math.max(4, Math.floor(innerW / (tickCount + 2)));
    ctx.fillStyle = look.rim;
    for (var tick = 0; tick < tickCount; tick++) {
      var tx = cx - (tickCount - 1) * tickGap / 2 + tick * tickGap;
      var th = 2 + Math.floor(tierT * 2);
      ctx.fillRect(Math.floor(tx), innerY + 5, 2, th);
    }

    if (level >= 3) {
      var sparkCount = Math.min(10, level + 1);
      ctx.fillStyle = look.glint;
      for (var sp = 0; sp < sparkCount; sp++) {
        var sx = innerX + 5 + Math.floor((((sp * 37 + level * 19) % 100) / 100) * (innerW - 10));
        var sy = innerY + 5 + Math.floor((((sp * 53 + level * 11) % 100) / 100) * (innerH - 10));
        var sa = (0.22 + tierT * 0.22 + (sp % 3) * 0.04) * affordScale;
        ctx.globalAlpha = Math.min(0.72, sa);
        ctx.fillRect(sx, sy, 2, 1);
        if (level >= 5 && sp % 2 === 0) ctx.fillRect(sx + 1, sy - 1, 1, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  // v15.2 — Shop icon art kit. Hue-shifted material ramps: lighter tones
  // shift warm, darker tones shift cool; outlines are a dark hue-shifted
  // body tint, never pure black (pixel-art principles 2 & 5). One light
  // direction — top-left — committed across every icon (principle 3).
  // Shared so the workshop reads as one artist's hand (principle 12).
  var SHOP_MAT = {
    redSteel: { out:'#3a1410', deep:'#5e1612', shadow:'#86241b', base:'#ab3220', light:'#cd5d39', shine:'#ef9560' },
    iron:     { out:'#191d22', deep:'#2c333b', shadow:'#454f59', base:'#67717d', light:'#929ca8', shine:'#c0cad4' },
    brass:    { out:'#3a2a0c', deep:'#6b4d17', shadow:'#937021', base:'#c2962f', light:'#e7bd55', shine:'#fbe8a6' },
    wood:     { out:'#241408', deep:'#3f2913', shadow:'#5f3d1f', base:'#86592c', light:'#ab7c44', shine:'#cea96c' },
    ceramic:  { out:'#1d2f35', deep:'#2f4a52', shadow:'#3f5e68', base:'#648c97', light:'#95b8c2', shine:'#d2e7ec' },
    rubber:   { out:'#0c0d10', deep:'#15171c', shadow:'#212530', base:'#33384a', light:'#4b5167', shine:'#6b7188' }
  };
  // Domed rivet — dark seat ring, lit body, top-left highlight dot.
  function iconRivet(rx, ry, pal) {
    rx = rx | 0; ry = ry | 0;
    ctx.fillStyle = pal.out;   ctx.fillRect(rx, ry, 4, 4);
    ctx.fillStyle = pal.base;  ctx.fillRect(rx + 1, ry + 1, 2, 2);
    ctx.fillStyle = pal.shine; ctx.fillRect(rx + 1, ry + 1, 1, 1);
    ctx.fillStyle = pal.deep;  ctx.fillRect(rx + 2, ry + 2, 1, 1);
  }
  // Outlined, top-left-lit panel: outline ring, body, warm light bevel
  // (top + left) with a short shine hairline, cool shadow bevel
  // (bottom + right). The shared base shape for every shop icon.
  function iconPanel(px, py, pw, ph, pal) {
    px = px | 0; py = py | 0; pw = pw | 0; ph = ph | 0;
    if (pw < 3 || ph < 3) return;
    ctx.fillStyle = pal.out;    ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
    ctx.fillStyle = pal.base;   ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = pal.shadow; ctx.fillRect(px, py + ph - 1, pw, 1); ctx.fillRect(px + pw - 1, py, 1, ph);
    ctx.fillStyle = pal.deep;   ctx.fillRect(px + pw - 1, py + ph - 1, 1, 1);
    ctx.fillStyle = pal.light;  ctx.fillRect(px, py, pw - 1, 1); ctx.fillRect(px, py, 1, ph - 1);
    ctx.fillStyle = pal.shine;  ctx.fillRect(px, py, Math.max(3, (pw / 3) | 0), 1);
  }

  // Gear-upgrade icons (fuel / hull / cargo / heat / shield / vert / pump) as
  // 32x32 pixel-art sprites: warm palette, 1px dark outline, light from the
  // upper-left. Built once into offscreen bitmaps and blitted into the
  // workshop niche. Helpers stay private so their generic names don't collide.
  var shopGearSprites = (function () {
    var N = 32, INK = '#15100a';
    var STEEL  = ['#494139', '#6d6359', '#94897b', '#bcb1a1', '#ece2d2'];
    var OLIVE  = ['#2c3a20', '#46562b', '#67803a', '#8fa84a', '#b8d063'];
    var WOOD   = ['#4a2f17', '#6b4422', '#8a5a2e', '#a8743c', '#c8964f'];
    var IRONBL = ['#222d38', '#33485a', '#4d6b80', '#6f93a8', '#a3c6da'];
    var IRON   = ['#0e0c0b', '#23211e', '#3a3733', '#56524c', '#837c72'];
    var HEAT   = ['#7a2410', '#c0431a', '#ef7a24', '#ffb24a', '#ffe890'];
    var REDST  = ['#5e1410', '#9e241a', '#d2402c', '#ee6a4e', '#ff9a7e'];
    var CYAN   = ['#1d4a55', '#2f8a9a', '#5fc6d6', '#a6ecf5', '#e6ffff'];
    var CERAM  = ['#3a4048', '#565d66', '#7c848e', '#a8b0b8', '#e2e7ec'];
    var OIL    = ['#120d08', '#2a1e10', '#46341a', '#67502a'];
    function emptyGrid() {
      var g = [];
      for (var r = 0; r < N; r++) { var row = []; for (var c = 0; c < N; c++) row.push(0); g.push(row); }
      return g;
    }
    function setCell(g, r, c, v) { if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; }
    function shade(ramp, b) {
      var i = Math.round(b * (ramp.length - 1));
      if (i < 0) i = 0; if (i > ramp.length - 1) i = ramp.length - 1;
      return ramp[i];
    }
    function outline(g) {
      var out = emptyGrid(), r, c;
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) out[r][c] = g[r][c];
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        if (g[r][c] !== 0) continue;
        var near = (r > 0 && g[r - 1][c] !== 0) || (r < N - 1 && g[r + 1][c] !== 0) ||
                   (c > 0 && g[r][c - 1] !== 0) || (c < N - 1 && g[r][c + 1] !== 0);
        if (near) out[r][c] = INK;
      }
      return out;
    }
    function disc(g, cx, cy, rad, ramp, amb) {
      amb = amb == null ? 0.16 : amb;
      for (var r = Math.floor(cy - rad - 1); r <= Math.ceil(cy + rad + 1); r++) {
        for (var c = Math.floor(cx - rad - 1); c <= Math.ceil(cx + rad + 1); c++) {
          var nx = (c - cx) / rad, ny = (r - cy) / rad, d2 = nx * nx + ny * ny;
          if (d2 > 1) continue;
          var dif = nx * (-0.5) + ny * (-0.55) + Math.sqrt(1 - d2) * 0.66;
          setCell(g, r, c, shade(ramp, Math.min(1, amb + (1 - amb) * Math.max(0, dif))));
        }
      }
    }
    function box(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 0.82 - ((c - x0) / w) * 0.55;
        if (r === y0) b += 0.16;
        if (r === y1) b -= 0.20;
        setCell(g, r, c, shade(ramp, Math.max(0.04, Math.min(1, b))));
      }
    }
    function vcyl(g, x0, y0, x1, y1, ramp) {
      var w = Math.max(1, x1 - x0);
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        var b = 1 - Math.abs((c - x0) / w - 0.34) * 1.45;
        if (r === y0) b += 0.08;
        setCell(g, r, c, shade(ramp, Math.max(0.06, Math.min(1, b))));
      }
    }
    function qbez(g, p0, p1, p2, color) {
      for (var t = 0; t <= 1.0001; t += 0.03) {
        var u = 1 - t;
        setCell(g, Math.round(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]),
                   Math.round(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]), color);
      }
    }
    function buildFuel() {
      var g = emptyGrid();
      box(g, 7, 9, 23, 28, OLIVE);
      setCell(g, 9, 7, 0); setCell(g, 9, 23, 0); setCell(g, 28, 7, 0); setCell(g, 28, 23, 0);
      box(g, 16, 5, 21, 9, STEEL);
      box(g, 15, 4, 22, 5, STEEL);
      box(g, 8, 5, 14, 6, STEEL);
      setCell(g, 7, 9, STEEL[3]); setCell(g, 7, 13, STEEL[3]);
      for (var r = 12; r <= 25; r++) {
        var t = (r - 12) / 13, ca = Math.round(9 + t * 12), cb = Math.round(21 - t * 12);
        setCell(g, r, ca, OLIVE[0]); setCell(g, r, ca + 1, OLIVE[0]); setCell(g, r - 1, ca, OLIVE[3]);
        setCell(g, r, cb, OLIVE[0]); setCell(g, r, cb - 1, OLIVE[0]); setCell(g, r - 1, cb, OLIVE[3]);
      }
      return outline(g);
    }
    function buildHull() {
      var g = emptyGrid();
      box(g, 6, 6, 25, 27, IRONBL);
      setCell(g, 6, 6, 0); setCell(g, 6, 25, 0); setCell(g, 27, 6, 0); setCell(g, 27, 25, 0);
      for (var c = 7; c <= 24; c++) { setCell(g, 6, c, IRONBL[4]); setCell(g, 27, c, IRONBL[0]); }
      for (var r = 7; r <= 26; r++) { setCell(g, r, 6, IRONBL[4]); setCell(g, r, 25, IRONBL[1]); }
      for (var c2 = 7; c2 <= 24; c2++) { setCell(g, 16, c2, IRONBL[0]); setCell(g, 17, c2, IRONBL[3]); }
      var riv = [[9, 9], [9, 22], [24, 9], [24, 22], [13, 15], [20, 15]];
      for (var i = 0; i < riv.length; i++) {
        setCell(g, riv[i][0], riv[i][1], IRON[0]);
        setCell(g, riv[i][0] - 1, riv[i][1] - 1, IRONBL[4]);
      }
      return outline(g);
    }
    function buildCargo() {
      var g = emptyGrid();
      box(g, 5, 7, 26, 28, WOOD);
      for (var r = 7; r <= 28; r++) {
        setCell(g, r, 11, WOOD[0]); setCell(g, r, 16, WOOD[0]); setCell(g, r, 21, WOOD[0]);
        setCell(g, r, 12, WOOD[3]); setCell(g, r, 17, WOOD[3]);
      }
      box(g, 5, 8, 26, 10, STEEL);
      box(g, 5, 25, 26, 27, STEEL);
      var cols = [8, 14, 18, 24];
      for (var i = 0; i < cols.length; i++) {
        setCell(g, 9, cols[i], IRON[0]); setCell(g, 8, cols[i] - 1, STEEL[4]);
        setCell(g, 26, cols[i], IRON[0]); setCell(g, 25, cols[i] - 1, STEEL[4]);
      }
      return outline(g);
    }
    function buildHeat() {
      var g = emptyGrid();
      function wave(R, c0, c1, color, amp) {
        for (var c = c0; c <= c1; c++) setCell(g, R + Math.round(Math.sin((c - c0) * 0.85) * amp), c, color);
      }
      wave(3, 11, 21, HEAT[3], 1);
      wave(6, 12, 20, HEAT[2], 1);
      vcyl(g, 13, 9, 18, 15, STEEL);
      box(g, 11, 15, 20, 17, STEEL);
      for (var r = 17; r <= 29; r++) {
        var t = (r - 17) / 12, hw = Math.round(5 * (1 - t));
        if (hw < 1) break;
        var cL = 16 - hw, cR = 15 + hw, w = Math.max(1, cR - cL);
        for (var c = cL; c <= cR; c++) {
          setCell(g, r, c, shade(HEAT, Math.max(0, Math.min(1, 0.32 + t * 0.62 - ((c - cL) / w) * 0.16))));
        }
      }
      return outline(g);
    }
    function buildShield() {
      var g = emptyGrid();
      for (var r = 5; r <= 27; r++) {
        var hw = (r < 12) ? Math.round(7 * (r - 4) / 8) : Math.round(7 * (27 - r) / 15);
        if (hw < 1) continue;
        var cL = 15 - hw, cR = 16 + hw, w = Math.max(1, cR - cL);
        for (var c = cL; c <= cR; c++) {
          setCell(g, r, c, shade(CERAM, Math.max(0.1, Math.min(1, 0.9 - Math.abs((c - cL) / w - 0.36) * 1.2))));
        }
      }
      qbez(g, [22, 9], [30, 15], [23, 22], HEAT[3]);
      qbez(g, [25, 12], [30, 18], [25, 25], HEAT[2]);
      return outline(g);
    }
    function buildVert() {
      var g = emptyGrid(), period = 6, hbByPhase = [0.04, 0.20, 0.50, 0.78, 0.55, 0.24];
      function quant(b) {
        if (b < 0.16) return STEEL[0]; if (b < 0.34) return STEEL[1]; if (b < 0.56) return STEEL[2];
        if (b < 0.78) return STEEL[3]; return STEEL[4];
      }
      for (var r = 2; r <= 29; r++) {
        var region, hw;
        if (r <= 8) { hw = Math.round(1 + ((r - 2) / 6) * 4); region = 'tip'; }
        else if (r <= 20) { hw = 5; region = 'flute'; }
        else if (r <= 23) { hw = 6; region = 'collar'; }
        else { hw = 5; region = 'shank'; }
        var cL = 16 - hw, cR = 15 + hw, w = Math.max(1, cR - cL);
        for (var c = cL; c <= cR; c++) {
          var rel = (c - cL) / w;
          if (region === 'collar') {
            setCell(g, r, c, (rel < 0.26) ? CYAN[3] : (rel < 0.74 ? CYAN[2] : CYAN[1]));
          } else if (region === 'flute') {
            var ph = (c + r) % period, hb = hbByPhase[ph], xc = 1 - rel;
            var b = (hb < 0.10) ? (0.05 + 0.16 * xc) : (0.42 * xc + 0.62 * hb + 0.04);
            setCell(g, r, c, quant(b));
          } else {
            setCell(g, r, c, shade(STEEL, Math.max(0.1, Math.min(1, 1 - Math.abs(rel - 0.32) * 1.3))));
          }
        }
      }
      for (var sr = 24; sr <= 28; sr++) setCell(g, sr, 13, STEEL[4]);
      setCell(g, 3, 15, STEEL[4]); setCell(g, 3, 16, STEEL[3]);
      function chevron(apexR, apexC) {
        for (var k = 0; k < 4; k++) { setCell(g, apexR + k, apexC - k, CYAN[3]); setCell(g, apexR + k, apexC + k, CYAN[3]); }
      }
      chevron(6, 7); chevron(6, 25);
      return outline(g);
    }
    function buildPump() {
      var g = emptyGrid();
      vcyl(g, 14, 6, 19, 27, STEEL);
      box(g, 12, 4, 21, 6, STEEL);
      var wx = 9, wy = 14;
      for (var r = wy - 6; r <= wy + 6; r++) for (var c = wx - 6; c <= wx + 6; c++) {
        var d = Math.sqrt((c - wx) * (c - wx) + (r - wy) * (r - wy));
        if (d <= 5.6 && d >= 2.6) {
          setCell(g, r, c, shade(REDST, Math.max(0.15, Math.min(1, 0.85 - ((r - wy) + (c - wx)) / 14))));
        }
      }
      setCell(g, wy, wx, REDST[1]); setCell(g, wy - 1, wx, REDST[2]); setCell(g, wy, wx - 1, REDST[2]);
      for (var k = -4; k <= 4; k++) { setCell(g, wy, wx + k, REDST[2]); setCell(g, wy + k, wx, REDST[2]); }
      setCell(g, wy, 14, STEEL[2]); setCell(g, wy, 15, STEEL[3]);
      disc(g, 16, 29, 2.4, OIL, 0.2);
      qbez(g, [16, 27], [14, 29], [16, 31], OIL[2]);
      return outline(g);
    }
    function buildBooster() {
      var g = emptyGrid();
      box(g, 13, 3, 18, 5, IRONBL);      // nose cap
      vcyl(g, 11, 5, 20, 18, STEEL);     // rounded steel body
      box(g, 11, 11, 20, 12, CYAN);      // cyan accent band
      box(g, 9, 18, 22, 23, IRON);       // flared dark nozzle bell
      // Exhaust flame, tapering to a point.
      var fr = [[24,11,20],[25,12,19],[26,13,18],[27,14,17],[28,15,16],[29,15,16]];
      for (var i = 0; i < fr.length; i++) {
        var rr = fr[i][0], c0 = fr[i][1], c1 = fr[i][2], mid = (c0 + c1) >> 1;
        for (var c = c0; c <= c1; c++) {
          setCell(g, rr, c, c === mid ? HEAT[4] : (Math.abs(c - mid) <= 1 ? HEAT[3] : HEAT[2]));
        }
      }
      return outline(g);
    }
    var BUILDERS = {
      fuel: buildFuel, hull: buildHull, cargo: buildCargo, heat: buildHeat,
      shield: buildShield, vert: buildVert, pump: buildPump, booster: buildBooster
    };
    var cache = {};
    function bitmap(kind) {
      if (cache[kind]) return cache[kind];
      var build = BUILDERS[kind]; if (!build) return null;
      var g = build();
      var off = document.createElement('canvas'); off.width = N; off.height = N;
      var o = off.getContext('2d');
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var v = g[r][c]; if (v === 0 || v == null) continue;
        o.fillStyle = v; o.fillRect(c, r, 1, 1);
      }
      cache[kind] = off; return off;
    }
    return { bitmap: bitmap, SIZE: N };
  })();

  function drawUpgradeIconBig(kind, cx, cy, size, level) {
    // Drill keeps its level-aware sprite (it morphs through the tier names).
    if (kind === 'drill') { drawDrillUpgradeSprite(cx, cy, size * 0.76, level || 1); return; }
    var bmp = shopGearSprites.bitmap(kind);
    if (!bmp) return;
    var d = Math.round(size * 0.92);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0, shopGearSprites.SIZE, shopGearSprites.SIZE,
                  Math.round(cx - d / 2), Math.round(cy - d / 2), d, d);
    ctx.restore();
  }

  function drawTierPipStrip(x, y, current, max, w) {
    // Horizontal strip of N pip dots; filled = current tier acquired,
    // empty = not yet. Brass-on-dark for legibility.
    var pad = 2;
    var pipSize = Math.max(4, Math.floor((w - pad * (max - 1)) / max));
    if (pipSize > 8) pipSize = 8;
    var totalW = pipSize * max + pad * (max - 1);
    var startX = x + Math.floor((w - totalW) / 2);
    for (var i = 0; i < max; i++) {
      var px = startX + i * (pipSize + pad);
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(px - 1, y - 1, pipSize + 2, pipSize + 2);
      if (i < current) {
        ctx.fillStyle = '#d4a838';
        ctx.fillRect(px, y, pipSize, pipSize);
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(px, y, 1, 1);
      } else {
        ctx.fillStyle = '#3a2818';
        ctx.fillRect(px, y, pipSize, pipSize);
      }
    }
  }

  function drawWorkshopSubPage() {
    var L = shopRoomLayout();
    WORKSHOP_BUY_RECTS = [];
    var dt = 1 / 60;

    // Animation ticks
    if (workshopBuyFx.t > 0) workshopBuyFx.t -= dt;
    if (workshopBuyFx.t <= 0) workshopBuyFx.key = null;
    shopWorkshopModalEnterT = Math.min(1, shopWorkshopModalEnterT + dt / 0.20);
    // Hover fades
    var allKeys = ['drill','fuel','hull','cargo','booster','heat','shield','vert','pump'];
    for (var hki = 0; hki < allKeys.length; hki++) {
      var k = allKeys[hki];
      var target = (shopHoverWorkshopItem === k) ? 1 : 0;
      var cur = workshopHoverFadeT[k] || 0;
      var rate = dt / 0.12;
      if (cur < target) cur = Math.min(target, cur + rate);
      else if (cur > target) cur = Math.max(target, cur - rate);
      workshopHoverFadeT[k] = cur;
    }
    // Reuse cash flash + coin splash + receipt printer state from SHELF
    if (cashFlashFx.t > 0) cashFlashFx.t -= dt;
    if (cashFlashFx.t <= 0) cashFlashFx.color = null;
    for (var ci = shelfCoins.length - 1; ci >= 0; ci--) {
      var pc = shelfCoins[ci];
      pc.x += pc.vx; pc.y += pc.vy;
      pc.vy += 0.35;
      pc.phase = (pc.phase || 0) + 0.6;
      pc.t -= dt;
      if (pc.t <= 0) shelfCoins.splice(ci, 1);
    }

    // Backdrop
    var spec = SHOP_SPRITES[currentTown];
    var bg = spec ? loadShopSprite(spec.background) : null;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0, viewW, L.canvasBottom);
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    } else {
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(0, 0, viewW, L.canvasBottom);
    }

    // Modal box — sized from desired cell content + clamped to room.
    // v11.31: derive modalH from a fixed cell height target so the modal
    // is always compact, never bloated to fill leftover space.
    var modalW = Math.min(900, viewW - 60);
    var DESIRED_CELL_H = 140;
    var HEADER_AREA = 110;     // top margin + brass header band
    var SECTION_LABEL = 14;    // GEAR / SPECIAL stencil label height
    var ROW_GAP = 26;          // gap between row 0 and row 1 (with SPECIAL label)
    var BOTTOM_PAD = 18;       // bottom margin inside the modal
    var desiredModalH = HEADER_AREA + SECTION_LABEL + DESIRED_CELL_H +
                        ROW_GAP + SECTION_LABEL + DESIRED_CELL_H + BOTTOM_PAD;
    var modalH = Math.min(desiredModalH, L.canvasBottom - 80);
    var modalX = Math.floor((viewW - modalW) / 2);
    var modalY = Math.max(56, Math.floor((L.canvasBottom - modalH) / 2));

    // Entrance scale + opacity
    var entranceEase = 1 - Math.pow(1 - shopWorkshopModalEnterT, 3);
    var entranceScale = 0.94 + 0.06 * entranceEase;
    var entranceAlpha = entranceEase;
    if (entranceEase < 1) {
      var modalCX = modalX + modalW / 2;
      var modalCY = modalY + modalH / 2;
      ctx.save();
      ctx.globalAlpha = entranceAlpha;
      ctx.translate(modalCX, modalCY);
      ctx.scale(entranceScale, entranceScale);
      ctx.translate(-modalCX, -modalCY);
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(modalX + 8, modalY + 10, modalW, modalH);

    // Plate steel body
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(modalX - 2, modalY - 2, modalW + 4, modalH + 4);
    ctx.fillStyle = '#3d3a35';
    ctx.fillRect(modalX, modalY, modalW, modalH);
    ctx.fillStyle = '#4f4c46';
    ctx.fillRect(modalX, modalY, modalW, 2);
    ctx.fillRect(modalX, modalY, 2, modalH);
    ctx.fillStyle = '#2a2724';
    ctx.fillRect(modalX, modalY + modalH - 2, modalW, 2);
    ctx.fillRect(modalX + modalW - 2, modalY, 2, modalH);

    // Warm rim light
    var rimGrad = ctx.createLinearGradient(modalX, modalY, modalX + modalW * 0.55, modalY + modalH * 0.4);
    rimGrad.addColorStop(0, 'rgba(255,200,90,0.10)');
    rimGrad.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(modalX + 2, modalY + 2, modalW - 4, modalH - 4);

    // Iron L-brackets at corners
    drawIronBracket(modalX + 2, modalY + 2, 28, 28, false, false);
    drawIronBracket(modalX + modalW - 30, modalY + 2, 28, 28, true, false);
    drawIronBracket(modalX + 2, modalY + modalH - 30, 28, 28, false, true);
    drawIronBracket(modalX + modalW - 30, modalY + modalH - 30, 28, 28, true, true);

    // Brass header
    var headX = modalX + 36;
    var headY = modalY + 50;
    var headW = modalW - 72;
    var headH = 48;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(headX - 2, headY - 2, headW + 4, headH + 4);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(headX, headY, headW, headH);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(headX + 2, headY + 2, headW - 4, headH - 4);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(headX + 2, headY + 2, headW - 4, 2);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(headX + 2, headY + headH - 4, headW - 4, 2);
    drawBrassBolt(headX + 8, headY + 8);
    drawBrassBolt(headX + headW - 10, headY + 8);
    drawBrassBolt(headX + 8, headY + headH - 10);
    drawBrassBolt(headX + headW - 10, headY + headH - 10);

    var title = 'WORKSHOP';
    drawStencilText(title, headX + 24, headY + Math.floor((headH - 21) / 2) + 1, 3, '#1f1408');

    // Cash readout
    var cashStr = '$' + money.toLocaleString();
    var cw = stencilTextWidth(cashStr, 2);
    var cashW = cw + 28;
    var cashH = 26;
    var cashX = headX + headW - cashW - 10;
    var cashY = headY + Math.floor((headH - cashH) / 2);
    var cashColor = '#d4a838';
    var flashAmt = cashFlashFx.t > 0 ? Math.min(1, cashFlashFx.t * 3) : 0;
    if (flashAmt > 0 && cashFlashFx.color) cashColor = cashFlashFx.color;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cashX, cashY, cashW, cashH);
    ctx.fillStyle = '#0e0a04';
    ctx.fillRect(cashX + 2, cashY + 2, cashW - 4, cashH - 4);
    if (flashAmt > 0 && cashFlashFx.color) {
      var bgFlashColor = cashFlashFx.color === '#40c060' ? 'rgba(64,192,96,' : 'rgba(168,40,40,';
      ctx.fillStyle = bgFlashColor + (flashAmt * 0.35).toFixed(3) + ')';
      ctx.fillRect(cashX + 2, cashY + 2, cashW - 4, cashH - 4);
    }
    drawStencilText(cashStr, cashX + 14, cashY + 6, 2, cashColor);

    // Section start Y (labels are positioned per-row below)
    var sectionY = headY + headH + 12;

    // Items
    var items = [
      { key: 'drill',  name: 'DRILL',     section: 0, levelKey: 'drillLevel',  costs: shop.drill,  isSpecial: false },
      { key: 'fuel',   name: 'FUEL TANK', section: 0, levelKey: 'fuelLevel',   costs: shop.fuel,   isSpecial: false },
      { key: 'hull',   name: 'HULL',      section: 0, levelKey: 'hullLevel',   costs: shop.hull,   isSpecial: false },
      { key: 'cargo',  name: 'CARGO',     section: 0, levelKey: 'cargoLevel',  costs: shop.cargo,  isSpecial: false },
      { key: 'heat',   name: 'HEATED DRILL', section: 1, levelKey: 'heatLevel',  costs: shop.heat,   isSpecial: true },
      { key: 'shield', name: 'HEAT SHIELD',  section: 1, levelKey: 'shieldLevel', costs: shop.shield, isSpecial: true },
      { key: 'vert',   name: 'VERTICAL DRILL', section: 1, levelKey: 'vertLevel',   costs: shop.vert,   isSpecial: true },
      { key: 'pump',   name: 'OIL PUMP',  section: 1, levelKey: 'pumpLevel',  costs: shop.pump,  isSpecial: true }
    ];
    if (!ENABLE_OIL) items = items.filter(function (it) { return it.key !== 'pump'; });

    // Layout: 4 cols x 2 rows, gear top, special bottom. Section labels
    // sit in the gap above each row.
    var gridX = headX + 24;
    var gridW = headW - 48;
    var cellPad = 10;
    var cellW = Math.floor((gridW - cellPad * 3) / 4);
    // Compute cellH from the modal's actual height (which was already
    // clamped to fit the canvas).
    var availH = modalH - HEADER_AREA - SECTION_LABEL * 2 - ROW_GAP - BOTTOM_PAD;
    var cellH = Math.floor(availH / 2);
    if (cellH < 110) cellH = 110;
    if (cellH > DESIRED_CELL_H) cellH = DESIRED_CELL_H;
    var row0Y = sectionY + SECTION_LABEL;
    var row1Y = row0Y + cellH + ROW_GAP;

    // Section labels
    drawStencilText('GEAR',    headX + 4, row0Y - SECTION_LABEL, 1, '#a08a60');
    drawStencilText('SPECIAL', headX + 4, row1Y - SECTION_LABEL, 1, '#a08a60');

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var col = i % 4;
      var row = it.section;
      var cellX = gridX + col * (cellW + cellPad);
      var cellY = (row === 0) ? row0Y : row1Y;
      drawWorkshopCell(it, cellX, cellY, cellW, cellH);
    }

    // Coins (shared from SHELF)
    for (var pi = 0; pi < shelfCoins.length; pi++) {
      var pp = shelfCoins[pi];
      var alpha = Math.min(1, pp.t * 2);
      var sparkle = Math.sin(pp.phase || 0) > 0;
      var sz = pp.size || 3;
      ctx.fillStyle = 'rgba(212,168,56,' + (alpha * 0.4).toFixed(3) + ')';
      ctx.fillRect(pp.x - pp.vx * 0.4, pp.y - pp.vy * 0.4, sz, sz);
      ctx.fillStyle = (cashFlashFx.color === '#a01a14') ? 'rgba(168,40,40,' + alpha.toFixed(3) + ')' : 'rgba(212,168,56,' + alpha.toFixed(3) + ')';
      ctx.fillRect(pp.x, pp.y, sz, sz);
      if (sparkle) {
        ctx.fillStyle = 'rgba(255,240,192,' + alpha.toFixed(3) + ')';
        ctx.fillRect(pp.x, pp.y, 1, 1);
      }
    }

    if (entranceEase < 1) ctx.restore();
    drawShopBackArrow();
  }

  function drawWorkshopCell(it, x, y, w, h) {
    var lvl = upgrades[it.levelKey] || 0;
    var maxLvl = it.costs.length;       // gear max level = length (start at 1, costs[0]=placeholder); specials: 1..length
    // Level semantics differ: gear has costs[0]=0 (placeholder), buy goes 1→2 etc.
    // Specials are 1-indexed, length = max levels.
    var maxed;
    var nextCost;
    var displayedLvl;     // shown as "Lv X"
    var pipsCurrent;
    var pipsMax;
    if (it.isSpecial) {
      maxed = lvl >= maxLvl;
      nextCost = maxed ? 0 : it.costs[lvl];
      displayedLvl = lvl;
      pipsCurrent = lvl;
      pipsMax = maxLvl;
    } else {
      // Gear: level starts at 1, costs[lvl] is the cost to get to lvl+1
      maxed = lvl >= it.costs.length;
      nextCost = maxed ? 0 : it.costs[lvl];
      displayedLvl = lvl;
      pipsCurrent = lvl;
      pipsMax = it.costs.length;   // gear levels 1..length
    }
    var canBuy = !maxed && (devMode || money >= nextCost);
    var iconLevel = displayedLvl;
    var nameText = it.name;
    if (it.key === 'drill') {
      iconLevel = maxed ? lvl : lvl + 1;
      nameText = drillTierShortName(iconLevel);
    }
    var hoverFade = workshopHoverFadeT[it.key] || 0;
    var hovered = hoverFade > 0.05;
    var pulling = (workshopBuyFx.key === it.key && workshopBuyFx.t > 0);
    var pullT = 0;
    if (pulling) {
      var totalT = 0.4;
      var elapsed = totalT - workshopBuyFx.t;
      if (elapsed < 0.12) {
        var p1 = elapsed / 0.12;
        pullT = 1 - Math.pow(1 - p1, 3);
      } else if (elapsed < 0.18) {
        pullT = 1;
      } else {
        var p2 = Math.min(1, (elapsed - 0.18) / 0.22);
        pullT = 1 - p2 * p2;
      }
    }

    // Wooden compartment
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#5e3e22';
    ctx.fillRect(x, y, w, h);
    // Wood grain
    ctx.fillStyle = '#4a2f18';
    for (var gy = y + 6; gy < y + h - 4; gy += 7) {
      ctx.fillRect(x + 4, gy, w - 8, 1);
    }
    // Wood patina (deterministic)
    var seedHash = 0;
    for (var hi = 0; hi < it.key.length; hi++) seedHash = (seedHash * 31 + it.key.charCodeAt(hi)) | 0;
    function seedRand(n) { var v = Math.sin((seedHash + n) * 12.9898) * 43758.5453; return v - Math.floor(v); }
    ctx.fillStyle = '#3a2218';
    for (var di = 0; di < 3; di++) {
      var dx = x + 6 + Math.floor(seedRand(di * 2) * (w - 12));
      var dy = y + 6 + Math.floor(seedRand(di * 2 + 1) * (h - 12));
      ctx.fillRect(dx, dy, 2, 1);
    }
    // Bevel
    ctx.fillStyle = '#7a5028';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillStyle = '#3a2218';
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);
    // Brass corner brackets
    drawBrassCornerL(x + 2, y + 2, false, false);
    drawBrassCornerL(x + w - 14, y + 2, true, false);
    drawBrassCornerL(x + 2, y + h - 14, false, true);
    drawBrassCornerL(x + w - 14, y + h - 14, true, true);

    // v11.31 — Fixed bottom block (nameplate + pips + button + paddings),
    // niche absorbs everything left over. No overflow regardless of h.
    var TOP_PAD = 8;
    var BOTTOM_PAD2 = 5;
    var BTN_H = 28;
    var BTN_GAP = 5;
    var PIPS_H = 8;
    var PIPS_GAP = 4;
    var NAMEPLATE_H = 14;
    var NAMEPLATE_GAP = 3;
    var bottomBlockH = NAMEPLATE_GAP + NAMEPLATE_H + PIPS_GAP + PIPS_H + BTN_GAP + BTN_H + BOTTOM_PAD2;
    var nicheH = h - TOP_PAD - bottomBlockH;
    if (nicheH < 32) nicheH = 32;
    var nicheX = x + 12;
    var nicheY = y + TOP_PAD;
    var nicheW = w - 24;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(nicheX, nicheY, nicheW, nicheH);
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(nicheX + 2, nicheY + 2, nicheW - 4, nicheH - 4);
    if (it.key === 'drill') {
      drawDrillShopShowcase(nicheX, nicheY, nicheW, nicheH, iconLevel, hoverFade, canBuy, maxed);
    } else if (hoverFade > 0.01) {
      var glowGrad = ctx.createRadialGradient(nicheX + nicheW / 2, nicheY + nicheH / 2, 4, nicheX + nicheW / 2, nicheY + nicheH / 2, nicheW * 0.7);
      glowGrad.addColorStop(0, 'rgba(255,200,90,' + (0.28 * hoverFade).toFixed(3) + ')');
      glowGrad.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(nicheX + 2, nicheY + 2, nicheW - 4, nicheH - 4);
    }
    var iconSize = Math.min(nicheW - 16, nicheH - 16);
    drawUpgradeIconBig(it.key, nicheX + Math.floor(nicheW / 2), nicheY + Math.floor(nicheH / 2), iconSize, iconLevel);

    // Brass nameplate (with current level)
    var npX = nicheX;
    var npY = nicheY + nicheH + NAMEPLATE_GAP;
    var npW = nicheW;
    var npH = NAMEPLATE_H;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(npX - 1, npY - 1, npW + 2, npH + 2);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(npX, npY, npW, npH);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(npX + 1, npY + 1, npW - 2, npH - 2);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(npX + 1, npY + 1, npW - 2, 1);
    var nameScale = 1;
    var nameW = stencilTextWidth(nameText, nameScale);
    if (nameW > npW - 4) {
      nameScale = Math.max(0.72, (npW - 4) / Math.max(1, nameW));
      nameW = stencilTextWidth(nameText, nameScale);
    }
    drawStencilText(nameText, npX + Math.floor((npW - nameW) / 2), npY + Math.floor((npH - 7 * nameScale) / 2), nameScale, '#1f1408');

    // Tier pip strip
    var pipsY = npY + npH + PIPS_GAP;
    drawTierPipStrip(npX, pipsY, pipsCurrent, pipsMax, npW);

    // BUY button — exact fixed height, never overflows
    var btnY = pipsY + PIPS_H + BTN_GAP;
    var btnH = BTN_H;
    var btnW = npW;
    var btnX = npX;
    var compress = pullT > 0 ? Math.floor(pullT * 3) : 0;
    var btnDrawY = btnY + compress;
    var btnDrawH = btnH - compress;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(btnX - 1, btnDrawY - 1, btnW + 2, btnDrawH + 2);
    var btnBody;
    if (maxed) btnBody = '#3a3530';
    else if (!canBuy) btnBody = '#3a3530';
    else if (hoverFade > 0.05) btnBody = hoverFade > 0.5 ? '#ffe068' : '#e8c850';
    else btnBody = '#d4a838';
    ctx.fillStyle = btnBody;
    ctx.fillRect(btnX, btnDrawY, btnW, btnDrawH);
    ctx.fillStyle = canBuy ? 'rgba(80,50,16,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(btnX, btnDrawY + btnDrawH - 3, btnW, 3);
    // v11.35 — Always show the price. Button colour signals affordability:
    // bright yellow = afford, dim grey = can't afford yet, dark grey = maxed.
    var lblColor = (canBuy && !maxed) ? '#1f1408' : '#7d6d4d';
    var btnLbl;
    if (maxed) {
      btnLbl = (it.key === 'heat' || it.key === 'vert') ? 'OWNED' : 'MAX';
    } else {
      btnLbl = 'BUY $' + nextCost.toLocaleString();
    }
    var lblW = stencilTextWidth(btnLbl, 2);
    drawStencilText(btnLbl, btnX + Math.floor((btnW - lblW) / 2), btnDrawY + Math.floor((btnDrawH - 14) / 2), 2, lblColor);

    WORKSHOP_BUY_RECTS.push({
      x: btnX, y: btnY,
      w: btnW, h: btnH,
      key: it.key, cost: nextCost, canBuy: canBuy,
      leverCX: btnX + Math.floor(btnW / 2),
      leverTopY: btnY
    });
  }

  function fireWorkshopBuyFx(rect, success) {
    workshopBuyFx = { key: rect.key, t: 0.4, success: success };
    if (success) {
      for (var i = 0; i < 8; i++) {
        shelfCoins.push({
          x: rect.leverCX + (Math.random() - 0.5) * 6,
          y: rect.leverTopY,
          vx: (Math.random() - 0.5) * 5,
          vy: -2 - Math.random() * 2.5,
          t: 0.55 + Math.random() * 0.35,
          size: 2 + Math.floor(Math.random() * 3),
          phase: Math.random() * Math.PI * 2
        });
      }
      cashFlashFx = { color: '#40c060', t: 0.35 };
    } else {
      cashFlashFx = { color: '#a01a14', t: 0.25 };
    }
  }

  function drawShopSubPage() {
    if (shopState === 'shelf')    { drawShelfSubPage(); return; }
    if (shopState === 'workshop') { drawWorkshopSubPage(); return; }
    // Board: still placeholder
    var frame = drawShopSubPageFrame(shopState);
    var L = shopRoomLayout();
    var sub = (shopState === 'board') ? 'COMING SOON' : '';
    var sw = stencilTextWidth(sub, 1);
    drawStencilText(sub, Math.floor((viewW - sw) / 2), Math.floor(L.canvasBottom / 2), 1, '#a08a60');
  }

  // ########################################################################
  // ##  v14.1 — NEW SHOP UI  (USE_NEW_SHOP_UI === true)                   ##
  // ########################################################################
  // v26.18: the shop itself is the STORE catalog modal on the UI kit (245,
  // spec + routing in 250, item builders in 270/280). What remains here is
  // the shared plumbing both it and the flag-off Trade Board page use:
  // metrics, stencil text, particles, the money chip, the board's back
  // arrow, and the per-frame dispatch. Everything below is dead code when
  // USE_NEW_SHOP_UI is false; the legacy paths above run instead.
  // ########################################################################

  // ---- Shared new-shop state -------------------------------------------
  var nsRoomT       = 0;     // running clock (seconds) for idle animations
  var nsHubHover    = null;  // hovered chrome id on the board page ('nsback', 'bb:*')
  var nsBackRecoilT = 0;     // back-arrow recoil-shoot animation (counts down)
  var nsExitFadeT   = 0;     // black fade on shop exit (counts down)
  var nsMoneyPulseT = 0;     // gold pulse after any cash change
  var nsMoneyShown  = 0;     // money value the HUD readout is easing toward
  var nsLastMoney   = 0;     // last money seen, to detect changes
  var nsCoins       = [];    // shared coin-burst particles {x,y,vx,vy,t,size,phase,bad}
  var nsFloaters    = [];    // "+UPGRADE" / "-$N" arcing text {text,x,y,vx,vy,t,ttl,color,scale}
  var nsHubParticles = [];   // one-shot hover particles on the hub {x,y,vx,vy,t,ttl,kind}
  // Board-specific state
  var nsBoardSel       = null;   // selected commodity key (expanded row)
  var nsBoardHover     = null;   // hovered commodity key
  var nsBoardQty       = 1;      // selected trade quantity (1/10/100/MAX)
  var nsBoardScroll    = 0;      // market list scroll offset (px)
  var nsBoardScrollMax = 0;
  var nsBoardShreds    = [];     // paper-shred burst particles (cap 60)
  var nsBoardStamps    = [];     // "TRADED" stamp marks {key,t}
  var nsBoardTickT     = 0;      // ticker scroll offset
  var nsBoardPriceTickT = 0;     // countdown to the next price digit-roll
  var nsBoardRollFx    = {};     // per-key digit-roll animation {key:t}
  var nsBoardNoticeIdx = [];     // which notices are pinned this shop-open
  var nsBoardEnterT    = 0;      // board sub-page entrance progress
  // Drag-scroll bookkeeping (board market list)
  var nsDrag = { active: false, id: null, startY: 0, startScroll: 0, moved: 0, pendingRow: null };
  // Buy/sell hit rects, repopulated each frame
  var NS_HIT = [];

  // ---- Responsive metrics ----------------------------------------------
  function nsUiScale() {
    // Scale UI to the smaller viewport dimension so phones shrink the
    // whole interface and big desktops get a comfortable (not huge) size.
    var base = Math.min(viewW, viewH);
    var s = base / 460;
    if (s < 0.66) s = 0.66;
    if (s > 1.5) s = 1.5;
    return s;
  }
  function nsMetrics() {
    var ch = consoleHeight();
    var bottom = viewH - ch;            // shop occupies everything above the console
    var us = nsUiScale();
    var portrait = viewW < bottom * 1.12;   // tall-ish viewport → stacked layouts
    var pad = Math.round(14 * us);
    var cy = Math.round(8 * us);
    // bannerBottom = top margin + banner height (banner is 40*us tall).
    var bannerBottom = cy + Math.round(40 * us);
    // headerBottom = below the banner AND the money chip (28*us tall) so
    // every sub-page can start its content clear of both. The chip sits
    // top-right; reserving this band keeps it from colliding with content.
    var headerBottom = bannerBottom + Math.round(34 * us);
    return {
      bottom: bottom,
      us: us,
      portrait: portrait,
      pad: pad,
      // content rect: full area minus a uniform margin
      cx: pad,
      cy: cy,
      cw: viewW - pad * 2,
      chh: bottom - cy - pad,
      bannerBottom: bannerBottom,
      headerBottom: headerBottom
    };
  }
  // Pixel-font text sized in "stencil scale" — scale is fractional-friendly.
  function nsText(str, x, y, px, color, align) {
    // px = desired glyph height in px; stencil glyph is 7 tall per scale-1.
    var sc = px / 7;
    var w = stencilTextWidth(str, sc);
    var dx = x;
    if (align === 'center') dx = x - w / 2;
    else if (align === 'right') dx = x - w;
    drawStencilText(str, Math.round(dx), Math.round(y), sc, color);
    return w;
  }
  function nsTextW(str, px) { return stencilTextWidth(str, px / 7); }

  // ---- Easing helpers ---------------------------------------------------
  function nsEaseOut(t) { return 1 - Math.pow(1 - t, 3); }
  function nsEaseInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function nsApproach(cur, target, rate) {
    if (cur < target) return Math.min(target, cur + rate);
    if (cur > target) return Math.max(target, cur - rate);
    return cur;
  }

  // ---- Shared drawing primitives ---------------------------------------
  // A riveted plate-steel panel — the new shop's primary surface material.
  function nsPanel(x, y, w, h, base, hi, lo) {
    base = base || '#322e29'; hi = hi || '#48443d'; lo = lo || '#211e1a';
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hi;
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillStyle = lo;
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);
  }
  // A weathered-paper card — used by the Board notices + commodity rows.
  function nsPaper(x, y, w, h, seed) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 2, y + 3, w, h);
    ctx.fillStyle = '#b29a63';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e7d6a4';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 3);
    ctx.fillStyle = '#f3e8c2';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    // Deterministic age stains so paper looks hand-made, not flat.
    var sh = (seed | 0) || 7;
    function r(n) { var v = Math.sin((sh + n) * 91.17) * 4731.3; return v - Math.floor(v); }
    ctx.fillStyle = 'rgba(150,110,50,0.16)';
    for (var i = 0; i < 4; i++) {
      var sx = x + 4 + Math.floor(r(i * 2) * (w - 12));
      var sy = y + 4 + Math.floor(r(i * 2 + 1) * (h - 10));
      ctx.fillRect(sx, sy, 3 + Math.floor(r(i + 9) * 4), 2);
    }
    ctx.fillStyle = 'rgba(120,85,40,0.22)';   // bottom edge shadow / fold
    ctx.fillRect(x + 1, y + h - 4, w - 2, 2);
  }
  // A round iron nail / tack head — pins paper to the board.
  function nsNail(cx, cy) {
    ctx.fillStyle = '#0a0806';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#67615a';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a948c';
    ctx.beginPath(); ctx.arc(cx - 0.8, cy - 0.9, 1.3, 0, Math.PI * 2); ctx.fill();
  }
  // Vertical wood-plank backing (the Board's weathered-wood backboard).
  function nsWoodBacking(x, y, w, h, T) {
    var plankW = Math.max(26, Math.round(w / 7));
    for (var px = x; px < x + w; px += plankW) {
      var pw = Math.min(plankW, x + w - px);
      var idx = Math.floor((px - x) / plankW);
      var shade = (idx % 2 === 0) ? 0 : 14;
      ctx.fillStyle = idx % 2 === 0 ? '#3a2a1a' : '#33251a';
      ctx.fillRect(px, y, pw, h);
      // plank grain streaks
      ctx.fillStyle = 'rgba(20,12,6,0.5)';
      for (var gy = y + 8 + (idx * 5) % 11; gy < y + h - 4; gy += 17) {
        ctx.fillRect(px + 3, gy, pw - 6, 1);
      }
      ctx.fillStyle = 'rgba(96,68,38,0.4)';
      ctx.fillRect(px + 1, y, 1, h);            // plank seam highlight
      ctx.fillStyle = 'rgba(8,5,3,0.55)';
      ctx.fillRect(px + pw - 1, y, 1, h);       // plank seam shadow
      shade += 0;
    }
    // top + bottom rail beam
    ctx.fillStyle = '#241a10';
    ctx.fillRect(x, y, w, 4);
    ctx.fillRect(x, y + h - 4, w, 4);
  }
  // Cash burst + arc-floater spawners shared by every station.
  function nsSpawnCoins(x, y, n, bad) {
    for (var i = 0; i < n; i++) {
      nsCoins.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 6,
        vy: -3 - Math.random() * 3.4,
        t: 0.6 + Math.random() * 0.4,
        size: 2 + Math.floor(Math.random() * 3),
        phase: Math.random() * Math.PI * 2,
        bad: !!bad
      });
      if (nsCoins.length > 90) nsCoins.shift();
    }
  }
  function nsSpawnFloater(text, x, y, color, scale) {
    nsFloaters.push({
      text: text, x: x, y: y, vx: (Math.random() - 0.5) * 0.5,
      vy: -1.5, t: 1.05, ttl: 1.05, color: color || '#ffe79a',
      scale: scale || 11
    });
    if (nsFloaters.length > 24) nsFloaters.shift();
  }
  // Tick shared particles forward (called once per shop frame).
  function nsTickParticles(dt) {
    for (var i = nsCoins.length - 1; i >= 0; i--) {
      var c = nsCoins[i];
      c.x += c.vx; c.y += c.vy; c.vy += 0.38;
      c.phase += 0.6; c.t -= dt;
      if (c.t <= 0) nsCoins.splice(i, 1);
    }
    for (var j = nsFloaters.length - 1; j >= 0; j--) {
      var f = nsFloaters[j];
      f.x += f.vx; f.y += f.vy; f.vy += 0.026; f.t -= dt;
      if (f.t <= 0) nsFloaters.splice(j, 1);
    }
    for (var k = nsHubParticles.length - 1; k >= 0; k--) {
      var hp = nsHubParticles[k];
      hp.x += hp.vx; hp.y += hp.vy;
      if (hp.kind === 'paper') { hp.vy += 0.04; hp.vx *= 0.99; }
      else if (hp.kind === 'spark') { hp.vy += 0.12; }
      else { hp.vy -= 0.02; }   // coin sparkle drifts up
      hp.t -= dt;
      if (hp.t <= 0) nsHubParticles.splice(k, 1);
    }
    for (var s = nsBoardShreds.length - 1; s >= 0; s--) {
      var sh = nsBoardShreds[s];
      sh.x += sh.vx; sh.y += sh.vy; sh.vy += 0.22;
      sh.rot += sh.vr; sh.t -= dt;
      if (sh.t <= 0) nsBoardShreds.splice(s, 1);
    }
    for (var st = nsBoardStamps.length - 1; st >= 0; st--) {
      nsBoardStamps[st].t -= dt;
      if (nsBoardStamps[st].t <= 0) nsBoardStamps.splice(st, 1);
    }
  }
  // Draw the shared coin + floater particles (call last, on top of a page).
  function nsDrawParticles() {
    for (var i = 0; i < nsCoins.length; i++) {
      var c = nsCoins[i];
      var a = Math.min(1, c.t * 2.2);
      var sz = c.size;
      ctx.fillStyle = (c.bad ? 'rgba(190,60,52,' : 'rgba(212,168,56,') + (a * 0.4).toFixed(3) + ')';
      ctx.fillRect(c.x - c.vx * 0.4, c.y - c.vy * 0.4, sz, sz);
      ctx.fillStyle = (c.bad ? 'rgba(214,80,68,' : 'rgba(226,182,72,') + a.toFixed(3) + ')';
      ctx.fillRect(c.x, c.y, sz, sz);
      if (Math.sin(c.phase) > 0) {
        ctx.fillStyle = 'rgba(255,244,200,' + a.toFixed(3) + ')';
        ctx.fillRect(c.x, c.y, 1, 1);
      }
    }
    for (var j = 0; j < nsFloaters.length; j++) {
      var f = nsFloaters[j];
      var fa = f.t > f.ttl * 0.6 ? 1 : f.t / (f.ttl * 0.6);
      var pop = f.t > f.ttl * 0.85 ? 1 + (f.t / f.ttl - 0.85) * 2.4 : 1;
      var fpx = f.scale * pop;
      var fw = nsTextW(f.text, fpx);
      ctx.globalAlpha = fa;
      nsText(f.text, f.x - fw / 2 - 1, f.y + 1, fpx, 'rgba(0,0,0,0.7)');
      nsText(f.text, f.x - fw / 2, f.y, fpx, f.color);
      ctx.globalAlpha = 1;
    }
  }

  // ---- Money readout — always-alive, breathing, pulses on change -------
  // anchor: 'center' (cx is the chip centre) or 'right' (cx is the right edge).
  function nsDrawMoneyChip(cx, topY, us, anchor) {
    // Detect a money change and trigger the gold pulse.
    if (money !== nsLastMoney) {
      nsMoneyPulseT = 0.55;
      nsLastMoney = money;
    }
    nsMoneyShown += (money - nsMoneyShown) * 0.25;
    if (Math.abs(money - nsMoneyShown) < 1) nsMoneyShown = money;
    var disp = Math.round(nsMoneyShown);
    var breath = 1 + Math.sin(nsRoomT * 2.1) * 0.018;
    var pulse = nsMoneyPulseT > 0 ? nsMoneyPulseT / 0.55 : 0;
    var str = '$' + disp.toLocaleString();
    var fpx = Math.round(15 * us);
    var tw = nsTextW(str, fpx);
    var chipW = tw + Math.round(34 * us);
    var chipH = Math.round(28 * us);
    var chipX = (anchor === 'right') ? (cx - chipW) : (cx - chipW / 2);
    cx = chipX + chipW / 2;   // re-centre the breathing transform on the chip
    ctx.save();
    ctx.translate(cx, topY + chipH / 2);
    ctx.scale(breath, breath);
    ctx.translate(-cx, -(topY + chipH / 2));
    // brass plate
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(chipX - 2, topY - 2, chipW + 4, chipH + 4);
    ctx.fillStyle = '#4a3618';
    ctx.fillRect(chipX, topY, chipW, chipH);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(chipX + 2, topY + 2, chipW - 4, chipH - 4);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(chipX + 2, topY + 2, chipW - 4, 2);
    // gold gradient pulse after a change
    if (pulse > 0) {
      var gp = ctx.createLinearGradient(chipX, topY, chipX + chipW, topY);
      gp.addColorStop(0, 'rgba(255,232,140,0)');
      gp.addColorStop(0.5, 'rgba(255,236,160,' + (0.55 * pulse).toFixed(3) + ')');
      gp.addColorStop(1, 'rgba(255,232,140,0)');
      ctx.fillStyle = gp;
      ctx.fillRect(chipX + 2, topY + 2, chipW - 4, chipH - 4);
    }
    drawBrassBolt(chipX + 7, topY + chipH / 2);
    drawBrassBolt(chipX + chipW - 7, topY + chipH / 2);
    // Coin glyph at the left of the chip
    var coinR = Math.round(5 * us);
    var coinX = chipX + Math.round(15 * us);
    var coinCY = topY + chipH / 2;
    ctx.fillStyle = '#1f1408';
    ctx.beginPath(); ctx.arc(coinX, coinCY, coinR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pulse > 0 ? '#ffe79a' : '#caa24a';
    ctx.beginPath(); ctx.arc(coinX, coinCY, coinR - 1.4, 0, Math.PI * 2); ctx.fill();
    nsText(str, chipX + Math.round(26 * us), coinCY - fpx / 2, fpx, '#241608');
    ctx.restore();
    return { x: chipX, y: topY, w: chipW, h: chipH };
  }

  // ---- Top-of-page title banner ----------------------------------------
  function nsBanner(M, titleStr, accent) {
    var us = M.us;
    var bw = Math.min(M.cw * 0.66, Math.round(420 * us));
    var bh = Math.round(40 * us);
    var bx = (viewW - bw) / 2;
    var by = M.cy;
    accent = accent || '#9a2820';
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    ctx.fillStyle = accent;
    ctx.fillRect(bx, by, bw, bh);
    // bevel
    var hi = ctx.createLinearGradient(0, by, 0, by + bh);
    hi.addColorStop(0, 'rgba(255,255,255,0.16)');
    hi.addColorStop(0.5, 'rgba(255,255,255,0)');
    hi.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = hi;
    ctx.fillRect(bx, by, bw, bh);
    // corner iron tabs
    ctx.fillStyle = '#2a2520';
    var tab = Math.round(9 * us);
    ctx.fillRect(bx, by, tab, tab);
    ctx.fillRect(bx + bw - tab, by, tab, tab);
    ctx.fillRect(bx, by + bh - tab, tab, tab);
    ctx.fillRect(bx + bw - tab, by + bh - tab, tab, tab);
    var fpx = Math.round(19 * us);
    nsText(titleStr, viewW / 2, by + (bh - fpx) / 2, fpx, '#f4dc98', 'center');
    return { x: bx, y: by, w: bw, h: bh, bottom: by + bh };
  }

  // ---- Recoil-shoot back arrow -----------------------------------------
  function nsBackArrowRect(M) {
    var us = M.us;
    return { x: M.cx, y: M.cy, w: Math.round(58 * us), h: Math.round(34 * us) };
  }
  function nsDrawBackArrow(M) {
    var r = nsBackArrowRect(M);
    var us = M.us;
    var recoil = nsBackRecoilT > 0 ? nsBackRecoilT / 0.26 : 0;
    var push = recoil > 0 ? -Math.sin(recoil * Math.PI) * 7 * us : 0;
    var hov = (nsHubHover === 'nsback');
    ctx.save();
    ctx.translate(push, 0);
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    ctx.fillStyle = hov ? '#6a4a20' : '#4a3618';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hov ? '#9c7430' : '#7a5a2c';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
    // chevron
    var ax = r.x + Math.round(11 * us), ay = r.y + r.h / 2;
    var chev = Math.round(7 * us);
    ctx.fillStyle = '#1f1408';
    for (var o = 0; o < chev; o++) {
      ctx.fillRect(ax + o, ay - o - 1, 2, 2);
      ctx.fillRect(ax + o, ay + o - 1, 2, 2);
    }
    nsText(shopState === 'floor' ? 'EXIT' : 'BACK', r.x + Math.round(20 * us), ay - Math.round(4.5 * us), Math.round(9 * us), '#1f1408');
    ctx.restore();
  }

  // ---- Main dispatch ----------------------------------------------------
  // Called once per frame from drawShopFloor() when USE_NEW_SHOP_UI is on.
  // 'floor' = the store catalog modal (UI kit, 245/250). 'board' = the
  // flag-off Trade Board's bespoke full page (260). The old per-counter
  // 'workshop'/'shelf' page states are retired; normalize them to 'floor'.
  function newShopDraw() {
    var dt = 1 / 60;
    nsRoomT += dt;
    if (shopState === 'workshop' || shopState === 'shelf') shopState = 'floor';

    // Global timers
    if (nsBackRecoilT > 0) nsBackRecoilT -= dt;
    if (nsExitFadeT > 0) nsExitFadeT -= dt;
    if (nsMoneyPulseT > 0) nsMoneyPulseT -= dt;
    nsTickParticles(dt);

    NS_HIT = [];
    var M = nsMetrics();

    if (shopState === 'floor') {
      storeModalEnsure();
      ukCatalogDraw(M);
      nsDrawParticles();
    } else if (shopState === 'board') {
      nsBoardEnterT = Math.min(1, nsBoardEnterT + dt / 0.26);
      newShopDrawBoard(M);
    }

    // Exit-to-black fade (Leave button) — drawn on top of everything.
    if (nsExitFadeT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, nsExitFadeT / 0.22).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, M.bottom);
    }
  }

  // Enter a bespoke station page. Only the Trade Board still has one; the
  // workshop and shelf live as tabs inside the store modal (250).
  function nsEnterStation(id) {
    if (id !== 'board' || !ENABLE_TRADE_BOARD) return;
    shopState = 'board';
    nsBoardEnterT = 0;
    nsBoardSel = null;
    nsBoardScroll = 0;
    nsBoardRollPrices();
  }
  // Back from the board page to the store modal.
  function nsLeaveToHub() {
    shopState = 'floor';
    nsBackRecoilT = 0.26;
    nsBoardSel = null;
  }
  // Leave the shop entirely: fade to black + set the rig down on the deck.
  function nsExitShop() {
    ukCatalogReset();   // direct exits (board Escape path) skip the kit's close anim
    nsExitFadeT = 0.22;
    shopState = 'closed';
    sfxPlay('ui-open', { rate: 0.89 });   // the same thunk ~2 semitones down = close (§2.11)
    shopDoorT = 0;
    if (typeof player !== 'undefined' && player) {
      var stationCx = nearestTownStationCol() * TILE + TILE / 2;
      player.x = stationCx + 75 - PLAYER_W / 2;
      player.y = DECK_ROW * TILE - PLAYER_H;
      player.vx = 0; player.vy = 0;
      player.thrusting = false;
      if (typeof player.thrustSpool !== 'undefined') player.thrustSpool = 0;
      if (typeof player.dir !== 'undefined') player.dir = 1;
      if (typeof player.renderX !== 'undefined') { player.renderX = player.x; player.renderY = player.y; }
    }
  }
  // One escape/back control: the store modal animates closed (its onClose
  // runs nsExitShop); the board page pops back to the store modal.
  function nsBackOrExit() {
    if (shopState === 'floor') {
      if (ukModal) ukCatalogClose();
      else nsExitShop();
    } else {
      nsLeaveToHub();
    }
  }

