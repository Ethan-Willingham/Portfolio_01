/* Slop: a finite collection on a virtualized, repeating wall. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('slop-stage');
  const wall = $('slop-wall');
  if (!stage || !wall) return;

  const TILE = 336;
  const PITCH = 376;
  const MAX_ZOOM = 2.4;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const data = window.SLOP_DATA || {};
  const phrases = Array.isArray(data.phrases) ? data.phrases : [];
  const styles = Array.isArray(data.styles) ? data.styles : [];
  const allWorks = Array.isArray(data.works) ? data.works : [];
  const seenIds = new Set();
  const works = allWorks.filter((work) => {
    if (!work || !work.id || seenIds.has(work.id) || !work.image || work.generation?.status !== 'complete') return false;
    seenIds.add(work.id);
    return true;
  });
  const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
  const styleById = new Map(styles.map((style) => [style.id, style]));
  const production = data.production || {};
  const tiles = new Map();
  const preparedImages = new WeakSet();
  const pointers = new Map();
  const returnFocus = new WeakMap();
  const dialogs = [...document.querySelectorAll('.slop-dialog')];
  const order = works.map((_, index) => index);
  const number = new Intl.NumberFormat('en-US');
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const state = {
    x: TILE / 2, y: TILE / 2, zoom: 1, width: 0, height: 0,
    defaultZoom: 1, minZoom: 0.42, vx: 0, vy: 0, raf: 0, lastFrame: 0,
    tween: null, wheel: null, nearestKey: '', gesture: null, currentWork: 0,
    lastPointerMove: 0, indexBuilt: false, ledgerBuilt: false, highPriorityLoaded: false
  };

  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const knownNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const count = (value) => knownNumber(value) ? number.format(value) : 'Not reported';
  const pad = (value) => String(value).padStart(3, '0');
  const titleOf = (work) => work.title || phraseById.get(work.phraseId)?.text || 'Untitled';
  const styleOf = (work) => styleById.get(work.styleId)?.name || 'Style not recorded';
  const columnOffset = (column) => mod(column, 2) * PITCH / 2;
  const cellKey = (column, row) => `${column}:${row}`;
  const anyDialogOpen = () => dialogs.some((dialog) => dialog.open);
  const textElement = (tag, text, className) => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  function coprimeStride(length) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    let stride = Math.max(1, Math.round(Math.sqrt(length) * 1.4));
    while (gcd(stride, length) !== 1) stride += 1;
    return stride;
  }
  const stride = coprimeStride(works.length || 1);
  const indexAt = (column, row) => order[mod(column + row * stride, order.length)];
  const centerOf = (column, row) => ({ x: column * PITCH + TILE / 2, y: row * PITCH + columnOffset(column) + TILE / 2 });

  function imageTokens(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const candidates = [usage.imageTokens, usage.image_tokens, usage.output_tokens_details?.image_tokens, usage.outputTokensDetails?.imageTokens];
    return candidates.find(knownNumber) ?? null;
  }

  function announce(message) {
    $('slop-announcement').textContent = message;
  }

  function pictureFor(work, { eager = false, decorative = false } = {}) {
    const picture = document.createElement('picture');
    if (/\.webp(?:[?#]|$)/i.test(work.image || '')) {
      const source = document.createElement('source');
      source.type = 'image/webp';
      source.srcset = work.image;
      picture.append(source);
    }
    const image = document.createElement('img');
    image.alt = decorative ? '' : (work.alt || `${titleOf(work)}, generated art in ${styleOf(work)}.`);
    image.width = work.width || 1024;
    image.height = work.height || 1024;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    if (eager) image.fetchPriority = 'high';
    image.src = work.fallback || work.image;
    let triedFallback = false;
    image.addEventListener('error', () => {
      if (!triedFallback && work.fallback && picture.querySelector('source')) {
        triedFallback = true;
        picture.querySelector('source').remove();
        image.src = work.fallback;
        return;
      }
      picture.closest('.slop-card')?.classList.add('is-missing');
      image.alt = `${titleOf(work)}. The image could not be loaded.`;
    });
    picture.append(image);
    return picture;
  }

  function nearestCell(cameraX = state.x, cameraY = state.y) {
    const approximateColumn = Math.round((cameraX - TILE / 2) / PITCH);
    let nearest = null;
    for (let column = approximateColumn - 1; column <= approximateColumn + 1; column += 1) {
      const row = Math.round((cameraY - TILE / 2 - columnOffset(column)) / PITCH);
      const center = centerOf(column, row);
      const distance = (center.x - cameraX) ** 2 + (center.y - cameraY) ** 2;
      if (!nearest || distance < nearest.distance) nearest = { column, row, ...center, distance };
    }
    return nearest;
  }

  function createTile(column, row) {
    const index = indexAt(column, row);
    const work = works[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slop-card';
    button.tabIndex = -1;
    button.style.transform = `translate3d(${column * PITCH}px, ${row * PITCH + columnOffset(column)}px, 0)`;
    button.dataset.index = String(index);
    button.dataset.workId = String(work.id);
    button.dataset.title = titleOf(work);
    button.setAttribute('aria-label', `${titleOf(work)}. ${styleOf(work)}. Open artwork.`);
    const eager = !state.highPriorityLoaded && column === 0 && row === 0;
    if (eager) state.highPriorityLoaded = true;
    button.append(pictureFor(work, { eager, decorative: true }));
    const caption = textElement('span', '', 'slop-card-caption');
    caption.setAttribute('aria-hidden', 'true');
    caption.append(textElement('span', titleOf(work)), textElement('span', pad(work.id)));
    button.append(caption);
    return button;
  }

  function prepareNearbyImage(tile, column, row, halfWidth, halfHeight) {
    const margin = 180 / state.zoom;
    const left = column * PITCH;
    const top = row * PITCH + columnOffset(column);
    if (left + TILE < state.x - halfWidth - margin || left > state.x + halfWidth + margin ||
        top + TILE < state.y - halfHeight - margin || top > state.y + halfHeight + margin) return;
    const image = tile.querySelector('img');
    if (!image || preparedImages.has(image)) return;
    preparedImages.add(image);
    // The virtualizer owns visibility. Start nearby images before they enter the
    // viewport, and decode off the animation path so fast pans have ready pixels.
    // Native lazy loading remains in place for the outer buffer and the Index.
    image.loading = 'eager';
    if (typeof image.decode !== 'function') return;
    const decode = () => image.decode().then(requestRender).catch(() => {});
    image.addEventListener('load', decode, { once: true });
    decode();
  }

  function render() {
    wall.style.transform = `translate3d(${state.width / 2 - state.x * state.zoom}px, ${state.height / 2 - state.y * state.zoom}px, 0) scale(${state.zoom})`;
    $('slop-zoom-reset').textContent = `${Math.round(state.zoom * 100)}%`;
    $('slop-zoom-out').disabled = !works.length || state.zoom <= state.minZoom + 0.001;
    $('slop-zoom-in').disabled = !works.length || state.zoom >= MAX_ZOOM - 0.001;
    if (!works.length) return;

    const halfWidth = state.width / (2 * state.zoom);
    const halfHeight = state.height / (2 * state.zoom);
    const minColumn = Math.floor((state.x - halfWidth) / PITCH) - 1;
    const maxColumn = Math.floor((state.x + halfWidth) / PITCH) + 1;
    const visibleKeys = new Set();
    const additions = document.createDocumentFragment();
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const offset = columnOffset(column);
      const minRow = Math.floor((state.y - halfHeight - offset) / PITCH) - 1;
      const maxRow = Math.floor((state.y + halfHeight - offset) / PITCH) + 1;
      for (let row = minRow; row <= maxRow; row += 1) {
        const key = cellKey(column, row);
        visibleKeys.add(key);
        if (!tiles.has(key)) {
          const tile = createTile(column, row);
          tiles.set(key, tile);
          additions.append(tile);
        }
        prepareNearbyImage(tiles.get(key), column, row, halfWidth, halfHeight);
      }
    }
    for (const [key, tile] of tiles) {
      if (!visibleKeys.has(key)) {
        if (document.activeElement === tile) stage.focus({ preventScroll: true });
        tile.remove();
        tiles.delete(key);
      }
    }
    wall.append(additions);
    const nearest = nearestCell();
    const key = cellKey(nearest.column, nearest.row);
    if (key !== state.nearestKey) {
      tiles.get(state.nearestKey)?.setAttribute('tabindex', '-1');
      const tile = tiles.get(key);
      if (tile) tile.tabIndex = 0;
      state.nearestKey = key;
      const index = indexAt(nearest.column, nearest.row);
      $('slop-near-number').textContent = `WORK ${pad(works[index].id)} / ${works.length} ON VIEW`;
      $('slop-near-title').textContent = titleOf(works[index]);
    }
  }

  function requestRender() {
    if (!state.raf) state.raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    state.raf = 0;
    const dt = clamp(now - (state.lastFrame || now - 16.7), 1, 40);
    state.lastFrame = now;
    let continuing = false;
    let afterRender = null;
    if (state.tween) {
      const tween = state.tween;
      const progress = clamp((now - tween.start) / tween.duration, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      state.x = tween.from.x + (tween.to.x - tween.from.x) * eased;
      state.y = tween.from.y + (tween.to.y - tween.from.y) * eased;
      state.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * eased;
      if (progress >= 1) { afterRender = tween.complete; state.tween = null; } else continuing = true;
    } else if (state.wheel) {
      const ease = motionPreference.matches ? 1 : 1 - Math.exp(-dt / 45);
      state.x += (state.wheel.x - state.x) * ease;
      state.y += (state.wheel.y - state.y) * ease;
      if (Math.abs(state.wheel.x - state.x) + Math.abs(state.wheel.y - state.y) < 0.08) {
        state.x = state.wheel.x;
        state.y = state.wheel.y;
        state.wheel = null;
      } else continuing = true;
    } else if (!pointers.size && (Math.abs(state.vx) + Math.abs(state.vy) > 0.008)) {
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      const drag = Math.exp(-dt / 210);
      state.vx *= drag;
      state.vy *= drag;
      continuing = true;
    } else { state.vx = 0; state.vy = 0; }
    render();
    if (afterRender) afterRender();
    if (continuing) requestRender();
  }

  function stopMotion() {
    state.vx = 0;
    state.vy = 0;
    state.tween = null;
    state.wheel = null;
  }

  function moveTo(x, y, zoom = state.zoom, complete = null) {
    stopMotion();
    zoom = clamp(zoom, state.minZoom, MAX_ZOOM);
    if (motionPreference.matches) {
      state.x = x; state.y = y; state.zoom = zoom;
      render();
      if (complete) complete();
      return;
    }
    state.tween = { from: { x: state.x, y: state.y, zoom: state.zoom }, to: { x, y, zoom }, start: performance.now(), duration: 440, complete };
    requestRender();
  }

  function focusCentered() {
    (tiles.get(state.nearestKey) || stage).focus({ preventScroll: true });
  }

  function home() {
    if (!works.length) return;
    moveTo(TILE / 2, TILE / 2, state.defaultZoom);
    announce('The wall is centered.');
  }

  function zoomAt(nextZoom, screenX, screenY, animated = false) {
    nextZoom = clamp(nextZoom, state.minZoom, MAX_ZOOM);
    const anchorX = screenX - state.width / 2;
    const anchorY = screenY - state.height / 2;
    const x = state.x + anchorX / state.zoom - anchorX / nextZoom;
    const y = state.y + anchorY / state.zoom - anchorY / nextZoom;
    if (animated) moveTo(x, y, nextZoom);
    else { stopMotion(); state.x = x; state.y = y; state.zoom = nextZoom; requestRender(); }
  }

  function zoomBy(factor) {
    if (!works.length) return;
    zoomAt((state.tween?.to.zoom || state.zoom) * factor, state.width / 2, state.height / 2, true);
  }

  function resize() {
    const oldDefault = state.defaultZoom;
    state.width = stage.clientWidth;
    state.height = stage.clientHeight;
    state.minZoom = Math.max(0.42, Math.min(1, Math.sqrt(state.width * state.height / 150) / PITCH));
    state.defaultZoom = state.width < 600 ? 0.66 : state.height < 520 ? 0.75 : 1;
    if (state.zoom === oldDefault || !state.lastFrame) state.zoom = state.defaultZoom;
    state.zoom = clamp(state.zoom, state.minZoom, MAX_ZOOM);
    stopMotion();
    requestRender();
  }

  function pointerDown(event) {
    if (!works.length || anyDialogOpen() || event.button !== 0 || event.target.closest('.slop-empty')) return;
    event.preventDefault();
    const wasMoving = (Math.abs(state.vx) + Math.abs(state.vy)) * state.zoom > 0.12;
    stopMotion();
    const point = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: performance.now() };
    pointers.set(event.pointerId, point);
    stage.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      state.gesture = { moved: wasMoving, pinched: false, index: event.target.closest('.slop-card')?.dataset.index };
      stage.focus({ preventScroll: true });
    } else {
      state.gesture.moved = true;
      state.gesture.pinched = true;
      stage.classList.add('is-dragging');
    }
  }

  function pointerMove(event) {
    const point = pointers.get(event.pointerId);
    if (!point || !state.gesture) return;
    const now = performance.now();
    if (pointers.size >= 2) {
      const pair = [...pointers.values()].slice(0, 2);
      const oldX = (pair[0].x + pair[1].x) / 2;
      const oldY = (pair[0].y + pair[1].y) / 2;
      const oldDistance = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
      point.x = event.clientX; point.y = event.clientY; point.time = now;
      const newX = (pair[0].x + pair[1].x) / 2;
      const newY = (pair[0].y + pair[1].y) / 2;
      const newDistance = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
      const nextZoom = clamp(state.zoom * newDistance / Math.max(1, oldDistance), state.minZoom, MAX_ZOOM);
      const worldX = state.x + (oldX - state.width / 2) / state.zoom;
      const worldY = state.y + (oldY - state.height / 2) / state.zoom;
      state.x = worldX - (newX - state.width / 2) / nextZoom;
      state.y = worldY - (newY - state.height / 2) / nextZoom;
      state.zoom = nextZoom;
      state.vx = 0; state.vy = 0;
      state.lastPointerMove = now;
      requestRender();
      return;
    }
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    const dt = clamp(now - point.time, 4, 64);
    point.x = event.clientX; point.y = event.clientY; point.time = now;
    if (Math.hypot(point.x - point.startX, point.y - point.startY) > 6) state.gesture.moved = true;
    if (!state.gesture.moved) return;
    state.x -= dx / state.zoom;
    state.y -= dy / state.zoom;
    state.vx = state.vx * 0.55 - dx / (state.zoom * dt) * 0.45;
    state.vy = state.vy * 0.55 - dy / (state.zoom * dt) * 0.45;
    state.lastPointerMove = now;
    stage.classList.add('is-dragging');
    requestRender();
  }

  function pointerEnd(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (pointers.size) {
      for (const point of pointers.values()) { point.startX = point.x; point.startY = point.y; point.time = performance.now(); }
      state.vx = 0; state.vy = 0;
      return;
    }
    const gesture = state.gesture;
    state.gesture = null;
    stage.classList.remove('is-dragging');
    if (event.type !== 'pointerup' || motionPreference.matches || performance.now() - state.lastPointerMove > 85) {
      state.vx = 0; state.vy = 0;
    }
    if (event.type === 'pointerup' && gesture && !gesture.moved && !gesture.pinched && gesture.index !== undefined) {
      openWork(Number(gesture.index));
    } else requestRender();
  }

  function clearPointers() {
    pointers.clear();
    state.gesture = null;
    stage.classList.remove('is-dragging');
    stopMotion();
  }

  stage.addEventListener('pointerdown', pointerDown);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerup', pointerEnd);
  stage.addEventListener('pointercancel', pointerEnd);
  stage.addEventListener('lostpointercapture', pointerEnd);
  stage.addEventListener('dragstart', (event) => event.preventDefault());
  wall.addEventListener('click', (event) => {
    const tile = event.target.closest('.slop-card');
    // Pointer taps open on pointerup. Native keyboard and assistive clicks use detail 0.
    if (tile && event.detail === 0 && !anyDialogOpen()) openWork(Number(tile.dataset.index));
  });
  stage.addEventListener('wheel', (event) => {
    if (!works.length || anyDialogOpen()) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
    let dx = event.deltaX * multiplier;
    let dy = event.deltaY * multiplier;
    if (!event.shiftKey || event.ctrlKey) {
      // Ordinary scroll zooms; trackpad pinch retains its stronger response.
      const delta = dy || dx;
      zoomAt(state.zoom * Math.exp(-delta * (event.ctrlKey ? 0.007 : 0.0025)), event.clientX, event.clientY);
      return;
    }
    if (event.shiftKey && !dx) { dx = dy; dy = 0; }
    state.tween = null;
    state.vx = 0; state.vy = 0;
    if (!state.wheel) state.wheel = { x: state.x, y: state.y };
    state.wheel.x += dx / state.zoom;
    state.wheel.y += dy / state.zoom;
    requestRender();
  }, { passive: false });

  // Safari's trackpad pinch supplies gesture events instead of Ctrl-wheel.
  let safariGesture = null;
  stage.addEventListener('gesturestart', (event) => {
    event.preventDefault();
    if (!works.length || anyDialogOpen()) return;
    stopMotion();
    safariGesture = { zoom: state.zoom, x: event.clientX || state.width / 2, y: event.clientY || state.height / 2 };
  }, { passive: false });
  stage.addEventListener('gesturechange', (event) => {
    event.preventDefault();
    if (safariGesture && pointers.size < 2) zoomAt(safariGesture.zoom * event.scale, safariGesture.x, safariGesture.y);
  }, { passive: false });
  stage.addEventListener('gestureend', (event) => { event.preventDefault(); safariGesture = null; }, { passive: false });

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    clearPointers();
    const active = document.activeElement;
    const oldDialog = active?.closest('dialog');
    const previousFocus = oldDialog ? (returnFocus.get(oldDialog) || stage) : active;
    for (const other of dialogs) {
      if (other.open) { other.dataset.switching = 'true'; other.close(); }
    }
    returnFocus.set(dialog, previousFocus);
    if (dialog.id === 'slop-index' && !state.indexBuilt) buildIndex();
    if (dialog.id === 'slop-ledger' && !state.ledgerBuilt) buildLedger();
    dialog.showModal();
  }

  for (const dialog of dialogs) {
    dialog.addEventListener('close', () => {
      if (dialog.dataset.switching) { delete dialog.dataset.switching; return; }
      if (dialog.id === 'slop-work') {
        if (dialog.dataset.routeClosing) delete dialog.dataset.routeClosing;
        else closeWorkRoute();
      }
      requestAnimationFrame(() => {
        if (anyDialogOpen()) return;
        const target = returnFocus.get(dialog);
        if (target?.isConnected && !target.closest('dialog:not([open])')) target.focus({ preventScroll: true });
        else stage.focus({ preventScroll: true });
      });
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-dialog]');
    if (trigger) openDialog($(trigger.dataset.dialog));
    const close = event.target.closest('[data-close]');
    if (close) close.closest('dialog').close();
  });

  function fact(label, value) {
    const row = document.createElement('div');
    row.append(textElement('dt', label), textElement('dd', value));
    return row;
  }

  function openWork(index, updateRoute = true) {
    if (!works.length) return;
    index = mod(index, works.length);
    state.currentWork = index;
    const work = works[index];
    const generation = work.generation || {};
    const style = styleById.get(work.styleId);
    $('slop-work-image').replaceChildren(pictureFor(work, { eager: true }));
    $('slop-work-number').textContent = `WORK ${pad(work.id)}`;
    $('slop-work-title').textContent = titleOf(work);
    $('slop-work-style').textContent = styleOf(work);
    $('slop-work-description').textContent = style?.description || '';
    $('slop-work-description').hidden = !style?.description;
    const facts = [
      fact('Attempts', count(generation.attempts)),
      fact('Generated with', generation.model ? `OpenAI ${generation.model}` : 'OpenAI · model not reported')
    ];
    $('slop-work-facts').replaceChildren(...facts);
    $('slop-work-prompt').textContent = work.prompt || 'The generation prompt was not recorded.';
    $('slop-work-prompt').parentElement.open = false;
    $('slop-work-original').href = work.fallback || work.image;
    $('slop-work-position').textContent = `${index + 1} / ${works.length}`;
    $('slop-work-previous').disabled = works.length < 2;
    $('slop-work-next').disabled = works.length < 2;
    $('slop-work').querySelector('.slop-work-scroll').scrollTop = 0;
    $('slop-work').querySelector('.slop-work-info').scrollTop = 0;
    const alreadyOpen = $('slop-work').open;
    openDialog($('slop-work'));
    if (updateRoute) {
      const nextHash = `#${new URLSearchParams({ work: String(work.id) })}`;
      if (window.location.hash !== nextHash) {
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        if (alreadyOpen) history.replaceState(history.state, '', nextUrl);
        else history.pushState({ ...(history.state || {}), slopGalleryWork: true }, '', nextUrl);
      }
    }
  }

  function workFromRoute() {
    const id = new URLSearchParams(window.location.hash.slice(1)).get('work');
    return id === null ? -1 : works.findIndex((work) => String(work.id) === id);
  }

  function closeWorkRoute() {
    if (workFromRoute() < 0) return;
    if (history.state?.slopGalleryWork) history.back();
    else history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
  }

  function syncWorkRoute() {
    const index = workFromRoute();
    if (index >= 0) {
      if (!$('slop-work').open || state.currentWork !== index) openWork(index, false);
    } else if ($('slop-work').open) {
      $('slop-work').dataset.routeClosing = 'true';
      $('slop-work').close();
    }
  }

  function nearestOccurrence(index) {
    const slot = order.indexOf(index);
    const approximateColumn = (state.x - TILE / 2) / PITCH;
    const approximateRow = Math.round((state.y - TILE / 2) / PITCH);
    const span = Math.max(3, Math.ceil(Math.sqrt(works.length)));
    let best = null;
    for (let row = approximateRow - span; row <= approximateRow + span; row += 1) {
      const baseColumn = mod(slot - row * stride, works.length);
      const nearestPeriod = Math.round((approximateColumn - baseColumn) / works.length);
      for (let period = nearestPeriod - 1; period <= nearestPeriod + 1; period += 1) {
        const column = baseColumn + period * works.length;
        const center = centerOf(column, row);
        const distance = (center.x - state.x) ** 2 + (center.y - state.y) ** 2;
        if (!best || distance < best.distance) best = { ...center, distance };
      }
    }
    return best;
  }

  function jumpToWork(index) {
    const target = nearestOccurrence(index);
    $('slop-index').close();
    moveTo(target.x, target.y, Math.max(state.zoom, state.defaultZoom), focusCentered);
    announce(`${titleOf(works[index])}, centered on the wall. Press Enter to open it.`);
  }

  function buildIndex() {
    const query = $('slop-search').value.trim().toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    let matches = 0;
    works.forEach((work, index) => {
      const phrase = phraseById.get(work.phraseId)?.text || '';
      const style = styleById.get(work.styleId);
      const searchable = `${titleOf(work)} ${phrase} ${style?.name || ''} ${style?.family || ''}`.toLocaleLowerCase();
      if (query && !searchable.includes(query)) return;
      matches += 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slop-index-item';
      button.dataset.workId = String(work.id);
      button.setAttribute('aria-label', `Find ${titleOf(work)} on the wall. ${styleOf(work)}.`);
      button.append(pictureFor(work, { decorative: true }), textElement('span', titleOf(work), 'slop-index-title'), textElement('span', `${pad(work.id)} / ${styleOf(work)}`, 'slop-index-style'));
      button.addEventListener('click', () => jumpToWork(index));
      fragment.append(button);
    });
    if (!matches) fragment.append(textElement('p', query ? 'No works match that phrase or style.' : 'No completed works have been recorded yet.', 'slop-index-empty'));
    $('slop-index-grid').replaceChildren(fragment);
    $('slop-index-count').textContent = query ? `${matches} of ${works.length} unique works` : `${works.length} unique ${works.length === 1 ? 'work' : 'works'}. Each appears once in this index.`;
    state.indexBuilt = true;
  }

  function stat(value, label) {
    const item = textElement('div', '', 'slop-stat');
    item.append(textElement('span', value, 'slop-stat-value'), textElement('span', label, 'slop-stat-label'));
    return item;
  }

  function buildAccountMeter() {
    const account = production.accountUsage;
    const history = Array.isArray(production.accountUsageHistory) ? production.accountUsageHistory.filter((interval) => interval && typeof interval === 'object') : [];
    const target = $('slop-account-meter');
    if (!account && !history.length) { target.hidden = true; return; }
    const intervalText = (interval, heading) => {
      const label = typeof interval.label === 'string' && interval.label.trim() ? ` (${interval.label.trim()})` : '';
      const before = knownNumber(interval.before?.usedPercent) ? `${number.format(interval.before.usedPercent)}%` : 'not recorded';
      const after = knownNumber(interval.after?.usedPercent) ? `${number.format(interval.after.usedPercent)}%` : 'not recorded';
      const change = interval.deltaPercentagePoints;
      const delta = typeof change === 'number' && Number.isFinite(change) ? `${change > 0 ? '+' : ''}${number.format(change)} percentage points` : 'not reported';
      return heading === 'Prior run'
        ? `${heading}${label}: ${before} to ${after} used; ${delta}.`
        : `${heading}${label}: ${before} used before images, ${after} after. Change: ${delta}.`;
    };
    const rows = account ? [textElement('p', intervalText(account, 'Current run'))] : [];
    history.forEach((interval) => rows.push(textElement('p', intervalText(interval, 'Prior run'))));
    let note = account?.note || 'Account-wide meter; includes other chats. Not a token counter.';
    if ([account, ...history].some((interval) => interval?.deltaPercentagePoints === 0)) note += ' A recorded change of 0 does not mean zero consumption.';
    target.replaceChildren(...rows, textElement('p', note));
    target.hidden = false;
  }

  function buildLedger() {
    const generated = allWorks.filter((work) => work.image && knownNumber(work.generation?.attempts) && work.generation.attempts > 0);
    const retired = allWorks.filter((work) => work.generation?.status === 'retired');
    const attemptsKnown = allWorks.length > 0 && allWorks.every((work) => knownNumber(work.generation?.attempts));
    const attempts = attemptsKnown ? allWorks.reduce((total, work) => total + work.generation.attempts, 0) : null;
    $('slop-stats').replaceChildren(
      stat(count(generated.length), 'Unique generated works'),
      stat(count(production.projectTokens), 'Tracked planning / code tokens'),
      stat(count(production.imageTokens), 'Image inference tokens'),
      stat(count(attempts), 'Lifetime image attempts'),
      stat(knownNumber(production.imageCostUsd) ? price.format(production.imageCostUsd) : 'Not reported', 'Image generation cost'),
      stat(count(phrases.length), 'Phrases in the library')
    );
    const defaultNote = 'Planning and code tokens exclude image inference. The image tool did not report image token usage or cost. Unknown values are not zero.';
    const retirementNote = retired.length ? `${count(works.length)} works on view. ${count(retired.length)} retired ${retired.length === 1 ? 'work remains' : 'works remain'} in this production record. Totals include their images and attempts. ` : '';
    $('slop-usage-note').textContent = retirementNote + (production.usageNote || defaultNote);
    buildAccountMeter();
    const rows = document.createDocumentFragment();
    allWorks.forEach((work) => {
      const row = document.createElement('tr');
      row.dataset.workId = String(work.id);
      const name = document.createElement('td');
      const index = works.findIndex((candidate) => candidate.id === work.id);
      if (index >= 0) {
        const button = textElement('button', titleOf(work));
        button.type = 'button';
        button.addEventListener('click', () => openWork(index));
        name.append(button);
      } else name.textContent = titleOf(work);
      const generation = work.generation || {};
      const status = textElement('td', generation.status || 'Not recorded');
      if (generation.status === 'retired' && work.retirement?.reason) {
        status.title = work.retirement.reason;
        status.setAttribute('aria-label', `Retired. ${work.retirement.reason}`);
      }
      row.append(name, textElement('td', generation.model || 'Not reported'), textElement('td', count(generation.attempts)), textElement('td', count(imageTokens(generation.usage))), status);
      rows.append(row);
    });
    if (!allWorks.length) {
      const row = document.createElement('tr');
      const empty = textElement('td', 'No generation records have been added yet.');
      empty.colSpan = 5;
      row.append(empty); rows.append(row);
    }
    $('slop-ledger-rows').replaceChildren(rows);
    const details = [];
    if (production.measuredThrough || production.asOf) {
      const date = new Date(production.measuredThrough || production.asOf);
      if (!Number.isNaN(date.valueOf())) details.push(`Recorded through ${date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`);
    }
    if (knownNumber(production.inputTokens) || knownNumber(production.outputTokens)) details.push(`Planning / code: ${count(production.inputTokens)} input tokens; ${count(production.outputTokens)} output tokens.`);
    if (knownNumber(production.cachedInputTokens)) details.push(`${count(production.cachedInputTokens)} cached input tokens are already included in input.`);
    if (knownNumber(production.reasoningOutputTokens)) details.push(`${count(production.reasoningOutputTokens)} reasoning output tokens are already included in output.`);
    if (production.complete === false) details.push('This is a recorded snapshot, not a final project total.');
    if (Array.isArray(production.actualModels) && production.actualModels.length) details.push(`Recorded coding models: ${production.actualModels.join(', ')}.`);
    if (Array.isArray(production.actualEfforts) && production.actualEfforts.length) details.push(`Recorded reasoning settings: ${production.actualEfforts.join(', ')}.`);
    $('slop-ledger-asof').textContent = details.join(' ');
    $('slop-phrases').replaceChildren(...phrases.map((phrase) => textElement('li', phrase.text || 'Phrase not recorded')));
    $('slop-styles').replaceChildren(...styles.map((style) => {
      const article = textElement('article', '', 'slop-style-entry');
      article.append(textElement('p', style.family || 'Style direction', 'slop-style-family'), textElement('h3', style.name || 'Unnamed style'), textElement('p', style.description || 'No description recorded.'));
      return article;
    }));
    state.ledgerBuilt = true;
  }

  const tabs = [...document.querySelectorAll('.slop-tabs [role="tab"]')];
  function selectTab(selected, focus = false) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !active;
    }
    $('slop-ledger').querySelector('.slop-dialog-scroll').scrollTop = 0;
    if (focus) selected.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = mod(index + 1, tabs.length);
      if (event.key === 'ArrowLeft') next = mod(index - 1, tabs.length);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
    });
  });

  $('slop-work-previous').addEventListener('click', () => openWork(state.currentWork - 1));
  $('slop-work-next').addEventListener('click', () => openWork(state.currentWork + 1));
  $('slop-search').addEventListener('input', buildIndex);
  $('slop-home').addEventListener('click', home);
  $('slop-brand').addEventListener('click', home);
  $('slop-zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
  $('slop-zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('slop-zoom-reset').addEventListener('click', () => {
    if (works.length) zoomAt(state.defaultZoom, state.width / 2, state.height / 2, true);
  });
  $('slop-shuffle').addEventListener('click', () => {
    if (works.length < 2) return;
    stopMotion();
    const previousOrder = order.join(',');
    for (let index = order.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
    if (previousOrder === order.join(',')) order.push(order.shift());
    wall.replaceChildren();
    tiles.clear();
    state.nearestKey = '';
    requestRender();
    announce('The artwork has been rearranged.');
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (anyDialogOpen()) {
      if ($('slop-work').open && !event.target.closest('summary, details[open]')) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          openWork(state.currentWork + (event.key === 'ArrowLeft' ? -1 : 1));
        }
      }
      return;
    }
    if (!works.length) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.25); return; }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(1 / 1.25); return; }
    if (event.key === 'Home') { event.preventDefault(); home(); return; }
    if (event.target !== stage && event.target !== document.body && !event.target.closest('.slop-card')) return;
    if (event.key === 'Enter' && (event.target === stage || event.target === document.body)) {
      event.preventDefault();
      const cell = nearestCell();
      openWork(indexAt(cell.column, cell.row));
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const cell = state.tween ? nearestCell(state.tween.to.x, state.tween.to.y) : nearestCell();
    let column = cell.column;
    let row = cell.row;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      column += event.key === 'ArrowLeft' ? -1 : 1;
      row = Math.round((cell.y - TILE / 2 - columnOffset(column)) / PITCH);
    } else row += event.key === 'ArrowUp' ? -1 : 1;
    const center = centerOf(column, row);
    moveTo(center.x, center.y, state.zoom, focusCentered);
  });

  window.addEventListener('resize', resize);
  window.addEventListener('popstate', syncWorkRoute);
  window.addEventListener('hashchange', syncWorkRoute);
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('blur', clearPointers);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPointers(); });
  motionPreference.addEventListener('change', () => { stopMotion(); requestRender(); });

  $('slop-nav-count').textContent = String(works.length);
  $('slop-phrase-count').textContent = String(phrases.length);
  $('slop-style-count').textContent = String(styles.length);
  $('slop-repeat-note').textContent = `There ${works.length === 1 ? 'is' : 'are'} ${number.format(works.length)} unique ${works.length === 1 ? 'work' : 'works'} here. The wall repeats ${works.length === 1 ? 'it' : 'them'} as you move; it does not generate new images while you browse.`;
  $('slop-empty').hidden = works.length > 0;
  for (const id of ['slop-zoom-reset', 'slop-home', 'slop-brand']) $(id).disabled = !works.length;
  $('slop-shuffle').disabled = works.length < 2;
  resize();
  syncWorkRoute();
})();
