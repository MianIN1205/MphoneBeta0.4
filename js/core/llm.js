// 眠花糖机 — 模型接口适配：llmRequest 统一调用各家模型，工具调用循环

// =============================================
// 模型接口适配：所有发给大模型的请求都走 llmRequest()
// · Claude 官方地址（api.anthropic.com）→ Claude Messages API（x-api-key、system 单独放、最后一条必须是用户、不发 temperature）
// · 其他（GPT、Gemini、Grok、DeepSeek、通义、Kimi、各种中转）→ OpenAI 兼容格式，再按模型处理差异
// · 模型不支持的图片 / 音频换成文字；接口因为图片或音频报错时，去掉后自动重发一次并记住
// =============================================
var ANTHROPIC_VERSION = '2026-10-21';

// 正则常量：这些在 llmCaps / llmStrict / llmThinkOff / llmSendTemperature 等热路径上
// 每次发消息都会调用，提前编译好避免重复开销
var RE_ANTHROPIC_HOST = /(^|\/\/|\.)anthropic\.com/i;
var RE_NO_IMAGE = /deepseek(?!.*vl)|o1-mini|o3-mini|qwq|(^|[-\/])r1\b|kimi-k2|-text-/;
var RE_NO_AUDIO = /claude|deepseek|grok|(^|[-\/])o[1-4]\b|kimi|glm|llama|qwen(?!.*omni)|gpt-(4|5)(?!.*audio)|mistral(?!.*voxtral)/;
var RE_STRICT_MODEL = /claude|deepseek-reasoner|deepseek-r1/;
var RE_NO_TEMP_MODEL = /(^|[-\/])(o[1-9]|gpt-5)/;
var RE_GEMINI = /gemini/;
var RE_GPT5 = /gpt-5/;
var RE_O_SERIES = /(^|[-\/])o[1-9]\b/;
var RE_CLAUDE_FALLBACK = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
var RE_STREAM_TOOL_ERR = /stream(?:ing)?|tool.call|function.call|流式|工具调用/;

function llmProvider(cfg) {
  return RE_ANTHROPIC_HOST.test(cfg.url || '') ? 'anthropic' : 'openai';
}
function llmModelName(cfg) { return String(cfg.model || '').toLowerCase(); }

var LLM_MEDIA_SUPPORT_KEY = 'mphone_media_support_v2';
var MEDIA_REJECT_EXPIRE = 24 * 60 * 60 * 1000;
// 升级时只继承通过的能力记录。新键写入后，重新打开不会再清理新的拒收记录。
var llmMediaSupport = (function() {
  var current = mphoneStore.load(LLM_MEDIA_SUPPORT_KEY, null);
  if (current) return current;
  var previousMediaSupport = mphoneStore.load('mphone_media_support', {}) || {};
  var migrated = {};
  Object.keys(previousMediaSupport).forEach(function(key) {
    var entry = previousMediaSupport[key];
    if (!entry || (entry.image !== true && entry.audio !== true)) return;
    var supported = {};
    if (entry.image === true) supported.image = true;
    if (entry.audio === true) supported.audio = true;
    migrated[key] = supported;
  });
  mphoneStore.save(LLM_MEDIA_SUPPORT_KEY, migrated);
  return migrated;
})();
function llmMediaKey(cfg) {
  return JSON.stringify([String(cfg.url || '').trim().replace(/\/+$/, ''), cfg.model]);
}
function llmRememberMedia(cfg, support) {
  var key = llmMediaKey(cfg);
  var entry = Object.assign({}, llmMediaSupport[key], support), now = Date.now();
  if (support.image === false) entry._imageAt = now;
  else if (support.image === true) delete entry._imageAt;
  if (support.audio === false) entry._audioAt = now;
  else if (support.audio === true) delete entry._audioAt;
  llmMediaSupport[key] = entry;
  mphoneStore.save(LLM_MEDIA_SUPPORT_KEY, llmMediaSupport);
}
function llmCaps(cfg) {
  var m = llmModelName(cfg), anthropic = llmProvider(cfg) === 'anthropic';
  var noImage = RE_NO_IMAGE.test(m);
  var noAudio = RE_NO_AUDIO.test(m);
  var support = llmMediaSupport[llmMediaKey(cfg)] || {};
  var now = Date.now();
  var image = support._imageAt && now - support._imageAt >= MEDIA_REJECT_EXPIRE ? undefined : support.image;
  var audio = support._audioAt && now - support._audioAt >= MEDIA_REJECT_EXPIRE ? undefined : support.audio;
  return { image: image ?? !noImage, audio: !anthropic && (audio ?? !noAudio) };
}

