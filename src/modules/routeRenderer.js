/**
 * Motor de renderizado del mapa 2D (Etapa 2 + Mejora Visual Interactiva Etapa 3).
 * 1) buildStaticScene / buildDynamicScene: funciones PURAS que producen primitivas (testeables sin DOM).
 * 2) MapRenderer: dibuja la tienda con estética moderna (estantes detallados, pasillos señalizados,
 *    cajas interactivas, carritos/clientes animados y soporte de clic en el canvas).
 */
export const STATE_COLORS = Object.freeze({
  comprando: '#10b981', en_fila: '#f59e0b', pagando: '#3b82f6', saliendo: '#94a3b8', abandono: '#ef4444',
});
export const LEGEND = Object.freeze([
  { state: 'comprando', label: 'Comprando', color: STATE_COLORS.comprando },
  { state: 'en_fila', label: 'En fila', color: STATE_COLORS.en_fila },
  { state: 'pagando', label: 'Pagando', color: STATE_COLORS.pagando },
]);
const CASHIER_COLORS = { libre: '#10b981', atendiendo: '#3b82f6', verificando: '#f97316', cerrada: '#64748b' };
const PALETTE = { floor: '#f8fafc', road: '#e2e8f0', shelf: '#f59e0b', text: '#1e293b', arrow: '#94a3b8' };

const AISLE_NAMES = ['FRUTAS', 'LÁCTEOS', 'CARNES', 'PANADERÍA', 'BEBIDAS', 'SNACKS', 'LIMPIEZA'];

export function buildStaticScene(layout) {
  const shapes = [{ type: 'rect', x: 0, y: 0, w: layout.width, h: layout.height, fill: PALETTE.floor, stroke: '#cbd5e1' }];
  const drawn = new Set();
  for (const e of layout.edges.values()) {
    const rev = `${e.to}>${e.from}`;
    if (drawn.has(rev)) continue; drawn.add(e.key);
    const A = layout.nodes.get(e.from), B = layout.nodes.get(e.to);
    shapes.push({ type: 'line', x1: A.x, y1: A.y, x2: B.x, y2: B.y, width: e.hasReverse ? 1.6 : 1.15, color: PALETTE.road });
    if (!e.hasReverse && e.length > 3) { // flecha de sentido único
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      shapes.push({ type: 'arrow', x: mx, y: my, ux: e.ux, uy: e.uy, size: 0.72, color: PALETTE.arrow });
    }
  }
  layout.shelfBlocks.forEach((b, idx) => {
    shapes.push({ type: 'rect', ...b, fill: PALETTE.shelf, stroke: '#d97706', radius: 0.5, shelfLabel: AISLE_NAMES[idx] || `PASILLO ${idx + 1}` });
  });
  shapes.push({ type: 'text', x: layout.entrance.x + 1.2, y: 2.6, text: '🚪 ENTRADA', size: 1.4, color: '#059669', bold: true });
  shapes.push({ type: 'text', x: 30, y: 2.6, text: 'PASILLOS UNIDIRECCIONALES', size: 1.35, color: '#64748b', bold: true });
  shapes.push({ type: 'text', x: 30, y: layout.height - 1.1, text: '💳 ZONA DE CAJAS (Clic en una caja para abrir/cerrar)', size: 1.25, color: '#334155', bold: true });
  shapes.push({ type: 'text', x: layout.exitPoint.x - 1.5, y: layout.exitPoint.y - 2.2, text: 'SALIDA ➔', size: 1.25, color: '#475569', bold: true });
  return shapes;
}

export function buildDynamicScene(layout, snapshot, positions = null) {
  const shapes = [];
  const statusLabels = { libre: 'LIBRE', atendiendo: 'COBRANDO', verificando: '¡PRECIO!', cerrada: 'CERRADA' };
  for (const k of snapshot.cashiers) {
    shapes.push({
      type: 'rect', x: k.x - 1.55, y: k.y - 1.15, w: 3.1, h: 2.1,
      fill: CASHIER_COLORS[k.status] ?? CASHIER_COLORS.libre,
      stroke: '#0f172a', radius: 0.45, opacity: k.closing ? 0.5 : 1,
      cashierId: k.id, queueLength: k.queueLength,
    });
    shapes.push({ type: 'text', x: k.x, y: k.y - 1.85, text: `C${k.id + 1}`, size: 1.05, color: PALETTE.text, bold: true });
    shapes.push({ type: 'text', x: k.x, y: k.y - 0.1, text: statusLabels[k.status] ?? k.status, size: 0.65, color: '#ffffff', bold: true });
  }
  for (const c of snapshot.customers) {
    const p = positions?.get(c.id) ?? c;
    shapes.push({
      type: 'circle', x: p.x, y: p.y, r: 0.72,
      fill: STATE_COLORS[c.state] ?? '#64748b', stroke: '#ffffff',
      customerId: c.id, items: c.items, state: c.state,
    });
    if (c.items !== undefined) {
      shapes.push({ type: 'text', x: p.x, y: p.y + 0.04, text: String(c.items), size: 0.62, color: '#ffffff', bold: true });
    }
  }
  return shapes;
}

