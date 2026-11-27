// 大锅饭凭证单独保存在浏览器，预设与整机备份只记录兑换编号。
const mealBase = (document.querySelector('meta[name="mphone-meal-service"]').content || '').trim().replace(/\/+$/, '');
const mealCodePattern = /^[a-f0-9]{32}$/;
const mealTokenPattern = /^[a-f0-9]{64}$/;
const mealIdentityKey = 'mphoneMealBrowser';
const mealDraftBlocks = document.getElementById('mealSection');
const mealIssueForm = document.getElementById('mealIssueForm');
const mealIssuePanel = document.getElementById('mealIssuePanel');
const mealClaimForm = document.getElementById('mealClaimForm');
const mealIssueAddress = document.getElementById('mealIssueAddress');
const mealIssueKey = document.getElementById('mealIssueKey');
const mealModels = document.getElementById('mealModels');
const mealModelToggle = document.getElementById('mealModelToggle');
const mealModelDrawer = document.getElementById('mealModelDrawer');
const mealModelSummary = document.getElementById('mealModelSummary');
const mealSelectAllModels = document.getElementById('mealSelectAllModels');
const mealSource = document.getElementById('mealSource');
const mealNotice = document.getElementById('mealNotice');
const mealCodeInput = document.getElementById('mealCodeInput');
const mealPrivacy = document.getElementById('mealPrivacy');
const mealShareNote = '使用这张码时，随请求发送的聊天内容和附件会经过大锅饭后台及服务商，建议用新聊天试用。';
const mealDirectShareNote = '直连码，聊天内容直接发给中转站，不经大锅饭后台。直连码内含可还原的 API Key，请仅私发给信任的人。';
const mealDirectPrefixOld = 'MPDC1-';
const mealDirectPrefixNew = 'zl-';

// 直连码编解码
// 新格式 zl-{base64url(deflate(json))}：字段缩写 + deflate 压缩，比旧格式短约 40-50%
// 旧格式 MPDC1-{base64(json)} 继续兼容识别
// 字段映射：i=id, u=url, k=key, m=models, n=name, p=perPerson, e=expires（0 是不限时，没写是旧码）
async function mealDirectEncode(payload) {
  var compact = { i: payload.id, u: payload.url, k: payload.key, m: payload.models, n: payload.name || '', p: payload.perPerson };
  if (payload.expires === 0 || Number.isFinite(payload.expires)) compact.e = payload.expires === 0 ? 0 : payload.expires;
  var json = JSON.stringify(compact);
  var blob = new Blob([json]);
  var cs = new CompressionStream('deflate-raw');
  var compressed = new Response(blob.stream().pipeThrough(cs)).arrayBuffer();
  var bytes = new Uint8Array(await compressed);
  // base64url：不用 + / =，粘贴分享时不会被截断
  var str = '';
  for (var idx = 0; idx < bytes.length; idx++) str += String.fromCharCode(bytes[idx]);
  var b64 = btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return mealDirectPrefixNew + b64;
}
async function mealDirectDecode(code) {
  try {
    if (code.startsWith(mealDirectPrefixNew)) return await mealDirectDecodeNew(code);
    if (code.startsWith(mealDirectPrefixOld)) return mealDirectDecodeOld(code);
    return null;
  } catch (_) { return null; }
}
function mealDirectDecodeOld(code) {
  var raw = JSON.parse(decodeURIComponent(escape(atob(code.slice(mealDirectPrefixOld.length)))));
  return raw;
}
async function mealDirectDecodeNew(code) {
  var b64 = code.slice(mealDirectPrefixNew.length).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var idx = 0; idx < binary.length; idx++) bytes[idx] = binary.charCodeAt(idx);
  var ds = new DecompressionStream('deflate-raw');
  var writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  var decompressed = await new Response(ds.readable).text();
  var c = JSON.parse(decompressed);
  // 还原缩写字段为长字段名，后续代码不用改
  return { id: c.i, url: c.u, key: c.k, models: c.m, name: c.n || '', perPerson: c.p, expires: mealDirectExpiryValue(c.e) };
}
function mealDirectExpiryValue(value) {
  if (value === 0 || value === '0') return 0;
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : undefined;
}
function mealDirectParseExpiry(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('请填写有效期，或写不限时。');
  if (/^(不限时|不限|无限)$/.test(raw)) return 0;
  const normalized = raw.replace('T', ' ').replace(/[年月/.]/g, '-').replace(/日/g, ' ').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) throw new Error('时间没看懂。写成 25-02-14 23:59，或写不限时。');
  const year = Number(match[1]) < 100 ? 2000 + Number(match[1]) : Number(match[1]);
  const hour = match[4] === undefined ? 23 : Number(match[4]);
  const minute = match[5] === undefined ? 59 : Number(match[5]);
  if (hour > 23 || minute > 59) throw new Error('请输入有效的小时和分钟。');
  const date = new Date(year, Number(match[2]) - 1, Number(match[3]), hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    throw new Error('这个日期不存在。');
  }
  return date.getTime();
}
function mealDirectExpiryStamp(time) {
  const date = new Date(time);
  const pad = n => String(n).padStart(2, '0');
  return pad(date.getFullYear() % 100) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
function mealDirectExpiryPhrase(expires) {
  if (expires === 0) return '不限时';
  const time = mealDirectExpiryValue(expires);
  if (!time) return '有效期未填写';
  return '有效期至 ' + mealDirectExpiryStamp(time);
}
function mealDirectExpiryInputValue(expires) {
  if (expires === 0) return '不限时';
  const time = mealDirectExpiryValue(expires);
  if (!time) return '';
  return mealDirectExpiryStamp(time);
}
function mealIsDirectCode(text) {
  return text.startsWith(mealDirectPrefixNew) || text.startsWith(mealDirectPrefixOld);
}

function mealReadCode() {
  const raw = mealCodeInput.value.trim();
  // 直连码：从分享文字中提取（新 zl- 和旧 MPDC1- 两种格式）
  const directShared = raw.match(/^🍙 眠花糖机大锅饭直连码[：:]\s*((?:zl-|MPDC1-)[A-Za-z0-9+/=_-]+)(?=\s|🍽️大锅饭|直连码|$)/u);
  if (directShared) return directShared[1];
  // 直连码：裸码
  if (raw.startsWith(mealDirectPrefixNew) || raw.startsWith(mealDirectPrefixOld)) return raw;
  // 后台码：从分享文字中提取
  const text = raw.toLowerCase();
  const shared = text.match(/^🍲 眠花糖机大锅饭兑换码[：:]\s*([a-f0-9]{32})(?=\s|🍽️大锅饭|使用这张码时|$)/u);
  return shared ? shared[1] : text;
}
const mealClaimReview = document.getElementById('mealClaimReview');
const mealIssued = document.getElementById('mealIssued');
const mealHelpers = document.getElementById('mealApiHint');
const mealApiBalance = document.getElementById('mealApiBalance');

function mealPresetTitle(summary) {
  return '🍽️大锅饭 · ' + (summary.name || summary.provider);
}
let mealInspectedCode = '';
let mealInspectRequest = 0;
let mealInspectTimer;
const mealInspectButton = mealClaimForm.querySelector('button[type=submit]');
const mealClaimNotice = document.getElementById('mealClaimNotice');
let mealIssuerRequest = 0;
let mealQuotaRequest = 0;
let mealQuotaTimer;
const mealQuotaResult = document.getElementById('mealQuotaResult');

function mealRemember(key, value) {
  if (value !== undefined) mphoneLocal.setItem(key, JSON.stringify(value));
  try { return JSON.parse(mphoneLocal.getItem(key) || 'null'); } catch (_) { return null; }
}
function mealActiveCredential(code) {
  const claim = mealCodePattern.test(code) && mealRemember('mphoneMealClaim:' + code);
  return claim && mealTokenPattern.test(claim.token) ? claim : null;
}
function mealConfig(cfg, code) {
  const claim = mealActiveCredential(code);
  return Object.assign(cfg, { mealCode: code, url: claim ? mealBase : '', key: claim ? code + '.' + claim.token : '' });
}
function mealPersistentConfig(cfg) {
  return cfg.mealCode ? Object.assign({}, cfg, { url: '', key: '' }) : Object.assign({}, cfg);
}
async function mealRequest(path, body, bearer, signal) {
  if (!mealBase) throw new Error('醞酿中，兑换服务尚未配置。');
  const response = await fetch(mealBase + path, {
    method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    headers: Object.assign({ 'Content-Type': 'application/json' }, bearer ? { Authorization: 'Bearer ' + bearer } : {}),
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || '兑换服务暂时不可用');
    error.status = response.status;
    throw error;
  }
  return result;
}
function mealBalanceText(summary) {
  const quota = summary?.upstreamBalance;
  if (!summary?.sharedBalance) return '';
  if (quota?.unlimited) return '站点已取消这把 Key 的额度上限';
  if (!Number.isFinite(quota?.available)) return '共享站内余额暂未读取';
  return '站内共享余额 ' + new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 12 }).format(quota.available) + ' ' + quota.unit;
}
const mealStateLabel = { expired: '已到期', spent: '次数已用完', closed: '发码者已关闭', paused: '已暂停', missing: '此浏览器没有领取凭证' };
function mealExpiryText(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time) || time <= 0) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(time);
}

