/**
 * Flat, editorial compositions for the video compositor.
 * Coordinates are logical source coordinates (normally 1280 × source aspect).
 * No frame history or random numbers: seeking and exporting give the same frame.
 */
const PAPER = '#f3f1e9';
const WHITE = '#fffdf7';
const INK = '#20201c';
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fraction = value => ((value % 1) + 1) % 1;
const ease = value => 1 - (1 - clamp(value, 0, 1)) ** 3;
const line = (ctx, x, y, x2, y2) => {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
};

function caption(value) {
  // Canvas text is inert. Limit extremely long input to keep per-frame work bounded.
  return String(value || 'СДЕЛАЕМ ЭТО').replace(/\s+/g, ' ').trim().slice(0, 280) || 'СДЕЛАЕМ ЭТО';
}

function font(ctx, size, weight = 600, family = 'Arial, sans-serif') {
  ctx.font = `${weight} ${Math.max(1, size)}px ${family}`;
}

function fitText(ctx, text, width, size, weight = 600, minimum = 9) {
  font(ctx, size, weight);
  const measured = ctx.measureText(text).width;
  const fitted = Math.max(minimum, Math.min(size, size * width / Math.max(1, measured)));
  font(ctx, fitted, weight);
  return fitted;
}

function wrapped(ctx, text, width, limit = 6) {
  const output = []; let current = '';
  for (const word of text.split(/\s+/)) {
    if (current && ctx.measureText(`${current} ${word}`).width > width) {
      output.push(current); current = word;
      if (output.length === limit - 1) break;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current && output.length < limit) output.push(current);
  return output;
}

function textBlock(ctx, text, x, y, width, size, leading, count, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; font(ctx, size, 500);
  const rows = wrapped(ctx, text, width, 12);
  for (let i = 0; i < count; i++) ctx.fillText(rows[i % rows.length], x, y + i * leading, width);
  ctx.restore();
}

function faceFocus(faces) {
  const points = faces?.[0]?.landmarks || faces?.[0];
  if (!Array.isArray(points) || !points.length) return {x: .5, y: .43};
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!valid.length) return {x: .5, y: .43};
  const xs = valid.map(point => point.x), ys = valid.map(point => point.y);
  return {x: clamp((Math.min(...xs) + Math.max(...xs)) / 2, 0, 1),
    y: clamp((Math.min(...ys) + Math.max(...ys)) / 2, 0, 1)};
}

/** Cover without stretching. Returns pixel source geometry for transformed tracking. */
function videoWindow(s, x, y, width, height, options = {}) {
  const {ctx, video} = s;
  const sw = video?.videoWidth || video?.width || 0, sh = video?.videoHeight || video?.height || 0;
  if (!sw || !sh || width <= 0 || height <= 0 || (video.readyState !== undefined && video.readyState < 2)) return;
  const focus = options.focus || {x: .5, y: .5};
  const scale = Math.max(width / sw, height / sh) * Math.max(1, options.zoom || 1);
  const cropW = Math.min(sw, width / scale), cropH = Math.min(sh, height / scale);
  const sx = clamp(focus.x * sw - cropW / 2, 0, sw - cropW);
  const sy = clamp(focus.y * sh - cropH / 2, 0, sh - cropH);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.drawImage(video, sx, sy, cropW, cropH, x, y, width, height);
  ctx.restore();
  const geometry = {x, y, width, height, sourceRect: {x: sx, y: sy, width: cropW, height: cropH}};
  s.videoWindows.push(geometry);
  return geometry;
}

function cross(ctx, x, y, size, thickness) {
  ctx.fillRect(x - size / 2, y - thickness / 2, size, thickness);
  ctx.fillRect(x - thickness / 2, y - size / 2, thickness, size);
}

