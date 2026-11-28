// 眠花糖机 — 打开聊天室：画聊天和剧情两个列表（分页加载更早的）、相册发图、加号抽屉按钮

// 打开对话室时初始化消息列表与剧情列表，并绑定底栏相册图片按钮与加号扩展面板
(function() {
  var crAlbumBtn       = document.getElementById('crAlbumBtn');
  var crAlbumFileInput = document.getElementById('crAlbumFileInput');
  var chatRoomContent  = document.getElementById('chatRoomContent');

  // 点击剧情底栏「图片」按钮 → 打开设备相册发送图片
  if (crAlbumBtn && crAlbumFileInput) {
    // 相册：弹出「照片 / 拍照 / 文字图片」三选一（js/chat/compose-plus.js）
    crAlbumBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof openAlbumPick === 'function') openAlbumPick(crAlbumBtn);
      else { crAlbumFileInput.value = ''; crAlbumFileInput.click(); }
    });

    crAlbumFileInput.addEventListener('change', function() { sendPickedImage(this.files); });   // 能多选
  }
})();
var CHAT_PHOTO_LIMIT = 14;
// 设备相册选超了，回到小手机确认要发的图片。
function confirmPickedImages(items, onSend) {
  var srcs = items.map(function(item) { return URL.createObjectURL(item.file); });
  var selected = new Set(items.slice(0, CHAT_PHOTO_LIMIT));
  var ov = document.createElement('div');
  ov.className = 'mine-acc-overlay open';
  ov.style.zIndex = '2600';
  ov.innerHTML = '<div class="mine-acc-modal pick-modal"><div class="mine-acc-title pick-title"></div>' +
    '<div class="pick-hint" role="status"></div><div class="pick-grid"></div>' +
    '<div class="mine-acc-actions"><button class="mine-acc-btn mine-acc-btn-close">取消</button><button class="mine-acc-btn mine-acc-btn-add">发送</button></div></div>';
  var grid = ov.querySelector('.pick-grid'), sendBtn = ov.querySelector('.mine-acc-btn-add');
  var checks = [];
  var sync = function() {
    var n = selected.size;
    ov.querySelector('.pick-title').textContent = '已选 ' + n + ' / ' + CHAT_PHOTO_LIMIT + ' 张';
    ov.querySelector('.pick-hint').textContent = n === CHAT_PHOTO_LIMIT
      ? '相册选了 ' + items.length + ' 张，取消一张可换选'
      : '一次最多发送 ' + CHAT_PHOTO_LIMIT + ' 张';
    checks.forEach(function(mark, index) {
      var on = selected.has(items[index]);
      mark.setAttribute('aria-pressed', String(on));
      mark.parentElement.classList.toggle('on', on);
      mark.disabled = !on && n >= CHAT_PHOTO_LIMIT;
    });
    sendBtn.textContent = '发送（' + n + '）';
    sendBtn.disabled = !n;
  };
  srcs.forEach(function(src, i) {
    var cell = document.createElement('div');
    cell.className = 'pick-cell';
    var view = document.createElement('button');
    view.type = 'button';
    view.className = 'pick-zoom';
    view.setAttribute('aria-label', '预览第 ' + (i + 1) + ' 张图片');
    var img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy';
    view.appendChild(img);
    view.addEventListener('click', function() { openImgViewer(src, { preview: true }); });
    cell.appendChild(view);
    var mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'pick-check';
    mark.setAttribute('aria-label', '选择第 ' + (i + 1) + ' 张图片');
    mark.addEventListener('click', function() {
      if (!selected.delete(items[i]) && selected.size < CHAT_PHOTO_LIMIT) selected.add(items[i]);
      sync();
    });
    checks.push(mark);
    cell.appendChild(mark);
    grid.appendChild(cell);
  });
  sync();
  var close = function() { ov.remove(); srcs.forEach(function(src) { URL.revokeObjectURL(src); }); };
  ov.querySelector('.mine-acc-btn-close').addEventListener('click', close);
  sendBtn.addEventListener('click', function() { close(); onSend(items.filter(function(item) { return selected.has(item); })); });
  ov.addEventListener('click', function(e) { if (e.target === ov) close(); });
  (document.querySelector('.phone') || document.body).appendChild(ov);
}
// 失败的设备文件先留在当前页面，重试只读取失败项。
var pendingChatPhotos = new WeakMap();

