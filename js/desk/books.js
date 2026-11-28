// 眠花糖机 — 书架里的书：导入小说（txt / md / Word / epub / PDF），阅读器（分页、目录、字号、记住读到哪）；
// 和角色「一起看」：先挑书进去（书架，或者聊天加号抽屉里选一本），看的时候点下面小栏的「一起看」才开始（用户要的）；
// 一起看时角色聊天时知道你们在看哪本、你看到哪一页（mphone_books、mphone_book_<id>、mphone_together）

var BOOK_MAX_CHARS = 3000000;   // 一本最多存多少字
var BOOK_PAGE_CHARS = 700;      // 一页大约多少字（在换行处断开）
var BOOK_COLORS = ['#f6d4dc', '#d8e6f6', '#e3dcf3', '#f8e6c8', '#d9eedd', '#f3dbe9', '#dfe9f0', '#efe2d6'];
var bookMetas = mphoneStore.load('mphone_books', []) || [];       // [{ id, title, chars, pos, addedAt, color }]
var bookTogether = mphoneStore.load('mphone_together', {}) || {}; // 角色id → { bookId, at }
function saveBookMetas() { mphoneStore.save('mphone_books', bookMetas); }
function saveBookTogether() { mphoneStore.save('mphone_together', bookTogether); }
function bookMeta(id) { return bookMetas.filter(function(b) { return b.id === id; })[0] || null; }
var bookTextCache = {};
function bookText(id) {
  if (!(id in bookTextCache)) bookTextCache[id] = mphoneStore.load('mphone_book_' + id, '') || '';
  return bookTextCache[id];
}

