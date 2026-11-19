/**
 * Motor de simulación (híbrido evento/tiempo):
 *  - Llegadas y finales de servicio son eventos con tiempo exacto (Poisson no homogéneo).
 *  - El movimiento por rutas fijas avanza con un paso fijo de 0.5 s simulados.
 * 100% independiente de React/DOM: corre igual en navegador y en Node (pruebas, optimizador).
 */
import { DEFAULT_CONFIG, validateConfig } from './config.js';
import { Random, deriveSeed } from './rng.js';
import { ArrivalProcess, expectedArrivals, lambdaPerSec } from './demand.js';
import { buildLayout } from './layout.js';
import { CustomerState, createCustomer } from './customer.js';
import { MovementSystem } from './movement.js';
import { CheckoutSystem } from './checkout.js';
import { MetricsCollector } from './metrics.js';
import { formatDayClock, formatElapsed } from '../utils/format.js';

export const TICK_SEC = 0.5;
const SAMPLE_SEC = 30;
const JOCKEY_SEC = 20;
const MAX_DRAIN_SEC = 3600;
const RATE_FIELDS = ['baseRate', 'demandProfile', 'startHour', 'dayType', 'durationMin'];

export class Simulation {
  constructor(partialConfig = {}, { layout } = {}) {
    const v = validateConfig(partialConfig, DEFAULT_CONFIG);
    this.config = v.config;
    this.configIssues = { errors: v.errors, warnings: v.warnings };
    this.layout = layout ?? buildLayout();

    const seed = this.config.seed;
    // Flujos aleatorios independientes => comparaciones justas entre escenarios
    this.rng = {
      arrivals: new Random(deriveSeed(seed, 1)),
      customers: new Random(deriveSeed(seed, 2)),
      choice: new Random(deriveSeed(seed, 3)),
    };
    this.listeners = [];
    this.arrivals = new ArrivalProcess(this.rng.arrivals);
    this.movement = new MovementSystem(this.layout);
    this.checkout = new CheckoutSystem(this.layout, () => this.config, this.rng.choice, (type, p) => this._emit(type, p));
    this.metrics = new MetricsCollector();

    this.customers = new Map();
    this.t = 0; this.tickId = 0; this._acc = 0; this._nextId = 1;
    this._nextSample = SAMPLE_SEC; this._nextJockey = JOCKEY_SEC;
    this.exited = 0; this.unserved = 0;
    this.status = 'running'; // running | closing | finished
    this.checkout.setOpenCount(this.config.openCashiers, 0);
    this.nextArrival = this.arrivals.next(0, this.config);
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  _emit(type, payload) { for (const f of this.listeners) f({ type, ...payload }); }

  get durationSec() { return this.config.durationMin * 60; }
  get finished() { return this.status === 'finished'; }

  /** Avanza `simSeconds` segundos simulados (el controlador lo llama en cada frame). */
  advance(simSeconds) {
    if (!(simSeconds > 0)) return;
    this._acc += simSeconds;
    while (this._acc >= TICK_SEC && this.status !== 'finished') { this._tick(TICK_SEC); this._acc -= TICK_SEC; }
  }

  /** Ejecuta hasta terminar (modo headless: optimizador de escenarios y pruebas). */
  run() {
    while (this.status !== 'finished') this._tick(TICK_SEC);
    return this.getReport();
  }

  _tick(dt) {
    this.t += dt; this.tickId++;
    const t = this.t, cfg = this.config;

    // 1) Llegadas
    if (this.status === 'running') {
      while (this.nextArrival <= t) { this._spawn(this.nextArrival); this.nextArrival = this.arrivals.next(this.nextArrival, cfg); }
      if (t >= this.durationSec) this.status = cfg.drain ? 'closing' : 'finished';
    }

    // 2) Movimiento por rutas fijas
    for (const c of this.movement.step(dt, t, this.tickId)) this._atCheckout(c, t);

    // 3) Cajas
    for (const c of this.checkout.step(dt, t)) {
      this.metrics.recordService(c, cfg);
      c.mode = 'direct';
    }
    if (t >= this._nextJockey) { this.checkout.jockey(t); this._nextJockey = t + JOCKEY_SEC; }

    // 4) Movimiento directo (zona de cajas y salida)
    this._moveDirect(dt);

    // 5) Muestreo
    if (t >= this._nextSample) { this._sample(t); this._nextSample = t + SAMPLE_SEC; }

    // 6) Fin
    if (this.status === 'closing' && this.customers.size === 0) this._finish();
    else if (t >= this.durationSec + MAX_DRAIN_SEC || this.status === 'finished') { this.unserved = this._unresolved(); this._finish(); }
  }

  /** Clientes aún sin resolver (comprando, en fila o pagando). */
  _unresolved() {
    let n = 0;
    for (const c of this.customers.values()) if (c.state === CustomerState.SHOPPING || c.state === CustomerState.QUEUEING || c.state === CustomerState.PAYING) n++;
    return n;
  }

  _finish() {
    this.status = 'finished';
    this._sample(this.t);
  }

  _spawn(at) {
    const c = createCustomer(this._nextId++, at, this.rng.customers, this.layout, this.config);
    this.customers.set(c.id, c);
    this.metrics.recordArrival();
    this.movement.spawn(c);
  }

  _atCheckout(c, t) {
    c.shoppingEndAt = t;
    c.mode = 'direct';
    const r = this.checkout.join(c, t);
    if (!r.joined) {
      c.state = CustomerState.ABANDONED;
      this.metrics.recordAbandon();
      this._emit('abandon', { t, id: c.id, estimate: r.estimate });
    }
  }

  _assignTargets() {
    const L = this.layout;
    for (const k of this.checkout.cashiers) {
      if (k.serving) { const p = L.servingPos(k.id); k.serving.tx = p.x; k.serving.ty = p.y; }
      k.queue.forEach((c, i) => { const p = L.queueSlot(k.id, i); c.tx = p.x; c.ty = p.y; });
    }
    this.checkout.shared.forEach((c, i) => { const p = L.singleSlot(i); c.tx = p.x; c.ty = p.y; });
  }

  _moveDirect(dt) {
    this._assignTargets();
    const ex = this.layout.exitPoint;
    for (const c of this.customers.values()) {
      if (c.mode !== 'direct') continue;
      const leaving = c.state === CustomerState.LEAVING || c.state === CustomerState.ABANDONED;
      const tx = leaving ? ex.x : c.tx, ty = leaving ? ex.y : c.ty;
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), step = c.speed * dt;
      if (d <= step) { c.x = tx; c.y = ty; } else { c.x += (dx / d) * step; c.y += (dy / d) * step; }
      if (leaving && d <= 0.3) { this.customers.delete(c.id); this.exited++; }
    }
  }

