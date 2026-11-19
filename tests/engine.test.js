import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Random, deriveSeed, validateConfig, DEFAULT_CONFIG, hourMultiplier, lambdaPerSec, ArrivalProcess, expectedArrivals,
  buildLayout, Simulation, CheckoutSystem, CustomerState, formatDuration, formatDayClock, MAX_CASHIERS,
} from '../src/engine/index.js';

const fast = (o = {}) => ({ durationMin: 60, ...o });

test('RNG: determinista y flujos independientes', () => {
  const a = new Random(7), b = new Random(7);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
  assert.notEqual(deriveSeed(1, 1), deriveSeed(1, 2));
});

test('Config: valida, recorta rangos y rechaza basura sin lanzar', () => {
  const v = validateConfig({ openCashiers: 99, baseRate: 'abc', queueType: 'xx', speed: 7, durationMin: '90', abandonEnabled: 'si' });
  assert.equal(v.config.openCashiers, MAX_CASHIERS);
  assert.equal(v.config.baseRate, DEFAULT_CONFIG.baseRate);
  assert.equal(v.config.queueType, DEFAULT_CONFIG.queueType);
  assert.equal(v.config.speed, DEFAULT_CONFIG.speed);
  assert.equal(v.config.durationMin, 90);
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 4);
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig({ baseRate: NaN }).ok, false);
});

test('Demanda: λ(t) NO es constante (pico vs valle)', () => {
  assert.ok(hourMultiplier('normal', 18.5) > 2 * hourMultiplier('normal', 9));
  const cfg = { ...DEFAULT_CONFIG, startHour: 8 };
  assert.ok(lambdaPerSec(cfg, 10 * 3600) > 2 * lambdaPerSec(cfg, 0));
  assert.equal(hourMultiplier('plano', 3), 1);
});

test('Demanda: el generador no homogéneo reproduce E[N] (promedio de 30 corridas ±5%)', () => {
  const cfg = { ...DEFAULT_CONFIG, startHour: 9, durationMin: 600, demandProfile: 'doble-pico' };
  const expected = expectedArrivals(cfg);
  let total = 0;
  for (let s = 1; s <= 30; s++) {
    const p = new ArrivalProcess(new Random(s));
    let t = 0, n = 0;
    while ((t = p.next(t, cfg)) !== Infinity) n++;
    total += n;
  }
  assert.ok(Math.abs(total / 30 - expected) / expected < 0.05, `${total / 30} vs ${expected}`);
});

test('Demanda: llegadas se concentran en horas pico', () => {
  const cfg = { ...DEFAULT_CONFIG, startHour: 7, durationMin: 840, demandProfile: 'normal' };
  const p = new ArrivalProcess(new Random(3));
  const byHour = Array(24).fill(0);
  let t = 0;
  while ((t = p.next(t, cfg)) !== Infinity) byHour[Math.floor(7 + t / 3600)]++;
  assert.ok(byHour[18] > 3 * byHour[8]);
});

test('Layout: todo estante es alcanzable desde la entrada y llega a las cajas (calles unidireccionales)', () => {
  const L = buildLayout();
  for (const n of L.shelfNodes) {
    assert.ok(L.shortestPath('E', n.id), `E→${n.id}`);
    assert.ok(L.shortestPath(n.id, 'K'), `${n.id}→K`);
  }
  for (const a of L.shelfNodes) for (const b of L.shelfNodes) assert.ok(L.shortestPath(a.id, b.id));
});

test('Movimiento: nunca dos clientes a menos de la distancia mínima en la misma calle y sin bloqueos', () => {
  const sim = new Simulation(fast({ baseRate: 14, startHour: 18, openCashiers: 8 }));
  const eps = 1e-6, minGap = sim.movement.minGap;
  let violations = 0, steps = 0;
  while (!sim.finished && sim.t < 3000) {
    sim.advance(0.5); steps++;
    const byEdge = new Map();
    for (const c of sim.movement.walkers) {
      if (c.aside) continue;
      const k = `${c.nodes[c.leg]}>${c.nodes[c.leg + 1]}`;
      (byEdge.get(k) ?? byEdge.set(k, []).get(k)).push(c.s);
    }
    for (const arr of byEdge.values()) {
      arr.sort((a, b) => a - b);
      for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < minGap - 0.05 - eps) violations++;
    }
    for (const c of sim.customers.values()) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
  }
  assert.equal(sim.movement.deadlockBreaks, 0, 'no debe haber bloqueos');
  assert.ok(violations <= steps * 0.01, `violaciones de distancia: ${violations}`);
});

