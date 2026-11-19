import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/engine/config.js';
import { createAppStore } from '../src/modules/store.js';
import { SimulationController } from '../src/modules/simulationController.js';
import { ScenarioHistory, MemoryStorage } from '../src/modules/scenarioHistory.js';
import {
  renderDemandPreviewSVG, renderCashierQueueBarsSVG, renderWaitEvolutionSVG,
  renderGaugeSVG, renderUtilizationBarsSVG, renderDurationPieSVG, renderScenarioComparisonSVG,
} from '../src/ui/charts.js';
import {
  renderConfigView, renderLiveView, renderMetricsView, renderResultsView,
  renderOptimizerView, renderAppShell, classifyWaitLevel,
} from '../src/ui/views.js';
import { SupermarketApp } from '../src/ui/app.js';

const manualScheduler = { request: () => 1, cancel: () => {} };

function createMockRoot() {
  return {
    innerHTML: '',
    contains: () => false,
    querySelector: () => null,
    addEventListener: () => {},
  };
}

test('UI Charts: todos los generadores SVG producen gráficos válidos sin DOM', () => {
  const demandSvg = renderDemandPreviewSVG(DEFAULT_CONFIG);
  assert.match(demandSvg, /<svg/);
  assert.match(demandSvg, /clientes\/min/);

  const barsSvg = renderCashierQueueBarsSVG([
    { id: 0, number: 1, isOpen: true, status: 'atendiendo', queueLength: 4 },
    { id: 1, number: 2, isOpen: true, status: 'verificando', queueLength: 7 },
  ]);
  assert.match(barsSvg, /C1/);
  assert.match(barsSvg, /C2/);

  const waitSvg = renderWaitEvolutionSVG([
    { t: 30, clock: '14:00', avgWaitSec: 45 },
    { t: 60, clock: '14:01', avgWaitSec: 110 },
  ]);
  assert.match(waitSvg, /<polyline/);

  const gaugeSvg = renderGaugeSVG(72, 'Ocupación Cajeros');
  assert.match(gaugeSvg, /72%/);

  const utilSvg = renderUtilizationBarsSVG([{ id: 0, number: 1, utilizationPct: 84 }]);
  assert.match(utilSvg, /84%/);

  const pieSvg = renderDurationPieSVG({ busySec: 700, idleSec: 300, delaySec: 100 });
  assert.match(pieSvg, /70%/);

  const cmpSvg = renderScenarioComparisonSVG([
    { id: 's1', name: '4 cajas', values: Array(12).fill(180) },
    { id: 's2', name: '6 cajas', values: Array(12).fill(65) },
  ]);
  assert.match(cmpSvg, /data-series="4 cajas"/);
  assert.match(cmpSvg, /data-series="6 cajas"/);
});

test('UI Vistas 1 a 5: renderizan todos los elementos estructurales del prototipo', () => {
  const store = createAppStore();
  const history = new ScenarioHistory({ storage: new MemoryStorage() });
  const ctl = new SimulationController({ store, history, scheduler: manualScheduler, metricsEveryMs: 0 });

  // Vista 1: Configuración Inicial
  const v1 = renderConfigView(store.getState());
  assert.match(v1, /CONF\. INICIAL/);
  assert.match(v1, /DURACIÓN \(minutos\)/);
  assert.match(v1, /TASA LLEGADA BASE/);
  assert.match(v1, /N° CAJEROS ABIERTOS/);
  assert.match(v1, /ÚNICA/);
  assert.match(v1, /POR CAJA/);
  assert.match(v1, /INICIAR SIMULACIÓN/);
  assert.match(v1, /1\/5/);

  // Iniciar simulación -> Vista 2: Vista en Vivo
  ctl.start({ durationMin: 30, openCashiers: 6, baseRate: 4.5 });
  ctl.frame(100);
  const snap = ctl.getSnapshot();
  const v2 = renderLiveView(store.getState(), snap);
  assert.match(v2, /VISTA EN VIVO/);
  assert.match(v2, /RELOJ:/);
  assert.match(v2, /supermarket-canvas/);
  assert.match(v2, /CAJAS 1-6/);
  assert.match(v2, /Comprando/);
  assert.match(v2, /En fila/);
  assert.match(v2, /Pagando/);
  assert.match(v2, /VER MÉTRICAS/);
  assert.match(v2, /2\/5/);

  // Vista 3: Panel de Métricas en Tiempo Real
  const v3 = renderMetricsView(store.getState());
  assert.match(v3, /MÉTRICAS/);
  assert.match(v3, /TIEMPO ESPERA PROM:/);
  assert.match(v3, /FILAS CAJAS 1-6/);
  assert.match(v3, /CLIENTES ATENDIDOS:/);
  assert.match(v3, /SATISFACCIÓN/);
  assert.match(v3, /EVOLUCIÓN ESPERA/);
  assert.match(v3, /OCUPACIÓN CAJEROS:/);
  assert.match(v3, /VER RESUMEN/);
  assert.match(v3, /3\/5/);

  // Terminar simulación -> Vista 4: Resultados Finales
  ctl.finishNow();
  const v4 = renderResultsView(store.getState());
  assert.match(v4, /RESULTADOS FINALES/);
  assert.match(v4, /TIEMPO ESPERA PROM:/);
  assert.match(v4, /ESPERA MÁXIMA:/);
  assert.match(v4, /CLIENTES TOTALES ATENDIDOS:/);
  assert.match(v4, /UTILIZACIÓN CAJAS \(%\)/);
  assert.match(v4, /DURACIÓN CAJAS/);
  assert.match(v4, /CSV/);
  assert.match(v4, /COMPARAR ESCENARIOS/);
  assert.match(v4, /4\/5/);

  // Guardar y comparar -> Vista 5: Optimizador de Escenarios
  ctl.saveCurrentScenario('6 Cajas');
  const v5 = renderOptimizerView(store.getState(), history.compare());
  assert.match(v5, /OPTIMIZADOR DE ESCENARIOS/);
  assert.match(v5, /COMPARACIÓN DE ESPERA/);
  assert.match(v5, /RECOMENDACIÓN ÓPTIMA:/);
  assert.match(v5, /6 Cajas/);
  assert.match(v5, /5\/5/);
});

