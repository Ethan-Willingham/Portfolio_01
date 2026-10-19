'use strict';
const {app,BrowserWindow,Menu,protocol,session,ipcMain,dialog,shell,powerMonitor}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {ORIGIN,CSP,localURL,gameURL,assetPath,externalURL,requestAllowed}=require('./policy.cjs');
const {MAX_SAVE_BYTES}=require('./game/js/widewake-sea-save.js');
const value=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
app.setName('Widewake');
app.setPath('userData',value('--profile')?path.resolve(value('--profile')):path.join(app.getPath('appData'),'Widewake'));
protocol.registerSchemesAsPrivileged([{scheme:'widewake',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,closing=false,allowClose=false,fileDialog=false;
const ownsProfile=app.requestSingleInstanceLock();
if(!ownsProfile)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
const trusted=event=>!!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&localURL(event.senderFrame.url);
const fail=error=>({status:'error',message:error instanceof Error?error.message:String(error)});
const openExternal=url=>{if(externalURL(url))shell.openExternal(url).catch(()=>{});};

// One narrow file operation per explicit picker. No filesystem API reaches the game.
ipcMain.handle('widewake:export',async(event,text)=>{
  if(!trusted(event)||fileDialog)return{status:'canceled'};
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_SAVE_BYTES)return fail('The save is too large to export.');
  let state;try{state=JSON.parse(text);}catch{return fail('The save could not be read.');}
  fileDialog=true;
  try{
    const day=Number.isInteger(state.day)&&state.day>0?state.day:1;
    const choice=await dialog.showSaveDialog(win,{title:'Export your fleet',defaultPath:'widewake-day-'+day+'.json',filters:[{name:'Widewake save',extensions:['json']}],properties:['showOverwriteConfirmation']});
    if(choice.canceled||!choice.filePath)return{status:'canceled'};
    await fs.writeFile(choice.filePath,text,{encoding:'utf8'});
    return{status:'saved',name:path.basename(choice.filePath)};
  }catch(error){return fail(error);}finally{fileDialog=false;}
});
ipcMain.handle('widewake:import',async event=>{
  if(!trusted(event)||fileDialog)return{status:'canceled'};
  fileDialog=true;
  try{
    const choice=await dialog.showOpenDialog(win,{title:'Import a fleet',filters:[{name:'Widewake save',extensions:['json']}],properties:['openFile']});
    if(choice.canceled||!choice.filePaths[0])return{status:'canceled'};
    const file=choice.filePaths[0],stat=await fs.stat(file);
    if(!stat.isFile()||stat.size>MAX_SAVE_BYTES)return fail('That file is too large to be a Widewake save.');
    return{status:'loaded',name:path.basename(file),text:await fs.readFile(file,'utf8')};
  }catch(error){return fail(error);}finally{fileDialog=false;}
});
ipcMain.on('widewake:quit',event=>{if(trusted(event))win.close();});
ipcMain.handle('widewake:fullscreen',event=>{if(!trusted(event))return false;const full=!win.isFullScreen();win.setFullScreen(full);return full;});

async function closeWithSave(event){
  if(allowClose)return;
  event.preventDefault();if(closing||fileDialog)return;closing=true;
  let timeout;
  try{
    // The game writes its current snapshot synchronously before the window closes.
    const saved=await Promise.race([win.webContents.executeJavaScript("(()=>{const e=new CustomEvent('widewake-before-close',{detail:{saved:null}});window.dispatchEvent(e);return e.detail.saved;})()"),new Promise((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Unresponsive game')),4000);})]);
    if(saved===false){
      const answer=await dialog.showMessageBox(win,{type:'warning',title:'The fleet could not be saved',message:'Return to the game to export your fleet before quitting.',buttons:['Return to game','Quit without saving'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1){closing=false;return;}
    }
    session.defaultSession.flushStorageData();allowClose=true;win.close();
  }catch{
    const answer=await dialog.showMessageBox(win,{type:'warning',title:'Widewake is not responding',message:'Unsaved progress may be lost if you quit.',buttons:['Keep open','Quit'],defaultId:0,cancelId:0,noLink:true});
    if(answer.response===1){allowClose=true;win.close();}else closing=false;
  }finally{clearTimeout(timeout);}
}

if(ownsProfile)app.whenReady().then(async()=>{
  const gameRoot=path.join(__dirname,'game'),manifest=JSON.parse(await fs.readFile(path.join(gameRoot,'asset-manifest.json'),'utf8')),files=new Set(Object.keys(manifest.files));
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.geojson':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  protocol.handle('widewake',async request=>{
    const name=assetPath(request.url,files);if(!name)return new Response('',{status:404});
    if(!['GET','HEAD'].includes(request.method))return new Response('',{status:405});
    try{return new Response(request.method==='HEAD'?null:await fs.readFile(path.join(gameRoot,name)),{headers:{'Content-Type':types[path.extname(name)]||'application/octet-stream','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}
  });
  const ses=session.defaultSession;
  ses.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!requestAllowed(details.url)}));
  ses.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win?.webContents&&permission==='fullscreen'&&localURL(contents.getURL())));
  ses.setPermissionCheckHandler((contents,permission,origin)=>contents===win?.webContents&&permission==='fullscreen'&&localURL(origin));
  // Exports use the bounded native picker. The game has no arbitrary downloads.
  ses.on('will-download',event=>event.preventDefault());
  Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([
    {label:'Widewake',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {role:'editMenu'},{label:'Window',submenu:[{role:'minimize'},{role:'togglefullscreen'}]}
  ]):null);
  win=new BrowserWindow({title:'Widewake',width:1440,height:900,minWidth:640,minHeight:360,useContentSize:true,show:false,backgroundColor:'#182d2b',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}});
  win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return{action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(!gameURL(url)){event.preventDefault();openExternal(url);}});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='F11'&&!input.isAutoRepeat){event.preventDefault();win.setFullScreen(!win.isFullScreen());}});
  const activity=active=>{if(!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('widewake:activity',active);};
  const syncActivity=()=>activity(win.isFocused()&&win.isVisible()&&!win.isMinimized());
  for(const event of ['enter-full-screen','leave-full-screen'])win.on(event,()=>{win.webContents.send('widewake:fullscreen',win.isFullScreen());syncActivity();});
  for(const event of ['blur','minimize','hide'])win.on(event,()=>activity(false));
  for(const event of ['focus','restore','show'])win.on(event,syncActivity);
  for(const event of ['suspend','lock-screen'])powerMonitor.on(event,()=>activity(false));
  for(const event of ['resume','unlock-screen'])powerMonitor.on(event,syncActivity);
  win.on('close',closeWithSave);
  win.once('ready-to-show',()=>win.show());
  await win.loadURL(ORIGIN+'/widewake.html'+(process.argv.includes('--test')?'?test':''));
}).catch(error=>{dialog.showErrorBox('Widewake could not open',error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
