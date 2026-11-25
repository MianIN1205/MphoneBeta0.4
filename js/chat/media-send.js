// 眠花糖机 — 识图与语音：把真实图片 / 音频发给 AI，语音识别转写

// =============================================
// 识图与语音：真实图片 / 音频发给 AI，语音识别转写
// =============================================
// mediaCfg = { vision: 是否发送真实图片, voiceMode: 'text' 转成文字 | 'audio' 发送音频, liveStt: 录音时用手机自带的识别（见 js/chat/voice.js） }
var mediaCfg = Object.assign({ vision: true, voiceMode: 'text', liveStt: true }, mphoneStore.load('mphone_media_cfg', {}));
var sttCfg   = Object.assign({ url: '', key: '', model: '' }, mphoneStore.load('mphone_stt_cfg', {}));

function fillMediaForm() {
  document.getElementById('mediaVision').checked = mediaCfg.vision;
  document.getElementById('mediaLiveStt').checked = mediaCfg.liveStt !== false;
  document.querySelectorAll('#mediaVoiceRow .pf-radio-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset.mode === mediaCfg.voiceMode);
  });
  document.getElementById('sttUrl').value = sttCfg.url;
  document.getElementById('sttKey').value = sttCfg.key;
  document.getElementById('sttModel').value = sttCfg.model;
}
document.getElementById('mediaVision').addEventListener('change', function() {
  mediaCfg.vision = this.checked;
  mphoneStore.save('mphone_media_cfg', mediaCfg);
});
document.getElementById('mediaLiveStt').addEventListener('change', function() {
  mediaCfg.liveStt = this.checked;
  mphoneStore.save('mphone_media_cfg', mediaCfg);
  if (this.checked && !(window.SpeechRecognition || window.webkitSpeechRecognition)) showToast('这个浏览器不支持录音时转写，语音仍可播放', 'plain');
});
document.querySelectorAll('#mediaVoiceRow .pf-radio-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    mediaCfg.voiceMode = this.dataset.mode;
    mphoneStore.save('mphone_media_cfg', mediaCfg);
    fillMediaForm();
  });
});
document.getElementById('sttSaveBtn').addEventListener('click', function() {
  sttCfg = {
    url: document.getElementById('sttUrl').value.trim(),
    key: document.getElementById('sttKey').value.trim(),
    model: document.getElementById('sttModel').value.trim()
  };
  mphoneStore.save('mphone_stt_cfg', sttCfg);
  showToast('✓ 语音识别设置已保存', 'success');
});
// 一键填硅基流动（国内不用梯子能连，有免费的语音识别模型），密钥要自己去 cloud.siliconflow.cn 拿
document.getElementById('sttPresetSf').addEventListener('click', function() {
  document.getElementById('sttUrl').value = 'https://api.siliconflow.cn/v1';
  document.getElementById('sttModel').value = 'FunAudioLLM/SenseVoiceSmall';
  var k = document.getElementById('sttKey');
  if (!k.value) { k.focus(); showToast('填好了，再把硅基流动的 API 密钥贴进来，点保存', 'plain'); }
});
// 测一下：送一小段静音过去，接口有回应（哪怕说没识别出文字）就算连上了
document.getElementById('sttTestBtn').addEventListener('click', function() {
  var hint = document.getElementById('sttTestHint'), btn = this;
  var saved = sttCfg;
  sttCfg = { url: document.getElementById('sttUrl').value.trim(), key: document.getElementById('sttKey').value.trim(), model: document.getElementById('sttModel').value.trim() };
  var sr = 16000, n = sr / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  var w = function(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  var bin = ''; new Uint8Array(buf).forEach(function(x) { bin += String.fromCharCode(x); });
  btn.disabled = true; hint.style.display = ''; hint.textContent = '正在连…';
  var done = function(t, ok) { hint.textContent = t; hint.style.color = ok ? '#4a9a6a' : '#c0586a'; btn.disabled = false; sttCfg = saved; };
  sttTranscribeWhisper('data:audio/wav;base64,' + btoa(bin)).then(function() { done('✓ 连上了，可以用', true); }, function(err) {
    var msg = String((err && err.message) || err);
    if (/没有识别出文字/.test(msg)) done('✓ 连上了（测试用的是一段静音，所以没有文字），可以用', true);
    else done('✗ 连不上：' + msg.slice(0, 120), false);
  });
});

// 语音识别用的接口：自己填的优先，留空就用主 API
function sttEndpoint() {
  var main = getApiCfg();
  var url = sttCfg.url || main.url;
  var sameEndpoint = !sttCfg.url || String(sttCfg.url).replace(/\/+$/, '') === String(main.url || '').replace(/\/+$/, '');
  return { url: url, key: sttCfg.key || (sameEndpoint ? main.key : ''), model: sttCfg.model || 'whisper-1' };
}
function sttReady() { var e = sttEndpoint(); return !!(e.url && e.key); }

// 把一段录音（dataURL）转成文字：先用语音识别接口；接口不支持（如 Gemini）时，改让聊天模型听写
function sttTranscribe(src) {
  return sttTranscribeWhisper(src).catch(function(err) {
    var main = getApiCfg();
    if (!main.url || !main.key || !main.model) throw err;
    return sttTranscribeByChat(src).catch(function() { throw err; });
  });
}
function sttTranscribeByChat(src) {
  return llmRequest([{ role: 'user', content: [
    { type: 'text', text: '请把这段语音逐字转写成文字，只输出转写结果，不要加任何说明。听不清就输出「（听不清）」。' },
    { type: 'input_audio', _voiceSrc: src }
  ] }], { stream: false, keepMedia: true, temperature: 0 }).then(function(text) {
    text = String(text || '').trim();
    if (!text) throw new Error('没有识别出文字');
    return text;
  });
}
function sttTranscribeWhisper(src) {
  var e = sttEndpoint();
  if (!e.url || !e.key) return Promise.reject(new Error('请先配置语音识别接口或主 API'));
  var type = (String(src).match(/^data:([^;,]+)/) || [])[1] || 'audio/webm';
  var ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /mpeg|mp3/.test(type) ? 'mp3' : /wav/.test(type) ? 'wav' : /ogg/.test(type) ? 'ogg' : 'webm';
  var form = new FormData();
  form.append('file', new Blob([dataUrlToBytes(src)], { type: type }), 'voice.' + ext);
  form.append('model', e.model);
  return fetch(e.url.replace(/\/$/, '') + '/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + e.key },
    body: form
  }).then(function(res) {
    if (!res.ok) return apiError(res);
    return res.json().then(function(j) {
      var text = String((j && j.text) || '').trim();
      if (!text) throw new Error('没有识别出文字');
      return text;
    });
  });
}