function mealShowConfig(code, state, summary) {
  // 检查当前 draft 是否来自直连预设
  const directPreset = !code && apiPresets.find(p => p?.mealDirect && (draftMealDirectId ? p.mealDirectId === draftMealDirectId : !p.mealDirectId && p.url === apiUrlInput.value.trim() && p.key === apiKey.value.trim()));
  const locked = !!code || !!directPreset;
  const label = !code ? (directPreset ? '正在使用直连预设' : '') : state === 'active' ? '正在使用兑换码' : state === 'paused' ? '饭票已暂停' : '兑换码已失效';
  [apiUrlInput, apiKey].forEach(input => {
    input.disabled = locked;
    if (locked) input.placeholder = label;
    else input.placeholder = input.dataset.directPlaceholder;
  });
  eyeBtn.disabled = locked;
  document.getElementById('mealApiControls').hidden = !locked;
  if (directPreset) {
    const usage = typeof mealDirectGetUsage === 'function' ? mealDirectGetUsage(directPreset) : null;
    mealHelpers.textContent = '直连模式 · 聊天内容直接发给中转站' + (usage && usage.limit ? ' · 已用 ' + usage.used + '/' + usage.limit + ' 次' : '') + ' · ' + mealDirectExpiryPhrase(directPreset.mealDirectExpires);
    mealApiBalance.textContent = '';
  } else if (locked) {
    const until = mealExpiryText(summary && summary.expires);
    const expiry = until ? ' · 有效期至 ' + until : '';
    mealHelpers.textContent = summary && state === 'active'
      ? '食材来源（服务商） · ' + summary.provider + '　剩余 ' + Math.min(summary.personalRemaining, summary.remaining) + ' 次' + expiry
      : (mealStateLabel[state] || '') + expiry;
  }
  mealApiBalance.textContent = locked && state === 'active' ? mealBalanceText(summary) : '';
}
function mealCheckConfig(code) {
  const saved = mealActiveCredential(code);
  const state = saved && saved.expires <= Date.now() && saved.state === 'active' ? 'expired' : saved?.state;
  mealShowConfig(code, state || 'missing', saved);
  if (!saved || !mealBase) return;
  mealRequest('/status', {}, code + '.' + saved.token).then(summary => {
    const claim = mealRemember('mphoneMealClaim:' + code, Object.assign(summary, { token: saved.token }));
    if (draftMealCode === code) mealShowConfig(code, claim.state, claim);
  }).catch(error => {
    if (error.status !== 410 && error.status !== 403) return;
    const claim = mealRemember('mphoneMealClaim:' + code, Object.assign(saved, { state: 'expired' }));
    if (draftMealCode === code) mealShowConfig(code, claim.state, claim);
  });
}
async function mealBrowserToken(code) {
  let seed = mealRemember(mealIdentityKey);
  if (!mealTokenPattern.test(seed)) {
    seed = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
    mealRemember(mealIdentityKey, seed);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + '.' + seed));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
