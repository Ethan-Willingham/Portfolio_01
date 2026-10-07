/* Local review selections. Artwork and the live catalogue are never changed here. */
(() => {
  'use strict';

  const works = (window.SLOP_DATA?.works || []).filter(work => work.generation?.status === 'complete' && work.image);
  const storageKey = 'slop-review-selection-v1';
  const grid = document.getElementById('review-grid');
  const count = document.getElementById('review-count');
  const copy = document.getElementById('copy-selection');
  const status = document.getElementById('copy-status');
  const filter = document.getElementById('selected-only');
  const output = document.getElementById('selection-text');
  const exportPanel = document.getElementById('review-export');
  const empty = document.getElementById('review-empty');
  const saveNote = document.getElementById('save-note');
  const cards = new Map();
  let selected = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) selected = new Set(saved.filter(id => works.some(work => work.id === id)));
  } catch {
    saveNote.textContent = 'Browser storage is unavailable. Copy your list before closing this page.';
  }

  function renderSelection() {
    const chosen = works.filter(work => selected.has(work.id));
    count.textContent = `${chosen.length} of ${works.length} selected`;
    copy.disabled = !chosen.length;
    output.value = chosen.length
      ? `Please update these Slop works:\n\n${chosen.map(work => `${work.id} - ${work.title}`).join('\n')}`
      : '';
    for (const [id, { card, button, mark }] of cards) {
      const picked = selected.has(id);
      button.setAttribute('aria-pressed', String(picked));
      mark.textContent = picked ? 'Selected for update' : 'Click to select';
      card.hidden = filter.checked && !picked;
    }
    empty.hidden = !filter.checked || chosen.length > 0;
  }

  works.forEach((work, index) => {
    const card = document.createElement('article');
    card.className = 'review-card';
    card.dataset.workId = work.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-select';
    button.setAttribute('aria-label', `${work.id}: ${work.title}`);
    button.setAttribute('aria-pressed', 'false');

    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = work.image;
    const image = document.createElement('img');
    image.src = work.fallback || work.image;
    image.alt = work.alt || work.title;
    image.width = work.width;
    image.height = work.height;
    image.loading = index === 0 ? 'eager' : 'lazy';
    image.decoding = 'async';
    picture.append(source, image);

    const caption = document.createElement('span');
    caption.className = 'review-caption';
    const meta = document.createElement('span');
    meta.className = 'review-meta';
    const number = document.createElement('span');
    number.textContent = work.id;
    const mark = document.createElement('span');
    mark.className = 'review-mark';
    meta.append(number, mark);
    const title = document.createElement('span');
    title.className = 'review-title';
    title.textContent = work.title;
    caption.append(meta, title);
    button.append(picture, caption);

    const full = document.createElement('a');
    full.className = 'review-full';
    full.href = work.image;
    full.target = '_blank';
    full.rel = 'noopener';
    full.textContent = 'View full size';
    full.setAttribute('aria-label', `View ${work.id} full size in a new tab`);
    card.append(button, full);
    cards.set(work.id, { card, button, mark });
    grid.append(card);

    button.addEventListener('click', () => {
      if (selected.has(work.id)) selected.delete(work.id);
      else selected.add(work.id);
      status.textContent = '';
      renderSelection();
      if (card.hidden) {
        const next = [...cards.values()].find(item => !item.card.hidden);
        (next?.button || filter).focus();
      }
      try { localStorage.setItem(storageKey, JSON.stringify([...selected])); }
      catch { saveNote.textContent = 'Browser storage is unavailable. Copy your list before closing this page.'; }
    });
  });

  filter.addEventListener('change', renderSelection);
  copy.addEventListener('click', async () => {
    const text = output.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied. Paste the list into our chat.';
    } catch {
      exportPanel.open = true;
      output.focus();
      output.select();
      status.textContent = 'Select and copy the list below, then paste it into our chat.';
    }
  });

  renderSelection();
  if (!works.length) count.textContent = 'Artwork could not load. Try refreshing the page.';
})();
