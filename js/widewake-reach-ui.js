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
  const text=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleNames={launch:'Launch',flagship:'Frigate',gunboat:'Escort',trawler:'Trawler',oilrig:'Oil tender',repair:'Tender',screen:'Flak boat',battery:'Mortar boat'};
  const goodsNames={salt:'Salt',tools:'Tools',grain:'Grain',timber:'Timber',fish:'Fish',oil:'Oil',relic:'Salvage'};
  const cargoUsed=s=>s.manifest?Object.values(s.manifest).reduce((a,b)=>a+b,0):s.cargo||0;
  const working=(g,s)=>s.hp>0&&s.id!==0&&(g.endgame?g.work&&s.working:g.operation&&(g.operation.id==='oil'?s.type==='oilrig':s.type==='trawler'));
  const needsAttention=s=>s.hp<=0||s.hp/s.maxHp<.8||s.hold>0&&cargoUsed(s)>=s.hold;
  function shipStatus(g,s){
    if(s.hp<=0)return'Lost';
    if(s.hp/s.maxHp<.35)return'Critical hull';
    if(s.hold>0&&cargoUsed(s)>=s.hold)return'Hold full';
    if(s.hp/s.maxHp<.8)return'Needs repair';
    if(g.port)return'Berthed';
    if(s.id===0)return g.route?'On course':'At your helm';
    if(working(g,s))return g.workActive?'Working':'Taking station';
    if(s.orderKey?.startsWith('berth:'))return'Approaching berth';
    if(s.needsJoin)return'Joining convoy';
    return g.endgame&&g.work?'Holding station':'Following';
  }
  function fleetSummary(g){const alive=g.ships.filter(s=>s.hp>0),damaged=alive.filter(s=>s.hp<s.maxHp-.01).length,workingCount=alive.filter(s=>working(g,s)).length;return{alive:alive.length,total:g.ships.length,damaged,working:workingCount,label:alive.length+' '+(alive.length===1?'boat':'boats')+(damaged?' / '+damaged+' damaged':'')};}
  function fleetRows(g,{filter='all',selected=0}={}){
    const groups=[['Command',s=>s.id===0],['Workboats',s=>s.id!==0&&['trawler','oilrig'].includes(s.type)],['Escorts',s=>s.id!==0&&['gunboat','screen','battery'].includes(s.type)],['Support',s=>s.id!==0&&!['trawler','oilrig','gunboat','screen','battery'].includes(s.type)]];
    const accepts=s=>filter==='attention'?needsAttention(s):filter==='workers'?s.id!==0&&['trawler','oilrig'].includes(s.type):filter==='escorts'?s.id!==0&&['gunboat','screen','battery'].includes(s.type):true;
    return groups.map(([name,match])=>{const list=g.ships.filter(s=>match(s)&&accepts(s));return list.length?'<section class="fleet-group"><h3>'+name+' <span>'+list.length+'</span></h3>'+list.map(s=>{const hull=Math.max(0,Math.ceil(s.hp/s.maxHp*100));return'<button type="button" class="fleet-row'+(needsAttention(s)?' needs-attention':'')+'" data-fleet-ship="'+s.id+'" aria-pressed="'+(s.id===Number(selected))+'"><canvas width="100" height="54" data-vessel="'+text(s.type)+'" aria-hidden="true"></canvas><span class="fleet-row-name"><strong>'+text(s.name)+'</strong><small>'+text(roleNames[s.type]||s.type)+' / '+shipStatus(g,s)+'</small></span><span class="fleet-row-values"><strong>'+hull+'%<span class="ww-sr-only"> hull</span></strong><small>'+cargoUsed(s)+'/'+(s.hold||0)+' hold</small></span></button>';}).join('')+'</section>':'';}).join('')||'<p class="fleet-empty">'+(filter==='attention'?'All boats have sound hulls and room aboard.':'No boats in this group.')+'</p>';
  }
  function transferOptions(g,shipId){const s=g.ships.find(s=>s.id===Number(shipId));return s?{goods:Object.entries(s.manifest||{}).filter(([,n])=>n>0),targets:g.ships.filter(other=>other.id!==s.id&&other.hp>0&&other.hold>cargoUsed(other))}:{goods:[],targets:[]};}
  function fleetDetail(g,shipId=0){
    const s=g.ships.find(s=>s.id===Number(shipId))||g.ships[0],alive=s.hp>0,role=s.id===0?'Your flagship':roleNames[s.type]||s.type,hold=s.hold||0,used=cargoUsed(s),range=s.id===0?0:Math.round(Math.hypot(s.x-g.player.x,s.y-g.player.y)),manifest=Object.entries(s.manifest||{}).filter(([,n])=>n>0);
    const actions='<div class="fleet-detail-actions"><button type="button" class="reach-primary" data-fleet-action="locate"'+(alive?'':' disabled')+'>'+icon('zoom')+'Find on water</button>'+(g.port?'<button type="button" data-fleet-action="repair"'+(!g.repairCost?.()||g.repairCost()>g.coins?' disabled':'')+'>Repair fleet / '+Math.ceil(g.repairCost?.()||0)+' c</button>':'')+'</div>';
    let html='<div class="fleet-detail-heading"><div><small>'+text(role)+'</small><h3>'+text(s.name)+'</h3></div><span class="fleet-state'+(needsAttention(s)?' attention':'')+'">'+shipStatus(g,s)+'</span></div>'+actions+'<canvas class="fleet-detail-art" width="280" height="110" data-vessel="'+text(s.type)+'" aria-hidden="true"></canvas><dl class="fleet-vitals"><div><dt>Hull</dt><dd>'+Math.max(0,Math.ceil(s.hp))+' / '+Math.ceil(s.maxHp)+'</dd></div><div><dt>Cargo</dt><dd>'+used+' / '+hold+'</dd></div><div><dt>From flagship</dt><dd>'+(s.id===0?'At the helm':range>=1000?(range/1000).toFixed(1)+' km':range+' m')+'</dd></div></dl>';
    html+='<div class="fleet-cargo"><h4>Aboard</h4>'+(manifest.length?manifest.map(([good,n])=>'<span>'+cargo(good)+'<span>'+text(goodsNames[good]||good)+'</span><strong>'+n+'</strong></span>').join(''):used?'<p>'+used+' units of '+(s.type==='oilrig'?'oil':'fish')+'</p>':'<p>Empty hold</p>')+'</div>';
    if(g.port&&alive&&typeof g.transferCargo==='function'){
      const options=transferOptions(g,s.id);
      if(options.goods.length&&options.targets.length)html+='<fieldset class="fleet-transfer"><legend>Move cargo at this harbor</legend><label>Good<select id="fleet-transfer-good">'+options.goods.map(([good,n])=>'<option value="'+text(good)+'">'+text(goodsNames[good]||good)+' / '+n+' aboard</option>').join('')+'</select></label><label>To boat<select id="fleet-transfer-target">'+options.targets.map(other=>'<option value="'+other.id+'">'+text(other.name)+' / '+(other.hold-cargoUsed(other))+' free</option>').join('')+'</select></label><div><label>Units<input id="fleet-transfer-quantity" type="number" min="1" step="1" value="1" inputmode="numeric"></label><button type="button" data-fleet-action="transfer-max">Max</button><button type="button" data-fleet-action="transfer">Move cargo</button></div></fieldset>';
      else if(options.goods.length)html+='<p class="fleet-transfer-note">Other boats need free hold space to receive cargo.</p>';
    }
    return html;
  }
  function harborIntent(g){
    const o=g.objective?.()||{},port=o.port||o.site;
    if(!g.earned?.includes('salt')){
      const aboard=g.amount('salt'),remaining=Math.max(1,8-(g.stats?.soldSalt||0));
      if(['lantern','reeds'].includes(g.port)&&aboard>0)return{title:'Delivery ready',label:'Sell your salt',detail:'Complete the delivery here',action:'trade',good:'salt',side:'sell',quantity:Math.min(remaining,aboard),port};
      if(aboard<remaining)return{title:'Prepare the delivery',label:g.port==='yard'?'Load salt for Lantern Quay':'Find salt at Tern Yard',detail:'Carry '+remaining+' salt to earn 350 c and open Fleet',action:g.port==='yard'?'trade':'chart',good:'salt',side:'buy',quantity:remaining-aboard,port:g.port==='yard'?'lantern':'yard'};
      return{title:'Your first delivery',label:'Plot course to Lantern Quay',detail:aboard+' salt aboard / 350 c delivery reward',action:'chart',port:'lantern'};
    }
    if(!g.earned?.includes('fish')&&!g.ships.some(s=>s.hp>0&&s.type==='trawler'))return{title:'Start a working fleet',label:g.port==='reeds'?'Find a deeper harbor':'Buy a trawler',detail:g.port==='reeds'?'Tern Yard can berth workboats':'A trawler opens fishing watches',action:g.port==='reeds'?'chart':'recruit',port:'yard',role:'trawler'};
    if(port==='oil'&&!g.ships.some(s=>s.hp>0&&s.type==='oilrig'))return{title:'Work the outer sound',label:g.port==='reeds'?'Find a deeper harbor':'Buy an oil tender',detail:g.port==='reeds'?'Tern Yard can berth workboats':'An oil tender opens offshore watches',action:g.port==='reeds'?'chart':'recruit',port:'yard',role:'oilrig'};
    const deliveries={canopy:{good:'tools',count:12,stat:'soldTools',source:'kilns'},yard:{good:'timber',count:12,stat:'soldTimber',source:'canopy'},bells:{good:'grain',count:24,stat:'soldGrain',source:'canopy'},crown:{good:'oil',count:24,stat:'soldOil',source:'glass'}};
    // The timber objective points at its source until enough timber is aboard.
    const delivery=o.title==='Timber home'?deliveries.yard:deliveries[port];
    if(delivery){
      const target=o.title==='Timber home'?'yard':port,good=delivery.good,remaining=Math.max(1,delivery.count-(g.stats?.[delivery.stat]||0)),aboard=g.amount(good),ports=root.WidewakeEstuary?.ports||[],portName=id=>ports.find(p=>p.id===id)?.name||({yard:'Tern Yard',kilns:'Ochre Kilns',canopy:'Canopy Landing',bells:'Bellwether',crown:'Crown Anchorage',glass:'Cinder Quay'}[id]||id);
      if(g.port===target&&aboard>0)return{title:'Delivery ready',label:'Sell your '+good,detail:'Deliver '+Math.min(remaining,aboard)+' '+good+' at '+portName(target),action:'trade',good,side:'sell',quantity:Math.min(remaining,aboard),port:target};
      if(aboard<remaining){
        const local=g.port&&g.port!==target&&g.price?.(good,true,g.port)<g.price?.(good,false,target),source=local?g.port:delivery.source;
        return{title:'Prepare the delivery',label:g.port===source?'Load '+good+' for '+portName(target):'Find '+good+' at '+portName(source),detail:'Need '+(remaining-aboard)+' more / '+aboard+' aboard',action:g.port===source?'trade':'chart',good,side:'buy',quantity:remaining-aboard,port:source};
      }
      return{title:o.title,label:'Plot course to '+portName(target),detail:remaining+' '+good+' ready to deliver',action:'chart',port:target};
    }
    return{title:o.title||'Your next voyage',label:port?'Plot next voyage':'Explore the waterways',detail:o.detail||'Trade, work and explore',action:'chart',port};
  }
  function destinationRows(g,destinations){
    const o=g.objective?.()||{},intent=harborIntent(g),next=intent.action==='chart'&&intent.port?intent.port:o.port||o.site;
    return [...destinations].sort((a,b)=>(b.id===next)-(a.id===next)).map(p=>{const suggested=p.id===next,here=p.id===g.port,kind=p.type==='fish'?'Fishing':p.type==='oil'?'Oil grounds':['Sheltered','Light patrols','Fast raiders','Gunboats','Heavy patrols'][g.field.sample(p.x,p.y).region.tier],purpose=p.type==='fish'?'Fishing watch':p.type==='oil'?'Oil watch':next!==(o.port||o.site)?'Cargo source':'Delivery destination';return'<button type="button" data-port="'+text(p.id)+'" class="'+(suggested?'suggested-destination':'')+'" aria-pressed="false">'+icon(p.type==='fish'?'fish':p.type==='oil'?'engine':'sail')+'<span>'+text(p.name)+'<small>'+(here?'Docked here':suggested?purpose+' / '+kind:kind)+'</small></span>'+(suggested?'<span class="destination-tag">Next voyage</span>':'')+'</button>';}).join('');
  }
  root.WidewakeReachUI={icon,cargo,hydrate,vessels,fleetSummary,fleetRows,fleetDetail,shipStatus,transferOptions,harborIntent,destinationRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.WidewakeReachUI;
})(globalThis);
