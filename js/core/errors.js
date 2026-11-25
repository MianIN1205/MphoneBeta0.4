// 眠花糖机 — 报错分析：聊天里出错时显示一行小字（和拍一拍差不多大），点开看「出了什么问题、可能的原因、怎么办」

// =============================================
// 报错对照表：按顺序找第一条对得上的。test 拿到 { msg（小写的原文）, status（状态码，没有就是 0） }
// =============================================
var ERROR_TABLE = [
  { id: 'noapi', test: function(e) { return /请先在设置中填写 api|请先填写 api|请先选择模型/.test(e.msg); },
    title: '还没设置好 API',
    reasons: ['设置里的接口地址、密钥还没填，或者还没选模型', '填了但没点「当前应用」保存'],
    fixes: ['打开 设置 → 主API，填好接口地址和密钥，选好模型，点「当前应用」', '如果这个聊天在便捷拓展栏里单独选了模型预设，检查那套预设填全了没有'] },

  { id: 'empty', test: function(e) { return /未收到回复内容|empty response|no content/.test(e.msg); },
    title: '没收到回复内容',
    reasons: ['模型返回了空白：有的模型遇到它不想回答的内容会直接不说话', '回复被平台的安全过滤拦掉了，只剩一个空壳', '「最大输出长度」太小，或者会思考的模型把字数都用在了思考上', '中转站不稳定，只回了一个空包'],
    fixes: ['点 ❄️ 再试一次', '换个说法，或者在便捷拓展栏换个模型试试', '检查预设里有没有把输出长度限制得太小'] },

  { id: 'refusal', test: function(e) { return /安全策略拒绝|内容审核|内容安全|safety.?filter|content.?filter|content.?policy|policy.?violation|model.?refusal|blocked.?by.?safety/.test(e.msg); },
    title: '被模型的安全规则拦下了',
    reasons: ['这一轮的内容（或者最近的聊天记录、人设、世界书里的某段）触发了模型的安全审查', '不同模型、不同中转站的尺度不一样'],
    fixes: ['换个说法再试', '换一个尺度更宽的模型', '检查人设、预设、世界书里有没有特别容易触发审查的内容'] },

  { id: 'context', test: function(e) { return /context.?length|context.?window|context.?limit|too many input tokens|prompt (is )?too long|input (is )?too long|输入.{0,8}过长|上下文.{0,12}(?:过长|超出|超过|上限)/.test(e.msg); },
    title: '聊天记录太长了',
    reasons: ['这次发过去的内容（人设 + 预设 + 世界书 + 记忆 + 聊天记录）超过了这个模型一次能读的长度', '最近发了很多图片，或者世界书、预设特别长'],
    fixes: ['角色设置 → 聊天 → 把「上下文上限」或「最大记忆范围」调小一点', '换一个能读更长内容的模型', '打开「自动总结」，让旧聊天变成简短的记忆'] },

  { id: 'auth', test: function(e) { return e.status === 401 || /invalid[_ ](?:api.?key|auth.?token|access.?token|token)|incorrect api key|unauthori[sz]ed|authentication.?error|api key not valid|(?:无效|过期|错误).{0,4}(?:密钥|令牌)/.test(e.msg); },
    title: '密钥不对',
    reasons: ['密钥填错了、少复制了几位，或者前后多了空格', '密钥已经过期、被删掉或者被禁用了', '密钥和接口地址不是同一家的（比如用 A 中转的密钥连 B 中转）'],
    fixes: ['回到 设置 → 主API，重新复制粘贴一次密钥，点「当前应用」', '去中转站或官网后台看看这个密钥还在不在'] },

  { id: 'money', test: function(e) { return e.status === 402 || /insufficient.{0,20}(?:quota|balance|credits|funds)|(?:quota|credits|balance).{0,12}(?:exhausted|insufficient)|billing.{0,12}(?:hard.limit|disabled)|余额不足|额度不足|欠费/.test(e.msg); },
    title: '余额或额度用完了',
    reasons: ['账户余额不够了', '这个密钥设了额度上限，已经用完', '免费额度用完了'],
    fixes: ['去中转站或官网后台充值，或者调高这个密钥的额度', '先换一个有余额的 API 预设用着'] },

  { id: 'region', test: function(e) { return e.status === 451 || /(?:unsupported|not.supported|unavailable).{0,26}(?:country|region|territory)|(?:country|region|territory).{0,24}(?:not.supported|restricted|unavailable)|地区(?:不可用|不支持|受限)/.test(e.msg); },
    title: '地区访问受限',
    reasons: ['服务返回了地区或法律限制的明确提示。'],
    fixes: ['核对当前出口地区和服务商支持的地区。'] },
  { id: 'model', test: function(e) { return /model.?not.?found|(?:unknown|invalid|no such) model|model.{0,80}(?:does not exist|not found|not available)|模型(?:不存在|不可用|已下线)/.test(e.msg); },
    title: '模型不可用',
    reasons: ['接口指明找不到这个模型，或当前密钥所在分组无法使用它。'],
    fixes: ['重新拉取模型列表，核对模型 ID 和分组权限。'] },
  { id: 'forbidden', test: function(e) { return e.status === 403 || /permission.?denied|access.?denied|forbidden/.test(e.msg); },
    title: '请求被拒绝',
    reasons: ['接口拒绝了这次请求，可能涉及模型权限、账号分组或服务端的访问限制。'],
    fixes: ['核对密钥对应的分组和模型权限。', '如果偶尔才出现，向服务商提供发生时间和报错原文。'] },

  { id: 'notfound', test: function(e) { return e.status === 404 || /(?:route|endpoint|path).{0,28}not.found/.test(e.msg); },
    title: '地址或模型名不对',
    reasons: ['接口地址少了 /v1 之类的后缀，或者多写了一段', '模型名写错了，或者这个模型已经下线', '这个中转站没有这个模型'],
    fixes: ['设置 → 主API，对照中转站给的地址重新填一次（一般以 /v1 结尾）', '点刷新按钮重新拉一次模型列表，从列表里选'] },

  { id: 'toolarge', test: function(e) { return e.status === 413 || /(?:payload|entity|request|image|audio).{0,16}too large|request size exceeded/.test(e.msg); },
    title: '发送的内容太大了',
    reasons: ['最近发的图片、语音太大，或者太多', '聊天记录特别长'],
    fixes: ['少发几张图，或者发小一点的图', '角色设置 → 聊天 → 把「上下文上限」调小一点', '设置里关掉「发送真实图片」，让图片只用文字说明'] },

  { id: 'rateTokens', test: function(e) { return /tokens per minute|token.?rate.?limit|\btpm\b|每分钟.{0,8}token/.test(e.msg); },
    title: '令牌速率限流',
    reasons: ['服务限制的是一段时间内处理的 Token 数，长上下文可能一次就占掉很多。'],
    fixes: ['稍等一会再发，或缩小本轮上下文和附件。'] },
  { id: 'ratelimit', test: function(e) { return e.status === 429 || /rate.?limit|too many requests|resource.?exhausted|请求过于频繁|并发上限/.test(e.msg); },
    title: '请求太频繁了',
    reasons: ['短时间里请求次数太多（自动消息、动态、总结、日记也会占次数）', '这个密钥或中转站限制了每分钟的次数'],
    fixes: ['等一两分钟再点 ❄️', '暂时关掉一些角色的自主活动，减少后台请求', '换一个 API 预设分担一下'] },

  { id: 'gatewayTimeout', test: function(e) { return [504, 522, 524].includes(e.status); },
    title: '上游连接或响应超时',
    reasons: ['网关报告它没能及时连到上游，或没等到上游完成响应。'],
    fixes: ['过一会重试。', '若短消息稳定、长回复易失败，试着缩小上下文或换响应更快的模型。'] },
  { id: 'timeout', test: function(e) { return e.status === 408 || /time.?out|timed out|超时/.test(e.msg); },
    title: '等太久，超时了',
    reasons: ['模型想得太久（长回复、会思考的模型更容易）', '中转站或网络太慢', '手机切到后台时连接被掐断了'],
    fixes: ['点 ❄️ 再试一次', '回复的时候先别切出去', '换一个快一点的模型或中转'] },

  { id: 'overloaded', test: function(e) { return e.status === 529 || /overloaded|server.?busy|service.?overload|服务繁忙/.test(e.msg); },
    title: '服务繁忙',
    reasons: ['服务明确返回了过载或繁忙，可能只影响一部分请求。'],
    fixes: ['等一会再试。', '同一模型持续繁忙时，可以先切换预设。'] },
  { id: 'server', test: function(e) { return e.status >= 500 || /bad gateway|service unavailable|internal server error|server error|upstream.?error/.test(e.msg); },
    title: '接口服务异常',
    reasons: ['接口或网关返回了服务端错误，具体是中转还是它的上游，需要结合错误原文或服务商日志。'],
    fixes: ['过一会儿再点 ❄️', '先换一个 API 预设或模型用着', '一直这样的话，去中转站的公告或群里看看'] },

  { id: 'delivery', test: function(e) { return e.phase === 'response' && e.name !== 'syntaxerror'; },
    title: '回复接收中断',
    reasons: ['网页已经收到接口响应，但读取正文时连接中断。可能涉及网络切换、后台暂停或中转提前关闭连接。'],
    fixes: ['留在聊天页重试一条短消息。', '经常中断时，把失败时间和原文给服务商排查流式连接。'] },
  { id: 'cors', test: function(e) { return !e.status && /cross-origin|\bcors\b|preflight|access-control-allow-origin/.test(e.msg); },
    title: '网页跨域访问被拦截',
    reasons: ['错误明确提到了跨域或预检。接口需要允许小手机这个网页来源访问。'],
    fixes: ['请接口服务商核对跨域配置，尤其是预检和错误响应。'] },
  { id: 'dns', test: function(e) { return !e.status && /err_name_not_resolved|enotfound|dns_probe|name resolution/.test(e.msg); },
    title: '接口域名解析失败',
    reasons: ['网络没有把接口域名解析成可连接的地址。'],
    fixes: ['核对域名拼写，检查当前网络或 VPN 的 DNS。'] },
  { id: 'tls', test: function(e) { return !e.status && /err_cert_|err_ssl_|certificate|tls handshake/.test(e.msg); },
    title: '接口证书或握手异常',
    reasons: ['浏览器报告 HTTPS 校验或加密连接握手失败。'],
    fixes: ['检查设备日期时间，并请接口服务商核对证书。'] },
  { id: 'offline', test: function(e) { return !e.status && (e.offline || /err_internet_disconnected/.test(e.msg)); },
    title: '设备网络离线',
    reasons: ['报错时浏览器报告设备处于离线状态。'],
    fixes: ['等手机网络恢复，再回到聊天页发送。'] },
  { id: 'network', test: function(e) { return !e.status && /failed to fetch|networkerror|network error|load failed|network request failed|连接失败|err_(?:connection|network|address)/.test(e.msg); },
    title: '没有收到可读取的接口响应',
    reasons: ['浏览器只报告了连接失败，没有提供 HTTP 状态。仅凭这条报错，无法区分网络波动、代理断开、服务端断连和跨域拦截。'],
    fixes: ['同一预设先发一条短消息。模型列表能加载时，聊天请求仍可能单独失败。', '如果重现，记下时间和详情里的原文，请中转查这一笔。'] },

  { id: 'format', test: function(e) { return e.name === 'syntaxerror' || /响应是 html|unexpected token|invalid json|<!doctype|<html/.test(e.msg); },
    title: '返回的不是正常的数据',
    reasons: ['接口地址可能填成了网页地址，而不是 API 地址', '这个地址不是 OpenAI 兼容格式的接口', '中转站出错，返回了一个错误网页'],
    fixes: ['对照中转站的说明，重新填一次 API 地址（一般以 /v1 结尾）', '过一会儿再试'] },

  { id: 'capability', test: function(e) { return /(?:image|audio|vision|tools?|function.call|multimodal|图片|音频|工具).{0,35}(?:not.support|unsupported|不支持)|(?:not.support|unsupported|不支持).{0,40}(?:image|audio|vision|tool|function.call|multimodal|图片|音频|工具)/.test(e.msg); },
    title: '接口不支持本轮能力',
    reasons: ['接口明确拒绝了本轮用到的图片、音频、工具或其他输入能力。'],
    fixes: ['换支持该能力的模型或接口，或把这轮改成普通文字。'] },
  { id: 'badreq', test: function(e) { return [400, 405, 409, 415, 422].includes(e.status) || /invalid.request|invalid.parameter|bad request|unsupported|not support/.test(e.msg); },
    title: '请求格式不被接受',
    reasons: ['这个模型不支持图片、语音或者工具（MCP），而这次发过去了', '某个参数这个模型不认（比如温度超出范围）', '中转站和这个模型的格式不兼容'],
    fixes: ['按原始错误检查被点名的模型或预设参数。', '用同一预设发一条短文字，确认是否只在特定内容下失败。'] },
];
var ERROR_FALLBACK = { id: 'other', title: '出了点问题',
  reasons: ['对照表里没有对上这种情况，可以看下面的原始报错'],
  fixes: ['点 ❄️ 再试一次', '把原始报错复制下来发给 Claude，帮你看看'] };

