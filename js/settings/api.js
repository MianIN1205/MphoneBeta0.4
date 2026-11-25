// 眠花糖机 — 设置页：打开 / 关闭、顶部分页、主 API（地址、密钥、模型列表）、API 预设和字体预设、温度

// 设置界面开关
const settingsScreen = document.getElementById('settingsScreen');
const dockSettings   = document.getElementById('dockSettings');
const backBtn        = document.getElementById('backBtn');
const mainApiTab      = document.querySelector('#settingsSubnav [data-stab="main-api"]');

dockSettings.addEventListener('click', function() {
  restoreAppliedApiDraft();
  settingsScreen.classList.add('active');
  mainApiTab.click();
  if (apiUrlInput.value.trim() && apiKey.value.trim()) refreshApiModels(false, true);
});
backBtn.addEventListener('click', function() {
  settingsScreen.classList.remove('active');
  resetApiModelList();
  setApiPresetDrawer('');
});

// 设置界面 — 顶栏下方固定横向菜单切换（主API / 语音API / 生图API / 辅助功能）
document.querySelectorAll('#settingsSubnav .settings-subnav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var stab = this.dataset.stab;
    document.querySelectorAll('#settingsSubnav .settings-subnav-item').forEach(function(b) {
      b.classList.remove('active');
    });
    this.classList.add('active');
    document.querySelectorAll('#settingsScreen .settings-subpanel').forEach(function(panel) {
      panel.classList.toggle('active', panel.dataset.spanel === stab);
    });
    settingsScreen.querySelector('.settings-content').scrollTop = 0;
    if (stab !== 'main-api') setApiPresetDrawer('');
  });
});

// 眼睛图标切换
const eyeBtn  = document.getElementById('eyeBtn');
const apiKey  = document.getElementById('apiKey');
const apiUrlInput = document.getElementById('apiUrl');
const eyeIcon = document.getElementById('eyeIcon');

eyeBtn.addEventListener('click', function() {
  const isHidden = apiKey.type === 'password';
  apiKey.type = isHidden ? 'text' : 'password';
  eyeBtn.classList.toggle('visible', isHidden);
  eyeIcon.innerHTML = isHidden
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
});

const refreshBtn = document.getElementById('refreshBtn');
var apiModelRequest = 0;
var draftMealCode = '';

function resetApiModelList() {
  apiModelRequest++;
  refreshBtn.classList.remove('spinning');
  modelPopup.replaceChildren();
  setApiModelPopup(false);
}

function onApiConnectionEdit() {
  resetApiModelList();
  renderApiConnectionStatus();
}
apiUrlInput.addEventListener('input', onApiConnectionEdit);
apiKey.addEventListener('input', onApiConnectionEdit);

// 模型弹窗
const modelSelectBtn = document.getElementById('modelSelectBtn');
const modelPopup     = document.getElementById('modelPopup');
const modelDisplay   = document.getElementById('modelDisplay');
const modelChevron   = document.getElementById('modelChevron');

function setApiModelPopup(open) {
  modelPopup.classList.toggle('open', open);
  modelChevron.classList.toggle('open', open);
  modelSelectBtn.setAttribute('aria-expanded', String(open));
}
modelSelectBtn.addEventListener('click', function(event) {
  event.stopPropagation();
  if (modelPopup.children.length) setApiModelPopup(!modelPopup.classList.contains('open'));
  else refreshApiModels(true);
});
modelSelectBtn.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') setApiModelPopup(false);
});

function setDraftApiModel(model) {
  modelDisplay.textContent = model || '请选择模型';
  modelPopup.querySelectorAll('.model-popup-item').forEach(function(item) {
    item.classList.toggle('selected', item.dataset.model === model);
  });
  renderApiConnectionStatus();
}

document.addEventListener('click', function() {
  setApiModelPopup(false);
});

