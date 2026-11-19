/**
 * Generadores de gráficas vectoriales SVG (Etapa 3).
 * Funciones puras y deterministas (testeables en Node sin DOM, equivalentes a Recharts/Chart.js).
 */
import { formatDuration } from '../utils/format.js';
import { lambdaPerSec } from '../engine/demand.js';

const SERIES_COLORS = ['#0284c7', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0d9488'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Vista 1: Previsualización de la curva de demanda λ(t) (Proceso de Poisson No Homogéneo).
 */
export function renderDemandPreviewSVG(config, { width = 340, height = 110 } = {}) {
  const pts = 25;
  const durSec = Math.max(60, (config.durationMin || 120) * 60);
  const samples = [];
  let maxRate = 0.5;
  for (let i = 0; i <= pts; i++) {
    const t = (i / pts) * durSec;
    const ratePerMin = lambdaPerSec(config, t) * 60;
    if (ratePerMin > maxRate) maxRate = ratePerMin;
    samples.push({ t, rate: ratePerMin });
  }
  const padL = 32, padR = 12, padT = 14, padB = 22;
  const w = width - padL - padR, h = height - padT - padB;
  const coords = samples.map((s, i) => {
    const x = padL + (i / pts) * w;
    const y = padT + h - (s.rate / (maxRate * 1.12)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = [`${padL},${padT + h}`, ...coords, `${(padL + w).toFixed(1)},${padT + h}`].join(' ');
  const startH = Math.floor(config.startHour || 0);
  const endH = Math.floor(((config.startHour || 0) + (config.durationMin || 120) / 60) % 24);
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Curva de tasa de llegada λ(t)">
    <defs>
      <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0284c7" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="#0284c7" stop-opacity="0.03"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL + w}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3" stroke-width="1"/>
    <polygon points="${area}" fill="url(#demandGrad)"/>
    <polyline points="${coords.join(' ')}" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${padL - 4}" y="${padT + 8}" text-anchor="end" font-size="9.5" fill="#64748b">${maxRate.toFixed(1)}</text>
    <text x="${padL - 4}" y="${padT + h}" text-anchor="end" font-size="9.5" fill="#64748b">0</text>
    <text x="${padL}" y="${height - 5}" text-anchor="start" font-size="9.5" fill="#475569">${String(startH).padStart(2, '0')}:00</text>
    <text x="${padL + w / 2}" y="${height - 5}" text-anchor="middle" font-size="9.5" fill="#0369a1" font-weight="600">λ(t) clientes/min</text>
    <text x="${padL + w}" y="${height - 5}" text-anchor="end" font-size="9.5" fill="#475569">${String(endH).padStart(2, '0')}:00</text>
  </svg>`;
}

/**
 * Vista 3: Gráfico de barras de personas formadas + atendidas por caja.
 */
export function renderCashierQueueBarsSVG(cashiers = [], { width = 340, height = 140 } = {}) {
  const open = cashiers.filter((k) => k.isOpen || k.openSec > 0 || k.queueLength > 0);
  const list = open.length ? open : cashiers.slice(0, 6);
  const padL = 28, padR = 10, padT = 16, padB = 22;
  const w = width - padL - padR, h = height - padT - padB;
  const maxQ = Math.max(5, ...list.map((k) => k.queueLength || 0));
  const step = w / Math.max(1, list.length);
  const barW = Math.min(28, step * 0.62);

  const bars = list.map((k, idx) => {
    const q = k.queueLength || 0;
    const bh = (q / maxQ) * h;
    const x = padL + idx * step + (step - barW) / 2;
    const y = padT + h - bh;
    const color = !k.isOpen ? '#94a3b8' : k.status === 'verificando' ? '#f97316' : q >= 6 ? '#ef4444' : '#0284c7';
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="3" fill="${color}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${Math.max(11, y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#1e293b">${q}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="#475569">C${k.number ?? (k.id + 1)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Ocupación de filas por caja">
    <line x1="${padL}" y1="${padT}" x2="${padL + w}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h / 2}" x2="${padL + w}" y2="${padT + h / 2}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1"/>
    <text x="${padL - 5}" y="${padT + 6}" text-anchor="end" font-size="9" fill="#64748b">${maxQ}</text>
    <text x="${padL - 5}" y="${padT + h / 2 + 3}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(maxQ / 2)}</text>
    <text x="${padL - 5}" y="${padT + h}" text-anchor="end" font-size="9" fill="#64748b">0</text>
    ${bars}
  </svg>`;
}

/**
 * Vista 3: Gráfico de línea de evolución de espera promedio en el tiempo.
 */
export function renderWaitEvolutionSVG(series = [], { width = 340, height = 135 } = {}) {
  const padL = 34, padR = 12, padT = 14, padB = 22;
  const w = width - padL - padR, h = height - padT - padB;
  if (!series || series.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Evolución de espera">
      <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="#64748b">Recopilando muestras de espera…</text>
    </svg>`;
  }
  const pts = series.length === 1 ? [series[0], series[0]] : series;
  const maxW = Math.max(30, ...pts.map((p) => p.avgWaitSec || 0));
  const coords = pts.map((p, i) => {
    const x = padL + (i / (pts.length - 1)) * w;
    const y = padT + h - ((p.avgWaitSec || 0) / (maxW * 1.1)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = [`${padL},${padT + h}`, ...coords, `${(padL + w).toFixed(1)},${padT + h}`].join(' ');
  const firstClock = pts[0].clock || '00:00';
  const lastClock = pts[pts.length - 1].clock || '';

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Evolución de espera promedio">
    <defs>
      <linearGradient id="waitLineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0284c7" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#0284c7" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${padT}" x2="${padL + w}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h / 2}" x2="${padL + w}" y2="${padT + h / 2}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1"/>
    <polygon points="${area}" fill="url(#waitLineGrad)"/>
    <polyline points="${coords.join(' ')}" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${padL - 4}" y="${padT + 7}" text-anchor="end" font-size="9" fill="#64748b">${formatDuration(maxW)}</text>
    <text x="${padL - 4}" y="${padT + h}" text-anchor="end" font-size="9" fill="#64748b">0s</text>
    <text x="${padL}" y="${height - 5}" text-anchor="start" font-size="9" fill="#64748b">${esc(firstClock)}</text>
    <text x="${padL + w}" y="${height - 5}" text-anchor="end" font-size="9" fill="#64748b">${esc(lastClock)}</text>
  </svg>`;
}

/**
 * Vista 3: Medidor semicircular (Gauge) de porcentaje (Ocupación de cajeros / Satisfacción).
 */
export function renderGaugeSVG(pct = 0, label = 'Ocupación', { width = 140, height = 86 } = {}) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const cx = width / 2, cy = height - 18, r = 46;
  const angle = Math.PI * (1 - clamped / 100);
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const color = clamped > 88 ? '#ef4444' : clamped >= 55 ? '#16a34a' : '#0284c7';
  const arcLen = Math.PI * r;
  const dash = ((clamped / 100) * arcLen).toFixed(1);
  return `<svg viewBox="0 0 ${width} ${height}" class="gauge-svg" role="img" aria-label="${esc(label)} ${clamped.toFixed(0)}%">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#e2e8f0" stroke-width="10" stroke-linecap="round"/>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${arcLen.toFixed(1)}"/>
    <line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#1e293b"/>
    <text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${clamped.toFixed(0)}%</text>
    <text x="${cx}" y="${height - 3}" text-anchor="middle" font-size="9.5" fill="#475569">${esc(label)}</text>
  </svg>`;
}

/**
 * Vista 4: Barras de Utilización por Caja (%).
 */
export function renderUtilizationBarsSVG(cashiers = [], { width = 340, height = 125 } = {}) {
  const list = cashiers.length ? cashiers : [];
  const padL = 28, padR = 10, padT = 16, padB = 22;
  const w = width - padL - padR, h = height - padT - padB;
  const step = w / Math.max(1, list.length);
  const barW = Math.min(30, step * 0.62);

  const bars = list.map((k, idx) => {
    const u = Math.max(0, Math.min(100, k.utilizationPct || 0));
    const bh = (u / 100) * h;
    const x = padL + idx * step + (step - barW) / 2;
    const y = padT + h - bh;
    const color = u > 90 ? '#ef4444' : u >= 50 ? '#16a34a' : '#0284c7';
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="3" fill="${color}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${Math.max(11, y - 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#1e293b">${u.toFixed(0)}%</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="#475569">C${k.number ?? (k.id + 1)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Utilización por caja">
    <line x1="${padL}" y1="${padT}" x2="${padL + w}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h / 2}" x2="${padL + w}" y2="${padT + h / 2}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1"/>
    <text x="${padL - 4}" y="${padT + 6}" text-anchor="end" font-size="9" fill="#64748b">100</text>
    <text x="${padL - 4}" y="${padT + h / 2 + 3}" text-anchor="end" font-size="9" fill="#64748b">50</text>
    <text x="${padL - 4}" y="${padT + h}" text-anchor="end" font-size="9" fill="#64748b">0</text>
    ${bars}
  </svg>`;
}

/**
 * Vista 4: Gráfico circular (Donut/Pie) de Duración de Cajas (Ocupada vs Verificando vs Inactiva).
 */
export function renderDurationPieSVG({ busySec = 0, idleSec = 0, delaySec = 0 } = {}, { size = 110 } = {}) {
  const activeBusy = Math.max(0, busySec - delaySec);
  const delay = Math.max(0, delaySec);
  const idle = Math.max(0, idleSec);
  const total = Math.max(1, activeBusy + delay + idle);
  const r = 36, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;

  const segs = [
    { val: activeBusy, color: '#16a34a', label: 'Atendiendo' },
    { val: delay, color: '#f59e0b', label: 'Verificando' },
    { val: idle, color: '#cbd5e1', label: 'Inactiva' },
  ];
  let offset = 0;
  const circles = segs.map((s) => {
    const len = (s.val / total) * circ;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="14" stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return el;
  }).join('');
  const busyPct = Math.round(((activeBusy + delay) / total) * 100);

  return `<svg viewBox="0 0 ${size} ${size}" class="pie-svg" role="img" aria-label="Distribución de tiempo de cajas">
    ${circles}
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${busyPct}%</text>
  </svg>`;
}

/**
 * Vista 5: Gráfico multi-línea comparativo entre escenarios guardados (12 tramos de tiempo).
 */
export function renderScenarioComparisonSVG(chartSeries = [], { width = 360, height = 165 } = {}) {
  const padL = 36, padR = 14, padT = 16, padB = 26;
  const w = width - padL - padR, h = height - padT - padB;
  if (!chartSeries.length) {
    return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Comparación de espera">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="#64748b">Sin escenarios para comparar</text>
    </svg>`;
  }
  const allVals = chartSeries.flatMap((s) => s.values || []);
  const maxVal = Math.max(30, ...allVals);
  const buckets = Math.max(2, chartSeries[0]?.values?.length || 12);

  const lines = chartSeries.map((s, idx) => {
    const color = SERIES_COLORS[idx % SERIES_COLORS.length];
    const pts = (s.values || []).map((v, i) => {
      const x = padL + (i / (buckets - 1)) * w;
      const y = padT + h - ((v || 0) / (maxVal * 1.1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const dots = (s.values || []).map((v, i) => {
      const x = padL + (i / (buckets - 1)) * w;
      const y = padT + h - ((v || 0) / (maxVal * 1.1)) * h;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${color}"/>`;
    }).join('');
    return `<g data-series="${esc(s.name)}">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </g>`;
  }).join('');

  const xLabels = Array.from({ length: buckets }, (_, i) => {
    const x = padL + (i / (buckets - 1)) * w;
    return `<text x="${x.toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="8.5" fill="#64748b">${i + 1}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Comparación de espera entre escenarios">
    <line x1="${padL}" y1="${padT}" x2="${padL + w}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h / 2}" x2="${padL + w}" y2="${padT + h / 2}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="#cbd5e1"/>
    <text x="${padL - 4}" y="${padT + 6}" text-anchor="end" font-size="8.5" fill="#64748b">${Math.round(maxVal)}s</text>
    <text x="${padL - 4}" y="${padT + h / 2 + 3}" text-anchor="end" font-size="8.5" fill="#64748b">${Math.round(maxVal / 2)}s</text>
    <text x="${padL - 4}" y="${padT + h}" text-anchor="end" font-size="8.5" fill="#64748b">0s</text>
    ${lines}
    ${xLabels}
  </svg>`;
}

export { SERIES_COLORS };
