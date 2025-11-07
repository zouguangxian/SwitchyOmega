module.exports = function(grunt) {
  const taskDesc = 'Convert gettext PO files to Chromium Extension messages format.';
  
  grunt.registerMultiTask('po2crx', taskDesc, function() {
    for (const f of this.files) {
      const result = {};
      
      for (const src of f.src) {
        const json = require('po2json').parseFileSync(src);
        
        for (const key in json) {
          if (!json.hasOwnProperty(key) || !key) continue;
          
          const value = json[key];
          let message = value[1];
          const refs = [];
          let matchCount = 0;
          
          message = message.replace(/\$(\d+:)?(\w+)\$/g, (_, order, ref) => {
            matchCount++;
            if (order) {
              order = parseInt(order);
            } else {
              order = matchCount;
            }
            /* TODO(catus): Shall we enable this warning?
            if (matchCount > 1) {
              grunt.log.writeln(`In this message: ${key}=${message}`);
              grunt.log.writeln('Order not specified for two or more refs in same message.');
            }
            */
            refs[order] = ref;
            return '$' + ref + '$';
          });
          
          let placeholders;
          if (!matchCount) {
            placeholders = undefined;
          } else {
            placeholders = {};
            for (let i = 0; i < refs.length; i++) {
              const placeholder = refs[i] || ('_unused_' + i);
              placeholders[placeholder] = { content: '$' + i };
            }
          }
          
          if (message === ' ') {
            message = '';
          }
          
          result[key] = {
            message: message,
            placeholders: placeholders
          };
        }
      }
      
      grunt.file.write(f.dest, JSON.stringify(result));
      grunt.log.writeln(`File "${f.dest}" created.`);
    }
  });
};

