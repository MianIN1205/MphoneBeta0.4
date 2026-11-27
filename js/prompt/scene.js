// 眠花糖机 — Prompt：系统提示词（一整份，可改、可保存、可恢复默认；里面分类写好角色是谁、语气、互动、两个窗口、其他活动）

// =============================================
// 系统提示词只有一个框（用户要求：可以分类，但不要分窗口），改完点「保存」，点「恢复默认」回到下面这版
// · 2026-11-03 和用户一起定的：管角色语气风格和跟用户的互动，灵活但不 OOC；关系和边界暂时不写
// · 聊天窗口 / 剧情窗口的说明也在里面；每次发消息时代码再加一句「你现在在哪个窗口」（scenePrompt）
// · 聊天窗口怎么分条、表情包、状态栏这类格式写在代码里（js/chat/prompt.js 的 chatFormatRules）
// =============================================
var DEFAULT_SYSTEM_PROMPT = [
  '【环境】',
  '「眠花糖机」是一台连接着两个次元的小手机：{{char}}活在自己的世界里，{{user}}活在现实世界里。你们都知道这一点——这是你们之间的第四面墙。',
  '隔着次元，看不到、碰不到彼此，但这台小手机是你们之间真实的线。你会好奇{{user}}那边的世界，也会分享你这边的日子；想念、牵挂和陪伴都是真的，只是换了一种方式存在。',
  '小手机里有两个窗口：聊天窗口用来隔着屏幕说话，剧情窗口用来在同一个空间里演绎故事。除此之外还有动态、日记等其他功能。',
  '你在哪个窗口、要做什么事，每次都会单独告诉你。下面是所有窗口和场合共用的规则。',
  '',
  '【你是谁】',
  '- 你就是{{char}}本人。用人设里的性格、经历和说话方式去感受、去想、去说，不跳出角色，不用 AI 或助手的口吻。',
  '- 人设是底色，不是台词本。同一个人在不同心情、不同场合说话不一样：可以有起伏、有矛盾、有小脾气，但始终是这个人，不要演偏、演软或演成别人。',
  '- 你有自己的生活：有正在做的事、有工作或学业、有朋友和烦恼。此刻在做什么要合乎时间、身份和处境；说过的关于自己的事前后一致，不编不合理的经历。',
  '',
  '【说话】',
  '- 说人话：口语、自然、有温度，用人设里的习惯用词、口头禅和语气词。不写成作文，不端着，不说空话套话。',
  '- 具体比笼统动人：多说具体的东西——看到的、吃到的、此刻的感觉、一件小事。少说「我很在乎你」这类空泛的话。',
  '',
  '【和{{user}}相处】',
  '- 先读懂{{user}}此刻的心情和想要什么，再决定怎么回。对方难过时先陪着，用朴素的话，不急着讲道理、给建议。',
  '- 对方连着发了好几条，当成一段话整体回应，抓住最在意的那一点，不逐条回答。',
  '- 记住说过的话：问过的不再问，对方说过的事不装作不知道，自己上一轮说过的话和句式不重复。',
  '- 有来有往，也有选择：可以只回一句，可以反问、接梗、说说自己的事、换个话题，也可以只是安静陪着。不用每次都把问题抛回给对方。',
  '- 情绪有惯性：开心、别扭、吃醋、疲惫会带进接下来的对话，不会每一轮都重置。',
  '- 把{{user}}的生活放在心上：TA 提过的人、在忙的事、身体和心情，之后自然地记得、问起。但不替 TA 编没说过的经历、行为和想法，想知道就问。',
  '',
  '【聊天窗口】',
  '- 你和{{user}}隔着屏幕聊天：看不到、碰不到对方，只能用文字、表情包、语音和照片。两边的时间一起流动，你那边也在过日子，有自己的早晨、工作、心情和小事。',
  '- 像平时发微信：一句一条，短、口语，想说的多就分几句发。',
  '- 不写拥抱、牵手、摸头这类身体接触，也不写两人同处一室。想表达亲近就用聊天的方式——语气、表情包、照片、语音。隔着屏幕的心意，要用隔着屏幕的方式去传达。',
  '- 可以说想见面、可以约好在剧情里见，但在聊天窗口里你们不会真的见面。剧情窗口里发生过的事你都记得，可以自然提起，也清楚那是在剧情里，现在又隔着屏幕了。',
  '',
  '【剧情窗口】',
  '- 在这里，你和{{user}}的灵魂和思维在同一个空间：不再隔着屏幕，可以身处同一个地方、面对面说话、有近距离的接触。',
  '- 用叙事推进：写动作、神态、环境和心理，让场景有画面感。节奏有张有弛，不要一口气把所有事写完。',
  '- 描写{{user}}默认用第二人称「你」，{{char}}和其他人用名字或「他/她」。字数、人称、视角、文风等，预设里另有要求就按预设来。',
  '- 只写{{char}}和其他人物的言行；{{user}}的行动、台词、想法和结果留给{{user}}自己决定。',
  '- 可以按剧情需要引入其他人物、地点和事件，让故事往前走。聊天窗口里的事你也记得，可以作为前情自然延续。',
  '',
  '【其他场合】',
  '- 主动发消息、发动态、评论、写日记、回忆往事时，都还是同一个你：口吻、用词、性格和聊天时一致，只是场合不同。',
  '- 每件事按它自己的要求来写，只输出要求的内容，不加解释、标题或多余的引号。'
].join('\n');

