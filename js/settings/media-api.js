// 眠花糖机 — 设置：语音 API（TTS）与生图 API

// =============================================
// 设置 — 语音 API（TTS）与生图 API
// ttsSynthesize(text, voiceId) / imageGenerate(prompt) 供以后的语音气泡、拍摄等功能调用
// =============================================
var TTS_URL = { openai: 'https://api.openai.com/v1', elevenlabs: 'https://api.elevenlabs.io', custom: '' };
var TTS_MINIMAX_URL = { cn: 'https://api.minimaxi.com', io: 'https://api.minimax.io' };
var TTS_MODELS = {
  openai: ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'],
  minimax: ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo', 'speech-01-hd', 'speech-01-turbo'],
  elevenlabs: ['eleven_v3', 'eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
  custom: ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1']
};
var TTS_HINT = {
  openai: '地址填的是 OpenAI 官方。模型点右边刷新，从接口拉取。音色是官方那一套，OpenAI 没有音色列表。中转站请选「自定义」。',
  minimax: '内地和海外都能用，请求方式一样，密钥不能混用。MiniMax 没有模型列表，这里是官方语音模型。点模型旁边的刷新会顺手试一次密钥，告诉你连没连上。音色先放官方的，音色旁边的刷新会按这个密钥拉取能用的，包括你复刻的。',
  elevenlabs: '地址填的是 ElevenLabs 官方。模型和音色都可以点右边刷新，按这个密钥拉取。没刷新时，音色是公开的那一套。',
  custom: '自己填中转地址，按 OpenAI 的 /audio/speech 来读。MiniMax 和 ElevenLabs 请选上面的服务商。'
};
var TTS_DEFAULTS = {
  openai:     { url: TTS_URL.openai, model: 'tts-1', voice: 'alloy' },
  minimax:    { url: TTS_MINIMAX_URL.cn, model: 'speech-02-hd', voice: 'female-shaonv' },
  elevenlabs: { url: TTS_URL.elevenlabs, model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' },
  custom:     { url: '', model: 'tts-1', voice: 'alloy' }
};
function ttsBlank(provider) {
  var d = TTS_DEFAULTS[provider] || TTS_DEFAULTS.custom;
  return { url: d.url, key: '', groupId: '', region: 'cn', model: d.model, voice: d.voice, speed: 1, customVoices: [] };
}
function ttsLoadCfg() {
  var saved = mphoneStore.load('mphone_tts_cfg', {}) || {};
  var cfg = { provider: 'minimax' };
  ['openai', 'minimax', 'elevenlabs', 'custom'].forEach(function(p) {
    cfg[p] = Object.assign(ttsBlank(p), saved[p] && typeof saved[p] === 'object' ? saved[p] : {});
    if (!Array.isArray(cfg[p].customVoices)) cfg[p].customVoices = [];
  });
  if (saved.openai && typeof saved.openai === 'object') {
    cfg.provider = TTS_DEFAULTS[saved.provider] ? saved.provider : 'minimax';
  } else if (saved.key !== undefined || saved.url !== undefined || saved.provider) {
    var p = saved.provider === 'openai' || saved.provider === 'elevenlabs' || saved.provider === 'custom' ? saved.provider : 'minimax';
    cfg.provider = p;
    cfg[p] = Object.assign(ttsBlank(p), {
      url: saved.url || '', key: saved.key || '', groupId: saved.groupId || '',
      model: saved.model || cfg[p].model, voice: saved.voice || cfg[p].voice,
      speed: saved.speed || 1
    });
    if (p === 'minimax' && /minimax\.io/i.test(saved.url || '')) cfg.minimax.region = 'io';
  }
  if (cfg.provider === 'openai' && !(cfg.openai && String(cfg.openai.key || '').trim())) cfg.provider = 'minimax';
  return cfg;
}
var ttsCfg = ttsLoadCfg();
var ttsFetched = {};

function setRadio(rowId, attr, value) {
  document.querySelectorAll('#' + rowId + ' .pf-radio-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset[attr] === value);
  });
}

// ---------- 语音 ----------
function ttsSlot() { return ttsCfg[ttsCfg.provider] || (ttsCfg[ttsCfg.provider] = ttsBlank(ttsCfg.provider)); }
function ttsPublish() {
  var s = ttsSlot();
  ttsCfg.url = s.url; ttsCfg.key = s.key; ttsCfg.groupId = s.groupId;
  ttsCfg.model = s.model; ttsCfg.voice = s.voice; ttsCfg.speed = s.speed; ttsCfg.region = s.region;
}
function ttsActive(cfg) {
  if (cfg && cfg.provider && cfg.key !== undefined && !cfg.openai) return cfg;
  var src = cfg || ttsCfg;
  var slot = src[src.provider];
  return slot ? Object.assign({ provider: src.provider }, slot) : src;
}
function ttsVoiceChoices() {
  var p = ttsCfg.provider, slot = ttsSlot();
  var custom = (slot.customVoices || []).map(function(v) {
    return { id: v.id, name: v.name || v.id, lang: '自己的', custom: true };
  });
  var key = p === 'minimax' ? 'minimax:' + (slot.region || 'cn') : p;
  var fetched = ttsFetched[key];
  var official = fetched && fetched.length ? fetched : ttsBuiltinVoices();
  return custom.concat(official);
}
function ttsBuiltinVoices() {
  var p = ttsCfg.provider;
  if (p === 'minimax') return (ttsSlot().region === 'io' ? TTS_VOICES_MINIMAX_IO : TTS_VOICES_MINIMAX_CN).slice();
  if (p === 'elevenlabs') return TTS_VOICES_ELEVEN.slice();
  return TTS_VOICES_OPENAI.slice();
}
function ttsVoiceLabel(id) {
  if (!id) return '请选择音色';
  var hit = ttsVoiceChoices().filter(function(v) { return v.id === id; })[0];
  return hit ? hit.name : id;
}
function ttsModelOptions() {
  var got = ttsFetched['model:' + ttsCfg.provider];
  return got && got.length ? got : (TTS_MODELS[ttsCfg.provider] || TTS_MODELS.openai).slice();
}
function fillTtsForm() {
  var slot = ttsSlot();
  var p = ttsCfg.provider;
  setRadio('ttsProviderRow', 'provider', p);
  setRadio('ttsRegionRow', 'region', slot.region || 'cn');
  document.querySelector('[data-spanel="voice-api"]').classList.toggle('tts-is-minimax', p === 'minimax');
  var $ = function(id) { return document.getElementById(id); };
  var preset = p === 'minimax' ? TTS_MINIMAX_URL[slot.region || 'cn'] : TTS_URL[p];
  $('ttsUrl').value = slot.url || '';
  $('ttsUrl').placeholder = p === 'custom' ? 'https://你的中转地址/v1' : preset;
  $('ttsKey').value = slot.key || '';
  $('ttsGroupId').value = slot.groupId || '';
  $('ttsSpeed').value = slot.speed || 1;
  $('ttsModelName').textContent = slot.model || '请选择模型';
  $('ttsVoiceName').textContent = ttsVoiceLabel(slot.voice);
  $('ttsProviderHint').textContent = TTS_HINT[p] || '';
  ttsPublish();
  ttsClosePops();
}
function readTtsForm() {
  var $ = function(id) { return document.getElementById(id); };
  var btn = document.querySelector('#ttsProviderRow .pf-radio-btn.selected');
  var provider = btn ? btn.dataset.provider : ttsCfg.provider;
  var slot = ttsCfg[provider] || (ttsCfg[provider] = ttsBlank(provider));
  var speed = parseFloat($('ttsSpeed').value);
  slot.url = $('ttsUrl').value.trim();
  slot.key = $('ttsKey').value.trim();
  slot.groupId = $('ttsGroupId').value.trim();
  slot.speed = isNaN(speed) ? 1 : Math.max(0.5, Math.min(2, speed));
  ttsCfg.provider = provider;
  ttsPublish();
  return ttsActive();
}
function ttsSaveCfg() {
  readTtsForm();
  var copy = { provider: ttsCfg.provider };
  ['openai', 'minimax', 'elevenlabs', 'custom'].forEach(function(p) {
    var s = ttsCfg[p];
    copy[p] = {
      url: s.url, key: s.key, groupId: s.groupId, region: s.region || 'cn',
      model: s.model, voice: s.voice, speed: s.speed, customVoices: s.customVoices || []
    };
  });
  var a = copy[copy.provider];
  copy.url = a.url; copy.key = a.key; copy.groupId = a.groupId;
  copy.model = a.model; copy.voice = a.voice; copy.speed = a.speed;
  mphoneStore.save('mphone_tts_cfg', copy);
  ttsPublish();
}
function ttsClosePops() {
  ['ttsModelPopup', 'ttsVoicePopup'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  ['ttsModelChevron', 'ttsVoiceChevron'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  ['ttsModelBtn', 'ttsVoiceBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('aria-expanded', 'false');
  });
}
function ttsPlacePop(pop, btn) {
  pop.style.position = '';
  pop.style.left = '';
  pop.style.right = '';
  pop.style.width = '';
  pop.style.zIndex = '';
  pop.style.top = '';
  pop.style.bottom = '';
  pop.style.maxHeight = '';
  var sc = btn.closest('.settings-content');
  if (!sc) return;
  var box = sc.getBoundingClientRect();
  var r = btn.getBoundingClientRect();
  var below = box.bottom - r.bottom - 12;
  var above = r.top - box.top - 12;
  if (below < 160 && above > below) {
    pop.style.top = 'auto';
    pop.style.bottom = 'calc(100% + 4px)';
    pop.style.maxHeight = Math.max(120, Math.min(308, above)) + 'px';
  } else if (below > 0) {
    pop.style.maxHeight = Math.max(120, Math.min(308, below)) + 'px';
  }
}
function ttsOpenPop(which) {
  var openModel = which === 'model';
  ttsClosePops();
  var pop = document.getElementById(openModel ? 'ttsModelPopup' : 'ttsVoicePopup');
  var chev = document.getElementById(openModel ? 'ttsModelChevron' : 'ttsVoiceChevron');
  var btn = document.getElementById(openModel ? 'ttsModelBtn' : 'ttsVoiceBtn');
  if (openModel) ttsPaintModels(); else ttsPaintVoices();
  ttsPlacePop(pop, btn);
  pop.classList.add('open');
  chev.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
}
function ttsPaintModels() {
  var pop = document.getElementById('ttsModelPopup');
  var current = ttsSlot().model;
  pop.replaceChildren();
  ttsModelOptions().forEach(function(id) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-popup-item' + (id === current ? ' selected' : '');
    item.textContent = id;
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      ttsSlot().model = id;
      document.getElementById('ttsModelName').textContent = id;
      ttsPublish();
      ttsClosePops();
    });
    pop.appendChild(item);
  });
}
function ttsPaintVoices() {
  var pop = document.getElementById('ttsVoicePopup');
  var bar = pop.querySelector('.tts-voice-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'tts-voice-bar';
    var search = document.createElement('input');
    search.className = 'tts-voice-search';
    search.placeholder = '搜名字或声音 ID';
    search.addEventListener('click', function(e) { e.stopPropagation(); });
    search.addEventListener('input', function() { ttsPaintVoices(); });
    bar.appendChild(search);
    bar.appendChild(document.getElementById('ttsVoiceRefresh'));
    pop.appendChild(bar);
  }
  var search = bar.querySelector('.tts-voice-search');
  var q = search.value.trim().toLowerCase();
  Array.prototype.slice.call(pop.children).forEach(function(el) { if (el !== bar) el.remove(); });
  var current = ttsSlot().voice;
  var lang = '';
  ttsVoiceChoices().forEach(function(v) {
    if (q && (v.name + ' ' + v.id + ' ' + v.lang).toLowerCase().indexOf(q) < 0) return;
    if (v.lang !== lang) {
      lang = v.lang;
      var lab = document.createElement('div');
      lab.className = 'tts-pop-label';
      lab.textContent = lang;
      pop.appendChild(lab);
    }
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-popup-item' + (v.id === current ? ' selected' : '');
    item.textContent = v.name;
    var small = document.createElement('small');
    small.textContent = v.id;
    item.appendChild(small);
    if (v.custom) {
      var del = document.createElement('span');
      del.className = 'tts-voice-del';
      del.textContent = '×';
      del.setAttribute('aria-label', '删除这个音色');
      del.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = ttsSlot();
        slot.customVoices = (slot.customVoices || []).filter(function(x) { return x.id !== v.id; });
        if (slot.voice === v.id) { slot.voice = ''; document.getElementById('ttsVoiceName').textContent = '请选择音色'; }
        ttsPublish();
        ttsPaintVoices();
      });
      item.insertBefore(del, small);
    }
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      ttsSlot().voice = v.id;
      document.getElementById('ttsVoiceName').textContent = v.name;
      ttsPublish();
      ttsClosePops();
    });
    pop.appendChild(item);
  });
}
document.querySelectorAll('#ttsProviderRow .pf-radio-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    readTtsForm();
    ttsCfg.provider = this.dataset.provider;
    var slot = ttsSlot();
    if (ttsCfg.provider === 'minimax') slot.url = TTS_MINIMAX_URL[slot.region || 'cn'];
    else if (ttsCfg.provider !== 'custom') slot.url = TTS_URL[ttsCfg.provider];
    fillTtsForm();
    ttsSaveCfg();
  });
});
document.querySelectorAll('#ttsRegionRow .pf-radio-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    readTtsForm();
    var slot = ttsCfg.minimax;
    slot.region = this.dataset.region;
    slot.url = TTS_MINIMAX_URL[slot.region];
    fillTtsForm();
    ttsSaveCfg();
  });
});
document.getElementById('ttsModelBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  if (document.getElementById('ttsModelPopup').classList.contains('open')) ttsClosePops();
  else ttsOpenPop('model');
});
document.getElementById('ttsVoiceBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  if (document.getElementById('ttsVoicePopup').classList.contains('open')) ttsClosePops();
  else ttsOpenPop('voice');
});
document.getElementById('ttsModelPopup').addEventListener('click', function(e) { e.stopPropagation(); });
document.getElementById('ttsVoicePopup').addEventListener('click', function(e) { e.stopPropagation(); });
document.addEventListener('click', function() { ttsClosePops(); imgClosePicks(); });
document.getElementById('ttsVoiceAdd').addEventListener('click', function() {
  var name = document.getElementById('ttsVoiceNewName').value.trim();
  var id = document.getElementById('ttsVoiceNewId').value.trim();
  if (!id) { shakeEl(document.getElementById('ttsVoiceNewId')); return; }
  var slot = ttsSlot();
  slot.customVoices = slot.customVoices || [];
  if (slot.customVoices.some(function(v) { return v.id === id; })) { showToast('这个音色 ID 已经在了', 'plain'); return; }
  slot.customVoices.push({ name: name || id, id: id });
  slot.voice = id;
  document.getElementById('ttsVoiceNewName').value = '';
  document.getElementById('ttsVoiceNewId').value = '';
  document.getElementById('ttsVoiceName').textContent = name || id;
  ttsPublish();
  showToast('✓ 已加上', 'success');
});

