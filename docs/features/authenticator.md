# Local authenticator

The initial authenticator accepts standard TOTP pairing URIs, validates parameters and issuer consistency, draws pairing QR codes locally, requires a current code before saving, and shows current/next codes with a countdown on request. Pairing, generation and storage do not call a remote service.

The implementation uses the browser Web Crypto HMAC implementation and the RFC 6238 counter and dynamic truncation rules. Six focused tests include all 18 published SHA-1, SHA-256 and SHA-512 vectors from [RFC 6238 Appendix B](https://www.rfc-editor.org/rfc/rfc6238.html#appendix-B). Test secrets are public interoperability fixtures, not account credentials.

Entries are AES-GCM encrypted in IndexedDB using a non-exportable browser key. Each entry binds authenticated data to its stable identifier. This is a per-origin browser-storage equivalent, not an operating-system credential vault. Code executing in the same origin can use the key. Clearing browser data removes the key and entries. No export or history route serializes pairing secrets.

**Unfinished:** manual entry, QR import/camera scanning, entry management, encrypted append-only history, complete recovery, bulk operations, full localization and browser-storage acceptance tests. Offline operation cannot measure clock skew, so the interface states that it relies on the device clock. The current source is not complete canonical authenticator coverage.
