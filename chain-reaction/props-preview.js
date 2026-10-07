(async function(){'use strict';
 const manifest=await fetch('/chain-reaction/props/manifest.json').then(r=>r.json()),select=document.getElementById('prop'),pose=document.getElementById('pose'),canvas=document.getElementById('machine'),status=document.getElementById('status');
 let view,selected='drawer',state=0,generation=0;
 for(const d of manifest.studies.filter(d=>d.state===0)){const o=document.createElement('option');o.value=d.id;o.textContent=d.title;select.append(o);}
 async function show(){const own=++generation,record=manifest.studies.find(d=>d.id===selected&&d.state===state),definition=await fetch('/chain-reaction/props/'+record.path).then(r=>r.json());if(own!==generation)return;view?.dispose();view=window.ChainReaction.makeView(canvas,[definition]);view.setCamera(definition.view);view.draw(0,false,0,false);status.textContent=record.title+' · '+record.label;pose.textContent=manifest.studies.find(d=>d.id===selected&&d.state!==state).label;}
 select.onchange=()=>{selected=select.value;state=0;show();};pose.onclick=()=>{state=state?0:1;show();};addEventListener('resize',()=>{view?.resize();view?.draw(0,false,0,false);});
 await show();window.ChainReactionProps={ready:true,quality:()=>view.quality(),state:()=>({selected,pose:state})};
})();
