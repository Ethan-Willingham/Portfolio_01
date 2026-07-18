  // ====== ART ATLAS EXPORT (dev bench hook — art-lab.html) ======
  // Exposes the game's pixel-art renderers + palettes on window.__sluiceAtlas
  // so the pixel-art atlas bench (art-lab.html) can render every piece of art
  // into its own labeled gallery cell. This is a read-only export in the same
  // spirit as window.gm: registering it changes nothing about gameplay. The
  // bench boots the game into a hidden #game-canvas, calls stop() to cancel
  // the RAF loop, redirects the IIFE-wide 2D context into a cell canvas with
  // setCtx(), calls renderers, then restoreCtx().
  //
  // Every export is typeof-guarded so a renamed/removed function can never
  // break game boot — the bench just shows that cell as missing instead.
  (function buildArtAtlas() {
    var A = { version: GAME_VERSION, fn: {}, data: {} };

    // ---- ctx redirect + loop control ----
    var savedCtx = null;
    A.setCtx = function (c) { if (savedCtx === null) savedCtx = ctx; ctx = c; };
    A.restoreCtx = function () { if (savedCtx !== null) { ctx = savedCtx; savedCtx = null; } };
    A.stop = function () {
      try { if (typeof gameRafId !== 'undefined' && gameRafId) cancelAnimationFrame(gameRafId); } catch (e) {}
      try { gamePaused = true; } catch (e) {}
    };

    // ---- data / palettes / live state ----
    function d(name, ok, v) { if (ok) A.data[name] = v; }
    d('TILE',        typeof TILE !== 'undefined', typeof TILE !== 'undefined' ? TILE : null);
    d('SKY_ROWS',    typeof SKY_ROWS !== 'undefined', typeof SKY_ROWS !== 'undefined' ? SKY_ROWS : null);
    d('ORES',        typeof ORES !== 'undefined', typeof ORES !== 'undefined' ? ORES : null);
    d('LAYERS',      typeof LAYERS !== 'undefined', typeof LAYERS !== 'undefined' ? LAYERS : null);
    d('BLD',         typeof BLD !== 'undefined', typeof BLD !== 'undefined' ? BLD : null);
    d('TOWN_BLD',    typeof TOWN_BLD !== 'undefined', typeof TOWN_BLD !== 'undefined' ? TOWN_BLD : null);
    d('TOWN_DEPTHS', typeof TOWN_DEPTHS !== 'undefined', typeof TOWN_DEPTHS !== 'undefined' ? TOWN_DEPTHS : null);
    d('DECK_ROW',    typeof DECK_ROW !== 'undefined', typeof DECK_ROW !== 'undefined' ? DECK_ROW : null);
    d('SKY',         typeof SKY !== 'undefined', typeof SKY !== 'undefined' ? SKY : null);
    d('BG',          typeof BG !== 'undefined', typeof BG !== 'undefined' ? BG : null);
    d('ITEMS',       typeof ITEMS !== 'undefined', typeof ITEMS !== 'undefined' ? ITEMS : null);
    d('commoditySprites', typeof commoditySprites !== 'undefined', typeof commoditySprites !== 'undefined' ? commoditySprites : null);
    d('shopGearSprites',  typeof shopGearSprites !== 'undefined', typeof shopGearSprites !== 'undefined' ? shopGearSprites : null);
    d('wheelItemSprites', typeof wheelItemSprites !== 'undefined', typeof wheelItemSprites !== 'undefined' ? wheelItemSprites : null);

    // Live game state accessor (post-boot world/player for stateful draws).
    A.game = function () {
      var g = {};
      try { g.player = player; } catch (e) {}
      try { g.world = world; } catch (e) {}
      try { g.cam = cam; } catch (e) {}
      try { g.surfaceRow = typeof SURFACE_ROW !== 'undefined' ? SURFACE_ROW : null; } catch (e) {}
      try { g.deckRow = typeof DECK_ROW !== 'undefined' ? DECK_ROW : null; } catch (e) {}
      try { g.townStationCol = typeof townStationCol === 'function' ? townStationCol : null; } catch (e) {}
      return g;
    };

    // ---- function registry (typeof-guarded, grouped) ----
    function reg(name, ok, f) { if (ok) A.fn[name] = f; }
    /* eslint-disable no-undef */
    // Tile + ore pipeline helpers
    reg('tileHash01',          typeof tileHash01 === 'function', typeof tileHash01 === 'function' ? tileHash01 : null);
    reg('drawMaterialTile',    typeof drawMaterialTile === 'function', typeof drawMaterialTile === 'function' ? drawMaterialTile : null);
    reg('getLayerForCam',      typeof getLayerForCam === 'function', typeof getLayerForCam === 'function' ? getLayerForCam : null);
    reg('drawEarlyOreAtlas',   typeof drawEarlyOreAtlas === 'function', typeof drawEarlyOreAtlas === 'function' ? drawEarlyOreAtlas : null);
    reg('drawEarlyOreBase',    typeof drawEarlyOreBase === 'function', typeof drawEarlyOreBase === 'function' ? drawEarlyOreBase : null);
    reg('drawEarlyOreDetails', typeof drawEarlyOreDetails === 'function', typeof drawEarlyOreDetails === 'function' ? drawEarlyOreDetails : null);
    reg('drawShinyTile',       typeof drawShinyTile === 'function', typeof drawShinyTile === 'function' ? drawShinyTile : null);
    reg('drawSurfaceGrass',    typeof drawSurfaceGrass === 'function', typeof drawSurfaceGrass === 'function' ? drawSurfaceGrass : null);
    reg('drawGemScatter',      typeof drawGemScatter === 'function', typeof drawGemScatter === 'function' ? drawGemScatter : null);
    // Per-ore renderers
    reg('drawCoalBase',        false, null); // coal/copper/bauxite/iron live inside drawEarlyOreBase
    reg('drawPyriteOre',       typeof drawPyriteOre === 'function', typeof drawPyriteOre === 'function' ? drawPyriteOre : null);
    reg('drawGoldOre',         typeof drawGoldOre === 'function', typeof drawGoldOre === 'function' ? drawGoldOre : null);
    reg('drawSilverOre',       typeof drawSilverOre === 'function', typeof drawSilverOre === 'function' ? drawSilverOre : null);
    reg('drawCinnabarOre',     typeof drawCinnabarOre === 'function', typeof drawCinnabarOre === 'function' ? drawCinnabarOre : null);
    reg('drawAmberOre',        typeof drawAmberOre === 'function', typeof drawAmberOre === 'function' ? drawAmberOre : null);
    reg('drawFossilOre',       typeof drawFossilOre === 'function', typeof drawFossilOre === 'function' ? drawFossilOre : null);
    reg('drawUraniumOre',      typeof drawUraniumOre === 'function', typeof drawUraniumOre === 'function' ? drawUraniumOre : null);
    reg('drawMethaneiceOre',   typeof drawMethaneiceOre === 'function', typeof drawMethaneiceOre === 'function' ? drawMethaneiceOre : null);
    reg('drawObsidianOre',     typeof drawObsidianOre === 'function', typeof drawObsidianOre === 'function' ? drawObsidianOre : null);
    reg('drawTanzaniteOre',    typeof drawTanzaniteOre === 'function', typeof drawTanzaniteOre === 'function' ? drawTanzaniteOre : null);
    reg('drawEmeraldOre',      typeof drawEmeraldOre === 'function', typeof drawEmeraldOre === 'function' ? drawEmeraldOre : null);
    reg('drawRubyOre',         typeof drawRubyOre === 'function', typeof drawRubyOre === 'function' ? drawRubyOre : null);
    reg('drawMalachiteOre',    typeof drawMalachiteOre === 'function', typeof drawMalachiteOre === 'function' ? drawMalachiteOre : null);
    reg('drawGalenaOre',       typeof drawGalenaOre === 'function', typeof drawGalenaOre === 'function' ? drawGalenaOre : null);
    reg('drawMagnetiteOre',    typeof drawMagnetiteOre === 'function', typeof drawMagnetiteOre === 'function' ? drawMagnetiteOre : null);
    reg('drawRhodochrositeOre',typeof drawRhodochrositeOre === 'function', typeof drawRhodochrositeOre === 'function' ? drawRhodochrositeOre : null);
    reg('drawJadeOre',         typeof drawJadeOre === 'function', typeof drawJadeOre === 'function' ? drawJadeOre : null);
    reg('drawTurquoiseOre',    typeof drawTurquoiseOre === 'function', typeof drawTurquoiseOre === 'function' ? drawTurquoiseOre : null);
    reg('drawLapisOre',        typeof drawLapisOre === 'function', typeof drawLapisOre === 'function' ? drawLapisOre : null);
    reg('drawCobaltOre',       typeof drawCobaltOre === 'function', typeof drawCobaltOre === 'function' ? drawCobaltOre : null);
    reg('drawAmethystOre',     typeof drawAmethystOre === 'function', typeof drawAmethystOre === 'function' ? drawAmethystOre : null);
    reg('drawPeridotOre',      typeof drawPeridotOre === 'function', typeof drawPeridotOre === 'function' ? drawPeridotOre : null);
    reg('drawSulfurOre',       typeof drawSulfurOre === 'function', typeof drawSulfurOre === 'function' ? drawSulfurOre : null);
    reg('drawPlatinumOre',     typeof drawPlatinumOre === 'function', typeof drawPlatinumOre === 'function' ? drawPlatinumOre : null);
    reg('drawDiamondOre',      typeof drawDiamondOre === 'function', typeof drawDiamondOre === 'function' ? drawDiamondOre : null);
    reg('drawPainiteOre',      typeof drawPainiteOre === 'function', typeof drawPainiteOre === 'function' ? drawPainiteOre : null);
    reg('drawUnobtaniumOre',   typeof drawUnobtaniumOre === 'function', typeof drawUnobtaniumOre === 'function' ? drawUnobtaniumOre : null);
    reg('drawOpalOre',         typeof drawOpalOre === 'function', typeof drawOpalOre === 'function' ? drawOpalOre : null);
    reg('drawGreatSeam',       typeof drawGreatSeam === 'function', typeof drawGreatSeam === 'function' ? drawGreatSeam : null);
    // Buildings + decor primitives (Frontier Soviet)
    reg('drawStation',         typeof drawStation === 'function', typeof drawStation === 'function' ? drawStation : null);
    reg('drawPumpPad',         typeof drawPumpPad === 'function', typeof drawPumpPad === 'function' ? drawPumpPad : null);
    reg('drawSurfaceFireplace',typeof drawSurfaceFireplace === 'function', typeof drawSurfaceFireplace === 'function' ? drawSurfaceFireplace : null);
    reg('drawWoodPlanking',    typeof drawWoodPlanking === 'function', typeof drawWoodPlanking === 'function' ? drawWoodPlanking : null);
    reg('drawStoneFoundation', typeof drawStoneFoundation === 'function', typeof drawStoneFoundation === 'function' ? drawStoneFoundation : null);
    reg('drawRivetedPlate',    typeof drawRivetedPlate === 'function', typeof drawRivetedPlate === 'function' ? drawRivetedPlate : null);
    reg('drawRedStar',         typeof drawRedStar === 'function', typeof drawRedStar === 'function' ? drawRedStar : null);
    reg('drawSmokestack',      typeof drawSmokestack === 'function', typeof drawSmokestack === 'function' ? drawSmokestack : null);
    reg('drawAntenna',         typeof drawAntenna === 'function', typeof drawAntenna === 'function' ? drawAntenna : null);
    reg('drawSignBoard',       typeof drawSignBoard === 'function', typeof drawSignBoard === 'function' ? drawSignBoard : null);
    reg('drawPropagandaPoster',typeof drawPropagandaPoster === 'function', typeof drawPropagandaPoster === 'function' ? drawPropagandaPoster : null);
    reg('drawPorchAwning',     typeof drawPorchAwning === 'function', typeof drawPorchAwning === 'function' ? drawPorchAwning : null);
    reg('drawOilLamp',         typeof drawOilLamp === 'function', typeof drawOilLamp === 'function' ? drawOilLamp : null);
    reg('drawOilDrum',         typeof drawOilDrum === 'function', typeof drawOilDrum === 'function' ? drawOilDrum : null);
    reg('drawCrate',           typeof drawCrate === 'function', typeof drawCrate === 'function' ? drawCrate : null);
    reg('drawChair',           typeof drawChair === 'function', typeof drawChair === 'function' ? drawChair : null);
    reg('drawHearthFire',      typeof drawHearthFire === 'function', typeof drawHearthFire === 'function' ? drawHearthFire : null);
    reg('drawSupportPost',     typeof drawSupportPost === 'function', typeof drawSupportPost === 'function' ? drawSupportPost : null);
    reg('drawCanopy',          typeof drawCanopy === 'function', typeof drawCanopy === 'function' ? drawCanopy : null);
    reg('drawHazardStripes',   typeof drawHazardStripes === 'function', typeof drawHazardStripes === 'function' ? drawHazardStripes : null);
    reg('drawFuelTank',        typeof drawFuelTank === 'function', typeof drawFuelTank === 'function' ? drawFuelTank : null);
    reg('drawPayoutTerminal',  typeof drawPayoutTerminal === 'function', typeof drawPayoutTerminal === 'function' ? drawPayoutTerminal : null);
    reg('drawFuelPump',        typeof drawFuelPump === 'function', typeof drawFuelPump === 'function' ? drawFuelPump : null);
    reg('drawSluice',          typeof drawSluice === 'function', typeof drawSluice === 'function' ? drawSluice : null);
    reg('drawNmzBladeFlag',    typeof drawNmzBladeFlag === 'function', typeof drawNmzBladeFlag === 'function' ? drawNmzBladeFlag : null);
    // Player + combat entities
    reg('drawPlayer',          typeof drawPlayer === 'function', typeof drawPlayer === 'function' ? drawPlayer : null);
    reg('drawPlayerShadow',    typeof drawPlayerShadow === 'function', typeof drawPlayerShadow === 'function' ? drawPlayerShadow : null);
    reg('drawEnemyTurret',     typeof drawEnemyTurret === 'function', typeof drawEnemyTurret === 'function' ? drawEnemyTurret : null);
    reg('drawChaser',          typeof drawChaser === 'function', typeof drawChaser === 'function' ? drawChaser : null);
    reg('drawStinger',         typeof drawStinger === 'function', typeof drawStinger === 'function' ? drawStinger : null);
    reg('drawObstacle',        typeof drawObstacle === 'function', typeof drawObstacle === 'function' ? drawObstacle : null);
    reg('drawBullet',          typeof drawBullet === 'function', typeof drawBullet === 'function' ? drawBullet : null);
    reg('drawMissile',         typeof drawMissile === 'function', typeof drawMissile === 'function' ? drawMissile : null);
    reg('drawRigTurret',       typeof drawRigTurret === 'function', typeof drawRigTurret === 'function' ? drawRigTurret : null);
    // Direct (uncached) structure content — drawCachedStructure culls on the
    // live camera AABB, which always fails for an atlas cell. These call the
    // content fns straight, in world coords, with the per-town palette swap.
    if (typeof drawStationContent === 'function') {
      A.fn.drawStationDirect = function (ti) {
        var saved = BLD;
        if (typeof TOWN_BLD !== 'undefined' && TOWN_BLD[ti]) BLD = TOWN_BLD[ti];
        try { drawStationContent(ti); } finally { BLD = saved; }
      };
    }
    if (typeof drawSluiceContent === 'function') {
      A.fn.drawSluiceDirect = function () { drawSluiceContent(); };
    }
    reg('sluiceAnchorX',       typeof sluiceAnchorX === 'function', typeof sluiceAnchorX === 'function' ? sluiceAnchorX : null);
    reg('stationCenterCol',    typeof stationCenterCol === 'function', typeof stationCenterCol === 'function' ? stationCenterCol : null);
    // Console gauges + small hardware
    reg('drawFuelGauge',       typeof drawFuelGauge === 'function', typeof drawFuelGauge === 'function' ? drawFuelGauge : null);
    reg('drawSpeedDisplay',    typeof drawSpeedDisplay === 'function', typeof drawSpeedDisplay === 'function' ? drawSpeedDisplay : null);
    reg('drawHullPlates',      typeof drawHullPlates === 'function', typeof drawHullPlates === 'function' ? drawHullPlates : null);
    reg('drawCargoBay',        typeof drawCargoBay === 'function', typeof drawCargoBay === 'function' ? drawCargoBay : null);
    reg('drawDepthDisplay',    typeof drawDepthDisplay === 'function', typeof drawDepthDisplay === 'function' ? drawDepthDisplay : null);
    reg('drawCashDisplay',     typeof drawCashDisplay === 'function', typeof drawCashDisplay === 'function' ? drawCashDisplay : null);
    reg('drawWarningLamp',     typeof drawWarningLamp === 'function', typeof drawWarningLamp === 'function' ? drawWarningLamp : null);
    // v26.43: drawReserveFuel / drawFuelCanister / drawHexBolt died with the
    // brass cluster; the reserve rack is pips inside the FUEL bay now.
    reg('drawReservePip',      typeof drawReservePip === 'function', typeof drawReservePip === 'function' ? drawReservePip : null);
    reg('instrWindow',         typeof instrWindow === 'function', typeof instrWindow === 'function' ? instrWindow : null);
    // UI pixel art
    reg('drawConsumableIconBig', typeof drawConsumableIconBig === 'function', typeof drawConsumableIconBig === 'function' ? drawConsumableIconBig : null);
    reg('drawWheelItemIcon',     typeof drawWheelItemIcon === 'function', typeof drawWheelItemIcon === 'function' ? drawWheelItemIcon : null);
    reg('drawDrillUpgradeSprite',typeof drawDrillUpgradeSprite === 'function', typeof drawDrillUpgradeSprite === 'function' ? drawDrillUpgradeSprite : null);
    reg('drawUpgradeIconBig',    typeof drawUpgradeIconBig === 'function', typeof drawUpgradeIconBig === 'function' ? drawUpgradeIconBig : null);
    reg('drawDpad',              typeof drawDpad === 'function', typeof drawDpad === 'function' ? drawDpad : null);
    reg('drawDeathCauseIcon',    typeof drawDeathCauseIcon === 'function', typeof drawDeathCauseIcon === 'function' ? drawDeathCauseIcon : null);
    reg('drawStencilText',       typeof drawStencilText === 'function', typeof drawStencilText === 'function' ? drawStencilText : null);
    /* eslint-enable no-undef */

    A.list = function () { return Object.keys(A.fn); };
    window.__sluiceAtlas = A;
  })();
