import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { runMigrations } from './migrations'

const DATA_DIR = process.env.OJOS_DATA_DIR || join(process.cwd(), '.data')
const DB_PATH = process.env.OJOS_DB_PATH || join(DATA_DIR, 'ojos-de-falcon.db')

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    runMigrations(db)
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
