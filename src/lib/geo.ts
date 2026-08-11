/**
 * Geographic math used across the platform. All distances in meters,
 * coordinates as [longitude, latitude] (GeoJSON order) unless noted.
 */

export type LngLat = [number, number]

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

const EARTH_RADIUS_M = 6371008.8

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in meters. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function metersToMiles(m: number): number {
  return m / 1609.344
}

export function formatMiles(m: number): string {
  const mi = metersToMiles(m)
  if (mi < 0.1) return `${Math.round(m * 3.28084)} ft`
  return `${mi.toFixed(1)} mi`
}

/** Expand a point into a bounding box with the given radius (meters). */
export function bboxAround(center: LngLat, radiusMeters: number): BBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const lngDelta = latDelta / Math.max(0.01, Math.cos(toRad(center[1])))
  return {
    west: center[0] - lngDelta,
    south: center[1] - latDelta,
    east: center[0] + lngDelta,
    north: center[1] + latDelta,
  }
}

/**
 * Local equirectangular projection of a point, in meters relative to an
 * origin. Accurate enough over route-scale distances (< ~100 km).
 */
function projectLocal(p: LngLat, origin: LngLat): [number, number] {
  const x = toRad(p[0] - origin[0]) * EARTH_RADIUS_M * Math.cos(toRad(origin[1]))
  const y = toRad(p[1] - origin[1]) * EARTH_RADIUS_M
  return [x, y]
}

export interface PointOnLine {
  /** Distance from the point to the nearest position on the polyline (m). */
  distanceMeters: number
  /** Distance along the polyline from its start to that position (m). */
  alongMeters: number
  /** Index of the segment on which the nearest position lies. */
  segmentIndex: number
}

/**
 * Nearest position on a polyline to a point. Used by the route-safety
 * engine to compute distance-from-route and distance-ahead.
 */
export function nearestPointOnLine(point: LngLat, line: LngLat[]): PointOnLine {
  if (line.length === 0) {
    return { distanceMeters: Infinity, alongMeters: 0, segmentIndex: 0 }
  }
  if (line.length === 1) {
    return { distanceMeters: haversineMeters(point, line[0]), alongMeters: 0, segmentIndex: 0 }
  }

  const origin = line[0]
  const p = projectLocal(point, origin)
  let best: PointOnLine = { distanceMeters: Infinity, alongMeters: 0, segmentIndex: 0 }
  let cumulative = 0

  for (let i = 0; i < line.length - 1; i++) {
    const a = projectLocal(line[i], origin)
    const b = projectLocal(line[i + 1], origin)
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const segLen = Math.hypot(abx, aby)
    let t = 0
    if (segLen > 0) {
      t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (segLen * segLen)
      t = Math.max(0, Math.min(1, t))
    }
    const cx = a[0] + t * abx
    const cy = a[1] + t * aby
    const dist = Math.hypot(p[0] - cx, p[1] - cy)
    if (dist < best.distanceMeters) {
      best = {
        distanceMeters: dist,
        alongMeters: cumulative + segLen * t,
        segmentIndex: i,
      }
    }
    cumulative += segLen
  }
  return best
}

/** Total length of a polyline in meters. */
export function lineLengthMeters(line: LngLat[]): number {
  let total = 0
  for (let i = 0; i < line.length - 1; i++) {
    total += haversineMeters(line[i], line[i + 1])
  }
  return total
}

/** Bounding box of a polyline, optionally padded by meters. */
export function lineBBox(line: LngLat[], padMeters = 0): BBox {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of line) {
    west = Math.min(west, lng)
    south = Math.min(south, lat)
    east = Math.max(east, lng)
    north = Math.max(north, lat)
  }
  if (padMeters > 0 && Number.isFinite(west)) {
    const midLat = (south + north) / 2
    const latDelta = (padMeters / EARTH_RADIUS_M) * (180 / Math.PI)
    const lngDelta = latDelta / Math.max(0.01, Math.cos(toRad(midLat)))
    west -= lngDelta
    east += lngDelta
    south -= latDelta
    north += latDelta
  }
  return { west, south, east, north }
}

/** Rough driving-time estimate in minutes for a distance, urban speeds. */
export function estimateDriveMinutes(meters: number): number {
  const avgSpeedMps = 8.9 // ~20 mph urban average
  return Math.max(1, Math.round(meters / avgSpeedMps / 60))
}

/** Rough walking-time estimate in minutes. */
export function estimateWalkMinutes(meters: number): number {
  const walkSpeedMps = 1.35
  return Math.max(1, Math.round(meters / walkSpeedMps / 60))
}