function hexToBytes(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function apiError(res) {
  return res.text().then(function(t) {
    var msg = '请求失败 ' + res.status;
    try {
      var e = JSON.parse(t);
      msg = (e.error && (e.error.message || e.error)) || (e.detail && (e.detail.message || e.detail)) || e.message || msg;
    } catch (_) {}
    var err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;   // 状态码：报错分析（js/core/errors.js）按它判断原因
    // 完整的原始返回，报错弹窗里「展开完整报错」看的就是它
    err.body = t;
    err.statusText = res.statusText || '';
    err.url = res.url || '';
    throw err;
  });
}

function ttsBaseOf(cfg) {
  var fallback = cfg.provider === 'minimax' ? TTS_MINIMAX_URL[cfg.region || 'cn'] : (TTS_URL[cfg.provider] || '');
  return (cfg.url || fallback || '').replace(/\/$/, '');
}
function ttsFetchElevenModels(cfg) {
  return fetch(ttsBaseOf(cfg) + '/v1/models', { headers: { 'xi-api-key': cfg.key } }).then(function(res) {
    if (!res.ok) return apiError(res);
    return res.json();
  }).then(function(list) {
    list = Array.isArray(list) ? list : [];
    var tts = list.filter(function(m) { return m.can_do_text_to_speech; });
    return (tts.length ? tts : list).map(function(m) { return m.model_id || m.id || ''; }).filter(Boolean);
  });
}
function ttsFetchVoices(cfg) {
  var base = ttsBaseOf(cfg);
  if (cfg.provider === 'minimax') {
    return fetch(base + '/v1/get_voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({ voice_type: 'all' })
    }).then(function(res) {
      if (!res.ok) return apiError(res);
      return res.json();
    }).then(function(j) {
      if (j.base_resp && j.base_resp.status_code) throw new Error(j.base_resp.status_msg || '拉取音色失败');
      function take(list, lang) {
        return (list || []).map(function(v) {
          return v && v.voice_id ? { id: v.voice_id, name: v.voice_name || v.voice_id, lang: lang } : null;
        }).filter(Boolean);
      }
      return take(j.system_voice, '系统').concat(take(j.voice_cloning, '复刻'), take(j.voice_generation, '文生'));
    });
  }
  return fetch(base + '/v1/voices', { headers: { 'xi-api-key': cfg.key } }).then(function(res) {
    if (!res.ok) return apiError(res);
    return res.json();
  }).then(function(j) {
    return (j.voices || []).map(function(v) {
      var lang = v.category === 'cloned' ? '复刻' : (v.category === 'generated' ? '文生' : '官方');
      return { id: v.voice_id, name: v.name || v.voice_id, lang: lang };
    }).filter(function(v) { return v.id; });
  });
}
function ttsRefreshModels() {
  var btn = document.getElementById('ttsModelRefresh');
  if (btn.classList.contains('spinning')) return;
  var cfg = readTtsForm();
  if (cfg.provider === 'minimax') {
    ttsFetched['model:minimax'] = TTS_MODELS.minimax.slice();
    ttsOpenPop('model');
    if (!cfg.key) {
      showToast('还没填密钥，不知道连没连上。模型是官方的', 'plain');
      return;
    }
    btn.classList.add('spinning');
    ttsFetchVoices(cfg).then(function() {
      showToast('密钥连上了。MiniMax 没有模型列表，这些是官方语音模型', 'success');
    }).catch(function(err) {
      showToast('没连上：' + (err && err.message ? err.message : '请求失败'), 'error');
    }).then(function() { btn.classList.remove('spinning'); });
    return;
  }
  if (!cfg.url || !cfg.key) { showToast('请先填接口地址和 API 密钥', 'plain'); return; }
  btn.classList.add('spinning');
  var job = cfg.provider === 'elevenlabs'
    ? ttsFetchElevenModels(cfg).then(function(list) { return { list: list, all: false }; })
    : llmListModels(cfg.url, cfg.key).then(function(models) {
      var speech = models.filter(function(id) { return /tts|speech/i.test(id); });
      return { list: speech.length ? speech : models, all: !speech.length };
    });
  job.then(function(res) {
    var list = res.list || [];
    if (!list.length) throw new Error('接口没有返回模型');
    ttsFetched['model:' + cfg.provider] = list;
    if (!ttsSlot().model) ttsSlot().model = list[0];
    document.getElementById('ttsModelName').textContent = ttsSlot().model;
    ttsPublish();
    ttsOpenPop('model');
    showToast(res.all ? '没有名字里带语音的模型，先把接口返回的都列出来了' : '✓ 已拉取', res.all ? 'plain' : 'success');
  }).catch(function(err) {
    showToast('✗ ' + (err && err.message ? err.message : '拉取失败'), 'error');
  }).then(function() { btn.classList.remove('spinning'); });
}
function ttsRefreshVoices() {
  var btn = document.getElementById('ttsVoiceRefresh');
  if (btn.classList.contains('spinning')) return;
  var cfg = readTtsForm();
  if (cfg.provider === 'openai' || cfg.provider === 'custom' || !cfg.key) {
    var fetchKey = cfg.provider === 'minimax' ? 'minimax:' + (cfg.region || 'cn') : cfg.provider;
    delete ttsFetched[fetchKey];
    ttsOpenPop('voice');
    showToast(cfg.key ? '这里是官方音色。自己做的填在下面的声音 ID' : '没填密钥也能看官方音色。填了密钥再刷新，会带上你复刻的', 'plain');
    return;
  }
  btn.classList.add('spinning');
  ttsFetchVoices(cfg).then(function(list) {
    if (!list.length) throw new Error('接口没有返回音色');
    var key = cfg.provider === 'minimax' ? 'minimax:' + (cfg.region || 'cn') : cfg.provider;
    ttsFetched[key] = list;
    ttsOpenPop('voice');
    showToast('✓ 已拉取 ' + list.length + ' 个音色', 'success');
  }).catch(function(err) {
    showToast('✗ ' + (err && err.message ? err.message : '拉取失败'), 'error');
  }).then(function() { btn.classList.remove('spinning'); });
}
document.getElementById('ttsModelRefresh').addEventListener('click', function(e) { e.stopPropagation(); ttsRefreshModels(); });
document.getElementById('ttsVoiceRefresh').addEventListener('click', function(e) { e.stopPropagation(); ttsRefreshVoices(); });