// ---------- 读文件 ----------
function bookHtmlToText(html) {
  return String(html || '').replace(/<head[\s\S]*?<\/head>/gi, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|section|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, '&');
}
function bookAttr(tag, name) { var m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"')) || tag.match(new RegExp('\\b' + name + "\\s*=\\s*'([^']*)'")); return m ? m[1] : ''; }
function bookJoinPath(base, href) {
  var parts = (base + href).split('/'), out = [];
  parts.forEach(function(p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
  return out.join('/');
}
function bookReadEpub(buf) {
  var dec = new TextDecoder();
  return zipReadEntry(buf, function(n) { return n === 'META-INF/container.xml'; }).then(function(b) {
    var opfPath = bookAttr(dec.decode(b).match(/<rootfile\b[^>]*>/) ? dec.decode(b).match(/<rootfile\b[^>]*>/)[0] : '', 'full-path');
    if (!opfPath) throw new Error('这个 epub 读不出目录');
    return zipReadEntry(buf, function(n) { return n === opfPath; }).then(function(ob) {
      var opf = dec.decode(ob), base = opfPath.replace(/[^\/]*$/, ''), manifest = {}, spine = [];
      var title = bookHtmlToText((opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/) || [])[1] || '').trim();
      (opf.match(/<item\b[^>]*>/g) || []).forEach(function(tag) { var id = bookAttr(tag, 'id'), href = bookAttr(tag, 'href'); if (id && href) manifest[id] = href; });
      (opf.match(/<itemref\b[^>]*>/g) || []).forEach(function(tag) { var r = bookAttr(tag, 'idref'); if (manifest[r]) spine.push(bookJoinPath(base, decodeURIComponent(manifest[r].split('#')[0]))); });
      var parts = [], chain = Promise.resolve();
      spine.forEach(function(p) {
        chain = chain.then(function() { return zipReadEntry(buf, function(n) { return n === p; }).then(function(x) { parts.push(bookHtmlToText(dec.decode(x))); }, function() {}); });
      });
      return chain.then(function() { return { title: title, text: parts.join('\n\n') }; });
    });
  });
}
function bookReadFile(file) {
  var name = file.name || '书', ext = (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase(), title = name.replace(/\.[^.]+$/, '');
  return file.arrayBuffer().then(function(buf) {
    if (ext === 'epub') return bookReadEpub(buf);
    if (ext === 'docx') return readDocxText(buf).then(function(t) { return { text: t }; });
    if (ext === 'pdf') return fileReadPdf(buf).then(function(t) { return { text: t }; });
    if (ext === 'txt' || ext === 'md' || ext === 'markdown' || /^text\//.test(file.type)) return { text: fileDecodeText(buf) };
    throw new Error('这种文件（.' + (ext || '?') + '）还读不了，可以导入 txt、epub、Word（.docx）、PDF');
  }).then(function(r) {
    var text = String(r.text || '').replace(/\r\n?/g, '\n').replace(/[ \t　]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error(ext === 'pdf' ? '这个 PDF 里读不出文字，可能是扫描的图片' : '文件里没有文字');
    return { title: (r.title || title).slice(0, 40), text: text.slice(0, BOOK_MAX_CHARS), cut: text.length > BOOK_MAX_CHARS };
  });
}

// ---------- 导入：书架右上角 ··· →「导入图书」 ----------
var bookImportInput = document.getElementById('bookImportInput');
document.getElementById('notesBtnImport').addEventListener('click', function(e) {
  e.stopPropagation();
  notesPopup.classList.remove('open');
  if (document.querySelectorAll('.notes-shelf-area .book-slot').length >= SHELF_MAX * 3) { document.getElementById('shelfFullOverlay').classList.add('open'); return; }
  bookImportInput.value = '';
  bookImportInput.click();
});
bookImportInput.addEventListener('change', function() {
  var file = this.files && this.files[0];
  if (!file) return;
  showToast('正在读《' + file.name.replace(/\.[^.]+$/, '') + '》…', 'plain');
  bookReadFile(file).then(function(r) {
    var id = 'bk' + Date.now().toString(36);
    mphoneStore.save('mphone_book_' + id, r.text);
    bookTextCache[id] = r.text;
    var meta = { id: id, title: r.title, chars: r.text.length, pos: 0, addedAt: Date.now(), color: BOOK_COLORS[bookMetas.length % BOOK_COLORS.length] };
    bookMetas.push(meta);
    saveBookMetas();
    bookPutOnShelf(meta);
    showToast('✓ 《' + r.title + '》放上书架了' + (r.cut ? '（太长了，只存了前 300 万字）' : ''), 'success');
  }, function(err) { showToast('✗ ' + err.message, 'error'); });
});
// 放到第一个没满的书架上（和新建本子一样）
function bookPutOnShelf(meta) {
  var area = document.querySelector('.notes-shelf-area'), shelves = Array.from(area.querySelectorAll('.bookshelf'));
  var slot = createBookSlot({ name: meta.title, color: meta.color, novel: meta.id });
  var target = shelves.filter(function(s) { return s.querySelectorAll('.book-slot').length < 3; })[0];
  if (!target) { target = document.createElement('div'); target.className = 'bookshelf'; area.appendChild(target); }
  target.appendChild(slot);
  bindBookPointer(slot.querySelector('.book'));
  syncShelves();
}
// 书架上删掉这本书：书的文字、进度、一起看都清掉
function bookOnShelfDelete(slot) {
  var book = slot && slot.querySelector('.book'), id = book && book._novel;
  if (!id) return;
  bookMetas = bookMetas.filter(function(b) { return b.id !== id; });
  saveBookMetas();
  mphoneStore.remove('mphone_book_' + id);
  mphoneStore.remove('mphone_book_pics_' + id);
  delete bookTextCache[id];
  delete bookPicCache[id];
  Object.keys(bookTogether).forEach(function(k) { if (bookTogether[k].bookId === id) delete bookTogether[k]; });
  saveBookTogether();
}

// ---------- 分页、章节 ----------
var bookPagesCache = {};
function bookPages(id) {
  if (bookPagesCache[id]) return bookPagesCache[id];
  var text = bookText(id), pages = [0], i = 0, n = text.length;
  while (i < n) {
    var end = Math.min(n, i + BOOK_PAGE_CHARS);
    if (end < n) { var nl = text.indexOf('\n', end); if (nl >= 0 && nl - end < 260) end = nl + 1; }
    if (end >= n) break;
    pages.push(end); i = end;
  }
  return (bookPagesCache[id] = pages);
}
function bookPageOf(id, pos) {
  var pages = bookPages(id), lo = 0, hi = pages.length - 1;
  while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (pages[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}
function bookPageSlice(id, page) {
  var pages = bookPages(id), text = bookText(id);
  return text.slice(pages[page], page + 1 < pages.length ? pages[page + 1] : text.length).trim();
}
function bookPageText(id, page) {
  return bookPageSlice(id, page).replace(/\u200b图:[a-z0-9]+\u200b/g, '〔插图〕');
}
var bookPicCache = {};
function bookPics(id) {
  if (!bookPicCache[id]) bookPicCache[id] = mphoneStore.load('mphone_book_pics_' + id, {}) || {};
  return bookPicCache[id];
}
function saveBookPics(id) { mphoneStore.save('mphone_book_pics_' + id, bookPics(id)); }
function bookPaintPage(body, id, text) {
  body.textContent = '';
  var re = /\u200b图:([a-z0-9]+)\u200b/g, last = 0, m, pics = bookPics(id), any = false;
  while ((m = re.exec(text))) {
    any = true;
    if (m.index > last) body.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (pics[m[1]]) {
      var img = document.createElement('img');
      img.className = 'reader-pic';
      img.alt = '插图';
      img.src = pics[m[1]];
      img.dataset.pic = m[1];
      body.appendChild(img);
    }
    last = m.index + m[0].length;
  }
  if (!any) { body.textContent = text; return; }
  if (last < text.length) body.appendChild(document.createTextNode(text.slice(last)));
}
var BOOK_CHAPTER_RE = /^\s*(第[0-9０-９零〇一二三四五六七八九十百千两]+[章节回卷集部篇幕话]|chapter\s*\d+|序章|序言|楔子|引子|番外|尾声|后记|终章)[^\n]{0,30}$/i;
function bookChapters(id) {
  var text = bookText(id), out = [], re = /[^\n]+/g, m;
  while ((m = re.exec(text))) {
    if (m[0].length <= 40 && BOOK_CHAPTER_RE.test(m[0])) out.push({ title: m[0].trim(), at: m.index });
    if (out.length > 3000) break;
  }
  return out;
}

// ---------- 阅读器 ----------
var appReader = document.getElementById('appReader');
var readerState = { id: '', page: 0, charId: '' };
var readerFont = mphoneStore.load('mphone_reader_font', 16) || 16;
function openReader(id, opts) {
  var meta = bookMeta(id);
  if (!meta) { showToast('这本书找不到了', 'error'); return; }
  var cid = (opts && opts.charId) || '';
  // 从书架打开时：有角色正和你一起看这本，就接着和 TA 看
  if (!cid) Object.keys(bookTogether).forEach(function(k) { if (bookTogether[k].bookId === id && findCharIdx(k) >= 0) cid = k; });
  readerState = { id: id, page: bookPageOf(id, meta.pos || 0), charId: cid };
  setReaderDraftQuote(null);
  appReader.classList.add('active');
  renderReader();
}
function renderReader() {
  var meta = bookMeta(readerState.id);
  if (!meta) return;
  var pages = bookPages(meta.id), page = Math.max(0, Math.min(pages.length - 1, readerState.page));
  readerState.page = page;
  document.getElementById('readerTitle').textContent = meta.title;
  var body = document.getElementById('readerPage');
  body.style.fontSize = readerFont + 'px';
  bookPaintPage(body, meta.id, bookPageSlice(meta.id, page));
  body.scrollTop = 0;
  document.getElementById('readerProgress').textContent = (page + 1) + ' / ' + pages.length + ' · ' + Math.floor((page + 1) / pages.length * 100) + '%';
  document.getElementById('readerPrev').disabled = page === 0;
  document.getElementById('readerNext').disabled = page >= pages.length - 1;
  var viewed = meta.viewedPages || (meta.viewedPages = {});
  if (meta.pos !== pages[page] || !viewed[page]) {
    viewed[page] = true;
    meta.pos = pages[page];
    meta.readAt = Date.now();
    saveBookMetas();
  }
  // 共读时显示角色和操作，还没共读时先选人
  var bar = document.getElementById('readerTogether'), c = readerTogetherChar(), pc = c || readerPendingChar();
  bar.style.display = '';
  bar.classList.toggle('pending', !c);
  bar.querySelector('.reader-tg-av').style.display = pc ? '' : 'none';
  if (pc) paintCharAvatar(bar.querySelector('.reader-tg-av'), pc);
  var nm = pc ? (pc.charAlias || pc.charName || 'TA') : '';
  bar.querySelector('.reader-tg-name').textContent = c ? '和「' + nm + '」一起看' : pc ? '叫「' + nm + '」一起看？' : '一个人在看';
  if (readerDraftQuote && !readerDraftQuote.bookExcerpt) setReaderDraftQuote(readerPageQuote(meta, page));
  syncReaderExcerptButton();
}
function readerTogetherChar() {
  var cid = readerState.charId;
  if (!cid || !bookTogether[cid] || bookTogether[cid].bookId !== readerState.id) return null;
  return charList.filter(function(c) { return c.id === cid; })[0] || null;
}
function readerPendingChar() {
  var cid = readerState.charId, c = cid && charList.filter(function(x) { return x.id === cid; })[0];
  return c && !c.isGroup ? c : null;
}
// 开始一起看这本：记下来、聊天里冒一行提示
function startTogether(char) {
  var meta = bookMeta(readerState.id);
  if (!meta || !char) return;
  bookTogether[char.id] = { bookId: meta.id, at: Date.now() };
  saveBookTogether();
  readerState.charId = char.id;
  togetherNote(char, '📖 和「' + (char.charAlias || char.charName || 'TA') + '」一起翻开了《' + meta.title + '》', '（用户邀请你一起看《' + meta.title + '》，现在你们在一起看这本书）');
  renderReader();
}
function readerGo(d) {
  var n = bookPages(readerState.id).length, p = readerState.page + d;
  if (p < 0 || p >= n) return;
  readerState.page = p;
  renderReader();
}
document.getElementById('readerPrev').addEventListener('click', function() { readerGo(-1); });
document.getElementById('readerNext').addEventListener('click', function() { readerGo(1); });
document.getElementById('backReader').addEventListener('click', function() { appReader.classList.remove('active'); if (typeof setReaderChat === 'function') setReaderChat(false); });
// 点页面左边三分之一上一页、右边三分之一下一页；左右滑也能翻
(function() {
  var page = document.getElementById('readerPage'), sx = 0, sy = 0, moved = false, started = 0;
  page.addEventListener('pointerdown', function(e) { sx = e.clientX; sy = e.clientY; moved = false; started = performance.now(); });
  page.addEventListener('pointermove', function(e) { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) moved = true; });
  page.addEventListener('pointerup', function(e) {
    if (e.target.closest && e.target.closest('.reader-pic')) return;
    if (readerSelectedExcerpt()) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { readerGo(dx < 0 ? 1 : -1); return; }
    if (moved || performance.now() - started > 300) return;
    // 点左边三分之一上一页，其余都是下一页（单手拇指够得着，用户要的）
    var r = page.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.33) readerGo(-1); else readerGo(1);
  });
})();

function readerSelectedExcerpt() {
  var selection = window.getSelection(), body = document.getElementById('readerPage');
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  var range = selection.getRangeAt(0);
  if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return null;
  var raw = range.toString(), text = raw.trim();
  if (!text) return null;
  var prefix = document.createRange();
  prefix.selectNodeContents(body);
  prefix.setEnd(range.startContainer, range.startOffset);
  var offset = prefix.toString().length + raw.length - raw.trimStart().length;
  return { bookId: readerState.id, page: readerState.page, offset: offset, text: text };
}

function readerExcerptQuote(meta, excerpt) {
  var pages = bookPages(meta.id), source = bookText(meta.id), page = excerpt.page;
  var pageStart = pages[page], pageEnd = pages[page + 1] || source.length;
  var raw = source.slice(pageStart, pageEnd);
  var at = pageStart + (raw.length - raw.trimStart().length) + excerpt.offset;
  var earliest = page > 0 && meta.viewedPages && meta.viewedPages[page - 1] ? pages[page - 1] : pageStart;
  var before = source.slice(Math.max(earliest, at - 500), at).trim();
  var chapter = bookChapters(meta.id).filter(function(ch) { return ch.at <= at; }).pop();
  var short = excerpt.text.replace(/\s+/g, ' ');
  return {
    author: '《' + meta.title + '》' + (chapter ? ' · ' + chapter.title : '') + ' · 第 ' + (page + 1) + ' 页',
    text: short.length > 60 ? short.slice(0, 60) + '…' : short,
    bookExcerpt: { bookId: meta.id, text: excerpt.text, before: before }
  };
}
[['readerFontDown', -1], ['readerFontUp', 1]].forEach(function(b) {
  document.getElementById(b[0]).addEventListener('click', function() {
    readerFont = Math.max(13, Math.min(24, readerFont + b[1]));
    mphoneStore.save('mphone_reader_font', readerFont);
    document.getElementById('readerPage').style.fontSize = readerFont + 'px';
  });
});
// 目录：认出来的章节标题，点一下跳过去；没认出来就按进度分十段
document.getElementById('readerTocBtn').addEventListener('click', function() {
  var id = readerState.id, list = document.getElementById('readerTocList'), chs = bookChapters(id), cur = bookPages(id)[readerState.page];
  list.innerHTML = '';
  if (!chs.length) {
    var n = bookText(id).length;
    for (var i = 0; i < 10; i++) chs.push({ title: (i * 10) + '%', at: Math.floor(n * i / 10) });
  }
  var curEl = null;
  chs.forEach(function(ch, i) {
    var row = document.createElement('div');
    row.className = 'reader-toc-row' + (ch.at <= cur && (!chs[i + 1] || chs[i + 1].at > cur) ? ' on' : '');
    row.textContent = ch.title;
    row.addEventListener('click', function() {
      readerState.page = bookPageOf(id, ch.at);
      document.getElementById('readerTocOverlay').classList.remove('open');
      renderReader();
    });
    if (row.classList.contains('on')) curEl = row;
    list.appendChild(row);
  });
  document.getElementById('readerTocOverlay').classList.add('open');
  if (curEl) setTimeout(function() { curEl.scrollIntoView({ block: 'center' }); }, 30);
});
closeOnBackdrop(document.getElementById('readerTocOverlay'));
document.getElementById('readerTocClose').addEventListener('click', function() { document.getElementById('readerTocOverlay').classList.remove('open'); });

// ---------- 一起看：聊天加号抽屉 →「一起看」 ----------
function togetherNote(char, text, ai) {
  var idx = findCharIdx(char.id);
  if (idx < 0) return;
  var m = { role: 'user', note: text, noteAI: ai, content: '', time: Date.now() };
  getChatHistory(idx).push(m);
  saveHistories();
  if (appChatRoom.classList.contains('active') && charList[openingChatCharIdx] === char) renderHistMsg(m, document.getElementById('chatMsgList'), document.getElementById('chatRoomEmpty'));
}
function openTogether(idx) {
  var char = charList[idx];
  if (!char) return;
  var cur = bookTogether[char.id];
  if (cur && bookMeta(cur.bookId)) { openReader(cur.bookId, { charId: char.id }); return; }   // 已经在一起看了：直接接着看
  if (!bookMetas.length) { showToast('书架里还没有书，先去书架右上角「导入图书」', 'plain'); return; }
  document.getElementById('togetherPickTitle').textContent = '看哪本书';
  var list = document.getElementById('togetherPickList');
  list.innerHTML = '';
  bookMetas.slice().sort(function(a, b) { return (b.readAt || b.addedAt) - (a.readAt || a.addedAt); }).forEach(function(meta) {
    var row = document.createElement('div');
    row.className = 'together-book';
    row.innerHTML = '<span class="together-book-cover"></span><span class="together-book-info"><b></b><small></small></span>';
    row.querySelector('.together-book-cover').style.background = meta.color;
    row.querySelector('b').textContent = '《' + meta.title + '》';
    var pages = bookPages(meta.id);
    row.querySelector('small').textContent = meta.pos ? '看到 ' + Math.floor((bookPageOf(meta.id, meta.pos) + 1) / pages.length * 100) + '%' : '还没开始看 · ' + pages.length + ' 页';
    row.addEventListener('click', function() {
      document.getElementById('togetherPickOverlay').classList.remove('open');
      openReader(meta.id, { charId: char.id });   // 先进去看，想一起看了再点下面的「一起看」
    });
    list.appendChild(row);
  });
  document.getElementById('togetherPickOverlay').classList.add('open');
}
closeOnBackdrop(document.getElementById('togetherPickOverlay'));
document.getElementById('togetherPickCancel').addEventListener('click', function() { document.getElementById('togetherPickOverlay').classList.remove('open'); });
// 阅读器下面的「一起看」：知道是谁就直接开始，从书架进来的先选和谁一起看
document.getElementById('readerTgStart').addEventListener('click', function() {
  var pc = readerPendingChar();
  if (pc) { startTogether(pc); return; }
  var chars = charList.filter(function(c) { return c.inChat && !c.isGroup; });
  if (!chars.length) { showToast('还没有可以一起看的角色', 'plain'); return; }
  document.getElementById('togetherPickTitle').textContent = '和谁一起看';
  var list = document.getElementById('togetherPickList');
  list.innerHTML = '';
  chars.forEach(function(c) {
    var row = document.createElement('div');
    row.className = 'together-book';
    row.innerHTML = '<span class="together-book-cover together-av"></span><span class="together-book-info"><b></b></span>';
    paintCharAvatar(row.querySelector('.together-av'), c);
    row.querySelector('b').textContent = c.charAlias || c.charName || '未命名';
    row.addEventListener('click', function() { document.getElementById('togetherPickOverlay').classList.remove('open'); startTogether(c); });
    list.appendChild(row);
  });
  document.getElementById('togetherPickOverlay').classList.add('open');
});
// ---------- 边看边聊（用户要的：以前要退出去发消息、再点一起看回来，很别扭） ----------
// 下面小栏点「聊天」展开一个小聊天面板：最近的聊天记录、输入框（回车发出去，和聊天窗口一样不叫 TA）、❄️ 请 TA 回（生成中变 ⏹）、📖 带上这一页。
// 发的就是聊天窗口里的消息：走聊天室那一套（appendUserMsg / sendMsg），面板只是照着聊天记录画一份；聊天窗口那边有变化（新消息、正在输入的预览）就跟着重画
var readerChatOpen = false, readerChatTimer = null;
var readerDraftQuote = null;
var readerChatPageButton = document.getElementById('readerChatPage');
var readerChatQuoteButton = document.getElementById('readerChatQuote');
var readerChatQuoteLabel = readerChatQuoteButton.querySelector('.reader-chat-quote-label');
var readerChatInput = document.getElementById('readerChatInput');
var readerChatToggle = document.getElementById('readerTgChat');
function readerChatChar() { return readerTogetherChar(); }
// 确保聊天室停在这个角色的聊天窗口（一起看是从聊天里点进来的，一般已经是了）
function readerChatEnsureRoom(c) {
  var idx = findCharIdx(c.id);
  if (idx < 0) return false;
  if (!(appChatRoom.classList.contains('active') && openingChatCharIdx === idx)) {
    crPlusPageNeedsReset = true;
    openingChatCharIdx = idx;
    chatRoomTitle.textContent = c.charAlias || c.charName || '未命名';
    applyChatRoomStyle(c);   // 以前没套这个角色的美化，回到聊天时状态栏、主题都是默认的
    renderRoomLists(idx);
    appChatRoom.classList.add('active');
  }
  if (currentCrSubView !== 'chat') switchChatRoomSubView('chat');
  return true;
}
function readerChatRender() {
  var box = document.getElementById('readerChatList'), c = readerChatChar();
  if (!readerChatOpen || !c) return;
  var idx = findCharIdx(c.id), hist = idx < 0 ? [] : getChatHistory(idx);
  box.innerHTML = '';
  hist.slice(-30).forEach(function(m) {
    if (m.recalled) return;
    if (m.note || m.pat) { var n = document.createElement('div'); n.className = 'reader-chat-note'; n.textContent = m.note || '拍了拍'; box.appendChild(n); return; }
    var mine = m.role === 'user', text = typeof msgPreviewText === 'function' ? msgPreviewText(m) : String(m.content || '');
    if (!mine) text = fillMacros(text, c);
    // 角色的 *动作* 拿出来变成小灰字，和聊天窗口一样
    var acts = [];
    if (!mine) text = text.replace(actionRe(), function(a) { acts.push(a.slice(1, -1).trim()); return ''; }).replace(/〔译〕[\s\S]*$/, '').trim();
    if (text) {
      var row = document.createElement('div');
      row.className = 'reader-chat-msg ' + (mine ? 'me' : 'ta');
      if (m.quote && mine) {
        var q = document.createElement('span');
        q.className = 'reader-chat-q';
        q.textContent = m.quote.bookExcerpt ? '「' + m.quote.text + '」' : m.quote.author;
        row.appendChild(q);
      }
      row.appendChild(document.createTextNode(text));
      box.appendChild(row);
    }
    acts.forEach(function(t) { var a = document.createElement('div'); a.className = 'reader-chat-act'; a.textContent = t; box.appendChild(a); });
  });
  // 正在回：聊天窗口里冒出来的预览气泡照抄过来，最后放「正在输入」
  var g = typeof genStates !== 'undefined' && genStates[genKey(c, true)];
  if (g) {
    Array.prototype.forEach.call(document.querySelectorAll('#chatMsgList .cr-stream-preview .chat-msg-bubble'), function(b) {
      var t = b.textContent.trim();
      if (!t) return;
      var row = document.createElement('div'); row.className = 'reader-chat-msg ta'; row.textContent = t; box.appendChild(row);
    });
    var dots = document.createElement('div'); dots.className = 'reader-chat-msg ta reader-chat-typing'; dots.textContent = '正在输入…'; box.appendChild(dots);
  }
  box.scrollTop = box.scrollHeight;
  var ask = document.getElementById('readerChatAsk');
  ask.textContent = g ? '⏹' : '❄️';
  ask.setAttribute('aria-label', g ? '停止' : '请求回复');
}
function readerChatSoon() { clearTimeout(readerChatTimer); readerChatTimer = setTimeout(readerChatRender, 60); }
new MutationObserver(function() { readerTgTag(); if (readerChatOpen && appReader.classList.contains('active')) readerChatSoon(); })
  .observe(document.getElementById('chatMsgList'), { childList: true, subtree: true, characterData: true });
if (typeof syncGenBtn === 'function') { var _readerSyncGen = syncGenBtn; syncGenBtn = function() { _readerSyncGen(); readerChatSoon(); }; }
function setReaderChat(on) {
  readerChatOpen = !!on && !!readerChatChar();
  appReader.classList.toggle('chat-open', readerChatOpen);
  var label = readerChatOpen ? '收起聊天' : '展开聊天';
  readerChatToggle.title = label;
  readerChatToggle.setAttribute('aria-label', label);
  readerChatToggle.setAttribute('aria-expanded', String(readerChatOpen));
  if (readerChatOpen) { readerChatRender(); }
}
readerChatToggle.addEventListener('click', function() { setReaderChat(!readerChatOpen); });
function setReaderDraftQuote(quote) {
  readerDraftQuote = quote;
  readerChatPageButton.setAttribute('aria-pressed', String(!!quote && !quote.bookExcerpt));
  readerChatQuoteButton.hidden = !quote;
  readerChatQuoteLabel.textContent = quote ? (quote.bookExcerpt ? '「' + quote.text + '」' : quote.author) : '';
}
function readerPageQuote(meta, page) {
  var text = bookPageText(meta.id, page).replace(/\s+/g, ' ');
  return { author: '《' + meta.title + '》第 ' + (page + 1) + ' 页', text: text.length > 60 ? text.slice(0, 60) + '…' : text };
}
readerChatPageButton.addEventListener('click', function() {
  var meta = bookMeta(readerState.id), page = readerState.page;
  if (!meta || !readerChatChar()) return;
  if (readerDraftQuote && !readerDraftQuote.bookExcerpt) { setReaderDraftQuote(null); return; }
  setReaderDraftQuote(readerPageQuote(meta, page));
  setReaderChat(true);
});
readerChatQuoteButton.addEventListener('click', function() { setReaderDraftQuote(null); });
function readerChatSend(allowEmptyExcerpt) {
  var text = readerChatInput.value.trim(), c = readerChatChar(), meta = bookMeta(readerState.id);
  if (!text && allowEmptyExcerpt && readerDraftQuote && readerDraftQuote.bookExcerpt) text = '聊聊这一段。';
  if (!text || !c || !meta || !readerChatEnsureRoom(c)) return;
  appendUserMsg(text, { quote: readerDraftQuote, bookId: meta.id });
  setReaderDraftQuote(null);
  readerTgPaintSoon();
  if (typeof markChatActive === 'function') markChatActive();
  readerChatInput.value = ''; readerChatInput.style.height = '';
  readerChatRender();
}
readerChatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); readerChatSend(); }
});
readerChatInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 72) + 'px'; });
function readerRequestReply(c) {
  readerTgPending = { charId: c.id, book: readerState.id, from: Date.now() };
  sendMsg('', true);
  readerChatRender();
}
document.getElementById('readerChatAsk').addEventListener('click', function() {
  var c = readerChatChar();
  if (!c || !readerChatEnsureRoom(c)) return;
  if (genHere()) { stopGenerating(); return; }
  readerChatSend(true);
  readerRequestReply(c);
});
var readerExcerptButton = document.getElementById('readerTgExcerpt'), readerExcerptAtPress = null;
function syncReaderExcerptButton() {
  if (readerExcerptAtPress) return;
  var excerpt = appReader.classList.contains('active') && readerChatChar() && readerSelectedExcerpt();
  if (!excerpt) { readerExcerptButton.hidden = true; return; }
  var page = document.getElementById('readerPage').getBoundingClientRect();
  var lines = Array.from(window.getSelection().getRangeAt(0).getClientRects()).filter(function(r) {
    return r.width > 0 && r.bottom > page.top && r.top < page.bottom;
  });
  if (!lines.length) { readerExcerptButton.hidden = true; return; }
  var panel = appReader.getBoundingClientRect(), scale = panel.width / appReader.offsetWidth || 1;
  var tail = lines[lines.length - 1];
  readerExcerptButton.hidden = false;
  var w = readerExcerptButton.offsetWidth * scale, h = readerExcerptButton.offsetHeight * scale;
  var gap = 8 * scale;
  var left = Math.max(page.left + gap, Math.min(tail.right - w, page.right - w - gap));
  var top = tail.bottom + gap;
  if (top + h > page.bottom - gap) top = Math.max(page.top + gap, lines[0].top - h - gap);
  readerExcerptButton.style.left = (left - panel.left) / scale + 'px';
  readerExcerptButton.style.top = (top - panel.top) / scale + 'px';
}
document.addEventListener('selectionchange', function() {
  if (appReader.classList.contains('active')) syncReaderExcerptButton();
});
document.getElementById('readerPage').addEventListener('scroll', syncReaderExcerptButton, { passive: true });
window.addEventListener('resize', syncReaderExcerptButton);
readerExcerptButton.addEventListener('pointerdown', function() { readerExcerptAtPress = readerSelectedExcerpt(); });
function clearReaderExcerptPress() {
  readerExcerptAtPress = null;
  syncReaderExcerptButton();
}
readerExcerptButton.addEventListener('pointercancel', clearReaderExcerptPress);
window.addEventListener('pointerup', function(e) {
  if (readerExcerptAtPress && !readerExcerptButton.contains(e.target)) clearReaderExcerptPress();
});
readerExcerptButton.addEventListener('click', function() {
  var excerpt = readerSelectedExcerpt() || readerExcerptAtPress;
  clearReaderExcerptPress();
  var meta = bookMeta(readerState.id);
  if (!meta || !readerChatChar()) return;
  if (!excerpt || excerpt.bookId !== readerState.id || excerpt.page !== readerState.page) {
    showToast('先长按选中想聊的文字', 'plain');
    return;
  }
  setReaderDraftQuote(readerExcerptQuote(meta, excerpt));
  window.getSelection().removeAllRanges();
  syncReaderExcerptButton();
  setReaderChat(true);
});
document.getElementById('readerTgStop').addEventListener('click', function() {
  var meta = bookMeta(readerState.id), c = readerTogetherChar();
  if (!meta || !c) return;
  openConfirm('不和「' + (c.charAlias || c.charName) + '」一起看《' + meta.title + '》了？', function() {
    delete bookTogether[c.id];
    saveBookTogether();
    togetherNote(c, '📖 《' + meta.title + '》一起看到第 ' + (readerState.page + 1) + ' 页，先合上了', '（你们暂时不一起看《' + meta.title + '》了，一起看到了第 ' + (readerState.page + 1) + ' 页）');
    setReaderChat(false);
    setReaderDraftQuote(null);
    renderReader();
  });
});

