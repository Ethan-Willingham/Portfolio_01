/* Original chart marks and cargo illustrations. No runtime downloads or filters. */
(function(root){
  'use strict';
  const marks={
    trade:'M4 9 12 5l8 4v11H4ZM4 9l8 4 8-4M12 13v7M8 7l8 4',
    fleet:'M2 13h12l-3 6H5ZM6 13V7h5v6M15 7h7l-2 5h-4M17 7V3h3v4M2 22h20',
    yard:'m4 20 9-9M13 11l-2-4 4-4h6l-4 4 2 3-4 4ZM4 20l-2-2 3-3 2 2',
    log:'M5 3h14v18H5ZM3 6h4M3 11h4M3 16h4M10 7h5M10 11h5M10 15h3',
    chart:'m2 5 7-2 6 2 7-2v16l-7 2-6-2-7 2ZM9 3v16M15 5v16M5 13l3-3 5 3 6-5',
    sail:'M12 2v16M9 5 3 15h6ZM15 4v11h6ZM2 18h20l-4 4H6Z',
    lock:'M7 10V6a5 5 0 0 1 10 0v4M5 10h14v12H5ZM12 14v4',
    coin:'M8 3h8l5 5v8l-5 5H8l-5-5V8ZM9 8h6M9 12h6M9 16h6',
    hold:'M3 8h18v13H3ZM7 3h10v5M3 12h18M7 12v5M17 12v5',
    hull:'M3 12h18l-4 8H7ZM8 12V7h8v5M12 7V3M2 23h20',
    depth:'M11 2v17M7 15l4 4 4-4M17 4h4M17 9h3M17 14h4M3 22h18',
    pause:'M8 4v16M16 4v16',
    close:'m6 6 12 12M18 6 6 18',
    arrow:'M3 12h17M14 5l7 7-7 7',
    reverse:'M20 12H3M10 5l-7 7 7 7',
    fish:'M4 12 1 7v10ZM4 12q8-13 18 0-10 13-18 0ZM15 9v1M12 7l-2-3M12 17l-2 3',
    engine:'M4 9h16v10H4ZM8 5h8M12 5v4M1 12v4M20 12h3v5M7 22h10',
    guns:'m3 17 13-9 3 4-13 9ZM12 8l5-4 5 5-4 4M7 19l2 3M3 17l-2-3',
    zoom:'M7 4h10M7 20h10M4 7v10M20 7v10M9 12h6M12 9v6',
    bell:'M5 17h14l-2-3V8a5 5 0 0 0-10 0v6ZM10 21h4M12 1v2',
    check:'m4 12 5 5L20 6'
  };
  function icon(name){return '<svg class="reach-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+(marks[name]||marks.hold)+'"/></svg>';}
  const goods={
    salt:'<path fill="#918568" d="m16 9 17 1-2 7 8 18-4 8H12l-5-8 10-18Z"/><path fill="#e1dcc3" d="m18 16 11 1 7 17-4 6H14l-3-6Z"/><path fill="#b6b193" d="m18 16 5 4-3 19h-6l-3-5Z"/><path fill="#665d49" d="M16 15h16v4H16Z"/><path fill="#f5edcf" d="m25 24 4 5-5 5-4-5Z"/>',
    tools:'<path fill="#a18053" d="M7 23h34v16H7Z"/><path fill="#6c5941" d="M7 34h34v7H7Z"/><path fill="#c5a371" d="M9 23h4v16H9M35 23h4v16h-4"/><path fill="#374853" d="m13 31 13-22 4 3-13 21Z"/><path fill="#9baaaa" d="m21 11 4-8 8 3-2 9-4-5-3 6Z"/><path fill="#c2b09a" d="m31 31-13-17 4-3 13 17Z"/><path fill="#668795" d="m11 14 9-7 5 5-9 7Z"/>',
    grain:'<path fill="#997a4e" d="M14 10h19l-3 8 9 16-5 9H12l-5-9 10-16Z"/><path fill="#c3a26a" d="m19 18 9 1 7 16-4 5H15l-4-6Z"/><path fill="#635c46" d="M15 16h17v3H15Z"/><path fill="#edcf83" d="M23 23h2v15h-2m0-8-6-3 1-4 5 5m2 6 6-4-1-4-5 5"/>',
    timber:'<path fill="#6e5139" d="m5 31 26-18 12 9v7L17 46 5 38Z"/><path fill="#b48d59" d="m5 31 27-18 11 9-27 18Z"/><path fill="#88643f" d="m5 20 25-17 12 9v7L16 36 5 27Z"/><path fill="#c7a570" d="M5 20 30 3l12 9-26 18Z"/><path fill="#e0be85" d="m7 21 9 6v7l-9-7Zm1 11 9 6v6l-9-7Z"/><path fill="#5c6e6c" d="m17 12 3-2 12 9v7l-3 2v-7Zm-5 18 3-2 12 9-3 2Z"/>',
    fish:'<path fill="#455b62" d="m6 28-3-12 12 5 18-11 12 9-8 13-23-1-7 8Z"/><path fill="#7ba7a8" d="m10 25 15-11h10l8 6-9 9-19 1Z"/><path fill="#bbcdc2" d="m14 27 20-3 9-4-9 10-20 1Z"/><path fill="#597b7c" d="m22 17-4-9 12 3m-7 20-2 8 10-8Z"/><path fill="#1c3d48" d="M34 17h3v3h-3Z"/>',
    oil:'<path fill="#253e4b" d="M13 8 31 5l7 5v30l-20 4-7-6V12Z"/><path fill="#617b82" d="m13 8 18-3 7 5-19 5Z"/><path fill="#48616c" d="m19 15 19-5v30l-20 4Z"/><path fill="#849b9a" d="m11 17 8 5 19-5v3l-19 5-8-5Zm0 15 8 5 19-5v3l-19 5-8-5Z"/><path fill="#bdad79" d="m27 23 4 6-1 4-4 1-2-3Z"/>',
    relic:'<path fill="#6c654d" d="m5 23 19-10 20 10v15L24 46 5 35Z"/><path fill="#b1905c" d="m5 23 19-10 20 10-20 10Z"/><path fill="#947044" d="m24 33 20-10v15l-20 8Z"/><path fill="#d1ae67" d="m8 25 3 2v11l-3-2Zm26 3 4-2v14l-4 2Z"/><path fill="#b7c4b2" d="m19 8 5-5 6 2 3 5-4 9-8 3-7-6 2-8Z"/><path fill="#475e65" d="m20 9 5-3 5 4-4 5-4-2 2-3Z"/>'
  };
  function cargo(name){return '<svg class="cargo-art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'+(goods[name]||goods.relic)+'</svg>';}
  function hydrate(scope=document){for(const el of scope.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);}
  function vessels(scope,view){view.spriteCache=view.spriteCache||new Map();for(const canvas of scope.querySelectorAll('canvas[data-vessel]')){const sprite=view.sprite(canvas.dataset.vessel,-Math.PI/10),c=canvas.getContext('2d');const scale=Math.min((canvas.width-12)/sprite.width,(canvas.height-10)/sprite.height);c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=true;c.drawImage(sprite,(canvas.width-sprite.width*scale)/2,(canvas.height-sprite.height*scale)/2,sprite.width*scale,sprite.height*scale);}}
  root.WidewakeReachUI={icon,cargo,hydrate,vessels};
})(globalThis);