// 合成语音，返回音频 Blob；voiceId 为空时用默认音色
function ttsVoiceGuess(desc) {
  desc = String(desc || '');
  var g = {};
  if (/慢|轻声|轻轻|柔|缓|气音|耳语/.test(desc)) g.speed = 0.88;
  else if (/快|急|冲|脆/.test(desc)) g.speed = 1.12;
  if (/低沉|偏低|沙哑|低一点/.test(desc)) g.pitch = -3;
  else if (/偏高|明亮|清亮|高一点/.test(desc)) g.pitch = 2;
  if (/气音|耳语|很小声|轻声/.test(desc)) g.vol = 0.7;
  else if (/大声|响亮/.test(desc)) g.vol = 1.4;
  var emos = [
    ['委屈', 'sad'], ['难过', 'sad'], ['伤心', 'sad'], ['哭腔', 'sad'],
    ['生气', 'angry'], ['恼火', 'angry'],
    ['害怕', 'fearful'], ['慌', 'fearful'],
    ['惊讶', 'surprised'], ['吃惊', 'surprised'],
    ['嫌弃', 'disgusted'], ['厌恶', 'disgusted'],
    ['开心', 'happy'], ['高兴', 'happy'], ['甜', 'happy'],
    ['平静', 'calm'], ['冷淡', 'calm'], ['稳', 'calm']
  ];
  for (var i = 0; i < emos.length; i++) {
    if (desc.indexOf(emos[i][0]) >= 0) { g.emotion = emos[i][1]; break; }
  }
  if (/夸张|起伏大|情绪多/.test(desc)) { g.stability = 0.35; g.style = 0.5; }
  else if (/平淡|平稳|冷淡|稳/.test(desc)) { g.stability = 0.7; g.style = 0.1; }
  return g;
}
function ttsNum(v, min, max) {
  if (v === '' || v == null) return null;
  var n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}
