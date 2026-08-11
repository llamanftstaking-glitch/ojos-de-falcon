import type { SafetyCategory } from './categories'
import { CATEGORIES } from './categories'

/**
 * Marker icon renderer — draws category icons onto canvases at runtime and
 * registers them with the map. Shape + glyph + color together identify a
 * category (never color alone, for accessibility).
 */

const TOKEN_VAR: Record<string, string> = {
  police: '--marker-police',
  fire: '--marker-fire',
  medical: '--marker-medical',
  court: '--marker-court',
  government: '--marker-government',
  safe: '--marker-safe',
}

function resolveColor(token: string): string {
  if (typeof window === 'undefined') return 'rgb(37 99 235)'
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(TOKEN_VAR[token] || '--marker-police')
    .trim()
  return raw ? `rgb(${raw})` : 'rgb(37 99 235)'
}

const GLYPHS: Record<SafetyCategory, string> = {
  police: '\u{1F6E1}',
  sheriff: '★',
  state_police: '\u{1F6E1}',
  fire_station: '\u{1F525}',
  ems: '✚',
  hospital: '✚',
  emergency_room: 'ER',
  courthouse: '⚖',
  government: '▦',
  shelter: '⌂',
  safe_place: '✓',
  pharmacy: '✚',
  urgent_care: '✚',
}

export function renderMarkerIcon(category: SafetyCategory, size = 56): ImageData | null {
  if (typeof document === 'undefined') return null
  const def = CATEGORIES[category]
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const color = resolveColor(def.colorToken)
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42

  ctx.save()
  // Shield silhouette for police-family markers; circle for everything else.
  if (def.colorToken === 'police') {
    drawShield(ctx, cx, cy, r)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = size * 0.08
  ctx.shadowOffsetY = size * 0.03
  ctx.fill()
  ctx.restore()

  ctx.lineWidth = size * 0.045
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'
  if (def.colorToken === 'police') {
    drawShield(ctx, cx, cy, r)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  const glyph = GLYPHS[category]
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${glyph.length > 1 ? size * 0.3 : size * 0.4}px system-ui, sans-serif`
  ctx.fillText(glyph, cx, cy + size * 0.02)

  return ctx.getImageData(0, 0, size, size)
}

function drawShield(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.quadraticCurveTo(cx + r, cy - r * 0.85, cx + r * 0.95, cy - r * 0.2)
  ctx.quadraticCurveTo(cx + r * 0.85, cy + r * 0.7, cx, cy + r)
  ctx.quadraticCurveTo(cx - r * 0.85, cy + r * 0.7, cx - r * 0.95, cy - r * 0.2)
  ctx.quadraticCurveTo(cx - r, cy - r * 0.85, cx, cy - r)
  ctx.closePath()
}

export function markerIconId(category: SafetyCategory): string {
  return `safety-marker-${category}`
}
