'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initialWorkspace,
  pageRoutes,
  reduceWorkspace,
  type PageRoute,
  type WorkspaceAction,
} from '../lib/workspace';
import { readWorkspace, updateWorkspace } from '../lib/workspace-storage';

export function useWorkspace(notify: (text: string) => void) {
  const [state, setState] = useState(initialWorkspace);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [storageFailure, setStorageFailure] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [pending, setPending] = useState<WorkspaceAction | null>(null);
  const dirty = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const pendingResolver = useRef<((value: boolean) => void) | null>(null);
  const confirmationOrigin = useRef<HTMLElement | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    readWorkspace()
      .then((value) => {
        if (!cancelled) {
          setState((current) =>
            value.revision >= current.revision ? value : current,
          );
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStorageFailure(true);
          notify(
            'Workspace storage could not be loaded. Existing data has been retained.',
          );
        }
      });
    return () => {
      cancelled = true;
      alive.current = false;
      channel.current?.close();
      pendingResolver.current?.(false);
      pendingResolver.current = null;
    };
  }, [notify]);
  useEffect(() => {
    if (temporary || typeof BroadcastChannel === 'undefined') return;
    let cancelled = false;
    const connection = new BroadcastChannel('harbour-workspace-v1');
    channel.current = connection;
    connection.onmessage = () => {
      if (dirty.current.size) {
        notify(
          'Another page changed the workspace. Your draft is retained; finish or cancel it before refreshing.',
        );
        return;
      }
      readWorkspace()
        .then((value) => {
          if (!cancelled && !dirty.current.size)
            setState((current) =>
              value.revision > current.revision ? value : current,
            );
        })
        .catch(() => {
          if (!cancelled)
            notify(
              'Another page changed the workspace, but its state could not be read.',
            );
        });
    };
    return () => {
      cancelled = true;
      connection.close();
      if (channel.current === connection) channel.current = null;
    };
  }, [notify, temporary]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  const markDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
    setDirtyCount(dirty.current.size);
  }, []);
  const dispatch = useCallback(
    async (action: WorkspaceAction, confirmed = false) => {
      if (busyRef.current || !ready) return false;
      const current = stateRef.current;
      const active = current.tabs.find((tab) => tab.id === current.active)!;
      const leavesDraft =
        (action.type === 'open' && action.route !== active.route) ||
        (action.type === 'activate' && action.id !== active.id) ||
        action.type === 'reopen';
      if (!confirmed && pendingResolver.current) return false;
      if (
        !confirmed &&
        action.type === 'close' &&
        reduceWorkspace(current, action).tabs.length === current.tabs.length
      ) {
        notify(
          'No eligible tabs would close. Pinned or locked tabs and the final open tab are retained.',
        );
        return false;
      }
      if (
        !confirmed &&
        (action.type === 'close' ||
          action.type === 'group-remove' ||
          (leavesDraft && dirty.current.has(active.id)))
      ) {
        confirmationOrigin.current =
          document.activeElement as HTMLElement | null;
        setPending(action);
        return new Promise<boolean>((resolve) => {
          pendingResolver.current = resolve;
        });
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const outcome = temporary
          ? {
              state: reduceWorkspace(stateRef.current, action),
              historyRecorded: false,
            }
          : await updateWorkspace(action, stateRef.current.revision);
        const next = outcome.state;
        if (!temporary && !outcome.historyRecorded)
          notify(
            'Workspace change saved, but its history entry could not be recorded. Existing history was retained.',
          );
        if (!alive.current) return true;
        setState((value) => (next.revision >= value.revision ? next : value));
        if (!temporary)
          channel.current?.postMessage({ revision: next.revision });
        setPending(null);
        pendingResolver.current?.(true);
        pendingResolver.current = null;
        return true;
      } catch (error) {
        if (alive.current)
          notify(
            error instanceof Error
              ? error.message
              : 'Workspace update could not be saved.',
          );
        return false;
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [ready, notify, temporary],
  );
  const open = useCallback(
    (route: string) => {
      if (!pageRoutes.some((item) => item[0] === route))
        return Promise.resolve(false);
      return dispatch({
        type: 'open',
        route: route as PageRoute,
        id: crypto.randomUUID(),
      });
    },
    [dispatch],
  );
  const cancelPending = () => {
    setPending(null);
    pendingResolver.current?.(false);
    pendingResolver.current = null;
  };
  const [refreshPending, setRefreshPending] = useState(false);
  const refresh = async (confirmed = false) => {
    if (dirty.current.size || busyRef.current || pendingResolver.current) {
      notify(
        'Finish or cancel the current draft before refreshing the workspace.',
      );
      return false;
    }
    if (temporary && stateRef.current.revision > 0 && !confirmed) {
      confirmationOrigin.current = document.activeElement as HTMLElement | null;
      setRefreshPending(true);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const value = await readWorkspace();
      if (alive.current && !dirty.current.size) {
        setState((current) =>
          temporary || value.revision >= current.revision ? value : current,
        );
        setReady(true);
        setStorageFailure(false);
        setTemporary(false);
        setRefreshPending(false);
        return true;
      }
      return false;
    } catch {
      if (alive.current) setStorageFailure(true);
      return false;
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const useTemporary = () => {
    setTemporary(true);
    setReady(true);
    setStorageFailure(false);
  };
  return {
    state,
    ready,
    busy,
    pending,
    cancelPending,
    dispatch,
    open,
    markDirty,
    dirtyCount,
    storageFailure,
    temporary,
    refresh,
    useTemporary,
    confirmationOrigin,
    refreshPending,
    setRefreshPending,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
