'use client';
import { useEffect, useRef, useState } from 'react';
import { Code2, Search, X } from 'lucide-react';
import { Button, Md } from './material';

export type SearchRecord = { id: string; text: string };
export function SearchField({
  id,
  label,
  records,
  onResults,
  t,
}: {
  id: string;
  label: string;
  records: SearchRecord[];
  onResults: (ids: string[]) => void;
  t: (en: string, yue?: string) => string;
}) {
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [flags, setFlags] = useState('iu');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [matchCount, setMatchCount] = useState(records.length);
  const [matches, setMatches] = useState<unknown[]>([]);
  const callback = useRef(onResults);
  callback.current = onResults;
  const serialized = JSON.stringify(records);
  useEffect(() => {
    if (!query) {
      callback.current(
        JSON.parse(serialized).map((item: SearchRecord) => item.id),
      );
      setError('');
      setMatchCount(JSON.parse(serialized).length);
      setElapsed(null);
      setMatches([]);
      return;
    }
    const worker = new Worker('/search-worker.js');
    let done = false;
    const timeout = setTimeout(() => {
      done = true;
      worker.terminate();
      setError(
        t(
          'Search stopped after 250 ms. Simplify the expression.',
          '搜尋在 250 毫秒後停止，請簡化規則。',
        ),
      );
      callback.current([]);
    }, 250);
    worker.onmessage = ({ data }) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      worker.terminate();
      if (!data.ok) {
        setError(data.error);
        callback.current([]);
      } else {
        setError('');
        setElapsed(data.elapsedMs);
        setMatches(data.matches);
        setMatchCount(data.ids.length);
        callback.current(data.ids);
      }
    };
    worker.onerror = () => {
      done = true;
      clearTimeout(timeout);
      worker.terminate();
      setError(
        t(
          'Search worker unavailable. Clear the query to show all records.',
          '搜尋工具未能啟動，清除字句可顯示全部紀錄。',
        ),
      );
      callback.current([]);
    };
    worker.postMessage({ query, regex, flags, items: JSON.parse(serialized) });
    return () => {
      done = true;
      clearTimeout(timeout);
      worker.terminate();
    };
  }, [query, regex, flags, serialized]);
  return (
    <div className="search-owner">
      <div className="search-field">
        <Md
          tag="md-outlined-text-field"
          id={id}
          label={label}
          value={query}
          error={!!error}
          supportingText={
            error || (query ? `${matchCount} ${t('matches', '項符合')}` : '')
          }
          aria-describedby={error ? `${id}-error` : undefined}
          onInput={(event: Event) =>
            setQuery((event.target as HTMLInputElement).value)
          }
        >
          <Search slot="leading-icon" size={18} aria-hidden="true" />
        </Md>
        <Button
          variant={regex ? 'filled' : 'outlined'}
          aria-label={t(`${label}: regex builder`, `${label}：正則表達式工具`)}
          aria-expanded={open}
          aria-controls={`${id}-builder`}
          onClick={() => setOpen((value) => !value)}
        >
          <Code2 size={18} aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" id={`${id}-error`} className="search-error">
          {error}
        </p>
      )}
      {open && (
        <section
          id={`${id}-builder`}
          className="regex-builder"
          aria-label={t('Regular expression workbench', '正則表達式工具')}
        >
          <div className="panel-heading">
            <h3>{t('Search workbench', '搜尋工具')}</h3>
            <Button
              variant="text"
              aria-label={t('Close search workbench', '關閉搜尋工具')}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </Button>
          </div>
          <label className="setting-row">
            <span>{t('Use a regular expression', '使用正則表達式')}</span>
            <Md
              tag="md-switch"
              selected={regex}
              aria-label={t('Use a regular expression', '使用正則表達式')}
              onChange={(e: Event) =>
                setRegex(
                  (e.target as HTMLInputElement & { selected: boolean })
                    .selected,
                )
              }
            />
          </label>
          <p>
            {t(
              'Plain text is the default. Patterns run in a terminable worker using this browser’s ECMAScript engine.',
              '預設為純文字搜尋。規則在可停止的獨立工具中，以瀏覽器的 ECMAScript 引擎執行。',
            )}
          </p>
          <Md
            tag="md-outlined-text-field"
            label={t('Pattern or plain text', '規則或純文字')}
            value={query}
            onInput={(e: Event) =>
              setQuery((e.target as HTMLInputElement).value)
            }
          />
          {regex && (
            <>
              <Md
                tag="md-outlined-text-field"
                label={t('Flags', '旗標')}
                supportingText="d g i m s u v y · u and v are mutually exclusive"
                value={flags}
                onInput={(e: Event) =>
                  setFlags((e.target as HTMLInputElement).value)
                }
              />
              <div className="regex-snippets">
                {[
                  ['^', 'Start', '開頭'],
                  ['$', 'End', '結尾'],
                  ['\\d+', 'Digits', '數字'],
                  ['\\s+', 'Whitespace', '空白'],
                  ['(?:)', 'Group', '群組'],
                  ['[a-z]+', 'Letters', '字母'],
                  ['|', 'Or', '或'],
                ].map(([value, en, yue]) => (
                  <Button
                    key={value}
                    variant="outlined"
                    onClick={() => setQuery((text) => text + value)}
                  >
                    {t(en, yue)} <code>{value}</code>
                  </Button>
                ))}
              </div>
              <p className="muted">
                {t(
                  'Nested repetitions can backtrack heavily. The worker is terminated after 250 ms. Match previews show the first match and its captured groups per record, including zero-width matches.',
                  '巢狀重複可能耗時。工具會在 250 毫秒後停止。每項紀錄顯示第一個符合結果及群組，包括零寬度結果。',
                )}
              </p>
            </>
          )}
          <p role="status">
            {query
              ? `${matchCount} ${t('matching records', '項符合紀錄')}${elapsed === null ? '' : ` · ${elapsed.toFixed(2)} ms`}`
              : t(
                  'An empty query shows all records.',
                  '空白搜尋會顯示全部紀錄。',
                )}
          </p>
          {!!matches.length && (
            <pre
              className="regex-results"
              tabIndex={0}
              aria-label={t('Match and capture preview', '符合結果及群組預覽')}
            >
              {JSON.stringify(matches, null, 2)}
            </pre>
          )}
          <div className="dialog-actions">
            <Button
              variant="text"
              onClick={() => {
                setQuery('');
                setRegex(false);
                setFlags('iu');
              }}
            >
              {t('Reset search', '重設搜尋')}
            </Button>
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify({ schemaVersion: 1, query, regex, flags }),
                  );
                } catch {
                  setError(
                    t(
                      'Clipboard unavailable. Select and copy the pattern field.',
                      '未能使用剪貼簿，請選取並複製規則欄位。',
                    ),
                  );
                }
              }}
            >
              {t('Copy search recipe', '複製搜尋設定')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
