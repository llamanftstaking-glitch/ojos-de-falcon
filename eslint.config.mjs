import next from 'eslint-config-next'

const config = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', '.data/**'],
  },
  // The React 19 compiler lints flag Date.now() in render/useMemo and the
  // standard debounced-search effect pattern as errors. Both are deliberate
  // here; revisit when the ecosystem rules stabilize.
  {
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default config
