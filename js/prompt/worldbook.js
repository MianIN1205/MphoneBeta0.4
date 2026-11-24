// 眠花糖机 — Prompt：世界书（文件夹、条目详情、开关、按关键词取用）

// =============================================
// Prompt — 世界书详情视图
// =============================================
var wbDetailView = document.getElementById('wbDetailView');
var wbDetailBack = document.getElementById('wbDetailBack');
var wbDetailTitle= document.getElementById('wbDetailTitle');
var wbEntryName  = document.getElementById('wbEntryName');
var wbEntryKeywords = document.getElementById('wbEntryKeywords');
var wbEntryContent  = document.getElementById('wbEntryContent');
var wbPositionPicker = createPromptPositionPicker(document.getElementById('wbInjectPos'));
var wbDetailSave = document.getElementById('wbDetailSave');
var wbAddEntryBtn= document.getElementById('wbAddEntryBtn');
var wbPanelList  = document.getElementById('wbPanelList');
var wbDetailDelete = document.getElementById('wbDetailDelete');

// 世界书条目：pos 只保存 before / after；选了深度时按 depth 发送。
// 文件夹：{ id, name }
var wbEntries = mphoneStore.load('mphone_worldbook', []);
// kind 迁移：旧版用 rule: true 表示「写法要求」，新版用 kind 字段（''=默认, 'lore'=设定, 'rule'=要求, 'aux'=辅助）
var WB_KIND_LABELS = { '': '默认', 'lore': '设定', 'rule': '要求', 'aux': '辅助' };
function wbKind(entry) {
  if (entry.kind && WB_KIND_LABELS[entry.kind]) return entry.kind;
  return entry.rule ? 'rule' : '';
}
function wbIsRule(entry) { var k = wbKind(entry); return k === 'rule' || k === 'aux'; }
(function migrateWbKind() {
  var changed = false;
  wbEntries.forEach(function(e) {
    if (e.kind === undefined && e.rule) { e.kind = 'rule'; delete e.rule; changed = true; }
    else if (e.kind === undefined) { e.kind = ''; changed = true; }
  });
  if (changed) mphoneStore.save('mphone_worldbook', wbEntries);
})();
var wbFolders = mphoneStore.load('mphone_wb_folders', []);
var wbEditingId = null;   // null = 新建
var wbOpenFolders = {};   // 列表里展开的文件夹（默认全部收起）
function wbPosition(pos) { return pos === 'after' ? 'after' : 'before'; }
function wbImportedPlacement(entry) {
  var ext = entry.extensions || {};
  var inChat = Number(ext.position == null ? entry.position : ext.position) === 4;
  return { pos: inChat ? 'after' : 'before', depth: inChat ? promptDepth(ext.depth == null ? entry.depth : ext.depth) : undefined };
}
function normalizeWbPositions(entries) {
  var changed = false;
  entries.forEach(function(entry) {
    var pos = wbPosition(entry.pos);
    if (entry.pos !== pos) { entry.pos = pos; changed = true; }
  });
  return changed;
}
if (normalizeWbPositions(wbEntries)) mphoneStore.save('mphone_worldbook', wbEntries);
var WB_NONE = '';         // 未分类

function saveWbEntries() {
  normalizeWbPositions(wbEntries);
  mphoneStore.save('mphone_worldbook', wbEntries);
  mphoneStore.save('mphone_wb_folders', wbFolders);
}
function genWbId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// 按文件夹分组：先各文件夹（含空的），最后是有条目的「未分类」
function wbGroups() {
  var groups = wbFolders.map(function(f) {
    return { id: f.id, name: f.name, entries: wbEntries.filter(function(e) { return e.folderId === f.id; }) };
  });
  var known = {};
  wbFolders.forEach(function(f) { known[f.id] = true; });
  var loose = wbEntries.filter(function(e) { return !e.folderId || !known[e.folderId]; });
  if (loose.length) groups.push({ id: WB_NONE, name: '未分类', entries: loose });
  return groups;
}

var FOLDER_ARROW = '<svg class="wb-folder-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>';

