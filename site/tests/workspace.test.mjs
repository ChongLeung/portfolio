import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import {
  initialWorkspace,
  reduceWorkspace,
  validateWorkspace,
} from '../lib/workspace.ts';
import {
  readWorkspace,
  updateWorkspace,
  workspaceHistory,
} from '../lib/workspace-storage.ts';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.IDBObjectStore = IDBObjectStore;
});
const open = (state, route) =>
  reduceWorkspace(state, { type: 'open', route, id: route });
const populated = () => open(open(initialWorkspace, 'settings'), 'tools');
test('opening a feature reuses its tab and never mutates the caller snapshot', () => {
  const state = open(initialWorkspace, 'settings');
  const next = reduceWorkspace(state, {
    type: 'open',
    route: 'settings',
    id: 'unused',
  });
  assert.equal(next.tabs.length, 2);
  assert.equal(next.active, 'settings');
  assert.equal(initialWorkspace.tabs.length, 1);
  assert.equal(next.revision, state.revision);
});
test('close protects pinned and locked tabs by default', () => {
  const state = populated();
  state.tabs.find((tab) => tab.id === 'tools').locked = true;
  const next = reduceWorkspace(state, {
    type: 'close',
    ids: state.tabs.map((tab) => tab.id),
  });
  assert.deepEqual(
    next.tabs.map((tab) => tab.id),
    ['home', 'tools'],
  );
  assert.deepEqual(
    next.closed.map((tab) => tab.id),
    ['settings'],
  );
});
test('bulk close always preserves one active reachable tab', () => {
  const state = populated();
  const next = reduceWorkspace(state, {
    type: 'close',
    ids: state.tabs.map((tab) => tab.id),
    includePinned: true,
    includeLocked: true,
  });
  assert.equal(next.tabs.length, 1);
  assert.equal(next.active, next.tabs[0].id);
  assert.doesNotThrow(() => validateWorkspace(next));
});
test('reopening restores prior position, name, pinning and group', () => {
  let state = populated();
  state = reduceWorkspace(state, {
    type: 'group-create',
    id: 'reading',
    name: 'Reading',
    color: '#006b60',
  });
  state = reduceWorkspace(state, {
    type: 'move',
    id: 'settings',
    before: 'tools',
    group: 'reading',
  });
  state = reduceWorkspace(state, {
    type: 'rename',
    id: 'settings',
    title: 'My settings',
  });
  const closed = reduceWorkspace(state, { type: 'close', ids: ['settings'] });
  const reopened = reduceWorkspace(closed, { type: 'reopen' });
  assert.deepEqual(
    reopened.tabs.map((tab) => tab.id),
    ['home', 'settings', 'tools'],
  );
  assert.equal(reopened.tabs[1].title, 'My settings');
  assert.equal(reopened.tabs[1].group, 'reading');
  assert.equal(reopened.active, 'settings');
});
test('removing a group retains open and closed tabs without dangling references', () => {
  let state = reduceWorkspace(populated(), {
    type: 'group-create',
    id: 'group',
    name: 'Tools',
    color: '#123456',
  });
  state = reduceWorkspace(state, {
    type: 'move',
    id: 'tools',
    before: null,
    group: 'group',
  });
  state = reduceWorkspace(state, { type: 'close', ids: ['tools'] });
  const next = reduceWorkspace(state, { type: 'group-remove', id: 'group' });
  assert.equal(next.groups.length, 0);
  assert.equal(next.closed[0].group, null);
  assert.equal(reduceWorkspace(next, { type: 'reopen' }).active, 'tools');
});
test('activating a grouped tab expands its group', () => {
  let state = reduceWorkspace(populated(), {
    type: 'group-create',
    id: 'group',
    name: 'Tools',
    color: '#123456',
  });
  state = reduceWorkspace(state, {
    type: 'move',
    id: 'tools',
    before: null,
    group: 'group',
  });
  state = reduceWorkspace(state, {
    type: 'group-update',
    id: 'group',
    collapsed: true,
  });
  assert.equal(state.groups[0].collapsed, true);
  state = reduceWorkspace(state, { type: 'activate', id: 'tools' });
  assert.equal(state.groups[0].collapsed, false);
});
test('tab and group reordering use stable ids and reject stale targets', () => {
  let state = populated();
  state = reduceWorkspace(state, {
    type: 'move',
    id: 'tools',
    before: 'settings',
    group: null,
  });
  assert.deepEqual(
    state.tabs.map((tab) => tab.id),
    ['home', 'tools', 'settings'],
  );
  assert.throws(() =>
    reduceWorkspace(state, {
      type: 'move',
      id: 'gone',
      before: null,
      group: null,
    }),
  );
  state = reduceWorkspace(state, {
    type: 'group-create',
    id: 'one',
    name: 'One',
    color: '#111111',
  });
  state = reduceWorkspace(state, {
    type: 'group-create',
    id: 'two',
    name: 'Two',
    color: '#222222',
  });
  state = reduceWorkspace(state, {
    type: 'group-move',
    id: 'two',
    before: 'one',
  });
  assert.deepEqual(
    state.groups.map((group) => group.id),
    ['two', 'one'],
  );
});
test('schema rejects unknown fields, duplicate ids, invalid destinations and unsafe colours', () => {
  for (const value of [
    { ...initialWorkspace, extra: true },
    { ...initialWorkspace, active: 'absent' },
    { ...initialWorkspace, tabs: [] },
    { ...initialWorkspace, dock: 'outside' },
    {
      ...initialWorkspace,
      groups: [{ id: 'g', name: 'G', color: 'url(example)', collapsed: false }],
    },
  ])
    assert.throws(() => validateWorkspace(value));
  assert.throws(() =>
    reduceWorkspace(initialWorkspace, {
      type: 'open',
      route: 'unknown',
      id: 'x',
    }),
  );
  assert.throws(() =>
    reduceWorkspace(initialWorkspace, {
      type: 'rename',
      id: 'home',
      title: '\u0000',
    }),
  );
});
test('concurrent persisted edits serialize without dropping another feature', async () => {
  await Promise.all([
    updateWorkspace({ type: 'open', route: 'settings', id: 'settings' }),
    updateWorkspace({ type: 'open', route: 'tools', id: 'tools' }),
  ]);
  const state = await readWorkspace();
  assert.equal(state.tabs.length, 3);
  assert.equal(state.revision, 2);
  assert.equal((await workspaceHistory()).entries.length, 2);
});
test('stale revisions abort state and history together', async () => {
  await updateWorkspace({ type: 'open', route: 'settings', id: 'settings' }, 0);
  await assert.rejects(
    updateWorkspace({ type: 'open', route: 'tools', id: 'tools' }, 0),
    /another page/,
  );
  const state = await readWorkspace();
  assert.equal(state.tabs.length, 2);
  assert.equal(state.revision, 1);
  assert.equal((await workspaceHistory()).entries.length, 1);
});
test('invalid edits leave both state and history unchanged', async () => {
  await updateWorkspace({ type: 'open', route: 'settings', id: 'settings' });
  await assert.rejects(
    updateWorkspace({
      type: 'group-create',
      id: 'g',
      name: '',
      color: '#123456',
    }),
  );
  assert.equal((await readWorkspace()).groups.length, 0);
  assert.equal((await workspaceHistory()).entries.length, 1);
});
test('no-op edits create no duplicate history and docking persists', async () => {
  await updateWorkspace({ type: 'dock', dock: 'right' });
  await updateWorkspace({ type: 'dock', dock: 'right' });
  assert.equal((await readWorkspace()).dock, 'right');
  const { entries: history } = await workspaceHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].before.dock, 'top');
  assert.equal(history[0].after.dock, 'right');
  assert.equal(history[0].action, 'dock');
});
test('history-specific rejection preserves the requested state change and reports the missing record', async () => {
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'history')
      throw new DOMException('Fixture quota limit', 'QuotaExceededError');
    return add.apply(this, args);
  };
  try {
    const result = await updateWorkspace({
      type: 'open',
      route: 'settings',
      id: 'settings',
    });
    assert.equal(result.historyRecorded, false);
    assert.equal(result.state.active, 'settings');
    assert.equal((await readWorkspace()).active, 'settings');
    assert.equal((await workspaceHistory()).entries.length, 0);
  } finally {
    IDBObjectStore.prototype.add = add;
  }
});
test('current-state rejection does not claim success or create orphan history', async () => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'state')
      throw new DOMException('Fixture quota limit', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try {
    await assert.rejects(
      updateWorkspace({ type: 'open', route: 'settings', id: 'settings' }),
    );
    assert.equal((await readWorkspace()).tabs.length, 1);
    assert.equal((await workspaceHistory()).entries.length, 0);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
});
test('one malformed history record is skipped without hiding valid revisions', async () => {
  await updateWorkspace({ type: 'dock', dock: 'right' });
  const db = await new Promise((resolve, reject) => {
    const query = indexedDB.open('harbour-workspace-v1', 1);
    query.onsuccess = () => resolve(query.result);
    query.onerror = () => reject(query.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore('history').add({
        id: 'damaged',
        at: new Date().toISOString(),
        action: 'dock',
        before: {},
        after: {},
      });
    });
  } finally {
    db.close();
  }
  const result = await workspaceHistory();
  assert.equal(result.entries.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.entries[0].action, 'dock');
});
