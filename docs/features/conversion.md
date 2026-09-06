# Local file conversion

The initial browser adapters support JSON formatting, JSON to YAML, UTF-8 text and Base64, text-to-ZIP, PDF inspection, page extraction/reordering, page rotation, splitting to ZIP, and standard metadata removal. Source files remain unchanged. Conversion happens in a local worker and does not upload file contents.

Current limits: 25 MiB source, 50 MiB returned output, 500 PDF pages, and a 15-second read-and-processing deadline. Source reads are abortable. Cancellation terminates the worker and invalidates late callbacks. Completed downloads are generated only after the worker returns an output below the limit.

PDF output is reopened for page-count validation. Focused tests independently verify order by differing page sizes, selected rotations, metadata removal, and readable split archives. These tests do not establish a hard parser-memory limit or comprehensive validation of every document feature.

**Unfinished:** the browser worker isolates time but does not guarantee a peak-memory ceiling for compressed PDFs. Streaming archives, complete operation-specific output validation, durable unlimited batch queues, crash recovery, PDF merge, image/audio/video/office adapters and 7z are not complete. This development build explicitly discloses these limits and must not be presented as the complete canonical converter.

`site/tests/conversion.test.mjs` contains 10 focused tests. Reopening output verifies real files rather than extensions alone. No browser acceptance test has yet verified the complete conversion flow from file selection to download.
