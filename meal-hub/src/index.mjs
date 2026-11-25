const CODE = /^[a-f0-9]{32}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const DAY = 86400000;
const MAX_BODY = 16 * 1024 * 1024;
const encoder = new TextEncoder();

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
async function hash(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))),
    n => n.toString(16).padStart(2, '0')).join('');
}
async function storageKey(secret) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)),
    'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function protect(secret, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await storageKey(secret), encoder.encode(key));
  return { iv, ciphertext };
}
async function reveal(secret, saved) {
  const value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv }, await storageKey(secret), saved.ciphertext);
  return new TextDecoder().decode(value);
}
function fail(status, message) {
  return Response.json({ error: { message } }, { status });
}
function providerFor(env, id) {
  const entries = JSON.parse(env.MEAL_PROVIDERS || '{}');
  if (!Object.hasOwn(entries, id)) return null;
  const value = entries[id];
  const address = new URL(value.url);
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash) return null;
  return { name: value.name, url: address.href.replace(/\/+$/, '') };
}
function validCount(n, max) {
  return Number.isSafeInteger(n) && n >= 1 && n <= max;
}
async function readJson(request, limit) {
  const size = Number(request.headers.get('Content-Length'));
  if (size > limit || !request.body) throw new Error('bad request body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error('request body too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
function view(pot) {
  return {
    provider: pot.source, models: pot.models, expires: pot.expires, portions: pot.portions,
    perPerson: pot.perPerson, claimed: pot.claimed, total: pot.total, remaining: pot.remaining,
    state: pot.closed ? 'closed' : pot.expires <= Date.now() ? 'expired' : pot.remaining <= 0 ? 'spent' : 'active'
  };
}
function forClaim(pot, claim) {
  const result = view(pot);
  result.personalRemaining = claim.remaining;
  if (result.state === 'active' && claim.remaining <= 0) result.state = 'spent';
  return result;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.MEAL_ORIGIN) return fail(403, '该网页无法使用兑换服务');
    const cors = {
      'Access-Control-Allow-Origin': env.MEAL_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    };
    let response;
    try {
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env);
    } catch {
      response = fail(503, '兑换服务暂时不可用');
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  }
};

async function readProviderQuota(provider, key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 1024) return fail(400, '请填写 API Key');
  const base = new URL(provider.url).origin;
  const init = { redirect: 'manual', signal: AbortSignal.timeout(8000) };
  async function read(path, headers) {
    const response = await fetch(base + path, { ...init, headers });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('Location');
    const canonical = base + (path.endsWith('/') ? path.slice(0, -1) : path + '/');
    if (!location || new URL(location, base + path).href !== canonical) throw new Error('unexpected redirect');
    response.body?.cancel().catch(() => {});
    return fetch(canonical, { ...init, redirect: 'error', headers });
  }
  try {
    const [status, usage] = await Promise.all([
      read('/api/status'),
      read('/api/usage/token/', { Authorization: 'Bearer ' + key.trim() })
    ]);
    if ([401, 403].includes(usage.status)) return fail(401, '站点拒绝了额度查询，请核对 Key 或查询权限');
    if (!status.ok || !usage.ok) return fail(502, '站点没有返回可用的额度数据');
    const config = (await status.json()).data;
    const quota = (await usage.json()).data;
    if (quota?.object !== 'token_usage') return fail(502, '站点没有返回单把 Key 的额度');
    if (quota.unlimited_quota === true) return Response.json({ unlimited: true });
    if (!Number.isSafeInteger(quota.total_available)) return fail(502, '站点没有返回这把 Key 的余额');
    const units = { USD: ['$', 1], CNY: ['¥', config?.usd_exchange_rate],
      CUSTOM: [config?.custom_currency_symbol, config?.custom_currency_exchange_rate], TOKEN: ['额度点', config?.quota_per_unit] };
    const unit = Object.hasOwn(units, config?.quota_display_type) && units[config.quota_display_type];
    if (!unit || typeof unit[0] !== 'string' || !unit[0].trim() || unit[0].length > 20 ||
        !Number.isFinite(unit[1]) || unit[1] <= 0 ||
        !Number.isFinite(config.quota_per_unit) || config.quota_per_unit <= 0) {
      return fail(502, '站点额度单位未能识别');
    }
    const available = quota.total_available / config.quota_per_unit * unit[1];
    if (!Number.isFinite(available)) return fail(502, '站点返回的额度无效');
    return Response.json({ available, unit: unit[0] });
  } catch {
    return fail(502, '暂时无法读取站点额度，请稍后再试');
  }
}

