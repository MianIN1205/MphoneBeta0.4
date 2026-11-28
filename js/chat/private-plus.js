// 私聊加号：位置、纪念礼物、虚拟转账和通话。
function privatePlusContext() {
  var idx = openingChatCharIdx, char = charList[idx];
  return char && !char.isGroup ? { char: char, idx: idx, view: currentCrSubView, history: getActiveHistory(idx) } : null;
}
function privatePlusCurrent(ctx) {
  return appChatRoom.classList.contains('active') && charList[openingChatCharIdx] === ctx.char &&
    currentCrSubView === ctx.view && getActiveHistory(openingChatCharIdx) === ctx.history;
}
function privatePlusDialog(title, body) {
  var overlay = document.createElement('div');
  overlay.className = 'mine-acc-overlay open';
  overlay.innerHTML = '<div class="mine-acc-modal private-plus-modal" role="dialog" aria-modal="true"><div class="mine-acc-title"></div>' + body +
    '<div class="mine-acc-actions"><button type="button" class="mine-acc-btn mine-acc-btn-close" data-close>关闭</button></div></div>';
  var heading = overlay.querySelector('.mine-acc-title');
  heading.textContent = title;
  overlay.querySelector('[role="dialog"]').setAttribute('aria-label', title);
  document.querySelector('.phone').appendChild(overlay);
  return overlay;
}
function privatePlusPush(ctx, data, label) {
  if (!privatePlusCurrent(ctx)) { showToast('聊天窗口已切换', 'plain'); return; }
  var msg = { role: 'user', content: label, privateCard: data, time: Date.now() };
  ctx.history.push(msg);
  saveHistories();
  renderHistMsg(msg);
  return msg;
}
function privatePlusLocation(ctx) {
  var d = privatePlusDialog('发送位置', '<input class="field-input" data-city placeholder="城市（可选）" maxlength="40" aria-label="城市"><input class="field-input" data-street placeholder="街道（可选）" maxlength="60" aria-label="街道"><input class="field-input" data-place placeholder="具体地点" maxlength="100" aria-label="具体地点"><div class="auto-hint" role="status"></div><div class="mine-acc-actions"><button class="mine-acc-btn mine-acc-btn-close" data-locate>现实定位</button><button class="mine-acc-btn mine-acc-btn-add" data-send>发送位置</button></div>');
  var cityInput = d.querySelector('[data-city]'), streetInput = d.querySelector('[data-street]'), input = d.querySelector('[data-place]'), hint = d.querySelector('[role="status"]'), coords = null, locate = d.querySelector('[data-locate]');
  d.querySelector('[data-close]').onclick = function() { d.remove(); };
  locate.onclick = function() {
    if (!navigator.geolocation) { hint.textContent = '当前设备无法定位，可以手动填写。'; return; }
    locate.disabled = true;
    hint.textContent = '正在获取位置…';
    navigator.geolocation.getCurrentPosition(function(pos) {
      coords = { lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5) };
      hint.textContent = '已定位 · ' + coords.lat + ', ' + coords.lon;
      locate.disabled = false;
    }, function() { hint.textContent = '定位没成功，可以手动填写。'; locate.disabled = false; }, { timeout: 10000 });
  };
  d.querySelector('[data-send]').onclick = function() {
    var city = cityInput.value.trim(), street = streetInput.value.trim(), place = input.value.trim();
    var title = [city, street, place].filter(Boolean).join(' · ') || (coords ? '我的位置' : '');
    if (!title) { shakeEl(input); return; }
    if (privatePlusPush(ctx, { kind: 'location', title: title, city: city, street: street, place: place, coords: coords }, '[位置] ' + title)) d.remove();
  };
}
function privatePlusGifts() { return mphoneStore.load('mphone_keepsakes', []) || []; }
function privatePlusGift(ctx) {
  var d = privatePlusDialog('纪念礼物', '<input class="field-input" placeholder="礼物名称" maxlength="60" aria-label="礼物名称"><textarea class="field-input" rows="2" maxlength="400" placeholder="它的来历或想说的话"></textarea><select class="field-input" aria-label="保管方式"><option value="phone">收进小手机</option><option value="char">交给角色保管</option><option value="story">记录剧情里互赠的物品</option></select><button class="mine-acc-btn mine-acc-btn-add" data-send>送出纪念礼物</button><div class="private-keepsakes"></div>');
  var list = d.querySelector('.private-keepsakes');
  privatePlusGifts().filter(function(g) { return g.charId === ctx.char.id; }).forEach(function(g) {
    var row = document.createElement('div');
    row.className = 'auto-hint';
    row.textContent = g.title + ' · ' + g.keeper + (g.note ? ' · ' + g.note : '');
    list.appendChild(row);
  });
  d.querySelector('[data-close]').onclick = function() { d.remove(); };
  d.querySelector('[data-send]').onclick = function() {
    var input = d.querySelector('input'), title = input.value.trim(), select = d.querySelector('select');
    if (!title) { shakeEl(input); return; }
    var gift = { kind: 'gift', charId: ctx.char.id, title: title, note: d.querySelector('textarea').value.trim(),
      keeper: select.options[select.selectedIndex].text, time: Date.now() };
    if (!privatePlusPush(ctx, gift, '[纪念礼物] ' + title + (gift.note ? '：' + gift.note : '') + '（' + gift.keeper + '）')) return;
    mphoneStore.save('mphone_keepsakes', [gift].concat(privatePlusGifts()));
    d.remove();
  };
}
function privatePlusTransfer(ctx) {
  var uid = (resolveCharAccount(ctx.char) || getMainAccount()).uid || getMainAccount().uid;
  var d = privatePlusDialog('虚拟转账', '<div class="auto-hint">只使用小手机虚拟余额。TA 收下后才扣款。</div><select class="field-input"><option value="转账">转给 TA</option><option value="代买">给 TA 买东西</option></select><input class="field-input" type="number" min="0.01" step="0.01" placeholder="金额" aria-label="金额"><textarea class="field-input" rows="2" maxlength="100" placeholder="备注或物品名称"></textarea><button class="mine-acc-btn mine-acc-btn-add" data-send>确认发送</button>');
  d.querySelector('[data-close]').onclick = function() { d.remove(); };
  d.querySelector('[data-send]').onclick = function() {
    var amount = Number(d.querySelector('input').value), title = d.querySelector('select').value, note = d.querySelector('textarea').value.trim();
    if (!Number.isFinite(amount) || amount < 0.01 || Math.round(amount * 100) > Math.round(getWallet(uid).balance * 100)) { showToast('请检查金额和余额', 'error'); return; }
    if (title === '代买' && !note) { showToast('请填写要买的物品', 'plain'); return; }
    amount = Math.round(amount * 100) / 100;
    if (!privatePlusCurrent(ctx)) return;
    var id = genFeedId('pt');
    var wallets = loadWallets(), wallet = wallets[uid] || getWallet(uid);
    wallet.records.unshift({ id: id, amount: 0, note: title + ' · 待领取', time: Date.now(), transferState: 'pending' });
    wallets[uid] = wallet;
    mphoneStore.save('mphone_wallet', wallets);
    var data = { kind: 'transfer', id: id, uid: uid, title: title, note: note, recipient: ctx.char.charAlias || ctx.char.charName || 'TA', amount: amount, state: 'pending' };
    var msg = privatePlusPush(ctx, data, '[' + title + ' · 待领取] ' + fmtMoney(amount) + (note ? ' · ' + note : ''));
    d.remove();
    privatePlusDecide(ctx.char, msg);
  };
}
var privateTransferBusy = Object.create(null);
async function privatePlusDecide(char, msg) {
  var card = msg.privateCard, cfg = getApiCfg(char);
  if (card.state !== 'pending' || privateTransferBusy[card.id]) return;
  if (!cfg.url || !cfg.key || !cfg.model) { showToast('配置模型后，点卡片让 TA 决定', 'plain'); return; }
  privateTransferBusy[card.id] = true;
  try {
    var answer = await llmRequest([
      { role: 'system', content: '你是' + (char.charAlias || char.charName || '角色') + '。' + (char.persona || '') + ' 这是虚拟转账，由你决定是否收下。只输出 ACCEPT 或 DECLINE。' },
      { role: 'user', content: msg.content }
    ], { cfg: cfg, stream: false });
    var verdict = String(answer || '').trim().toUpperCase();
    if (verdict !== 'ACCEPT' && verdict !== 'DECLINE') throw new Error('未收到明确选择');
    var wallets = loadWallets(), wallet = wallets[card.uid];
    var record = wallet && wallet.records.find(function(item) { return item.id === card.id; });
    if (!record || !record.transferState) throw new Error('找不到待处理的账目');
    if (record.transferState === 'pending') {
      if (verdict === 'ACCEPT' && wallet.balance < card.amount) {
        showToast('余额不足，这笔转账仍待处理', 'plain'); return;
      }
      record.transferState = verdict === 'ACCEPT' ? 'accepted' : 'declined';
      record.note = card.title + (record.transferState === 'accepted' ? ' · 已收下' : ' · 已拒绝');
      if (record.transferState === 'accepted') {
        record.amount = -card.amount;
        wallet.balance = Number(fmtMoney(wallet.balance - card.amount));
      }
      mphoneStore.save('mphone_wallet', wallets);
    }
    card.state = record.transferState;
    msg.content = '[' + card.title + ' · ' + (card.state === 'accepted' ? '已收下' : '已拒绝') + '] ' + fmtMoney(card.amount) + (card.note ? ' · ' + card.note : '');
    saveHistories();
    document.querySelectorAll('.chat-msg-row').forEach(function(row) {
      if (row._msg !== msg) return;
      var bubble = row.querySelector('.private-card-transfer');
      if (bubble) bubble.title = privateTransferLabel(card);
      var retry = row.querySelector('.private-plus-retry');
      if (retry) retry.hidden = true;
    });
  } catch (_) { showToast('TA 暂时没能决定，可以点卡片再试', 'plain'); }
  finally { delete privateTransferBusy[card.id]; }
}
function privateTransferLabel(card) {
  return card.state === 'accepted' ? '已收下' : card.state === 'declined' ? '已拒绝' : '待领取';
}
function privateKeepsakeCard(bubble, card) {
  var header = document.createElement('div');
  header.className = 'private-card-header';
  var icon = document.createElement('span');
  icon.className = 'private-card-icon';
  icon.setAttribute('aria-hidden', 'true');
  if (card.kind === 'transfer') icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V6a2 2 0 0 1 2-2h11v3M5 7h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z"/><path d="M20 11h-5a2 2 0 0 0 0 4h5m-5-2h.01"/></svg>';
  var category = document.createElement('span');
  category.textContent = card.kind === 'gift' ? '纪念礼物' : '转给 ' + (card.recipient || (charList[openingChatCharIdx] || {}).charAlias || (charList[openingChatCharIdx] || {}).charName || 'TA');
  var title = document.createElement('strong');
  title.className = 'private-card-title';
  title.textContent = card.kind === 'gift' ? card.title : fmtMoney(card.amount);
  bubble.replaceChildren();
  if (card.kind === 'gift') {
    var ribbon = document.createElement('span');
    ribbon.className = 'private-gift-ribbon';
    ribbon.innerHTML = '<i></i><b></b>';
    ribbon.setAttribute('aria-hidden', 'true');
    bubble.appendChild(ribbon);
    header.appendChild(category);
    bubble.append(header, title);
  } else {
    var text = document.createElement('div');
    text.className = 'private-transfer-main';
    title.textContent += ' 元';
    text.append(category, title);
    header.append(icon, text);
    bubble.appendChild(header);
    bubble.title = privateTransferLabel(card);
  }
  if (card.note || card.kind === 'transfer') {
    var note = document.createElement('div');
    note.className = 'private-card-note';
    note.textContent = card.kind === 'transfer' ? '备注：' + (card.note || '—') : card.note;
    bubble.appendChild(note);
  }
}
function appendPrivatePlusCard(role, m, list, empty) {
  var result = appendMsg(role, '', false, list, empty), card = m.privateCard;
  var text = document.createElement('div');
  text.className = 'private-plus-message';
  text.textContent = m.content;
  result.bubble.replaceChildren(text);
  if (card.kind === 'location') {
    var map = document.createElement('div');
    map.className = 'private-map-art';
    var marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '📍';
    map.appendChild(marker);
    result.bubble.prepend(map);
    text.textContent = card.title;
    result.bubble.classList.add('private-location-card');
  }
  result.bubble.classList.add('private-plus-card');
  if (card.kind === 'tarot') renderTarotShare(result.bubble, card);
  if (card.kind === 'location' && card.coords && Number.isFinite(card.coords.lat) && Number.isFinite(card.coords.lon)) {
    var link = document.createElement('a');
    link.textContent = card.title;
    link.setAttribute('aria-label', '在地图中查看：' + card.title);
    link.href = 'https://www.openstreetmap.org/?mlat=' + card.coords.lat + '&mlon=' + card.coords.lon + '#map=16/' + card.coords.lat + '/' + card.coords.lon;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    text.replaceChildren(link);
  }
  if (card.kind === 'gift' || card.kind === 'transfer') {
    result.bubble.classList.add('private-keepsake-card', 'private-card-' + card.kind);
    privateKeepsakeCard(result.bubble, card);
  }
  if (card.kind === 'transfer') {
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'private-plus-retry'; button.textContent = '让 TA 决定';
    button.hidden = card.state !== 'pending';
    button.onclick = async function() {
      var char = charList[openingChatCharIdx];
      if (!char) return;
      await privatePlusDecide(char, m);
      button.hidden = card.state !== 'pending';
    };
    result.bubble.appendChild(button);
  }
  return result;
}
var activePrivateCall = null;
var callPop = document.getElementById('callPop');
if (callPop && callPop.parentNode !== document.body) document.body.appendChild(callPop);
var callPopAnchor = null;
function placeCallPop() {
  if (!callPopAnchor || !callPop) return;
  var r = callPopAnchor.getBoundingClientRect(), w = callPop.offsetWidth || 132;
  callPop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  callPop.style.bottom = (window.innerHeight - r.top + 8) + 'px';
}
function closeCallPick() { if (callPop) callPop.classList.remove('open'); }
function openCallPick(anchor) {
  var ctx = privatePlusContext();
  if (!ctx) { showToast('这个功能先在私聊里使用', 'plain'); return; }
  if (activePrivateCall) {
    closeCallPick();
    if (typeof closeCrPlusPanel === 'function') closeCrPlusPanel();
    activePrivateCall.restore();
    return;
  }
  callPopAnchor = anchor || document.querySelector('.cr-plus-item[data-func="通话"]');
  callPop.classList.add('open');
  placeCallPop();
  requestAnimationFrame(placeCallPop);
}
document.addEventListener('pointerdown', function(e) {
  if (!callPop || !callPop.classList.contains('open')) return;
  if (!callPop.contains(e.target) && !(callPopAnchor && callPopAnchor.contains(e.target))) closeCallPick();
}, true);
if (callPop) callPop.querySelectorAll('[data-mode]').forEach(function(button) {
  button.addEventListener('click', function() {
    var ctx = privatePlusContext();
    var mode = button.dataset.mode;
    closeCallPick();
    if (typeof closeCrPlusPanel === 'function') closeCrPlusPanel();
    if (ctx) openPrivateCallScreen(ctx, mode);
  });
});
function privatePlusCall() { openCallPick(); }
function paintCallWave(canvas) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var barW = 2, gap = 2, n = Math.floor(W / (barW + gap));
  for (var i = 0; i < n; i++) {
    var h = ((i * 7 % 13) / 13) * (H * 0.42) + 3;
    ctx.fillStyle = 'rgba(255,244,248,0.88)';
    ctx.fillRect(i * (barW + gap), (H - h) / 2, barW, h);
  }
}
function appendCallLogMsg(m, list, empty) {
  if (empty) empty.style.display = 'none';
  var el = document.createElement('button');
  el.type = 'button';
  el.className = 'cr-recall-notice cr-call-log';
  el.textContent = m.content || '通话';
  el._msg = m;
  el._extras = [];
  el.onclick = function() { openCallRecord(m); };
  list.appendChild(el);
  if (typeof crStick === 'function') crStick(list);
  return el;
}
function openCallRecord(m) {
  var log = m && m.callLog || {};
  var box = document.createElement('div');
  box.className = 'private-call-rec';
  var lines = log.lines || [];
  if (!lines.length) {
    var empty = document.createElement('div');
    empty.className = 'private-call-rec-empty';
    empty.textContent = '这次没有留下文字';
    box.appendChild(empty);
  }
  lines.forEach(function(line) {
    var row = document.createElement('div');
    row.className = 'private-call-rec-line';
    var who = document.createElement('b');
    who.textContent = line.who || '';
    var text = document.createElement('p');
    text.textContent = line.text || '';
    row.appendChild(who);
    row.appendChild(text);
    box.appendChild(row);
  });
  var d = privatePlusDialog(m.content || '通话记录', '');
  d.querySelector('.mine-acc-title').after(box);
  d.querySelector('[data-close]').onclick = function() { d.remove(); };
}
function openPrivateCallScreen(ctx, mode) {
  if (activePrivateCall) { activePrivateCall.restore(); return; }
  var d = document.createElement('section');
  d.className = 'private-call-screen' + (mode === 'video' ? ' is-video' : '');
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-label', mode === 'video' ? '视频通话' : '语音通话');
  var icoDown = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var icoMic = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5a3.2 3.2 0 0 0 3.2-3.2V6.7a3.2 3.2 0 0 0-6.4 0v4.6A3.2 3.2 0 0 0 12 14.5z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 11.2a5 5 0 0 0 10 0M12 16.2v2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var icoMicOff = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 10.8V6.7a3 3 0 0 0-5.2-2M9 9.2v1.8a3 3 0 0 0 4.7 2.5M7.2 11.2a5 5 0 0 0 7.6 3.4M12 16.2v2.6M5 5.2l13 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var icoCam = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="12.5" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 11.2L20.5 8v8l-5-2.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var icoFlip = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5h4V4.5M19.5 15.5h-4v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.2 8.5a6 6 0 0 1 9.6-1.8M15.8 15.5a6 6 0 0 1-9.6 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var icoPhone = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.2 3.6c.4-.4 1.1-.5 1.6-.2l1.8 1.1c.5.3.7.9.4 1.4l-.8 1.7c-.2.4 0 .9.4 1.2 1 .9 2.3 1.4 3.6 1.4.5 0 1 .3 1.2.8l.8 1.9c.2.6.1 1.2-.4 1.5l-1.5 1.1c-.5.4-1.2.3-1.7-.1C9.4 13.4 6.7 10.2 5.5 6.8c-.3-.6-.1-1.3.4-1.7z"/></svg>';
  d.innerHTML = '<header class="private-call-header"><button type="button" data-minimize aria-label="收起通话，不挂断">' + icoDown + '<span>收起</span></button><span class="private-call-title"></span><span></span></header>' +
    '<div class="private-call-stage"><div class="private-call-hero"><div class="private-call-avatar"></div><strong class="private-call-name"></strong><small class="private-call-time">00:00</small></div>' +
    '<div class="private-call-log" aria-live="polite"></div>' +
    '<div class="private-call-self"><video playsinline muted hidden></video><span class="private-call-self-off">摄像头关着</span></div></div>' +
    '<div class="private-call-bottom"><div class="private-call-status" role="status"></div>' +
    '<div class="private-call-take" hidden><button type="button" data-play aria-label="听这段录音">▶</button><canvas class="private-call-wave" width="160" height="28" aria-hidden="true"></canvas><b></b><button type="button" data-drop aria-label="丢掉这段录音">✕</button><audio hidden></audio></div>' +
    '<div class="private-call-compose"><textarea class="field-input" rows="1" placeholder="说一句" aria-label="你的文字"></textarea><button type="button" data-send>发送</button></div>' +
    '<div class="private-call-controls"><button type="button" data-record>' + icoMic + '<span>录音</span></button><button type="button" data-mute aria-label="闭麦">' + icoMicOff + '<span>闭麦</span></button><button type="button" data-camera hidden>' + icoCam + '<span>镜头</span></button><button type="button" data-flip hidden>' + icoFlip + '<span>翻转</span></button><button type="button" data-close>' + icoPhone + '<span>挂断</span></button></div></div>';
  var mini = document.createElement('button');
  mini.type = 'button'; mini.className = 'private-call-mini'; mini.hidden = true;
  mini.setAttribute('aria-label', '返回通话');
  mini.innerHTML = '<span aria-hidden="true">☎</span><small>00:00</small>';
  var root = document.querySelector('.phone');
  root.appendChild(d); root.appendChild(mini);
  var name = ctx.char.charAlias || ctx.char.charName || 'TA';
  d.querySelector('.private-call-title').textContent = mode === 'video' ? '视频通话' : '语音通话';
  d.querySelector('.private-call-name').textContent = name;
  paintCharAvatar(d.querySelector('.private-call-avatar'), ctx.char);
  if (typeof startCallRing === 'function') startCallRing();   // 来电铃声
  function restore() { d.hidden = false; mini.hidden = true; d.querySelector('[data-minimize]').focus(); }
  activePrivateCall = { restore: restore };
  mini.onclick = restore;
  d.querySelector('[data-minimize]').onclick = function() { d.hidden = true; mini.hidden = false; mini.focus(); };
  var started = Date.now();
  var clock = setInterval(function() {
    var elapsed = Math.floor((Date.now() - started) / 1000);
    var time = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
    d.querySelector('.private-call-time').textContent = mini.querySelector('small').textContent = time;
  }, 1000);
  var video = d.querySelector('video'), selfView = d.querySelector('.private-call-self'), input = d.querySelector('textarea'), log = d.querySelector('.private-call-log'), hint = d.querySelector('[role="status"]');
  var record = d.querySelector('[data-record]'), send = d.querySelector('[data-send]'), muteBtn = d.querySelector('[data-mute]'), take = d.querySelector('.private-call-take'), takeAudio = take.querySelector('audio'), camera, mic, recorder, recording, voiceUrls = [], cameraRequest = 0, recordTimer, recStarted = 0, closed = false, busy = false, facing = 'user', muted = false, dropTake = false;
  var request = new AbortController(), conversation = [];
  function btnLabel(btn, text) { btn.querySelector('span').textContent = text; }
  function stop(stream) { if (stream) stream.getTracks().forEach(function(track) { track.stop(); }); }
  function close() {
    if (typeof stopCallRing === 'function') stopCallRing();
    if (!closed) saveCallRecord();
    closed = true; request.abort(); clearTimeout(recordTimer); stop(camera); stop(mic);
    voiceUrls.forEach(function(url) { URL.revokeObjectURL(url); });
    clearInterval(clock); activePrivateCall = null; d.remove(); mini.remove();
  }
  function saveCallRecord() {
    var time = d.querySelector('.private-call-time').textContent || '00:00';
    var lines = [];
    log.querySelectorAll('.private-call-line').forEach(function(el) {
      var whoEl = el.querySelector('b'), textEl = el.querySelector('p');
      lines.push({ who: whoEl ? whoEl.textContent : '', text: textEl ? textEl.textContent : (el.querySelector('audio') ? '语音' : '') });
    });
    var label = (mode === 'video' ? '视频通话 ' : '语音通话 ') + time;
    var msg = { role: 'user', content: label, time: Date.now(), callLog: { mode: mode, lines: lines } };
    if (ctx.history) ctx.history.push(msg);
    if (typeof saveHistories === 'function') saveHistories();
    if (typeof privatePlusCurrent === 'function' && privatePlusCurrent(ctx) && typeof renderHistMsg === 'function') renderHistMsg(msg);
    if (typeof renderChatCharList === 'function') renderChatCharList();
  }
  d.querySelector('[data-close]').onclick = close;
  var cameraButton = d.querySelector('[data-camera]'), flipButton = d.querySelector('[data-flip]');
  function markCamera(on) {
    selfView.classList.toggle('live', on);
    video.hidden = !on;
    video.classList.toggle('unmirror', facing !== 'user');
    btnLabel(cameraButton, on ? '关闭' : '镜头');
    flipButton.hidden = mode !== 'video';
  }
  async function startCamera() {
    if (camera) return;
    var attempt = ++cameraRequest;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      if (closed || camera || attempt !== cameraRequest) { stop(stream); return; }
      camera = stream; video.srcObject = stream; markCamera(true); await video.play();
      hint.textContent = '发送时会附上当前画面';
    } catch (_) { markCamera(false); hint.textContent = '摄像头不可用，可以继续语音或文字'; }
  }
  function stopCamera() {
    cameraRequest++; stop(camera); camera = null; video.srcObject = null; markCamera(false);
    hint.textContent = '摄像头关着';
  }
  hint.textContent = mode === 'video' ? '摄像头关着。要发给 TA 再打开。' : '可以录音，也可以用文字聊天';
  if (mode === 'video') {
    cameraButton.hidden = false;
    cameraButton.onclick = function() { if (!camera) startCamera(); else stopCamera(); };
    flipButton.hidden = false;
    flipButton.onclick = function() {
      if (!camera) { hint.textContent = '先打开摄像头，再翻转。'; return; }
      facing = facing === 'user' ? 'environment' : 'user';
      stop(camera); camera = null; video.srcObject = null;
      startCamera();
    };
    var stage = d.querySelector('.private-call-stage'), drag = null;
    selfView.addEventListener('pointerdown', function(e) {
      var r = stage.getBoundingClientRect(), k = r.width / (stage.offsetWidth || r.width) || 1;
      var box = selfView.getBoundingClientRect();
      drag = { dx: (e.clientX - box.left) / k, dy: (e.clientY - box.top) / k, k: k };
      try { selfView.setPointerCapture(e.pointerId); } catch (_) {}
    });
    selfView.addEventListener('pointermove', function(e) {
      if (!drag) return;
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / drag.k - drag.dx, y = (e.clientY - r.top) / drag.k - drag.dy;
      x = Math.max(0, Math.min(stage.clientWidth - selfView.offsetWidth, x));
      y = Math.max(0, Math.min(stage.clientHeight - selfView.offsetHeight, y));
      selfView.style.right = 'auto';
      selfView.style.left = x + 'px';
      selfView.style.top = y + 'px';
    });
    selfView.addEventListener('pointerup', function() { drag = null; });
    selfView.addEventListener('pointercancel', function() { drag = null; });
  }
  function showTake(src, ms) {
    recording = src;
    take.querySelector('b').textContent = Math.max(1, Math.round(ms / 1000)) + '″';
    takeAudio.src = src;
    take.hidden = false;
    paintCallWave(take.querySelector('canvas'));
    d.querySelector('.private-call-bottom').classList.add('has-take');
    hint.textContent = '录音好了，点发送。';
  }
  function clearTake() {
    recording = null;
    take.hidden = true;
    takeAudio.pause();
    takeAudio.removeAttribute('src');
    take.querySelector('[data-play]').textContent = '▶';
    d.querySelector('.private-call-bottom').classList.remove('has-take');
  }
  take.querySelector('[data-play]').onclick = function() {
    if (!takeAudio.getAttribute('src')) return;
    if (takeAudio.paused) { takeAudio.play(); this.textContent = '❚❚'; }
    else { takeAudio.pause(); this.textContent = '▶'; }
  };
  takeAudio.onended = function() { take.querySelector('[data-play]').textContent = '▶'; };
  take.querySelector('[data-drop]').onclick = function() { clearTake(); hint.textContent = '这段录音丢掉了。'; };
  muteBtn.onclick = function() {
    muted = !muted;
    muteBtn.classList.toggle('is-on', muted);
    btnLabel(muteBtn, muted ? '开麦' : '闭麦');
    muteBtn.setAttribute('aria-label', muted ? '开麦' : '闭麦');
    if (muted && recorder && recorder.state === 'recording') { dropTake = true; recorder.stop(); }
    hint.textContent = muted ? '麦关着，可以打字。' : '可以录音，也可以打字。';
  };
  record.onclick = async function() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (muted) { hint.textContent = '麦关着。点开麦以后再录音。'; return; }
    record.disabled = true;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closed) { stop(mic); return; }
      var chunks = [];
      recorder = new MediaRecorder(mic);
      recorder.ondataavailable = function(event) { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = function() {
        clearTimeout(recordTimer); stop(mic); btnLabel(record, '录音'); record.classList.remove('is-on');
        if (dropTake || !chunks.length || closed) { dropTake = false; return; }
        var reader = new FileReader();
        reader.onload = function() { showTake(reader.result, Date.now() - recStarted); };
        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
      };
      clearTake();
      recStarted = Date.now();
      recorder.start();
      recordTimer = setTimeout(function() { if (recorder.state === 'recording') recorder.stop(); }, 60000);
      btnLabel(record, '结束'); record.classList.add('is-on');
    } catch (_) { stop(mic); hint.textContent = '麦克风不可用，可以继续打字。'; }
    finally { record.disabled = false; }
  };
  function paint(who, text, src) {
    var line = document.createElement('div');
    line.className = 'private-call-line' + (who === '我' ? ' mine' : '');
    var tag = document.createElement('b');
    tag.textContent = who;
    line.appendChild(tag);
    if (text) {
      var p = document.createElement('p');
      p.textContent = text;
      line.appendChild(p);
    }
    if (src) {
      var clip = document.createElement('audio');
      clip.controls = true; clip.src = src;
      line.appendChild(clip);
      if (who !== '我') clip.play().catch(function() {});
    }
    log.appendChild(line); log.scrollTop = log.scrollHeight;
    return line;
  }
  send.onclick = async function() {
    var typed = input.value.trim(), text = typed, voice = recording, cfg = getApiCfg(ctx.char);
    if (busy || (!text && !voice && !camera) || (recorder && recorder.state === 'recording')) return;
    if (!cfg.url || !cfg.key || !cfg.model) { hint.textContent = '请先配置角色使用的模型。'; return; }
    if (typeof stopCallRing === 'function') stopCallRing();   // 接通，停铃声
    send.disabled = true; busy = true;
    try {
      if (voice && !text && mediaCfg.voiceMode !== 'audio') {
        if (!sttReady()) { hint.textContent = '未配置语音转写，请打字，或在设置里启用发送音频。'; return; }
        text = String(await sttTranscribe(voice) || '').trim();
        if (!text) { hint.textContent = '没转出文字，可以重录或打字。'; return; }
      }
      var parts = [{ type: 'text', text: text || (voice ? '（通话录音）' : '看看我给你看的画面。') }];
      if (voice && mediaCfg.voiceMode === 'audio') parts.push({ type: 'input_audio', _voiceSrc: voice, _transcript: text });
      if (camera && video.videoWidth) {
        var canvas = document.createElement('canvas');
        var scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        parts.push({ type: 'image_url', image_url: { url: canvas.toDataURL('image/jpeg', 0.8) } });
      }
      var turn = { role: 'user', content: parts.length === 1 ? parts[0].text : parts };
      hint.textContent = '正在等 TA 回复…';
      var name = ctx.char.charAlias || ctx.char.charName || 'TA';
      var context = [{ role: 'system', content: '你是' + name + '。' + (ctx.char.persona || '') + ' 你正在和用户通话，请自然、简短地用口语回应。' }].concat(conversation.slice(-10), turn);
      var reply = String(await llmRequest(context, { cfg: cfg, stream: false, signal: request.signal }) || '').trim();
      if (closed) return;
      if (!reply) throw new Error('没有回复');
      var mineText = typed;
      if (!mineText && text && text !== '（通话录音）' && text !== '看看我给你看的画面。') mineText = text;
      if (!mineText && !voice && camera) mineText = '发了一帧画面';
      paint('我', mineText, voice || '');
      var replyLine = paint(name, reply);
      conversation.push({ role: 'user', content: parts[0].text }, { role: 'assistant', content: reply });
      input.value = ''; clearTake(); hint.textContent = '可以继续说话或打字。';
      if (ttsCfg.key) {
        try {
          var blob = await ttsSynthesize(reply, '', null, ctx.char);
          if (closed) return;
          var url = URL.createObjectURL(blob);
          voiceUrls.push(url);
          var talk = document.createElement('audio');
          talk.controls = true; talk.src = url;
          replyLine.appendChild(talk);
          talk.play().catch(function() {});
        } catch (_) { hint.textContent = '语音播放不可用，文字回复已显示。'; }
      }
    } catch (err) { if (!closed) hint.textContent = '通话消息发送失败：' + explainError(err).title; }
    finally { send.disabled = false; busy = false; }
  };
}
function openPrivatePlus(kind) {
  var ctx = privatePlusContext();
  if (!ctx) { showToast('这个功能先在私聊里使用', 'plain'); return; }
  closeCrPlusPanel();
  ({ '位置': privatePlusLocation, '礼物': privatePlusGift, '转账': privatePlusTransfer, '通话': privatePlusCall })[kind](ctx);
}