test('SupermarketApp: flujo interactivo completo entre las 5 vistas y cambios en vivo', () => {
  const root = createMockRoot();
  const store = createAppStore();
  const history = new ScenarioHistory({ storage: new MemoryStorage() });
  const ctl = new SimulationController({ store, history, scheduler: manualScheduler, metricsEveryMs: 0 });
  const app = new SupermarketApp(root, { store, history, controller: ctl, seedIfEmpty: true }).mount();

  // Al iniciar, se precargan los 3 escenarios (4, 6 y 8 cajas) y abre en modo Dashboard completo
  assert.equal(history.list().length, 3);
  assert.equal(app.layoutMode, 'dashboard');
  assert.match(root.innerHTML, /CONF\. INICIAL/);

  // Ajustar parámetros en Vista 1
  app.handleAction('step-config', { field: 'openCashiers', delta: '1' });
  assert.equal(store.getState().config.openCashiers, 7);

  app.handleAction('set-config', { field: 'queueType', value: 'unica' });
  assert.equal(store.getState().config.queueType, 'unica');

  // Reducir duración para prueba rápida e iniciar simulación -> pasa a Vista 2 (live)
  app.handleAction('set-config', { field: 'durationMin', value: '25' });
  app.handleAction('start-sim');
  assert.equal(store.getState().view, 'live');
  assert.equal(store.getState().status, 'running');
  assert.match(root.innerHTML, /VISTA EN VIVO/);

  // Cambiar cajas y velocidad EN VIVO desde Vista 2
  app.handleAction('step-config', { field: 'openCashiers', delta: '-2' });
  assert.equal(store.getState().config.openCashiers, 5);
  app.handleAction('set-speed', { speed: '10' });
  assert.equal(store.getState().speed, 10);

  // Navegar a Vista 3 (Métricas en Tiempo Real)
  app.handleAction('navigate', { target: 'metrics' });
  assert.equal(store.getState().view, 'metrics');
  assert.match(root.innerHTML, /TIEMPO ESPERA PROM:/);

  // Pulsar "VER RESUMEN" -> termina la corrida y abre Vista 4 (Resultados Finales)
  app.handleAction('view-summary');
  assert.equal(store.getState().status, 'finished');
  assert.equal(store.getState().view, 'results');
  assert.match(root.innerHTML, /RESULTADOS FINALES/);

  // Guardar escenario y navegar a Vista 5 (Optimizador)
  app.handleAction('save-scenario', { name: '5 Cajas Fila Única' });
  assert.equal(history.list().length, 4);
  app.handleAction('navigate', { target: 'optimizer' });
  assert.equal(store.getState().view, 'optimizer');
  assert.match(root.innerHTML, /5 Cajas Fila Única/);

  // Alternar de nuevo a modo Dashboard completo
  app.handleAction('toggle-layout');
  assert.equal(app.layoutMode, 'dashboard');
  assert.match(root.innerHTML, /dashboard-workspace/);

  app.unmount();
});

test('classifyWaitLevel: clasifica esperas bajas, medias y altas', () => {
  assert.equal(classifyWaitLevel(60, 120, 480).label, 'BAJO');
  assert.equal(classifyWaitLevel(225, 120, 480).label, 'MEDIO');
  assert.equal(classifyWaitLevel(400, 120, 480).label, 'ALTO');
});
