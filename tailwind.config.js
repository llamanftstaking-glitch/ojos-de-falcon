/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // All colors are design tokens (CSS variables) — see src/styles/globals.css.
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-overlay': 'rgb(var(--surface-overlay) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        safety: 'rgb(var(--safety) / <alpha-value>)',
        'safety-strong': 'rgb(var(--safety-strong) / <alpha-value>)',
        emergency: 'rgb(var(--emergency) / <alpha-value>)',
        hazard: 'rgb(var(--hazard) / <alpha-value>)',
        verified: 'rgb(var(--verified) / <alpha-value>)',
        falcon: 'rgb(var(--falcon) / <alpha-value>)',
      },
      borderRadius: {
        sheet: '1.25rem',
      },
      boxShadow: {
        float: '0 4px 24px rgb(0 0 0 / 0.18)',
        sheet: '0 -8px 32px rgb(0 0 0 / 0.22)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