function ttsSpeakText(text) {
  text = String(text || '');
  // ||| 只用来拆气泡，读的时候拿掉，不念出来，也不插进 MiniMax 的停顿记号里
  text = text.replace(/(?:\\?[|｜¦][ \t]*){2,}/g, '\n');
  if (typeof actionRe === 'function') text = text.replace(actionRe(), ' ');
  text = text.replace(/<([a-zA-Z\u4e00-\u9fa5][^>]{0,24})>[\s\S]*?<\/\1>/g, ' ');
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function ttsPauses(text) {
  return String(text || '').replace(/……+/g, '<#0.5#>').replace(/…+/g, '<#0.4#>').replace(/——+/g, '<#0.7#>');
}
function ttsSynthesize(text, voiceId, cfg, char) {
  cfg = ttsActive(cfg);
  var d = TTS_DEFAULTS[cfg.provider] || TTS_DEFAULTS.openai;
  var card = (char && char.chatCfg) ? Object.assign({}, (typeof DEFAULT_CHAT_CFG !== 'undefined' ? DEFAULT_CHAT_CFG : {}), char.chatCfg) : null;
  var guess = ttsVoiceGuess(card && card.voiceDesc);
  var base = ttsBaseOf(cfg);
  var model = cfg.model || d.model;
  var voice = voiceId || (card && card.voiceId) || cfg.voice || d.voice;
  var speed = ttsNum(card && card.voiceSpeed, 0.5, 2);
  if (speed == null) speed = guess.speed || cfg.speed || 1;
  var pitch = ttsNum(card && card.voicePitch, -12, 12);
  if (pitch == null) pitch = guess.pitch != null ? guess.pitch : 0;
  var vol = ttsNum(card && card.voiceVol, 0.1, 10);
  if (vol == null) vol = guess.vol || 1;
  var emotion = (card && card.voiceEmotion) || guess.emotion || '';
  var stability = ttsNum(card && card.voiceStable, 0, 1);
  if (stability == null && guess.stability != null) stability = guess.stability;
  var style = ttsNum(card && card.voiceStyle, 0, 1);
  if (style == null && guess.style != null) style = guess.style;
  var instructions = card && card.voiceDesc ? String(card.voiceDesc).slice(0, 800) : '';
  text = ttsSpeakText(text);
  if (!cfg.key) return Promise.reject(new Error('请先填写语音 API 密钥'));
  if (!voice) return Promise.reject(new Error('请先填写音色 ID'));
  if (!text) return Promise.reject(new Error('没有可以读的话'));

  if (cfg.provider === 'minimax') {
    var voiceSetting = { voice_id: voice, speed: speed, vol: vol, pitch: pitch };
    if (emotion) voiceSetting.emotion = emotion;
    return fetch(base + '/v1/t2a_v2' + (cfg.groupId ? '?GroupId=' + encodeURIComponent(cfg.groupId) : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: model, text: ttsPauses(text), stream: false, output_format: 'hex',
        voice_setting: voiceSetting,
        audio_setting: { format: 'mp3', sample_rate: 32000 }
      })
    }).then(function(res) {
      if (!res.ok) return apiError(res);
      return res.json().then(function(j) {
        if (j.base_resp && j.base_resp.status_code) throw new Error(j.base_resp.status_msg || ('错误 ' + j.base_resp.status_code));
        if (!j.data || !j.data.audio) throw new Error('未返回音频');
        return new Blob([hexToBytes(j.data.audio)], { type: 'audio/mpeg' });
      });
    });
  }

  if (cfg.provider === 'elevenlabs') {
    var elevenVoice = { speed: speed };
    if (stability != null) elevenVoice.stability = stability;
    if (style != null) elevenVoice.style = style;
    var elevenText = text;
    if (/v3/i.test(model)) {
      var tag = /气音|耳语|轻声/.test(instructions) ? '[whispers]' : ({
        sad: '[sad]', angry: '[angry]', happy: '[happily]', fearful: '[nervous]',
        surprised: '[surprised]', disgusted: '[disgusted]'
      })[emotion];
      if (tag) elevenText = tag + ' ' + text;
    }
    return fetch(base + '/v1/text-to-speech/' + encodeURIComponent(voice), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': cfg.key, 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: elevenText, model_id: model, voice_settings: elevenVoice })
    }).then(function(res) { return res.ok ? res.blob() : apiError(res); });
  }

  var openaiBody = { model: model, input: text, voice: voice, speed: speed };
  if (instructions && /mini-tts|gpt-4o/i.test(model)) openaiBody.instructions = instructions;
  return fetch(base + '/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify(openaiBody)
  }).then(function(res) { return res.ok ? res.blob() : apiError(res); });
}

