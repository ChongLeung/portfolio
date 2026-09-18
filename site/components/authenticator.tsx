'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Shield, X } from 'lucide-react';
import { Button, Md } from './material';
import { SearchField } from './search-field';
import {
  pairingUri,
  parseTotpUri,
  readTotp,
  saveTotp,
  totp,
  VaultError,
  type TotpConfig,
} from '../lib/authenticator';

export default function Authenticator({
  t,
  onDraftChange,
}: {
  t: (en: string, yue?: string) => string;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const [entries, setEntries] = useState<{ id: string; config: TotpConfig }[]>(
    [],
  );
  const [matches, setMatches] = useState<string[]>([]);
  const [uri, setUri] = useState('');
  const [candidate, setCandidate] = useState<TotpConfig | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [qr, setQr] = useState(false);
  const [codes, setCodes] = useState<
    Record<string, { current: string; next: string; remaining: number }>
  >({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  const saving = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [corruptCount, setCorruptCount] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const loadGeneration = useRef(0);
  const qrGeneration = useRef(0);
  const candidateId = useRef<string | undefined>(undefined);
  useEffect(() => {
    onDraftChange?.(!!uri || busy);
    return () => onDraftChange?.(false);
  }, [uri, busy, onDraftChange]);
  const describeVaultError = (error: unknown) => {
    const code = error instanceof VaultError ? error.code : 'UNAVAILABLE';
    if (code === 'KEY_MISSING')
      return t(
        'The encryption key is missing while encrypted entries remain. No replacement key was created. Restore this browser profile from a backup before saving new entries.',
        '加密項目仍然存在，但金鑰遺失。沒有建立替代金鑰，請先從備份還原這個瀏覽器設定檔，再儲存新項目。',
      );
    if (code === 'KEY_INVALID')
      return t(
        'The stored encryption key is invalid. Existing entries were retained. Restore the browser profile from a known backup.',
        '已儲存的加密金鑰無效，原有項目已保留。請從已知備份還原瀏覽器設定檔。',
      );
    if (code === 'UPGRADE_BLOCKED')
      return t(
        'Another page is blocking a storage upgrade. Close other pages for this portfolio and retry.',
        '另一個頁面阻止儲存空間升級，請關閉這個作品集的其他頁面後再試。',
      );
    return t(
      'Local storage is unavailable or refused the operation. Check browser storage permissions and free space, then retry. Existing entries were retained.',
      '本機儲存空間未能使用或拒絕操作。請檢查瀏覽器權限及可用空間後再試，原有項目已保留。',
    );
  };
  const loadPage = async (after?: string, signal?: AbortSignal) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const page = await readTotp({ after, signal });
      if (
        !alive.current ||
        signal?.aborted ||
        generation !== loadGeneration.current
      )
        return false;
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
      setCorruptCount(page.corruptCount);
      setCodes({});
      setLoadError('');
      return true;
    } catch (error) {
      if (
        alive.current &&
        !signal?.aborted &&
        generation === loadGeneration.current
      )
        setLoadError(describeVaultError(error));
      return false;
    } finally {
      if (alive.current && generation === loadGeneration.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    loadPage(undefined, controller.signal);
    return () => {
      alive.current = false;
      controller.abort();
      loadGeneration.current++;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (running || !visible) return;
      running = true;
      try {
        const now = Date.now();
        const values: Record<
          string,
          { current: string; next: string; remaining: number }
        > = {};
        for (const entry of entries)
          values[entry.id] = {
            current: await totp(entry.config, now),
            next: await totp(entry.config, now + entry.config.period * 1000),
            remaining:
              entry.config.period -
              (Math.floor(now / 1000) % entry.config.period),
          };
        if (!cancelled) setCodes(values);
      } catch {
        if (!cancelled)
          setMessage(
            t(
              'A code could not be generated. Check the local clock and stored entry.',
              '未能產生驗證碼，請檢查本機時鐘及儲存項目。',
            ),
          );
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [entries, visible]);
  useEffect(() => {
    const generation = ++qrGeneration.current;
    const display = canvas.current;
    if (!qr || !candidate || !display) return;
    const staging = document.createElement('canvas');
    QRCode.toCanvas(staging, pairingUri(candidate), {
      width: 256,
      margin: 4,
      errorCorrectionLevel: 'M',
    })
      .then(() => {
        if (generation !== qrGeneration.current || !alive.current) return;
        display.width = staging.width;
        display.height = staging.height;
        display.getContext('2d')?.drawImage(staging, 0, 0);
      })
      .catch(() => {
        if (generation === qrGeneration.current && alive.current)
          setMessage(t('The QR code could not be drawn.', '未能繪製 QR 碼。'));
      })
      .finally(() => {
        staging.width = 0;
        staging.height = 0;
      });
    return () => {
      qrGeneration.current++;
      display.width = 0;
      display.height = 0;
      staging.width = 0;
      staging.height = 0;
    };
  }, [qr, candidate]);
  const review = () => {
    try {
      setCandidate(parseTotpUri(uri));
      candidateId.current = crypto.randomUUID();
      setMessage('');
      setCode('');
      setQr(false);
    } catch {
      setMessage(
        t(
          'Invalid or unsupported TOTP pairing URI. No entry was saved.',
          'TOTP 配對 URI 無效或未受支援，沒有儲存項目。',
        ),
      );
    }
  };
  const save = async () => {
    if (!candidate || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      if (!new RegExp(`^\\d{${candidate.digits}}$`).test(code)) throw Error();
      const now = Date.now();
      const valid = await totp(candidate, now);
      if (valid !== code) {
        setMessage(
          t(
            'That code did not match. Check your clock and try the current code.',
            '驗證碼不符，請檢查時鐘後輸入目前的驗證碼。',
          ),
        );
        return;
      }
      await saveTotp(candidate, candidateId.current);
      if (!alive.current) return;
      setCandidate(null);
      setUri('');
      setCode('');
      setQr(false);
      setMessage(
        t(
          'Entry saved locally after code confirmation.',
          '驗證碼確認後，項目已儲存在本機。',
        ),
      );
      const refreshed = await loadPage();
      if (!refreshed && alive.current)
        setMessage(
          t(
            'The entry was saved, but the account list could not be refreshed. Use Retry loading; do not pair the same entry again.',
            '項目已儲存，但未能更新帳戶清單。請使用重新載入，毋須再次配對同一項目。',
          ),
        );
    } catch (error) {
      if (alive.current) setMessage(describeVaultError(error));
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="auth-layout">
      <section className="settings-card">
        <Shield size={28} aria-hidden="true" />
        <h2>{t('Local authenticator', '本機驗證器')}</h2>
        {loadError && (
          <div role="alert">
            <p>{loadError}</p>
            <Button
              variant="outlined"
              disabled={loading || busy}
              onClick={() => loadPage()}
            >
              {t('Retry loading', '重新載入')}
            </Button>
          </div>
        )}
        {corruptCount > 0 && (
          <p role="status">
            {t(
              `${corruptCount} damaged entries were skipped on this page. Healthy entries remain available. Restore the browser profile from a backup to recover damaged data.`,
              `這一頁略過了 ${corruptCount} 個損毀項目，正常項目仍可使用。如需復原損毀資料，請從備份還原瀏覽器設定檔。`,
            )}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            variant="text"
            disabled={loading || busy}
            onClick={() => loadPage()}
          >
            {t('First page / refresh', '第一頁／更新')}
          </Button>
          {nextCursor && (
            <Button
              variant="outlined"
              disabled={loading || busy}
              onClick={() => loadPage(nextCursor)}
            >
              {t('Next 50 entries', '之後 50 個項目')}
            </Button>
          )}
        </div>
        <p>
          {t(
            'Entries are encrypted in this browser with a non-exportable local key. This is browser storage, not an operating-system vault; code running in this origin can use the key. Clearing browser data removes entries and the key.',
            '項目以不能匯出的本機金鑰加密，儲存在這個瀏覽器。這是瀏覽器儲存空間，並非作業系統保管庫；同一來源執行的程式可使用金鑰。清除瀏覽器資料會移除項目及金鑰。',
          )}
        </p>
        <p className="muted">
          {t(
            'No account, synchronization or network call is used for pairing or code generation. Clock skew cannot be measured offline; codes rely on your device clock.',
            '配對及產生驗證碼不需要帳戶、同步或網絡連線。離線時未能量度時鐘偏差，驗證碼依賴裝置時鐘。',
          )}
        </p>
        <SearchField
          id="authenticator-search"
          label={t('Find an account', '搜尋帳戶')}
          records={entries.map((entry) => ({
            id: entry.id,
            text: `${entry.config.issuer} ${entry.config.account}`,
          }))}
          onResults={setMatches}
          t={t}
        />
        <label className="setting-row">
          <span>{t('Show current codes', '顯示目前驗證碼')}</span>
          <Md
            tag="md-switch"
            selected={visible}
            aria-label={t('Show current codes', '顯示目前驗證碼')}
            onChange={(e: Event) => {
              const selected = (
                e.target as HTMLInputElement & { selected: boolean }
              ).selected;
              setVisible(selected);
              if (!selected) setCodes({});
            }}
          />
        </label>
        {!entries.length && (
          <p className="empty-state">
            {t(
              'No entries saved. Pair one using its standard TOTP URI.',
              '尚未儲存項目，可使用標準 TOTP URI 配對。',
            )}
          </p>
        )}
        {!!entries.length && !matches.length && (
          <p>{t('No accounts match this search.', '未有符合搜尋的帳戶。')}</p>
        )}
        {entries
          .filter((entry) => matches.includes(entry.id))
          .map((entry) => (
            <article className="auth-entry" key={entry.id}>
              <h3>{entry.config.issuer || t('Account', '帳戶')}</h3>
              <p>{entry.config.account}</p>
              {visible && codes[entry.id] ? (
                <>
                  <p
                    className="auth-code"
                    aria-label={t('Current code', '目前驗證碼')}
                  >
                    {codes[entry.id].current.replace(/(.{3,4})(?=.)/, '$1 ')}
                  </p>
                  <p>
                    {codes[entry.id].remaining}{' '}
                    {t('seconds remaining', '秒後更新')}
                  </p>
                  <Button
                    variant="outlined"
                    aria-label={t('Copy current code', '複製目前驗證碼')}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          await totp(entry.config),
                        );
                        setMessage(
                          t(
                            'Current code copied. Clear the clipboard when finished.',
                            '已複製目前驗證碼，用完後請清除剪貼簿。',
                          ),
                        );
                      } catch {
                        setMessage(
                          t('Clipboard unavailable.', '未能使用剪貼簿。'),
                        );
                      }
                    }}
                  >
                    <Copy size={16} />
                    {t('Copy code', '複製驗證碼')}
                  </Button>
                  <details>
                    <summary>
                      {t('Peek at next code', '查看下一個驗證碼')}
                    </summary>
                    <p className="auth-code">{codes[entry.id].next}</p>
                  </details>
                </>
              ) : (
                <p>{t('Codes are hidden.', '驗證碼已隱藏。')}</p>
              )}
            </article>
          ))}
      </section>
      <section className="settings-card">
        <h2>{t('Pair an entry', '配對項目')}</h2>
        <Md
          tag="md-outlined-text-field"
          type="password"
          autocomplete="off"
          label={t('TOTP pairing URI', 'TOTP 配對 URI')}
          value={uri}
          disabled={busy}
          onInput={(e: Event) => {
            setUri((e.target as HTMLInputElement).value);
            setCandidate(null);
            setQr(false);
            setCode('');
          }}
        />
        <p className="muted">
          {t(
            'The URI is handled locally and is never included in history or exports. Manual secrets and QR scanning are not implemented yet.',
            'URI 只在本機處理，不會包含在歷程或匯出。手動金鑰及 QR 掃描尚未提供。',
          )}
        </p>
        <Button variant="filled" disabled={!uri || busy} onClick={review}>
          {t('Review pairing', '檢視配對')}
        </Button>
        {candidate && (
          <div className="pairing-review">
            <h3>{candidate.issuer}</h3>
            <p>{candidate.account}</p>
            <p>
              {candidate.algorithm} · {candidate.digits} {t('digits', '位數')} ·{' '}
              {candidate.period}s
            </p>
            <Button variant="outlined" onClick={() => setQr((value) => !value)}>
              {t(
                qr ? 'Hide pairing QR' : 'Show local pairing QR',
                qr ? '隱藏配對 QR 碼' : '顯示本機配對 QR 碼',
              )}
            </Button>
            {qr && (
              <canvas
                ref={canvas}
                className="pairing-qr"
                role="img"
                aria-label={t(
                  'Private pairing QR code for this entry. Keep it out of recordings and shared images.',
                  '這個項目的私人配對 QR 碼，請勿放入錄影或分享圖片。',
                )}
              />
            )}
            <Md
              tag="md-outlined-text-field"
              label={t('Confirm a current code', '確認目前驗證碼')}
              value={code}
              inputMode="numeric"
              autocomplete="off"
              disabled={busy}
              onInput={(e: Event) =>
                setCode((e.target as HTMLInputElement).value)
              }
            />
            <div className="dialog-actions">
              <Button
                variant="text"
                disabled={busy}
                onClick={() => {
                  setCandidate(null);
                  setUri('');
                  setCode('');
                  setQr(false);
                }}
              >
                {t('Cancel pairing', '取消配對')}
              </Button>
              <Button variant="filled" disabled={busy || !code} onClick={save}>
                {t('Confirm and save', '確認並儲存')}
              </Button>
            </div>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}
