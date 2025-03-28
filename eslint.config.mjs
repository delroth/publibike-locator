import antfu from '@antfu/eslint-config'

export default antfu({
  solid: true,
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
  },
})
