/* Fleet inspection and orders. The sea pauses while this desk is open. */
(function(root){
  'use strict';
  const D=WidewakeData,C=WidewakeCore,R=WidewakeRender;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id),by=(list,id)=>list.find(x=>x.id===id);
  class Convoy{
    constructor({game,open,change}){
      this.game=game;this.show=open;this.change=change;this.uid=0;this.to=null;this.quantity=5;this.stripKey='';
      $('convoy-dialog').addEventListener('click',e=>{
        const button=e.target.closest('[data-convoy-action]');if(!button||button.disabled)return;
        const g=this.game(),action=button.dataset.convoyAction;
        if(action==='select'){this.uid=Number(button.dataset.uid);this.to=null;this.render();$('convoy-feedback').textContent='';return;}
        if(action==='move'){
          const moved=g.transferCargo(this.uid,this.to,button.dataset.good,this.quantity);
          if(moved){this.change();this.render();$('convoy-feedback').textContent='Moved '+moved+' '+by(D.goods,button.dataset.good).name.toLowerCase()+'. Both manifests are saved.';}
        }
      });
      $('convoy-dialog').addEventListener('change',e=>{
        const field=e.target.dataset.convoyField;if(!field)return;const g=this.game();
        if(field==='destination')this.to=Number(e.target.value);
        if(field==='quantity')this.quantity=Number(e.target.value);
        if(field==='guard'){g.setGuard(this.uid,e.target.value==='auto'?null:Number(e.target.value));this.change();}
        if(field==='reserve'){g.reserveHold(this.uid,e.target.checked);this.change();}
        this.render();if(field==='guard')$('convoy-feedback').textContent='Orders saved. The crew will move when you resume.';
      });
    }
    open(uid=0){this.uid=uid;this.to=null;this.render();$('convoy-feedback').textContent='';this.show();}
    render(){
      const g=this.game(),ships=[g.player,...g.fleet.filter(f=>f.hp>0)],ship=ships.find(f=>f.uid===this.uid)||g.player;this.uid=ship.uid;
      const active=document.activeElement,key=active?.dataset.convoyField,action=active?.dataset.convoyAction,good=active?.dataset.good,focusUid=active?.dataset.uid;
      const name=f=>f.uid===0?g.hull().name:f.data.name,capacity=f=>f.uid===0?g.holdMax():f.spec.hold,atPort=g.mode==='port';
      const others=ships.filter(f=>f!==ship);if(!others.some(f=>f.uid===this.to))this.to=others[0]?.uid??null;
      $('convoy-caption').textContent=atPort?'At anchor / cargo and orders':'Sea paused / orders take effect on return';
      $('convoy-list').innerHTML=ships.map(f=>'<button data-convoy-action="select" data-uid="'+f.uid+'" aria-pressed="'+(f===ship)+'"><strong>'+esc(name(f))+'</strong><small>'+(f.uid===0?'Flagship':f.spec.name)+'</small><span>'+Math.ceil(f.hp/f.maxHp*100)+'% hull &middot; '+C.count(f.data.cargo)+' cargo</span></button>').join('');
      const spec=ship.uid===0?g.hull():ship.spec,ratio=Math.max(0,ship.hp/ship.maxHp),work=ship.type==='trawler'?'fish':ship.type==='oilrig'?'oil':null;
      let html='<div class="ww-convoy-heading"><canvas id="convoy-portrait" width="64" height="48" aria-hidden="true"></canvas><div><h3>'+esc(name(ship))+'</h3><p>'+esc(ship.uid===0?'Flagship':spec.name)+'</p></div></div><p class="ww-note">'+esc(spec.description)+'</p><div class="ww-convoy-stats"><span><strong>'+Math.ceil(ship.hp)+' / '+ship.maxHp+'</strong>Hull condition</span><span><strong>'+C.count(ship.data.cargo)+' / '+capacity(ship)+'</strong>Cargo aboard</span></div><div class="ww-progress"><i style="width:'+ratio*100+'%;background:var('+(ratio<.3?'--ww-red':'--ww-green')+')"></i></div>';
      if(g.canGuard(ship)){
        html+='<label class="ww-field-label" for="convoy-guard">Protect</label><select id="convoy-guard" data-convoy-field="guard"><option value="auto" '+(ship.data.guardUid==null?'selected':'')+'>Automatic workboat screen</option>'+g.guardOptions().map(f=>'<option value="'+f.uid+'" '+(ship.data.guardUid===f.uid?'selected':'')+'>'+esc(f.uid===0?'Flagship':name(f)+' / '+f.spec.name)+'</option>').join('')+'</select><p class="ww-note ww-order-help">Automatic escorts follow you on voyages and spread between working boats during production. A named assignment stays with that boat.</p>';
      }else html+='<p class="ww-order-status">'+esc(g.orderText(ship))+'</p>';
      if(work)html+='<label class="ww-reserve"><input type="checkbox" data-convoy-field="reserve" '+(ship.data.reserve!==false?'checked':'')+' '+(!atPort?'disabled':'')+'> Keep this hold for '+work+'</label><p class="ww-note">Other goods already aboard stay put. '+(atPort?'Move them below to free the hold.':'Repack holds when you reach a port.')+'</p>';
      html+='<p class="ww-section-label">Cargo manifest</p>';
      const goods=D.goods.filter(item=>ship.data.cargo[item.id]>0);
      if(atPort&&others.length&&goods.length)html+='<div class="ww-transfer-controls"><label for="convoy-to">Move to<select id="convoy-to" data-convoy-field="destination">'+others.map(f=>'<option value="'+f.uid+'" '+(this.to===f.uid?'selected':'')+'>'+esc(name(f))+' ('+(capacity(f)-C.count(f.data.cargo))+' free)</option>').join('')+'</select></label><label for="convoy-quantity">Units<select id="convoy-quantity" data-convoy-field="quantity">'+[1,5,10,9999].map(n=>'<option value="'+n+'" '+(this.quantity===n?'selected':'')+'>'+(n===9999?'All that fit':n)+'</option>').join('')+'</select></label></div>';
      html+=goods.length?goods.map(item=>{
        const n=g.transferQuote(this.uid,this.to,item.id,this.quantity),blocked=this.to!==null&&g.cargoRoom(item.id,this.to)===0;
        return '<div class="ww-transfer-row"><span>'+item.name+'</span><strong>'+ship.data.cargo[item.id]+'</strong>'+(atPort&&others.length?'<button data-convoy-action="move" data-good="'+item.id+'" '+(!n?'disabled':'')+' title="'+(blocked?'That hold is full or reserved for another resource.':'Move '+n+' units without buying or selling.')+'">'+(n?'Move '+n:'No room')+'</button>':'')+'</div>';
      }).join(''):'<p class="ww-note">An empty hold. Select another boat to move cargo here.</p>';
      if(!atPort&&goods.length)html+='<p class="ww-note">Cargo moves between boats at port. Everything in this hold is lost if the boat sinks.</p>';
      $('convoy-detail').innerHTML=html;
      const canvas=$('convoy-portrait'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(R.shipSprite(ship.type),8,0,48,48);
      const focus=key?$('convoy-detail').querySelector('[data-convoy-field="'+key+'"]'):[...$('convoy-dialog').querySelectorAll('[data-convoy-action]')].find(e=>e.dataset.convoyAction===action&&e.dataset.good===good&&e.dataset.uid===focusUid);
      if(focus&&!focus.disabled)focus.focus({preventScroll:true});
      g.highlightUid=ship.uid;g.highlightUntil=g.time+7;
    }
    updateStrip(){
      const g=this.game(),ships=g.fleet.filter(f=>f.hp>0),key=ships.map(f=>f.uid).join(',');
      if(key!==this.stripKey){this.stripKey=key;$('fleet-strip').innerHTML=ships.map(f=>'<button class="ww-fleet-token" data-fleet-uid="'+f.uid+'"><strong></strong><span></span><div class="ww-progress"><i></i></div><small></small></button>').join('');}
      for(const f of ships){const button=$('fleet-strip').querySelector('[data-fleet-uid="'+f.uid+'"]');if(!button)continue;const critical=f.hp<f.maxHp*.3,working=g.production?.workers.includes(f),anchor=g.guardAnchor(f),behind=WidewakeWorld.distance(g.player,f)>650&&!working&&anchor===g.player;
        button.classList.toggle('ww-critical',critical);button.classList.toggle('ww-working',!!working);button.querySelector('strong').textContent=f.data.name;button.querySelector('span').textContent=C.count(f.data.cargo);button.querySelector('i').style.width=Math.max(0,f.hp/f.maxHp*100)+'%';button.querySelector('small').textContent=critical?'Hull critical':working?'Working':anchor!==g.player?'Guard: '+anchor.data.name:behind?'Catching up':Math.ceil(f.hp/f.maxHp*100)+'% hull';button.title=f.data.name+', '+f.spec.name+'. '+Math.ceil(f.hp/f.maxHp*100)+'% hull, '+C.count(f.data.cargo)+' / '+f.spec.hold+' cargo. '+g.orderText(f)+'. Inspect and give orders.';button.setAttribute('aria-label',button.title);
      }
    }
  }
  root.WidewakeConvoy=Convoy;
})(globalThis);