function explainError(err) {
  err = err || {};
  var structured = '';
  if (err.body) {
    try {
      var data = JSON.parse(err.body);
      var detail = data && (data.error || data);
      if (detail && typeof detail === 'object') structured = [detail.code, detail.type, detail.status].join(' ');
    } catch (_) {}
  }
  var info = { msg: (structured + ' ' + String(err.message || err)).toLowerCase(), status: Number(err.status) || 0,
    phase: err.phase, offline: err.offline, name: String(err.name || '').toLowerCase() };
  for (var i = 0; i < ERROR_TABLE.length; i++) if (ERROR_TABLE[i].test(info)) return ERROR_TABLE[i];
  return ERROR_FALLBACK;
}

// =============================================
// 聊天里的一行小字：「⚠️ 回复失败：连不上服务器  查看原因」，点开是分析弹窗
// 原始报错不会发给 AI。报错条一直留在原处（切出去再回来、重开小手机都还在）：
// 挂在出错时最后一条消息上（m.errs，跟着记录存）；记录还空着时挂在这份记录上（只在这次打开期间）
// =============================================
var ERR_CONTEXT_MS = 24 * 3600000;
var errEmptyTrail = new WeakMap();
var ERR_KEEP = 5;                  // 一条消息后面最多留几条报错
var errEmptyNotes = new WeakMap(); // 空记录 → 报错
// 报错存成普通对象（能存进记录）；只留分析和完整报错要用的，密钥打码
function errPack(err, ctx) {
  err = err || {}; ctx = ctx || {};
  var o = { message: errRedact(String(err.message || err || '')), time: Date.now() };
  if (err.status) o.status = err.status;
  if (err.phase) o.phase = err.phase;
  if (err.offline || navigator.onLine === false) o.offline = true;
  if (err.statusText) o.statusText = String(err.statusText);
  if (err.name && err.name !== 'Error') o.name = String(err.name);
  try { if (err.url) { var eu = new URL(err.url); o.url = eu.origin + eu.pathname; } } catch (_) {}
  if (err.body != null && String(err.body).trim()) o.body = errRedact(String(err.body).slice(0, 20000));
  else if (err.stack) o.stack = String(err.stack).split('\n').slice(0, 10).join('\n');
  if (ctx.model) o.model = String(ctx.model);
  try { if (ctx.url) { var cu = new URL(ctx.url); o.ctxUrl = cu.origin + cu.pathname; } } catch (_) {}
  return o;
}
// 记下这次报错（不画），返回存好的那份
function errRemember(hist, err, ctx, placement) {
  var p = errPack(err, ctx);
  if (placement) p.operation = placement.operation;
  if (!hist) return p;
  var m = placement ? placement.anchor : hist[hist.length - 1];
  if (m) {
    m.errTrail = addErrTrail(m.errTrail, m.errs, p);
    m.errs = (m.errs || []).concat(p).slice(-ERR_KEEP);
    if (typeof saveHistories === 'function') saveHistories();
  } else {
    errEmptyTrail.set(hist, addErrTrail(errEmptyTrail.get(hist), errEmptyNotes.get(hist), p));
    errEmptyNotes.set(hist, (errEmptyNotes.get(hist) || []).concat(p).slice(-ERR_KEEP));
  }
  return p;
}
var ERR_SHORT_BY_KIND = {
  noapi: '未配置 API', empty: '空回复', refusal: '内容受限', context: '上下文过长',
  auth: '认证失败', money: '额度不足', forbidden: '权限受限', notfound: '接口或模型不存在',
  toolarge: '请求过大', ratelimit: '请求限流', timeout: '请求超时', server: '服务异常',
  network: '网络连接失败', delivery: '回复接收中断', cors: '跨域受限', offline: '设备离线',
  dns: '域名解析失败', tls: '证书或握手异常', format: '响应格式错误', badreq: '请求无效',
  region: '地区受限', model: '模型不可用', capability: '能力不支持', rateTokens: 'Token 速率限流',
  gatewayTimeout: '网关超时', overloaded: '服务繁忙'
};
var ERR_SHORT_BY_HTTP = {
  400: '请求无效', 401: '认证失败', 402: '额度不足', 403: '权限受限', 404: '接口或模型不存在',
  405: '请求方法不支持', 408: '请求超时', 409: '请求冲突', 413: '请求过大',
  415: '格式不支持', 422: '参数无效', 429: '请求限流', 500: '服务内部错误',
  502: '网关错误', 503: '服务暂不可用', 504: '网关超时', 522: '连接超时',
  524: '服务响应超时', 529: '服务繁忙'
};
function errShortLabel(err, ex) {
  var status = Number(err.status);
  var hasStatus = Number.isInteger(status) && status >= 400 && status <= 599;
  var specific = ['context', 'refusal', 'money', 'region', 'model', 'capability', 'rateTokens', 'overloaded'].includes(ex.id);
  var label = (specific && ERR_SHORT_BY_KIND[ex.id]) ||
    (hasStatus && ERR_SHORT_BY_HTTP[status]) || ERR_SHORT_BY_KIND[ex.id];
  return hasStatus ? status + ' · ' + (label || (status >= 500 ? '服务异常' : '请求失败')) : label || '未知错误';
}

