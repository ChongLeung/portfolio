# Workspace tabs and groups

The portfolio has one tab per feature destination. Opening an already-open feature selects its existing tab. Tabs can be renamed, pinned, moved, grouped, closed and reopened. Reopening restores the previous position, title and group. Removing a group keeps its tabs as ungrouped items. At least one tab always remains available.

The manager includes a current-strip search, all-tabs search, group-name search and one search inside each group. Each uses a separately owned regular-expression workbench. Invalid or pending master searches disable matching/nonmatching bulk-close actions. Pinned and locked records are excluded from bulk close unless explicitly included. Closing a set with no eligible items does not open a confirmation.

Top and bottom docks use official Material Web tabs. Side docks present the feature navigation vertically and return to the top at narrow widths. Tab controls and content share one active route. The controlled component synchronizes selection after slot changes so reopening cannot leave two active indicators.

## Persistence and conflicts

Workspace state and normal history records are written in the same IndexedDB transaction. A stale expected revision is rejected instead of overwriting another page's update. BroadcastChannel announces revision changes between same-origin pages. Incoming changes do not silently discard an unfinished draft. Refresh is serialized with edits; it does not apply an older revision over a newer one.

History remains append-only. If writing only the history record fails, the aborted transaction is retried as a current-state-only transaction and the interface reports that no history entry was recorded. A current-state write failure does not report success. No existing history is automatically discarded. History reads validate snapshots independently and report skipped damaged records.

When persistent workspace storage cannot be opened, the user can retry or explicitly choose temporary tabs. Temporary changes last only for the current page lifetime. Loading the saved workspace after temporary changes requires confirmation; persistent synchronization reconnects when storage becomes usable again.

## Draft protection and confirmation

Leaving the converter or authenticator with an unfinished draft requires two acknowledgements, a confirmation slider and an explicit apply action. Cancellation retains the draft. Browser navigation also receives an unsaved-work signal. The confirmation captures its return-focus target before the dialog opens. Closed tabs are removed from transient bulk selection.

## Verification and remaining work

`site/tests/workspace.test.mjs` contains 15 focused cases covering stable identities, schema validation, close/reopen, group removal, active-group visibility, concurrent writes, stale revision refusal, no-op history, current-state failure, history-only failure and damaged history records.

The isolated development preview completed open/group/move/close/confirm/reopen and draft-cancel/confirmed-navigation flows. The inspected 320 px bilingual dark view at emulated scale 1.5 had no document overflow and one active tab. These observations are not the final source-bound acceptance matrix.

Still incomplete: full context menus, complete keyboard reordering and vertical-tab semantics, the continuous colour translator, full tab-related history UI, all search-workbench capabilities, real element-lock integration, and final evidence promotion. The canonical completeness inventory remains unverified.
