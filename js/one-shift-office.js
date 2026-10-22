(function (root) {
  'use strict';
  const O = root.OneShift;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const titles = {purchases:'Purchase orders', orders:'Customer orders', equipment:'Equipment catalog', ledger:'Warehouse ledger'};
  const button = (label, action, attrs = '', primary = false) => '<button data-paper-action="'+action+'" '+attrs+(primary?' class="primary"':'')+'>'+label+'</button>';
  const money = value => O.price(value);

  class OfficePapers {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.kind = 'purchases';
      this.item = 'lantern';
      this.count = 16;
      this.review = null;
      this.receipt = null;
      this.message = '';
      this.element = document.createElement('section');
      this.element.id = 'shift-office-papers';
      this.element.hidden = true;
      this.element.setAttribute('role', 'dialog');
      this.element.setAttribute('aria-modal', 'true');
      this.element.setAttribute('aria-labelledby', 'office-paper-title');
      this.element.innerHTML = '<div class="office-paper-sheet"><header class="office-paper-header"><div><span class="office-paper-eyebrow">ONE SHIFT / OFFICE COPY</span><h2 id="office-paper-title"></h2></div>'+button('Back to desk','close')+'</header><p class="office-paper-message" role="status" aria-live="polite" hidden></p><div class="office-paper-body"></div></div>';
      document.getElementById('shift-game').append(this.element);
      this.body = this.element.querySelector('.office-paper-body');
      this.element.addEventListener('click', event => {
        event.stopPropagation();
        const node = event.target.closest('[data-paper-action]');
        if (node) this.act(node);
      });
      this.element.addEventListener('change', event => {
        event.stopPropagation();
        if (event.target.id === 'office-purchase-product') {
          this.item = event.target.value; this.review = null; this.receipt = null; this.message = ''; this.update(true);
        }
      });
      this.element.addEventListener('keydown', event => this.key(event));
    }

    open(kind = 'purchases') {
      if (!titles[kind] || this.app.rotated || this.app.hidden) return;
      if (!this.visible) {
        this.returnFocus = document.activeElement;
        this.inertNodes = [...document.getElementById('shift-game').children].filter(node => node !== this.element && node.id !== 'shift-rotate' && !node.inert);
        this.inertNodes.forEach(node => { node.inert = true; });
      }
      this.kind = kind;
      this.visible = true;
      this.app.officePause = true;
      this.review = null;
      this.receipt = null;
      this.message = '';
      this.element.hidden = false;
      this.element.dataset.paper = kind;
      this.element.querySelector('h2').textContent = titles[kind];
      this.app.scenes?.suspend();
      this.app.audio?.unlock();
      this.update(true);
      this.element.querySelector('[data-paper-action="close"]').focus({preventScroll:true});
    }

    close() {
      if (!this.visible) return;
      this.visible = false;
      this.element.hidden = true;
      this.app.officePause = false;
      (this.inertNodes || []).forEach(node => { node.inert = false; });
      this.inertNodes = [];
      if (this.returnFocus?.isConnected && !this.returnFocus.closest('[hidden]')) this.returnFocus.focus({preventScroll:true});
      this.app.ui.update();
    }

    key(event) {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...this.element.querySelectorAll('button:not(:disabled),select,input,a[href]')].filter(node => node.getClientRects().length);
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    }

    update(force = false) {
      if (!this.visible) return;
      const s = this.app.sim.s;
      if (!O.business(s)) { this.close(); return; }
      if (!O.unlockedGoods(s).includes(this.item)) this.item = O.unlockedGoods(s)[0];
      const html = this[this.kind+'HTML']();
      if (force || this.html !== html) {
        const active = this.body.contains(document.activeElement) ? document.activeElement : null;
        const identity = active && {id:active.id, action:active.dataset.paperAction, target:active.dataset.id, count:active.dataset.count};
        const scroll = this.element.querySelector('.office-paper-sheet').scrollTop;
        this.html = html;
        this.body.innerHTML = html;
        if (identity) {
          const match = [...this.body.querySelectorAll('button,select,input')].find(node => identity.id ? node.id === identity.id : node.dataset.paperAction === identity.action && node.dataset.id === identity.target && node.dataset.count === identity.count);
          (match || this.body.querySelector('button:not(:disabled),select,input') || this.element.querySelector('[data-paper-action="close"]')).focus({preventScroll:true});
        }
        this.element.querySelector('.office-paper-sheet').scrollTop = scroll;
      }
      const status = this.element.querySelector('.office-paper-message');
      status.textContent = this.message;
      status.hidden = !this.message;
    }

    arrival(quote) {
      const s = this.app.sim.s, nextDay = s.phase === 'evening' || s.minute+quote.lead >= s.shiftEnd-20;
      return 'Day '+(s.day+Number(nextDay))+' / '+O.time(nextDay ? 480+quote.lead : s.minute+quote.lead);
    }

    purchaseStatus(purchase) {
      const sim = this.app.sim, truck = sim.t.get(purchase.truck);
      if (purchase.stored) return 'Received and put away';
      const stored = purchase.pallets.filter(id => (purchase.received || []).includes(id) || sim.p.get(id)?.place === 'storage').length;
      if (stored) return stored+' / '+purchase.pallets.length+' pallets put away';
      if (truck?.status === 'docked') return 'At the dock. Scan, unload and put away.';
      if (truck?.status === 'arriving' || truck?.status === 'yard') return 'Arriving at the warehouse';
      if (truck?.status === 'gone') return 'Unloaded. Finish putting stock away.';
      return truck ? 'Due day '+(truck.deliveryDay || sim.s.day)+' / '+O.time(truck.arrival) : 'Awaiting putaway';
    }

    purchasesHTML() {
      const sim = this.app.sim, s = sim.s, q = sim.restockQuote(this.item,this.count), stock = sim.businessStock(this.item), capacity = sim.businessCapacity();
      const receipt = s.commerce.purchases.find(p => p.id === this.receipt);
      let html = '<div class="office-paper-meta"><span>DAY '+s.day+'</span><span>CASH '+money(s.cash)+'</span><span>'+capacity.free+' rack position'+(capacity.free===1?'':'s')+' free</span></div>';
      if (receipt) {
        html += '<section class="office-purchase-receipt"><span class="office-paper-stamp">ORDER PLACED</span><h3>PO '+receipt.id+'</h3><p>'+receipt.count+' cases of '+esc(O.catalog[receipt.item].name.toLowerCase())+'</p><dl class="office-paper-totals"><dt>Total paid</dt><dd>'+money(receipt.cost)+'</dd><dt>Status</dt><dd>'+esc(this.purchaseStatus(receipt))+'</dd></dl><p>The delivery still needs your scan, unload and putaway.</p><div class="office-paper-actions">'+button('Write another order','new-purchase')+button('Go to Receiving','receiving')+'</div></section>';
      } else if (this.review) {
        html += '<section class="office-purchase-review"><span class="office-paper-eyebrow">PURCHASE ORDER / DRAFT</span><h3>Review your order</h3><p>'+this.count+' cases of '+esc(O.catalog[this.item].name.toLowerCase())+'</p>'+this.quoteHTML(q)+'<p class="office-paper-note">Placing this order charges the total and reserves '+q.slots+' rack position'+(q.slots===1?'':'s')+'. You will receive the stock at the dock.</p><div class="office-paper-actions">'+button('Edit draft','edit-purchase')+button('Place order / '+money(q.cost),'place-purchase',q.reason?'disabled':'',true)+'</div>'+(q.reason?'<p class="office-paper-reason">'+esc(q.reason)+'</p>':'')+'</section>';
      } else {
        html += '<section class="office-purchase-draft"><span class="office-paper-eyebrow">SUPPLIER ORDER PAD</span><label for="office-purchase-product">Product</label><select id="office-purchase-product">'+O.unlockedGoods(s).map(id=>'<option value="'+id+'" '+(id===this.item?'selected':'')+'>'+esc(O.catalog[id].name)+'</option>').join('')+'</select><div class="office-stock-counts"><span><strong>'+stock.free+'</strong> cases available</span><span><strong>'+stock.incoming+'</strong> incoming or awaiting putaway</span></div><fieldset><legend>Order quantity</legend><div class="office-paper-quantity">'+[8,16,32].map(n=>button(n+' cases','quantity','data-count="'+n+'" aria-pressed="'+(this.count===n)+'"')).join('')+'</div></fieldset>'+this.quoteHTML(q)+(q.reason?'<p class="office-paper-reason">'+esc(q.reason)+'</p>':'')+button('Review purchase order','review-purchase',q.reason?'disabled':'',true)+'</section>';
      }
      const recent = s.commerce.purchases.slice(-8).reverse();
      if (recent.length) html += '<details class="office-purchase-history" '+(receipt?'':'open')+'><summary>Recent purchase orders</summary>'+recent.map(p=>'<article><header><strong>PO '+p.id+' / '+esc(O.catalog[p.item].name)+'</strong><span>'+money(p.cost)+'</span></header><p>'+p.count+' cases / '+esc(this.purchaseStatus(p))+'</p></article>').join('')+'</details>';
      return html;
    }

    quoteHTML(q) {
      if (!Number.isFinite(q.cost)) return '<p class="office-paper-reason">'+esc(q.reason || 'Choose available stock.')+'</p>';
      return '<dl class="office-paper-totals"><dt>'+this.count+' cases at '+money(q.unitCost)+'</dt><dd>'+money(q.cost-600)+'</dd><dt>Delivery</dt><dd>'+money(600)+'</dd><dt class="office-total">Order total</dt><dd class="office-total">'+money(q.cost)+'</dd><dt>Expected arrival</dt><dd>'+this.arrival(q)+'</dd>'+(q.credit?'<dt>Uses available credit</dt><dd>'+money(q.credit)+'</dd>':'')+'</dl>';
    }

    ordersHTML() {
      const sim = this.app.sim, s = sim.s;
      const orders = s.commerce.orders.filter(order => ['offered','queued'].includes(order.status));
      let html = '<div class="office-paper-meta"><span>DAY '+s.day+'</span><span>'+orders.length+' open orders</span><span>'+s.commerce.completed+' orders shipped</span></div><p class="office-paper-note">Accept an order to reserve its cases. Every pick, wrap and load is yours to complete.</p>';
      if (!orders.length) {
        const next = s.commerce.orders.find(order => order.status === 'future');
        html += '<p class="office-paper-empty">'+(next?'The next customer request is due at '+O.time(next.arrival)+'.':'The in-tray is clear.')+'</p>';
      }
      for (const order of orders) {
        const total = order.lines.reduce((n,line)=>n+line.cases,0), picked = order.allocations.reduce((n,line)=>n+(line.collected?line.count:0),0);
        const ready = order.lines.every(line=>sim.businessStock(line.item).free>=line.cases), truck = sim.t.get(order.truck);
        html += '<article class="office-order" data-paper-order="'+order.id+'"><header><div><span class="office-paper-eyebrow">ORDER '+order.id+' / '+(order.status==='queued'?'ACCEPTED':'REQUEST')+'</span><h3>'+esc(order.customer)+'</h3></div><strong>'+money(order.lines.reduce((n,line)=>n+line.cases*line.price,0))+'</strong></header><ul>'+order.lines.map(line=>'<li><span>'+line.cases+' '+esc(O.catalog[line.item].name.toLowerCase())+' cases</span><span>'+money(line.price)+' / case</span></li>').join('')+'</ul><p>Dispatch by '+O.time(order.due)+'.'+(order.rush?' Rush order.':'')+'</p><div class="office-paper-actions">';
        if (order.status === 'offered') html += button('Accept order','accept-order','data-id="'+order.id+'" '+(!ready?'disabled':''),true)+(!ready?'<span class="office-paper-reason">Put away the required stock first.</span>':'');
        else html += '<span>'+picked+' / '+total+' cases picked</span>'+button(picked<total?'Go pick this order':'Go to Shipping',picked<total?'pick-order':'ship-order','data-id="'+order.id+'"',true)+button('Cancel order','cancel-order','data-id="'+order.id+'" '+(truck?.loaded.length?'disabled':''));
        html += '</div></article>';
      }
      return html;
    }

    equipmentHTML() {
      const s = this.app.sim.s;
      const descriptions = {rack:'Two more lower pallet positions. A clear handling aisle is preserved.',wrapStand:'A shorter wrapping hold and access to the powered wrapper.',wrapper:'A powered turntable shortens each wrapping hold.',training:'Complete operator training before using a forklift.',usedLift:'Access upper rack positions after operator training.',upper:'Four rack levels. Upper stock requires your forklift.',door:'A second dock door lets two trucks visit at once.',expansion:'More floor and staging space for your warehouse.'};
      return '<div class="office-paper-meta"><span>CASH '+money(s.cash)+'</span><span>'+s.commerce.completed+' orders shipped</span></div><div class="office-equipment-grid">'+O.businessUpgrades.filter(id=>!['cart','walkie'].includes(id)).map(id=>{
        const equipment = O.equipment.find(item=>item.id===id), reason = O.purchaseReason(s,id), installed = reason === 'Already installed.';
        return '<article class="office-equipment" data-paper-equipment="'+id+'"><h3>'+esc(equipment.name)+'</h3><p>'+esc(descriptions[id] || equipment.name)+'</p>'+button(installed?'Installed':'Buy / '+money(equipment.cost*100),'buy-equipment','data-id="'+id+'" '+(reason?'disabled':''),!reason)+(reason&&!installed?'<small>'+esc(reason)+'</small>':'')+'</article>';
      }).join('')+'</div>';
    }

    ledgerHTML() {
      const s = this.app.sim.s, entries = s.journal.filter(entry=>entry.day===s.day);
      const sales = entries.filter(entry=>entry.category==='Sales').reduce((n,entry)=>n+entry.cents,0), cogs = s.commerce.orders.reduce((n,order)=>n+order.cogs,0);
      const expenses = entries.filter(entry=>entry.cents<0&&!['Inventory','Purchases','Credit'].includes(entry.category)).reduce((n,entry)=>n-entry.cents,0);
      const profit = sales-cogs-expenses;
      return '<div class="office-paper-meta"><span>DAY '+s.day+' / '+(s.phase==='evening'?'CLOSED':'IN PROGRESS')+'</span><span>'+s.commerce.completed+' lifetime orders</span></div><dl class="office-ledger-summary"><div><dt>Cash</dt><dd>'+money(s.cash)+'</dd></div><div><dt>Operating profit</dt><dd>'+money(profit)+'</dd></div><div><dt>Credit used</dt><dd>'+money(s.credit)+'</dd></div></dl><dl class="office-paper-totals"><dt>Customer payments</dt><dd>'+money(sales)+'</dd><dt>Cost of stock sold</dt><dd>'+money(cogs)+'</dd><dt>Operating expenses</dt><dd>'+money(expenses)+'</dd><dt>Net worth</dt><dd>'+money(O.businessAssets(s))+'</dd></dl><p class="office-paper-note">Buying inventory reduces cash. Its cost enters profit when those cases are sold.</p><h3>Cash journal</h3>'+(entries.length?'<div class="office-journal-wrap"><table class="office-journal"><thead><tr><th scope="col">Time</th><th scope="col">Entry</th><th scope="col">Amount</th></tr></thead><tbody>'+entries.slice().reverse().map(entry=>'<tr><td>'+O.time(entry.minute)+'</td><td><strong>'+esc(entry.category)+'</strong><span>'+esc(entry.reason)+'</span></td><td>'+money(entry.cents)+'</td></tr>').join('')+'</tbody></table></div>':'<p>No cash entries yet today.</p>');
    }

    act(node) {
      if (this.app.rotated || this.app.hidden) return;
      const action = node.dataset.paperAction, sim = this.app.sim, s = sim.s;
      this.app.audio?.unlock();
      if (action === 'close') { this.close(); return; }
      this.message = '';
      if (action === 'quantity') { this.count = Number(node.dataset.count); this.review = null; }
      else if (action === 'review-purchase') {
        const quote = sim.restockQuote(this.item,this.count);
        if (quote.reason) this.message = quote.reason;
        else this.review = {item:this.item,count:this.count,cost:quote.cost};
      } else if (action === 'edit-purchase' || action === 'new-purchase') { this.review = null; this.receipt = null; }
      else if (action === 'place-purchase') {
        if (!this.review) return;
        const quote = sim.restockQuote(this.item,this.count);
        if (quote.reason) this.message = quote.reason;
        else if (this.review.cost !== quote.cost || this.review.item !== this.item || this.review.count !== this.count) {
          this.review = null; this.message = 'The quote changed. Review the order again.';
        } else {
          const result = sim.command({type:'restock',item:this.item,count:this.count});
          if (result.ok) { this.receipt = s.commerce.purchases.at(-1).id; this.review = null; this.app.audio?.play('paper'); }
          else this.message = result.reason;
        }
      } else if (action === 'receiving') { this.close(); this.app.places.go('staging'); return; }
      else if (action === 'accept-order' || action === 'cancel-order') {
        const result = sim.command({type:action==='accept-order'?'fulfill':'cancelOrder',order:Number(node.dataset.id)});
        this.message = result.ok ? (action==='accept-order'?'Order accepted. Its cases are reserved for your pick.':'Order cancelled. Any cases already picked remain in the warehouse.') : result.reason;
      } else if (action === 'pick-order' || action === 'ship-order') {
        const order = s.commerce.orders.find(order=>order.id===Number(node.dataset.id)&&order.status==='queued');
        if (!order) { this.message = 'This order is no longer waiting.'; }
        else {
          const carried = sim.p.get(s.commerce.hands.carry);
          if (carried?.businessOrder && carried.businessOrder !== order.id) { this.message = 'Finish the pallet on your jack before switching customer orders.'; }
          else { s.commerce.hands.order = order.id; this.close(); this.app.places.go(action==='pick-order'?'storage':'shipping'); return; }
        }
      } else if (action === 'buy-equipment') {
        const result = node.dataset.id === 'rack' ? O.sceneBuyRack(sim) : sim.command({type:'buy',id:node.dataset.id});
        this.message = result.ok ? 'Purchase recorded. The equipment is ready.' : result.reason;
      }
      this.app.ui.update();
      this.update(true);
    }
  }
  O.OfficePapers = OfficePapers;
})(window);
