import {
  initialWorkspace,
  reduceWorkspace,
  validateWorkspace,
  type Workspace,
  type WorkspaceAction,
} from './workspace.ts';
export type WorkspaceRevision = {
  id: string;
  at: string;
  action: WorkspaceAction['type'];
  before: Workspace;
  after: Workspace;
};
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    throw Error('Browser storage is unavailable.');
  return new Promise((resolve, reject) => {
    const operation = indexedDB.open('harbour-workspace-v1', 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(
        Error(
          'Workspace storage did not open. Close other portfolio pages and retry.',
        ),
      );
    }, 5000);
    operation.onupgradeneeded = () => {
      const db = operation.result;
      db.createObjectStore('state');
      const history = db.createObjectStore('history', { keyPath: 'id' });
      history.createIndex('at', 'at');
    };
    operation.onsuccess = () => {
      clearTimeout(timeout);
      operation.result.onversionchange = () => operation.result.close();
      if (settled) operation.result.close();
      else {
        settled = true;
        resolve(operation.result);
      }
    };
    operation.onerror = () => {
      clearTimeout(timeout);
      settled = true;
      reject(Error('Workspace storage is unavailable.'));
    };
    operation.onblocked = () => {
      clearTimeout(timeout);
      settled = true;
      reject(
        Error('Close other portfolio pages to finish the storage upgrade.'),
      );
    };
  });
}
export async function readWorkspace(): Promise<Workspace> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const query = db
        .transaction('state', 'readonly')
        .objectStore('state')
        .get('current');
      query.onerror = () => reject(Error('Unable to read workspace.'));
      query.onsuccess = () => {
        try {
          resolve(validateWorkspace(query.result ?? initialWorkspace));
        } catch {
          reject(
            Error(
              'Stored workspace is invalid. Existing data has been retained.',
            ),
          );
        }
      };
    });
  } finally {
    db.close();
  }
}
class HistoryWriteFailure extends Error {}
export type WorkspaceUpdate = { state: Workspace; historyRecorded: boolean };
async function commitWorkspace(
  action: WorkspaceAction,
  expectedRevision: number | undefined,
  withHistory: boolean,
): Promise<Workspace> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        withHistory ? ['state', 'history'] : ['state'],
        'readwrite',
      );
      let result: Workspace | undefined;
      let failure = 'Workspace update could not be saved.';
      let historyFailed = false;
      tx.oncomplete = () => (result ? resolve(result) : reject(Error(failure)));
      tx.onabort = () =>
        reject(historyFailed ? new HistoryWriteFailure() : Error(failure));
      tx.onerror = (event) => {
        const operation = event.target as IDBRequest;
        if (
          operation.source instanceof IDBObjectStore &&
          operation.source.name === 'history'
        )
          historyFailed = true;
      };
      const query = tx.objectStore('state').get('current');
      query.onsuccess = () => {
        try {
          const previous = validateWorkspace(query.result ?? initialWorkspace);
          if (
            expectedRevision !== undefined &&
            previous.revision !== expectedRevision
          )
            throw Error(
              'The workspace changed in another page. Finish or cancel the current draft, then refresh the workspace before trying again.',
            );
          result = reduceWorkspace(previous, action);
          if (result.revision === previous.revision) return;
          tx.objectStore('state').put(result, 'current');
          if (withHistory) {
            try {
              const record = tx
                .objectStore('history')
                .add({
                  id: crypto.randomUUID(),
                  at: new Date().toISOString(),
                  action: action.type,
                  before: previous,
                  after: result,
                } satisfies WorkspaceRevision);
              record.onerror = () => {
                historyFailed = true;
              };
            } catch {
              historyFailed = true;
              tx.abort();
            }
          }
        } catch (error) {
          failure = error instanceof Error ? error.message : failure;
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}
export async function updateWorkspace(
  action: WorkspaceAction,
  expectedRevision?: number,
): Promise<WorkspaceUpdate> {
  try {
    return {
      state: await commitWorkspace(action, expectedRevision, true),
      historyRecorded: true,
    };
  } catch (error) {
    if (!(error instanceof HistoryWriteFailure)) throw error;
    return {
      state: await commitWorkspace(action, expectedRevision, false),
      historyRecorded: false,
    };
  }
}
function validRevision(value: unknown): WorkspaceRevision {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid history record.');
  const row = value as WorkspaceRevision;
  if (
    Object.keys(row).sort().join(',') !== 'action,after,at,before,id' ||
    typeof row.id !== 'string' ||
    row.id.length > 80 ||
    typeof row.at !== 'string' ||
    !Number.isFinite(Date.parse(row.at)) ||
    ![
      'open',
      'activate',
      'rename',
      'pin',
      'move',
      'close',
      'reopen',
      'group-create',
      'group-update',
      'group-move',
      'group-remove',
      'dock',
    ].includes(row.action)
  )
    throw Error('Invalid history fields.');
  const before = validateWorkspace(row.before),
    after = validateWorkspace(row.after);
  if (after.revision !== before.revision + 1)
    throw Error('Invalid history sequence.');
  return { id: row.id, at: row.at, action: row.action, before, after };
}
export async function workspaceHistory(
  limit = 50,
): Promise<{ entries: WorkspaceRevision[]; skipped: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw Error('Invalid history page limit.');
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const entries: WorkspaceRevision[] = [];
      let skipped = 0,
        scanned = 0;
      const query = db
        .transaction('history', 'readonly')
        .objectStore('history')
        .index('at')
        .openCursor(null, 'prev');
      query.onerror = () => reject(Error('Unable to read workspace history.'));
      query.onsuccess = () => {
        const cursor = query.result;
        if (!cursor || scanned === limit) {
          resolve({ entries, skipped });
          return;
        }
        scanned++;
        try {
          entries.push(validRevision(cursor.value));
        } catch {
          skipped++;
        }
        cursor.continue();
      };
    });
  } finally {
    db.close();
  }
}
