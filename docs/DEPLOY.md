# Deploying Falcon to production (falcon.gizergroup.com)

Runbook for taking Ojos De Falcón fully live on a server that may already
host other apps (e.g. alongside the Gizer Oil site on server L). Falcon runs
independently in its own containers and volume; only the host's reverse
proxy and the shared Google Maps key are reused.

## Prerequisites

- Docker + Docker Compose on the server
- DNS: `falcon.gizergroup.com` → the server's IP (already done)
- The Google Maps Platform API key used by sibling apps, with **Routes API**
  and **Geocoding API** enabled on its project

> HTTPS is not optional: browsers only expose geolocation to secure
> origins, and GPS is the heart of the product.

## 1. Get the code onto the server

```bash
git clone https://github.com/llamanftstaking-glitch/ojos-de-falcon.git
cd ojos-de-falcon
```

## 2. Configure

```bash
cp .env.example .env
# Edit .env and set (reuse the same key value as the Gizer Oil app):
#   GOOGLE_MAPS_API_KEY=<the shared key>
```

With the key set, routing is Google Routes (real turn-by-turn) and geocoding
is Google — no OSRM or Nominatim dependency. Without it, Falcon still runs
using OSRM/Nominatim public endpoints (dev-grade only).

## 3. Start the app

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:3100/api/v1/health   # expect {"ok":true,...}
```

The prod overlay binds the app to `127.0.0.1:3100` (not exposed publicly)
and persists the SQLite database in the `ojos-data` volume.

## 4. Wire the domain (pick ONE)

**A. Server already runs nginx** (most likely on a shared server):

```bash
sudo cp ops/nginx-falcon.conf /etc/nginx/sites-available/falcon.gizergroup.com
sudo ln -s /etc/nginx/sites-available/falcon.gizergroup.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d falcon.gizergroup.com
```

**B. Server already runs Caddy:** append the block from `ops/Caddyfile` to
the existing Caddyfile, then `sudo systemctl reload caddy`.

**C. Ports 80/443 are free** (nothing else terminates TLS):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy up -d
```

## 5. Load real safety data

```bash
docker compose exec ojos-de-falcon node scripts/import-osm.mjs   # NYC metro default
# or run `pnpm import:osm` before building, so data/osm-import.json ships in the image
docker compose restart ojos-de-falcon
```

Records import as `unverified` with OSM attribution — the UI labels them
honestly until a verification pass promotes them.

## 6. Verify live

- `https://falcon.gizergroup.com` loads, map renders, HTTPS padlock present
- Browser asks for location; blue dot appears
- Search an address → results (Google geocoder)
- Navigate somewhere → real road route with turn-by-turn banner
- `https://falcon.gizergroup.com/api/v1/health` → `{"ok":true,...}`

## Updating

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Backups

The entire state is one SQLite file in the `ojos-data` volume:

```bash
docker compose exec ojos-de-falcon sh -c \
  'sqlite3 /data/ojos-de-falcon.db ".backup /data/backup.db"' \
  && docker cp ojos-de-falcon:/data/backup.db ./backups/falcon-$(date +%F).db
```

Cron it nightly. Restore = drop the file back and restart.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Routing falls back to "direct path" | Key missing/typo in `.env`, or Routes API not enabled on the project — check `docker compose logs` for `[routing/google]` |
| Geocoding returns nothing | Geocoding API not enabled, or key referrer/IP restrictions exclude the server — Google keys used server-side need IP (not HTTP-referrer) restrictions |
| No location prompt in browser | Page not served over HTTPS |
| 502 from nginx | App container down — `docker compose ps`, `docker compose logs` |
| Map tiles missing | CARTO basemap unreachable or rate-limited — set `NEXT_PUBLIC_MAP_STYLE_*` to a provider style URL and rebuild |