// 角色知道你们在一起看哪本、你看到哪一页（聊天窗口的现实感知里带一段）
// 正在阅读器里和这个角色一起看（在书里发消息、点 ❄️）：只有这时才带书页内容，也先不要状态栏（用户要的）；在聊天窗口时角色只知道在看哪本、看到哪
function readerOpenWith(char) { return !!char && appReader.classList.contains('active') && readerTogetherChar() === char; }
function togetherContextLine(char, history) {
  var t = char && bookTogether[char.id], meta = t && bookMeta(t.bookId);
  if (!meta) return '';
  var pages = bookPages(meta.id), page = bookPageOf(meta.id, meta.pos || 0);
  if (!readerOpenWith(char)) return '【一起看书】你和{{user}}最近在一起看《' + meta.title + '》，看到第 ' + (page + 1) + ' / ' + pages.length + ' 页。{{user}}现在没在看书、在聊天窗口和你聊天，书里的内容等一起看的时候再聊，不用主动提。';
  for (var i = (history || []).length - 1; i >= 0 && history[i].role === 'user'; i--) {
    var message = history[i], excerpt = message.quote && message.quote.bookExcerpt;
    if (!message.recalled && excerpt && excerpt.bookId === meta.id) {
      return '【一起看书】请聊用户选中的片段。随附的前文只用来补充来龙去脉，只依据已提供的正文，不剧透。';
    }
  }
  return '【一起看书】你和{{user}}正在一起看《' + meta.title + '》，{{user}}现在看到第 ' + (page + 1) + ' / ' + pages.length + ' 页（约 ' + Math.floor((page + 1) / pages.length * 100) + '%）。这一页写的是：\n「' + bookPageText(meta.id, page) + '」\n' +
    '聊天时可以自然地聊这一页的内容、人物和你的感受，像坐在一起看书的人；不用每次都提，不要整段复述，也不要说出后面还没看到的情节。';
}

