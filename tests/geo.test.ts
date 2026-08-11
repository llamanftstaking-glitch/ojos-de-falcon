import { describe, it, expect } from 'vitest'
import {
  haversineMeters,
  nearestPointOnLine,
  lineLengthMeters,
  lineBBox,
  bboxAround,
  formatMiles,
  type LngLat,
} from '@/lib/geo'

const TIMES_SQUARE: LngLat = [-73.9855, 40.758]
const GRAND_CENTRAL: LngLat = [-73.9772, 40.7527]

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(TIMES_SQUARE, TIMES_SQUARE)).toBe(0)
  })

  it('matches known distance Times Square → Grand Central (~900m)', () => {
    const d = haversineMeters(TIMES_SQUARE, GRAND_CENTRAL)
    expect(d).toBeGreaterThan(800)
    expect(d).toBeLessThan(1100)
  })
})

describe('nearestPointOnLine', () => {
  const line: LngLat[] = [
    [-74.0, 40.7],
    [-74.0, 40.8], // due north, ~11.1 km
  ]

  it('projects a point beside the line onto it', () => {
    const point: LngLat = [-73.99, 40.75] // east of the midpoint
    const result = nearestPointOnLine(point, line)
    // ~845m east of the line at this latitude
    expect(result.distanceMeters).toBeGreaterThan(700)
    expect(result.distanceMeters).toBeLessThan(1000)
    // Roughly halfway along the ~11.1km line
    expect(result.alongMeters).toBeGreaterThan(5000)
    expect(result.alongMeters).toBeLessThan(6200)
  })

  it('clamps to endpoints for points beyond the line', () => {
    const before: LngLat = [-74.0, 40.65]
    const result = nearestPointOnLine(before, line)
    expect(result.alongMeters).toBe(0)
  })

  it('handles empty and single-point lines', () => {
    expect(nearestPointOnLine([-74, 40.7], []).distanceMeters).toBe(Infinity)
    const single = nearestPointOnLine([-74, 40.7], [[-74, 40.71]])
    expect(single.distanceMeters).toBeGreaterThan(1000)
  })
})

describe('lineLengthMeters', () => {
  it('sums segment lengths', () => {
    const length = lineLengthMeters([
      [-74.0, 40.7],
      [-74.0, 40.8],
    ])
    expect(length).toBeGreaterThan(11000)
    expect(length).toBeLessThan(11300)
  })
})

describe('bbox helpers', () => {
  it('bboxAround contains the center', () => {
    const bbox = bboxAround(TIMES_SQUARE, 1000)
    expect(bbox.west).toBeLessThan(TIMES_SQUARE[0])
    expect(bbox.east).toBeGreaterThan(TIMES_SQUARE[0])
    expect(bbox.south).toBeLessThan(TIMES_SQUARE[1])
    expect(bbox.north).toBeGreaterThan(TIMES_SQUARE[1])
  })

  it('lineBBox pads correctly', () => {
    const tight = lineBBox([TIMES_SQUARE, GRAND_CENTRAL])
    const padded = lineBBox([TIMES_SQUARE, GRAND_CENTRAL], 500)
    expect(padded.west).toBeLessThan(tight.west)
    expect(padded.north).toBeGreaterThan(tight.north)
  })
})

describe('formatMiles', () => {
  it('uses feet for very short distances', () => {
    expect(formatMiles(50)).toContain('ft')
  })
  it('uses miles otherwise', () => {
    expect(formatMiles(1609.344)).toBe('1.0 mi')
  })
})