function llmRejectedMedia(err, msgs, caps) {
  if (!err || ![400, 415, 422].includes(err.status)) return {};
  var message = String(err.message || '').toLowerCase();
  if (RE_STREAM_TOOL_ERR.test(message)) return {};
  var rejects = 'does not support|do not support|cannot accept|not supported|unsupported';
  var mediaNames = { image: 'input_image|image_url|images?|vision|图片|图像', audio: 'input_audio|audio|音频|原音' };
  var rejected = {};
  Object.keys(mediaNames).forEach(function(kind) {
    var type = kind === 'image' ? 'image_url' : 'input_audio';
    if (!caps[kind] || !msgsHavePart(msgs, type)) return;
    var name = '(?:' + mediaNames[kind] + ')';
    var rejectBefore = new RegExp('(?:' + rejects + '|不支持|不接受)\\s*(?:the\\s+)?(?:input\\s+(?:type\\s+)?)?[`"\']?' + name +
      '(?![\\w-]|[`"\']?\\s*(?:file|format|encoding|size|url|resolution|文件|格式|编码|大小|分辨率))');
    var rejectAfter = new RegExp('(?:^|[^a-z_])' + name +
      '[`"\']?\\s*(?:(?:inputs?|modality|content(?:\\s+type)?)\\s*)?(?:(?:is|are)\\s+)?(?:' + rejects + '|不受支持|不支持)');
    if (rejectBefore.test(message) || rejectAfter.test(message)) rejected[kind] = false;
  });
  return rejected;
}
// 尽量关掉模型自带的思考（眠花糖机的思维链是自己写的，见 js/chat/prompt.js；关掉思维链时也不要模型自己想）
// Claude 官方接口默认就不思考；OpenAI 兼容接口里 Gemini、GPT-5、o 系列可以用 reasoning_effort 调低。
// 中转或模型不认这个参数报错时，自动去掉再发一次，并记住这个模型（mphone_think_block）
var llmThinkBlock = mphoneStore.load('mphone_think_block', {});
function llmThinkOff(cfg) {
  if ((cfg.cot || (typeof cotModeNow === 'function' && cotModeNow())) === 'native') return null;   // 思考方式选了「模型自带的」：不去关（cfg.cot 是这个角色单独选的）
  if (llmProvider(cfg) === 'anthropic' || llmThinkBlock[cfg.model]) return null;
  var m = llmModelName(cfg);
  if (RE_GEMINI.test(m)) return { reasoning_effort: 'none' };
  if (RE_GPT5.test(m)) return { reasoning_effort: 'minimal' };
  if (RE_O_SERIES.test(m)) return { reasoning_effort: 'low' };
  return null;
}
// 需要「系统提示合并成一条、用户和角色交替、最后一条是用户」的接口
function llmStrict(cfg) {
  return llmProvider(cfg) === 'anthropic' || RE_STRICT_MODEL.test(llmModelName(cfg));
}
// OpenAI 推理模型（o1/o3/o4、GPT-5）不接受自定义 temperature
function llmSendTemperature(cfg) {
  return llmProvider(cfg) !== 'anthropic' && !RE_NO_TEMP_MODEL.test(llmModelName(cfg));
}

function partsText(content) {
  return Array.isArray(content)
    ? content.filter(function(p) { return p.type === 'text'; }).map(function(p) { return p.text; }).join('\n')
    : String(content || '');
}

function voiceTextForAI(transcript, status) {
  if (!transcript) return '（没有收到音频，也没有可用的转写）';
  if (status === 'manual') return '（语音文字由用户手动填写，可能是原话或声音描述；没有听到录音）：' + transcript;
  if (status === 'model' || status === 'stt') return '（保存的语音转写；本轮未附原音）：' + transcript;
  var label = status === 'partial' ? '部分转写' : '转写';
  return '（仅收到语音' + label + '，没有听到录音，请按文字理解）：' + transcript;
}

