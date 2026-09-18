export type TotpConfig = {
  issuer: string;
  account: string;
  secret: string;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
  digits: 6 | 8;
  period: number;
};
export function decodeBase32(value: string): Uint8Array {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  if (
    !/^[A-Z2-7]+={0,6}$/.test(normalized) ||
    (normalized.includes('=') && normalized.length % 8 !== 0)
  )
    throw Error('Invalid Base32 padding.');
  const text = normalized.replace(/=+$/, '');
  if (![0, 2, 4, 5, 7].includes(text.length % 8))
    throw Error('Invalid Base32 length.');
  if (!text.length || text.length > 1024 || !/^[A-Z2-7]+$/.test(text))
    throw Error('Use a valid Base32 secret.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let buffer = 0,
    bits = 0;
  for (const char of text) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  if (bits && buffer & ((1 << bits) - 1))
    throw Error('Invalid Base32 padding bits.');
  if (bytes.length < 10)
    throw Error('The secret must contain at least 80 bits.');
  return new Uint8Array(bytes);
}
export function parseTotpUri(text: string): TotpConfig {
  if (text.length > 4096) throw Error('The pairing URI is too long.');
  const url = new URL(text);
  if (
    url.protocol !== 'otpauth:' ||
    url.hostname !== 'totp' ||
    url.username ||
    url.password ||
    url.hash
  )
    throw Error('Only TOTP pairing URIs are supported.');
  const known = ['secret', 'issuer', 'algorithm', 'digits', 'period'];
  for (const key of url.searchParams.keys())
    if (!known.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw Error('Unsupported or duplicate pairing parameter.');
  const label = decodeURIComponent(url.pathname.slice(1));
  const separator = label.indexOf(':');
  const issuer =
    url.searchParams.get('issuer') ??
    (separator < 0 ? '' : label.slice(0, separator));
  const account = separator < 0 ? label : label.slice(separator + 1);
  const algorithm = (url.searchParams.get('algorithm') || 'SHA1')
    .toUpperCase()
    .replace('-', '');
  const digits = Number(url.searchParams.get('digits') || 6);
  const period = Number(url.searchParams.get('period') || 30);
  const secret = url.searchParams.get('secret') || '';
  decodeBase32(secret);
  if (
    !account ||
    account.length > 160 ||
    issuer.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(account + issuer)
  )
    throw Error('Invalid account label.');
  if (
    !['SHA1', 'SHA256', 'SHA512'].includes(algorithm) ||
    ![6, 8].includes(digits) ||
    !Number.isInteger(period) ||
    period < 15 ||
    period > 120
  )
    throw Error('Unsupported TOTP parameters.');
  if (
    separator >= 0 &&
    url.searchParams.has('issuer') &&
    issuer !== label.slice(0, separator)
  )
    throw Error('The issuer label and issuer parameter disagree.');
  return {
    issuer,
    account,
    secret,
    algorithm: algorithm.replace('SHA', 'SHA-') as TotpConfig['algorithm'],
    digits: digits as 6 | 8,
    period,
  };
}
export async function totp(
  config: TotpConfig,
  timeMs = Date.now(),
): Promise<string> {
  const secret = decodeBase32(config.secret);
  if (!Number.isFinite(timeMs) || timeMs < 0) throw Error('Invalid time.');
  if (
    ![6, 8].includes(config.digits) ||
    !Number.isInteger(config.period) ||
    config.period < 15 ||
    config.period > 120 ||
    !['SHA-1', 'SHA-256', 'SHA-512'].includes(config.algorithm)
  )
    throw Error('Invalid TOTP parameters.');
  const counter = BigInt(Math.floor(timeMs / 1000 / config.period));
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, counter);
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(secret).buffer,
    { name: 'HMAC', hash: config.algorithm },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, message),
  );
  const offset = signature[signature.length - 1] & 15;
  const number =
    ((signature[offset] & 127) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return String(number % 10 ** config.digits).padStart(config.digits, '0');
}
export function pairingUri(config: TotpConfig): string {
  decodeBase32(config.secret);
  const query = new URLSearchParams({
    secret: config.secret.toUpperCase().replace(/[\s=-]/g, ''),
    issuer: config.issuer,
    algorithm: config.algorithm.replace('-', ''),
    digits: String(config.digits),
    period: String(config.period),
  });
  return `otpauth://totp/${encodeURIComponent(`${config.issuer ? config.issuer + ':' : ''}${config.account}`)}?${query}`;
}