// 字体、钱包和世界书共用命名弹窗。
const presetModal     = document.getElementById('presetModal');
const modalCancel     = document.getElementById('modalCancel');
const modalConfirm    = document.getElementById('modalConfirm');
const presetNameInput = document.getElementById('presetNameInput');
var presetModalMode = '';
var apiPresets = mphoneStore.load('mphone_api_presets', []);
if (!Array.isArray(apiPresets)) apiPresets = [];
var fontPresets = mphoneStore.load('mphone_font_presets', []);

const apiPresetSelect = document.getElementById('apiPresetSelect');
const apiPresetList = document.getElementById('apiPresetList');
const apiPresetSelectedName = document.getElementById('apiPresetSelectedName');
var selectedApiPreset = -1;
var draftMealDirectId = '';
const apiPresetUpdate = document.getElementById('apiPresetUpdate');
const apiPresetRename = document.getElementById('apiPresetRename');
const apiPresetDelete = document.getElementById('apiPresetDelete');
const apiPresetInfo = document.getElementById('apiPresetInfo');
const apiPresetSaveMenu = document.getElementById('apiPresetSaveMenu');
const apiPresetSaveDrawer = document.getElementById('apiPresetSaveDrawer');
const apiPresetNameForm = document.getElementById('apiPresetNameForm');
const apiPresetNameInput = document.getElementById('apiPresetNameInput');
const apiPresetNameError = document.getElementById('apiPresetNameError');
var apiPresetDrawer = '';
const apiConnectionStatus = document.getElementById('apiConnectionStatus');

function apiConfig(url, key, model, temp) {
  var degrees = parseFloat(temp);
  return { url: url || '', key: key || '', model: model || '', temp: Number.isFinite(degrees) ? degrees : 0.8 };
}
function readDraftApiConfig() {
  var model = modelDisplay.textContent.trim();
  var cfg = apiConfig(apiUrlInput.value.trim(), apiKey.value.trim(), model === '请选择模型' ? '' : model, tempSlider.value);
  var direct = draftMealDirectId && apiPresets.find(preset => preset?.mealDirectId === draftMealDirectId);
  if (direct) Object.assign(cfg, { mealDirect: true, mealDirectId: draftMealDirectId, mealDirectLimit: direct.mealDirectLimit });
  return draftMealCode ? mealConfig(cfg, draftMealCode) : cfg;
}
function readAppliedApiConfig() {
  var cfg = apiConfig(mphoneStore.load('mphone_api_url', ''), mphoneStore.load('mphone_api_key', ''),
    mphoneStore.load('mphone_model', ''), mphoneStore.load('mphone_temperature', '0.80'));
  var directId = mphoneStore.load('mphone_api_meal_direct_id', '');
  if (directId) cfg.mealDirectId = directId;
  var code = mphoneStore.load('mphone_api_meal_code', '');
  return code ? mealConfig(cfg, code) : cfg;
}
function sameApiConfig(a, b) {
  return a.mealCode === b.mealCode && a.mealDirectId === b.mealDirectId && a.url === b.url && a.key === b.key && a.model === b.model && a.temp === b.temp;
}
function presetApiConfig(preset) {
  var cfg = apiConfig(preset.url, preset.key, preset.model, preset.temp);
  if (preset.mealDirectId) cfg.mealDirectId = preset.mealDirectId;
  return preset.mealCode ? mealConfig(cfg, preset.mealCode) : cfg;
}

function renderApiConnectionStatus() {
  var applied = readAppliedApiConfig();
  var dirty = !sameApiConfig(applied, readDraftApiConfig());
  var status = applied.model ? '默认模型：' + applied.model : '未应用默认模型';
  if (dirty) status += ' · 修改待应用';
  if (apiConnectionStatus.textContent !== status) apiConnectionStatus.textContent = status;
}