function weatherIcon(ctx, kind, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (kind === 0 || kind === 1) {
    const radius = kind === 0 ? 13 : 10, cx = kind === 0 ? 0 : -10, cy = kind === 0 ? 0 : -10;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();
    for (let ray = 0; ray < 12; ray++) {
      const angle = ray * TAU / 12;
      line(ctx, cx + Math.cos(angle) * (radius + 5), cy + Math.sin(angle) * (radius + 5),
        cx + Math.cos(angle) * (radius + 12), cy + Math.sin(angle) * (radius + 12));
    }
  }
  if ([1, 2, 3, 5].includes(kind)) {
    ctx.beginPath(); ctx.arc(-14, 4, 11, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(-2, -4, 14, Math.PI, TAU); ctx.arc(14, 4, 11, -Math.PI / 2, Math.PI / 2);
    ctx.closePath(); ctx.fill();
    if (kind === 2) {
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(-8, 30); ctx.lineTo(1, 26);
      ctx.lineTo(-2, 39); ctx.lineTo(13, 18); ctx.lineTo(3, 20); ctx.lineTo(7, 14); ctx.closePath(); ctx.fill();
    } else if (kind === 3) {
      for (let i = -1; i <= 1; i++) line(ctx, i * 12 + 3, 22, i * 12 - 2, 32);
    } else if (kind === 5) {
      for (let i = -1; i <= 1; i++) cross(ctx, i * 13, 26 + Math.abs(i) * 4, 7, 1.7);
    }
  }
  if (kind === 4) {
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * 11;
      ctx.beginPath(); ctx.moveTo(-25 + i * 4, yy); ctx.lineTo(11, yy);
      ctx.bezierCurveTo(30, yy, 25, yy - 17, 14, yy - 10); ctx.stroke();
    }
  }
  ctx.restore();
}

/** Every public renderer owns and restores all drawing state, including clipping. */
function composition(draw, replaceBase = null) {
  return input => {
    const s = {...input, color: input.color || '#f36b21', text: caption(input.text),
      t: Number.isFinite(input.t) ? input.t : 0,
      localTime: Number.isFinite(input.localTime) ? input.localTime : (input.t || 0),
      density: clamp(Number.isFinite(input.density) ? input.density : .65, 0, 1),
      variant: Number(input.variant) || 0, audio: input.audio || {}, videoWindows: []};
    s.u = Math.min(s.w, s.h) / 720;
    s.ctx.save();
    try {
      s.ctx.globalCompositeOperation = 'source-over'; s.ctx.globalAlpha = 1;
      s.ctx.textAlign = 'left'; s.ctx.textBaseline = 'alphabetic';
      s.ctx.lineJoin = 'miter'; s.ctx.lineCap = 'butt';
      draw(s);
    } finally { s.ctx.restore(); }
    // A caller may map its landmark pass into these windows instead of the old full frame.
    return replaceBase === null ? undefined : {videoWindows: s.videoWindows, replaceBase};
  };
}

function title(s) {
  const {ctx, w, h, color, text, u, localTime, density} = s;
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  const reveal = ease(localTime / .65), y = h * .5 + (1 - reveal) * 14 * u;
  ctx.globalAlpha = .65 + .35 * reveal; ctx.fillStyle = WHITE; ctx.textAlign = 'center';
  fitText(ctx, text, w * .62, 36 * u, 500, 11 * u); ctx.fillText(text, w / 2, y);
  const rule = Math.min(w * .22, 190 * u) * reveal;
  ctx.globalAlpha = .42; ctx.fillRect((w - rule) / 2, y + 28 * u, rule, 1 * u);
  ctx.globalAlpha = .65; font(ctx, 10 * u, 500, 'monospace');
  ctx.fillText(`${String((s.variant % 99) + 1).padStart(2, '0')} / ${String(Math.floor(s.t)).padStart(2, '0')}`, w / 2, h * .9);
  if (density > .4) {
    ctx.globalAlpha = .24; ctx.strokeStyle = WHITE; ctx.lineWidth = u;
    ctx.strokeRect(w * .035, h * .05, w * .93, h * .9);
  }
}

function weather(s) {
  const {ctx, w, h, color, text, u, density, t} = s;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const margin = w * .055, top = h * .14, windowY = h * .19;
  const hero = {x: margin, y: top, width: w * .32, height: h * .69};
  videoWindow(s, hero.x, hero.y, hero.width, hero.height, {focus: faceFocus(s.faces)});
  const frame = {x: w * .425, y: windowY, width: w * .52, height: h * .46};
  ctx.fillStyle = color; ctx.fillRect(frame.x - 4 * u, frame.y - 4 * u, frame.width + 8 * u, frame.height + 8 * u);
  videoWindow(s, frame.x, frame.y, frame.width, frame.height);
  ctx.fillStyle = color; font(ctx, 12 * u, 700); ctx.fillText('01 — 06', margin, h * .09);
  fitText(ctx, text, frame.width, 26 * u, 600); ctx.fillText(text, frame.x, h * .13, frame.width);
  const active = Math.floor(t * .5 + s.variant) % 6, iconSize = Math.min(62 * u, frame.width / 8);
  for (let i = 0; i < 6; i++) {
    const x = frame.x + (i + .5) * frame.width / 6, y = h * .76;
    ctx.globalAlpha = i === active ? 1 : .58 + density * .18;
    weatherIcon(ctx, i, x, y, iconSize * (i === active ? 1.08 : 1), color);
    if (i === active) ctx.fillRect(x - 13 * u, y + 47 * u, 26 * u, 3 * u);
  }
  ctx.globalAlpha = .65; ctx.strokeStyle = color; ctx.lineWidth = u;
  line(ctx, margin, h * .9, w - margin, h * .9);
  ctx.fillStyle = color; font(ctx, 10 * u, 500); ctx.fillText(text, margin, h * .94, w * .7);
}

