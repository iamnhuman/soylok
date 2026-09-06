/**
 * Flat, editorial compositions for the video compositor.
 * Coordinates are logical source coordinates (normally 1280 × source aspect).
 * No frame history or random numbers: seeking and exporting give the same frame.
 */
import {designFor} from './composition-random.js';

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
    s.design = designFor(draw.name, s.variant, 4);
    s.u = Math.min(s.w, s.h) / 720;
    s.ctx.save();
    try {
      s.ctx.globalCompositeOperation = 'source-over'; s.ctx.globalAlpha = 1;
      s.ctx.textAlign = 'left'; s.ctx.textBaseline = 'alphabetic';
      s.ctx.lineJoin = 'miter'; s.ctx.lineCap = 'butt';
      draw(s);
    } finally { s.ctx.restore(); }
    // A caller may map its landmark pass into these windows instead of the old full frame.
    const replacement = s.replaceBase ?? replaceBase;
    return replacement === null ? undefined : {videoWindows: s.videoWindows, replaceBase: replacement};
  };
}

function title(s) {
  if (s.design.mode) return [null, titlePoster, titleFields, titleBand][s.design.mode](s);
  const {ctx, w, h, color, text, u, localTime, density} = s;
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  const d = s.design, reveal = ease(localTime / d.range('entrance', .45, 1.25)), y = h * d.range('baseline', .4, .6) + (1 - reveal) * 14 * u;
  ctx.globalAlpha = .65 + .35 * reveal; ctx.fillStyle = WHITE; ctx.textAlign = 'center';
  fitText(ctx, text, w * d.range('titleWidth', .4, .72), d.range('titleSize', 24, 54) * u, d.pick('weight', [400, 500, 700]), 11 * u); ctx.fillText(text, w / 2, y);
  const rule = Math.min(w * .28, d.range('ruleWidth', 100, 280) * u) * reveal;
  ctx.globalAlpha = .42; ctx.fillRect((w - rule) / 2, y + 28 * u, rule, 1 * u);
  ctx.globalAlpha = .65; font(ctx, 10 * u, 500, 'monospace');
  ctx.fillText(`${String((s.variant % 99) + 1).padStart(2, '0')} / ${String(Math.floor(s.t)).padStart(2, '0')}`, w / 2, h * .9);
  if (density > .4) {
    ctx.globalAlpha = .24; ctx.strokeStyle = WHITE; ctx.lineWidth = u;
    ctx.strokeRect(w * .035, h * .05, w * .93, h * .9);
  }
}

function weather(s) {
  if (s.design.mode) return [null, weatherBroadcast, weatherColumns, weatherSidebar][s.design.mode](s);
  const {ctx, w, h, color, text, u, density, t} = s;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const d = s.design, margin = w * d.range('margin', .035, .065), top = h * d.range('heroTop', .12, .18), windowY = h * d.range('windowTop', .17, .23);
  const hero = {x: margin, y: top, width: w * d.range('heroWidth', .27, .33), height: h * d.range('heroHeight', .6, .69)};
  videoWindow(s, hero.x, hero.y, hero.width, hero.height, {focus: faceFocus(s.faces)});
  const frame = {x: w * .425, y: windowY, width: w * d.range('frameWidth', .47, .52), height: h * d.range('frameHeight', .36, .46)};
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
  if (s.design.mode) return [null, insetPassports, insetPanorama, insetPair][s.design.mode](s);
  const {ctx, w, h, color, text, density, u, t} = s;
  // The large, original video remains the principal image; the inset is a distinct print layer.
  const d = s.design, onRight = d.sign('side') > 0, iw = w * d.range('imageWidth', .18, .25), ih = Math.min(h * .58, iw * d.range('aspect', 1.2, 1.8));
  const x = onRight ? w * .69 : w * .075, y = h * d.range('top', .13, .25) + Math.sin(t * d.range('motion', .3, .65)) * d.range('drift', 3, 12) * u;
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
  if (s.design.mode) return [null, collageHeadline, collagePaper, collageCross][s.design.mode](s);
  const {ctx, w, h, color, text, density, t, u} = s;
  const d = s.design, right = d.sign('side') > 0, start = right ? w * .59 : w * .04;
  const columnWidth = w * d.range('columnWidth', .08, .105), columns = d.int('columns', 2, 3), rows = Math.round(d.range('rows', 12, 21) + density * 24);
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
  if (s.design.mode) return [null, creditsLower, creditsMargins, creditsField][s.design.mode](s);
  const {ctx, w, h, color, text, localTime, density, u} = s;
  const d = s.design, colW = Math.min(w * d.range('width', .25, .4), d.range('maxWidth', 330, 460) * u), x = (w - colW) / 2;
  // A single column and two long curves, as in the reference's ending.
  ctx.fillStyle = PAPER; ctx.globalAlpha = .76; ctx.fillRect(x - 22 * u, 0, colW + 44 * u, h);
  ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.textAlign = 'center';
  font(ctx, 17 * u, 600); const words = wrapped(ctx, text, colW * .86, 7);
  const rowH = d.range('leading', 22, 33) * u, count = Math.round(d.range('rows', 9, 16) + density * 7), total = count * rowH;
  const scroll = fraction(localTime / d.range('speed', 14, 30)) * rowH * 4 * d.sign('direction');
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
  if (s.design.mode) return [null, ribbonsVertical, ribbonsStack, ribbonsSash][s.design.mode](s);
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
  const d = s.design, size = (d.range('size', 40, 72) + 28 * density) * u;
  ribbon(h * d.range('lower', .67, .84), d.range('lowerAngle', -.2, -.045) + Math.sin(t * .16) * .01, color, WHITE, d.sign('direction'), size);
  ribbon(h * d.range('upper', .15, .29), d.range('upperAngle', .03, .14), PAPER, color, -d.sign('direction'), size * d.range('ratio', .42, .8));
}

