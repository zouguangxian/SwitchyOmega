// Service Worker localStorage polyfill
const zeroLocalStorage = {
  _data: {},
  setItem: function(id, val) {
    return this._data[id] = String(val);
  },
  getItem: function(id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : null;
  },
  removeItem: function(id) {
    return delete this._data[id];
  },
  clear: function() {
    return this._data = {};
  }
};

Object.defineProperty(zeroLocalStorage, "length", {
  get: function() { return Object.keys(this._data).length; }
});

export default zeroLocalStorage; 