var REPLY_ERR_LINK = /报错|网络错误|连接(?:不上|不到|失败|中断|超时)|连(?:不上|不到|不通)|断线|断网|加载失败|请求失败|一直转圈|卡在加载|回不了|发不出去|failed to fetch|network error|timed? out/i;
var REPLY_GENERIC_ERROR = /^i seem to be encountering an error\.?\s*(?:can i try something else for you\??)?$/i;


var ERR_CONTEXT_LABELS = new Set(Object.values(ERR_SHORT_BY_KIND).concat(Object.values(ERR_SHORT_BY_HTTP),
  ['服务异常', '请求失败', '未知错误']));
function safeErrTrailLabel(label) {
  return typeof label === 'string' && ERR_CONTEXT_LABELS.has(label.replace(/^[45]\d\d · /, ''));
}

function errTrailItem(err) {
  return { time: err.time, label: errShortLabel(err, explainError(err)) };
}

function addErrTrail(trail, saved, err) {
  var cutoff = err.time - ERR_CONTEXT_MS;
  var previous = Array.isArray(trail) ? trail : (saved || []).filter(function(item) { return item.time >= cutoff; }).map(errTrailItem);
  return previous.filter(function(item) { return item.time >= cutoff; }).concat(errTrailItem(err));
}

function replyErrorContext(hist) {
  var now = Date.now(), cutoff = now - ERR_CONTEXT_MS;
  var texts = [];
  for (var i = hist.length - 1; i >= 0 && texts.length < 6; i--) {
    var msg = hist[i];
    if (msg.role !== 'user') break;
    if (msg.time && now - msg.time > 30 * 60000) break;
    if (!msg.recalled && !msg.note && !msg.action && !msg.cal && typeof msg.content === 'string') texts.push(msg.content);
  }
  var text = texts.join('\n');
  if (!REPLY_ERR_LINK.test(text)) return null;

  var events = [];
  function collect(trail, raw) {
    if (Array.isArray(trail)) {
      trail.forEach(function(item) {
        if (item && item.time >= cutoff && item.time <= now && safeErrTrailLabel(item.label)) events.push(item);
      });
    } else if (Array.isArray(raw)) {
      raw.forEach(function(item) {
        if (item.time >= cutoff && item.time <= now) events.push(errTrailItem(item));
      });
    }
  }
  collect(errEmptyTrail.get(hist), errEmptyNotes.get(hist));
  hist.forEach(function(msg) {
    collect(msg.errTrail, msg.errs);
    if (msg.time >= cutoff && msg.time <= now && msg.role === 'assistant' && !msg.recalled &&
        typeof msg.content === 'string' && REPLY_GENERIC_ERROR.test(msg.content.trim())) {
      events.push({ time: msg.time, label: '回复出现通用出错提示' });
    }
  });
  if (!events.length) return null;
  events.sort(function(a, b) { return a.time - b.time; });
  var timeline = events.map(function(event) { return fmtMsgTime(event.time) + ' · ' + event.label; }).join('\n');
  return {
    role: 'system',
    content: '【本轮的连接情况】最近 24 小时，这段对话共记录到 ' + events.length + ' 次出错：\n' + timeline + '\n' +
      '先回应用户这轮说的事和等待时的感受。适合提及时，可以自然接一句；只有用户在问时间或原因时，再简短说明相应记录，以这些信息为限。'
  };
}