function split(s) {
  if (s.design.mode) return [null, splitHorizontal, splitTriptych, splitSidebar][s.design.mode](s);
  const {ctx, w, h, color, text, u, t} = s;
  const d = s.design, gutter = d.range('gutter', 9, 30) * u, border = w * d.range('border', .015, .055), center = w * (d.range('division', .39, .61) + Math.sin(t * d.range('speed', .12, .3) + s.variant) * .02);
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
  if (s.design.mode) return [null, contactHero, contactStrip, contactMosaic][s.design.mode](s);
  const {ctx, w, h, color, text, density, u, t} = s;
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
  const d = s.design, columns = w / h < .8 ? 2 : d.int('columns', 3, 4), rows = 2, gap = d.range('gap', 10, 25) * u;
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
  if (s.design.mode) return [null, typeEchoHorizontal, typeEchoFan, typeEchoWall][s.design.mode](s);
  const {ctx, w, h, color, text, density, u, t} = s;
  const d = s.design, right = d.sign('side') > 0, x = right ? w * .59 : w * .065;
  const width = w * d.range('width', .26, .36), baseY = h * d.range('top', .2, .35);
  font(ctx, 51 * u, 800); const lines = wrapped(ctx, text.toUpperCase(), width, 3);
  const longest = lines.reduce((a, b) => ctx.measureText(a).width > ctx.measureText(b).width ? a : b, '');
  const size = fitText(ctx, longest, width, 51 * u, 800), leading = size * .94;
  const echoes = Math.round(d.range('layers', 3, 7) + density * 5), step = d.range('spacing', 7, 20) * u;
  const bend = Math.sin(t * d.range('speed', .3, .8) + s.variant) * d.range('bend', 8, 27) * u;
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
  if (s.design.mode) return [null, stampTicket, stampCircle, stampWords][s.design.mode](s);
  const {ctx, w, h, color, text, density, u, t} = s;
  const d = s.design, focus = faceFocus(s.faces), left = s.faces?.length ? focus.x >= .5 : d.sign('side') > 0;
  const x = w * (left ? .2 : .8), y = h * d.range('baseline', .4, .7), size = Math.min(w * d.range('size', .24, .34), h * .48);
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

// Four deliberately different page architectures per effect. Slots only vary
// choices inside an architecture; the cyclic mode selects a new architecture.
function field(s, fill, x, y, width, height, alpha = 1) {
  s.ctx.save(); s.ctx.globalAlpha = alpha; s.ctx.fillStyle = fill;
  s.ctx.fillRect(x * s.w, y * s.h, width * s.w, height * s.h); s.ctx.restore();
}

function heading(s, x, y, width, size, ink = s.color, value = s.text, weight = 700) {
  const {ctx, w, h, u} = s;
  ctx.save(); ctx.fillStyle = ink; ctx.textAlign = 'left';
  fitText(ctx, value, width * w, size * u, weight, 8 * u);
  ctx.fillText(value, x * w, y * h, width * w); ctx.restore();
}

function poster(s, x, y, width, height, ink, weight = 800, outline = false) {
  const {ctx, w, h, design: d, u} = s;
  ctx.save(); ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 1.4 * u;
  const words = s.text.toUpperCase().split(/\s+/), count = Math.min(words.length, d.int('posterLines', 2, 4));
  const rows = Array.from({length: count}, (_, i) => words.slice(Math.floor(i * words.length / count), Math.floor((i + 1) * words.length / count)).join(' '));
  const size = Math.min(height * h / (count * 1.03), d.range('posterSize', 130, 220) * u);
  rows.forEach((row, i) => {
    fitText(ctx, row, width * w, size, weight, 10 * u);
    ctx[outline ? 'strokeText' : 'fillText'](row, x * w, y * h + (i + .82) * height * h / count, width * w);
  });
  ctx.restore();
}

function framed(s, id, x, y, width, height, options = {}) {
  const {ctx, w, h, u, design: d} = s;
  const pad = (options.pad ?? d.range(id + 'border', 3, 11)) * u;
  ctx.save(); ctx.fillStyle = options.border || s.color;
  ctx.fillRect(x * w - pad, y * h - pad, width * w + pad * 2, height * h + pad * 2); ctx.restore();
  return videoWindow(s, x * w, y * h, width * w, height * h, {
    zoom: options.zoom ?? d.range(id + 'zoom', 1, 1.6),
    focus: options.focus || {x: d.range(id + 'focusX', .32, .68), y: d.range(id + 'focusY', .34, .59)},
  });
}

function micro(s, id, x, y, width, height, ink = s.color) {
  const {ctx, w, h, u, design: d} = s, size = d.range(id + 'size', 9, 13) * u;
  const leading = size * d.range(id + 'leading', 1.15, 1.42), rows = Math.min(90, Math.floor(height * h / leading));
  ctx.save(); ctx.fillStyle = ink;
  textBlock(ctx, s.text, x * w, y * h, width * w, size, leading, rows, d.range(id + 'opacity', .72, 1)); ctx.restore();
}

function iconSequence(s, id, x, y, length, count, vertical = false, ink = s.color) {
  const {w, h, u, ctx, design: d} = s, order = d.shuffle(id + 'order', [0, 1, 2, 3, 4, 5]);
  const step = length * (vertical ? h : w) / count, size = Math.min(step * .64, d.range(id + 'size', 54, 92) * u);
  for (let i = 0; i < count; i++) {
    const xx = x * w + (vertical ? 0 : (i + .5) * step), yy = y * h + (vertical ? (i + .5) * step : 0);
    ctx.save(); ctx.globalAlpha = i === Math.floor(s.t * d.range(id + 'tempo', .3, .7)) % count ? 1 : .65;
    weatherIcon(ctx, order[i % order.length], xx, yy, size, ink); ctx.restore();
  }
}

function movingRibbon(s, id, x, y, angle, length, thickness, fill, ink, direction) {
  const {ctx, u, design: d} = s;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = fill;
  ctx.fillRect(-length / 2, -thickness / 2, length, thickness);
  ctx.fillStyle = ink; const size = fitText(ctx, s.text, length * .42, thickness * d.range(id + 'font', .4, .62), d.pick(id + 'weight', [500, 700, 900]), 9 * u);
  const span = Math.max(ctx.measureText(s.text).width + d.range(id + 'space', 45, 110) * u, 100 * u);
  const offset = fraction(s.t * d.range(id + 'speed', .016, .055) * direction + d.value(id + 'phase')) * span;
  ctx.beginPath(); ctx.rect(-length / 2, -thickness / 2, length, thickness); ctx.clip();
  for (let pos = -length / 2 - span + offset; pos < length / 2; pos += span) ctx.fillText(s.text, pos, size * .34);
  ctx.restore();
}

function titlePoster(s) {
  const {w, h, ctx, design: d, color, u} = s, side = d.range('sidebar', .16, .28);
  field(s, PAPER, 0, 0, 1, 1); field(s, color, 1 - side, 0, side, 1);
  poster(s, .055, d.range('top', .19, .31), .84 - side, d.range('height', .48, .6), color, d.pick('weight', [500, 800, 900]));
  heading(s, .055, .1, .55, d.range('caption', 14, 24), INK);
  ctx.fillStyle = WHITE; cross(ctx, w * (1 - side / 2), h * .2, Math.min(w * side * .58, h * .17), 10 * u);
  ctx.save(); ctx.translate(w * (1 - side / 2), h * .84); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = WHITE; font(ctx, 12 * u, 500); ctx.fillText(s.text, 0, 0, h * .52); ctx.restore();
}

function titleFields(s) {
  const {ctx, w, h, color, design: d, u} = s, divide = d.range('divide', .47, .66);
  field(s, color, 0, 0, 1, divide); field(s, PAPER, 0, divide, 1, 1 - divide);
  poster(s, .065, .07, .87, divide * .72, WHITE, d.pick('weight', [500, 800]));
  heading(s, d.range('captionX', .08, .25), divide + (1 - divide) * .67, .66, d.range('smallTitle', 23, 46), color);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w * .85, h * (divide + .09), 27 * u, 0, TAU); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = u;
  line(ctx, w * .065, h * .92, w * d.range('ruleEnd', .48, .77), h * .92);
}