// 轻量弹出菜单（长按文件夹 / 条目时用）
var _wbMenuOverlay = null;
function wbShowMenu(anchor, items) {
  wbCloseMenu();
  var ov = document.createElement('div');
  ov.className = 'wb-ctx-overlay';
  var menu = document.createElement('div');
  menu.className = 'wb-ctx-menu';
  items.forEach(function(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wb-ctx-item' + (item.danger ? ' danger' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', function(e) { e.stopPropagation(); wbCloseMenu(); item.action(); });
    menu.appendChild(btn);
  });
  ov.appendChild(menu);
  ov.addEventListener('click', function() { wbCloseMenu(); });
  document.body.appendChild(ov);
  _wbMenuOverlay = ov;
  requestAnimationFrame(function() {
    var r = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left + (r.width - mw) / 2, window.innerWidth - mw - 8));
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  });
}
function wbCloseMenu() {
  if (_wbMenuOverlay) { _wbMenuOverlay.remove(); _wbMenuOverlay = null; }
}

function renderWbList() {
  var wrap = document.getElementById('wbFolderList');
  wrap.innerHTML = '';
  var groups = wbGroups();
  if (!groups.some(function(g) { return g.id === WB_NONE; })) groups.push({ id: WB_NONE, name: '未分类', entries: [] });
  groups.forEach(function(g) {
    var folder = document.createElement('div');
    folder.className = 'wb-folder' + (wbOpenFolders[g.id] ? ' open' : '');
    folder.dataset.promptDropGroup = g.id;
    if (g.id === WB_NONE && !g.entries.length) folder.classList.add('prompt-drop-only');
    var head = document.createElement('div');
    head.className = 'wb-folder-head';
    head.innerHTML = FOLDER_ARROW;
    var name = document.createElement('span');
    name.className = 'wb-folder-name';
    name.textContent = g.name;
    var count = document.createElement('span');
    count.className = 'wb-folder-count';
    count.textContent = g.entries.length + ' 条';
    head.appendChild(name);
    head.appendChild(count);
    head.addEventListener('click', function() {
      wbOpenFolders[g.id] = !wbOpenFolders[g.id];
      folder.classList.toggle('open', wbOpenFolders[g.id]);
    });
    // 文件夹头部只留一个 + 按钮，其余操作走长按菜单
    var addBtn = document.createElement('button');
    addBtn.className = 'wb-folder-act';
    var isSysFolder = typeof WB_SYSTEM_FOLDER_ID !== 'undefined' && g.id === WB_SYSTEM_FOLDER_ID;
    if (!isSysFolder) {
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-label', '新建条目');
      addBtn.addEventListener('click', function(e) { e.stopPropagation(); openWbDetail(null, g.id); });
      head.appendChild(addBtn);
    }
    // 长按文件夹头：弹菜单（重命名 / 导出 / 删除）
    var menuItems = [];
    if (g.id !== WB_NONE && !isSysFolder) {
      menuItems.push({ label: '重命名', action: function() {
        askName('重命名文件夹', g.name, function(n) {
          wbFolders.forEach(function(f) { if (f.id === g.id) f.name = n; });
          saveWbEntries(); renderWbList();
        });
      }});
    }
    if (g.entries.length) {
      menuItems.push({ label: '导出', action: function() { wbExport([g], g.name); } });
    }
    if (g.id !== WB_NONE) {
      menuItems.push({ label: '删除', danger: true, action: function() { askDelWbFolder(g); } });
    }
    if (menuItems.length) {
      wbLongPress(head, function() { wbShowMenu(head, menuItems); });
    }
    folder.appendChild(head);

    var body = document.createElement('div');
    body.className = 'wb-folder-body';
    g.entries.forEach(function(entry) {
      var card = document.createElement('div');
      card.className = 'pf-entry-card';
      card.dataset.promptDropEntry = '';
      card._promptEntry = entry;
      promptDragGrip(card, wrap, function(folderId, target, after) {
        var belongs = folderId === WB_NONE
          ? function(e) { return !wbFolders.some(function(f) { return f.id === e.folderId; }); }
          : function(e) { return e.folderId === folderId; };
        if (!movePromptEntry(wbEntries, entry, target, after, belongs)) return;
        entry.folderId = folderId;
        wbOpenFolders[folderId] = true;
        saveWbEntries();
        renderWbList();
      });
      var cb = document.createElement('div');
      cb.className = 'pf-entry-card-body';
      var nameEl = document.createElement('div');
      nameEl.className = 'pf-entry-card-name';
      nameEl.textContent = entry.name || '未命名';
      var subEl = document.createElement('div');
      subEl.className = 'pf-entry-card-sub';
      var depth = promptDepth(entry.depth);
      var kind = wbKind(entry);
      var kindLabel = kind ? (WB_KIND_LABELS[kind] || '') + ' · ' : '';
      var position = depth === undefined ? kindLabel + (entry.pos === 'after' ? '聊天记录后' : '聊天记录前') : '插入深度 ' + depth;
      subEl.textContent = position + (entry.keywords ? ' · 关键词：' + entry.keywords : ' · 常驻');
      cb.appendChild(nameEl);
      cb.appendChild(subEl);
      card.appendChild(cb);
      // 条目开关：关掉后保留内容，但不发给模型
      card.classList.toggle('disabled', entry.enabled === false);
      var tl = document.createElement('label');
      tl.className = 'st-toggle-wrap';
      tl.innerHTML = '<input type="checkbox"><span class="st-toggle-slider"></span>';
      var tcb = tl.querySelector('input');
      tcb.checked = entry.enabled !== false;
      tl.addEventListener('click', function(e) { e.stopPropagation(); });
      tcb.addEventListener('change', function() {
        entry.enabled = this.checked;
        card.classList.toggle('disabled', !this.checked);
        saveWbEntries();
      });
      card.appendChild(tl);
      card.insertAdjacentHTML('beforeend', '<svg class="pf-entry-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>');
      card.addEventListener('click', function() { openWbDetail(entry.id); });
      // 长按条目：弹菜单（重命名 / 删除）；系统条目不能删
      wbLongPress(card, function() {
        if (entry.system) { showToast('系统条目不能删除', 'plain'); return; }
        wbShowMenu(card, [
          { label: '重命名', action: function() {
            askName('重命名条目', entry.name || '', function(n) {
              entry.name = n;
              saveWbEntries();
              renderWbList();
            });
          }},
          { label: '删除', danger: true, action: function() {
            openConfirm('删除条目「' + (entry.name || '未命名') + '」？', function() {
              wbEntries = wbEntries.filter(function(x) { return x.id !== entry.id; });
              saveWbEntries();
              renderWbList();
            });
          }}
        ]);
      });
      body.appendChild(card);
    });
    if (!g.entries.length) body.innerHTML = '<div class="auto-hint" style="margin:0 0 6px;">空文件夹</div>';
    folder.appendChild(body);
    wrap.appendChild(folder);
  });
}

