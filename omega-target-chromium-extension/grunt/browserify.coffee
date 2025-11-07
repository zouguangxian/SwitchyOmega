path = require('path')
module.exports =
  index:
    files:
      'index.js': 'dist/index.js'
    options:
      exclude: ['bluebird', 'omega-pac', 'omega-target']
      browserifyOptions:
        builtins: []
        standalone: 'index'
        debug: true
  browser:
    files:
      'omega_target_chromium_extension.min.js': 'dist/index.js'
    options:
      alias: [
        './dist/index.js:OmegaTargetChromium'
      ]
      plugin:
        if process.env.BUILD == 'release'
          [['minifyify', {map: false}]]
        else
          []
      browserifyOptions:
        standalone: 'OmegaTargetChromium'
  omega_webext_proxy_script:
    files:
      'build/js/omega_webext_proxy_script.min.js':
        'src/js/omega_webext_proxy_script.js'
    options:
      alias:
        'omega-pac': 'omega-pac/omega_pac.min.js'
      plugin:
        if process.env.BUILD == 'release'
          [['minifyify', {map: false}]]
        else
          []
      browserifyOptions:
        noParse: [require.resolve('omega-pac/omega_pac.min.js')]
