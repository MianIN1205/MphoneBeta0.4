// 眠花糖机 后台缓存程序（Service Worker）
// 首页快速检查更新，已缓存的版本化脚本、样式与图标直接从本地读取。
// 只处理本站文件，AI / 语音 / 生图等外部接口请求完全不经过这里。

// 文件拆分后 css/、js/ 也要预先缓存；改动这个列表时把版本号加一
const V = '179';   // 和 index.html、js/core/boot.js 里的版本号一样，用 tools/bump-version.py 一起改
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = SCOPE.pathname === '/' ? 'mphone-v' : 'mphone:' + SCOPE.pathname + ':v';
const CACHE = CACHE_PREFIX + V;
const CSS = ['core/base', 'core/app-screen', 'core/controls', 'core/avatar', 'core/image-picker',
             'desk/statusbar', 'desk/desktop', 'desk/iconsets', 'desk/widgets', 'desk/appearance', 'desk/bookshelf',
             'settings/settings', 'settings/mcp', 'desk/desk-apps', 'desk/memory-lib', 'core/dialogs',
             'chat/tabs', 'chat/header', 'chat/contacts', 'chat/list', 'chat/new-chat',
             'chat/feed', 'char/settings', 'chat/mine', 'chat/room', 'chat/messages',
             'chat/msg-menu', 'chat/msg-ops', 'chat/calendar', 'chat/quick-bar', 'chat/status-panel',
             'chat/stickers', 'char/look', 'char/assistant', 'prompt/prompt', 'desk/pet', 'chat/file-send', 'chat/peek', 'desk/places', 'desk/books', 'desk/blindbox', 'chat/group']
  .concat('desk/pair-notes', 'desk/tarot').map(function (n) { return './css/' + n + '.css?v=' + V; });
const JS = ['core/store', 'core/boot', 'core/utils', 'core/backup-format', 'desk/statusbar', 'settings/api', 'core/api-errors',
            'desk/screens', 'desk/appearance', 'chat/tabs', 'desk/bookshelf', 'chat/header',
            'chat/room-view', 'char/settings', 'chat/contacts', 'chat/new-chat', 'char/settings-save',
            'chat/list', 'chat/room', 'char/look', 'prompt/tabs', 'prompt/worldbook',
            'prompt/cot', 'prompt/style-lib', 'prompt/presets', 'prompt/scene', 'core/image-picker', 'desk/appearance-store',
            'settings/data', 'settings/api-restore', 'chat/history', 'chat/history-read', 'chat/prompt', 'chat/render',
            'chat/reply', 'chat/input', 'chat/voice', 'chat/room-lists', 'chat/private-plus', 'chat/mine',
            'chat/feed', 'char/auto', 'char/summary', 'char/backup', 'char/import',
            'desk/memory-open', 'desk/memory-hub', 'settings/media-api', 'settings/meal', 'chat/wallet-fav', 'chat/msg-menu', 'chat/media-send', 'chat/file-send', 'chat/compose-plus', 'chat/img-use', 'char/look-share', 'desk/desk-icons', 'chat/msg-shot', 'char/css-preview', 'chat/peek',
            'core/image-viewer', 'char/assistant', 'settings/assist', 'core/llm', 'core/mcp', 'core/mcp-builtin',
            'desk/gallery', 'desk/anniv', 'desk/diary', 'desk/widgets', 'char/memory',
            'desk/memory-lib', 'desk/memory-import', 'chat/quick-bar', 'chat/status-panel', 'chat/stickers', 'chat/msg-ops',
            'settings/backup', 'chat/calendar', 'core/errors', 'char/archive', 'chat/opening', 'desk/places', 'desk/pet', 'chat/assets', 'chat/group', 'chat/group-play', 'settings/whatsnew', 'prompt/wb-builtin', 'desk/blindbox', 'desk/letters', 'desk/greenhouse', 'desk/starjar', 'desk/books', 'chat/moments', 'char/life', 'char/migrate', 'prompt/wb-import', 'settings/transfer']
  .concat('desk/pair-notes', 'desk/tarot', 'char/memory-days').map(function (n) { return './js/' + n + '.js?v=' + V; });