function titleBand(s) {
  const {ctx, w, h, color, design: d, u} = s, top = d.range('bandY', .33, .47), height = d.range('bandH', .23, .34);
  field(s, color, 0, 0, 1, 1); field(s, PAPER, 0, top, 1, height);
  const tx = d.range('inset', .035, .085), size = Math.min(170 * u, height * h * .65);
  heading(s, tx, top + height * .69, 1 - tx * 2, size / u, color, s.text.toUpperCase(), d.pick('weight', [400, 700, 900]));
  heading(s, .065, top * .53, .7, 17, WHITE);
  ctx.strokeStyle = WHITE; ctx.lineWidth = u;
  line(ctx, w * .065, h * .87, w * .935, h * .87);
  ctx.fillStyle = WHITE; cross(ctx, w * .91, h * .18, 25 * u, 3 * u);
}

function weatherBroadcast(s) {
  const {color, design: d} = s, x = d.range('windowX', .08, .13), width = 1 - x * 2;
  field(s, color, 0, 0, 1, 1); field(s, PAPER, .035, .04, .93, .9);
  heading(s, .27, .17, .6, d.range('headline', 32, 64), color);
  weatherIcon(s.ctx, d.int('heroIcon', 0, 5), s.w * .15, s.h * .145, 94 * s.u, color);
  framed(s, 'broadcast', x, .26, width, d.range('imageH', .44, .5), {pad: d.range('rim', 5, 14)});
  iconSequence(s, 'footer', .21, .84, .59, d.int('icons', 3, 5));
}