  _sample(t) {
    const cfg = this.config;
    this.metrics.sample({
      t, clock: formatDayClock(t, cfg.startHour),
      avgWaitSec: this.metrics.rollingWait(t),
      queueTotal: this.checkout.queueTotal,
      inStore: this.customers.size,
      lambdaPerMin: t < this.durationSec ? lambdaPerSec(cfg, t) * 60 : 0,
    });
  }

  /** Cambios de parámetros EN VIVO. Nunca lanza: devuelve errores/avisos y conserva lo válido. */
  updateConfig(patch) {
    const p = (patch && typeof patch === 'object') ? { ...patch } : patch;
    const warnings = [];
    if (p && typeof p === 'object' && 'seed' in p && p.seed !== this.config.seed) {
      delete p.seed; warnings.push({ field: 'seed', message: 'La semilla solo cambia al reiniciar la simulación.' });
    }
    const v = validateConfig(p, this.config);
    this.config = v.config;
    const ch = v.changed;
    if (ch.includes('openCashiers')) this.checkout.setOpenCount(this.config.openCashiers, this.t);
    if (ch.includes('queueType')) this.checkout.switchQueueType(this.config.queueType, this.t);
    if (ch.some((k) => RATE_FIELDS.includes(k)) && this.status !== 'finished') {
      if (this.status === 'closing' && this.durationSec > this.t) this.status = 'running';
      if (this.status === 'running') {
        if (this.t >= this.durationSec) this.status = this.config.drain ? 'closing' : 'finished';
        else this.nextArrival = this.arrivals.next(this.t, this.config); // sin memoria: es válido re-muestrear
      }
    }
    return { ok: v.errors.length === 0, errors: v.errors, warnings: [...warnings, ...v.warnings], changed: ch, config: this.config };
  }

