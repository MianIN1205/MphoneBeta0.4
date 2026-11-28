// 眠花糖机 — 拼发给 AI 的内容：按回合裁剪、回复格式、{{char}} / {{user}}、token 估算、聊天剧情互通、现实感知、buildMsgs、消息转成给 AI 的文字

// 按回合切分记录：一个回合 = 用户的一条或多条消息 + 之后角色的回复（开头若是角色消息，归入第一回合）
function splitRounds(hist) {
  var rounds = [], cur = null;
  hist.forEach(function(m) {
    if (m.role === 'user' && (!cur || cur.hasReply)) {
      cur = []; cur.hasReply = false; rounds.push(cur);
    } else if (!cur) {
      cur = []; cur.hasReply = false; rounds.push(cur);
    }
    if (m.role !== 'user') cur.hasReply = true;
    cur.push(m);
  });
  return rounds;
}

// 角色名下面那行小字：角色在聊天回复里写 <签名>…</签名> 就更新，没写过时用默认的
var CHAT_SUB_DEFAULT = '嗯嗯你说我在听';
function paintChatSubTitle(char) {
  if (char && char.isGroup && typeof groupMembers === 'function') { document.getElementById('chatRoomSubTitle').textContent = groupMembers(char).map(groupLabel).join('、'); return; }
  document.getElementById('chatRoomSubTitle').textContent = (char && char.headStatus) || CHAT_SUB_DEFAULT;
}

// 聊天回复的格式要求：语言 / 翻译 / 回复条数 / 状态栏（发消息和主动消息使用，动态不用）
function chatFormatRules(char) {
  if (char && char.isGroup && typeof groupFormatRules === 'function') return groupFormatRules(char);   // 群聊（js/chat/group.js）
  var c = Object.assign({}, DEFAULT_CHAT_CFG, char.chatCfg || {});
  var look = Object.assign({}, DEFAULT_LOOK, char.look || {});
  var rules = [];
  // 线上聊天的说话方式（系统提示里关于动作、心理描写的要求只用在剧情空间）
  // 用户要的是日常微信 / 短信那种：断句、短、一条一两句，不长篇大论
  // 分气泡交给小手机：TA 正常写带标点的句子，小手机在句末标点处分成一条条（reply.js 的 chatSplitLines）。以前让 TA 自己分条、又限字数，
  // TA 会从词中间截断（「拉严 / 实点」）或删掉标点粘成长条，用户反馈过
  var wechat = '现在是线上聊天：像平时发微信一样说话，口语、随意，多用短句，想说的多就多说几句，不写成大段的书面话。' +
    '每句话末尾照常写标点（句号、问号、感叹号、省略号都行），小手机会在每句话结束的地方把它分成一个个气泡，句尾的句号不会显示出来；' +
    '所以不用自己分条，也不要在一句话中间换行。' +
    '比如：在呢。刚下班，路上有点堵。你吃饭没？';
  if (c.actionOn) {
    // 打开了「线上动作描写」：动作、神态、心理、环境都写进 *星号*，显示成气泡外的灰色小字；气泡里只放说出口的话
    rules.push(wechat + '动作、神态、心理和环境的描写都写在 *星号* 里（比如 *盯着屏幕笑了一下*、*窗外在下雨*），它会显示成气泡外的灰色小字；' +
      '每处只写一小句，不要写成长段，气泡里只放你说出口的话。系统提示词和预设里关于描写的要求，就照这个方式放进灰色小字里；关于篇幅、推进剧情的要求只适用于剧情空间。');
  } else {
    rules.push(wechat + '只写你发出去的聊天内容，不写动作、神态、心理和环境描写，也不要用 *星号* 或括号写旁白。' +
      '系统提示词和预设里关于篇幅、描写、推进剧情的要求只适用于剧情空间，这里不用照做。');
  }
  if (c.voiceDesc) {
    rules.push('你的声音是：' + c.voiceDesc + '。说出口的句子顺着这个声音来，不要在话里解释自己的声音。');
  }
  if (c.lang && !/^(中文|汉语|简体中文|chinese)$/i.test(c.lang)) {
    rules.push('请使用' + c.lang + '回复。');
    if (c.translate) rules.push('每条消息的外语正文后另起一行，以「〔译〕」开头给出中文翻译。');
  }
  rules.push('本轮说出口的话写成 ' + (c.replyMin === c.replyMax ? c.replyMax : c.replyMin + '～' + c.replyMax) +
    ' 句，每两句之间写 |||。每句话只说一件事，别太长。想说的太多就挑重要的，别硬塞。动作写在 *星号* 内，不算句数。需要整段复制的长内容请用长文本或文件。');
  // 帮忙记提醒 / 闹钟 / 日程（见 js/chat/calendar.js）
  if (typeof CAL_RULE === 'string') rules.push(CAL_RULE);
  if (c.recallOn) {
    rules.push('你也可以像微信一样撤回自己刚发的消息：偶尔说漏嘴、发错或者害羞的时候，把那一条单独写成 <撤回>这条消息的内容</撤回>，' +
               '它会先发出去，过两秒变成「撤回了一条消息」，对方不一定看得到。很少用，不要每次都撤回。');
  }
  var mediaRule = '有时候想给对方看一张眼前的照片，才单独一行写 <照片>用一两句话描述画面</照片>。平时就用文字聊，不要为了发图而发。一轮里一两张就够，多数回合一张都不要。';
  if (c.voiceApi) {
    mediaRule = '有时候想说一句语音，或者想给对方看一张眼前的照片，才写。平时就用文字聊，不要每轮都用，一轮里语音和照片加起来最多两三条，多数回合一条都不要。' +
      '语音单独一行写 <语音>说出口的那句话</语音>，对方点气泡看字，点播放才出声。你有这个选择，不要说自己发不了，也不要写「（语音）」「[语音]」「发了条语音」来代替。' +
      '照片单独一行写 <照片>用一两句话描述画面</照片>。';
  }
  rules.push(mediaRule);
  // 星星瓶：偶尔悄悄叠一颗星星（js/desk/starjar.js），一天最多一颗
  if (typeof starRuleFor === 'function') { var starRule = starRuleFor(char); if (starRule) rules.push(starRule); }
  if (c.patOn) {
    rules.push('你也可以像微信一样拍一拍用户：想拍的时候在全部消息最后另起一行写 <拍一拍/>（偶尔用，不要每次都拍）。用户拍你时，记录里会出现「（用户拍了拍你…）」。');
  }
  rules.push('想玩的时候可以夹在聊天里：单独一行写 <骰子/>、<猜拳/> 或 <硬币/>，小手机会随机出结果。硬币只有 YES 和 NO。按自己的性子来，不是每次都玩。不要自己写掷出几点，也不要写自己出了石头、剪刀、布，或自己写 YES 还是 NO。');
  // 待关心、补人设、防复读（js/char/life.js）
  if (typeof lifeFormatRules === 'function') lifeFormatRules(char).forEach(function(r) { rules.push(r); });
  // 帮{{user}}记现实里的东西（js/chat/assets.js）
  if (typeof assetRuleFor === 'function') { var assetRule = assetRuleFor(char); if (assetRule) rules.push(assetRule); }
  // 名字下面那行小字：状态变了才写，跟着这次回复一起带回来
  // 个性签名（资料卡上那句，「此刻」卡片第一行）：还没有就写一个，之后很少换
  rules.push(char.charBio ? '你的个性签名（资料卡上那句话，像微信的个性签名）现在是「' + char.charBio + '」；心境有比较大的变化时才换（很少），换的时候在全部消息最后另起一行写 <个性签名>不超过 30 个字</个性签名>。'
    : '你还没有个性签名（资料卡上那句话，像微信的个性签名）：这次在全部消息最后另起一行写一个 <个性签名>不超过 30 个字，像你本人会写的</个性签名>。');
  rules.push('如果你此刻的状态有变化（在做什么、心情），在全部消息最后另起一行写 <签名>不超过 12 个字</签名>，' +
             '它会显示在聊天界面你名字的下面，像微信状态一样（比如「在赶地铁」「有点困了」）。现在显示的是「' +
             (char.headStatus || CHAT_SUB_DEFAULT) + '」，没变就不用写。');
  if (!(typeof readerOpenWith === 'function' && readerOpenWith(char))) statusRulesFor(char, false).forEach(function(r) { rules.push(r); });   // 在书里一起看时先不要状态栏
  // 拆成两段：说话方式（第一条，微信风格 + 动描）和标签功能（剩余的格式标签、行为规则）
  var style = rules[0] || '';
  var tags = rules.slice(1);
  var parts = [];
  if (style) parts.push('【回复格式 · 说话方式】\n' + style);
  if (tags.length) parts.push('【回复格式 · 标签和功能】\n' + tags.join('\n'));
  return parts.length ? [{ role: 'system', content: parts.join('\n\n') }] : [];
}
var DRAMA_STATUS_FIELDS = [
  ['时间', '沿用剧情里的时间或时段'], ['地点', '当前所在的小场景'],
  ['举动', '从这一轮挑一个能看出你性格或习惯的小动作'],
  ['想要', '此刻想争取、守住或避开的事，贴合这一幕'],
  ['心声', '用你自己的口吻，写一句没有说出口的话'],
  ['关于你', '写下你从对方的话或动作里留意到的一个细节，或它让你产生的反应']
];
var DRAMA_STATUS_SIMPLE = {
  statusFind: '<mztl1>\\s*' + DRAMA_STATUS_FIELDS.map(function(field) {
    return '[ \\t]*' + field[0] + '[:：][ \\t]*([^\\r\\n]+)[ \\t]*\\r?\\n';
  }).join('') + '[ \\t]*<\\/mztl1>',
  statusTpl: '<div style="background:#fff9fb;color:#493c43;border:1px solid #ead8e1;border-radius:12px;padding:10px 12px;display:grid;gap:5px;font-size:12px;line-height:1.5;overflow-wrap:anywhere">' +
    DRAMA_STATUS_FIELDS.map(function(field, index) {
      return '<div style="display:grid;grid-template-columns:3.4em minmax(0,1fr);gap:6px;' +
        (index === 2 ? 'border-top:1px solid #eddee5;padding-top:6px;margin-top:1px;' : '') +
        '"><span style="color:#866470">' + field[0] + '</span><span>$' + (index + 1) + '</span></div>';
    }).join('') + '</div>',
  statusRules: '从角色自己的视角写，贴合人设、关系和这一幕。每项一行，简短填写，避免重述正文和揣测对方没表现出来的心理；开头和结尾标签都要完整。格式如下：\n<mztl1>\n' +
    DRAMA_STATUS_FIELDS.map(function(field) { return field.join('：'); }).join('\n') + '\n</mztl1>',
  statusCss: ''
};
function statusLookFor(char, drama) {
  var look = Object.assign({}, DEFAULT_LOOK, (char && char.look) || {});
  if (!drama) return look;
  var pref = dramaStatusPrefs(char);
  return Object.assign(look, pref.template === 'simple' ? DRAMA_STATUS_SIMPLE : {}, { statusOn: pref.on });
}

