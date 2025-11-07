module.exports =
  grunt:
    options:
      reload: true
    files:
      'grunt/*'
    tasks: ['default']
  src:
    files: ['src/**/*.ts', 'test/**/*.ts', 'index.ts']
    tasks: ['default']
