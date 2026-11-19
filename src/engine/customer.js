import { clamp } from './rng.js';

export const CustomerState = Object.freeze({
  SHOPPING: 'comprando',
  QUEUEING: 'en_fila',
  PAYING: 'pagando',
  LEAVING: 'saliendo',
  ABANDONED: 'abandono',
});

/** Mezcla: 30% compra rápida (1–8 productos) + 70% compra grande (lognormal ~22). */
export function sampleItemCount(rng) {
  if (rng.chance(0.3)) return rng.int(1, 8);
  return clamp(Math.round(rng.lognormal(Math.log(22), 0.55)), 5, 90);
}

const orderInAisle = (n) => (n.aisle % 2 === 0 ? n.slot : 99 - n.slot); // orden de recorrido en su pasillo

/** Ruta: E -> estantes (con tiempo de permanencia) -> K, siempre por calles válidas. */
export function planShoppingRoute(layout, rng, items) {
  const nStops = clamp(Math.round(items / 5), 1, Math.min(12, layout.shelfNodes.length));
  const chosen = rng.shuffle([...layout.shelfNodes]).slice(0, nStops);
  chosen.sort((a, b) => a.aisle - b.aisle || orderInAisle(a) - orderInAisle(b));

  const nodes = ['E'];
  const dwell = new Map();
  let cur = 'E';
  chosen.forEach((stop, idx) => {
    const itemsHere = Math.floor(items / nStops) + (idx < items % nStops ? 1 : 0);
    const seg = layout.shortestPath(cur, stop.id);
    nodes.push(...seg.slice(1));
    dwell.set(nodes.length - 1, itemsHere * rng.uniform(3, 6) + rng.uniform(2, 6));
    cur = stop.id;
  });
  nodes.push(...layout.shortestPath(cur, 'K').slice(1));
  return { nodes, dwell };
}

/**
 * Todos los atributos aleatorios se sortean AL CREAR el cliente (flujo `customers`),
 * así dos escenarios con la misma semilla reciben exactamente los mismos clientes
 * aunque cambie el número de cajas (números aleatorios comunes).
 */
export function createCustomer(id, t, rng, layout, cfg) {
  const items = sampleItemCount(rng);
  const route = planShoppingRoute(layout, rng, items);
  const speed = clamp(rng.normal(1.25, 0.15), 0.8, 1.7);
  const serviceFactor = clamp(rng.lognormal(0, 0.25), 0.5, 2);
  const u1 = rng.next(), u2 = rng.next();
  const delayDuration = u1 < cfg.delayProbability ? cfg.delayMinSec + u2 * (cfg.delayMaxSec - cfg.delayMinSec) : 0;
  return {
    id, arrivedAt: t, items, speed, serviceFactor, delayDuration,
    nodes: route.nodes, dwell: route.dwell, leg: 0, s: 0, dwellUntil: 0, aside: false, blockedFor: 0, tickMark: -1,
    x: layout.entrance.x, y: layout.entrance.y, tx: 0, ty: 0,
    state: CustomerState.SHOPPING, mode: 'graph',
    shoppingEndAt: null, queueJoinedAt: null, serviceStartAt: null, serviceEndAt: null,
    waitSec: null, cashierId: null, jockeyed: 0,
  };
}
