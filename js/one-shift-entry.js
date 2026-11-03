(function () {
  'use strict';
  // Keep the first screen independent of the warehouse engine, scene and styles.
  var query = new URLSearchParams(location.search);
  var warehouse = query.has('mode') || query.get('view') === 'warehouse';
  function script(url) {
    return new Promise(function (resolve, reject) {
      var element = document.createElement('script');
      element.src = url; element.onload = resolve;
      element.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(element);
    });
  }
  function stylesheet(url) {
    return new Promise(function (resolve, reject) {
      var element = document.createElement('link');
      element.rel = 'stylesheet'; element.href = url; element.onload = resolve;
      element.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(element);
    });
  }
  var inboundLoading;
  window.loadInboundWarehouse = function () {
    if (!inboundLoading) inboundLoading = script('js/demo-activity.js?v=1').then(function () { return script('js/one-shift-inbound-warehouse.js?v=14'); });
    return inboundLoading;
  };
  async function boot() {
    if (!warehouse) {
      await script('js/one-shift-inbound-model.js?v=14');
      await script('js/one-shift-inbound.js?v=14');
      return;
    }
    document.getElementById('in-main').textContent = 'Opening the warehouse menu...';
    await Promise.all(['style.css', 'one-shift-unity.css?v=13', 'one-shift-wms.css?v=13', 'one-shift-demos.css?v=13'].map(stylesheet));
    await script('js/demo-activity.js?v=1');
    await script('js/one-shift-wms.js?v=13');
    await script('js/one-shift-demos.js?v=13');
    document.getElementById('inbound-app').hidden = true;
    document.body.className = 'warehouse-page';
    document.getElementById('warehouse-stage').hidden = false;
    document.title = 'The Warehouse Simulator';
    await script('js/one-shift-unity.js?v=14');
  }
  boot().catch(function () {
    document.body.className = 'inbound-page';
    document.getElementById('warehouse-stage').hidden = true;
    document.getElementById('inbound-app').hidden = false;
    document.getElementById('in-main').innerHTML = '<section class="in-home"><h1>That screen could not load.</h1><p>Check your connection, then try again.</p><a class="in-primary" href="' + (warehouse ? 'one-shift.html?mode=demo&amp;demo=receive' : 'one-shift.html') + '">Try again</a></section>';
  });
}());