function errNoticeEl(p) {
  var ex = explainError(p);
  var el = document.createElement('div');
  el.className = 'cr-recall-notice cr-err-notice';
  var summary = errShortLabel(p, ex);
  var label = p.operation === 'regenerate' ? '重新生成失败' : '回复失败';
  el.appendChild(document.createTextNode('⚠️ ' + label + ' · ' + summary));
  var more = document.createElement('span');
  more.className = 'cr-recall-reedit';
  more.textContent = '查看详情';
  el.appendChild(more);
  var detail = { ex: ex, err: p, time: p.time, summary: summary, ctx: { model: p.model, url: p.ctxUrl } };
  el.addEventListener('click', function() { openErrInfo(detail); });
  return el;
}
// 重画列表时把存着的报错放回原处：after 是消息（null = 记录开头），row 是这条消息画出来的元素
function errRenderSaved(list, m, row, hist) {
  var arr = m ? m.errs : errEmptyNotes.get(hist);
  if (!arr || !arr.length) return;
  var els = arr.map(function(p) { var el = errNoticeEl(p); list.appendChild(el); return el; });
  if (row && row.nodeType === 1) row._errNotes = (row._errNotes || []).concat(els);
  if (!m && list._empty) list._empty.style.display = 'none';
}
function showErrNotice(err, list, empty, ctx, hist) {
  list = list || getActiveMsgListEl();
  if (empty) empty.style.display = 'none';
  hist = hist || list._hist || (typeof getActiveHistory === 'function' ? getActiveHistory(openingChatCharIdx) : null);
  var el = errNoticeEl(errRemember(hist, err, ctx));
  // 挂在最后一条消息上：删这条消息时报错条一起拿掉
  var rows = list.querySelectorAll('.chat-msg-row');
  var last = rows[rows.length - 1];
  if (last && hist && last._msg === hist[hist.length - 1]) last._errNotes = (last._errNotes || []).concat(el);
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
  return el;
}

