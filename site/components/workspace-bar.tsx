'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Pin,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button, Md } from './material';
import { SearchField } from './search-field';
import { Confirmation } from './confirmation';
import {
  pageRoutes,
  reduceWorkspace,
  type WorkspaceTab,
} from '../lib/workspace';
import type { WorkspaceController } from '../hooks/use-workspace';

export function WorkspaceBar({
  workspace,
  t,
}: {
  workspace: WorkspaceController;
  t: (en: string, yue?: string) => string;
}) {
  const { state, dispatch } = workspace;
  const strip = useRef<
    | (HTMLElement & {
        activeTabIndex: number;
        updateComplete: Promise<boolean>;
      })
    | null
  >(null);
  const [manage, setManage] = useState(false);
  const [stripSearch, setStripSearch] = useState(false);
  const [stripMatches, setStripMatches] = useState<string[]>(['home']);
  const [masterMatches, setMasterMatches] = useState<string[]>(['home']);
  const [groupMatches, setGroupMatches] = useState<string[]>([]);
  const [groupTabMatches, setGroupTabMatches] = useState<
    Record<string, string[]>
  >({});
  const [selected, setSelected] = useState<string[]>([]);
  const [masterStatus, setMasterStatus] = useState<
    'valid' | 'pending' | 'invalid'
  >('valid');
  const [includePinned, setIncludePinned] = useState(false);
  const [includeLocked, setIncludeLocked] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [routeMatches, setRouteMatches] = useState<string[]>(
    pageRoutes.map((item) => item[0]),
  );
  const title = (tab: WorkspaceTab) => {
    const page = pageRoutes.find((route) => route[0] === tab.route)!;
    return tab.title ?? t(page[1], page[2]);
  };
  const groupName = (tab: WorkspaceTab) =>
    state.groups.find((group) => group.id === tab.group)?.name ??
    t('Ungrouped', '未分組');
  const records = state.tabs.map((tab) => ({
    id: tab.id,
    text: `${title(tab)} ${groupName(tab)} ${tab.pinned ? t('Pinned', '已釘選') : ''} ${tab.locked ? t('Locked', '已鎖定') : ''}`,
  }));
  const groupsOrder = [null, ...state.groups.map((group) => group.id)];
  const visible = state.tabs
    .filter(
      (tab) =>
        tab.id === state.active ||
        ((!stripSearch || stripMatches.includes(tab.id)) &&
          !state.groups.find((group) => group.id === tab.group)?.collapsed),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        groupsOrder.indexOf(a.group) - groupsOrder.indexOf(b.group),
    );
  const activeIndex = visible.findIndex((tab) => tab.id === state.active);
  const vertical = state.dock === 'left' || state.dock === 'right';
  const tabOrder = visible.map((tab) => tab.id).join('|');
  useEffect(
    () =>
      setSelected((ids) => {
        const next = ids.filter((id) =>
          state.tabs.some((tab) => tab.id === id),
        );
        return next.length === ids.length ? ids : next;
      }),
    [state.tabs],
  );
  useEffect(() => {
    let cancelled = false;
    let slot: HTMLSlotElement | null = null;
    const sync = () => {
      if (!cancelled && strip.current)
        strip.current.activeTabIndex = activeIndex;
    };
    customElements.whenDefined('md-tabs').then(async () => {
      const element = strip.current;
      if (!element) return;
      await element.updateComplete;
      if (cancelled) return;
      slot = element.shadowRoot?.querySelector('slot') ?? null;
      slot?.addEventListener('slotchange', sync);
      sync();
    });
    return () => {
      cancelled = true;
      slot?.removeEventListener('slotchange', sync);
    };
  }, [state.active, tabOrder, vertical]);
  const liveSelected = selected.filter((id) =>
    state.tabs.some((tab) => tab.id === id),
  );
  const eligible = (ids: string[]) =>
    state.tabs.length -
    reduceWorkspace(state, { type: 'close', ids, includePinned, includeLocked })
      .tabs.length;
  const requestClose = (ids: string[]) =>
    dispatch({ type: 'close', ids, includePinned, includeLocked });
  const closePreview =
    workspace.pending?.type === 'close'
      ? reduceWorkspace(state, workspace.pending)
      : null;
  const closingTabs = closePreview
    ? state.tabs.filter(
        (tab) => !closePreview.tabs.some((item) => item.id === tab.id),
      )
    : [];
  const pendingDetail =
    workspace.pending?.type === 'close'
      ? t(
          'Close the selected eligible tabs. Pinned and locked tabs are kept unless explicitly included. At least one tab stays open. Closed tabs can be reopened; unsaved drafts will be discarded.',
          '關閉所選且符合條件的分頁。除非明確包括，釘選及鎖定分頁會保留。至少保留一個分頁。已關閉分頁可重新開啟，未儲存草稿會捨棄。',
        )
      : workspace.pending?.type === 'group-remove'
        ? t(
            'Remove this group while keeping its tabs ungrouped. The change is recorded in local history.',
            '移除這個群組，分頁會保留為未分組。改動會記錄在本機歷程。',
          )
        : t(
            'Leaving this feature discards its unsaved draft. Saved entries and original source files are unchanged.',
            '離開這項功能會捨棄未儲存草稿，已儲存項目及原有檔案不受影響。',
          );
  return (
    <section
      className="workspace-bar"
      data-ready={workspace.ready}
      aria-label={t('Workspace tabs', '工作區分頁')}
    >
      {workspace.storageFailure && (
        <div role="status">
          <p>
            {t(
              'Saved workspace unavailable. Existing data is retained.',
              '未能使用已儲存工作區，原有資料已保留。',
            )}
          </p>
          <Button onClick={() => workspace.refresh()}>
            {t('Retry workspace storage', '重試工作區儲存')}
          </Button>
          <Button variant="outlined" onClick={workspace.useTemporary}>
            {t('Use temporary tabs', '使用暫時分頁')}
          </Button>
        </div>
      )}
      {workspace.temporary && (
        <p role="status" className="muted">
          {t(
            'Temporary workspace: changes last only until this page closes.',
            '暫時工作區：改動只會保留至關閉本頁。',
          )}
        </p>
      )}
      <div className="workspace-toolbar">
        <Button
          variant="text"
          aria-expanded={manage}
          onClick={() => setManage((value) => !value)}
        >
          <Layers size={17} />
          {t('Tabs', '分頁')} <span>{state.tabs.length}</span>
        </Button>
        <Button
          variant="text"
          aria-label={t('Toggle current tab search', '開關目前分頁搜尋')}
          aria-expanded={stripSearch}
          onClick={() => setStripSearch((value) => !value)}
        >
          <ChevronDown size={17} />
        </Button>
        <Button
          variant="text"
          disabled={!state.closed.length || workspace.busy}
          aria-label={t('Reopen last closed tab', '重新開啟最後關閉的分頁')}
          onClick={() => dispatch({ type: 'reopen' })}
        >
          <RotateCcw size={17} />
        </Button>
      </div>
      {stripSearch && (
        <SearchField
          id="workspace-strip-search"
          label={t('Search current strip', '搜尋目前分頁列')}
          records={records}
          onResults={setStripMatches}
          t={t}
        />
      )}
      {state.groups.length > 0 && (
        <div className="group-chips">
          {state.groups.map((group) => (
            <Button
              key={group.id}
              variant="text"
              aria-expanded={!group.collapsed}
              disabled={workspace.busy || !workspace.ready}
              onClick={() =>
                dispatch({
                  type: 'group-update',
                  id: group.id,
                  collapsed: !group.collapsed,
                })
              }
            >
              <span className="group-dot" style={{ background: group.color }} />
              {group.name}
              {group.collapsed ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronUp size={14} />
              )}
            </Button>
          ))}
        </div>
      )}
      {vertical ? (
        <div
          className="vertical-tabs"
          role="tablist"
          aria-orientation="vertical"
        >
          {visible.map((tab) => (
            <Button
              key={tab.id}
              role="tab"
              aria-selected={state.active === tab.id}
              variant={state.active === tab.id ? 'filled' : 'text'}
              disabled={workspace.busy || !workspace.ready}
              onClick={() => dispatch({ type: 'activate', id: tab.id })}
            >
              {tab.pinned && <Pin size={14} />} {title(tab)}
            </Button>
          ))}
        </div>
      ) : (
        <Md
          tag="md-tabs"
          ref={strip}
          className="workspace-strip"
          aria-label={t('Open feature tabs', '已開啟功能分頁')}
        >
          {visible.map((tab) => (
            <Md
              key={tab.id}
              tag="md-primary-tab"
              id={`workspace-tab-${tab.id}`}
              aria-controls="main"
              draggable
              onDragStart={(event: DragEvent) => {
                event.dataTransfer?.setData('text/plain', tab.id);
              }}
              onDragOver={(event: DragEvent) => event.preventDefault()}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                const id = event.dataTransfer?.getData('text/plain');
                if (id && state.tabs.some((item) => item.id === id))
                  dispatch({
                    type: 'move',
                    id,
                    before: tab.id,
                    group: tab.group,
                  });
              }}
              onClick={(event: Event) => {
                event.preventDefault();
                dispatch({ type: 'activate', id: tab.id });
              }}
            >
              {tab.pinned && <Pin size={14} slot="icon" />}
              {title(tab)}
            </Md>
          ))}
        </Md>
      )}
      {stripSearch && (
        <p className="muted">
          {t(
            'The active tab stays visible even when filtered or grouped.',
            '目前分頁會保持顯示，即使搜尋或群組已收起。',
          )}
        </p>
      )}
      {manage && (
        <section
          className="workspace-manager"
          aria-label={t('Manage tabs and groups', '管理分頁與群組')}
        >
          <div className="panel-heading">
            <h2>{t('Tabs & groups', '分頁與群組')}</h2>
            <Button
              variant="text"
              aria-label={t('Close tab manager', '關閉分頁管理')}
              onClick={() => setManage(false)}
            >
              <X size={18} />
            </Button>
          </div>
          <div className="dock-options">
            {(['top', 'bottom', 'left', 'right'] as const).map((dock, i) => (
              <Button
                key={dock}
                variant={state.dock === dock ? 'filled' : 'outlined'}
                disabled={workspace.busy || !workspace.ready}
                onClick={() => dispatch({ type: 'dock', dock })}
              >
                {t(
                  ['Top', 'Bottom', 'Left', 'Right'][i],
                  ['頂部', '底部', '左側', '右側'][i],
                )}
              </Button>
            ))}
            <Button
              variant="text"
              disabled={workspace.busy || !workspace.ready}
              onClick={() => workspace.refresh()}
            >
              {t('Refresh workspace', '更新工作區')}
            </Button>
          </div>
          <p className="muted">
            {t(
              'Side docking returns to the top on narrow screens.',
              '窄畫面會將側邊分頁列放回頂部。',
            )}
          </p>
          <SearchField
            id="workspace-route-search"
            label={t('Find a feature to open', '搜尋要開啟的功能')}
            records={pageRoutes.map((route) => ({
              id: route[0],
              text: `${route[1]} ${route[2]}`,
            }))}
            onResults={setRouteMatches}
            t={t}
          />
          <div className="open-features">
            {pageRoutes
              .filter((route) => routeMatches.includes(route[0]))
              .map((route) => (
                <Button
                  key={route[0]}
                  data-route={route[0]}
                  variant="outlined"
                  disabled={workspace.busy || !workspace.ready}
                  onClick={() => workspace.open(route[0])}
                >
                  <Plus size={15} />
                  {t(route[1], route[2])}
                </Button>
              ))}
          </div>
          <SearchField
            id="workspace-master-search"
            label={t('Search all tabs', '搜尋全部分頁')}
            records={records}
            onResults={setMasterMatches}
            onStatus={setMasterStatus}
            t={t}
          />
          <div className="bulk-toolbar">
            <Button
              variant="text"
              onClick={() =>
                setSelected(
                  state.tabs
                    .filter((tab) => masterMatches.includes(tab.id))
                    .map((tab) => tab.id),
                )
              }
            >
              {t('Select results', '選取結果')}
            </Button>
            <Button variant="text" onClick={() => setSelected([])}>
              {t('Clear selection', '清除選取')}
            </Button>
            <Button
              variant="outlined"
              disabled={!eligible(liveSelected) || workspace.busy}
              onClick={() => requestClose(liveSelected)}
            >
              {t(
                `Close selected (${liveSelected.length})`,
                `關閉所選（${liveSelected.length}）`,
              )}
            </Button>
            <Button
              variant="text"
              disabled={
                workspace.busy || !workspace.ready || masterStatus !== 'valid'
              }
              onClick={() =>
                requestClose(
                  state.tabs
                    .filter((tab) => masterMatches.includes(tab.id))
                    .map((tab) => tab.id),
                )
              }
            >
              {t('Close matching tabs', '關閉符合的分頁')}
            </Button>
            <Button
              variant="text"
              disabled={
                workspace.busy || !workspace.ready || masterStatus !== 'valid'
              }
              onClick={() =>
                requestClose(
                  state.tabs
                    .filter((tab) => !masterMatches.includes(tab.id))
                    .map((tab) => tab.id),
                )
              }
            >
              {t('Close nonmatching tabs', '關閉不符合的分頁')}
            </Button>
          </div>
          <label className="setting-row">
            <span>
              {t('Include pinned tabs in bulk close', '批次關閉包括釘選分頁')}
            </span>
            <Md
              tag="md-checkbox"
              checked={includePinned}
              aria-label={t('Include pinned tabs', '包括釘選分頁')}
              onChange={(event: Event) =>
                setIncludePinned((event.target as HTMLInputElement).checked)
              }
            />
          </label>
          <label className="setting-row">
            <span>
              {t('Include locked tabs in bulk close', '批次關閉包括鎖定分頁')}
            </span>
            <Md
              tag="md-checkbox"
              checked={includeLocked}
              aria-label={t('Include locked tabs', '包括鎖定分頁')}
              onChange={(event: Event) =>
                setIncludeLocked((event.target as HTMLInputElement).checked)
              }
            />
          </label>
          <div className="managed-tabs">
            {state.tabs
              .filter((tab) => masterMatches.includes(tab.id))
              .map((tab, index) => (
                <article
                  className="managed-tab"
                  data-tab-id={tab.id}
                  data-route={tab.route}
                  key={tab.id}
                >
                  <label className="tab-selection">
                    <Md
                      tag="md-checkbox"
                      checked={selected.includes(tab.id)}
                      aria-label={t(
                        `Select ${title(tab)}`,
                        `選取 ${title(tab)}`,
                      )}
                      onChange={(event: Event) =>
                        setSelected((ids) =>
                          (event.target as HTMLInputElement).checked
                            ? [...new Set([...ids, tab.id])]
                            : ids.filter((id) => id !== tab.id),
                        )
                      }
                    />
                    <span>
                      {title(tab)}
                      <small>
                        {groupName(tab)}
                        {tab.pinned ? ` · ${t('Pinned', '已釘選')}` : ''}
                        {tab.locked ? ` · ${t('Locked', '已鎖定')}` : ''}
                      </small>
                    </span>
                  </label>
                  <div className="tab-actions">
                    <Button
                      variant="text"
                      disabled={workspace.busy || !workspace.ready}
                      onClick={() => dispatch({ type: 'activate', id: tab.id })}
                    >
                      {t('Open', '開啟')}
                    </Button>
                    <Button
                      variant="text"
                      disabled={workspace.busy || !workspace.ready}
                      onClick={() =>
                        dispatch({
                          type: 'pin',
                          id: tab.id,
                          pinned: !tab.pinned,
                        })
                      }
                    >
                      {t(
                        tab.pinned ? 'Unpin' : 'Pin',
                        tab.pinned ? '取消釘選' : '釘選',
                      )}
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => {
                        setEditing(tab.id);
                        setRename(tab.title ?? '');
                      }}
                    >
                      {t('Rename', '重新命名')}
                    </Button>
                    <Button
                      variant="text"
                      disabled={
                        workspace.busy ||
                        state.tabs.findIndex((item) => item.id === tab.id) === 0
                      }
                      aria-label={t(
                        `Move ${title(tab)} earlier`,
                        `將 ${title(tab)} 向前移`,
                      )}
                      onClick={() => {
                        const position = state.tabs.findIndex(
                          (item) => item.id === tab.id,
                        );
                        dispatch({
                          type: 'move',
                          id: tab.id,
                          before: state.tabs[position - 1].id,
                          group: tab.group,
                        });
                      }}
                    >
                      <ChevronUp size={16} />
                    </Button>
                    <Button
                      variant="text"
                      disabled={workspace.busy || !workspace.ready}
                      aria-label={t(
                        `Close ${title(tab)}`,
                        `關閉 ${title(tab)}`,
                      )}
                      onClick={() => requestClose([tab.id])}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  {editing === tab.id && (
                    <div className="tab-rename">
                      <Md
                        tag="md-outlined-text-field"
                        label={t('Custom tab name', '自訂分頁名稱')}
                        value={rename}
                        onInput={(event: Event) =>
                          setRename((event.target as HTMLInputElement).value)
                        }
                      />
                      <Button
                        disabled={workspace.busy || !workspace.ready}
                        onClick={async () => {
                          if (
                            await dispatch({
                              type: 'rename',
                              id: tab.id,
                              title: rename.trim() || null,
                            })
                          )
                            setEditing(null);
                        }}
                      >
                        {t('Save name', '儲存名稱')}
                      </Button>
                    </div>
                  )}
                  <div className="tab-group-picker">
                    <span>{t('Move to group:', '移至群組：')}</span>
                    <Button
                      variant="text"
                      disabled={workspace.busy || !workspace.ready}
                      onClick={() =>
                        dispatch({
                          type: 'move',
                          id: tab.id,
                          before: null,
                          group: null,
                        })
                      }
                    >
                      {t('Ungrouped', '未分組')}
                    </Button>
                    {state.groups.map((group) => (
                      <Button
                        key={group.id}
                        variant="text"
                        disabled={workspace.busy || !workspace.ready}
                        onClick={() =>
                          dispatch({
                            type: 'move',
                            id: tab.id,
                            before: null,
                            group: group.id,
                          })
                        }
                      >
                        {group.name}
                      </Button>
                    ))}
                  </div>
                </article>
              ))}
          </div>
          <SearchField
            id="workspace-group-search"
            label={t('Search group names', '搜尋群組名稱')}
            records={state.groups.map((group) => ({
              id: group.id,
              text: group.name,
            }))}
            onResults={setGroupMatches}
            t={t}
          />
          <div className="group-create">
            <Md
              tag="md-outlined-text-field"
              label={t('New group name', '新群組名稱')}
              value={name}
              onInput={(event: Event) =>
                setName((event.target as HTMLInputElement).value)
              }
            />
            <Button
              disabled={!name.trim() || workspace.busy}
              onClick={async () => {
                if (
                  await dispatch({
                    type: 'group-create',
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    color: '#006b60',
                  })
                )
                  setName('');
              }}
            >
              {t('Create group', '建立群組')}
            </Button>
          </div>
          {state.groups
            .filter((group) => groupMatches.includes(group.id))
            .map((group) => (
              <section
                className="managed-group"
                data-group-id={group.id}
                key={group.id}
              >
                <h3>{group.name}</h3>
                <SearchField
                  id={`workspace-group-${group.id}-search`}
                  label={t(
                    `Search ${group.name} tabs`,
                    `搜尋 ${group.name} 分頁`,
                  )}
                  records={records.filter(
                    (record) =>
                      state.tabs.find((tab) => tab.id === record.id)?.group ===
                      group.id,
                  )}
                  onResults={(ids) =>
                    setGroupTabMatches((current) => ({
                      ...current,
                      [group.id]: ids,
                    }))
                  }
                  t={t}
                />
                <div className="group-tab-results">
                  {state.tabs
                    .filter(
                      (tab) =>
                        tab.group === group.id &&
                        groupTabMatches[group.id]?.includes(tab.id),
                    )
                    .map((tab) => (
                      <Button
                        key={tab.id}
                        variant="text"
                        onClick={() =>
                          dispatch({ type: 'activate', id: tab.id })
                        }
                      >
                        {title(tab)}
                      </Button>
                    ))}
                </div>
                <GroupEditor group={group} workspace={workspace} t={t} />
              </section>
            ))}
        </section>
      )}
      {workspace.pending && (
        <Confirmation
          key={state.revision}
          title={t('Confirm workspace change', '確認工作區改動')}
          detail={
            (closePreview
              ? t(
                  `${closingTabs.length} tabs will close: ${closingTabs.map(title).join(', ') || 'none'}. `,
                  `將關閉 ${closingTabs.length} 個分頁：${closingTabs.map(title).join('、') || '沒有'}。 `,
                )
              : '') + pendingDetail
          }
          onConfirm={() => dispatch(workspace.pending!, true)}
          onCancel={workspace.cancelPending}
          returnFocus={workspace.confirmationOrigin.current}
          t={t}
        />
      )}
      {workspace.refreshPending && (
        <Confirmation
          title={t('Load saved workspace?', '載入已儲存工作區？')}
          detail={t(
            'Temporary tab and group changes will be discarded. Saved workspace data remains unchanged.',
            '暫時分頁及群組改動將被捨棄，已儲存工作區資料保持不變。',
          )}
          onConfirm={() => workspace.refresh(true)}
          onCancel={() => workspace.setRefreshPending(false)}
          returnFocus={workspace.confirmationOrigin.current}
          t={t}
        />
      )}
    </section>
  );
}
function GroupEditor({
  group,
  workspace,
  t,
}: {
  group: WorkspaceController['state']['groups'][number];
  workspace: WorkspaceController;
  t: (en: string, yue?: string) => string;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const { dispatch, state } = workspace;
  return (
    <div className="group-editor">
      <Md
        tag="md-outlined-text-field"
        label={t('Group name', '群組名稱')}
        value={name}
        onInput={(event: Event) =>
          setName((event.target as HTMLInputElement).value)
        }
      />
      <Md
        tag="md-outlined-text-field"
        label={t('Group colour (HEX)', '群組顏色（HEX）')}
        value={color}
        onInput={(event: Event) =>
          setColor((event.target as HTMLInputElement).value)
        }
      />
      <div className="dialog-actions">
        <Button
          disabled={workspace.busy || !workspace.ready}
          onClick={() =>
            dispatch({
              type: 'group-update',
              id: group.id,
              name: name.trim(),
              color,
            })
          }
        >
          {t('Save group', '儲存群組')}
        </Button>
        <Button
          variant="text"
          disabled={workspace.busy || state.groups[0].id === group.id}
          onClick={() => {
            const index = state.groups.findIndex(
              (item) => item.id === group.id,
            );
            dispatch({
              type: 'group-move',
              id: group.id,
              before: state.groups[index - 1].id,
            });
          }}
        >
          {t('Move earlier', '向前移')}
        </Button>
        <Button
          variant="text"
          disabled={workspace.busy || !workspace.ready}
          onClick={() => dispatch({ type: 'group-remove', id: group.id })}
        >
          {t('Remove group, keep tabs', '移除群組，保留分頁')}
        </Button>
      </div>
    </div>
  );
}
