// Uneven control gestures through the real keyboard handler. No pose, velocity,
// camera, fuel, collision, or world writes during the route.
export async function humanInputRoute(send,seconds,kind='surface'){
  const gestures=kind==='slimes'?[
    [.8,['ArrowRight']],[.12,['ArrowRight','ArrowUp']],[.55,['ArrowRight']],
    [.23,[]],[.46,['ArrowLeft']],[.9,['ArrowRight']],[.23,['ArrowLeft']],
    [.14,['ArrowUp']],[.47,['ArrowRight']],[.41,[]],[1.1,['ArrowLeft']],
    [.16,['ArrowLeft','ArrowUp']],[.72,['ArrowLeft']],[.31,[]],
    [.38,['ArrowRight']],[.61,['ArrowLeft']],[.18,['ArrowUp']],
    [.95,['ArrowRight']],[.26,[]],[.44,['ArrowLeft']],[.83,['ArrowRight']]
  ]:[
    [1.3,['ArrowRight']],[.75,['ArrowRight','ArrowUp']],[.28,['ArrowRight']],
    [.42,['ArrowRight','ArrowUp']],[.65,[]],[.31,['ArrowLeft']],
    [1.4,['ArrowRight','ArrowUp']],[.53,['ArrowRight']],[.9,[]],
    [2.1,['ArrowRight']],[.8,['ArrowUp']],[.38,['ArrowLeft','ArrowUp']],
    [1.6,['ArrowRight','ArrowUp']],[1.15,['ArrowRight']],[1.2,[]],
    [1.9,['ArrowDown']],[.4,['ArrowRight']],[1.3,['ArrowDown']],
    [1.7,['ArrowUp']],[.45,[]],[1.1,['ArrowUp','ArrowRight']],
    [.7,['ArrowLeft']],[.55,['ArrowLeft','ArrowUp']],[1.35,['ArrowLeft']],
    [1.6,['ArrowLeft','ArrowUp']],[.3,[]],[.85,['ArrowRight']],
    [1.4,['ArrowLeft']],[.6,['ArrowLeft','ArrowUp']],[.4,['ArrowLeft']],
    [.9,[]],[1.7,['ArrowDown']],[1.3,['ArrowUp']],[.22,[]],
    [1.25,['ArrowLeft','ArrowUp']],[.62,['ArrowLeft']],[.48,['ArrowRight']],
    [1.4,['ArrowLeft','ArrowUp']],[1.1,[]],[1.8,['ArrowLeft']],
    [.6,['ArrowUp']],[.25,[]],[1.2,['ArrowUp','ArrowRight']],
    [.8,['ArrowRight']],[.47,['ArrowUp','ArrowRight']],[1.3,[]]
  ];
  const virtual={ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40};
  const started=performance.now(),log=[];let held=new Set(),index=0;
  async function set(next){
    for(const key of held)if(!next.has(key))await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:virtual[key]});
    for(const key of next)if(!held.has(key))await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:virtual[key]});
    held=next;
  }
  try{
    while(performance.now()-started<seconds*1000){
      const [duration,keys]=gestures[index++%gestures.length];
      const next=new Set(keys);
      if(kind==='slimes'){
        // Turn back after observing the rig approach a pen edge, as a player
        // would. Keep the irregular gesture timing and real collision response.
        const state=await send('Runtime.evaluate',{expression:'__audit.inputBounds()',returnByValue:true});
        const {x,left,right}=state.result.value;
        if(x<left){next.delete('ArrowLeft');next.add('ArrowRight');}
        else if(x>right){next.delete('ArrowRight');next.add('ArrowLeft');}
      }
      await set(next);log.push({atMs:performance.now()-started,keys:[...next]});
      await new Promise(r=>setTimeout(r,Math.max(0,Math.min(duration*1000,seconds*1000-(performance.now()-started)))));
    }
  }finally{await set(new Set());}
  return log;
}