function inset(s) {
  const {ctx, w, h, color, text, density, u, t} = s;
  // The large, original video remains the principal image; the inset is a distinct print layer.
  const onRight = s.variant % 2 === 0, iw = w * .215, ih = Math.min(h * .58, iw * 1.48);
  const x = onRight ? w * .69 : w * .095, y = h * .18 + Math.sin(t * .45) * 5 * u;
  ctx.fillStyle = PAPER; ctx.globalAlpha = .87; ctx.fillRect(x - 12 * u, y - 12 * u, iw + 24 * u, ih + 62 * u);
  ctx.globalAlpha = 1; videoWindow(s, x, y, iw, ih, {focus: faceFocus(s.faces), zoom: 1.24});
  ctx.fillStyle = color; ctx.globalAlpha = .15 + density * .12; ctx.fillRect(x, y, iw, ih);
  ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1.3 * u; ctx.strokeRect(x, y, iw, ih);
  fitText(ctx, text, iw, 16 * u, 700); ctx.fillText(text, x, y + ih + 27 * u, iw);
  const tx = onRight ? x - w * .19 : x + iw + 25 * u, tw = w * .155;
  ctx.fillStyle = color;
  textBlock(ctx, text, tx, y + 14 * u, tw, 10 * u, 13 * u, Math.round(9 + density * 17), .8);
  ctx.fillStyle = WHITE; ctx.fillRect(tx, y - 8 * u, tw * .55, 3 * u);
  ctx.fillStyle = color; cross(ctx, onRight ? w * .1 : w * .88, h * .73, 75 * u, 13 * u);
}

function collage(s) {
  const {ctx, w, h, color, text, density, t, u} = s;
  const right = s.variant % 2 === 1, start = right ? w * .59 : w * .04;
  const columnWidth = w * .11, columns = 3, rows = Math.round(15 + density * 24);
  ctx.fillStyle = color;
  for (let col = 0; col < columns; col++) {
    const top = h * .09 + [0, .1, .035][col] * h;
    textBlock(ctx, text, start + col * (columnWidth + w * .012), top,
      columnWidth, 10 * u, 12.5 * u, rows - col * 3, .7 + col * .09);
  }
  const panelX = right ? w * .56 : w * .2, panelY = h * .21;
  ctx.globalAlpha = .18; ctx.fillRect(panelX, panelY, w * .19, h * .56);
  ctx.globalAlpha = .9; ctx.lineWidth = 1.2 * u; ctx.strokeStyle = color;
  ctx.strokeRect(panelX, panelY, w * .19, h * .56);
  const markX = right ? w * .16 : w * .79, markY = h * .39;
  ctx.save(); ctx.translate(markX, markY); ctx.rotate(Math.sin(t * .3) * .035);
  cross(ctx, 0, 0, 142 * u, 29 * u); ctx.restore();
  ctx.globalAlpha = .75; ctx.beginPath(); ctx.arc(markX + 103 * u, markY - 76 * u, 15 * u, 0, TAU); ctx.fill();
  ctx.globalAlpha = .9; fitText(ctx, text, w * .3, 22 * u, 700);
  ctx.fillText(text, start, h * .89, w * .34);
}

