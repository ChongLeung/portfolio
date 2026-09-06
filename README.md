# Alex Harbour portfolio

A fictional creative-developer portfolio for ChongLeung. Alex Harbour and the three featured concepts are explicitly invented demonstration content. No professional history, client work, contact details or live project links are claimed.

## Implementation status

The initial portfolio and local preference foundations are implemented. The complete requested feature suite and production verification are **incomplete**. See [ROADMAP.md](ROADMAP.md) and [HANDOFF.md](HANDOFF.md) for the exact remaining work. No production deployment is currently verified.

## Development

The Sites project is in `site/`, using the generated npm lockfile, React, Vinext and locally installed official Material Web components.

```powershell
cd site
npm ci
npm run dev
```

Focused checks:

```powershell
node --test tests/model.test.mjs
npm exec tsc -- --noEmit
npm run build
```

The current machine needs Node.js 22.13 or newer. A touchless repository build entrypoint is still pending. Keep credentials and personal wording files out of the source tree.

Read the [feature documentation](docs/features/README.md). The original repository license remains authoritative.