function apiPresetSummary(preset) {
  var base = (preset.model || '未选择模型') + ' · 温度 ' + presetApiConfig(preset).temp.toFixed(2);
  if (preset.mealDirect && preset.mealDirectLimit) {
    var usage = typeof mealDirectGetUsage === 'function' ? mealDirectGetUsage(preset) : null;
    if (usage) base += ' · 已用 ' + usage.used + '/' + usage.limit + ' 次';
  }
  return base;
}
function renderApiPresets(index) {
  if (index !== undefined) selectedApiPreset = index;
  var preset = apiPresets[selectedApiPreset];
  apiPresetSelectedName.textContent = preset ? preset.name : '选择预设';
  [apiPresetUpdate, apiPresetRename, apiPresetDelete].forEach(function(button) {
    button.disabled = !preset;
  });
  apiPresetInfo.textContent = preset ? apiPresetSummary(preset) : '';
  apiPresetList.replaceChildren();
  apiPresets.forEach(function(item, i) {
    if (!item || typeof item.name !== 'string') return;
    var option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('aria-pressed', String(i === selectedApiPreset));
    var name = document.createElement('span'), meta = document.createElement('span');
    name.textContent = item.name;
    meta.className = 'auto-hint';
    meta.textContent = apiPresetSummary(item);
    option.append(name, meta);
    option.addEventListener('click', function() {
      setDraftApiConfig(presetApiConfig(item));
      renderApiPresets(i);
      setApiPresetDrawer('');
      apiPresetSelect.focus();
    });
    apiPresetList.appendChild(option);
  });
  if (!apiPresetList.children.length) {
    var empty = document.createElement('div');
    empty.className = 'auto-hint';
    empty.textContent = '还没有预设。点保存图标，再选「另存为」。';
    apiPresetList.appendChild(empty);
  }
}
function saveApiPresets(index) {
  mphoneStore.save('mphone_api_presets', apiPresets);
  renderApiPresets(index);
}

function setDraftApiConfig(cfg) {
  resetApiModelList();
  draftMealCode = cfg.mealCode || '';
  draftMealDirectId = cfg.mealDirectId || '';
  apiUrlInput.value = draftMealCode ? '' : cfg.url;
  apiKey.value = draftMealCode ? '' : cfg.key;
  mealCheckConfig(draftMealCode);
  tempSlider.value = cfg.temp;
  setDraftApiModel(cfg.model);
  updateSliderThumb();
}
function restoreAppliedApiDraft() {
  var cfg = readAppliedApiConfig();
  setApiPresetDrawer('');
  setDraftApiConfig(cfg);
  renderApiPresets(apiPresets.findIndex(function(preset) {
    return preset && sameApiConfig(presetApiConfig(preset), cfg);
  }));
}
function applyApiConfig(cfg) {
  var claim = cfg.mealCode && mealActiveCredential(cfg.mealCode);
  if (cfg.mealCode && (!cfg.url || !claim || claim.state !== 'active' || claim.expires <= Date.now() || !claim.models.includes(cfg.model))) {
    showToast('兑换码已失效或尚未选择模型', 'plain');
    return;
  }
  cfg = mealPersistentConfig(cfg);
  if (cfg.mealCode) mphoneStore.save('mphone_api_meal_code', cfg.mealCode);
  else mphoneStore.remove('mphone_api_meal_code');
  if (cfg.mealDirectId) mphoneStore.save('mphone_api_meal_direct_id', cfg.mealDirectId);
  else mphoneStore.remove('mphone_api_meal_direct_id');
  mphoneStore.save('mphone_api_url', cfg.url);
  mphoneStore.save('mphone_api_key', cfg.key);
  mphoneStore.save('mphone_temperature', cfg.temp.toFixed(2));
  if (cfg.model) mphoneStore.save('mphone_model', cfg.model);
  else mphoneStore.remove('mphone_model');
  renderApiConnectionStatus();
  mphoneStore.flush().then(function() { showToast('✓ 主 API 配置已应用', 'success'); });
}
function setApiPresetDrawer(mode) {
  apiPresetDrawer = mode;
  apiPresetList.hidden = mode !== 'pick';
  apiPresetSelect.setAttribute('aria-expanded', String(mode === 'pick'));
  apiPresetSaveDrawer.hidden = mode !== 'save';
  apiPresetNameForm.hidden = mode !== 'rename' && mode !== 'copy';
  apiPresetSaveMenu.setAttribute('aria-expanded', String(mode === 'save' || mode === 'copy'));
  apiPresetRename.setAttribute('aria-expanded', String(mode === 'rename'));
  apiPresetNameError.textContent = '';
  apiPresetNameInput.removeAttribute('aria-invalid');
}

