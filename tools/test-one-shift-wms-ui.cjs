'use strict';
// DOM presentation contract only. Mock snapshots exercise views and commands;
// the production WMS, scanner rays and physical inventory have separate tests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.SHIFT_WMS_UI_DUMP||path.join(os.tmpdir(),'warehouse-v10-wms-ui');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((request,response)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(request.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  try{response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}
  catch{response.writeHead(404).end();}
});
const sample={revision:1,mode:'sandbox',facility:'LATCHFORD / MAIN',message:'Ready. Choose a document or floor task.',severity:'info',scan:{code:'',label:'',status:'ready',sequence:0},workflow:{tile:'home',step:'',title:'',instruction:'',orderId:'',sourceBin:'',destinationBin:'',cartonId:'',completed:0,total:0,canConfirm:false,confirmLabel:''},
  items:[
    {id:'TAPE-48',sku:'TAPE-48',name:'Packing tape',description:'Clear packing tape / 48 mm',uom:'CTN',unitsPerCarton:36,onHand:12,available:9,reserved:3,picked:0,inReceiving:2},
    {id:'TOWL-BL',sku:'TOWL-BL',name:'Shop towels',description:'Blue workshop towels',uom:'CTN',unitsPerCarton:12,onHand:8,available:6,reserved:0,picked:2,inReceiving:0},
    {id:'GLOVE-M',sku:'GLOVE-M',name:'Work gloves',description:'Nitrile grip / medium',uom:'CTN',unitsPerCarton:24,onHand:6,available:6,reserved:0,picked:0,inReceiving:0},
    {id:'LABEL-4',sku:'LABEL-4',name:'Shipping labels',description:'Direct thermal labels',uom:'CTN',unitsPerCarton:8,onHand:4,available:4,reserved:0,picked:0,inReceiving:0}
  ],
  bins:[
    {id:'A01-01-01',name:'Aisle A / bay 01 / ground',kind:'Storage',capacity:12,onHand:10,available:7,canPick:true},
    {id:'A01-02-01',name:'Aisle A / bay 02 / ground',kind:'Storage',capacity:12,onHand:6,available:6,canPick:true},
    {id:'REC-01',name:'Front receiving',kind:'Receiving',capacity:12,onHand:2,available:0,canPick:false},
    {id:'STG-01',name:'Outbound staging',kind:'Stage',capacity:12,onHand:2,available:0,canPick:false},
    {id:'VAN-01',name:'Collection van',kind:'Dispatch',capacity:12,onHand:0,available:0,canPick:false}
  ],
  cartons:[
    {id:'CTN-000001',sku:'TAPE-48',itemName:'Packing tape',binId:'A01-01-01',physicalBin:'A01-01-01',status:'Reserved',poId:'PO-1000',soId:'SO-2001',quantity:1,uom:'CTN'},
    {id:'CTN-000002',sku:'TAPE-48',itemName:'Packing tape',binId:'REC-01',physicalBin:'REC-01',status:'Available',poId:'PO-1001',soId:'',quantity:1,uom:'CTN'},
    {id:'CTN-000003',sku:'TOWL-BL',itemName:'Shop towels',binId:'STG-01',physicalBin:'STG-01',status:'Picked',poId:'PO-1000',soId:'SO-2002',quantity:1,uom:'CTN'}
  ],
  purchaseOrders:[
    {id:'PO-1001',partner:'Bracken Trade Supplies',status:'Receiving',reference:'Weekly replenishment',canBook:false,canReceive:true,lines:[{sku:'TAPE-48',itemName:'Packing tape',ordered:6,received:2}]},
    {id:'PO-1002',partner:'Northline Paper Supply',status:'Open',reference:'Workshop consumables',canBook:true,canReceive:false,lines:[{sku:'TOWL-BL',itemName:'Shop towels',ordered:4,received:0},{sku:'LABEL-4',itemName:'Shipping labels',ordered:2,received:0}]}
  ],
  salesOrders:[
    {id:'SO-2001',partner:'Miller Motor Works',status:'Released',reference:'MMW / 0842',canRelease:false,canPick:true,canShip:false,canCancel:true,lines:[{sku:'TAPE-48',itemName:'Packing tape',ordered:3,allocated:3,picked:0,loaded:0,shipped:0}]},
    {id:'SO-2002',partner:'Parkside Service',status:'Picked',reference:'Counter replenishment',amount:180,canRelease:false,canPick:false,canShip:true,canCancel:false,lines:[{sku:'TOWL-BL',itemName:'Shop towels',ordered:2,allocated:2,picked:2,loaded:0,shipped:0}]},
    {id:'SO-2003',partner:'Westbank Repairs',status:'Open',reference:'Trial order',amount:220,canRelease:true,canPick:false,canShip:false,canCancel:true,lines:[{sku:'GLOVE-M',itemName:'Work gloves',ordered:2,allocated:0,picked:0,loaded:0,shipped:0}]}
  ],
  transactions:[{id:'000041',time:'09:24',type:'Receive',sku:'TAPE-48',cartonId:'CTN-000002',quantity:1,fromBin:'',toBin:'REC-01',document:'PO-1001'},{id:'000042',time:'09:25',type:'Pick',sku:'TOWL-BL',cartonId:'CTN-000003',quantity:1,fromBin:'A01-02-01',toBin:'STG-01',document:'SO-2002'}],
  tasks:[{id:'PICK-001',type:'Pick',orderId:'SO-2001',sku:'TAPE-48',sourceBin:'A01-01-01',destinationBin:'STG-01',quantity:3,status:'Ready'}],exceptions:[]};
