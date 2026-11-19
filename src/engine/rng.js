/**
 * Generador pseudoaleatorio con semilla (mulberry32) + distribuciones.
 * Reproducibilidad: misma semilla => misma simulación (clave para comparar escenarios).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deriva semillas independientes (flujos separados) a partir de una semilla base. */
export function deriveSeed(seed, salt) {
  let h = (seed >>> 0) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Random {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }
  next() { return this._next(); }
  uniform(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.uniform(a, b + 1)); }
  chance(p) { return this.next() < p; }
  exponential(rate) { return -Math.log(1 - this.next()) / rate; }
  normal(mean = 0, sd = 1) {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  lognormal(mu, sigma) { return Math.exp(this.normal(mu, sigma)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