function weatherColumns(s) {
  const {color, design: d, w, h, ctx} = s, count = d.int('columns', 3, 4), gap = d.range('gap', .02, .036);
  const width = (.88 - gap * (count - 1)) / count;
  field(s, PAPER, 0, 0, 1, 1); heading(s, .06, .1, .86, 31, color);
  const order = d.shuffle('icons', [0, 1, 2, 3, 4, 5]);
  for (let i = 0; i < count; i++) {
    const x = .06 + i * (width + gap), top = .28 + (i % 2) * d.range('step', .02, .07);
    weatherIcon(ctx, order[i], (x + width / 2) * w, h * .2, d.range('iconSize' + i, 55, 85) * s.u, color);
    framed(s, 'column' + i, x, top, width, d.range('imageHeight' + i, .37, .46), {zoom: d.range('zoom' + i, 1, 1.8)});
    heading(s, x, .85, width, 14, color, String(i + 1).padStart(2, '0'));
  }
  field(s, color, 0, .91, 1, .09); heading(s, .06, .967, .88, 21, WHITE);
}

function weatherSidebar(s) {
  const {color, design: d} = s, side = d.range('sidebar', .27, .35), left = side + .065;
  field(s, PAPER, 0, 0, 1, 1); field(s, color, 0, 0, side, 1);
  iconSequence(s, 'vertical', side / 2, .09, .59, d.int('icons', 3, 4), true, WHITE);
  heading(s, .035, .85, side - .07, 27, WHITE);
  framed(s, 'upper', left, .12, .93 - left, d.range('upperHeight', .29, .36));
  framed(s, 'lower', left + .08, .59, .85 - left, d.range('lowerHeight', .25, .31), {zoom: d.range('detailZoom', 1.3, 2)});
  heading(s, left, .535, .93 - left, d.range('middleTitle', 25, 45), color);
}

function insetPassports(s) {
  const {color, design: d} = s, count = d.int('count', 2, 4), gap = .025;
  const width = Math.min(.22, (.86 - gap * (count - 1)) / count), start = d.range('start', .06, .1);
  heading(s, .065, .17, .59, d.range('heading', 40, 74), WHITE);
  for (let i = 0; i < count; i++) {
    const x = start + i * (width + gap), y = .55 + (i % 2) * d.range('stagger', -.07, .02), height = d.range('portraitH' + i, .25, .31);
    field(s, PAPER, x - .009, y - .016, width + .018, height + .08);
    framed(s, 'passport' + i, x, y, width, height, {border: color, pad: 2, focus: faceFocus(s.faces)});
    heading(s, x, y + height + .042, width, 12, color);
  }
  micro(s, 'topColumn', .73, .11, .19, .22, color);
}

function insetPanorama(s) {
  const {color, design: d, ctx, w, h, u} = s, x = d.range('windowX', .05, .11), y = d.range('windowY', .57, .67);
  const width = d.range('windowW', .59, .7), height = d.range('windowH', .18, .25);
  field(s, PAPER, x - .012, y - .074, width + .024, height + .105, .94);
  heading(s, x + .015, y - .027, width - .03, 22, color);
  framed(s, 'panorama', x, y, width, height, {zoom: d.range('zoom', 1.05, 1.6), pad: 2});
  micro(s, 'rightColumn', .82, .33, .13, .43, color);
  ctx.fillStyle = color; cross(ctx, w * .14, h * .23, d.range('cross', 75, 125) * u, 14 * u);
}