document.getElementById('ttsTestBtn').addEventListener('click', function() {
  var btn = this;
  var text = document.getElementById('ttsTestText').value.trim();
  if (!text) { shakeEl(document.getElementById('ttsTestText')); return; }
  btn.disabled = true;
  btn.textContent = '合成中…';
  ttsSynthesize(text, '', readTtsForm()).then(function(blob) {
    var audio = document.getElementById('ttsTestAudio');
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(blob);
    audio.style.display = 'block';
    audio.play().catch(function() {});
  }).catch(function(err) {
    showToast('✗ ' + err.message, 'error');
  }).then(function() {
    btn.disabled = false;
    btn.textContent = '试听';
  });
});

document.getElementById('ttsSaveBtn').addEventListener('click', function() {
  ttsSaveCfg();
  showToast('✓ 语音设置已保存', 'success');
});

// ---------- 生图 ----------
// imgCfg = { provider, gpt: {...}, novelai: {...}, openai: {...} }，每个服务商的参数分开保存
var IMG_DEFAULTS = {
  gpt:     { url: 'https://api.openai.com/v1', key: '', model: 'gpt-image-1', size: '1024x1024', quality: 'auto', style: '', negative: '' },
  novelai: { url: 'https://image.novelai.net', key: '', model: 'nai-diffusion-4-5-full', size: '832x1216',
             steps: 28, scale: 5, sampler: 'k_euler_ancestral', quality: true,
             style: '', negative: 'lowres, worst quality, bad quality, bad anatomy, jpeg artifacts, watermark' },
  openai:  { url: '', key: '', model: '', size: '1024x1024', style: '', negative: '' }
};
var imgCfg = (function() {
  var saved = mphoneStore.load('mphone_img_cfg', {}) || {};
  var cfg = { provider: 'gpt' };
  // 旧版只有一套「OpenAI 兼容」参数，迁移到 openai 下
  if (saved.key !== undefined && !saved.gpt) {
    cfg.provider = 'openai';
    cfg.openai = Object.assign({}, IMG_DEFAULTS.openai, saved);
    delete cfg.openai.provider;
  } else if (saved.provider) {
    cfg = saved;
  }
  Object.keys(IMG_DEFAULTS).forEach(function(p) { cfg[p] = Object.assign({}, IMG_DEFAULTS[p], cfg[p] || {}); });
  return cfg;
})();

function curImgProvider() {
  var btn = document.querySelector('#imgProviderRow .pf-radio-btn.selected');
  return btn ? btn.dataset.provider : 'gpt';
}

function imgClosePicks() {
  document.querySelectorAll('.img-pick .model-popup.open').forEach(function(pop) {
    pop.classList.remove('open');
    var box = pop.parentNode;
    var chev = box.querySelector('.model-chevron');
    var btn = box.querySelector('.model-select-trigger');
    if (chev) chev.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}
function imgPickSync(id) {
  var sel = document.getElementById(id);
  if (sel && sel._imgPaint) sel._imgPaint();
}
function mountImgPick(id) {
  var sel = document.getElementById(id);
  if (!sel || sel._imgPaint) return;
  sel.classList.add('img-pick-src');
  var box = document.createElement('div');
  box.className = 'model-select-box img-pick';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'model-select-trigger';
  btn.setAttribute('aria-expanded', 'false');
  var name = document.createElement('span');
  name.className = 'model-select-name';
  var chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chev.setAttribute('class', 'model-chevron');
  chev.setAttribute('viewBox', '0 0 24 24');
  chev.setAttribute('aria-hidden', 'true');
  var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '6 9 12 15 18 9');
  chev.appendChild(poly);
  var pop = document.createElement('div');
  pop.className = 'model-popup';
  btn.appendChild(name);
  btn.appendChild(chev);
  box.appendChild(btn);
  box.appendChild(pop);
  sel.insertAdjacentElement('afterend', box);
  function paint() {
    var cur = sel.value;
    var shown = '';
    pop.replaceChildren();
    Array.prototype.forEach.call(sel.options, function(o) {
      if (o.value === cur) shown = o.textContent;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'model-popup-item' + (o.value === cur ? ' selected' : '');
      item.textContent = o.textContent;
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        sel.value = o.value;
        paint();
        imgClosePicks();
      });
      pop.appendChild(item);
    });
    name.textContent = shown || (sel.options[0] ? sel.options[0].textContent : '');
  }
  sel._imgPaint = paint;
  paint();
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var open = !pop.classList.contains('open');
    imgClosePicks();
    if (!open) return;
    ttsPlacePop(pop, btn);
    pop.classList.add('open');
    chev.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  });
}
['imgSize', 'imgQuality', 'naiModel', 'naiSize', 'naiSampler'].forEach(mountImgPick);

