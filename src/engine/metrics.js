/** Recolector de métricas: espera, satisfacción, utilización, serie temporal. */
export function satisfactionFromWait(waitSec, cfg) {
  if (waitSec <= cfg.satisfactionTargetSec) return 100;
  const span = Math.max(1, cfg.maxWaitSec - cfg.satisfactionTargetSec);
  return Math.max(0, 100 * (1 - (waitSec - cfg.satisfactionTargetSec) / span));
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export class MetricsCollector {
  constructor() {
    this.arrivals = 0; this.served = 0; this.abandoned = 0;
    this.waits = []; this.waitSum = 0; this.maxWait = 0;
    this.systemTimeSum = 0; this.satSum = 0; this.satCount = 0;
    this.recent = []; this.series = []; this.peakQueue = 0;
    this._lastRolling = 0;
  }
  recordArrival() { this.arrivals++; }
  recordService(c, cfg) {
    const w = c.waitSec ?? 0;
    this.served++; this.waits.push(w); this.waitSum += w;
    if (w > this.maxWait) this.maxWait = w;
    this.systemTimeSum += c.serviceEndAt - c.arrivedAt;
    this.satSum += satisfactionFromWait(w, cfg); this.satCount++;
    this.recent.push({ t: c.serviceEndAt, wait: w });
  }
  recordAbandon() { this.abandoned++; this.satCount++; }

  rollingWait(t, windowSec = 300) {
    while (this.recent.length && this.recent[0].t < t - windowSec) this.recent.shift();
    if (!this.recent.length) return this._lastRolling;
    this._lastRolling = this.recent.reduce((s, r) => s + r.wait, 0) / this.recent.length;
    return this._lastRolling;
  }

  sample(point) { this.series.push(point); if (point.queueTotal > this.peakQueue) this.peakQueue = point.queueTotal; }

  get avgWait() { return this.served ? this.waitSum / this.served : 0; }
  get satisfactionPct() { return this.satCount ? this.satSum / this.satCount : 100; }
  p95Wait() { return percentile([...this.waits].sort((a, b) => a - b), 0.95); }
}
