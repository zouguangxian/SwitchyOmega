module.exports =
  grunt:
    options:
      reload: true
    files:
      'grunt/*'
    tasks: ['default']
  copy_pac:
    files:
      'node_modules/omega-pac/omega_pac.min.js'
    tasks: 'copy:pac'
  copy_lib:
    files:
      'lib/**/*'
    tasks: 'copy:lib'
  copy_img:
    files:
      'img/**/*'
    tasks: 'copy:img'
  copy_popup:
    files:
      'src/popup/**/*'
    tasks: 'copy:popup'
  jade:
    files: ['src/**/*.jade']
    tasks: 'jade'
  less:
    files:
      'src/less/**/*.less'
    tasks: ['less', 'autoprefixer']
  ts:
    files: [
      'src/coffee/**/*.ts'
      'src/omega/**/*.ts'
    ]
    tasks: ['ts']
