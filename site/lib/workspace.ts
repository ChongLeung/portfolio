export const pageRoutes = [
  ['portfolio', 'Portfolio', '作品集'],
  ['settings', 'Settings', '設定'],
  ['history', 'History', '歷程'],
  ['tools', 'File tools', '檔案工具'],
  ['authenticator', 'Authenticator', '驗證器'],
  ['help', 'About this demo', '關於示範'],
] as const;
export type PageRoute = (typeof pageRoutes)[number][0];
export type WorkspaceTab = {
  id: string;
  route: PageRoute;
  title: string | null;
  group: string | null;
  pinned: boolean;
  locked: boolean;
};
export type TabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
};
export type ClosedTab = WorkspaceTab & { position: number };
export type Workspace = {
  schemaVersion: 1;
  revision: number;
  tabs: WorkspaceTab[];
  groups: TabGroup[];
  active: string;
  closed: ClosedTab[];
  dock: 'top' | 'bottom' | 'left' | 'right';
};
export const initialWorkspace: Workspace = {
  schemaVersion: 1,
  revision: 0,
  tabs: [
    {
      id: 'home',
      route: 'portfolio',
      title: null,
      group: null,
      pinned: true,
      locked: false,
    },
  ],
  groups: [],
  active: 'home',
  closed: [],
  dock: 'top',
};
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function fields(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).sort().join(',') !== [...names].sort().join(','))
    throw Error('Unexpected workspace fields.');
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && idPattern.test(value);
}
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= limit &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
export function validateWorkspace(value: unknown): Workspace {
  if (!isRecord(value)) throw Error('Invalid workspace.');
  fields(value, [
    'schemaVersion',
    'revision',
    'tabs',
    'groups',
    'active',
    'closed',
    'dock',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !Array.isArray(value.tabs) ||
    value.tabs.length < 1 ||
    value.tabs.length > 200 ||
    !Array.isArray(value.closed) ||
    value.closed.length > 100 ||
    !Array.isArray(value.groups) ||
    value.groups.length > 100 ||
    !['top', 'bottom', 'left', 'right'].includes(String(value.dock))
  )
    throw Error('Invalid workspace bounds.');
  const groups = new Set<string>();
  for (const group of value.groups) {
    if (!isRecord(group)) throw Error('Invalid group.');
    fields(group, ['id', 'name', 'color', 'collapsed']);
    if (
      !validId(group.id) ||
      groups.has(group.id) ||
      !text(group.name, 80) ||
      typeof group.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(group.color) ||
      typeof group.collapsed !== 'boolean'
    )
      throw Error('Invalid group fields.');
    groups.add(group.id);
  }
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const [index, tab] of [...value.tabs, ...value.closed].entries()) {
    if (!isRecord(tab)) throw Error('Invalid tab.');
    fields(tab, [
      'id',
      'route',
      'title',
      'group',
      'pinned',
      'locked',
      ...(index >= value.tabs.length ? ['position'] : []),
    ]);
    if (
      index >= value.tabs.length &&
      (!Number.isInteger(tab.position) ||
        Number(tab.position) < 0 ||
        Number(tab.position) > 199)
    )
      throw Error('Invalid closed-tab position.');
    if (
      !validId(tab.id) ||
      ids.has(tab.id) ||
      !pageRoutes.some((item) => item[0] === tab.route) ||
      (tab.title !== null && !text(tab.title, 100)) ||
      (tab.group !== null &&
        (typeof tab.group !== 'string' || !groups.has(tab.group))) ||
      typeof tab.pinned !== 'boolean' ||
      typeof tab.locked !== 'boolean'
    )
      throw Error('Invalid tab fields.');
    ids.add(tab.id);
  }
  for (const tab of value.tabs as WorkspaceTab[]) {
    if (routes.has(tab.route))
      throw Error('A feature already has an open tab.');
    routes.add(tab.route);
  }
  if (!(value.tabs as WorkspaceTab[]).some((tab) => tab.id === value.active))
    throw Error('The active tab is absent.');
  return structuredClone(value) as Workspace;
}
export type WorkspaceAction =
  | { type: 'open'; route: PageRoute; id: string }
  | { type: 'activate'; id: string }
  | { type: 'rename'; id: string; title: string | null }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'move'; id: string; before: string | null; group: string | null }
  | {
      type: 'close';
      ids: string[];
      includePinned?: boolean;
      includeLocked?: boolean;
    }
  | { type: 'reopen' }
  | { type: 'group-create'; id: string; name: string; color: string }
  | {
      type: 'group-update';
      id: string;
      name?: string;
      color?: string;
      collapsed?: boolean;
    }
  | { type: 'group-move'; id: string; before: string | null }
  | { type: 'group-remove'; id: string }
  | { type: 'dock'; dock: Workspace['dock'] };
