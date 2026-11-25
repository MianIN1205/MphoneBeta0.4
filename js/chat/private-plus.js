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
function privatePlusCall(ctx) {
  if (activePrivateCall) { activePrivateCall.restore(); return; }
  var picker = privatePlusDialog('通话', '<div class="mine-acc-actions"><button class="mine-acc-btn mine-acc-btn-close" data-mode="audio">语音通话</button><button class="mine-acc-btn mine-acc-btn-add" data-mode="video">视频通话</button></div>');
  picker.querySelector('[data-close]').onclick = function() { picker.remove(); };
  picker.querySelectorAll('[data-mode]').forEach(function(button) {
    button.onclick = function() { picker.remove(); openPrivateCallScreen(ctx, button.dataset.mode); };
  });
}
function openPrivateCallScreen(ctx, mode) {
  if (activePrivateCall) { activePrivateCall.restore(); return; }
  var d = document.createElement('section');
  d.className = 'private-call-screen';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-label', mode === 'video' ? '视频通话' : '语音通话');
  d.innerHTML = '<header class="private-call-header"><button type="button" data-minimize aria-label="收起为小窗">⌄</button><span></span></header>' +
    '<div class="private-call-stage"><div class="private-call-avatar"></div><strong class="private-call-name"></strong><small class="private-call-time">00:00</small><video playsinline muted hidden></video></div>' +
    '<div class="private-call-bottom"><div class="private-call-status" role="status"></div><details class="private-call-text"><summary>文字聊天</summary><div class="private-call-log" aria-live="polite"></div><div class="private-call-compose"><textarea class="field-input" rows="1" placeholder="你想说的话" aria-label="你的文字"></textarea><button type="button" data-send>发送</button></div></details><audio controls hidden></audio>' +
    '<div class="private-call-controls"><button type="button" data-record>录音</button><button type="button" data-camera hidden>关摄像头</button><button type="button" data-close>挂断</button></div></div>';
  var mini = document.createElement('button');
  mini.type = 'button'; mini.className = 'private-call-mini'; mini.hidden = true;
  mini.setAttribute('aria-label', '返回通话');
  mini.innerHTML = '<span aria-hidden="true">☎</span><small>00:00</small>';
  var root = document.querySelector('.phone');
  root.appendChild(d); root.appendChild(mini);
  var name = ctx.char.charAlias || ctx.char.charName || 'TA';
  d.querySelector('.private-call-header span').textContent = mode === 'video' ? '视频通话' : '语音通话';
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
  var video = d.querySelector('video'), audio = d.querySelector('audio'), input = d.querySelector('textarea'), log = d.querySelector('.private-call-log'), hint = d.querySelector('[role="status"]');
  var record = d.querySelector('[data-record]'), send = d.querySelector('[data-send]'), camera, mic, recorder, recording, voiceUrl, cameraRequest = 0, recordTimer, closed = false, busy = false;
  var request = new AbortController(), conversation = [];
  function stop(stream) { if (stream) stream.getTracks().forEach(function(track) { track.stop(); }); }
  function close() {
    if (typeof stopCallRing === 'function') stopCallRing();
    closed = true; request.abort(); clearTimeout(recordTimer); stop(camera); stop(mic); audio.pause();
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    clearInterval(clock); activePrivateCall = null; d.remove(); mini.remove();
  }
  d.querySelector('[data-close]').onclick = close;
  var cameraButton = d.querySelector('[data-camera]');
  async function startCamera() {
    if (camera) return;
    var attempt = ++cameraRequest;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (closed || camera || attempt !== cameraRequest) { stop(stream); return; }
      camera = stream; video.srcObject = stream; video.hidden = false; await video.play();
      cameraButton.textContent = '关摄像头';
      hint.textContent = '发送时会附上当前画面';
    } catch (_) { hint.textContent = '摄像头不可用，可以继续语音或文字'; }
  }
  hint.textContent = '可以录音，也可以用文字聊天';
  if (mode === 'video') {
    cameraButton.hidden = false;
    cameraButton.onclick = function() {
      if (!camera) { startCamera(); return; }
      cameraRequest++; stop(camera); camera = null; video.srcObject = null; video.hidden = true;
      cameraButton.textContent = '开摄像头';
      hint.textContent = '摄像头已关闭';
    };
    cameraButton.textContent = '开摄像头';
    startCamera();
  }
  record.onclick = async function() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    record.disabled = true;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closed) { stop(mic); return; }
      var chunks = [];
      recorder = new MediaRecorder(mic);
      recorder.ondataavailable = function(event) { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = function() {
        clearTimeout(recordTimer); stop(mic); record.textContent = '录音';
        if (!chunks.length || closed) return;
        var reader = new FileReader();
        reader.onload = function() { recording = reader.result; hint.textContent = '录音已就绪，点发送。'; d.querySelector('.private-call-text').open = true; };
        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.start();
      recordTimer = setTimeout(function() { if (recorder.state === 'recording') recorder.stop(); }, 60000);
      record.textContent = '结束录音';
    } catch (_) { stop(mic); hint.textContent = '麦克风不可用，可以继续打字。'; }
    finally { record.disabled = false; }
  };
  function paint(name, text) {
    var line = document.createElement('div');
    line.textContent = name + '：' + text;
    log.appendChild(line); log.scrollTop = log.scrollHeight;
  }
  send.onclick = async function() {
    var text = input.value.trim(), voice = recording, cfg = getApiCfg(ctx.char);
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
      paint('我', parts[0].text); paint(name, reply);
      d.querySelector('.private-call-text').open = true;
      conversation.push({ role: 'user', content: parts[0].text }, { role: 'assistant', content: reply });
      input.value = ''; recording = null; hint.textContent = '可以继续说话或打字。';
      if (ttsCfg.key) {
        try {
          var blob = await ttsSynthesize(reply);
          if (closed) return;
          if (voiceUrl) URL.revokeObjectURL(voiceUrl);
          voiceUrl = URL.createObjectURL(blob); audio.src = voiceUrl; audio.hidden = false;
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
