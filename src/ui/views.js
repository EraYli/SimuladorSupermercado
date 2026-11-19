/**
 * Interfaz Ultra-Sencilla e Intuitiva del Simulador de Supermercado (Etapa 3).
 * Diseñada para que cualquier persona, sin ningún contexto técnico previo,
 * entienda al primer vistazo qué está ocurriendo y cómo interactuar.
 */
import { icon } from './icons.js';
import {
  renderDemandPreviewSVG, renderCashierQueueBarsSVG, renderWaitEvolutionSVG,
  renderGaugeSVG, renderUtilizationBarsSVG, renderDurationPieSVG,
  renderScenarioComparisonSVG, SERIES_COLORS,
} from './charts.js';
import { formatDuration } from '../utils/format.js';
import { LEGEND, STATE_COLORS } from '../modules/routeRenderer.js';
import { MAX_CASHIERS, SPEED_OPTIONS } from '../engine/config.js';
import { expectedArrivals } from '../engine/demand.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const VIEW_META = Object.freeze([
  { id: 'config', step: 1, title: 'CONF. INICIAL', short: '1. Ajustes', icon: 'sliders' },
  { id: 'live', step: 2, title: 'VISTA EN VIVO', short: '2. Tienda en Vivo', icon: 'map' },
  { id: 'metrics', step: 3, title: 'MÉTRICAS (TIEMPO REAL)', short: '3. Filas y Espera', icon: 'activity' },
  { id: 'results', step: 4, title: 'RESULTADOS FINALES', short: '4. Resumen Final', icon: 'checkCircle' },
  { id: 'optimizer', step: 5, title: 'OPTIMIZADOR DE ESCENARIOS', short: '5. ¿Cuántas cajas abrir?', icon: 'sparkles' },
]);

export function classifyWaitLevel(waitSec, targetSec = 120, maxSec = 480) {
  if (waitSec <= targetSec) {
    return {
      label: 'BAJO',
      emoji: '😊',
      headline: '¡Todo fluido! Clientes felices',
      advice: 'El número de cajas abiertas es suficiente.',
      badgeClass: 'badge-low',
      dotColor: '#10b981',
    };
  }
  if (waitSec <= (targetSec + maxSec) / 2) {
    return {
      label: 'MEDIO',
      emoji: '😐',
      headline: 'Se están formando filas',
      advice: 'Prueba abrir +1 caja para agilizar el cobro.',
      badgeClass: 'badge-med',
      dotColor: '#f59e0b',
    };
  }
  return {
    label: 'ALTO',
    emoji: '😡',
    headline: '¡Cajas saturadas! Filas muy lentas',
    advice: 'Abre más cajas ahora o los clientes se irán sin comprar.',
    badgeClass: 'badge-high',
    dotColor: '#ef4444',
  };
}

export function buildLiveNarrative(state, snapshot) {
  const m = state.metrics;
  const inStore = snapshot?.customers?.length ?? m?.inStore ?? 0;
  const inQueue = m?.inQueue ?? 0;
  const verifying = (snapshot?.cashiers ?? []).filter((k) => k.status === 'verificando').map((k) => `Caja ${k.id + 1}`);

  if (state.status === 'finished') {
    return {
      tone: 'success',
      title: '✅ Día terminado',
      detail: `${m?.served ?? 0} clientes atendidos · Espera promedio: ${formatDuration(m?.avgWaitSec ?? 0)}`,
    };
  }
  if (verifying.length > 0) {
    return {
      tone: 'warn',
      title: `⚠️ ${verifying.join(', ')} verificando un precio`,
      detail: `${inStore} personas en la tienda · ${inQueue} haciendo fila`,
    };
  }
  return {
    tone: 'ok',
    title: state.status === 'paused' ? '⏸ Tienda en pausa' : '🟢 Tienda abierta',
    detail: `${inStore} personas comprando · ${inQueue} haciendo fila en cajas`,
  };
}

export function renderStepFooter(stepNumber) {
  const pct = (stepNumber / 5) * 100;
  return `<footer class="step-footer" aria-label="Progreso de vistas ${stepNumber} de 5">
    <div class="step-track"><div class="step-fill" style="width:${pct}%"></div></div>
    <span class="step-count">${stepNumber}/5</span>
  </footer>`;
}

