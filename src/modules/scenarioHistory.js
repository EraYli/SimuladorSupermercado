/**
 * Historial de escenarios (Etapa 2): guardar corridas, compararlas y recomendar el punto de equilibrio.
 */
import { Simulation } from '../engine/simulation.js';

export class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

/** Corre un escenario completo sin interfaz (para el optimizador). */
export function runScenario(config, label) {
  const report = new Simulation(config).run();
  if (label) report.label = label;
  return report;
}

/** Mismo tráfico (misma semilla) con distinto número de cajas: comparación justa. */
export function runCashierSweep(baseConfig, cashierCounts) {
  return cashierCounts.map((n) => runScenario({ ...baseConfig, openCashiers: n }, `${n} cajas`));
}

/** Espera promedio por tramos de la simulación (12 puntos, como la gráfica del prototipo). */
export function bucketWaitSeries(series, durationSec, buckets = 12) {
  const out = Array.from({ length: buckets }, () => ({ sum: 0, n: 0 }));
  for (const p of series) {
    const i = Math.min(buckets - 1, Math.floor((p.t / Math.max(1, durationSec)) * buckets));
    out[i].sum += p.avgWaitSec; out[i].n++;
  }
  return out.map((b) => (b.n ? b.sum / b.n : 0));
}

const comparableKeys = ['baseRate', 'durationMin', 'startHour', 'dayType', 'demandProfile', 'seed'];

export class ScenarioHistory {
  constructor({ storage = new MemoryStorage(), key = 'supermercado-sim:scenarios', maxItems = 20 } = {}) {
    this.storage = storage; this.key = key; this.maxItems = maxItems;
  }

  list() {
    try {
      const raw = this.storage.getItem(this.key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; } // almacenamiento corrupto => historial vacío, nunca error
  }
  _write(items) { try { this.storage.setItem(this.key, JSON.stringify(items)); } catch { /* cuota llena: se ignora */ } }

  save(report, name) {
    if (!report?.summary || !report?.config) throw new Error('Reporte inválido: ejecuta la simulación hasta el final antes de guardar.');
    const items = this.list();
    const rec = {
      id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: (name ?? report.label ?? 'Escenario').slice(0, 60),
      savedAt: new Date().toISOString(),
      config: pick(report.config, [...comparableKeys, 'openCashiers', 'queueType']),
      summary: { ...report.summary },
      utilization: report.cashiers.map((k) => Math.round(k.utilizationPct)),
      waitSeries: bucketWaitSeries(report.series, report.config.durationMin * 60),
    };
    items.push(rec);
    while (items.length > this.maxItems) items.shift();
    this._write(items);
    return rec;
  }
  remove(id) { this._write(this.list().filter((r) => r.id !== id)); }
  clear() { this._write([]); }
  select(ids) { const all = this.list(); return ids?.length ? all.filter((r) => ids.includes(r.id)) : all; }

  /** Filas para la tabla comparativa (Vista 5). */
  compare(ids) {
    const recs = this.select(ids).sort((a, b) => a.config.openCashiers - b.config.openCashiers);
    const warnings = [];
    if (recs.length > 1) {
      for (const k of comparableKeys) if (new Set(recs.map((r) => r.config[k])).size > 1)
        warnings.push(`Los escenarios difieren en "${k}": la comparación puede no ser equivalente.`);
    }
    return {
      rows: recs.map((r) => ({
        id: r.id, name: r.name, cajas: r.config.openCashiers, fila: r.config.queueType,
        esperaPromSec: r.summary.avgWaitSec, esperaMaxSec: r.summary.maxWaitSec, p95Sec: r.summary.p95WaitSec,
        atendidos: r.summary.served, abandonoPct: r.summary.abandonRatePct,
        satisfaccionPct: r.summary.satisfactionPct, utilizacionPct: r.summary.avgUtilizationPct,
      })),
      chart: recs.map((r) => ({ id: r.id, name: r.name, values: r.waitSeries })),
      warnings,
      recommendation: recommendOptimal(recs),
    };
  }

  exportJSON(ids) { return JSON.stringify(this.select(ids), null, 2); }
  exportCSV(ids) { return toCSV(this.compare(ids).rows); }
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/**
 * Punto de equilibrio: la configuración MÁS BARATA (menos cajas) que cumple los umbrales de servicio
 * y a partir de la cual agregar otra caja ya no mejora la espera de forma importante.
 */
export function recommendOptimal(records, { maxAbandonPct = 5, minSatisfactionPct = 80, minMarginalGainPct = 15 } = {}) {
  if (!records?.length) return { recommendedId: null, reason: 'Guarda al menos un escenario para obtener una recomendación.', ranking: [] };
  const viable = (r) => r.summary.satisfactionPct >= minSatisfactionPct && r.summary.abandonRatePct <= maxAbandonPct;

  const groups = new Map();
  for (const r of records) { const g = groups.get(r.config.queueType) ?? []; g.push(r); groups.set(r.config.queueType, g); }

  const candidates = [];
  const ranking = [];
  for (const [type, g] of groups) {
    g.sort((a, b) => a.config.openCashiers - b.config.openCashiers);
    let pickRec = null, gainAtPick = null;
    g.forEach((r, i) => {
      const next = g[i + 1];
      const gain = next ? ((r.summary.avgWaitSec - next.summary.avgWaitSec) / Math.max(r.summary.avgWaitSec, 1)) * 100 : 0;
      ranking.push({ id: r.id, name: r.name, queueType: type, cajas: r.config.openCashiers, viable: viable(r), marginalGainPct: next ? gain : null });
      if (!pickRec && viable(r) && (!next || gain < minMarginalGainPct)) { pickRec = r; gainAtPick = next ? gain : null; }
    });
    if (pickRec) candidates.push({ rec: pickRec, gain: gainAtPick, ok: true });
  }

  if (!candidates.length) {
    const best = [...records].sort((a, b) => b.summary.satisfactionPct - a.summary.satisfactionPct || a.config.openCashiers - b.config.openCashiers)[0];
    return {
      recommendedId: best.id, ranking, viable: false,
      reason: `Ningún escenario cumple satisfacción ≥ ${minSatisfactionPct}% y abandono ≤ ${maxAbandonPct}%. El mejor disponible es "${best.name}"; prueba con más cajas.`,
    };
  }
  candidates.sort((a, b) => a.rec.config.openCashiers - b.rec.config.openCashiers || a.rec.summary.avgWaitSec - b.rec.summary.avgWaitSec);
  const { rec, gain } = candidates[0];
  const s = rec.summary;
  const tail = gain === null ? 'es la opción con más cajas evaluada' : `agregar otra caja solo reduciría la espera ${gain.toFixed(0)}%`;
  return {
    recommendedId: rec.id, ranking, viable: true,
    reason: `"${rec.name}" (${rec.config.openCashiers} cajas): satisfacción ${s.satisfactionPct.toFixed(0)}%, abandono ${s.abandonRatePct.toFixed(1)}%, utilización ${s.avgUtilizationPct.toFixed(0)}%; ${tail}.`,
  };
}