function readChatPhoto(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reader.onabort = reject;
    reader.onload = function() {
      compressImage(reader.result, 1024, function(src) {
        var img = new Image();
        img.onload = function() { resolve({ src: src, width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = reject;
        img.src = src;
      });
    };
    reader.readAsDataURL(file);
  });
}

function forgetPhotoBatch(batch) {
  var batches = pendingChatPhotos.get(batch.hist);
  if (batches) batches.delete(batch);
  if (batch.notice) batch.notice.remove();
}

function renderPhotoRetry(batch, list) {
  if (!batch.notice) {
    var notice = batch.notice = document.createElement('div');
    notice.className = 'cr-photo-retry';
    notice.innerHTML = '<span class="cr-photo-retry-label" role="status"></span>' +
      '<button type="button" class="cr-photo-retry-action">重试</button>' +
      '<button type="button" class="cr-photo-retry-dismiss" aria-label="忽略未发送的图片">×</button>';
    notice.querySelector('.cr-photo-retry-action').addEventListener('click', function() { sendPhotoBatch(batch); });
    notice.querySelector('.cr-photo-retry-dismiss').addEventListener('click', function() { forgetPhotoBatch(batch); });
  }
  var numbers = batch.pending.map(function(item) { return item.number; }).join('、');
  batch.notice.querySelector('.cr-photo-retry-label').textContent = batch.busy
    ? '正在重试…'
    : '第 ' + numbers + ' 张没发成';
  batch.notice.querySelectorAll('button').forEach(function(button) { button.disabled = batch.busy; });
  if (list && batch.notice.parentNode !== list) list.appendChild(batch.notice);
}

async function sendPhotoBatch(batch) {
  if (batch.busy) return;
  batch.busy = true;
  if (batch.notice) renderPhotoRetry(batch);
  // 限制同时解码的原图数量，避免手机一次处理太多大图。
  var results = [];
  for (var i = 0; i < batch.pending.length; i += 3) {
    var chunk = batch.pending.slice(i, i + 3);
    results.push.apply(results, await Promise.allSettled(chunk.map(function(item) { return readChatPhoto(item.file); })));
  }
  batch.busy = false;
  var histories = batch.subview === 'contacts' ? dramaHistories : chatHistories;
  if (findCharIdx(batch.char.id) < 0 || histories[batch.char.id] !== batch.hist) {
    forgetPhotoBatch(batch);
    return;
  }
  var list = appChatRoom.classList.contains('active') && charList[openingChatCharIdx] === batch.char && currentCrSubView === batch.subview
    ? getActiveMsgListEl() : null;
  var photos = [];
  batch.pending = batch.pending.filter(function(item, i) {
    if (results[i].status === 'rejected') return true;
    photos.push(results[i].value);
    return false;
  });
  if (batch.notice) batch.notice.remove();
  if (photos.length) {
    var message = { role: 'user', content: photos.length > 1 ? '[图片消息 · ' + photos.length + ' 张]' : '[图片消息]',
      imgSrc: photos[0].src, time: Date.now() };
    if (photos.length > 1) message.images = photos;
    if (batch.quote) {
      message.quote = batch.quote;
      if (list && pendingQuote === batch.quote) clearQuote();
      var draft = crDrafts[batch.char.id + ':' + batch.subview];
      if (draft && draft.quote === batch.quote) draft.quote = null;
      batch.quote = null;
    }
    batch.hist.push(message);
    if (list) renderHistMsg(message, list);
    saveHistories();
  }
  if (batch.pending.length) {
    var batches = pendingChatPhotos.get(batch.hist);
    if (!batches) pendingChatPhotos.set(batch.hist, batches = new Set());
    batches.add(batch);
    renderPhotoRetry(batch, list);
    if (list) crStick(list);
  } else forgetPhotoBatch(batch);
}

function sendPickedImage(files) {
  if (!files || openingChatCharIdx === -1) return;
  var char = charList[openingChatCharIdx];
  if (!char) return;
  var list = Array.from(files.length !== undefined ? files : [files]);
  if (!list.length) return;
  var pending = list.map(function(file, i) { return { file: file, number: i + 1 }; });
  var batch = { char: char, subview: currentCrSubView, hist: getActiveHistory(openingChatCharIdx), quote: pendingQuote };
  function send(items) {
    batch.pending = items;
    sendPhotoBatch(batch);
  }
  if (pending.length > CHAT_PHOTO_LIMIT) confirmPickedImages(pending, send);
  else send(pending);
}

(function() {
  var crAlbumFileInput = document.getElementById('crAlbumFileInput');
  var chatRoomContent  = document.getElementById('chatRoomContent');

  // 点击底栏「+」按钮 → 底栏上升，下方展开/收起 4×2 微信小功能面板
  if (crPlusBtn && crPlusPanel) {
    crPlusBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      renderPlusOrder();
      toggleCrDrawer(crPlusPanel, crPlusBtn);
      // 等抽屉可见后再归位，之前的横向滚动才不会被浏览器恢复回来。
      if (crPlusPageNeedsReset && crPlusPanel.classList.contains('open')) {
        plusPages.scrollLeft = 0;
        plusDots.forEach(function(dot, index) { dot.setAttribute('aria-current', String(index === 0)); });
        crPlusPageNeedsReset = false;
      }
    });

    // 表情键 → 升起表情包抽屉（内容暂时留空）
    if (crEmojiBtn && crEmojiPanel) {
      crEmojiBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleCrDrawer(crEmojiPanel, crEmojiBtn);
      });
    }

    // 点击 4×2 面板中的功能按键（其中「相册」也可直接调起设备相册发送图片）
    crPlusPanel.querySelectorAll('.cr-plus-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var funcName = this.dataset.func || '';
        var curC = charList[openingChatCharIdx];
        if (curC && curC.isGroup && (funcName === '查手机' || funcName === '一起看')) { showToast('群聊里用不了「' + funcName + '」', 'plain'); return; }
        // 群里的小互动（js/chat/group-play.js）：投票、抽奖、红包。私聊没有红包，群聊没有转账
        if (curC && curC.isGroup && typeof gpOpenVote === 'function' && { '投票': 1, '抽奖': 1, '红包': 1 }[funcName]) {
          (funcName === '投票' ? gpOpenVote : funcName === '抽奖' ? gpOpenLottery : gpOpenHb)();
          return;
        }
        if (funcName === '相册' && crAlbumFileInput) {
          // 抽屉先不收，小菜单从「相册」这个图标上方冒出来（用户要的）；选好了再收
          if (typeof openAlbumPick === 'function') openAlbumPick(this.querySelector('.cr-plus-box') || this);
          else { closeCrPlusPanel(); crAlbumFileInput.value = ''; crAlbumFileInput.click(); }
        } else if (funcName === '通话' && typeof openCallPick === 'function') {
          openCallPick(this.querySelector('.cr-plus-box') || this);
        } else if (['位置', '礼物', '转账'].indexOf(funcName) >= 0) {
          openPrivatePlus(funcName);
        } else if (funcName === '文件' && typeof openChatFilePicker === 'function') {
          openChatFilePicker();
        } else if (funcName === '查手机' && typeof openPeek === 'function') {
          closeCrPlusPanel();
          openPeek(openingChatCharIdx);
        } else if (funcName === '提示词' && typeof openPromptPreview === 'function') {
          // 预览当前窗口的提示词。
          closeCrPlusPanel();
          openPromptPreview();
        } else if (funcName === '一起看' && typeof openTogether === 'function') {
          closeCrPlusPanel();
          openTogether(openingChatCharIdx);
        } else if (funcName === '留给彼此' && curC && !curC.isGroup) {
          closeCrPlusPanel();
          openPairNotes(curC.id);
        } else if (funcName === '占卜' && curC && !curC.isGroup) {
          closeCrPlusPanel();
          openTarotReading(curC);
        } else {
          showToast('「' + funcName + '」功能开发中', 'success');
        }
      });
    });
  }

  // 保留滑动，并让桌面用户可以直接点页码圆点。
  var plusPages = document.getElementById('crPlusPages');
  var plusDots = document.querySelectorAll('#crPlusDots [aria-current]');
  plusDots.forEach(function(dot, index) {
    dot.addEventListener('click', function(e) {
      e.stopPropagation();
      plusPages.scrollLeft = plusPages.clientWidth * index;
    });
  });
  plusPages.addEventListener('scroll', function() {
    var current = Math.round(plusPages.scrollLeft / Math.max(1, plusPages.clientWidth));
    plusDots.forEach(function(dot, index) { dot.setAttribute('aria-current', String(index === current)); });
  }, { passive: true });

  var pinMax = 4;
  var plusGrids = Array.from(plusPages.querySelectorAll('.cr-plus-grid'));
  var plusItems = Array.from(plusPages.querySelectorAll('.cr-plus-item'));
  var plusPins = mphoneStore.load('mphone_chat_plus_pins', []);
  var pinOverlay = document.getElementById('crPlusPinOverlay');
  var pinChoices = document.getElementById('crPlusPinChoices');
  var pinSave = document.getElementById('crPlusPinSave');
  var pinHint = document.getElementById('crPlusPinHint');
  var plusOrderMode = null;

  if (!Array.isArray(plusPins)) plusPins = [];
  plusPins = plusPins.map(function(name) { return name === '一起解牌' ? '占卜' : name; });
  plusPins = plusPins.filter(function(name, index, list) {
    return list.indexOf(name) === index && plusItems.some(function(item) { return item.dataset.func === name; });
  }).slice(0, pinMax);

  function plusRoomKey() {
    return (appChatRoom.classList.contains('is-group') ? 'g' : 'p') + (appChatRoom.classList.contains('cr-drama') ? 'd' : 'c');
  }
  function plusHiddenHere(item) {
    var group = appChatRoom.classList.contains('is-group');
    var drama = appChatRoom.classList.contains('cr-drama');
    if (item.classList.contains('group-only') && (!group || drama)) return true;
    if (group && item.classList.contains('private-only')) return true;
    if (group && (item.dataset.func === '查手机' || item.dataset.func === '一起看')) return true;
    return false;
  }
  function renderPlusOrder() {
    var key = plusRoomKey();
    var changed = plusOrderMode !== key;
    plusOrderMode = key;
    var visible = plusItems.filter(function(item) { return !plusHiddenHere(item); });
    var hidden = plusItems.filter(function(item) { return visible.indexOf(item) === -1; });
    var pinned = plusPins.map(function(name) {
      return visible.find(function(item) { return item.dataset.func === name; });
    }).filter(Boolean);
    var order = pinned.concat(visible.filter(function(item) { return pinned.indexOf(item) === -1; }));
    order.forEach(function(item, index) { plusGrids[index < 8 ? 0 : 1].appendChild(item); });
    hidden.forEach(function(item) { plusGrids[1].appendChild(item); });
    if (changed) plusPages.scrollLeft = 0;
  }
  function closePlusPins() { pinOverlay.classList.remove('open'); }
  function checkedPlusPins() {
    return Array.from(pinChoices.querySelectorAll('input:checked')).map(function(input) { return input.value; });
  }
  function updatePinChoices() {
    var count = checkedPlusPins().length;
    pinHint.textContent = '固定 ' + count + ' / ' + pinMax + '，按勾选顺序放在第一页。';
    pinChoices.querySelectorAll('input').forEach(function(input) { input.disabled = !input.checked && count >= pinMax; });
  }
  document.getElementById('crPlusOrganize').addEventListener('click', function(e) {
    e.stopPropagation();
    pinChoices.textContent = '';
    var ordered = plusItems.slice().sort(function(a, b) {
      var ai = plusPins.indexOf(a.dataset.func), bi = plusPins.indexOf(b.dataset.func);
      return (ai < 0 ? pinMax : ai) - (bi < 0 ? pinMax : bi);
    });
    ordered.forEach(function(item) {
      var label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox';
      input.value = item.dataset.func;
      input.checked = plusPins.indexOf(input.value) >= 0;
      label.appendChild(input);
      label.appendChild(document.createTextNode(input.value + (item.classList.contains('group-only') ? ' · 群聊' : item.classList.contains('private-only') ? ' · 私聊' : '')));
      pinChoices.appendChild(label);
    });
    // 通过选择先后决定顺序，取消再勾选即可调整。
    var picked = plusPins.slice();
    pinChoices.onchange = function(event) {
      var input = event.target;
      picked = picked.filter(function(name) { return name !== input.value; });
      if (input.checked) picked.push(input.value);
      updatePinChoices();
    };
    pinSave.onclick = function() {
      plusPins = picked;
      mphoneStore.save('mphone_chat_plus_pins', plusPins);
      plusOrderMode = null;
      renderPlusOrder();
      closePlusPins();
      showToast('✓ 已保存常用功能', 'success');
    };
    updatePinChoices();
    pinOverlay.classList.add('open');
  });
  document.getElementById('crPlusPinCancel').addEventListener('click', closePlusPins);
  closeOnBackdrop(pinOverlay, closePlusPins);

  // 点击聊天内容区或聚焦输入框时收起底部加号面板
  if (chatRoomContent) {
    chatRoomContent.addEventListener('click', function() {
      closeCrPlusPanel();
    });
  }
  if (crInput) {
    crInput.addEventListener('focus', function() {
      closeCrPlusPanel();
    });
  }

  var origRender = renderChatCharList;
  renderChatCharList = function() {
    origRender();
    document.querySelectorAll('#chatCharList .chat-char-card').forEach(function(card) {
      card.addEventListener('click', function() {
        chatRoomSession++;   // 新的一次对话：角色设置界面回到第一页
        // 这个监听是抢先执行的（比消息列表里「打开对话」那个早），先记下现在打开的是谁，
        // 否则画消息时头像、名字、{{char}} 用的还是上一个打开的角色
        openingChatCharIdx = parseInt(this.dataset.index, 10);
        msgBtnChat.classList.remove('has-new'); msgBtnContacts.classList.remove('has-new');   // 换了一个角色，另一边的小红点不算数了
        renderRoomLists(openingChatCharIdx);
      }, true);
    });
  };
  renderChatCharList();
})();

