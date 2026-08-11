# Ojos De Falcón

**Navigation with safety built in.**

A navigation platform where public-safety infrastructure — police departments, fire stations, hospitals, emergency rooms, courthouses — is built directly into the map. Users always know where they are, where they're going, where help is, and how quickly they can reach it.

> Internal working name. Branding is isolated in `src/brand.ts` — the product can be renamed without touching application code.

## Features (MVP)

- **Full-screen interactive map** (MapLibre GL, dark & light mode, vendor-abstracted styles)
- **Permanent Safety Layer** — police, sheriff, fire, EMS, hospital/ER, courthouse, government, shelter markers with priority-tiered zoom thinning and clustering
- **Safety Mode** toggle + quick filters (All / Police / Fire / Medical / Courts / Government / Safe Places)
- **Safety Near You** panel — nearest facilities with distance and ETA
- **Search** — safety POI full-text search plus free-text place geocoding
- **Routing & navigation** — route preview with ETA/distance, instruction banner, honest fallback labeling when road routing is unavailable
- **Safety Along Route** — facilities in the route corridor with distance-from-route, minutes-ahead, and detour estimates
- **Take Me Somewhere Safe** — ranked safe destinations (travel time × facility priority × open status × verification confidence; never just the closest point)
- **SOS** — hold-to-activate (2s), OS-dialer emergency call, navigate-to-police/hospital, share location. No fake emergency communication.
- **Offline safety cache** — last-known nearby data shown with its age, never presented as live
- **Data honesty** — every record carries source, attribution, and verification status; unknown fields display "Not available", never fabricated

## Quick start

```bash
corepack enable
pnpm install
pnpm dev          # http://localhost:3100
```

The database seeds itself on first run with a small curated demo dataset (NYC region, clearly marked unverified). For real data density, import from OpenStreetMap:

```bash
pnpm import:osm                             # NYC metro default
pnpm import:osm -- --bbox 40.4,-74.3,41.2,-73.5
OJOS_RESEED=1 pnpm dev                      # reload data on boot
```

## Deploy (Docker Compose)

```bash
docker compose up -d --build
```

The app listens on port 3100 (override with `PORT`), persists its SQLite database in the `ojos-data` volume, and exposes a health check at `/api/v1/health`. See `.env.example` for routing/map-provider configuration — for production traffic, self-host OSRM and set a vector map style.

## Commands

```bash
pnpm dev            # development server
pnpm build          # production build (standalone output)
pnpm start          # production server
pnpm test           # unit tests (vitest)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm import:osm     # import real OSM safety data
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Highlights:

- `src/lib/` — domain services: geo math, POI repository (SQLite + FTS5), route-safety engine, safe-destination ranking, routing/geocoding/map-style adapters
- `src/app/api/v1/` — versioned REST API
- `src/components/` — map + overlay UI (design tokens only, no hardcoded colors)
- `data/` — seed datasets with source attribution

## Product boundaries

This platform maps **public safety infrastructure**. It does not and will not track individual officers or live police movements, provide police-avoidance features, present unverified claims as fact, or fabricate emergency communication. See `docs/ARCHITECTURE.md § Product boundaries`.

## License

Proprietary — all rights reserved (pre-launch).
