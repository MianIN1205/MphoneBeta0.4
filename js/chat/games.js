// 眠花糖机 — 骰子和猜拳：发出去以后由小手机随机，不调用接口。谁想发谁发，夹在聊天里。

var GAME_RPS = ['石头', '剪刀', '布'];
var GAME_HAND = { '石头': '✊', '剪刀': '✌️', '布': '✋' };

function gameRoll(kind) {
  if (kind === 'rps') return GAME_RPS[Math.floor(Math.random() * 3)];
  return 1 + Math.floor(Math.random() * 6);
}
function gameFaceText(kind, value) {
  return kind === 'rps' ? ('出了' + value) : ('掷出了 ' + value);
}
function gameTextForAI(m) {
  var g = m && m.game;
  if (!g) return '';
  return (g.kind === 'rps' ? '[猜拳] ' : '[骰子] ') + gameFaceText(g.kind, g.value);
}
function gamePreview(m) {
  var g = m && m.game;
  if (!g) return '';
  return g.kind === 'rps' ? '[猜拳] ' + g.value : '[骰子] ' + g.value;
}

function gameDiceEl(n) {
  var el = document.createElement('div');
  el.className = 'cr-dice';
  el.setAttribute('data-face', String(n));
  for (var i = 0; i < 9; i++) el.appendChild(document.createElement('i'));
  return el;
}
function gameRpsEl(v) {
  var el = document.createElement('div');
  el.className = 'cr-rps';
  el.textContent = GAME_HAND[v] || '✊';
  return el;
}
function gamePaint(box, kind, value) {
  box.textContent = '';
  box.appendChild(kind === 'rps' ? gameRpsEl(value) : gameDiceEl(value));
}
function gameSpin(box, kind, value) {
  box.classList.add('spin');
  var faces = kind === 'rps' ? GAME_RPS : [1, 2, 3, 4, 5, 6];
  var n = 0, timer = setInterval(function() {
    n++;
    if (!box.isConnected || n >= 8) {
      clearInterval(timer);
      box.classList.remove('spin');
      if (box.isConnected) gamePaint(box, kind, value);
      return;
    }
    gamePaint(box, kind, faces[n % faces.length]);
  }, 80);
}

function appendGameMsg(role, m, list, empty) {
  if (empty) empty.style.display = 'none';
  var row = document.createElement('div');
  row.className = 'chat-msg-row ' + (role === 'user' ? 'user' : 'ai');
  row.appendChild(createMsgAvatar(role));
  var bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble sticker-bubble cr-game-bubble';
  var box = document.createElement('div');
  box.className = 'cr-game';
  var g = m.game || { kind: 'dice', value: 1 };
  if (m._spin) {
    gamePaint(box, g.kind, g.kind === 'rps' ? GAME_RPS[0] : 1);
    gameSpin(box, g.kind, g.value);
    delete m._spin;
  } else gamePaint(box, g.kind, g.value);
  bubble.appendChild(box);
  row.appendChild(bubble);
  list.appendChild(row);
  crStick(list);
  return { row: row, bubble: bubble };
}

function gameHistOf(idx) {
  return (currentCrSubView === 'contacts') ? getDramaHistory(idx) : getChatHistory(idx);
}
function gamePush(idx, role, speaker, kind, value, spin) {
  var hist = gameHistOf(idx);
  var m = { role: role, content: '', time: Date.now(), game: { kind: kind, value: value } };
  if (speaker) m.speaker = speaker;
  if (spin) m._spin = true;
  hist.push(m);
  if (openingChatCharIdx === idx && getActiveHistory(idx) === hist) renderHistMsg(m);
  return m;
}
// 只发你自己的。对方要不要玩，等下次正常回复时按人设决定，不在这里补发，也不请求回复
function sendGame(kind) {
  var idx = openingChatCharIdx, char = charList[idx];
  if (idx < 0 || !char || (kind !== 'dice' && kind !== 'rps')) return;
  if (typeof closeCrPlusPanel === 'function') closeCrPlusPanel();
  gamePush(idx, 'user', null, kind, gameRoll(kind), true);
  saveHistories();
  if (typeof renderChatCharList === 'function') renderChatCharList();
}

// 回复里的标签换成占位，拆开时再随机。这一轮只留第一次，后面的拿掉
function gameMarkText(text) {
  var used = false;
  return String(text || '').replace(/<(骰子|猜拳)\s*\/?>(\s*<\/\1>)?/g, function(_, name) {
    if (used) return '';
    used = true;
    return '\n' + (name === '猜拳' ? '\u0001RPS\u0001' : '\u0001DICE\u0001') + '\n';
  });
}
function gameSplitParts(parts) {
  var out = [], used = false;
  (parts || []).forEach(function(p) {
    if (typeof p !== 'string') { out.push(p); return; }
    p.split(/(\u0001(?:DICE|RPS)\u0001)/).forEach(function(b) {
      if (b === '\u0001DICE\u0001' || b === '\u0001RPS\u0001') {
        if (used) return;
        used = true;
        out.push({ content: '', game: { kind: b === '\u0001RPS\u0001' ? 'rps' : 'dice', value: gameRoll(b === '\u0001RPS\u0001' ? 'rps' : 'dice') }, _spin: true });
        return;
      }
      if (b.trim()) out.push(b);
    });
  });
  return out;
}
