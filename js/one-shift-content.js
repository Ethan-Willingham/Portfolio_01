(function(root){'use strict';const O=root.OneShift;
 O.terms=[
 {term:'OS&D',definition:'Over, short and damaged: differences noted on the delivery receipt.'},
 {term:'SSCC',definition:'The 18-digit serial number identifying one logistics unit.'},
 {term:'Bill of lading',definition:'The carrier document identifying the shipper, consignee and freight.'},
 {term:'FIFO',definition:'First in, first out: use the oldest received available stock first.'},
 {term:'FEFO',definition:'First expired, first out: use stock with the earliest best-by date first.'},
 {term:'Detention',definition:'The carrier charge for waiting beyond the agreed free time.'},
 {term:'Cross-dock',definition:'Transfer freight from receiving to shipping without putting it into storage.'},
 {term:'Kanban',definition:'A signal to replenish what the next operation has used.'},
 {term:'TI-HI',definition:'Cases in one layer, then the number of layers on a full pallet.'},
 {term:'Putaway',definition:'Move received goods from the staging lane into their storage positions.'}
 ];
 O.situations=[
 {id:'seal',title:'Seal mismatch',text:'The seal differs from the paperwork. Refuse the load until the client resolves it.',effect:'seal',source:'gs1',frequency:'rare, game balance'},
 {id:'late',title:'Carrier delayed',text:'A truck will arrive 45 minutes late.',effect:'late',source:'freight',frequency:'occasional, game balance'},
 {id:'early',title:'Early arrival',text:'A carrier is half an hour early.',effect:'early',source:'freight',frequency:'occasional, game balance'},
 {id:'damage',title:'Crushed corner',text:'One incoming pallet has damaged cases. Record the damage and hold it.',effect:'damage',source:'gs1',frequency:'occasional, game balance'},
 {id:'recall',title:'Lot recall',text:'The client has asked you to hold one lot. It is unavailable for shipping.',effect:'hold',source:'gs1',frequency:'rare, game balance'},
 {id:'outage',title:'Power outage',text:'Use the hand jack while the power is off.',effect:'outage',source:'safety',frequency:'rare, game balance'},
 {id:'battery',title:'Low battery',text:'The forklift needs a charge during this shift.',effect:'battery',source:'safety',frequency:'occasional, game balance',requires:'forklift'},
 {id:'rush',title:'Earlier pickup',text:'An outbound driver has an earlier departure time.',effect:'rush',source:'freight',frequency:'occasional, game balance'},
 {id:'breakdown',title:'Line stopped',text:'Maintenance needs a minute to restore the machine.',effect:'breakdown',source:'production',frequency:'occasional, game balance',requires:'assembly'},
 {id:'bonus',title:'Flexible appointment',text:'A client pays a small fee for fitting a truck into your schedule.',effect:'bonus',source:'rates',frequency:'occasional, game balance'}
 ];
})(typeof globalThis!=='undefined'?globalThis:window);
