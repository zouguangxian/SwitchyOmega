module.exports =
  web:
    tsconfig: './tsconfig.json'
    options:
      fast: 'never'
  web_omega:
    src: ['src/omega/**/*.ts']
    outDir: 'build/js/'
    options:
      module: 'none'
      target: 'ES2015'
      sourceMap: true
      declaration: false
      removeComments: false
      fast: 'never'

