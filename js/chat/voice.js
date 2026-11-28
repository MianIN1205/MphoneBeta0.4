// 眠花糖机 — 语音：点麦克风弹出录音小条（按住录、松手发、滑到 ✕ 取消）、语音气泡、波形、转写

// =============================================
// 麦克风键 — 点一下弹出录音小条，按住 🎙 录音 → 语音气泡
// =============================================
var crMicBtn      = document.getElementById('crMicBtn');
var _micTimer     = null;
var _mediaRecorder= null;
var _recordStart  = 0;
var _micStream    = null;
var _micHolding   = false;
var pendingVoiceMessages = new WeakMap();

// 麦克风授权后一直保持连接，离开聊天窗口或切到后台才释放：在同一次聊天里只问一次权限
// （网页拿不到永久权限；安卓选「使用应用时允许」会被浏览器记住，iPhone 会经常重新询问）
function getMicStream() {
  if (_micStream && _micStream.getAudioTracks().some(function(t) { return t.readyState === 'live'; })) {
    return Promise.resolve(_micStream);
  }
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _micStream = stream;
    return stream;
  });
}
function releaseMic() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') return;   // 正在录音时不释放
  if (_micStream) { _micStream.getTracks().forEach(function(t) { t.stop(); }); _micStream = null; }
}
new MutationObserver(function() {
  if (!appChatRoom.classList.contains('active')) releaseMic();
}).observe(appChatRoom, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', function() {
  if (document.hidden) releaseMic();
});

// 录音小条里的时长和波纹
var _recTimerEl    = document.getElementById('recTimer');
var _recLiveCanvas = document.getElementById('recLiveCanvas');
var _recTimerInt   = null;
var _recAnimFrame  = null;
var _recAnalyser   = null;
var _recAudioCtx   = null;

function startLiveWaveform(stream) {
  try {
    _recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var src = _recAudioCtx.createMediaStreamSource(stream);
    _recAnalyser = _recAudioCtx.createAnalyser();
    _recAnalyser.fftSize = 64;
    src.connect(_recAnalyser);
    var bufLen = _recAnalyser.frequencyBinCount;
    var dataArr = new Uint8Array(bufLen);
    var cvs = _recLiveCanvas;
    var W = cvs.width, H = cvs.height;
    var ctx = cvs.getContext('2d');
    var k = cvs.width / (cvs.clientWidth || cvs.width);   // 高清屏上画布是两倍大，柱子跟着放大
    var BAR_W = 3 * k, GAP = 2 * k;
    var barCount = Math.floor(W / (BAR_W + GAP));
    function draw() {
      _recAnimFrame = requestAnimationFrame(draw);
      _recAnalyser.getByteFrequencyData(dataArr);
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < barCount; i++) {
        var di = Math.floor(i * bufLen / barCount);
        var norm = dataArr[di] / 255;
        var barH = Math.max(3, norm * (H - 4));
        var x = i * (BAR_W + GAP);
        var y = (H - barH) / 2;
        ctx.fillStyle = 'rgba(200,80,120,' + (0.4 + norm * 0.55) + ')';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1.5);
        else { ctx.rect(x, y, BAR_W, barH); }
        ctx.fill();
      }
    }
    draw();
  } catch(e) {}
}

// 绘制竖线柱状波形（AudioBuffer）
function drawWaveform(canvas, audioBuffer) {
  var ctx  = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var data = audioBuffer.getChannelData(0);
  var BAR_W = 2.5, GAP = 2;
  var barCount = Math.floor(W / (BAR_W + GAP));
  var step = Math.max(1, Math.floor(data.length / barCount));
  var amp = H / 2;
  for (var i = 0; i < barCount; i++) {
    var sum = 0;
    for (var j = 0; j < step; j++) sum += Math.abs(data[i * step + j] || 0);
    var avg = sum / step;
    var barH = Math.max(3, avg * amp * 8);
    barH = Math.min(barH, H - 2);
    var x = i * (BAR_W + GAP);
    var y = (H - barH) / 2;
    ctx.fillStyle = 'rgba(160,80,120,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1);
    else { ctx.rect(x, y, BAR_W, barH); }
    ctx.fill();
  }
}

