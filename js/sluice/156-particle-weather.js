  /* ---- One outdoor weather volume, streamed around the view ---- */
  // The storm's clock, intensity and type belong to the world. These bounds
  // only limit the work: neither horizontal travel nor altitude ends a storm.
  function particleWeatherRect() {
    return { left: Math.max(3, cam.x - 160), right: Math.min(COLS * TILE - 3, cam.x + screenW + 160),
      top: cam.y - 160, bottom: Math.min(SKY_ROWS * TILE - 8, cam.y + screenH + 160) };
  }
  function particleWeatherReveal(rect, old, fill) {
    if (rect.right <= rect.left || rect.bottom <= rect.top) return;
    if (!old) { fill(rect.left, rect.right, rect.top, rect.bottom); return; }
    var left = Math.max(rect.left, old.left), right = Math.min(rect.right, old.right);
    if (right <= left || rect.bottom <= old.top || rect.top >= old.bottom) {
      fill(rect.left, rect.right, rect.top, rect.bottom); return;
    }
    // Disjoint new strips. Never refill the overlap or the rig's cleared wake.
    fill(rect.left, left, rect.top, rect.bottom);
    fill(right, rect.right, rect.top, rect.bottom);
    fill(left, right, rect.top, Math.min(rect.bottom, old.top));
    fill(left, right, Math.max(rect.top, old.bottom), rect.bottom);
  }
