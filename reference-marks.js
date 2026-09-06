// Flat graphic compositions. Coordinates use the renderer's 1280px logical space.
const TAU = Math.PI * 2;
const CREAM = '#f3f1e2';
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function isolated(draw) {
  return options => {
    const p = {
      t: 0, density: .65, color: '#ff6b16', audio: {}, faces: [], hands: [],
      anchors: [], variant: 1, text: '', ...options,
    };
    p.density = clamp(Number.isFinite(p.density) ? p.density : .65, 0, 1);
    p.audio = { level: 0, bass: 0, mid: 0, high: 0, peak: 0, ...p.audio };
    p.localTime = Number.isFinite(p.localTime) ? p.localTime : p.t;
    p.ctx.save();
    try { draw(p); } finally { p.ctx.restore(); }
  };
}

function line(ctx, x, y, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
}

function plus(ctx, x, y, size, weight) {
  ctx.fillRect(x - size / 2, y - weight / 2, size, weight);
  ctx.fillRect(x - weight / 2, y - size / 2, weight, size);
}

function polygon(ctx, points, fill = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
  fill ? ctx.fill() : ctx.stroke();
}

function bounds(points) {
  if (!points?.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}

function people(faces, hands) {
  return [...faces.map(face => bounds(face.landmarks || face)), ...hands.map(hand => bounds(hand.landmarks || hand))].filter(Boolean);
}

function free(x, y, areas, pad = .035) {
  return !areas.some(area => x > area.x - pad && x < area.r + pad && y > area.y - pad && y < area.b + pad);
}

function openSide(faces, variant) {
  const face = bounds(faces[0]?.landmarks || faces[0]);
  return face ? (face.x + face.r) / 2 < .5 : variant % 2 === 1;
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.stroke();
}

export const MARK_EFFECTS = {
  vector: isolated(({ ctx, w, h, t, density, color, audio, faces, hands, anchors, variant }) => {
    const areas = people(faces, hands), count = Math.round(8 + density * 18);
    for (let i = 0; i < count; i++) {
      const anchor = anchors[i];
      const x = anchor?.x ?? .06 + hash(i + variant * 19) * .88;
      const y = anchor?.y ?? .08 + hash(i * 7 + variant * 3) * .8;
      const dx = Math.sin(t * .35 + i) * .009, dy = Math.cos(t * .27 + i) * .009;
      if (!free(x + dx, y + dy, areas, .045)) continue;
      const size = (i % 5 === 0 ? 48 + density * 32 : 13 + hash(i * 3) * 19) * (1 + audio.peak * .14);
      ctx.fillStyle = i % 5 === 1 ? CREAM : color;
      ctx.globalAlpha = i % 5 === 0 ? .98 : .85;
      plus(ctx, (x + dx) * w, (y + dy) * h, size, Math.max(2.5, size * .15));
    }
  }),

  signal: isolated(({ ctx, w, h, t, density, color, audio, faces, hands, variant }) => {
    const areas = people(faces, hands), rows = Math.round(9 + density * 16);
    ctx.lineCap = 'butt';
    for (let i = 0; i < rows; i++) {
      const y = .06 + (i + .5) / rows * .86;
      const side = (i + variant) % 2;
      const drift = Math.sin(t * .5 + i * .8) * .025;
      const x = side ? .65 + drift : .055 - drift;
      const length = w * (.1 + hash(i * 13 + variant) * .12 + audio.high * .05);
      if (!free(x + length / w / 2, y, areas, .015)) continue;
      ctx.strokeStyle = i % 6 === 2 ? CREAM : color;
      ctx.lineWidth = i % 7 === 0 ? 5 : 1.5 + density;
      ctx.globalAlpha = .76 + hash(i) * .24;
      line(ctx, x * w, y * h, x * w + length, y * h);
      if (i % 3 === 0) line(ctx, x * w, y * h + 6, x * w + length * .48, y * h + 6);
    }
    ctx.fillStyle = color; ctx.globalAlpha = 1;
    for (let i = 0; i < 7; i++) ctx.fillRect(w * .045 + i * 8, h * .91, 3, -(9 + (i % 3 === 0 ? audio.bass : audio.mid) * 45));
  }),

  grid: isolated(({ ctx, w, h, localTime, density, color, audio }) => {
    const horizon = h * (.61 - density * .045), floorHeight = h - horizon;
    const center = w * (.5 + Math.sin(localTime * .22) * .045);
    const phase = (localTime * .24 + audio.bass * .025) % 1;
    const rows = 10, halfColumns = 10;
    const point = (column, depth) => [center + column * w * .13 * depth, horizon + floorHeight * depth];
    // Opaque, full-width cells extend beyond both frame edges. The final row
    // extends below the frame so advancing the floor never leaves a blank gap.
    ctx.globalAlpha = 1;
    ctx.fillStyle = CREAM; ctx.fillRect(0, horizon, w, floorHeight);
    // Batch the colored cells into one fill. Hundreds of individual fills
    // create avoidable canvas/GPU work during full-resolution recording.
    ctx.beginPath();
    for (let row = 0; row < rows; row++) {
      const near = Math.pow((row + 1 + phase) / (rows - .5), 1.6);
      const far = Math.pow((row + phase) / (rows - .5), 1.6);
      const extent = Math.ceil(1 / Math.max(far, .018)) * halfColumns;
      // At the vanishing line each cell is tiny; cap subdivision and fill the
      // distant strip so every pixel remains an intentional checker floor.
      const columns = Math.min(90, extent);
      for (let column = -columns; column < columns; column++) {
        if ((column + row) % 2 === 0) continue;
        const points = [point(column, far), point(column + 1, far), point(column + 1, near), point(column, near)];
        points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
        ctx.closePath();
      }
    }
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = .92; ctx.strokeStyle = color; ctx.lineWidth = 2;
    line(ctx, 0, horizon - 7, w, horizon - 7);
    line(ctx, 0, horizon - 17, w, horizon - 17);
  }),

  dashes: isolated(({ ctx, w, h, t, density, color, audio, faces, hands, variant }) => {
    const areas = people(faces, hands), count = Math.round(16 + density * 30);
    ctx.lineCap = 'butt';
    for (let i = 0; i < count; i++) {
      const x = .035 + hash(i * 11 + variant) * .93;
      const speed = .05 + hash(i * 5) * .11;
      const y = ((hash(i * 3 + variant * 7) + t * speed) % 1.25) - .16;
      const length = h * (.035 + hash(i * 17) * .11) * (1 + audio.high * .2);
      if (!free(x, y + length / h * .5, areas, .018)) continue;
      ctx.strokeStyle = i % 5 === 1 ? CREAM : color;
      ctx.lineWidth = i % 8 === 0 ? 7 : 2 + density * 2;
      ctx.globalAlpha = .8 + hash(i * 2) * .2;
      line(ctx, x * w, y * h, x * w, y * h + length);
    }
  }),

  blocks: isolated(({ ctx, w, h, localTime, density, color, faces, variant }) => {
    const right = openSide(faces, variant);
    const phase = localTime % 4, travel = .72 + .28 * Math.sin(Math.min(1, phase / .55) * Math.PI / 2);
    const width = w * (.17 + density * .1), height = h * (.26 + density * .14);
    const x = right ? w - width * travel : -width * (1 - travel);
    const y = h * (.19 + Math.floor(localTime / 4) % 2 * .18);
    ctx.fillStyle = color; ctx.globalAlpha = .98; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = CREAM; ctx.fillRect(right ? x - 15 : x + width + 4, y, 11, height);
    // The narrow echo belongs to the same flat panel composition.
    ctx.fillStyle = color;
    ctx.fillRect(right ? x + width * .3 : x, y + height + 17, width * .7, 12 + density * 9);
  }),

  rectangles: isolated(({ ctx, w, h, t, density, color, faces, variant, audio }) => {
    const right = openSide(faces, variant), count = Math.round(3 + density * 5);
    const centerX = w * (right ? .79 : .21), centerY = h * .51;
    const width = w * (.23 + density * .07), height = h * .65;
    const step = Math.min(13 + audio.bass * 2, Math.max(1, (Math.min(width, height) - 24) / (count * 2)));
    ctx.translate(centerX, centerY); ctx.rotate(Math.sin(t * .3) * .045);
    for (let i = 0; i < count; i++) {
      const inset = i * step;
      ctx.strokeStyle = i === count - 2 ? CREAM : color;
      ctx.lineWidth = i === 0 ? 5 : 2.2;
      ctx.globalAlpha = 1 - i * .065;
      const offset = Math.sin(t * .7 - i * .5) * 7;
      roundedRect(ctx, -width / 2 + inset + offset, -height / 2 + inset, width - inset * 2, height - inset * 2, 24 + i * 2);
    }
  }),

  discs: isolated(({ ctx, w, h, t, density, color, faces, variant, audio }) => {
    const right = openSide(faces, variant), x = w * (right ? .82 : .18), y = h * .37;
    const radius = Math.min(w * .115, h * .2) * (.85 + density * .4 + audio.peak * .08);
    ctx.fillStyle = color; ctx.globalAlpha = .98;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .16); plus(ctx, 0, 0, radius * .9, radius * .14); ctx.restore();
    const smallX = x + (right ? -1 : 1) * radius * .77, smallY = y + radius * 1.9;
    ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(smallX, smallY, radius * .45, 0, TAU); ctx.fill();
    ctx.fillStyle = color; plus(ctx, x + (right ? 1 : -1) * radius * .55, smallY + radius * .28, radius * .57, radius * .11);
  }),

  geometry: isolated(({ ctx, w, h, localTime, density, color, faces, variant, audio }) => {
    const right = openSide(faces, variant), x = w * (right ? .79 : .21), y = h * .48;
    const size = Math.min(w * .21, h * .37) * (.88 + density * .24);
    const turn = Math.sin(localTime * .32) * .14;
    ctx.translate(x, y); ctx.rotate(turn); ctx.strokeStyle = color; ctx.lineWidth = 3;
    const triangle = [[0, -size], [size * .88, size * .55], [-size * .88, size * .55]];
    polygon(ctx, triangle);
    const depth = 27 + audio.bass * 7;
    const back = triangle.map(([px, py]) => [px - depth, py + depth]);
    ctx.lineWidth = 1.6; polygon(ctx, back);
    triangle.forEach(([px, py], i) => line(ctx, px, py, back[i][0], back[i][1]));
    ctx.strokeStyle = CREAM; ctx.lineWidth = 2;
    polygon(ctx, [[0, -size * .48], [size * .42, size * .27], [-size * .42, size * .27]]);
    ctx.fillStyle = color;
    triangle.forEach(([px, py]) => ctx.fillRect(px - 5, py - 5, 10, 10));
  }),

  orbital: isolated(({ ctx, w, h, t, density, color, faces, variant, audio }) => {
    const right = openSide(faces, variant), x = w * (right ? .8 : .2), y = h * .46;
    const radius = Math.min(w * .19, h * .31) * (.85 + density * .23);
    ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 3;
    const rotation = t * .18;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * (.28 + audio.mid * .045), rotation + i * Math.PI / 3, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(0, 0, 9 + density * 5, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    const a = t * .65, px = Math.cos(a) * radius, py = Math.sin(a) * radius * .28;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    ctx.beginPath(); ctx.arc(px * cos - py * sin, px * sin + py * cos, 7, 0, TAU); ctx.fill();
  }),

  doodles: isolated(({ ctx, w, h, t, density, color, faces, hands, variant }) => {
    const face = bounds(faces[0]?.landmarks || faces[0]);
    const hand = bounds(hands[0]?.landmarks || hands[0]);
    const placements = [];
    if (face) {
      const right = (face.x + face.r) / 2 < .5;
      placements.push([clamp((right ? face.r + .09 : face.x - .09) * w, w * .085, w * .915), clamp((face.y + face.b) / 2 * h, h * .16, h * .7)]);
    } else placements.push([w * (variant % 2 ? .85 : .15), h * .36]);
    if (hand) placements.push([clamp((hand.r + .06) * w, w * .08, w * .92), clamp((hand.y - .08) * h, h * .15, h * .7)]);
    else if (density > .45) placements.push([w * (variant % 2 ? .12 : .88), h * .7]);
    if(density>.55)placements.push([w*(variant%2?.18:.82),h*.23]);
    const size = 42 + density * 32;
    placements.slice(0, 3).forEach(([x, y], i) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.3 + i) * .06);
      ctx.strokeStyle = CREAM; ctx.fillStyle = CREAM; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Small drawn characters: an imperfect head, curved torso, arms and legs.
      ctx.beginPath();
      for (let j = 0; j <= 25; j++) {
        const a = j / 25 * TAU, r = size * (.24 + Math.sin(a * 3 + i) * .014);
        const px = Math.cos(a) * r, py = Math.sin(a) * r - size * .65;
        ctx[j ? 'lineTo' : 'moveTo'](px, py);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -size * .4); ctx.quadraticCurveTo(-size * .12, 0, size * .04, size * .45); ctx.stroke();
      const wave = Math.sin(t * 2 + i) * size * .16;
      ctx.beginPath(); ctx.moveTo(-size * .63, -size * .12 + wave); ctx.quadraticCurveTo(-size * .26, size * .12, 0, -size * .08); ctx.quadraticCurveTo(size * .34, -size * .25, size * .58, -size * .58 - wave); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * .5, size * .94); ctx.lineTo(size * .04, size * .45); ctx.lineTo(size * .5, size * .94); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      for (let ray = 0; ray < 3; ray++) { const a = -Math.PI * .9 + ray * .38; line(ctx, Math.cos(a) * size * .55, -size * .65 + Math.sin(a) * size * .55, Math.cos(a) * size * .77, -size * .65 + Math.sin(a) * size * .77); }
      ctx.restore();
    });
  }),

  waves: isolated(({ ctx, w, h, t, density, color, audio }) => {
    const count = Math.round(2 + density * 3), baseline = h * .76;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
      const y = baseline + i * (14 + density * 8), phase = t * .7 - i * .25;
      const amplitude = h * (.07 + audio.bass * .035);
      ctx.strokeStyle = i === 1 ? CREAM : color; ctx.lineWidth = i === 0 ? 6 : 2.5 + density;
      ctx.globalAlpha = .94;
      ctx.beginPath();
      for (let step = 0; step <= 100; step++) {
        const x = w * (-.05 + step / 100 * 1.1);
        const py = y + Math.sin(x / w * TAU * 1.15 + phase) * amplitude;
        ctx[step ? 'lineTo' : 'moveTo'](x, py);
      }
      ctx.stroke();
    }
  }),

  starburst: isolated(({ ctx, w, h, t, density, color, faces, variant, audio }) => {
    const right = openSide(faces, variant), x = w * (right ? .86 : .14), y = h * .3;
    const radius = Math.min(w * .19, h * .34) * (.85 + density * .25 + audio.peak * .1);
    const rays = Math.round(24 + density * 26), inner = radius * .14;
    ctx.translate(x, y); ctx.rotate(t * .08); ctx.strokeStyle = color; ctx.lineCap = 'butt';
    for (let i = 0; i < rays; i++) {
      const a = i / rays * TAU, outer = radius * (i % 2 ? .86 : 1);
      ctx.lineWidth = i % 4 === 0 ? 5 : 2.3;
      line(ctx, Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * outer, Math.sin(a) * outer);
    }
    ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(0, 0, inner * .48, 0, TAU); ctx.fill();
  }),
};