// 绘制随机占位竖线波形（解码失败时）
function drawFlatWaveform(canvas, fixed) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var BAR_W = 2.5, GAP = 2;
  var barCount = Math.floor(W / (BAR_W + GAP));
  var amp = H / 2;
  for (var i = 0; i < barCount; i++) {
    var barH = (fixed ? (i * 7 % 13) / 13 : Math.random()) * amp * 0.7 + 3;
    var x = i * (BAR_W + GAP);
    var y = (H - barH) / 2;
    ctx.fillStyle = 'rgba(160,80,120,0.32)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1);
    else { ctx.rect(x, y, BAR_W, barH); }
    ctx.fill();
  }
}

// 创建语音气泡并添加到消息列表
// dataURL → 字节
function dataUrlToBytes(src) {
  var b64 = String(src).split(',')[1] || '';
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function getDecodeCtx() {
  if (!window._mphoneDecodeCtx) window._mphoneDecodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._mphoneDecodeCtx;
}
function decodeAudioBytes(bytes) {
  return new Promise(function(resolve, reject) {
    try { getDecodeCtx().decodeAudioData(bytes.buffer.slice(0), resolve, reject); } catch (e) { reject(e); }
  });
}

// 语音消息气泡：m = { role: 'user', content: '[语音消息]', voice: { src: dataURL, dur: 秒 }, transcript }
// 返回行元素；转写区作为附属元素（删除消息时一起移除）
function createVoiceBubble(m, list, empty) {
  if (empty) empty.style.display = 'none';
  var durationSec = m.voice.dur || 1;
  var mins   = Math.floor(durationSec / 60);
  var secs   = Math.round(durationSec % 60);
  var durStr = mins + ':' + String(secs).padStart(2, '0');
  var preview = list._lookPreview;
  var audio = preview ? null : new Audio(m.voice.src || '');

  // 气泡宽度按时长自适应（短语音 120px … ≥18s→220px）
  var bubbleW = Math.min(220, Math.max(120, 92 + durationSec * 7));

  var row = document.createElement('div');
  var role = m.role === 'assistant' ? 'ai' : 'user';
  row.className = 'chat-msg-row ' + role;
  row.appendChild(createMsgAvatar(role));

  // 气泡（点击非播放键区域 → 展开/收起转文字）
  var bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble voice-msg';
  bubble.style.cssText = 'padding:8px 10px;cursor:pointer;user-select:none;-webkit-user-select:none;width:' + bubbleW + 'px;box-sizing:border-box;';

  var inner = document.createElement('div');
  inner.className = 'voice-bubble-inner';

  var playBtn = document.createElement('button');
  playBtn.className = 'voice-play-btn';
  playBtn.setAttribute('aria-label', '播放语音');
  playBtn.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><polygon points="3,2 14,8 3,14"/></svg>';

  // 波形宽度 = 气泡宽 − 左右内边距 20 − 播放键 28 − 两个间距 14 − 时长 32
  var cvsW = Math.max(24, bubbleW - 94);
  var cvs = document.createElement('canvas');
  cvs.className = 'voice-waveform';
  cvs.width = cvsW; cvs.height = 28;

  var durEl = document.createElement('span');
  durEl.className = 'voice-duration';
  durEl.textContent = durStr;

  if (m.voice.src || preview || (m.role === 'assistant' && m.transcript)) inner.appendChild(playBtn);
  inner.appendChild(cvs);
  inner.appendChild(durEl);
  bubble.appendChild(inner);
  row.appendChild(bubble);

  // 展开时直接显示随消息保存的文字。
  var transcriptWrap = document.createElement('div');
  transcriptWrap.className = 'voice-transcript-wrap' + (m.role === 'assistant' ? ' incoming' : '');
  transcriptWrap.inert = true;
  var transcriptStatus = document.createElement('div');
  transcriptStatus.className = 'voice-transcript-status';
  transcriptWrap.append(createVoiceTranscript(m, transcriptStatus), transcriptStatus);
  list.appendChild(row);
  list.appendChild(transcriptWrap);
  row._msg = m;
  row._extras = [transcriptWrap];
  if (preview) {
    // iframe 载入的是序列化后的 HTML，canvas 上的波形需要作为背景图一并带进去。
    drawFlatWaveform(cvs, true);
    cvs.style.backgroundImage = 'url(' + cvs.toDataURL() + ')';
    return row;
  }

  // 解码绘制静态波形（结果缓存供停止播放后重绘）
  var _decoded = null;
  function drawStaticWave() {
    if (_decoded) drawWaveform(cvs, _decoded); else drawFlatWaveform(cvs);
  }
  (m.voice.src ? decodeAudioBytes(dataUrlToBytes(m.voice.src)) : Promise.reject())
    .then(function(decoded) { _decoded = decoded; drawWaveform(cvs, decoded); })
    .catch(function() { drawFlatWaveform(cvs); });

  // 播放时波纹动画
  var _waveAnim = null;
  function startWaveAnim() {
    var ctx2 = cvs.getContext('2d');
    var W = cvs.width, H = cvs.height;
    var BAR_W = 2.5, GAP = 2;
    var barCount = Math.floor(W / (BAR_W + GAP));
    var phase = 0;
    function frame() {
      if (audio.paused || audio.ended) return;
      _waveAnim = requestAnimationFrame(frame);
      phase += 0.10;
      ctx2.clearRect(0, 0, W, H);
      for (var i = 0; i < barCount; i++) {
        var wave = 0.5 + 0.5 * Math.sin(phase + i * 0.38);
        var barH = 3 + wave * (H - 8);
        var x = i * (BAR_W + GAP);
        var y = (H - barH) / 2;
        ctx2.fillStyle = 'rgba(200,80,120,' + (0.35 + wave * 0.58) + ')';
        ctx2.beginPath();
        if (ctx2.roundRect) ctx2.roundRect(x, y, BAR_W, barH, 1);
        else { ctx2.rect(x, y, BAR_W, barH); }
        ctx2.fill();
      }
    }
    _waveAnim = requestAnimationFrame(frame);
  }
  function stopWaveAnim() {
    cancelAnimationFrame(_waveAnim); _waveAnim = null;
    drawStaticWave();
  }

  // 播放 / 停止
  var _playing = false;
  var PLAY_SVG  = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><polygon points="3,2 14,8 3,14"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><rect x="2" y="2" width="4" height="12"/><rect x="10" y="2" width="4" height="12"/></svg>';
  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (_playing) {
      audio.pause(); audio.currentTime = 0;
      playBtn.innerHTML = PLAY_SVG; _playing = false; stopWaveAnim();
      return;
    }
    function begin() {
      audio.play().catch(function() {});
      playBtn.innerHTML = PAUSE_SVG; _playing = true; startWaveAnim();
    }
    if (m.voice.src) { begin(); return; }
    if (m.voice._speaking) return;
    var speaker = charList[openingChatCharIdx];
    if (!speaker || !speaker.chatCfg || !speaker.chatCfg.voiceApi) {
      transcriptWrap.classList.add('open');
      transcriptWrap.inert = false;
      showToast('这条还是文字。打开「使用语音模型」后再点播放，就会转成声音', 'plain');
      return;
    }
    if (typeof ttsSynthesize !== 'function' || typeof ttsActive !== 'function' || !ttsActive().key) {
      showToast('还没填语音密钥，这条还听不了', 'plain');
      return;
    }
    m.voice._speaking = true;
    durEl.textContent = '…';
    ttsSynthesize(m.transcript, '', null, speaker).then(function(blob) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = function() { reject(reader.error); };
        reader.readAsDataURL(blob);
      });
    }).then(function(src) {
      m.voice.src = src;
      audio.src = src;
      return decodeAudioBytes(dataUrlToBytes(src)).then(function(buf) {
        if (buf && buf.duration) {
          m.voice.dur = Math.max(1, Math.round(buf.duration * 10) / 10);
          var mm = Math.floor(m.voice.dur / 60), ss = Math.round(m.voice.dur % 60);
          durEl.textContent = mm + ':' + String(ss).padStart(2, '0');
        }
        _decoded = buf || _decoded;
        if (_decoded) drawWaveform(cvs, _decoded);
      }).catch(function() {});
    }).then(function() {
      saveHistories();
      begin();
    }).catch(function(err) {
      durEl.textContent = durStr;
      showToast('语音没读出来：' + (err && err.message ? err.message : '失败'), 'error');
    }).then(function() { delete m.voice._speaking; });
  });
  audio.addEventListener('ended', function() {
    playBtn.innerHTML = PLAY_SVG; _playing = false; stopWaveAnim();
  });

  // 点击波纹或时长展开文字，播放键独立操作。
  bubble.addEventListener('click', function(e) {
    if (e.target === playBtn || playBtn.contains(e.target)) return;
    transcriptWrap.inert = !transcriptWrap.classList.toggle('open');
  });

  list.scrollTop = list.scrollHeight;
  return row;
}