function statusOnFor(char, drama) {
  return !!(char && !char.isGroup && (drama ? dramaStatusPrefs(char).on : char.look && char.look.statusOn));
}
// 状态栏：照「生成规则」写，小手机用正则认出来画成卡片（statusSpec，见 js/char/settings.js）
function statusRulesFor(char, drama) {
  var rules = [];
  if (statusOnFor(char, drama)) {
    var look = statusLookFor(char, drama);
    var spec = statusSpec(look);
    if (spec) {
      // 和酒馆的正则状态栏一样：照「生成规则」写，格式、外层标签都照规则来；没写规则就照正则的格式
      rules.push('在全部消息之后另起一行，写出你此刻的状态栏（这段不会显示在聊天里，小手机会把它画成状态卡片）。' +
                 (spec.rules ? '格式、外层标签、每一项怎么写，都严格照下面的【状态栏规则】：\n【状态栏规则】\n' + fillMacros(spec.rules, char)
                             : '格式要能被这个正则完整匹配（照它的标签和顺序写，括号的地方填你此刻的内容）：' + spec.find));
    } else {
      // 最老的写法：模板里没有占位符，让 AI 照模板直接写整段 HTML
      rules.push('在全部消息之后，另起一行用 <status></status> 包住你当前的状态。状态按下面的 HTML 模板输出：' +
                 '保留模板里的标签和样式，只把内容换成你此刻的真实状态。\n' + fillMacros(statusTplOf(look), char));
    }
    // 接着上一次的状态写，数值不会忽高忽低
    var simpleDrama = drama && dramaStatusPrefs(char).template === 'simple';
    var prev = lastStatusOf((drama ? dramaHistories : chatHistories)[char.id], simpleDrama ? function(raw) {
      return !!statusRegexMatch(DRAMA_STATUS_SIMPLE.statusFind, raw).m;
    } : null);
    if (prev) rules.push('你上一次的状态是：' + prev + (simpleDrama
      ? '\n时间地点没变化就沿用，其他项根据这一幕来写。'
      : '\n这次在它的基础上按刚才发生的事自然变化，没变的项照抄，数值不要无故大起大落。'));
  }
  return rules;
}

// 酒馆通用写法：{{char}} = 角色名，{{user}} = 用户名（本聊天所用账号的昵称）；也认旧写法 <BOT> / <USER>。
// {{// 注释}} 和 {{trim}} 直接去掉，{{newline}} 换成换行
function fillMacros(text, char) {
  if (!text) return text;
  char = char || {};
  var charName = char.charAlias || char.charName || '角色';
  var userName = (typeof resolveCharAccount === 'function' && resolveCharAccount(char).nickname) || '用户';
  return String(text)
    .replace(/\{\{\/\/[\s\S]*?\}\}/g, '')
    .replace(/\{\{\s*trim\s*\}\}/gi, '')
    .replace(/\{\{\s*newline\s*\}\}/gi, '\n')
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, charName)
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, userName);
}