const CORE = ['./', './index.html', './manifest.webmanifest',
              './icons/icon.png', './icons/logo.png', './icons/badge.png', './icons/mianin.jpg',
              './icons/stickers/little-heart.png', './icons/stickers/happy-face.png']
  .concat(CSS, JS)
  .concat(Array.from({ length: 28 }, function (_, i) {
    return './icons/stickers/emoji-' + String(i + 3).padStart(2, '0') + '.png';
  }))
  .concat(['paper', 'soft'].reduce(function (a, s) {   // 桌面图标风格（css/desk/iconsets.css）
    return a.concat(['notes', 'memory', 'greenhouse', 'starjar', 'lighthouse', 'meet', 'pet', 'letters', 'settings', 'appearance', 'chat', 'prompt']
      .map(function (n) { return './icons/desk/' + s + '/' + n + '.png'; }));
  }, []));

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 取文件：网快的时候先拿网上最新的（推了新版本刷新就能看到）；网慢的时候直接用手机里存的，同时在后台悄悄更新。
// 不开梯子时 github.io 很慢，以前每个文件都先等网络，一百多个文件挨个等，载入特别卡、桌面半天出不来（用户反馈过）。
// 打开页面时看一眼网速：首页 NET_WAIT 毫秒内拿不到就算网慢，这次打开剩下的文件都先用存的；中途哪个文件超时也切成网慢
var NET_WAIT = 900;
var netSlow = false;
function putCache(req, res) {
  if (res && res.ok && !res.redirected) {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { return cache.put(req, copy); }).catch(function () {});
  }
  return res;
}
function fromNet(req) { return fetch(req, { cache: 'no-store' }).then(function (res) { return putCache(req, res); }); }
function fromCache(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      return hit || (req.mode === 'navigate' ? cache.match('./index.html') : null);
    });
  });
}
// 先等网络，等太久（或者出错）就用存的；网络后来回来了照样存进去
function netFirst(req) {
  return new Promise(function (resolve) {
    var done = false, net = fromNet(req);
    function useCache() {
      fromCache(req).then(function (hit) {
        if (done) return;
        if (hit) { done = true; resolve(hit); }
        else net.then(function (res) { if (!done) { done = true; resolve(res); } }, function () { if (!done) { done = true; resolve(Response.error()); } });
      });
    }
    var timer = setTimeout(function () { netSlow = true; useCache(); }, NET_WAIT);
    net.then(function (res) {
      clearTimeout(timer);
      if (done) return;
      if (res && (res.ok || res.redirected || res.status === 401 || res.status === 403)) { done = true; resolve(res); } else useCache();
    }, function () { clearTimeout(timer); netSlow = true; useCache(); });
  });
}
// 先用存的，后台更新；手机里没存过才等网络
function cacheFirst(req) {
  var net = fromNet(req).catch(function () { return null; });
  return fromCache(req).then(function (hit) { return hit || net.then(function (res) { return res || Response.error(); }); });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== SCOPE.origin || url.pathname.indexOf(SCOPE.pathname) !== 0) return;
  var file = url.pathname.slice(SCOPE.pathname.length);
  if (file && file !== 'index.html' && file !== 'manifest.webmanifest' && !/^(css|js|lib|icons)\//.test(file)) return;
  if ((url.searchParams.has('v') && /^(css|js)\//.test(file)) || /^icons\//.test(file)) {
    event.respondWith(fromCache(req).then(function (hit) { return hit || fromNet(req); }));
    return;
  }
  if (req.mode === 'navigate') netSlow = false;   // 每次打开重新看网速
  event.respondWith(netSlow ? cacheFirst(req) : netFirst(req));
});

// 点系统通知：已经开着就切回去并打开对应对话；没开着就打开应用，网址里带上要打开的对话
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i] && new URL(list[i].url).pathname.indexOf(SCOPE.pathname) === 0) {
        list[i].postMessage({ type: 'mphone-open', open: data.open, charId: data.charId, postId: data.postId, commentId: data.commentId });
        return list[i].focus();
      }
    }
    var q = new URLSearchParams({ open: data.open || 'chat' });
    if (data.charId) q.set('char', data.charId);
    if (data.postId) q.set('post', data.postId);
    if (data.commentId) q.set('comment', data.commentId);
    return self.clients.openWindow('./?' + q.toString());
  }));
});