async function route(request, env) {
  const path = new URL(request.url).pathname;
  const actions = {
    '/inspect': 'inspect', '/claim': 'claim', '/status': 'status', '/owner': 'owner',
    '/close': 'close', '/models': 'models', '/chat/completions': 'chat'
  };
  const verb = path === '/models' ? 'GET' : 'POST';
  if (request.method !== verb || (!['/create', '/source', '/quota'].includes(path) && !Object.hasOwn(actions, path))) return fail(404, '接口不存在');
  if (!env.MEAL_SECRET || env.MEAL_SECRET.length < 32) return fail(503, '醞酿中，兑换服务尚未配置');
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer /, '').split('.');
  let body;
  try {
    body = verb === 'GET' ? {} : await readJson(request, path === '/chat/completions' ? MAX_BODY : 16384);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad JSON');
  } catch {
    return fail(400, '请求内容无效或太大');
  }
  if (path === '/source' || path === '/quota') {
    const address = String(body.address || '').replace(/\/+$/, '');
    const id = Object.keys(JSON.parse(env.MEAL_PROVIDERS || '{}')).find(id => providerFor(env, id)?.url === address);
    if (!id) return fail(404, '这个接口暂未开放放饭');
    const provider = providerFor(env, id);
    if (path === '/quota') return readProviderQuota(provider, body.key);
    return Response.json({ id, name: provider.name });
  }
  if (path === '/create') {
    const provider = providerFor(env, String(body.provider || ''));
    const models = Array.isArray(body.models) ? [...new Set(body.models)] : [];
    if (!provider || typeof body.address !== 'string' || body.address.replace(/\/+$/, '') !== provider.url ||
        typeof body.key !== 'string' || !body.key.trim() || body.key.length > 1024 ||
        !models.length || models.length > 30 || models.some(model => typeof model !== 'string' || !model.trim() || model.length > 200) ||
        !validCount(body.portions, 1000) || !validCount(body.perPerson, 10000) ||
        !validCount(body.total, 100000) || !validCount(body.days, 30)) return fail(400, '请检查服务商、模型、额度和有效期');
    const code = randomHex(16);
    const owner = randomHex(32);
    const pot = {
      provider: body.provider, source: provider.name, models, key: await protect(env.MEAL_SECRET, body.key),
      owner: await hash(owner), expires: Date.now() + body.days * DAY, portions: body.portions,
      perPerson: body.perPerson, claimed: 0, total: body.total, remaining: body.total, closed: false
    };
    const response = await call(env, code, { action: 'create', pot });
    return response.ok ? Response.json({ code, owner, ...view(pot) }, { status: 201 }) : response;
  }
  const action = actions[path];
  const publicAction = action === 'inspect' || action === 'claim';
  const code = publicAction ? body.code : auth[0];
  const token = action === 'claim' ? body.browser : auth[1];
  if (!CODE.test(String(code)) || (action !== 'inspect' && !TOKEN.test(String(token)))) return fail(400, '兑换码或领取凭证无效');
  return call(env, code, { action, token, body: action === 'chat' ? body : undefined });
}
function call(env, code, data) {
  const object = env.MEALS.get(env.MEALS.idFromName(code));
  // Typed arrays and ciphertext are encoded only for the internal Worker-to-object request.
  const body = JSON.stringify(data, (_, value) =>
    ArrayBuffer.isView(value) || value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : value);
  return object.fetch('https://meal.internal/action', { method: 'POST', body });
}

export class Meal {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }
  async alarm() {
    await this.storage.deleteAll();
  }
  async fetch(request) {
    const { action, pot, token, body } = await request.json();
    if (action === 'create') {
      await this.storage.transaction(async tx => {
        if (await tx.get('pot')) throw new Error('collision');
        await tx.put('pot', pot);
        await tx.setAlarm(pot.expires);
      });
      return Response.json({});
    }
    const digest = token ? await hash(token) : '';
    const result = await this.storage.transaction(async tx => {
      const current = await tx.get('pot');
      if (!current) return fail(410, '兑换码已失效');
      const summary = view(current);
      if (action === 'inspect') return Response.json(summary);
      if (action === 'owner' || action === 'close') {
        if (digest !== current.owner) return fail(403, '管理凭证无效');
        if (action === 'close') {
          current.closed = true;
          delete current.key;
          await tx.put('pot', current);
        }
        return Response.json(view(current));
      }
      const claimKey = 'claim:' + digest;
      let claim = await tx.get(claimKey);
      if (action === 'claim' && !claim) {
        if (summary.state !== 'active') return fail(410, '兑换码已失效');
        if (current.claimed >= current.portions) return fail(409, '领取名额已满');
        claim = { remaining: current.perPerson };
        current.claimed++;
        await tx.put(claimKey, claim);
        await tx.put('pot', current);
      }
      if (!claim) return fail(403, '请先领取兑换码');
      if (action === 'claim' || action === 'status') return Response.json(forClaim(current, claim));
      if (summary.state !== 'active' || claim.remaining <= 0) return fail(410, '兑换码已失效');
      if (action === 'models') return Response.json({ data: current.models.map(id => ({ id })) });
      if (!current.models.includes(body.model) || !Array.isArray(body.messages) || !body.messages.length) return fail(400, '模型或聊天内容无效');
      const provider = providerFor(this.env, current.provider);
      if (!provider) return fail(503, '服务商暂时不可用');
      const upstreamKey = await reveal(this.env.MEAL_SECRET, {
        iv: Uint8Array.from(current.key.iv), ciphertext: Uint8Array.from(current.key.ciphertext)
      });
      const now = Date.now();
      if (now - (claim.lastRequest || 0) < 800) return fail(429, '发送太快，请稍后再试');
      claim.lastRequest = now;
      claim.remaining--;
      current.remaining--;
      if (current.remaining === 0) delete current.key;
      await tx.put(claimKey, claim);
      await tx.put('pot', current);
      return { url: provider.url, key: upstreamKey };
    });
    if (result instanceof Response) return result;
    try {
      const fields = ['model', 'messages', 'stream', 'temperature', 'reasoning_effort', 'tools', 'tool_choice', 'max_tokens', 'max_completion_tokens'];
      const payload = Object.fromEntries(fields.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
      const response = await fetch(result.url + '/chat/completions', {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + result.key },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        // Do not expose arbitrary upstream errors, which can contain request details or credentials.
        const message = response.status === 429 ? '食材来源限流，本次已计次' : '食材来源未能处理本次请求，本次已计次';
        await response.body?.cancel().catch(() => {});
        return fail(response.status, message);
      }
      return new Response(response.body, {
        headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' }
      });
    } catch {
      return fail(502, '连接食材来源失败，本次已计次');
    }
  }
}