function credits(s) {
  const {ctx, w, h, color, text, localTime, density, u} = s;
  const colW = Math.min(w * .42, 460 * u), x = (w - colW) / 2;
  // A single column and two long curves, as in the reference's ending.
  ctx.fillStyle = PAPER; ctx.globalAlpha = .76; ctx.fillRect(x - 22 * u, 0, colW + 44 * u, h);
  ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.textAlign = 'center';
  font(ctx, 17 * u, 600); const words = wrapped(ctx, text, colW * .86, 7);
  const rowH = 25 * u, count = Math.round(12 + density * 7), total = count * rowH;
  const scroll = fraction(localTime / 22) * rowH * 4;
  const top = (h - total) / 2 - scroll;
  ctx.save(); ctx.beginPath(); ctx.rect(x, h * .09, colW, h * .78); ctx.clip();
  for (let row = -2; row < count + 5; row++) {
    const y = top + row * rowH, index = ((row % words.length) + words.length) % words.length;
    const edge = Math.min((y - h * .09) / (45 * u), (h * .87 - y) / (45 * u));
    ctx.globalAlpha = clamp(edge, 0, .95); font(ctx, (row % 5 === 0 ? 19 : 14) * u, row % 5 === 0 ? 700 : 500);
    ctx.fillText(words[index], w * .5, y, colW * .9);
  }
  ctx.restore(); ctx.globalAlpha = .85; ctx.strokeStyle = color; ctx.lineWidth = 2 * u;
  for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(w / 2 + sign * colW * .65, -20);
    ctx.bezierCurveTo(w / 2 + sign * colW * .2, h * .28, w / 2 + sign * colW * 1.05, h * .54, w / 2 + sign * colW * .72, h);
    ctx.stroke();
  }
  ctx.fillStyle = color; ctx.fillRect(w * .47, h * .93, w * .06, 4 * u);
}

function ribbons(s) {
  const {ctx, w, h, color, text, u, t, density} = s;
  const ribbon = (cy, angle, fill, ink, direction, size) => {
    ctx.save(); ctx.translate(w / 2, cy); ctx.rotate(angle);
    ctx.fillStyle = fill; ctx.fillRect(-w * .65, -size / 2, w * 1.3, size);
    ctx.fillStyle = ink; const fs = fitText(ctx, text, w * .43, size * .52, 700, 11 * u);
    const span = Math.max(ctx.measureText(text).width + 65 * u, w * .25);
    const offset = fraction(t * .024 * direction + s.variant * .17) * span;
    for (let px = -w - span + offset; px < w; px += span) {
      ctx.fillText(text, px, fs * .34);
      ctx.fillRect(px - 30 * u, -3 * u, 6 * u, 6 * u);
    }
    ctx.restore();
  };
  const size = (48 + 28 * density) * u;
  ribbon(h * .79, -.105 + Math.sin(t * .16) * .01, color, WHITE, 1, size);
  ribbon(h * .2, .065, PAPER, color, -1, size * .68);
}

function split(s) {
  const {ctx, w, h, color, text, u, t} = s;
  const gutter = 14 * u, border = w * .025, center = w * (.5 + Math.sin(t * .24 + s.variant) * .035);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const top = h * .075, frameH = h * .81;
  videoWindow(s, border, top, center - border - gutter / 2, frameH, {focus: {x: .32, y: .48}});
  videoWindow(s, center + gutter / 2, top, w - center - border - gutter / 2, frameH,
    {focus: faceFocus(s.faces), zoom: 1.32});
  ctx.fillStyle = color; ctx.fillRect(center - gutter / 2, top, gutter, frameH);
  font(ctx, 10 * u, 600, 'monospace'); ctx.fillText('01', border, h * .048); ctx.fillText('02', center + gutter / 2, h * .048);
  fitText(ctx, text, w * .75, 24 * u, 600); ctx.fillText(text, border, h * .945, w * .8);
  ctx.textAlign = 'right'; font(ctx, 12 * u, 500, 'monospace');
  ctx.fillText(`${Math.floor(s.t / 60).toString().padStart(2, '0')}:${Math.floor(s.t % 60).toString().padStart(2, '0')}`, w - border, h * .945);
}

