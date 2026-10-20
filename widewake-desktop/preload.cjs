'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('WidewakeDesktop',Object.freeze({
  edition:'Desktop',
  toggleFullscreen:()=>ipcRenderer.invoke('widewake:fullscreen'),
  quit:()=>ipcRenderer.send('widewake:quit')
}));
ipcRenderer.on('widewake:fullscreen',(_event,full)=>window.dispatchEvent(new CustomEvent('widewake-fullscreen',{detail:!!full})));
ipcRenderer.on('widewake:activity',(_event,active)=>window.dispatchEvent(new CustomEvent('widewake-activity',{detail:!!active})));
