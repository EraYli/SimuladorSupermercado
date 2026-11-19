/**
 * Controlador (Etapa 2): une Simulation + Store + Historial y maneja el bucle de animación.
 * x1/x5/x10 multiplican la escala base (1 minuto simulado cada 10 s reales a x1).
 */
import { Simulation } from '../engine/simulation.js';
import { validateConfig } from '../engine/config.js';
import { Actions } from './store.js';

export function defaultScheduler() {
  if (typeof requestAnimationFrame === 'function') {
    return { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) };
  }
  return { request: (cb) => setTimeout(() => cb(Date.now()), 16), cancel: (id) => clearTimeout(id) };
}

export class SimulationController {
  constructor({ store, history, scheduler = defaultScheduler(), baseTimeScale = 6, metricsEveryMs = 400 }) {
    this.store = store; this.history = history; this.scheduler = scheduler;
    this.baseTimeScale = baseTimeScale; this.metricsEveryMs = metricsEveryMs;
    this.sim = null; this._raf = null; this._last = null; this._sinceMetrics = 0;
    this.refreshHistory();
  }

  get status() { return this.store.getState().status; }

  start(patch = {}) {
    const v = validateConfig(patch, this.store.getState().config);
    if (!v.ok) { this.store.dispatch(Actions.configApplied(this.store.getState().config, v.errors, v.warnings)); return false; }
    this._cancel();
    this.sim = new Simulation(v.config);
    this.store.dispatch(Actions.started(this.sim.config));
    this._publishMetrics();
    this._loop();
    return true;
  }

  pause() { if (this.status === 'running') { this._cancel(); this.store.dispatch(Actions.status('paused')); } }
  resume() { if (this.status === 'paused' && this.sim) { this.store.dispatch(Actions.status('running')); this._loop(); } }
  toggle() { this.status === 'running' ? this.pause() : this.resume(); }

  reset() {
    this._cancel(); this.sim = null;
    this.store.dispatch(Actions.status('idle'));
    this.store.dispatch(Actions.navigate('config'));
  }

  setSpeed(x) {
    const v = validateConfig({ speed: x }, this.store.getState().config);
    if (!v.ok) { this.store.dispatch(Actions.configApplied(this.store.getState().config, v.errors, v.warnings)); return false; }
    this.store.dispatch(Actions.speed(v.config.speed));
    return true;
  }

  /** Cambia parámetros con la simulación en marcha (cajas, fila, tasa...). Nunca lanza. */
  updateLiveConfig(patch) {
    if (!this.sim) { this.store.dispatch(Actions.editConfig(patch)); return { ok: true }; }
    const p = { ...patch };
    if ('speed' in p) { this.setSpeed(p.speed); delete p.speed; }
    const r = this.sim.updateConfig(p);
    this.store.dispatch(Actions.configApplied({ ...this.sim.config, speed: this.store.getState().speed }, r.errors, r.warnings));
    this._publishMetrics();
    return r;
  }

  getSnapshot() { return this.sim ? this.sim.getSnapshot() : null; }
  get layout() { return this.sim?.layout ?? null; }

  /** Avanza un frame; `realMs` = tiempo real transcurrido. Público para poder probarlo sin navegador. */
  frame(realMs) {
    if (!this.sim || this.status !== 'running') return;
    const dt = Math.min(Math.max(realMs, 0), 100) / 1000; // evita saltos si la pestaña estuvo oculta
    this.sim.advance(dt * this.store.getState().speed * this.baseTimeScale);
    this._sinceMetrics += realMs;
    if (this.sim.finished) return this._finish();
    if (this._sinceMetrics >= this.metricsEveryMs) { this._sinceMetrics = 0; this._publishMetrics(); }
  }

  /** Termina de golpe (botón "Ver resumen"). */
  finishNow() { if (this.sim && !this.sim.finished) { this.sim.run(); this._finish(); } }

  saveCurrentScenario(name) {
    const report = this.store.getState().report;
    if (!report) { this.store.dispatch(Actions.notice('Termina la simulación para guardar el escenario.', 'warning')); return null; }
    const rec = this.history.save(report, name);
    this.refreshHistory();
    this.store.dispatch(Actions.notice(`Escenario "${rec.name}" guardado.`, 'success'));
    return rec;
  }

  refreshHistory() {
    const { rows, recommendation } = this.history.compare();
    this.store.dispatch(Actions.history(this.history.list(), recommendation));
    return rows;
  }

  _publishMetrics() { if (this.sim) this.store.dispatch(Actions.metrics(this.sim.getMetrics())); }
  _finish() {
    this._cancel();
    this.store.dispatch(Actions.finished(this.sim.getReport(), this.sim.getMetrics()));
  }
  _loop() {
    this._last = null;
    const tick = (now) => {
      const real = this._last === null ? 16 : now - this._last;
      this._last = now;
      this.frame(real);
      if (this.status === 'running') this._raf = this.scheduler.request(tick);
    };
    this._raf = this.scheduler.request(tick);
  }
  _cancel() { if (this._raf !== null) { this.scheduler.cancel(this._raf); this._raf = null; } }
}