// 阅读器右上角 ✎：和书架上长按 →「编辑」是同一个（bookshelf.js 的 openBookEdit）
function shelfSlotOfNovel(id) { var b = Array.from(document.querySelectorAll('.notes-shelf-area .book')).filter(function(x) { return x._novel === id; })[0]; return b ? b.closest('.book-slot') : null; }
document.getElementById('readerEditBtn').addEventListener('click', function() { var s = shelfSlotOfNovel(readerState.id); if (s) openBookEdit(s); });
document.getElementById('readerPicBtn').addEventListener('click', function() {
  var id = readerState.id, page = readerState.page;
  if (!id || !bookMeta(id)) return;
  openImgPicker(function(src) {
    compressImage(src, 800, function(small) {
      var picId = Date.now().toString(36);
      bookPics(id)[picId] = small;
      saveBookPics(id);
      var text = bookText(id), at = bookPages(id)[page] || 0;
      var next = text.slice(0, at) + '\n\u200b图:' + picId + '\u200b\n' + text.slice(at);
      mphoneStore.save('mphone_book_' + id, next);
      bookTextCache[id] = next;
      delete bookPagesCache[id];
      var meta = bookMeta(id);
      if (meta) { meta.chars = next.length; saveBookMetas(); }
      renderReader();
    });
  });
});
document.getElementById('readerPage').addEventListener('click', function(e) {
  var img = e.target.closest && e.target.closest('.reader-pic');
  if (!img) return;
  var id = readerState.id, picId = img.dataset.pic;
  openImgViewer(img.src, { source: (bookMeta(id) || {}).title || '书', delText: '拿掉这一页的插图？', onDelete: function() {
    var text = bookText(id).replace(new RegExp('\\n?\\u200b图:' + picId + '\\u200b\\n?'), '\n');
    mphoneStore.save('mphone_book_' + id, text);
    bookTextCache[id] = text;
    delete bookPagesCache[id];
    var pics = bookPics(id);
    delete pics[picId];
    saveBookPics(id);
    var meta = bookMeta(id);
    if (meta) { meta.chars = text.length; saveBookMetas(); }
    renderReader();
  } });
});
// 长按卡片上备注下面那行小字：导入的书写看到哪、和谁一起看；笔记本写几页
function bookInfoLine(book) {
  if (book._sys) return { diary: '角色写的日记都在这里', gallery: '聊天、动态、收藏里的图片都在这里', pair: '和每个角色一起写的小本子' }[book._sys] || '';
  var meta = book._novel && bookMeta(book._novel);
  if (!meta) return '笔记本 · ' + ((book._bvPages || []).length || 1) + ' 页';
  var pages = bookPages(meta.id), p = bookPageOf(meta.id, meta.pos || 0);
  var who = Object.keys(bookTogether).filter(function(k) { return bookTogether[k].bookId === meta.id; }).map(function(k) { var c = charList[findCharIdx(k)]; return c ? (c.charAlias || c.charName) : ''; }).filter(Boolean);
  return (meta.pos ? '看到 ' + Math.floor((p + 1) / pages.length * 100) + '%' : '还没开始看') + ' · 共 ' + pages.length + ' 页' + (who.length ? ' · 和「' + who.join('」「') + '」一起看' : '');
}

