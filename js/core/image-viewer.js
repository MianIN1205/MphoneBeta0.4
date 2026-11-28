// 眠花糖机 — 图片全屏查看：缩放、保存、分享、收藏

// =============================================
// 图片全屏查看：点聊天 / 动态 / 收藏里的图片打开；双指或双击缩放，放大后可拖动，单击关闭
// =============================================
var imgViewer    = document.getElementById('imgViewer');
var imgViewerImg = document.getElementById('imgViewerImg');
var ivState = { src: '', source: '', author: '', scale: 1, x: 0, y: 0, photos: [], index: 0 };
var ivCount = document.getElementById('imgViewerCount');
var ivStickerName = document.getElementById('imgViewerStickerName');
var ivNotes = document.getElementById('imgViewerNotes');
var ivNotesText = document.getElementById('imgViewerNotesText');
function ivShowPhoto() {
  ivState.src = ivState.photos[ivState.index];
  imgViewerImg.src = ivState.src;
  ivCount.hidden = ivState.photos.length < 2;
  ivCount.textContent = (ivState.index + 1) + ' / ' + ivState.photos.length;
  var note = ivState.notes[ivState.index];
  ivNotes.hidden = !note;
  if (!note) ivNotes.open = false;
  ivNotes.querySelector('summary').textContent = note && !note.labeled ? '旧版看图记录' : '看图记录';
  ivNotesText.textContent = note ? '模型描述 · ' + note.scene + (note.detail ? '\n模型留意到 · ' + note.detail : '') : '';
  ivReset();
}
function ivStep(delta) {
  var index = ivState.index + delta;
  if (index < 0 || index >= ivState.photos.length) return false;
  clearTimeout(ivTapTimer);
  ivLastTap = 0;
  ivState.index = index;
  ivShowPhoto();
  return true;
}

function ivApply() {
  imgViewerImg.style.transform = 'translate(' + ivState.x + 'px,' + ivState.y + 'px) scale(' + ivState.scale + ')' +
    (ivState.rotation ? ' rotate(' + ivState.rotation + 'deg)' : '');
}
function ivReset() { ivState.scale = 1; ivState.x = 0; ivState.y = 0; ivApply(); }

function openImgViewer(src, info) {
  info = info || {};
  clearTimeout(ivTapTimer);
  ivLastTap = 0;
  ivState.photos = Array.isArray(info.photos) && info.photos.length ? info.photos : [src];
  ivState.notes = info.notes || [];
  ivState.rotation = info.rotation === 180 ? 180 : 0;
  ivNotes.open = false;
  ivState.index = Math.max(0, Math.min(ivState.photos.length - 1, info.index || 0));
  ivState.source = info.source || '';
  ivState.author = info.author || '';
  ivState.refId = info.refId || '';
  ivState.onDelete = typeof info.onDelete === 'function' ? info.onDelete : null;
  ivState.delText = info.delText || '';
  document.getElementById('imgViewerDel').hidden = !ivState.onDelete;
  ivShowPhoto();
  ivStickerName.textContent = info.stickerName || '';
  ivStickerName.hidden = !info.stickerName;
  imgViewer.classList.toggle('is-sticker', !!info.stickerName);
  // 收藏页里打开的图片不再显示「收藏」
  imgViewer.classList.toggle('is-preview', !!info.preview);
  document.getElementById('imgViewerFav').hidden = !!(info.noFav || info.preview);
  document.getElementById('imgViewerSave').hidden = !!info.preview;
  document.getElementById('imgViewerShare').hidden = !!info.preview || !ivCanShare();
  imgViewer.classList.add('open');
}
function closeImgViewer() {
  clearTimeout(ivTapTimer);
  ivLastTap = 0;
  imgViewer.classList.remove('open');
  imgViewerImg.removeAttribute('src');
}

document.getElementById('imgViewerClose').addEventListener('click', closeImgViewer);
document.addEventListener('keydown', function(e) {
  if (!imgViewer.classList.contains('open')) return;
  if (e.key === 'Escape') closeImgViewer();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (ivStep(e.key === 'ArrowLeft' ? -1 : 1)) e.preventDefault();
  }
});