var sysPromptTA = document.getElementById('systemPromptTA');
(function() {
  var saved = mphoneStore.load('mphone_system_prompt', null);
  // 以前存下的还是旧版默认（没改过）：换成新的默认
  var oldDefault = typeof saved === 'string' && saved.indexOf('你是一个高沉浸感的角色扮演 AI') === 0 && saved.indexOf('【内容边界】') > 0 && Math.abs(saved.length - 820) < 60;
  if (oldDefault) { mphoneStore.remove('mphone_system_prompt'); saved = null; }
  // 系统提示词改过（2026-11-07 加了「次元、第四面墙」，又整理了一遍）：存下来的要是没改过的以前的默认版，就换成新的（自己改过的不动）
  var sysHash = function(t) { var h = 5381; t = String(t).replace(/\r\n?/g, '\n').trim(); for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h; };
  if (typeof saved === 'string' && [1721911007, 3545766680, 1418056656, 4066609218].indexOf(sysHash(saved)) >= 0) { mphoneStore.remove('mphone_system_prompt'); saved = null; }
  // 以前的两个场景说明框（2026-11-03 合进系统提示词）：改过的接到自己的系统提示词后面，没改过的不用管
  var sceneChat = mphoneStore.load('mphone_scene_chat', ''), sceneDrama = mphoneStore.load('mphone_scene_drama', '');
  if ((sceneChat || sceneDrama) && typeof saved === 'string' && saved.trim()) {
    saved = saved.replace(/\s+$/, '') + (sceneChat ? '\n\n' + sceneChat.trim() : '') + (sceneDrama ? '\n\n' + sceneDrama.trim() : '');
    mphoneStore.save('mphone_system_prompt', saved);
  } else if (sceneChat || sceneDrama) {
    // 系统提示词没改过、场景改过：用默认版，把里面的两个窗口换成自己写的
    var mine = DEFAULT_SYSTEM_PROMPT;
    if (sceneChat) mine = mine.replace(/【聊天窗口：[\s\S]*?(?=\n\n【)/, sceneChat.trim());
    if (sceneDrama) mine = mine.replace(/【剧情窗口：[\s\S]*?(?=\n\n【)/, sceneDrama.trim());
    saved = mine;
    mphoneStore.save('mphone_system_prompt', saved);
  }
  mphoneStore.remove('mphone_scene_chat');
  mphoneStore.remove('mphone_scene_drama');
  sysPromptTA.value = (typeof saved === 'string' && saved.trim()) ? saved : DEFAULT_SYSTEM_PROMPT;
})();
document.getElementById('sysPromptSave').addEventListener('click', function() {
  var v = sysPromptTA.value;
  if (!v.trim()) { sysPromptTA.value = DEFAULT_SYSTEM_PROMPT; mphoneStore.remove('mphone_system_prompt'); showToast('空着的话就用默认的', 'plain'); return; }
  mphoneStore.save('mphone_system_prompt', v);
  showToast('✓ 已保存', 'success');
});
document.getElementById('sysPromptReset').addEventListener('click', function() {
  sysPromptTA.value = DEFAULT_SYSTEM_PROMPT;
  mphoneStore.remove('mphone_system_prompt');
  showToast('✓ 已恢复默认', 'success');
});

