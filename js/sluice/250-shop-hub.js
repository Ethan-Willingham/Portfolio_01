  // ====================================================================
  //  STORE -- the station shop, rebuilt on the shared UI kit (245).
  // ====================================================================
  // v26.18: the old three-counter hub (station cards, per-counter pages,
  // two-level navigation) is gone. Entering the shop opens ONE catalog
  // modal over the fizzed-out world: WORKSHOP and SUPPLIES tabs, a
  // scannable item list, a detail pane, one action button. The item
  // builders live beside their data in 270 (workshop) and 280 (shelf).
  // The flag-off Trade Board page (260) is untouched; when its flag is
  // on it appears as a MARKET tab that hands off to the bespoke page.

  // Kept for 260-shop-board, whose wood backboard reads the board tint.
  var NS_STATION_INFO = {
    workshop: { title: 'WORKSHOP', tag: 'Upgrade your rig',  accent: '#c87a32', plate: '#3a2d20' },
    shelf:    { title: 'SUPPLIES', tag: 'Stock consumables', accent: '#3f8a55', plate: '#23332a' },
    board:    { title: 'TRADE BOARD', tag: 'Buy & sell goods', accent: '#b8923a', plate: '#34291a' }
  };

  // Last tab the player was on, restored on the next visit this session.
  var storeLastTab = 'workshop';

  function storeSpec() {
    var tabs = [
      { id: 'workshop', label: 'WORKSHOP', build: nsWorkshopTabItems },
      { id: 'shelf',    label: 'SUPPLIES', build: nsShelfTabItems }
    ];
    if (ENABLE_TRADE_BOARD) {
      tabs.push({ id: 'board', label: 'MARKET', open: function () { nsEnterStation('board'); } });
    }
    return {
      id: 'store',
      title: 'STATION STORE',
      tabs: tabs,
      tab: storeLastTab,
      onClose: nsExitShop
    };
  }
  function storeModalEnsure() {
    if (!ukModal) ukCatalogOpen(storeSpec());
  }

  // Topmost-last hit test over the board page's NS_HIT rects (the kit's
  // own widgets use UK_HIT + ukHitAt instead).
  function nsHitAt(x, y) {
    for (var i = NS_HIT.length - 1; i >= 0; i--) {
      var r = NS_HIT[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---- Pointer dispatch (entry points wired from 050-input) ------------
  function newShopPointerDown(x, y, id) {
    if (id === undefined) id = 'mouse';
    if (shopState === 'board') {
      // Bespoke Trade Board page: brass back arrow + its own hit kinds.
      var ba = nsBackArrowRect(nsMetrics());
      if (x >= ba.x && x <= ba.x + ba.w && y >= ba.y && y <= ba.y + ba.h) {
        nsBackOrExit();
        return true;
      }
      return nsBoardPointerDown(x, y, nsHitAt(x, y), id);
    }
    ukPointerDown(x, y, id);
    if (ukState) storeLastTab = ukState.tab;
    return true;
  }
  function newShopPointerMove(x, y) {
    if (shopState === 'board') {
      var hit = nsHitAt(x, y);
      nsHubHover = null;
      nsBoardHover = null;
      var ba = nsBackArrowRect(nsMetrics());
      if (x >= ba.x && x <= ba.x + ba.w && y >= ba.y && y <= ba.y + ba.h) nsHubHover = 'nsback';
      if (!hit) return;
      if (hit.kind === 'boardrow') nsBoardHover = hit.id;
      else if (hit.kind === 'boardbtn') nsHubHover = 'bb:' + hit.id;
      return;
    }
    ukPointerMove(x, y);
  }
  function newShopPointerDrag(x, y, id) {
    if (shopState === 'board') {
      if (nsDrag.active && nsDrag.id === id) {
        var dy = y - nsDrag.startY;
        nsDrag.moved = Math.max(nsDrag.moved, Math.abs(dy));
        nsBoardScroll = nsDrag.startScroll - dy;
        if (nsBoardScroll < 0) nsBoardScroll = 0;
        if (nsBoardScroll > nsBoardScrollMax) nsBoardScroll = nsBoardScrollMax;
      }
      return;
    }
    ukPointerDrag(x, y, id);
  }
  function newShopPointerUp(id) {
    var di = (id === undefined) ? 'mouse' : id;
    if (shopState === 'board') {
      if (nsDrag.active && nsDrag.id === di) {
        nsDrag.active = false;
        if (nsDrag.pendingRow && nsDrag.moved < 6) {
          nsBoardSel = (nsBoardSel === nsDrag.pendingRow) ? null : nsDrag.pendingRow;
          nsBoardQty = 1;
        }
        nsDrag.pendingRow = null;
      }
      return;
    }
    ukPointerUp(di);
  }
  function newShopWheel(d) {
    if (shopState === 'board') {
      nsBoardScroll += d;
      if (nsBoardScroll < 0) nsBoardScroll = 0;
      if (nsBoardScroll > nsBoardScrollMax) nsBoardScroll = nsBoardScrollMax;
      return true;
    }
    return ukWheel(d);
  }