function mealSetNotice(text) {
  mealNotice.textContent = text;
}
function mealBusy(button, operation) {
  if (button.disabled) return;
  button.disabled = true;
  mealSetNotice('');
  Promise.resolve().then(operation).catch(error => mealSetNotice(error.message || '操作失败，请稍后再试。'))
    .finally(() => { button.disabled = false; });
}

function mealOpenModels(open) {
  mealModelDrawer.hidden = !open;
  mealModelToggle.setAttribute('aria-expanded', String(open));
}
mealModelToggle.addEventListener('click', () => mealOpenModels(mealModelDrawer.hidden));
mealModelDrawer.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  mealOpenModels(false);
  mealModelToggle.focus();
});
function mealUpdateModelSelection() {
  const choices = [...mealModels.querySelectorAll('input[type=checkbox]')];
  const selected = choices.filter(input => input.checked).length;
  mealModelToggle.disabled = !choices.length;
  mealModelSummary.textContent = choices.length ? '已选 ' + selected + ' / ' + choices.length + ' 个模型' : '选择模型';
  mealSelectAllModels.hidden = !choices.length;
  mealSelectAllModels.textContent = choices.every(input => input.checked) ? '取消全选' : '全选';
}
mealModels.addEventListener('change', mealUpdateModelSelection);
mealSelectAllModels.addEventListener('click', () => {
  const choices = [...mealModels.querySelectorAll('input[type=checkbox]')];
  const select = choices.some(input => !input.checked);
  choices.forEach(input => { input.checked = select; });
  mealUpdateModelSelection();
});
function mealFillModels(ids, selected) {
  mealModels.replaceChildren();
  [...new Set(ids.filter(Boolean))].forEach(id => {
    const field = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = id === selected;
    field.append(checkbox, document.createTextNode(' ' + id));
    mealModels.append(field);
  });
  mealUpdateModelSelection();
  mealOpenModels(mealModels.childElementCount > 0);
}
[mealIssueAddress, mealIssueKey].forEach(input => {
  input.addEventListener('input', () => {
    mealIssuerRequest++;
    queueMealQuota();
    mealSource.textContent = '';
    mealFillModels([]);
  });
});
document.getElementById('mealLoadModels').addEventListener('click', event => {
  const address = mealIssueAddress.value.trim().replace(/\/+$/, '');
  const key = mealIssueKey.value.trim();
  const request = ++mealIssuerRequest;
  mealBusy(event.currentTarget, async () => {
    if (!address || !key) { mealSource.textContent = '请填写接口地址和 API Key。'; return; }
    if (!mealIssueAddress.checkValidity() || !/^https:\/\//i.test(address)) {
      mealSource.textContent = '请填写以 HTTPS 开头的有效接口地址。';
      return;
    }
    mealSource.textContent = '正在获取模型…';
    try {
      const ids = await llmListModels(address, key);
      if (request !== mealIssuerRequest) return;
      mealFillModels(ids, ids.length === 1 ? ids[0] : '');
      mealSource.textContent = ids.length ? '已获取 ' + ids.length + ' 个模型，可以多选。' : '服务商没有返回可用模型。';
    } catch (_) {
      if (request === mealIssuerRequest) mealSource.textContent = '获取模型失败，请检查接口地址、Key 和网络。';
    }
  });
});

function queueMealQuota() {
  clearTimeout(mealQuotaTimer);
  const request = ++mealQuotaRequest;
  mealQuotaResult.textContent = '';
  const address = mealIssueAddress.value.trim().replace(/\/+$/, '');
  const key = mealIssueKey.value.trim();
  if (!key || !/^https:\/\//i.test(address) || !mealIssueAddress.checkValidity()) return;
  mealQuotaTimer = setTimeout(async () => {
    mealQuotaResult.textContent = '正在读取站内额度…';
    try {
      const result = await mealRequest('/quota', { address, key });
      if (request !== mealQuotaRequest) return;
      mealQuotaResult.textContent = result.unlimited ? '这把 Key 未设额度上限。' :
        '这把 Key 的剩余额度 · ' + new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 12 }).format(result.available) + ' ' + result.unit;
    } catch (error) {
      if (request === mealQuotaRequest) mealQuotaResult.textContent = error.message;
    }
  }, 700);
}