function createVoiceTranscript(message, status) {
  var card = document.createElement('div');
  card.className = 'voice-transcript-card';
  var label = document.createElement('div');
  label.className = 'voice-transcript';
  label.dataset.placeholder = message.voice.src ? '未识别内容' : '未填写文字';
  var input = document.createElement('textarea');
  input.className = 'voice-transcript-editor';
  input.rows = 2;
  input.placeholder = '填写原话或声音描述';
  input.setAttribute('aria-label', '语音转写文字');
  input.hidden = true;
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'voice-transcript-edit';
  var pencil = DRAMA_HEAD_ICONS.edit;
  var check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  var retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'voice-transcript-status voice-transcript-retry';
  retry.textContent = '用原音重新转写';
  function paint() {
    label.textContent = message.transcript || '';
    var kind = message.voice.transcriptStatus;
    status.textContent = { partial: '部分转写', model: '角色听写', stt: '识别接口转写' }[kind] || '';
    status.hidden = !status.textContent;
    retry.hidden = !message.voice.src || !input.hidden || kind === 'manual';
    label.hidden = !input.hidden;
    button.innerHTML = input.hidden ? pencil : check;
    button.setAttribute('aria-label', input.hidden ? '编辑语音转写' : '保存语音转写');
  }
  function done(save) {
    if (input.hidden) return;
    var value = input.value.trim();
    if (save && value !== (message.transcript || '')) {
      message.transcript = value;
      if (value) message.voice.transcriptStatus = 'manual';
      else delete message.voice.transcriptStatus;
      delete message.voice.summary;
      delete message.voice.summaryEdited;
      saveHistories();
    }
    input.hidden = true;
    paint();
  }
  button.addEventListener('pointerdown', function(e) { if (!input.hidden) e.preventDefault(); });
  button.addEventListener('click', function() {
    if (!input.hidden) { done(true); return; }
    input.value = message.transcript || '';
    input.hidden = false;
    paint();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('blur', function() { done(true); });
  input.addEventListener('keydown', function(e) {
    var save = e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (e.isComposing || (!save && e.key !== 'Escape')) return;
    e.preventDefault();
    done(save);
    button.focus({ preventScroll: true });
  });
  retry.addEventListener('click', async function() {
    if (!sttReady()) { showToast('到设置 → 语音 API → 语音识别，填一个能听声音的模型', 'plain'); return; }
    var src = message.voice.src, original = message.transcript, originalStatus = message.voice.transcriptStatus;
    retry.disabled = true;
    retry.textContent = '正在转写…';
    try {
      var text = await sttTranscribeWhisper(src);
      if (!message.recalled && message.voice.src === src && message.transcript === original && message.voice.transcriptStatus === originalStatus && input.hidden) {
        message.transcript = text;
        message.voice.transcriptStatus = 'stt';
        saveHistories();
        refreshVoiceTranscript(message);
      }
    } catch (err) {
      showToast('重新转写失败 · ' + explainError(err).title, 'error');
    } finally {
      retry.disabled = false;
      retry.textContent = '用原音重新转写';
    }
  });
  card._refreshVoiceTranscript = paint;
  card.append(label, input, button, retry);
  paint();
  return card;
}
function refreshVoiceTranscript(message) {
  document.querySelectorAll('.chat-msg-row').forEach(function(row) {
    if (row._msg !== message) return;
    (row._extras || []).forEach(function(extra) {
      var card = extra.querySelector('.voice-transcript-card');
      if (card && card._refreshVoiceTranscript) card._refreshVoiceTranscript();
    });
  });
}

// =============================================
// 点麦克风：输入栏上方弹出一个小条 [✕ 取消] [🎙 按住说话] [时长] [波纹] [提示]
// · 按住 🎙 开始录音，松手就发送；录音时把手指滑到左边的红色 ✕ 上再松手，就是取消
// · 再点一次麦克风、点别处、打开表情 / 加号抽屉、切到剧情，小条都会收起
// =============================================
var voicePop    = document.getElementById('voicePop');
var voiceRecBtn = document.getElementById('voiceRecBtn');
var voiceCancel = document.getElementById('voiceCancel');
var voiceHint   = document.getElementById('voiceHint');
var VOICE_HOLD_MS = 80;    // 按住这么久才开始录，免得轻点一下就录（以前 200，用户嫌前摇长）
var _voiceZone = '';   // 录音时手指停在哪：'cancel' 左边 ✕ / 'text' 右边「文」

function voiceHintText(t) { if (voiceHint) voiceHint.textContent = t; }
var voiceToText = document.getElementById('voiceToText');
// 小条最下面一行小字：提示当前模型会收到录音还是转写。
function voiceCapPaint() {
  var el = document.getElementById('voiceCap'), c = charList[openingChatCharIdx];
  var cfg = c && typeof getApiCfg === 'function' ? getApiCfg(c) : null;
  if (!cfg || !cfg.model) { el.textContent = ''; return; }
  var can = typeof llmCaps === 'function' && llmCaps(cfg).audio;
  el.textContent = can ? '这个模型可以听录音' : '这个模型会读语音转写';
}
function openVoicePop() {
  if (typeof closeCrPlusPanel === 'function') closeCrPlusPanel();
  voicePop.classList.add('open');
  crMicBtn.classList.add('active');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) getMicStream().catch(function() {});   // 先把麦克风准备好，按下去马上就能录（第一次会在这里问权限）
  voiceHintText('按住说话');
  voiceCapPaint();
  _recTimerEl.textContent = '0:00';
  var c = _recLiveCanvas.getContext('2d'); c.clearRect(0, 0, _recLiveCanvas.width, _recLiveCanvas.height);
}
function closeVoicePop() {
  if (!voicePop.classList.contains('open')) return;
  if (_micHolding) finishRecording(false);
  voicePop.classList.remove('open');
  crMicBtn.classList.remove('active');
}
crMicBtn.addEventListener('click', function() {
  if (voicePop.classList.contains('open')) closeVoicePop(); else openVoicePop();
});
// 点小条和麦克风以外的地方：收起
document.addEventListener('pointerdown', function(e) {
  if (!voicePop.classList.contains('open') || _micHolding) return;
  if (voicePop.contains(e.target) || crMicBtn.contains(e.target)) return;
  closeVoicePop();
});
new MutationObserver(function() {
  if (!appChatRoom.classList.contains('active')) closeVoicePop();
}).observe(appChatRoom, { attributes: true, attributeFilter: ['class'] });

function startRecOverlay() {
  voicePop.classList.add('recording');
  voiceHintText(VOICE_HINT);
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }   // 开始录了：轻轻震一下（手感）
  var t = 0;
  _recTimerEl.textContent = '0:00';
  _recTimerInt = setInterval(function() {
    t++;
    var m = Math.floor(t / 60), s = t % 60;
    _recTimerEl.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}
function stopRecOverlay() {
  voicePop.classList.remove('recording');
  voiceCancel.classList.remove('armed');
  voiceToText.classList.remove('armed');
  _voiceZone = '';
  voiceHintText('按住说话');
  clearInterval(_recTimerInt);
  cancelAnimationFrame(_recAnimFrame);
  if (_recAudioCtx) { try { _recAudioCtx.close(); } catch(e){} _recAudioCtx = null; }
  _recAnalyser = null;
}

// ---------- 手机 / 浏览器自带的语音识别（保底转文字，不靠模型） ----------
// 录音的同时让浏览器边听边转成文字，存进这条语音的转写：能听音频的模型照样听录音，听不了的就用这段文字
// · 设置 → 识图与语音 →「录音时用手机自带的识别」可以关（mediaCfg.liveStt）
// · 浏览器识别不到时保留录音，转写区域显示「未识别内容」
var VoiceSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var _liveSR = null;
function liveSttOn() { return !!VoiceSR && mediaCfg.liveStt !== false; }
function startLiveStt() {
  _liveSR = null;
  if (!liveSttOn()) return;
  try {
    var sr = new VoiceSR();
    var capture = { recognizer: sr, savedText: '', finalText: '', interimText: '', interrupted: false, finishing: false, restarts: 0, running: true };
    sr.lang = (navigator.language && /^zh/i.test(navigator.language)) ? navigator.language : 'zh-CN';
    sr.continuous = true;
    sr.interimResults = true;
    sr.onresult = function(ev) {
      var fin = '', mid = '';
      for (var i = 0; i < ev.results.length; i++) {
        var t = ev.results[i][0] ? ev.results[i][0].transcript : '';
        if (ev.results[i].isFinal) fin += t; else mid += t;
      }
      capture.finalText = fin; capture.interimText = mid;
    };
    sr.onerror = function(ev) {
      capture.interrupted = true;
      capture.fatal = ev.error !== 'no-speech';
    };
    capture.done = new Promise(function(resolve) {
      capture.resolve = resolve;
      sr.onend = function() {
        capture.running = false;
        if (!capture.finishing && _liveSR === capture && !capture.fatal && capture.restarts < 8) {
          capture.interrupted = true;
          capture.restarts++;
          capture.savedText += ' ' + capture.finalText + capture.interimText;
          capture.finalText = capture.interimText = '';
          capture.restart = setTimeout(function() {
            if (_liveSR !== capture || capture.finishing) return;
            try { sr.start(); capture.running = true; } catch (_) { resolve(); }
          }, 160);
          return;
        }
        if (!capture.finishing) capture.interrupted = true;
        resolve();
      };
    });
    sr.start();
    _liveSR = capture;
  } catch (err) { console.warn('[Mphone] 自带语音识别没用上:', err); }
}
function stopLiveStt() {
  var capture = _liveSR;
  _liveSR = null;
  if (!capture) return Promise.resolve({ text: '' });
  capture.finishing = true;
  clearTimeout(capture.restart);
  if (capture.running) { try { capture.recognizer.stop(); } catch (_) { capture.resolve(); } }
  else capture.resolve();
  var timer;
  var deadline = new Promise(function(resolve) { timer = setTimeout(function() { resolve(true); }, 2000); });
  return Promise.race([capture.done, deadline]).then(function(timedOut) {
    clearTimeout(timer);
    if (timedOut) {
      try { capture.recognizer.abort(); } catch (_) {}
    }
    var text = (capture.savedText + ' ' + capture.finalText + capture.interimText).replace(/\s+/g, ' ').trim();
    return { text: text, partial: !!(capture.interimText || capture.interrupted || timedOut) };
  });
}
function abortLiveStt() {
  var capture = _liveSR;
  _liveSR = null;
  if (capture) {
    clearTimeout(capture.restart);
    capture.finishing = true;
    try { capture.recognizer.abort(); } catch (_) {}
  }
}

// 按住 🎙：开始录音
voiceRecBtn.addEventListener('pointerdown', function(e) {
  e.preventDefault();
  voiceRecBtn.classList.add('pressing');   // 按下去一沉
  // 捕获指针：手指滑出按钮（比如滑到 ✕ 上）也能收到松手
  try { voiceRecBtn.setPointerCapture(e.pointerId); } catch (_) {}
  _micHolding = false;
  clearTimeout(_micTimer);
  _micTimer = setTimeout(function() {
    _micHolding = true;
    getMicStream()
      .then(function(stream) {
        // 等待麦克风授权期间已经松手 → 不再开始录音
        if (!_micHolding) return;
        var recorder = new MediaRecorder(stream);
        recorder.chunks = [];
        recorder.ondataavailable = function(ev) {
          if (ev.data && ev.data.size > 0) recorder.chunks.push(ev.data);
        };
        _mediaRecorder = recorder;
        recorder.start();
        _recordStart = Date.now();
        startLiveStt();
        startRecOverlay();
        startLiveWaveform(stream);
      })
      .catch(function(err) {
        console.warn('[Mphone] 麦克风访问失败:', err);
        showToast('✗ 无法访问麦克风', 'error');
        _micHolding = false;
      });
  }, VOICE_HOLD_MS);
});
// 录音时手指在 ✕ 上（取消）还是「文」上（转成文字发）
var VOICE_HINT = '松手发送，左滑取消，右滑确认听写';
function voiceSlideZone(e) {
  if (!_micHolding || !_mediaRecorder || _mediaRecorder.state !== 'recording') return '';
  function over(el, padding) {
    var r = el.getBoundingClientRect();
    return e.clientX >= r.left - padding && e.clientX <= r.right + padding &&
      e.clientY >= r.top - padding && e.clientY <= r.bottom + padding;
  }
  return over(voiceCancel, -2) ? 'cancel' : over(voiceToText, 6) ? 'text' : '';
}
voiceRecBtn.addEventListener('pointermove', function(e) {
  var z = voiceSlideZone(e);
  if (z === _voiceZone) return;
  _voiceZone = z;
  voiceCancel.classList.toggle('armed', z === 'cancel');
  voiceToText.classList.toggle('armed', z === 'text');
  voiceHintText(z === 'cancel' ? '松手取消' : z === 'text' ? '松手后确认听写' : VOICE_HINT);
  if (z && navigator.vibrate) {
    try { navigator.vibrate(z === 'cancel' ? [14, 30, 12] : 14); } catch (_) {}
  }
});
voiceRecBtn.addEventListener('pointerup', function(e) {
  var zone = voiceSlideZone(e);
  voiceRecBtn.classList.remove('pressing');
  finishRecording(zone !== 'cancel', zone === 'text');
});
voiceRecBtn.addEventListener('pointercancel', function() { voiceRecBtn.classList.remove('pressing'); finishRecording(false); });
voiceRecBtn.addEventListener('contextmenu', function(e) { e.preventDefault(); });

var voiceReviewOverlay = document.getElementById('voiceReviewOverlay');
var voiceReviewText = document.getElementById('voiceReviewText');
var voiceReviewSend = document.getElementById('voiceReviewSend');
var voiceReviewPlay = document.getElementById('voiceReviewPlay');
var voiceReviewDraft = null;
var voiceReviewAudio = new Audio();

function saveRecordedVoice(hist, message) {
  var at = hist.findIndex(function(item) { return item.time > message.time; });
  if (at < 0) hist.push(message);
  else hist.splice(at, 0, message);
  saveHistories();
  if (appChatRoom.classList.contains('active') && openingChatCharIdx >= 0 && hist === getActiveHistory(openingChatCharIdx)) {
    if (at < 0) renderHistMsg(message, document.getElementById('chatMsgList'), document.getElementById('chatRoomEmpty'));
    else renderRoomLists(openingChatCharIdx);
  }
}
function closeVoiceReview() {
  voiceReviewAudio.pause();
  voiceReviewAudio.removeAttribute('src');
  voiceReviewPlay.textContent = '播放原音';
  voiceReviewDraft = null;
  voiceReviewText.value = '';
  voiceReviewOverlay.classList.remove('open');
}
function openVoiceReview(hist, char, message) {
  voiceReviewDraft = { hist: hist, charId: char.id, message: message };
  voiceReviewAudio.src = message.voice.src;
  voiceReviewText.value = message.transcript || '';
  document.getElementById('voiceReviewHint').textContent = message.transcript
    ? (message.voice.transcriptStatus === 'partial' ? '只识别出一部分。补好后，原音会一起发出。' : '检查一下听写。确认后，原音会一起发出。')
    : '还没有转出文字。你可以填写原话，或用键盘语音听写。';
  voiceReviewSend.disabled = !voiceReviewText.value.trim();
  voiceReviewOverlay.classList.add('open');
}
voiceReviewText.addEventListener('input', function() { voiceReviewSend.disabled = !this.value.trim(); });
voiceReviewPlay.addEventListener('click', function() {
  if (!voiceReviewAudio.paused) voiceReviewAudio.pause();
  else voiceReviewAudio.play().catch(function() { showToast('原音没能播放', 'plain'); });
});
voiceReviewAudio.addEventListener('play', function() { voiceReviewPlay.textContent = '暂停原音'; });
['pause', 'ended'].forEach(function(event) {
  voiceReviewAudio.addEventListener(event, function() { voiceReviewPlay.textContent = '播放原音'; });
});
document.getElementById('voiceReviewCancel').addEventListener('click', closeVoiceReview);
closeOnBackdrop(voiceReviewOverlay, closeVoiceReview);
document.getElementById('voiceReviewForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var text = voiceReviewText.value.trim(), draft = voiceReviewDraft;
  if (!draft || !text) return;
  var idx = findCharIdx(draft.charId), message = draft.message;
  if (idx < 0 || getChatHistory(idx) !== draft.hist) {
    closeVoiceReview();
    showToast('原来的聊天已不可用', 'plain');
    return;
  }
  if (openingChatCharIdx === idx && message.quote && pendingQuote === message.quote) clearQuote();
  message.time = Date.now();
  message.transcript = text;
  message.voice.transcriptStatus = 'manual';
  closeVoiceReview();
  saveRecordedVoice(draft.hist, message);
});

// 普通语音松手就发。右滑时保留录音，等用户确认配套的文字。
function finishRecording(send, review) {
  clearTimeout(_micTimer);
  stopRecOverlay();
  if (!_micHolding || !_mediaRecorder || _mediaRecorder.state === 'inactive') {
    _micHolding = false; return;
  }
  _micHolding = false;
  var duration = (Date.now() - _recordStart) / 1000;
  var recorder = _mediaRecorder;
  if (!send || duration < 0.6 || openingChatCharIdx === -1) {
    abortLiveStt();
    recorder.onstop = function() {
      if (!appChatRoom.classList.contains('active') || document.hidden) releaseMic();
    };
    recorder.stop();
    if (!send) showToast('已取消', 'plain');
    else if (duration < 0.6) showToast('录音时间太短', 'error');
    return;
  }
  var time = Date.now(), quote = pendingQuote, char = charList[openingChatCharIdx];
  var hist = getChatHistory(openingChatCharIdx);
  if (quote && !review) clearQuote();
  if (review) closeVoicePop();
  var recognition = stopLiveStt();
  var audio = new Promise(function(resolve, reject) {
    recorder.onstop = function() {
      if (!appChatRoom.classList.contains('active') || document.hidden) releaseMic();
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error); };
      reader.readAsDataURL(new Blob(recorder.chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] }));
    };
    recorder.stop();
  });
  var ready = Promise.all([pendingVoiceMessages.get(hist), audio, recognition]).then(function([, src, transcript]) {
    var m = { role: 'user', content: '[语音消息]', time: time, voice: { src: src, dur: Math.round(duration * 10) / 10 } };
    if (quote) m.quote = quote;
    if (transcript.text) {
      m.transcript = transcript.text;
      m.voice.transcriptStatus = transcript.partial ? 'partial' : 'browser';
    }
    if (review) openVoiceReview(hist, char, m);
    else {
      saveRecordedVoice(hist, m);
      if (!m.transcript || m.voice.transcriptStatus === 'partial') {
        showToast('这段没转全。到设置 → 语音 API → 语音识别，填一个能听声音的模型', 'plain');
      }
    }
  }).catch(function(err) {
    console.warn('[Mphone] 保存语音失败:', err);
    showToast('语音没能保存', 'error');
  });
  pendingVoiceMessages.set(hist, ready);
  ready.then(function() {
    if (pendingVoiceMessages.get(hist) === ready) pendingVoiceMessages.delete(hist);
  });
}

// 角色回复里的 <语音>：先只存文字，点播放才朗读一次，读好的音频记在这条消息上。
var VOICE_TAG_RE = /<语音>([\s\S]*?)<\/语音>/g;
function voiceSplitParts(parts) {
  var n = 0;
  var out = [];
  parts.forEach(function(p) {
    if (typeof p !== 'string' || p.indexOf('<语音>') < 0) { out.push(p); return; }
    var last = 0, m;
    VOICE_TAG_RE.lastIndex = 0;
    while ((m = VOICE_TAG_RE.exec(p))) {
      var before = p.slice(last, m.index).trim();
      if (before) out.push(before);
      var said = m[1].replace(/\s+/g, ' ').trim();
      if (said && n < 3) {
        n++;
        out.push({ content: '[语音消息]', transcript: said, voice: { src: '', dur: Math.max(1, Math.min(60, Math.round(said.length / 4))) } });
      } else if (said) out.push(said);
      last = VOICE_TAG_RE.lastIndex;
    }
    var rest = p.slice(last).trim();
    if (rest) out.push(rest);
  });
  return out;
}
