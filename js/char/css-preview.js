// 眠花糖机 — MianIN 改样式的确认卡片里放一张缩小版的效果图（用户不要看代码、也不要跳过去来回看）：
// 用一个不跑脚本的小 iframe，带上小手机全部样式表，照真的结构摆一份聊天室（或桌面），套上新样式，缩小放进卡片

// 套用这个改动后，那个角色那个窗口的美化（和 runAction 的算法一样，只是不存）
function cssPreviewPart(a, c) {
  var drama = a.view === 'drama';
  var part = JSON.parse(JSON.stringify(viewLookPart(c, drama)));
  delete part._borrowed;
  part.customCss = assistantCssPatch(part.customCss, a);
  if (drama) part.look = Object.assign({}, part.look || {}, dramaLookPatch(a));
  if (typeof bubblePatch === 'function') part.bubble = Object.assign({}, DEFAULT_BUBBLE, part.bubble || {}, bubblePatch(a, drama));   // 顺便换的气泡
  if (typeof a.showAvatar === 'boolean') part.look = Object.assign({}, part.look || {}, { showAvatar: a.showAvatar });
  return part;
}
// 固定样例走普通消息渲染，无需读取用户的对话、附件或账目。
function cssPreviewMsgs(drama) {
  var start = new Date(2026, 0, 1, 15, 30).getTime();
  var messages = [
    { role: 'user', content: '给你看刚拍的照片。' },
    { role: 'user', imgSrc: 'icons/mianin.jpg' },
    { role: 'assistant', content: '好可爱，给你留个小心心。' },
    { role: 'assistant', voice: { dur: 6, transcriptStatus: 'model' }, transcript: '下次我们一起去拍照。' },
    { role: 'assistant', content: '小心心', sticker: { name: '小心心', url: 'icons/stickers/little-heart.png' } },
    { role: 'user', note: '你拍了拍对方' },
    { role: 'assistant', recalled: true },
    { role: 'user', privateCard: { kind: 'transfer', title: '奶茶钱', recipient: '对方', amount: 18.8, note: '今天我请', state: 'accepted' } },
    { role: 'assistant', privateCard: { kind: 'gift', title: '星星挂件', note: '路过时看到的，想送给你。', keeper: '留给你' } },
    { role: 'assistant', content: '周末见。', mcpLead: { entries: [{ tool: '读网页', state: 'done' }] } }
  ];
  if (drama) messages.unshift({ role: 'user', narr: true, content: '窗边落着细雨，她把一张照片放在桌上。' });
  return messages.map(function(message, index) {
    return Object.assign(message, { time: start + index * 12000, _floor: index + 1 });
  });
}
function cssPreviewSheets() {
  return Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"]'), function(l) { return '<link rel="stylesheet" href="' + l.href + '">'; }).join('');
}
// 聊天室：复制一份真的结构，把消息列表换成那个角色的几条
function cssPreviewRoomHtml(a, c) {
  var drama = a.view === 'drama', idx = charList.indexOf(c);
  var list = document.createElement('div');
  list.className = 'chat-msg-list';
  list.id = drama ? 'dramaMsgList' : 'chatMsgList';
  list._lookPreview = true;
  var empty = document.createElement('div');
  var keep = openingChatCharIdx;
  openingChatCharIdx = idx;   // 头像、名字、{{char}} 用那个角色的
  try { cssPreviewMsgs(drama).forEach(function(m) { renderHistMsg(m, list, empty); }); }
  finally { openingChatCharIdx = keep; }
  var room = appChatRoom.cloneNode(true);
  room.classList.add('active');
  room.classList.add('cr-qb-on');
  room.removeAttribute('style');
  room.querySelectorAll('.cr-status-panel, .cr-sp-mask, .cr-plus-panel:not(#crPlusPanel), .cr-select-bar, .stk-suggest, .cr-quote-bar, .mine-acc-overlay').forEach(function(el) { el.remove(); });
  room.querySelectorAll('.cr-view').forEach(function(v) { v.classList.toggle('active', (v.dataset.crview === 'contacts') === drama); });
  room.querySelector('#msgBtnChat').classList.toggle('active', !drama);
  room.querySelector('#msgBtnContacts').classList.toggle('active', drama);
  room.querySelector('#msgToggleSlider').classList.toggle('contacts', drama);
  var bar = room.querySelector('.chat-room-bottom');
  if (bar) { bar.classList.toggle('drama-mode', drama); bar.classList.remove('panel-open'); }
  var title = room.querySelector('.chat-room-title-text');
  if (title && title.firstElementChild) {
    title.firstElementChild.textContent = c.charAlias || c.charName || '';
    title.lastElementChild.textContent = '美化测试样例';
  }
  var draft = room.querySelector('#crInput');
  if (draft) { draft.textContent = ''; draft.value = ''; draft.readOnly = true; }
  var photo = list.querySelector('.img-bubble img');
  if (photo) { photo.width = 480; photo.height = 480; }
  var old = room.querySelector(drama ? '#dramaMsgList' : '#chatMsgList');
  if (old) old.parentNode.replaceChild(list, old);
  var other = room.querySelector(drama ? '#chatMsgList' : '#dramaMsgList');
  if (other) other.innerHTML = '';
  var part = cssPreviewPart(a, c);
  var look = Object.assign({}, DEFAULT_LOOK, part.look || {});
  room.classList.toggle('cr-no-avatar', !look.showAvatar);
  room.classList.toggle('cr-head-avatar', !!look.headAvatar);
  room.classList.toggle('cr-head-left', look.headAlign === 'left');
  room.classList.remove('cr-has-status');
  room.classList.toggle('is-group', !!c.isGroup);
  room.classList.toggle('no-drama', !!c.builtinAssistant);
  var qb = room.querySelector('#crQuickBar'), inNav = !!tplBgColor(part);
  room.classList.toggle('cr-qb-in-nav', inNav);
  if (qb) {
    qb.style.removeProperty('display');
    var host = room.querySelector(inNav ? '.settings-nav' : '#chatRoomContent');
    host.insertBefore(qb, inNav ? host.querySelector('.chat-room-right-wrap') : host.firstChild);
    qb.querySelector('#crQuickPop').replaceChildren();
    qb.querySelector('#crQuickPop').classList.remove('open');
    var sample = { api: '示例模型', cot: '轻量', preset: '示例预设', wb: '示例世界书' };
    qb.querySelectorAll('.cr-qb-chip').forEach(function(chip) {
      var key = chip.dataset.qb;
      chip.classList.remove('open');
      chip.style.display = (key === 'cot' && drama || key === 'preset' && !drama) ? 'none' : '';
      chip.querySelector('.cr-qb-val').textContent = sample[key] || '';
    });
  }
  var menu = room.querySelector('#crPlusPanel');
  if (menu) menu.classList.remove('open');
  room.querySelector('#crPlusBtn').classList.remove('active');
  var voice = room.querySelector('#voicePop');
  if (voice) voice.classList.remove('open');
  // 预览是把当前打开的聊天室复制一份。正在和小梦聊天时，底栏上的快捷工作栏是开着的，复制会把她的底栏带进别人的预览。
  // 点「应用」会把卡片重画一遍，于是预览又变回小梦的底栏。这里按要预览的那个人决定：只有预览小梦自己才留工作栏。
  var work = room.querySelector('#mianinWorkbar');
  if (work) {
    var own = !!c.builtinAssistant;
    work.hidden = !own;
    work.style.display = own ? '' : 'none';
    var workPanel = work.querySelector('#mianinWorkPanel');
    if (workPanel) workPanel.hidden = true;
  }
  paintCharAvatar(room.querySelector('#chatRoomHeadAv'), c);
  paintRoomBackground(room, part);
  return { room: room, css: lookCss(part, '#appChatRoom') + '\n' + (part.customCss || ''), global: globalCssForChat() };
}
// 全局样式：桌面（时钟、图标、程序坞）
function cssPreviewDeskHtml(a) {
  var phone = document.querySelector('.phone');
  var wrap = phone.cloneNode(false);
  ['.status-bar', '.wp-blur-layer', '.desktop', '.dock'].forEach(function(s) { var el = phone.querySelector(':scope > ' + s); if (el) wrap.appendChild(el.cloneNode(true)); });
  return { html: wrap.innerHTML, css: '', global: assistantCssPatch(globalCss, a), phoneStyle: phone.getAttribute('style') || '', phoneClass: phone.className };
}
function cssMiniPreview(a) {
  var c = (!a.target || a.target === 'global') ? null : findCharByName(a.target);
  if (a.target && a.target !== 'global' && !c) return null;
  var p;
  try { p = c ? cssPreviewRoomHtml(a, c) : cssPreviewDeskHtml(a); } catch (e) { console.warn('[Mphone] 预览没画出来:', e); return null; }
  var W = 390, H = 560, expandedHeight = 650;
  var shell = '<!doctype html><html><head><meta charset="utf-8"><base href="' + location.href.replace(/"/g, '') + '">' + cssPreviewSheets() +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}' +
    '.phone{transform:none!important;width:' + W + 'px!important;height:100vh!important;max-width:none!important;max-height:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;margin:0!important}' +
    '#appChatRoom{position:absolute!important;inset:0!important;transform:none!important;opacity:1!important;border-radius:0!important;transition:none!important}' +
    '*{animation:none!important;transition:none!important}</style>' +
    '<style>' + (p.global || '') + '</style><style>' + p.css + '</style></head><body>' +
    '<div class="' + (p.phoneClass ? p.phoneClass.replace(/"/g, '') : 'phone fullscreen') + '"' + (p.phoneStyle ? ' style="' + p.phoneStyle.replace(/"/g, '&quot;') + '"' : '') + '>';
  var tail = '</div></body></html>';
  var live = p.room ? cssPreviewLiveScript() : '';
  var doc = shell + (p.room ? p.room.outerHTML : p.html) + live + tail;
  var box = cssPreviewFrame(doc, H);
  var open = actionLookPreviewButton(function() {
    return cssPreviewFrame(doc, expandedHeight);
  }, !!p.room);
  open.className = 'cr-css-preview-open';
  var label = document.createElement('span');
  label.textContent = open.textContent;
  open.replaceChildren(label);
  box.appendChild(open);
  return box;
}

// 放大后的预览自己响应点击：点麦克风露出录音条（里面有「文」），点加号展开菜单。预览页不连真的录音。
function cssPreviewLiveScript() {
  return '<script>(function(){document.addEventListener("click",function(e){' +
    'var mic=e.target.closest("#crMicBtn"),plus=e.target.closest("#crPlusBtn");if(!mic&&!plus)return;e.preventDefault();' +
    'var voice=document.getElementById("voicePop"),panel=document.getElementById("crPlusPanel"),bar=document.getElementById("crBottomBar"),plusBtn=document.getElementById("crPlusBtn");' +
    'if(mic&&voice){var on=!voice.classList.contains("open");voice.classList.toggle("open",on);if(on&&panel){panel.classList.remove("open");if(bar)bar.classList.remove("panel-open");if(plusBtn)plusBtn.classList.remove("active");}}' +
    'if(plus&&panel){var show=!panel.classList.contains("open");panel.classList.toggle("open",show);if(bar)bar.classList.toggle("panel-open",show);if(plusBtn)plusBtn.classList.toggle("active",show);if(show&&voice)voice.classList.remove("open");}' +
    '});})();<\/script>';
}
function cssPreviewFrame(doc, height) {
  var box = document.createElement('div');
  box.className = 'cr-css-preview';
  box.style.setProperty('--look-preview-height', height + 'px');
  box.style.aspectRatio = '390 / ' + height;
  var frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('tabindex', '-1');
  frame.title = '美化效果';
  frame.srcdoc = doc;
  frame.addEventListener('load', function() { fitCssPreview(box); }, { once: true });
  box.appendChild(frame);
  requestAnimationFrame(function() { fitCssPreview(box); });
  return box;
}

function fitCssPreview(box) {
  if (!box || !box.clientWidth) return;
  box.firstElementChild.style.transform = 'scale(' + (parseFloat(getComputedStyle(box).width) / 390) + ')';
  box.classList.add('ready');
}

var actionLookPreview = document.getElementById('actionLookPreview');
var actionLookPreviewBody = document.getElementById('actionLookPreviewBody');
var actionLookPreviewClose = document.getElementById('actionLookPreviewClose');
var actionLookPreviewTools = document.getElementById('actionLookPreviewTools');
var actionLookPreviewMenu = document.getElementById('actionLookPreviewMenu');
var actionLookPreviewOrigin = null;
var activeLookPreview = null;

function actionLookPreviewButton(makePreview, hasMenu) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'cr-action-code-btn';
  button.textContent = '放大预览';
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', function(e) {
    e.stopPropagation();
    var preview = makePreview();
    if (!preview) return;
    actionLookPreviewOrigin = button;
    activeLookPreview = makePreview;
    actionLookPreviewTools.hidden = !hasMenu;
    actionLookPreview.classList.add('open');
    paintActionLookPreview(preview, false);
    actionLookPreviewClose.focus({ preventScroll: true });
  });
  return button;
}

