/**
 * Cajas y decisión del cliente.
 *  - Estimación de espera de una fila = perPersonSec·personas + perItemSec·productos  (+ pausa visible de la cajera)
 *  - El cliente evalúa TODAS las cajas abiertas y elige la de menor estimación (con ruido de percepción).
 *  - Si todas superan maxWaitSec puede abandonar.
 *  - Retrasos breves aleatorios (verificar precio) => cuellos de botella.
 *  - Cambio de fila (jockeying) para el último de cada fila.
 */
import { CustomerState } from './customer.js';
import { MAX_CASHIERS } from './config.js';

export class Cashier {
  constructor(id) {
    this.id = id;
    this.speedFactor = 0.92 + ((id * 37) % 17) / 100; // 0.92–1.08, determinista por caja
    this.isOpen = false;
    this.closing = false;
    this.queue = [];          // clientes esperando (sin contar al que se atiende)
    this.serving = null;
    this.serviceStart = 0; this.serviceEnd = 0;
    this.delayStart = null; this.delayEnd = null;
    this.busySec = 0; this.openSec = 0;
    this.servedCount = 0; this.delayCount = 0; this.delaySec = 0;
    this.status = 'cerrada';  // cerrada | libre | atendiendo | verificando
  }
}

export class CheckoutSystem {
  constructor(layout, getConfig, rng, onEvent = () => {}) {
    this.layout = layout;
    this.getConfig = getConfig;
    this.rng = rng;
    this.onEvent = onEvent;
    this.cashiers = Array.from({ length: MAX_CASHIERS }, (_, i) => new Cashier(i));
    this.shared = [];
    this.mode = getConfig().queueType;
    this.jockeyCount = 0;
  }

  get activeCashiers() { return this.cashiers.filter((k) => k.isOpen && !k.closing); }
  get queueTotal() { return this.shared.length + this.cashiers.reduce((s, k) => s + k.queue.length, 0); }
  get inService() { return this.cashiers.filter((k) => k.serving).length; }

  /** Abre/cierra cajas hasta tener n activas. Las que cierran terminan su fila primero. */
  setOpenCount(n, t) {
    const target = Math.max(1, Math.min(MAX_CASHIERS, Math.round(n)));
    let active = this.activeCashiers;
    if (active.length < target) {
      for (const k of this.cashiers) { // reabrir las que estaban cerrando
        if (active.length >= target) break;
        if (k.isOpen && k.closing) { k.closing = false; active = this.activeCashiers; }
      }
      for (const k of this.cashiers) {
        if (active.length >= target) break;
        if (!k.isOpen) { k.isOpen = true; k.closing = false; k.status = 'libre'; this.onEvent('cashier-open', { t, id: k.id }); active = this.activeCashiers; }
      }
    } else if (active.length > target) {
      const toClose = [...active].sort((a, b) => b.id - a.id).slice(0, active.length - target);
      for (const k of toClose) { k.closing = true; this.onEvent('cashier-closing', { t, id: k.id }); }
    }
  }

  _remainingFrac(k, t) {
    if (!k.serving) return 0;
    const total = k.serviceEnd - k.serviceStart;
    return total > 0 ? Math.max(0, Math.min(1, (k.serviceEnd - t) / total)) : 0;
  }

  /** Peso combinado personas + productos, expresado en segundos estimados. */
  estimateCashier(k, t) {
    const cfg = this.getConfig();
    const rem = this._remainingFrac(k, t);
    let persons = k.queue.length + rem;
    let items = k.queue.reduce((s, c) => s + c.items, 0) + (k.serving ? k.serving.items * rem : 0);
    let est = cfg.perPersonSec * persons + cfg.perItemSec * items;
    if (k.status === 'verificando') est += Math.max(0, k.delayEnd - t);
    return est;
  }

  estimateShared(t) {
    const cfg = this.getConfig();
    const act = this.activeCashiers;
    if (!act.length) return Infinity;
    let work = this.shared.reduce((s, c) => s + cfg.perPersonSec + cfg.perItemSec * c.items, 0);
    for (const k of act) if (k.serving) work += cfg.perPersonSec * this._remainingFrac(k, t) + cfg.perItemSec * k.serving.items * this._remainingFrac(k, t);
    return work / act.length;
  }