function insetPair(s) {
  const {color, design: d, ctx, w, h, u} = s, smallX = d.range('smallX', .06, .12), largeX = d.range('largeX', .61, .69);
  const smallW = d.range('smallW', .19, .25), largeW = d.range('largeW', .22, .27);
  framed(s, 'smallPhoto', smallX, .12, smallW, d.range('smallH', .23, .32), {border: PAPER, pad: 9});
  framed(s, 'largePhoto', largeX, .39, largeW, d.range('largeH', .38, .48), {border: PAPER, pad: 12, focus: faceFocus(s.faces)});
  heading(s, smallX, .51, .38, d.range('title', 27, 42), color);
  micro(s, 'centralColumn', .43, .62, .13, .21, color);
  ctx.strokeStyle = color; ctx.lineWidth = u;
  line(ctx, (smallX + smallW) * w, h * .18, w * .53, h * .18);
  line(ctx, w * .53, h * .18, w * .53, h * .29);
  line(ctx, w * .53, h * .29, (largeX + largeW) * w, h * .29);
}

function collageHeadline(s) {
  const {color, design: d, ctx, w, h, u} = s, columns = d.int('columns', 3, 5), width = .82 / columns;
  for (let i = 0; i < columns; i++) micro(s, 'column' + i, .06 + width * i, .08 + (i % 2) * .025, width * .88, d.range('height' + i, .17, .28));
  field(s, PAPER, .045, .62, .91, d.range('paperHeight', .21, .28), .87);
  heading(s, .065, .78, .86, d.range('large', 83, 138), color, s.text.toUpperCase(), d.pick('weight', [400, 700, 900]));
  ctx.strokeStyle = color; ctx.lineWidth = 2 * u; line(ctx, w * .06, h * .92, w * .94, h * .92);
  field(s, color, .045, .34, d.range('blockW', .09, .16), .14);
}

function collagePaper(s) {
  const {color, design: d, ctx, w, h, u} = s, x = d.range('paperX', .05, .11), width = d.range('paperW', .32, .4);
  field(s, PAPER, x, .075, width, .83, .94);
  heading(s, x + .025, .18, width - .05, d.range('title', 35, 56), color, s.text.toUpperCase());
  micro(s, 'paperLeft', x + .025, .24, width * .4, .6, INK);
  micro(s, 'paperRight', x + width * .55, .3, width * .38, .54, color);
  field(s, color, .67, .1, d.range('labelW', .23, .28), .21);
  heading(s, .69, .22, .21, 28, WHITE);
  ctx.strokeStyle = color; ctx.lineWidth = d.range('line', 1, 2.5) * u;
  ctx.beginPath(); ctx.moveTo(w * .53, 0); ctx.bezierCurveTo(w * .85, h * .19, w * .51, h * .74, w, h * .87); ctx.stroke();
}

function collageCross(s) {
  const {color, design: d, w, h, ctx, u} = s, cx = d.range('crossX', .4, .6), columnW = d.range('columnW', .12, .18);
  field(s, PAPER, cx - columnW / 2, 0, columnW, 1, .82);
  micro(s, 'verticalType', cx - columnW * .4, .04, columnW * .8, .93, color);
  const y = d.range('crossbarY', .39, .53), bandH = d.range('bandH', .13, .2);
  field(s, color, 0, y, 1, bandH, .9);
  heading(s, .045, y + bandH * .71, .91, bandH * h / u * .68, WHITE, s.text.toUpperCase(), 700);
  micro(s, 'corner', .73, .13, .2, .17, color);
  ctx.fillStyle = color; cross(ctx, w * .17, h * .8, d.range('plusSize', 70, 130) * u, 15 * u);
}

