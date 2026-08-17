/**
 * The user-location marker IS the brand: a gold falcon, seen from above,
 * that rotates with the direction of travel. Replaces the generic blue dot.
 */

const FALCON_SVG = `
<svg width="46" height="46" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="falcon-gold" x1="32" y1="4" x2="32" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f7dd7a"/>
      <stop offset="0.45" stop-color="#e0b23a"/>
      <stop offset="1" stop-color="#a8770f"/>
    </linearGradient>
  </defs>
  <path
    d="M32 3
       C34.2 8.5 35.2 12.5 35.2 17.5
       L56 29.5 C58.2 30.8 59.5 32.6 59.5 35 L59.5 39
       L36.5 31.5
       L35.5 43.5 L43.5 50 L43.5 55 L33.8 51.2 L32 47.5 L30.2 51.2 L20.5 55 L20.5 50 L28.5 43.5
       L27.5 31.5
       L4.5 39 L4.5 35 C4.5 32.6 5.8 30.8 8 29.5 L28.8 17.5
       C28.8 12.5 29.8 8.5 32 3 Z"
    fill="url(#falcon-gold)"
    stroke="#160f02"
    stroke-width="2.5"
    stroke-linejoin="round"
  />
  <circle cx="32" cy="14" r="1.6" fill="#160f02"/>
</svg>`

/**
 * Build the DOM element for the falcon marker. The outer div carries the
 * gold GPS pulse ring; MapLibre applies rotation to the whole element.
 */
export function createFalconElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'falcon-pulse falcon-glow relative flex items-center justify-center'
  el.style.width = '46px'
  el.style.height = '46px'
  el.innerHTML = FALCON_SVG
  el.setAttribute('aria-label', 'Your location — gold falcon')
  return el
}