mealIssueForm.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(mealIssueForm);
  const models = [...mealModels.querySelectorAll('input:checked')].map(input => input.value);
  const address = mealIssueAddress.value.trim().replace(/\/+$/, '');
  const key = mealIssueKey.value.trim();
  mealBusy(event.submitter, async () => {
    if (!address || !key || !models.length) throw new Error('请填写地址和 Key，获取模型后至少选一个。');
    if (models.length > 200) throw new Error('一张兑换码最多支持 200 个模型，请减少所选模型。');
    const source = await mealRequest('/source', { address });
    const made = await mealRequest('/create', {
      provider: source.id, address, key, models, name: String(fields.get('name') || '').trim(),
      portions: Number(fields.get('portions')), perPerson: Number(fields.get('perPerson')),
      total: Number(fields.get('total')), days: Number(fields.get('days'))
    });
    const owned = mealRemember('mphoneMealOwned') || [];
    mealRemember('mphoneMealOwned', [{ ...made, total: made.total ?? Number(fields.get('total')) }, ...owned]);
    if (!mealIssuePanel.hidden) {
      mealRenderOwned();
      mealSetNotice('兑换码已生成，复制后私下分享。');
    }
  });
});

function mealOwnedRow(pot, name, onRename, onDelete, shareText) {
  const row = document.createElement('div');
  row.className = 'meal-owned';
  const head = document.createElement('div');
  head.className = 'meal-owned-head';
  const title = document.createElement('strong');
  title.className = 'meal-owned-name';
  title.textContent = title.title = mealPresetTitle(pot);
  function button(label) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'action-btn btn-apply';
    item.textContent = label;
    return item;
  }
  const edit = button('编辑');
  const remove = button('删除');
  const copy = button('复制');
  head.append(title, edit, remove, copy);
  const code = document.createElement('code');
  code.textContent = pot.code.slice(0, 6) + '…' + pot.code.slice(-4);
  row.append(head, code);
  copy.addEventListener('click', () => mealBusy(copy, async () => {
    await navigator.clipboard.writeText(shareText());
    mealSetNotice('已复制饭票和使用说明。');
  }));
  remove.addEventListener('click', () => onDelete(remove));
  edit.addEventListener('click', () => {
    const form = document.createElement('form');
    form.className = 'meal-owned-edit';
    const input = document.createElement('input');
    input.className = 'field-input';
    input.setAttribute('aria-label', '饭票名称');
    input.maxLength = 40;
    input.required = true;
    input.value = name;
    const cancel = button('取消');
    const save = button('保存');
    save.type = 'submit';
    form.append(input, cancel, save);
    head.replaceWith(form);
    input.focus();
    input.select();
    cancel.addEventListener('click', () => { form.replaceWith(head); edit.focus(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      mealBusy(save, async () => {
        const next = input.value.trim();
        if (!next) { input.focus(); throw new Error('请输入饭票名称。'); }
        await onRename(next);
      });
    });
  });
  return row;
}

function mealRenderOwned() {
  mealIssued.replaceChildren();
  const owned = mealRemember('mphoneMealOwned') || [];
  if (!owned.length) {
    const empty = document.createElement('div');
    empty.className = 'auto-hint';
    empty.textContent = '生成后的兑换码会显示在这里。';
    mealIssued.append(empty);
  }
  owned.forEach(pot => {
    const auth = pot.code + '.' + pot.owner;
    const removeRecord = () => {
      const items = mealRemember('mphoneMealOwned') || [];
      mealRemember('mphoneMealOwned', items.filter(item => item.code !== pot.code));
      mealRenderOwned();
    };
    let state = pot.state;
    let statusChanged = false;
    const row = mealOwnedRow(pot, pot.name || pot.provider, async name => {
      try { update(await mealRequest('/rename', { name }, auth)); }
      catch (error) {
        if (error.status !== 410) throw error;
        update({ ...pot, name, state: 'expired' });
      }
      mealRenderOwned();
    }, button => {
      const manageable = !state || state === 'active' || state === 'paused';
      openConfirm('删除这张饭票的记录？', removeRecord, {
        desc: manageable ? '只删除记录会保留当前启用状态，同时移除本机的管理入口。' : '这张饭票的记录会从本机移除。',
        okText: '只删记录',
        ...(manageable ? { alt: '作废并删除', onAlt: () => mealBusy(button, async () => {
          try { await mealRequest('/close', {}, auth); }
          catch (error) { if (error.status !== 410) throw error; }
          removeRecord();
        }) } : {})
      });
    }, () => '🍲 眠花糖机大锅饭兑换码：' + pot.code + '\n' + mealPresetTitle(pot) + '\n' + mealShareNote);
    const status = document.createElement('div');
    status.className = 'auto-hint';
    const footer = document.createElement('div');
    footer.className = 'meal-owned-status';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'action-btn btn-apply';
    toggle.hidden = true;
    toggle.addEventListener('click', () => mealBusy(toggle, async () => {
      const enabled = state === 'paused';
      const summary = await mealRequest('/enabled', { enabled }, auth);
      statusChanged = true;
      update(summary);
      if (summary.state === 'active' || summary.state === 'paused') {
        const claim = mealActiveCredential(pot.code);
        if (claim) {
          const state = enabled && claim.personalRemaining <= 0 ? 'spent' : summary.state;
          const updated = mealRemember('mphoneMealClaim:' + pot.code, { ...claim, ...summary, state });
          if (draftMealCode === pot.code) mealShowConfig(pot.code, state, updated);
        }
      }
      mealSetNotice(enabled ? '饭票已启用。' : '饭票已暂停。');
    }));
    footer.append(status, toggle);
    function render(summary) {
      const total = summary.total;
      const usage = Number.isInteger(total) ? '总请求上限 ' + total + ' 次 · 已用 ' + (total - summary.remaining) + ' 次 · ' : '';
      const expiry = mealExpiryText(summary.expires);
      status.textContent = '已领 ' + summary.claimed + '/' + summary.portions + ' 份 · 每份 ' + summary.perPerson + ' 次 · ' +
        usage + '剩余 ' + summary.remaining + ' 次' +
        (expiry ? ' · 有效期至 ' + expiry : '') +
        (mealStateLabel[summary.state] ? ' · ' + mealStateLabel[summary.state] : '') +
        (summary.sharedBalance && summary.state === 'active' ? ' · ' + mealBalanceText(summary) : '');
      state = summary.state;
      toggle.hidden = state !== 'paused' && state !== 'active';
      toggle.textContent = state === 'paused' ? '启用' : '关闭';
      toggle.setAttribute('aria-label', toggle.textContent + '饭票');
    }
    function update(summary) {
      render(summary);
      const items = mealRemember('mphoneMealOwned') || [];
      mealRemember('mphoneMealOwned', items.map(item => item.code === pot.code ? { ...item, ...summary } : item));
    }
    if (Number.isInteger(pot.claimed)) render(pot);
    else status.textContent = '正在读取用量…';
    row.append(footer);
    mealIssued.append(row);
    if (mealBase && pot.state !== 'closed') mealRequest('/owner', {}, auth).then(summary => {
      if (row.isConnected && !statusChanged) update(summary);
    }).catch(error => {
      if (!row.isConnected || statusChanged) return;
      if (error.status === 410) {
        state = 'expired';
        toggle.hidden = true;
        const expiry = mealExpiryText(pot.expires);
        status.textContent = '已到期' + (expiry ? ' · 有效期至 ' + expiry : '');
      }
      else if (!Number.isInteger(pot.claimed)) status.textContent = '暂时读不到用量。';
    });
  });
}