function creditsLower(s) {
  const {color, design: d, ctx, w, h, u} = s, columns = d.int('columns', 3, 5), top = d.range('top', .57, .65);
  field(s, PAPER, 0, top, 1, 1 - top, .93);
  const width = .84 / columns, drift = Math.sin(s.localTime * d.range('speed', .15, .4)) * .012;
  for (let i = 0; i < columns; i++) {
    heading(s, .075 + width * i, top + .052, width * .9, 10, color, String(i + 1).padStart(2, '0'));
    micro(s, 'credits' + i, .075 + width * i, top + .09 + drift, width * .87, .24, color);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 2 * u;
  ctx.beginPath(); ctx.moveTo(-20, h * .18); ctx.bezierCurveTo(w * .3, h * .61, w * .43, h * .05, w, h * .45); ctx.stroke();
}

function creditsMargins(s) {
  const {color, design: d, ctx, w, h, u} = s, sidebar = d.range('sidebar', .1, .16);
  field(s, color, 0, 0, sidebar, 1, .94);
  movingRibbon(s, 'spine', w * sidebar / 2, h / 2, -Math.PI / 2, h * 1.1, w * sidebar * .72, color, WHITE, d.sign('direction'));
  field(s, PAPER, .76, 0, .24, 1, .84);
  micro(s, 'rightRoll', .79, .1 + Math.sin(s.localTime * .18) * .025, .18, .8, color);
  heading(s, sidebar + .05, .88, .48, d.range('title', 22, 40), color);
  ctx.strokeStyle = color; ctx.lineWidth = u;
  line(ctx, w * (sidebar + .055), h * .08, w * .69, h * .08);
  ctx.beginPath(); ctx.moveTo(w * .73, 0); ctx.bezierCurveTo(w * .52, h * .3, w * .85, h * .65, w * .56, h); ctx.stroke();
}

function creditsField(s) {
  const {color, design: d, ctx, w, h, u} = s; s.replaceBase = true;
  const invert = d.sign('invert') > 0, bg = invert ? color : PAPER, ink = invert ? WHITE : color;
  field(s, bg, 0, 0, 1, 1); heading(s, .06, .095, .83, d.range('title', 24, 40), ink);
  const count = d.int('columns', 2, 3), width = d.range('columnW', .115, .16), total = count * width + (count - 1) * .035, start = (.98 - total) / 2;
  for (let i = 0; i < count; i++) micro(s, 'roll' + i, start + i * (width + .035), .2 + (i % 2) * .055, width, .65, ink);
  ctx.strokeStyle = ink; ctx.lineWidth = d.range('curveWidth', 1, 3) * u;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(w * (.5 + side * .42), 0);
    ctx.bezierCurveTo(w * (.5 + side * .14), h * .22, w * (.5 + side * .55), h * .73, w * (.5 + side * .33), h); ctx.stroke();
  }
  field(s, ink, .06, .92, .88, .002);
}

function ribbonsVertical(s) {
  const {w, h, color, design: d} = s, a = w * d.range('wide', .09, .16), b = w * d.range('narrow', .045, .085);
  movingRibbon(s, 'left', w * .14, h / 2, -Math.PI / 2, h * 1.1, a, color, WHITE, d.sign('direction'));
  movingRibbon(s, 'right', w * .87, h / 2, Math.PI / 2, h * 1.1, b, PAPER, color, -d.sign('direction'));
  heading(s, .29, .91, .42, 18, WHITE);
}

function ribbonsStack(s) {
  const {w, h, color, design: d} = s, count = d.int('bands', 3, 4), thickness = h * d.range('height', .08, .115);
  for (let i = 0; i < count; i++) {
    const fill = i % 2 ? PAPER : color, ink = i % 2 ? color : WHITE;
    movingRibbon(s, 'row' + i, w / 2, h * .59 + i * (thickness + h * .017), 0, w * 1.12, thickness, fill, ink, i % 2 ? 1 : -1);
  }
  field(s, color, .055, .1, d.range('tabW', .08, .18), .065);
}

function ribbonsSash(s) {
  const {w, h, color, design: d} = s, angle = d.sign('slope') * Math.atan2(h * d.range('rise', .52, .8), w * .8);
  const length = Math.hypot(w, h) * 1.15, cy = h * d.range('center', .46, .62);
  movingRibbon(s, 'diagonal', w / 2, cy, angle, length, Math.min(w, h) * d.range('width', .12, .19), color, WHITE, d.sign('direction'));
  movingRibbon(s, 'smallTag', w * .72, h * .19, -angle * .65, w * .34, 30 * s.u, PAPER, color, -1);
}

function splitHorizontal(s) {
  const {color, design: d} = s, middle = d.range('division', .41, .54), band = d.range('band', .1, .17);
  field(s, PAPER, 0, 0, 1, 1);
  framed(s, 'top', .04, .035, .92, middle - band / 2 - .035, {pad: 0});
  framed(s, 'bottom', .04, middle + band / 2, .92, .95 - middle - band / 2, {pad: 0, focus: faceFocus(s.faces)});
  field(s, color, 0, middle - band / 2, 1, band);
  heading(s, .045, middle + band * .22, .91, Math.min(90, band * s.h / s.u * .55), WHITE);
}

function splitTriptych(s) {
  const {color, design: d} = s, gap = d.range('gap', .012, .03), widths = d.shuffle('order', [.43, .22, .25]);
  field(s, color, 0, 0, 1, 1); const scale = (.92 - gap * 2) / .9; let x = .04;
  widths.forEach((width, i) => {
    framed(s, 'panel' + i, x, .07, width * scale, d.range('height' + i, .63, .7), {pad: 0, zoom: d.range('zoom' + i, 1, 2)});
    heading(s, x, .045, width * scale, 10, WHITE, String(i + 1).padStart(2, '0')); x += width * scale + gap;
  });
  heading(s, .04, .92, .91, d.range('footer', 65, 116), WHITE, s.text.toUpperCase(), 800);
}