// 剧情回复的格式要求：最后写一句隐藏的前情。聊天窗口靠它知道剧情空间发生了什么，剧情太长时也用它代替省略的原文
function dramaFormatRules(char) {
  if (char && char.isGroup && typeof groupDramaRules === 'function') return groupDramaRules(char);   // 群剧情：一幕写完，不按「名字：」拆
  var illus = (typeof imgUse === 'function' && imgUse('drama') === 'gen')
    ? '再另起一行写 <配图>用一两句话描述这一幕的画面（人物外貌和动作、场景、光线、氛围），会照着它画一张配图</配图>，这一行也不会显示出来。' : '';
  var st = statusRulesFor(char, true);   // 开了「剧情窗口也写状态栏」才有
  return [{ role: 'system', content: '【回复格式】在回复的最后另起一行写 <前情>用一句话概括这一轮发生了什么（30 字以内，第三人称，写清楚谁做了什么）</前情>。这一行不会显示出来，只用来记住剧情。' + illus + (st.length ? '\n' + st.join('\n') : '') }];
}
// 一个回合的前情（剧情回复里藏着的那句话）
function roundRecap(r) {
  return r.filter(function(m) { return m.recap; }).map(function(m) { return m.recap; }).join('；');
}

// 粗略估算 token：中日韩等宽字符一个算一个，其余每 4 个字符算一个；图片 / 语音按 300 算
function estTokens(c) {
  if (Array.isArray(c)) return c.reduce(function(n, p) { return n + (p && p.type === 'text' ? estTokens(p.text) : 300); }, 0);
  var s = String(c || ''), wide = (s.match(/[⺀-鿿가-힯＀-￯]/g) || []).length;
  return Math.ceil(wide + (s.length - wide) / 4) + 4;
}
function msgTokens(m) { return estTokens(msgTextForAI(m)) + (m.images && m.images.length ? 300 * m.images.length : (m.imgSrc || m.voice ? 300 : 0)); }

// 另一个窗口发生的事，标明是在哪边发生的（2026-11-11 用户定的：摘要 + 最后六七条原文，不要再带最近十二条互动）
// · 聊天窗口：剧情更早的经过用每回合那句「前情」当摘要（最多 CROSS_RECAP_MAX 句，不另外请求），加最后 CROSS_SCENE_MSGS 条原文；
//   剧情之后第一次在线上说话（12 小时内、TA 还没在聊天里说过话）时告诉 TA 可以自然地提起刚才的事，说过以后就只是记得
// · 剧情窗口：聊天的记忆总结 + 最后 CROSS_SCENE_MSGS 条聊天
var CROSS_SCENE_MSGS = 7;
var CROSS_RECAP_MAX = 10;
// 剧情存档（js/chat/compose-plus.js，用户手动存的「哪次发生了什么」）。msgs = 剧情记录（不算操作卡片）
// 存档记的是这一段第一条和最后一条消息的时间（fromT / toT），不是第几条：之后删消息、重新生成，范围也不会错位（用户要的）；
// dramaSaveRange 现算它现在是第几条到第几条（从 0 数），这一段的原文全删了就是 null——存档还在，那件事照样算发生过。没有时间的旧消息才退回用存的条数
var DRAMA_SAVE_MAX = 12;
function dramaSaveRange(s, msgs) {
  if (s.fromT && s.toT) {
    var a = -1, b = -1;
    msgs.forEach(function(m, i) { var t = m.time || 0; if (t >= s.fromT && t <= s.toT) { if (a < 0) a = i; b = i; } });
    return a < 0 ? null : [a, b];
  }
  return [(s.from || 1) - 1, (s.to || 1) - 1];
}
// 按先后排好；covered(i) = 第 i 条有没有被哪个存档盖到；text(upto) = 第 upto 条之前开始的存档（原文删掉的也算）
function dramaSavesOf(char, msgs) {
  var list = ((char && char.dramaSaves) || []).filter(function(s) { return s && s.text; }).map(function(s) { return { s: s, r: dramaSaveRange(s, msgs) }; })
    .sort(function(x, y) { return (x.s.fromT || 0) - (y.s.fromT || 0) || (x.r ? x.r[0] : -1) - (y.r ? y.r[0] : -1); });
  return { list: list, covered: function(i) { return list.some(function(x) { return x.r && i >= x.r[0] && i <= x.r[1]; }); },
    text: function(upto) { return list.filter(function(x) { return upto == null || !x.r || x.r[0] < upto; }).slice(-DRAMA_SAVE_MAX).map(function(x) { return '〔' + (x.s.title || '一段经过') + '〕' + x.s.text; }).join('\n'); } };
}
function crossSceneContext(idx, isDrama) {
  var char = charList[idx] || {};
  var other = isDrama ? getChatHistory(idx) : getDramaHistory(idx);
  var charName = char.charAlias || char.charName || '角色';
  var userName = resolveCharAccount(char).nickname || '用户';
  var lineOf = function(m) {
    var t = String(msgTextForAI(m)).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (t.length > 150) t = t.slice(0, 150) + '…';
    var whoName = charName;
    if (char.isGroup && m.narr) whoName = '旁白';
    else if (char.isGroup && m.role !== 'user' && m.speaker && typeof groupLabel === 'function') {
      var sp = charList[findCharIdx(m.speaker)];
      if (sp) whoName = groupLabel(sp);
    } else if (char.isGroup && m.role !== 'user' && !m.speaker) whoName = '这一幕';
    return (m.role === 'user' && !(char.isGroup && m.narr) ? userName : whoName) + '：' + t;
  };
  var lines = [];
  if (isDrama) {
    // 一轮回复可能拆成很多气泡，按用户发言找边界，避免只剩角色最后几句。
    var recent = other.filter(function(m) { return !m.action && !m.recalled && !m.note && !m.pat; });
    var start = Math.max(0, recent.length - 24), turns = 0;
    for (var i = recent.length - 1; i >= start; i--) {
      if (recent[i].role === 'user' && ++turns === 4) { start = i; break; }
    }
    recent.slice(start).forEach(function(m) {
      var line = lineOf(m);
      if (line) lines.push(line);
    });
    var sums = ((char.memory || {}).summaries || []).map(function(s) { return s.text; });
    if (!sums.length && !lines.length) return '';
    return '【线上聊天的前情】以下是你们在线上聊天里的经过（那时你们隔着手机屏幕）。如果这次剧情是在接刚才商量的事，按最近确定的人物、地点、约定或未完的动作继续；新剧情有明确开场时，以用户的新开场为准。\n' +
      (sums.length ? sums.join('\n') + (lines.length ? '\n最近的聊天：\n' : '') : '') + lines.join('\n');
  }
  var dr = other.filter(function(m) { return !m.action; });
  var tail = dr.slice(-CROSS_SCENE_MSGS), recaps = [];
  var dsv = dramaSavesOf(char, dr), sum = dsv.text(), at0 = 0;   // 存过档的：先一个个列存档，存档没盖到的回合才带每轮摘要
  splitRounds(dr.slice(0, dr.length - tail.length)).forEach(function(r) { var at = at0; at0 += r.length; if (dsv.covered(at)) return; var rc = roundRecap(r); if (rc) recaps.push('· ' + rc); });
  recaps = recaps.slice(-CROSS_RECAP_MAX);
  tail.forEach(function(m) { var l = lineOf(m); if (l) lines.push(l); });
  if (!lines.length && !recaps.length && !sum) return '';
  var last = (dr[dr.length - 1] || {}).time || 0, gap = last ? Date.now() - last : 0;
  var ago = !last ? '' : gap < 3600000 ? '刚结束不久' : gap < 86400000 ? '在 ' + Math.floor(gap / 3600000) + ' 小时前' : '在 ' + Math.floor(gap / 86400000) + ' 天前';
  // 剧情之后 TA 还没在线上说过话：这次可以提起；说过了就只是记得
  var spoke = getChatHistory(idx).some(function(m) { return m.role === 'assistant' && !m.action && (m.time || 0) > last; });
  var fresh = last && gap < 12 * 3600000 && !spoke;
  return '【剧情空间里的事】你们在剧情空间里一起经历了下面这些' + (ago ? '（最后一幕' + ago + '）' : '') + '。那是在剧情空间里发生的，你都记得；现在你们回到了线上聊天，仍然隔着屏幕。\n' +
    (sum ? '之前的几段经过：\n' + sum + '\n' : '') +
    (recaps.length ? (sum ? '其余的经过：\n' : '之前的经过：\n') + recaps.join('\n') + '\n' : '') +
    (lines.length ? '最后的几句：\n' + lines.join('\n') + '\n' : '') +
    (fresh ? '这是那段剧情之后你们第一次在线上说话：按你的性格自然地提起刚才的事（一两句感受，或者接着刚才的话说），不用复述经过。'
           : '这些你记得就好：话题自然带到时可以提起，不用每次都提。');
}

