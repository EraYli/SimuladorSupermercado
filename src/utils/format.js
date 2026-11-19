const pad = (n) => String(Math.floor(n)).padStart(2, '0');
/** Reloj del día simulado: "17:45" */
export function formatDayClock(tSec, startHour) {
  const total = Math.floor(startHour * 3600 + tSec);
  return `${pad((total / 3600) % 24)}:${pad((total % 3600) / 60)}`;
}
/** Tiempo transcurrido: "01:15" (HH:MM) */
export function formatElapsed(tSec) { return `${pad(tSec / 3600)}:${pad((tSec % 3600) / 60)}`; }
/** Duración legible estilo prototipo: "3m 45s" */
export function formatDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${pad(s % 60)}s`.replace(/ 0(\d)s/, ' $1s');
}
