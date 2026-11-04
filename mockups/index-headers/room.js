// Shared by both headers: cover the room box with the photo, aimed at the row of
// slots, and pin each slot's element (sleeve or poster) under its hole.
export const $ = (id) => document.getElementById(id);

export function placeRoom(meta, slotEls, onLayout) {
  const roomEl = $('room');
  const rows = meta.slots;
  const top0 = Math.min(...rows.map((s) => s[1])), bot0 = Math.max(...rows.map((s) => s[1] + s[3]));
  function layout() {
    const w = roomEl.clientWidth, fullH = roomEl.clientHeight, inset = 72;
    const width = Math.max(w, fullH * meta.aspect) * 1.02;
    const height = width / meta.aspect;
    const left = (w - width) / 2;
    const top = Math.min(0, Math.max(fullH - height, inset + (fullH - inset) / 2 - ((top0 + bot0) / 2) * height));
    const put = (el, x, y, bw, bh, bleed = 0) => Object.assign(el.style, {
      left: `${left + x * width - bleed}px`, top: `${top + y * height - bleed}px`,
      width: `${bw * width + 2 * bleed}px`, height: `${bh * height + 2 * bleed}px`,
    });
    for (const id of ['roomImg', 'shade', 'tint']) put($(id), 0, 0, 1, 1);
    rows.forEach(([x, y, bw, bh], i) => {
      const el = slotEls[i];
      if (!el) return;
      put(el, x, y, bw, bh, 3);
      el.style.setProperty('--u', `${(bw * width + 6) / 100}px`);
    });
    onLayout?.();
  }
  new ResizeObserver(layout).observe(roomEl);
  document.fonts.ready.then(layout);
}

export const flood = (pal) => {
  const s = document.documentElement.style;
  s.setProperty('--flood', pal.flood);
  s.setProperty('--ink', pal.ink);
  s.setProperty('--ground', pal.ground || '#1c1916');
};

export const year = (r) => r.year_original || Number(r.date_release_year?.slice(0, 4)) || '';
export const n = (v) => v.toLocaleString('en-GB');