test('Simulación: determinista con la misma semilla', () => {
  const a = new Simulation(fast({ seed: 5 })).run().summary;
  const b = new Simulation(fast({ seed: 5 })).run().summary;
  const c = new Simulation(fast({ seed: 6 })).run().summary;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('Simulación: conservación de clientes en todo momento', () => {
  const sim = new Simulation(fast({ baseRate: 8, openCashiers: 3 }));
  while (!sim.finished) {
    sim.advance(7);
    const m = sim.getMetrics();
    assert.equal(m.arrivals, m.served + m.abandoned + countUnresolved(sim), 'balance');
  }
  const m = sim.getMetrics();
  assert.equal(sim.customers.size, 0);
  assert.equal(m.arrivals, m.served + m.abandoned);
});
// clientes aún sin resolver: los que ya pagaron/abandonaron y solo caminan a la salida ya están contados
function countUnresolved(sim) {
  let n = 0;
  for (const c of sim.customers.values()) if ([CustomerState.SHOPPING, CustomerState.QUEUEING, CustomerState.PAYING].includes(c.state)) n++;
  return n;
}

test('Más cajas => menos espera (misma demanda, números aleatorios comunes)', () => {
  const base = { durationMin: 90, baseRate: 6, startHour: 17 };
  const w = [3, 5, 8].map((n) => new Simulation({ ...base, openCashiers: n }).run().summary);
  assert.equal(w[0].arrivals, w[1].arrivals); // mismos clientes
  assert.equal(w[1].arrivals, w[2].arrivals);
  assert.ok(w[0].avgWaitSec > w[1].avgWaitSec && w[1].avgWaitSec > w[2].avgWaitSec);
  assert.ok(w[0].avgUtilizationPct > w[2].avgUtilizationPct);
});

test('Decisión: el cliente elige la fila con menor peso personas+productos', () => {
  const L = buildLayout();
  const cfg = { ...DEFAULT_CONFIG, choiceNoise: 0, abandonEnabled: false };
  const cs = new CheckoutSystem(L, () => cfg, new Random(1));
  cs.setOpenCount(3, 0);
  const mk = (id, items) => ({ id, items, state: 'comprando' });
  cs.cashiers[0].queue.push(mk(1, 2), mk(2, 2), mk(3, 2));   // 3 personas, 6 productos
  cs.cashiers[1].queue.push(mk(4, 60));                       // 1 persona, 60 productos
  cs.cashiers[2].queue.push(mk(5, 5), mk(6, 5));              // 2 personas, 10 productos
  const e = cs.cashiers.slice(0, 3).map((k) => cs.estimateCashier(k, 0));
  assert.ok(e[1] > e[0] && e[0] > e[2]); // 1 persona con 60 productos es la peor; 2 personas/10 productos la mejor
  const c = mk(9, 10);
  const r = cs.join(c, 0);
  assert.equal(r.cashierId, 2);
});

test('Retrasos (verificar precio) generan cuellos de botella', () => {
  const base = { durationMin: 60, baseRate: 5, openCashiers: 5, delayMinSec: 40, delayMaxSec: 80 };
  const no = new Simulation({ ...base, delayProbability: 0 }).run().summary;
  const yes = new Simulation({ ...base, delayProbability: 0.5 }).run().summary;
  assert.ok(yes.avgWaitSec > no.avgWaitSec);
  assert.ok(yes.maxWaitSec > no.maxWaitSec);
});

test('Abandono: ocurre si todas las filas superan el umbral y se puede desactivar', () => {
  const base = { durationMin: 60, baseRate: 9, openCashiers: 1, maxWaitSec: 120, abandonProbability: 1 };
  const on = new Simulation({ ...base, abandonEnabled: true }).run().summary;
  const off = new Simulation({ ...base, abandonEnabled: false }).run().summary;
  assert.ok(on.abandoned > 0);
  assert.equal(off.abandoned, 0);
  assert.ok(on.satisfactionPct < 100);
});

test('Fila única vs por caja: ambas atienden a todos', () => {
  for (const queueType of ['unica', 'por-caja']) {
    const s = new Simulation(fast({ queueType, baseRate: 5 })).run().summary;
    assert.equal(s.arrivals, s.served + s.abandoned);
    assert.equal(s.unserved, 0);
  }
});

test('Cambios EN VIVO: cajas, tipo de fila, tasa y duración sin errores ni pérdida de clientes', () => {
  const sim = new Simulation(fast({ baseRate: 6, openCashiers: 4 }));
  const ops = [
    { openCashiers: 8 }, { queueType: 'unica' }, { openCashiers: 2 }, { queueType: 'por-caja' }, { baseRate: 12 },
    { baseRate: 'basura' }, { openCashiers: -5 }, { queueType: 'otra' }, { durationMin: 90 }, { openCashiers: 6, queueType: 'unica' },
    null, { seed: 999 }, { demandProfile: 'plano' }, { openCashiers: 1 },
  ];
  ops.forEach((patch, i) => {
    sim.advance(120);
    assert.doesNotThrow(() => sim.updateConfig(patch));
    const act = sim.checkout.activeCashiers.length;
    assert.ok(act >= 1 && act <= MAX_CASHIERS, `cajas activas ${act} tras op ${i}`);
  });
  assert.equal(sim.config.seed, DEFAULT_CONFIG.seed); // la semilla no cambia en vivo
  const m = sim.run().summary;
  assert.equal(m.arrivals, m.served + m.abandoned + m.unserved); // con 1 sola caja puede quedar gente sin atender al cortar
});

test('Cambios en vivo: valores inválidos se reportan y se conserva el valor anterior', () => {
  const sim = new Simulation(fast());
  const r = sim.updateConfig({ openCashiers: 'x', baseRate: -3 });
  assert.equal(r.ok, false);
  assert.equal(sim.config.openCashiers, DEFAULT_CONFIG.openCashiers);
  assert.ok(sim.config.baseRate >= 0.1);
});

test('Cerrar una caja con fila no deja clientes huérfanos', () => {
  const sim = new Simulation(fast({ baseRate: 9, openCashiers: 6 }));
  sim.advance(900);
  sim.updateConfig({ openCashiers: 1 });
  sim.advance(60);
  const s = sim.run().summary;
  assert.equal(s.arrivals, s.served + s.abandoned + s.unserved);
});

test('Acortar la duración por debajo del tiempo actual cierra la tienda y termina', () => {
  const sim = new Simulation({ durationMin: 120 });
  sim.advance(20 * 60);
  sim.updateConfig({ durationMin: 10 });
  const s = sim.run().summary;
  assert.equal(s.unserved, 0);
  assert.ok(sim.finished);
});

test('Formato: reloj y duración', () => {
  assert.equal(formatDuration(225), '3m 45s');
  assert.equal(formatDayClock(0, 14), '14:00');
  assert.equal(formatDayClock(3600 * 10, 20), '06:00');
});

test('Coherencia: utilización y satisfacción en rangos válidos', () => {
  const m = new Simulation(fast({ baseRate: 6 })).run();
  for (const k of m.cashiers) assert.ok(k.utilizationPct >= 0 && k.utilizationPct <= 100.5);
  assert.ok(m.summary.satisfactionPct >= 0 && m.summary.satisfactionPct <= 100);
  assert.ok(m.summary.maxWaitSec >= m.summary.p95WaitSec && m.summary.p95WaitSec >= 0);
  assert.ok(Math.abs(m.summary.arrivals - m.expectedArrivals) < 5 * Math.sqrt(m.expectedArrivals));
});
