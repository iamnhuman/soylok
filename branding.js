// Restores the lockup from the original drawEndCard: orange circle, white Д,
// and orange ДИКСИ in Arial. Its colors never follow the effect accent.
const ORANGE = '#ff6a00';
const WHITE = '#ffffff';

function roundedCard(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}

function faceBoxes(faces, width, height) {
  return faces.map(face => {
    const points = face?.landmarks || face;
    if (!points?.length) return null;
    const xs = points.map(point => point.x * width), ys = points.map(point => point.y * height);
    const padding = Math.min(width, height) * .018;
    return { x: Math.min(...xs) - padding, y: Math.min(...ys) - padding,
      right: Math.max(...xs) + padding, bottom: Math.max(...ys) + padding };
  }).filter(Boolean);
}

// Video time keeps flashes identical during playback, seeking, and export.
export function dixyOutroState(time, duration) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return null;
  const length = Math.min(3, duration * .2), start = duration - length;
  if (time < start || time > duration) return null;
  const elapsed = time - start;
  if (duration - time <= Math.min(.35, length * .25)) return { cornerIndex: 0 };
  const flash = Math.floor(elapsed / .6);
  if (elapsed - flash * .6 >= .38) return null;
  return { cornerIndex: flash % 4 };
}

/** Draw the outro last so preview and export share the same branding. */
export function drawDixyBrand(ctx, { width, height, time, duration, faces = [] }) {
  const outro = dixyOutroState(time, duration);
  if (!outro || !(width > 0 && height > 0)) return null;
  ctx.save();
  try {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.shadowColor = 'transparent'; ctx.filter = 'none';
    const short = Math.min(width, height);
    const radius = Math.min(short * .048, width * .038);
    const padding = radius * .28, margin = short * .028;
    // These relative type sizes and the icon-to-word gap match drawEndCard.
    const wordSize = radius * (5 / 6), iconSize = radius * 1.12;
    ctx.font = `800 ${wordSize}px Arial, Helvetica, sans-serif`;
    const wordWidth = ctx.measureText('ДИКСИ').width;
    const wordOffset = radius * (140 / 81);
    const cardWidth = padding * 2 + radius + wordOffset + wordWidth;
    const cardHeight = radius * 2 + padding * 2;
    const candidates = [
      { x: width - margin - cardWidth, y: height - margin - cardHeight, corner: 'bottom-right' },
      { x: margin, y: height - margin - cardHeight, corner: 'bottom-left' },
      { x: width - margin - cardWidth, y: margin, corner: 'top-right' },
      { x: margin, y: margin, corner: 'top-left' },
    ];
    const boxes = faceBoxes(faces, width, height);
    const overlap = position => boxes.reduce((area, face) => area +
      Math.max(0, Math.min(position.x + cardWidth, face.right) - Math.max(position.x, face.x)) *
      Math.max(0, Math.min(position.y + cardHeight, face.bottom) - Math.max(position.y, face.y)), 0) / (cardWidth * cardHeight);
    let position = candidates[outro.cornerIndex];
    const defaultOverlap = overlap(position);
    // Stay in the expected corner unless a detected face substantially overlaps
    // it. A large improvement is required, avoiding small landmark jitter.
    if (defaultOverlap > .18) {
      const alternative = candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best, position);
      if (overlap(alternative) < defaultOverlap * .45) position = alternative;
    }
    const { x, y } = position, centerX = x + padding + radius, centerY = y + padding + radius;
    ctx.fillStyle = WHITE; roundedCard(ctx, x, y, cardWidth, cardHeight, radius * .13); ctx.fill();
    ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WHITE; ctx.font = `900 ${iconSize}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Д', centerX, centerY + radius * .04);
    ctx.fillStyle = ORANGE; ctx.font = `800 ${wordSize}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText('ДИКСИ', centerX + wordOffset, centerY);
    return { x, y, width: cardWidth, height: cardHeight, corner: position.corner };
  } finally { ctx.restore(); }
}
