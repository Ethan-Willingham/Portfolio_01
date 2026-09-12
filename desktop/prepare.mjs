// Stage only the game and its local assets. Never ship the portfolio or analytics.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'..');
const stage=path.join(here,'stage');
if(path.dirname(stage)!==here||fs.existsSync(stage)&&fs.lstatSync(stage).isSymbolicLink())throw Error('Unsafe staging directory');
fs.rmSync(stage,{recursive:true,force:true});
fs.mkdirSync(stage,{recursive:true});
function copy(name){const dest=path.join(stage,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(path.join(root,name),dest,{recursive:true});}
for(const name of ['style.css','kit.css','sluice-menu.css','favicon.svg','favicon-32.png','apple-touch-icon.png',
  'js/sluice.js','js/liquid-wgpu.js','js/smoke-wgpu.js','js/jello-wgpu.js','js/audio.js',
  'assets/fonts','assets/music','assets/sfx','assets/shop','assets/images/moon.jpg'])copy(name);
let html=fs.readFileSync(path.join(root,'grand-motherload.html'),'utf8');
html=html.replace(/  <!-- Google tag[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/,'');
html=html.replace(/\s*<link rel="manifest"[^>]*>/,'');
const head=html.slice(0,html.indexOf('</head>'));
const start=html.indexOf('<div class="game-wrapper"');
const end=html.indexOf('<div class="game-about"',start);
if(start<0||end<0)throw Error('Game shell markers changed');
const wrapper=html.slice(start,end);
const scripts=html.slice(html.indexOf('<script>',html.indexOf('</footer>')));
const desktopCSS=`<style>
html,body{margin:0!important;width:100%;height:100%;overflow:hidden!important}
.game-wrapper{position:fixed!important;inset:0!important;width:auto!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;display:flex;flex-direction:column}
.game-canvas-area{width:100%!important;height:100%!important}
</style>`;
const setup=`<script>document.body.classList.add('gm-fs');addEventListener('DOMContentLoaded',function(){dispatchEvent(new Event('resize'));});</script>`;
fs.writeFileSync(path.join(stage,'grand-motherload.html'),head+desktopCSS+'</head><body>'+wrapper+setup+scripts);
const version=fs.readFileSync(path.join(root,'js/sluice/000-head.js'),'utf8').match(/GAME_VERSION = '([^']+)'/)[1];
fs.writeFileSync(path.join(stage,'build.json'),JSON.stringify({gameVersion:version},null,2)+'\n');
console.log('Staged '+version+' in '+stage);
