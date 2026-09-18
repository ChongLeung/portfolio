# Local search

Concept search indexes names, categories, short descriptions, full descriptions and expanded details in both supported content languages. History search indexes action and timestamp. Each implemented search owns its own text, regular-expression mode, flags and workbench state.

Plain text is the default. Regular expressions execute in a dedicated browser worker with a 250 ms parent deadline. Changing a query terminates the previous worker, so stale results cannot replace newer results. Limits are 2,048 query characters, 10,000 records, 1 MiB serialized input and 65,536 characters per record. Unsupported or incompatible flags are rejected.

The initial workbench provides guided syntax insertion, raw pattern and flag editing, timing, first-match capture previews, reset, and copying a neutral search recipe. It does not yet implement the entire advanced workbench contract. Native browser regular-expression behavior determines syntax support.

Empty search shows all records. Invalid expressions and timeouts show an explicit message rather than blocking the interface indefinitely. The worker is local and makes no network request. Its static JavaScript file is served from the same origin as the portfolio.