// 密钥打码（不截断：完整报错要整段显示）
function errRedact(text) {
  return String(text || '')
    .replace(/(?:https?:\/\/)?mianin1205\.github\.io(?:\/MphoneBeta[^\/\s"'<>?#]+\/?|\/)?/gi, '')
    .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/MianIN1205\/MphoneBeta[^\/\s"'<>?#]+(?:[^\s"'<>]*)/gi, '[项目链接已隐藏]')
    .replace(/\bMianIN1205\/MphoneBeta[\w.-]*/gi, '[项目仓库已隐藏]')
    .replace(/(sk|key|pk)-[A-Za-z0-9_\-]{6,}/gi, '$1-***').replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"]+/gi, '$1***');
}
var errInfoOverlay = document.getElementById('errInfoOverlay');
var errInfoText = '';

// =============================================
// 智能诊断建议：根据当前 API 配置、模型名、报错类型生成上下文相关的具体建议
// 只在弹窗打开时计算一次，不改变 ERROR_TABLE 的静态内容
// =============================================
function errSmartHints(d) {
  var hints = [], ex = d.ex || {}, err = d.err || {}, ctx = d.ctx || {};
  var model = String(ctx.model || err.model || '').toLowerCase();
  var msg = String(err.message || '').toLowerCase();
  var cfg = null;
  try { cfg = typeof getApiCfg === 'function' ? getApiCfg() : null; } catch (_) {}
  var isMeal = !!(cfg && cfg.mealCode);

  // --- badreq：请求格式不被接受（400/405/409/415/422）---
  if (ex.id === 'badreq') {
    // reasoning_effort 参数
    if (cfg && typeof llmThinkOff === 'function') {
      var thinkOff = llmThinkOff(cfg);
      if (thinkOff) {
        var param = Object.keys(thinkOff)[0] || 'reasoning_effort';
        hints.push('当前思维链设置会发送 ' + param + ' 参数，部分中转不认。试试：角色设置 → 聊天 → 思维链改成「模型自带的」');
      }
    }
    // temperature
    if (/temperature/.test(msg) && cfg) {
      hints.push('当前模型可能不接受自定义温度。在预设或便捷拓展栏里把温度留空试试');
    }
    // 图片 / 音频
    if (/image|vision|图片/.test(msg)) hints.push('报错提到了图片。如果刚发了图，试试用纯文字重发');
    if (/audio|音频/.test(msg)) hints.push('报错提到了音频。如果刚发了语音，试试用纯文字重发');
    // stream / tool
    if (/stream/.test(msg)) hints.push('报错提到了 stream。部分接口不支持流式，可以在设置里关闭流式输出');
    if (/tool|function/.test(msg)) hints.push('报错提到了工具调用。如果开了 MCP，试试暂时关掉');
    // 大锅饭遮蔽
    if (isMeal && /食材来源/.test(msg)) {
      hints.push('大锅饭会隐藏上游的具体报错。上面列的都是可能的原因，逐个排查');
    }
  }

  // --- capability：接口不支持本轮能力 ---
  if (ex.id === 'capability') {
    if (/image|vision|图片/.test(msg)) hints.push('具体是图片被拒。设置 → 附件测试 可以单独测试图片支持');
    if (/audio|音频/.test(msg)) hints.push('具体是音频被拒。设置 → 附件测试 可以单独测试语音支持');
    if (/tool|function|工具/.test(msg)) hints.push('具体是工具调用被拒。如果开了 MCP，试试暂时关掉');
  }

  // --- auth：密钥不对（401）---
  if (ex.id === 'auth') {
    if (isMeal) hints.push('你正在使用大锅饭，密钥由后台管理。可能是领取凭证过期了，回 设置 → 大锅饭 检查状态');
  }

  // --- money：余额不足（402）---
  if (ex.id === 'money') {
    if (isMeal) hints.push('大锅饭共享额度可能用完了，检查 设置 → 大锅饭 的剩余次数');
    hints.push('快速切换：便捷拓展栏里选另一个 API 预设');
  }

  // --- forbidden：请求被拒（403）---
  if (ex.id === 'forbidden') {
    if (isMeal) hints.push('大锅饭的凭证可能无效或过期，回 设置 → 大锅饭 检查');
    if (model) hints.push('当前模型「' + model + '」可能不在密钥分组的可用列表里');
  }

  // --- notfound / model：地址或模型不存在（404）---
  if (ex.id === 'notfound' || ex.id === 'model') {
    if (model) hints.push('当前模型名：' + model + ' — 确认拼写和是否还在线');
    if (isMeal) hints.push('该模型可能不在饭票的可用列表里');
  }

  // --- ratelimit / rateTokens：请求限流（429）---
  if (ex.id === 'ratelimit' || ex.id === 'rateTokens') {
    if (isMeal) hints.push('大锅饭有请求间隔限制，等一会再试');
    if (typeof charList !== 'undefined' && charList.length) {
      var autoCount = 0;
      charList.forEach(function(c) { if (c && c.chatCfg && c.chatCfg.actionOn) autoCount++; });
      if (autoCount > 1) hints.push('你有 ' + autoCount + ' 个角色开着自主活动，它们也会占请求次数');
    }
  }

  // --- timeout / gatewayTimeout：超时 ---
  if (ex.id === 'timeout' || ex.id === 'gatewayTimeout') {
    if (model && /deepseek.*r1|qwq|o[1-9]|gpt-5/.test(model)) {
      hints.push('「' + model + '」是会思考的模型，回复时间更长，容易超时');
    }
  }

  // --- server：服务异常（5xx）---
  if (ex.id === 'server') {
    if (isMeal) hints.push('大锅饭后台或上游服务商出错。如果大锅饭本身能访问（设置 → 大锅饭），问题可能在上游');
  }

  // --- empty：空回复 ---
  if (ex.id === 'empty') {
    if (cfg && typeof llmThinkOff === 'function' && !llmThinkOff(cfg) && model && /deepseek.*r1|qwq|o[1-9]/.test(model)) {
      hints.push('这是会思考的模型，可能所有输出都花在了思考上。试试加大「最大输出长度」');
    }
  }

  // --- refusal：安全审查 ---
  if (ex.id === 'refusal') {
    if (/claude/.test(model)) hints.push('Claude 的安全策略比较严格。便捷拓展栏里临时换个模型试试');
  }

  // --- context：上下文过长 ---
  if (ex.id === 'context') {
    hints.push('打开「自动总结」可以让旧聊天自动压缩，减少上下文长度');
  }

  // --- network：连接失败 ---
  if (ex.id === 'network') {
    var endpoint = ctx.url || err.url || '';
    if (/^http:\/\//.test(endpoint)) hints.push('当前接口地址是 HTTP，小手机的 HTTPS 页面可能无法连接 HTTP 接口');
  }

  // --- format：返回 HTML ---
  if (ex.id === 'format') {
    hints.push('常见情况：地址末尾缺少 /v1，或者填的是中转站网页地址而不是 API 地址');
  }

  // --- region：地区受限 ---
  if (ex.id === 'region') {
    hints.push('部分服务商限制特定地区访问。如果用的中转站，联系中转站确认');
  }

  // --- overloaded：服务繁忙 ---
  if (ex.id === 'overloaded') {
    if (model) hints.push('「' + model + '」可能正在高峰期。便捷拓展栏里临时换个模型');
  }

  return hints;
}

function openErrInfo(d) {
  var fill = function(id, arr) {
    var ul = document.getElementById(id);
    ul.innerHTML = '';
    arr.forEach(function(t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  };
  document.getElementById('errInfoTitle').textContent = d.summary || errShortLabel(d.err, d.ex);
  fill('errInfoReasons', d.ex.reasons.slice(0, 1));
  // 智能建议：在静态建议后追加根据当前配置状态生成的具体建议
  var fixes = d.ex.fixes.slice(0, 2);
  var smart = errSmartHints(d);
  if (smart.length) fixes = fixes.concat(smart);
  fill('errInfoFixes', fixes);
  var ctx = d.ctx || {};
  var endpoint = ctx.url || d.err.url;
  var host = '';
  try { host = new URL(endpoint).host; } catch (_) {}
  var model = errRedact(ctx.model).replace(/\s+/g, ' ').trim();
  document.getElementById('errInfoContext').textContent = [
    '时间：' + (d.time ? fmtMsgTime(d.time) : '未记录'),
    '接口：' + (host ? errRedact(host) || '已隐藏' : '未记录'),
    '模型：' + (model || '未记录')
  ].join('\n');
  document.getElementById('errInfoRaw').textContent =
    (d.summary || errShortLabel(d.err, d.ex)) + '：' +
    errRedact(String(d.err.message || d.err.statusText || '服务未提供报错原文'));
  errInfoText = errFullCode(d);
  document.getElementById('errInfoCode').textContent = errInfoText;
  document.getElementById('errInfoDiagnostics').open = false;
  errInfoOverlay.classList.add('open');
  errInfoOverlay.querySelector('.err-info-modal').scrollTop = 0;
}
function errFullCode(d) {
  var e = d.err || {}, endpoint = '';
  try {
    var url = new URL(e.url || (d.ctx && d.ctx.url) || '');
    if (!/^mianin1205\.github\.io$/i.test(url.hostname)) endpoint = url.origin + url.pathname;
  } catch (_) {}
  var lines = [];
  if (e.status) lines.push('HTTP ' + e.status + (e.statusText ? ' ' + e.statusText : ''));
  if (endpoint) lines.push(endpoint);
  lines.push((e.name || 'Error') + ': ' + String(e.message || d.err || ''));
  if (e.body != null && String(e.body).trim()) {
    var body = String(e.body);
    try { body = JSON.stringify(JSON.parse(body), null, 2); } catch (_) {}
    lines.push('', body.length > 20000 ? body.slice(0, 20000) + '\n…（太长，后面省略）' : body);
  } else if (e.stack) {
    lines.push('', String(e.stack).split('\n').slice(0, 10).join('\n').replace(/(?:https?:\/\/mianin1205\.github\.io\/MphoneBeta[^\/\s]+\/|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(?:before\/|after\/)?)(?=js\/)/gi, ''));
  }
  return errRedact(lines.join('\n'));
}
document.getElementById('errInfoCopy').addEventListener('click', function() {
  if (!navigator.clipboard) { showToast('✗ 这里不能复制', 'error'); return; }
  navigator.clipboard.writeText(errInfoText).then(function() { showToast('✓ 已复制', 'success'); }, function() { showToast('✗ 复制失败', 'error'); });
});
document.getElementById('errInfoClose').addEventListener('click', function() { errInfoOverlay.classList.remove('open'); });
closeOnBackdrop(errInfoOverlay);