let browser,page;
const checks=[],errors=[];
function check(name,value){assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,channel:process.env.SHIFT_BROWSER_CHANNEL||'chrome'});
  page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/one-shift.html');
  if(!await page.evaluate(()=>!!window.WarehouseWmsUI))await page.addScriptTag({url:'/js/one-shift-wms.js'});
  await page.addStyleTag({url:'/one-shift-wms.css'});
  await page.evaluate(snapshot=>{
    window.wmsCommands=[];window.wmsPresentation=[];window.wmsMock=structuredClone(snapshot);
    WarehouseWmsUI.init({command:(action,id)=>wmsCommands.push({action,id}),deviceFocus:value=>wmsPresentation.push(value),closeDevice:()=>wmsPresentation.push('stow')});
    WarehouseWmsUI.receive(wmsMock);document.getElementById('warehouse-computer').showModal();WarehouseWmsUI.showConsole(true);
  },sample);
  check('WMS opens as an office desktop application',await page.locator('#warehouse-wms-console').isVisible());
  check('Operations has actual stock totals and open documents',(await page.locator('#warehouse-wms-console-body').innerText()).includes('30')&&await page.locator('[data-wms-detail="purchaseOrders:PO-1001"]').count()===1);
  check('Overview gives a useful next action in plain language',(await page.locator('.wms-next-action').innerText()).includes('Receive the delivery'));
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,'office-operations.png')});
  await page.locator('[data-wms-page="inventory"]').click();
  check('Inventory columns distinguish on-hand, available, allocated and picked',(await page.locator('.wms-table thead').innerText()).includes('Allocated')&&await page.locator('.wms-table tbody tr').count()===4);
  await page.locator('#warehouse-wms-search').fill('tape');await page.waitForTimeout(150);
  check('Inventory search filters real item records',await page.locator('.wms-table tbody tr').count()===1);
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.message='Stock updated';WarehouseWmsUI.receive(wmsMock);});
  check('Authoritative refresh preserves focused search and its text',await page.locator('#warehouse-wms-search').inputValue()==='tape'&&await page.locator('#warehouse-wms-search').evaluate(el=>el===document.activeElement));
  await page.locator('[data-wms-detail="inventory:TAPE-48"]').click();
  check('Item drilldown shows pack size and exact carton locations',(await page.locator('#warehouse-wms-console-body').innerText()).includes('36')&&(await page.locator('#warehouse-wms-console-body').innerText()).includes('CTN-000001'));
  await page.screenshot({path:path.join(output,'office-item-detail.png')});
  await page.locator('[data-wms-page="bins"]').click();
  check('Receiving, staging and rack locations share the bin master',await page.locator('.wms-table tbody tr').count()===5&&(await page.locator('.wms-table').innerText()).includes('STG-01'));
  await page.locator('[data-wms-detail="bins:REC-01"]').click();
  check('Bin detail shows physical and recorded locations',(await page.locator('.wms-table thead').innerText()).includes('Actual location')&&(await page.locator('.wms-table').innerText()).includes('CTN-000002'));
  await page.locator('[data-wms-page="purchaseOrders"]').click();
  await page.locator('[data-wms-detail="purchaseOrders:PO-1002"]').click();
  await page.locator('[data-wms-command="book-po"]').click();
  check('Booking a PO sends its document ID without inventing inventory',(await page.evaluate(()=>wmsCommands.at(-1))).id==='PO-1002'&&await page.locator('.wms-document-actions button').filter({hasText:'Receive on handheld'}).isDisabled());
  await page.locator('[data-wms-page="salesOrders"]').click();
  await page.locator('[data-wms-detail="salesOrders:SO-2003"]').click();
  await page.locator('[data-wms-command="release-order"]').click();
  check('Manager release sends the selected SO to the authoritative ledger',(await page.evaluate(()=>wmsCommands.at(-1))).action==='release-order'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='SO-2003');
  check('SO detail retains allocation, pick, loaded and shipped quantities',(await page.locator('.wms-table thead').first().innerText()).includes('Loaded')&&(await page.locator('.wms-table thead').first().innerText()).includes('Shipped'));
  check('Unavailable pick and ship actions explain their requirements',await page.getByRole('button',{name:'Pick on handheld',exact:true}).isDisabled()&&await page.getByRole('button',{name:'Ship on handheld',exact:true}).isDisabled()&&(await page.getByRole('button',{name:'Ship on handheld',exact:true}).getAttribute('title')).includes('staging'));
  check('Document value is displayed with the live order amount',(await page.locator('.wms-document-info').innerText()).includes('$220'));
  await page.screenshot({path:path.join(output,'office-sales-order.png')});
  await page.locator('[data-wms-command="cancel-order"]').click();
  check('Cancel allocation is a separate explicit manager command',(await page.evaluate(()=>wmsCommands.at(-1))).action==='cancel-order');
  await page.locator('[data-wms-page="salesOrders"]').click();
  await page.locator('[data-wms-detail="salesOrders:SO-2002"]').click();
  await page.getByRole('button',{name:'Review shipment on handheld',exact:true}).click();
  check('A picked shipment opens its floor workflow without dispatching the van',(await page.evaluate(()=>wmsCommands.at(-1))).action==='ship-order'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='SO-2002');
  await page.locator('[data-wms-page="tasks"]').click();
  check('Work queue exposes item, source and destination bins',(await page.locator('.wms-table').innerText()).includes('A01-01-01')&&(await page.locator('.wms-table').innerText()).includes('STG-01'));
  await page.locator('[data-wms-page="transactions"]').click();
  check('Transactions retain document and carton references',(await page.locator('.wms-table').innerText()).includes('CTN-000003')&&(await page.locator('.wms-table').innerText()).includes('SO-2002'));
  await page.locator('.wms-sort').filter({hasText:'Sequence'}).click();
  check('Table sorting exposes its active direction',await page.locator('th[aria-sort="ascending"]').count()===1);
  await page.locator('[data-wms-page="purchaseOrders"]').click();await page.locator('[data-wms-create="purchaseOrders"]').click();
  await page.locator('#warehouse-wms-create-item').selectOption('LABEL-4');await page.locator('#warehouse-wms-create-quantity').fill('3');
  await page.screenshot({path:path.join(output,'office-create-po.png')});
  await page.getByRole('button',{name:'Create purchase order',exact:true}).click();
  check('New POs submit only an existing SKU and a whole carton quantity',(await page.evaluate(()=>wmsCommands.at(-1))).action==='create-po'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='LABEL-4:3');
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.purchaseOrders.push({id:'PO-1003',partner:'Northline Paper Supply',status:'Open',amount:96,canBook:true,canReceive:false,lines:[{sku:'LABEL-4',ordered:3,received:0}]});WarehouseWmsUI.receive(wmsMock);});
  check('A new PO opens only after its authoritative document arrives',await page.locator('[data-wms-command="book-po"][data-wms-id="PO-1003"]').isVisible()&&(await page.locator('.wms-document-info').innerText()).includes('$96'));
  await page.locator('[data-wms-page="salesOrders"]').click();await page.locator('[data-wms-create="salesOrders"]').click();
  await page.locator('#warehouse-wms-create-item').selectOption('GLOVE-M');await page.locator('#warehouse-wms-create-quantity').fill('2');
  await page.getByRole('button',{name:'Create sales order',exact:true}).click();
  check('New SO creation is separate from stock allocation',(await page.evaluate(()=>wmsCommands.at(-1))).action==='create-so'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='GLOVE-M:2');
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.message='Document could not be created.';WarehouseWmsUI.receive(wmsMock);});
  check('A rejected creation keeps the inputs available for correction',await page.locator('#warehouse-wms-create-quantity').inputValue()==='2'&&await page.getByRole('button',{name:'Create sales order',exact:true}).isEnabled());
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.mode='career';wmsMock.completedOrders=0;wmsMock.purchaseOrders.pop();WarehouseWmsUI.receive(wmsMock);});
  await page.locator('[data-wms-page="purchaseOrders"]').click();
  check('New career documents unlock after the first completed shipment',await page.locator('[data-wms-create="purchaseOrders"]').isDisabled());
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.completedOrders=1;WarehouseWmsUI.receive(wmsMock);});
  check('Completed career shipment unlocks new catalog documents',await page.locator('[data-wms-create="purchaseOrders"]').isEnabled());
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.mode='sandbox';WarehouseWmsUI.receive(wmsMock);});
  await page.evaluate(()=>{document.getElementById('warehouse-computer').close();document.getElementById('warehouse-launcher').hidden=true;document.getElementById('warehouse-canvas').hidden=false;WarehouseWmsUI.setPresentation({consoleOpen:false,handheldOpen:true,handheldInteractive:true,active:true});});
  check('TC22 has all five requested workflow tiles',await page.locator('[data-wms-tile]').count()===5);
  check('The scan aimer is hidden while choosing touchscreen work',await page.locator('#warehouse-wms-reticle').isHidden());
  await page.screenshot({path:path.join(output,'handheld-home.png')});
  await page.locator('[data-wms-tile="transfer"]').click();
  check('Selecting a handheld task requests a workflow instead of editing stock',(await page.evaluate(()=>wmsCommands.at(-1))).action==='workflow'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='transfer');
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.workflow={tile:'transfer',step:'destination',title:'Scan destination bin',instruction:'Carry CTN-000002 to A01-02-01. Set it down, then scan the bin label.',sourceBin:'REC-01',destinationBin:'A01-02-01',cartonId:'CTN-000002',completed:0,total:1,canConfirm:false};WarehouseWmsUI.receive(wmsMock);});
  check('Active task shows one instruction and the exact carton/bin references',(await page.locator('#warehouse-wms-device-body').innerText()).includes('CTN-000002')&&(await page.locator('#warehouse-wms-device-body').innerText()).includes('A01-02-01'));
  await page.locator('[data-device-floor]').click();
  check('Return to scanning requests world-control ownership',await page.evaluate(()=>wmsPresentation.at(-1)===false));
  await page.evaluate(()=>WarehouseWmsUI.setPresentation({handheldInteractive:false}));
  check('Scanning uses the physical device without a duplicate HTML screen',await page.locator('#warehouse-wms-handheld').isHidden()&&await page.locator('#warehouse-wms-handheld').evaluate(el=>el.inert));
  check('Floor scanning has a visible centered barcode aimer',await page.locator('#warehouse-wms-reticle').isVisible()&&await page.locator('#warehouse-wms-reticle').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<1&&Math.abs(r.y+r.height/2-innerHeight/2)<1;}));
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.scan={sequence:1,code:'A01-02-01',label:'Storage / Aisle A',status:'success'};wmsMock.message='Destination read. Put the carton down in this bin.';wmsMock.severity='success';WarehouseWmsUI.receive(wmsMock);WarehouseWmsUI.setPresentation({handheldInteractive:true});});
  check('Scanner feedback displays the authoritative decoded label',(await page.locator('#warehouse-wms-scan-result').innerText()).includes('A01-02-01')&&(await page.locator('#warehouse-wms-scan-result').innerText()).toLowerCase().includes('read confirmed'));
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.workflow.canConfirm=true;WarehouseWmsUI.receive(wmsMock);});
  check('A physically ready task exposes a confirmation without posting it',await page.locator('.wms-device-confirm').count()===1&&(await page.evaluate(()=>wmsCommands.at(-1))).action==='workflow');
  await page.screenshot({path:path.join(output,'handheld-transfer-scan.png')});
  await page.evaluate(()=>{wmsMock.revision++;wmsMock.workflow={tile:'lookup'};wmsMock.scan={sequence:2,code:'CARTON:CTN-000001',label:'Packing tape',status:'success'};WarehouseWmsUI.receive(wmsMock);});
  check('Item lookup resolves carton IDs into item, stock and bin information',(await page.locator('#warehouse-wms-device-body').innerText()).includes('Packing tape')&&(await page.locator('#warehouse-wms-device-body').innerText()).includes('A01-01-01'));
  await page.evaluate(()=>{WarehouseWmsUI.setPresentation({active:false});});
  check('Browser inactivity hides the handheld presentation',await page.locator('#warehouse-wms-handheld').isHidden());
  check('The scan aimer respects browser inactivity',await page.locator('#warehouse-wms-reticle').isHidden());
  await page.evaluate(()=>{WarehouseWmsUI.setPresentation({active:true,handheldInteractive:true});wmsMock.revision++;wmsMock.workflow={tile:'receive',orderId:''};WarehouseWmsUI.receive(wmsMock);});
  check('Receive tile lists open POs with partner and quantity',await page.locator('.wms-device-order').count()===2&&(await page.locator('#warehouse-wms-device-body').innerText()).includes('Bracken Trade Supplies'));
  await page.locator('.wms-device-order').first().click();
  check('Receive selection identifies the exact PO',(await page.evaluate(()=>wmsCommands.at(-1))).action==='receive-order'&&(await page.evaluate(()=>wmsCommands.at(-1))).id==='PO-1001');
  await page.setViewportSize({width:900,height:500});
  await page.screenshot({path:path.join(output,'handheld-compact.png')});
  check('Compact handheld remains inside the active landscape viewport',await page.locator('#warehouse-wms-handheld').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}));
  await page.evaluate(()=>{WarehouseWmsUI.setPresentation({handheldOpen:false});document.getElementById('warehouse-computer').showModal();WarehouseWmsUI.focusConsole('inventory');});
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,'office-compact.png')});
  check('Compact office keeps its navigation and scrollable table visible',await page.locator('[data-wms-page="inventory"]').isVisible()&&await page.locator('.wms-table-wrap').isVisible());
  check('No UI runtime errors occurred',errors.length===0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,errors,scope:'Mock snapshot DOM and command contract; no Unity or physical inventory assertions.'},null,2));
  console.log(checks.length+' WMS UI checks passed. Captures: '+output);
})().catch(async error=>{console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}).finally(async()=>{if(browser)await browser.close();server.close();});