// 打开对话时绘制聊天、剧情两个列表；只画最近 ROOM_PAGE 条，滑到顶部再加载更早的
var ROOM_PAGE = 50;
function renderMsgPage(list, empty, hist, count) {
  list.innerHTML = '';
  list._away = false;
  if (typeof crPillReset === 'function') crPillReset(list);
  list.appendChild(empty);
  empty.style.display = hist.length ? 'none' : 'flex';
  var start = Math.max(0, hist.length - count);
  list._hist = hist;
  list._empty = empty;
  list._firstMsg = hist[start] || null;
  list._lastTime = 0;
  list._altTime = 0;
  list._needBottom = true;   // 隐藏时设不了滚动位置，显示出来后再滚到底
  if (start > 0) {
    var more = document.createElement('div');
    more.className = 'cr-load-more';
    more.textContent = '上滑查看更早的消息';
    list.appendChild(more);
  }
  if (start === 0 && typeof errRenderSaved === 'function') errRenderSaved(list, null, null, hist);
  hist.slice(start).forEach(function(m) {
    var row = renderHistMsg(m, list, empty);
    if (Array.isArray(m.mcpRuns)) {
      m.mcpRuns.forEach(function(run) {
        var note = renderMcpNotice(run);
        list.appendChild(note);
        if (row) (row._mcpNotes || (row._mcpNotes = [])).push(note);
      });
    }
    if (m.errs && typeof errRenderSaved === 'function') errRenderSaved(list, m, row, hist);
  });
  var photoBatches = pendingChatPhotos.get(hist);
  if (photoBatches) photoBatches.forEach(function(batch) { renderPhotoRetry(batch, list); });
}
// 滑到顶部：多画一页，并保持当前看到的位置不动
function loadEarlierMsgs(list) {
  var hist = list._hist;
  if (!hist || list._loading || list._needBottom) return;
  var start = hist.indexOf(list._firstMsg);
  if (start <= 0) return;
  list._loading = true;
  var oldH = list.scrollHeight, oldTop = list.scrollTop;
  renderMsgPage(list, list._empty, hist, hist.length - start + ROOM_PAGE);
  list._needBottom = false;
  list.scrollTop = list.scrollHeight - oldH + oldTop;
  list._loading = false;
}
['chatMsgList', 'dramaMsgList'].forEach(function(id) {
  var list = document.getElementById(id);
  if (list) list.addEventListener('scroll', function() { if (list.scrollTop < 30) loadEarlierMsgs(list); });
});
function scrollPendingLists() {
  ['chatMsgList', 'dramaMsgList'].forEach(function(id) {
    var list = document.getElementById(id);
    if (list && list._needBottom && list.clientHeight) { list.scrollTop = list.scrollHeight; list._needBottom = false; }
  });
}