function mealResetInspection() {
  clearTimeout(mealInspectTimer);
  mealInspectRequest++;
  mealInspectButton.disabled = false;
  mealInspectedCode = '';
  mealClaimReview.hidden = true;
  mealClaimReview.replaceChildren();
  mealClaimNotice.textContent = '';
}
mealCodeInput.addEventListener('input', () => {
  mealResetInspection();
  const code = mealReadCode();
  if (mealCodePattern.test(code) || mealIsDirectCode(code)) mealInspectTimer = setTimeout(mealInspect, 300);
});
mealClaimForm.addEventListener('submit', event => {
  event.preventDefault();
  mealInspect();
});
async function mealInspect() {
  mealResetInspection();
  const code = mealReadCode();
  // 直连码走单独的领取流程
  if (mealIsDirectCode(code)) {
    await mealInspectDirectCode(code, mealInspectRequest);
    return;
  }
  if (!mealCodePattern.test(code)) {
    mealClaimNotice.textContent = '请粘贴完整的兑换码或分享文字。';
    return;
  }
  const request = mealInspectRequest;
  const signal = new AbortController();
  const timeout = setTimeout(() => signal.abort(), 12000);
  mealInspectButton.disabled = true;
  mealClaimNotice.textContent = '正在查询兑换码…';
  try {
    const summary = await mealRequest('/inspect', { code }, undefined, signal.signal);
    if (request !== mealInspectRequest || mealReadCode() !== code) return;
    mealClaimNotice.textContent = '';
    const existing = mealActiveCredential(code);
    mealClaimReview.replaceChildren();
    mealClaimReview.hidden = false;
    const title = document.createElement('strong');
    title.textContent = mealPresetTitle(summary);
    const facts = document.createElement('dl');
    facts.className = 'meal-claim-facts';
    const expiry = mealExpiryText(summary.expires) || '未提供';
    [['食材来源（服务商）', summary.provider], ['每份请求上限', summary.perPerson + ' 次'], ['有效期至', expiry]].forEach(([label, value]) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      facts.append(term, detail);
    });

    const models = document.createElement('details');
    models.className = 'setting-fold meal-claim-models';
    const modelHeading = document.createElement('summary');
    modelHeading.textContent = '可用模型（' + summary.models.length + '）';
    const modelList = document.createElement('ul');
    summary.models.forEach(id => {
      const item = document.createElement('li');
      item.textContent = id;
      modelList.append(item);
    });
    models.append(modelHeading, modelList);

    const privacy = document.createElement('p');
    privacy.className = 'auto-hint meal-claim-note';
    privacy.textContent = (summary.sharedBalance ? '领取者共用站内余额，由服务商扣费。' : '') +
      '聊天内容和附件会经过大锅饭后台和服务商。';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'action-btn btn-apply';
    confirm.textContent = existing ? '打开已领取预设' : '领取并保存预设';
    confirm.disabled = summary.state !== 'active' || (!existing && summary.claimed >= summary.portions);
    if (confirm.disabled) mealClaimNotice.textContent = mealStateLabel[summary.state] || '领取名额已满。';
    mealInspectedCode = code;
    confirm.addEventListener('click', () => mealBusy(confirm, async () => {
      try {
        if (mealInspectedCode !== code) return;
        mealClaimNotice.textContent = '正在领取…';
        const token = await mealBrowserToken(code);
        const grant = await mealRequest('/claim', { code, browser: token });
        mealRemember('mphoneMealClaim:' + code, Object.assign(grant, { token }));
        let index = apiPresets.findIndex(preset => preset?.mealCode === code);
        if (index < 0) {
          const baseName = mealPresetTitle(grant);
          let name = baseName;
          let suffix = 2;
          while (apiPresets.some(preset => preset?.name === name)) name = baseName + ' ' + suffix++;
          index = apiPresets.push({ name, mealCode: code, url: '', key: '', model: grant.models[0], temp: '0.80' }) - 1;
          saveApiPresets(index);
        }
        setDraftApiConfig(presetApiConfig(apiPresets[index]));
        renderApiPresets(index);
        mealClaimNotice.textContent = '已保存大锅饭预设。在上方点「应用为默认」即可使用。';
        confirm.textContent = '打开已领取预设';
      } catch (error) {
        if (mealInspectedCode === code) mealClaimNotice.textContent = error.message || '领取失败，请重试。';
      }
    }));
    mealClaimReview.append(title, facts, models, privacy, confirm);
  } catch (error) {
    if (request === mealInspectRequest) mealClaimNotice.textContent = error.status ? error.message : '暂时查不到兑换码，请点「查询兑换码」重试。';
  } finally {
    clearTimeout(timeout);
    if (request === mealInspectRequest) mealInspectButton.disabled = false;
  }
}