  // ---------- Lectura de estado ----------
  getSnapshot() {
    const L = this.layout;
    return {
      t: this.t, status: this.status,
      clock: formatDayClock(this.t, this.config.startHour),
      elapsed: formatElapsed(this.t),
      progress: Math.min(1, this.t / this.durationSec),
      queueType: this.checkout.mode,
      customers: [...this.customers.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, state: c.state, items: c.items })),
      cashiers: this.checkout.cashiers.filter((k) => k.isOpen).map((k) => ({
        id: k.id, ...L.cashierPos(k.id), status: k.status, closing: k.closing,
        queueLength: k.queue.length, serving: !!k.serving,
      })),
      sharedQueueLength: this.checkout.shared.length,
    };
  }

  getMetrics() {
    const m = this.metrics, t = this.t;
    const cashiers = this.checkout.cashiers.map((k) => ({
      id: k.id, number: k.id + 1, isOpen: k.isOpen, closing: k.closing, status: k.status,
      queueLength: k.queue.length + (k.serving ? 1 : 0),
      served: k.servedCount, busySec: k.busySec, openSec: k.openSec, idleSec: Math.max(0, k.openSec - k.busySec),
      utilizationPct: k.openSec > 0 ? (100 * k.busySec) / k.openSec : 0,
      delays: k.delayCount, delaySec: k.delaySec,
    }));
    const used = cashiers.filter((k) => k.openSec > 0);
    const totBusy = used.reduce((s, k) => s + k.busySec, 0), totOpen = used.reduce((s, k) => s + k.openSec, 0);
    let longest = 0;
    for (const k of this.checkout.cashiers) for (const c of k.queue) longest = Math.max(longest, t - c.queueJoinedAt);
    for (const c of this.checkout.shared) longest = Math.max(longest, t - c.queueJoinedAt);
    const ended = m.served + m.abandoned;
    return {
      t, clock: formatDayClock(t, this.config.startHour), elapsed: formatElapsed(t), status: this.status,
      arrivals: m.arrivals, served: m.served, abandoned: m.abandoned,
      abandonRatePct: m.arrivals ? (100 * m.abandoned) / m.arrivals : 0,
      inStore: this.customers.size, inQueue: this.checkout.queueTotal,
      avgWaitSec: m.avgWait, maxWaitSec: m.maxWait, p95WaitSec: m.p95Wait(), longestCurrentWaitSec: longest,
      avgSystemTimeSec: m.served ? m.systemTimeSum / m.served : 0,
      satisfactionPct: m.satisfactionPct, peakQueue: m.peakQueue,
      avgUtilizationPct: totOpen > 0 ? (100 * totBusy) / totOpen : 0,
      busySecTotal: totBusy, idleSecTotal: Math.max(0, totOpen - totBusy),
      openCashiers: this.checkout.activeCashiers.length,
      cashiers, series: m.series,
      jockeyCount: this.checkout.jockeyCount, deadlockBreaks: this.movement.deadlockBreaks,
      unserved: this.unserved, completedPct: ended,
    };
  }

  /** Reporte final (Vista 4) y base de los escenarios guardados (Vista 5). */
  getReport(label) {
    const m = this.getMetrics();
    return {
      label: label ?? `${this.config.openCashiers} cajas · ${this.config.queueType === 'unica' ? 'fila única' : 'por caja'}`,
      config: { ...this.config },
      finishedAtSec: this.t,
      expectedArrivals: expectedArrivals(this.config),
      summary: {
        arrivals: m.arrivals, served: m.served, abandoned: m.abandoned, abandonRatePct: m.abandonRatePct,
        avgWaitSec: m.avgWaitSec, maxWaitSec: m.maxWaitSec, p95WaitSec: m.p95WaitSec,
        avgSystemTimeSec: m.avgSystemTimeSec, satisfactionPct: m.satisfactionPct,
        avgUtilizationPct: m.avgUtilizationPct, peakQueue: m.peakQueue,
        busySecTotal: m.busySecTotal, idleSecTotal: m.idleSecTotal,
        openCashiers: this.config.openCashiers, queueType: this.config.queueType,
        unserved: m.unserved, jockeyCount: m.jockeyCount, deadlockBreaks: m.deadlockBreaks,
      },
      cashiers: m.cashiers.filter((k) => k.openSec > 0),
      series: m.series,
    };
  }
}
