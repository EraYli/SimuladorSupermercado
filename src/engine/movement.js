/**
 * Movimiento sobre rutas fijas SIN BLOQUEOS.
 * Regla: si hay alguien enfrente (misma calle, o al inicio de la siguiente), el cliente se detiene
 * y espera. Como la calle es de un solo sentido, nunca hay cruces frontales => no hay bloqueo mutuo.
 * Salvaguarda: si alguien lleva > patienceSec detenido, se le permite avanzar (se cuenta en deadlockBreaks).
 * Quien mira un estante se hace a un lado del pasillo (no bloquea a quienes caminan); al terminar
 * vuelve a la calle y, si hay alguien justo enfrente, espera su turno.
 */
export class MovementSystem {
  constructor(layout, { minGap = 1.0, patienceSec = 120, laneOffset = 0.3 } = {}) {
    this.layout = layout;
    this.minGap = minGap;
    this.patienceSec = patienceSec;
    this.laneOffset = laneOffset;
    this.walkers = new Set();
    this.pending = [];       // esperando espacio libre en la entrada
    this.deadlockBreaks = 0;
  }

  spawn(c) {
    c.x = this.layout.entrance.x; c.y = this.layout.entrance.y;
    this.pending.push(c);
  }

  get count() { return this.walkers.size + this.pending.length; }

  _edgeKey(c) { return `${c.nodes[c.leg]}>${c.nodes[c.leg + 1]}`; }

  _place(c) {
    const e = this.layout.edges.get(this._edgeKey(c));
    const A = this.layout.nodes.get(e.from);
    const off = (e.hasReverse ? this.laneOffset : 0) + (c.aside ? 0.9 : 0); // tráfico por la derecha; a un lado si mira estantes
    c.x = A.x + e.ux * c.s - e.uy * off;
    c.y = A.y + e.uy * c.s + e.ux * off;
  }

  /** @returns {object[]} clientes que llegaron al acceso de cajas (nodo K) en este paso */
  step(dt, t, tick) {
    const { layout, minGap } = this;
    this._t = t;
    const occ = new Map();
    const ready = []; // quienes terminaron de mirar estantes y quieren volver a la calle
    for (const c of this.walkers) {
      if (c.aside) { if (c.dwellUntil <= t) ready.push(c); continue; } // a un lado del pasillo: no ocupa la calle
      const k = this._edgeKey(c);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push(c);
    }
    for (const list of occ.values()) list.sort((a, b) => b.s - a.s); // el de adelante primero

    // Admisión en la entrada (solo si hay espacio)
    const stillPending = [];
    for (const c of this.pending) {
      const k = this._edgeKey(c);
      const list = occ.get(k) ?? [];
      const minS = list.length ? list[list.length - 1].s : Infinity;
      if (minS >= minGap) {
        c.s = 0; this.walkers.add(c); list.push(c); occ.set(k, list); this._place(c);
      } else stillPending.push(c);
    }
    this.pending = stillPending;
    for (const c of ready) { // regresan a la calle solo si hay espacio libre
      const k = this._edgeKey(c);
      const list = occ.get(k) ?? [];
      const minS = list.length ? list[list.length - 1].s : Infinity;
      if (minS >= minGap) { c.aside = false; c.s = 0; c.blockedFor = 0; list.push(c); occ.set(k, list); this._place(c); }
    }

    const arrived = [];
    for (const key of [...occ.keys()]) {
      const list = occ.get(key);
      const edge = layout.edges.get(key);
      const stay = [];
      let lastS = Infinity; // posición del cliente inmediatamente adelante

      for (const c of list) {
        if (c.tickMark === tick) { stay.push(c); lastS = c.s; continue; } // ya se movió en este paso

        let limit = Infinity;
        if (lastS !== Infinity) limit = lastS - minGap;
        let nextKey = null, m = Infinity;
        if (c.leg + 2 < c.nodes.length) {
          nextKey = `${c.nodes[c.leg + 1]}>${c.nodes[c.leg + 2]}`;
          const nl = occ.get(nextKey);
          if (nl && nl.length) m = nl[nl.length - 1].s;
          if (m !== Infinity) limit = Math.min(limit, edge.length + m - minGap);
        }

        let ignoreBlock = false;
        if (c.blockedFor > this.patienceSec) { ignoreBlock = true; this.deadlockBreaks++; c.blockedFor = 0; }

        let newS = c.s + c.speed * dt;
        let blocked = false;
        if (!ignoreBlock && newS > limit) { newS = Math.max(c.s, limit); blocked = true; }
        c.blockedFor = blocked && newS - c.s < 1e-6 ? c.blockedFor + dt : 0;
        c.tickMark = tick;

        if (newS >= edge.length - 1e-9) {
          if (c.leg + 1 >= c.nodes.length - 1) { // llegó al nodo final (K)
            c.leg = c.nodes.length - 1;
            this.walkers.delete(c);
            c.x = layout.checkoutApproach.x; c.y = layout.checkoutApproach.y;
            arrived.push(c); lastS = edge.length;
            continue;
          }
          const carry = newS - edge.length;
          c.leg += 1;
          c.s = Math.max(0, m === Infinity ? carry : Math.min(carry, m - minGap));
          const d = c.dwell.get(c.leg);
          if (d) { c.dwellUntil = t + d; c.s = 0; c.aside = true; }
          if (!d) { if (!occ.has(nextKey)) occ.set(nextKey, []); occ.get(nextKey).push(c); }
          this._place(c);
          lastS = edge.length;
          continue;
        }
        c.s = newS; this._place(c);
        stay.push(c); lastS = c.s;
      }
      occ.set(key, stay);
    }
    return arrived;
  }
}
