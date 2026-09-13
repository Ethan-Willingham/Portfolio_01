// Optional audit-sluice EXPERIMENT file. Injected only by the local test server.
// audit.skyDirty is a 0/1 redraw counter; all other audit buckets measure ms.
function hitchWrap(fn,name){return function(){var t=performance.now(),r=fn.apply(this,arguments);perfMark('audit.'+name,t);return r;};}
var hitchSky=renderSkyGL;
renderSkyGL=function(){var key=skyGLLastKey,t=performance.now(),r=hitchSky.apply(this,arguments);perfMark('audit.skySubmit',t);perfRecord('audit.skyDirty',key===skyGLLastKey?0:1);return r;};
var hitchImage=ctx.drawImage;
ctx.drawImage=function(source){if(source!==skyGLCanvas)return hitchImage.apply(this,arguments);var t=performance.now(),r=hitchImage.apply(this,arguments);perfMark('audit.skyCopy',t);return r;};
drawWeatherClouds=hitchWrap(drawWeatherClouds,'clouds');
weatherRecolorTile=hitchWrap(weatherRecolorTile,'cloudRecolor');
drawPlanetSurface=hitchWrap(drawPlanetSurface,'planet');
drawNightSkyCelestials=hitchWrap(drawNightSkyCelestials,'celestials');
buildMoonPhaseDisc=hitchWrap(buildMoonPhaseDisc,'moonBuild');
drawLedgerSpecimen=hitchWrap(drawLedgerSpecimen,'cargoArt');
colourPlanetSurface=hitchWrap(colourPlanetSurface,'planetColour');
buildPlanetSurface=hitchWrap(buildPlanetSurface,'planetBuild');
var hitchBankBuild=buildSurfaceBankStrip;
buildSurfaceBankStrip=function(){var t=performance.now(),r=hitchBankBuild.apply(this,arguments);perfRecord('audit.bankBuild',(perfBucketsRaw['audit.bankBuild']||0)+performance.now()-t);return r;};
