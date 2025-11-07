module.exports =
  index:
    files:
      'index.js': 'dist/index.js'
    options:
      exclude: ['bluebird', 'jsondiffpatch', 'omega-pac']
      browserifyOptions:
        builtins: []
        standalone: 'index'
        debug: true
  browser:
    files:
      'omega_target.min.js': 'dist/index.js'
    options:
      alias: [
        './dist/index.js:OmegaTarget'
      ]
      plugin:
        if process.env.BUILD == 'release'
          [['minifyify', {map: false}]]
        else
          []
      browserifyOptions:
        standalone: 'OmegaTarget'