function ivChatPhotos(image) {
  var row = image.closest('.chat-msg-row');
  if (!row || !row.parentElement || !image.closest('.img-bubble')) return null;
  var selector = '.img-bubble img';
  function usable(candidate) {
    return candidate && candidate.matches('.chat-msg-row') && !candidate.hidden &&
      candidate.style.display !== 'none' && candidate.querySelector(selector);
  }
  function adjacent(from, side) {
    var node = from[side];
    while (node && node.matches('.cr-msg-stamp, .chat-msg-stamp')) node = node[side];
    return node;
  }
  var first = row, prev;
  while (usable(prev = adjacent(first, 'previousElementSibling'))) first = prev;
  var images = [];
  for (var candidate = first; usable(candidate); candidate = adjacent(candidate, 'nextElementSibling')) {
    candidate.querySelectorAll(selector).forEach(function(el) { if (el.src) images.push(el); });
  }
  var notes = images.map(function(el) {
    var owner = el.closest('.chat-msg-row')._msg;
    return owner && owner.photoNotes && owner.photoNotes[el.dataset.photoIndex];
  });
  return { photos: images.map(function(el) { return el.src; }), index: images.indexOf(image), notes: notes };
}

// 打开入口（捕获阶段；长按弹出菜单后松手的那次点击不打开）
document.addEventListener('click', function(e) {
  var img = e.target.closest && e.target.closest('.chat-msg-bubble.img-bubble img, .chat-msg-bubble.sticker-bubble img, .feed-post-imgs img, .fav-item-imgs img');
  if (!img || !img.src || suppressClick) return;
  e.stopPropagation();
  var info = {};
  if (img.closest('.fav-item-imgs')) info.noFav = true;
  else if (img.closest('.feed-post-imgs')) info.source = '动态';
  else {
    var row = img.closest('.chat-msg-row');
    if (img.closest('.sticker-bubble')) {
      var sticker = row && row._msg && row._msg.sticker;
      info.stickerName = (sticker && sticker.name) || '表情包';
    }
    var char = charList[openingChatCharIdx] || {};
    var isUser = row && row.classList.contains('user');
    info.author = isUser ? (resolveCharAccount(char).nickname || '我') : (char.charAlias || char.charName || '角色');
    info.source = '与 ' + chatRoomTitle.textContent + (img.closest('#dramaMsgList') ? ' 的剧情' : ' 的聊天');
  }
  openImgViewer(img.src, Object.assign(info, ivChatPhotos(img) || {}));
});