function fillImgForm() {
  var p = imgCfg.provider, c = imgCfg[p];
  var $ = function(id) { return document.getElementById(id); };
  setRadio('imgProviderRow', 'provider', p);
  var panel = document.querySelector('[data-spanel="image-api"]');
  panel.classList.remove('img-is-gpt', 'img-is-novelai', 'img-is-openai');
  panel.classList.add('img-is-' + p);
  $('imgUrl').value = c.url;
  $('imgUrl').placeholder = IMG_DEFAULTS[p].url || 'https://你的中转地址/v1';
  $('imgKey').value = c.key;
  $('imgKey').placeholder = p === 'novelai' ? '持久 API Token（pst-...）' : 'sk-...';
  $('imgKeyLabel').textContent = p === 'novelai' ? 'API Token' : 'API 密钥';
  if (p === 'novelai') {
    $('naiModel').value = c.model;
    $('naiSize').value = c.size;
    $('naiSteps').value = c.steps;
    $('naiScale').value = c.scale;
    $('naiSampler').value = c.sampler;
    $('naiQuality').checked = c.quality !== false;
  } else {
    $('imgModel').value = c.model;
    $('imgModel').placeholder = p === 'gpt' ? 'gpt-image-1' : '中转站提供的模型名';
    $('imgSize').value = c.size;
    if (p === 'gpt') $('imgQuality').value = c.quality || 'auto';
  }
  $('imgStyleLabel').textContent = p === 'novelai' ? '画师串 / 正向前缀（英文标签，逗号分隔）' : '画风提示词（自动加在每次生成前）';
  $('imgStyle').placeholder = p === 'novelai' ? '例：artist:xxx, 1girl, soft lighting' : '例：日系插画，柔和光线，高细节';
  $('imgStyle').value = c.style;
  $('imgNegative').value = c.negative;
  $('imgNegative').placeholder = p === 'novelai' ? '例：lowres, bad hands' : '例：低画质，多余手指（部分接口支持）';
  ['imgSize', 'imgQuality', 'naiModel', 'naiSize', 'naiSampler'].forEach(imgPickSync);
  // 在哪里用生图
  var use = Object.assign({ chat: 'text', feed: 'text', album: 'text', drama: 'off' }, imgCfg.use || {});
  document.querySelectorAll('.img-use-row').forEach(function(row) {
    row.querySelectorAll('.pf-radio-btn').forEach(function(b) { b.classList.toggle('selected', b.dataset.v === use[row.dataset.scope]); });
  });
}
document.querySelectorAll('.img-use-row .pf-radio-btn').forEach(function(b) {
  b.addEventListener('click', function() {
    b.parentNode.querySelectorAll('.pf-radio-btn').forEach(function(x) { x.classList.toggle('selected', x === b); });
  });
});

// 读当前表单到对应服务商下（不影响其他服务商）
function readImgForm() {
  var p = curImgProvider();
  var $ = function(id) { return document.getElementById(id); };
  var c = Object.assign({}, imgCfg[p], {
    url: $('imgUrl').value.trim(), key: $('imgKey').value.trim(),
    style: $('imgStyle').value.trim(), negative: $('imgNegative').value.trim()
  });
  if (p === 'novelai') {
    var steps = parseInt($('naiSteps').value, 10), scale = parseFloat($('naiScale').value);
    Object.assign(c, {
      model: $('naiModel').value, size: $('naiSize').value,
      steps: isNaN(steps) ? 28 : Math.max(1, Math.min(50, steps)),
      scale: isNaN(scale) ? 5 : Math.max(0, Math.min(10, scale)),
      sampler: $('naiSampler').value, quality: $('naiQuality').checked
    });
  } else {
    Object.assign(c, { model: $('imgModel').value.trim(), size: $('imgSize').value });
    if (p === 'gpt') c.quality = $('imgQuality').value;
  }
  var out = Object.assign({}, imgCfg, { provider: p });
  out[p] = c;
  out.use = {};
  document.querySelectorAll('.img-use-row').forEach(function(row) {
    var s = row.querySelector('.pf-radio-btn.selected');
    out.use[row.dataset.scope] = s ? s.dataset.v : (row.dataset.scope === 'drama' ? 'off' : 'text');
  });
  return out;
}

document.querySelectorAll('#imgProviderRow .pf-radio-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    imgCfg = readImgForm();          // 先暂存当前服务商填写的内容
    imgCfg.provider = this.dataset.provider;
    fillImgForm();
  });
});

// GPT / OpenAI 兼容：/images/generations
function generateOpenAiImage(prompt, c, isGpt) {
  var base = (c.url || IMG_DEFAULTS.gpt.url).replace(/\/$/, '');
  var model = c.model || (isGpt ? 'gpt-image-1' : '');
  var body = { prompt: (c.style ? c.style + '，' : '') + prompt, n: 1, size: c.size || '1024x1024' };
  if (model) body.model = model;
  // Grok 生图走同一条 /images/generations，但不认 size、negative_prompt，多传会直接 400
  if (/grok-imagine/i.test(model)) {
    body = { model: model, prompt: body.prompt, n: 1 };
    if (c.negative) body.prompt += '\n避免出现：' + c.negative;
  }
  // gpt-image 系列固定返回 base64；dall-e 需要显式要求
  if (/^dall-e/.test(model)) body.response_format = 'b64_json';
  if (isGpt && /^gpt-image/.test(model) && c.quality && c.quality !== 'auto') body.quality = c.quality;
  if (c.negative && !/grok-imagine/i.test(model)) {
    if (isGpt) body.prompt += '\n避免出现：' + c.negative;
    else body.negative_prompt = c.negative;
  }
  return fetch(base + '/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
    body: JSON.stringify(body)
  }).then(function(res) {
    if (!res.ok) return apiError(res);
    return res.json().then(function(j) {
      var item = (j.data && j.data[0]) || (j.images && j.images[0]) || {};
      if (item.b64_json) return 'data:image/png;base64,' + item.b64_json;
      if (item.url) return item.url;
      throw new Error('未返回图片');
    });
  });
}