function contact(s) {
  const {ctx, w, h, color, text, density, u, t} = s;
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
  const columns = w / h < .8 ? 2 : 3, rows = 2, gap = 17 * u;
  const marginX = w * .045, marginY = h * .115;
  const fw = (w - marginX * 2 - gap * (columns - 1)) / columns;
  const fh = (h - marginY * 2 - gap * (rows - 1)) / rows;
  const selected = Math.floor(t * .65 + s.variant) % (columns * rows);
  const focus = faceFocus(s.faces);
  for (let i = 0; i < columns * rows; i++) {
    const x = marginX + (i % columns) * (fw + gap), y = marginY + Math.floor(i / columns) * (fh + gap);
    videoWindow(s, x, y, fw, fh, {focus: i % 2 ? focus : {x: [.3, .5, .7][i % 3], y: .5}, zoom: i % 2 ? 1.5 : 1});
    if (i !== selected) { ctx.fillStyle = INK; ctx.globalAlpha = .2 + density * .08; ctx.fillRect(x, y, fw, fh); ctx.globalAlpha = 1; }
    ctx.strokeStyle = i === selected ? color : PAPER; ctx.lineWidth = (i === selected ? 4 : .7) * u;
    ctx.strokeRect(x, y, fw, fh);
    ctx.fillStyle = i === selected ? color : PAPER; font(ctx, 9 * u, 500, 'monospace');
    ctx.fillText(String(i + 1).padStart(2, '0'), x + 8 * u, y + 17 * u);
  }
  ctx.fillStyle = PAPER; fitText(ctx, text, w * .72, 19 * u, 600); ctx.fillText(text, marginX, h * .062, w * .78);
  ctx.fillStyle = color; const holeW = 11 * u, holeH = 7 * u;
  for (let x = marginX; x < w - marginX; x += 31 * u) {
    ctx.fillRect(x, h * .027, holeW, holeH); ctx.fillRect(x, h * .962, holeW, holeH);
  }
}

function typeEcho(s) {
  const {ctx, w, h, color, text, density, u, t} = s;
  const right = s.variant % 2 === 1, x = right ? w * .61 : w * .065;
  const width = w * .33, baseY = h * .29;
  font(ctx, 51 * u, 800); const lines = wrapped(ctx, text.toUpperCase(), width, 3);
  const longest = lines.reduce((a, b) => ctx.measureText(a).width > ctx.measureText(b).width ? a : b, '');
  const size = fitText(ctx, longest, width, 51 * u, 800), leading = size * .94;
  const echoes = Math.round(4 + density * 5), step = 13 * u;
  const bend = Math.sin(t * .6 + s.variant) * 13 * u;
  for (let layer = echoes; layer >= 0; layer--) {
    ctx.save(); ctx.translate(x + layer * bend / echoes, baseY + layer * step);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.1 * u;
    ctx.globalAlpha = layer === 0 ? 1 : .16 + (echoes - layer) / echoes * .46;
    lines.forEach((value, index) => {
      if (layer === 0) ctx.fillText(value, 0, index * leading, width);
      else ctx.strokeText(value, 0, index * leading, width);
    });
    ctx.restore();
  }
  ctx.fillStyle = PAPER; ctx.globalAlpha = .85;
  ctx.fillRect(x, baseY + lines.length * leading + echoes * step + 20 * u, width * .36, 4 * u);
}

function stamp(s) {
  const {ctx, w, h, color, text, density, u, t} = s;
  const focus = faceFocus(s.faces), left = focus.x >= .5;
  const x = w * (left ? .2 : .8), y = h * .62, size = Math.min(w * .3, h * .48);
  const pulse = 1 + clamp(Number(s.audio.peak) || 0, 0, 1) * .025;
  ctx.save(); ctx.translate(x, y); ctx.rotate((left ? -.12 : .12) + Math.sin(t * .25) * .015); ctx.scale(pulse, pulse);
  ctx.fillStyle = color;
  // A bold, flat seal: large cross with a quiet label, not a floating particle system.
  cross(ctx, 0, 0, size, size * (.29 + density * .06));
  ctx.fillStyle = WHITE; ctx.textAlign = 'center';
  const label = text.toUpperCase(); fitText(ctx, label, size * .9, 20 * u, 700, 10 * u);
  ctx.fillText(label, 0, 6 * u, size * .88);
  ctx.restore();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5 * u;
  const lx = w * (left ? .055 : .64), ly = h * .13;
  line(ctx, lx, ly, lx + w * .3, ly);
  ctx.fillStyle = color; font(ctx, 11 * u, 600); ctx.fillText(text, lx, ly + 24 * u, w * .3);
}

export const COMPOSITION_EFFECTS = Object.freeze({
  title: composition(title, true),
  weather: composition(weather, true),
  inset: composition(inset, false),
  collage: composition(collage),
  credits: composition(credits),
  ribbons: composition(ribbons),
  split: composition(split, true),
  contact: composition(contact, true),
  typeEcho: composition(typeEcho),
  stamp: composition(stamp),
});
