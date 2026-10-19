/* Standard-layout controllers. The game owns polling, pause and all scheduling. */
(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function stick(x,y,deadzone=.18){
    deadzone=Number.isFinite(deadzone)?clamp(deadzone,.1,.35):.18;
    x=Number.isFinite(x)?clamp(x,-1,1):0;y=Number.isFinite(y)?clamp(y,-1,1):0;
    const length=Math.hypot(x,y);if(length<=deadzone)return{x:0,y:0};
    const scaled=Math.min(1,(length-deadzone)/(1-deadzone));return{x:x/length*scaled,y:y/length*scaled};
  }
  function visible(el){
    if(el.disabled||el.closest('[hidden],[inert]')||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')return false;
    // Closed details can retain child rectangles even though their controls cannot be focused.
    for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(el))return false;
    return true;
  }
  class Controller{
    constructor(options){
      this.options=options;this.pad=null;this.index=null;this.previous=[];this.axes=[];this.blocked=true;this.editing=null;this.direction='';this.repeatAt=0;this.focused=null;this.aim=null;this.lastPulse=0;this.present=false;this.lastStatus='';this.polls=0;
    }
    settings(){return this.options.settings();}
    status(text){if(text===this.lastStatus)return;this.lastStatus=text;this.options.status(text);}
    reset(){this.blocked=true;this.direction='';this.editing=null;this.aim=null;this.stopRumble();}
    stopRumble(){try{const result=this.pad?.vibrationActuator?.reset?.();result?.catch?.(()=>{});}catch{}}
    labels(){const choice=this.settings().controllerLabels||'auto',ps=choice==='playstation'||choice==='auto'&&/dualsense|dualshock|playstation|054c/i.test(this.pad?.id||'');return ps?{confirm:'Cross',back:'Circle',burst:'Square',repair:'Triangle',chart:'L1',convoy:'R1',boost:'L2',fire:'R2',pause:'Options'}:{confirm:'A',back:'B',burst:'X',repair:'Y',chart:'LB',convoy:'RB',boost:'LT',fire:'RT',pause:'Menu'};}
    pulse(kind,now){
      if(!this.options.using()||!this.settings().controllerRumble||!this.pad||now-this.lastPulse<.12)return;
      const cue={shot:[35,0,.07],hurt:[90,.35,.2],burst:[130,.45,.3],rare:[90,.08,.18]}[kind];if(!cue)return;
      this.lastPulse=now;try{const actuator=this.pad.vibrationActuator;if(actuator?.playEffect)actuator.playEffect('dual-rumble',{startDelay:0,duration:cue[0],strongMagnitude:cue[1],weakMagnitude:cue[2]}).catch(()=>{});}catch{}
    }
    buttons(scope){return [...scope.querySelectorAll('button,select,input:not([type=file]),summary,a[href]')].filter(visible);}
    markFocus(scope){
      const el=document.activeElement;if(this.focused!==el){this.focused?.classList.remove('ww-pad-focus');this.focused=el;}
      el?.classList?.toggle('ww-pad-focus',!!(this.options.using()&&scope?.contains(el)&&visible(el)));
      document.querySelectorAll('.ww-pad-editing').forEach(e=>{if(e.id!==this.editing?.id)e.classList.remove('ww-pad-editing');});
      if(this.editing)document.getElementById(this.editing.id)?.classList.add('ww-pad-editing');
      if(this.lastEditing!==this.editing?.id){this.lastEditing=this.editing?.id;this.options.describe?.();}
    }
    focus(el){if(!el)return;el.focus({preventScroll:true});if(this.options.using())el.classList.add('ww-pad-focus');el.scrollIntoView({block:'nearest',inline:'nearest'});}
    move(scope,dir){
      let list=this.buttons(scope);const current=document.activeElement,vertical=dir==='up'||dir==='down',panel=this.options.context().port?scope.querySelector('#port-panel'):null;
      if(panel&&current.closest('.ww-tabs')&&dir==='down'){this.focus(this.buttons(panel)[0]);return;}
      const inPanel=panel?.contains(current)&&vertical;if(inPanel)list=this.buttons(panel);
      if(!list.includes(current)){this.focus(list[0]);return;}
      const a=current.getBoundingClientRect(),ax=a.x+a.width/2,ay=a.y+a.height/2,sign=dir==='up'||dir==='left'?-1:1;
      const candidates=list.filter(e=>e!==current).map(el=>{const b=el.getBoundingClientRect(),bx=b.x+b.width/2,by=b.y+b.height/2,along=(vertical?by-ay:bx-ax)*sign,cross=Math.abs(vertical?bx-ax:by-ay),overlap=vertical?b.right>a.left+2&&b.left<a.right-2:b.bottom>a.top+2&&b.top<a.bottom-2;return{el,along,overlap,score:along+cross*2};}).filter(q=>q.along>3).sort((a,b)=>a.score-b.score);
      const next=candidates.find(q=>q.overlap)||candidates[0];
      if(next)this.focus(next.el);else if(inPanel&&dir==='up')this.focus(scope.querySelector('[data-tab][aria-pressed=true]'));
    }
    tab(scope,delta){const list=this.buttons(scope),i=list.indexOf(document.activeElement);this.focus(list[i<0?(delta>0?0:list.length-1):(i+delta+list.length)%list.length]);}
    adjust(delta){
      const el=document.getElementById(this.editing?.id);if(!el){this.editing=null;return;}
      if(el.tagName==='SELECT'){
        const list=[...el.options].filter(o=>!o.disabled&&!o.parentElement.disabled),i=list.findIndex(o=>o.value===el.value),option=list[clamp(i+delta,0,list.length-1)];if(!option||option.value===el.value)return;el.value=option.value;el.dispatchEvent(new Event('change',{bubbles:true}));
      }else if(el.type==='range'){
        const step=Number(el.step)||1,value=clamp(Number(el.value)+delta*step,Number(el.min)||0,Number(el.max)||100);el.value=String(Math.round(value*1000)/1000);el.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }
    confirm(scope){
      if(this.editing){this.editing=null;return;}
      const list=this.buttons(scope);let el=document.activeElement;if(!list.includes(el)){this.focus(list[0]);el=document.activeElement;}
      if(!el||!visible(el))return;
      if(el.tagName==='SELECT'||el.type==='range'){this.editing={id:el.id,value:el.value};return;}
      el.click();
    }
    back(){
      if(this.editing){const edit=this.editing;this.editing=null;const el=document.getElementById(edit.id);if(el){el.value=edit.value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));}return;}
      this.options.action('back');
    }
    update(now){
      this.polls++;const empty={x:0,y:0,fire:false,boost:false,aim:null};let pads;
      try{pads=Array.from(navigator.getGamepads?.()||[]);}catch{if(this.pad){const used=this.options.using();this.reset();this.pad=null;this.index=null;this.present=false;this.options.lost(used);}this.status('Controller access is unavailable in this browser.');return empty;}
      const available=pads.filter(p=>p?.connected&&p.mapping==='standard');let pad=available.find(p=>p.index===this.index);
      if(this.pad&&!pad){const used=this.options.using();this.reset();this.pad=null;this.index=null;this.options.lost(used);}
      pad=pad||available[0];if(!pad){this.present=false;this.status(pads.some(p=>p?.connected)?'This controller has no standard layout. Use keyboard or touch.':'No controller detected. Press a button on a connected controller.');return empty;}
      const buttons=Array.from({length:17},(_,i)=>!!pad.buttons[i]?.pressed||(pad.buttons[i]?.value||0)>(i===6||i===7?.25:.5)),deadzone=this.settings().controllerDeadzone??.18,left=stick(pad.axes[0],pad.axes[1],deadzone),right=stick(pad.axes[2],pad.axes[3],deadzone),neutral=!buttons.some(Boolean)&&!left.x&&!left.y&&!right.x&&!right.y&&(pad.buttons[6]?.value||0)<=.12&&(pad.buttons[7]?.value||0)<=.12;
      if(this.index!==pad.index){this.index=pad.index;this.pad=pad;this.previous=buttons;this.axes=[...pad.axes];this.blocked=true;this.options.connected();}
      this.pad=pad;this.present=true;
      const pressed=buttons.map((b,i)=>b&&!this.previous[i]),moved=pad.axes.some((v,i)=>Math.abs(v-(this.axes[i]||0))>.04)&&(left.x||left.y||right.x||right.y);
      this.previous=buttons;this.axes=[...pad.axes];
      if(pressed.some(Boolean)||moved)this.options.use();
      if(this.blocked){if(neutral)this.blocked=false;else{this.status('Release the sticks and buttons to resume controller input.');this.markFocus(this.options.context().scope);return empty;}}
      this.status('Controller ready. '+this.labels().confirm+' selects; '+this.labels().back+' goes back.');
      const context=this.options.context(),menu=!context.sea;
      if(pressed[9]){this.options.use();this.options.action('pause');return empty;}
      if(menu){
        this.markFocus(context.scope);
        if(pressed[1]){this.back();return empty;}
        if(pressed[0]){this.confirm(context.scope);this.markFocus(this.options.context().scope);return empty;}
        if(pressed[4]||pressed[5]){if(this.editing)this.adjust(pressed[5]?1:-1);else if(context.port)this.options.action(pressed[5]?'next-tab':'previous-tab');else this.tab(context.scope,pressed[5]?1:-1);return empty;}
        const x=buttons[15]?1:buttons[14]?-1:left.x,y=buttons[13]?1:buttons[12]?-1:left.y,dir=Math.max(Math.abs(x),Math.abs(y))<.45?'':Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';
        if(!dir){this.direction='';return empty;}
        if(dir!==this.direction||now>=this.repeatAt){this.repeatAt=now+(dir!==this.direction?.36:.13);this.direction=dir;if(this.editing){const range=document.getElementById(this.editing.id)?.type==='range';this.adjust(dir==='left'||dir===(range?'down':'up')?-1:1);}else this.move(context.scope,dir);this.markFocus(this.options.context().scope);}
        return empty;
      }
      this.editing=null;this.markFocus(null);
      const action=pressed[1]?'pause':pressed[4]?'chart':pressed[5]?'convoy':pressed[0]?'context':pressed[2]?'burst':pressed[3]?'repair':pressed[8]?'help':pressed[12]?'zoom-in':pressed[13]?'zoom-out':pressed[14]?'formation-previous':pressed[15]?'formation-next':null;
      if(action){this.options.action(action);if(!this.options.context().sea)return empty;}
      if(right.x||right.y){const length=Math.hypot(right.x,right.y);this.aim={x:right.x/length,y:right.y/length};}
      return{x:left.x,y:left.y,boost:(pad.buttons[6]?.value||0)>.25,fire:!!(right.x||right.y)||(pad.buttons[7]?.value||0)>.25,aim:this.aim};
    }
  }
  const api={Controller,stick};root.WidewakeController=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