function mealResetIssueDraft() {
  mealIssueForm.reset();
  mealIssueKey.dispatchEvent(new Event('input'));
}
function mealLeaveIssuePanel() {
  if (mealIssuePanel.hidden) return;
  mealResetIssueDraft();
  mealIssuePanel.hidden = true;
  mealDraftBlocks.querySelector('[aria-controls="mealIssuePanel"]').setAttribute('aria-expanded', 'false');
  mealPrivacy.hidden = true;
  mealPrivacy.open = false;
  mealSetNotice('');
}
backBtn.addEventListener('click', mealLeaveIssuePanel);
document.querySelectorAll('#settingsSubnav .settings-subnav-item:not([data-stab="main-api"])').forEach(tab => {
  tab.addEventListener('click', mealLeaveIssuePanel);
});

mealDraftBlocks.querySelectorAll('[data-meal-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const open = panel.hidden;
    if (!mealIssuePanel.hidden && !(panel === mealIssuePanel && open)) mealResetIssueDraft();
    mealDraftBlocks.querySelectorAll('[data-meal-toggle]').forEach(tab => {
      const target = document.getElementById(tab.getAttribute('aria-controls'));
      target.hidden = !(target === panel && open);
      tab.setAttribute('aria-expanded', String(!target.hidden));
    });
    mealPrivacy.hidden = !open;
    if (!open) mealPrivacy.open = false;
    mealSetNotice(open && !mealBase && panel === mealIssuePanel ? '醞酿中，兑换服务尚未配置。' : '');
    if (open && panel.contains(mealIssueForm)) mealRenderOwned();
    if (open && panel.id === 'mealDirectPanel') mealDirectRenderOwned();
  });
});
[apiUrlInput, apiKey].forEach(input => { input.dataset.directPlaceholder = input.placeholder; });

// =============================================
// 直连放饭：生成、领取、本地计次
// =============================================

const mealDirectForm = document.getElementById('mealDirectForm');
const mealDirectPanel = document.getElementById('mealDirectPanel');
const mealDirectAddress = document.getElementById('mealDirectAddress');
const mealDirectKey = document.getElementById('mealDirectKey');
const mealDirectModels = document.getElementById('mealDirectModels');
const mealDirectModelToggle = document.getElementById('mealDirectModelToggle');
const mealDirectModelDrawer = document.getElementById('mealDirectModelDrawer');
const mealDirectModelSummary = document.getElementById('mealDirectModelSummary');
const mealDirectSelectAll = document.getElementById('mealDirectSelectAll');
const mealDirectSource = document.getElementById('mealDirectSource');
const mealDirectIssued = document.getElementById('mealDirectIssued');
let mealDirectIssuerRequest = 0;

// 直连放饭 — 模型选择器
function mealDirectOpenModels(open) {
  mealDirectModelDrawer.hidden = !open;
  mealDirectModelToggle.setAttribute('aria-expanded', String(open));
}
mealDirectModelToggle.addEventListener('click', () => mealDirectOpenModels(mealDirectModelDrawer.hidden));
mealDirectModelDrawer.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  mealDirectOpenModels(false);
  mealDirectModelToggle.focus();
});
function mealDirectUpdateModelSelection() {
  const choices = [...mealDirectModels.querySelectorAll('input[type=checkbox]')];
  const selected = choices.filter(input => input.checked).length;
  mealDirectModelToggle.disabled = !choices.length;
  mealDirectModelSummary.textContent = choices.length ? '已选 ' + selected + ' / ' + choices.length + ' 个模型' : '选择模型';
  mealDirectSelectAll.hidden = !choices.length;
  mealDirectSelectAll.textContent = choices.every(input => input.checked) ? '取消全选' : '全选';
}
mealDirectModels.addEventListener('change', mealDirectUpdateModelSelection);
mealDirectSelectAll.addEventListener('click', () => {
  const choices = [...mealDirectModels.querySelectorAll('input[type=checkbox]')];
  const select = choices.some(input => !input.checked);
  choices.forEach(input => { input.checked = select; });
  mealDirectUpdateModelSelection();
});
function mealDirectFillModels(ids, selected) {
  mealDirectModels.replaceChildren();
  [...new Set(ids.filter(Boolean))].forEach(id => {
    const field = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = id === selected;
    field.append(checkbox, document.createTextNode(' ' + id));
    mealDirectModels.append(field);
  });
  mealDirectUpdateModelSelection();
  mealDirectOpenModels(mealDirectModels.childElementCount > 0);
}

[mealDirectAddress, mealDirectKey].forEach(input => {
  input.addEventListener('input', () => {
    mealDirectIssuerRequest++;
    mealDirectSource.textContent = '';
    mealDirectFillModels([]);
  });
});