function llmMediaContent(content, caps) {
  if (!Array.isArray(content)) return content;
  return content.map(function(part) {
    if (part._historyPhotoLabel) return caps.image ? { type: 'text', text: part.text } : null;
    if (part.type === 'image_url') {
      return caps.image ? { type: 'image_url', image_url: part.image_url } :
        { type: 'text', text: part._imageFallback || '[图片：当前模型看不到图片内容]' };
    }
    if (part.type === 'input_audio' && !caps.audio) {
      return { type: 'text', text: voiceTextForAI(part._transcript, part._transcriptStatus) };
    }
    return part;
  }).filter(Boolean);
}

// 整理消息：去空消息、换掉不支持的媒体、按接口要求合并
function llmPrepare(msgs, cfg, caps) {
  var out = [];
  var strict = llmStrict(cfg);
  JSON.parse(JSON.stringify(msgs)).forEach(function(m) {
    var c = llmMediaContent(m.content, caps);
    if (Array.isArray(c)) {
      if (c.every(function(p) { return p.type === 'text'; })) c = partsText(c);
    }
    if (Array.isArray(c) ? !c.length : !String(c || '').trim()) return;
    // 严格接口会把系统消息统一提到开头。深度条目改用带标记的用户消息，保留插入点。
    if (strict && m.role === 'system' && Number.isInteger(m.promptDepth)) {
      out.push({ role: 'user', content: '【插入提示】\n' + partsText(c) });
      return;
    }
    // 图片后紧跟的提问应和图片放在同一个用户消息块里，兼容只处理最后一条用户消息的转发接口。
    var last = out[out.length - 1];
    if (!strict && m.role === 'user' && typeof m.content === 'string' && !Number.isInteger(m.promptDepth) &&
        last && last.role === 'user' && Array.isArray(last.content) &&
        last.content.some(function(part) { return part.type === 'image_url'; })) {
      last.content.push({ type: 'text', text: c });
    } else {
      out.push({ role: m.role, content: c });
    }
  });
  if (!strict) return { system: '', messages: out };

  // 严格模式：所有系统提示合成一条；连续同角色合并；第一条和最后一条都是用户
  var sys = [], rest = [];
  out.forEach(function(m) { if (m.role === 'system') sys.push(partsText(m.content)); else rest.push(m); });
  var merged = [];
  rest.forEach(function(m) {
    var last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      var a = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
      var b = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      last.content = a.concat(b);
      if (last.content.every(function(p) { return p.type === 'text'; })) last.content = partsText(last.content);
    } else merged.push(m);
  });
  if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', content: '（开始）' });
  if (merged[merged.length - 1].role !== 'user') merged.push({ role: 'user', content: '（请继续）' });
  var system = sys.join('\n\n');
  if (llmProvider(cfg) === 'anthropic') return { system: system, messages: merged };
  return { system: '', messages: (system ? [{ role: 'system', content: system }] : []).concat(merged) };
}

// Claude 的内容格式：图片用 base64 块
function toAnthropicContent(content) {
  if (!Array.isArray(content)) return content;
  return content.map(function(p) {
    if (p.type === 'image_url') {
      var url = (p.image_url && p.image_url.url) || '';
      var m = url.match(/^data:([^;,]+);base64,(.*)$/);
      return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
               : { type: 'image', source: { type: 'url', url: url } };
    }
    if (p.type === 'input_audio') return { type: 'text', text: '[语音：当前模型听不到音频]' };
    return { type: 'text', text: p.text || '' };
  });
}

function llmBuild(prepared, cfg, opts) {
  var base = cfg.url.replace(/\/+$/, '');
  if (llmProvider(cfg) === 'anthropic') {
    if (!/\/v1$/.test(base)) base += '/v1';
    var headers = {
      'Content-Type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    var body = {
      model: cfg.model,
      max_tokens: opts.maxTokens || 16000,
      messages: prepared.messages.map(function(m) { return { role: m.role, content: toAnthropicContent(m.content) }; }),
      stream: !!opts.stream
    };
    if (prepared.system) body.system = prepared.system;
    // 较新的 Claude 模型：安全策略拒绝时由服务器自动换模型接着回答
    if (RE_CLAUDE_FALLBACK.test(cfg.model)) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    return { url: base + '/messages', init: { method: 'POST', headers: headers, body: JSON.stringify(body), signal: opts.signal } };
  }
  var obody = { model: cfg.model, messages: prepared.messages, stream: !!opts.stream };
  if (opts.thinkOff) Object.assign(obody, opts.thinkOff);
  var temp = opts.temperature !== undefined ? opts.temperature : cfg.temp;
  if (llmSendTemperature(cfg) && typeof temp === 'number' && !isNaN(temp)) obody.temperature = temp;
  return { url: base + '/chat/completions', init: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify(obody), signal: opts.signal
  } };
}

