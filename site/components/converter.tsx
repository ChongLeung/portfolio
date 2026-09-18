'use client';
import { useEffect, useRef, useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { Button, Md } from './material';
import { SearchField } from './search-field';
import { adapters, conversionLimit, type AdapterId } from '../lib/conversion';

export default function Converter({
  t,
  onDraftChange,
}: {
  t: (en: string, yue?: string) => string;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const [adapterId, setAdapter] = useState<AdapterId>('json-format');
  const [matches, setMatches] = useState<string[]>(
    adapters.map((item) => item.id),
  );
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{
    url: string;
    size: number;
    name: string;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const reader = useRef<FileReader | null>(null);
  useEffect(() => {
    onDraftChange?.(!!file || !!result || busy);
    return () => onDraftChange?.(false);
  }, [file, result, busy, onDraftChange]);
  const adapter = adapters.find((item) => item.id === adapterId)!;
  const stop = () => {
    generation.current++;
    reader.current?.abort();
    reader.current = null;
    worker.current?.terminate();
    worker.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    setBusy(false);
  };
  const clearResult = () => {
    setResult((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
  };
  useEffect(
    () => () => {
      generation.current++;
      reader.current?.abort();
      worker.current?.terminate();
      if (deadline.current) clearTimeout(deadline.current);
    },
    [],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  const convert = async () => {
    if (busy || worker.current || !file) return;
    setBusy(true);
    setMessage('');
    clearResult();
    const current = ++generation.current;
    deadline.current = setTimeout(() => {
      stop();
      setMessage(
        t(
          'Conversion stopped after 15 seconds. The source file is unchanged.',
          '轉換在 15 秒後停止，原有檔案保持不變。',
        ),
      );
    }, 15000);
    try {
      if (file.size > conversionLimit)
        throw Error(
          t('Choose a file smaller than 25 MiB.', '請選擇小於 25 MiB 的檔案。'),
        );
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const input = new FileReader();
        reader.current = input;
        input.onload = () => resolve(input.result as ArrayBuffer);
        input.onerror = () =>
          reject(Error('The source file could not be read.'));
        input.onabort = () => reject(Error('Reading was cancelled.'));
        input.readAsArrayBuffer(file);
      });
      if (current !== generation.current) return;
      const instance = new Worker(
        new URL('../workers/converter.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = instance;
      instance.onmessage = ({ data }) => {
        if (current !== generation.current) return;
        stop();
        if (!data.ok) {
          setMessage(data.message);
          return;
        }
        const output = new Uint8Array(data.bytes);
        const url = URL.createObjectURL(
          new Blob([output], { type: adapter.mime }),
        );
        setResult({
          url,
          size: output.length,
          name: `converted.${adapter.extension}`,
        });
        setMessage(
          t(
            'Conversion complete. Your source file is unchanged.',
            '轉換完成，原有檔案保持不變。',
          ),
        );
      };
      instance.onerror = () => {
        if (current === generation.current) {
          stop();
          setMessage(
            t(
              'The conversion worker could not finish. Your source file is unchanged.',
              '轉換工具未能完成，原有檔案保持不變。',
            ),
          );
        }
      };
      instance.postMessage({ bytes, adapter: adapterId, pages }, [bytes]);
    } catch (error) {
      if (current === generation.current) {
        stop();
        setMessage(
          error instanceof Error
            ? error.message
            : t('Unable to read this file.', '未能讀取檔案。'),
        );
      }
    }
  };
  return (
    <div className="converter-layout">
      <section className="settings-card">
        <h2>{t('Local file conversion', '本機檔案轉換')}</h2>
        <p>
          {t(
            'Files stay in this browser. Choose an adapter, review its limits, then convert a local file.',
            '檔案留在這個瀏覽器。選擇轉換工具、查看限制，再轉換本機檔案。',
          )}
        </p>
        <SearchField
          id="converter-catalog-search"
          label={t('Search adapters', '搜尋轉換工具')}
          records={adapters.map((item) => ({
            id: item.id,
            text: `${item.name} ${item.category} ${item.note}`,
          }))}
          onResults={setMatches}
          t={t}
        />
        {Array.from(new Set(adapters.map((item) => item.category))).map(
          (category) => (
            <section className="adapter-category" key={category}>
              <h3>{category}</h3>
              <div className="adapter-list">
                {adapters
                  .filter(
                    (item) =>
                      item.category === category && matches.includes(item.id),
                  )
                  .map((item) => (
                    <Button
                      key={item.id}
                      variant={item.id === adapterId ? 'filled' : 'outlined'}
                      disabled={busy}
                      aria-pressed={item.id === adapterId}
                      onClick={() => {
                        clearResult();
                        setMessage('');
                        setAdapter(item.id);
                      }}
                    >
                      {item.name}
                    </Button>
                  ))}
              </div>
            </section>
          ),
        )}
        {!matches.length && (
          <p>{t('No adapters match this search.', '未有符合的轉換工具。')}</p>
        )}
        <section className="adapter-category">
          <h3>{t('Unavailable formats', '未提供格式')}</h3>
          <p>
            {t(
              'Image, audio, video, 7z, office-document and code-language conversions require additional bundled adapters. They are not enabled in this build.',
              '圖片、音訊、影片、7z、辦公文件及程式語言轉換需要額外內置工具，本版本尚未啟用。',
            )}
          </p>
        </section>
      </section>
      <section className="settings-card conversion-work">
        <h2>{adapter.name}</h2>
        <p>{adapter.note}</p>
        <p className="muted">
          {t(
            'The worker limits processing time, not peak memory. PDF parser-memory isolation and complete operation-specific validation remain unfinished. Use only files you trust in this development build.',
            '獨立工具限制處理時間，但不保證記憶體用量上限。PDF 記憶體隔離及完整操作驗證尚未完成。這個開發版本只應使用可信檔案。',
          )}
        </p>
        <p className="muted">
          {t(
            'Limits: 25 MiB input, 50 MiB output, 500 PDF pages, 15 seconds. Single-file conversion; batch recovery is not implemented yet.',
            '限制：輸入 25 MiB、輸出 50 MiB、PDF 500 頁、15 秒。現時逐個檔案轉換，批次復原尚未提供。',
          )}
        </p>
        <label className="file-control">
          <span>{t('Source file', '原有檔案')}</span>
          <input
            type="file"
            disabled={busy}
            accept={
              adapter.source === 'pdf'
                ? '.pdf,application/pdf'
                : adapter.source === 'json'
                  ? '.json,application/json'
                  : '.txt,text/plain'
            }
            onChange={(e) => {
              clearResult();
              setMessage('');
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        {adapter.source === 'pdf' &&
          ['pdf-extract', 'pdf-rotate'].includes(adapterId) && (
            <Md
              tag="md-outlined-text-field"
              label={t('Pages, in output order', '頁碼，按輸出次序')}
              supportingText={t(
                'Blank means all pages. Example: 1, 3-5',
                '留空即全部頁數，例如：1, 3-5',
              )}
              value={pages}
              disabled={busy}
              onInput={(e: Event) =>
                setPages((e.target as HTMLInputElement).value)
              }
            />
          )}
        <div className="dialog-actions">
          <Button variant="filled" disabled={!file || busy} onClick={convert}>
            {t('Convert locally', '在本機轉換')}
          </Button>
          {busy && (
            <Button
              variant="outlined"
              onClick={() => {
                stop();
                setMessage(
                  t(
                    'Conversion cancelled. Your source file is unchanged.',
                    '已取消轉換，原有檔案保持不變。',
                  ),
                );
              }}
            >
              <X size={16} />
              {t('Cancel', '取消')}
            </Button>
          )}
        </div>
        {busy && (
          <div role="status">
            <Md tag="md-linear-progress" indeterminate />
            <p>
              {t(
                'Converting. Exact completion percentage is unavailable.',
                '轉換中，未能提供確實完成百分比。',
              )}
            </p>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {result && (
          <div className="conversion-result">
            <p>
              {t('Generated output', '已產生輸出')} ·{' '}
              {result.size.toLocaleString()} bytes
            </p>
            <Button variant="filled" href={result.url} download={result.name}>
              <FileDown size={18} />
              {t('Download result', '下載結果')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
