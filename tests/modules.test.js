import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, Simulation } from '../src/engine/index.js';
import { createAppStore, Actions } from '../src/modules/store.js';
import { SimulationController } from '../src/modules/simulationController.js';
import { ScenarioHistory, MemoryStorage, recommendOptimal, runCashierSweep, toCSV } from '../src/modules/scenarioHistory.js';
import { buildStaticScene, buildDynamicScene, LEGEND } from '../src/modules/routeRenderer.js';
import { seedDemoHistory } from '../src/data/testData.js';

const manualScheduler = { request: () => 1, cancel: () => {} };
const mk = (over = {}) => {
  const store = createAppStore();
  const history = new ScenarioHistory();
  const ctl = new SimulationController({ store, history, scheduler: manualScheduler, metricsEveryMs: 0 });
  store.dispatch(Actions.editConfig({ durationMin: 30, ...over }));
  return { store, history, ctl };
};

test('Store: navegación válida/ inválida y edición validada', () => {
  const s = createAppStore();
  s.dispatch(Actions.navigate('live')); assert.equal(s.getState().view, 'live');
  s.dispatch(Actions.navigate('nope')); assert.equal(s.getState().view, 'live');
  s.dispatch(Actions.editConfig({ openCashiers: 'x' }));
  assert.equal(s.getState().issues.errors.length, 1);
  let calls = 0; const un = s.subscribe(() => calls++);
  s.dispatch(Actions.navigate('metrics')); un(); s.dispatch(Actions.navigate('config'));
  assert.equal(calls, 1);
});

test('Controlador: start/pausa/velocidad y fin -> resultados', () => {
  const { store, ctl } = mk();
  assert.equal(ctl.start(), true);
  assert.equal(store.getState().status, 'running');
  assert.equal(store.getState().view, 'live');
  ctl.frame(16); const t1 = ctl.sim.t;
  ctl.pause(); assert.equal(store.getState().status, 'paused');
  ctl.frame(16); assert.equal(ctl.sim.t, t1); // en pausa no avanza
  ctl.resume();
  ctl.setSpeed(1); ctl.frame(100); const d1 = ctl.sim.t - t1;
  ctl.setSpeed(10); const t2 = ctl.sim.t; ctl.frame(100); const d10 = ctl.sim.t - t2;
  assert.ok(d10 > d1 * 5);
  assert.equal(ctl.setSpeed(7), false);
  for (let i = 0; i < 20000 && store.getState().status !== 'finished'; i++) ctl.frame(100);
  assert.equal(store.getState().status, 'finished');
  assert.equal(store.getState().view, 'results');
  assert.ok(store.getState().report.summary.served > 0);
});

test('Controlador: frame con tiempos extremos no rompe (pestaña oculta / negativos)', () => {
  const { ctl } = mk(); ctl.start();
  assert.doesNotThrow(() => { ctl.frame(1e9); ctl.frame(-50); ctl.frame(NaN); });
  assert.ok(Number.isFinite(ctl.sim.t));
});

test('Controlador: cambios en vivo con errores no detienen la simulación', () => {
  const { store, ctl } = mk(); ctl.start();
  ctl.frame(100);
  const r = ctl.updateLiveConfig({ openCashiers: 'abc', queueType: 'unica', baseRate: 7 });
  assert.equal(r.ok, false);
  assert.equal(store.getState().issues.errors.length, 1);
  assert.equal(ctl.sim.config.queueType, 'unica');
  assert.equal(store.getState().status, 'running');
});

test('Controlador: no inicia con configuración inválida', () => {
  const { store, ctl } = mk();
  assert.equal(ctl.start({ baseRate: 'x' }), false);
  assert.equal(store.getState().status, 'idle');
});

test('Historial: guardar, listar, comparar, exportar y recuperarse de datos corruptos', () => {
  const storage = new MemoryStorage();
  const h = new ScenarioHistory({ storage });
  const recs = seedDemoHistory(h, { durationMin: 60, baseRate: 5, startHour: 17 }, [3, 5, 7]);
  assert.equal(h.list().length, 3);
  const cmp = h.compare();
  assert.deepEqual(cmp.rows.map((r) => r.cajas), [3, 5, 7]);
  assert.equal(cmp.chart[0].values.length, 12);
  assert.equal(cmp.warnings.length, 0);
  assert.match(h.exportCSV(), /esperaPromSec/);
  assert.ok(JSON.parse(h.exportJSON()).length === 3);
  h.remove(recs[0].id); assert.equal(h.list().length, 2);
  storage.setItem('supermercado-sim:scenarios', '{{corrupto');
  assert.deepEqual(h.list(), []);
  assert.throws(() => h.save({}), /Reporte inválido/);
});

