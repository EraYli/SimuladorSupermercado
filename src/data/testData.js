/**
 * Datos de prueba COHERENTES: no son números inventados; se generan corriendo el motor real
 * con la misma semilla, de modo que los escenarios son comparables entre sí.
 */
import { DEFAULT_CONFIG } from '../engine/config.js';
import { runCashierSweep } from '../modules/scenarioHistory.js';

export const PRESET_CONFIGS = Object.freeze({
  tranquilo: { ...DEFAULT_CONFIG, baseRate: 2.5, openCashiers: 4 },
  normal: { ...DEFAULT_CONFIG },
  horaPico: { ...DEFAULT_CONFIG, startHour: 17, baseRate: 3.2, dayType: 'viernes', openCashiers: 6 },
  rapido: { ...DEFAULT_CONFIG, durationMin: 30 },
});

/** Llena el historial con 4/6/8 cajas (misma demanda) para probar la Vista 5. */
export function seedDemoHistory(history, base = PRESET_CONFIGS.normal, counts = [4, 6, 8]) {
  return runCashierSweep({ ...base, durationMin: Math.min(base.durationMin, 120) }, counts)
    .map((r) => history.save(r, r.label));
}
