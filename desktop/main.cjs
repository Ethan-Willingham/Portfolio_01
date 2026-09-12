const {app,BrowserWindow,Menu,protocol,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
protocol.registerSchemesAsPrivileged([{scheme:'sluice',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const value=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const auditURL=value('--audit-url');
if(auditURL&&(app.isPackaged||new URL(auditURL).hostname!=='127.0.0.1'||new URL(auditURL).protocol!=='http:'))throw Error('Audit URL must be a local development server');
app.setName('Sluice');
app.setPath('userData',value('--profile')?path.resolve(value('--profile')):path.join(app.getPath('appData'),'Sluice'));
let win;
app.whenReady().then(()=>{
  const stage=path.join(__dirname,'stage');
  protocol.handle('sluice',async request=>{
    const url=new URL(request.url);
    let file;
    try{file=path.resolve(stage,'.'+decodeURIComponent(url.pathname));}catch{return new Response('',{status:400});}
    if(url.hostname!=='app'||!file.startsWith(stage+path.sep))return new Response('',{status:403});
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('',{status:405});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
      '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
      '.woff':'font/woff','.woff2':'font/woff2','.m4a':'audio/mp4'};
    try{return new Response(request.method==='HEAD'?null:await fs.readFile(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});}
    catch{return new Response('',{status:404});}
  });
  const origin=auditURL?new URL(auditURL).origin:'sluice://app';
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    const allowed=details.url.startsWith(origin+'/')||/^(data|blob):/.test(details.url);
    callback({cancel:!allowed});
  });
  session.defaultSession.setPermissionRequestHandler((_contents,permission,callback)=>callback(permission==='fullscreen'));
  session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,
    'Content-Security-Policy':["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'"]}}));
  Menu.setApplicationMenu(null);
  win=new BrowserWindow({title:'Sluice',width:1440,height:900,useContentSize:true,show:false,
    fullscreen:process.argv.includes('--fullscreen'),backgroundColor:'#0d0a04',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.key==='F11'){event.preventDefault();win.setFullScreen(!win.isFullScreen());}
  });
  win.once('ready-to-show',()=>win.show());
  win.loadURL(auditURL||'sluice://app/grand-motherload.html');
});
app.on('window-all-closed',()=>app.quit());