function renderRoomLists(idx) {
  if (typeof seedMianinIntro === 'function') seedMianinIntro(charList[idx]);
  // 聊天子视图
  var list = document.getElementById('chatMsgList');
  var emptyDiv = document.createElement('div');
  emptyDiv.className = 'chat-room-empty'; emptyDiv.id = 'chatRoomEmpty';
  emptyDiv.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span>开始聊天吧</span>';
  renderMsgPage(list, emptyDiv, getChatHistory(idx), ROOM_PAGE);

  // 剧情子视图
  var dList = document.getElementById('dramaMsgList');
  if (!dList) { setTimeout(scrollPendingLists, 0); if (typeof genReattach === 'function') genReattach(); return; }
  var dEmpty = document.createElement('div');
  dEmpty.className = 'drama-empty-hint'; dEmpty.id = 'dramaRoomEmpty';
  dEmpty.innerHTML = '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="17" y1="7" x2="22" y2="7"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="2" y1="17" x2="7" y2="17"></line></svg><span>暂无剧情</span>';
  var dHist = getDramaHistory(idx);
  renderMsgPage(dList, dEmpty, dHist, ROOM_PAGE);

  // 剧情还没开始：添加开场白（粘贴）/ 随机开场白（AI 写），也可以直接发消息开始（见 js/chat/opening.js）
  if (!dHist.length) {
    var picker = document.createElement('div');
    picker.className = 'drama-opening-picker';
    [['add', '添加开场白'], ['rand', '随机开场白']].forEach(function(b) {
      var btn = document.createElement('button');
      btn.className = 'drama-opening-btn';
      btn.textContent = b[1];
      btn.addEventListener('click', function(e) { e.stopPropagation(); if (typeof openOpening === 'function') openOpening(idx, b[0]); });
      picker.appendChild(btn);
    });
    var tip = document.createElement('div');
    tip.className = 'drama-opening-title';
    tip.textContent = '也可以直接发消息开始';
    dEmpty.appendChild(picker);
    dEmpty.appendChild(tip);
  }
  if (typeof genReattach === 'function') genReattach();   // 这个角色还在生成的回复放回去
  setTimeout(scrollPendingLists, 0);
}