// NovelAI 质量词（与官网预设一致）
var NAI_QUALITY = {
  v4: 'very aesthetic, masterpiece, no text',
  v3: 'best quality, amazing quality, very aesthetic, absurdres'
};

function generateNovelAiImage(prompt, c) {
  var base = (c.url || IMG_DEFAULTS.novelai.url).replace(/\/$/, '');
  var model = c.model || IMG_DEFAULTS.novelai.model;
  var modern = /nai-diffusion-4/.test(model);
  var wh = (c.size || '832x1216').split('x');
  var width = parseInt(wh[0], 10) || 832, height = parseInt(wh[1], 10) || 1216;
  var positive = [c.style, prompt, c.quality !== false ? NAI_QUALITY[modern ? 'v4' : 'v3'] : '']
    .filter(Boolean).join(', ');
  var negative = c.negative || '';
  var seed = Math.floor(Math.random() * 0xFFFFFFFF);
  var params = {
    width: width, height: height, scale: c.scale, sampler: c.sampler, steps: c.steps,
    seed: seed, n_samples: 1, sm: false, sm_dyn: false,
    dynamic_thresholding: false, controlnet_strength: 1, legacy: false,
    cfg_rescale: 0, negative_prompt: negative
  };
  if (modern) {
    Object.assign(params, {
      params_version: 4, add_original_image: true, noise_schedule: 'karras',
      legacy_v3_extend: false, skip_cfg_above_sigma: null, use_coords: false, legacy_uc: false,
      normalize_reference_strength_multiple: true, characterPrompts: [],
      v4_prompt: { caption: { base_caption: positive, char_captions: [] }, use_coords: false, use_order: true },
      v4_negative_prompt: { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false },
      deliberate_euler_ancestral_bug: false, prefer_brownian: true, autoSmea: false,
      tag_hint_qt: 0, tag_hint_uc_preset: 0   // 质量词 / 负面词已直接写进提示词
    });
  } else {
    Object.assign(params, { add_original_image: false, noise_schedule: 'native', ucPreset: 3, qualityToggle: false });
  }
  return fetch(base + '/ai/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
    body: JSON.stringify({ input: positive, model: model, action: 'generate', parameters: params })
  }).then(function(res) {
    if (!res.ok) return apiError(res);
    var type = res.headers.get('content-type') || '';
    if (type.indexOf('application/json') >= 0) {
      // 部分代理返回 JSON
      return res.json().then(function(j) {
        var item = (j.images && j.images[0]) || (j.data && j.data[0]) || {};
        var b64 = typeof item === 'string' ? item : (item.b64_json || item.image);
        if (b64) return /^data:/.test(b64) ? b64 : 'data:image/png;base64,' + b64;
        if (item.url) return item.url;
        throw new Error('未返回图片');
      });
    }
    // 官方接口返回 zip，里面是 PNG；少数代理直接返回图片
    return res.arrayBuffer().then(function(buf) {
      var u8 = new Uint8Array(buf);
      if (u8[0] === 0x89 && u8[1] === 0x50) return bytesToDataUrl(u8, 'image/png');
      return zipReadEntry(buf, function(name) { return /\.(png|webp|jpe?g)$/i.test(name); }).then(function(bytes) {
        return bytesToDataUrl(bytes, 'image/png');
      });
    });
  });
}

function bytesToDataUrl(bytes, type) {
  return new Promise(function(resolve) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.readAsDataURL(new Blob([bytes], { type: type }));
  });
}

// 按当前服务商生成图片，返回可直接用作 src 的地址（url 或 dataURL）
function imageGenerate(prompt, cfg) {
  cfg = cfg || imgCfg;
  var p = cfg.provider, c = cfg[p];
  if (!c || !c.key) return Promise.reject(new Error(p === 'novelai' ? '请先填写 NovelAI Token' : '请先填写生图 API 密钥'));
  if (p === 'novelai') return generateNovelAiImage(prompt, c);
  if (p === 'openai' && !c.url) return Promise.reject(new Error('请先填写接口地址'));
  return generateOpenAiImage(prompt, c, p === 'gpt');
}

var imgTestSrc = '';
function imgStringToBlob(src) {
  src = String(src || '').trim();
  var m = /^data:([^;,]+)?((?:;[^,]*)*)?,([\s\S]*)$/.exec(src);
  if (m) {
    var mime = m[1] || 'image/png';
    var data = m[3] || '';
    var bytes;
    if (/;base64/i.test(m[2] || '')) {
      var raw = atob(data.replace(/\s/g, ''));
      bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(data));
    }
    return Promise.resolve(new Blob([bytes], { type: mime }));
  }
  var compact = src.replace(/\s/g, '');
  if (compact.length > 80 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    var raw2 = atob(compact);
    var bytes2 = new Uint8Array(raw2.length);
    for (var j = 0; j < raw2.length; j++) bytes2[j] = raw2.charCodeAt(j);
    var mime2 = bytes2[0] === 0xFF && bytes2[1] === 0xD8 ? 'image/jpeg' : (bytes2[0] === 0x52 && bytes2[1] === 0x49 ? 'image/webp' : 'image/png');
    return Promise.resolve(new Blob([bytes2], { type: mime2 }));
  }
  return fetch(src).then(function(r) {
    if (!r.ok) throw new Error('图片读取失败');
    return r.blob();
  });
}
document.getElementById('imgTestBtn').addEventListener('click', function() {
  var btn = this;
  var prompt = document.getElementById('imgTestPrompt').value.trim();
  if (!prompt) { shakeEl(document.getElementById('imgTestPrompt')); return; }
  btn.disabled = true;
  btn.textContent = '生成中…';
  imageGenerate(prompt, readImgForm()).then(function(src) {
    var img = document.getElementById('imgTestPreview');
    imgTestSrc = src;
    img.src = src;
    img.style.display = 'block';
  }).catch(function(err) {
    showToast('✗ ' + err.message, 'error');
  }).then(function() {
    btn.disabled = false;
    btn.textContent = '生成测试';
  });
});

document.getElementById('imgPicSaveBtn').addEventListener('click', function() {
  if (!imgTestSrc) { showToast('先生成一张再保存', 'plain'); return; }
  imgStringToBlob(imgTestSrc).then(function(blob) {
    var ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    downloadBlob(blob, 'mphone-' + Date.now() + '.' + ext);
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) showToast('已保存', 'success');
  }).catch(function() { showToast('这张图存不下来', 'error'); });
});

