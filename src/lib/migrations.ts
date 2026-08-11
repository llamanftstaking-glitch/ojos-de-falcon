import type Database from 'better-sqlite3'

export type Migration = {
  id: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    id: '001_safety_locations',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS safety_locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          subcategory TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          address TEXT,
          city TEXT,
          state TEXT,
          zip TEXT,
          country TEXT NOT NULL DEFAULT 'US',
          phone TEXT,
          non_emergency_phone TEXT,
          website TEXT,
          hours TEXT,
          is_24_hours INTEGER,
          verification TEXT NOT NULL DEFAULT 'unverified',
          source TEXT NOT NULL DEFAULT 'manual',
          source_attribution TEXT,
          last_verified TEXT,
          jurisdiction TEXT,
          services TEXT NOT NULL DEFAULT '[]',
          accessibility TEXT,
          parking TEXT,
          public_entrance TEXT,
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- Bounding-box queries hit these; SQLite uses them for lat/lng range scans.
        CREATE INDEX IF NOT EXISTS idx_safety_locations_lat_lng
          ON safety_locations(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_safety_locations_category
          ON safety_locations(category);
      `)
    },
  },
  {
    id: '002_search_fts',
    up: (db) => {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS safety_locations_fts USING fts5(
          id UNINDEXED,
          name,
          address,
          city,
          category,
          tokenize='porter unicode61'
        );
      `)
    },
  },
]

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r: any) => r.id)
  )
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })()
  }
}