function editApiPresetName(mode, name) {
  setApiPresetDrawer(mode);
  apiPresetNameInput.value = name;
  apiPresetNameInput.setAttribute('aria-label', mode === 'rename' ? '修改预设名称' : '新预设名称');
  apiPresetNameInput.focus();
}

function closeApiPresetName() {
  var trigger = apiPresetDrawer === 'rename' ? apiPresetRename : apiPresetSaveMenu;
  setApiPresetDrawer('');
  trigger.focus();
}

apiPresetSelect.addEventListener('click', function() {
  setApiPresetDrawer(apiPresetDrawer === 'pick' ? '' : 'pick');
});
apiPresetList.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    setApiPresetDrawer('');
    apiPresetSelect.focus();
  }
});
apiPresetSaveMenu.addEventListener('click', function() {
  setApiPresetDrawer(apiPresetDrawer === 'save' || apiPresetDrawer === 'copy' ? '' : 'save');
});
apiPresetRename.addEventListener('click', function() {
  if (apiPresetDrawer === 'rename') { setApiPresetDrawer(''); return; }
  var preset = apiPresets[selectedApiPreset];
  if (preset) editApiPresetName('rename', preset.name);
});
document.getElementById('btnSavePreset').addEventListener('click', function() {
  editApiPresetName('copy', '');
});
document.getElementById('apiPresetNameCancel').addEventListener('click', closeApiPresetName);
apiPresetNameInput.addEventListener('input', function() {
  apiPresetNameError.textContent = '';
  apiPresetNameInput.removeAttribute('aria-invalid');
});
apiPresetNameForm.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeApiPresetName(); }
});

apiPresetUpdate.addEventListener('click', function() {
  var index = selectedApiPreset, preset = apiPresets[index];
  if (!preset) return;
  var cfg = readDraftApiConfig();
  Object.assign(preset, mealPersistentConfig(cfg), { temp: cfg.temp.toFixed(2) });
  if (!cfg.mealCode) delete preset.mealCode;
  if (!cfg.mealDirectId && preset.mealDirectId) {
    delete preset.mealDirectId;
    delete preset.mealDirectLimit;
    delete preset.mealDirect;
  }
  saveApiPresets(index);
  setApiPresetDrawer('');
  apiPresetSaveMenu.focus();
  showToast('✓ 已覆盖当前预设', 'success');
});

apiPresetNameForm.addEventListener('submit', function(event) {
  event.preventDefault();
  var renaming = apiPresetDrawer === 'rename';
  var index = renaming ? selectedApiPreset : -1;
  var preset = apiPresets[index];
  var name = apiPresetNameInput.value.trim();
  if (renaming && !preset) { closeApiPresetName(); return; }
  if (preset && name === preset.name) { closeApiPresetName(); return; }
  var error = !name ? '请输入预设名称' : '';
  if (name && apiPresets.some(function(item, i) { return i !== index && item && item.name === name; })) {
    error = '已有同名预设，换一个名字吧';
  }
  if (error) {
    apiPresetNameError.textContent = error;
    apiPresetNameInput.setAttribute('aria-invalid', 'true');
    apiPresetNameInput.focus();
    return;
  }

  if (renaming) {
    // 旧预设可能同名。角色原本跟随的是同名预设中的第一份。
    var linked = apiPresets.find(function(item) { return item && item.name === preset.name; }) === preset
      ? charList.filter(function(char) { return char.apiPresetName === preset.name; }) : [];
    preset.name = name;
    linked.forEach(function(char) { char.apiPresetName = name; });
    saveApiPresets(index);
    if (linked.length) saveCharList();
  } else {
    var cfg = readDraftApiConfig();
    apiPresets.push(Object.assign({ name: name }, mealPersistentConfig(cfg), { temp: cfg.temp.toFixed(2) }));
    saveApiPresets(apiPresets.length - 1);
  }
  closeApiPresetName();
  showToast(renaming ? '✓ 预设已重命名' : '✓ 已另存为预设', 'success');
});