// 从完整（非流式）回复里取文字
function llmTextFromJson(j, provider) {
  if (provider === 'anthropic') {
    var t = (j.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
    if (!t && j.stop_reason === 'refusal') throw new Error('模型按安全策略拒绝回答了这个请求');
    return t;
  }
  var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return Array.isArray(c) ? partsText(c) : String(c || '');
}

function llmProviderError(detail) {
  var err = new Error(detail.message || (typeof detail === 'string' ? detail : JSON.stringify(detail)));
  err.body = JSON.stringify({ error: detail });
  return err;
}

function readReplyBody(promise) {
  return promise.catch(function(err) {
    if (err && err.name !== 'AbortError') err.phase = 'response';
    throw err;
  });
}

// 读回复：流式逐段回调 onText(目前为止的全文)；接口没按流式返回时也能读
function llmRead(res, provider, onText) {
  var ct = res.headers.get('content-type') || '';
  if (/text\/html/i.test(ct)) return Promise.reject(new Error('接口响应是 HTML 页面'));
  if (!res.body || (ct.indexOf('event-stream') < 0 && ct.indexOf('json') >= 0)) {
    return readReplyBody(res.json()).then(function(j) {
      if (j && j.error) throw llmProviderError(j.error);
      var t = llmTextFromJson(j, provider);
      if (onText && t) onText(t);
      return t;
    });
  }
  var reader = res.body.getReader(), decoder = new TextDecoder('utf-8'), buf = '', text = '', refused = false;
  function handle(line) {
    line = line.trim();
    if (line.indexOf('data:') !== 0) return;
    var data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    var j;
    try { j = JSON.parse(data); } catch (_) { return; }
    if (j.error) throw llmProviderError(j.error);
    var piece = '';
    if (provider === 'anthropic') {
      if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') piece = j.delta.text || '';
      if (j.type === 'message_delta' && j.delta && j.delta.stop_reason === 'refusal') refused = true;
    } else {
      var d = j.choices && j.choices[0] && j.choices[0].delta;
      piece = (d && typeof d.content === 'string') ? d.content : '';
    }
    if (piece) { text += piece; if (onText) onText(text); }
  }
  function pump() {
    return readReplyBody(reader.read()).then(function(r) {
      if (r.done) {
        if (buf) handle(buf);
        if (!text && refused) throw new Error('模型按安全策略拒绝回答了这个请求');
        return text;
      }
      buf += decoder.decode(r.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(handle);
      return pump();
    });
  }
  return pump();
}

function msgsHavePart(msgs, type) {
  return msgs.some(function(m) { return Array.isArray(m.content) && m.content.some(function(p) { return p.type === type; }); });
}

function llmReportRequestMedia(messages, report) {
  if (!report) return;
  var counts = { images: 0, audio: 0 };
  messages.forEach(function(message) {
    if (!Array.isArray(message.content)) return;
    message.content.forEach(function(part) {
      if (part.type === 'image_url' && part.image_url && part.image_url.url) counts.images++;
      if (part.type === 'input_audio' && part.input_audio && part.input_audio.data) counts.audio++;
    });
  });
  report(counts);
}

// =============================================
// 工具调用（MCP）：opts.tools = [{ name, description, parameters }]，opts.callTool(name, args) → Promise<文字结果>
// 带工具时不边写边显示：先让模型决定要不要用工具，用完把结果交回去，最多 5 轮，最后的回答一次性给出
// 模型或接口不支持工具时，自动改成普通回复并记住
// =============================================
var llmToolBlock = mphoneStore.load('mphone_tool_block', {});   // { 模型名: true }
var LLM_TOOL_ROUNDS = 5;

function llmToolChat(msgs, opts) {
  var cfg = opts.cfg || getApiCfg(), provider = llmProvider(cfg);
  var prepared = llmPrepare(msgs, cfg, llmCaps(cfg));
  var status = opts.onStatus || function() {};
  return resolveMediaParts(prepared.messages, opts.onVoiceNotes).then(function() {
    var base = llmBuild(prepared, cfg, { stream: false, signal: opts.signal, temperature: opts.temperature, maxTokens: opts.maxTokens });
    var body = JSON.parse(base.init.body);
    if (provider === 'anthropic') {
      body.tools = opts.tools.map(function(t) { return { name: t.name, description: t.description || '', input_schema: t.parameters || { type: 'object', properties: {} } }; });
    } else {
      body.tools = opts.tools.map(function(t) { return { type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } }; });
    }
    var round = 0;
    function send() {
      if (opts.signal && opts.signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
      llmReportRequestMedia(prepared.messages, opts.onRequestMedia);
      return fetch(base.url, Object.assign({}, base.init, { body: JSON.stringify(body) })).then(function(res) {
        if (!res.ok) return apiError(res);
        return readReplyBody(res.json());
      }).then(function(j) {
        if (j && j.error) throw llmProviderError(j.error);
        var calls = [];
        if (provider === 'anthropic') {
          (j.content || []).forEach(function(b) { if (b.type === 'tool_use') calls.push({ id: b.id, name: b.name, args: b.input || {} }); });
          if (!calls.length || round >= LLM_TOOL_ROUNDS) return llmTextFromJson(j, provider);
          body.messages.push({ role: 'assistant', content: j.content });   // 原样交回（含思考块）
        } else {
          var m = (j.choices && j.choices[0] && j.choices[0].message) || {};
          (m.tool_calls || []).forEach(function(c) {
            var args = {};
            try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (_) {}
            calls.push({ id: c.id, name: c.function && c.function.name, args: args });
          });
          if (!calls.length || round >= LLM_TOOL_ROUNDS) return llmTextFromJson(j, provider);
          body.messages.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls });
        }
        round++;
        // 依次执行工具，把结果交回模型
        var results = [];
        return calls.reduce(function(p, c) {
          return p.then(function() {
            status('🔧 工具调用 · ' + (opts.toolLabel ? opts.toolLabel(c.name) : c.name));
            return Promise.resolve(opts.callTool(c.name, c.args)).catch(function(e) { return '工具调用失败：' + e.message; })
              .then(function(r) { results.push({ call: c, text: String(r == null ? '' : r) }); });
          });
        }, Promise.resolve()).then(function() {
          function withReplyFocus(result, index) {
            var text = result.text || '（无内容）';
            return opts.toolReplyContext && index === results.length - 1
              ? text + '\n\n【小手机补充 · 本轮回复目标】\n' + opts.toolReplyContext : text;
          }
          if (provider === 'anthropic') {
            body.messages.push({ role: 'user', content: results.map(function(r, i) { return { type: 'tool_result', tool_use_id: r.call.id, content: withReplyFocus(r, i) }; }) });
          } else {
            results.forEach(function(r, i) { body.messages.push({ role: 'tool', tool_call_id: r.call.id, content: withReplyFocus(r, i) }); });
          }
          return send();
        });
      });
    }
    return send();
  }).then(function(text) {
    if (opts.onText && text) opts.onText(text);
    return text;
  });
}

