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
  type TotpConfig,
} from '../lib/authenticator';

export default function Authenticator({
  t,
}: {
  t: (en: string, yue?: string) => string;
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
  useEffect(() => {
    alive.current = true;
    readTotp()
      .then((items) => {
        if (alive.current) setEntries(items);
      })
      .catch(() => {
        if (alive.current)
          setMessage(
            t(
              'The local authenticator store could not be opened. Existing data has not been changed.',
              '未能開啟本機驗證器儲存空間，原有資料保持不變。',
            ),
          );
      });
    return () => {
      alive.current = false;
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
    if (qr && candidate && canvas.current)
      QRCode.toCanvas(canvas.current, pairingUri(candidate), {
        width: 256,
        margin: 4,
        errorCorrectionLevel: 'M',
      }).catch(() =>
        setMessage(t('The QR code could not be drawn.', '未能繪製 QR 碼。')),
      );
  }, [qr, candidate]);
  const review = () => {
    try {
      setCandidate(parseTotpUri(uri));
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
      const valid = await Promise.all(
        [-1, 0, 1].map((step) =>
          totp(candidate, Math.max(0, now + step * candidate.period * 1000)),
        ),
      );
      if (!valid.includes(code)) {
        setMessage(
          t(
            'That code did not match. Check your clock and try the current code.',
            '驗證碼不符，請檢查時鐘後輸入目前的驗證碼。',
          ),
        );
        return;
      }
      await saveTotp(candidate);
      const stored = await readTotp();
      if (!alive.current) return;
      setEntries(stored);
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
    } catch {
      if (alive.current)
        setMessage(
          t(
            'The entry could not be saved. No success is assumed.',
            '未能儲存項目，請勿當作已完成。',
          ),
        );
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
