(function (root) {
  'use strict';
  const O = root.OneShift, SVG = 'http://www.w3.org/2000/svg';
  let serial = 0;
  const svgNode = (name, attributes = {}) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };

  // The same source path clips the native button and draws its hover contour.
  // onHover receives (id, label), or (null, '') when no object is highlighted.
  class PlaceArt {
    constructor({container, image, targets, onChoose, onHover}) {
      this.container = container;
      this.image = image;
      this.targetLayer = targets;
      this.onChoose = onChoose || (() => {});
      this.onHover = onHover || (() => {});
      this.prefix = 'place-art-' + (++serial) + '-';
      this.nodes = new Map();
      this.definitions = [];
      this.width = 1536;
      this.height = 1024;
      this.pointerId = null;
      this.focusId = null;
      this.highlighted = null;
      this.touch = null;
      this.suppressClick = null;
      this.listeners = [];
      this.context = document.createElement('canvas').getContext('2d');
      this.container.classList.add('place-art-engine');
      this.targetLayer.classList.add('place-art-hitmap');
      this.overlay = svgNode('svg', {class:'place-art-contours', 'aria-hidden':'true', focusable:'false', preserveAspectRatio:'none'});
      this.defs = svgNode('defs');
      this.overlay.append(this.defs);
      this.container.append(this.overlay);
      this.listen(this.targetLayer, 'click', event => this.click(event));
      this.listen(this.targetLayer, 'pointerover', event => {
        if (event.pointerType === 'touch') return;
        this.pointerId = this.target(event.target)?.definition.id || null;
        this.paintHighlight();
      });
      this.listen(this.targetLayer, 'pointerout', event => {
        if (event.pointerType === 'touch') return;
        this.pointerId = this.target(event.relatedTarget)?.definition.id || null;
        this.paintHighlight();
      });
      this.listen(this.targetLayer, 'focusin', event => {
        const target = this.target(event.target);
        this.focusId = target?.button.matches(':focus-visible') ? target.definition.id : null;
        this.paintHighlight();
      });
      this.listen(this.targetLayer, 'focusout', event => {
        this.focusId = this.target(event.relatedTarget)?.definition.id || null;
        this.paintHighlight();
      });
      this.listen(this.container, 'pointerdown', event => this.pointerDown(event), {capture:true});
      this.listen(this.container, 'pointerup', event => this.pointerUp(event), {capture:true});
      this.listen(this.container, 'pointercancel', event => this.cancelTouch(event), {capture:true});
      this.listen(this.container, 'lostpointercapture', event => this.cancelTouch(event), {capture:true});
      this.listen(this.container, 'pointerleave', () => {
        if (!this.touch) { this.pointerId = null; this.paintHighlight(); }
      });
      this.listen(this.image, 'load', () => this.resize());
      this.listen(root, 'blur', () => this.suspend());
      this.listen(document, 'visibilitychange', () => { if (document.hidden) this.suspend(); });
      // A touch may replace the entire room before its compatibility click.
      // Suppress only that same gesture, leaving keyboard activation untouched.
      this.listen(document, 'click', event => {
        const suppress = this.suppressClick;
        if (!suppress || event.detail === 0) return;
        this.suppressClick = null;
        if (performance.now() - suppress.time < 900 && Math.hypot(event.clientX-suppress.x,event.clientY-suppress.y) < 32) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, {capture:true});
      this.listen(document, 'pointerdown', () => { this.suppressClick = null; }, {capture:true});
    }

    listen(node, type, fn, options) {
      node.addEventListener(type, fn, options);
      this.listeners.push(() => node.removeEventListener(type, fn, options));
    }

    setScene({width = 1536, height = 1024, targets = []}) {
      this.clear();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Place art needs positive source dimensions.');
      this.width = width; this.height = height;
      this.overlay.setAttribute('viewBox', '0 0 '+width+' '+height);
      for (const definition of targets) {
        const {id, label, path, bounds, point} = definition;
        if (typeof id !== 'string' || this.nodes.has(id) || typeof path !== 'string' || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= 0 || bounds[3] <= 0) throw new Error('Invalid place target.');
        const shape = new Path2D(path);
        const inside = Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) ? point.slice() : [bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2];
        const record = {id, label:String(label || id), path, bounds:bounds.slice(), point:inside};
        this.definitions.push(record);
        const clipId = this.prefix + this.nodes.size;
        const clip = svgNode('clipPath', {id:clipId, clipPathUnits:'objectBoundingBox'});
        const clipShape = svgNode('path', {d:path});
        clip.append(clipShape); this.defs.append(clip);
        const contour = svgNode('g', {class:'place-art-contour', 'data-place-outline':id});
        const outer = svgNode('path', {d:path, class:'place-art-contour-outer', 'vector-effect':'non-scaling-stroke'});
        const inner = svgNode('path', {d:path, class:'place-art-contour-inner', 'vector-effect':'non-scaling-stroke'});
        contour.append(outer, inner); this.overlay.append(contour);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'place-target';
        button.dataset.place = id;
        button.dataset.pointX = String(inside[0]/width);
        button.dataset.pointY = String(inside[1]/height);
        button.dataset.sourceBounds = bounds.join(',');
        button.setAttribute('aria-label', record.label);
        button.style.clipPath = 'url(#'+clipId+')';
        button.style.webkitClipPath = 'url(#'+clipId+')';
        this.targetLayer.append(button);
        // Source-space samples are only used to measure touch distance. Desktop
        // hit testing is the exact path, with no expanded rectangular target.
        const samples = [];
        let length = 0;
        try { length = inner.getTotalLength(); } catch (_) {}
        const steps = Math.min(4096, Math.max(1, Math.ceil(length/3)));
        if (length) for (let i=0; i<=steps; i++) {
          const p = inner.getPointAtLength(length*i/steps); samples.push([p.x,p.y]);
        }
        this.nodes.set(id, {definition:record, button, contour, clip, clipShape, shape, samples});
      }
      this.resize();
    }

    setLabel(id, label) {
      const target = this.nodes.get(id); if (!target) return;
      target.definition.label = String(label);
      target.button.setAttribute('aria-label', target.definition.label);
      if (this.highlighted === id) this.onHover(id,target.definition.label);
    }

    resize() {
      this.cancelTouch();
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      for (const target of this.nodes.values()) {
        const [x,y,width,height] = target.definition.bounds;
        // Keep a useful accessible element rectangle on small screens. The
        // clip still follows the original object and remains transparent.
        const w = Math.max(width,44*this.width/rect.width), h = Math.max(height,44*this.height/rect.height);
        const left = x+(width-w)/2, top = y+(height-h)/2;
        Object.assign(target.button.style,{left:left/this.width*100+'%',top:top/this.height*100+'%',width:w/this.width*100+'%',height:h/this.height*100+'%'});
        target.clipShape.setAttribute('transform','matrix('+1/w+' 0 0 '+1/h+' '+(-left/w)+' '+(-top/h)+')');
      }
    }

    target(node) {
      const button = node?.closest?.('.place-target[data-place]');
      return button && this.targetLayer.contains(button) ? this.nodes.get(button.dataset.place) : null;
    }

    sourcePoint(clientX, clientY) {
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {x:(clientX-rect.left)/rect.width*this.width,y:(clientY-rect.top)/rect.height*this.height,sx:rect.width/this.width,sy:rect.height/this.height};
    }

    inside(target, point) {
      return point && this.context.isPointInPath(target.shape,point.x,point.y);
    }

    pick(point, touchSlop = false) {
      if (!point) return null;
      const list = [...this.nodes.values()].reverse();
      const exact = list.find(target => !target.button.disabled && this.inside(target,point));
      if (exact || !touchSlop) return exact || null;
      let best = null, distance = 22;
      for (const target of list) {
        if (target.button.disabled) continue;
        const [x,y,w,h] = target.definition.bounds;
        // Only small artwork needs the invisible nearest-contour allowance.
        if (w*point.sx >= 44 && h*point.sy >= 44) continue;
        if ((x-point.x)*point.sx>22 || (point.x-x-w)*point.sx>22 || (y-point.y)*point.sy>22 || (point.y-y-h)*point.sy>22) continue;
        for (const [px,py] of target.samples) {
          const d = Math.hypot((point.x-px)*point.sx,(point.y-py)*point.sy);
          if (d < distance) { distance = d; best = target; }
        }
      }
      return best;
    }

    click(event) {
      const target = this.target(event.target); if (!target || target.button.disabled) return;
      event.stopPropagation();
      if (event.detail > 0 && !this.inside(target,this.sourcePoint(event.clientX,event.clientY))) { event.preventDefault(); return; }
      this.onChoose(target.definition.id);
    }

    pointerDown(event) {
      if (event.pointerType !== 'touch' || event.button > 0) {
        this.focusId = null; this.paintHighlight(); return;
      }
      const target = this.pick(this.sourcePoint(event.clientX,event.clientY),true);
      if (!target) return;
      this.touch = {pointer:event.pointerId,id:target.definition.id,x:event.clientX,y:event.clientY};
      this.pointerId = target.definition.id; this.focusId = null; this.paintHighlight();
      this.container.setPointerCapture?.(event.pointerId);
      event.preventDefault(); event.stopPropagation();
    }

    pointerUp(event) {
      const touch = this.touch;
      if (!touch || touch.pointer !== event.pointerId) return;
      const target = this.pick(this.sourcePoint(event.clientX,event.clientY),true);
      const activate = target?.definition.id === touch.id && Math.hypot(event.clientX-touch.x,event.clientY-touch.y) <= 12;
      this.touch = null; this.pointerId = null; this.paintHighlight();
      if (this.container.hasPointerCapture?.(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
      this.suppressClick = {x:event.clientX,y:event.clientY,time:performance.now()};
      if (activate) target.button.click();
    }

    cancelTouch(event) {
      if (!this.touch || event?.pointerId !== undefined && this.touch.pointer !== event.pointerId) return;
      const id = this.touch.pointer;
      this.suppressClick = {x:this.touch.x,y:this.touch.y,time:performance.now()};
      this.touch = null; this.pointerId = null; this.paintHighlight();
      if (this.container.hasPointerCapture?.(id)) this.container.releasePointerCapture(id);
    }

    paintHighlight() {
      const id = this.focusId || this.pointerId;
      if (id === this.highlighted) return;
      this.highlighted = id;
      for (const [key,target] of this.nodes) target.contour.classList.toggle('is-highlighted',key===id);
      const target = this.nodes.get(id);
      this.onHover(target ? id : null,target?.definition.label || '');
    }

    suspend() {
      this.cancelTouch();
      this.pointerId = null; this.focusId = null;
      this.paintHighlight();
    }

    clear() {
      this.cancelTouch();
      this.pointerId = null; this.focusId = null;
      this.targetLayer.replaceChildren();
      this.defs.replaceChildren();
      this.overlay.querySelectorAll('.place-art-contour').forEach(node=>node.remove());
      this.nodes.clear(); this.definitions = [];
      this.highlighted = null;
      this.onHover(null,'');
    }

    destroy() {
      this.clear();
      this.listeners.forEach(remove=>remove()); this.listeners = [];
      this.overlay.remove();
      this.container.classList.remove('place-art-engine');
      this.targetLayer.classList.remove('place-art-hitmap');
    }
  }
  O.PlaceArt = PlaceArt;
})(window);