function splitSidebar(s) {
  const {color, design: d} = s, main = d.range('mainWidth', .55, .66), gap = .025, right = main + .065;
  field(s, PAPER, 0, 0, 1, 1);
  framed(s, 'hero', .035, .075, main, .8, {pad: 0, focus: faceFocus(s.faces)});
  const first = d.range('firstH', .3, .42);
  framed(s, 'detailA', right, .075, .96 - right, first, {pad: 0, zoom: d.range('zoomA', 1.5, 2.2)});
  framed(s, 'detailB', right, .075 + first + gap, .96 - right, .8 - first - gap, {pad: 0, zoom: d.range('zoomB', 1, 1.5)});
  field(s, color, main + .047, .075, .006, .8);
  heading(s, .035, .945, .92, d.range('footer', 24, 42), color);
}

function contactHero(s) {
  const {color, design: d} = s, count = d.int('smallCount', 3, 5), gap = .015, width = (.9 - gap * (count - 1)) / count;
  field(s, PAPER, 0, 0, 1, 1);
  const heroW = d.range('heroW', .57, .67);
  framed(s, 'hero', .05, .1, heroW, .51, {pad: 4, zoom: 1});
  poster(s, heroW + .095, .13, .84 - heroW, .42, color, 700);
  for (let i = 0; i < count; i++) framed(s, 'small' + i, .05 + i * (width + gap), .72, width, .21, {pad: 2, zoom: d.range('zoom' + i, 1, 1.9)});
  heading(s, .05, .67, .88, 13, color);
}

function contactStrip(s) {
  const {color, design: d, w, h, ctx, u} = s, width = d.range('stripWidth', .37, .47), left = .51 - width / 2;
  field(s, INK, 0, 0, 1, 1); field(s, color, 0, 0, d.range('orangeSidebar', .14, .22), 1);
  const count = d.int('frames', 3, 5), gap = .025, height = (.88 - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) framed(s, 'strip' + i, left, .06 + i * (height + gap), width, height, {pad: 1.5, border: PAPER});
  ctx.fillStyle = PAPER;
  for (let y = .025 * h; y < h; y += 26 * u) {
    ctx.fillRect(left * w - 21 * u, y, 8 * u, 11 * u); ctx.fillRect((left + width) * w + 13 * u, y, 8 * u, 11 * u);
  }
  micro(s, 'edgeText', .83, .13, .12, .71, color);
  movingRibbon(s, 'spine', w * .08, h / 2, -Math.PI / 2, h * .85, w * .1, color, WHITE, d.sign('direction'));
}

function contactMosaic(s) {
  const {color, design: d} = s, divide = d.range('divide', .35, .56), gap = .018;
  field(s, color, 0, 0, 1, 1); field(s, PAPER, 0, .81, 1, .19);
  const topH = d.range('topHeight', .32, .4), top = .055;
  framed(s, 'topA', .045, top, divide - .045, topH, {pad: 0});
  framed(s, 'topB', divide + gap, top, .955 - divide - gap, topH, {pad: 0});
  const lowerY = top + topH + gap, lowerH = .76 - lowerY, width = (.91 - gap * 2) / 3;
  for (let i = 0; i < 3; i++) framed(s, 'bottom' + i, .045 + i * (width + gap), lowerY, width, lowerH, {pad: 0, zoom: d.range('zoom' + i, 1.1, 2.1)});
  heading(s, .045, .945, .91, d.range('headline', 58, 100), color, s.text.toUpperCase());
}

function typeEchoHorizontal(s) {
  const {ctx, color, design: d, w, h, u} = s, y = d.range('baseline', .64, .79), count = d.int('echoes', 4, 7);
  const width = d.range('width', .72, .88), size = fitText(ctx, s.text.toUpperCase(), width * w, d.range('size', 90, 154) * u, 800);
  const step = d.range('spacing', 16, 39) * u, direction = d.sign('direction');
  for (let i = count; i >= 0; i--) {
    ctx.save(); ctx.globalAlpha = i ? .15 + (count - i) / count * .48 : 1;
    ctx.strokeStyle = i % 2 ? WHITE : color; ctx.fillStyle = color; ctx.lineWidth = 1.5 * u;
    const x = .075 * w + i * step * direction + Math.sin(s.t * .35) * 10 * u;
    ctx[i ? 'strokeText' : 'fillText'](s.text.toUpperCase(), x, y * h, width * w); ctx.restore();
  }
  field(s, PAPER, .06, .09, .48, .065, .9); heading(s, .075, .136, .45, 18, color);
  ctx.fillStyle = color; ctx.fillRect(w * .075, y * h + size * .27, w * .18, 4 * u);
}

