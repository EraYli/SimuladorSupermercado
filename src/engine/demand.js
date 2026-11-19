/**
 * Llegadas: proceso de Poisson NO homogéneo λ(t) simulado con adelgazamiento (Lewis–Shedler).
 * λ(t) = baseRate · perfilHorario(hora del día) · factorDía
 */
import { DAY_FACTORS } from './config.js';

const NORMAL = [0.05,0.05,0.05,0.05,0.05,0.1,0.15,0.3,0.4,0.6,0.8,0.9,1.0,1.1,1.1,0.9,0.8,1.3,1.7,1.6,1.1,0.6,0.3,0.1];
const DOBLE = [0.05,0.05,0.05,0.05,0.05,0.1,0.15,0.3,0.4,0.6,0.9,1.1,1.3,1.5,1.5,1.0,0.8,1.3,1.7,1.6,1.1,0.6,0.3,0.1];
export const HOURLY_PROFILES = Object.freeze({
  normal: Object.freeze(NORMAL),        // pico de tarde (18–19 h) y valle de mañana
  'doble-pico': Object.freeze(DOBLE),   // picos 13–14 h y 18–19 h
  plano: Object.freeze(Array(24).fill(1)),
});

/** Multiplicador interpolado linealmente entre horas (sin saltos bruscos). */
export function hourMultiplier(profile, hourOfDay) {
  const table = HOURLY_PROFILES[profile] ?? HOURLY_PROFILES.normal;
  const h = ((hourOfDay % 24) + 24) % 24;
  const i = Math.floor(h);
  const f = h - i;
  return table[i] * (1 - f) + table[(i + 1) % 24] * f;
}

/** λ(t) en clientes/segundo (t en segundos desde el inicio). */
export function lambdaPerSec(cfg, t) {
  const hour = cfg.startHour + t / 3600;
  return (cfg.baseRate / 60) * hourMultiplier(cfg.demandProfile, hour) * DAY_FACTORS[cfg.dayType];
}

/** Cota superior de λ para el adelgazamiento. */
export function lambdaMaxPerSec(cfg) {
  const table = HOURLY_PROFILES[cfg.demandProfile] ?? HOURLY_PROFILES.normal;
  return (cfg.baseRate / 60) * Math.max(...table) * DAY_FACTORS[cfg.dayType];
}

export class ArrivalProcess {
  constructor(rng) { this.rng = rng; }
  /** Próximo instante de llegada posterior a `from`, o Infinity si supera la duración. */
  next(from, cfg) {
    const horizon = cfg.durationMin * 60;
    const lmax = lambdaMaxPerSec(cfg);
    if (!(lmax > 0)) return Infinity;
    let t = from;
    for (let i = 0; i < 200000; i++) {
      t += this.rng.exponential(lmax);
      if (t >= horizon) return Infinity;
      if (this.rng.next() * lmax <= lambdaPerSec(cfg, t)) return t;
    }
    return Infinity;
  }
}

/** E[N] = ∫ λ(t) dt (integración trapezoidal) — sirve para validar el generador. */
export function expectedArrivals(cfg, from = 0, to = cfg.durationMin * 60, step = 10) {
  let sum = 0;
  for (let t = from; t < to; t += step) {
    const t2 = Math.min(t + step, to);
    sum += 0.5 * (lambdaPerSec(cfg, t) + lambdaPerSec(cfg, t2)) * (t2 - t);
  }
  return sum;
}