  /** El cliente terminó de comprar: evalúa cajas y se forma o abandona. */
  join(c, t) {
    const cfg = this.getConfig();
    const act = this.activeCashiers;
    let estimate, chosen = null;

    if (this.mode === 'unica') {
      estimate = this.estimateShared(t);
    } else {
      let best = Infinity;
      for (const k of act) {
        const e = this.estimateCashier(k, t);
        const perceived = e * (1 + (cfg.choiceNoise ? this.rng.normal(0, cfg.choiceNoise) : 0));
        if (perceived < best) { best = perceived; chosen = k; }
      }
      estimate = Math.min(...act.map((k) => this.estimateCashier(k, t)));
    }

    if (cfg.abandonEnabled && estimate > cfg.maxWaitSec && this.rng.chance(cfg.abandonProbability)) {
      return { joined: false, estimate };
    }
    c.queueJoinedAt = t;
    c.state = CustomerState.QUEUEING;
    if (this.mode === 'unica') this.shared.push(c);
    else { chosen.queue.push(c); c.cashierId = chosen.id; }
    return { joined: true, estimate, cashierId: chosen?.id ?? null };
  }

  _start(k, c, t) {
    const cfg = this.getConfig();
    c.serviceStartAt = t;
    c.waitSec = t - c.queueJoinedAt;
    c.cashierId = k.id;
    c.state = CustomerState.PAYING;
    const base = (cfg.perPersonSec + cfg.perItemSec * c.items) * c.serviceFactor * k.speedFactor;
    k.serving = c;
    k.serviceStart = t;
    k.serviceEnd = t + base + c.delayDuration;
    k.status = 'atendiendo';
    if (c.delayDuration > 0) {
      k.delayStart = t + base * 0.5;
      k.delayEnd = k.delayStart + c.delayDuration;
      k.delayCount++; k.delaySec += c.delayDuration;
      this.onEvent('delay', { t, id: k.id, seconds: c.delayDuration });
    } else { k.delayStart = null; k.delayEnd = null; }
  }

  /** @returns {object[]} clientes cuyo pago terminó */
  step(dt, t) {
    const completed = [];
    for (const k of this.cashiers) {
      if (!k.isOpen) continue;
      k.openSec += dt;
      if (k.serving) {
        k.busySec += dt;
        if (t >= k.serviceEnd) {
          const c = k.serving;
          c.serviceEndAt = t; c.state = CustomerState.LEAVING;
          completed.push(c);
          k.serving = null; k.servedCount++; k.delayStart = k.delayEnd = null;
        } else if (k.delayStart !== null && t >= k.delayStart && t < k.delayEnd) k.status = 'verificando';
        else k.status = 'atendiendo';
      }
      if (!k.serving) {
        let next = null;
        if (this.mode === 'unica') { if (!k.closing) next = this.shared.shift() ?? null; }
        else next = k.queue.shift() ?? null; // una caja que cierra termina su propia fila
        if (next) this._start(k, next, t); else k.status = 'libre';
      }
      if (k.closing && !k.serving && k.queue.length === 0) { k.isOpen = false; k.closing = false; k.status = 'cerrada'; }
    }
    return completed;
  }

  /** Cambio de fila: el último de cada fila se pasa a otra bastante más corta. */
  jockey(t) {
    const cfg = this.getConfig();
    if (!cfg.jockeying || this.mode !== 'por-caja') return 0;
    const act = this.activeCashiers;
    if (act.length < 2) return 0;
    let moves = 0;
    for (const k of act) {
      const c = k.queue[k.queue.length - 1];
      if (!c) continue;
      const ahead = this.estimateCashier(k, t) - cfg.perPersonSec - cfg.perItemSec * c.items;
      let best = null, bestEst = Infinity;
      for (const o of act) if (o !== k) { const e = this.estimateCashier(o, t); if (e < bestEst) { bestEst = e; best = o; } }
      if (best && bestEst < ahead * 0.65 - 10 && this.rng.chance(0.6)) {
        k.queue.pop(); best.queue.push(c); c.cashierId = best.id; c.jockeyed++;
        moves++; this.jockeyCount++;
      }
    }
    return moves;
  }

  /** Cambio de fila única <-> por caja en vivo, preservando el orden de llegada. */
  switchQueueType(type, t) {
    if (type === this.mode) return;
    if (type === 'unica') {
      const all = this.cashiers.flatMap((k) => k.queue.splice(0)).concat(this.shared);
      all.sort((a, b) => a.queueJoinedAt - b.queueJoinedAt);
      this.shared = all;
      for (const c of all) c.cashierId = null;
      this.mode = 'unica';
    } else {
      const all = this.shared.splice(0);
      this.mode = 'por-caja';
      for (const c of all) {
        let best = null, be = Infinity;
        for (const k of this.activeCashiers) { const e = this.estimateCashier(k, t); if (e < be) { be = e; best = k; } }
        best.queue.push(c); c.cashierId = best.id;
      }
    }
  }
}
