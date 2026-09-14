// Canvas draw-state signatures for shader-warmup-trace.mjs (SIGNATURES=1).
// Injected before the game. Records the first use of each combination of draw
// call, paint, blend mode, alpha, transform kind, clip stack, path shape and size,
// and image source type. First uses after the loading reveal carry a short
// JavaScript stack. Chrome builds a GPU program when a page first draws a new
// combination, so a compile late in play usually sits beside one of these.
(function(){
  var P=CanvasRenderingContext2D.prototype,seen=Object.create(null),list=[];
  var gradients=new WeakMap(),patterns=new WeakMap(),clipStacks=new WeakMap(),paths=new WeakMap(),contextTypes=new WeakMap();
  window.__warmSignatures=list;
  var getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type){var c=getContext.apply(this,arguments);if(c&&!contextTypes.has(this))contextTypes.set(this,type);return c;};
  function after(name,fn){var o=P[name];if(!o)return;P[name]=function(){var r=o.apply(this,arguments);fn(this,arguments,r);return r;};}
  function before(name,fn){var o=P[name];if(!o)return;P[name]=function(){fn(this,arguments);return o.apply(this,arguments);};}
  function translucent(col){return typeof col==='string'&&(col==='transparent'||(/^(rgba|hsla)/.test(col)&&!/,\s*1(\.0*)?\s*\)$/.test(col)));}
  after('createLinearGradient',function(c,a,g){gradients.set(g,{kind:'linear',stops:0,alpha:0});});
  after('createRadialGradient',function(c,a,g){gradients.set(g,{kind:'radial'+(a[2]===0?'0':'r')+(a[0]===a[3]&&a[1]===a[4]?'c':'f'),stops:0,alpha:0});});
  if(P.createConicGradient)after('createConicGradient',function(c,a,g){gradients.set(g,{kind:'conic',stops:0,alpha:0});});
  after('createPattern',function(c,a,p){if(p)patterns.set(p,a[1]||'repeat');});
  var addColorStop=CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop=function(offset,color){var g=gradients.get(this);if(g){g.stops++;if(translucent(color))g.alpha=1;}return addColorStop.apply(this,arguments);};
  function fractional(v){return Math.abs(v-Math.round(v))>1e-3;}
  function rectKind(m,x,y,w,h){if(m.b!==0||m.c!==0)return 'rot';var x0=m.a*x+m.e,y0=m.d*y+m.f,x1=m.a*(x+w)+m.e,y1=m.d*(y+h)+m.f;return fractional(x0)||fractional(y0)||fractional(x1)||fractional(y1)?'fr':'al';}
  function transformKind(m){return m.b!==0||m.c!==0?'rot':(m.a!==1||m.d!==1?(m.a<0||m.d<0?'flip':'scl'):'id');}
  function clipStack(c){var s=clipStacks.get(c);if(!s)clipStacks.set(c,s=['']);return s;}
  before('save',function(c){var s=clipStack(c);s.push(s[s.length-1]);});
  before('restore',function(c){var s=clipStack(c);if(s.length>1)s.pop();});
  function emptyPath(){return {n:0,curves:0,arcs:0,rects:0,x0:1e9,y0:1e9,x1:-1e9,y1:-1e9,rect:null};}
  function path(c){var p=paths.get(c);if(!p)paths.set(c,p=emptyPath());return p;}
  function grow(c,p,x,y){var m=c.getTransform(),dx=m.a*x+m.c*y+m.e,dy=m.b*x+m.d*y+m.f;if(dx<p.x0)p.x0=dx;if(dy<p.y0)p.y0=dy;if(dx>p.x1)p.x1=dx;if(dy>p.y1)p.y1=dy;}
  before('beginPath',function(c){paths.set(c,emptyPath());});
  before('moveTo',function(c,a){var p=path(c);p.n++;grow(c,p,a[0],a[1]);});
  before('lineTo',function(c,a){var p=path(c);p.n++;grow(c,p,a[0],a[1]);});
  before('closePath',function(c){path(c).n++;});
  before('quadraticCurveTo',function(c,a){var p=path(c);p.n++;p.curves++;grow(c,p,a[0],a[1]);grow(c,p,a[2],a[3]);});
  before('bezierCurveTo',function(c,a){var p=path(c);p.n++;p.curves++;grow(c,p,a[0],a[1]);grow(c,p,a[4],a[5]);});
  before('arc',function(c,a){var p=path(c);p.n++;p.arcs++;grow(c,p,a[0]-a[2],a[1]-a[2]);grow(c,p,a[0]+a[2],a[1]+a[2]);});
  before('arcTo',function(c,a){var p=path(c);p.n++;p.arcs++;grow(c,p,a[0],a[1]);grow(c,p,a[2],a[3]);});
  before('ellipse',function(c,a){var p=path(c),r=Math.max(a[2],a[3]);p.n++;p.arcs++;grow(c,p,a[0]-r,a[1]-r);grow(c,p,a[0]+r,a[1]+r);});
  before('rect',function(c,a){var p=path(c);p.n++;p.rects++;grow(c,p,a[0],a[1]);grow(c,p,a[0]+a[2],a[1]+a[3]);p.rect=rectKind(c.getTransform(),a[0],a[1],a[2],a[3]);});
  before('roundRect',function(c,a){var p=path(c);p.n++;p.arcs++;grow(c,p,a[0],a[1]);grow(c,p,a[0]+a[2],a[1]+a[3]);});
  function paint(style){if(typeof style==='string')return translucent(style)?'ct':'co';var g=gradients.get(style);if(g)return g.kind+g.stops+(g.alpha?'t':'');var p=patterns.get(style);return p?'pat-'+p:'?';}
  function size(p){var s=Math.max(p.x1-p.x0,p.y1-p.y0);return s<=0?'0':s<=16?'xs':s<=64?'s':s<=256?'m':s<=1024?'L':'XL';}
  function pathKind(p,isPath2D){if(isPath2D)return 'P2D';p=p||emptyPath();if(p.n===1&&p.rects===1)return 'rect-'+p.rect;return (p.curves?'cu':'')+(p.arcs?'ar':'')+(p.rects?'re':'')+(p.n>24?'N':p.n>6?'n':'s')+'-'+size(p);}
  function canvasKind(cv){return cv.id||(cv.isConnected?'dom':'off');}
  function drawState(c){var m=c.getTransform(),s=clipStack(c);
    var shadow=c.shadowBlur>0&&c.shadowColor!=='transparent'&&!/,\s*0(\.0*)?\s*\)$/.test(c.shadowColor);
    return [c.globalCompositeOperation==='source-over'?'':c.globalCompositeOperation,c.globalAlpha<1?'a':'',transformKind(m),
      s[s.length-1]?'clip:'+s[s.length-1].slice(-6):'',shadow?'shadow':'',c.filter&&c.filter!=='none'?'filter':'',canvasKind(c.canvas)].join('|');}
  function stack(){return (new Error().stack||'').split('\n').slice(3,8).map(function(l){return l.trim().replace(/^at /,'').replace(/\(?https?:\/\/[^)]*\/js\/([^?:]+)[^:]*:(\d+):\d+\)?/,'$1:$2');}).join(' < ');}
  function record(c,kind){var sig=kind+'|'+drawState(c);if(seen[sig])return;seen[sig]=1;
    var e={frame:window.__stFrame||0,afterReveal:!!window.__stRevealed,sig:sig};if(e.afterReveal)e.stack=stack();list.push(e);}
  function strokeKind(c){var m=c.getTransform(),w=c.lineWidth*Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));return 'w'+(w<=1.01?'1':w<=3?'3':'N')+c.lineCap[0]+c.lineJoin[0]+(c.getLineDash().length?'d':'');}
  function fontKind(c){var f=c.font||'',px=parseFloat((f.match(/(\d+(\.\d+)?)px/)||[0,0])[1]),m=c.getTransform(),d=px*Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));return (/bold|[6-9]00/.test(f)?'B':'')+(d<=12?'s':d<=24?'m':d<=48?'l':'XL');}
  before('fill',function(c,a){var p2=a[0] instanceof Path2D;record(c,'fill:'+paint(c.fillStyle)+':'+pathKind(p2?null:paths.get(c),p2));});
  before('stroke',function(c,a){var p2=a[0] instanceof Path2D;record(c,'stroke:'+paint(c.strokeStyle)+':'+strokeKind(c)+':'+pathKind(p2?null:paths.get(c),p2));});
  before('fillRect',function(c,a){record(c,'fillRect:'+paint(c.fillStyle)+':'+rectKind(c.getTransform(),a[0],a[1],a[2],a[3]));});
  before('strokeRect',function(c){record(c,'strokeRect:'+paint(c.strokeStyle)+':'+strokeKind(c));});
  before('clearRect',function(c,a){record(c,'clearRect:'+rectKind(c.getTransform(),a[0],a[1],a[2],a[3]));});
  before('clip',function(c,a){var p2=a[0] instanceof Path2D,p=p2?null:paths.get(c),k=p2?'P':(p&&p.n===1&&p.rects===1?'R'+p.rect:'P');
    record(c,'clip:'+k+':'+pathKind(p,p2));var s=clipStack(c);s[s.length-1]+=k;});
  before('fillText',function(c){record(c,'fillText:'+paint(c.fillStyle)+':'+fontKind(c));});
  before('strokeText',function(c){record(c,'strokeText:'+paint(c.strokeStyle)+':'+strokeKind(c)+':'+fontKind(c));});
  before('putImageData',function(c){record(c,'putImageData');});
  before('drawImage',function(c,a){var src=a[0],k=src&&src.constructor?src.constructor.name:'?';
    if(k==='HTMLCanvasElement'||k==='OffscreenCanvas')k+=':'+(contextTypes.get(src)||'none');
    var sw=src.width||0,sh=src.height||0,dx=a[1],dy=a[2],dw=sw,dh=sh;
    if(a.length>=9){sw=a[3];sh=a[4];dx=a[5];dy=a[6];dw=a[7];dh=a[8];}else if(a.length>=5){dw=a[3];dh=a[4];}
    var m=c.getTransform(),s=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c)),scaled=Math.abs(dw*s-sw)>0.5||Math.abs(dh*s-sh)>0.5;
    record(c,'drawImage:'+k+':'+(c.imageSmoothingEnabled?'sm-'+c.imageSmoothingQuality:'nearest')+':'+(scaled?(dw*s>sw?'up':'down'):'1to1')+(a.length>=9?':sub':'')+':'+rectKind(m,dx,dy,dw,dh));});
})();