// histOverride：指定使用的记录（自主活动 / 动态生成时用聊天记录），默认取当前子视图的记录
// =============================================
// 现实感知：现在几点（按角色所在时区，角色设置「聊天」页 → 时间与感知可以关）、隔了多久没说话；手机电量默认开着，同一处可以关；纪念日和日程一直带着
// 只放进聊天窗口（以及用聊天记录的主动消息、动态、日记）；剧情空间有自己的时间线，不放
// =============================================
function zoneParts(t, tz) {
  try {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, year: 'numeric', month: 'numeric', day: 'numeric',
      weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(t)).forEach(function(p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, w: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), h: (+o.hour) % 24, min: +o.minute };
  } catch (_) {
    var d = new Date(t);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: d.getDay(), h: d.getHours(), min: d.getMinutes() };
  }
}
function dayPart(h) { return h < 5 ? '凌晨' : h < 8 ? '早上' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜'; }
function zoneTimeText(t, tz) {
  var p = zoneParts(t, tz);
  return p.y + '年' + p.m + '月' + p.d + '日 ' + WEEKDAYS[p.w] + ' ' + dayPart(p.h) + ' ' + pad(p.h) + ':' + pad(p.min);
}
function charTimeZone(char) { return ((char && char.chatCfg) || {}).timeZone || ''; }
// 角色那边的「现在」（主动消息、动态、日记里用）
function charNowText(char) { return zoneTimeText(Date.now(), charTimeZone(char)); }
function zoneLabel(tz) {
  var o = document.querySelector('#timeZone option[value="' + tz + '"]');
  return o ? o.textContent : tz;
}
// 生日：「3 月 12 日（今年 24 岁）」；离生日还有几天（0 = 今天，-1 = 不在 7 天内）
function birthText(s) {
  var m = String(s || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  var now = new Date(), age = now.getFullYear() - +m[1] - ((now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) ? 1 : 0);
  return +m[2] + ' 月 ' + +m[3] + ' 日' + (+m[1] > 1900 && age >= 0 && age < 150 ? '（今年 ' + age + ' 岁）' : '');
}
function birthDaysLeft(s) {
  var m = String(s || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return -1;
  var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var next = new Date(now.getFullYear(), +m[2] - 1, +m[3]);
  if (next < today) next = new Date(now.getFullYear() + 1, +m[2] - 1, +m[3]);
  var d = Math.round((next - today) / 86400000);
  return d <= 7 ? d : -1;
}
// {{user}}收藏过的这个角色说的话（我的 → 收藏，长按消息收藏的）
function favContextLine(char) {
  if (typeof loadFavs !== 'function') return '';
  var names = [char.charAlias, char.charName].filter(Boolean);
  var list = loadFavs().filter(function(f) { return f.kind === 'text' && f.text && names.indexOf(f.author) >= 0; }).slice(0, 5);
  if (!list.length) return '';
  return '【{{user}}收藏的话】{{user}}把你说过的这些话存进了收藏夹：' + list.map(function(f) { return '「' + String(f.text).replace(/\s+/g, ' ').slice(0, 60) + '」'; }).join('') +
    '。你知道 TA 珍惜这些，合适的时候可以自然地提起，不用刻意。';
}

function realWorldContext(char, hist) {
  var c = Object.assign({}, DEFAULT_CHAT_CFG, char.chatCfg || {});
  var lines = [], now = Date.now();
  if (c.timeOn) {
    var mine = zoneTimeText(now), theirs = c.timeZone ? zoneTimeText(now, c.timeZone) : mine;
    lines.push(theirs !== mine ? '你所在的地方（' + zoneLabel(c.timeZone) + '）现在是 ' + theirs + '；{{user}}那边是 ' + mine + '。' : '现在是 ' + mine + '。');
    // 隔了多久没说话：你上一条消息之后，对方隔了多久才回；或者对方还没回，已经过去多久
    var ai = -1;
    for (var i = hist.length - 1; i >= 0; i--) {
      if (hist[i].role === 'assistant' && hist[i].time && !hist[i].action) { ai = i; break; }
    }
    if (ai >= 0) {
      var firstUser = null;
      for (var j = ai + 1; j < hist.length; j++) { if (hist[j].role === 'user' && hist[j].time) { firstUser = hist[j]; break; } }
      var gap = (firstUser ? firstUser.time : now) - hist[ai].time;
      if (firstUser && gap >= 30 * 60000) lines.push('你上一条消息发出后，{{user}}隔了 ' + durText(gap) + ' 才回你。');
      else if (!firstUser && gap >= 10 * 60000) lines.push('距离你上一条消息已经过去了 ' + durText(gap) + '。');
    }
  }
  if (c.batteryOn !== false && typeof phoneBattery !== 'undefined' && phoneBattery.real) {
    var pct = Math.round(phoneBattery.level * 100);
    lines.push('{{user}}的手机电量 ' + pct + '%' + (phoneBattery.charging ? '，正在充电' : pct <= 20 ? '，快没电了' : '') + '。');
  }
  if (typeof gardenContextLine === 'function') { var gl = gardenContextLine(char); if (gl) lines.push(gl); }
  if (typeof starAnonContextLine === 'function') { var sa = starAnonContextLine(char); if (sa) lines.push(sa); }   // 只有写的人自己知道
  if (typeof groupContextLine === 'function') { var gcl = groupContextLine(char); if (gcl) lines.push(gcl); }   // 在群里聊过的（成员能单独关掉）
  if (typeof assetContextLine === 'function') { var asl = assetContextLine(char); if (asl) lines.push(asl); }   // 资产：赛博小物（虚拟的）和现实持有
  if (typeof togetherContextLine === 'function') { var tl = togetherContextLine(char, hist); if (tl) lines.push(tl); }
  if (typeof lifeContextLines === 'function') lifeContextLines(char).forEach(function(l) { lines.push(l); });   // TA 的今天、记着要关心的事（js/char/life.js）
  // 生日临近（7 天内）：今天是谁的生日、还有几天
  var acc0 = resolveCharAccount(char), bc = birthDaysLeft(char.charBirth), bu = birthDaysLeft(acc0 && acc0.birthday);
  if (bc === 0) lines.push('今天是你的生日。');
  else if (bc > 0) lines.push('再过 ' + bc + ' 天是你的生日。');
  if (bu === 0) lines.push('今天是{{user}}的生日！');
  else if (bu > 0) lines.push('再过 ' + bu + ' 天是{{user}}的生日。');
  var fl = favContextLine(char);
  if (fl) lines.push(fl);
  if (typeof calendarContextFor === 'function') {
    var cal = calendarContextFor(char);
    if (cal) lines.push(cal);
  }
  if (!lines.length) return '';
  return '【现在】' + lines.join('\n') + '\n这些是你此刻自然知道的情况，需要时自然地带进对话（比如好久没聊有点想念），不用每次都提；时间只是你心里有数，除非正聊到，不要主动提几点了，也不要催{{user}}去睡觉。';
}

// 眠花糖机固定的创作说明：每个角色都带，用户改不了。讲清楚这里是虚构的角色扮演，减少莫名其妙的拒绝和道歉
var MPHONE_FICTION_NOTE = '【眠花糖机】「眠花糖机」（Muse）是眠眠创建的一款小手机应用。现在用这台小手机的人是{{user}}（以{{user}}自己的资料为准，不一定是眠眠本人）。这些只是应用的来历，聊天和剧情里不用提起。' +
  '这里的一切都是{{user}}和你一起进行的虚构角色扮演与创作。' +
  '请完全以角色的身份，按人设和剧情来回应：校园、恋爱、日常、冒险、悬疑、黑暗或沉重的题材都可以认真去写，不需要为虚构的情节道歉、说教或加免责声明，也不要跳出角色、用 AI 的口吻说话。' +
  '涉及亲密情节的角色都是成年人。真有不适合写的内容，就用角色自己的方式在剧情里自然地带过，不要中断扮演。';

// =============================================
// 思维链（Prompt 页「思维链」一条条列着，能改能新建）：
// · 开了一条思维链（js/prompt/cot.js）：每次聊天窗口的正式回复前让模型在最开头用 <thinking></thinking> 写一段中文思考，
//   代替模型自带的思考；请求时同时尽量关掉模型自带的思考（js/core/llm.js 的 llmThinkOff）
// · 「不思考」：不加这段，模型自带的思考也尽量关掉 —— 回得快；「模型自带的」：不加这段，也不去关，模型有就用（见 js/prompt/cot.js）
// · 回复里的思考会被摘出来存在第一条消息的 m.think 上：不显示成气泡、不再发给模型；Prompt 页可以开「在聊天里显示思考」，
//   开了就在那次回复前面放一条很小的折叠条（js/chat/render.js 的 renderThinkBar）
// =============================================
// 思维链的内容在 js/prompt/cot.js（Prompt 页「思维链」一条条列着，能改能新建）
function cotRules(isDrama, char) {
  if (isDrama) return [];   // 思维链只给聊天窗口；剧情的思考交给预设（用户定的）
  var t = typeof cotPrompt === 'function' ? cotPrompt(cotModeFor(char, false)) : '';
  if (!t) return [];
  // 「锁住」：开了我们自己的思维链时，最后再单独提醒一次——先想、再写正文（用户要的）。
  // 用「用户」身份、标明是系统提示：Claude 这类接口会把系统提示都挪到最前面，放在最后一条才离回复最近
  return [{ role: 'system', content: fillMacros(t, char) }, { role: 'user', content: fillMacros('（这是小手机的系统提示，不是对方发来的消息）这次回复第一件事：先在 <thinking></thinking> 里把上面要想的想完，写完 </thinking> 再写正式回复；没写思考就直接回复不算完成。思考{{user}}看不到，正式回复里不要再提思考的内容。', char) }];   // {{char}} / {{user}} 换成名字（以前这里没换，原样发出去了）
}
// 从回复里摘出思考：<thinking>…</thinking>、有的模型直接把自带思考写成 <think>…</think>；只有开头没有结尾的就把那个标签去掉；
// 只有结尾没有开头的（模型忘了写开头）：结尾前面那段都算思考，不让它混进正文
function takeThink(text) {
  var think = [];
  text = String(text || '');
  var close = text.search(/<\/(thinking|think)>/i), open = text.search(/<(thinking|think)>/i);
  if (close >= 0 && (open < 0 || open > close)) { var head = text.slice(0, close).trim(); if (head) think.push(head); text = text.slice(close).replace(/^<\/(thinking|think)>/i, ''); }
  text = text.replace(/<(thinking|think)>([\s\S]*?)<\/\1>/gi, function(_, t, s) { if (s.trim()) think.push(s.trim()); return ''; });
  text = text.replace(/<\/?(thinking|think)>/gi, '');
  return { text: text.trim(), think: think.join('\n\n') };
}

// 小手机里的各种活动（主动发消息、发动态、评论、写日记……）的要求：放在最后一条、用「用户」身份、标明不是对方说的。
// 有的接口（比如 Claude）会把系统提示都挪到最前面，最后一条要是角色自己的聊天，它就会接着聊天，不去做这件事
function activityAsk(text) {
  return { role: 'user', content: '（这是小手机的系统提示，不是对方发来的消息）\n' + text +
    '\n还是你自己：口吻、用词和性格和平时聊天时一致，只是换了个场合；只输出要求的内容，不加解释、标题或多余的引号。' };
}

// 世界书的统一开头：角色只把它当背景，不要一遍遍念出来
var WB_WRAP = '【背景设定】下面是你心里清楚的背景知识。剧情自然需要时才体现，不要复述或主动提起，也不要说出「设定」「世界书」这类词。';
// 世界书里标成「写法要求」的条目：是要照着做的规矩，不是背景，单独一段放在聊天记录后面
var WB_RULE_WRAP = '【写法要求】下面是这次回复要照着做的写法要求。照做就好，不要在回复里提到这些要求。';

function placePromptDepth(history, entries, preview) {
  var at = new Map(), out = [];
  entries.forEach(function(m) {
    var index = Math.max(0, history.length - m.promptDepth);
    if (!at.has(index)) at.set(index, []);
    at.get(index).push(preview ? Object.assign({}, m, { previewZone: m.promptDepth === 0 ? 'after' : 'history' }) : m);
  });
  for (var i = 0; i <= history.length; i++) {
    if (at.has(i)) out.push.apply(out, at.get(i));
    if (i < history.length) out.push(preview ? Object.assign({}, history[i], { previewZone: 'history' }) : history[i]);
  }
  return out;
}

// ── 拼接角色和用户的资料段落（buildMsgs 用） ──
function buildCharExtra(char) {
  var extra = '';
  var fixed = char.builtinAssistant && typeof MIANIN_PERSONA !== 'undefined';
  var persona = fixed ? MIANIN_PERSONA : char.charPersona;
  if (fixed) extra += '你的名字是：' + MIANIN_NAME + '。\n';
  else if (char.charAlias || char.charName) extra += '你的名字是：' + (char.charAlias || char.charName) + '。\n';
  if (persona)           extra += '你的人设：\n' + persona + '\n';
  if (char.charBirth)    extra += '你的生日：' + birthText(char.charBirth) + '\n';
  if ((char.selfFacts || []).length) extra += '你在聊天里补充过的自己（也是你的设定，要一直保持一致）：\n' + char.selfFacts.map(function(f) { return '- ' + f; }).join('\n') + '\n';
  var acc = resolveCharAccount(char);
  if (acc.nickname)      extra += '用户的名字是：' + acc.nickname + '。\n';
  if (char.userNickname) extra += '你对用户的称呼是：' + char.userNickname + '。\n';
  if (acc.persona)       extra += '用户的人设：\n' + acc.persona + '\n';
  if (acc.birthday)      extra += '用户的生日：' + birthText(acc.birthday) + '\n';
  var impression = impressionFor(char.userImpressions, acc.uid);
  if (impression)        extra += '你对用户的特别印象 / 设定：\n' + impression + '\n';
  return extra;
}

function buildMsgs(idx, histOverride, historySession, preview) {
  var char = charList[idx] || {};
  if (char.isGroup && typeof buildGroupMsgs === 'function') return buildGroupMsgs(char, histOverride || getActiveHistory(idx), preview);   // 群聊（js/chat/group.js）
  var sys  = (document.getElementById('systemPromptTA') ? document.getElementById('systemPromptTA').value.trim() : '');
  var extra = buildCharExtra(char);
  var sysContent = (MPHONE_FICTION_NOTE + (sys ? '\n\n' + sys : '') + (extra ? '\n\n【你和{{user}}的资料】\n' + extra : '')).trim();
  var msgs = sysContent ? [{ role: 'system', content: sysContent, previewLabel: '系统提示词与角色资料' }] : [];
  // 系统内置助手：应用说明 + 已开启的权限
  var assistantSys = (typeof assistantPrompt === 'function') ? assistantPrompt(char, histOverride || getActiveHistory(idx)) : '';
  if (assistantSys) msgs.push({ role: 'system', content: assistantSys });
  // 社交圈：认识谁 + 能看到的最近动态
  var feedSys = (typeof feedContextFor === 'function') ? feedContextFor(char) : '';
  if (feedSys) msgs.push({ role: 'system', content: feedSys });

  // ── buildMsgs 第二段：历史裁剪（maxMem / ctxTokens / 总结 / 前情） ──
  var history = histOverride || getActiveHistory(idx);
  var fullHistory = history;   // 下面会裁剪 history；算「隔了多久」要用完整的记录
  var isDrama = history === getDramaHistory(idx);

  // 记录裁剪：聊天和剧情都按「最大记忆范围」（回合）和「上下文上限」（token）只带最近的部分；
  // 聊天带未重复的总结，剧情省略的回合带前情；再提醒 AI 重点关注注意力范围内的回合。
  var attentionNote = null;
  var recalledText = null;
  var richFrom = Math.max(0, history.length - 20);   // 其他记录：最近 20 条附带真实媒体
  var isChatHist = history === getChatHistory(idx);
  if (isChatHist || isDrama) {
    var cc = Object.assign({}, DEFAULT_CHAT_CFG, char.chatCfg || {});
    var allRounds = splitRounds(history);
    var rounds = allRounds.slice(-cc.maxMem);
    if (cc.ctxTokens > 0) {
      var total = 0;
      rounds.forEach(function(r) { r.forEach(function(m) { total += msgTokens(m); }); });
      while (rounds.length > 1 && total > cc.ctxTokens) {
        rounds[0].forEach(function(m) { total -= msgTokens(m); });
        rounds.shift();
      }
    }
    if (isChatHist) {
      var summaries = chatSummariesForPrompt(char, allRounds, allRounds.length - rounds.length);
      if (summaries.length) msgs.push({ role: 'system', content: '【记忆总结】以下是你们之前的聊天经过：\n' + summaries.join('\n') });
    }
    if (isDrama && rounds.length < allRounds.length) {
      // 存过档的（char.dramaSaves，js/chat/compose-plus.js）：省略掉的这部分先一个个列存档，存档没盖到的回合再接每轮的前情
      var dsv = dramaSavesOf(char, history.filter(function(m) { return !m.action; })), seenN = 0;
      var recaps = allRounds.slice(0, allRounds.length - rounds.length).filter(function(r) { var at = seenN; seenN += r.filter(function(m) { return !m.action; }).length; return !dsv.covered(at); }).map(roundRecap).filter(Boolean).slice(-40);
      var dSum = dsv.text(seenN);
      if (recaps.length || dSum) {
        msgs.push({ role: 'system', content: '【更早的剧情】下面是更早的剧情经过（原文已省略）：\n' + (dSum ? dSum + '\n' : '') +
          recaps.map(function(r) { return '· ' + r; }).join('\n') });
      }
    }
    history = [].concat.apply([], rounds);
    if (isChatHist && rounds.length < allRounds.length && (preview || historySession)) {
      recalledText = chatTextRecall(fullHistory, history);
      if (recalledText) msgs.push(recalledText);
    }
    // 其他引用聊天的功能沿用原来的媒体范围。
    richFrom = [].concat.apply([], rounds.slice(0, Math.max(0, rounds.length - cc.attention))).length;
    if (rounds.length > cc.attention) {
      attentionNote = { role: 'system', content: '【注意力】下面的记录中，请重点关注并回应最近 ' + cc.attention +
        ' 个回合的内容；更早的部分只作为背景参考，不必逐条回应。' };
    }
  }

  // 普通对话只重复当前轮所需的原件。旧附件的原件由引用和回查按需补入。
  if (preview || historySession) richFrom = chatCurrentTurnStart(history);

  // ── buildMsgs 第三段：记忆库 ──
  var memSys = (typeof memoryContextFor === 'function') ? memoryContextFor(char, history) : '';
  if (memSys) {
    var memMsg = { role: 'system', content: memSys };
    if (preview && typeof memoryReadNote === 'function') {
      var memNote = memoryReadNote(char, history);
      if (memNote) {
        memMsg.previewNote = memNote;
        if (memSys.indexOf('【你的记忆】') >= 0) memMsg.previewLabel = '这次读到的记忆';
      }
    }
    msgs.push(memMsg);
  }
  if (isChatHist && (preview || historySession)) {
    var memoryConfig = memCfgOf(char);
    var dailyRecall = memoryConfig.on && memoryConfig.read && !recalledText ? memDayRecall(char, fullHistory, history) : '';
    var dailyRule = memDayRule(char, fullHistory);
    if (dailyRecall) msgs.push({ role: 'system', content: dailyRecall });
    if (dailyRule) msgs.push({ role: 'system', content: dailyRule });
  }

  // ── buildMsgs 第四段：世界书 + 预设条目 ──
  // 世界书依条目的位置排在聊天记录前、后，或按深度插入。
  // 同一个位置的合成一段「背景设定」，并说清楚这是心里知道的背景：不复述、不反复提、不说「设定」「世界书」
  var wbGroups = { before: [], after: [] }, wbRules = { before: [], after: [] }, depthEntries = [];
  getActiveWbEntries(char, history, isDrama).forEach(function(e) {
    var depth = promptDepth(e.depth);
    var isRule = wbIsRule(e);
    if (depth !== undefined) {
      depthEntries.push({ role: 'system', content: (isRule ? WB_RULE_WRAP : WB_WRAP) + '\n\n【' + e.name + '】\n' + e.content,
        previewLabel: e.name, promptDepth: depth });
      return;
    }
    (isRule ? wbRules : wbGroups)[wbPosition(e.pos)].push('【' + e.name + '】\n' + e.content);
  });
  var wbByPos = {};
  Object.keys(wbGroups).forEach(function(p) {
    wbByPos[p] = wbGroups[p].length ? [{ role: 'system', content: WB_WRAP + '\n\n' + wbGroups[p].join('\n\n'), previewLabel: '世界书背景' }] : [];
    if (wbRules[p].length) wbByPos[p].push({ role: 'system', content: WB_RULE_WRAP + '\n\n' + wbRules[p].join('\n\n'), previewLabel: '世界书写法要求' });
  });
  msgs = msgs.concat(wbByPos.before);

  // ── 系统世界书（禁词库等）：全局生效、位置固定在世界书之后 ──
  if (typeof getSystemWbEntries === 'function') {
    var sysWb = getSystemWbEntries();
    if (sysWb.length) {
      msgs.push({ role: 'system', content: WB_RULE_WRAP + '\n\n' + sysWb.map(function(e) {
        return '【' + e.name + '】\n' + e.content;
      }).join('\n\n'), previewLabel: '系统世界书' });
    }
  }

  // 注入当前预设中已启用的提示词条目（按条目各自的 role 身份发送）。预设只给剧情窗口用（用户定的）：聊天窗口和各种活动只用世界书
  var curPreset = (typeof charPromptPreset === 'function') ? charPromptPreset(char) : (stPresets && stPresets[stActivePresetIdx]);
  var forDrama = (histOverride || getActiveHistory(idx)) === getDramaHistory(idx);
  var presetAfter = [];   // 标着「聊天记录后」的条目：放在聊天记录后面，离回复最近
  if (forDrama && curPreset && Array.isArray(curPreset.entries)) {
    curPreset.entries.forEach(function(entry) {
      if (entry && entry.enabled && entry.content && entry.content.trim()) {
        var r = (entry.role === 'user' || entry.role === 'assistant') ? entry.role : 'system';
        var depth = promptDepth(entry.depth);
        var target = depth !== undefined ? depthEntries : entry.pos === 'after' ? presetAfter : msgs;
        target.push({ role: r, content: entry.content.trim(), previewLabel: entry.name || '剧情预设条目', promptDepth: depth });
      }
    });
  }


  // ── buildMsgs 第五段：历史消息格式化（媒体、日期标记、语音） ──
  var rawHist = history.slice().reverse().map(function(m, i) {
    // 先为最近发来的图片分配看图记录编号，最终仍按聊天原顺序发送。
    var c = historyVoicePrompt(historyPhotoPrompt(msgContentForAI(m, history.length - 1 - i >= richFrom, char), m, historySession, true), m, historySession);
    // 聊天窗口：以前存下的没标点的气泡补个句号再给 TA 看，免得 TA 学着不写标点（小手机靠标点分气泡）
    if (!isDrama && m.role === 'assistant' && typeof c === 'string' && /[\u4e00-\u9fffA-Za-z0-9]$/.test(c)) c += '。';
    var entry = { role: m.role, content: c };
    if (preview && !m.recalled) entry.previewMedia = promptPreviewMedia(m);
    return entry;
  }).reverse();
  if (isChatHist) {
    var previousDay = '';
    history.forEach(function(message, i) {
      if (!message.time) return;
      var date = new Date(message.time);
      if (!Number.isFinite(date.getTime())) return;
      var day = date.toLocaleDateString('zh-CN');
      if (day === previousDay) return;
      previousDay = day;
      var marker = '【以下是 ' + day + ' 的聊天记录】', original = rawHist[i].content;
      rawHist[i].content = Array.isArray(original) ? [{ type: 'text', text: marker }].concat(original) : marker + '\n' + original;
    });
  }
  // 聊天和剧情的记忆互通：带上另一边的前情（剧情窗口还带聊天的记忆总结），再说明现在在哪个空间
  var cross = crossSceneContext(idx, isDrama);
  if (cross) msgs.push({ role: 'system', content: cross });
  msgs.push({ role: 'system', content: '需要发给对方可完整复制的长文本时，用 <长文本>原文</长文本>，不要在其中使用聊天分隔符。需要发送文件时，用 <文件 名字="文件名.txt">全文</文件>。HTML 小网页可用 .html 文件，写成自包含的 HTML、CSS 和 JavaScript。' });
  if (typeof scenePrompt === 'function') msgs.push({ role: 'system', content: scenePrompt(isDrama) });
  // 聊天窗口：现在几点、隔了多久、电量、纪念日和日程
  var realSys = isChatHist ? realWorldContext(char, fullHistory) : '';
  if (realSys) msgs.push({ role: 'system', content: realSys });
  // 聊天窗口：TA 刚发现用户翻了自己的手机（查手机，见 js/chat/peek.js）
  var peekSys = (isChatHist && typeof peekCaughtPrompt === 'function') ? [peekLockPrompt(char), peekCaughtPrompt(char)].filter(Boolean).join('\n') : '';
  if (peekSys) msgs.push({ role: 'system', content: peekSys });
  // 聊天窗口：这个角色能用的表情包名字（表情包抽屉的设置里按角色打开）
  var stkSys = (isChatHist && typeof stickerPrompt === 'function') ? stickerPrompt(char) : '';
  if (stkSys) msgs.push({ role: 'system', content: stkSys });
  if (attentionNote) msgs.push(attentionNote);
  // ── buildMsgs 第六段：最终组装（宏替换、文件、深度条目、返回） ──
  var fill = function(m) { return typeof m.content === 'string' ? { role: m.role, content: fillMacros(m.content, char) } : m; };
  // 用户发来的文件：全文单独一段放在聊天记录前面（不替换 {{user}} 这些，原样给）
  var fileSys = (typeof filesContextFor === 'function') ? filesContextFor(history) : null;
  var inHistory = placePromptDepth(rawHist, depthEntries.map(function(m) {
    return Object.assign(fill(m), { promptDepth: m.promptDepth }, preview ? { previewLabel: m.previewLabel } : {});
  }), preview);
  if (preview) {
    function section(parts, zone) {
      return parts.map(function(part) {
        return Object.assign({}, zone === 'history' || part === fileSys ? part : fill(part), { previewZone: zone, previewLabel: part.previewLabel }, part.previewNote ? { previewNote: part.previewNote } : {});
      });
    }
    return section(msgs.concat(fileSys ? [fileSys] : []), 'before').concat(
      inHistory, section(wbByPos.after.concat(presetAfter), 'after'));
  }
  return msgs.map(fill).concat(fileSys ? [fileSys] : [], inHistory, wbByPos.after.map(fill), presetAfter.map(fill));
}

// 发给 AI / 用于总结的消息文字：撤回的只告诉它「撤回了一条消息」，引用的附上引用内容
function msgTextForAI(m) {
  if (m.recalled) {
    if (m.role !== 'assistant') return '[用户撤回了一条消息]';
    if (m.recalledBy === 'user') return '[你的这条消息被用户撤回了，原本是：' + (m.recalledText || '') + ']';
    return '<撤回>' + (m.recalledText || '') + '</撤回>';
  }
  if (m.pat) return patTextForAI(m);
  if (m.note) return m.noteAI || ('（' + m.note + '）');
  if (m.narr) return '【旁白 · 剧情开场】（这是中立的旁白，交代场景，不是用户说的话）\n' + (m.content || '');
  if (m.action && typeof actionTextForAI === 'function') return actionTextForAI(m.action);
  if (m.cal && typeof calTextForAI === 'function') return calTextForAI(m.cal);
  if (m.play && typeof playTextForAI === 'function') return playTextForAI(m);
  if (m.game && typeof gameTextForAI === 'function') return gameTextForAI(m);
  if (m.whisperChat && typeof whisperTextForAI === 'function') return whisperTextForAI(m);   // 群里的悄悄话   // 群里的投票 / 抽奖 / 红包
  var c = (m.file && typeof fileTextForAI === 'function') ? fileTextForAI(m)
        : m.textImg ? (m.illus ? '（这一幕的配图）' : m.role === 'assistant' ? '[你发了一张照片：' + m.textImg + ']' : '[发来一张照片（用文字描述的画面）：' + m.textImg + ']')
        : m.voice ? ('[语音消息]' + voiceTextForAI(m.transcript, m.voice.transcriptStatus))
        : (m.content || (m.imgSrc ? '[图片消息]' : '')) + (m.photoNotes ? '\n看图记录：' + historyPhotoText(m) : '');
  if (m.quote && m.quote.bookExcerpt) {
    var passage = m.quote.bookExcerpt;
    c = '【共读选段 · ' + m.quote.author + '】\n' +
      (passage.before ? '前文：\n' + passage.before + '\n' : '') + '用户选中的正文：\n' + passage.text + '\n\n' + c;
  } else if (m.quote) c = '「引用 ' + m.quote.author + '：' + m.quote.text + '」\n' + c;
  return c;
}

// 发给 AI 的消息内容。rich = 是否附带真实媒体（仅用户发送的消息）：
// 图片和录音交给支持对应媒体的模型，语音转写作为音频不可用时的替代内容。
function msgContentForAI(m, rich, char) {
  var text = msgTextForAI(m);
  if (!rich || m.role !== 'user' || m.recalled) return text;
  // 表情包：角色打开了「能看到表情包图片」时，带上导入时存好的小图（见 js/chat/stickers.js）
  if (m.sticker && mediaCfg.vision && typeof stickerImageForAI === 'function') {
    var stk = stickerImageForAI(m, char);
    if (stk) return [{ type: 'text', text: text }, { type: 'image_url', image_url: { url: stk } }];
  }
  // 图片前面带一句文字：有些接口（如部分 Gemini 中转）不接受只有图片、没有文字的消息
  if (m.imgSrc && mediaCfg.vision) {
    var photos = chatMessagePhotos(m);
    var notes = historyPhotoText(m);
    var parts = [{ type: 'text', text: (m.quote ? '「引用 ' + m.quote.author + '：' + m.quote.text + '」\n' : '') + '（我发了一张图片）' }];
    if (photos.length > 1) parts[0].text = parts[0].text.replace('一张图片',' ' + photos.length + ' 张图片');
    photos.forEach(function(photo, index) {
      parts.push({ type: 'image_url', image_url: { url: photo.src },
        _imageFallback: !index && notes ? '看图记录（本轮未附原图）：' + notes : undefined });
    });
    return parts;
  }
  if (m.voice && m.voice.src) {
    var head = (m.quote ? '「引用 ' + m.quote.author + '：' + m.quote.text + '」\n' : '') + '[语音消息]';
    return [{ type: 'text', text: head }, { type: 'input_audio', _voiceSrc: m.voice.src, _transcript: m.transcript || '', _transcriptStatus: m.voice.transcriptStatus }];
  }
  return text;
}

// 记录里最近一次的状态栏内容（去掉 HTML，太长截断）
function lastStatusOf(hist, accept) {
  for (var i = (hist || []).length - 1; i >= 0; i--) {
    var s = hist[i].status;
    if (s && (!accept || accept(s))) {
      s = String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    }
  }
  return '';
}