// 导出世界书：眠花糖机的世界书文件（「导入世界书」认得），一个文件夹或者全部
function wbExport(groups, name) {
  groups = groups.filter(function(g) { return g.entries.length; });
  if (!groups.length) { showToast('还没有世界书', 'plain'); return; }
  mphoneExportFile('worldbook', { folders: groups.map(function(g) {
    return { name: g.name, entries: g.entries.map(function(e) { return { name: e.name, keywords: e.keywords || '', content: e.content || '', pos: wbPosition(e.pos), enabled: e.enabled !== false, kind: wbKind(e), rule: wbIsRule(e), depth: promptDepth(e.depth) }; }) };
  }) }, '世界书-' + name);
}
document.getElementById('wbExportAllBtn').addEventListener('click', function(e) { e.stopPropagation(); wbExport(wbGroups(), '全部'); });
// 长按半秒（按在开关上、手指挪动了都不算），长按后松手的那次点击不再打开 / 收起
function wbLongPress(el, onLong) {
  var timer = null, sx = 0, sy = 0, fired = false;
  el.addEventListener('pointerdown', function(e) {
    fired = false;
    if (e.target.closest('.st-toggle-wrap, .wb-folder-act')) return;
    sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(function() { timer = null; fired = true; if (navigator.vibrate) navigator.vibrate(15); onLong(); }, 500);
  });
  el.addEventListener('pointermove', function(e) {
    if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(timer); timer = null; }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(ev) { el.addEventListener(ev, function() { clearTimeout(timer); timer = null; }); });
  el.addEventListener('click', function(e) { if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  el.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}
// 删文件夹：里面有条目时问一下——条目移到未分类，还是连条目一起删（用户要的）
// 系统文件夹不可删
function askDelWbFolder(g) {
  if (typeof WB_SYSTEM_FOLDER_ID !== 'undefined' && g.id === WB_SYSTEM_FOLDER_ID) {
    showToast('系统文件夹不能删除', 'plain'); return;
  }
  var drop = function(alsoEntries) {
    wbFolders = wbFolders.filter(function(f) { return f.id !== g.id; });
    if (alsoEntries) wbEntries = wbEntries.filter(function(en) { return en.folderId !== g.id; });
    else wbEntries.forEach(function(en) { if (en.folderId === g.id) en.folderId = WB_NONE; });
    saveWbEntries();
    renderWbList();
  };
  if (!g.entries.length) { openConfirm('删除文件夹「' + g.name + '」？', function() { drop(false); }); return; }
  openConfirm('删除文件夹「' + g.name + '」？', function() { drop(true); },
    { desc: '里面有 ' + g.entries.length + ' 条，可以先移到未分类', okText: '全部删除', alt: '移到未分类', onAlt: function() { drop(false); } });
}

// 文件夹命名：复用「备注名称」弹窗
var _wbFolderNameCb = null;
// 问一个名字（文件夹、预设都用这个弹窗）
function askName(title, value, cb) {
  presetModalMode = 'wbFolder';
  _wbFolderNameCb = cb;
  document.querySelector('#presetModal .modal-title').textContent = title;
  presetNameInput.value = value || '';
  presetModal.classList.add('open');
  presetNameInput.focus();
}

document.getElementById('wbAddFolderBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  askName('新建文件夹', '', function(n) {
    var f = { id: genWbId('wf'), name: n };
    wbFolders.push(f);
    wbOpenFolders[f.id] = true;
    saveWbEntries();
    renderWbList();
  });
});