document.getElementById('imgSaveBtn').addEventListener('click', function() {
  imgCfg = readImgForm();
  mphoneStore.save('mphone_img_cfg', imgCfg);
  showToast('✓ 生图设置已保存', 'success');
});

// 画师串和负面各存各的，套用时只换自己那一栏，可以搭配。例图最多三张，只用来认风格，不发给接口。
function mountImgPreset(beforeId, opt) {
  var label = document.getElementById(beforeId);
  var box = document.createElement('div');
  box.className = 'pd-box img-pre-box';
  box.innerHTML = '<div class="pd-bar"><button type="button" class="pd-head"><span class="pd-label">' + opt.label + '</span><span class="pd-cur">还没有存过</span>' +
    '<svg class="pd-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button>' +
    '<button type="button" class="pd-btn" data-act="save">保存</button><button type="button" class="pd-btn" data-act="del">删除</button></div><div class="pd-list"></div>';
  label.parentNode.insertBefore(box, label);
  var cur = null, editing = '';
  function list() {
    return (mphoneStore.load(opt.key, []) || []).map(function(p) {
      if (opt.images && !p.imgs && p.img) p.imgs = [p.img];
      if (opt.images) {
        p.imgs = (p.imgs || []).slice(0, 3);
        while (p.imgs.length < 3) p.imgs.push('');
      }
      return p;
    });
  }
  function store(all) { mphoneStore.save(opt.key, all); }
  function setImg(id, index, src) {
    var all = list(), hit = all.filter(function(q) { return q.id === id; })[0];
    if (!hit) return;
    var imgs = (hit.imgs || []).slice(0, 3);
    while (imgs.length < 3) imgs.push('');
    imgs[index] = src || '';
    hit.imgs = imgs;
    delete hit.img;
    store(all);
    paint();
  }
  function paint() {
    var all = list();
    if (cur) cur = all.filter(function(p) { return p.id === cur.id; })[0] || null;
    if (editing && !all.some(function(p) { return p.id === editing; })) editing = '';
    box.querySelector('.pd-cur').textContent = cur ? cur.name : (all.length ? '点开选一个' : '还没有存过');
    var listEl = box.querySelector('.pd-list');
    listEl.innerHTML = '';
    all.forEach(function(p) {
      var it = document.createElement('div');
      it.className = 'pd-item style-pre' + (cur && p.id === cur.id ? ' selected' : '');
      var name = document.createElement('button');
      name.type = 'button';
      name.className = 'style-pre-name';
      name.textContent = p.name;
      name.addEventListener('click', function() {
        cur = p;
        document.getElementById(opt.field).value = p.text || '';
        imgCfg = readImgForm();
        mphoneStore.save('mphone_img_cfg', imgCfg);
        editing = '';
        box.classList.remove('open');
        paint();
        showToast('已套用「' + p.name + '」', 'plain');
      });
      it.appendChild(name);
      if (opt.images) {
        var on = editing === p.id;
        var slots = document.createElement('span');
        slots.className = 'style-pre-slots';
        var imgs = p.imgs || ['', '', ''];
        for (var i = 0; i < 3; i++) {
          (function(index, src) {
            var b = document.createElement('span');
            b.className = 'style-pre-slot' + (src ? ' has-img' : '') + (on ? ' editing' : '');
            b.draggable = false;
            b.setAttribute('aria-label', src ? '看例图' : (on ? '加一张例图' : '空的例图'));
            if (src) b.style.backgroundImage = 'url("' + String(src).replace(/"/g, '') + '")';
            b.addEventListener('click', function(e) {
              e.stopPropagation();
              if (e.target.closest && e.target.closest('.style-pre-x')) return;
              if (on && !src) {
                openImgPicker(function(picked) {
                  compressImage(picked, 320, function(small) { setImg(p.id, index, small); });
                });
                return;
              }
              if (src) openImgViewer(src, { noFav: true });
            });
            if (on && src) {
              var x = document.createElement('button');
              x.type = 'button';
              x.className = 'style-pre-x';
              x.textContent = '×';
              x.setAttribute('aria-label', '拿掉这张例图');
              x.addEventListener('click', function(e) {
                e.stopPropagation();
                setImg(p.id, index, '');
              });
              b.appendChild(x);
            }
            slots.appendChild(b);
          })(i, imgs[i] || '');
        }
        it.appendChild(slots);
        var ex = document.createElement('button');
        ex.type = 'button';
        ex.className = 'style-pre-ex' + (on ? ' on' : '');
        ex.textContent = '例图';
        ex.addEventListener('click', function(e) {
          e.stopPropagation();
          editing = on ? '' : p.id;
          paint();
        });
        it.appendChild(ex);
      }
      listEl.appendChild(it);
    });
  }
  box.querySelector('.pd-head').addEventListener('click', function() {
    if (!list().length) { showToast('还没有存过，写好后点保存', 'plain'); return; }
    box.classList.toggle('open');
  });
  box.querySelector('[data-act="save"]').addEventListener('click', function() {
    var text = document.getElementById(opt.field).value.trim();
    if (!text) { showToast(opt.empty, 'plain'); return; }
    askName('存为预设（同名的会被换掉）', cur ? cur.name : '', function(n) {
      n = n.slice(0, 16);
      var all = list();
      var hit = all.filter(function(p) { return p.name === n; })[0];
      if (hit) hit.text = text;
      else all.unshift({ id: opt.prefix + Date.now().toString(36), name: n, text: text, imgs: [] });
      store(all);
      cur = all.filter(function(p) { return p.name === n; })[0];
      box.classList.add('open');
      paint();
      showToast('✓ 已存为「' + n + '」', 'success');
    });
  });
  box.querySelector('[data-act="del"]').addEventListener('click', function() {
    if (!cur) { showToast('先点开选一个', 'plain'); if (list().length) box.classList.add('open'); return; }
    var p = cur;
    openConfirm('删除预设「' + p.name + '」？', function() {
      store(list().filter(function(q) { return q.id !== p.id; }));
      cur = null;
      editing = '';
      paint();
    });
  });
  paint();
}
mountImgPreset('imgStyleLabel', { key: 'mphone_img_style_presets', label: '画师串', field: 'imgStyle', empty: '先写画师串', prefix: 'is', images: true });
mountImgPreset('imgNegLabel', { key: 'mphone_img_neg_presets', label: '负面', field: 'imgNegative', empty: '先写负面提示词', prefix: 'in', images: false });

fillTtsForm();
fillImgForm();
