// 眠花糖机 — 启动：还原边框模式、加载功能模块、注册离线缓存。

// 外观模式按设备记住。首次打开时，窄屏贴边，电脑和平板用竖屏边框。
var mphoneFullViewport = matchMedia('(max-width: 560px) and (orientation: portrait)');
var mphoneLayoutKey = 'mphoneLayout03';
var mphoneLayoutChoice = null;
try { mphoneLayoutChoice = mphoneLocal.getItem(mphoneLayoutKey); } catch (_) {}
function mphoneUsesFullscreen() {
  return mphoneLayoutChoice === null ? mphoneFullViewport.matches : mphoneLayoutChoice === 'full';
}

var mphoneInitialFull = mphoneUsesFullscreen();
document.querySelector('.phone').classList.toggle('fullscreen', mphoneInitialFull);
document.body.classList.toggle('phone-fullscreen', mphoneInitialFull);

// 版本号：index.html 里的样式、boot.js 和下面加载的脚本网址都带 ?v=这个数，sw.js 里也是同一个（改了东西推之前跑 tools/bump-version.py 一起加一）。
// 这样新的页面只会要新版本的文件、旧页面只要旧的，不会像以前网慢时那样新页面配上手机里存的旧脚本（外观里图标预设空着，用户遇到过）
var MPHONE_V = '175';
// 存储就绪后，按顺序加载各功能脚本（普通脚本，直接打开本地文件也能用）
var MPHONE_SCRIPTS = [
  "js/core/utils.js",
  "js/core/backup-format.js",
  "js/desk/statusbar.js",
  "js/settings/api.js",
  "js/settings/meal.js",
  "js/core/api-errors.js",
  "js/desk/screens.js",
  "js/desk/appearance.js",
  "js/chat/tabs.js",
  "js/desk/bookshelf.js",
  "js/chat/header.js",
  "js/chat/room-view.js",
  "js/char/settings.js",
  "js/chat/contacts.js",
  "js/chat/new-chat.js",
  "js/char/settings-save.js",
  "js/chat/list.js",
  "js/chat/room.js",
  "js/char/look.js",
  "js/prompt/tabs.js",
  "js/prompt/worldbook.js",
  "js/prompt/cot.js",
  "js/prompt/style-lib.js",
  "js/prompt/presets.js",
  "js/prompt/scene.js",
  "js/core/image-picker.js",
  "js/desk/appearance-store.js",
  "js/settings/data.js",
  "js/settings/api-restore.js",
  "js/chat/history.js",
  "js/chat/history-read.js",
  "js/chat/prompt.js",
  "js/chat/render.js",
  "js/chat/reply.js",
  "js/chat/input.js",
  "js/chat/voice.js",
  "js/chat/room-lists.js",
  "js/chat/private-plus.js",
  "js/chat/mine.js",
  "js/chat/feed.js",
  "js/chat/moments.js",
  "js/char/auto.js",
  "js/char/summary.js",
  "js/char/backup.js",
  "js/char/import.js",
  "js/desk/memory-open.js",
  "js/settings/media-api.js",
  "js/chat/wallet-fav.js",
  "js/chat/msg-menu.js",
  "js/chat/media-send.js",
  "js/chat/file-send.js",
  "js/chat/compose-plus.js",
  "js/chat/img-use.js",
  "js/char/look-share.js",
  "js/desk/desk-icons.js",
  "js/desk/letters.js",
  "js/desk/pair-notes.js",
  "js/desk/greenhouse.js",
  "js/desk/starjar.js",
  "js/desk/books.js",
  "js/char/life.js",
  "js/chat/msg-shot.js",
  "js/char/css-preview.js",
  "js/chat/peek.js",
  "js/core/image-viewer.js",
  "js/char/assistant.js",
  "js/settings/assist.js",
  "js/core/llm.js",
  "js/core/mcp.js",
  "js/core/mcp-builtin.js",
  "js/desk/tarot.js",
  "js/desk/gallery.js",
  "js/desk/anniv.js",
  "js/desk/diary.js",
  "js/desk/widgets.js",
  "js/char/memory.js",
  "js/char/memory-days.js",
  "js/desk/memory-lib.js",
  "js/desk/memory-import.js",
  "js/desk/memory-hub.js",
  "js/char/archive.js",
  "js/char/migrate.js",
  "js/prompt/wb-import.js",
  "js/prompt/wb-builtin.js",
  "js/chat/quick-bar.js",
  "js/chat/status-panel.js",
  "js/chat/stickers.js",
  "js/chat/msg-ops.js",
  "js/settings/backup.js",
  "js/settings/transfer.js",
  "js/chat/calendar.js",
  "js/chat/opening.js",
  "js/desk/places.js",
  "js/desk/pet.js",
  "js/chat/assets.js",
  "js/chat/group.js",
  "js/chat/group-play.js",
  "js/settings/whatsnew.js",
  "js/desk/blindbox.js",
  "js/core/errors.js"
];

// 要等全部脚本执行完才能跑的初始化（会用到后面脚本里的函数），用 onMphoneReady 登记
var mphoneReadyFns = [];
function onMphoneReady(fn) { mphoneReadyFns.push(fn); }

// 桌面就绪后马上让载入页淡出，弹窗等桌面露出再检查。
var finishBootReveal;
var mphoneBootVisible = new Promise(function(resolve) { finishBootReveal = resolve; });
function hideBootSplash() {
  clearTimeout(bootSplashFallback);
  var el = document.getElementById('bootSplash');
  if (!el) { finishBootReveal(); return; }
  if (el.classList.contains('hide')) return;
  el.classList.add('hide');
  setTimeout(function() {
    el.remove();
    finishBootReveal();
  }, 200);
}
var bootSplashFallback = setTimeout(hideBootSplash, 10000);

mphoneStore.init().then(function() {
  MPHONE_SCRIPTS.forEach(function(src, i) {
    var s = document.createElement('script');
    s.src = src + '?v=' + MPHONE_V;
    s.async = false;   // 动态插入的脚本按插入顺序执行
    s.onerror = function() {
      console.error('[Mphone] 功能脚本加载失败:', src);
      if (i === MPHONE_SCRIPTS.length - 1) hideBootSplash();
    };
    if (i === MPHONE_SCRIPTS.length - 1) s.onload = function() {
      mphoneReadyFns.forEach(function(fn) { try { fn(); } catch (e) { console.error(e); } });
      hideBootSplash();
    };
    document.body.appendChild(s);
  });
});

// 注册后台缓存程序：可安装为桌面程序、断网也能打开（直接打开本地文件时浏览器不支持，跳过）
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function(err) {
      console.warn('[Mphone] 后台缓存程序注册失败:', err);
    });
  });
}

