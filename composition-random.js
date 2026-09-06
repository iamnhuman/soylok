// Stateless, named random values keep a composition identical while scrubbing,
// rendering previews, and exporting. No randomness depends on the frame rate.
function hash(value) {
  let n = 2166136261;
  for (const char of String(value)) { n ^= char.charCodeAt(0); n = Math.imul(n, 16777619); }
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15; n = Math.imul(n, 0x846ca68b);
  return (n ^ n >>> 16) >>> 0;
}

export function normalizeVariant(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

const cache = new Map();
export function designFor(id, variant = 1, modes = 4) {
  variant = normalizeVariant(variant);
  modes = Math.max(1, Math.floor(modes) || 1);
  const key = `${id}:${variant}:${modes}`;
  if (cache.has(key)) return cache.get(key);
  const seed = hash(`${id}:${variant}`);
  const value = slot => hash(`${seed}:${slot}`) / 4294967296;
  const range = (slot, min, max) => min + value(slot) * (max - min);
  const int = (slot, min, max) => Math.floor(range(slot, min, max + 1));
  const design = Object.freeze({
    seed, mode: (variant - 1) % modes, value, range, int,
    pick: (slot, items) => items[int(slot, 0, items.length - 1)],
    sign: slot => value(slot) < .5 ? -1 : 1,
    shuffle: (slot, items) => {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(`${slot}:${i}`, 0, i);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
  });
  // Thumbnails reuse these plans. Keep memory bounded across long editing sessions.
  if (cache.size >= 512) cache.delete(cache.keys().next().value);
  cache.set(key, design);
  return design;
}