function paintActionLookPreview(preview, menuOpen) {
  actionLookPreviewBody.replaceChildren(preview);
  fitCssPreview(preview.classList.contains('cr-css-preview') ? preview : null);
  actionLookPreviewBody.scrollTop = 0;
  actionLookPreviewMenu.setAttribute('aria-pressed', String(menuOpen));
  actionLookPreviewMenu.textContent = menuOpen ? '收起＋菜单' : '展开＋菜单';
}
actionLookPreviewMenu.addEventListener('click', function() {
  if (!activeLookPreview || actionLookPreviewTools.hidden) return;
  var open = actionLookPreviewMenu.getAttribute('aria-pressed') !== 'true';
  paintActionLookPreview(activeLookPreview(open), open);
});
function closeActionLookPreview() {
  actionLookPreview.classList.remove('open');
  actionLookPreviewBody.replaceChildren();
  if (actionLookPreviewOrigin && actionLookPreviewOrigin.isConnected) actionLookPreviewOrigin.focus({ preventScroll: true });
  actionLookPreviewOrigin = null;
  activeLookPreview = null;
}
actionLookPreviewClose.addEventListener('click', closeActionLookPreview);
closeOnBackdrop(actionLookPreview, closeActionLookPreview);
actionLookPreview.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeActionLookPreview();
});
window.addEventListener('resize', function() { fitCssPreview(actionLookPreviewBody.querySelector('.cr-css-preview')); });