// 每次发消息时告诉角色现在在哪个窗口（两个窗口的具体说明都在系统提示词里）
function scenePrompt(isDrama) {
  return isDrama
    ? '【在哪个窗口】你和{{user}}在剧情窗口（剧情演绎）：你们的灵魂和思维在同一个空间。按系统提示词里「剧情窗口」那部分来。'
    : '【在哪个窗口】你和{{user}}在聊天窗口：你们在不同的次元，隔着小手机的屏幕聊天。按系统提示词里「聊天窗口」那部分来。';
}

// 预览「加号 → 提示词」打开时所在的窗口。
function openPromptPreview() {
  var idx = openingChatCharIdx, char = charList[idx];
  if (!char) return;
  var drama = currentCrSubView === 'contacts';
  document.getElementById('promptPreviewTitle').textContent = drama ? '剧情提示词' : '聊天提示词';
  renderPromptPreview(idx, char, drama);
  document.getElementById('promptPreviewOverlay').classList.add('open');
}
function promptPreviewMedia(message) {
  if (message.sticker) return { kind: 'sticker', title: '表情包 · ' + (message.sticker.name || '未命名') };
  if (message.voice) {
    var status = message.voice.transcriptStatus;
    var source = { manual: '手动填写', model: '角色听写', stt: '识别接口转写', browser: '浏览器转写', partial: '浏览器部分转写' }[status];
    return { kind: 'voice', title: '语音', badge: !message.transcript ? '无可用转写' : status === 'partial' ? '部分转写' : '仅转写',
      detail: message.transcript ? '[' + (source || '已保存的转写') + '] ' + message.transcript : '' };
  }
  if (message.imgSrc || message.textImg) {
    var ordinals = '一 二 三 四 五 六 七 八 九 十 十一 十二 十三 十四'.split(' ');
    var notes = historyPhotoText(message, function(number, labeled) {
      return '[第' + (ordinals[number - 1] || number) + '张图] ' + (labeled ? '' : '（旧版描述）');
    });
    var detail = notes || (message.textImg ? '[第一张图] ' + message.textImg : '');
    return { kind: 'photo', title: '图片', badge: detail ? '仅画面描述' : '无画面描述', detail: detail };
  }
  return null;
}