// 直连放饭 — 生成直连码
mealDirectForm.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(mealDirectForm);
  const models = [...mealDirectModels.querySelectorAll('input:checked')].map(input => input.value);
  const address = mealDirectAddress.value.trim().replace(/\/+$/, '');
  const key = mealDirectKey.value.trim();
  const name = document.getElementById('mealDirectName').value.trim();
    const perPerson = Number(fields.get('perPerson'));
    mealBusy(event.submitter, async () => {
    const expires = mealDirectParseExpiry(fields.get('expiry'));
    if (!address || !key || !models.length) throw new Error('请填写地址和 Key，获取模型后至少选一个。');
    if (models.length > 200) throw new Error('一张直连码最多支持 200 个模型，请减少所选模型。');
    const payload = { id: crypto.randomUUID(), name, url: address, key, models, perPerson, expires };
    const encoded = await mealDirectEncode(payload);
    const owned = mealRemember('mphoneMealDirectOwned') || [];
    const displayName = name || address.replace(/^https?:\/\//, '').split('/')[0];
    owned.unshift({ code: encoded, name: displayName, models, perPerson, expires, createdAt: Date.now() });
    mealRemember('mphoneMealDirectOwned', owned);
    if (!mealDirectPanel.hidden) {
      mealDirectRenderOwned();
      mealSetNotice('直连码已生成，复制后私下分享。');
    }
  });
});

// 直连放饭 — 渲染已发列表
function mealDirectRenderOwned() {
  mealDirectIssued.replaceChildren();
  const owned = mealRemember('mphoneMealDirectOwned') || [];
  if (!owned.length) {
    const empty = document.createElement('div');
    empty.className = 'auto-hint';
    empty.textContent = '生成后的直连码会显示在这里。';
    mealDirectIssued.append(empty);
    return;
  }
  owned.forEach(pot => {
    const row = mealOwnedRow(pot, pot.name, name => {
      const list = mealRemember('mphoneMealDirectOwned') || [];
      mealRemember('mphoneMealDirectOwned', list.map(item => item.code === pot.code ? { ...item, name } : item));
      mealDirectRenderOwned();
    }, () => openConfirm('删除这张饭票的记录？', () => {
      const list = mealRemember('mphoneMealDirectOwned') || [];
      mealRemember('mphoneMealDirectOwned', list.filter(item => item.code !== pot.code));
      mealDirectRenderOwned();
    }, { desc: '已分享的直连饭票仍可用。' }),
    () => '🍙 眠花糖机大锅饭直连码：' + pot.code + '\n' + mealPresetTitle(pot) + '\n' + mealDirectShareNote);
    const info = document.createElement('div');
    info.className = 'auto-hint';
    info.textContent = pot.models.length + ' 个模型 · 每人 ' + pot.perPerson + ' 次 · ' + mealDirectExpiryPhrase(pot.expires);
    const footer = document.createElement('div');
    footer.className = 'meal-owned-status';
    const editTime = document.createElement('button');
    editTime.type = 'button';
    editTime.className = 'action-btn btn-apply';
    editTime.textContent = '改时间';
    editTime.addEventListener('click', () => {
      const form = document.createElement('form');
      form.className = 'meal-owned-edit';
      const input = document.createElement('input');
      input.className = 'field-input';
      input.setAttribute('aria-label', '有效期');
      input.placeholder = '25-02-14 23:59，或不限时，仅作备注';
      input.value = mealDirectExpiryInputValue(pot.expires);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'action-btn btn-apply';
      cancel.textContent = '取消';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'action-btn btn-apply';
      save.textContent = '保存';
      form.append(input, cancel, save);
      footer.replaceWith(form);
      input.focus();
      cancel.addEventListener('click', () => { form.replaceWith(footer); editTime.focus(); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        mealBusy(save, async () => {
          const next = mealDirectParseExpiry(input.value);
          const payload = await mealDirectDecode(pot.code);
          if (!payload?.url || !payload.key) throw new Error('这张直连码读不出来，改不了时间。');
          payload.expires = next;
          const encoded = await mealDirectEncode(payload);
          const list = mealRemember('mphoneMealDirectOwned') || [];
          mealRemember('mphoneMealDirectOwned', list.map(item => item.code === pot.code ? { ...item, code: encoded, expires: next } : item));
          mealDirectRenderOwned();
          mealSetNotice('时间已记下。已经复制出去的旧码不会变，要对方也看到就再复制一次。');
        });
      });
    });
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'action-btn btn-apply';
    manage.textContent = '启用／关闭';
    manage.addEventListener('click', () => openConfirm('在服务商官网管理直连饭票', null, {
      desc: '进入服务商的 API 密钥管理，启用或停用这张饭票使用的 Key。同一把 Key 发出的其他直连饭票也会一起受影响。',
      okText: '知道了'
    }));
    footer.append(info, editTime, manage);
    row.append(footer);
    mealDirectIssued.append(row);
  });
}
// 直连码领取 — 在吃饭面板里识别并显示信息
async function mealInspectDirectCode(code, request) {
  const payload = await mealDirectDecode(code);
  let address;
  try { address = new URL(payload?.url); } catch (_) {}
  if (address?.protocol !== 'https:' || address.username || address.password || address.search || address.hash ||
      typeof payload.key !== 'string' || !payload.key.trim() || payload.key.length > 1024 ||
      !Array.isArray(payload.models) || !payload.models.length || payload.models.length > 200 ||
      payload.models.some(model => typeof model !== 'string' || !model.trim()) ||
      !Number.isInteger(payload.perPerson) || payload.perPerson < 1 || payload.perPerson > 10000) {
    mealClaimNotice.textContent = '直连码格式不正确或已损坏。';
    return;
  }
  let directId;
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(await mealDirectEncode(payload)));
    directId = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    if (request === mealInspectRequest) mealClaimNotice.textContent = '此浏览器暂时无法读取直连码。';
    return;
  }
  if (request !== mealInspectRequest) return;
  mealClaimNotice.textContent = '';
  mealClaimReview.replaceChildren();
  mealClaimReview.hidden = false;

  const title = document.createElement('strong');
  title.textContent = '🍽️大锅饭 · ' + (payload.name || '直连');
  const badge = document.createElement('span');
  badge.className = 'auto-hint';
  badge.textContent = ' （直连模式）';
  title.append(badge);

  const facts = document.createElement('dl');
  facts.className = 'meal-claim-facts';
  const provider = payload.url.replace(/^https?:\/\//, '').split('/')[0];
  const expiryText = mealDirectExpiryPhrase(payload.expires);
  [['接口地址', provider], ['每人请求上限', (payload.perPerson || '不限') + ' 次（本地计数）'], ['有效期', expiryText.startsWith('有效期至 ') ? expiryText.slice(5) : expiryText]].forEach(([label, value]) => {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    facts.append(term, detail);
  });

  const models = document.createElement('details');
  models.className = 'setting-fold meal-claim-models';
  const modelHeading = document.createElement('summary');
  modelHeading.textContent = '可用模型（' + payload.models.length + '）';
  const modelList = document.createElement('ul');
  payload.models.forEach(id => {
    const item = document.createElement('li');
    item.textContent = id;
    modelList.append(item);
  });
  models.append(modelHeading, modelList);

  const privacy = document.createElement('p');
  privacy.className = 'auto-hint meal-claim-note';
  privacy.textContent = '直连模式：聊天内容直接发给中转站，不经大锅饭后台。次数由浏览器本地计数，清除浏览数据后重置。';

  // 检查是否已领取
  const existIdx = apiPresets.findIndex(p => p?.mealDirectId === directId);

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'action-btn btn-apply';
  confirm.textContent = existIdx >= 0 ? '打开已领取预设' : '领取并保存预设';
  mealInspectedCode = code;
  confirm.addEventListener('click', () => mealBusy(confirm, async () => {
    if (mealInspectedCode !== code) return;
    const existing = apiPresets.findIndex(p => p?.mealDirectId === directId);
    if (existing >= 0) {
      const preset = apiPresets[existing];
      if (payload.expires !== undefined && preset.mealDirectExpires !== payload.expires) {
        preset.mealDirectExpires = payload.expires;
        saveApiPresets(existing);
      }
      setDraftApiConfig(presetApiConfig(preset));
      renderApiPresets(existing);
      mealClaimNotice.textContent = '已切换到直连预设。在上方点「应用为默认」即可使用。';
      return;
    }
    const baseName = '🍽️大锅饭 · ' + (payload.name || '直连');
    let name = baseName;
    let suffix = 2;
    while (apiPresets.some(preset => preset?.name === name)) name = baseName + ' ' + suffix++;
    const index = apiPresets.push({
      name, url: payload.url, key: payload.key, model: payload.models[0], temp: '0.80',
      mealDirect: true, mealDirectId: directId, mealDirectLimit: payload.perPerson, mealDirectExpires: payload.expires
    }) - 1;
    saveApiPresets(index);
    setDraftApiConfig(presetApiConfig(apiPresets[index]));

    renderApiPresets(index);
    mealClaimNotice.textContent = '已保存直连预设。在上方点「应用为默认」即可使用。';
    confirm.textContent = '打开已领取预设';
  }));
  mealClaimReview.append(title, facts, models, privacy, confirm);
}