apiPresetDelete.addEventListener('click', function() {
  var index = selectedApiPreset, preset = apiPresets[index];
  if (!preset) return;
  setApiPresetDrawer('');
  openConfirm('删除预设「' + preset.name + '」？', function() {
    apiPresets.splice(index, 1);
    saveApiPresets(-1);
    showToast('✓ 预设已删除', 'success');
  });
});

modalCancel.addEventListener('click', function() {
  presetModal.classList.remove('open');
});

// 字体预设：点击芯片 → 填入并应用；✕ 删除
function renderFontPresets() {
  var wrap = document.getElementById('fontPresetChips');
  wrap.innerHTML = '';
  fontPresets.forEach(function(fp, i) {
    var chip = document.createElement('span');
    chip.className = 'font-preset-chip';
    chip.title = fp.value;
    var label = document.createElement('span');
    label.textContent = fp.name;
    var del = document.createElement('button');
    del.className = 'font-preset-chip-del';
    del.textContent = '×';
    del.addEventListener('click', function(e) {
      e.stopPropagation();
      fontPresets.splice(i, 1);
      mphoneStore.save('mphone_font_presets', fontPresets);
      renderFontPresets();
    });
    chip.appendChild(label);
    chip.appendChild(del);
    chip.addEventListener('click', function() {
      fontInput.value = fp.value;
      fontApplyBtn.click();
    });
    wrap.appendChild(chip);
  });
}

modalConfirm.addEventListener('click', function() {
  var name = presetNameInput.value.trim();
  if (!name) {
    presetNameInput.classList.remove('shake');
    void presetNameInput.offsetWidth;
    presetNameInput.classList.add('shake');
    presetNameInput.addEventListener('animationend', function() {
      presetNameInput.classList.remove('shake');
    }, { once: true });
    return;
  }

  if (presetModalMode === 'wallet') {
    if (!confirmWalletTopup(name)) { shakeEl(presetNameInput); return; }
    presetModal.classList.remove('open');
    return;
  }

  if (presetModalMode === 'wbFolder') {
    presetModal.classList.remove('open');
    if (_wbFolderNameCb) _wbFolderNameCb(name);
    _wbFolderNameCb = null;
    return;
  }

  if (presetModalMode === 'font') {
    fontPresets.push({ name: name, value: fontInput.value.trim() });
    mphoneStore.save('mphone_font_presets', fontPresets);
    renderFontPresets();
    presetModal.classList.remove('open');
    showToast('✓ 已保存字体预设', 'success');
    return;
  }

});
closeOnBackdrop(presetModal);

// 温度滑条
const tempSlider       = document.getElementById('tempSlider');
const sliderThumb      = document.getElementById('sliderThumb');
const tempValueDisplay = document.getElementById('tempValueDisplay');

function updateSliderThumb() {
  const min = parseFloat(tempSlider.min);
  const max = parseFloat(tempSlider.max);
  const val = parseFloat(tempSlider.value);
  const pct = (val - min) / (max - min);
  // 滑块的触点宽 18px，中心在轨道两端内侧各 9px。
  sliderThumb.style.left = 'calc(' + (pct * 100) + '% + (' + (9 - pct * 18) + 'px))';
  tempValueDisplay.textContent = val.toFixed(2);
}

tempSlider.addEventListener('input', function() {
  updateSliderThumb();
  renderApiConnectionStatus();
});
