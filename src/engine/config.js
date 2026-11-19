/**
 * Configuración + validación. Toda modificación (inicial o en vivo) pasa por validateConfig,
 * de modo que valores inválidos nunca llegan al motor (Etapa 4: robustez).
 */
export const MAX_CASHIERS = 12;
export const QUEUE_TYPES = Object.freeze(['por-caja', 'unica']);
export const SPEED_OPTIONS = Object.freeze([1, 5, 10]);
export const DAY_FACTORS = Object.freeze({ laboral: 0.9, viernes: 1.15, sabado: 1.3, domingo: 1.1 });
export const DEMAND_PROFILES = Object.freeze(['normal', 'plano', 'doble-pico']);

export const DEFAULT_CONFIG = Object.freeze({
  // --- Vista 1: Configuración ---
  durationMin: 120,          // duración simulada (min)
  baseRate: 4.5,             // tasa base de llegada (clientes/min) antes de multiplicadores
  openCashiers: 6,           // N° de cajeros abiertos
  queueType: 'por-caja',     // 'por-caja' | 'unica'
  speed: 5,                  // x1 | x5 | x10 (lo usa el controlador, no el motor)
  // --- Demanda (proceso de Poisson no homogéneo) ---
  startHour: 14,             // hora del día en que inicia la simulación
  dayType: 'laboral',       // factor por día
  demandProfile: 'normal',   // perfil horario (picos y valles)
  seed: 2026,
  // --- Cajas ---
  perPersonSec: 14,          // segundos fijos por cliente (saludo, pago)
  perItemSec: 2.4,           // segundos por producto
  delayProbability: 0.06,    // prob. de retraso breve (verificar precio)
  delayMinSec: 20,
  delayMaxSec: 60,
  // --- Decisión del cliente ---
  choiceNoise: 0.1,          // error de percepción al estimar filas (0 = perfecto)
  jockeying: true,           // cambio de fila
  abandonEnabled: true,
  maxWaitSec: 480,           // umbral de espera estimada para abandonar
  abandonProbability: 0.7,
  satisfactionTargetSec: 120,// espera <= objetivo => 100% satisfecho
  drain: true,               // al terminar el tiempo, atender a quienes siguen en tienda
});

const NUM = {
  durationMin: { min: 1, max: 720 },
  startHour: { min: 0, max: 23.99 },
  baseRate: { min: 0.1, max: 30 },
  openCashiers: { min: 1, max: MAX_CASHIERS, int: true },
  perPersonSec: { min: 1, max: 120 },
  perItemSec: { min: 0.2, max: 20 },
  delayProbability: { min: 0, max: 1 },
  delayMinSec: { min: 1, max: 300 },
  delayMaxSec: { min: 1, max: 600 },
  abandonProbability: { min: 0, max: 1 },
  maxWaitSec: { min: 30, max: 3600 },
  satisfactionTargetSec: { min: 10, max: 1800 },
  choiceNoise: { min: 0, max: 1 },
  seed: { min: 0, max: 4294967295, int: true },
};
const ENUM = {
  dayType: Object.keys(DAY_FACTORS),
  demandProfile: DEMAND_PROFILES,
  queueType: QUEUE_TYPES,
  speed: SPEED_OPTIONS,
};
const BOOL = ['abandonEnabled', 'jockeying', 'drain'];

const LABELS = {
  durationMin: 'Duración', baseRate: 'Tasa de llegada', openCashiers: 'Cajeros abiertos',
  queueType: 'Tipo de fila', speed: 'Velocidad',
};
const label = (k) => LABELS[k] ?? k;

/**
 * Valida y normaliza un parche de configuración.
 * @returns {{config:object, errors:{field,message}[], warnings:{field,message}[], changed:string[], ok:boolean}}
 */
export function validateConfig(patch, base = DEFAULT_CONFIG) {
  const config = { ...base };
  const errors = [];
  const warnings = [];

  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    errors.push({ field: '*', message: 'La configuración debe ser un objeto.' });
    return { config, errors, warnings, changed: [], ok: false };
  }

  for (const [k, v] of Object.entries(patch)) {
    if (k in NUM) {
      const spec = NUM[k];
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      if (!Number.isFinite(n)) {
        errors.push({ field: k, message: `${label(k)}: valor numérico inválido.` });
        continue;
      }
      let val = spec.int ? Math.round(n) : n;
      if (val < spec.min || val > spec.max) {
        const clamped = Math.min(spec.max, Math.max(spec.min, val));
        warnings.push({ field: k, message: `${label(k)} ajustado al rango [${spec.min}, ${spec.max}].` });
        val = clamped;
      }
      config[k] = val;
    } else if (k in ENUM) {
      const val = k === 'speed' ? Number(v) : v;
      if (!ENUM[k].includes(val)) {
        errors.push({ field: k, message: `${label(k)}: opción inválida (${String(v)}).` });
        continue;
      }
      config[k] = val;
    } else if (BOOL.includes(k)) {
      if (typeof v !== 'boolean') { errors.push({ field: k, message: `${k}: debe ser verdadero/falso.` }); continue; }
      config[k] = v;
    } else {
      warnings.push({ field: k, message: `Parámetro desconocido ignorado: ${k}.` });
    }
  }

  // Reglas cruzadas
  if (config.delayMaxSec < config.delayMinSec) {
    [config.delayMinSec, config.delayMaxSec] = [config.delayMaxSec, config.delayMinSec];
    warnings.push({ field: 'delayMaxSec', message: 'Retraso mínimo/máximo intercambiados.' });
  }
  if (config.satisfactionTargetSec >= config.maxWaitSec) {
    config.satisfactionTargetSec = Math.max(10, Math.floor(config.maxWaitSec / 2));
    warnings.push({ field: 'satisfactionTargetSec', message: 'Objetivo de espera ajustado por debajo del umbral máximo.' });
  }

  const changed = Object.keys(config).filter((k) => config[k] !== base[k]);
  return { config, errors, warnings, changed, ok: errors.length === 0 };
}
