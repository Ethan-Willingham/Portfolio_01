/* Native dialog enhancement. Image anchors still work without JavaScript. */
(() => {
  const links = [...document.querySelectorAll('.shot-image')];
  if (!links.length || typeof HTMLDialogElement === 'undefined') return;

  const viewer = document.createElement('dialog');
  viewer.className = 'ocean-viewer';
  viewer.setAttribute('aria-labelledby', 'ocean-viewer-title');
  viewer.innerHTML = `
    <div class="ocean-viewer-head">
      <p class="ocean-viewer-title" id="ocean-viewer-title"></p>
      <button type="button" class="ocean-viewer-close" autofocus>Close</button>
    </div>
    <img alt="">
    <div class="ocean-viewer-foot">
      <div class="ocean-viewer-nav">
        <button type="button" class="ocean-viewer-prev" aria-label="Previous photograph">Previous</button>
        <button type="button" class="ocean-viewer-next" aria-label="Next photograph">Next</button>
      </div>
      <p class="ocean-viewer-count" aria-live="polite"></p>
      <a class="ocean-viewer-original" target="_blank" rel="noopener">Full size</a>
    </div>`;
  document.body.append(viewer);
  const image = viewer.querySelector('img');
  const title = viewer.querySelector('.ocean-viewer-title');
  const count = viewer.querySelector('.ocean-viewer-count');
  const original = viewer.querySelector('.ocean-viewer-original');
  let current = 0, opener, previousOverflow;

  function show(index) {
    current = (index + links.length) % links.length;
    const link = links[current];
    const thumbnail = link.querySelector('img');
    image.src = link.href;
    image.alt = thumbnail.alt;
    title.textContent = link.closest('figure').querySelector('.sp').textContent;
    count.textContent = `${current + 1} / ${links.length}`;
    original.href = link.href;
  }

  links.forEach((link, index) => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      previousOverflow = document.body.style.overflow;
      show(index);
      viewer.showModal();
      document.body.style.overflow = 'hidden';
    });
  });
  viewer.querySelector('.ocean-viewer-close').addEventListener('click', () => viewer.close());
  viewer.querySelector('.ocean-viewer-prev').addEventListener('click', () => show(current - 1));
  viewer.querySelector('.ocean-viewer-next').addEventListener('click', () => show(current + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  viewer.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    image.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
})();