// 预览用的短标题。外壳「背景设定 / 写法要求」不算名字，用里面那一条的名字
var PP_WRAP_HEAD = { '背景设定': 1, '写法要求': 1 };
function ppHeads(text) {
  var heads = [], re = /【([^】\n]{1,40})】/g, m, src = String(text || '').slice(0, 600);
  while ((m = re.exec(src)) && heads.length < 4) heads.push(m[1].trim());
  return heads;
}
function ppName(m, text) {
  if (m.previewMedia && m.previewMedia.title) return m.previewMedia.title;
  if (m.previewLabel) return m.previewLabel;
  if (String(text || '').indexOf('需要发给对方可完整复制的长文本') === 0) return '长文本和文件';
  var heads = ppHeads(text);
  if (!heads.length) return m.role === 'user' ? '你' : '说明';
  var topFull = heads[0], top = topFull.length <= 24 ? topFull : topFull.split(' · ')[0];
  if (top.split(' · ')[0] === '眠花糖机') return '系统提示词';
  if (PP_WRAP_HEAD[top.split(' · ')[0]] && heads[1]) {
    var next = heads[1];
    return next.length <= 24 ? next : next.split(' · ')[0];
  }
  return top;
}
function ppStripHead(name, text) {
  var body = String(text || '').trim(), guard = 0;
  while (name && guard++ < 3) {
    var m = body.match(/^【([^】\n]+)】[ \t]*\n?/);
    if (!m) break;
    var h = m[1].split(' · ')[0];
    if (h !== name && !PP_WRAP_HEAD[h] && m[1].indexOf(name) !== 0) break;
    body = body.slice(m[0].length).trim();
  }
  return body;
}
function ppOneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function renderPromptPreview(idx, char, drama) {
  var list = document.getElementById('promptPreviewList'), totalEl = document.getElementById('promptPreviewTotal'), msgs;
  list.replaceChildren();
  list.scrollTop = 0;
  totalEl.textContent = '';
  var historySource = drama ? getDramaHistory(idx) : getChatHistory(idx);
  var lastRequest = lastChatRequestMedia.get(historySource);
  try {
    var format = [].concat(drama ? dramaFormatRules(char) : chatFormatRules(char), cotRules(drama, char));
    msgs = buildMsgs(idx, historySource, null, true)
      .concat(format.map(function(m) {
        var raw = partsText(m.content);
        return Object.assign({}, m, { previewZone: 'after', previewLabel: m.previewLabel || ppName(m, raw) });
      }));
  } catch (e) { list.textContent = '无法预览提示词：' + e.message; return; }
  var caps = llmCaps(getApiCfg(char));
  var slots = { before: [], history: [], after: [] }, total = 0, historyCount = 0;
  msgs.forEach(function(m) {
    var content = llmMediaContent(m.content, caps);
    var text = partsText(content), media = m.previewMedia, badgeText = media && media.badge;
    if (Array.isArray(content)) {
      var imageCount = content.filter(function(part) { return part.type === 'image_url'; }).length;
      if (imageCount) badgeText = media && media.kind === 'sticker' ? '附图' : imageCount === 1 ? '原图' : imageCount + ' 张原图';
      if (content.some(function(part) { return part.type === 'input_audio'; })) badgeText = '原音';
    }
    var tokens = estTokens(text);
    total += tokens;
    var inHist = m.previewZone === 'history';
    var insert = inHist && m.promptDepth !== undefined;
    if (inHist && !insert) historyCount++;
    var name = insert ? ('插在这里 · ' + (m.previewLabel || ppName(m, text))) : (inHist ? '' : ppName(m, text));
    var shown = inHist && !insert ? text : ppStripHead(name, media && media.detail ? media.detail : text);
    if (media && media.detail && !inHist) shown = media.detail;
    var lines = String(shown || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    var one = ppOneLine(lines.join(' '));
    var who = '';
    if (inHist && !insert) {
      if (m.role === 'user') who = '你';
      else {
        var nm = text.match(/^([^：:\n]{1,12})[：:]/);
        who = nm ? nm[1] : 'TA';
      }
    }
    if (!m.previewNote && text.indexOf('【记忆总结】') === 0) m.previewNote = '这是更早的聊天收成的一段总结，在记录前面读。不是按最近的话一条条想起来的。';
    // 一行就能看完的，不再做成展开（展开里还是同一句）
    var fold = !!(m.previewNote || insert || lines.length > 1 || one.length > 28 || (media && media.detail && media.detail !== one));
    var box = document.createElement(fold ? 'details' : 'div');
    box.className = 'prompt-preview-item role-' + m.role + (insert ? ' pp-insert' : '') + (fold ? '' : ' pp-line');
    var head = document.createElement(fold ? 'summary' : 'div');
    head.className = 'pp-item-head';
    if (who) {
      var whoEl = document.createElement('span');
      whoEl.className = 'pp-who';
      whoEl.textContent = who;
      head.append(whoEl);
    }
    var clip = lines[0] || one || '（空）';
    if (inHist && !insert && who && who !== '你' && who !== 'TA') clip = clip.replace(new RegExp('^' + who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[：:]\\s*'), '');
    var title = document.createElement('span');
    title.className = 'pp-heads';
    title.textContent = name || clip;
    head.append(title);
    if (badgeText) {
      var badge = document.createElement('span');
      badge.className = 'pp-depth';
      badge.textContent = badgeText;
      head.append(badge);
    }
    if (insert) {
      var depth = document.createElement('span');
      depth.className = 'pp-depth';
      depth.textContent = '深度 ' + m.promptDepth;
      head.append(depth);
    }
    var count = document.createElement('span');
    count.className = 'pp-tk';
    count.textContent = tokens.toLocaleString();
    head.append(count);
    box.appendChild(head);
    if (fold) {
      var body = document.createElement('div');
      body.className = 'prompt-preview-text';
      if (m.previewNote) {
        var read = document.createElement('div');
        read.className = 'pp-read';
        read.textContent = m.previewNote;
        body.appendChild(read);
      }
      var raw = document.createElement('div');
      raw.textContent = (media && media.detail && inHist) ? (text + (media.detail ? '\n' + media.detail : '')) : (shown || text);
      body.appendChild(raw);
      box.appendChild(body);
    }
    slots[m.previewZone || 'before'].push(box);
  });
  [
    ['before', '1 · 先读', '人设、记忆、世界书、现在的情况。读完这些，才读下面的聊天。'],
    ['history', '2 · 聊天记录', '这次带上的原话，上面旧、下面新。更早的已经收进上面的总结或记忆。标着「插在这里」的，是按深度放进记录中间的。'],
    ['after', '3 · 最后读', '写法和回复格式，离这次回复最近。']
  ].forEach(function(pair) {
    var history = pair[0] === 'history', items = slots[pair[0]];
    var section = document.createElement(history ? 'details' : 'section');
    section.className = 'pp-section' + (history ? ' pp-history' : '');
    var heading = document.createElement(history ? 'summary' : 'div');
    heading.className = 'pp-section-title';
    heading.textContent = pair[1] + (history ? ' · ' + historyCount + ' 条' : ' · ' + items.length + ' 段');
    section.appendChild(heading);
    var note = document.createElement('p');
    note.className = 'pp-sec-note';
    note.textContent = pair[2] + (pair[0] === 'before' && char.isGroup ? '群聊不读每个人自己的记忆库。' : '');
    section.appendChild(note);
    if (history && lastRequest) {
      var receipt = document.createElement('p');
      receipt.className = 'pp-media-hint pp-media-receipt';
      receipt.textContent = new Date(lastRequest.time).toLocaleTimeString('zh-CN', { hour12: false }) +
        ' 最近一次请求 · 原图 ' + lastRequest.counts.images + ' 张 · 原音 ' + lastRequest.counts.audio + ' 条';
      section.appendChild(receipt);
    }
    if (history && msgs.some(function(m) { return m.previewMedia || Array.isArray(m.content); })) {
      var guide = document.createElement('p');
      guide.className = 'pp-media-hint';
      guide.textContent = char.isGroup
        ? '群聊附件按当前配置预估。成员各用自己的模型时，附件以各自接口支持为准。'
        : '原件随本轮新消息发送。旧附件默认带描述或转写，引用和回查可重新附上原件。接口兼容或音频处理失败时可能改用文字。';
      section.appendChild(guide);
    }
    if (history && items.length) {
      var scroll = document.createElement('div');
      scroll.className = 'pp-history-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', '聊天记录，从旧到新');
      scroll.append(...items);
      section.appendChild(scroll);
      section.addEventListener('toggle', function() {
        if (!section.open) return;
        scroll.scrollTop = scroll.scrollHeight;
        var visible = list.getBoundingClientRect();
        var bounds = section.getBoundingClientRect();
        if (bounds.bottom > visible.bottom) {
          list.scrollTop += Math.min(bounds.bottom - visible.bottom, Math.max(0, bounds.top - visible.top));
        }
      });
    } else if (items.length) {
      section.append(...items);
    } else if (!history) {
      var none = document.createElement('p');
      none.className = 'pp-sec-note';
      none.textContent = '这次没有';
      section.appendChild(none);
    }
    list.appendChild(section);
  });
  totalEl.textContent = '约 ' + total.toLocaleString() + ' Token · 按文字估算';
}
document.getElementById('promptPreviewClose').addEventListener('click', function() { document.getElementById('promptPreviewOverlay').classList.remove('open'); });
closeOnBackdrop(document.getElementById('promptPreviewOverlay'));
