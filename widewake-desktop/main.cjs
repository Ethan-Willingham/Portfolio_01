'use strict';
const {app,BrowserWindow,Menu,protocol,session,ipcMain,dialog,shell,powerMonitor}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {ORIGIN,CSP,localURL,gameURL,assetPath,externalURL,requestAllowed}=require('./policy.cjs');
const value=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
app.setName('Widewake');
app.setPath('userData',value('--profile')?path.resolve(value('--profile')):path.join(app.getPath('appData'),'Widewake'));
protocol.registerSchemesAsPrivileged([{scheme:'widewake',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win;
const ownsProfile=app.requestSingleInstanceLock();
if(!ownsProfile)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
const trusted=event=>!!win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&localURL(event.senderFrame.url);
const openExternal=url=>{if(externalURL(url))shell.openExternal(url).catch(()=>{});};

ipcMain.on('widewake:quit',event=>{if(trusted(event))win.close();});
ipcMain.handle('widewake:fullscreen',event=>{if(!trusted(event))return false;const full=!win.isFullScreen();win.setFullScreen(full);return full;});

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
  // The game has no downloads.
  ses.on('will-download',event=>event.preventDefault());
  Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([
    {label:'Widewake',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {role:'editMenu'},{label:'Window',submenu:[{role:'minimize'},{role:'togglefullscreen'}]}
  ]):null);
  win=new BrowserWindow({title:'Widewake',width:1440,height:900,minWidth:640,minHeight:360,useContentSize:true,show:false,backgroundColor:'#101627',autoHideMenuBar:true,
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
  win.once('ready-to-show',()=>win.show());
  await win.loadURL(ORIGIN+'/widewake.html'+(process.argv.includes('--test')?'?test':''));
}).catch(error=>{dialog.showErrorBox('Widewake could not open',error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
