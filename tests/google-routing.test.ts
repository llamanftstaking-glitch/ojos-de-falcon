import { describe, it, expect } from 'vitest'
import { decodePolyline } from '@/lib/routing/google'

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    // From Google's polyline algorithm docs:
    // (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toHaveLength(3)
    expect(points[0][1]).toBeCloseTo(38.5, 4)
    expect(points[0][0]).toBeCloseTo(-120.2, 4)
    expect(points[2][1]).toBeCloseTo(43.252, 4)
    expect(points[2][0]).toBeCloseTo(-126.453, 4)
  })

  it('returns [] for empty input', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
