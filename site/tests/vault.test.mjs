import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readTotp, saveTotp, VaultError } from '../lib/authenticator.ts';

const config = {
  issuer: 'Example',
  account: 'Synthetic account',
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
};
const id = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
});
const get = (operation) =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
const finish = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
async function mutate(callback) {
  const db = await get(indexedDB.open('harbour-authenticator-v1', 1));
  try {
    const tx = db.transaction(['keys', 'entries'], 'readwrite');
    const done = finish(tx);
    callback(tx);
    await done;
  } finally {
    db.close();
  }
}
async function stored() {
  const db = await get(indexedDB.open('harbour-authenticator-v1', 1));
  try {
    const tx = db.transaction(['keys', 'entries'], 'readonly');
    return await Promise.all([
      get(tx.objectStore('keys').get('key')),
      get(tx.objectStore('entries').count()),
    ]);
  } finally {
    db.close();
  }
}

test('concurrent first writes share one key and all entries can be decrypted', async () => {
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      saveTotp({ ...config, account: `Synthetic ${i}` }, id(i)),
    ),
  );
  const page = await readTotp();
  assert.equal(page.entries.length, 6);
  assert.equal(page.corruptCount, 0);
  const [key, count] = await stored();
  assert.equal(key.extractable, false);
  assert.equal(count, 6);
});
test('a missing key with surviving ciphertext fails without replacing the key or data', async () => {
  await saveTotp(config, id(1));
  await mutate((tx) => tx.objectStore('keys').delete('key'));
  await assert.rejects(
    readTotp(),
    (error) => error instanceof VaultError && error.code === 'KEY_MISSING',
  );
  await assert.rejects(
    saveTotp(config, id(2)),
    (error) => error.code === 'KEY_MISSING',
  );
  const [key, count] = await stored();
  assert.equal(key, undefined);
  assert.equal(count, 1);
});
test('an invalid stored key is retained and reported instead of being replaced', async () => {
  await saveTotp(config, id(1));
  await mutate((tx) => tx.objectStore('keys').put({ invalid: true }, 'key'));
  await assert.rejects(readTotp(), (error) => error.code === 'KEY_INVALID');
  const [key, count] = await stored();
  assert.deepEqual(key, { invalid: true });
  assert.equal(count, 1);
});
test('a damaged entry does not hide healthy records or make a subsequent save fail', async () => {
  await saveTotp(config, id(1));
  await saveTotp(config, id(3));
  await mutate((tx) =>
    tx
      .objectStore('entries')
      .add({
        id: id(2),
        iv: new ArrayBuffer(12),
        ciphertext: new ArrayBuffer(32),
      }),
  );
  const result = await readTotp();
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    [id(1), id(3)],
  );
  assert.equal(result.corruptCount, 1);
  assert.equal(await saveTotp(config, id(4)), id(4));
  const after = await readTotp();
  assert.equal(after.entries.length, 3);
  assert.equal(after.corruptCount, 1);
});
test('bounded pages expose every stored record without retaining earlier pages', async () => {
  for (let i = 0; i < 8; i++)
    await saveTotp({ ...config, account: `Synthetic ${i}` }, id(i));
  const first = await readTotp({ limit: 3 });
  assert.equal(first.entries.length, 3);
  assert.equal(first.nextCursor, id(2));
  const second = await readTotp({ after: first.nextCursor, limit: 3 });
  assert.deepEqual(
    second.entries.map((entry) => entry.id),
    [id(3), id(4), id(5)],
  );
  const third = await readTotp({ after: second.nextCursor, limit: 3 });
  assert.deepEqual(
    third.entries.map((entry) => entry.id),
    [id(6), id(7)],
  );
  assert.equal(third.nextCursor, null);
});
test('duplicate save identifiers cannot overwrite or duplicate committed entries', async () => {
  await saveTotp(config, id(1));
  await assert.rejects(
    saveTotp({ ...config, account: 'Replacement' }, id(1)),
    (error) => error.code === 'WRITE_FAILED',
  );
  const page = await readTotp();
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].config.account, config.account);
});
test('oversized sealed records are skipped before decryption', async () => {
  await saveTotp(config, id(1));
  await mutate((tx) =>
    tx
      .objectStore('entries')
      .add({
        id: id(2),
        iv: new ArrayBuffer(12),
        ciphertext: new ArrayBuffer(16385),
      }),
  );
  const page = await readTotp();
  assert.equal(page.entries.length, 1);
  assert.equal(page.corruptCount, 1);
});
test('aborted reads and invalid page limits reject without opening a new store', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readTotp({ signal: controller.signal }),
    (error) => error.code === 'ABORTED',
  );
  await assert.rejects(readTotp({ limit: 51 }));
  await assert.rejects(readTotp({ limit: 0 }));
  assert.equal((await indexedDB.databases()).length, 0);
});
