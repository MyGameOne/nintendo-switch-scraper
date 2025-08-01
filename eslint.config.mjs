import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  stylistic: {
    overrides: {
      'no-console': 'off',
    },
  },
  vue: false,
  jsonc: true,
  jsx: false,
  yaml: false,
  toml: true,
  ignores: [

  ],
})