// folderId：新建时预选的文件夹
var _wbOrigFolderId = WB_NONE;
function openWbDetail(id, folderId) {
  var entry = null;
  wbEntries.forEach(function(e) { if (e.id === id) entry = e; });
  wbEditingId = entry ? entry.id : null;
  wbDetailTitle.textContent = entry ? (entry.name || '世界书条目') : '新建条目';
  wbEntryName.value     = entry ? entry.name : '';
  wbEntryKeywords.value = entry ? entry.keywords : '';
  wbEntryContent.value  = entry ? entry.content : '';
  var sel = document.getElementById('wbEntryFolder');
  sel.innerHTML = '';
  [{ id: WB_NONE, name: '未分类' }].concat(wbFolders).forEach(function(f) {
    var o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.name;
    sel.appendChild(o);
  });
  var curFolder = entry ? (entry.folderId || WB_NONE) : (folderId || WB_NONE);
  sel.value = curFolder;
  if (sel.selectedIndex < 0) sel.value = WB_NONE;
  _wbOrigFolderId = sel.value;
  wbPositionPicker.set(wbPosition(entry && entry.pos), entry && entry.depth);
  wbEntryKind.querySelectorAll('.pf-radio-btn').forEach(function(b) { b.classList.toggle('selected', b.dataset.val === wbKind(entry || {})); });
  // 系统条目：只能改内容和开关，不能删、不能改位置/类型/文件夹
  var isSys = entry && entry.system;
  wbDetailDelete.classList.toggle('hidden', !entry || isSys);
  sel.disabled = isSys;
  wbEntryName.readOnly = isSys;
  document.getElementById('wbInjectPos').classList.toggle('disabled', isSys);
  wbEntryKind.classList.toggle('disabled', isSys);
  if (isSys) wbDetailTitle.textContent = '系统 · ' + (entry.name || '世界书条目');
  // 「移动」按钮只在编辑已有条目时显示
  var moveBtn = document.getElementById('wbEntryMoveBtn');
  if (moveBtn) moveBtn.style.display = entry ? '' : 'none';
  wbDetailView.classList.add('open');
}

var wbEntryKind = document.getElementById('wbEntryKind');
wbEntryKind.querySelectorAll('.pf-radio-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    wbEntryKind.querySelectorAll('.pf-radio-btn').forEach(function(b) { b.classList.toggle('selected', b === btn); });
  });
});
wbDetailBack.addEventListener('click', function() { wbDetailView.classList.remove('open'); });

