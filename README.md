# Simulador de Flujo de Supermercado — Etapas 1, 2 y 3

Avance conforme al cronograma:
- **Etapa 1 (Entregada):** Lógica de simulación (motor matemático de eventos discretos, Poisson no homogéneo, agentes, rutas fijas sin bloqueos, decisión en cajas y métricas).
- **Etapa 2 (Entregada):** Desarrollo de módulos (`store.js`, `simulationController.js`, `routeRenderer.js`, `scenarioHistory.js`).
- **Etapa 3 (Completada):** Integración de interfaz con las **5 vistas mejoradas** (modo Paso a Paso 1/5–5/5 + modo Dashboard multipanel responsivo).
- **Pendiente:** Etapa 4 (Pruebas finales, ajustes y entrega).

## Comandos rápidos

```bash
npm start       # Inicia la aplicación web en http://localhost:3000
npm test        # Ejecuta las 38 pruebas unitarias y de integración (Node ≥ 20)
npm run demo    # Compara 4/5/6/8 cajas en consola y muestra la recomendación óptima
```

## Arquitectura de Archivos

```
index.html                  Punto de entrada web de las 5 vistas
scripts/
├─ serve.js                 Servidor web local sin dependencias (http://localhost:3000)
└─ demo.js                  Demostración en consola del optimizador de escenarios
src/
├─ engine/                  ETAPA 1 · Motor matemático puro (sin DOM)
│  ├─ rng.js                PRNG con semilla + distribuciones; flujos independientes
│  ├─ config.js             Parámetros, límites y validateConfig() (en frío y en vivo)
│  ├─ demand.js             λ(t) no homogénea + adelgazamiento de Lewis–Shedler + E[N]
│  ├─ layout.js             Mapa como grafo dirigido de calles fijas + BFS de rutas
│  ├─ customer.js           Agente cliente (productos, ruta, velocidad, retraso en caja)
│  ├─ movement.js           Avance por rutas fijas: si hay alguien enfrente, espera
│  ├─ checkout.js           Cajas, peso personas+productos, abandono, retrasos, jockeying
│  ├─ metrics.js            Espera, satisfacción, utilización, serie temporal
│  ├─ simulation.js         Clase Simulation: advance(), run(), updateConfig() en vivo
│  └─ index.js
├─ modules/                 ETAPA 2 · Estado, controlador, renderizado y escenarios
│  ├─ store.js              Estado global (reducer + acciones + suscripción)
│  ├─ simulationController.js  Bucle de animación, pausa, x1/x5/x10, cambios en vivo
│  ├─ routeRenderer.js      Escenas puras + MapRenderer para <canvas> 2D con DPR
│  └─ scenarioHistory.js    Guardar/comparar/exportar escenarios + recomendación óptima
├─ ui/                      ETAPA 3 · Interfaz de Usuario de 5 Vistas
│  ├─ icons.js              Iconografía vectorial SVG estilo Lucide
│  ├─ charts.js             Gráficas SVG (barras, líneas, gauges, pastel y curva λ(t))
│  ├─ views.js              Renderizado de las Vistas 1 a 5 + barra de progreso 1/5..5/5
│  ├─ app.js                SupermarketApp: conecta Store, Controller, Canvas e Historial
│  └─ styles.css            Diseño moderno y responsivo (vista móvil y modo Dashboard)
├─ data/testData.js         Presets y datos de prueba generados con el motor real
└─ utils/format.js          Formateo de duraciones ("3m 45s") y relojes
tests/
├─ engine.test.js           Pruebas de la Etapa 1 (Motor de Simulación)
├─ modules.test.js          Pruebas de la Etapa 2 (Store, Controlador, Historial, Canvas)
└─ ui.test.js               Pruebas de la Etapa 3 (Gráficas SVG y flujo entre las 5 vistas)
```