test('Historial: avisa si se comparan escenarios con demanda distinta', () => {
  const h = new ScenarioHistory();
  h.save(new Simulation({ durationMin: 20, baseRate: 3 }).run());
  h.save(new Simulation({ durationMin: 20, baseRate: 6 }).run());
  assert.ok(h.compare().warnings.some((w) => w.includes('baseRate')));
});

test('Recomendación: sigue agregando cajas mientras la mejora marginal sea grande', () => {
  const rec = (n, wait, ab, sat) => ({ id: `r${n}`, name: `${n} cajas`, config: { openCashiers: n, queueType: 'por-caja' }, summary: { avgWaitSec: wait, abandonRatePct: ab, satisfactionPct: sat, avgUtilizationPct: 100 - n * 8 } });
  const r = recommendOptimal([rec(8, 20, 0, 100), rec(4, 300, 12, 40), rec(6, 60, 0.5, 92)]);
  assert.equal(r.recommendedId, 'r8'); // 4 no es viable; pasar de 6 a 8 aún mejora 67% => 8 es el equilibrio
});

test('Recomendación: si 6 y 8 cajas casi no difieren, recomienda 6', () => {
  const rec = (n, wait, ab, sat) => ({ id: `r${n}`, name: `${n} cajas`, config: { openCashiers: n, queueType: 'por-caja' }, summary: { avgWaitSec: wait, abandonRatePct: ab, satisfactionPct: sat, avgUtilizationPct: 70 } });
  const r = recommendOptimal([rec(4, 300, 12, 40), rec(6, 60, 0.5, 92), rec(8, 55, 0, 95)]);
  assert.equal(r.recommendedId, 'r6');
  assert.match(r.reason, /6 cajas/);
});

test('Recomendación: sin escenarios viables lo advierte; sin datos no falla', () => {
  const rec = (n) => ({ id: `r${n}`, name: `${n}`, config: { openCashiers: n, queueType: 'unica' }, summary: { avgWaitSec: 500, abandonRatePct: 30, satisfactionPct: 10 + n, avgUtilizationPct: 99 } });
  const r = recommendOptimal([rec(1), rec(2)]);
  assert.equal(r.viable, false);
  assert.equal(r.recommendedId, 'r2');
  assert.equal(recommendOptimal([]).recommendedId, null);
});

test('Barrido real 3/5/8 cajas: la recomendación es coherente', () => {
  const h = new ScenarioHistory();
  runCashierSweep({ durationMin: 90, baseRate: 6, startHour: 17 }, [3, 5, 8]).forEach((r) => h.save(r));
  const { rows, recommendation } = h.compare();
  assert.ok(rows[0].esperaPromSec > rows[2].esperaPromSec);
  assert.ok(recommendation.recommendedId);
});

test('Controlador: guardar escenario requiere haber terminado y alimenta el historial', () => {
  const { store, ctl } = mk();
  assert.equal(ctl.saveCurrentScenario('x'), null);
  ctl.start(); ctl.finishNow();
  const rec = ctl.saveCurrentScenario('Mi prueba');
  assert.equal(rec.name, 'Mi prueba');
  assert.equal(store.getState().history.length, 1);
});

test('Renderer: escena estática y dinámica (sin DOM)', () => {
  const L = buildLayout();
  const st = buildStaticScene(L);
  assert.ok(st.some((s) => s.type === 'arrow') && st.some((s) => s.type === 'rect'));
  const sim = new Simulation({ durationMin: 30, baseRate: 8 });
  sim.advance(600);
  const snap = sim.getSnapshot();
  const dyn = buildDynamicScene(L, snap);
  assert.equal(dyn.filter((s) => s.type === 'circle').length, snap.customers.length);
  assert.equal(dyn.filter((s) => s.type === 'rect').length, snap.cashiers.length);
  assert.equal(LEGEND.length, 3);
  for (const s of dyn) if (s.type === 'circle') assert.ok(Number.isFinite(s.x) && s.x >= 0 && s.x <= L.width && s.y >= 0 && s.y <= L.height);
});

test('CSV: escapa comas y comillas', () => {
  assert.equal(toCSV([{ a: 'x,"y"', b: 1.5 }]), 'a,b\n"x,""y""",1.50');
});