document.getElementById('mealDirectLoadModels').addEventListener('click', event => {
  const address = mealDirectAddress.value.trim().replace(/\/+$/, '');
  const key = mealDirectKey.value.trim();
  const request = ++mealDirectIssuerRequest;
  mealBusy(event.currentTarget, async () => {
    if (!address || !key) { mealDirectSource.textContent = '请填写接口地址和 API Key。'; return; }
    if (!mealDirectAddress.checkValidity() || !/^https:\/\//i.test(address)) {
      mealDirectSource.textContent = '请填写以 HTTPS 开头的有效接口地址。';
      return;
    }
    mealDirectSource.textContent = '正在获取模型…';
    try {
      const ids = await llmListModels(address, key);
      if (request !== mealDirectIssuerRequest) return;
      mealDirectFillModels(ids, ids.length === 1 ? ids[0] : '');
      mealDirectSource.textContent = ids.length ? '已获取 ' + ids.length + ' 个模型，可以多选。' : '服务商没有返回可用模型。';
    } catch (_) {
      if (request === mealDirectIssuerRequest) mealDirectSource.textContent = '获取模型失败，请检查接口地址、Key 和网络。';
    }
  });
});

// 每张直连码按完整内容的摘要计次，旧版预设沿用之前的计数。
function mealDirectGetUsage(preset) {
  if (!preset?.mealDirect) return null;
  const countKey = 'mphoneMealDirectCount:' + (preset.mealDirectId || preset.name);
  return { countKey, used: mealRemember(countKey) || 0, limit: preset.mealDirectLimit || 0 };
}
function mealDirectCheckLimit(preset) {
  const usage = mealDirectGetUsage(preset);
  if (!usage?.limit) return true;
  if (usage.used >= usage.limit) return false;
  mealRemember(usage.countKey, usage.used + 1);
  return true;
}