// ---------- 一起看时聊的，回到聊天窗口用虚线框圈起来（用户要的） ----------
// 在阅读器里发的消息、在阅读器里点 ❄️ 回的消息记 m.tg = 书的 id；聊天列表里连着的这几条外面画一个虚线框，左上角写「一起看《书名》时聊的」
var readerTgPending = null;   // { charId, book, from }：这次请 TA 回的，回来的消息都记上
function readerTgTag() {
  var p = readerTgPending;
  if (!p) return;
  var idx = findCharIdx(p.charId);
  if (idx < 0) { readerTgPending = null; return; }
  var changed = false;
  getChatHistory(idx).forEach(function(m) { if (m.role === 'assistant' && !m.tg && m.time >= p.from) { m.tg = p.book; changed = true; } });
  if (changed) { saveHistories(); readerTgPaintSoon(); }
  if (!genStates[genKey(charList[idx], true)]) readerTgPending = null;   // 回完了
}
var readerTgRaf = 0;
function readerTgPaintSoon() { if (!readerTgRaf) readerTgRaf = requestAnimationFrame(function() { readerTgRaf = 0; readerTgPaint(); }); }
function readerTgPaint() {
  var list = document.getElementById('chatMsgList');
  if (!list) return;
  var layer = list.querySelector(':scope > .cr-tg-layer');
  list.querySelectorAll('.cr-tg-start, .cr-tg-end').forEach(function(el) { el.classList.remove('cr-tg-start', 'cr-tg-end'); });
  var groups = [], g = null;
  Array.prototype.forEach.call(list.children, function(el) {
    if (el === layer) return;
    var m = el._msg;
    if (m) {
      if (m.tg && g && g.book === m.tg) { g.last = el; return; }
      g = m.tg ? { book: m.tg, first: el, last: el } : null;
      if (g) groups.push(g);
      return;
    }
    if (g && el.matches('.cr-action-note, .cr-msg-stamp')) g.last = el;   // 跟在后面的动作小字、小时间也框进去
  });
  if (!groups.length) { if (layer) layer.remove(); return; }
  if (!layer) { layer = document.createElement('div'); layer.className = 'cr-tg-layer'; list.appendChild(layer); }
  groups.forEach(function(gr) { gr.first.classList.add('cr-tg-start'); gr.last.classList.add('cr-tg-end'); });
  layer.innerHTML = '';
  groups.forEach(function(gr) {
    var top = gr.first.offsetTop - 22, bottom = gr.last.offsetTop + gr.last.offsetHeight + 8;
    var box = document.createElement('div');
    box.className = 'cr-tg-box';
    box.style.top = top + 'px';
    box.style.height = Math.max(20, bottom - top) + 'px';
    var meta = bookMeta(gr.book), lab = document.createElement('span');
    lab.className = 'cr-tg-label';
    lab.textContent = '📖 一起看' + (meta ? '《' + meta.title + '》' : '') + '时聊的';
    box.appendChild(lab);
    layer.appendChild(box);
  });
}
(function() {
  var list = document.getElementById('chatMsgList');
  new MutationObserver(function(ms) {
    if (ms.some(function(m) { return m.removedNodes.length || Array.prototype.some.call(m.addedNodes, function(n) { return !(n.classList && n.classList.contains('cr-tg-layer')); }); })) readerTgPaintSoon();
  }).observe(list, { childList: true });
  window.addEventListener('resize', readerTgPaintSoon);
  list.addEventListener('load', readerTgPaintSoon, true);   // 图片加载完高度变了
  // 从阅读器回到聊天窗口时重新量一下（藏着的时候量不出位置）
  new MutationObserver(function() { if (!appReader.classList.contains('active')) readerTgPaintSoon(); }).observe(appReader, { attributes: true, attributeFilter: ['class'] });
})();