function typeEchoFan(s) {
  const {ctx, color, design: d, w, h, u} = s, count = d.int('layers', 4, 7), cx = w * d.range('pivotX', .12, .3), cy = h * d.range('pivotY', .58, .79);
  const size = d.range('fontSize', 55, 96) * u, spread = d.range('spread', .065, .11), direction = d.sign('direction');
  for (let i = count - 1; i >= 0; i--) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(direction * (i - count / 2) * spread + Math.sin(s.t * .22) * .025);
    ctx.globalAlpha = i ? .32 + .45 * (count - i) / count : 1;
    ctx.fillStyle = color; ctx.strokeStyle = i % 2 ? PAPER : color; ctx.lineWidth = 1.3 * u;
    fitText(ctx, s.text.toUpperCase(), w * .69, size, 800);
    ctx[i ? 'strokeText' : 'fillText'](s.text.toUpperCase(), 0, -i * 8 * u, w * .69); ctx.restore();
  }
  micro(s, 'corner', .73, .09, .18, .2, color);
}

function typeEchoWall(s) {
  const {ctx, color, design: d, w, h, u} = s, width = d.range('wallW', .35, .47), x = d.sign('side') > 0 ? .95 - width : .05;
  const count = d.int('rows', 5, 9), step = h * .82 / count, drift = fraction(s.t * d.range('speed', .018, .04)) * step;
  field(s, PAPER, x - .018, .05, width + .036, .9, .86);
  ctx.save(); ctx.beginPath(); ctx.rect(x * w, h * .065, width * w, h * .87); ctx.clip();
  for (let row = -1; row <= count; row++) {
    const active = row === Math.floor(count / 2); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.2 * u;
    fitText(ctx, s.text.toUpperCase(), width * w, Math.min(step * .74, 76 * u), active ? 900 : 500);
    ctx[active ? 'fillText' : 'strokeText'](s.text.toUpperCase(), x * w, h * .12 + row * step + drift, width * w);
  }
  ctx.restore(); field(s, color, x, .05, width, .006);
}

function stampTicket(s) {
  const {ctx, color, design: d, w, h, u} = s, width = w * d.range('width', .43, .57), height = h * d.range('height', .2, .29);
  const x = w * d.range('centerX', .38, .62), y = h * d.range('centerY', .56, .73), angle = d.range('angle', -.15, .15);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = PAPER; ctx.fillRect(-width / 2 + 11 * u, -height / 2 + 12 * u, width, height);
  ctx.fillStyle = color; ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.strokeStyle = WHITE; ctx.lineWidth = u; ctx.strokeRect(-width / 2 + 10 * u, -height / 2 + 10 * u, width - 20 * u, height - 20 * u);
  ctx.fillStyle = WHITE; const size = fitText(ctx, s.text.toUpperCase(), width * .84, height * .39, d.pick('weight', [500, 800]));
  ctx.fillText(s.text.toUpperCase(), -width * .42, size * .31, width * .84); ctx.restore();
  heading(s, .065, .13, .6, d.range('caption', 14, 24), color);
}

function stampCircle(s) {
  const {ctx, color, design: d, w, h, u} = s, radius = Math.min(w * d.range('radiusW', .16, .23), h * d.range('radiusH', .25, .36));
  const x = w * (d.sign('side') > 0 ? .73 : .27), y = h * d.range('centerY', .4, .66);
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
  ctx.strokeStyle = WHITE; ctx.lineWidth = d.range('rim', 1, 3) * u; ctx.beginPath(); ctx.arc(0, 0, radius * .83, 0, TAU); ctx.stroke();
  ctx.fillStyle = WHITE; font(ctx, 28 * u, 700); const rows = wrapped(ctx, s.text.toUpperCase(), radius * 1.2, 3), leading = radius * .22;
  rows.forEach((row, i) => { fitText(ctx, row, radius * 1.25, radius * .23, 700); ctx.textAlign = 'center'; ctx.fillText(row, 0, (i - (rows.length - 1) / 2) * leading + leading * .27, radius * 1.25); });
  ctx.restore(); heading(s, .07, .1, .85, 17, color);
}

function stampWords(s) {
  const {ctx, color, design: d, w, h, u} = s, words = s.text.toUpperCase().split(/\s+/), count = Math.min(3, words.length), x = d.range('left', .065, .22);
  const rowH = h * d.range('rowHeight', .105, .145), top = h * d.range('top', .33, .46), width = w * d.range('width', .54, .67);
  for (let i = 0; i < count; i++) {
    const row = words.slice(Math.floor(i * words.length / count), Math.floor((i + 1) * words.length / count)).join(' ');
    const offset = d.range('offset' + i, 0, .07) * w, rowW = width * d.range('rowWidth' + i, .79, 1);
    ctx.fillStyle = i === 1 ? PAPER : color; ctx.fillRect(x * w + offset, top + i * (rowH + 7 * u), rowW, rowH);
    ctx.fillStyle = i === 1 ? color : WHITE; const size = fitText(ctx, row, rowW - 28 * u, rowH * .76, d.pick('weight', [700, 900]));
    ctx.fillText(row, x * w + offset + 14 * u, top + i * (rowH + 7 * u) + rowH * .5 + size * .34, rowW - 28 * u);
  }
  micro(s, 'topLabel', .72, .09, .21, .15, color);
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
