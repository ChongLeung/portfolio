'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Md } from './material';
export function Confirmation({
  title,
  detail,
  onConfirm,
  onCancel,
  t,
  returnFocus,
}: {
  title: string;
  detail: string;
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
  t: (en: string, yue?: string) => string;
  returnFocus?: HTMLElement | null;
}) {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const visitedStart = useRef(true);
  useEffect(
    () => () => {
      queueMicrotask(() => {
        if (
          [...document.querySelectorAll('md-dialog')].some(
            (element) => (element as HTMLElement & { open: boolean }).open,
          )
        )
          return;
        const origin = returnFocus?.isConnected
          ? returnFocus
          : document.querySelector<HTMLElement>(
              '.workspace-toolbar md-text-button',
            );
        origin?.focus();
      });
    },
    [returnFocus],
  );
  const confirm = async () => {
    if (
      submitting.current ||
      !first ||
      !second ||
      !visitedStart.current ||
      progress !== 100
    )
      return;
    submitting.current = true;
    setBusy(true);
    try {
      if (!(await onConfirm())) {
        setFailed(true);
        setProgress(0);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Md
      tag="md-dialog"
      open
      quick
      oncancel={(event: Event) => {
        event.preventDefault();
        if (!submitting.current) onCancel();
      }}
      aria-label={title}
    >
      <div slot="headline">{title}</div>
      <div slot="content" className="confirmation-content">
        <p>{detail}</p>
        <label className="setting-row">
          <span>
            {t('I have reviewed the affected items.', '我已檢視受影響的項目。')}
          </span>
          <Md
            tag="md-checkbox"
            checked={first}
            disabled={busy}
            aria-label={t('Reviewed affected items', '已檢視受影響項目')}
            onChange={(event: Event) => {
              setFirst((event.target as HTMLInputElement).checked);
              setProgress(0);
              visitedStart.current = true;
            }}
          />
        </label>
        <label className="setting-row">
          <span>{t('I want to apply this change.', '我要套用這項改動。')}</span>
          <Md
            tag="md-checkbox"
            checked={second}
            disabled={busy}
            aria-label={t('Apply this change', '套用這項改動')}
            onChange={(event: Event) => {
              setSecond((event.target as HTMLInputElement).checked);
              setProgress(0);
              visitedStart.current = true;
            }}
          />
        </label>
        <label className="confirmation-slider">
          {t('Move from 0 to 100 to confirm', '由 0 移至 100 確認')}
          <Md
            tag="md-slider"
            min="0"
            max="100"
            step="1"
            value={progress}
            disabled={!first || !second || busy}
            aria-label={t('Confirmation progress', '確認進度')}
            onInput={(event: Event) => {
              const value = Number((event.target as HTMLInputElement).value);
              if (value === 0) visitedStart.current = true;
              setProgress(value);
            }}
          />
        </label>
        <p role="status">
          {busy
            ? t('Saving the change.', '正在儲存改動。')
            : failed
              ? t(
                  'The change was not saved. Review the notification and try again.',
                  '改動未能儲存，請查看通知後再試。',
                )
              : progress === 100
                ? t(
                    'Confirmation complete. Apply when ready.',
                    '確認完成，準備好便可套用。',
                  )
                : t(
                    'You can cancel without changing anything.',
                    '你可以取消，現有資料不會改動。',
                  )}
        </p>
      </div>
      <div slot="actions" className="dialog-actions">
        <Button variant="text" disabled={busy} onClick={onCancel}>
          {t('Emergency exit', '立即退出')}
        </Button>
        <Button
          variant="filled"
          disabled={!first || !second || progress !== 100 || busy}
          onClick={confirm}
        >
          {t('Apply change', '套用改動')}
        </Button>
      </div>
    </Md>
  );
}
