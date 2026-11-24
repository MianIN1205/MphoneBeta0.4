// 本地存储：同步读取内存，批量写入 IndexedDB，无法打开时使用 localStorage。
var mphoneStore = (function() {
  var DB_NAME = mphoneStoragePrefix + 'mphone', STORE = 'kv';
  var cache = Object.create(null);
  var dirty = new Set();
  var db = null;
  var flushTimer = null;
  var lastWrite = Promise.resolve();
  var restoring = null;
  var awaitingReload = false;
  var saveListeners = [];
  var warned = false;

  function warn() {
    if (warned) return;
    warned = true;
    setTimeout(function() {
      if (typeof showToast === 'function') showToast('✗ 存储空间不足或写入失败，部分数据未保存', 'error');
    }, 0);
  }

  function readLegacy() {
    var out = Object.create(null);
    try {
      mphoneLocal.keys().forEach(function(k) {
        if (k.indexOf('mphone_') !== 0) return;
        var raw = mphoneLocal.getItem(k);
        try { out[k] = JSON.parse(raw); } catch (_) { out[k] = raw; }
      });
    } catch (_) {}
    return out;
  }

  function openDb() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function() { req.result.createObjectStore(STORE); };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  }

  function readAll(conn) {
    return new Promise(function(resolve, reject) {
      var out = Object.create(null);
      var tx = conn.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).openCursor();
      req.onsuccess = function() {
        var cur = req.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
      };
      tx.oncomplete = function() { resolve(out); };
      tx.onabort = function() { reject(tx.error || new Error('无法读取本地数据')); };
    });
  }

  function writeIndexed(keys, values, replace) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = function() { resolve(); };
      tx.onabort = function() { reject(tx.error || new Error('无法写入本地数据')); };
      var store = tx.objectStore(STORE);
      try {
        if (replace) store.clear();
        keys.forEach(function(k) {
          if (values[k] === undefined) store.delete(k);
          else store.put(values[k], k);
        });
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  function writeLocal(key, value) {
    if (value === undefined) mphoneLocal.removeItem(key);
    else mphoneLocal.setItem(key, JSON.stringify(value));
  }

  // localStorage 没有事务。写入中途失败时，用原始文本逐项还原。
  function replaceLocal(data) {
    var keys = new Set(Object.keys(readLegacy()).concat(Object.keys(cache), Object.keys(data)));
    var previous = [];
    try {
      keys.forEach(function(k) {
        var raw = mphoneLocal.getItem(k);
        writeLocal(k, data[k]);
        previous.push([k, raw]);
      });
    } catch (err) {
      for (var i = previous.length - 1; i >= 0; i--) {
        var entry = previous[i];
        if (entry[1] === null) mphoneLocal.removeItem(entry[0]);
        else mphoneLocal.setItem(entry[0], entry[1]);
      }
      throw err;
    }
  }

  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (restoring || awaitingReload) return lastWrite;
    if (!dirty.size) return lastWrite;
    var keys = Array.from(dirty);
    dirty.clear();
    if (!db) {
      keys.forEach(function(k) {
        try { writeLocal(k, cache[k]); } catch (_) { dirty.add(k); warn(); }
      });
      return lastWrite;
    }
    lastWrite = writeIndexed(keys, cache, false).catch(function() {
      keys.forEach(function(k) { dirty.add(k); });
      warn();
    });
    return lastWrite;
  }

  function scheduleFlush() {
    if (!restoring && !flushTimer) flushTimer = setTimeout(flush, 250);
  }

  function replaceAll(data) {
    if (restoring || awaitingReload) return Promise.reject(new Error('正在恢复另一份备份'));
    clearTimeout(flushTimer);
    flushTimer = null;
    restoring = lastWrite.then(function() {
      var before = dirty;
      dirty = new Set();
      return Promise.resolve().then(function() {
        if (db) return writeIndexed(Object.keys(data), data, true);
        replaceLocal(data);
      }).then(function() {
        // 当前界面仍持有恢复之前的对象。刷新前的后台保存不能覆盖刚恢复的数据。
        awaitingReload = true;
        dirty.clear();
        cache = data;
      }, function(err) {
        before.forEach(function(k) { dirty.add(k); });
        throw err;
      });
    }).finally(function() {
      restoring = null;
      if (dirty.size) scheduleFlush();
    });
    return restoring;
  }

  document.addEventListener('visibilitychange', function() { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  return {
    init: function() {
      return openDb().then(function(conn) {
        db = conn;
        return readAll(conn);
      }).then(function(all) {
        cache = all;
        // 仅在首次使用 IndexedDB 时迁入旧数据，保留 localStorage 原件。
        if (!Object.keys(all).length) {
          cache = readLegacy();
          if (!Object.keys(cache).length) return;
          return writeIndexed(Object.keys(cache), cache, false).catch(warn);
        }
      }).then(function() {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function() {});
      }).catch(function() {
        if (db) db.close();
        db = null;
        cache = readLegacy();
      });
    },
    load: function(key, def) {
      return cache[key] === undefined ? def : cache[key];
    },
    save: function(key, val, options) {
      if (awaitingReload) return false;
      // trusted: 调用方保证 val 不会再被外部修改，可跳过深拷贝
      if (options && options.trusted) {
        cache[key] = val;
      } else {
        cache[key] = val === undefined ? undefined : JSON.parse(JSON.stringify(val));
      }
      dirty.add(key);
      scheduleFlush();
      saveListeners.forEach(function(fn) { fn(key); });
      return true;
    },
    remove: function(key) {
      if (awaitingReload) return;
      cache[key] = undefined;
      dirty.add(key);
      scheduleFlush();
    },
    onSave: function(fn) { saveListeners.push(fn); },
    keys: function() {
      return Object.keys(cache).filter(function(k) { return cache[k] !== undefined; });
    },
    replaceAll: replaceAll,
    usingIndexedDB: function() { return !!db; },
    flush: flush,
    hasPending: function(key) { return dirty.has(key); }
  };
})();
