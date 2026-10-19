/* Runs inside the page (injected by audit.mjs). Exposes window.__audit.{layout,svgs}. */
(() => {
  const SHAPES = 'rect,ellipse,circle,path,polygon,polyline,line,image';
  const tol = 1;
  const pathOf = (el, root) => {
    const parts = [];
    for (let e = el; e && e !== root && parts.length < 5; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      else if (typeof e.className === 'string' && e.className.trim()) s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const headings = () => [...document.querySelectorAll('.report h1,.report h2,.report h3')];
  const headingOf = (el, hs) => {
    let best = '';
    for (const h of hs) { if (h === el || (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) best = h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80); else break; }
    return best;
  };
  const captionOf = (svg) => {
    const fig = svg.closest('figure');
    const c = fig && fig.querySelector('.report-figure-caption');
    if (c) return c.textContent.trim().replace(/\s+/g, ' ').slice(0, 110);
    if (fig && fig.id) return fig.id;
    return (svg.closest('.hmi-reference') ? 'HMI design picture (.hmi-reference svg)' : svg.closest('.hmi-sim-container') ? 'HMI simulator widget svg (inside #portable-hmi-canvas)' : (svg.getAttribute('aria-label') || 'svg outside figure'));
  };
  const r2 = (n) => Math.round(n * 10) / 10;

  function layout(opts) {
    const report = document.querySelector('.report');
    const rr = report.getBoundingClientRect();
    const cs = getComputedStyle(report);
    const left = rr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const right = rr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const hs = headings();
    const out = { content: { left: r2(left), right: r2(right), width: r2(right - left) }, overflow: [], clipped: [], figuresTooTall: [], legibility: [], docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth };
    out.docOverflow = out.docScrollWidth > out.docClientWidth;
    const offending = new Set();
    const rows = [];
    for (const el of report.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName)) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const over = Math.max(b.right - right, left - b.left);
      if (over > tol) { offending.add(el); rows.push({ el, over, b }); }
      if (el.tagName !== 'svg' && st.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + tol && el.clientWidth > 0)
        out.clipped.push({ path: pathOf(el, report), section: headingOf(el, hs), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: st.overflowX });
    }
    // report topmost offenders only (children of an offender are a consequence)
    for (const { el, over, b } of rows) {
      let p = el.parentElement, nested = false;
      while (p && p !== report) { if (offending.has(p)) { nested = true; break; } p = p.parentElement; }
      if (nested) continue;
      const kids = [...el.querySelectorAll('*')].filter(k => offending.has(k)).length;
      out.overflow.push({ path: pathOf(el, report), section: headingOf(el, hs), overflowPx: r2(over), width: r2(b.width), left: r2(b.left), right: r2(b.right), offendingDescendants: kids, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50) });
    }
    for (const fig of report.querySelectorAll('figure.report-figure')) {
      const h = fig.getBoundingClientRect().height;
      if (h > opts.maxFigureH) out.figuresTooTall.push({ caption: (fig.querySelector('.report-figure-caption') || fig).textContent.trim().replace(/\s+/g, ' ').slice(0, 110), id: fig.id, heightPx: r2(h), limitPx: opts.maxFigureH, section: headingOf(fig, hs) });
    }
    for (const svg of report.querySelectorAll('svg')) {
      if (svg.closest('svg') !== svg) continue;
      const vb = svg.viewBox && svg.viewBox.baseVal;
      const w = svg.getBoundingClientRect().width;
      if (!vb || !vb.width || !w) continue;
      const scale = w / vb.width;
      let min = Infinity, minText = '';
      for (const t of svg.querySelectorAll('text')) {
        if (!t.textContent.trim() || t.closest('defs')) continue;
        const fs = parseFloat(getComputedStyle(t).fontSize);
        if (fs < min) { min = fs; minText = t.textContent.trim().slice(0, 30); }
      }
      if (min === Infinity) continue;
      if (min * scale < opts.minFontPx) out.legibility.push({ caption: captionOf(svg), scale: r2(scale * 100) / 100, minFontUser: min, effectiveFontPx: r2(min * scale), text: minText, section: headingOf(svg, hs) });
    }
    return out;
  }

  // ---- SVG geometry (all coordinates converted to the svg's own user units) ----
  function svgs() {
    const defects = [];
    const hs = headings();
    for (const svg of document.querySelectorAll('.report svg')) {
      if (svg.closest('svg') !== svg) continue;
      const vbR = svg.viewBox && svg.viewBox.baseVal;
      const m = svg.getScreenCTM();
      if (!m) continue;
      const inv = m.inverse();
      const caption = captionOf(svg);
      const section = headingOf(svg, hs);
      const add = (cls, detail, extra) => defects.push({ cls, caption, section, detail, ...extra });
      const toUser = (b) => {
        const p1 = new DOMPoint(b.left, b.top).matrixTransform(inv), p2 = new DOMPoint(b.right, b.bottom).matrixTransform(inv);
        return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
      };
      const box = (el) => toUser(el.getBoundingClientRect());
      const inkBox = (el) => { const b = box(el); const k = b.h * 0.15; return { x: b.x, y: b.y + k, w: b.w, h: b.h - 2 * k }; };
      const ix = (a, b) => ({ x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
      const inside = (a, b, t = tol) => a.x >= b.x - t && a.y >= b.y - t && a.x + a.w <= b.x + b.w + t && a.y + a.h <= b.y + b.h + t;
      const label = (t) => (t.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);

      // nodes
      const nodeEls = [...svg.querySelectorAll('[data-w]')].filter(n => !n.closest('defs'));
      const nodes = nodeEls.map((el, i) => {
        const shapes = [...el.children].filter(c => c.matches(SHAPES));
        let b = null;
        for (const s of shapes) { const sb = box(s); b = b ? { x: Math.min(b.x, sb.x), y: Math.min(b.y, sb.y), w: 0, h: 0, r: Math.max(b.x + b.w, sb.x + sb.w), bt: Math.max(b.y + b.h, sb.y + sb.h) } : { ...sb, r: sb.x + sb.w, bt: sb.y + sb.h }; if (b.r !== undefined) { b.w = b.r - b.x; b.h = b.bt - b.y; } }
        const dx = parseFloat(el.getAttribute('data-x')), dy = parseFloat(el.getAttribute('data-y')), dw = parseFloat(el.getAttribute('data-w')), dh = parseFloat(el.getAttribute('data-h'));
        if (!b) b = box(el);
        if ([dx, dy, dw, dh].every(Number.isFinite)) { // declared node area (e.g. an actor's label sits below its icon shapes)
          const x = Math.min(b.x, dx), y = Math.min(b.y, dy), r = Math.max(b.x + b.w, dx + dw), bt = Math.max(b.y + b.h, dy + dh);
          b = { x, y, w: r - x, h: bt - y };
        }
        const first = shapes[0];
        const kind = first ? first.tagName.toLowerCase() : 'rect';
        const id = el.getAttribute('data-node-id') || '';
        const lab = label([...el.querySelectorAll('text')][0] || el);
        return { el, i, b: { x: b.x, y: b.y, w: b.w, h: b.h }, kind, name: (id || lab || 'node#' + i) + (id && lab ? ` "${lab}"` : '') };
      });
      for (const n of nodes) n.container = nodes.some(o => o !== n && o.el !== n.el && n.el.contains(o.el) === true) || nodes.some(o => o !== n && inside(o.b, n.b, 0.5) && o.b.w * o.b.h < n.b.w * n.b.h * 0.98);
      const ancestorsOf = (n) => nodes.filter(o => o !== n && (o.el.contains(n.el) || (inside(n.b, o.b, 0.5) && o.b.w * o.b.h > n.b.w * n.b.h)));
      const ownerOf = (t) => { const g = t.closest('[data-w]'); return g ? nodes.find(n => n.el === g) : null; };
      const ellipseHit = (n, px, py, inset) => { const rx = n.b.w / 2 - inset, ry = n.b.h / 2 - inset; if (rx <= 0 || ry <= 0) return false; const dx = (px - (n.b.x + n.b.w / 2)) / rx, dy = (py - (n.b.y + n.b.h / 2)) / ry; return dx * dx + dy * dy < 1; };
      const hit = (n, px, py, inset) => (n.kind === 'ellipse' || n.kind === 'circle') ? ellipseHit(n, px, py, inset) : (px > n.b.x + inset && px < n.b.x + n.b.w - inset && py > n.b.y + inset && py < n.b.y + n.b.h - inset);

      // texts
      const texts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim() && !t.closest('defs') && getComputedStyle(t).display !== 'none')
        .map(t => ({ el: t, b: inkBox(t), s: label(t), owner: ownerOf(t) }));
      // (i) text vs text
      for (let a = 0; a < texts.length; a++) for (let c = a + 1; c < texts.length; c++) {
        const o = ix(texts[a].b, texts[c].b);
        if (o.x > tol && o.y > tol) add('text-overlap', `"${texts[a].s}" x "${texts[c].s}"`, { overlapX: r2(o.x), overlapY: r2(o.y) });
      }
      // (ii) text vs node borders
      for (const t of texts) {
        const ink = t.b;
        if (t.owner) {
          const nb = t.owner.b;
          const touches = ix(ink, nb); // a label entirely outside its node (port labels beside the border) is not a crossing
          if (!inside(ink, nb, tol) && touches.x > tol && touches.y > tol) {
            const dx = Math.max(nb.x - ink.x, ink.x + ink.w - (nb.x + nb.w), 0);
            const dy = Math.max(nb.y - ink.y, ink.y + ink.h - (nb.y + nb.h), 0);
            add('text-crosses-node-border', `"${t.s}" in ${t.owner.name}`, { overflowX: r2(dx), overflowY: r2(dy) });
          }
        }
        for (const n of nodes) {
          if (n === t.owner) continue;
          if (t.owner && ancestorsOf(t.owner).includes(n)) {
            // own container: text must not sit over another child of it, handled by the other nodes in this loop
            continue;
          }
          const o = ix(ink, n.b);
          if (!(o.x > tol && o.y > tol)) continue;
          const full = inside(ink, n.b, tol);
          if (full && n.container && !t.owner) continue; // a free label inside a frame/composite is fine
          if (full && t.owner && ancestorsOf(t.owner).includes(n)) continue;
          add(full ? 'text-over-node' : 'text-crosses-node-border', `"${t.s}"${t.owner ? ' in ' + t.owner.name : ''} x ${n.name}`, { overlapX: r2(o.x), overlapY: r2(o.y) });
        }
      }
      // (iii) edges through foreign nodes
      for (const p of svg.querySelectorAll('path[id*="edge-"]')) {
        const len = p.getTotalLength(); if (!len) continue;
        const pm = inv.multiply(p.getScreenCTM());
        const pts = [];
        for (let d = 0; d <= len; d += 4) pts.push(new DOMPoint(...(() => { const q = p.getPointAtLength(d); return [q.x, q.y]; })()).matrixTransform(pm));
        const e = p.getPointAtLength(len); pts.push(new DOMPoint(e.x, e.y).matrixTransform(pm));
        const near = (pt) => nodes.filter(n => hit(n, pt.x, pt.y, -4));
        const smallest = (list) => list.sort((a, b) => a.b.w * a.b.h - b.b.w * b.b.h)[0];
        const src = smallest(near(pts[0])), tgt = smallest(near(pts[pts.length - 1]));
        const exempt = new Set();
        for (const n of [src, tgt]) if (n) { exempt.add(n); ancestorsOf(n).forEach(a => exempt.add(a)); }
        const crossed = new Map();
        for (const n of nodes) {
          if (exempt.has(n)) continue;
          // a node that wholly contains an endpoint node is exempt already; nodes inside the src/tgt (e.g. a composite) too
          if ((src && inside(n.b, src.b, 0.5)) || (tgt && inside(n.b, tgt.b, 0.5))) continue;
          let c = 0;
          for (const pt of pts) if (hit(n, pt.x, pt.y, 3)) c++;
          if (c) crossed.set(n, c);
        }
        for (const [n, c] of crossed) add('edge-through-node', `${p.id} (${src ? src.name : '?'} -> ${tgt ? tgt.name : '?'}) passes through ${n.name}`, { samplesInside: c, approxPx: c * 4 });
      }
      // (iv) outside the viewBox
      if (vbR && vbR.width) {
        const V = { x: vbR.x, y: vbR.y, w: vbR.width, h: vbR.height };
        const seen = new Set();
        for (const el of svg.querySelectorAll(SHAPES + ',text')) {
          if (el.closest('defs') || el.closest('marker') || seen.has(el)) continue;
          if (getComputedStyle(el).display === 'none') continue;
          const b = el.tagName.toLowerCase() === 'text' ? inkBox(el) : box(el);
          if (b.w === 0 && b.h === 0) continue;
          const dl = V.x - b.x, dt = V.y - b.y, dr = b.x + b.w - (V.x + V.w), db = b.y + b.h - (V.y + V.h);
          const worst = Math.max(dl, dt, dr, db);
          if (worst > tol) add('outside-viewbox', `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.tagName.toLowerCase() === 'text' ? ' "' + label(el) + '"' : ''}`, { outsidePx: r2(worst), side: worst === dl ? 'left' : worst === dt ? 'top' : worst === dr ? 'right' : 'bottom' });
        }
      }
      // (v) sibling nodes overlapping (containment is legitimate)
      for (let a = 0; a < nodes.length; a++) for (let c = a + 1; c < nodes.length; c++) {
        const A = nodes[a], B = nodes[c];
        const o = ix(A.b, B.b);
        if (!(o.x > tol && o.y > tol)) continue;
        if (inside(A.b, B.b, 1) || inside(B.b, A.b, 1)) continue;
        add('node-overlap', `${A.name} x ${B.name}`, { overlapX: r2(o.x), overlapY: r2(o.y) });
      }
    }
    return defects;
  }
  window.__audit = { layout, svgs };
})();
