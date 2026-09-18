import {
  requiredFeatures,
  requiredSurfaces,
  evidenceRows,
} from '../lib/feature-inventory.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const failures = [];
const expected = new Set(
  requiredSurfaces.flatMap((surface) =>
    requiredFeatures.map((feature) => `${surface}:${feature}`),
  ),
);
const observed = new Set();
for (const row of evidenceRows) {
  const key = `${row.surface}:${row.feature}`;
  if (!expected.has(key) || observed.has(key))
    failures.push(`Unexpected or duplicate row: ${key}`);
  observed.add(key);
  if (row.status !== 'verified') failures.push(`Unverified: ${key}`);
  for (const field of [
    'implementation',
    'documentation',
    'localization',
    'persistence',
    'tests',
    'interaction',
    'captures',
  ]) {
    if (!Array.isArray(row[field]) || !row[field].length)
      failures.push(`Missing ${field}: ${key}`);
    else
      for (const path of row[field])
        if (!existsSync(resolve(import.meta.dirname, '..', '..', path)))
          failures.push(`Absent ${field} path: ${key}`);
  }
}
for (const key of expected)
  if (!observed.has(key)) failures.push(`Missing required row: ${key}`);
console.log(
  JSON.stringify(
    {
      complete: failures.length === 0,
      expectedRows: expected.size,
      assertedRows: evidenceRows.length,
      failureCount: failures.length,
      firstFailures: failures.slice(0, 12),
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
