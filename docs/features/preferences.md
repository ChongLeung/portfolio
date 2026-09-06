# Local preferences and private wording

Preferences use a complete versioned object in per-visitor browser storage. The initial controls cover language, light/dark theme, spacing, text size, reduced motion, attention options and narration settings. Not all canonical settings capabilities are implemented yet.

Preference import requires schema version 1 and every known settings key with valid bounded values. Unknown fields and duplicate JSON keys are rejected. Restore uses two independent acknowledgements, a confirmation slider, an explicit replace action and a cancellation path. Storage failure does not report a successful restore.

Recent settings history records settings-only revisions. A malformed entry is skipped independently so valid neighboring revisions remain available. Restoring creates a new revision. The current 200-entry recent-history implementation does not yet fulfill the complete durable-history contract.

## Personal wording

A visible local JSON file control accepts `schemaVersion: 1` and an `entries` object. The complete file is validated before caching or applying it. Limits are 1 MiB UTF-8, maximum depth 8, 4,096 entries, keys of 1 to 160 UTF-16 code units, and replacement strings of at most 1,000 UTF-16 code units. Unknown fields, unsafe keys, duplicate decoded keys, non-string values and control characters are rejected.

The validated cache is revalidated when loaded. Rejected replacement files leave the previous valid cache active. Clearing removes the cache and restores original wording. No filename, path, mapping or payload is placed into ordinary settings exports or history. This local preference feature is not an authentication or security boundary.

Current wording replacement uses exact rendered-string lookup. Full boundary-aware replacement, complete accessibility coverage and School-mode integration remain pending.

Verification: `site/tests/model.test.mjs` covers strict imports, unknown fields, invalid values, partial-import rejection, individual history recovery, duplicate-key parsing and vocabulary bounds. Browser storage refusal, reload, replace/clear and complete accessibility scenarios need the final runtime matrix.
