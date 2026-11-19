/**
 * Gestión de estado (Etapa 2). Store mínimo estilo Redux, sin dependencias.
 * Compatible con React: useSyncExternalStore(store.subscribe, store.getState).
 * Solo guarda datos de baja frecuencia (config, estado, métricas, historial).
 * Las posiciones de clientes (alta frecuencia) las lee el renderer directo del controlador.
 */
import { DEFAULT_CONFIG, validateConfig } from '../engine/config.js';

export const VIEWS = Object.freeze(['config', 'live', 'metrics', 'results', 'optimizer']);

export function createStore(reducer, preloaded) {
  let state = preloaded;
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (next !== state) { state = next; for (const l of [...listeners]) l(); }
      return action;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const initialState = () => ({
  view: 'config',
  status: 'idle',            // idle | running | paused | finished
  config: { ...DEFAULT_CONFIG },
  issues: { errors: [], warnings: [] },
  speed: DEFAULT_CONFIG.speed,
  metrics: null,
  report: null,
  history: [],
  recommendation: null,
  notice: null,
});

export const Actions = {
  navigate: (view) => ({ type: 'NAVIGATE', view }),
  editConfig: (patch) => ({ type: 'CONFIG_EDIT', patch }),
  configApplied: (config, errors, warnings) => ({ type: 'CONFIG_APPLIED', config, errors, warnings }),
  started: (config) => ({ type: 'SIM_STARTED', config }),
  status: (status) => ({ type: 'SIM_STATUS', status }),
  speed: (speed) => ({ type: 'SIM_SPEED', speed }),
  metrics: (metrics) => ({ type: 'SIM_METRICS', metrics }),
  finished: (report, metrics) => ({ type: 'SIM_FINISHED', report, metrics }),
  history: (items, recommendation) => ({ type: 'HISTORY', items, recommendation }),
  notice: (message, kind = 'info') => ({ type: 'NOTICE', message, kind }),
};

export function appReducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE':
      return VIEWS.includes(action.view) ? { ...state, view: action.view } : state;
    case 'CONFIG_EDIT': {
      const v = validateConfig(action.patch, state.config);
      return { ...state, config: v.config, speed: v.config.speed, issues: { errors: v.errors, warnings: v.warnings } };
    }
    case 'CONFIG_APPLIED':
      return { ...state, config: action.config, speed: action.config.speed, issues: { errors: action.errors, warnings: action.warnings } };
    case 'SIM_STARTED':
      return { ...state, status: 'running', config: action.config, report: null, metrics: null, view: 'live', issues: { errors: [], warnings: [] } };
    case 'SIM_STATUS':
      return { ...state, status: action.status };
    case 'SIM_SPEED':
      return { ...state, speed: action.speed, config: { ...state.config, speed: action.speed } };
    case 'SIM_METRICS':
      return { ...state, metrics: action.metrics };
    case 'SIM_FINISHED':
      return { ...state, status: 'finished', report: action.report, metrics: action.metrics, view: 'results' };
    case 'HISTORY':
      return { ...state, history: action.items, recommendation: action.recommendation };
    case 'NOTICE':
      return { ...state, notice: { message: action.message, kind: action.kind } };
    default:
      return state;
  }
}

export const createAppStore = () => createStore(appReducer, initialState());