export function renderIssuesBanner(issues, notice) {
  const blocks = [];
  if (issues?.errors?.length) {
    blocks.push(`<div class="alert alert-error" role="alert">
      ${icon('alertTriangle', { size: 16 })}
      <div>${issues.errors.map((e) => `<div>${esc(e.message)}</div>`).join('')}</div>
    </div>`);
  }
  if (issues?.warnings?.length) {
    blocks.push(`<div class="alert alert-warn" role="status">
      ${icon('alertTriangle', { size: 16 })}
      <div>${issues.warnings.map((w) => `<div>${esc(w.message)}</div>`).join('')}</div>
    </div>`);
  }
  if (notice?.message) {
    blocks.push(`<div class="alert alert-${esc(notice.kind || 'info')}" role="status">
      <span>${esc(notice.message)}</span>
    </div>`);
  }
  return blocks.join('');
}

/** Guía visual de 3 pasos para quien ve el simulador por primera vez */
export function renderSimpleStoryBanner() {
  return `<section class="story-strip" aria-label="¿Cómo funciona?">
    <div class="story-step">
      <span class="story-emoji">🚶‍♂️🛒</span>
      <div>
        <strong>1. Entran clientes a comprar</strong>
        <span>Cada bolita es una persona y el número es cuántos productos lleva.</span>
      </div>
    </div>
    <div class="story-arrow">➔</div>
    <div class="story-step">
      <span class="story-emoji">🧾⏳</span>
      <div>
        <strong>2. Buscan la caja más rápida</strong>
        <span>Si hay pocas cajas o una cajera tarda (naranja), se arma fila.</span>
      </div>
    </div>
    <div class="story-arrow">➔</div>
    <div class="story-step highlight">
      <span class="story-emoji">🎯💡</span>
      <div>
        <strong>3. Tu reto: ¿Cuántas cajas abrir?</strong>
        <span>Abre o cierra cajas para que nadie espere más de 2 minutos.</span>
      </div>
    </div>
  </section>`;
}

/* ============================================================================
 * VISTA 1: CONFIGURACIÓN INICIAL
 * ============================================================================ */
