/**
 * Brand configuration — isolated so the product can be renamed without
 * touching application code. Import from here; never hardcode the name.
 */
export const BRAND = {
  /** Full product name. */
  name: 'Ojos De Falcón',
  /** Short name for tight UI spaces. */
  shortName: 'Falcón',
  /** Positioning line. */
  tagline: 'Navigation with safety built in.',
  description:
    'A navigation platform where public-safety infrastructure — police, fire, hospitals, courts — is built directly into the map.',
} as const
