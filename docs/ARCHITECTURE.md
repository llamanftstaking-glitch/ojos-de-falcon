# Ojos De Falcón — Architecture

## Vision

A map-first navigation platform with a **permanent Safety Layer**: public-safety infrastructure (police, fire, EMS, hospitals, ERs, courts, shelters) stays visible and reachable through every mode — browsing, searching, previewing a route, navigating.

Priorities, in order: safety, reliability, map usability, data accuracy, speed, privacy, accessibility, visual polish.

## System overview

```
Browser (Next.js client)
  MapView (MapLibre GL) ── map-style adapter (CARTO raster default, any vector style via env)
  Overlay UI (sheets, SOS, search, nav chrome) ── design tokens (globals.css)
  client-api.ts ── typed fetch + localStorage offline cache
        │
        ▼
Next.js API routes  /api/v1/*
  api-utils (bootstrap, validation)
        │
        ▼
Domain services (src/lib)
  locations.ts        POI repository: bbox / nearby / search / dedupe
  route-safety.ts     corridor analysis along route geometry
  safe-destination.ts ranked "take me somewhere safe"
  routing/            provider chain: OSRM → direct-path fallback
  geo.ts              haversine, polyline projection, bboxes
        │
        ▼
SQLite (better-sqlite3, WAL)  + FTS5 search index
  seeded from data/*.json (curated demo or OSM import)
```

## Key decisions

**SQLite now, PostGIS-shaped later.** The MVP uses SQLite with a `(latitude, longitude)` index; all spatial access goes through the repository in `locations.ts` (bbox, nearby-with-widening, corridor prefilter). Nothing outside that module touches SQL, so swapping to PostgreSQL + PostGIS is a repository reimplementation, not an application rewrite. Client never receives an entire region — bounding-box queries with zoom-based thinning only.

**Vendor abstraction everywhere.**
- *Map renderer*: MapLibre GL (open source). Styles come from `map-style.ts` — keyless CARTO raster by default, any MapLibre-compatible vector style via `NEXT_PUBLIC_MAP_STYLE_*`.
- *Routing*: `RoutingProvider` interface with a provider chain — OSRM adapter (self-hostable, `OSRM_URL`) falling back to a **clearly labeled** direct-path estimate (`approximate: true`); the UI never shows turn-by-turn for approximate routes.
- *Geocoding*: Nominatim-compatible adapter (`NEXT_PUBLIC_GEOCODER_URL`).

**Priority system, not marker soup.** Every category has a tier (1–3) and `minZoom` (`categories.ts`). The API thins by zoom; the map clusters and uses `symbol-sort-key` so tier-1 facilities win placement conflicts.

**Ranking lives in services, not UI.** `safe-destination.ts` scores travel time × facility priority × open-status × verification confidence with closure penalties. `route-safety.ts` scores forwardness, detour cost, and priority. UI components render results and reasons; they contain no ranking rules.

**Data honesty is structural.** Every record carries `source`, `sourceAttribution`, `verification` (verified_official → permanently_closed) and `lastVerified`. Unknown fields are `null` and render as "Not available". Open status is only asserted from data (`is24Hours`, hours); the safe-destination engine treats unknown hours as reduced confidence, not as "open". Seed data is explicitly labeled approximate/unverified demo data.

**Dedupe at ingest.** `findDuplicateCandidate` blocks same-category records within 150 m whose normalized names overlap ("NYPD 44 Precinct" ≡ "44th Precinct NYPD"). Importers skip duplicates; manual merge tooling is a V1 admin-console feature.

## Data flow: route safety

1. Client requests a route (`POST /api/v1/route`) → provider chain returns geometry + steps.
2. Client posts geometry to `/api/v1/route-safety` → engine pads the route bbox by the corridor width, pulls candidates from the repository, projects each onto the polyline (`nearestPointOnLine`), and computes distance-from-route, distance-ahead, minutes-ahead (route-calibrated speed), and detour estimate.
3. While navigating, GPS position is projected onto the route to update `progressMeters`; safety-ahead data refreshes on a 30 s cadence.

## API (v1)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | liveness + record count |
| `GET /api/v1/safety-locations?bbox&categories&zoom` | map viewport POIs (priority-thinned) |
| `GET /api/v1/safety-locations/:id` | full detail record |
| `GET /api/v1/nearby?at&categories&radius` | nearest facilities, widening search |
| `GET /api/v1/search?q&at` | FTS over the safety corpus |
| `POST /api/v1/route` | road route (provider chain) |
| `POST /api/v1/route-safety` | facilities along a route corridor |
| `GET /api/v1/safe-destination?at` | ranked safe destinations |

All endpoints are public — locating emergency services must never require an account.

## Privacy

- No accounts, no server-side user state in the MVP; the server never stores user positions (locations arrive only as query parameters and are not persisted or logged with identity).
- The offline cache lives in the user's own localStorage.
- Trip history, trusted contacts, and sharing (V1) will be opt-in, expiring, and user-deletable by design.

## Scalability path

Records carry country/state/jurisdiction; nothing assumes NYC. Growth path: repository → PostgreSQL + PostGIS (indexes: GiST on geography), Redis cache for hot viewports, tile-based POI delivery, CDN for map assets. The seeded NYC region is a demo choice (`DEFAULT_CENTER` in `MapView`), not an architectural constraint.

## Product boundaries (non-negotiable)

- No tracking of individual officers or live police-unit movements; no "officer spotted here".
- No police-avoidance or law-enforcement-evasion features.
- No fabricated data: unknown stays unknown, unverified stays labeled unverified.
- No fake emergency communication — emergency calls go through the OS dialer with user confirmation.
- No selling precise location data; no permanent trip storage by default.

## Roadmap

- **MVP (this build):** map, safety layer, search, nearby, routing, route safety, safe destination, SOS, dark mode, offline cache, Docker deploy.
- **V1:** trusted contacts + trip sharing (expiring), hazard reports (moderated, aging out), admin console (verify/merge/audit), notifications, voice commands, route safety summaries pre-navigation.
- **V2:** Safe Place network (verified partners only), weather/emergency overlays from official feeds, shelters, CarPlay/Android Auto, offline navigation, i18n.