// opts: { cfg（不传 = 全局 API 设置）, stream, signal, onText(全文), onRequestMedia, temperature, keepMedia（测试用：不替换媒体）, maxTokens, tools, callTool, onStatus }
function llmRequest(msgs, opts) {
  opts = opts || {};
  var cfg = opts.cfg || getApiCfg();
  if (!cfg.url || !cfg.key || !cfg.model) return Promise.reject(new Error('请先在设置中填写 API 地址、密钥并选择模型'));
  var caps = opts.keepMedia ? { image: true, audio: true } : llmCaps(cfg);
  // 带工具（MCP）：走工具循环；模型不支持工具时改成普通回复并记住
  if (opts.tools && opts.tools.length && opts.callTool && !llmToolBlock[cfg.model]) {
    var plain = Object.assign({}, opts, { tools: null });
    var toolStarted = false;
    var toolOptions = Object.assign({}, opts, { callTool: function(name, args) {
      toolStarted = true;
      return opts.callTool(name, args);
    } });
    return llmToolChat(msgs, toolOptions).catch(function(err) {
      if (err && err.name === 'AbortError') throw err;
      if (toolStarted) throw err;
      var rejected = llmRejectedMedia(err, msgs, caps);
      if (!opts.keepMedia && Object.keys(rejected).length) return attemptWithoutMedia(rejected);
      var em = String(err && err.message);
      if (!err || ![400, 422].includes(err.status) || /image|audio|vision|图片|音频/i.test(em) ||
          !/tool|function/i.test(em) || !/unsupported|not support|unknown|unrecognized|不支持/i.test(em)) throw err;
      llmToolBlock[cfg.model] = true;
      mphoneStore.save('mphone_tool_block', llmToolBlock);
      showToast('这个模型不支持工具调用，已改成普通回复', 'error');
      return llmRequest(msgs, plain);
    });
  }
  function attempt(media, useThinkingOverride) {
    var provider = llmProvider(cfg);
    var thinkOff = useThinkingOverride ? llmThinkOff(cfg) : null;
    var prepared = llmPrepare(msgs, cfg, media);
    var once = function(off) {
      return resolveMediaParts(prepared.messages, opts.onVoiceNotes).then(function() {
        var req = llmBuild(prepared, cfg, Object.assign({}, opts, { thinkOff: off }));
        if (!opts.signal || !opts.signal.aborted) llmReportRequestMedia(prepared.messages, opts.onRequestMedia);
        return fetch(req.url, req.init);
      }).then(function(res) {
        if (!res.ok) return apiError(res);
        return llmRead(res, provider, opts.onText);
      });
    };
    if (!thinkOff) return once(null);
    // 只在响应明确点名思考参数时移除该参数，避免把附件错误或一般 400 再发一遍。
    return once(thinkOff).catch(function(err) {
      if ((err && err.name === 'AbortError') || !err || !(err.status === 400 || err.status === 422)) throw err;
      if (!/reasoning[_\s-]effort/i.test(String(err.message))) throw err;
      return once(null).then(function(t) {
        llmThinkBlock[cfg.model] = true;
        mphoneStore.save('mphone_think_block', llmThinkBlock);
        return t;
      });
    });
  }
  function attemptWithoutMedia(rejected) {
    return attempt(Object.assign({}, caps, rejected), false).then(function(text) {
      llmRememberMedia(cfg, rejected);
      var kinds = Object.keys(rejected).map(function(kind) { return kind === 'image' ? '图片' : '音频'; });
      showToast('当前接口拒收' + kinds.join('和') + '，已用文字发送。结果保留 24 小时，可在设置里重新测试。', 'plain');
      return text;
    });
  }
  return attempt(caps, true).catch(function(err) {
    var rejected = llmRejectedMedia(err, msgs, caps);
    if (opts.keepMedia || !Object.keys(rejected).length) throw err;
    return attemptWithoutMedia(rejected);
  });
}

// 模型列表：Claude 官方用自己的请求头，其余是 OpenAI 兼容的 /models
function llmListModels(url, key) {
  var cfg = { url: url, key: key };
  var base = url.replace(/\/+$/, '');
  var init;
  if (llmProvider(cfg) === 'anthropic') {
    if (!/\/v1$/.test(base)) base += '/v1';
    init = { headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' } };
    base += '/models?limit=100';
  } else {
    init = { headers: { 'Authorization': 'Bearer ' + key } };
    base += '/models';
  }
  return fetch(base, init).then(function(r) {
    if (!r.ok) return apiError(r);
    return r.json();
  }).then(function(d) {
    // 大多数接口返回 { data: [{ id }] }；也兼容 { models: [{ name }] } 和纯数组
    var list = (d && (d.data || d.models)) || (Array.isArray(d) ? d : []);
    return list.map(function(m) { return typeof m === 'string' ? m : (m.id || m.name || ''); })
      .map(function(id) { return String(id).replace(/^models\//, ''); }).filter(Boolean).sort();
  });
}
