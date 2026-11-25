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

function mealReadCode() {
  const text = mealCodeInput.value.trim().toLowerCase();
  const shared = text.match(/^🍲 眠花糖机大锅饭兑换码[：:]\s*([a-f0-9]{32})(?=\s|使用这张码时|$)/u);
  return shared ? shared[1] : text;
}
const mealClaimReview = document.getElementById('mealClaimReview');
const mealIssued = document.getElementById('mealIssued');
const mealHelpers = document.getElementById('mealApiHint');
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
const mealStateLabel = { expired: '已到期', spent: '次数已用完', closed: '发码者已关闭', missing: '此浏览器没有领取凭证' };

function mealShowConfig(code, state, summary) {
  const locked = !!code;
  const label = !locked ? '' : state === 'active' ? '正在使用兑换码' : '兑换码已失效';
  [apiUrlInput, apiKey].forEach(input => {
    input.disabled = locked;
    if (locked) input.placeholder = label;
    else input.placeholder = input.dataset.directPlaceholder;
  });
  eyeBtn.disabled = locked;
  document.getElementById('mealApiControls').hidden = !locked;
  if (locked) mealHelpers.textContent = summary && state === 'active'
    ? '食材来源（服务商） · ' + summary.provider + '　剩余 ' + Math.min(summary.personalRemaining, summary.remaining) + ' 次' + (summary.sharedBalance ? ' · ' + mealBalanceText(summary) : '')
    : mealStateLabel[state] || '';
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
      provider: source.id, address, key, models,
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
    const row = document.createElement('div');
    row.className = 'meal-owned';
    const title = document.createElement('div');
    title.textContent = pot.provider;
    const code = document.createElement('code');
    code.textContent = pot.code;
    const status = document.createElement('div');
    status.className = 'auto-hint';
    const copy = document.createElement('button');
    const check = document.createElement('button');
    const close = document.createElement('button');
    [copy, check, close].forEach(button => { button.type = 'button'; button.className = 'action-btn btn-apply'; });
    copy.textContent = '复制码';
    check.textContent = '查用量';
    close.textContent = '关闭兑换';
    copy.addEventListener('click', () => mealBusy(copy, async () => {
      await navigator.clipboard.writeText('🍲 眠花糖机大锅饭兑换码：' + pot.code + '\n' + mealShareNote);
      mealSetNotice('已复制兑换码和使用说明。');
    }));
    function render(summary) {
      const total = summary.total;
      const usage = Number.isInteger(total) ? '总请求上限 ' + total + ' 次 · 已用 ' + (total - summary.remaining) + ' 次 · ' : '';
      status.textContent = '已领 ' + summary.claimed + '/' + summary.portions + ' 份 · 每份 ' + summary.perPerson + ' 次 · ' +
        usage + '剩余 ' + summary.remaining + ' 次' +
        (mealStateLabel[summary.state] ? ' · ' + mealStateLabel[summary.state] : '') +
        (summary.sharedBalance && summary.state === 'active' ? ' · ' + mealBalanceText(summary) : '');
      close.hidden = summary.state !== 'active';
    }
    function update(summary) {
      render(summary);
      const items = mealRemember('mphoneMealOwned') || [];
      mealRemember('mphoneMealOwned', items.map(item => item.code === pot.code ? { ...item, ...summary } : item));
    }
    if (Number.isInteger(pot.claimed)) render(pot);
    else status.textContent = '点「查用量」获取领取和使用记录。';
    check.addEventListener('click', () => mealBusy(check, async () => update(await mealRequest('/owner', {}, pot.code + '.' + pot.owner))));
    close.addEventListener('click', () => openConfirm('关闭后，已领取的测试预设也会失效。确认关闭？', () => {
      mealBusy(close, async () => update(await mealRequest('/close', {}, pot.code + '.' + pot.owner)));
    }));
    row.append(title, code, status, copy, check, close);
    mealIssued.append(row);
    if (mealBase && pot.state !== 'closed') mealRequest('/owner', {}, pot.code + '.' + pot.owner).then(update).catch(() => {});
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
  if (mealCodePattern.test(mealReadCode())) mealInspectTimer = setTimeout(mealInspect, 300);
});
mealClaimForm.addEventListener('submit', event => {
  event.preventDefault();
  mealInspect();
});
async function mealInspect() {
  mealResetInspection();
  const code = mealReadCode();
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
    const description = document.createElement('div');
    const models = document.createElement('div');
    const privacy = document.createElement('div');
    const confirm = document.createElement('button');
    description.textContent = '食材来源（服务商） · ' + summary.provider +
      '　每份最多 ' + summary.perPerson + ' 次请求　' + new Date(summary.expires).toLocaleString() + ' 到期' +
      (summary.sharedBalance ? '。所有领取者共用同一份站内余额，由站点扣费。' : '');
    models.textContent = '模型 · ' + summary.models.join(' / ');
    privacy.className = 'auto-hint';
    privacy.textContent = '使用时，聊天上下文及随请求发送的图片或语音会经过兑换后台，再发给这家服务商。';
    confirm.type = 'button';
    confirm.className = 'action-btn btn-apply';
    confirm.textContent = existing ? '打开已领取预设' : '领取并保存为测试 API 预设';
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
          const title = '测试 API · ' + grant.provider;
          let name = title;
          let suffix = 2;
          while (apiPresets.some(preset => preset?.name === name)) name = title + ' ' + suffix++;
          index = apiPresets.push({ name, mealCode: code, url: '', key: '', model: grant.models[0], temp: '0.80' }) - 1;
          saveApiPresets(index);
        }
        setDraftApiConfig(presetApiConfig(apiPresets[index]));
        renderApiPresets(index);
        mealClaimNotice.textContent = '已保存测试 API 预设。在上方点「应用当前配置」即可使用。';
        confirm.textContent = '打开已领取预设';
      } catch (error) {
        if (mealInspectedCode === code) mealClaimNotice.textContent = error.message || '领取失败，请重试。';
      }
    }));
    mealClaimReview.append(description, models, privacy, confirm);
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
    mealSetNotice(open && !mealBase ? '醞酿中，兑换服务尚未配置。' : '');
    if (open && panel.contains(mealIssueForm)) mealRenderOwned();
  });
});
document.getElementById('mealSwitchManual').addEventListener('click', () => {
  setDraftApiConfig(apiConfig('', '', '', tempSlider.value));
  renderApiPresets(-1);
});
[apiUrlInput, apiKey].forEach(input => { input.dataset.directPlaceholder = input.placeholder; });
