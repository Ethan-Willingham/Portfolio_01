/* Load the page-credit explorer as its section approaches the viewport. */
(function () {
  'use strict';
  var root = document.getElementById('ma-root');
  if (!root) return;
  var pending = null;
  var loaded = false;
  var observer;
  var status = root.querySelector('[data-attribution-status]');
  var history = document.getElementById('gh-stage');
  var historyStatus = history.querySelector('[data-history-status]');
  var historyPending = null;
  var historyLoaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { script.remove(); reject(new Error('Page credits unavailable')); };
      document.head.appendChild(script);
    });
  }
  function loadHistory() {
    if (historyLoaded) return Promise.resolve();
    if (historyPending) return historyPending;
    history.setAttribute('aria-busy', 'true');
    historyStatus.hidden = false;
    historyStatus.textContent = 'Loading build history...';
    historyPending = (window.GIT_HISTORY ? Promise.resolve() : loadScript(history.dataset.historyData))
      .then(function () {
        if (!window.GIT_HISTORY) throw new Error('Build history unavailable');
        return loadScript(history.dataset.historyScript);
      })
      .then(function () {
        historyLoaded = true;
        historyStatus.hidden = true;
        history.querySelectorAll('.gh-topright button').forEach(function (button) { button.disabled = false; });
      })
      .catch(function (error) {
        historyStatus.textContent = 'Build history couldn’t load. ';
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'ma-filter-clear';
        retry.textContent = 'Try again';
        retry.addEventListener('click', function () { loadHistory().catch(function () {}); });
        historyStatus.appendChild(retry);
        throw error;
      })
      .finally(function () { historyPending = null; history.removeAttribute('aria-busy'); });
    return historyPending;
  }
  // Give the heading and fonts a paint before the timeline's large snapshot downloads.
  document.fonts.ready.then(function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { loadHistory().catch(function () {}); });
    });
  });
  function load() {
    if (loaded || pending) return;
    root.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.textContent = 'Loading page credits...';
    pending = loadHistory()
      .then(function () { return window.GIT_ATTRIBUTION ? Promise.resolve() : loadScript(root.dataset.attributionData); })
      .then(function () { return loadScript(root.dataset.attributionScript); })
      .then(function () {
        if (!root.querySelector('.ma-minds')) throw new Error('Page credits unavailable');
        loaded = true;
        if (observer) observer.disconnect();
      })
      .catch(function () {
        status.textContent = 'Page credits couldn’t load. ';
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'ma-filter-clear';
        retry.textContent = 'Try again';
        retry.addEventListener('click', load);
        status.appendChild(retry);
      })
      .finally(function () { pending = null; root.removeAttribute('aria-busy'); });
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) load();
    }, { rootMargin: '300px 0px' });
    observer.observe(root.parentElement);
  } else {
    load();
  }
})();