export function drawShapes(ctx, shapes) {
  for (const s of shapes) {
    ctx.save();
    if (s.opacity !== undefined) ctx.globalAlpha = s.opacity;
    switch (s.type) {
      case 'rect':
        ctx.beginPath();
        if (s.radius && ctx.roundRect) ctx.roundRect(s.x, s.y, s.w, s.h, s.radius); else ctx.rect(s.x, s.y, s.w, s.h);
        if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
        if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = 0.12; ctx.stroke(); }
        if (s.shelfLabel) {
          ctx.save();
          ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.font = '700 1.05px system-ui, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(s.shelfLabel, 0, 0);
          ctx.restore();
        }
        break;
      case 'line':
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.stroke();
        break;
      case 'arrow':
        ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.uy, s.ux));
        ctx.beginPath(); ctx.moveTo(s.size, 0); ctx.lineTo(-s.size, s.size * 0.7); ctx.lineTo(-s.size, -s.size * 0.7); ctx.closePath();
        ctx.fillStyle = s.color; ctx.fill();
        break;
      case 'circle':
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.fill; ctx.fill();
        if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = 0.18; ctx.stroke(); }
        break;
      case 'text':
        ctx.font = `${s.bold ? '700 ' : ''}${s.size}px system-ui, sans-serif`;
        ctx.fillStyle = s.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.text, s.x, s.y);
        break;
      default: break;
    }
    ctx.restore();
  }
}

export class MapRenderer {
  constructor(canvas, layout, { smoothing = 0.35 } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.layout = layout;
    this.smoothing = smoothing; this.positions = new Map();
    this.staticScene = buildStaticScene(layout);
    this.selectedCustomerId = null;
    this.lastSnapshot = null;
    this.resize();
  }

  /** Ajusta resolución al tamaño CSS del canvas (responsivo + pantallas retina). */
  resize() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const w = this.canvas.clientWidth || 680;
    const h = (w * this.layout.height) / this.layout.width;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.height = `${h}px`;
    this.scale = (w * dpr) / this.layout.width;
  }

  /** Convierte un clic en el canvas a coordenadas del mundo (metros) y detecta cliente o caja. */
  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * this.layout.width;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * this.layout.height;

    if (this.lastSnapshot) {
      for (const c of this.lastSnapshot.customers) {
        const p = this.positions.get(c.id) ?? c;
        if (Math.hypot(p.x - x, p.y - y) <= 1.4) {
          return { type: 'customer', customer: c };
        }
      }
    }
    for (let k = 0; k < this.layout.maxCashiers; k++) {
      const pos = this.layout.cashierPos(k);
      if (Math.abs(pos.x - x) <= 1.8 && Math.abs(pos.y - y) <= 1.6) {
        return { type: 'cashier', cashierId: k, number: k + 1 };
      }
    }
    return null;
  }

  _smooth(snapshot) {
    const seen = new Set();
    for (const c of snapshot.customers) {
      seen.add(c.id);
      const p = this.positions.get(c.id);
      if (!p) this.positions.set(c.id, { x: c.x, y: c.y });
      else { p.x += (c.x - p.x) * this.smoothing; p.y += (c.y - p.y) * this.smoothing; }
    }
    for (const id of this.positions.keys()) if (!seen.has(id)) this.positions.delete(id);
  }

  _drawAllCashierSlots(ctx, snapshot) {
    const openIds = new Set(snapshot.cashiers.map((k) => k.id));
    for (let id = 0; id < this.layout.maxCashiers; id++) {
      if (openIds.has(id)) continue;
      const pos = this.layout.cashierPos(id);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pos.x - 1.45, pos.y - 1.05, 2.9, 1.9, 0.4);
      else ctx.rect(pos.x - 1.45, pos.y - 1.05, 2.9, 1.9);
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([0.35, 0.35]);
      ctx.lineWidth = 0.12;
      ctx.stroke();
      ctx.font = '700 0.9px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+C${id + 1}`, pos.x, pos.y - 0.1);
      ctx.restore();
    }
  }

  _drawSelectionHighlight(ctx, snapshot) {
    if (!this.selectedCustomerId) return;
    const c = snapshot.customers.find((item) => item.id === this.selectedCustomerId);
    if (!c) return;
    const p = this.positions.get(c.id) ?? c;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.22;
    ctx.stroke();

    // Etiqueta flotante sobre el cliente seleccionado
    const label = `Cliente #${c.id} · ${c.items} prod.`;
    ctx.font = '700 1.05px system-ui, sans-serif';
    const tw = Math.max(8, label.length * 0.56);
    const bx = Math.min(this.layout.width - tw / 2 - 1, Math.max(tw / 2 + 1, p.x));
    const by = Math.max(2.2, p.y - 2.1);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx - tw / 2, by - 0.95, tw, 1.9, 0.45);
    else ctx.rect(bx - tw / 2, by - 0.95, tw, 1.9);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx, by);
    ctx.restore();
  }

  draw(snapshot) {
    if (!snapshot) return;
    this.lastSnapshot = snapshot;
    this._smooth(snapshot);
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    drawShapes(ctx, this.staticScene);
    this._drawAllCashierSlots(ctx, snapshot);
    drawShapes(ctx, buildDynamicScene(this.layout, snapshot, this.positions));
    this._drawSelectionHighlight(ctx, snapshot);
  }
}
