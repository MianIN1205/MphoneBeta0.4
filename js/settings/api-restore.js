// 眠花糖机 — 恢复主 API 配置、应用表单和刷新模型列表
restoreAppliedApiDraft();

document.getElementById('btnApply').addEventListener('click', function() {
  applyApiConfig(readDraftApiConfig());
});

function refreshApiModels(openPopup, keepSelection) {
  if (refreshBtn.classList.contains('spinning')) return;
  var cfg = readDraftApiConfig();
  if (!cfg.url || !cfg.key) {
    showToast(cfg.mealCode ? '兑换码已失效' : '请先填接口地址和 API 密钥', 'plain');
    return;
  }
  var request = ++apiModelRequest;
  refreshBtn.classList.add('spinning');
  var claimed = cfg.mealCode && mealActiveCredential(cfg.mealCode);
  var requestModels = claimed ? Promise.resolve(claimed.models) : llmListModels(cfg.url, cfg.key);
  requestModels.then(function(models) {
    if (request !== apiModelRequest) return;
    if (!models.length) throw new Error('接口没有返回模型');
    modelPopup.replaceChildren();
    models.forEach(function(id) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'model-popup-item';
      item.dataset.model = id;
      item.textContent = id;
      item.addEventListener('click', function(event) {
        event.stopPropagation();
        setDraftApiModel(id);
        setApiModelPopup(false);
      });
      modelPopup.appendChild(item);
    });
    // 进入页面只预载选项，即使已应用的配置没选模型也保持原样。
    var selected = readDraftApiConfig().model;
    if (selected || !keepSelection) setDraftApiModel(selected || models[0]);
    if (openPopup && settingsScreen.classList.contains('active') && modelSelectBtn.getClientRects().length) setApiModelPopup(true);
    showToast('✓ 刷新成功', 'success');
  }).catch(function(err) {
    if (request !== apiModelRequest) return;
    console.warn('[Mphone] 获取模型列表失败:', err);
    showToast('✗ 获取失败：' + (err && err.message ? String(err.message).slice(0, 60) : ''), 'error');
  }).finally(function() {
    if (request === apiModelRequest) refreshBtn.classList.remove('spinning');
  });
}
refreshBtn.addEventListener('click', function(event) {
  event.stopPropagation();
  refreshApiModels(false);
});
