// Text-only simulation: npm run sim -- --day 3 [--script path] [--customers 20] [--seed 1] [--quiet]

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getDay } from './content.ts';
import { contentPath, loadContent } from './load-content.ts';
import { parseScript, ScriptError } from './script.ts';
import { runDay } from './simulation.ts';

const { values } = parseArgs({
  options: {
    day: { type: 'string', default: '1' },
    script: { type: 'string' },
    customers: { type: 'string', default: '20' },
    seed: { type: 'string', default: '1' },
    quiet: { type: 'boolean', default: false },
  },
});

const content = loadContent();
const day = getDay(content, Number(values.day));
const scriptPath = values.script ?? contentPath(day.sampleScript);

let script;
try {
  script = parseScript(readFileSync(scriptPath, 'utf8'));
} catch (e) {
  if (e instanceof ScriptError) {
    console.error(`Script error in ${scriptPath}\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const result = runDay({ content, day, script, customers: Number(values.customers), seed: Number(values.seed) });

console.log(`\n第${day.day}天 · Day ${day.day}: ${day.title}`);
console.log(`${day.twist}`);
console.log(`Script: ${scriptPath} (${result.rules} rules)\n`);

for (const r of result.results) {
  const ok = r.failures.length === 0;
  console.log(`${ok ? '✓' : '✗'} #${r.customer.id} ${r.customer.type.name} (${r.customer.type.en})`);
  if (!values.quiet || !ok) {
    for (const t of r.transcript) console.log(`    ${t.who}: ${t.text}`);
  }
  for (const f of r.failures) console.log(`    ✗ ${f.reason}`);
}

const happy = result.results.filter((r) => r.failures.length === 0).length;
console.log(`\n满意度 satisfaction: ${happy}/${result.results.length} (${Math.round(result.satisfaction * 100)}%)`);
console.log(`Rules: ${result.rules} (target ${day.targetRules} or fewer for the 3rd star)`);
console.log(`Stars: ${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`);

if (result.review.length) {
  console.log('\n夜里复习 Night review: say each one aloud once');
  for (const item of result.review) {
    console.log(`  ${item.text}${item.count > 1 ? `  (×${item.count})` : ''}`);
    console.log(`    ${item.pinyin}`);
    console.log(`    ${item.en}`);
  }
}
