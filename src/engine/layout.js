/**
 * Mapa del supermercado como GRAFO DIRIGIDO de calles fijas (unidireccionales por carril).
 *  - Pasillos de producto: sentido único, alternando bajada/subida.
 *  - Corredores superior e inferior: dos carriles (uno por sentido) => nunca hay cruces frontales.
 * Coordenadas en metros. Origen arriba-izquierda.
 */
export const NUM_AISLES = 8;
export const STOPS_PER_AISLE = 3;
const laneX = (i) => 8 + 6 * i;

export function buildLayout({ numAisles = NUM_AISLES, maxCashiers = 12 } = {}) {
  const width = 60, height = 50;
  const nodes = new Map(), edges = new Map(), adj = new Map();

  const addNode = (id, x, y, kind, extra = {}) => { nodes.set(id, { id, x, y, kind, ...extra }); adj.set(id, []); };
  const addEdge = (a, b) => {
    const A = nodes.get(a), B = nodes.get(b);
    const dx = B.x - A.x, dy = B.y - A.y, length = Math.hypot(dx, dy);
    edges.set(`${a}>${b}`, { key: `${a}>${b}`, from: a, to: b, length, ux: dx / length, uy: dy / length, hasReverse: false });
    adj.get(a).push(b);
  };

  addNode('E', 3, 6, 'entrada');
  for (let i = 0; i < numAisles; i++) {
    addNode(`T${i}`, laneX(i), 6, 'corredor');
    addNode(`B${i}`, laneX(i), 26, 'corredor');
    for (let j = 0; j < STOPS_PER_AISLE; j++) addNode(`S${i}_${j}`, laneX(i), 10 + 6 * j, 'estante', { aisle: i, slot: j });
  }
  addNode('K', laneX(3) + 3, 31, 'acceso-cajas');

  addEdge('E', 'T0');
  for (let i = 0; i < numAisles - 1; i++) {
    addEdge(`T${i}`, `T${i + 1}`); addEdge(`T${i + 1}`, `T${i}`);
    addEdge(`B${i}`, `B${i + 1}`); addEdge(`B${i + 1}`, `B${i}`);
  }
  for (let i = 0; i < numAisles; i++) {
    const chain = [`T${i}`, ...Array.from({ length: STOPS_PER_AISLE }, (_, j) => `S${i}_${j}`), `B${i}`];
    const seq = i % 2 === 0 ? chain : [...chain].reverse(); // pares bajan, impares suben
    for (let k = 0; k < seq.length - 1; k++) addEdge(seq[k], seq[k + 1]);
  }
  addEdge('B3', 'K'); addEdge('B4', 'K');
  for (const e of edges.values()) e.hasReverse = edges.has(`${e.to}>${e.from}`);

  const shelfNodes = [...nodes.values()].filter((n) => n.kind === 'estante');
  const shelfBlocks = [];
  for (let i = 0; i < numAisles - 1; i++) shelfBlocks.push({ x: laneX(i) + 1.2, y: 8.5, w: 3.6, h: 15 });

  const cashierPos = (k) => ({ x: 6 + 4.2 * k, y: 36 });
  const servingPos = (k) => ({ x: 6 + 4.2 * k, y: 37.4 });
  const queueSlot = (k, p) => ({ x: 6 + 4.2 * k, y: 38.8 + 1.1 * Math.min(p, 9) });
  const singleSlot = (p) => {
    const row = Math.min(Math.floor(p / 10), 8), c = p % 10;
    const col = row % 2 === 0 ? c : 9 - c;
    return { x: 23 + col * 1.5, y: 40.5 + row * 1.1 };
  };

  const pathCache = new Map();
  /** Camino más corto respetando el sentido de las calles (BFS). */
  function shortestPath(from, to) {
    const ck = `${from}|${to}`;
    if (pathCache.has(ck)) return pathCache.get(ck);
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const u = q.shift();
      if (u === to) break;
      for (const v of adj.get(u)) if (!prev.has(v)) { prev.set(v, u); q.push(v); }
    }
    let result = null;
    if (prev.has(to)) {
      result = [];
      for (let n = to; n !== null; n = prev.get(n)) result.unshift(n);
    }
    pathCache.set(ck, result);
    return result;
  }

  return {
    width, height, nodes, edges, adj, numAisles, maxCashiers,
    shelfNodes, shelfBlocks,
    entrance: nodes.get('E'), checkoutApproach: nodes.get('K'),
    exitPoint: { x: 58, y: 35 },
    cashierPos, servingPos, queueSlot, singleSlot, shortestPath,
  };
}