// 手势：记录按下的指针；两指缩放，一指在放大时拖动；没移动的轻点 = 单击（关闭）或双击（缩放）
var ivPointers = {}, ivPinch = null, ivDrag = null, ivTap = null, ivSwipe = null, ivLastTap = 0, ivTapTimer = null;
function ivDist() {
  var p = Object.keys(ivPointers).map(function(k) { return ivPointers[k]; });
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
imgViewer.addEventListener('pointerdown', function(e) {
  if (e.target.closest('.img-viewer-bar, .img-viewer-notes, #imgViewerClose')) return;
  imgViewer.setPointerCapture(e.pointerId);
  ivPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  var n = Object.keys(ivPointers).length;
  if (n === 1) {
    ivTap = { x: e.clientX, y: e.clientY, t: Date.now() };
    ivDrag = { x: e.clientX, y: e.clientY, ox: ivState.x, oy: ivState.y };
    ivSwipe = ivState.scale <= 1.02 ? { x: e.clientX, y: e.clientY } : null;
  } else if (n === 2) {
    ivTap = null; ivDrag = null; ivSwipe = null;
    ivPinch = { dist: ivDist(), scale: ivState.scale };
  }
});
imgViewer.addEventListener('pointermove', function(e) {
  if (!ivPointers[e.pointerId]) return;
  ivPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  if (ivTap && Math.hypot(e.clientX - ivTap.x, e.clientY - ivTap.y) > 8) ivTap = null;
  if (ivPinch && Object.keys(ivPointers).length === 2) {
    ivState.scale = Math.max(1, Math.min(5, ivPinch.scale * ivDist() / ivPinch.dist));
    ivApply();
  } else if (ivDrag && ivState.scale > 1) {
    ivState.x = ivDrag.ox + e.clientX - ivDrag.x;
    ivState.y = ivDrag.oy + e.clientY - ivDrag.y;
    ivApply();
  }
});
function ivPointerEnd(e) {
  if (!ivPointers[e.pointerId]) return;
  delete ivPointers[e.pointerId];
  var left = Object.keys(ivPointers).length;
  if (left < 2) ivPinch = null;
  if (left === 1) {
    // 两指松开一指：剩下那一指从当前位置继续拖动
    var k = Object.keys(ivPointers)[0];
    ivDrag = { x: ivPointers[k].x, y: ivPointers[k].y, ox: ivState.x, oy: ivState.y };
  }
  if (left) return;
  ivDrag = null;
  var swipe = ivSwipe;
  ivSwipe = null;
  if (swipe && e.type === 'pointerup' && ivState.scale <= 1.02) {
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      ivTap = null;
      ivStep(dx < 0 ? 1 : -1);
      return;
    }
  }
  if (ivState.scale <= 1.02) ivReset();
  if (e.type !== 'pointerup' || !ivTap || Date.now() - ivTap.t > 300) { ivTap = null; return; }
  ivTap = null;
  var now = Date.now();
  if (now - ivLastTap < 300) {
    clearTimeout(ivTapTimer);
    ivLastTap = 0;
    if (ivState.scale > 1) ivReset(); else { ivState.scale = 2.5; ivApply(); }
  } else {
    ivLastTap = now;
    ivTapTimer = setTimeout(closeImgViewer, 300);
  }
}
['pointerup', 'pointercancel'].forEach(function(ev) { imgViewer.addEventListener(ev, ivPointerEnd); });
// 电脑上用滚轮缩放
imgViewer.addEventListener('wheel', function(e) {
  e.preventDefault();
  ivState.scale = Math.max(1, Math.min(5, ivState.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  if (ivState.scale <= 1.02) ivReset(); else ivApply();
}, { passive: false });

// 保存：直接存成文件（以前手机上只会弹分享，用户要能直接保存）；分享：走系统分享（手机支持时才显示）
// iPhone 想存进「照片」：长按大图选「添加到照片」，或者点「分享」→「存储图像」
function ivCanShare() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); } catch (_) { return false; }
}
function ivBlob() {
  return fetch(ivState.src).then(function(r) {
    if (!r.ok) throw new Error('图片读取失败');
    return r.blob();
  }).then(function(blob) {
    if (!blob.type) blob = new Blob([blob], { type: 'image/png' });
    return { blob: blob, name: 'mphone-' + Date.now() + '.' + (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg') };
  });
}
document.getElementById('imgViewerShare').addEventListener('click', function(e) {
  e.stopPropagation();
  ivBlob().then(function(o) {
    return navigator.share({ files: [new File([o.blob], o.name, { type: o.blob.type })] }).catch(function() {});
  }).catch(function() { showToast('这张图分享不了，长按图片试试', 'plain'); });
});
document.getElementById('imgViewerSave').addEventListener('click', function(e) {
  e.stopPropagation();
  var src = ivState.src;
  var name = 'mphone-' + Date.now();
  ivBlob().then(function(o) {
    downloadBlob(o.blob, o.name);
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) showToast('已保存', 'success');
  }).catch(function() {
    // 读不到图片数据（跨域图片）：在新页面打开，长按保存
    var a = document.createElement('a');
    a.href = src;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
});
document.getElementById('imgViewerFav').addEventListener('click', function(e) {
  e.stopPropagation();
  addFav({ kind: 'image', text: '', images: [ivState.src], source: ivState.source, author: ivState.author, time: Date.now(), refId: ivState.refId || undefined });
});
document.getElementById('imgViewerDel').addEventListener('click', function(e) {
  e.stopPropagation();
  var fn = ivState.onDelete;
  if (!fn) return;
  openConfirm(ivState.delText || '删掉这张图片？相册里不再显示，原来的地方也会去掉。', function() {
    fn();
    closeImgViewer();
  });
});
