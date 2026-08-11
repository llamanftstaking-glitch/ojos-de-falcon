import { NextResponse } from 'next/server'
import { ensureSeeded } from './bootstrap'
import type { LngLat } from './geo'

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init)
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 404 })
}

export function serverError(message = 'Internal error'): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 500 })
}

/** Every safety API route calls this first: DB + seed data ready. */
export function bootstrap(): void {
  ensureSeeded()
}

export function parseLngLat(raw: string | null): LngLat | null {
  if (!raw) return null
  const parts = raw.split(',').map(Number)
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null
  const [lng, lat] = parts
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lng, lat]
}

export function parseNumber(raw: string | null, fallback?: number): number | undefined {
  if (raw === null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
