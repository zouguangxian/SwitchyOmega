// IndexedDB polyfill for Firefox private mode
export default function ZeroIndexedDBFactory() {
  const fakeIDB = {
    open: function() {
      const request = {
        error: null,
        source: null,
        transaction: null,
        readyState: 'pending',
        result: null,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null
      };
      
      setTimeout(() => {
        request.readyState = 'done';
        request.result = {
          name: 'fake',
          version: 1,
          objectStoreNames: [],
          close: () => {},
          transaction: () => ({
            objectStore: () => ({
              put: () => ({
                onsuccess: null,
                onerror: null
              }),
              get: () => ({
                onsuccess: null,
                onerror: null
              }),
              delete: () => ({
                onsuccess: null,
                onerror: null
              })
            })
          }),
          createObjectStore: () => ({
            createIndex: () => {}
          })
        };
        if (request.onsuccess) {
          request.onsuccess({target: request});
        }
      }, 0);
      
      return request;
    },
    deleteDatabase: function() {
      return {
        onsuccess: null,
        onerror: null
      };
    }
  };

  // Replace global indexedDB with fake version
  Object.defineProperty(window, 'indexedDB', {
    get: function() { return fakeIDB; },
    configurable: true
  });
} 