// 录音 → 16kHz 单声道 WAV（base64），供「发送音频」使用；结果缓存，同一段录音只转一次
var wavCache = {};
function voiceToWavBase64(src) {
  if (wavCache[src]) return Promise.resolve(wavCache[src]);
  return decodeAudioBytes(dataUrlToBytes(src)).then(function(buf) {
    var RATE = 16000;
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var len = Math.max(1, Math.ceil(buf.duration * RATE));
    var off = new Offline(1, len, RATE);
    var node = off.createBufferSource();
    node.buffer = buf;
    node.connect(off.destination);
    node.start(0);
    return off.startRendering();
  }).then(function(rendered) {
    var pcm = rendered.getChannelData(0);
    var bytes = new Uint8Array(44 + pcm.length * 2);
    var v = new DataView(bytes.buffer);
    var w = function(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (var i = 0; i < pcm.length; i++) {
      var s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    var bin = '';
    for (var j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
    wavCache[src] = btoa(bin);
    return wavCache[src];
  });
}

// 发送前把消息里的录音占位换成真正的音频数据
function resolveMediaParts(msgs, onVoiceNotes) {
  var jobs = [], sent = new Set(), labeled = new Set();
  msgs.forEach(function(msg) {
    if (!Array.isArray(msg.content)) return;
    msg.content.forEach(function(part, i) {
      if (part.type !== 'input_audio' || !part._voiceSrc) return;
      jobs.push(voiceToWavBase64(part._voiceSrc).then(function(b64) {
        var audio = { type: 'input_audio', input_audio: { data: b64, format: 'wav' } };
        if (part._voiceNoteId && onVoiceNotes) {
          sent.add(part._voiceNoteId);
          labeled.add(msg);
          msg.content[i] = [{ type: 'text', text: '下一段原音的转写编号：' + part._voiceNoteId }, audio];
        } else msg.content[i] = audio;
      }, function() {
        msg.content[i] = { type: 'text', text: voiceTextForAI(part._transcript, part._transcriptStatus) };
      }));
    });
  });
  return Promise.all(jobs).then(function() {
    labeled.forEach(function(msg) { msg.content = msg.content.flat(); });
    if (onVoiceNotes) onVoiceNotes(sent);
    return msgs;
  });
}

// ---------- 测试：当前模型能不能真的看到图片、听到语音 ----------
// 识图和语音测试都用随机答案，确认模型实际识别出了附件内容。
function mediaTestResult(text, ok) {
  var el = document.getElementById('mediaTestResult');
  el.textContent = text;
  el.style.color = ok === true ? '#4f9a6a' : ok === false ? '#c0506a' : '';
}
function mediaTestAsk(messages, cfg, stream) {
  // 测试时原样发送图片 / 音频，不自动换成文字
  return llmRequest(messages, { stream: !!stream, cfg: cfg, keepMedia: true, temperature: 0 })
    .then(function(text) { return String(text || '').trim(); });
}
function mediaTestNumberMatches(reply, expected) {
  // 引用标记可能由接口在模型答案末尾附加。去掉后仍要求只有一个数字答案。
  var answer = reply.normalize('NFKC').replace(/(?:\s*\[cite:\s*\d+(?:\s*,\s*\d+)*\s*\])+\s*$/i, '').trim();
  return answer === String(expected);
}
function mediaTestImage(asChat) {
  var cfg = readDraftApiConfig();
  var code = String(Math.floor(1000 + Math.random() * 9000));
  var c = document.createElement('canvas');
  c.width = 320; c.height = 160;
  var x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 320, 160);
  x.fillStyle = '#222'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(code, 160, 80);
  var label = asChat ? '聊天发图' : '识图';
  var question = '图片里写的是什么数字？只回答数字。';
  var src = asChat ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
  var messages = asChat
    ? [{ role: 'user', content: msgContentForAI({ role: 'user', imgSrc: src }, true, null) }, { role: 'user', content: question }]
    : [{ role: 'user', content: [{ type: 'text', text: question }, { type: 'image_url', image_url: { url: src } }] }];
  mediaTestResult('正在测试' + label + '…');
  mediaTestAsk(messages, cfg, asChat).then(function(reply) {
    var ok = mediaTestNumberMatches(reply, code);
    if (ok) llmRememberMedia(cfg, { image: true });
    mediaTestResult((ok ? '✓ ' + label + '正常' : '✗ ' + label + '测试未通过') +
      '：图里是 ' + code + '，模型回答「' + reply.slice(0, 40) + '」', ok);
  }, function(err) { mediaTestResult('✗ ' + label + '请求失败：' + err.message, false); });
}
document.getElementById('mediaTestImgBtn').addEventListener('click', function() { mediaTestImage(false); });
document.getElementById('mediaClearBtn').addEventListener('click', function() {
  llmClearMediaSupport();
  mediaTestResult('✓ 已重置媒体检测记录，下次发送时重新检测。', true);
});
document.getElementById('mediaTestAudioBtn').addEventListener('click', function() {
  var cfg = readDraftApiConfig();
  if (llmProvider(cfg) === 'anthropic') return mediaTestResult('当前接入方式只能用文字传递语音内容。', false);
  // 随机 2～5 声 880Hz 的「嘟」，16kHz 单声道 WAV
  var count = 2 + Math.floor(Math.random() * 4);
  var rate = 16000, n = Math.ceil(rate * count * 0.6), pcm = new Int16Array(n);
  for (var i = 0; i < n; i++) {
    var t = i / rate, k = Math.floor(t / 0.6), inBeep = (t - k * 0.6) < 0.3;
    pcm[i] = inBeep ? Math.round(Math.sin(2 * Math.PI * 880 * t) * 12000) : 0;
  }
  var bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
  var w = function(o, s) { for (var j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (var q = 0; q < n; q++) v.setInt16(44 + q * 2, pcm[q], true);
  var bin = '';
  for (var p = 0; p < bytes.length; p += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(p, p + 0x8000));
  mediaTestResult('正在测试语音…');
  mediaTestAsk([{ role: 'user', content: [
    { type: 'text', text: '这段音频里一共有几声「嘟」的提示音？只回答一个阿拉伯数字。' },
    { type: 'input_audio', input_audio: { data: btoa(bin), format: 'wav' } }
  ] }], cfg).then(function(reply) {
    var ok = mediaTestNumberMatches(reply, count);
    if (ok) llmRememberMedia(cfg, { audio: true });
    mediaTestResult(ok ? '✓ 语音正常：模型听到了 ' + count + ' 声'
                       : '✗ 语音测试未通过：应为 ' + count + ' 声，模型回答「' + reply.slice(0, 40) + '」', ok);
  }, function(err) { mediaTestResult('✗ 语音请求失败：' + err.message, false); });
});

fillMediaForm();