// ---------- 一起看中途回到聊天：聊天窗口上面一个「继续看」小条，点了回到看到的地方（用户要的，不用再去加号里找） ----------
function togetherChipSync() {
  var view = document.querySelector('#appChatRoom .cr-view[data-crview="chat"]');
  if (!view) return;
  var chip = document.getElementById('crTogetherChip');
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'crTogetherChip';
    chip.className = 'cr-together-chip';
    chip.addEventListener('click', function() {
      var c = charList[openingChatCharIdx], t = c && bookTogether[c.id];
      if (t && bookMeta(t.bookId)) openReader(t.bookId, { charId: c.id });
    });
    view.appendChild(chip);
  }
  var c = charList[openingChatCharIdx], t = c && bookTogether[c.id], meta = t && bookMeta(t.bookId);
  var on = !!meta && appChatRoom.classList.contains('active') && !appReader.classList.contains('active');
  chip.classList.toggle('show', on);
  view.classList.toggle('has-tg-chip', on);   // 列表顶上让出位置，不挡住第一条
  if (on) chip.textContent = '📖 一起看《' + meta.title + '》· 第 ' + (bookPageOf(meta.id, meta.pos || 0) + 1) + ' 页　继续看 ›';
}
[appChatRoom, appReader].forEach(function(el) { new MutationObserver(togetherChipSync).observe(el, { attributes: true, attributeFilter: ['class'] }); });
if (typeof renderRoomLists === 'function') { var _tgRender = renderRoomLists; renderRoomLists = function(idx) { var r = _tgRender.apply(this, arguments); togetherChipSync(); return r; }; }
var _tgSaveTogether = saveBookTogether;
saveBookTogether = function() { _tgSaveTogether(); togetherChipSync(); };