type SealedEntry = { id: string; iv: ArrayBuffer; ciphertext: ArrayBuffer };
export class VaultError extends Error {
  readonly code:
    | 'UNAVAILABLE'
    | 'UPGRADE_BLOCKED'
    | 'KEY_MISSING'
    | 'KEY_INVALID'
    | 'WRITE_FAILED'
    | 'ABORTED';
  constructor(code: VaultError['code']) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
  }
}
export type VaultPage = {
  entries: { id: string; config: TotpConfig }[];
  corruptCount: number;
  nextCursor: string | null;
};
const vaultName = 'harbour-authenticator-v1';
const entryLimit = 16 * 1024;
function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}
function completed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new VaultError('WRITE_FAILED'));
    tx.onerror = () => reject(new VaultError('WRITE_FAILED'));
  });
}
async function openVault(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new VaultError('UNAVAILABLE');
  return new Promise((resolve, reject) => {
    let finished = false;
    const operation = indexedDB.open(vaultName, 1);
    const timeout = setTimeout(() => {
      finished = true;
      reject(new VaultError('UPGRADE_BLOCKED'));
    }, 5000);
    operation.onupgradeneeded = () => {
      const db = operation.result;
      db.createObjectStore('keys');
      db.createObjectStore('entries', { keyPath: 'id' });
    };
    operation.onblocked = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(new VaultError('UPGRADE_BLOCKED'));
      }
    };
    operation.onerror = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(new VaultError('UNAVAILABLE'));
      }
    };
    operation.onsuccess = () => {
      clearTimeout(timeout);
      const db = operation.result;
      db.onversionchange = () => db.close();
      if (finished) {
        db.close();
        return;
      }
      finished = true;
      resolve(db);
    };
  });
}
function validKey(value: unknown): value is CryptoKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as CryptoKey;
  return (
    key.type === 'secret' &&
    key.extractable === false &&
    key.algorithm?.name === 'AES-GCM' &&
    (key.algorithm as AesKeyAlgorithm).length === 256 &&
    key.usages?.includes('encrypt') &&
    key.usages?.includes('decrypt')
  );
}
async function vaultKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await request(
    db.transaction('keys', 'readonly').objectStore('keys').get('key'),
  );
  if (existing !== undefined) {
    if (!validKey(existing)) throw new VaultError('KEY_INVALID');
    return existing;
  }
  const candidate = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return new Promise((resolve, reject) => {
    // Both stores share this transaction, so concurrent enrollment cannot create mixed-key records.
    const tx = db.transaction(['keys', 'entries'], 'readwrite');
    let selected = candidate;
    let failure: VaultError | null = null;
    tx.oncomplete = () => resolve(selected);
    tx.onabort = () => reject(failure ?? new VaultError('WRITE_FAILED'));
    tx.onerror = () => reject(failure ?? new VaultError('WRITE_FAILED'));
    const get = tx.objectStore('keys').get('key');
    get.onsuccess = () => {
      if (get.result !== undefined) {
        if (!validKey(get.result)) {
          failure = new VaultError('KEY_INVALID');
          tx.abort();
        } else selected = get.result;
        return;
      }
      const count = tx.objectStore('entries').count();
      count.onsuccess = () => {
        if (count.result !== 0) {
          failure = new VaultError('KEY_MISSING');
          tx.abort();
        } else tx.objectStore('keys').add(candidate, 'key');
      };
    };
  });
}
export async function saveTotp(
  config: TotpConfig,
  id = crypto.randomUUID(),
): Promise<string> {
  const validated = parseTotpUri(pairingUri(config));
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new VaultError('WRITE_FAILED');
  const db = await openVault();
  try {
    const key = await vaultKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(validated));
    if (data.length > entryLimit - 16) throw new VaultError('WRITE_FAILED');
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) },
      key,
      data,
    );
    const tx = db.transaction('entries', 'readwrite');
    const done = completed(tx);
    tx.objectStore('entries').add({
      id,
      iv: iv.buffer,
      ciphertext,
    } satisfies SealedEntry);
    await done;
    return id;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError('WRITE_FAILED');
  } finally {
    db.close();
  }
}
function sealedEntry(value: unknown): value is SealedEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as SealedEntry;
  return (
    typeof entry.id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(entry.id) &&
    entry.iv instanceof ArrayBuffer &&
    entry.iv.byteLength === 12 &&
    entry.ciphertext instanceof ArrayBuffer &&
    entry.ciphertext.byteLength >= 16 &&
    entry.ciphertext.byteLength <= entryLimit
  );
}
export async function readTotp({
  after,
  limit = 50,
  signal,
}: {
  after?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<VaultPage> {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (after !== undefined && !/^[a-f0-9-]{36}$/i.test(after))
  )
    throw new VaultError('UNAVAILABLE');
  if (signal?.aborted) throw new VaultError('ABORTED');
  const db = await openVault();
  try {
    const key = await vaultKey(db);
    const tx = db.transaction('entries', 'readonly');
    const page = await new Promise<{
      records: unknown[];
      nextCursor: string | null;
    }>((resolve, reject) => {
      const records: unknown[] = [];
      let lastKey: string | null = null;
      const query = tx
        .objectStore('entries')
        .openCursor(
          after === undefined ? undefined : IDBKeyRange.lowerBound(after, true),
        );
      query.onerror = () => reject(new VaultError('UNAVAILABLE'));
      query.onsuccess = () => {
        if (signal?.aborted) {
          resolve({ records: [], nextCursor: null });
          return;
        }
        const cursor = query.result;
        if (!cursor) {
          resolve({ records, nextCursor: null });
          return;
        }
        if (records.length === limit) {
          resolve({ records, nextCursor: lastKey });
          return;
        }
        lastKey = String(cursor.key);
        records.push(cursor.value);
        cursor.continue();
      };
    });
    const entries: VaultPage['entries'] = [];
    let corruptCount = 0;
    for (const entry of page.records) {
      if (signal?.aborted) throw new VaultError('ABORTED');
      try {
        if (!sealedEntry(entry)) throw Error();
        const plaintext = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: entry.iv,
            additionalData: new TextEncoder().encode(entry.id),
          },
          key,
          entry.ciphertext,
        );
        if (plaintext.byteLength > entryLimit - 16) throw Error();
        const config = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
        );
        entries.push({
          id: entry.id,
          config: parseTotpUri(pairingUri(config)),
        });
      } catch {
        corruptCount++;
      }
    }
    if (signal?.aborted) throw new VaultError('ABORTED');
    return { entries, corruptCount, nextCursor: page.nextCursor };
  } finally {
    db.close();
  }
}