export function reduceWorkspace(
  previous: Workspace,
  action: WorkspaceAction,
): Workspace {
  const state = validateWorkspace(previous);
  const target =
    'id' in action ? state.tabs.find((tab) => tab.id === action.id) : undefined;
  if (action.type === 'open') {
    if (
      !pageRoutes.some((route) => route[0] === action.route) ||
      !validId(action.id)
    )
      throw Error('Unknown feature or invalid tab identity.');
    const existing = state.tabs.find((tab) => tab.route === action.route);
    if (existing) state.active = existing.id;
    else {
      if (state.tabs.some((tab) => tab.id === action.id))
        throw Error('Duplicate tab identity.');
      state.closed = state.closed.filter(
        (tab) => tab.route !== action.route && tab.id !== action.id,
      );
      state.tabs.push({
        id: action.id,
        route: action.route,
        title: null,
        group: null,
        pinned: false,
        locked: false,
      });
      state.active = action.id;
    }
  } else if (action.type === 'activate') {
    if (!target) throw Error('Tab no longer exists.');
    state.active = target.id;
  } else if (action.type === 'rename') {
    if (!target) throw Error('Tab no longer exists.');
    target.title = action.title;
  } else if (action.type === 'pin') {
    if (!target) throw Error('Tab no longer exists.');
    target.pinned = action.pinned;
  } else if (action.type === 'move') {
    if (
      !target ||
      (action.group !== null &&
        !state.groups.some((group) => group.id === action.group))
    )
      throw Error('Tab or group no longer exists.');
    if (action.before === action.id) return state;
    if (
      action.before !== null &&
      !state.tabs.some((tab) => tab.id === action.before)
    )
      throw Error('Destination tab no longer exists.');
    state.tabs = state.tabs.filter((tab) => tab.id !== action.id);
    target.group = action.group;
    const index =
      action.before === null
        ? state.tabs.length
        : state.tabs.findIndex((tab) => tab.id === action.before);
    state.tabs.splice(index, 0, target);
  } else if (action.type === 'close') {
    const selected = new Set(action.ids);
    const closing = state.tabs.filter(
      (tab) =>
        selected.has(tab.id) &&
        (!tab.pinned || action.includePinned) &&
        (!tab.locked || action.includeLocked),
    );
    if (closing.length === state.tabs.length) closing.pop();
    const closeIds = new Set(closing.map((tab) => tab.id));
    const activeIndex = state.tabs.findIndex((tab) => tab.id === state.active);
    state.tabs = state.tabs.filter((tab) => !closeIds.has(tab.id));
    state.closed = [
      ...closing
        .slice()
        .reverse()
        .map((tab) => ({
          ...tab,
          position: previous.tabs.findIndex((item) => item.id === tab.id),
        })),
      ...state.closed.filter((tab) => !closeIds.has(tab.id)),
    ].slice(0, 100);
    if (closeIds.has(state.active))
      state.active =
        state.tabs[Math.min(activeIndex, state.tabs.length - 1)].id;
  } else if (action.type === 'reopen') {
    const closed = state.closed.shift();
    if (!closed) return state;
    const { position, ...tab } = closed;
    const existing = state.tabs.find((item) => item.route === tab.route);
    if (existing) state.active = existing.id;
    else {
      state.tabs.splice(Math.min(position, state.tabs.length), 0, tab);
      state.active = tab.id;
    }
  } else if (action.type === 'group-create') {
    if (state.groups.some((group) => group.id === action.id))
      throw Error('Duplicate group identity.');
    state.groups.push({
      id: action.id,
      name: action.name,
      color: action.color,
      collapsed: false,
    });
  } else if (action.type === 'group-update') {
    const group = state.groups.find((item) => item.id === action.id);
    if (!group) throw Error('Group no longer exists.');
    if (action.name !== undefined) group.name = action.name;
    if (action.color !== undefined) group.color = action.color;
    if (action.collapsed !== undefined) group.collapsed = action.collapsed;
  } else if (action.type === 'group-move') {
    const group = state.groups.find((item) => item.id === action.id);
    if (!group) throw Error('Group no longer exists.');
    if (action.before === action.id) return state;
    if (
      action.before !== null &&
      !state.groups.some((item) => item.id === action.before)
    )
      throw Error('Destination group no longer exists.');
    state.groups = state.groups.filter((item) => item.id !== action.id);
    const index =
      action.before === null
        ? state.groups.length
        : state.groups.findIndex((item) => item.id === action.before);
    state.groups.splice(index, 0, group);
  } else if (action.type === 'group-remove') {
    state.groups = state.groups.filter((group) => group.id !== action.id);
    for (const tab of [...state.tabs, ...state.closed])
      if (tab.group === action.id) tab.group = null;
  } else if (action.type === 'dock') state.dock = action.dock;
  const active = state.tabs.find((tab) => tab.id === state.active)!;
  if (['open', 'activate', 'reopen'].includes(action.type) && active.group) {
    const group = state.groups.find((group) => group.id === active.group);
    if (group) group.collapsed = false;
  }
  if (JSON.stringify(state) === JSON.stringify(previous)) return state;
  state.revision++;
  return validateWorkspace(state);
}
