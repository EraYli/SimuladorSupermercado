import { ScenarioHistory } from '../src/modules/scenarioHistory.js';
import { seedDemoHistory, PRESET_CONFIGS } from '../src/data/testData.js';
import { formatDuration } from '../src/utils/format.js';

const h = new ScenarioHistory();
seedDemoHistory(h, { ...PRESET_CONFIGS.horaPico, durationMin: 120 }, [4, 5, 6, 8]);
const { rows, recommendation, warnings } = h.compare();
console.log('\nEscenario        Cajas  Espera prom  Espera máx  Abandono  Satisf.  Utiliz.');
for (const r of rows) {
  console.log(
    r.name.padEnd(16), String(r.cajas).padStart(5), formatDuration(r.esperaPromSec).padStart(11),
    formatDuration(r.esperaMaxSec).padStart(11), `${r.abandonoPct.toFixed(1)}%`.padStart(9),
    `${r.satisfaccionPct.toFixed(0)}%`.padStart(8), `${r.utilizacionPct.toFixed(0)}%`.padStart(8));
}
console.log('\nRecomendación:', recommendation.reason);
if (warnings.length) console.log('Avisos:', warnings);