// 「移动」按钮：选了不同的文件夹后点移动，弹确认再执行
document.getElementById('wbEntryMoveBtn').addEventListener('click', function() {
  var sel = document.getElementById('wbEntryFolder');
  var target = sel.value;
  if (target === _wbOrigFolderId) { showToast('已经在这个文件夹了', 'plain'); return; }
  var entry = null;
  wbEntries.forEach(function(e) { if (e.id === wbEditingId) entry = e; });
  if (!entry) return;
  var folderName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '未分类';
  openConfirm('移动到「' + folderName + '」？', function() {
    entry.folderId = target;
    _wbOrigFolderId = target;
    wbOpenFolders[target] = true;
    saveWbEntries();
    renderWbList();
    showToast('✓ 已移动', 'success');
  });
});

wbAddEntryBtn.addEventListener('click', function(e) { e.stopPropagation(); openWbDetail(null); });

wbDetailSave.addEventListener('click', function() {
  var data = {
    name:     wbEntryName.value.trim() || '未命名',
    keywords: wbEntryKeywords.value.trim(),
    content:  wbEntryContent.value.trim(),
    folderId: document.getElementById('wbEntryFolder').value,
    kind:     (wbEntryKind.querySelector('.pf-radio-btn.selected') || {}).dataset.val || '',
    pos:      wbPositionPicker.pos
  };
  var entry = null;
  wbEntries.forEach(function(e) { if (e.id === wbEditingId) entry = e; });
  if (entry) {
    // 系统条目只允许改内容和关键词，其他字段保持不变
    if (entry.system) {
      entry.content = data.content;
      entry.keywords = data.keywords;
    } else {
      Object.assign(entry, data);
    }
  } else {
    data.id = genWbId('wb');
    wbEntries.push(data);
  }
  var saved = entry || data, depth = wbPositionPicker.depth;
  if (!saved.system) {
    if (depth === undefined) delete saved.depth; else saved.depth = depth;
  }
  wbOpenFolders[data.folderId] = true;
  saveWbEntries();
  renderWbList();
  wbDetailView.classList.remove('open');
});

// 世界书 — 删除按钮（系统条目不可删）
wbDetailDelete.addEventListener('click', function() {
  if (!wbEditingId) {
    wbDetailView.classList.remove('open');
    return;
  }
  var target = null;
  wbEntries.forEach(function(e) { if (e.id === wbEditingId) target = e; });
  if (target && target.system) { showToast('系统条目不能删除', 'plain'); return; }
  var delId = wbEditingId;
  openConfirm('删除此世界书条目？', function() {
    wbEntries = wbEntries.filter(function(e) { return e.id !== delId; });
    saveWbEntries();
    renderWbList();
    wbDetailView.classList.remove('open');
  });
});

wbDetailDelete.classList.add('hidden');
renderWbList();

// 取出某角色当前应注入的世界书条目：已关联（整个文件夹或单个条目）且（无关键词 或 最近 6 条消息里出现任一关键词）
// drama：剧情窗口用「剧情窗口」那栏的关联（角色设置里分开勾的；没单独设置过就不关联）
function charWbOf(char, drama) {
  if (drama) {
    var selection = (char && char.dramaWb) || {};
    return { ids: selection.ids || [], folders: selection.folders || [] };
  }
  return { ids: (char && char.worldbookIds) || [], folders: (char && char.worldbookFolders) || [] };
}
function getActiveWbEntries(char, hist, drama) {
  var wb = charWbOf(char, drama);
  var ids = wb.ids;
  var folders = wb.folders;
  if (!ids.length && !folders.length) return [];
  var known = {};
  wbFolders.forEach(function(f) { known[f.id] = true; });
  // 关键词只在最近 6 条里你说的话（和开场旁白）中找：角色自己提到的不算，免得 TA 提一次 → 触发 → 又提一次，反复绕着同一个设定说
  var recent = hist.slice(-6).filter(function(m) { return m.role === 'user'; })
    .map(function(m) { return typeof m.content === 'string' ? m.content : ''; }).join('\n').toLowerCase();
  return wbEntries.filter(function(e) {
    if (e.system) return false;   // 系统条目由 getSystemWbEntries 单独注入
    var fid = (e.folderId && known[e.folderId]) ? e.folderId : WB_NONE;
    var linked = ids.indexOf(e.id) >= 0 || folders.indexOf(fid) >= 0;
    if (!linked || !e.content || e.enabled === false) return false;
    if (!e.keywords) return true;
    return e.keywords.split(/[,，]/).some(function(k) {
      k = k.trim().toLowerCase();
      return k && recent.indexOf(k) >= 0;
    });
  });
}