export function renderConfigView(state) {
  const cfg = state.config;
  const expected = Math.round(expectedArrivals(cfg));
  const isRunning = state.status === 'running' || state.status === 'paused';

  return `<section class="view-card" data-view="config" aria-label="Vista 1: Configuración Inicial">
    <header class="view-header">
      <span class="header-icon">${icon('sliders', { size: 18 })}</span>
      <h2 class="view-title">CONF. INICIAL — Ajustes de la Tienda</h2>
      <span class="header-tag">1/5</span>
    </header>

    <div class="view-body">
      <div class="section-subtitle">PARÁMETROS DE SIMULACIÓN</div>

      <!-- 3 botones grandes de situación -->
      <div class="preset-bar" role="group" aria-label="Elige cuánta gente hay hoy">
        <button type="button" class="chip-btn" data-action="preset" data-preset="tranquilo">🟢 Mañana Tranquila (Poca gente)</button>
        <button type="button" class="chip-btn" data-action="preset" data-preset="normal">🔵 Tarde Normal</button>
        <button type="button" class="chip-btn" data-action="preset" data-preset="horaPico">🔥 Viernes Hora Pico (Tienda llena)</button>
      </div>

      <div class="params-grid-3">
        <!-- Duración -->
        <div class="param-card">
          <div class="param-label">
            <span>DURACIÓN (minutos):</span>
            <span class="param-badge">${(cfg.durationMin / 60).toFixed(1)} horas</span>
          </div>
          <div class="stepper-row">
            <button type="button" class="step-btn" data-action="step-config" data-field="durationMin" data-delta="-15">${icon('minus', { size: 15 })}</button>
            <div class="bracket-value">
              <span class="bracket">[</span>
              <input type="number" class="param-input" data-config-input="durationMin" min="15" max="720" step="15" value="${cfg.durationMin}"/>
              <span class="bracket">]</span>
            </div>
            <button type="button" class="step-btn" data-action="step-config" data-field="durationMin" data-delta="15">${icon('plus', { size: 15 })}</button>
          </div>
        </div>

        <!-- Tasa de llegada -->
        <div class="param-card">
          <div class="param-label">
            <span>TASA LLEGADA BASE (clientes/min):</span>
            <span class="param-badge">~${expected} personas</span>
          </div>
          <div class="stepper-row">
            <button type="button" class="step-btn" data-action="step-config" data-field="baseRate" data-delta="-0.5">${icon('minus', { size: 15 })}</button>
            <div class="bracket-value">
              <span class="bracket">[</span>
              <input type="number" class="param-input" data-config-input="baseRate" min="0.5" max="20" step="0.5" value="${Number(cfg.baseRate).toFixed(1)}"/>
              <span class="bracket">]</span>
            </div>
            <button type="button" class="step-btn" data-action="step-config" data-field="baseRate" data-delta="0.5">${icon('plus', { size: 15 })}</button>
          </div>
        </div>

        <!-- Cajeros abiertos -->
        <div class="param-card highlight-card">
          <div class="param-label">
            <span>N° CAJEROS ABIERTOS:</span>
            <span class="param-badge">De 1 a ${MAX_CASHIERS}</span>
          </div>
          <div class="stepper-row">
            <button type="button" class="step-btn" data-action="step-config" data-field="openCashiers" data-delta="-1">${icon('minus', { size: 15 })}</button>
            <div class="bracket-value">
              <span class="bracket">[</span>
              <input type="number" class="param-input" data-config-input="openCashiers" min="1" max="${MAX_CASHIERS}" step="1" value="${cfg.openCashiers}"/>
              <span class="bracket">]</span>
            </div>
            <button type="button" class="step-btn" data-action="step-config" data-field="openCashiers" data-delta="1">${icon('plus', { size: 15 })}</button>
          </div>
        </div>
      </div>

      <div class="params-grid-2">
        <div class="param-card">
          <div class="param-label"><span>¿CÓMO SE FORMAN LOS CLIENTES?</span></div>
          <div class="segmented" role="radiogroup">
            <button type="button" class="seg-btn ${cfg.queueType === 'por-caja' ? 'active' : ''}" data-action="set-config" data-field="queueType" data-value="por-caja">POR CAJA (1 fila en cada caja)</button>
            <button type="button" class="seg-btn ${cfg.queueType === 'unica' ? 'active' : ''}" data-action="set-config" data-field="queueType" data-value="unica">ÚNICA (1 sola fila para todas)</button>
          </div>
        </div>

        <div class="param-card">
          <div class="param-label"><span>VELOCIDAD DEL RELOJ:</span></div>
          <div class="segmented" role="radiogroup">
            ${SPEED_OPTIONS.map((s) => `<button type="button" class="seg-btn ${cfg.speed === s ? 'active' : ''}" data-action="set-speed" data-speed="${s}">x${s}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="param-card">
        <div class="param-label">
          <span>LLEGADA DE GENTE SEGÚN LA HORA DEL DÍA</span>
          <div class="inline-selects">
            <select data-config-select="demandProfile" aria-label="Perfil horario">
              <option value="normal" ${cfg.demandProfile === 'normal' ? 'selected' : ''}>Hora pico en la tarde</option>
              <option value="doble-pico" ${cfg.demandProfile === 'doble-pico' ? 'selected' : ''}>Pico mediodía y tarde</option>
              <option value="plano" ${cfg.demandProfile === 'plano' ? 'selected' : ''}>Igual todo el día</option>
            </select>
            <select data-config-select="dayType" aria-label="Día">
              <option value="laboral" ${cfg.dayType === 'laboral' ? 'selected' : ''}>Entre semana</option>
              <option value="viernes" ${cfg.dayType === 'viernes' ? 'selected' : ''}>Viernes</option>
              <option value="sabado" ${cfg.dayType === 'sabado' ? 'selected' : ''}>Sábado</option>
              <option value="domingo" ${cfg.dayType === 'domingo' ? 'selected' : ''}>Domingo</option>
            </select>
          </div>
        </div>
        <div class="demand-preview">
          ${renderDemandPreviewSVG(cfg, { width: 460, height: 95 })}
        </div>
      </div>

      <button type="button" class="primary-btn" data-action="start-sim">
        ${icon('play', { size: 18 })}
        <span>${isRunning ? 'REINICIAR SIMULACIÓN' : 'INICIAR SIMULACIÓN'}</span>
      </button>
    </div>

    ${renderStepFooter(1)}
  </section>`;
}

/* ============================================================================
 * VISTA 2: TIENDA EN VIVO 2D (El corazón visual fácil de usar)
 * ============================================================================ */
export function renderLiveView(state, snapshot) {
  const cfg = state.config;
  const elapsed = snapshot?.elapsed ?? '00:00';
  const dayClock = snapshot?.clock ?? '14:00';
  const inStore = snapshot?.customers?.length ?? 0;
  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const narrative = buildLiveNarrative(state, snapshot);

  const counts = { comprando: 0, en_fila: 0, pagando: 0 };
  for (const c of snapshot?.customers ?? []) {
    if (c.state in counts) counts[c.state]++;
  }

  return `<section class="view-card" data-view="live" aria-label="Vista 2: Vista en Vivo 2D">
    <header class="view-header">
      <div class="header-left">
        <span class="live-pulse ${isRunning ? 'on' : ''}"></span>
        <h2 class="view-title">VISTA EN VIVO — Supermercado</h2>
      </div>
      <div class="clock-pill">
        ${icon('clock', { size: 15 })}
        <span>RELOJ: <strong data-bind="live-elapsed">${esc(elapsed)}</strong></span>
        <span class="clock-day" data-bind="live-dayclock">(Hora: ${esc(dayClock)})</span>
      </div>
      <span class="header-tag">2/5</span>
    </header>

    <div class="view-body">
      <!-- Controles súper simples: Jugar con Cajas y Gente -->
      <div class="simple-controls-bar">
        <!-- 1. Control grande de Cajas -->
        <div class="big-control-box highlight">
          <span class="big-ctrl-title">💳 CAJAS ABIERTAS</span>
          <div class="big-ctrl-actions">
            <button type="button" class="big-round-btn remove" data-action="step-config" data-field="openCashiers" data-delta="-1" title="Cerrar 1 caja">−</button>
            <strong class="big-ctrl-num" data-bind="live-cashier-label">CAJAS 1-${cfg.openCashiers}</strong>
            <button type="button" class="big-round-btn add" data-action="step-config" data-field="openCashiers" data-delta="1" title="Abrir 1 caja">+</button>
          </div>
        </div>

        <!-- 2. Control de Cantidad de Gente -->
        <div class="big-control-box">
          <span class="big-ctrl-title">🚶‍♂️ GENTE QUE ENTRA: <strong data-bind="live-rate-val">${Number(cfg.baseRate).toFixed(1)}</strong>/min</span>
          <input type="range" class="easy-slider" data-config-input="baseRate" min="1" max="14" step="0.5" value="${Math.min(14, cfg.baseRate)}"/>
          <div class="slider-ends"><span>Poca gente</span><span>Mucha gente</span></div>
        </div>

        <!-- 3. Pausa y Velocidad -->
        <div class="big-control-box">
          <span class="big-ctrl-title">⏱ TIEMPO Y FILA</span>
          <div class="hud-controls">
            <button type="button" class="play-pause-btn ${isRunning ? 'running' : ''}" data-action="toggle-pause">
              ${icon(isRunning ? 'pause' : 'play', { size: 14 })}
              <span>${isRunning ? 'Pausar' : isPaused ? 'Seguir' : 'Iniciar'}</span>
            </button>
            <div class="speed-pills">
              ${SPEED_OPTIONS.map((s) => `<button type="button" class="speed-pill ${state.speed === s ? 'active' : ''}" data-action="set-speed" data-speed="${s}">x${s}</button>`).join('')}
            </div>
            <div class="speed-pills">
              <button type="button" class="speed-pill ${cfg.queueType === 'por-caja' ? 'active' : ''}" data-action="set-config" data-field="queueType" data-value="por-caja">Por Caja</button>
              <button type="button" class="speed-pill ${cfg.queueType === 'unica' ? 'active' : ''}" data-action="set-config" data-field="queueType" data-value="unica">1 Fila</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Mapa Animado 2D -->
      <div class="canvas-stage">
        <canvas id="supermarket-canvas" class="sim-canvas" width="720" height="600" aria-label="Mapa 2D interactivo">
          Mapa 2D del supermercado
        </canvas>
        <div class="canvas-overlay-status" data-bind="live-narrative-text">${esc(narrative.detail)}</div>
      </div>

      <!-- Leyenda visual muy fácil de leer -->
      <div class="status-chips-bar">
        ${LEGEND.map((item) => `<div class="state-chip">
          <span class="legend-dot" style="background:${item.color}"></span>
          <span>${esc(item.label)}:</span>
          <strong data-bind="count-${item.state}">${counts[item.state] ?? 0}</strong>
        </div>`).join('')}
        <div class="state-chip">
          <span class="legend-dot" style="background:${STATE_COLORS.saliendo}"></span>
          <span>En tienda:</span>
          <strong data-bind="count-total">${inStore}</strong>
        </div>
        <span class="map-tip">💡 Tip: Haz clic en las cajas del mapa para abrirlas o cerrarlas</span>
        <button type="button" class="ghost-btn ml-auto" data-action="navigate" data-target="metrics">
          <span>VER MÉTRICAS</span>
        </button>
      </div>
    </div>

    ${renderStepFooter(2)}
  </section>`;
}

/* ============================================================================
 * VISTA 3: MÉTRICAS EN TIEMPO REAL (Con Carita Semáforo fácil de entender)
 * ============================================================================ */
export function renderMetricsView(state) {
  const m = state.metrics;
  const cfg = state.config;
  const avgWaitSec = m?.avgWaitSec ?? 0;
  const level = classifyWaitLevel(avgWaitSec, cfg.satisfactionTargetSec, cfg.maxWaitSec);
  const served = m?.served ?? 0;
  const satPct = m?.satisfactionPct ?? 100;
  const utilPct = m?.avgUtilizationPct ?? 0;
  const abandoned = m?.abandoned ?? 0;
  const openCount = m?.openCashiers ?? cfg.openCashiers;

  return `<section class="view-card" data-view="metrics" aria-label="Vista 3: Panel de Métricas en Tiempo Real">
    <header class="view-header">
      <span class="header-icon">${icon('activity', { size: 18 })}</span>
      <h2 class="view-title">MÉTRICAS <small>(TIEMPO REAL)</small> — Estado de las Filas</h2>
      <span class="header-tag">3/5</span>
    </header>

    <div class="view-body">
      <!-- Diagnóstico Grande con Carita (Cualquiera lo entiende en 1 segundo) -->
      <div class="kpi-hero ${level.badgeClass}">
        <div class="hero-Diagnostic">
          <span class="hero-emoji">${level.emoji}</span>
          <div class="hero-texts">
            <div class="kpi-hero-label">TIEMPO ESPERA PROM: <span class="status-pill"><span class="status-dot" style="background:${level.dotColor}"></span><strong data-bind="metric-wait-level">${level.label}</strong></span></div>
            <div class="hero-headline">${esc(level.headline)}</div>
            <div class="hero-advice">${esc(level.advice)}</div>
          </div>
          <div class="kpi-hero-value" data-bind="metric-avg-wait">${formatDuration(avgWaitSec)}</div>
        </div>
      </div>

      <!-- 3 Tarjetas de Números Clave -->
      <div class="results-kpi-grid">
        <div class="stat-box">
          <div class="stat-label">✅ CLIENTES ATENDIDOS:</div>
          <div class="stat-value" data-bind="metric-served">${served}</div>
          <div class="stat-sub">Ya pagaron y salieron</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">😊 SATISFACCIÓN:</div>
          <div class="stat-value" data-bind="metric-satisfaction">${satPct.toFixed(0)}%</div>
          <div class="stat-sub">Clientes contentos</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">🚪 SE FUERON SIN COMPRAR:</div>
          <div class="stat-value ${abandoned > 0 ? 'text-danger' : ''}">${abandoned}</div>
          <div class="stat-sub">Porque había mucha fila</div>
        </div>
      </div>

      <!-- Gráfico de barras: Cuánta gente hay formada en cada caja -->
      <div class="chart-card">
        <div class="chart-title">
          <span>🧍‍♂️ PERSONAS FORMADAS EN CADA CAJA (FILAS CAJAS 1-${openCount})</span>
          <span class="chart-meta">Total en fila ahora: <strong>${m?.inQueue ?? 0}</strong></span>
        </div>
        <div data-bind="chart-cashier-bars">
          ${renderCashierQueueBarsSVG(m?.cashiers ?? [], { width: 420, height: 120 })}
        </div>
      </div>

      <!-- Gráfico de línea: Evolución Espera -->
      <div class="chart-card">
        <div class="chart-title">
          <span>📈 EVOLUCIÓN ESPERA (Cómo ha cambiado el tiempo de espera)</span>
        </div>
        <div data-bind="chart-wait-evolution">
          ${renderWaitEvolutionSVG(m?.series ?? [], { width: 420, height: 110 })}
        </div>
      </div>

      <!-- Ocupación Cajeros -->
      <div class="chart-card">
        <div class="chart-title">
          <span>⚡ OCUPACIÓN CAJEROS: <strong data-bind="metric-utilization">${utilPct.toFixed(0)}%</strong></span>
          <span class="chart-meta">Qué tan ocupadas están las cajeras</span>
        </div>
        <div class="gauges-row">
          ${renderGaugeSVG(utilPct, 'Trabajo Cajeras')}
          ${renderGaugeSVG(satPct, 'Clientes Felices')}
        </div>
      </div>

      <button type="button" class="primary-btn" data-action="view-summary">
        ${icon('checkCircle', { size: 18 })}
        <span>VER RESUMEN</span>
      </button>
    </div>

    ${renderStepFooter(3)}
  </section>`;
}

/* ============================================================================
 * VISTA 4: RESULTADOS FINALES
 * ============================================================================ */
export function renderResultsView(state) {
  const rep = state.report;
  const m = rep?.summary ?? state.metrics;
  const cashiers = rep?.cashiers ?? state.metrics?.cashiers?.filter((k) => k.openSec > 0) ?? [];
  const avgWait = m?.avgWaitSec ?? 0;
  const maxWait = m?.maxWaitSec ?? 0;
  const served = m?.served ?? 0;
  const totalDelaySec = cashiers.reduce((s, k) => s + (k.delaySec || 0), 0);
  const scenarioDefaultName = rep?.label ?? `${state.config.openCashiers} Cajas`;

  return `<section class="view-card" data-view="results" aria-label="Vista 4: Resultados Finales">
    <header class="view-header">
      <span class="header-icon">${icon('checkCircle', { size: 18 })}</span>
      <h2 class="view-title">RESULTADOS FINALES — Resumen del Día</h2>
      <span class="header-tag">4/5</span>
    </header>

    <div class="view-body">
      <div class="results-kpi-grid">
        <div class="result-kpi-card">
          <div class="result-kpi-label">TIEMPO ESPERA PROM:</div>
          <div class="result-kpi-big" data-bind="res-avg-wait">${formatDuration(avgWait)}</div>
        </div>

        <div class="result-kpi-card">
          <div class="result-kpi-label">ESPERA MÁXIMA:</div>
          <div class="result-kpi-big" data-bind="res-max-wait">${formatDuration(maxWait)}</div>
        </div>

        <div class="result-kpi-card">
          <div class="result-kpi-label">CLIENTES TOTALES ATENDIDOS:</div>
          <div class="result-kpi-big" data-bind="res-served">${served}</div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">
          <span>UTILIZACIÓN CAJAS (%) — Trabajo por cada caja</span>
          <span class="chart-meta">Promedio: ${(m?.avgUtilizationPct ?? 0).toFixed(0)}%</span>
        </div>
        ${renderUtilizationBarsSVG(cashiers, { width: 420, height: 115 })}
      </div>

      <div class="chart-card pie-card">
        <div class="pie-info">
          <div class="chart-title"><span>DURACIÓN CAJAS</span></div>
          <ul class="pie-legend">
            <li><span class="dot" style="background:#16a34a"></span>Cobrando: ${formatDuration(Math.max(0, (m?.busySecTotal ?? 0) - totalDelaySec))}</li>
            <li><span class="dot" style="background:#f59e0b"></span>Verificando precio: ${formatDuration(totalDelaySec)}</li>
            <li><span class="dot" style="background:#cbd5e1"></span>Caja vacía: ${formatDuration(m?.idleSecTotal ?? 0)}</li>
          </ul>
        </div>
        <div class="pie-wrap">
          ${renderDurationPieSVG({ busySec: m?.busySecTotal ?? 0, idleSec: m?.idleSecTotal ?? 0, delaySec: totalDelaySec })}
        </div>
      </div>

      <div class="save-scenario-bar">
        <input type="text" class="scenario-name-input" id="scenario-name-input" value="${esc(scenarioDefaultName)}" aria-label="Nombre del escenario"/>
        <button type="button" class="secondary-btn" data-action="save-scenario">
          ${icon('save', { size: 16 })}
          <span>GUARDAR ESCENARIO</span>
        </button>
      </div>

      <div class="btn-row-2">
        <button type="button" class="secondary-btn" data-action="export-csv">
          ${icon('download', { size: 16 })}
          <span>EXPORTAR CSV</span>
        </button>
        <button type="button" class="primary-btn" data-action="navigate" data-target="optimizer">
          ${icon('sparkles', { size: 18 })}
          <span>COMPARAR ESCENARIOS</span>
        </button>
      </div>
    </div>

    ${renderStepFooter(4)}
  </section>`;
}

/* ============================================================================
 * VISTA 5: COMPARADOR Y OPTIMIZADOR (Responde "¿Cuántas cajas debo abrir?")
 * ============================================================================ */
export function renderOptimizerView(state, comparison) {
  const rows = comparison?.rows ?? [];
  const chart = comparison?.chart ?? [];
  const rec = comparison?.recommendation ?? state.recommendation;
  const recommendedRow = rows.find((r) => r.id === rec?.recommendedId) ?? rows[0];

  return `<section class="view-card" data-view="optimizer" aria-label="Vista 5: Comparador y Optimizador de Escenarios">
    <header class="view-header">
      <span class="header-icon">${icon('sparkles', { size: 18 })}</span>
      <h2 class="view-title">OPTIMIZADOR DE ESCENARIOS — ¿Cuántas cajas conviene abrir?</h2>
      <button type="button" class="chip-btn accent" data-action="run-sweep">⚡ Comparar 4 vs 6 vs 8 Cajas</button>
    </header>

    <div class="view-body">
      <!-- Respuesta directa y clara -->
      <div class="recommendation-box ${rec?.viable === false ? 'warn' : ''}">
        <div class="rec-icon">${icon('lightbulb', { size: 26 })}</div>
        <div class="rec-content">
          <div class="rec-title">
            RECOMENDACIÓN ÓPTIMA:
            ${recommendedRow ? `<strong>Abrir ${recommendedRow.cajas} Cajas (${esc(recommendedRow.name)}), EQUILIBRIO IDEAL</strong>` : ''}
          </div>
          <p class="rec-reason" data-bind="optimizer-recommendation">${esc(rec?.reason ?? '')}</p>
        </div>
        ${recommendedRow ? `<button type="button" class="apply-opt-btn" data-action="apply-recommended" data-cajas="${recommendedRow.cajas}" data-fila="${recommendedRow.fila}">
          ${icon('play', { size: 15 })} <span>Usar ${recommendedRow.cajas} Cajas en Vivo</span>
        </button>` : ''}
      </div>

      <div class="optimizer-grid">
        <div class="chart-card">
          <div class="chart-title"><span>COMPARACIÓN DE ESPERA (Línea más baja = Menos fila)</span></div>
          ${renderScenarioComparisonSVG(chart, { width: 440, height: 155 })}
          <div class="run-pills">
            ${rows.map((r, idx) => {
              const isRec = r.id === rec?.recommendedId;
              const color = SERIES_COLORS[idx % SERIES_COLORS.length];
              return `<div class="run-pill ${isRec ? 'recommended' : ''}" style="border-color:${color}">
                <div class="run-pill-top">
                  <span class="run-dot" style="background:${color}"></span>
                  <strong>RUN ${idx + 1}: ${esc(r.name)}</strong>
                  <button type="button" class="run-del" data-action="delete-scenario" data-id="${esc(r.id)}">×</button>
                </div>
                <div class="run-pill-sub">Espera: <strong>${formatDuration(r.esperaPromSec)}</strong> · Felices: <strong>${r.satisfaccionPct.toFixed(0)}%</strong></div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="table-card">
          <div class="chart-title"><span>COMPARATIVA LADO A LADO</span></div>
          <div class="table-scroll">
            <table class="scenario-table">
              <thead>
                <tr>
                  <th>OPCIÓN</th>
                  <th>ESPERA PROM.</th>
                  <th>ESPERA MÁX.</th>
                  <th>ATENDIDOS</th>
                  <th>CLIENTES FELICES</th>
                  <th>TRABAJO CAJAS</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((r, idx) => {
                  const isRec = r.id === rec?.recommendedId;
                  return `<tr class="${isRec ? 'row-recommended' : ''}">
                    <td>
                      <span class="row-dot" style="background:${SERIES_COLORS[idx % SERIES_COLORS.length]}"></span>
                      <strong>${esc(r.name)}</strong>
                      ${isRec ? '<span class="opt-tag">MEJOR OPCIÓN</span>' : ''}
                    </td>
                    <td><strong>${formatDuration(r.esperaPromSec)}</strong></td>
                    <td>${formatDuration(r.esperaMaxSec)}</td>
                    <td>${r.atendidos}</td>
                    <td>${r.satisfaccionPct.toFixed(0)}%</td>
                    <td>${r.utilizacionPct.toFixed(0)}%</td>
                  </tr>`;
                }).join('') : `<tr><td colspan="6" class="empty-cell">Sin escenarios</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    ${renderStepFooter(5)}
  </section>`;
}

export function renderAppShell(state, { snapshot = null, comparison = null, layoutMode = 'dashboard' } = {}) {
  const activeMeta = VIEW_META.find((v) => v.id === state.view) ?? VIEW_META[0];
  const statusLabels = { idle: 'Listo', running: '🟢 Tienda en Vivo', paused: '⏸ En Pausa', finished: '✅ Completado' };

  const navTabs = VIEW_META.map((v) => {
    const isActive = state.view === v.id && layoutMode === 'focused';
    return `<button type="button" class="nav-tab ${isActive ? 'active' : ''}" data-action="navigate" data-target="${v.id}">
      ${icon(v.icon, { size: 15 })}
      <span>${esc(v.short)}</span>
    </button>`;
  }).join('');

  let mainContent = '';
  if (layoutMode === 'dashboard') {
    mainContent = `<div class="dashboard-workspace">
      <div class="workspace-top-row">
        <div class="workspace-col-map">${renderLiveView(state, snapshot)}</div>
        <div class="workspace-col-metrics">${renderMetricsView(state)}</div>
      </div>
      <div class="workspace-single-wide">${renderOptimizerView(state, comparison)}</div>
      <details class="extra-panels-drawer">
        <summary>⚙️ Ver Ajustes Detallados de la Tienda y Reporte de Cierre (Pasos 1 y 4)</summary>
        <div class="workspace-bottom-row">
          <div class="workspace-col">${renderConfigView(state)}</div>
          <div class="workspace-col">${renderResultsView(state)}</div>
        </div>
      </details>
    </div>`;
  } else {
    switch (state.view) {
      case 'config': mainContent = renderConfigView(state); break;
      case 'live': mainContent = renderLiveView(state, snapshot); break;
      case 'metrics': mainContent = renderMetricsView(state); break;
      case 'results': mainContent = renderResultsView(state); break;
      case 'optimizer': mainContent = renderOptimizerView(state, comparison); break;
      default: mainContent = renderConfigView(state);
    }
  }

  return `<div class="app-wrapper" data-layout="${esc(layoutMode)}" data-status="${esc(state.status)}">
    <header class="top-navbar">
      <div class="brand">
        <div class="brand-logo">${icon('shoppingCart', { size: 22 })}</div>
        <div>
          <h1 class="brand-title">Simulador de Filas de Supermercado</h1>
          <p class="brand-sub">Prueba cuántas cajas abrir para que los clientes paguen rápido sin hacer filas largas</p>
        </div>
      </div>

      <nav class="view-nav" aria-label="Vistas">
        ${navTabs}
      </nav>

      <div class="top-actions">
        <span class="sim-status-badge status-${esc(state.status)}">${esc(statusLabels[state.status] ?? state.status)}</span>
        <button type="button" class="mode-toggle-btn" data-action="toggle-layout">
          ${icon(layoutMode === 'dashboard' ? 'smartphone' : 'layoutGrid', { size: 15 })}
          <span>${layoutMode === 'dashboard' ? 'Ver por Pasos' : 'Ver Todo Junto'}</span>
        </button>
      </div>
    </header>

    ${renderSimpleStoryBanner()}

    <div class="banners-area">
      ${renderIssuesBanner(state.issues, state.notice)}
    </div>

    <main class="main-stage" aria-label="${esc(activeMeta.title)}">
      ${mainContent}
    </main>
  </div>`;
}
