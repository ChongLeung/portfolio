import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  parseUniqueJson,
  recoverHistory,
  validatePreferences,
  validateSettings,
  validateVocabulary,
} from '../lib/model.ts';

test('complete preferences round-trip without private data', () => {
  const settings = {
    ...defaults,
    theme: 'dark',
    textScale: 140,
    language: 'yue',
  };
  assert.deepEqual(
    validatePreferences(
      JSON.stringify({
        schemaVersion: 1,
        settings,
        omission: 'Private vocabulary and file metadata are omitted.',
      }),
    ),
    settings,
  );
});
test('partial preferences are rejected instead of silently resetting omitted settings', () => {
  assert.throws(
    () =>
      validatePreferences('{"schemaVersion":1,"settings":{"language":"yue"}}'),
    /incomplete/,
  );
});
test('unknown envelope fields, versions and settings fail closed', () => {
  assert.throws(
    () =>
      validatePreferences(
        JSON.stringify({
          schemaVersion: 1,
          settings: defaults,
          privateVocabulary: {},
        }),
      ),
    /Unknown/,
  );
  assert.throws(
    () =>
      validatePreferences(
        JSON.stringify({ schemaVersion: 2, settings: defaults }),
      ),
    /envelope/,
  );
  assert.throws(
    () => validateSettings({ ...defaults, extra: true }),
    /Unknown/,
  );
});
test('invalid values and unsafe settings keys are rejected', () => {
  for (const value of [
    { theme: 'sepia' },
    { textScale: 900 },
    { emojis: 'yes' },
    { accent: 'url(example)' },
    { rate: NaN },
  ])
    assert.throws(() => validateSettings({ ...defaults, ...value }));
  assert.throws(() => validateSettings(JSON.parse('{"__proto__":{}}')));
});
test('a malformed history entry does not discard valid neighbors', () => {
  const item = {
    id: 'a',
    at: '2026-09-06T22:00:00Z',
    action: 'Changed theme',
    settings: defaults,
  };
  const result = recoverHistory([
    item,
    { ...item, id: 'b', settings: { theme: 'sepia' } },
    { ...item, id: 'c' },
  ]);
  assert.deepEqual(
    result.entries.map((item) => item.id),
    ['a', 'c'],
  );
  assert.equal(result.skipped, 1);
});
test('history recovery excludes unexpected metadata and invalid dates', () => {
  const item = {
    id: 'a',
    at: '2026-09-06T22:00:00Z',
    action: 'Changed theme',
    settings: defaults,
    privateCache: 'must not survive',
  };
  const result = recoverHistory([item, { ...item, at: 'not a date' }]);
  assert.equal(result.skipped, 1);
  assert.equal('privateCache' in result.entries[0], false);
});
test('vocabulary accepts neutral versioned string mappings and empty maps', () => {
  assert.deepEqual(
    validateVocabulary('{"schemaVersion":1,"entries":{"Hello":"Welcome"}}'),
    { Hello: 'Welcome' },
  );
  assert.deepEqual(validateVocabulary('{"schemaVersion":1,"entries":{}}'), {});
});
test('vocabulary rejects duplicate escaped keys before JSON parsing overwrites them', () => {
  assert.throws(
    () =>
      validateVocabulary(
        '{"schemaVersion":1,"entries":{"A":"one","\\u0041":"two"}}',
      ),
    /Duplicate/,
  );
  assert.throws(
    () => parseUniqueJson('{"entries":{},"entries":{}}'),
    /Duplicate/,
  );
});
test('vocabulary rejects unknown fields, versions, unsafe keys and non-string replacements', () => {
  for (const value of [
    '{"schemaVersion":2,"entries":{}}',
    '{"schemaVersion":1,"entries":{},"extra":true}',
    '{"schemaVersion":1,"entries":{"__proto__":"bad"}}',
    '{"schemaVersion":1,"entries":{"constructor":"bad"}}',
    '{"schemaVersion":1,"entries":{"A":3}}',
    '{"schemaVersion":1,"entries":{"":"empty key"}}',
    '{"schemaVersion":1,"entries":{"A":"\\u0000"}}',
    'null',
    '[]',
    '{',
  ])
    assert.throws(() => validateVocabulary(value));
});
test('vocabulary enforces byte, key, value, entry and depth bounds', () => {
  assert.throws(() => parseUniqueJson(' '.repeat(1048577)), /limit/);
  assert.throws(
    () => parseUniqueJson('['.repeat(9) + '0' + ']'.repeat(9)),
    /depth/,
  );
  assert.throws(() =>
    validateVocabulary(
      JSON.stringify({ schemaVersion: 1, entries: { ['a'.repeat(161)]: 'x' } }),
    ),
  );
  assert.throws(() =>
    validateVocabulary(
      JSON.stringify({ schemaVersion: 1, entries: { a: 'x'.repeat(1001) } }),
    ),
  );
  assert.throws(() =>
    validateVocabulary(
      JSON.stringify({
        schemaVersion: 1,
        entries: Object.fromEntries(
          Array.from({ length: 4097 }, (_, i) => ['key' + i, 'value']),
        ),
      }),
    ),
  );
});
test('duplicate detection respects objects, arrays and escaped string content', () => {
  assert.deepEqual(
    parseUniqueJson('{"a":[{"x":1},{"x":2}],"b":"quotes: \\""}'),
    { a: [{ x: 1 }, { x: 2 }], b: 'quotes: "' },
  );
});
