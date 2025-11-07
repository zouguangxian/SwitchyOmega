module.exports =
  default: [
    'copy'
    'po2crx'
  ]
  test: ['mochaTest']
  release: ['default', 'chromium-manifest', 'compress']
