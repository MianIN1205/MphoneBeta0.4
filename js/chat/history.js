// 眠花糖机 — 聊天 / 剧情记录：按角色存取、保存时去掉临时字段、当前窗口用哪份记录、角色用哪套 API

// =============================================
// 聊天对话室 — 消息发送与渲染
// =============================================
// 聊天 / 剧情记录按角色 id 存储（chatHistories 在 charList 旁加载），idx 为 charList 下标
function charKey(idx) { return charList[idx] ? charList[idx].id : '_none'; }
function getChatHistory(idx) { var k = charKey(idx); if (!chatHistories[k]) chatHistories[k] = []; return chatHistories[k]; }
function getDramaHistory(idx) { var k = charKey(idx); if (!dramaHistories[k]) dramaHistories[k] = []; return dramaHistories[k]; }
// 仅记录本次打开小手机期间的附件数量，不保存原文或附件。
var lastChatRequestMedia = new WeakMap();
function chatCurrentTurnStart(history) {
  var start = history.length;
  while (start > 0 && history[start - 1].role === 'user') start--;
  return start;
}
function chatMessagePhotos(message) {
  return Array.isArray(message.images) && message.images.length ? message.images : message.imgSrc ? [{ src: message.imgSrc }] : [];
}
// 一条消息要保存的字段；alts 是「重新生成」留下的多个版本（每个版本是一组消息）
function stripMsg(m, skipAlts) {
  var o = { role: m.role, content: m.content, imgSrc: m.imgSrc, images: m.images, sticker: m.sticker, status: m.status, statusHtml: m.statusHtml, statusLined: m.statusLined, time: m.time,
            quote: m.quote, recalled: m.recalled, recalledText: m.recalledText, recalledBy: m.recalledBy,
            voice: m.voice, transcript: m.transcript, action: m.action, recap: m.recap, pat: m.pat, patSuffix: m.patSuffix, patWho: m.patWho, cal: m.cal,
            narr: m.narr, note: m.note, noteAI: m.noteAI, think: m.think, errs: m.errs, errTrail: m.errTrail, mcpRuns: m.mcpRuns, mcpLead: m.mcpLead, autoPrevAt: m.autoPrevAt, file: m.file, textImg: m.textImg, photo: m.photo, illus: m.illus, tg: m.tg, speaker: m.speaker, play: m.play, game: m.game, whisperChat: m.whisperChat, privateCard: m.privateCard, callLog: m.callLog };
  if (m.alts && !skipAlts) {
    o.alts = m.alts.map(function(group) {
      return group.map(function(g) { return stripMsg(g, true); });
    });
    o.altIdx = m.altIdx;
  }
  if (m.historyRef) o.historyRef = m.historyRef;
  if (m.photoNotes) o.photoNotes = m.photoNotes;
  return o;
}
// 保存时把聊天 / 剧情记录里的临时字段去掉
// strip 结果用 trusted 存入 store，跳过 store 内部的二次深拷贝（strip 已经创建了全新对象）
function saveHistories() {
  var strip = function(all) {
    var out = {};
    Object.keys(all).forEach(function(k) {
      out[k] = all[k].map(function(m) { return stripMsg(m); });
    });
    return out;
  };
  mphoneStore.save('mphone_chat_histories', strip(chatHistories), { trusted: true });
  mphoneStore.save('mphone_drama_histories', strip(dramaHistories), { trusted: true });
}
function getActiveHistory(idx) {
  return (currentCrSubView === 'contacts') ? getDramaHistory(idx) : getChatHistory(idx);
}
function getActiveMsgListEl() {
  return document.getElementById(currentCrSubView === 'contacts' ? 'dramaMsgList' : 'chatMsgList');
}
function getActiveEmptyEl() {
  return document.getElementById(currentCrSubView === 'contacts' ? 'dramaRoomEmpty' : 'chatRoomEmpty');
}
// 传入角色且它在便捷拓展栏选了模型预设时，用那套预设（见 js/chat/quick-bar.js）
function getApiCfg(char) {
  var p = (char && typeof charApiPreset === 'function') ? charApiPreset(char) : null;
  return p ? presetApiConfig(p) : readAppliedApiConfig();
}
