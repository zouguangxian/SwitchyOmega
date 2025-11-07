module.exports = {
  grunt: {
    options: {
      reload: true
    },
    files: ['grunt/*'],
    tasks: ['default']
  },
  po2crx_locales: {
    files: ['../omega-locales/**/*'],
    tasks: ['po2crx:locales']
  },
  copy_web: {
    files: ['node_modules/omega-web/build/**/*'],
    tasks: ['copy:web']
  },
  copy_target: {
    files: ['node_modules/omega-target/omega_target.min.js'],
    tasks: ['copy:target']
  },
  copy_overlay: {
    files: ['overlay/**/*'],
    tasks: ['copy:overlay']
  },
  copy_target_popup: {
    files: ['src/js/omega_target_popup.js'],
    tasks: ['copy:target_popup']
  },
  typescript: {
    files: ['src/**/*.ts', 'index.ts'],
    tasks: ['copy:target_self']
  }
};

