/* ============================================================
   供应链协同管理系统 v4 - 全面修复版
   修复：多行表头、多Sheet读取、可展开行、筛选排序、登录跳转
   ============================================================ */

// ===== 工具函数 =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function showToast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function debugLog(msg) {
  console.log(msg);
  const el = $('#debug-log');
  if (el) {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.textContent = '[' + time + '] ' + msg;
    line.style.marginBottom = '2px';
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
}

// 全屏加载遮罩（用于登录后首次从云端拉取，给大文件一个可见进度）
function showGlobalLoading(text, pct) {
  let wrap = $('#global-loading');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'global-loading';
    wrap.innerHTML = '<div class="global-loading-box"><div class="global-loading-title">⏳ 首次从云端同步数据</div><div class="global-loading-bar"><div id="global-loading-fill" style="width:0%"></div></div><div id="global-loading-text" class="global-loading-text">准备中...</div></div>';
    document.body.appendChild(wrap);
  }
  wrap.style.display = 'flex';
  updateGlobalLoading(text, pct);
}
function updateGlobalLoading(text, pct) {
  const txt = $('#global-loading-text');
  const fill = $('#global-loading-fill');
  if (txt) txt.textContent = text || '';
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
}
function hideGlobalLoading() {
  const wrap = $('#global-loading');
  if (wrap) wrap.style.display = 'none';
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 统一调整筛选面板位置：优先向下展开，空间不足则向上翻转；必要时限制最大高度并滚动
function fitFilterPanel(panel, btn, opts = {}) {
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
  panel.style.display = 'block';
  panel.style.position = 'fixed';
  panel.style.visibility = 'visible';
  panel.style.pointerEvents = 'auto';
  panel.style.zIndex = '4000';
  // 重置之前可能设置过的定位/高度
  panel.style.top = '';
  panel.style.bottom = '';
  panel.style.left = '';
  panel.style.right = '';
  panel.style.maxHeight = '';
  const maxPanelWidth = Math.min(360, window.innerWidth - 8);
  panel.style.maxWidth = maxPanelWidth + 'px';
  const rect = btn.getBoundingClientRect();
  const panelWidth = Math.min(panel.offsetWidth || 220, maxPanelWidth);
  let left = rect.left;
  if (left + panelWidth > window.innerWidth - 4) {
    left = Math.max(4, rect.right - panelWidth);
  }
  panel.style.left = left + 'px';
  const naturalHeight = panel.offsetHeight;
  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
  const spaceAbove = Math.max(0, rect.top - 8);
  const minHeight = opts.minHeight || 160;
  if (naturalHeight <= spaceBelow) {
    panel.style.top = (rect.bottom + 4) + 'px';
  } else if (naturalHeight <= spaceAbove) {
    panel.style.top = (rect.top - naturalHeight - 4) + 'px';
  } else if (spaceBelow >= spaceAbove) {
    panel.style.top = (rect.bottom + 4) + 'px';
    panel.style.maxHeight = Math.max(minHeight, spaceBelow) + 'px';
  } else {
    const h = Math.max(minHeight, spaceAbove);
    panel.style.top = (rect.top - h - 4) + 'px';
    panel.style.maxHeight = h + 'px';
  }
}

// 用于 onclick="fn('...')" 内部字符串转义：避免 buyer/sku 中的 ' 或 \ 破坏 JS 语法
function escapeJsString(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
}

// 清洗“渠道”列：只保留“渠道+数字”前缀，防止多行表头把“渠道1-8EV6-D-否-否-海外仓”这类合并值读进来。
function cleanChannelName(s) {
  const str = String(s || '').trim();
  const m = str.match(/^(渠道\d+)/);
  return m ? m[1] : str;
}

// 兼容各种列名/大小写，从供应商行中取出“品类”值。
// 优先用映射后的 r.category；若为空，再直接扫描 NS名称/NS品类/品类名称/品类 等原始字段
// （解决 getField 对“NS名称”大小写（NS vs ns）不匹配导致 r.category 取不到值的问题）。
function rowCategoryOf(r) {
  if (!r) return '';
  const direct = ['category', 'NS名称', 'ns名称', 'NS品类', 'ns品类', '品类名称', '品类', '类目', '产品类目', '产品类别', '类别'];
  for (const k of direct) {
    if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return String(r[k]).trim();
  }
  const matchKey = (h) => {
    const n = normalizeText(h);
    return n.includes('ns名称') || n.includes('品类') || n.includes('类目') || n.includes('类别') || n.includes('category');
  };
  if (r._raw) {
    for (const h in r._raw) {
      if (matchKey(h) && r._raw[h] !== undefined && r._raw[h] !== null && String(r._raw[h]).trim() !== '') {
        return String(r._raw[h]).trim();
      }
    }
  }
  for (const k in r) {
    if (k.startsWith('_')) continue;
    if (matchKey(k) && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return String(r[k]).trim();
  }
  return '';
}

// 数据版本：每次部署大版本升级时自动清空旧 localStorage，避免旧解析数据导致字段显示为空
const APP_DATA_VERSION = '20260907v75';
// 代码版本：仅用于控制台确认用户加载到的是哪一版，不触发 localStorage 清空
const APP_CODE_VERSION = '20260909v253';
console.log('[App] code version:', APP_CODE_VERSION);
(function checkDataVersion() {
  try {
    const key = 'sku_app_data_version';
    const stored = localStorage.getItem(key);
    if (stored !== APP_DATA_VERSION) {
      // 保留用户设置类 key；上传日期随数据一起清空，升级后首次进入会提示重新上传
      // 保留用户设置类 + 小配置表（人员/更新时间/催更）：这些体量小可由云端恢复，避免升级后界面空白
      // 保留用户设置类 + 小配置表（人员/更新时间/催更）+ sales/delivery 本地缓存：
      // sales/delivery 均已改为云端同步，但保留本地缓存避免升级时短暂空白，登录后自动轮询/刷新会同步最新。
      const keepKeys = ['skuv2_purchase_pwd', 'skuv2_supabase', 'skuv2_sync_sel', 'skuv2_personnel', 'skuv2_update_times', 'skuv2_nags',
        'skuv2_data_delivery', 'skuv2_data_sales', 'skuv2_last_upload_delivery', 'skuv2_last_upload_sales'];
      const saved = {};
      keepKeys.forEach(k => { try { saved[k] = localStorage.getItem(k); } catch (e) {} });
      Object.keys(localStorage).forEach(k => { if (k.startsWith('skuv2_')) localStorage.removeItem(k); });
      Object.entries(saved).forEach(([k, v]) => { if (v !== null) try { localStorage.setItem(k, v); } catch (e) {} });
      localStorage.setItem(key, APP_DATA_VERSION);
      console.log('[App] 版本升级，已清空旧缓存但保留密码/同步配置，请重新上传文件');
    }
  } catch (e) { console.warn('[App] 版本检查失败', e); }
})();

// 彻底清理已下线的「国内即时库存」残留本地数据（云端已于新项目重建为空）
try { localStorage.removeItem('skuv2_data_domestic_inventory'); } catch (e) {}

// 支持负责人字段里多个名字用逗号/斜杠/换行分隔的情况
function nameMatches(fieldValue, name) {
  if (!fieldValue || !name) return false;
  const nameNorm = normalizeText(name);
  return String(fieldValue).split(/[,，、/\n]+/).some(n => normalizeText(n.trim()) === nameNorm);
}

// 采购员字段「精确等于」匹配：与 Excel 按采购员筛选的「等于」行为一致，
// 不再按逗号/斜杠/换行拆分做包含匹配（避免「钱芷薇,张三」这类多人共管行被同时计入两人看板）。
// 仅用于采购看板的 buyer 过滤；运营/计划端仍用 nameMatches 支持多人共管。
function buyerExact(buyer, name) {
  if (!buyer || !name) return false;
  return normalizeText(String(buyer).trim()) === normalizeText(String(name).trim());
}

// 统一日期格式为 2026/6/8（采购交期专用）
// monthHint: 可选参数，指定该字段所属月份(8/9/10)，用于把1-31的短数字也识别为日期
function excelDateToText(val, monthHint) {
  if (val === null || val === undefined || val === '') return '';
  // 0 或 '0' 视为空（业务：交期为0表示无交期）
  const numTest = parseFloat(String(val).trim());
  if (!isNaN(numTest) && numTest === 0) return '';
  if (val instanceof Date) {
    return val.getFullYear() + '/' + (val.getMonth() + 1) + '/' + val.getDate();
  }
  const s = String(val).trim();
  const year = 2026; // 业务年份固定为2026
  // 已经是目标格式 2026/6/8 或 2026-6-8
  const m0 = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m0) return parseInt(m0[1]) + '/' + parseInt(m0[2]) + '/' + parseInt(m0[3]);
  // 形如 6/8/26、6-8-26、06/08/26（默认20XX年）
  const m0a = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
  if (m0a) return '20' + parseInt(m0a[3]) + '/' + parseInt(m0a[1]) + '/' + parseInt(m0a[2]);
  // 形如 "6-8" 或 "6/8"
  const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})$/);
  if (m1) return year + '/' + parseInt(m1[1]) + '/' + parseInt(m1[2]);
  // 形如 "6月8日" 或 "6月8"
  const m2 = s.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (m2) return year + '/' + parseInt(m2[1]) + '/' + parseInt(m2[2]);
  // 形如 "2026年6月8日"
  const m3 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (m3) return parseInt(m3[1]) + '/' + parseInt(m3[2]) + '/' + parseInt(m3[3]);
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  // Excel日期序列号合理范围（2009年~2036年）
  if (n >= 39000 && n <= 60000 && n === Math.floor(n)) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    if (!isNaN(d.getTime())) return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  // 短数字1-31 + 指定月份 -> 视为2026年当月日期
  if (n >= 1 && n <= 31 && n === Math.floor(n) && monthHint) {
    return year + '/' + monthHint + '/' + n;
  }
  return s;
}

// ===== 屏幕切换 =====
function clearSessionState() {
  try {
    sessionStorage.removeItem('skuv2_last_screen');
    sessionStorage.removeItem('skuv2_last_role');
    sessionStorage.removeItem('skuv2_last_user');
    sessionStorage.removeItem('skuv2_admin_auth');
  } catch (e) {}
}

const Screen = {
  current: '',
  show(id) {
    this.current = id;
    $$('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
    const target = $('#' + id);
    if (target) {
      target.classList.add('active');
      target.style.display = (id === 'screen-role') ? 'flex' : 'block';
      target.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (id === 'screen-role') { renderLeaderboard('all'); startRoleAnimation(); }
    // 切回角色/登录页时恢复登录按钮，避免“正在进入...”卡住
    if (id === 'screen-role' || id === 'screen-name-login') resetLoginButtonState();
    // 记录/清理刷新后恢复状态
    try {
      if (id === 'screen-role') {
        clearSessionState();
      } else {
        sessionStorage.setItem('skuv2_last_screen', id);
        if (currentRole) sessionStorage.setItem('skuv2_last_role', currentRole);
        if (currentUserName) sessionStorage.setItem('skuv2_last_user', currentUserName);
        if (id === 'screen-admin') sessionStorage.setItem('skuv2_admin_auth', '1');
      }
    } catch (e) {}
  }
};

// ===== 排行榜：Hero 右上角今日榜 + 角色区下方昨日榜 =====
function renderLeaderboard(mode) {
  mode = mode || 'all';
  // 刷新数据更新时间（Hero 容器）
  const d = Store.getLastUpdateDate();
  const dateText = d || '--';
  const homeDate = $('#home-update-date');
  if (homeDate) homeDate.textContent = dateText;
  const yesterday = Store.nagLeaderboard('yesterday');
  const today = Store.nagLeaderboard('today');

  const renderBoard = (entries, label, icon, theme) => {
    if (entries.length === 0) return `<div class="leaderboard-card ${theme}"><div class="leaderboard-card-title"><span class="leaderboard-icon">${icon}</span>${label}</div><div class="leaderboard-empty">暂无数据</div></div>`;
    const top3 = entries.slice(0, 3);
    const rest = entries.slice(3, 10);
    const rankColor = ['gold', 'silver', 'bronze'];
    const podium = top3.map((e, i) => {
      const name = escapeHtml(e[0]); const count = e[1];
      const isFirst = i === 0;
      return `<div class="podium-item podium-${rankColor[i]} ${isFirst ? 'podium-first' : ''}">
        <div class="podium-rank">${isFirst ? '👑' : ['🥇', '🥈', '🥉'][i]}</div>
        <div class="podium-info">
          <div class="podium-name">${name}</div>
          <div class="podium-count">${count}${isFirst ? '<span>次</span>' : ''}</div>
        </div>
      </div>`;
    }).join('');
    const list = rest.map((e, i) => {
      const name = escapeHtml(e[0]); const count = e[1];
      const rank = i + 4;
      return `<div class="leader-row"><span class="leader-row-rank">${rank}</span><span class="leader-row-name">${name}</span><span class="leader-row-count">${count}</span></div>`;
    }).join('');
    return `<div class="leaderboard-card ${theme}">
      <div class="leaderboard-card-title"><span class="leaderboard-icon">${icon}</span>${label}</div>
      <div class="leaderboard-podium">${podium}</div>
      ${rest.length ? `<div class="leaderboard-list">${list}</div>` : ''}
    </div>`;
  };

  // Hero 区：今日榜
  const todayHtml = '<div class="leaderboards-row">' +
    renderBoard(today.buyers, '今日人气王', '🔥', 'theme-red') +
    renderBoard(today.users, '今日催更王', '⚡', 'theme-yellow') +
    '</div>';
  const heroEl = $('#home-hero-leaderboard');
  if (heroEl) heroEl.innerHTML = todayHtml;

  // 角色选择区下方：昨日榜
  const yesterdayHtml = '<div class="leaderboards-row">' +
    renderBoard(yesterday.buyers, '昨日人气王', '🔥', 'theme-red') +
    renderBoard(yesterday.users, '昨日催更王', '⚡', 'theme-yellow') +
    '</div>';
  const yesterdayEl = $('#home-yesterday-leaderboard');
  if (yesterdayEl) yesterdayEl.innerHTML = yesterdayHtml;
}

// ===== 弹窗 =====
const Modal = {
  show(title, bodyHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-overlay').style.display = 'flex';
  },
  close() { $('#modal-overlay').style.display = 'none'; }
};

// ===== 批量 SKU 搜索（三端通用，弹窗粘贴多个 SKU，"或"关系精确匹配渠道 SKU）=====
function parseSkuList(text) {
  return [...new Set(
    (text || '').split(/[\n,，;；\t\s]+/).map(s => normalizeText(s)).filter(Boolean)
  )];
}

function openSkuBatchModal(uiName) {
  const ui = window[uiName];
  if (!ui) return;
  const existing = (ui.skuBatchSet && ui.skuBatchSet.size) ? [...ui.skuBatchSet].join('\n') : '';
  const body = `
    <p style="margin:0 0 10px;color:var(--text-muted);font-size:13px">每行一个 SKU，或用逗号 / 空格分隔，可一次性粘贴多个 SKU 进行批量筛选（"或"关系，精确匹配渠道 SKU）。</p>
    <textarea id="sku-batch-input" style="width:100%;min-height:220px;font-size:14px;line-height:1.7;padding:10px;border-radius:8px;border:1px solid var(--border);font-family:inherit" placeholder="可粘贴 Excel 列，例如：&#10;SKUA001&#10;SKUA002&#10;SKUA003">${escapeHtml(existing)}</textarea>
    <div id="sku-batch-count" style="margin-top:8px;font-size:12px;color:var(--text-muted)"></div>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-sm" onclick="Modal.close()">取消</button>
      <button class="btn-sm" onclick="clearSkuBatch('${uiName}')">清除批量</button>
      <button class="btn-primary btn-sm" onclick="applySkuBatch('${uiName}')">确定筛选</button>
    </div>`;
  Modal.show('批量搜索 SKU', body);
  const ta = document.getElementById('sku-batch-input');
  if (ta) {
    ta.addEventListener('input', () => {
      const n = parseSkuList(ta.value).length;
      const c = document.getElementById('sku-batch-count');
      if (c) c.textContent = n > 0 ? ('已识别 ' + n + ' 个 SKU') : '';
    });
    ta.focus();
  }
}

function applySkuBatch(uiName) {
  const ta = document.getElementById('sku-batch-input');
  if (!ta) return;
  const list = parseSkuList(ta.value);
  const ui = window[uiName];
  if (ui) ui.skuBatchSet = new Set(list);
  const inputIds = { PlanUI: ['plan-search-sku'], OperationUI: ['op-search-sku'], PurchaseUI: ['purchase-search-sku', 'purchase-replenish-search-sku'] }[uiName] || [];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.placeholder = '已选 ' + list.length + ' 个SKU（批量）'; }
  });
  Modal.close();
  if (uiName === 'PlanUI') ui.renderOverview();
  else if (uiName === 'OperationUI') ui.renderTable();
  else if (uiName === 'PurchaseUI') { ui.renderSupplier(); ui.renderReplenish(); }
  showToast('已按 ' + list.length + ' 个 SKU 批量筛选', 'success');
}

function clearSkuBatch(uiName) {
  const ui = window[uiName];
  if (ui) ui.skuBatchSet = new Set();
  const inputIds = { PlanUI: ['plan-search-sku'], OperationUI: ['op-search-sku'], PurchaseUI: ['purchase-search-sku', 'purchase-replenish-search-sku'] }[uiName] || [];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.placeholder = '🔍 搜索SKU'; }
  });
  Modal.close();
  if (uiName === 'PlanUI') ui.renderOverview();
  else if (uiName === 'OperationUI') ui.renderTable();
  else if (uiName === 'PurchaseUI') { ui.renderSupplier(); ui.renderReplenish(); }
  showToast('已清除 SKU 批量筛选', 'success');
}

window.openSkuBatchModal = openSkuBatchModal;
window.applySkuBatch = applySkuBatch;
window.clearSkuBatch = clearSkuBatch;

// ===== 使用说明（管理员可编辑，实时同步云端，所有用户共用同一份）=====
const USAGE_GUIDE_KEY = 'skuv2_usage_guide';
const USAGE_GUIDE_DEFAULT = [
  '1. 鼠标移动到表头即可点击筛选',
  '2. 供应商库存即为现货库存',
  '3. 国内订单指采购下在供应商的订单，物流未处理部分包括在内',
].join('\n');

function getUsageGuide() {
  try {
    const v = localStorage.getItem(USAGE_GUIDE_KEY);
    if (v) return v;
  } catch (e) {}
  return USAGE_GUIDE_DEFAULT;
}

function formatUsageGuide(text) {
  const items = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return '<p style="color:var(--text-muted)">（暂无说明）</p>';
  return '<div class="usage-guide-list">' + items.map(s => `<p style="margin:6px 0;line-height:1.7">${escapeHtml(s)}</p>`).join('') + '</div>';
}

function showUsageGuide() {
  Modal.show('使用说明', formatUsageGuide(getUsageGuide()));
}

// 管理员：编辑使用说明并保存到云端
function editUsageGuide() {
  const current = getUsageGuide();
  const bodyHtml = `
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">每行一条，保存后所有用户打开「使用说明」都会看到最新内容（实时同步云端）。</p>
    <textarea id="usage-guide-editor" style="width:100%;min-height:160px;font-size:14px;line-height:1.7;padding:10px;border-radius:8px;border:1px solid var(--border);font-family:inherit">${escapeHtml(current)}</textarea>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-sm" onclick="Modal.close()">取消</button>
      <button class="btn-primary btn-sm" onclick="saveUsageGuide()">保存并同步云端</button>
    </div>`;
  Modal.show('编辑使用说明', bodyHtml);
}

function saveUsageGuide() {
  const ta = document.getElementById('usage-guide-editor');
  const text = ta ? ta.value : '';
  try { localStorage.setItem(USAGE_GUIDE_KEY, text); } catch (e) {}
  if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
    Sync.push('usage_guide', text).then(ok => {
      showToast(ok ? '✓ 使用说明已保存并同步云端' : '已保存到本机，但云端同步失败', ok ? 'success' : 'warn');
    });
  } else {
    showToast('已保存到本机（未配置云端，不会同步到其他设备）', 'warn');
  }
  // 若说明弹框正打开，立即刷新内容
  Modal.show('使用说明', formatUsageGuide(text));
}

// 启动后尝试从云端拉取最新说明覆盖本地（失败则保留本地）
function loadUsageGuideFromCloud() {
  if (typeof Sync === 'undefined' || !Sync.enabled || !Sync.client) return;
  Sync._pullType('usage_guide').then(payload => {
    if (payload == null) return;
    try { localStorage.setItem(USAGE_GUIDE_KEY, payload); } catch (e) {}
  }).catch(() => {});
}

// 使用说明函数需挂到 window，才能被 index.html 的内联 onclick 调用
window.getUsageGuide = getUsageGuide;
window.formatUsageGuide = formatUsageGuide;
window.showUsageGuide = showUsageGuide;
window.editUsageGuide = editUsageGuide;
window.saveUsageGuide = saveUsageGuide;
window.loadUsageGuideFromCloud = loadUsageGuideFromCloud;

// ===== 采购页滚动条公告（管理员可编辑，实时同步云端，所有采购员共用同一份）=====
const ANNOUNCEMENT_KEY = 'skuv2_announcement';
const ANNOUNCEMENT_DEFAULT = '请各位采购员注意！本次只看减震器、大灯、半轴、后视镜、转向器、控制臂、散热器、卡钳、尾灯';

function getAnnouncement() {
  try {
    const v = localStorage.getItem(ANNOUNCEMENT_KEY);
    if (v) return v;
  } catch (e) {}
  return ANNOUNCEMENT_DEFAULT;
}

// 把 ISO 时间格式化成「2026-08-19 16:45」
function formatUpdateTimeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 生成滚动条 DOM；text 为滚动文本，icon 为左侧图标
function buildMarqueeHtml(text, icon) {
  const safe = escapeHtml(text);
  // 初始 4 个副本，initMarquee 会按视口宽度自动克隆到足够多，确保无缝滚动
  const items = Array(4).fill(`<span class="marquee-item">${safe}</span>`).join('');
  return `<div class="marquee" onclick="toggleMarquee(this)" title="点击暂停 / 继续">
    <span class="marquee-icon">${icon}</span>
    <div class="marquee-viewport"><div class="marquee-track">${items}</div></div>
    <span class="marquee-hint">点击暂停</span>
  </div>`;
}

// 根据实际视口宽度补充副本，保证内容足够覆盖 2 倍视口，滚动无缝且不突然消失
function initMarquee(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    const viewport = el.querySelector('.marquee-viewport');
    const track = el.querySelector('.marquee-track');
    if (!viewport || !track) return;
    let safety = 0;
    while (track.scrollWidth < viewport.clientWidth * 2 && safety < 8) {
      Array.from(track.children).forEach(c => track.appendChild(c.cloneNode(true)));
      safety++;
    }
    // 速度约 70px/s，最短 10s，避免太慢
    const duration = Math.max(track.scrollWidth / 70, 10);
    track.style.animationDuration = duration + 's';
  });
}

function renderPurchaseMarquee() {
  const el = document.getElementById('purchase-marquee');
  if (el) {
    el.innerHTML = buildMarqueeHtml(getAnnouncement(), '📢');
    initMarquee(el);
  }
}

// 点击滚动条：暂停 / 继续
function toggleMarquee(el) {
  if (!el) return;
  el.classList.toggle('paused');
}

// 管理员：编辑采购滚动条公告并保存到云端
function editAnnouncement() {
  const current = getAnnouncement();
  const bodyHtml = `
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">采购页顶部滚动条内容。保存后所有采购员打开页面都会看到最新内容（实时同步云端）。</p>
    <textarea id="announcement-editor" style="width:100%;min-height:120px;font-size:14px;line-height:1.7;padding:10px;border-radius:8px;border:1px solid var(--border);font-family:inherit">${escapeHtml(current)}</textarea>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-sm" onclick="Modal.close()">取消</button>
      <button class="btn-primary btn-sm" onclick="saveAnnouncement()">保存并同步云端</button>
    </div>`;
  Modal.show('编辑采购滚动条公告', bodyHtml);
}

function saveAnnouncement() {
  const ta = document.getElementById('announcement-editor');
  const text = ta ? ta.value : '';
  try { localStorage.setItem(ANNOUNCEMENT_KEY, text); } catch (e) {}
  if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
    Sync.push('announcement', text).then(ok => {
      showToast(ok ? '✓ 采购滚动条公告已保存并同步云端' : '已保存到本机，但云端同步失败', ok ? 'success' : 'warn');
    });
  } else {
    showToast('已保存到本机（未配置云端，不会同步到其他设备）', 'warn');
  }
  renderPurchaseMarquee();
  Modal.close();
}

// 启动后尝试从云端拉取最新公告覆盖本地（失败则保留本地）
function loadAnnouncementFromCloud() {
  if (typeof Sync === 'undefined' || !Sync.enabled || !Sync.client) return;
  Sync._pullType('announcement').then(payload => {
    if (payload == null) return;
    try { localStorage.setItem(ANNOUNCEMENT_KEY, payload); } catch (e) {}
    renderPurchaseMarquee();
  }).catch(() => {});
}

window.getAnnouncement = getAnnouncement;
window.editAnnouncement = editAnnouncement;
window.saveAnnouncement = saveAnnouncement;
window.loadAnnouncementFromCloud = loadAnnouncementFromCloud;
window.renderPurchaseMarquee = renderPurchaseMarquee;
window.renderOperationAnnouncement = renderOperationAnnouncement;
window.toggleMarquee = toggleMarquee;

// ===== 运营页滚动条公告（管理员可编辑，实时同步云端，所有运营共用同一份）=====
const OP_ANNOUNCEMENT_KEY = 'skuv2_op_announcement';
const OP_ANNOUNCEMENT_DEFAULT = '欢迎登录运营工作台。数据以最新上传的销量库存大表为准，如有异常请联系管理员。';

function getOperationAnnouncement() {
  try {
    const v = localStorage.getItem(OP_ANNOUNCEMENT_KEY);
    if (v) return v;
  } catch (e) {}
  return OP_ANNOUNCEMENT_DEFAULT;
}

function renderOperationAnnouncement() {
  const el = document.getElementById('operation-announcement-marquee');
  if (el) {
    el.innerHTML = buildMarqueeHtml(getOperationAnnouncement(), '📢');
    initMarquee(el);
  }
}

// 管理员：编辑运营滚动条公告并保存到云端
function editOperationAnnouncement() {
  const current = getOperationAnnouncement();
  const bodyHtml = `
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">运营页顶部滚动条内容。保存后所有运营打开页面都会看到最新内容（实时同步云端）。</p>
    <textarea id="op-announcement-editor" style="width:100%;min-height:120px;font-size:14px;line-height:1.7;padding:10px;border-radius:8px;border:1px solid var(--border);font-family:inherit">${escapeHtml(current)}</textarea>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn-sm" onclick="Modal.close()">取消</button>
      <button class="btn-primary btn-sm" onclick="saveOperationAnnouncement()">保存并同步云端</button>
    </div>`;
  Modal.show('编辑运营滚动条公告', bodyHtml);
}

function saveOperationAnnouncement() {
  const ta = document.getElementById('op-announcement-editor');
  const text = ta ? ta.value : '';
  try { localStorage.setItem(OP_ANNOUNCEMENT_KEY, text); } catch (e) {}
  if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
    Sync.push('op_announcement', text).then(ok => {
      showToast(ok ? '✓ 运营滚动条公告已保存并同步云端' : '已保存到本机，但云端同步失败', ok ? 'success' : 'warn');
    });
  } else {
    showToast('已保存到本机（未配置云端，不会同步到其他设备）', 'warn');
  }
  renderOperationAnnouncement();
  Modal.close();
}

// 启动后尝试从云端拉取最新运营公告覆盖本地（失败则保留本地）
function loadOperationAnnouncementFromCloud() {
  if (typeof Sync === 'undefined' || !Sync.enabled || !Sync.client) return;
  Sync._pullType('op_announcement').then(payload => {
    if (payload == null) return;
    try { localStorage.setItem(OP_ANNOUNCEMENT_KEY, payload); } catch (e) {}
    renderOperationAnnouncement();
  }).catch(() => {});
}

window.getOperationAnnouncement = getOperationAnnouncement;
window.editOperationAnnouncement = editOperationAnnouncement;
window.saveOperationAnnouncement = saveOperationAnnouncement;
window.loadOperationAnnouncementFromCloud = loadOperationAnnouncementFromCloud;
window.renderOperationAnnouncement = renderOperationAnnouncement;

// ===== 分页 =====
const PAGE_SIZE = 20;

function renderPagination(containerId, total, currentPage, onPageChange) {
  const el = $('#' + containerId);
  if (!el) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) {
    el.innerHTML = `<div class="pagination"><span class="page-info">共 ${total} 条</span></div>`;
    return;
  }
  let html = '<div class="pagination">';
  html += `<button class="page-btn" ${currentPage <= 0 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">上一页</button>`;
  const start = Math.max(0, currentPage - 3);
  const end = Math.min(totalPages, start + 7);
  for (let i = start; i < end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i + 1}</button>`;
  }
  html += `<button class="page-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">下一页</button>`;
  html += `<span class="page-info">第 ${currentPage + 1}/${totalPages} 页 (共${total}条)</span>`;
  html += '</div>';
  el.innerHTML = html;
}

function getPageData(data, page) {
  const start = page * PAGE_SIZE;
  return data.slice(start, start + PAGE_SIZE);
}

// ===== Supabase 线上同步层（Sync） =====
// 配置来自管理员面板保存的 skuv2_supabase {url,key}
// 表: sku_sync(type text pk, payload jsonb, updated_at timestamptz)

// 可同步的表格清单（key 与 Store/云端 type 对应）
// localOnly=true 的表是本地大表，不上云、不自动拉取，需手动上传（当前无此类表）。
// 销量库存大表（sales）已改为云端同步+增量更新：管理员统一上传后按渠道/SKU/FBA/组合/PO/国家合并，运营/计划/采购自动拉取。
const SYNC_TYPES = [
  { key: 'sales', label: '销量库存大表（云端同步·增量更新）' },
  { key: 'delivery', label: '发货明细（可云端同步）', defaultOff: true },
  { key: 'supplier', label: '供应商追踪' },
  { key: 'cancel', label: '取消/退货' },
  { key: 'replenish', label: '补货' },
  { key: 'supply', label: '供货' },
  { key: 'goods', label: '货品表' },
  { key: 'whitelist', label: '白名单' },
  { key: 'personnel', label: '人员名单' },
  { key: 'update_times', label: '更新时间' },
  { key: 'nags', label: '催更/排行榜' },
  { key: 'purchase_pwd', label: '采购密码（云端为准）' },
  { key: 'usage_guide', label: '使用说明' },
  { key: 'delivery_first', label: '发货明细第一版', hidden: true }, // 隐藏：首次上传的 delivery 快照
  { key: 'delivery_diff', label: '发货差异基线', hidden: true },   // 隐藏：最新版与第一版的差异地图
  { key: 'supplier_meta', label: '供应商上传批次(系统)', hidden: true }, // 隐藏：记录各采购员最近一次上传 supplier 的批次号
];

// 用户选择要同步的表格（持久化在 localStorage: skuv2_sync_sel）
const SyncSel = {
  load() {
    const defaults = SYNC_TYPES.filter(t => !t.localOnly && !t.hidden && !t.defaultOff).map(t => t.key);
    const hidden = SYNC_TYPES.filter(t => t.hidden).map(t => t.key);
    try {
      const raw = localStorage.getItem('skuv2_sync_sel');
      if (raw) {
        const a = JSON.parse(raw);
        if (Array.isArray(a)) {
          // 保留用户已勾选的可同步项；当某个表从 localOnly 改为可同步（如 delivery）时，自动加入默认列表
          const userSel = a.filter(k => !SYNC_TYPES.find(t => t.key === k && t.localOnly));
          return [...new Set([...defaults, ...hidden, ...userSel])];
        }
      }
    } catch (e) {}
    return [...new Set([...defaults, ...hidden])]; // 默认全选（不含 localOnly，隐藏类型强制包含）
  },
  save(arr) { localStorage.setItem('skuv2_sync_sel', JSON.stringify(arr)); },
};

const Sync = {
  enabled: false,
  client: null,
  _syncing: false,
  _syncQueue: [],

  // 该表格是否被用户勾选为要同步（未勾选则不传云端，也不自动同步）
  shouldSync(type) {
    const def = SYNC_TYPES.find(t => t.key === type);
    if (def && def.localOnly) return false; // 本地大表永不上云
    if (def && def.hidden) return true;      // 隐藏类型（差异基线）始终同步
    try {
      const raw = localStorage.getItem('skuv2_sync_sel');
      if (!raw) return !def || (!def.localOnly && !def.defaultOff);
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.includes(type) : true;
    } catch (e) { return !def || (!def.localOnly && !def.defaultOff); }
  },

  init() {
    this.enabled = false;
    let conf = localStorage.getItem('skuv2_supabase');

    // 如果存在内置共享配置，且与本地保存的不一致，自动切换到最新内置配置。
    // 这能避免"换了新项目但浏览器 localStorage 还存旧项目"导致的 CORS/超时问题。
    const builtIn = (typeof window.APP_SUPABASE === 'object' && window.APP_SUPABASE) ? window.APP_SUPABASE : null;
    if (builtIn && builtIn.url && builtIn.key) {
      try {
        const local = conf ? JSON.parse(conf) : null;
        if (!local || local.url !== builtIn.url || local.key !== builtIn.key) {
          conf = JSON.stringify({ url: builtIn.url, key: builtIn.key });
          localStorage.setItem('skuv2_supabase', conf);
          debugLog('[Sync] 本地旧配置与内置配置不一致，已自动切换到新项目: ' + builtIn.url);
          if (typeof showToast === 'function') showToast('已自动切换到最新云端配置', 'info');
        }
      } catch (e) { /* ignore invalid local conf */ }
    }

    if (!conf) {
      // 没有本地配置时，回退到内置共享配置（让任意电脑打开链接即可连云端）
      if (builtIn && builtIn.url && builtIn.key && typeof supabase !== 'undefined') {
        if (!this.client || this._lastUrl !== builtIn.url || this._lastKey !== builtIn.key) {
          this._lastUrl = builtIn.url;
          this._lastKey = builtIn.key;
          this.client = supabase.createClient(builtIn.url, builtIn.key);
        }
        this.enabled = true;
        debugLog('[Sync] 已用内置共享配置启用');
      }
      return this.enabled;
    }
    try {
      const c = JSON.parse(conf);
      if (c.url && c.key && typeof supabase !== 'undefined') {
        // 避免重复创建 client 导致 Multiple GoTrueClient 警告
        if (!this.client || this._lastUrl !== c.url || this._lastKey !== c.key) {
          this._lastUrl = c.url;
          this._lastKey = c.key;
          this.client = supabase.createClient(c.url, c.key);
        }
        this.enabled = true;
        debugLog('[Sync] 已启用，url=' + c.url);
      } else if (!c.url || !c.key) {
        debugLog('[Sync] 配置不完整，未启用');
      } else {
        debugLog('[Sync] supabase SDK 未加载，未启用');
      }
    } catch (e) {
      debugLog('[Sync] init 失败: ' + e.message);
    }
    return this.enabled;
  },

  // 串行化所有 push/pushAll，防止上传文件自动同步和手动一键同步并发导致 chunks 主键冲突
  async _runLocked(fn) {
    if (this._syncing) {
      return new Promise(resolve => this._syncQueue.push({ fn, resolve }));
    }
    this._syncing = true;
    // 安全网：如果某个请求异常挂死（如 CORS 失败但未触发 finally），30 秒后强制释放锁
    const lockTimer = setTimeout(() => {
      console.warn('[Sync] 同步锁保护超时，强制释放');
      this._syncing = false;
      const next = this._syncQueue.shift();
      if (next) this._runLocked(next.fn).then(next.resolve);
    }, 30000);
    try {
      return await fn();
    } finally {
      clearTimeout(lockTimer);
      this._syncing = false;
      const next = this._syncQueue.shift();
      if (next) this._runLocked(next.fn).then(next.resolve);
    }
  },

  // 统一超时包装：Supabase 请求超过 N 毫秒未响应立即失败，避免浏览器长时间 pending
  _withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const sec = (ms / 1000).toFixed(0);
      const timer = setTimeout(() => {
        reject(new Error(label + ' 请求超时（' + sec + '秒无响应），请检查 Supabase URL/Key 或网络'));
      }, ms);
      promise.then(
        res => { clearTimeout(timer); resolve(res); },
        err => { clearTimeout(timer); reject(err); }
      );
    });
  },

  // 带指数退避的 upsert 重试；Supabase 免费实例偶发 statement timeout，重试可显著降低失败率
  async _upsertWithRetry(table, rows, onConflict, timeoutMs, label) {
    let lastErr = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const { error } = await this._withTimeout(
          this.client.from(table).upsert(rows, { onConflict }),
          timeoutMs,
          label + (attempt > 0 ? '（重试' + attempt + '）' : '')
        );
        if (error) throw error;
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  },

  // 将大数组拆成多块，每块 JSON 字符串控制在 maxSize 以内
  _chunkArray(arr, maxSize) {
    const chunks = [];
    let current = [];
    let currentSize = 2; // "[]"
    for (const item of arr) {
      const itemSize = JSON.stringify(item).length;
      if (current.length > 0 && currentSize + itemSize + 1 > maxSize) {
        chunks.push(current);
        current = [item];
        currentSize = 2 + itemSize;
      } else {
        current.push(item);
        currentSize += itemSize + (current.length > 1 ? 1 : 0);
      }
    }
    if (current.length) chunks.push(current);
    return chunks;
  },

  // 供外部调用：加锁后的 push
  push(type, data) {
    return this._runLocked(() => this._pushInternal(type, data));
  },

  // 采购密码表：始终上传云端（不受用户“同步选择”勾选影响）。
  // 先合并云端现有密码表再整体覆盖，避免覆盖其他采购员的密码。
  pushPurchasePassword(name, pwd) {
    return this._runLocked(async () => {
      if (!this.enabled || !this.client) return false;
      let map = {};
      try {
        const remote = await this._pullType('purchase_pwd');
        if (remote && typeof remote === 'object') map = remote;
      } catch (e) { /* 云端无记录时从空对象开始 */ }
      map[normalizeText(name)] = String(pwd || '123').trim();
      await this._pushInternal('purchase_pwd', map);
      return true;
    });
  },

  // 催更记录：先与云端合并（同 key count 累加），再整体上传，避免多电脑互相覆盖导致排行榜次数丢失
  pushNags(localNags) {
    return this._runLocked(async () => {
      if (!this.enabled || !this.client) return false;
      const merged = { ...(localNags || {}) };
      // 辅助：把 src 的 count 合并到 dst，返回 dst 的引用
      const mergeOne = (dst, src) => {
        if (!dst || !src) return src || dst;
        const dstCount = dst.count || 1;
        const srcCount = src.count || 1;
        const srcTs = src.ts || 0;
        const dstTs = dst.ts || 0;
        if (srcTs === dstTs) {
          // 时间戳完全相同：视为同一条记录，count 取较大者，避免重复累加
          dst.count = Math.max(dstCount, srcCount);
          return dst;
        }
        // 时间戳新的元数据优先；count = 两端累加 - 1（同一次基础记录只算一次）
        if (srcTs > dstTs) {
          dst.by = src.by;
          dst.at = src.at;
          dst.ts = src.ts;
          dst.date = src.date;
          dst.channelSku = src.channelSku;
          dst.buyer = src.buyer;
          dst.role = src.role;
        }
        dst.count = dstCount + srcCount - 1;
        return dst;
      };
      try {
        const remote = await this._pullType('nags');
        if (remote && typeof remote === 'object') {
          for (const k in remote) {
            const r = remote[k];
            if (!r || typeof r !== 'object') continue;
            const localRec = merged[k];
            if (!localRec) {
              merged[k] = r;
            } else {
              merged[k] = mergeOne(localRec, r);
            }
          }
        }
      } catch (e) { /* 云端无记录时直接用本地 */ }
      // 再次读取当前本地：push 期间用户可能又点了催更（addNag 直接写本地，不走锁），
      // 把新增/累加的 count 也合并进来。
      try {
        const currentLocal = Store.getNags() || {};
        for (const k in currentLocal) {
          const cur = currentLocal[k];
          if (!cur || typeof cur !== 'object') continue;
          const m = merged[k];
          if (!m) {
            merged[k] = cur;
          } else {
            merged[k] = mergeOne(m, cur);
          }
        }
      } catch (e) { /* 读本地失败时继续使用已有 merged */ }
      // 把合并结果同步回本地，确保当前电脑能立刻看到其他电脑的记录
      Store._set('nags', merged);
      await this._pushInternal('nags', merged);
      return true;
    });
  },

  async _pushInternal(type, data) {
    if (!this.enabled || !this.client) return false;
    try {
      const isArray = Array.isArray(data);
      // 强制所有数组走分片表：Supabase 免费实例单条大 JSONB upsert 极易 statement timeout，
      // 500KB 分片既能保持片数可控，又远低于 8 秒写入上限。
      const CHUNK_BYTES = 500000;
      const nowTs = new Date().toISOString();

      if (isArray) {
        const chunks = this._chunkArray(data, CHUNK_BYTES);
        // 空数组也保留一个占位分片，避免 marker 与实际数据不一致
        if (chunks.length === 0) chunks.push([]);
        const BATCH = 1; // 单请求只 upsert 一片，避免触发 payload/statement 上限
        for (let b = 0; b < chunks.length; b += BATCH) {
          const end = Math.min(b + BATCH, chunks.length);
          const batchRows = [];
          for (let i = b; i < end; i++) {
            batchRows.push({ type, chunk_index: i, payload: chunks[i], updated_at: nowTs });
          }
          await this._upsertWithRetry(
            'sku_sync_chunks', batchRows, 'type,chunk_index', 20000,
            '同步 ' + type + ' 分片 ' + (b + 1) + '/' + chunks.length
          );
        }
        await this._upsertWithRetry(
          'sku_sync', { type, payload: { __chunks: chunks.length }, updated_at: nowTs },
          'type', 10000, '同步 ' + type + ' 分片标记'
        );
        // 只删除多余的高 index 分片，避免一次性 delete 全部分片压垮数据库
        this._cleanupStaleChunks(type, chunks.length - 1).catch(e => console.warn('[Sync] 清理旧分片失败', type, e));
        debugLog('[Sync] push 成功（分片 ' + chunks.length + ' 片）: ' + type);
      } else {
        // 小数据或对象：直接单行 upsert；同时异步清理可能残留的分片
        await this._upsertWithRetry(
          'sku_sync', { type, payload: data, updated_at: nowTs },
          'type', 10000, '同步 ' + type
        );
        this._cleanupStaleChunks(type, -1).catch(e => console.warn('[Sync] 清理旧分片失败', type, e));
        debugLog('[Sync] push 成功: ' + type);
      }
      // 本机刚推上去的数据，标记为“已拉取”，避免下一次云端刷新再把自己刚推的数据全量下载一遍
      this._markPulled(type, nowTs);
      return true;
    } catch (e) {
      console.warn('[Sync] push 失败: ' + type, e);
      throw e;
    }
  },

  // 小批清理某类型多余的分片，避免一次性 DELETE 大量行导致 postgREST/数据库超时（522）
  async _cleanupStaleChunks(type, keepMaxIndex) {
    if (!this.client) return;
    const delQuery = keepMaxIndex < 0
      ? this.client.from('sku_sync_chunks').delete().eq('type', type)
      : this.client.from('sku_sync_chunks').delete().eq('type', type).gt('chunk_index', keepMaxIndex);
    try {
      await this._withTimeout(delQuery, 15000, '清理 ' + type + ' 多余分片');
    } catch (e) {
      if (/sku_sync_chunks|relation .* does not exist|42P01/i.test(String(e && e.message || e))) {
        throw new Error('分片表 sku_sync_chunks 不存在：请在新 Supabase 项目重新执行完整建表 SQL（supabase_schema.sql，含 sku_sync_chunks 那段）后再同步。');
      }
      // 清理失败不阻塞主流程：旧分片只是占空间，新 marker 已让 pull 忽略它们
      console.warn('[Sync] _cleanupStaleChunks 失败（已忽略）: ' + type, e);
    }
  },

  // 用 in(chunk_index) 一次查询一批（比 range OFFSET 更快），多批并发，sales/delivery 可并行拉取。
  async _pullChunksBatched(type, total, onProgress) {
    const BATCH = 24;      // 每批 in 查询 24 个 chunk_index
    const CONCURRENCY = 6; // 同时 6 批（144 片/轮）
    const TIMEOUT = 60000; // 单批最长等待 60 秒
    const RETRIES = 2;     // 单批失败再重试 2 次
    const merged = new Array(total); // 按索引预分配，避免乱序合并
    const fetchBatch = async (start) => {
      const end = Math.min(start + BATCH, total);
      const indices = [];
      for (let i = start; i < end; i++) indices.push(i);
      const label = '拉取 ' + type + ' 分片 ' + (start + 1) + '-' + end + '/' + total;
      let lastErr = null;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
          const res = await this._withTimeout(
            this.client.from('sku_sync_chunks')
              .select('chunk_index,payload')
              .eq('type', type)
              .in('chunk_index', indices)
              .order('chunk_index', { ascending: true }),
            TIMEOUT,
            label + (attempt > 0 ? '（重试' + attempt + '）' : '')
          );
          if (res.error) throw res.error;
          return res.data || [];
        } catch (e) {
          lastErr = e;
          if (attempt < RETRIES) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      throw lastErr;
    };
    for (let winStart = 0; winStart < total; winStart += BATCH * CONCURRENCY) {
      const starts = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const s = winStart + i * BATCH;
        if (s >= total) break;
        starts.push(s);
      }
      const results = await Promise.all(starts.map(s => fetchBatch(s)));
      for (const chunkRows of results) {
        (chunkRows || []).forEach(c => {
          if (Array.isArray(c.payload) && c.chunk_index >= 0 && c.chunk_index < total) {
            merged[c.chunk_index] = c.payload;
          }
        });
      }
      const winEnd = Math.min(winStart + BATCH * CONCURRENCY, total);
      if (typeof onProgress === 'function') onProgress(Math.round(winEnd / total * 100), type, winStart + 1, winEnd, total);
    }
    // 铺平返回
    const out = [];
    for (const arr of merged) { if (Array.isArray(arr)) out.push(...arr); }
    return out;
  },

  // 将拉取到的 payload 按类型写入 Store（合并/覆盖逻辑集中于此）
  _applyPullPayload(type, payload, updatedAt) {
    if (type === 'personnel') {
      // 按时间戳判断：云端更新才覆盖本地，避免旧快照回退手动修改
      applyPersonnelFromRemote(payload, updatedAt);
    }
    else if (type === 'update_times') Store.mergeUpdateTimes(payload || {});
    else if (type === 'nags') Store.mergeNags(payload || {});
    else if (type === 'purchase_pwd') Store.mergePurchasePassword(payload || {});
    else {
      let payloadToSave = payload || [];
      // 云端拉取的 supplier/delivery 也可能带脏渠道值，写入前清洗
      if ((type === 'supplier' || type === 'delivery') && Array.isArray(payloadToSave)) {
        payloadToSave = payloadToSave.map(r => ({ ...r, channel: cleanChannelName(r.channel) }));
      }
      Store._set('data_' + type, payloadToSave);
      if (type === 'delivery_first' && payloadToSave && payloadToSave.length) {
        Store.setDeliveryFirst(DeliveryMatcher.snapshot(payload));
      }
      // 注意：不要在拉取时调用 _touchUpdate(type)，否则会把“上传日期”覆盖成“拉取当天”。
    }
  },

  // 拉取云端全部数据写回 Store（不触发回写，避免循环）
  // onProgress(type, pct, label) 可选
  // options.silent=true 时不弹错误 toast（用于后台自动拉取）
  async pull(onProgress, options = {}) {
    if (!this.enabled || !this.client) return false;
    const { silent = false } = options;
    try {
      // 阶段1：先只读 type + updated_at 清单，避免一次性下载所有 payload 导致超时
      let rows = null, lastErr = null;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const { data, error } = await this._withTimeout(
            this.client.from('sku_sync').select('type,updated_at'),
            30000,
            '从云端拉取清单'
          );
          if (error) throw error;
          rows = data || [];
          break;
        } catch (e) {
          lastErr = e;
          debugLog('[Sync] 拉取清单第' + (attempt + 1) + '次失败: ' + (e && e.message));
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      if (!rows) throw (lastErr || new Error('拉取清单失败'));

      // 跳过仍标记为 localOnly 的表（当前已无本地大表，全部可云端同步）
      const rowsToPull = rows.filter(r => this.shouldSync(r.type));
      const localUpdateTimes = Store.getUpdateTimes();

      // 1. 先跳过未变化的表：以“本机已拉取/推送过的云端时间戳”为准（精确等于才跳过），
      //    update_times 的本地值仅作兜底（老版本兼容）
      const pullTimes = this._getPullTimes();
      const todo = rowsToPull.filter(r => {
        const remoteTs = r.updated_at;
        const pulledTs = pullTimes[r.type];
        if (remoteTs && pulledTs && new Date(remoteTs).getTime() <= new Date(pulledTs).getTime()) {
          debugLog('[Sync] pull 跳过未变化: ' + r.type);
          return false;
        }
        const localTs = localUpdateTimes[r.type];
        if (remoteTs && localTs && pulledTs === undefined && new Date(remoteTs).getTime() <= new Date(localTs).getTime()) {
          debugLog('[Sync] pull 跳过未变化(兜底): ' + r.type);
          return false;
        }
        return true;
      });

      // 2. 按需逐个拉取变化的类型（_pullType 自动处理分片）
      //    失败时记录日志但继续拉取其他类型，避免某一类型异常导致整体失败
      let completed = 0;
      const results = await Promise.all(todo.map(r => {
        return this._pullType(r.type).then(payload => {
          completed++;
          if (typeof onProgress === 'function') {
            onProgress('拉取 ' + r.type + ' 完成', Math.round(completed / Math.max(1, todo.length) * 100));
          }
          return { type: r.type, payload, updatedAt: r.updated_at };
        }).catch(e => {
          debugLog('[Sync] 拉取 ' + r.type + ' 失败: ' + (e && e.message));
          return null;
        });
      }));

      // 3. 统一写回 Store
      for (const item of results) {
        if (!item) continue;
        if (item.payload != null) this._applyPullPayload(item.type, item.payload, item.updatedAt);
        // 记录“本机已拉取到该云端版本”，下次刷新未变化就不再下载
        this._markPulled(item.type, item.updatedAt);
      }

      debugLog('[Sync] pull 成功，' + rows.length + ' 条清单，实际拉取 ' + results.filter(Boolean).length + ' 个类型');
      return true;
    } catch (e) {
      console.warn('[Sync] pull 失败', e);
      if (!silent) showToast('云端拉取未完成（' + (e && e.message || '超时') + '），已保留本地数据', 'warn');
      return false;
    }
  },

  _setProgress(pct, text) {
    const wrap = $('#sync-progress-wrap');
    const fill = $('#sync-progress-fill');
    const txt = $('#sync-progress-text');
    if (wrap) wrap.style.display = 'block';
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = text;
  },
  _hideProgress() {
    const wrap = $('#sync-progress-wrap');
    if (wrap) wrap.style.display = 'none';
  },

  // 供外部调用：加锁后的 pushAll
  pushAll() {
    return this._runLocked(() => this._pushAllInternal());
  },

  async _pushAllInternal() {
    if (!this.enabled) { showToast('请先在“数据同步”页保存 Supabase 配置', 'error'); return false; }
    this._setProgress(0, '准备同步...');
    const startTime = Date.now();
    const fmtSec = () => ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    const sel = SyncSel.load();
    const allTypes = SYNC_TYPES.map(t => t.key).filter(t => sel.includes(t) || SYNC_TYPES.find(x => x.key === t && x.hidden));
    if (allTypes.length === 0) {
      showToast('请至少勾选一个要同步的表格', 'error');
      this._setProgress(0, '未选择任何表格');
      setTimeout(() => this._hideProgress(), 2000);
      return false;
    }
    const failed = [];
    for (let i = 0; i < allTypes.length; i++) {
      const t = allTypes[i];
      const pct = Math.round(((i + 1) / allTypes.length) * 100);
      this._setProgress(pct, '正在同步：' + t + ' (' + (i + 1) + '/' + allTypes.length + ') · 已耗时 ' + fmtSec());
      try {
        let data;
        if (t === 'purchase_pwd') {
          // 一键同步密码表：先合并云端已有密码，再整体上传，避免覆盖其他采购员的密码
          let cloudMap = {};
          try { const remote = await this._pullType('purchase_pwd'); if (remote && typeof remote === 'object') cloudMap = remote; } catch (e) {}
          data = Object.assign({}, cloudMap, Store.getPurchasePasswordMap());
          await this.push(t, data);
        } else if (t === 'nags') {
          // 催更记录：先与云端合并再上传，避免多电脑互相覆盖
          await this.pushNags(Store.getNags());
        } else {
          data = t === 'personnel' ? Store.getPersonnel() : (t === 'update_times' ? Store.getUpdateTimes() : Store.getData(t));
          await this.push(t, data);
        }
      } catch (e) {
        console.error('[Sync] pushAll 中 ' + t + ' 失败', e);
        failed.push({ type: t, error: e });
      }
    }

    if (failed.length === 0) {
      this._setProgress(100, '同步完成 · 共耗时 ' + fmtSec());
      const okMsg = '<span style="color:var(--success)">✓ 已同步全部数据到云端</span>';
      const statusEl = $('#sync-status');
      if (statusEl) statusEl.innerHTML = okMsg;
      showToast('✓ 已同步全部数据到云端');
      setTimeout(() => this._hideProgress(), 2000);
      return true;
    }

    // 部分失败：把失败类型和原因展示出来，不再因为一张大表失败就中断全部
    const failedLabels = failed.map(f => (SYNC_TYPES.find(x => x.key === f.type) || {}).label || f.type).join('、');
    const details = failed.map(f => {
      const m = (f.error && f.error.message) ? f.error.message : JSON.stringify(f.error || '未知错误');
      return f.type + ': ' + m;
    }).join('；');
    this._setProgress(100, '同步完成（部分失败）· 共耗时 ' + fmtSec());
    const warnMsg = '<span style="color:var(--warning)">⚠ 部分同步失败：' + escapeHtml(failedLabels) + '</span>';
    const statusEl = $('#sync-status');
    if (statusEl) statusEl.innerHTML = warnMsg;
    showToast('云端同步部分失败：' + failedLabels + '。' + details, 'error');
    setTimeout(() => this._hideProgress(), 5000);
    return false;
  },

  // ===== 拉取相关 =====
  async _pullType(type) {
    let lastErr = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const { data, error } = await this._withTimeout(
          this.client.from('sku_sync').select('type,payload').eq('type', type).maybeSingle(),
          30000, '拉取 ' + type
        );
        if (error) throw error;
        if (!data) return null;
        let payload = data.payload;
        if (payload && typeof payload === 'object' && payload.__chunks && typeof payload.__chunks === 'number') {
          payload = await this._pullChunksBatched(type, payload.__chunks);
        }
        return payload;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('拉取 ' + type + ' 失败');
  },

  // ===== 自动定时刷新（让其他电脑的改动在 N 秒内反映到当前界面） =====
  // 思路：每 N 秒只查各相关表的 updated_at（极小返回），变了才拉全量并重建，避免无谓的大文件下载。
  _lastUpdated: {},
  _autoTimer: null,

  // ===== 本机已拉取时间戳缓存（localStorage 持久化） =====
  // pull() 原来用「本地 update_times（上传时刻）」与「云端 updated_at（推送完成时刻）」比较，
  // 两者天然差几秒~几十秒（推送耗时），导致每次刷新都被判定“有变化”而全量重下 18MB 分片。
  // 这里改为记录“本机最后一次成功拉取/推送时云端的 updated_at”，只有它真正变化才重新下载。
  _PULL_TS_KEY: 'sku_pull_times_v1',
  _getPullTimes() {
    try { return JSON.parse(localStorage.getItem(this._PULL_TS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  },
  _markPulled(type, ts) {
    if (!type || !ts) return;
    try {
      const m = this._getPullTimes();
      m[type] = ts;
      localStorage.setItem(this._PULL_TS_KEY, JSON.stringify(m));
    } catch (e) { debugLog('[Sync] _markPulled 失败: ' + (e && e.message)); }
  },

  async _autoRefreshTick() {
    if (!this.enabled || !this.client) return;
    if (this._syncing) return;                 // 手动同步进行中，跳过，避免并发写 chunks
    const onRoleScreen = (typeof currentRole === 'undefined' || !currentRole);
    // 已登录的工作台：交期是全角色热点；运营/计划额外看供应商；采购额外看供应商+补货；都关注催更榜
    // 未登录的角色选择页：也拉人员名单，保证数据库修改后刷新角色页能看到新名字
    let types = ['nags', 'personnel'];
    if (!onRoleScreen) {
      // 9月交付字段已统一从销量大表(sales)获取，运营/计划不再依赖发货明细(delivery)；
      // 故自动刷新不再拉取体积较大的 delivery（约7.4MB），显著加快页面打开速度。
      // delivery 仍可由管理员手动上传/同步，仅在需要时按需使用。
      if (currentRole === 'operation' || currentRole === 'plan') types.push('sales', 'supplier', 'cancel');
      if (currentRole === 'purchase') types.push('supplier', 'replenish', 'sales');
    }
    try {
      let changed = false;
      for (const t of types) {
        if (!this.shouldSync(t)) continue;
        const { data, error } = await this._withTimeout(
          this.client.from('sku_sync').select('updated_at').eq('type', t).maybeSingle(),
          8000, '检查 ' + t + ' 更新'
        );
        if (error) continue;
        const ts = data && data.updated_at;
        if (!ts || this._lastUpdated[t] === ts) continue; // 没变化就跳过
        const payload = await this._pullType(t);
        if (payload == null) { this._lastUpdated[t] = ts; this._markPulled(t, ts); continue; }
        if (t === 'personnel') {
          // 按时间戳判断：云端更新才覆盖本地
          applyPersonnelFromRemote(payload, ts);
        }
        else if (t === 'update_times') Store.mergeUpdateTimes(payload);
        else if (t === 'nags') Store.mergeNags(payload);
        else Store._set('data_' + t, payload);   // 写本地但不回写，避免循环
        this._lastUpdated[t] = ts;
        this._markPulled(t, ts);   // 持久化，手动“云端刷新”时可复用、不再重复下载
        changed = true;
      }
      if (changed) {
        if (onRoleScreen) {
          renderLeaderboard('all');  // 角色选择页：刷新排行榜
        } else if (currentRole === 'purchase') {
          PurchaseUI.refresh();
        } else if (currentRole === 'plan') {
          PlanUI.refresh();
        } else if (currentRole === 'operation') {
          OperationUI.refresh();
        }
      }
    } catch (e) {
      debugLog('[Sync] 自动刷新出错: ' + (e && e.message));
    }
  },

  startAutoRefresh(intervalMs) {
    if (this._autoTimer) clearInterval(this._autoTimer);
    // 默认 60 秒：白名单/取消订单/供货清单等不在这里轮询，只有 sales/delivery/supplier/replenish 等热点表才轮询
    this._autoTimer = setInterval(() => this._autoRefreshTick(), intervalMs || 60000);
  },

  // 拉取云端并刷新当前界面
  async pullAndRefresh() {
    const ok = await this.pull((label, pct) => this._setProgress(pct, label));
    if (!ok) return;
    // 用 refresh 替代 init：保留用户当前的搜索/筛选/页码，避免全量重建导致卡顿
    if (typeof currentRole !== 'undefined' && currentRole === 'purchase') PurchaseUI.refresh();
    else if (currentRole === 'plan') PlanUI.refresh();
    else if (currentRole === 'operation') OperationUI.refresh();
    else { renderLeaderboard('all'); AdminUI.updateDataStatus(); AdminUI.renderPersonnel(); AdminUI.renderHistory(); AdminUI.renderUploadSummary(); }
    showToast('✓ 已从云端刷新');
  },

  // 登录后首次从云端拉取：带全屏进度遮罩，分批拉取大文件避免 statement timeout
  // 同一台电脑若已拉过云端数据，则不再弹全屏窗，改为后台静默刷新。
  async pullAllWithGlobalProgress(options = {}) {
    if (!this.enabled || !this.client) return false;
    const { silent = false } = options;

    // 判断本机是否已有从云端同步的数据（sales 已改为云端同步，应计入）
    const hasCloudLocal =
      Store.getData('supplier').length || Store.getData('cancel').length ||
      Store.getData('replenish').length || Store.getData('supply').length ||
      Store.getData('delivery').length || Store.getData('whitelist').length ||
      (Store.getPersonnel().purchase || []).length;
    if (hasCloudLocal) {
      debugLog('[Sync] 本地已有云端数据，跳过首次全屏拉取，改为后台静默刷新');
      return this.pullAndRefresh();
    }

    showGlobalLoading('准备从云端拉取数据...', 0);
    const ok = await this.pull((label, pct) => updateGlobalLoading(label, pct), { silent });
    hideGlobalLoading();
    if (ok) {
      if (typeof currentRole !== 'undefined' && currentRole === 'purchase') PurchaseUI.init(currentUserName);
      else if (currentRole === 'plan') PlanUI.init(currentUserName);
      else if (currentRole === 'operation') OperationUI.init(currentUserName);
      else { renderLeaderboard('all'); AdminUI.updateDataStatus(); AdminUI.renderPersonnel(); AdminUI.renderHistory(); AdminUI.renderUploadSummary(); }
      showToast('✓ 已从云端加载数据', 'success');
    }
    return ok;
  }
};

// ===== 数据存储（带LZ压缩+内存缓存，解决大文件超localStorage限制并减少重复解压） =====
const Store = {
  _mergeVersion: 0,   // 任一合并源数据变化时自增，供 Merger.getMergedData 缓存失效判定
  _memCache: new Map(), // 解析后内存缓存：同一 key 避免每次从 localStorage 重复解压/解析
  _key(k) { return 'skuv2_' + k; },
  _get(k) {
    try {
      const full = this._key(k);
      if (this._memCache.has(full)) return this._memCache.get(full);
      const raw = localStorage.getItem(full);
      if (!raw) return null;
      let value;
      // 兼容旧版未压缩数据（JSON数组/对象以 [ 或 { 开头）
      if (raw.charAt(0) === '[' || raw.charAt(0) === '{') {
        value = JSON.parse(raw);
      } else {
        const decompressed = (typeof LZString !== 'undefined') ? LZString.decompressFromUTF16(raw) : raw;
        if (!decompressed) {
          console.warn('[Store] 解压失败，key=', k);
          return null;
        }
        value = JSON.parse(decompressed);
      }
      this._memCache.set(full, value);
      return value;
    } catch (e) {
      console.warn('[Store] 读取失败:', k, e.message);
      return null;
    }
  },
  _set(k, v) {
    this._memCache.delete(this._key(k));
    // 合并源数据（销售/发货/供应商/取消）变化时，自增版本号，使 Merger 缓存失效
    if (k === 'data_sales' || k === 'data_delivery' || k === 'data_supplier' || k === 'data_cancel') {
      this._mergeVersion++;
    }
    // 供应商/交付明细/国内即时库存变化时才自增“采购富数据版本”，供 PurchaseUI 缓存失效（避免无关数据变更也重算）
    if (k === 'data_supplier' || k === 'data_delivery') {
      this._supplyVersion = (this._supplyVersion || 0) + 1;
    }
    try {
      const json = JSON.stringify(v);
      // 小数据直接存，大数据压缩（阈值 256KB）
      const useCompress = (typeof LZString !== 'undefined') && (json.length > 256 * 1024);
      if (useCompress) {
        const compressed = LZString.compressToUTF16(json);
        localStorage.setItem(this._key(k), compressed);
        debugLog('[Store] ' + k + ' 已压缩: ' + (json.length / 1024 / 1024).toFixed(2) + 'MB -> ' + (compressed.length * 2 / 1024 / 1024).toFixed(2) + 'MB');
      } else {
        localStorage.setItem(this._key(k), json);
      }
    } catch (e) {
      console.error('[Store] 写入失败:', k, e.message);
      showToast('存储空间不足：' + k + ' (' + e.message + ')', 'error');
    }
  },

  getData(type) {
    let data = this._get('data_' + type) || [];
    // 供应商追踪表/发货明细：云端/旧缓存可能把“渠道”列读成“渠道1-8EV6-D-否-否-海外仓”这种合并值。
    // 读取时统一清洗成“渠道1/2/3...”，保证表格显示和筛选列表一致。
    if ((type === 'supplier' || type === 'delivery') && Array.isArray(data)) {
      data = data.map(r => ({ ...r, channel: cleanChannelName(r.channel) }));
    }
    // 供应商追踪表：云端/旧缓存可能存的是多行表头的“原始复合key”（如 8月总目标|202608），
    // 缺少 sepTargetSup/augPendingBox/comboSku 等渲染所需的标准化字段。读到时自动标准化一次并缓存，
    // 这样采购页的“202609/202610/202611目标/待交付箱单/组合SKU”等列就能正确显示（云端的复合key在 pull 后即时可用）。
    // 早期版本组合SKU匹配不稳定，云端旧数据 comboSku 多为空；只有当数据确为原始多行表头（带 _raw）且 comboSku 全为空时，
    // 才从 _raw 用最新逻辑重新推导一次。已标准化数据/孤儿SKU（无 _raw）不会因此被误清空。
    const comboAllEmpty = data.length && data.some(r => r._raw) && !data.some(r => r.comboSku);
    if (type === 'supplier' && data.length && (!('sepTargetSup' in data[0]) || !('comboSku' in data[0]) || comboAllEmpty)) {
      try {
        const norm = ExcelParser.mapSupplier(data);
        this._set('data_supplier', norm); // 缓存标准化结果，避免每次读取重复计算；非 setData 故不会误触发推送
        return norm;
      } catch (e) { console.warn('[Store] supplier 自动标准化失败', e); }
    }
    return data;
  },
  setData(type, data) {
    // 写入前清洗渠道列，确保新上传/同步下来的数据不会把“渠道1-XXX”这类合并值存进去
    if ((type === 'supplier' || type === 'delivery') && Array.isArray(data)) {
      data = data.map(r => ({ ...r, channel: cleanChannelName(r.channel) }));
    }
    this._set('data_' + type, data);
    this._touchUpdate(type);
    if (typeof Sync !== 'undefined' && Sync.enabled && Sync.shouldSync(type)) {
      // 同时把“上传时间”一并推到云端，否则换部署地址/其他电脑拉取后，
      // 列头“供应商库存(8/7)”的日期会因云端 update_times 缺该 key 而丢失或变成拉取当天
      try {
        const p1 = Sync.push(type, data);
        const p2 = Sync.push('update_times', this.getUpdateTimes());
        return Promise.all([p1, p2]);
      }
      catch (e) { console.warn('[Store] 推送失败', type, e); }
    }
    return Promise.resolve();
  },

  getPersonnel() {
    const raw = this._get('personnel') || { purchase: [], plan: [], operation: [] };
    // 返回深拷贝，防止调用方直接修改对象引用导致 localStorage / 云端被意外覆盖
    const p = JSON.parse(JSON.stringify(raw));
    if (!p.admins || typeof p.admins !== 'object') p.admins = {};
    ['purchase', 'plan', 'operation'].forEach(r => { if (!Array.isArray(p.admins[r])) p.admins[r] = []; });
    if (!Array.isArray(p.categoryManagers)) p.categoryManagers = [];
    return p;
  },
  setPersonnel(p) {
    this._set('personnel', p);
    // 记录本地人员名单的“修改时间戳”，后续云端同步时按时间戳判断谁更新，避免旧快照覆盖新修改
    this._set('personnel_updated_at', new Date().toISOString());
    if (typeof Sync !== 'undefined' && Sync.enabled && Sync.shouldSync('personnel')) Sync.push('personnel', p);
  },

  getHistory() { return this._get('history') || []; },
  addHistory(entry) {
    const h = this.getHistory();
    entry.time = new Date().toISOString();
    h.unshift(entry);
    if (h.length > 2000) h.length = 2000;
    this._set('history', h);
    if (typeof Sync !== 'undefined' && Sync.enabled) Sync.push('history', h);
  },

  // ===== 最后更新时间 =====
  _touchUpdate(type) {
    const u = this._get('update_times') || {};
    u[type] = new Date().toISOString();
    this._set('update_times', u);
  },
  getUpdateTimes() { return this._get('update_times') || {}; },
  // 合并云端拉取的 update_times：逐 key 取较新时间戳，避免云端的陈旧/空副本覆盖本地刚上传的时间
  // （例如本地刚上传取消表、update_times['cancel'] 有值，但云端副本为空，直接覆盖会导致“供应商库存(8/7)”日期消失）
  mergeUpdateTimes(incoming) {
    const local = this._get('update_times') || {};
    const merged = Object.assign({}, local);
    if (incoming && typeof incoming === 'object') {
      for (const k of Object.keys(incoming)) {
        const lv = local[k], rv = incoming[k];
        if (!lv) merged[k] = rv;
        else if (!rv) merged[k] = lv;
        else merged[k] = new Date(rv).getTime() > new Date(lv).getTime() ? rv : lv;
      }
    }
    this._set('update_times', merged);
    return merged;
  },
  getLastUpdateText() {
    const u = this.getUpdateTimes();
    const times = Object.values(u).filter(Boolean).map(t => new Date(t).getTime());
    if (times.length === 0) return '尚未上传';
    const latest = new Date(Math.max(...times));
    const now = Date.now();
    const diff = Math.floor((now - latest.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '天前';
    return latest.toLocaleString('zh-CN');
  },
  // 登录页专用：返回 2026/8/7 格式
  getLastUpdateDate() {
    const u = this.getUpdateTimes();
    const times = Object.values(u).filter(Boolean).map(t => new Date(t).getTime());
    if (times.length === 0) return '';
    const latest = new Date(Math.max(...times));
    return latest.getFullYear() + '/' + (latest.getMonth() + 1) + '/' + latest.getDate();
  },

  // ===== 发货明细第一版快照（永久基线：绿+/红-） =====
  // 管理员首次上传 delivery 时保存第一版；后续所有上传都与第一版比较差异。
  // 第一版随 delivery_first 隐藏类型同步云端，换电脑后仍能正确显示增减标识。
  getDeliveryFirst() { return this._get('delivery_first') || this._get('dm_prev') || {}; },
  setDeliveryFirst(map) { this._set('delivery_first', map); },

  // 旧命名保留做兼容（部分代码仍可能调用）
  getDeliveryMetricsPrev() { return this.getDeliveryFirst(); },
  setDeliveryMetricsPrev(map) { this.setDeliveryFirst(map); },
  // 记录 sales/delivery 的上传日期用于兼容/统计（不再作为强制登录条件）
  // 注意：上传日期是简单字符串，必须绕过 _get/_set 的 JSON+压缩层
  //（_get 会把未压缩串误当压缩串解压而失败，导致读取永远为 null -> 反复要求重传）。
  // 因此这里直接按原始字符串读写 localStorage，并兼容旧版带 JSON 引号的数据。
  getLastUploadDate(type) {
    try {
      const v = localStorage.getItem(this._key('last_upload_' + type));
      return v ? v.replace(/^"|"$/g, '') : '';
    } catch (e) { return ''; }
  },
  setLastUploadDate(type, date) {
    try { localStorage.setItem(this._key('last_upload_' + type), date || this._todayKey()); } catch (e) {}
  },
  // 采购员密码（默认123，本机存储）
  getPurchasePassword(name) {
    const map = this._get('purchase_pwd') || {};
    return map[normalizeText(name)] || '123';
  },
  setPurchasePassword(name, pwd) {
    const map = this._get('purchase_pwd') || {};
    map[normalizeText(name)] = String(pwd || '123').trim();
    this._set('purchase_pwd', map);
  },
  // 返回完整密码表（用于上传云端 / 一键同步）
  getPurchasePasswordMap() {
    return this._get('purchase_pwd') || {};
  },
  // 合并云端密码表到本地缓存：云端优先（authoritative），本地独有项保留
  mergePurchasePassword(map) {
    if (!map || typeof map !== 'object') return;
    const local = this._get('purchase_pwd') || {};
    const merged = Object.assign({}, local, map);
    this._set('purchase_pwd', merged);
  },

  // ===== 催更记录 =====
  // 结构: { "<role>||<channelSku>||<buyer>": { by, at, ts, date } }
  // 每天自动重置：按北京时间(GMT+8)早上5点算新的一天
  _nagSep: '||',
  _beijingNow() {
    const now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  },
  // 把一个 Date 对象按北京时间格式化为 YYYY-MM-DD（比 toISOString 安全，toISOString 返回 UTC 日期会错位）
  _fmtBeijingDate(d) {
    const bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    return bj.getFullYear() + '-' + String(bj.getMonth() + 1).padStart(2, '0') + '-' + String(bj.getDate()).padStart(2, '0');
  },
  _todayKey() {
    const bj = this._beijingNow();
    // 5点前算昨天
    if (bj.getHours() < 5) {
      bj.setDate(bj.getDate() - 1);
    }
    return this._fmtBeijingDate(bj);
  },
  _dateKeyOf(ts) {
    // 根据催更时间戳反推它属于哪一天（北京时间，5点为新一天起点）
    const d = new Date(ts);
    const bj = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    if (bj.getHours() < 5) bj.setDate(bj.getDate() - 1);
    return this._fmtBeijingDate(bj);
  },
  getNags() {
    let nags = this._get('nags') || {};
    // 反向迁移：把旧版的两段 key（sku||buyer）补回三段 key（role||sku||buyer）。
    // 之前 v84/v86 里这里把三段 key 错误地迁成两段，导致 hasNagged 按 role 查永远查不到，
    // 按钮点了仍显示 ⚡催。现在统一成三段 key，严格按发起端 role 隔离。
    let migrated = false;
    for (const k of Object.keys(nags)) {
      const parts = k.split(this._nagSep);
      if (parts.length === 2) {
        const rec = nags[k];
        const role = rec.role || 'unknown';
        const sku = rec.channelSku || parts[0];
        const buyer = rec.buyer || parts[1];
        const newKey = role + this._nagSep + sku + this._nagSep + buyer;
        if (!nags[newKey] || (rec.ts || 0) > (nags[newKey].ts || 0)) nags[newKey] = rec;
        delete nags[k];
        migrated = true;
      }
    }
    if (migrated) {
      console.log('[Store] nags 反向迁移完成：两段 key -> 三段 key');
      this._set('nags', nags);
    }
    const today = this._todayKey();
    // 保留最近 7 天（含今天），避免跨天/早班等边界把昨天的排行榜清掉
    // 注意：不能用 toISOString 取日期（它返回 UTC 日期），统一用 _dateKeyOf 按北京时间格式化
    const keep = [];
    const base = new Date(today + 'T00:00:00+08:00');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      // 直接用北京时间格式化即可，不要再走 _dateKeyOf 的 5 点日界逻辑，
      // 否则 base 为 00:00 会被误判为前一天，导致今天的催更被删除。
      keep.push(this._fmtBeijingDate(d));
    }
    let changed = false;
    for (const k in nags) {
      // 兼容旧数据：根据 ts 重新计算日期，或者直接比较 date 字段
      const recDate = nags[k].ts ? this._dateKeyOf(nags[k].ts) : nags[k].date;
      if (recDate && !keep.includes(recDate)) {
        delete nags[k];
        changed = true;
      }
    }
    if (changed) this._set('nags', nags);
    return nags;
  },
  hasNagged(role, channelSku, buyer) {
    if (!channelSku || !buyer) return false;
    const nb = normalizeText(buyer);
    const roleKey = role + this._nagSep + channelSku + this._nagSep + nb;
    const today = this._todayKey();
    const nags = this.getNags();
    // 严格按发起端 role 隔离：计划/运营/采购各端点的催更状态互不干扰。
    // 历史遗留的 legacyKey（无 role 前缀）不再兜底，避免“计划催了、运营也显示已催”。
    const rec = nags[roleKey];
    if (!rec) return false;
    const recDate = rec.ts ? this._dateKeyOf(rec.ts) : rec.date;
    return recDate === today;
  },
  addNag(role, channelSku, buyer, byUser) {
    const nags = this.getNags();
    // 按发起端 role 隔离存储：计划/运营/采购各端点的催更状态互不干扰。
    // 采购端「被催统计」通过 buyer 字段跨 role 汇总，不受此影响。
    const key = (role || 'unknown') + this._nagSep + channelSku + this._nagSep + normalizeText(buyer);
    const existing = nags[key];
    const now = Date.now();
    // 同 role+SKU+采购员 多次催更：累加 count，避免互相覆盖导致“点三次只算一次”
    nags[key] = {
      by: byUser,
      at: new Date().toISOString(),
      ts: now,
      date: this._todayKey(),
      channelSku,
      buyer: normalizeText(buyer),
      role: role || 'unknown',
      count: (existing && existing.count ? existing.count : 0) + 1
    };
    this._set('nags', nags);
    this.addHistory({ user: byUser, role: role || 'unknown', action: '催更', detail: channelSku + ' / ' + buyer });
    // 跨电脑同步催更（排行榜随之跨电脑）；pushNags 会先与云端合并，避免多电脑互相覆盖
    if (typeof Sync !== 'undefined' && Sync.enabled && Sync.shouldSync('nags')) Sync.pushNags(nags);
  },
  clearNags() {
    this._set('nags', {});
    if (typeof Sync !== 'undefined' && Sync.enabled && Sync.shouldSync('nags')) Sync.pushNags({});
  },
  // 合并云端催更记录到本地；同 role+SKU+采购员 的 count 累加，避免“同一 SKU 被催三次只算一次”
  mergeNags(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    const local = this._get('nags') || {};
    let changed = false;
    for (const k in incoming) {
      const inc = incoming[k];
      if (!inc || typeof inc !== 'object') continue;
      const localRec = local[k];
      if (!localRec) {
        local[k] = inc;
        changed = true;
      } else {
        const incTs = inc.ts || 0;
        const localTs = localRec.ts || 0;
        const incCount = inc.count || 1;
        const localCount = localRec.count || 1;
        if (incTs === localTs) {
          // 时间戳相同：视为同一条记录，count 取较大者，避免重复累加
          local[k] = { ...inc, count: Math.max(localCount, incCount) };
          changed = true;
        } else if (incTs > localTs) {
          // 云端更新：以云端元数据为准，count = 本地 + 云端 - 1（同一次基础记录只算一次）
          local[k] = { ...inc, count: localCount + incCount - 1 };
          changed = true;
        }
        // 本地较新时忽略云端旧快照（避免已被本地覆盖的旧记录把 count 加回来）
      }
    }
    if (changed) this._set('nags', local);
  },
  // 统计：被催最多的采购（支持昨日/今日）
  nagLeaderboard(period) {
    const nags = this.getNags();
    const today = this._todayKey();
    const yesterdayDate = new Date(today + 'T00:00:00+08:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = this._fmtBeijingDate(yesterdayDate);

    // 按标准化姓名聚合，自动合并“贺晶”“ 贺晶 ”“贺晶（计划）”等变体，并保留最常用显示名
    const personnel = this.getPersonnel();
    const allNames = [
      ...(personnel.purchase || []), ...(personnel.plan || []), ...(personnel.operation || []),
      ...(personnel.categoryManagers || []).map(m => m && m.name).filter(Boolean)
    ];
    const displayByNorm = {};
    allNames.forEach(n => { displayByNorm[normalizeText(n)] = n; });

    const makeAgg = () => ({ counts: {}, displays: {} });
    const addUser = (agg, rawBy, weight) => {
      const raw = String(rawBy || '').trim();
      const key = raw ? normalizeText(raw) : '$$anonymous';
      agg.counts[key] = (agg.counts[key] || 0) + (weight || 1);
      if (!agg.displays[key]) agg.displays[key] = {};
      const disp = raw || '匿名';
      agg.displays[key][disp] = (agg.displays[key][disp] || 0) + (weight || 1);
    };
    const addBuyer = (agg, buyer, weight) => {
      const key = String(buyer || '').trim();
      if (!key) return;
      agg.counts[key] = (agg.counts[key] || 0) + (weight || 1);
      if (!agg.displays[key]) agg.displays[key] = {};
      agg.displays[key][key] = (agg.displays[key][key] || 0) + (weight || 1);
    };
    const finalize = (agg) => {
      return Object.entries(agg.counts).map(([key, count]) => {
        // 优先用人事名单里的规范名；否则取出现次数最多的原始显示名
        const displayMap = agg.displays[key] || {};
        const bestDisplay = displayByNorm[key] ||
          Object.entries(displayMap).sort((a, b) => b[1] - a[1])[0]?.[0] ||
          key;
        return [bestDisplay, count];
      }).sort((a, b) => b[1] - a[1]);
    };

    const todayBuyer = makeAgg(), todayUser = makeAgg();
    const yestBuyer = makeAgg(), yestUser = makeAgg();

    Object.entries(nags).forEach(([k, n]) => {
      const recDate = n.ts ? this._dateKeyOf(n.ts) : n.date;
      const parts = k.split(this._nagSep);
      const buyer = parts[parts.length - 1];
      const by = n.by || '匿名';
      const weight = n.count || 1; // 兼容旧数据（无 count 字段的按 1 次算）
      if (recDate === today) {
        addBuyer(todayBuyer, buyer, weight);
        addUser(todayUser, by, weight);
      } else if (recDate === yesterday) {
        addBuyer(yestBuyer, buyer, weight);
        addUser(yestUser, by, weight);
      }
    });

    if (period === 'today') {
      return { buyers: finalize(todayBuyer), users: finalize(todayUser) };
    }
    if (period === 'yesterday') {
      return { buyers: finalize(yestBuyer), users: finalize(yestUser) };
    }
    // 默认返回今日
    return { buyers: finalize(todayBuyer), users: finalize(todayUser) };
  },

  clearAll() {
    this._memCache.clear();
    ['sales', 'delivery', 'supplier', 'cancel', 'replenish', 'supply', 'whitelist', 'delivery_first', 'delivery_diff'].forEach(t => {
      localStorage.removeItem(this._key('data_' + t));
    });
    localStorage.removeItem(this._key('personnel'));
    localStorage.removeItem(this._key('history'));
    localStorage.removeItem(this._key('update_times'));
    localStorage.removeItem(this._key('nags'));
    localStorage.removeItem(this._key('dm_baselines'));
    localStorage.removeItem(this._key('dm_prev'));
    localStorage.removeItem(this._key('delivery_first'));
  },

  exportAll() {
    const data = {
      sales: this.getData('sales'), delivery: this.getData('delivery'),
      supplier: this.getData('supplier'), cancel: this.getData('cancel'),
      replenish: this.getData('replenish'), supplyList: this.getData('supply'),
      whitelist: this.getData('whitelist'), deliveryFirst: this.getDeliveryFirst(),
      deliveryDiff: this.getData('delivery_diff'),
      personnel: this.getPersonnel(), history: this.getHistory(),
      updateTimes: this.getUpdateTimes(), nags: this.getNags(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '供应链数据_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(url);
  },

  importAll(data) {
    if (!data) return false;
    ['sales', 'delivery', 'supplier', 'cancel', 'replenish'].forEach(t => { if (data[t]) this.setData(t, data[t]); });
    if (data.supplyList) this.setData('supply', data.supplyList);
    if (data.whitelist) this.setData('whitelist', data.whitelist);
    if (data.deliveryFirst) this.setDeliveryFirst(data.deliveryFirst);
    if (data.deliveryDiff) this.setData('delivery_diff', data.deliveryDiff);
    if (data.personnel) this.setPersonnel(data.personnel);
    if (data.history) this._set('history', data.history);
    if (data.updateTimes) this._set('update_times', data.updateTimes);
    if (data.nags) this._set('nags', data.nags);
    return true;
  }
};

// ===== XLSX 懒加载：首屏不下载 xlsx(862K)，主页渲染后空闲预加载；上传/导出前 ensureXLSX 兜底 =====
let _xlsxPromise = null;
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const tryLoad = (src, ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = fail;
      document.head.appendChild(s);
    };
    const fallback = () => tryLoad('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      () => window.XLSX ? resolve() : reject(new Error('XLSX 加载失败')),
      () => reject(new Error('XLSX CDN 加载失败')));
    tryLoad('xlsx.full.min.js?v=20260909v250',
      () => window.XLSX ? resolve() : fallback(),
      () => fallback());
  });
  return _xlsxPromise;
}
// 导出写文件：内部 await ensureXLSX，调用方无需 async
function xlsxWriteFile(wb, fname) {
  ensureXLSX().then(() => {
    try { XLSX.writeFile(wb, fname); }
    catch (e) { console.error('[xlsxWriteFile]', e); showToast('导出失败：' + (e && e.message)); }
  }).catch(e => { console.error('[xlsxWriteFile] 加载失败', e); showToast('Excel 组件加载失败，请稍后重试'); });
}
// 主页渲染后空闲预加载 xlsx，使用户点上传/导出时已基本就绪
window.addEventListener('load', () => { setTimeout(() => { ensureXLSX(); }, 1200); });

// ===== Excel 解析器（支持多行表头+多Sheet） =====
const ExcelParser = {
  readWorkbook(file) {
    return ensureXLSX().then(() => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: false });
          debugLog('[readWorkbook] 文件: ' + file.name + ' | Sheets: ' + wb.SheetNames.join(', '));
          resolve(wb);
        } catch (err) {
          debugLog('[readWorkbook] ERROR: ' + err.message);
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    }));
  },

  sheetToRows(sheet) {
    try { return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }); }
    catch (e) { console.warn('[ExcelParser] sheet_to_json failed:', e.message); return []; }
  },

  scanCells(sheet) {
    const keys = Object.keys(sheet).filter(k => !k.startsWith('!'));
    if (keys.length === 0) return [];
    let maxR = 0, maxC = 0;
    const cellRe = /^([A-Z]+)(\d+)$/;
    for (const k of keys) {
      const m = k.match(cellRe);
      if (m) { const col = XLSX.utils.decode_col(m[1]); const row = parseInt(m[2]) - 1;
        if (row > maxR) maxR = row; if (col > maxC) maxC = col; }
    }
    const rows = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        let v = '';
        if (cell) {
          // 数值型单元格优先取原始值（保留Excel日期序列号和数量）
          if (cell.t === 'n' && typeof cell.v === 'number') v = cell.v;
          else if (cell.w !== undefined) v = String(cell.w);
          else if (cell.v !== undefined) v = String(cell.v);
        }
        row.push(v);
      }
      rows.push(row);
    }
    const nonEmpty = rows.filter(r => r.some(c => c !== '')).length;
    debugLog('[scanCells] ' + rows.length + '行 x ' + (maxC + 1) + '列, 非空行=' + nonEmpty + ', !ref=' + (sheet['!ref'] || '无'));
    return rows;
  },

  getRows(sheet) {
    // 始终优先使用 scanCells（不依赖 !ref，更可靠）
    let rows = this.scanCells(sheet);
    if (rows.length === 0) {
      console.log('[ExcelParser] scanCells empty, trying sheet_to_json');
      rows = this.sheetToRows(sheet);
    }
    return rows;
  },

  detectHeaderRow(rows, maxScan) {
    maxScan = maxScan || 8;
    let bestRow = 0, bestCount = 0;
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
      const count = rows[i].filter(c => String(c).trim() !== '').length;
      if (count > bestCount) { bestCount = count; bestRow = i; }
    }
    return bestRow;
  },

  // 多行表头解析：合并分组行+子标题行，生成唯一key
  extractDataMultiRow(rows, groupRowIdx, headerRowIdx, sheetName) {
    if (rows.length === 0) return { headers: [], data: [], count: 0, sheetName };
    const groupRow = rows[groupRowIdx] || [];
    const headerRow = rows[headerRowIdx] || [];

    // 前向填充分组标题
    const groups = [];
    let cur = '';
    for (let c = 0; c < headerRow.length; c++) {
      if (groupRow[c] && String(groupRow[c]).trim()) cur = String(groupRow[c]).trim();
      groups[c] = cur;
    }

    // 修复分组行错误前向填充：如果子表头已经带有月份关键词，且与分组行的月份冲突，
    // 说明该分组行不该覆盖到这一列（常见于 9月/10月 数据列和分组行错位）。
    // 冲突开始后，继续丢弃分组直到遇到下一个带月份关键词的子表头，避免“采购备注”这类
    // 无月份子字段被错误地挂到上一个冲突分组下。
    const monthRe = /(?:^|\D)(8|9|10|11|12|08|09)\s*月|2026(08|09|10|11|12)/;
    const extractMonths = (s) => {
      const m = String(s || '').match(new RegExp(monthRe, 'g')) || [];
      return m.map(x => normalizeText(x));
    };
    let dropGroupUntilNextMonth = false;
    for (let c = 0; c < headerRow.length; c++) {
      const sub = String(headerRow[c] || '').trim();
      const grp = groups[c] || '';
      const subMonths = extractMonths(sub);
      if (subMonths.length) {
        dropGroupUntilNextMonth = false;
        if (!grp) continue;
        const grpMonths = extractMonths(grp);
        if (grpMonths.length && !subMonths.some(sm => grpMonths.some(gm => gm.includes(sm) || sm.includes(gm)))) {
          groups[c] = '';
          dropGroupUntilNextMonth = true;
        }
      } else if (dropGroupUntilNextMonth) {
        groups[c] = '';
      }
    }

    // 构建复合表头
    const headers = [];
    for (let c = 0; c < headerRow.length; c++) {
      const sub = String(headerRow[c] || '').trim();
      const grp = groups[c] || '';
      if (sub && grp) headers[c] = grp + '|' + sub;
      else headers[c] = sub || grp || '';
    }

    // 复合表头可能出现重复（例如两列都简称“采购备注”），追加列索引保证唯一，避免后列覆盖前列
    const seen = new Set();
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (seen.has(h)) headers[c] = h + '__col' + c;
      else seen.add(h);
    }

    const data = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.some(c => c !== '' && c !== null && c !== undefined)) continue;
      const obj = { _row: i, _sheet: sheetName };
      headers.forEach((h, idx) => {
        if (h) obj[normalizeText(h)] = r[idx] !== undefined ? r[idx] : '';
      });
      obj._raw = {};
      headers.forEach((h, idx) => { if (h) obj._raw[h] = r[idx] !== undefined ? r[idx] : ''; });
      obj._values = r.slice();
      data.push(obj);
    }
    console.log('[ExcelParser] multiRow parse: ' + data.length + ' rows, headers sample:', headers.slice(24, 32));
    return { headers, data, count: data.length, sheetName };
  },

  extractData(rows, sheetName) {
    if (rows.length === 0) return { headers: [], data: [], count: 0, sheetName };
    
    let hi = this.detectHeaderRow(rows);
    let result = this._extractWithHeader(rows, hi, sheetName);
    debugLog('[extractData] 表头行=' + hi + ', 解析出' + result.count + '条');
    
    if (result.count === 0 && rows.length > 1) {
      debugLog('[extractData] 0条数据, 尝试其他表头行');
      for (let tryHi = 0; tryHi < Math.min(rows.length, 6); tryHi++) {
        if (tryHi === hi) continue;
        const tryResult = this._extractWithHeader(rows, tryHi, sheetName);
        if (tryResult.count > result.count) {
          result = tryResult;
          debugLog('[extractData] 在行' + tryHi + '找到更好表头: ' + tryResult.count + '条');
        }
      }
    }
    
    if (result.count === 0 && rows.length > 1) {
      debugLog('[extractData] 暴力模式: 第0行当表头');
      result = this._extractWithHeader(rows, 0, sheetName);
    }
    
    return result;
  },

  _extractWithHeader(rows, hi, sheetName) {
    // 检测是否有多行表头（表头行>0且前一行有值）
    if (hi > 0 && rows[hi - 1] && rows[hi - 1].some(c => String(c).trim() !== '')) {
      return this.extractDataMultiRow(rows, hi - 1, hi, sheetName);
    }
    const headers = rows[hi].map(c => String(c || '').trim());
    // 单表头也可能出现重名，追加列索引去重
    const seen = new Set();
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (seen.has(h)) headers[c] = h + '__col' + c;
      else seen.add(h);
    }
    const data = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.some(c => c !== '' && c !== null && c !== undefined)) continue;
      const obj = { _row: i, _sheet: sheetName };
      headers.forEach((h, idx) => { if (h) obj[normalizeText(h)] = r[idx] !== undefined ? r[idx] : ''; });
      obj._raw = {};
      headers.forEach((h, idx) => { if (h) obj._raw[h] = r[idx] !== undefined ? r[idx] : ''; });
      obj._values = r.slice();
      data.push(obj);
    }
    return { headers, data, count: data.length, sheetName, headerRow: hi };
  },

  async parseAllSheets(file) {
    const wb = await this.readWorkbook(file);
    let allData = [];
    let allHeaders = [];
    debugLog('[parseAllSheets] sheets: ' + wb.SheetNames.join(', '));
    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      const rows = this.getRows(sheet);
      debugLog('[parseAllSheets] sheet "' + sn + '": getRows返回 ' + rows.length + ' 行');
      if (rows.length === 0) continue;
      // 跳过完全空白的sheet（只有0-1行非空）
      const nonEmptyRows = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
      if (nonEmptyRows.length <= 1) {
        debugLog('[parseAllSheets] sheet "' + sn + '" 跳过(仅' + nonEmptyRows.length + '行非空)');
        continue;
      }
      const result = this.extractData(rows, sn);
      debugLog('[parseAllSheets] sheet "' + sn + '": 解析出 ' + result.count + ' 条, 表头' + result.headers.length + '列');
      if (result.headers.length > allHeaders.length) allHeaders = result.headers;
      allData = allData.concat(result.data);
    }
    debugLog('[parseAllSheets] 全部合并: ' + allData.length + ' 行');
    return { headers: allHeaders, data: allData, count: allData.length };
  },

  // 主解析入口
  async parse(file, fileType) {
    // 供货清单：读取所有Sheet
    if (fileType === 'supply') {
      const raw = await this.parseAllSheets(file);
      const mapped = this.mapSupply(raw.data);
      return { headers: raw.headers, data: mapped, count: mapped.length };
    }

    const wb = await this.readWorkbook(file);

    // 供应商追踪：特殊处理（多行表头，表头在第2行）
    if (fileType === 'supplier') {
      const sn = wb.SheetNames.find(n => n.includes('追踪')) || wb.SheetNames[0];
      const sheet = wb.Sheets[sn];
      const rows = this.getRows(sheet);
      if (rows.length >= 2) {
        // 表头在第2行(index=1)，分组在第1行(index=0)
        const result = this.extractDataMultiRow(rows, 0, 1, sn);
        const mapped = this.mapSupplier(result.data, result.headers);
        console.log('[ExcelParser] supplier mapped: ' + mapped.length + ' rows');
        console.log('[ExcelParser] supplier sample keys:', Object.keys(result.data[0] || {}).slice(0, 15));
        return { headers: result.headers, data: mapped, count: mapped.length, raw: result };
      }
    }

    // 发货交付：遍历所有sheet，合并数据
    if (fileType === 'delivery') {
      debugLog('[delivery] 开始解析, 共 ' + wb.SheetNames.length + ' 个sheet');
      let allData = [];
      let allHeaders = [];
      for (let si = 0; si < wb.SheetNames.length; si++) {
        const sn = wb.SheetNames[si];
        const sheet = wb.Sheets[sn];
        const rows = this.getRows(sheet);
        debugLog('[delivery] sheet "' + sn + '": getRows返回 ' + rows.length + ' 行');
        if (rows.length === 0) continue;
        const result = this.extractData(rows, sn);
        debugLog('[delivery] sheet "' + sn + '": extractData解析出 ' + result.count + ' 条数据, 表头' + result.headers.length + '列');
        if (result.headers.length > allHeaders.length) allHeaders = result.headers;
        allData = allData.concat(result.data);
      }
      debugLog('[delivery] 合并后共 ' + allData.length + ' 行');
      const mapped = this.mapDelivery(allData);
      debugLog('[delivery] mapDelivery后 ' + mapped.length + ' 行');
      return { headers: allHeaders, data: mapped, count: mapped.length };
    }

    // 取消订单：表头可能在第2行
    if (fileType === 'cancel') {
      const sn = wb.SheetNames.find(n => n.includes('取消')) || wb.SheetNames[0];
      const sheet = wb.Sheets[sn];
      const rows = this.getRows(sheet);
      const result = this.extractData(rows, sn);
      const mapped = this.mapCancel(result.data);
      return { headers: result.headers, data: mapped, count: mapped.length };
    }

    // 需补订单：遍历所有sheet，合并数据
    if (fileType === 'replenish') {
      debugLog('[replenish] 开始解析, 共 ' + wb.SheetNames.length + ' 个sheet');
      let allData = [];
      let allHeaders = [];
      for (let si = 0; si < wb.SheetNames.length; si++) {
        const sn = wb.SheetNames[si];
        const sheet = wb.Sheets[sn];
        const rows = this.getRows(sheet);
        debugLog('[replenish] sheet "' + sn + '": getRows返回 ' + rows.length + ' 行');
        if (rows.length === 0) continue;
        const result = this.extractData(rows, sn);
        debugLog('[replenish] sheet "' + sn + '": extractData解析出 ' + result.count + ' 条数据');
        if (result.headers.length > allHeaders.length) allHeaders = result.headers;
        allData = allData.concat(result.data);
      }
      debugLog('[replenish] 合并后共 ' + allData.length + ' 行');
      const mapped = this.mapReplenish(allData);
      debugLog('[replenish] mapReplenish后 ' + mapped.length + ' 行');
      return { headers: allHeaders, data: mapped, count: mapped.length };
    }

    // 白名单：读所有sheet合并
    if (fileType === 'whitelist') {
      const raw = await this.parseAllSheets(file);
      const mapped = this.mapWhitelist(raw.data);
      return { headers: raw.headers, data: mapped, count: mapped.length };
    }

    // 通用解析
    let bestResult = null;
    for (let si = 0; si < wb.SheetNames.length; si++) {
      const sn = wb.SheetNames[si];
      const rows = this.getRows(wb.Sheets[sn]);
      if (rows.length === 0) continue;
      const result = this.extractData(rows, sn);
      console.log('[ExcelParser] sheet "' + sn + '": ' + result.count + ' rows');
      if (!bestResult || result.count > bestResult.count) bestResult = result;
    }
    if (!bestResult) throw new Error('无法读取任何工作表');

    let mapped;
    switch (fileType) {
      case 'sales': mapped = this.mapSales(bestResult.data); break;
      case 'delivery': mapped = this.mapDelivery(bestResult.data); break;
      case 'goods': mapped = this.mapGoods(bestResult.data); break;
      default: mapped = bestResult.data; break;
    }
    console.log('[ExcelParser] ' + fileType + ' mapped: ' + mapped.length + ' rows');
    return { headers: bestResult.headers, data: mapped, count: mapped.length };
  },

  // 字段查找：精确/子字段精确匹配优先，最后 fallback 到包含匹配。
  // 避免“辅助列”因列名带“渠道”而被误匹配为渠道列。
  getField(obj, keywords) {
    const normKws = keywords.map(kw => normalizeText(kw));
    const sources = [obj, obj._raw].filter(Boolean);

    // 1) 精确匹配：列名标准化后等于 keyword
    for (const src of sources) {
      for (const k in src) {
        if (k.startsWith('_')) continue;
        const nk = normalizeText(k);
        if (normKws.some(nkw => nk === nkw)) return src[k];
      }
    }

    // 2) 复合表头子字段精确匹配：grp|sub 中的 sub 等于 keyword
    for (const src of sources) {
      for (const k in src) {
        if (k.startsWith('_')) continue;
        const parts = k.split('|');
        const sub = parts[parts.length - 1];
        const nsub = normalizeText(sub);
        if (normKws.some(nkw => nsub === nkw)) return src[k];
      }
    }

    // 3) 包含匹配兜底
    for (const src of sources) {
      for (const k in src) {
        if (k.startsWith('_')) continue;
        const nk = normalizeText(k);
        if (normKws.some(nkw => nk.includes(nkw))) return src[k];
      }
    }
    return '';
  },

  // 复合查找：group和sub分别匹配复合key的分组部分和子字段部分
  getFieldComposite(obj, groupKws, subKws) {
    // 子字段匹配优先级：精确匹配(subPart===subKw) > 前缀匹配(subPart以subKw开头) > 包含匹配(subPart含subKw)
    // 这样“待交付箱单”能精确命中计数列，而不会误抓“9月待交付箱单交期”(金额/日期)等长尾列。
    const matchIn = (source) => {
      let exact = null, starts = null, includesMatch = null;
      for (const k in source) {
        if (k.startsWith('_')) continue;
        const parts = k.split('|');
        const isComposite = parts.length > 1;
        const grpPart = isComposite ? parts.slice(0, -1).join('|') : k;
        const subPart = isComposite ? parts[parts.length - 1] : k;
        if (!groupKws.some(g => grpPart.includes(normalizeText(g)))) continue;
        const subNorm = normalizeText(subPart);
        for (const s of subKws) {
          const sn = normalizeText(s);
          if (subNorm === sn) { if (exact === null) exact = source[k]; }
          else if (subNorm.startsWith(sn)) { if (starts === null) starts = source[k]; }
          else if (subNorm.includes(sn)) { if (includesMatch === null) includesMatch = source[k]; }
        }
      }
      if (exact !== null) return exact;
      if (starts !== null) return starts;
      if (includesMatch !== null) return includesMatch;
      return undefined;
    };
    const r = matchIn(obj);
    if (r !== undefined) return r;
    if (obj._raw) { const rr = matchIn(obj._raw); if (rr !== undefined) return rr; }
    return '';
  },

  // 组合SKU：多表头/大小写兼容 + 多种常见列名兜底扫描
  // 早期版本把组合SKU列名匹配写死，容易漏；这里做成“列名同时含多个关键词”的模糊扫描，
  // 并覆盖 组合/关联/父/主/套装 + SKU 等常见叫法，避免再次漏抓。
  _getComboSku(obj) {
    const norm = (s) => normalizeText(s);
    const keys = [obj, obj && obj._raw].filter(Boolean);
    const inObj = (kw) => {
      const nkw = norm(kw);
      for (const src of keys) {
        for (const k in src) {
          if (k.startsWith('_')) continue;
          if (norm(k).includes(nkw)) return src[k];
        }
      }
      return '';
    };
    // 1) 常见列名（含大小写变体）
    const named = [
      '组合sku', '组合 sku', '组合SKU', '组合sku编号',
      '关联sku', '关联SKU', '父sku', '父SKU', '主sku', '主SKU',
      '套装sku', '套装SKU', '组合配件sku', '组合配件SKU', '组合sku码',
    ];
    for (const n of named) { const v = inObj(n); if (v !== '' && v !== null && v !== undefined) return v; }
    // 2) 模糊扫描：列名同时含某对关键词，排除易混淆列
    const pairs = [
      ['组合', 'sku'], ['关联', 'sku'], ['父', 'sku'], ['主', 'sku'], ['套装', 'sku'],
    ];
    const avoid = ['是否', '渠道', 'fba', '国家', '目的'];
    for (const [a, b] of pairs) {
      const na = norm(a), nb = norm(b);
      for (const src of keys) {
        for (const k in src) {
          if (k.startsWith('_')) continue;
          const nk = norm(k);
          if (!nk.includes(na) || !nk.includes(nb)) continue;
          if (avoid.some(x => nk.includes(norm(x)))) continue;
          const v = src[k];
          if (v !== '' && v !== null && v !== undefined) return v;
        }
      }
    }
    return '';
  },

  // --- 销量库存大表 ---
  mapSales(data) {
    if (data.length > 0) {
      console.log('[mapSales] sample keys:', Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 25));
      debugLog('[mapSales] 优先级字段测试: ' + this.getField(data[0], ['优先级']));
      const sampleDo = this.getField(data[0], ['未收订单（按需更新）', '未收订单', '国内订单']);
      const doKeys = Object.keys(data[0]).filter(k => /未收订单|国内订单/.test(k));
      debugLog('[mapSales] 国内订单匹配: sample=' + sampleDo + ', 命中keys=' + doKeys.join(', '));
    }
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      const gc = (groupKws, subKws) => this.getFieldComposite(obj, groupKws, subKws);
      // 国内订单：优先匹配销量表里“未收订单（按需更新）”列，若未命中再兜底任何含“未收订单/国内订单”的列
      let domesticOrder = get(['未收订单（按需更新）', '未收订单', '国内订单']);
      if (domesticOrder === '' || domesticOrder === undefined) {
        const rawKeys = Object.keys(obj).filter(k => !k.startsWith('_'));
        const fallbackKey = rawKeys.find(k => /未收订单|国内订单/.test(k));
        if (fallbackKey) domesticOrder = obj[fallbackKey];
      }
      // 仅保留指定的精简字段（连同 _raw 等内部字段），不再展开整行原始列，减小体积、便于云端同步
      const extra = {};
      for (const k in obj) { if (k.startsWith('_')) extra[k] = obj[k]; }
      return Object.assign(extra, {
        channel: get(['渠道']),
        channelSku: get(['渠道sku', 'sku']),
        isFba: get(['是否fba']),
        isCombo: get(['是否组合']),
        isPo: get(['是否po', '是否po产品', 'po产品']),
        country: get(['国家']),
        displayName: get(['显示名称', 'ns名称']),
        salesStatus: get(['销售状态']),
        priority: get(['优先级']),
        priorityBuyer: get(['采购员', '采购负责人', '采购人', 'purchaser']),
        opManager: get(['运营负责人', '运营']),
        planManager: get(['计划负责人', '计划员']),
        sales3d: get(['3d']),
        monthlySales: get(['正常库存月销', '月销']),
        // 销量大表近三月销量列（T-2 口径：实际表头月份即展示月份）
        salesJun: get(['2026-7', '2026年7', '26-7', '7月']),
        salesJul: get(['2026-8', '2026年8', '26-8', '8月']),
        salesAug: get(['2026-9', '2026年9', '26-9', '9月']),
        overseasStock: get(['海外仓总库存', '海外仓']),
        inTransit: get(['在途']),
        domesticStock: get(['国内实仓库存', '国内实仓']),
        domesticOrder,
        availableDays: get(['可售天数']),
        // 9月交付相关字段（原取自发货明细 delivery，现统一从销量大表 sales 取）
        augTarget: get(['9月目标']) || gc(['9月'], ['目标']),
        deliveryQty: get(['交付数量']) || gc(['9月'], ['交付数量', '交付']),
        remainingDelivery: get(['剩余交付']) || gc(['9月'], ['剩余交付', '剩余']),
        waitContainer: get(['待装柜']) || gc(['9月'], ['待装柜']),
        loading: get(['装柜中']) || gc(['9月'], ['装柜中', '装柜']),
        waitShip: get(['待发货']) || gc(['9月'], ['待发货']),
        shipped: get(['已发货']) || gc(['9月'], ['已发货']),
        logisticsPending: get(['物流未处理']) || gc(['9月'], ['物流未处理', '未处理']),
        sepOnShelf: get(['9月预计上架（T-2）', '9月预计上架(T-2)', '9月预计上架']),
        warehouseType: get(['目的仓类型', '仓类型']),
        // 品类 / 新品 / PO 标记
        bigCategory: get(['大类']),
        catL1: get(['一级类目', '一级品类']),
        catL2: get(['二级类目', '二级品类']),
        isNewProduct: get(['新品', '是否新品', '新品标记']),
      });
    });
  },

  // --- 发货交付明细 ---
  mapDelivery(data) {
    debugLog('[mapDelivery] 输入' + data.length + '行');
    if (data.length > 0) {
      debugLog('[mapDelivery] 表头字段: ' + Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 25).join(', '));
    }
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      const gc = (groupKws, subKws) => this.getFieldComposite(obj, groupKws, subKws);
      const mapped = {
        ...obj,
        channel: get(['渠道']),
        channelSku: get(['渠道sku']),
        comboSku: this._getComboSku(obj),
        isFba: get(['是否fba']),
        isCombo: get(['是否组合']),
        country: get(['目的国家', '目的国', '国家']),
        warehouseType: get(['目的仓类型', '仓类型']),
        priority: get(['优先级']),
        buyer: get(['采购负责人', '采购员']),
        opManager: get(['运营负责人']),
        displayName: get(['显示名称']),
        augTarget: get(['9月目标']) || gc(['9月'], ['目标']),
        deliveryQty: get(['交付数量']) || gc(['9月'], ['交付数量', '交付']),
        remainingDelivery: get(['剩余交付']) || gc(['9月'], ['剩余交付', '剩余']),
        waitContainer: get(['待装柜']) || gc(['9月'], ['待装柜']),
        loading: get(['装柜中']) || gc(['9月'], ['装柜中', '装柜']),
        waitShip: get(['待发货']) || gc(['9月'], ['待发货']),
        shipped: get(['已发货']) || gc(['9月'], ['已发货']),
        logisticsPending: get(['物流未处理']) || gc(['9月'], ['物流未处理', '未处理']),
      };
      return mapped;
    });
  },

  // --- 供应商追踪（多行表头，复合key匹配） ---
  mapSupplier(data, headers = []) {
    console.log('[mapSupplier] data length:', data.length);
    if (data.length > 0) {
      console.log('[mapSupplier] sample keys:', Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 30));
      console.log('[mapSupplier] sample _raw:', JSON.stringify(data[0]._raw || {}).slice(0, 600));
    }
    const mapped = data.map((obj, idx) => {
      const get = (kws) => this.getField(obj, kws);
      // 复合查找：月份分组+子字段
      const gc = (monthKws, subKws) => this.getFieldComposite(obj, monthKws, subKws);
      // 取第一个“非空”值；用 '' 视为未命中，避免 0/0.0 这类合法数值被 || 吞掉
      const first = (...vals) => {
        for (const v of vals) { if (v !== '' && v !== null && v !== undefined) return v; }
        return '';
      };
      // 按列位置推断无月份前缀的"采购备注"属于哪个月份：
      // 有些模板只写"采购备注"四个字（上面分组不是"9月"），导致 gc 匹配不到。
      // 这里从"9月交期/可交"等锚点列向右扫描，取第一个遇到的"采购备注"列。
      const findRemarkByPosition = (monthKw) => {
        if (!headers || headers.length === 0) return undefined;
        const normHeaders = headers.map(h => normalizeText(String(h || '')));
        const monthNorm = normalizeText(monthKw);
        const anchorIdx = normHeaders.findIndex(h =>
          h.includes(monthNorm) &&
          (h.includes('交期') || h.includes('可交') || h.includes('交付') || h.includes('目标') || h.includes('箱单'))
        );
        if (anchorIdx < 0) return undefined;
        for (let i = anchorIdx + 1; i < normHeaders.length; i++) {
          const h = normHeaders[i];
        // 如果先遇到下一个月的可交/交期/目标锚点，说明本月份区域已结束
        // 注意：不能用“箱单”作为边界，因为分组名“总发货计划箱单情况”会误触发。
        if (/[89]\s*月|10\s*月|11\s*月|12\s*月|2026(08|09|10|11|12)/.test(h) &&
            !h.includes(monthNorm) &&
            (h.includes('可交') || h.includes('交期') || h.includes('目标'))) break;
          if (h.includes('采购备注') || h.includes('备注')) {
            // 优先用原始列索引取值，避免重名列互相覆盖
            if (obj._values && i < obj._values.length) {
              const v = obj._values[i];
              if (v !== '' && v !== null && v !== undefined) return v;
            }
            const rawKey = headers[i];
            if (rawKey && obj._raw && rawKey in obj._raw) return obj._raw[rawKey];
            if (rawKey && rawKey in obj) return obj[rawKey];
            return undefined;
          }
        }
        return undefined;
      };
      // 兜底扫描：直接匹配失败时，按关键词模糊扫描所有列名（含 _raw 原始表头）
      const findLike = (must, avoid) => {
        const mustNorm = (must || []).map(normalizeText).filter(Boolean);
        const avoidNorm = (avoid || []).map(normalizeText).filter(Boolean);
        for (const src of [obj, obj._raw]) {
          if (!src) continue;
          for (const k in src) {
            if (k.startsWith('_')) continue;
            const nk = normalizeText(k);
            if (mustNorm.some(m => !nk.includes(m))) continue;
            if (avoidNorm.some(a => nk.includes(a))) continue;
            const v = src[k];
            if (v !== '' && v !== null && v !== undefined) return v;
          }
        }
        return '';
      };

      // 8月/9月交期：优先精确匹配"待交付箱单交期"，再fallback到简单"交期"
      const augDateRaw = gc(['8月'], ['待交付箱单交期']) || gc(['8月'], ['交期']) || gc(['8月'], ['日期']) || get(['8月交期']);
      const sepDateRaw = gc(['9月'], ['待交付箱单交期']) || gc(['9月'], ['交期']) || gc(['9月'], ['日期']) || get(['9月交期']);
      const octDateRaw = gc(['10月'], ['待交付箱单交期']) || gc(['10月'], ['交期']) || gc(['10月'], ['日期']) || get(['10月交期']);

      const result = {
        ...obj,
        channel: get(['渠道']),
        channelSku: get(['渠道sku']),
        comboSku: this._getComboSku(obj),
        isCombo: get(['是否组合']),
        isFba: get(['是否fba']),
        country: get(['目的国家', '目的国']),
        supplier: get(['供应商']),
        supplierStatus: get(['供应商状态']),
        salesStatus: get(['销售状态']),
        buyer: get(['采购员']),
        displayName: first(get(['显示名称']), get(['NS名称']), get(['ns名称'])),
        category: first(
          get(['品类']), get(['品类名称']), get(['NS品类']), get(['NS名称']),
          get(['类目']), get(['产品类目']), get(['产品类别']), get(['类别']),
          findLike(['品类', '类目', '类别', 'ns名称', 'ns品类'], [])
        ),
        planner: get(['计划员']),
        // 9月 - 箱单字段：界面采购页显示为"9月现货箱单/9月待交付箱单"，但字段名前缀仍是 aug*（历史遗留），
        // 因此按 9 月去匹配上传的"9月总发货计划箱单情况"分组。
        augSpotBox: first(gc(['9月'], ['现货箱单', '现货']), get(['9月现货箱单'])),
        augPendingBoxCombo: first(gc(['9月'], ['待交付箱单-组合配件', '待交付箱单组合配件']), get(['9月待交付箱单-组合配件'])),
        augPendingBox: first(gc(['9月'], ['待交付箱单']), get(['9月待交付箱单'])),
        // 以下 aug* 可交/交期/备注字段保持匹配 8 月（历史字段，当前界面不再显示），避免和批量上传模板中的"8月"列冲突。
        augDeliverable: gc(['8月'], ['可交数量', '可交']),
        augDeliveryDate: excelDateToText(augDateRaw, 8),
        augRemark: first(gc(['8月交期回复', '8月'], ['采购备注', '备注']), findRemarkByPosition('8月')),
        // 9月
        sepSpotBox: gc(['9月'], ['现货箱单', '现货']),
        sepPendingBoxCombo: first(gc(['9月'], ['待交付箱单-组合配件', '待交付箱单组合配件']), get(['9月待交付箱单-组合配件'])),
        sepPendingBox: first(gc(['9月'], ['待交付箱单']), get(['9月待交付箱单'])),
        sepTargetSup: first(get(['202609目标']), get(['9月目标']), get(['202609']), get(['9月']), gc(['9月'], ['目标']), gc(['202609'], ['目标'])),
        sepDeliverable: gc(['9月'], ['可交数量', '可交']),
        sepDeliveryDate: excelDateToText(sepDateRaw, 9),
        sepRemark: first(gc(['9月交期回复', '9月'], ['采购备注', '备注']), findRemarkByPosition('9月')),
        // 10月
        octSpotBox: gc(['10月'], ['现货箱单', '现货']),
        octPendingBoxCombo: first(gc(['10月'], ['待交付箱单-组合配件', '待交付箱单组合配件']), get(['10月待交付箱单-组合配件'])),
        octPendingBox: first(gc(['10月'], ['待交付箱单']), get(['10月待交付箱单'])),
        octTargetSup: first(get(['202610目标']), get(['10月目标']), get(['202610']), get(['10月']), gc(['10月'], ['目标']), gc(['202610'], ['目标'])),
        novTargetSup: first(get(['202611目标']), get(['11月目标']), get(['202611']), get(['11月']), gc(['11月'], ['目标']), gc(['202611'], ['目标'])),
        octDeliverable: gc(['10月'], ['可交数量', '可交']),
        octDeliveryDate: excelDateToText(octDateRaw, 10),
        octRemark: first(gc(['10月交期回复', '10月'], ['采购备注', '备注']), findRemarkByPosition('10月')),
      };

      // Debug: 第一行的交期匹配结果
      if (idx === 0) {
        console.log('[mapSupplier] 交期匹配 debug:', {
          'augDateRaw': augDateRaw, 'augDeliveryDate': result.augDeliveryDate,
          'sepDateRaw': sepDateRaw, 'sepDeliveryDate': result.sepDeliveryDate,
          'augDeliverable': result.augDeliverable,
        });
        debugLog('[mapSupplier] 交期匹配: augDateRaw=' + augDateRaw + ' → ' + result.augDeliveryDate + ' | augDeliverable=' + result.augDeliverable);
        debugLog('[mapSupplier] 组合SKU(首行)=' + result.comboSku + ' | _raw组合列示例=' + JSON.stringify(Object.fromEntries(Object.entries(obj._raw || {}).filter(([k]) => normalizeText(k).includes('组合') || normalizeText(k).includes('sku')).slice(0, 6))));
      }

      return result;
    });

    // 组合SKU 自动兜底：供应商追踪表里，若某行「是否组合」字段为"是"，
    // 但其组合SKU 为空，则取本行的渠道SKU 填入组合SKU 列。
    // 仅当本行组合SKU 为空时才补，避免覆盖已手动填好的值。
    for (const r of mapped) {
      const ic = normalizeText(String(r.isCombo || ''));
      const comboLike = ic.includes('组合') || ['是', 'y', 'yes', 'true', '1'].includes(ic);
      if (comboLike && !String(r.comboSku || '').trim()) {
        r.comboSku = String(r.channelSku || '').trim() || '';
      }
    }

    return mapped;
  },

  // --- 取消订单 ---
  mapCancel(data) {
    if (data.length > 0) {
      debugLog('[mapCancel] 字段: ' + Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 15).join(', '));
    }
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      return {
        ...obj,
        channel: get(['渠道']),
        channelSku: get(['渠道sku', '渠道 sku', 'sku']),
        buyer: get(['采购员', '采购负责人']),
        cancelSupplierStock: get(['供应商库存', '库存']),
      };
    });
  },

  // --- 需补订单 ---
  mapReplenish(data) {
    debugLog('[mapReplenish] 输入' + data.length + '行');
    if (data.length > 0) debugLog('[mapReplenish] 字段: ' + Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 15).join(', '));
    // 构建白名单索引：供应商 -> 采购负责人
    const whitelist = Store.getData('whitelist');
    const wlMap = {};
    whitelist.forEach(w => {
      const sKey = normalizeText(w.supplier);
      if (sKey && w.buyer) {
        if (!wlMap[sKey]) wlMap[sKey] = [];
        wlMap[sKey].push(w.buyer);
      }
    });

    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      let buyer = get(['采购员', '采购负责人', '负责人']);
      const supplier = get(['供应商']);
      // 如果没有采购员，从白名单按供应商查找
      if (!buyer && supplier) {
        const wlBuyers = wlMap[normalizeText(supplier)];
        if (wlBuyers && wlBuyers.length > 0) buyer = wlBuyers[0];
      }
      return {
        ...obj,
        channelSku: get(['渠道sku', 'sku']),
        supplier: supplier,
        buyer: buyer,
      };
    });
  },

  // --- 供货清单（多Sheet合并） ---
  mapSupply(data) {
    debugLog('[mapSupply] 输入' + data.length + '行');
    if (data.length > 0) debugLog('[mapSupply] 字段: ' + Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 15).join(', '));
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      return {
        ...obj,
        channelSku: get(['渠道sku', 'sku']),
        supplier: get(['供应商', '供应商名称']),
        minOrder: get(['起订量']),
        category: get(['品类']),
        supplierStatus: get(['供应商状态']),
        buyer: get(['采购负责人', '负责人', '采购员']),
        backupDate: excelDateToText(get(['后补日期']), 8),
      };
    });
  },

  // --- 白名单 ---
  mapWhitelist(data) {
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      return {
        ...obj,
        supplier: get(['供应商']),
        category: get(['品类']),
        buyer: get(['采购负责人', '负责人', '采购员']),
        supplierStatus: get(['供应商状态']),
      };
    });
  },

  // --- 货品表（SKU + 品类，用于采购页品类兜底） ---
  mapGoods(data) {
    debugLog('[mapGoods] 输入' + data.length + '行');
    if (data.length > 0) debugLog('[mapGoods] 字段: ' + Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 15).join(', '));
    return data.map(obj => {
      const get = (kws) => this.getField(obj, kws);
      return {
        ...obj,
        channelSku: get(['sku', '渠道sku', '渠道SKU', 'SKU', '渠道Sku']),
        category: get(['品类', '类目', 'category', '品類']),
      };
    });
  }
};

// ===== 上传覆盖 / 追加合并 =====
// 各上传类型在“追加模式”（取消勾选覆盖）下的去重主键：
// 旧数据保留，新数据中主键相同的行覆盖旧行，主键不同的新行追加。
const OVERWRITE_KEYFN = {
  whitelist: (r) => [r.supplier, r.category, r.buyer].map(v => normalizeText(String(v || ''))).join('|'),
  supply: (r) => normalizeText(String(r.channelSku || '')),
  goods: (r) => normalizeText(String(r.channelSku || '')),
  // 取消/需补订单：按整行内容去重，避免同 SKU 多行被误合并成一行
  cancel: (r) => 'row:' + JSON.stringify(r),
  // 需补订单合并更新：以 SKU+供应商 为 key，匹配时保留采购交期字段
  replenish: (r) => [r.channelSku, r.supplier].map(v => normalizeText(String(v || ''))).join('|'),
  // 供应商追踪表：一行 = 某 SKU 在某采购员、某供应商下的独立跟踪记录。
  // 合并主键必须含「采购员(buyer)」与「供应商(supplier)」：
  // 否则同 SKU 不同采购员、或同 SKU+同采购员但不同供应商的行会被塌缩成一行而丢数据。
  supplier: (r) => [r.channel, r.channelSku, r.isFba, r.isCombo, r.country, r.buyer, r.supplier].map(v => normalizeText(String(v || ''))).join('|'),
};

// ===== 销量大表 增量合并 =====
// 销量大表体积大且需跨电脑同步，故：①云端只存 mapSales 产出的“指定字段”（不展开原始列）；
// ②下次上传按 salesKey 增量合并——同键行更新数据字段、新键行追加，而非整表替换。
// 主键：渠道 + 渠道SKU + 是否FBA + 是否组合 + 是否PO产品 + 国家
function salesKey(r) {
  return [r.channel, r.channelSku, r.isFba, r.isCombo, r.isPo, r.country]
    .map(v => normalizeText(String(v || ''))).join('|');
}
// 上传云端前的投影字段白名单：mapSales 已仅含指定字段，这里再剔除非必要字段，进一步压缩云端体积。
const SALES_SLIM_FIELDS = ['channel', 'channelSku', 'isFba', 'isCombo', 'isPo', 'country', 'displayName',
  'salesStatus', 'priority', 'opManager', 'planManager', 'priorityBuyer', 'sales3d', 'monthlySales',
  'salesJun', 'salesJul', 'salesAug', 'overseasStock', 'inTransit', 'domesticStock', 'domesticOrder', 'availableDays',
  'augTarget', 'deliveryQty', 'remainingDelivery', 'waitContainer', 'loading', 'waitShip', 'shipped',
  'logisticsPending', 'sepOnShelf', 'warehouseType', 'bigCategory', 'catL1', 'catL2', 'isNewProduct'];
function projectSalesSlim(rows) {
  return (rows || []).map(r => {
    const o = {};
    SALES_SLIM_FIELDS.forEach(f => { if (r[f] !== undefined) o[f] = r[f]; });
    return o;
  });
}
// 增量合并：已有行按 dataFields 覆盖更新（新上传值为准），新键行直接追加；旧数据里新表没有的行保留。
function mergeSalesIncremental(oldArr, newArr) {
  const keyFields = ['channel', 'channelSku', 'isFba', 'isCombo', 'isPo', 'country'];
  const dataFields = SALES_SLIM_FIELDS.filter(f => !keyFields.includes(f));
  const map = new Map();
  (oldArr || []).forEach(r => map.set(salesKey(r), Object.assign({}, r)));
  (newArr || []).forEach(r => {
    const k = salesKey(r);
    const existing = map.get(k);
    if (existing) {
      const merged = Object.assign({}, existing);
      dataFields.forEach(f => { if (r[f] !== undefined && r[f] !== '') merged[f] = r[f]; });
      map.set(k, merged);
    } else {
      map.set(k, Object.assign({}, r));
    }
  });
  return [...map.values()];
}
function mergeRecords(oldData, newData, keyFn) {
  const map = new Map();
  const push = (r) => { let k = keyFn ? keyFn(r) : ''; if (!k) k = 'row:' + JSON.stringify(r); map.set(k, r); };
  (oldData || []).forEach(push);
  (newData || []).forEach(push); // 新的后放，覆盖旧的同 key 行
  return [...map.values()];
}
// 合并更新（保留指定字段）：新数据覆盖旧数据，但 protectedFields 中的字段优先保留旧值（旧值存在时）
// opts.clearOrphan=true 时：新表没有的孤儿 SKU 不再整行保留，只保留身份字段(keyFields)+采购员手动字段，其余跟踪表字段清空
function mergeRecordsPreserve(oldData, newData, keyFn, protectedFields, opts) {
  opts = opts || {};
  const clearOrphan = !!opts.clearOrphan;
  const keyFields = opts.keyFields || [];
  const hasValue = v => v !== '' && v !== null && v !== undefined;
  const entries = new Map(); // key -> { old, neu }
  const pushOld = (r) => {
    let k = keyFn ? keyFn(r) : '';
    if (!k) k = 'row:' + JSON.stringify(r);
    entries.set(k, { old: r, neu: null });
  };
  const pushNew = (r) => {
    let k = keyFn ? keyFn(r) : '';
    if (!k) k = 'row:' + JSON.stringify(r);
    const e = entries.get(k);
    if (e) e.neu = r;
    else entries.set(k, { old: null, neu: r });
  };
  (oldData || []).forEach(pushOld);
  (newData || []).forEach(pushNew);
  return [...entries.values()].map(({ old, neu }) => {
    if (!old) return neu;
    if (!neu) {
      if (!clearOrphan) return old;
      // 孤儿 SKU（新表已无此 SKU）：只保留身份字段 + 采购员手动字段(排除品类)，其余跟踪表字段清空
      const rec = {};
      keyFields.forEach(f => { rec[f] = (old[f] != null ? old[f] : ''); });
      (protectedFields || []).filter(f => f !== 'category').forEach(f => { rec[f] = (old[f] != null ? old[f] : ''); });
      // 补上标准化字段的 key（值为空），避免 getData 自动标准化误判为旧原始数据而重跑 mapSupplier 清空采购员字段
      rec.comboSku = '';
      return rec;
    }
    const merged = { ...neu };
    (protectedFields || []).forEach(f => {
      if (hasValue(old[f])) merged[f] = old[f];
    });
    return merged;
  });
}
// ===== 供应商表上传时：从云端找回采购交期/备注，按 SKU 合并到本地 =====
// 背景：采购员在各工作台填的交期/备注已随 supplier 表同步云端。但上传新跟踪表时，
// 若本地数据丢失（换电脑/清缓存）或本地版本较旧，直接用本地 old 合并会丢掉云端已有的采购字段。
// 此函数在合并前把「云端」的采购交期/备注补回本地（本地不空优先本地，本地空则补云端），
// 保证新表上传后这些按 SKU 关联的采购字段不丢、不错位。短超时（8s），失败静默降级用本地。
async function pullSupplierCloudShort() {
  if (!Sync.enabled || !Sync.client) return null;
  if (typeof Sync.shouldSync === 'function' && !Sync.shouldSync('supplier')) return null;
  try {
    const { data, error } = await Sync._withTimeout(
      Sync.client.from('sku_sync').select('payload').eq('type', 'supplier').maybeSingle(),
      8000, '拉取云端供应商(短超时)'
    );
    if (error || !data) return null;
    let p = data.payload;
    if (p && typeof p === 'object' && p.__chunks) {
      try { p = await Sync._pullChunksBatched('supplier', p.__chunks); } catch (e) { debugLog('[pullSupplierCloudShort] 分片重组失败: ' + (e && e.message)); return null; }
    }
    return (Array.isArray(p)) ? p : null;
  } catch (e) { debugLog('[pullSupplierCloudShort] 失败（降级用本地）: ' + (e && e.message)); return null; }
}

// 把云端 supplier 的采购交期/备注（受保护字段）按 SKU 补回本地：本地该字段非空则保留，否则取云端。
function mergeCloudPurchaseIntoLocal(local, cloud) {
  if (!cloud || !cloud.length) return local;
  const keyFn = OVERWRITE_KEYFN.supplier;
  const protectedF = getProtectedFields('supplier');
  const cloudMap = new Map();
  cloud.forEach(r => cloudMap.set(keyFn(r), r));
  return local.map(r => {
    const c = cloudMap.get(keyFn(r));
    if (!c) return r;
    const merged = { ...r };
    protectedF.forEach(f => {
      const hasLocal = (r[f] != null && r[f] !== '');
      const hasCloud = (c[f] != null && c[f] !== '');
      if (!hasLocal && hasCloud) merged[f] = c[f];
    });
    return merged;
  });
}

// 按文件类型返回需要保留的旧字段列表（采购交期相关）
function getProtectedFields(fileType) {
  if (fileType === 'supplier') {
    // 供应商追踪表（以9月发货明细为底表，追踪表本身即权威数据源）：
    // 上传后整表替换原数据，仅保留采购员手动填写的以下 6 个字段（云端/本地已存的旧值优先）：
    // 9月/10月的 交期、可交数量、采购备注。品类等其余字段一律以新表为准。
    return ['sepDeliveryDate', 'sepDeliverable', 'sepRemark',
            'octDeliveryDate', 'octDeliverable', 'octRemark'];
  }
  if (fileType === 'replenish') {
    // 需补订单目前没有独立的交期字段，随界面扩展可在此追加
    return [];
  }
  return [];
}
// 合并「仅大小写不同」的同一 SKU（如 M90413W 与 m90413w）：因 joinKey 用 normalizeText 转小写，
// 大小写不同的同一 SKU 会被当成同一 key，在 buildMap / mergeRecordsPreserve / 主表匹配时互相覆盖，
// 导致采购备注/交期串行到“另一个 SKU”。此函数把它们按“大写 channelSku + 渠道/FBA/组合/国家”分组，
// 同组多行合并为一条（各字段取非空值，受保护字段优先保留出现的非空值），从根上消除 key 冲突。
function mergeCaseVariantRows(data) {
  if (!Array.isArray(data) || data.length < 2) return data;
  const groups = {};
  data.forEach(r => {
    // 分组 key 必须与「供应商存储主键 / OVERWRITE_KEYFN.supplier」对齐（含采购员与供应商），
    // 否则同 SKU 下不同采购员、不同供应商的跟踪行会被错误合并成一行，导致渲染/导出丢行。
    const key = [
      String(r.channelSku || '').trim().toUpperCase(),
      normalizeText(r.channel),
      normalizeText(r.isFba),
      normalizeText(r.isCombo),
      normalizeText(r.country),
      normalizeText(r.buyer),
      normalizeText(r.supplier)
    ].join('|');
    (groups[key] = groups[key] || []).push(r);
  });
  const out = [];
  for (const key in groups) {
    const rows = groups[key];
    if (rows.length === 1) { out.push(rows[0]); continue; }
    const merged = Object.assign({}, rows[0]);
    const protectedF = getProtectedFields('supplier');
    rows.slice(1).forEach(r => {
      for (const k in r) {
        if (k.startsWith('_')) continue;
        const v = r[k];
        if (v != null && v !== '') {
          // 受保护字段（采购备注/交期等）只要出现非空就保留；其余字段仅在当前为空时补
          if (protectedF.includes(k) || merged[k] == null || merged[k] === '') merged[k] = v;
        }
      }
    });
    out.push(merged);
  }
  return out;
}
// ===== 导出“用户上传的源文件”：直出 _raw 原始行，不经过任何合并/富化/去重，行数=上传行数 =====
// opts: { perBuyer, userName, isAdmin }
// 采购员登录只导出本人行（按采购员名匹配）；管理员导出全部。列按上传源文件原始表头顺序还原。
// 若 opts.backfillDates !== false，则把采购员已填的「月份交期/可交/备注」按本行对齐回填到源文件对应列。

// 在 _raw 原始表头里按「月份词 + 子词」定位列名（如 “9月待交付箱单交期”、“9月可交数量”）
function _rawColByName(raw, monthNorm, subNorms) {
  const keys = Object.keys(raw || {}).filter(k => !k.startsWith('_'));
  const subN = subNorms.map(s => normalizeText(s));
  // 1) 含月份且含子词
  for (const k of keys) {
    const nk = normalizeText(k);
    if (nk.includes(normalizeText(monthNorm)) && subN.some(s => nk.includes(s))) return k;
  }
  // 2) 备注列常无月份前缀：兜底精确匹配“采购备注 / 备注”
  if (subN.some(s => s === '备注' || s === '采购备注')) {
    for (const k of keys) {
      const nk = normalizeText(k);
      if (nk === '采购备注' || nk === '备注') return k;
    }
    for (const k of keys) {
      const nk = normalizeText(k);
      if (nk.startsWith('采购备注') || nk.endsWith('备注')) return k;
    }
  }
  return null;
}

// 把采购员已填的月份交期/可交/备注，按本行（渠道/渠道SKU/组合SKU/是否组合/是否FBA/供应商/目的国家）对齐回填到源文件对应列。
// 仅当富字段非空才覆盖，避免清空源文件原有值。
function backfillRichDatesIntoRaw(raw, rich) {
  if (!raw || !rich) return;
  const specs = [
    { f: 'sepDeliveryDate', month: '9月', subs: ['交期'] },
    { f: 'sepDeliverable', month: '9月', subs: ['可交'] },
    { f: 'sepRemark', month: '9月', subs: ['采购备注', '备注'] },
    { f: 'octDeliveryDate', month: '10月', subs: ['交期'] },
    { f: 'octDeliverable', month: '10月', subs: ['可交'] },
    { f: 'octRemark', month: '10月', subs: ['采购备注', '备注'] },
  ];
  for (const s of specs) {
    const v = rich[s.f];
    if (v === '' || v == null) continue;
    const col = _rawColByName(raw, s.month, s.subs);
    if (col != null && raw[col] !== v) raw[col] = v;
  }
}

function buildRawSupplierExportRows(all, opts) {
  opts = opts || {};
  let data = (all || []).filter(r => r && (Object.keys(r).length || (r._raw && Object.keys(r._raw).length)));
  if (opts.perBuyer && !opts.isAdmin) {
    data = data.filter(r => nameMatches(r.buyer, opts.userName));
  }
  const rows = data.map(r => {
    let o;
    // 优先用上传时保存的 _raw 原始列；无 _raw 时用非下划线字段兜底
    if (r._raw && Object.keys(r._raw).length) {
      o = {};
      for (const k in r._raw) o[k] = (r._raw[k] != null ? r._raw[k] : '');
    } else {
      o = {};
      Object.keys(r).forEach(k => { if (!k.startsWith('_')) o[k] = (r[k] != null ? r[k] : ''); });
    }
    return o;
  });
  // 表头按首次出现顺序收集，还原原始表结构
  const headers = [];
  rows.forEach(o => { for (const k in o) if (!headers.includes(k)) headers.push(k); });
  return { headers, rows, count: data.length };
}

// 是否整份覆盖：复选框勾选=覆盖（默认）；无复选框的类型默认也覆盖
// force=true 时强制覆盖（用于管理员销量/发货上传）
function isOverwrite(fileType, force) {
  if (force) return true;
  const el = document.getElementById('ov-' + fileType);
  return !el || el.checked;
}

// ===== 数据合并器 =====
const Merger = {
  joinKey(row) {
    return [row.channel, row.channelSku, row.isFba, row.isCombo, row.country]
      .map(v => normalizeText(String(v || ''))).join('|');
  },

  skuKey(row) { return normalizeText(String(row.channelSku || '')); },

  getMergedData() {
    // 缓存：底层合并源数据未变化时直接复用上次结果，避免每次渲染/搜索/自动刷新都重建整张表
    if (this._cache && this._cache.v === Store._mergeVersion) return this._cache.r;
    const sales = Store.getData('sales');
    const delivery = Store.getData('delivery');
    const supplier = Store.getData('supplier');
    const cancel = Store.getData('cancel');

    // 构建发货交付索引 - 双重索引：joinKey和skuKey
    const deliveryJoinMap = {};
    const deliverySkuMap = {};
    let dJoinMatched = 0, dSkuMatched = 0;
    delivery.forEach(d => {
      const jk = this.joinKey(d);
      if (!deliveryJoinMap[jk]) deliveryJoinMap[jk] = [];
      deliveryJoinMap[jk].push(d);
      const sk = this.skuKey(d);
      if (sk && !deliverySkuMap[sk]) deliverySkuMap[sk] = d; // SKU优先取第一条
    });

    // 构建供应商追踪索引（按joinKey和skuKey双重索引）
    const supplierJoinMap = {};
    const supplierSkuMap = {};
    supplier.forEach(s => {
      const jk = this.joinKey(s);
      if (!supplierJoinMap[jk]) supplierJoinMap[jk] = [];
      supplierJoinMap[jk].push(s);
      const sk = this.skuKey(s);
      if (!supplierSkuMap[sk]) supplierSkuMap[sk] = [];
      supplierSkuMap[sk].push(s);
    });

    // 取消订单索引（按SKU + joinKey双重索引）
    const cancelMap = {};
    const cancelJoinMap = {};
    cancel.forEach(c => {
      const sk = this.skuKey(c);
      const jk = this.joinKey(c);
      if (!cancelMap[sk]) cancelMap[sk] = [];
      cancelMap[sk].push(c);
      if (jk && jk !== '|' + sk) {
        if (!cancelJoinMap[jk]) cancelJoinMap[jk] = [];
        cancelJoinMap[jk].push(c);
      }
    });

    const result = sales.map(s => {
      const k = this.joinKey(s);
      const sk = this.skuKey(s);

      // 优先用joinKey匹配delivery，否则用skuKey
      let dRows = deliveryJoinMap[k] || [];
      if (dRows.length === 0 && deliverySkuMap[sk]) {
        dRows = [deliverySkuMap[sk]];
        dSkuMatched++;
      } else if (dRows.length > 0) {
        dJoinMatched++;
      }
      const d = dRows[0] || {};

      // 供应商：优先joinKey，否则skuKey
      const sRows = supplierJoinMap[k] || supplierSkuMap[sk] || [];
      const cRows = cancelJoinMap[k] || cancelMap[sk] || [];

      // 聚合策略：数量类求和，日期类取第一个非空值，文本类逗号连接
      const numAgg = (field) => {
        const nums = sRows.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
        return nums.length ? nums.reduce((a, b) => a + b, 0) : '';
      };
      const firstAgg = (field) => sRows.map(r => r[field]).find(v => v !== '' && v !== null && v !== undefined) || '';
      const txtAgg = (field) => sRows.map(r => r[field]).filter(v => v !== '' && v !== null && v !== undefined).join(', ');
      const cancelStockAgg = () => {
        const nums = cRows.map(r => parseFloat(r.cancelSupplierStock)).filter(v => !isNaN(v));
        return nums.length ? nums.reduce((a, b) => a + b, 0) : '';
      };

      return {
        ...s,
        // 9月交付相关字段：统一从销量大表(sales)取；sales 缺值时回退到发货明细(delivery)以兼容过渡期数据
        augTarget: s.augTarget || d.augTarget || '',
        deliveryQty: s.deliveryQty || d.deliveryQty || '',
        remainingDelivery: s.remainingDelivery || d.remainingDelivery || '',
        waitContainer: s.waitContainer || d.waitContainer || '',
        loading: s.loading || d.loading || '',
        waitShip: s.waitShip || d.waitShip || '',
        shipped: s.shipped || d.shipped || '',
        logisticsPending: s.logisticsPending || d.logisticsPending || '',
        sepOnShelf: s.sepOnShelf || d.sepOnShelf || '',
        warehouseType: s.warehouseType || d.warehouseType || '',
        // 采购员：优先用 sales 标定的 priorityBuyer；老数据未上传「采购员」列时，从 supplier 表的 buyer 字段兜底聚合。
        // 同时拆分每行 buyer 字段（支持 "a, b" / "a、b" / "a/b" / "a\n b" 等格式）并整体去重，避免「程欣丰, 程欣丰」或 supplier 行 buyer 字符串内自带重复的情况。
        priorityBuyer: s.priorityBuyer || ([...new Set(sRows.flatMap(r => String(r.buyer || '').split(/[,，、\/\n]/).map(x => x.trim()).filter(Boolean)))].join(', ')) || '',
        // 显示名称：优先用 sales 标定的 displayName；老数据未填时，从 supplier 表的 displayName/category 兜底，再回退到 sales 自身的品类字段
        displayName: s.displayName || firstAgg('displayName') || firstAgg('category') || s.catL1 || s.bigCategory || s.catL2 || '',
        cancelSupplierStock: cancelStockAgg(),
        augSpotBox: firstAgg('augSpotBox'),
        augDeliverable: numAgg('augDeliverable'),
        augDeliveryDate: firstAgg('augDeliveryDate'),
        augRemark: txtAgg('augRemark'),
        sepDeliverable: numAgg('sepDeliverable'),
        sepDeliveryDate: firstAgg('sepDeliveryDate'),
        sepRemark: txtAgg('sepRemark'),
        octDeliverable: numAgg('octDeliverable'),
        octDeliveryDate: firstAgg('octDeliveryDate'),
        octRemark: txtAgg('octRemark'),
        _supplierRows: sRows,
      };
    });

    debugLog('[Merger] 合并: ' + result.length + '条销售, ' + dJoinMatched + '条发货(join匹配), ' +
      dSkuMatched + '条发货(sku匹配), 供应商' + supplier.length + '条, 取消' + cancel.length + '条');
    if (delivery.length > 0) {
      debugLog('[Merger] delivery前5个joinKey: ' + JSON.stringify(delivery.slice(0, 5).map(d => this.joinKey(d))));
      debugLog('[Merger] sales前5个joinKey: ' + JSON.stringify(sales.slice(0, 5).map(s => this.joinKey(s))));
      debugLog('[Merger] delivery[0]映射: channel=' + delivery[0]?.channel + ', sku=' + delivery[0]?.channelSku + ', fba=' + delivery[0]?.isFba + ', combo=' + delivery[0]?.isCombo + ', country=' + delivery[0]?.country + ', augTarget=' + delivery[0]?.augTarget);
    }
    // 确定性排序：计划页/运营页共用此合并结果。云端重新同步后，底层 sales 数组顺序可能与
    // 本地不一致，若直接按数组顺序渲染，行会“重排跳动”。统一按 显示名称→渠道SKU→采购员 稳定排序，
    // 保证同一批数据无论来源顺序如何，渲染行序始终一致，消除云端刷新后的表格跳动。
    const _nameKey = r => normalizeText(r.displayName || r.name || r.category || r['ns名称'] || r['NS名称'] || '');
    result.sort((a, b) => {
      const na = _nameKey(a), nb = _nameKey(b);
      if (na !== nb) return na < nb ? -1 : 1;
      const sa = normalizeText(a.channelSku || ''), sb = normalizeText(b.channelSku || '');
      if (sa !== sb) return sa < sb ? -1 : 1;
      const ba = normalizeText(a.buyer || a.priorityBuyer || ''), bb = normalizeText(b.buyer || b.priorityBuyer || '');
      if (ba !== bb) return ba < bb ? -1 : 1;
      return 0;
    });

    this._cache = { v: Store._mergeVersion, r: result };
    return result;
  },

  // 排序：正常状态优先
  sortByStatus(data) {
    return [...data].sort((a, b) => {
      const aNormal = normalizeText(a.salesStatus).includes('正常') ? 0 : 1;
      const bNormal = normalizeText(b.salesStatus).includes('正常') ? 0 : 1;
      if (aNormal !== bNormal) return aNormal - bNormal;
      return 0;
    });
  },

  extractPersonnel(salesData, supplierData) {
    const personnel = { purchase: new Set(), plan: new Set(), operation: new Set() };
    salesData.forEach(r => {
      if (r.priorityBuyer) String(r.priorityBuyer).split(/[,，、/\n]/).forEach(n => { n = n.trim(); if (n) personnel.purchase.add(n); });
      if (r.opManager) String(r.opManager).split(/[,，、/\n]/).forEach(n => { n = n.trim(); if (n) personnel.operation.add(n); });
      if (r.planManager) String(r.planManager).split(/[,，、/\n]/).forEach(n => { n = n.trim(); if (n) personnel.plan.add(n); });
    });
    (supplierData || []).forEach(r => {
      if (r.buyer) String(r.buyer).split(/[,，、/\n]/).forEach(n => { n = n.trim(); if (n) personnel.purchase.add(n); });
    });
    return { purchase: [...personnel.purchase], plan: [...personnel.plan], operation: [...personnel.operation] };
  }
};

// ===== 列配置 =====
const COLS = {
  // 运营视图列（含优先级、供应商库存、催更按钮）
  operation: [
    { f: 'channel', l: '渠道', filter: 'multi', filterKey: 'channel', filterField: 'channel' },
    { f: 'channelSku', l: '渠道SKU' },
    { f: 'isFba', l: '是否FBA', filter: 'multi', filterKey: 'op-is-fba', filterField: 'isFba' },
    { f: 'isCombo', l: '是否组合', filter: 'multi', filterKey: 'op-is-combo', filterField: 'isCombo' },
    { f: 'displayName', l: '显示名称', filter: 'multi', filterKey: 'name', filterField: 'displayName' },
    { f: 'salesStatus', l: '销售状态', filter: 'multi', filterKey: 'status', filterField: 'salesStatus' },
    { f: 'priority', l: '优先级', filter: 'multi', filterKey: 'priority', filterField: 'priority' },
    { f: 'country', l: '目的国家', filter: 'multi', filterKey: 'country', filterField: 'country' },
    { f: 'opManager', l: '运营负责人', filter: 'multi', filterKey: 'op-manager', filterField: 'opManager' },
    { f: 'priorityBuyer', l: '采购员', click: 'buyer', nag: true, filter: 'multi', filterKey: 'buyer', filterField: 'priorityBuyer' },
    { f: 'planManager', l: '计划负责人' },
    { f: 'overseasStock', l: '海外仓库存' },
    { f: 'inTransit', l: '在途' },
    { f: 'domesticStock', l: '国内实仓' },
    { f: 'domesticOrder', l: '国内订单' },
    { f: 'cancelSupplierStock', l: '供应商库存' },
    { f: 'augSpotBox', l: '9月现货箱单' },
    { f: 'availableDays', l: '可售天数' },
    { f: 'augTarget', l: '9月目标', filter: 'numeric', filterKey: 'aug-target', filterField: 'augTarget' },
    { f: 'deliveryQty', l: '交付数量', filter: 'numeric', filterKey: 'delivery-qty', filterField: 'deliveryQty' },
    { f: 'remainingDelivery', l: '剩余交付', filter: 'numeric', filterKey: 'remaining-delivery', filterField: 'remainingDelivery' },
    { f: 'sepOnShelf', l: '9月预计上架(T-2)', filter: 'multi', filterKey: 'sep-on-shelf', filterField: 'sepOnShelf' },
    { f: 'waitContainer', l: '待装柜' },
    { f: 'loading', l: '装柜中' },
    { f: 'waitShip', l: '待发货' },
    { f: 'logisticsPending', l: '物流未处理' },
    { f: 'sepDeliverable', l: '9月可交数量', filter: 'numeric', filterKey: 'sep-deliverable', filterField: 'sepDeliverable' },
    { f: 'sepDeliveryDate', l: '9月交期', filter: 'multi', filterKey: 'sep-delivery-date', filterField: 'sepDeliveryDate' },
    { f: 'sepRemark', l: '9月采购备注', filter: 'multi', filterKey: 'sep-remark', filterField: 'sepRemark' },
  ],

  // 计划视图列（含优先级、供应商库存、催更按钮）
  plan: [
    { f: 'channel', l: '渠道', filter: 'multi', filterKey: 'channel', filterField: 'channel' },
    { f: 'channelSku', l: '渠道SKU' },
    { f: 'isFba', l: '是否FBA', filter: 'multi', filterKey: 'plan-is-fba', filterField: 'isFba' },
    { f: 'isCombo', l: '是否组合', filter: 'multi', filterKey: 'plan-is-combo', filterField: 'isCombo' },
    { f: 'displayName', l: '显示名称', filter: 'multi', filterKey: 'name', filterField: 'displayName' },
    { f: 'salesStatus', l: '销售状态', filter: 'multi', filterKey: 'status', filterField: 'salesStatus' },
    { f: 'priority', l: '优先级', filter: 'multi', filterKey: 'priority', filterField: 'priority' },
    { f: 'country', l: '目的国家', filter: 'multi', filterKey: 'country', filterField: 'country' },
    { f: 'planManager', l: '计划负责人', filter: 'multi', filterKey: 'plan-manager', filterField: 'planManager' },
    { f: 'priorityBuyer', l: '采购员', click: 'buyer', nag: true, filter: 'multi', filterKey: 'buyer', filterField: 'priorityBuyer' },
    { f: 'overseasStock', l: '海外仓库存' },
    { f: 'inTransit', l: '在途' },
    { f: 'domesticStock', l: '国内实仓' },
    { f: 'domesticOrder', l: '国内订单' },
    { f: 'cancelSupplierStock', l: '供应商库存' },
    { f: 'augSpotBox', l: '9月现货箱单' },
    { f: 'availableDays', l: '可售天数' },
    { f: 'augTarget', l: '9月目标', filter: 'numeric', filterKey: 'aug-target', filterField: 'augTarget' },
    { f: 'deliveryQty', l: '交付数量', filter: 'numeric', filterKey: 'delivery-qty', filterField: 'deliveryQty' },
    { f: 'remainingDelivery', l: '剩余交付', filter: 'numeric', filterKey: 'remaining-delivery', filterField: 'remainingDelivery' },
    { f: 'sepOnShelf', l: '9月预计上架(T-2)', filter: 'multi', filterKey: 'sep-on-shelf', filterField: 'sepOnShelf' },
    { f: 'waitContainer', l: '待装柜' },
    { f: 'loading', l: '装柜中' },
    { f: 'waitShip', l: '待发货' },
    { f: 'logisticsPending', l: '物流未处理' },
    { f: 'sepDeliverable', l: '9月可交数量', filter: 'numeric', filterKey: 'sep-deliverable', filterField: 'sepDeliverable' },
    { f: 'sepDeliveryDate', l: '9月交期', filter: 'multi', filterKey: 'sep-delivery-date', filterField: 'sepDeliveryDate' },
    { f: 'sepRemark', l: '9月采购备注', filter: 'multi', filterKey: 'sep-remark', filterField: 'sepRemark' },
  ],

  // 可展开的隐藏字段
  expandable: {
    basicInfo: [
      { f: 'isFba', l: '是否FBA' },
      { f: 'isCombo', l: '是否组合' },
      { f: 'isPo', l: '是否PO' },
      { f: 'country', l: '国家' },
    ],
    salesData: [
      { f: 'sales3d', l: '3d(T-2)' },
      { f: 'monthlySales', l: '月销(T)' },
      { f: 'salesJun', l: '26-7月' },
      { f: 'salesJul', l: '26-8月(T-2)' },
      { f: 'salesAug', l: '26-9月(T-2)' },
    ],
  },

  // 采购-供应商追踪表列（工厂=供应商，只显示一个）
  supplier: [
    { f: 'channel', l: '渠道', filter: 'multi', filterKey: 'channel', filterField: 'channel' },
    { f: 'channelSku', l: 'SKU' },
    { f: 'comboSku', l: '组合SKU' },
    { f: 'displayName', l: '显示名称', filter: 'multi', filterKey: 'name', filterField: 'displayName' },
    { f: 'isCombo', l: '是否组合', filter: 'multi', filterKey: 'sup-is-combo', filterField: 'isCombo' },
    { f: 'isFba', l: '是否FBA', filter: 'multi', filterKey: 'sup-is-fba', filterField: 'isFba' },
    { f: 'country', l: '目的国家', filter: 'multi', filterKey: 'country', filterField: 'country' },
    { f: 'buyer', l: '采购员', filter: 'multi', filterKey: 'buyer', filterField: 'buyer' },
    { f: 'supplier', l: '供应商', filter: 'multi', filterKey: 'supplier', filterField: 'supplier' },
    { f: 'supplierStatus', l: '供应商状态', filter: 'multi', filterKey: 'supplier-status', filterField: 'supplierStatus' },
    { f: 'salesStatus', l: '销售状态', filter: 'multi', filterKey: 'sales-status', filterField: 'salesStatus' },
    { f: 'sepTargetSup', l: '202609目标', filter: 'numeric', filterKey: 'sep-target-sup', filterField: 'sepTargetSup' },
    { f: 'octTargetSup', l: '202610目标', filter: 'numeric', filterKey: 'oct-target-sup', filterField: 'octTargetSup' },
    { f: 'novTargetSup', l: '202611目标', filter: 'numeric', filterKey: 'nov-target-sup', filterField: 'novTargetSup' },
    { f: 'augPendingBoxCombo', l: '9月待交付箱单-组合配件', filter: 'numeric', filterKey: 'pending-combo', filterField: 'augPendingBoxCombo' },
    { f: 'augPendingBox', l: '9月待交付箱单', filter: 'numeric', filterKey: 'pending', filterField: 'augPendingBox' },
    { f: 'augSpotBox', l: '9月现货箱单', filter: 'numeric', filterKey: 'aug-spot-box', filterField: 'augSpotBox' },
    { f: 'augTarget', l: '9月目标', filter: 'numeric', filterKey: 'aug-target', filterField: 'augTarget' },
    { f: 'deliveryQty', l: '交付数量', filter: 'numeric', filterKey: 'delivery-qty', filterField: 'deliveryQty' },
    { f: 'remainingDelivery', l: '剩余交付', filter: 'numeric', filterKey: 'remaining-delivery', filterField: 'remainingDelivery' },
    { f: 'sepOnShelf', l: '9月预计上架(T-2)', filter: 'multi', filterKey: 'sep-on-shelf', filterField: 'sepOnShelf' },
    { f: 'cancelSupplierStock', l: '供应商库存', filter: 'multi', filterKey: 'cancel-supplier-stock', filterField: 'cancelSupplierStock' },
    { f: 'sepDeliverable', l: '9月可交数量', edit: true, filter: 'numeric', filterKey: 'sep-deliverable', filterField: 'sepDeliverable' },
    { f: 'sepDeliveryDate', l: '9月交期', edit: true, filter: 'multi', filterKey: 'sep-delivery-date', filterField: 'sepDeliveryDate' },
    { f: 'sepRemark', l: '9月采购备注', edit: true, filter: 'multi', filterKey: 'sep-remark', filterField: 'sepRemark' },
    { f: 'octDeliverable', l: '10月可交数量', edit: true, filter: 'numeric', filterKey: 'oct-deliverable', filterField: 'octDeliverable' },
    { f: 'octDeliveryDate', l: '10月交期', edit: true, filter: 'multi', filterKey: 'oct-delivery-date', filterField: 'octDeliveryDate' },
    { f: 'octRemark', l: '10月采购备注', edit: true, filter: 'multi', filterKey: 'oct-remark', filterField: 'octRemark' },
  ],
};

// 采购页“导出Excel / 批量上传”使用的列定义：保证导出→填写→上传是同一份表头，可交数量/交期/备注能写回 supplier
const PURCHASE_TRACKING_EXPORT_COLS = [
  { f: 'channel', l: '渠道' },
  { f: 'channelSku', l: 'SKU' },
  { f: 'comboSku', l: '组合SKU' },
  { f: 'displayName', l: '显示名称' },
  { f: 'isCombo', l: '是否组合' },
  { f: 'isFba', l: '是否FBA' },
  { f: 'country', l: '目的国家' },
  { f: 'buyer', l: '采购员' },
  { f: 'supplier', l: '供应商' },
  { f: 'supplierStatus', l: '供应商状态' },
  { f: 'salesStatus', l: '销售状态' },
  { f: 'sepTargetSup', l: '202609目标' },
  { f: 'octTargetSup', l: '202610目标' },
  { f: 'novTargetSup', l: '202611目标' },
  { f: 'augPendingBoxCombo', l: '9月待交付箱单-组合配件' },
  { f: 'augPendingBox', l: '9月待交付箱单' },
  { f: 'augSpotBox', l: '9月现货箱单' },
  { f: 'sepDeliverable', l: '9月可交数量' },
  { f: 'sepDeliveryDate', l: '9月交期' },
  { f: 'sepRemark', l: '9月采购备注' },
  { f: 'octDeliverable', l: '10月可交数量' },
  { f: 'octDeliveryDate', l: '10月交期' },
  { f: 'octRemark', l: '10月采购备注' },
];

// 供应商库存列标题的上传日期标注
function getSupplierStockDateLabel() {
  const u = Store.getUpdateTimes();
  const t = u['cancel'];
  if (!t) return '';
  const d = new Date(t);
  return `(${d.getMonth() + 1}/${d.getDate()})`;
}

// ===== 行点击高亮（所有页面通用） =====
function selectRow(el) {
  const table = el.closest('table');
  if (!table) return;
  table.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
  el.classList.add('row-selected');
}

// ===== 渲染可展开表格 =====
// 重渲染表格时保留横向/纵向滚动位置，避免"滑动浏览后点击/编辑"导致整表跳回开头
function setTableHTML(wrap, html) {
  const el = typeof wrap === 'string' ? document.getElementById(wrap) : wrap;
  if (!el) return;
  const sc = el.querySelector('.table-scroll');
  const sl = sc ? sc.scrollLeft : 0;
  const st = sc ? sc.scrollTop : 0;
  el.innerHTML = html;
  const nsc = el.querySelector('.table-scroll');
  if (nsc) {
    try {
      const maxLeft = nsc.scrollWidth - nsc.clientWidth;
      nsc.scrollLeft = Math.max(0, Math.min(sl, maxLeft));
      nsc.scrollTop = st;
    } catch (_) {}
  }
}

function renderExpandableTable(cols, data, opts) {
  opts = opts || {};
  const expandable = COLS.expandable;
  const totalCols = cols.length + 1; // +1 for expand button

  // 计算冻结列的left偏移
  const freezeWidths = { __expand: 30 };
  let cumulativeLeft = 30;
  const freezeOffsets = {};
  cols.forEach((c, i) => {
    if (c.freeze) {
      const w = c.f === 'channel' ? 70 : (c.f === 'channelSku' ? 120 : 80);
      freezeOffsets[i] = cumulativeLeft;
      cumulativeLeft += w;
      freezeWidths[c.f] = w;
    }
  });

  let html = '<div class="table-scroll"><table class="data-table"><thead><tr>';
  html += `<th style="width:30px">▶</th>`;
  const headerFilterUI = opts.headerFilterUI || '';
  cols.forEach((c, i) => {
    const freezeStyle = c.freeze ? `class="frozen${i === 0 ? ' frozen-corner' : ''}" style="left:${freezeOffsets[i] || 0}px;z-index:${i === 0 ? 12 : 11}"` : '';
    const label = c.l === '供应商库存' ? `${c.l}${getSupplierStockDateLabel()}` : c.l;
    const filterBtn = (c.filter === 'numeric' && c.filterKey && headerFilterUI)
      ? `<button type="button" class="col-filter-btn" title="数字筛选" data-filter-ui="${headerFilterUI}" data-filter-col="${c.filterKey}" data-header-filter="${headerFilterUI}-${c.filterKey}">▼</button>`
      : (c.filter === 'multi' && c.filterKey && headerFilterUI)
      ? `<button type="button" class="col-filter-btn" title="多选筛选" data-filter-ui="${headerFilterUI}" data-filter-col="${c.filterKey}" data-header-filter="${headerFilterUI}-${c.filterKey}">▼</button>`
      : (c.filter === 'search' && c.filterKey && headerFilterUI)
      ? `<button type="button" class="col-filter-btn" title="搜索筛选" data-filter-ui="${headerFilterUI}" data-filter-col="${c.filterKey}" data-header-filter="${headerFilterUI}-${c.filterKey}">▼</button>`
      : '';
    html += `<th ${freezeStyle}><div class="th-with-filter"><span class="th-label">${escapeHtml(label)}</span>${filterBtn}</div></th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach((row, ri) => {
    const days = parseFloat(row.availableDays);
    const isShort = !isNaN(days) && days < 14;
    const expandId = (opts.expandPrefix || 'row') + '_' + (opts.offset || 0) + '_' + ri;

    html += `<tr ${isShort ? 'class="highlight-row"' : ''} onclick="selectRow(this)">`;
    html += `<td style="width:30px" onclick="toggleExpand('${expandId}', this);event.stopPropagation()">▶</td>`;
    cols.forEach((c, ci) => {
      const val = row[c.f] ?? '';
      const freezeStyle = c.freeze ? `class="frozen${ci === 0 ? ' frozen-corner' : ''}" style="left:${freezeOffsets[ci] || 0}px;z-index:${ci === 0 ? 9 : 8}"` : '';
      if (c.click === 'buyer') {
        const sku = escapeHtml(row.channelSku || '');
        const buyer = escapeHtml(val);
        const buyerJs = escapeJsString(val || '');
        const buyerClick = opts.clickHandler || 'OperationUI.showBuyerDetails';
        let inner = `<span class="clickable" onclick="${buyerClick}('${escapeJsString(row.channelSku || '')}', '${buyerJs}')">${buyer || '-'}</span>`;
        if (c.nag && val) {
          const role = opts.role || 'op';
          // 方案2：催更对象以“供应商追踪表里该SKU对应的工厂采购员”为准（而非列表显示的priorityBuyer）
          const state = skuNagState(row.channelSku, val, role);
          if (state === 'all') {
            inner += ` <button type="button" class="nag-btn nagged" disabled="disabled" title="已催更该SKU对应的工厂采购员">✓催</button>`;
          } else {
            const pbJs = escapeJsString(val || '');
            inner += ` <button type="button" class="nag-btn" title="催更该SKU对应的工厂采购员" onclick="nagSupplierBuyers('${escapeJsString(row.channelSku || '')}','${escapeJsString(role)}',this,'${pbJs}')">⚡催</button>`;
          }
        }
        html += `<td ${freezeStyle}>${inner}</td>`;
      } else if (c.edit && opts.editable) {
        html += `<td class="editable ${c.freeze ? 'frozen' : ''}" ${c.freeze ? `style="left:${freezeOffsets[ci] || 0}px;z-index:8"` : ''} onclick="${opts.editHandler || 'PurchaseUI.startEdit'}(${ri}, '${c.f}', this)" title="点击编辑">${escapeHtml(val) || '<span style="color:#ccc">点击编辑</span>'}</td>`;
      } else if (c.html) {
        html += `<td ${freezeStyle} title="">${val || '-'}</td>`;
      } else {
        html += `<td ${freezeStyle} title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
      }
    });
    html += '</tr>';

    // 展开行（默认隐藏）
    html += `<tr id="${expandId}" class="detail-row" style="display:none">`;
    html += `<td colspan="${totalCols}">`;
    html += '<div class="detail-grid">';
    html += '<div class="detail-section"><strong>基础信息</strong><div class="detail-fields">';
    expandable.basicInfo.forEach(c => {
      html += `<span class="detail-field"><label>${escapeHtml(c.l)}:</label> ${escapeHtml(row[c.f] ?? '')}</span>`;
    });
    html += '</div></div>';
    if (!opts.hideSalesData) {
      html += '<div class="detail-section"><strong>销量数据</strong><div class="detail-fields">';
      expandable.salesData.forEach(c => {
        html += `<span class="detail-field"><label>${escapeHtml(c.l)}:</label> ${escapeHtml(row[c.f] ?? '')}</span>`;
      });
      html += '</div></div>';
    }
    html += '</div>';
    html += '</td></tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

function toggleExpand(id, cell) {
  const row = document.getElementById(id);
  if (!row) return;
  if (row.style.display === 'none') {
    row.style.display = 'table-row';
    cell.textContent = '▼';
    cell.classList.add('expanded');
  } else {
    row.style.display = 'none';
    cell.textContent = '▶';
    cell.classList.remove('expanded');
  }
}

// 表头筛选触发：数字筛选 / 多选筛选统一入口
function openHeaderFilter(btn, uiName, col, event) {
  // 防御：兼容事件委托和内联 handler 两种调用方式
  const ev = event || (typeof window !== 'undefined' && window.event);
  if (ev && ev.stopPropagation) { try { ev.stopPropagation(); } catch (_) {} }
  if (ev && ev.preventDefault) { try { ev.preventDefault(); } catch (_) {} }

  // 如果是从 data-* 触发，参数可能只传了 btn
  if (!uiName && btn) {
    uiName = btn.getAttribute('data-filter-ui');
    col = btn.getAttribute('data-filter-col');
  }
  if (!btn || !uiName || !col) {
    console.warn('[openHeaderFilter] missing params', { btn: !!btn, uiName, col });
    return;
  }

  const ui = (typeof UI_REGISTRY !== 'undefined' && UI_REGISTRY[uiName]) || window[uiName];
  if (!ui) {
    console.warn('[openHeaderFilter] UI not found', uiName);
    return;
  }
  console.log('[openHeaderFilter] open', uiName, col, { multi: ui._multiFilterCols, numeric: ui._numericFilterCols });

  // 多选筛选（状态/优先级/负责人/采购员等）
  if (ui._multiFilterCols && ui._multiFilterCols.includes(col) && typeof ui.openMultiFilterPanel === 'function') {
    console.log('[openHeaderFilter] opening multi panel', col);
    ui.openMultiFilterPanel(btn, col);
    return;
  }

  // 表头搜索筛选（显示名称/9月交期/采购备注/品类 等可输入关键词）
  if (ui._searchFilterCols && ui._searchFilterCols.includes(col) && typeof ui.openSearchFilterPanel === 'function') {
    ui.openSearchFilterPanel(btn, col);
    return;
  }

  // Excel 数字筛选（9月目标/剩余交付/9月可交数量 等）
  if (typeof ui.toggleFilterPanel === 'function') {
    const prefix = ({ PlanUI: 'plan', OperationUI: 'op', PurchaseUI: 'purchase' })[uiName] || '';
    if (!prefix) { console.warn('[openHeaderFilter] no prefix for', uiName); return; }
    // 自动创建缺失的数值面板（如采购页 202609/09/10目标、9月现货箱单），避免表头筛选点击无反应
    if (typeof ui.ensureFilterPanel === 'function') ui.ensureFilterPanel(col);
    const panel = document.getElementById(prefix + '-' + col + '-panel');
    if (!panel) { console.warn('[openHeaderFilter] panel not found', prefix + '-' + col + '-panel'); return; }
    // 关键修复：把面板挂到 body 下，彻底摆脱 offscreen-wrap 的 visibility:hidden / 定位 / 堆叠上下文影响，
    // 否则面板可能“看得见但点不到”（点击落不到面板上），表现为能弹出却没反应。
    if (panel.parentNode !== document.body) document.body.appendChild(panel);
    fitFilterPanel(panel, btn);
    // 鼠标移开弹框自动消失
    panel.onmouseleave = () => { panel.style.display = 'none'; panel.onmouseleave = null; };
    // 强制重置 display，确保 toggleFilterPanel 判定为“需要打开”，避免面板一闪而过或没反应
    panel.style.display = 'none';
    // 同步输入框当前值并展开
    ui.toggleFilterPanel(col);
    return;
  }

  console.warn('[openHeaderFilter] no handler for', uiName, col, { multi: ui._multiFilterCols, numeric: ui._numericFilterCols });
}

// ===== 催更（全局函数） =====
function nagBuyer(channelSku, buyer, role, btn) {
  if (btn) { btn.disabled = true; btn.style.pointerEvents = 'none'; }
  const user = currentUserName || '匿名';
  if (Store.hasNagged(role, channelSku, buyer)) {
    showToast('已催更过这条记录了', 'warn');
    if (btn) {
      btn.classList.add('nagged');
      btn.removeAttribute('onclick');
      btn.textContent = '✓催';
      btn.title = '已催更';
    }
    return;
  }
  Store.addNag(role, channelSku, buyer, user);
  if (btn) {
    btn.classList.add('nagged');
    btn.disabled = true;
    btn.removeAttribute('onclick');
    btn.textContent = '✓催';
    btn.title = '已催更';
  }
  // 如果采购界面当前已打开，实时刷新其催更统计
  if (typeof PurchaseUI !== 'undefined' && PurchaseUI.userName) {
    PurchaseUI.renderNagCount();
  }
  // 刷新登录页排行榜（让催更王/人气王立刻反映；内部有元素存在性保护，非角色页调用也安全）
  renderLeaderboard('all');
  showToast('已催更：' + buyer + '（' + channelSku + '）', 'success');
}

// ===== 方案2：催更对象以供应商追踪表里的工厂采购员为准 =====
// 取某 SKU 在供应商追踪表里对应的所有工厂采购员（去重，支持一个字段含多人）
function getSupplierBuyersForSku(channelSku) {
  const skuNorm = normalizeText(channelSku || '');
  if (!skuNorm) return [];
  const supplierData = Store.getData('supplier') || [];
  const set = new Set();
  supplierData.forEach(r => {
    if (normalizeText(r.channelSku) === skuNorm && r.buyer) {
      String(r.buyer).split(/[,，、/\n]/).forEach(n => { n = n.trim(); if (n) set.add(n); });
    }
  });
  return [...set];
}

// 返回该 SKU 的催更状态：'all' 全部工厂采购员已催 / 'partial' 部分已催 / 'none' 都未催
// 若供应商追踪表里无该 SKU 的工厂采购员，则回退用列表显示的采购员（priorityBuyer）判断
function skuNagState(channelSku, priorityBuyer, role) {
  const buyers = getSupplierBuyersForSku(channelSku);
  console.log('[skuNagState]', { channelSku, role, priorityBuyer, factoryBuyers: buyers });
  if (buyers.length === 0) {
    return (priorityBuyer && Store.hasNagged(role, channelSku, normalizeText(priorityBuyer))) ? 'all' : 'none';
  }
  const all = buyers.every(b => Store.hasNagged(role, channelSku, normalizeText(b)));
  if (all) return 'all';
  const some = buyers.some(b => Store.hasNagged(role, channelSku, normalizeText(b)));
  return some ? 'partial' : 'none';
}

// 点击列表催更按钮：对该 SKU 在供应商追踪表里对应的所有工厂采购员发起催更
function nagSupplierBuyers(channelSku, role, btn, priorityBuyer) {
  if (btn) { btn.disabled = true; btn.style.pointerEvents = 'none'; }
  const user = currentUserName || '匿名';
  let buyers = getSupplierBuyersForSku(channelSku);
  console.log('[nagSupplierBuyers]', { channelSku, role, priorityBuyer, factoryBuyers: buyers });
  // 供应商追踪表里无工厂采购员时，回退催列表显示的采购员（列表有“采购员”列才会出现此按钮，所以一定有值）
  if (buyers.length === 0 && priorityBuyer) buyers = [priorityBuyer];
  if (buyers.length === 0) {
    if (btn) { btn.disabled = false; btn.style.pointerEvents = ''; }
    showToast('该 SKU 没有可催更的工厂采购员', 'warn');
    return;
  }
  let added = 0;
  const newlyNagged = [];
  buyers.forEach(b => {
    if (Store.hasNagged(role, channelSku, normalizeText(b))) return; // 已催过则跳过
    Store.addNag(role, channelSku, b, user);
    added++;
    newlyNagged.push(b);
  });
  if (btn) {
    const allDone = buyers.every(b => Store.hasNagged(role, channelSku, normalizeText(b)));
    if (allDone) {
      btn.classList.add('nagged');
      btn.textContent = '✓催';
      btn.title = '已催更该SKU对应的工厂采购员';
      btn.removeAttribute('onclick');
    } else {
      // 还有部分工厂采购员未催（新增的已记上，其余之前没催的仍可在再次点击时补齐）
      btn.disabled = false;
      btn.style.pointerEvents = '';
    }
  }
  // 立即重渲染当前工作台表格，确保按钮状态（✓催）从最新存储重新计算，避免“点了没变”的观感
  try {
    if (currentRole === 'plan' && typeof PlanUI !== 'undefined' && PlanUI.renderTable) PlanUI.renderTable();
    else if (currentRole === 'operation' && typeof OperationUI !== 'undefined' && OperationUI.renderTable) OperationUI.renderTable();
    else if (Screen.current === 'screen-purchase' && typeof PurchaseUI !== 'undefined' && PurchaseUI.refresh) PurchaseUI.refresh();
  } catch (e) { console.warn('[nagSupplierBuyers] 重渲染失败:', e); }
  if (typeof PurchaseUI !== 'undefined' && PurchaseUI.userName) PurchaseUI.renderNagCount();
  renderLeaderboard('all');
  if (added > 0) {
    showToast('已催更：' + newlyNagged.join('、') + '（' + channelSku + '）', 'success');
  } else {
    showToast('该 SKU 的工厂采购员均已催更过', 'warn');
  }
}


// ===== 字段类型校验（采购编辑用） =====
const FIELD_TYPES = {
  augDeliverable: 'number', sepDeliverable: 'number', octDeliverable: 'number',
  augDeliveryDate: 'date', sepDeliveryDate: 'date', octDeliveryDate: 'date',
  augRemark: 'text', sepRemark: 'text', octRemark: 'text',
  augSpotBox: 'text', sepSpotBox: 'text', octSpotBox: 'text',
};
function validateFieldInput(field, value) {
  const t = FIELD_TYPES[field] || 'text';
  const s = String(value).trim();
  if (!s) return { ok: true, normalized: '' };
  if (t === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, msg: '数量必须是数字' };
    return { ok: true, normalized: s };
  }
  if (t === 'date') {
    const year = 2026;
    // 已经是目标格式 2026/8/7 → 通过
    const m0 = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m0) return { ok: true, normalized: parseInt(m0[1]) + '/' + parseInt(m0[2]) + '/' + parseInt(m0[3]) };
    // 形如 8/9/26、8-9-26（默认2026年）
    const m0a = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
    if (m0a) return { ok: true, normalized: '20' + parseInt(m0a[3]) + '/' + parseInt(m0a[1]) + '/' + parseInt(m0a[2]) };
    // 形如 8-7 或 8/7
    const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (m1) return { ok: true, normalized: year + '/' + parseInt(m1[1]) + '/' + parseInt(m1[2]) };
    // 形如 9月7日
    const m2 = s.match(/^(\d{1,2})月(\d{1,2})日?$/);
    if (m2) return { ok: true, normalized: year + '/' + parseInt(m2[1]) + '/' + parseInt(m2[2]) };
    // 形如 2026年9月7日
    const m3 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (m3) return { ok: true, normalized: parseInt(m3[1]) + '/' + parseInt(m3[2]) + '/' + parseInt(m3[3]) };
    // 纯数字（Excel日期序列号或1-31的日期）
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n >= 39000 && n <= 60000) {
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return { ok: true, normalized: d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() };
      }
      const month = field.startsWith('sep') ? 9 : (field.startsWith('oct') ? 10 : 8);
      if (n >= 1 && n <= 31) return { ok: true, normalized: year + '/' + month + '/' + n };
    }
    return { ok: false, msg: '日期格式不对（如 2026/8/7、8/7、8/9/26 或 9月7日）' };
  }
  return { ok: true, normalized: s };
}

// ===== 管理员界面 =====
const AdminUI = {
  async handleUpload(fileType, file) {
    if (!file) return;
    const statusEl = $('#status-' + fileType);
    statusEl.className = 'upload-status';
    statusEl.textContent = '正在解析...';
    debugLog('===== 开始上传: ' + fileType + ' | 文件: ' + file.name + ' | 大小: ' + (file.size / 1024).toFixed(1) + 'KB =====');
    // 显示调试面板
    const dp = $('#debug-panel');
    if (dp) dp.style.display = 'block';
    try {
      const result = await ExcelParser.parse(file, fileType);
      debugLog('[handleUpload] ' + fileType + ' 解析结果: ' + result.count + ' 条');

      // 上传防护：供应商表若某一品类占绝对多数，极可能是把某品类子表误当整表上传/合并，会污染其他行的品类字段
      if (fileType === 'supplier' && result.data.length > 15) {
        const catCount = {};
        result.data.forEach(r => {
          const c = normalizeText(rowCategoryOf(r) || r.category || '');
          if (c) catCount[c] = (catCount[c] || 0) + 1;
        });
        let topCat = '', topN = 0, total = 0;
        Object.entries(catCount).forEach(([c, n]) => { total += n; if (n > topN) { topN = n; topCat = c; } });
        if (total > 0 && topN / total > 0.85) {
          const ok = confirm('⚠️ 检测到这份供应商表约 ' + Math.round(topN / total * 100) + '% 都是「' + topCat + '」品类（共 ' + result.data.length + ' 条）。\n\n很可能误把某个品类子表当成整张供应商追踪表上传/合并，会把其他行的“品类”字段覆盖成「' + topCat + '」。\n\n如确认无误（整张表确实只有这一类）请点“确定”继续；否则点“取消”，并用“覆盖模式”重新上传完整供应商追踪表。');
          if (!ok) {
            statusEl.className = 'upload-status';
            statusEl.textContent = '已取消：疑似误传品类子表';
            showToast('已取消上传，请确认供应商表文件', 'error');
            return;
          }
        }
      }

      // 管理员上传的发货/需补订单始终以最新覆盖，不合并旧数据
      // （需补订单明确要求：上传即清除原数据，整份替换为本次上传内容）
      // 销量大表(sales) 走“增量合并”分支（见下方 fileType==='sales' 专门处理），不在此整表替换。
      const forceOverwrite = (fileType === 'delivery' || fileType === 'replenish');
      const overwrite = isOverwrite(fileType, forceOverwrite);

      let syncPromises = [];

      // 发货明细：以「第一版上传数据」为永久基线计算差异；第一版不存在时把本次设为第一版。
      if (fileType === 'delivery') {
        const first = Store.getDeliveryFirst();
        if (!first || Object.keys(first).length === 0) {
          Store.setDeliveryFirst(DeliveryMatcher.snapshot(result.data));
          // 同时把第一版原始数据作为隐藏类型同步云端，确保所有电脑拉取后基准一致
          syncPromises.push(Store.setData('delivery_first', result.data));
        }
        const diffMap = computeDeliveryDiffMap(result.data, Store.getDeliveryFirst());
        syncPromises.push(Store.setData('delivery_diff', diffMap));
      }

      if (fileType === 'sales') {
        // 销量大表：管理员可在上传前选择「增量更新」或「全部覆盖」。
        // 两种模式都只上传 SALES_SLIM_FIELDS 指定字段（压缩体积），区别在合并策略。
        const mode = document.querySelector('input[name="sales-upload-mode"]:checked')?.value || 'incremental';
        const slimNew = projectSalesSlim(result.data);
        if (mode === 'overwrite') {
          const ok = confirm('⚠️ 你选择了「全部覆盖」模式。\n\n这将清空云端已有的销量库存大表，并完全用本次上传的 ' + result.data.length + ' 条数据替换。\n其他电脑下次打开时会拉取这份新表，旧的增量记录不再保留。\n\n确定要继续吗？');
          if (!ok) {
            statusEl.className = 'upload-status';
            statusEl.textContent = '已取消：未覆盖云端销量表';
            showToast('已取消，未做任何修改', 'warn');
            return;
          }
          debugLog('[handleUpload] sales 全部覆盖：新 ' + slimNew.length + ' 条');
          syncPromises.push(Store.setData('sales', slimNew));
        } else {
          // 增量更新（默认）：按 salesKey 增量合并——同键行更新数据字段、新键行追加、旧数据里新表没有的行保留，
          // 再推送到云端（已去除 localOnly，自动分片同步）。projectSalesSlim 仅保留指定字段，压缩云端体积。
          const old = Store.getData('sales');
          const merged = mergeSalesIncremental(projectSalesSlim(old), slimNew);
          debugLog('[handleUpload] sales 增量合并：旧 ' + old.length + ' + 新 ' + result.data.length + ' => ' + merged.length);
          syncPromises.push(Store.setData('sales', merged));
        }
      } else if (overwrite && fileType !== 'supplier') {
        syncPromises.push(Store.setData(fileType, result.data));
      } else {
        const old = Store.getData(fileType);
        let merged;
        if (fileType === 'supplier') {
          // 给本次上传的每一行打上「批次标记」：_batchId（批次号）+ _uploadBy（上传人），
          // 供采购看板「只看我本次上传」过滤。合并时新表行的标记会覆盖旧表同名 SKU，
          // 旧表孤儿 SKU 保留原批次标记不变。
          const batchId = 'b_' + Date.now() + '_' + String(result.fileName || 'file').replace(/[^\w.\-]/g, '');
          const uploadBy = currentUserName || '';
          result.data = result.data.map(r => Object.assign({}, r, { _batchId: batchId, _uploadBy: uploadBy }));
          // 记录每个采购员「本次上传的 SKU key 集合」到 supplier_meta，按采购员姓名归集。
          // 采购看板优先用这个集合过滤，比单纯按 _batchId 更精确：可避免旧表孤儿行因 key 差异
          // 未被覆盖却仍带旧 buyer 而误显示的问题。
          try {
            const meta = Store.getData('supplier_meta') || {};
            const activeKeys = {};
            result.data.forEach(r => {
              const buyer = normalizeText(String(r.buyer || ''));
              if (!buyer) return;
              if (!activeKeys[buyer]) activeKeys[buyer] = new Set();
              activeKeys[buyer].add(OVERWRITE_KEYFN.supplier(r));
            });
            Object.entries(activeKeys).forEach(([buyer, set]) => {
              if (!meta[buyer]) meta[buyer] = {};
              meta[buyer].batchId = batchId;
              meta[buyer].uploadedAt = new Date().toISOString();
              meta[buyer].fileName = result.fileName || '';
              meta[buyer].count = set.size;
              meta[buyer].uploadBy = uploadBy;
              meta[buyer].activeKeys = [...set];
            });
            // 同时保留以 batchId 为键的全局批次信息，便于诊断
            meta[batchId] = { uploadedAt: new Date().toISOString(), fileName: result.fileName || '', count: result.data.length, uploadBy };
            syncPromises.push(Store.setData('supplier_meta', meta));
          } catch (e) { debugLog('[handleUpload] supplier_meta 记录失败: ' + (e && e.message)); }

          // 上传前先从云端找回采购员已填的交期/备注（按 SKU 关联），补回本地，
          // 避免换电脑/本地丢失时这些字段被新表覆盖掉。云端的采购字段来自各工作台手动编辑并同步回云端。
          let baseOld = old;
          try {
            const cloud = await pullSupplierCloudShort();
            if (cloud && cloud.length) {
              baseOld = mergeCloudPurchaseIntoLocal(old, cloud);
              debugLog('[handleUpload] supplier: 已从云端找回 ' + cloud.length + ' 条采购交期/备注并合并到本地');
            }
          } catch (e) { debugLog('[handleUpload] supplier 云端找回失败，降级用本地: ' + (e && e.message)); }
          // 供应商追踪表（以9月发货明细为底表，追踪表即权威数据源）：
          // ① 新旧表都有的 SKU：整行用新表覆盖，仅采购员手动填的 8/9/10月交期/可交数量/采购备注保留旧值；
          // ② 新表没有的孤儿 SKU：只保留身份字段 + 采购员手动字段，其余跟踪表字段清空。
          merged = mergeRecordsPreserve(baseOld, result.data, OVERWRITE_KEYFN.supplier, getProtectedFields('supplier'),
            { clearOrphan: true, keyFields: ['channel', 'channelSku', 'isFba', 'isCombo', 'country', 'buyer', 'supplier'] });
        } else {
          const protectedFields = getProtectedFields(fileType);
          merged = protectedFields && protectedFields.length
            ? mergeRecordsPreserve(old, result.data, OVERWRITE_KEYFN[fileType], protectedFields)
            : mergeRecords(old, result.data, OVERWRITE_KEYFN[fileType]);
        }
        debugLog('[handleUpload] ' + fileType + ' 合并更新：旧 ' + old.length + ' + 新 ' + result.data.length + ' => ' + merged.length + (fileType === 'supplier' ? '（供应商：并集合并，保留旧SKU）' : (getProtectedFields(fileType).length ? '（保留字段：' + getProtectedFields(fileType).join(',') + '）' : '')));
        syncPromises.push(Store.setData(fileType, merged));
      }
      if (fileType === 'sales' || fileType === 'delivery') {
        Store.setLastUploadDate(fileType);
      }
      // 所有上传类型都记录更新时间（用于列头标注如"供应商库存(8/7)"）
      Store._touchUpdate(fileType);

      const isLocal = !!(SYNC_TYPES.find(t => t.key === fileType) || {}).localOnly;
      if (result.count === 0) {
        statusEl.className = 'upload-status err';
        statusEl.textContent = '⚠️ 0条 - 查看下方日志';
        showToast('警告：' + fileType + ' 解析到0条数据，请查看解析日志', 'error');
      } else {
        statusEl.className = 'upload-status ok';
        statusEl.textContent = isLocal ? ('✓ ' + result.count + ' 条（已存本机）') : ('✓ ' + result.count + ' 条，正在同步云端...');
      }

      // 等待云端同步完成（发货/差异地图等已自动加入推送队列；当前无 localOnly 表，所有上传均推送）
      if (syncPromises.length) {
        try {
          await Promise.all(syncPromises);
          if (result.count > 0) statusEl.textContent = '✓ ' + result.count + ' 条（已同步云端）';
        } catch (syncErr) {
          const detail = (syncErr && (syncErr.message || syncErr.error_description || JSON.stringify(syncErr))) || '请检查同步配置';
          console.warn('[AdminUI] 云端同步失败', syncErr);
          statusEl.textContent = '✓ ' + result.count + ' 条（云端同步失败：' + String(detail).slice(0, 60) + '）';
        }
      }

      // 2026-08-17：人员名单改为完全手动维护，任何数据上传（销量/供应商/白名单/发货等）
      // 都不再自动提取或修改人员名单，避免上传新文件时把已配置好的人员清空/覆盖。
      // 如需从数据中提取人员，请管理员在「人员管理」中手动添加。
    Store.addHistory({ user: '管理员', role: 'admin', action: '上传文件', detail: fileType + ' (' + result.count + '条)' });
    this.updateDataStatus();
    this.renderUploadSummary();
    showToast('上传成功：' + result.count + ' 条');
  } catch (err) {
    debugLog('[handleUpload] ERROR: ' + err.message);
    debugLog('[handleUpload] stack: ' + (err.stack || '').slice(0, 300));
    statusEl.className = 'upload-status err';
    statusEl.textContent = '✗ ' + err.message;
    showToast('上传失败：' + err.message, 'error');
  }
},

  // 重置发货明细「增减基线」：把当前发货明细锁成新的  },

  // 切换销量大表上传模式说明
  onSalesModeChange(mode) {
    const desc = $('#sales-mode-desc');
    if (!desc) return;
    if (mode === 'overwrite') {
      desc.textContent = '清空云端已有销量库存大表，完全用本次上传的 ' + SALES_SLIM_FIELDS.length + ' 个字段替换（旧数据不再保留）。';
    } else {
      desc.textContent = '按 渠道+SKU+FBA+组合+PO+国家 合并；同键只更新销量/库存/目标等字段，旧表有而新表没有的行保留。';
    }
  },

  // 重置发货明细「增减基线」：把当前发货明细锁成新的第一版永久基线，
  // 之后绿+/红- 都将对比这一版（不再对比更早的 8 月版）。同步云端，所有电脑一致。
  async resetDeliveryBaseline() {
    const cur = Store.getData('delivery');
    if (!cur || cur.length === 0) {
      showToast('当前没有发货明细数据，请先上传 9 月发货计划', 'error');
      return;
    }
    if (!confirm('确定将「当前发货明细」设为增减基线？\n\n设置后，绿+/红- 增减将对比这一版（不再对比更早的 8 月版），并同步到所有电脑。')) return;
    const snapshot = DeliveryMatcher.snapshot(cur);
    Store.setData('delivery_first', snapshot);                 // 自动同步云端
    const diffMap = computeDeliveryDiffMap(cur, snapshot);
    Store.setData('delivery_diff', diffMap);                   // 自动同步云端
    this.updateDataStatus();
    this.renderUploadSummary();
    try { refreshCurrentScreen(); } catch (e) { debugLog('[resetDeliveryBaseline] refresh err: ' + e.message); }
    showToast('已将当前发货明细设为增减基线 ✓（绿/红将对比这版 9 月数据）', 'success');
    debugLog('[resetDeliveryBaseline] done, rows=' + cur.length);
  },

  // 管理员清空全部需补订单（放在管理员后台，不在采购员面板）
  clearReplenish() {
    const all = Store.getData('replenish') || [];
    if (all.length === 0) { showToast('当前没有需补订单数据', 'error'); return; }
    if (!confirm('确定清空全部需补订单？此操作会删除所有需补订单数据，且会同步到云端，不可恢复。')) return;
    const count = all.length;
    Store.setData('replenish', []).then(() => {
      Store.addHistory({ user: '管理员', role: 'admin', action: '清空需补订单', detail: '清除 ' + count + ' 条' });
      this.updateDataStatus();
      this.renderUploadSummary();
      try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) { debugLog('[clearReplenish] refresh err: ' + e.message); }
      showToast('已清空需补订单，共清除 ' + count + ' 条', 'success');
    }).catch(err => {
      debugLog('[AdminUI.clearReplenish] 失败: ' + (err && err.message));
      showToast('清空失败，请重试', 'error');
    });
  },

  clearSupplier() {
    const all = Store.getData('supplier') || [];
    if (all.length === 0) { showToast('当前没有供应商追踪数据', 'error'); return; }
    if (!confirm('确定清空全部供应商追踪数据？此操作会删除所有供应商追踪数据，且会同步到云端，不可恢复。')) return;
    const count = all.length;
    Store.setData('supplier', []).then(() => {
      Store.addHistory({ user: '管理员', role: 'admin', action: '清空供应商追踪', detail: '清除 ' + count + ' 条' });
      this.updateDataStatus();
      this.renderUploadSummary();
      try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) { debugLog('[clearSupplier] refresh err: ' + e.message); }
      showToast('已清空供应商追踪，共清除 ' + count + ' 条', 'success');
    }).catch(err => {
      const detail = (err && (err.message || err.error_description || JSON.stringify(err))) || '未知错误';
      debugLog('[AdminUI.clearSupplier] 失败: ' + detail);
      showToast('清空失败：' + detail, 'error');
    });
  },

  // 重建批次索引：根据当前云端 supplier 数据，为每个采购员重算「本次上传 SKU 集合」(activeKeys)。
  // 解决“重新上传后采购看板仍显示旧 SKU”的问题——当 supplier_meta 里 activeKeys 缺失/损坏时一键修复，
  // 无需再次上传文件。逻辑：对每个 buyer，取 _batchId 最新批次的行集合；若全部无 _batchId，则退化为该 buyer 全量。
  async rebuildSupplierBatches() {
    const all = Store.getData('supplier') || [];
    if (all.length === 0) { showToast('当前没有供应商追踪数据', 'error'); return; }
    const meta = Store.getData('supplier_meta') || {};
    const byBuyer = {};
    all.forEach(r => {
      const b = normalizeText(String(r.buyer || ''));
      if (!b) return;
      if (!byBuyer[b]) byBuyer[b] = [];
      byBuyer[b].push(r);
    });
    const lines = [];
    let totalRebuilt = 0;
    Object.keys(byBuyer).forEach(b => {
      const rows = byBuyer[b];
      // 优先按 _batchId 最新批次
      const batchIds = [...new Set(rows.map(r => r._batchId).filter(Boolean))].sort().reverse();
      const lastBatch = batchIds[0] || '';
      let activeKeys;
      if (lastBatch) {
        activeKeys = rows.filter(r => r._batchId === lastBatch).map(r => OVERWRITE_KEYFN.supplier(r));
      } else {
        // 没有任何 _batchId，无法判断“本次上传”，退化为全量（保留历史）
        activeKeys = rows.map(r => OVERWRITE_KEYFN.supplier(r));
      }
      if (!meta[b]) meta[b] = {};
      meta[b].activeKeys = [...new Set(activeKeys)];
      meta[b].rebuiltAt = new Date().toISOString();
      totalRebuilt++;
      lines.push(`• ${b}：${meta[b].activeKeys.length} 个 SKU${lastBatch ? '（按最新批次）' : '（⚠️无批次，按全量）'}`);
    });
    try {
      await Store.setData('supplier_meta', meta);
      Store.addHistory({ user: '管理员', role: 'admin', action: '重建批次索引', detail: '覆盖 ' + totalRebuilt + ' 个采购员' });
      this.updateDataStatus();
      try { if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen(); } catch (e) {}
      const msg = `已重建 ${totalRebuilt} 个采购员的批次索引：\n` + lines.join('\n');
      debugLog('[rebuildSupplierBatches] ' + msg);
      showToast('批次索引已重建（' + totalRebuilt + ' 人），请让采购员刷新采购看板', 'success');
      alert(msg);
    } catch (err) {
      const detail = (err && (err.message || JSON.stringify(err))) || '未知错误';
      debugLog('[rebuildSupplierBatches] 失败: ' + detail);
      showToast('重建失败：' + detail, 'error');
    }
  },


  renderUploadSummary() {
    const types = [
      { key: 'sales', label: '销量库存大表' }, { key: 'delivery', label: '发货交付明细' },
      { key: 'supplier', label: '供应商追踪' }, { key: 'cancel', label: '供应商库存' },
      { key: 'replenish', label: '需补订单' },       { key: 'supply', label: '供货清单' },
      { key: 'goods', label: '货品表' },
      { key: 'whitelist', label: '白名单' },
    ];
    const html = types.map(t => {
      const c = Store.getData(t.key).length;
      return `<span style="color:${c > 0 ? 'var(--success)' : 'var(--danger)'}">${c > 0 ? '✓' : '✗'} ${t.label}: ${c}条</span>`;
    }).join('　|　');
    $('#upload-summary').innerHTML = '<strong>数据概览：</strong> ' + html;
  },

  updateDataStatus() {
    const total = ['sales', 'delivery', 'supplier', 'cancel', 'replenish', 'supply', 'goods', 'whitelist'].reduce((s, t) => s + Store.getData(t).length, 0);
    const lastUpd = Store.getLastUpdateText();
    const el = $('#admin-data-status');
    if (el) el.innerHTML = `共 <strong>${total}</strong> 条　|　<span style="color:var(--text-muted)">最后更新: ${lastUpd}</span>`;
    this.renderUploadSummary();
    this.renderUpdateTimes();
  },

  renderUpdateTimes() {
    const u = Store.getUpdateTimes();
    const types = [
      { key: 'sales', label: '销量大表' }, { key: 'delivery', label: '发货交付' },
      { key: 'supplier', label: '供应商追踪' }, { key: 'cancel', label: '供应商库存' },
      { key: 'replenish', label: '需补订单' },       { key: 'supply', label: '供货清单' },
      { key: 'goods', label: '货品表' },
      { key: 'whitelist', label: '白名单' },
    ];
    const el = $('#update-times-list');
    if (!el) return;
    el.innerHTML = types.map(t => {
      const t0 = u[t.key];
      const txt = t0 ? new Date(t0).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未上传';
      return `<span style="display:inline-block;margin:2px 8px 2px 0;font-size:12px;color:${t0 ? 'var(--text)' : 'var(--text-muted)'}">${t.label}: <strong>${txt}</strong></span>`;
    }).join('');
  },

  renderPersonnel() {
    const p = Store.getPersonnel();
    // 拼音排序比较器：中文姓名按完整拼音 A-Z 排列（对同姓自动聚拢），对非中文按 locale 默认顺序
    const byPinyin = (a, b) => String(a || '').localeCompare(String(b || ''), 'zh-CN');
    const bindList = (arr, containerId, action, role, tagClass) => {
      const el = $('#' + containerId);
      if (!el) return;
      if (!arr || arr.length === 0) { el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">暂无</span>'; return; }
      const sorted = [...arr].sort(byPinyin);
      el.innerHTML = sorted.map(name => `<span class="personnel-tag ${tagClass || ''}" title="点击删除" data-action="${action}" data-role="${role}" data-name="${escapeHtml(name)}">${escapeHtml(name)} ✕</span>`).join('');
      if (el._delegated) return;
      el._delegated = true;
      el.addEventListener('click', (e) => {
        const tag = e.target.closest('.personnel-tag');
        if (!tag) return;
        const a = tag.dataset.action;
        const r = tag.dataset.role;
        const name = tag.dataset.name;
        if (a === 'removePersonnel') this.removePersonnelByName(r, name);
        else if (a === 'removeAdmin') this.removeAdminByName(r, name);
      });
    };
    bindList(p.purchase, 'personnel-purchase', 'removePersonnel', 'purchase');
    bindList(p.plan, 'personnel-plan', 'removePersonnel', 'plan');
    bindList(p.operation, 'personnel-operation', 'removePersonnel', 'operation');
    const admins = p.admins || {};
    bindList(admins.purchase, 'personnel-admin-purchase', 'removeAdmin', 'purchase', 'admin-tag');
    bindList(admins.plan, 'personnel-admin-plan', 'removeAdmin', 'plan', 'admin-tag');
    bindList(admins.operation, 'personnel-admin-operation', 'removeAdmin', 'operation', 'admin-tag');
    this.renderCategoryManagers();
  },

  removePersonnel(role, idx) {
    const p = Store.getPersonnel();
    const name = p[role][idx];
    p[role].splice(idx, 1);
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '删除人员', detail: role + ': ' + name });
    this.renderPersonnel();
  },

  // 按姓名删除（渲染顺序已按拼音排，索引不可靠）
  removePersonnelByName(role, name) {
    if (!name) return;
    const p = Store.getPersonnel();
    const idx = p[role].indexOf(name);
    if (idx < 0) return;
    p[role].splice(idx, 1);
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '删除人员', detail: role + ': ' + name });
    this.renderPersonnel();
  },

  batchAddPersonnel(role) {
    const names = $('#add-' + role + '-names').value.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) { showToast('请输入姓名', 'error'); return; }
    const p = Store.getPersonnel();
    const set = new Set(p[role]);
    names.forEach(n => set.add(n));
    p[role] = [...set];
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '批量添加人员', detail: role + ': ' + names.join(', ') });
    $('#add-' + role + '-names').value = '';
    this.renderPersonnel();
    showToast('已添加 ' + names.length + ' 人（自动去重）');
  },

  batchDeletePersonnel(role) {
    const names = $('#add-' + role + '-names').value.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) { showToast('请输入要删除的姓名', 'error'); return; }
    const p = Store.getPersonnel();
    const delSet = new Set(names);
    p[role] = p[role].filter(n => !delSet.has(n));
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '批量删除人员', detail: role + ': ' + names.join(', ') });
    $('#add-' + role + '-names').value = '';
    this.renderPersonnel();
    showToast('已删除');
  },

  addAdmin(role) {
    const input = $('#add-admin-' + role + '-name');
    const name = (input.value || '').trim();
    if (!name) { showToast('请输入管理员姓名', 'error'); return; }
    const p = Store.getPersonnel();
    if (!p.admins) p.admins = {};
    if (!Array.isArray(p.admins[role])) p.admins[role] = [];
    const set = new Set(p.admins[role]);
    set.add(name);
    p.admins[role] = [...set];
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '添加分页面管理员', detail: role + ': ' + name });
    input.value = '';
    this.renderPersonnel();
    showToast('已添加 ' + role + ' 管理员：' + name);
  },

  removeAdmin(role, idx) {
    const p = Store.getPersonnel();
    if (!p.admins || !Array.isArray(p.admins[role])) return;
    const name = p.admins[role][idx];
    p.admins[role].splice(idx, 1);
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '删除分页面管理员', detail: role + ': ' + name });
    this.renderPersonnel();
  },

  // 按姓名删除分页面管理员（渲染顺序已按拼音排，索引不可靠）
  removeAdminByName(role, name) {
    if (!name) return;
    const p = Store.getPersonnel();
    if (!p.admins || !Array.isArray(p.admins[role])) return;
    const idx = p.admins[role].indexOf(name);
    if (idx < 0) return;
    p.admins[role].splice(idx, 1);
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '删除分页面管理员', detail: role + ': ' + name });
    this.renderPersonnel();
  },

  // ===== 品类负责人管理 =====
  renderCategoryManagers() {
    const p = Store.getPersonnel();
    const list = p.categoryManagers || [];
    const el = $('#personnel-catmgr');
    if (el) {
      if (list.length === 0) { el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">暂无</span>'; }
      else {
        el.innerHTML = list.map(m => {
          const cats = (m.categories || []).join('、');
          return `<span class="personnel-tag admin-tag" title="负责品类：${escapeHtml(cats)}" data-action="removeCategoryManager" data-name="${escapeHtml(m.name)}">
            ${escapeHtml(m.name)}（${escapeHtml(cats)}）<span style="cursor:pointer;margin-left:4px">✕</span>
          </span>`;
        }).join(' ');
      }
      if (!el._delegated) {
        el._delegated = true;
        el.addEventListener('click', (e) => {
          const tag = e.target.closest('.personnel-tag[data-action="removeCategoryManager"]');
          if (!tag) return;
          this.removeCategoryManager(tag.dataset.name);
        });
      }
    }
    // 预填可选品类（来自供应商追踪表已有的品类，帮助管理员准确填写）
    const dl = $('#catmgr-cat-options');
    if (dl) {
      const cats = [...new Set(Store.getData('supplier').map(r => (r.category || '').trim()).filter(Boolean))].sort();
      dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }
  },

  addCategoryManager() {
    const name = ($('#add-catmgr-name')?.value || '').trim();
    const catsRaw = ($('#add-catmgr-cats')?.value || '').trim();
    if (!name) { showToast('请输入品类负责人姓名', 'error'); return; }
    const categories = catsRaw.split(/[\n,，、;；]+/).map(s => s.trim()).filter(Boolean);
    if (categories.length === 0) { showToast('请输入负责的品类（多个用逗号/换行分隔）', 'error'); return; }
    const p = Store.getPersonnel();
    if (!Array.isArray(p.categoryManagers)) p.categoryManagers = [];
    const existing = p.categoryManagers.find(m => normalizeText(m.name) === normalizeText(name));
    if (existing) existing.categories = categories;
    else p.categoryManagers.push({ name, categories });
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '添加品类负责人', detail: name + ': ' + categories.join('、') });
    $('#add-catmgr-name').value = '';
    $('#add-catmgr-cats').value = '';
    this.renderCategoryManagers();
    showToast('已添加品类负责人：' + name);
  },

  removeCategoryManager(name) {
    const p = Store.getPersonnel();
    p.categoryManagers = (p.categoryManagers || []).filter(m => normalizeText(m.name) !== normalizeText(name));
    Store.setPersonnel(p);
    Store.addHistory({ user: '管理员', role: 'admin', action: '删除品类负责人', detail: name });
    this.renderCategoryManagers();
  },

  clearAllData() {
    if (!confirm('⚠️ 确定要清除所有数据吗？此操作不可恢复！\n\n将清除：所有上传的Excel数据、人员名单、历史记录')) return;
    Store.clearAll();
    this.renderPersonnel();
    this.renderHistory();
    this.updateDataStatus();
    this.renderUploadSummary();
    ['sales', 'delivery', 'supplier', 'cancel', 'replenish', 'supply', 'whitelist'].forEach(t => {
      const el = $('#status-' + t);
      if (el) { el.textContent = ''; el.className = 'upload-status'; }
    });
    Store.addHistory({ user: '管理员', role: 'admin', action: '清除所有数据', detail: '全量清除' });
    if (Sync.enabled) Sync.pushAll();
    showToast('所有数据已清除');
  },

  renderHistory() {
    const h = Store.getHistory();
    const search = ($('#history-search')?.value || '').toLowerCase();
    const filtered = search ? h.filter(e => JSON.stringify(e).toLowerCase().includes(search)) : h;
    const list = $('#history-list');
    if (filtered.length === 0) { list.innerHTML = '<p style="color:var(--text-muted)">暂无历史记录</p>'; return; }
    list.innerHTML = filtered.slice(0, 200).map(e => {
      const time = new Date(e.time).toLocaleString('zh-CN');
      return `<div class="history-item"><span class="h-time">${time}</span><span class="h-user">${escapeHtml(e.user)}</span><span class="h-action">${escapeHtml(e.action)}</span><span class="h-detail">${escapeHtml(e.detail || '')}</span></div>`;
    }).join('');
  },

  exportData() {
    Store.exportAll();
    Store.addHistory({ user: '管理员', role: 'admin', action: '导出数据', detail: '全量导出' });
    showToast('数据已导出');
  },

  async importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      Store.importAll(JSON.parse(text));
      Store.addHistory({ user: '管理员', role: 'admin', action: '导入数据', detail: '全量导入' });
      this.renderPersonnel(); this.renderHistory(); this.updateDataStatus();
      showToast('数据导入成功');
    } catch (err) { showToast('导入失败：' + err.message, 'error'); }
  },

  async saveSyncConfig() {
    const url = $('#supabase-url').value.trim();
    const key = $('#supabase-key').value.trim();
    if (url && key) {
      localStorage.setItem('skuv2_supabase', JSON.stringify({ url, key }));
      // 保存勾选的同步表格
      const sel = [];
      $$('#sync-type-list input[type=checkbox]').forEach(cb => { if (cb.checked) sel.push(cb.dataset.syncType); });
      SyncSel.save(sel);
      $('#sync-status').innerHTML = '<span style="color:var(--info)">✓ 已保存，正在连接云端...</span>';
      Sync.init();
      if (Sync.enabled) {
        const ok = await Sync.pushAll();
        if (!ok) {
          // pushAll 内部已显示具体错误
        }
      } else {
        $('#sync-status').innerHTML = '<span style="color:var(--danger)">✗ Supabase SDK 未加载或配置无效，请刷新页面</span>';
      }
    } else {
      $('#sync-status').innerHTML = '<span style="color:var(--danger)">请填写 URL 和 Key</span>';
    }
  },

  // Anon Key 眼睛切换：显示/隐藏明文
  toggleKeyVisibility() {
    const inp = $('#supabase-key');
    if (!inp) return;
    inp.type = (inp.type === 'password') ? 'text' : 'password';
  },

  // 渲染「选择要同步的表格」勾选列表（按已保存选择打勾）
  renderSyncTypeList() {
    const box = $('#sync-type-list');
    if (!box) return;
    const sel = SyncSel.load();
    box.innerHTML = SYNC_TYPES.filter(t => !t.hidden).map(t => {
      if (t.localOnly) {
        return '<label style="opacity:.7;cursor:not-allowed"><input type="checkbox" disabled' +
          (t.key === 'sales' ? ' checked' : '') + '> ' + t.label +
          ' <span style="font-size:11px;color:var(--text-muted)">（本机大表，不上云）</span></label>';
      }
      return '<label><input type="checkbox" data-sync-type="' + t.key + '"' + (sel.includes(t.key) ? ' checked' : '') + '> ' + t.label + '</label>';
    }).join('');
  },

  // 全选 / 全不选（不含本地大表）
  selectAllTypes(on) {
    $$('#sync-type-list input[type=checkbox]:not([disabled])').forEach(cb => { cb.checked = on; });
  },

  // 管理员：一键导出所有采购员的供应商追踪表（按采购员分 sheet）
  async exportAllSupplier() {
    await ensureXLSX();
    // 跟踪表视图全量导出（管理员视角，不受采购员过滤影响）
    const all = PurchaseUI.getDeliveryBasedData.call({ isAdmin: true });
    if (!all.length) { showToast('暂无供应商追踪数据', 'error'); return; }
    const cols = PURCHASE_TRACKING_EXPORT_COLS;
    const headers = cols.map(c => c.l);
    const aoa = [headers];
    all.forEach(r => {
      aoa.push(cols.map(c => {
        let v = r[c.f];
        if (c.f === 'displayName') v = v || r['ns名称'] || r['NS名称'] || '';
        if (v === undefined || v === null) return '';
        if (typeof v === 'string' && v.includes('<')) {
          const tmp = document.createElement('div');
          tmp.innerHTML = v;
          v = tmp.textContent || tmp.innerText || '';
        }
        return v;
      }));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '采购跟踪表');
    xlsxWriteFile(wb, '全部采购供应商追踪_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    Store.addHistory({ user: '管理员', role: 'admin', action: '导出所有采购供应商追踪表', detail: all.length + ' 条' });
    showToast('已导出 ' + all.length + ' 条（跟踪表）');
  }
};

// ===== 交付明细匹配器（为采购供应商追踪表提供 9月目标/交付数量/剩余交付） =====
const DeliveryMatcher = {
  joinKey(row) {
    return [row.channel, row.channelSku, row.isFba, row.isCombo, row.country]
      .map(v => normalizeText(String(v || ''))).join('|');
  },
  skuKey(row) { return normalizeText(String(row.channelSku || '')); },
  buildMap(data) {
    const joinMap = {};
    const skuMap = {};
    data.forEach(d => {
      const jk = this.joinKey(d);
      const sk = this.skuKey(d);
      if (!joinMap[jk]) joinMap[jk] = [];
      joinMap[jk].push(d);
      if (sk && !skuMap[sk]) skuMap[sk] = d;
    });
    return { joinMap, skuMap };
  },
  match(supplierRow, deliveryData) {
    if (!deliveryData || deliveryData.length === 0) return null;
    const { joinMap, skuMap } = this.buildMap(deliveryData);
    const jk = this.joinKey(supplierRow);
    const sk = this.skuKey(supplierRow);
    const rows = joinMap[jk] && joinMap[jk].length ? joinMap[jk] : (sk && skuMap[sk] ? [skuMap[sk]] : []);
    return rows[0] || null;
  },
  snapshot(data) {
    const map = {};
    if (!data || !data.length) return map;
    const { joinMap, skuMap } = this.buildMap(data);
    Object.keys(joinMap).forEach(jk => {
      const d = joinMap[jk][0];
      map[jk] = { augTarget: d.augTarget || '', deliveryQty: d.deliveryQty || '', remainingDelivery: d.remainingDelivery || '' };
    });
    Object.keys(skuMap).forEach(sk => {
      if (!map[sk])       map['sku:' + sk] = { augTarget: skuMap[sk].augTarget || '', deliveryQty: skuMap[sk].deliveryQty || '', remainingDelivery: skuMap[sk].remainingDelivery || '' };
    });
    return map;
  }
};


// 计算发货明细环比差异地图：key 为 joinKey / 'sku:'+skuKey，value 为 { augTargetDiff, deliveryQtyDiff, remainingDeliveryDiff }
// 管理员上传 delivery 时调用，结果存入 delivery_diff 并同步云端，所有电脑拉取后均可直接渲染增减标识。
function computeDeliveryDiffMap(currentData, prevMap) {
  const map = {};
  if (!currentData || !currentData.length) return map;
  const toNum = v => { const s = String(v || '').replace(/,/g, '').trim(); const n = parseFloat(s); return isNaN(n) ? null : n; };
  const { joinMap, skuMap } = DeliveryMatcher.buildMap(currentData);
  const getPrev = (jk, sk) => (prevMap && prevMap[jk]) || (sk && prevMap && prevMap['sku:' + sk]) || {};
  const diffVal = (cur, old) => {
    const c = toNum(cur), o = toNum(old);
    return (c !== null && o !== null && c !== o) ? c - o : 0;
  };
  Object.keys(joinMap).forEach(jk => {
    const d = joinMap[jk][0];
    const sk = DeliveryMatcher.skuKey(d);
    const p = getPrev(jk, sk);
    map[jk] = { augTargetDiff: diffVal(d.augTarget, p.augTarget), deliveryQtyDiff: diffVal(d.deliveryQty, p.deliveryQty), remainingDeliveryDiff: diffVal(d.remainingDelivery, p.remainingDelivery) };
  });
  Object.keys(skuMap).forEach(sk => {
    if (!map['sku:' + sk]) {
      const d = skuMap[sk];
      const p = (prevMap && prevMap['sku:' + sk]) || {};
      map['sku:' + sk] = { augTargetDiff: diffVal(d.augTarget, p.augTarget), deliveryQtyDiff: diffVal(d.deliveryQty, p.deliveryQty), remainingDeliveryDiff: diffVal(d.remainingDelivery, p.remainingDelivery) };
    }
  });
  return map;
}

// ===== 采购界面 =====
// 多选下拉组件（品类筛选全站统一）
// 用法：MultiSelectUI.init('id', options, selectedArr => { ... });
const MultiSelectUI = {
  _state: new Map(), // id -> Set(selected values)
  _onChange: new Map(),
  _placeholders: new Map(),
  _dirty: new Map(), // id -> boolean（选择有变化，关闭/确定时统一触发）
  _globalCloseBound: false,
  init(id, options, onChange, placeholder) {
    if (!this._state.has(id)) this._state.set(id, new Set());
    this._onChange.set(id, onChange);
    this._placeholders.set(id, placeholder || '选择品类');
    this._dirty.set(id, false);
    const el = document.getElementById(id);
    if (el && !el._msBound) {
      el.addEventListener('click', e => {
        const trigger = e.target.closest('.multi-select-trigger');
        const checkbox = e.target.closest('input[type="checkbox"]');
        const action = e.target.closest('[data-ms-action]');
        if (trigger) { this.toggleDropdown(id); e.stopPropagation(); }
        else if (checkbox) { e.stopPropagation(); this.toggle(id, checkbox.value, checkbox.checked); }
        else if (action) { e.stopPropagation(); this[action.dataset.msAction](id); }
      });
      el.addEventListener('input', e => {
        const search = e.target.closest('.multi-select-search');
        if (search) { this.filterOptions(id, search.value); e.stopPropagation(); }
      });
      el._msBound = true;
    }
    if (!this._globalCloseBound) {
      document.addEventListener('click', e => { if (!e.target.closest('.multi-select')) this.closeAll(); });
      this._globalCloseBound = true;
    }
    this.render(id, options || []);
  },
  render(id, options) {
    const el = document.getElementById(id);
    if (!el) return;
    const selected = this._state.get(id) || new Set();
    const optsHtml = options.map(opt => {
      const v = escapeHtml(opt);
      return `<label><input type="checkbox" value="${v}" ${selected.has(opt) ? 'checked' : ''}> ${v}</label>`;
    }).join('');
    const ph = this._placeholders.get(id) || '选择品类';
    const tagsHtml = selected.size
      ? [...selected].map(v => `<span class="multi-select-tag">${escapeHtml(v)}</span>`).join('')
      : `<span class="multi-select-placeholder">${escapeHtml(ph)}</span>`;
    el.innerHTML = `
      <div class="multi-select-trigger">
        <span class="multi-select-tags">${tagsHtml}</span>
        <span class="multi-select-arrow">▼</span>
      </div>
      <div class="multi-select-dropdown" id="${id}-dropdown">
        <div class="multi-select-search-wrap">
          <input type="text" class="multi-select-search" placeholder="搜索筛选...">
        </div>
        <div class="multi-select-actions">
          <button type="button" data-ms-action="selectAll">全选</button>
          <button type="button" data-ms-action="clear">清空</button>
          <button type="button" class="multi-select-confirm" data-ms-action="confirm">确定</button>
        </div>
        ${optsHtml}
      </div>`;
  },
  toggleDropdown(id) {
    const dd = document.getElementById(id + '-dropdown');
    if (!dd) return;
    const wasOpen = dd.classList.contains('open');
    this.closeAll();
    if (!wasOpen) dd.classList.add('open');
  },
  closeAll() {
    document.querySelectorAll('.multi-select-dropdown.open').forEach(d => {
      const id = d.id.replace(/-dropdown$/, '');
      d.classList.remove('open');
      this._flush(id);
    });
  },
  // 统一触发：关闭或点确定时只触发一次 onChange
  _flush(id) {
    if (this._dirty.get(id)) {
      this._dirty.set(id, false);
      const onChange = this._onChange.get(id);
      if (onChange) onChange([...(this._state.get(id) || new Set())]);
    }
  },
  confirm(id) {
    this._flush(id);
    const dd = document.getElementById(id + '-dropdown');
    if (dd) dd.classList.remove('open');
  },
  toggle(id, value, checked) {
    const set = this._state.get(id) || new Set();
    if (checked) set.add(value); else set.delete(value);
    this._state.set(id, set);
    this._dirty.set(id, true);
    this._updateTrigger(id);
  },
  _updateTrigger(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const selected = this._state.get(id) || new Set();
    const ph = this._placeholders.get(id) || '选择品类';
    const trigger = el.querySelector('.multi-select-trigger .multi-select-tags');
    if (trigger) trigger.innerHTML = selected.size
      ? [...selected].map(v => `<span class="multi-select-tag">${escapeHtml(v)}</span>`).join('')
      : `<span class="multi-select-placeholder">${escapeHtml(ph)}</span>`;
  },
  selectAll(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const options = [...el.querySelectorAll('.multi-select-dropdown input[type="checkbox"]')].map(cb => cb.value);
    this._state.set(id, new Set(options));
    el.querySelectorAll('.multi-select-dropdown input[type="checkbox"]').forEach(cb => cb.checked = true);
    this._dirty.set(id, true);
    this._updateTrigger(id);
  },
  clear(id) {
    this._state.set(id, new Set());
    const el = document.getElementById(id);
    if (el) {
      el.querySelectorAll('.multi-select-dropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
      this._updateTrigger(id);
    }
    this._dirty.set(id, true);
  },
  getSelected(id) { return [...(this._state.get(id) || new Set())]; },
  setOptions(id, options) {
    const selected = this._state.get(id) || new Set();
    const newSelected = new Set([...selected].filter(s => options.includes(s)));
    this._state.set(id, newSelected);
    this.render(id, options);
  },
  // 下拉内搜索：按文本过滤可见的备选项（仅隐藏不匹配的 <label>，不改变已选状态，也不影响全选/清空）
  filterOptions(id, q) {
    const dd = document.getElementById(id + '-dropdown');
    if (!dd) return;
    const term = (q || '').trim().toLowerCase();
    dd.querySelectorAll('label').forEach(lbl => {
      const t = (lbl.textContent || '').toLowerCase();
      lbl.style.display = (!term || t.includes(term)) ? '' : 'none';
    });
  },
};

const PurchaseUI = {
  userName: '', currentPage: 0, replenishPage: 0, filteredData: [],
  replenishFilters: {}, replenishFilteredData: [],
  supplierUnfilledByFactory: {}, supplierReplenishByFactory: {},
  factoryFilter: null,
  pendingComboFilter: null, pendingFilter: null,
  augTargetFilter: null, deliveryQtyFilter: null, remainingDeliveryFilter: null,
  isAdmin: false,
  categories: [], activeTab: 'supplier', isCategoryManager: false,

  init(userName) {
    this.userName = userName;
    this.isAdmin = isRoleAdmin('purchase', userName);
    // 切换账号：清空富数据/我的数据缓存，避免沿用上一个账号的过滤结果
    this._myDataCache = null; this._myDataVersion = -1;
    this._richCache = null; this._richVersion = -1;
    this._catData = {}; this._catPage = {};
    this.currentPage = 0; this.replenishPage = 0;
    this.replenishFilters = {};
    this.factoryFilter = null;
    // 切换账号时重置数值/多选表头筛选，避免继承上一个账号的筛选状态
    PURCHASE_NUM_FILTERS.forEach(d => { this[d.prop] = null; });
    PURCHASE_MULTI_FILTERS.forEach(d => { this[d.prop] = new Set(); });
    // 品类负责人权限
    const mgr = getCategoryManager(userName);
    this.isCategoryManager = !!mgr;
    this.categories = (mgr && mgr.categories) ? mgr.categories.slice() : [];
    this.activeTab = 'supplier';
    this._showAllSupplier = false; // 默认只看本次上传批次
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    const catBadge = this.isCategoryManager ? ` <span class="admin-badge" style="background:#7c3aed">品类负责人</span>` : '';
    $('#purchase-username').innerHTML = escapeHtml(userName) + badge + catBadge;
    // 「显示全部历史批次」开关对非管理员显示（普通采购员/品类负责人默认只看本次上传）
    const toggleWrap = $('#purchase-batch-toggle-wrap');
    if (toggleWrap) toggleWrap.style.display = this.isAdmin ? 'none' : 'inline-block';
    const chk = $('#purchase-show-all');
    if (chk) { chk.checked = false; }
    this._updateBatchInfo();
    // 采购员筛选仅对管理员/品类负责人显示（普通采购只看自己，无需筛选）
    const buyerWrap = $('#purchase-buyer-filter-wrap');
    if (buyerWrap) buyerWrap.style.display = (this.isAdmin || this.isCategoryManager) ? 'inline-block' : 'none';
    this.renderCategoryTabs();
    renderPurchaseMarquee();
    this.renderLastUpdate();
    // 首次进入时，重表格渲染异步化：先让页面框架/用户名/筛选器显示出来，再渲染数据，避免点击“进入”后长时间白屏
    requestAnimationFrame(() => {
      this.renderSupplier(); this.renderReplenish(); this.renderAlerts(); this.renderNagCount();
    });
  },

  // 自动刷新专用：只重渲染数据，保留当前页码/搜索/筛选状态
  refresh() {
    if (!this.userName) return;
    this.isAdmin = isRoleAdmin('purchase', this.userName);
    const mgr = getCategoryManager(this.userName);
    this.isCategoryManager = !!mgr;
    this.categories = (mgr && mgr.categories) ? mgr.categories.slice() : [];
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    const catBadge = this.isCategoryManager ? ` <span class="admin-badge" style="background:#7c3aed">品类负责人</span>` : '';
    $('#purchase-username') && ($('#purchase-username').innerHTML = escapeHtml(this.userName) + badge + catBadge);
    const buyerWrap = $('#purchase-buyer-filter-wrap');
    if (buyerWrap) buyerWrap.style.display = (this.isAdmin || this.isCategoryManager) ? 'inline-block' : 'none';
    this.renderCategoryTabs();
    renderPurchaseMarquee();
    this.renderSupplier(); this.renderReplenish(); this.renderAlerts(); this.renderNagCount();
    this.renderLastUpdate();
    if (this.activeTab !== 'supplier' && this.activeTab !== 'replenish') {
      this.renderCategorySupplierBySafeId(this.activeTab);
    }
  },

  renderLastUpdate() {
    const el = $('#purchase-last-update');
    if (el) el.textContent = '数据更新: ' + Store.getLastUpdateText();
  },

  // 切换「显示全部历史批次」开关：重新渲染供应商主表 + 更新批次提示
  toggleShowAll(checked) {
    this._showAllSupplier = !!checked;
    this._updateBatchInfo();
    if (this.activeTab === 'supplier') this.renderSupplier();
    else if (this.activeTab === 'replenish') this.renderReplenish();
    else this.renderCategorySupplierBySafeId(this.activeTab);
  },

  // 在开关旁显示当前上传批次信息，优先从 supplier_meta[buyer].activeKeys 读取，
  // 让用户确认当前显示的是否为本次上传文件里的 SKU。
  _updateBatchInfo() {
    const el = $('#purchase-batch-info');
    if (!el) return;
    if (this.isAdmin) { el.textContent = ''; return; }
    const diag = this._filterDiag || {};
    if (this._showAllSupplier) { el.innerHTML = '<span style="color:#f59e0b">（当前：显示全部历史）</span>'; return; }
    const meta = Store.getData('supplier_meta') || {};
    const myMeta = meta[normalizeText(this.userName)] || {};
    const activeCount = (myMeta.activeKeys || []).length;
    if (!activeCount && (!diag.mode || diag.mode === 'none')) {
      el.innerHTML = '<span style="color:#ef4444">（⚠️ 未记录本次上传 SKU，当前显示你名下全部 ' + (diag.myTotal || '?') + ' 条）</span>';
      return;
    }
    let d = myMeta.uploadedAt ? new Date(myMeta.uploadedAt) : null;
    const ts = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '';
    const fn = myMeta.fileName ? `「${myMeta.fileName}」` : '';
    const myTotal = diag.myTotal || '';
    const finalCount = diag.finalCount || activeCount || '';
    el.innerHTML = `<span style="color:#22c55e">（本次上传：${fn}${ts} · ${activeCount} 条；你名下共 ${myTotal} 条，当前显示 ${finalCount} 条）</span>`;
  },

  // ===== 品类负责人视图：在采购面板内为每个负责品类增加 Tab =====
  _safeCatId(cat) {
    return 'cat_' + encodeURIComponent(cat).replace(/%/g, '_');
  },

  renderCategoryTabs() {
    const tabsContainer = $('#purchase-cat-tabs');
    const contentsContainer = $('#purchase-cat-tab-contents');
    if (!tabsContainer || !contentsContainer) return;
    if (!this.isCategoryManager || this.categories.length === 0) {
      tabsContainer.innerHTML = '';
      contentsContainer.innerHTML = '';
      return;
    }
    // 若当前激活的 category 已被删除，回退到供应商追踪表
    const validTabs = new Set(['supplier', 'replenish', ...this.categories.map(c => this._safeCatId(c))]);
    if (!validTabs.has(this.activeTab)) this.activeTab = 'supplier';

    let tabsHtml = '';
    let contentsHtml = '';
    this.categories.forEach(cat => {
      const safeId = this._safeCatId(cat);
      const active = this.activeTab === safeId ? 'active' : '';
      tabsHtml += `<div class="tab ${active}" data-cattab="${safeId}" onclick="PurchaseUI.switchTab('${safeId}')">📦 ${escapeHtml(cat)}</div>`;
      contentsHtml += `<div id="pcat-tab-${safeId}" class="tab-content cat-tab-content ${active}">
        <div class="table-toolbar" style="display:flex;align-items:center;gap:12px">
          <button class="btn-sm" onclick="PurchaseUI.exportCategoryBySafeId('${safeId}')">⬇ 导出本表</button>
          <span id="pcat-count-${safeId}" class="cat-count" style="color:var(--text-muted);font-size:13px"></span>
        </div>
        <div id="pcat-table-${safeId}" class="data-table-wrap"></div>
        <div id="pcat-pagination-${safeId}" class="pagination-wrap"></div>
      </div>`;
    });
    tabsContainer.innerHTML = tabsHtml;
    contentsContainer.innerHTML = contentsHtml;
    // 根据当前激活 Tab 显隐品类内容容器，确保 flex 布局生效
    contentsContainer.classList.toggle('active', this.activeTab !== 'supplier' && this.activeTab !== 'replenish');
    const tabContents = $('#purchase-tab-contents');
    if (tabContents) tabContents.classList.toggle('cat-hidden', this.activeTab !== 'supplier' && this.activeTab !== 'replenish');
  },

  switchTab(tab) {
    this.activeTab = tab;
    const isCat = !(tab === 'supplier' || tab === 'replenish');
    const tabContents = $('#purchase-tab-contents');
    if (tabContents) tabContents.classList.toggle('cat-hidden', isCat);
    $$('#screen-purchase .tab').forEach(x => x.classList.remove('active'));
    $$('#screen-purchase .tab-content').forEach(c => c.classList.remove('active'));
    $$('#purchase-cat-tab-contents .cat-tab-content').forEach(c => c.classList.remove('active'));
    const catContainer = $('#purchase-cat-tab-contents');
    if (catContainer) catContainer.classList.remove('active');
    if (tab === 'supplier' || tab === 'replenish') {
      const tEl = $('#screen-purchase .tab[data-ptab="' + tab + '"]');
      if (tEl) tEl.classList.add('active');
      $('#ptab-' + tab).classList.add('active');
    } else {
      const tEl = $('#screen-purchase .tab[data-cattab="' + tab + '"]');
      if (tEl) tEl.classList.add('active');
      $('#pcat-tab-' + tab).classList.add('active');
      if (catContainer) catContainer.classList.add('active');
      this.renderCategorySupplierBySafeId(tab);
    }
  },

  renderCategorySupplierBySafeId(safeId) {
    const cat = this.categories.find(c => this._safeCatId(c) === safeId);
    if (cat) this.renderCategorySupplier(cat);
  },

  // 单个品类 Tab：供应商追踪表中 category 匹配该品类的所有行（所有采购员），带催更按钮
  // 关键：分页渲染（每页 PAGE_SIZE 行），避免品类下几千行一次性塞入 DOM 导致打开极慢；并带版本缓存避免翻页重复全量计算
  renderCategorySupplier(cat) {
    const safeId = this._safeCatId(cat);
    const container = $('#pcat-table-' + safeId);
    if (!container) return;
    const cn = normalizeText(cat);
    // 带版本缓存：supplier/delivery 未变时复用已匹配数据
    const ver = Store._supplyVersion || 0;
    if (!this._catData) this._catData = {};
    let data = this._catData[safeId];
    if (!data || data._v !== ver) {
      const supplierAll = Store.getData('supplier');
      let all = supplierAll.filter(r => normalizeText(rowCategoryOf(r)) === cn);
      // 诊断：把当前 supplier 数据按品类汇总，方便排查“某品类数量不对”
      try {
        const dist = {};
        supplierAll.forEach(r => { const c = rowCategoryOf(r) || '(空白)'; dist[c] = (dist[c] || 0) + 1; });
        console.log('[renderCategorySupplier] 品类分布:', dist);
        console.log('[renderCategorySupplier]', cat, '匹配', all.length, '/', supplierAll.length);
      } catch (e) {}
      all = this.attachSalesMetrics(all);
      all._v = ver;
      this._catData[safeId] = all;
      data = all;
    }
    const countEl = $('#pcat-count-' + safeId);
    if (countEl) countEl.textContent = '共 ' + data.length + ' 条';
    if (data.length === 0) {
      container.innerHTML = '<p style="padding:24px;color:var(--text-muted)">该品类暂无供应商追踪数据</p>';
      const pg = $('#pcat-pagination-' + safeId); if (pg) pg.innerHTML = '';
      return;
    }
    if (!this._catPage) this._catPage = {};
    let page = this._catPage[safeId] || 0;
    const totalPages = Math.ceil(data.length / PAGE_SIZE);
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    this._catPage[safeId] = page;
    const pageData = getPageData(data, page);
    // 品类负责人分表仅显示用户指定的列
    const CAT_TAB_FIELDS = new Set([
      'channel', 'channelSku', 'comboSku', 'supplier', 'supplierStatus',
      'augTarget', 'deliveryQty', 'remainingDelivery', 'sepOnShelf',
      'augPendingBox', 'augSpotBox', 'augDeliverable', 'augDeliveryDate', 'augRemark'
    ]);
    const cols = [
      { f: 'category', l: '品类' },
      { f: 'buyer', l: '采购员', click: 'buyer', nag: true },
      ...COLS.supplier.filter(c => CAT_TAB_FIELDS.has(c.f)).map(c => ({ ...c, edit: false })),
    ];
    const html = renderExpandableTable(cols, pageData, {
      editable: false, expandPrefix: 'pcat-' + safeId, hideSalesData: true, role: 'purchase', headerFilterUI: 'PurchaseUI'
    });
    setTableHTML(container, html);
    // 分页栏
    const pgEl = $('#pcat-pagination-' + safeId);
    if (pgEl) {
      if (totalPages <= 1) { pgEl.innerHTML = ''; }
      else {
        let ph = '<div class="pagination">';
        ph += `<button class="page-btn" ${page <= 0 ? 'disabled' : ''} onclick="PurchaseUI.goToCatPage('${safeId}',${page - 1})">上一页</button>`;
        const start = Math.max(0, page - 3), end = Math.min(totalPages, start + 7);
        for (let i = start; i < end; i++) {
          ph += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="PurchaseUI.goToCatPage('${safeId}',${i})">${i + 1}</button>`;
        }
        ph += `<button class="page-btn" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="PurchaseUI.goToCatPage('${safeId}',${page + 1})">下一页</button>`;
        ph += `<span class="page-info">第 ${page + 1}/${totalPages} 页 (共${data.length}条)</span>`;
        ph += '</div>';
        pgEl.innerHTML = ph;
      }
    }
  },

  goToCatPage(safeId, page) {
    if (!this._catPage) this._catPage = {};
    this._catPage[safeId] = page;
    const cat = this.categories.find(c => this._safeCatId(c) === safeId);
    if (cat) this.renderCategorySupplier(cat);
  },

  // 导出某个品类负责人 Tab 下的全部数据（所有页，非当前页）
  exportCategoryBySafeId(safeId) {
    const cat = this.categories.find(c => this._safeCatId(c) === safeId);
    if (cat) this.exportCategory(cat);
  },

  async exportCategory(cat) {
    await ensureXLSX();
    const cn = normalizeText(cat);
    let data = Store.getData('supplier').filter(r => normalizeText(rowCategoryOf(r)) === cn);
    data = this.attachSalesMetrics(data);
    if (data.length === 0) { showToast('该品类暂无数据可导出', 'error'); return; }
    const cols = [
      { f: 'category', l: '品类' },
      { f: 'buyer', l: '采购员' },
      ...COLS.supplier.filter(c => c.f !== 'buyer').map(c => ({ ...c, edit: false })),
    ];
    const aoa = [cols.map(c => c.l)];
    data.forEach(r => aoa.push(cols.map(c => {
      if (c.f === 'category') return rowCategoryOf(r);
      if (c.f === 'categoryDisplay') return r.categoryDisplay || rowCategoryOf(r);
      if (c.html) return r[c.filterField] != null ? r[c.filterField] : ''; // html 列导出纯数值，不带差异标记
      const v = r[c.f];
      return (v === undefined || v === null) ? '' : v;
    })));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(cat).slice(0, 28) || '品类');
    const fname = '品类_' + cat + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    xlsxWriteFile(wb, fname);
    Store.addHistory({ user: this.userName, role: 'purchase', action: '导出品类表', detail: cat + ' ' + data.length + ' 条' });
    showToast('已导出『' + cat + '』' + data.length + ' 条');
  },

  changePassword() {
    const cur = Store.getPurchasePassword(this.userName);
    Modal.show('修改登录密码', `
      <div style="padding:8px 0">
        <p style="margin:0 0 12px;color:var(--text-muted);font-size:13px">采购员「${escapeHtml(this.userName)}」当前密码：${escapeHtml(cur)}</p>
        <input type="text" id="pwd-new" placeholder="请输入新密码" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px" autocomplete="off">
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-sm" onclick="Modal.close()">取消</button>
          <button class="btn-primary btn-sm" onclick="PurchaseUI.savePassword()">保存</button>
        </div>
      </div>`);
    setTimeout(() => $('#pwd-new')?.focus(), 50);
  },

  savePassword() {
    const val = ($('#pwd-new')?.value || '').trim();
    if (!val) { showToast('密码不能为空', 'error'); return; }
    Store.setPurchasePassword(this.userName, val); // 本地缓存
    // 同步云端：合并现有密码表后整体上传；云端不可达时静默失败（本地已生效）
    if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
      Sync.pushPurchasePassword(this.userName, val).catch(e => console.warn('[pwd] 云端同步失败，仅本地生效:', e && e.message));
    }
    Modal.close();
    showToast('密码已更新并同步云端，下次登录生效', 'success');
  },

  renderNagCount() {
    const nags = Store.getNags();
    const today = Store._todayKey();
    const yesterdayDate = new Date(today + 'T00:00:00+08:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = Store._fmtBeijingDate(yesterdayDate);

    // 采购页只展示“当前采购员被催”的数据；计划和运营页仍展示团队全部；采购管理员看全部
    const isPurchase = typeof PurchaseUI !== 'undefined' && this === PurchaseUI && this.userName;
    let todayTotal = 0, yestTotal = 0;
    Object.entries(nags).forEach(([k, n]) => {
      // 采购页只统计“当前采购员(当事人)被催”的数据；buyer 为空的老记录也跳过，避免泄漏给所有采购
      if (isPurchase && !this.isAdmin && (!n.buyer || !nameMatches(n.buyer, this.userName))) return;
      const recDate = n.ts ? Store._dateKeyOf(n.ts) : n.date;
      if (recDate === today) todayTotal++;
      else if (recDate === yesterday) yestTotal++;
    });

    const el = $('#purchase-nag-board');
    if (el) {
      el.innerHTML = `
        <div class="nag-board">
          <div class="nag-board-item ${yestTotal > 0 ? 'warn' : 'none'}">
            <span class="nag-board-icon">🔔</span>
            <span class="nag-board-text">昨日催更 <strong>${yestTotal}</strong> 次</span>
          </div>
          <div class="nag-board-item ${todayTotal > 0 ? 'warn' : 'none'}">
            <span class="nag-board-icon">🔔</span>
            <span class="nag-board-text">今日催更 <strong>${todayTotal}</strong> 次</span>
          </div>
        </div>`;
    }
  },

  getMySupplierData() {
    const ver = Store._supplyVersion || 0;
    if (this._myDataCache && this._myDataVersion === ver) return this._myDataCache;
    const data = Store.getData('supplier');
    let filtered = data;
    if (!this.isAdmin) {
      // 品类负责人主表与普通采购员一致：只看带自己名字的 SKU；
      // 其负责品类的全量供应商追踪表在其对应的“品类分表”中查看（renderCategorySupplier），
      // 不会把主表整体替换成负责品类，避免吞掉自己的采购 SKU。
      filtered = data.filter(r => buyerExact(r.buyer, this.userName));
    }
    // 兜底路径（未上传发货明细时）也要合并取消/退货表的供应商库存，避免采购页该列空白
    const cancelList = Store.getData('cancel') || [];
    const cJoin = {}, cSku = {};
    cancelList.forEach(c => {
      const jk = DeliveryMatcher.joinKey(c);
      if (jk && !cJoin[jk]) cJoin[jk] = [];
      if (jk) cJoin[jk].push(c);
      const sk = DeliveryMatcher.skuKey(c);
      if (sk && !cSku[sk]) cSku[sk] = [];
      if (sk) cSku[sk].push(c);
    });
    filtered = filtered.map(r => {
      const jk = DeliveryMatcher.joinKey(r);
      const sk = DeliveryMatcher.skuKey(r);
      const cRows = (jk && cJoin[jk]) || (sk && cSku[sk]) || [];
      const nums = cRows.map(x => parseFloat(x.cancelSupplierStock)).filter(v => !isNaN(v));
      return Object.assign({}, r, { cancelSupplierStock: nums.length ? nums.reduce((a, b) => a + b, 0) : '' });
    });
    this._myDataCache = filtered;
    this._myDataVersion = ver;
    return filtered;
  },

  // 采购页主表 = 供应商追踪表（supplier）本身，即用户上传的跟踪表为准。
  // 不再以「9月发货明细底表(delivery)」为底表。仅把 取消/退货表(cancel)的供应商库存、
  // 供货清单(supply)的供应商/状态、货品表(goods)的品类 按 SKU 兜底补齐。
  getDeliveryBasedData() {
    let supplierData = Store.getData('supplier') || [];
    if (supplierData.length === 0) return [];
    // 修复旧版本解析数据中 category / displayName 为空、但 ns名称/NS名称 有值的问题，
    // 否则“显示名称”/“品类”会显示为空。
    supplierData = supplierData.map(r => {
      const cat = r.category || r['ns名称'] || r['NS名称'] || rowCategoryOf(r) || '';
      const disp = r.displayName || r['ns名称'] || r['NS名称'] || cat || rowCategoryOf(r) || '';
      const patch = {};
      if (cat && !r.category) patch.category = cat;
      if (disp && !r.displayName) patch.displayName = disp;
      return Object.keys(patch).length ? { ...r, ...patch } : r;
    });
    // 消除「仅大小写不同」的同一 SKU（如 M90413W 与 m90413w）造成的 key 冲突，
    // 避免采购备注/交期在合并或主表匹配时串行到另一个 SKU。
    const _supBefore = supplierData.length;
    supplierData = mergeCaseVariantRows(supplierData);
    const { joinMap: sJoin, skuMap: sSku } = DeliveryMatcher.buildMap(supplierData);
    const findSupplier = (dRow) => {
      const jk = DeliveryMatcher.joinKey(dRow);
      const skNorm = DeliveryMatcher.skuKey(dRow);
      let cand = (sJoin[jk] && sJoin[jk].length) ? sJoin[jk] : (skNorm && sSku[skNorm] ? [sSku[skNorm]] : []);
      if (cand.length > 1) {
        // 命中多行时，优先选 channelSku（大小写不敏感）真正一致的行，避免大小写变体串行
        const same = cand.filter(s => normalizeText(s.channelSku) === skNorm);
        if (same.length) cand = same;
      }
      return cand[0] || null;
    };
    // 供货清单索引（按 SKU）：用于「供应商 / 供应商状态」兜底——
    // 跟踪表里没有这两列值时，用供货清单匹配；供货清单也没有就留空。
    const supplyList = Store.getData('supply') || [];
    const supplyBySku = {};
    supplyList.forEach(r => {
      const sk = normalizeText(String(r.channelSku || ''));
      if (sk && !supplyBySku[sk]) supplyBySku[sk] = r;
    });
    const fillSupplierFromSupply = (merged) => {
      if (merged.supplier && merged.supplierStatus) return merged; // 两项都有，无需兜底
      const sk = normalizeText(String(merged.channelSku || ''));
      const sr = sk ? supplyBySku[sk] : null;
      if (sr) {
        if (!merged.supplier) merged.supplier = sr.supplier || '';
        if (!merged.supplierStatus) merged.supplierStatus = sr.supplierStatus || '';
      }
      return merged;
    };
    // 货品表索引（按 SKU）：用于「品类」兜底——跟踪表/发货明细品类为空时，用货品表按 SKU 补齐；货品表也没有则留空。
    const goodsList = Store.getData('goods') || [];
    const goodsBySku = {};
    goodsList.forEach(r => {
      const sk = normalizeText(String(r.channelSku || ''));
      if (sk && !goodsBySku[sk]) goodsBySku[sk] = r;
    });
    const fillCategoryFromGoods = (merged) => {
      let cat = rowCategoryOf(merged);
      if (!cat) {
        const sk = normalizeText(String(merged.channelSku || ''));
        const gr = sk ? goodsBySku[sk] : null;
        if (gr && gr.category) { merged.category = gr.category; cat = gr.category; }
      }
      merged.categoryDisplay = cat || '';
      return merged;
    };
    // 供应商库存索引（来自取消/退货表 cancel）：按 joinKey + skuKey 双重索引，供采购页聚合显示。
    // 运营/计划页走 Merger.getMergedData() 已合并此数据，但采购页用本方法生成主表，需在此单独聚合，
    // 否则同一 SKU 在运营页有“供应商库存”量、采购页却为空。
    const cancelList = Store.getData('cancel') || [];
    const cancelJoinMap = {};
    const cancelSkuMap = {};
    cancelList.forEach(c => {
      const jk = DeliveryMatcher.joinKey(c);
      if (jk && !cancelJoinMap[jk]) cancelJoinMap[jk] = [];
      if (jk) cancelJoinMap[jk].push(c);
      const sk = DeliveryMatcher.skuKey(c);
      if (sk && !cancelSkuMap[sk]) cancelSkuMap[sk] = [];
      if (sk) cancelSkuMap[sk].push(c);
    });
    const attachCancelStock = (merged) => {
      const jk = DeliveryMatcher.joinKey(merged);
      const sk = DeliveryMatcher.skuKey(merged);
      const cRows = (jk && cancelJoinMap[jk]) || (sk && cancelSkuMap[sk]) || [];
      const nums = cRows.map(r => parseFloat(r.cancelSupplierStock)).filter(v => !isNaN(v));
      merged.cancelSupplierStock = nums.length ? nums.reduce((a, b) => a + b, 0) : '';
      return merged;
    };
    let rows = supplierData.map(sRow => {
      const merged = Object.assign({}, sRow);
      attachCancelStock(merged);
      fillSupplierFromSupply(merged);
      fillCategoryFromGoods(merged);
      if (!merged.displayName) merged.displayName = sRow.displayName || sRow['ns名称'] || sRow['NS名称'] || sRow.category || rowCategoryOf(sRow) || '';
      return merged;
    });
    // 组合SKU 兜底：发货明细里「是否组合」=是 且该行组合SKU 仍为空时，
    // 填本行的渠道SKU。仅填空时补，已填的不覆盖。
    for (const r of rows) {
      const ic = normalizeText(String(r.isCombo || ''));
      const comboLike = ic.includes('组合') || ['是', 'y', 'yes', 'true', '1'].includes(ic);
      if (comboLike && !String(r.comboSku || '').trim()) {
        r.comboSku = String(r.channelSku || '').trim() || '';
      }
    }
    // 确定性排序：云端重新同步后，supplier 在本地缓存里的数组顺序可能与云端不一致，
    // 若直接按数组顺序渲染，行会“重排跳动”。统一按 显示名称→渠道SKU→采购员 稳定排序，
    // 保证同一批数据无论来源顺序如何，渲染行序始终一致，消除云端刷新后的表格跳动。
    rows.sort((a, b) => {
      const ca = normalizeText(a.displayName || a.category || '');
      const cb = normalizeText(b.displayName || b.category || '');
      if (ca !== cb) return ca < cb ? -1 : 1;
      const sa = normalizeText(a.channelSku || '');
      const sb = normalizeText(b.channelSku || '');
      if (sa !== sb) return sa < sb ? -1 : 1;
      const ba = normalizeText(a.buyer || '');
      const bb = normalizeText(b.buyer || '');
      if (ba !== bb) return ba < bb ? -1 : 1;
      return 0;
    });

    // 权限过滤：默认只看「本次跟踪表里属于我的 SKU」；旧交期数据保留在云端，
    // 但采购前端默认隐藏。优先按 supplier_meta[buyer].activeKeys（本次上传的 SKU key 集合）过滤；
    // 没有 activeKeys 时退化为按 _batchId 取最新批次。开启「显示全部历史」时不过滤。
    if (!this.isAdmin) {
      const before = rows.length;
      // 普通采购员与品类负责人统一按「本次上传 SKU 集合(activeKeys)」过滤；
      // 旧交期数据保留在云端，但采购前端默认隐藏。开启「显示全部历史」时不过滤。
      const showAll = this._showAllSupplier;
      const myRows = rows.filter(r => buyerExact(r.buyer, this.userName));
      const meta = Store.getData('supplier_meta') || {};
      const myMeta = meta[normalizeText(this.userName)] || {};
      let activeKeys = (myMeta.activeKeys && myMeta.activeKeys.length) ? myMeta.activeKeys : [];
      let filterMode = 'activeKeys';
      // activeKeys 为空时退化为 _batchId 最新批次过滤；再不行则自动从当前数据重建
      if (!activeKeys.length) {
        const batchIds = [...new Set(myRows.map(r => r._batchId).filter(Boolean))].sort().reverse();
        const lastBatch = batchIds[0] || '';
        if (lastBatch) {
          activeKeys = myRows.filter(r => r._batchId === lastBatch).map(r => OVERWRITE_KEYFN.supplier(r));
          filterMode = 'lastBatch';
        } else {
          // 没有任何 _batchId：无法判断“本次上传”，退化为该采购员全部并显示提示
          activeKeys = [];
          filterMode = 'none';
        }
      }
      // 诊断信息（供 _updateBatchInfo 在页面上显示）
      this._filterDiag = {
        buyer: this.userName,
        myTotal: myRows.length,
        active: activeKeys.length,
        mode: filterMode,
        showAll: !!showAll,
        finalCount: 0
      };
      if (!showAll && activeKeys.length) {
        const set = new Set(activeKeys);
        rows = myRows.filter(r => set.has(OVERWRITE_KEYFN.supplier(r)));
      } else {
        rows = myRows;
      }
      if (this._filterDiag) this._filterDiag.finalCount = rows.length;
      console.log(`[Purchase] ${this.userName} 过滤(showAll=${!!showAll}, mode=${filterMode}, active=${activeKeys.length}): ${before} -> ${rows.length}`);
    }
    // 把销量大表(sales)的 9月交付字段匹配到供应商行（纯数值，无绿+/红- 差异），供采购主表展示
    rows = this.attachSalesMetrics(rows);
    return rows;
  },

  // 交付指标已匹配、带差异标记的“富数据”。仅在 delivery / supplier 真正变更时才重算，
  // 按键筛选 / 翻页 / 自动刷新（数据未变）直接复用缓存，避免反复全量重算导致卡顿。
  getMyRichData() {
    const ver = Store._supplyVersion || 0;
    if (this._richCache && this._richVersion === ver) return this._richCache;
    const base = this.getDeliveryBasedData();
    const rich = base.map(r => {
      return Object.assign({}, r, {
        categoryDisplay: r.categoryDisplay || r.category || rowCategoryOf(r),
      });
    });
    const finalRich = rich;
    this._richCache = finalRich;
    this._richVersion = ver;
    return finalRich;
  },

  // 把销量大表(sales)的 9月交付字段（9月目标/交付数量/剩余交付）匹配到行并附加为纯数值。
  // 按 salesKey（渠道+渠道SKU+是否FBA+是否组合+是否PO产品+国家）匹配；并额外建立“去掉是否PO”的兜底索引，
  // 提高供应商行（可能缺是否PO）与销量大表的匹配率。不再生成绿+/红- 环比差异（需求：删除差异标记）。
  attachSalesMetrics(data) {
    const sales = Store.getData('sales') || [];
    const primaryMap = {}, fallbackMap = {};
    const pKey = r => [r.channel, r.channelSku, r.isFba, r.isCombo, r.isPo, r.country].map(v => normalizeText(String(v || ''))).join('|');
    const fKey = r => [r.channel, r.channelSku, r.isFba, r.isCombo, r.country].map(v => normalizeText(String(v || ''))).join('|');
    sales.forEach(s => {
      const pk = pKey(s); if (!primaryMap[pk]) primaryMap[pk] = s;
      const fk = fKey(s); if (!fallbackMap[fk]) fallbackMap[fk] = s;
    });
    const findSales = (row) => {
      const pk = pKey(row); if (primaryMap[pk]) return primaryMap[pk];
      const fk = fKey(row); return fallbackMap[fk] || null;
    };
    return data.map(row => {
      const s = findSales(row);
      return Object.assign({}, row, {
        augTarget: s ? (s.augTarget || '') : (row.augTarget || ''),
        deliveryQty: s ? (s.deliveryQty || '') : (row.deliveryQty || ''),
        remainingDelivery: s ? (s.remainingDelivery || '') : (row.remainingDelivery || ''),
      });
    });
  },

  clearSearch(id) {
    const el = $('#' + id);
    if (!el) return this.renderSupplier();
    if (el.classList.contains('multi-select')) {
      MultiSelectUI.clear(id);
    } else {
      el.value = '';
      if (id === 'purchase-search-sku') {
        el.placeholder = '🔍 搜索SKU';
        this.skuBatchSet = new Set();
      }
    }
    this.renderSupplier();
  },

  clearBuyerFilter() {
    const input = $('#purchase-search-buyer');
    if (input) input.value = '';
    this.renderSupplier();
  },

  // 搜索输入防抖：避免快速打字时每个字符都触发一次全量重渲染
  _searchTimer: null,
  onSearchInput() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => { this.renderSupplier(); }, 120);
  },

  renderSupplier() {
    // 交付指标已匹配的富数据（带版本缓存，按键/翻页/自动刷新未变更时直接复用）
    let data = this.getMyRichData();
    // SKU 搜索（顶部保留；显示名称/渠道/品类/供应商/采购员/状态等筛选均已迁至表头）
    const skuQ = ($('#purchase-search-sku')?.value || '').trim();
    if (skuQ) data = data.filter(r => normalizeText(r.channelSku).includes(normalizeText(skuQ)));
    // 批量 SKU 搜索（或关系，精确匹配）
    if (this.skuBatchSet && this.skuBatchSet.size > 0) {
      data = data.filter(r => this.skuBatchSet.has(normalizeText(r.channelSku)));
    }
    // 工厂筛选
    if (this.factoryFilter) {
      data = data.filter(r => String(r.supplier || '') === this.factoryFilter);
    }
    // 表头多选筛选（渠道/品类/供应商/目的国家/采购员/供应商状态/交期/备注）
    data = this.applyMultiFilters(data);
    // 表头数值筛选（9月目标/交付数量/剩余交付/202609-10目标/待交付箱单/现货箱单/8-10月可交数量）
    data = this.applyNumericFilters(data);
    this.filteredData = data;
    this.currentPage = Math.min(this.currentPage, Math.ceil(data.length / PAGE_SIZE) - 1);
    if (this.currentPage < 0) this.currentPage = 0;
    const pageData = getPageData(data, this.currentPage);
    const html = renderExpandableTable(COLS.supplier, pageData, {
      editable: true, offset: this.currentPage * PAGE_SIZE, expandPrefix: 'psup',
      editHandler: 'PurchaseUI.startEdit',
      hideSalesData: true, headerFilterUI: 'PurchaseUI'
    });
    setTableHTML('purchase-supplier-table', html);
    renderPagination('purchase-supplier-pagination', data.length, this.currentPage, 'PurchaseUI.goToPage');
    this.renderFactoryStats();
    this.renderFilterStates();
    PURCHASE_MULTI_FILTERS.forEach(d => this._hmUpdateHeaderState(d.col, 'PurchaseUI'));
  },

  jumpToUnfilled() {
    // 切换到供应商追踪表并只显示交期未填
    $$('#screen-purchase .tab').forEach(t => t.classList.remove('active'));
    $$('#screen-purchase .tab-content').forEach(c => c.classList.remove('active'));
    $('#screen-purchase .tab[data-ptab="supplier"]').classList.add('active');
    $('#ptab-supplier').classList.add('active');
    // 清空现有筛选，按交期为空筛选
    this.clearSearch('purchase-search-sku');
    this.factoryFilter = null;
    PURCHASE_MULTI_FILTERS.forEach(d => { this[d.prop] = new Set(); });
    PURCHASE_NUM_FILTERS.forEach(d => { this[d.prop] = null; });
    // 通过 renderSupplier 后高亮未填行
    this.renderSupplier();
    showToast('已定位到供应商追踪表交期未填数据');
  },

  jumpToReplenish() {
    $$('#screen-purchase .tab').forEach(t => t.classList.remove('active'));
    $$('#screen-purchase .tab-content').forEach(c => c.classList.remove('active'));
    $('#screen-purchase .tab[data-ptab="replenish"]').classList.add('active');
    $('#ptab-replenish').classList.add('active');
    this.renderReplenish();
    showToast('已切换到需补订单');
  },

  // ===== 工厂统计：右上角汇总 + 只显示今日被催过的工厂 =====
  renderFactoryStats() {
    const myData = this.getMySupplierData();
    const allSupplier = Store.getData('supplier');
    const nags = Store.getNags();
    const today = Store._todayKey();

    // 1) 统计今日被催工厂（按SKU+发起role去重）。工厂映射用全量供应商数据，
    // 保证“被催的是哪个工厂”一定显示，不依赖采购登录名是否恰好等于被催采购员。
    // 同一SKU被计划、运营分别催更，采购端应统计为多次。
    const nagFactoryCount = {};
    const nagFactorySkus = {};
    Object.entries(nags).forEach(([k, n]) => {
      const recDate = n.ts ? Store._dateKeyOf(n.ts) : n.date;
      if (recDate !== today) return;
      // 优先用值里的字段，旧数据兜底按 key 解析（兼容 sku||buyer 两段 / 历史 role||sku||buyer 三段）
      const parts = k.split(Store._nagSep);
      const channelSku = n.channelSku || (parts.length >= 2 ? parts[parts.length - 2] : parts[0]);
      const buyer = n.buyer || parts[parts.length - 1];
      const role = n.role || (parts.length >= 3 ? parts[0] : 'unknown');
      if (!channelSku || !buyer) return;
      // 采购工作台只统计"当前采购员"被催的工厂；管理员看全部
      if (!this.isAdmin && !buyerExact(buyer, this.userName)) return;
      const factories = [...new Set(allSupplier.filter(r => normalizeText(r.channelSku) === normalizeText(channelSku)).map(r => String(r.supplier || '').trim()).filter(Boolean))];
      factories.forEach(fac => {
        if (!nagFactorySkus[fac]) nagFactorySkus[fac] = new Set();
        const dedupeKey = channelSku + '|' + role;
        if (!nagFactorySkus[fac].has(dedupeKey)) {
          nagFactorySkus[fac].add(dedupeKey);
          nagFactoryCount[fac] = (nagFactoryCount[fac] || 0) + 1;
        }
      });
    });

    // 2) 统计交期未填工厂（按工厂统计SKU数）
    const unfilledByFactory = {};
    myData.forEach(r => {
      const fac = String(r.supplier || '').trim();
      if (!fac) return;
      const allEmpty = !r.sepDeliveryDate && !r.octDeliveryDate;
      if (allEmpty) unfilledByFactory[fac] = (unfilledByFactory[fac] || 0) + 1;
    });

    // 右上角汇总框
    const nagCountEl = $('#factory-nag-count');
    const unfilledCountEl = $('#factory-unfilled-count');
    if (nagCountEl) nagCountEl.textContent = String(Object.keys(nagFactoryCount).length);
    if (unfilledCountEl) unfilledCountEl.textContent = String(Object.keys(unfilledByFactory).length);

    // 下方只显示被催过的工厂 chip（仅供应商编号+次数）
    const factories = Object.keys(nagFactoryCount);
    if (factories.length === 0) {
      $('#purchase-factory-stats').innerHTML = '<span style="color:var(--text-muted);font-size:13px;padding:6px 14px">今日暂无被催工厂</span>';
      return;
    }
    const activeFactory = this.factoryFilter || '';
    const html = factories.sort((a, b) => nagFactoryCount[b] - nagFactoryCount[a]).map(f => {
      const count = nagFactoryCount[f];
      const isActive = activeFactory === f;
      const code = escapeHtml(f);
      return `<button class="factory-chip ${isActive ? 'active' : ''}" onclick="PurchaseUI.toggleFactoryFilter('${code.replace(/'/g, "\\'")}')" title="工厂编号：${code}\n今日被催 ${count} 次，点击筛选">
        <span class="factory-chip-code">${code}</span>
        <span class="factory-chip-badge danger">${count}</span>
      </button>`;
    }).join('');
    $('#purchase-factory-stats').innerHTML = html;
  },

  // 点击工厂：切换筛选（再点一次取消）
  toggleFactoryFilter(factoryName) {
    if (this.factoryFilter === factoryName) {
      this.factoryFilter = null;
    } else {
      this.factoryFilter = factoryName;
    }
    this.currentPage = 0;
    this.renderSupplier();
  },

  // ===== 导出用户上传的原始供应商追踪表（全部人：管理员导出全部，采购员仅自己；用 _raw 还原上传时的原始列） =====
  async exportSupplier() {
    await ensureXLSX();
    const all = Store.getData('supplier') || [];
    if (!all.length) { showToast('无数据可导出', 'error'); return; }
    // 还原"原始上传的供应商追踪表"：不过滤当前表格筛选，且用 _raw 原始列/值，未合并发货明细
    const data = this.isAdmin ? all : all.filter(r => buyerExact(r.buyer, this.userName));
    if (!data.length) { showToast('无数据可导出', 'error'); return; }
    const rawLike = data.filter(r => r && r._raw && Object.keys(r._raw).length);
    let headers, rows;
    if (rawLike.length === data.length) {
      // 按首次出现顺序收集上传时的原始列名，还原原始表结构
      const seen = [];
      data.forEach(r => { for (const k in r._raw) { if (!seen.includes(k)) seen.push(k); } });
      headers = seen;
      rows = data.map(r => headers.map(h => r._raw[h] != null ? r._raw[h] : ''));
    } else {
      // 兜底：部分行没有 _raw，回退到采购主表列定义
      const cols = COLS.supplier;
      headers = cols.map(c => c.l);
      rows = data.map(r => cols.map(c => {
        if (c.f === 'displayName') return r.displayName || r['ns名称'] || r['NS名称'] || '';
        if (c.html) return r[c.filterField] != null ? r[c.filterField] : '';
        const v = r[c.f];
        return v != null ? v : '';
      }));
    }
    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '供应商追踪');
    xlsxWriteFile(wb, '供应商追踪_' + (this.isAdmin ? '全部' : this.userName) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    Store.addHistory({ user: this.userName, role: 'purchase', action: '导出原始供应商追踪', detail: data.length + ' 条' });
    showToast('已导出原始供应商追踪 ' + data.length + ' 条');
  },

  // ===== 采购页导出：直出用户上传的供应商追踪源文件（不做任何合并/富化/去重，行数=上传行数） =====
  // 采购页导出：导出“跟踪表视图”（与页面主表一致，含 merge 修复不再丢行）
  async exportPurchaseTracking() {
    await ensureXLSX();
    const data = this.getMyRichData();
    if (!data.length) { showToast('无数据可导出', 'error'); return; }
    const cols = PURCHASE_TRACKING_EXPORT_COLS;
    const headers = cols.map(c => c.l);
    const aoa = [headers];
    data.forEach(r => {
      aoa.push(cols.map(c => {
        let v = r[c.f];
        if (c.f === 'displayName') v = v || r['ns名称'] || r['NS名称'] || '';
        if (v === undefined || v === null) return '';
        if (typeof v === 'string' && v.includes('<')) {
          const tmp = document.createElement('div');
          tmp.innerHTML = v;
          v = tmp.textContent || tmp.innerText || '';
        }
        return v;
      }));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '采购跟踪表');
    xlsxWriteFile(wb, '采购跟踪表_' + this.userName + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    Store.addHistory({ user: this.userName, role: 'purchase', action: '导出采购跟踪表', detail: data.length + ' 条' });
    showToast('已导出采购跟踪表 ' + data.length + ' 条');
  },

  goToPage(page) { this.currentPage = page; this.renderSupplier(); },

  // 判断需补订单某列是否为数值列（按列名或采样值）
  _replenishIsNumericCol(col, rows) {
    const lower = col.toLowerCase();
    // 月份/时间类字段即使值是纯数字，也应按多选筛选处理，方便勾选和搜索
    if (lower.includes('月份') || lower.includes('month') || lower.includes('年月')) return false;
    const numericNames = ['数量', 'qty', 'quantity', '下单数量', 'orderqty', 'order_qty', '金额', 'price'];
    if (numericNames.some(n => lower.includes(n))) return true;
    let sample = [];
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i];
      const v = r._raw ? r._raw[col] : r[normalizeText(col)];
      if (v !== '' && v !== null && v !== undefined) sample.push(v);
    }
    if (sample.length === 0) return false;
    return sample.every(v => !isNaN(parseFloat(String(v).replace(/,/g, ''))));
  },

  _replenishGetCellValue(row, col) {
    return row._raw ? row._raw[col] : (row[normalizeText(col)] ?? '');
  },

  _replenishToNum(v) {
    const s = String(v == null ? '' : v).replace(/,/g, '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  _replenishMatchesNumeric(rowVal, filter) {
    if (!filter || filter.op === 'all') return true;
    const a = this._replenishToNum(rowVal);
    if (a === null) return false;
    const v1 = parseFloat(filter.v1);
    if (isNaN(v1)) return false;
    switch (filter.op) {
      case 'eq': return a === v1;
      case 'neq': return a !== v1;
      case 'gt': return a > v1;
      case 'lt': return a < v1;
      case 'gte': return a >= v1;
      case 'lte': return a <= v1;
      case 'between': {
        const v2 = parseFloat(filter.v2);
        if (isNaN(v2)) return false;
        return Math.min(v1, v2) <= a && a <= Math.max(v1, v2);
      }
      default: return true;
    }
  },

  // SKU 搜索防抖（需补订单顶部搜索框）
  _replenishSearchTimer: null,
  onReplenishSearchInput() {
    if (this._replenishSearchTimer) clearTimeout(this._replenishSearchTimer);
    this._replenishSearchTimer = setTimeout(() => { this.renderReplenish(); }, 120);
  },

  clearReplenishSearch() {
    const input = $('#purchase-replenish-search-sku');
    if (input) input.value = '';
    this.skuBatchSet = new Set();
    this.renderReplenish();
  },

  renderReplenish() {
    const all = Store.getData('replenish');
    // 按采购员名筛选；管理员看全部
    // 非管理员只看自己名下的行；名下无数据时结果为空（不回退全量，避免权限逃逸）
    let filtered = all;
    if (!this.isAdmin) {
      filtered = all.filter(r => buyerExact(r.buyer, this.userName));
    }

    // 获取列定义（从第一行的_raw对象）
    let displayCols = [];
    if (filtered.length > 0) {
      const rawKeys = filtered[0]._raw ? Object.keys(filtered[0]._raw) : Object.keys(filtered[0]).filter(k => !k.startsWith('_'));
      displayCols = rawKeys.filter(k => k && !k.startsWith('_'));
    }

    // 顶部 SKU 搜索：优先匹配列名含"渠道SKU/SKU/sku"的列，否则匹配任意列
    const skuQ = ($('#purchase-replenish-search-sku')?.value || '').trim();
    if (skuQ && displayCols.length > 0) {
      const skuCols = displayCols.filter(c => /渠道sku|sku|SKU|渠道SKU|渠道Sku/i.test(c));
      const targetCols = skuCols.length > 0 ? skuCols : displayCols;
      const term = normalizeText(skuQ);
      filtered = filtered.filter(r => targetCols.some(c => normalizeText(String(this._replenishGetCellValue(r, c) || '')).includes(term)));
    }

    // 批量 SKU 搜索（或关系，精确匹配）
    if (this.skuBatchSet && this.skuBatchSet.size > 0 && displayCols.length > 0) {
      const skuCols = displayCols.filter(c => /渠道sku|sku|SKU|渠道SKU|渠道Sku/i.test(c));
      const targetCols = skuCols.length > 0 ? skuCols : displayCols;
      filtered = filtered.filter(r => targetCols.some(c => this.skuBatchSet.has(normalizeText(String(this._replenishGetCellValue(r, c) || '')))));
    }

    // 应用列筛选（支持多选 Set 与数值 {op,v1,v2}）
    Object.entries(this.replenishFilters).forEach(([col, val]) => {
      if (!val || !displayCols.includes(col)) return;
      if (val instanceof Set) {
        if (val.size > 0) {
          filtered = filtered.filter(r => {
            const rawVal = String(this._replenishGetCellValue(r, col) || '');
            return val.has(rawVal);
          });
        }
      } else if (typeof val === 'object' && val.op) {
        if (val.op !== 'all') {
          filtered = filtered.filter(r => {
            const rawVal = this._replenishGetCellValue(r, col);
            return this._replenishMatchesNumeric(rawVal, val);
          });
        }
      }
    });

    this.replenishFilteredData = filtered;
    this.replenishPage = Math.min(this.replenishPage, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    if (this.replenishPage < 0) this.replenishPage = 0;

    if (filtered.length === 0) {
      $('#purchase-replenish-table').innerHTML = '<p style="padding:20px;color:var(--text-muted)">暂无数据</p>';
      renderPagination('purchase-replenish-pagination', 0, 0, 'PurchaseUI.goToReplenishPage');
      return;
    }

    // 渲染表格，表头加 ▼ 筛选按钮；渠道SKU/SKU 列的筛选已放到顶部搜索框，表头不再显示 ▼
    const colTypes = {};
    displayCols.forEach(col => { colTypes[col] = this._replenishIsNumericCol(col, filtered) ? 'numeric' : 'multi'; });
    const pageData = getPageData(filtered, this.replenishPage);
    let html = '<div class="table-scroll"><table class="data-table"><thead><tr>';
    displayCols.forEach(col => {
      const type = colTypes[col];
      const isSkuCol = /渠道sku|sku|SKU|渠道SKU|渠道Sku/i.test(col);
      const filterBtn = isSkuCol ? '' : `<button type="button" class="col-filter-btn" title="${type === 'numeric' ? '数字筛选' : '多选筛选'}" data-action="replenish-filter" data-col="${escapeHtml(col)}" data-type="${type}" data-header-filter="replenish-${escapeHtml(col)}">▼</button>`;
      html += `<th><div class="th-with-filter"><span class="th-label">${escapeHtml(col)}</span>${filterBtn}</div></th>`;
    });
    html += '</tr></thead><tbody>';
    pageData.forEach((row) => {
      html += '<tr>';
      displayCols.forEach(col => {
        const val = this._replenishGetCellValue(row, col);
        html += `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    setTableHTML('purchase-replenish-table', html);
    renderPagination('purchase-replenish-pagination', filtered.length, this.replenishPage, 'PurchaseUI.goToReplenishPage');
    // 更新已筛选按钮高亮
    displayCols.forEach(col => {
      if (/渠道sku|sku|SKU|渠道SKU|渠道Sku/i.test(col)) return;
      const val = this.replenishFilters[col];
      const active = (val instanceof Set && val.size > 0) || (val && typeof val === 'object' && val.op && val.op !== 'all');
      const btn = document.querySelector(`button[data-header-filter="replenish-${escapeHtml(col)}"]`);
      if (btn) {
        if (active) btn.classList.add('col-filter-active');
        else btn.classList.remove('col-filter-active');
      }
    });
  },

  openReplenishFilter(btn, col, type, event) {
    const ev = event || (typeof window !== 'undefined' && window.event);
    if (ev && ev.stopPropagation) { try { ev.stopPropagation(); } catch (_) {} }
    if (ev && ev.preventDefault) { try { ev.preventDefault(); } catch (_) {} }
    if (!col) {
      col = btn.getAttribute('data-col');
      type = btn.getAttribute('data-type');
    }
    if (type === 'numeric') this._replenishOpenNumericPanel(btn, col);
    else this._replenishOpenMultiPanel(btn, col);
  },

  _replenishClosePanel(col) {
    const panel = document.getElementById('replenish-' + col + '-panel');
    if (panel) panel.style.display = 'none';
  },

  _replenishOpenMultiPanel(btn, col) {
    const data = this.replenishFilteredData.length > 0 ? this.replenishFilteredData : Store.getData('replenish');
    const values = [...new Set(data.map(r => String(this._replenishGetCellValue(r, col) || '')).filter(Boolean))].sort();
    console.log('[replenishFilter] 列名=', col, '唯一值=', values.slice(0, 20), '总行数=', data.length);
    const selected = this.replenishFilters[col];
    const allChecked = !(selected instanceof Set) || selected.size === 0;
    const panelId = 'replenish-' + col + '-panel';
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'excel-filter-panel';
      panel.style.display = 'none';
      panel.setAttribute('onclick', 'event.stopPropagation()');
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="excel-filter-header"><span>${escapeHtml(col)} 筛选</span><button type="button" class="btn-sm" onclick="event.stopPropagation(); PurchaseUI.clearReplenishFilter('${escapeHtml(col)}')">清空</button></div>
      <div class="excel-filter-search">
        <input type="text" id="replenish-${escapeHtml(col)}-search" placeholder="搜索选项…" autocomplete="off">
      </div>
      <div class="excel-filter-checklist" id="replenish-${escapeHtml(col)}-list">
        <label class="excel-filter-all"><input type="checkbox" data-action="all" ${allChecked ? 'checked' : ''}> 全部</label>
        ${values.map(v => {
          const checked = (selected instanceof Set && selected.has(v)) ? 'checked' : '';
          return `<label><input type="checkbox" value="${escapeHtml(v)}" ${checked}> ${escapeHtml(v)}</label>`;
        }).join('')}
      </div>
      <div class="excel-filter-actions"><button type="button" class="btn-primary btn-sm" onclick="event.stopPropagation(); PurchaseUI._replenishClosePanel('${escapeHtml(col)}')">确定</button></div>
    `;
    const allCb = panel.querySelector('input[data-action="all"]');
    const cbs = panel.querySelectorAll(`#replenish-${escapeHtml(col)}-list input[type="checkbox"]:not([data-action="all"])`);
    allCb.addEventListener('change', () => {
      this.replenishFilters[col] = new Set();
      cbs.forEach(cb => cb.checked = false);
      this.renderReplenish();
    });
    cbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const set = new Set(selected instanceof Set ? selected : []);
        if (cb.checked) set.add(cb.value); else set.delete(cb.value);
        this.replenishFilters[col] = set;
        allCb.checked = set.size === 0;
        this.renderReplenish();
      });
    });
    const searchInput = panel.querySelector(`#replenish-${escapeHtml(col)}-search`);
    if (searchInput) searchInput.addEventListener('input', () => this._replenishFilterPanelOptions(col, searchInput.value));
    this._replenishShowPanel(panel, btn);
  },

  _replenishFilterPanelOptions(col, q) {
    const list = document.getElementById('replenish-' + col + '-list');
    if (!list) return;
    const term = (q || '').trim().toLowerCase();
    list.querySelectorAll('label').forEach(lbl => {
      const txt = (lbl.textContent || '').toLowerCase();
      lbl.style.display = (!term || txt.includes(term)) ? '' : 'none';
    });
  },

  _replenishOpenNumericPanel(btn, col) {
    const panelId = 'replenish-' + col + '-panel';
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'excel-filter-panel';
      panel.style.display = 'none';
      panel.setAttribute('onclick', 'event.stopPropagation()');
      document.body.appendChild(panel);
    }
    const current = this.replenishFilters[col] || { op: 'all', v1: '', v2: '' };
    const html = buildNumericFilterHtml(
      'replenish', col,
      'PurchaseUI._replenishSetNumericOp',
      'PurchaseUI._replenishApplyNumericFilter',
      "PurchaseUI.clearReplenishFilter('" + col + "')",
      current.op, current.v1, current.v2
    );
    panel.innerHTML = html;
    panel.dataset.op = current.op || 'all';
    this._replenishShowPanel(panel, btn);
  },

  _replenishShowPanel(panel, btn) {
    fitFilterPanel(panel, btn);
    panel.onmouseleave = () => { panel.style.display = 'none'; panel.onmouseleave = null; };
  },

  _replenishSetNumericOp(col, op) {
    const panel = document.getElementById('replenish-' + col + '-panel');
    if (panel) {
      panel.dataset.op = op;
      panel.querySelectorAll('.nf-op-btn').forEach(b => b.classList.toggle('active', b.dataset.op === op));
    }
    const inputs = document.getElementById('replenish-' + col + '-inputs');
    const v2 = document.getElementById('replenish-' + col + '-v2');
    const and = document.getElementById('replenish-' + col + '-and');
    if (inputs) inputs.style.display = op === 'all' ? 'none' : 'flex';
    if (v2) v2.style.display = op === 'between' ? 'inline-block' : 'none';
    if (and) and.style.display = op === 'between' ? 'inline' : 'none';
    if (op === 'all') this._replenishApplyNumericFilter(col);
  },

  _replenishApplyNumericFilter(col) {
    const panel = document.getElementById('replenish-' + col + '-panel');
    let op = panel?.dataset?.op || 'all';
    const v1Raw = (document.getElementById('replenish-' + col + '-v1')?.value || '').trim();
    const v2Raw = (document.getElementById('replenish-' + col + '-v2')?.value || '').trim();
    if (op === 'all' && v1Raw !== '') op = 'eq';
    const f = op === 'all' ? null : { op, v1: v1Raw === '' ? null : parseFloat(v1Raw.replace(/,/g, '')), v2: v2Raw === '' ? null : parseFloat(v2Raw.replace(/,/g, '')) };
    this.replenishFilters[col] = f;
    if (panel) panel.style.display = 'none';
    this.renderReplenish();
  },

  setReplenishFilter(col, val) {
    this.replenishFilters[col] = val;
    this.replenishPage = 0;
    this.renderReplenish();
  },

  clearReplenishFilter(col) {
    delete this.replenishFilters[col];
    const panel = document.getElementById('replenish-' + col + '-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.dataset.op = 'all';
      panel.querySelectorAll('.nf-op-btn').forEach(b => b.classList.toggle('active', b.dataset.op === 'all'));
    }
    this.renderReplenish();
  },

  clearReplenishFilters() {
    this.replenishFilters = {};
    this.replenishPage = 0;
    this.skuBatchSet = new Set();
    const input = document.getElementById('purchase-replenish-search-sku');
    if (input) input.value = '';
    document.querySelectorAll('[id^="replenish-"][id$="-panel"]').forEach(p => p.style.display = 'none');
    this.renderReplenish();
  },

  clearReplenish() {
    if (!confirm('确定清空需补订单？此操作会删除本账号可见的需补订单，且会同步到云端，不可恢复。')) return;
    const all = Store.getData('replenish');
    let remaining = [];
    if (this.isAdmin) {
      remaining = [];
    } else {
      remaining = all.filter(r => !buyerExact(r.buyer, this.userName));
    }
    Store.setData('replenish', remaining).then(() => {
      this.replenishFilters = {};
      this.replenishPage = 0;
      this.skuBatchSet = new Set();
      const input = document.getElementById('purchase-replenish-search-sku');
      if (input) input.value = '';
      document.querySelectorAll('[id^="replenish-"][id$="-panel"]').forEach(p => p.style.display = 'none');
      this.renderReplenish();
      this.renderAlerts();
      Store.addHistory({ user: this.userName, role: 'purchase', action: '清空需补订单', detail: `原 ${all.length} 条，清除 ${all.length - remaining.length} 条，剩余 ${remaining.length} 条` });
      showToast(`已清空需补订单，本次清除 ${all.length - remaining.length} 条`);
    }).catch(err => {
      console.warn('[PurchaseUI] 清空需补订单失败', err);
      showToast('清空失败，请重试', 'error');
    });
  },

  async exportReplenish() {
    await ensureXLSX();
    const data = this.replenishFilteredData;
    if (data.length === 0) { showToast('无数据可导出', 'error'); return; }
    const rawKeys = data[0]._raw ? Object.keys(data[0]._raw) : Object.keys(data[0]).filter(k => !k.startsWith('_'));
    const cols = rawKeys.filter(k => k && !k.startsWith('_'));
    const aoa = [cols];
    data.forEach(r => {
      aoa.push(cols.map(col => {
        const v = r._raw ? r._raw[col] : r[normalizeText(col)];
        return v ?? '';
      }));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '需补订单');
    xlsxWriteFile(wb, '需补订单_' + this.userName + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    Store.addHistory({ user: this.userName, role: 'purchase', action: '导出需补订单', detail: data.length + ' 条' });
    showToast('已导出 ' + data.length + ' 条');
  },

  goToReplenishPage(page) { this.replenishPage = page; this.renderReplenish(); },

  renderAlerts() {
    const myData = this.getMySupplierData();
    const unfilled = myData.filter(r => !r.sepDeliveryDate && !r.octDeliveryDate);
    const replenish = Store.getData('replenish');
    const myReplenish = this.isAdmin ? replenish : replenish.filter(r => normalizeText(r.buyer) === normalizeText(this.userName));
    const filled = myData.length - unfilled.length;
    const html = `
      <div class="alert-cards">
        <div class="alert-card ${unfilled.length > 0 ? 'danger' : 'ok'}">
          <div class="alert-card-num">${unfilled.length}</div>
          <div class="alert-card-label">交期未填写</div>
        </div>
        <div class="alert-card ${myReplenish.length > 0 ? 'warn' : 'ok'}">
          <div class="alert-card-num">${myReplenish.length}</div>
          <div class="alert-card-label">需补订单</div>
        </div>
        <div class="alert-card ok">
          <div class="alert-card-num">${filled}/${myData.length}</div>
          <div class="alert-card-label">已填写</div>
        </div>
      </div>`;
    $('#purchase-alerts').innerHTML = html;
  },

  editingRow: null,
  startEdit(rowIdx, field, cell) {
    if (this.editingRow !== null) return;
    this.editingRow = rowIdx;
    const pageData = getPageData(this.filteredData, this.currentPage);
    const row = pageData[rowIdx];
    if (!row) return;
    const oldVal = row[field] || '';
    const ftype = FIELD_TYPES[field] || 'text';
    // 文本/数量/日期 不同的 input type + 提示
    let inputHtml;
    if (ftype === 'number') {
      inputHtml = `<input class="edit-input" type="number" value="${escapeHtml(oldVal)}" data-field="${field}" placeholder="数字" style="text-align:right">`;
    } else if (ftype === 'date') {
      inputHtml = `<input class="edit-input" type="text" value="${escapeHtml(oldVal)}" data-field="${field}" placeholder="填写后统一显示为 2026/8/7">`;
    } else {
      inputHtml = `<input class="edit-input" type="text" value="${escapeHtml(oldVal)}" data-field="${field}" placeholder="文本">`;
    }
    cell.innerHTML = inputHtml;
    const input = cell.querySelector('input');
    input.focus(); input.select();
    input.addEventListener('blur', () => {
      const check = validateFieldInput(field, input.value);
      if (!check.ok) {
        showToast('校验失败：' + check.msg, 'error');
        this.editingRow = null;
        this.renderSupplier();
        return;
      }
      this.saveEdit(row, field, oldVal, check.normalized);
      this.editingRow = null;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { cell.textContent = oldVal; this.editingRow = null; }
    });
  },

  saveEdit(row, field, oldVal, newVal) {
    const all = Store.getData('supplier');
    const idx = all.findIndex(r => r._row === row._row && normalizeText(r.channelSku) === normalizeText(row.channelSku) && normalizeText(r.supplier) === normalizeText(row.supplier));
    if (idx === -1) return;
    all[idx][field] = newVal;
    Store.setData('supplier', all);
    if (String(oldVal) !== String(newVal)) {
      Store.addHistory({ user: this.userName, role: 'purchase', action: '编辑字段', detail: `${row.channelSku}/${field}: "${oldVal}"→"${newVal}"` });
    }
    this.renderSupplier(); this.renderAlerts(); this.renderNagCount();
  },

  async batchUploadDates(file) {
    if (!file) return;
    try {
      const wb = await ExcelParser.readWorkbook(file);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = ExcelParser.getRows(sheet);
      if (rows.length < 2) { showToast('文件无数据', 'error'); return; }
      const hi = ExcelParser.detectHeaderRow(rows);
      const headers = rows[hi].map(c => normalizeText(c));

      // 用“导出列定义”建立表头->字段的映射，导出和上传使用同一份列名
      const headerToField = {};
      PURCHASE_TRACKING_EXPORT_COLS.forEach(c => { headerToField[normalizeText(c.l)] = c.f; });
      // 兜底：兼容老模板/旧列名
      const extraAliases = {
        '9月可交': 'sepDeliverable', '9月待交付箱单交期': 'sepDeliveryDate', '9月备注': 'sepRemark',
        '10月可交': 'octDeliverable', '10月待交付箱单交期': 'octDeliveryDate', '10月备注': 'octRemark',
        '渠道sku': 'channelSku', 'sku': 'channelSku',
      };
      Object.entries(extraAliases).forEach(([h, f]) => { headerToField[normalizeText(h)] = f; });

      // 匹配列位置：SKU、供应商、采购员（采购员缺失时默认当前账号）
      const skuIdx = headers.findIndex(h => h === normalizeText('SKU') || h === normalizeText('渠道SKU') || h === normalizeText('渠道 SKU'));
      const supIdx = headers.findIndex(h => h === normalizeText('供应商'));
      const buyerIdx = headers.findIndex(h => h === normalizeText('采购员'));
      if (skuIdx === -1 || supIdx === -1) { showToast('Excel 缺少 SKU 或 供应商 列，无法匹配', 'error'); return; }

      const allSupplier = Store.getData('supplier');
      let updatedRows = 0, updatedFields = 0, skipped = 0;
      const monthForField = (f) => f.startsWith('sep') ? 9 : (f.startsWith('oct') ? 10 : 8);

      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r.some(c => c !== '')) continue;
        const sku = String(r[skuIdx] || '').trim();
        const supplier = String(r[supIdx] || '').trim();
        const buyer = buyerIdx >= 0 ? String(r[buyerIdx] || '').trim() : this.userName;
        if (!sku || !supplier) { skipped++; continue; }

        const match = allSupplier.findIndex(s =>
          normalizeText(s.channelSku) === normalizeText(sku) &&
          normalizeText(s.supplier) === normalizeText(supplier) &&
          normalizeText(String(s.buyer || '')) === normalizeText(buyer || this.userName));
        if (match === -1) { skipped++; continue; }

        let rowChanged = false;
        headers.forEach((h, idx) => {
          const field = headerToField[h];
          if (!field) return;
          const val = r[idx];
          if (val === undefined || val === null || String(val).trim() === '') return;
          const newVal = field.endsWith('Date') ? excelDateToText(val, monthForField(field)) : val;
          if (String(allSupplier[match][field] || '') !== String(newVal || '')) {
            allSupplier[match][field] = newVal;
            updatedFields++;
            rowChanged = true;
          }
        });
        if (rowChanged) updatedRows++;
      }

      await Store.setData('supplier', allSupplier);
      // 显式 push 到云端：采购员批量填写后必须同步给其他电脑，不受“同步选择”勾选影响
      let cloudMsg = '';
      if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
        try {
          await Sync.push('supplier', allSupplier);
          cloudMsg = '，已同步云端';
        } catch (e) {
          console.warn('[PurchaseUI] 批量上传云端同步失败', e);
          cloudMsg = '，云端同步失败（已保留本地）';
        }
      }
      Store.addHistory({ user: this.userName, role: 'purchase', action: '批量上传交期', detail: `更新 ${updatedRows} 行 / ${updatedFields} 字段，跳过 ${skipped}` });
      this.renderSupplier(); this.renderAlerts();
      showToast(`批量更新：${updatedRows} 行${cloudMsg}`);
    } catch (err) { showToast('上传失败：' + err.message, 'error'); }
  }
};

// ===== 计划界面 =====
// ===== 通用表头多选筛选（状态/优先级/负责人/采购员等文本列）=====
// idPrefix: 'plan' / 'op'；filterDefs: [{ col, prop, field, label }]
function headerMultiSelectMixin(idPrefix, filterDefs, renderFnName, managerField) {
  const mixin = {};
  filterDefs.forEach(d => { mixin[d.prop] = new Set(); });
  mixin._multiFilterCols = filterDefs.map(d => d.col);

  mixin._hmGetSourceData = function () {
    let data = Merger.getMergedData();
    // 非管理员必须只看自己名下的数据：myData 为空时也要用空集，
    // 否则（旧写法 if (myData.length > 0) data = myData）名下无数据的账号会看到全量数据 —— 权限逃逸。
    if (!this.isAdmin && this.userName && managerField) {
      data = data.filter(r => nameMatches(r[managerField], this.userName));
    }
    return data;
  };

  mixin._hmFilterPanelOptions = function (col, q) {
    const list = document.getElementById(`${idPrefix}-${col}-list`);
    if (!list) return;
    const term = (q || '').trim().toLowerCase();
    // 搜索时始终保留“全部”选项，只过滤普通选项
    list.querySelectorAll('label:not(.excel-filter-all)').forEach(lbl => {
      const txt = (lbl.textContent || '').toLowerCase();
      lbl.style.display = (!term || txt.includes(term)) ? '' : 'none';
    });
  };

  mixin._hmUpdateHeaderState = function (col, uiName) {
    const def = filterDefs.find(d => d.col === col);
    const active = !!(def && this[def.prop] && this[def.prop].size > 0);
    const btn = document.querySelector(`button[data-header-filter="${uiName}-${col}"]`);
    if (btn) {
      if (active) btn.classList.add('col-filter-active');
      else btn.classList.remove('col-filter-active');
    }
  };

  mixin._hmClosePanel = function (col) {
    const panel = document.getElementById(`${idPrefix}-${col}-panel`);
    if (panel) panel.style.display = 'none';
  };

  mixin._hmRenderPanel = function (col) {
    const def = filterDefs.find(d => d.col === col);
    if (!def) return null;
    let data = this._hmGetSourceData();
    // 显示名称筛选选项必须与主表取值同源：主表(getDeliveryBasedData)显示名称优先取发货明细，
    // 故选项也用 getDeliveryBasedData 的 displayName（且为全量、不受权限过滤），
    // 否则选项与主表命名不一致会导致筛选大量失配、行数骤减。
    // 无 getDeliveryBasedData 的视图（如旧 OperationUI/PlanUI）回退到供应商表，保持原行为。
    if (def.field === 'displayName') {
      try {
        // PurchaseUI 有 getDeliveryBasedData，优先用它保证与主表同源；
        // OperationUI/PlanUI 没有该方法，继续用当前 data（Merger.getMergedData 的全量/权限后数据），
        // 不要回退到 Store.getData('supplier')（supplier 表 displayName 常为空，会导致选项只有“空白”）。
        const base = (typeof this.getDeliveryBasedData === 'function') ? this.getDeliveryBasedData() : data;
        data = base.map(r => ({ ...r, displayName: r.displayName || r['ns名称'] || r['NS名称'] || r.category || rowCategoryOf(r) || '' }));
      } catch (e) {}
    }
    const rawVals = data.map(r => r[def.field]);
    const hasBlank = rawVals.some(v => v == null || String(v).trim() === '');
    const values = [...new Set(rawVals.filter(v => v != null && String(v).trim() !== '').map(v => String(v).trim()))].sort();
    const selected = this[def.prop] || new Set();
    const allChecked = selected.size === 0;
    const panelId = `${idPrefix}-${col}-panel`;
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'excel-filter-panel';
      panel.style.display = 'none';
      panel.setAttribute('onclick', 'event.stopPropagation()');
      document.body.appendChild(panel);
    }
    const listId = `${idPrefix}-${col}-list`;
    const uiName = ({ plan: 'PlanUI', op: 'OperationUI', purchase: 'PurchaseUI' })[idPrefix] || idPrefix;
    panel.innerHTML = `
      <div class="excel-filter-header"><span>${escapeHtml(def.label)} 筛选</span><button type="button" class="btn-sm" onclick="event.stopPropagation(); ${uiName}.clearMultiFilter('${col}')">清空</button></div>
      <div class="excel-filter-search">
        <input type="text" id="${idPrefix}-${col}-search" placeholder="搜索选项…" autocomplete="off">
      </div>
      <div class="excel-filter-checklist" id="${listId}">
        <label class="excel-filter-all"><input type="checkbox" data-action="all" ${allChecked ? 'checked' : ''}> 全部</label>
        ${hasBlank ? `<label><input type="checkbox" value="__BLANK__" ${selected.has('__BLANK__') ? 'checked' : ''}> <span class="excel-filter-blank">（空白/未填写）</span></label>` : ''}
        ${values.map(v => {
          const checked = selected.has(v) ? 'checked' : '';
          return `<label><input type="checkbox" value="${escapeHtml(v)}" ${checked}> ${escapeHtml(v)}</label>`;
        }).join('')}
      </div>
      <div class="excel-filter-actions"><button type="button" class="btn-primary btn-sm" onclick="event.stopPropagation(); ${uiName}._hmClosePanel('${col}')">确定</button></div>
    `;
    const searchInput = panel.querySelector(`#${idPrefix}-${col}-search`);
    if (searchInput) searchInput.addEventListener('input', () => this._hmFilterPanelOptions(col, searchInput.value));
    const allCb = panel.querySelector('input[data-action="all"]');
    const cbs = panel.querySelectorAll(`#${listId} input[type="checkbox"]:not([data-action="all"])`);
    allCb.addEventListener('change', () => {
      this[def.prop] = new Set();
      cbs.forEach(cb => cb.checked = false);
      this[renderFnName]();
      this._hmUpdateHeaderState(col, uiName);
    });
    cbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const set = new Set(this[def.prop]);
        if (cb.checked) set.add(cb.value); else set.delete(cb.value);
        this[def.prop] = set;
        allCb.checked = set.size === 0;
        this[renderFnName]();
        this._hmUpdateHeaderState(col, uiName);
      });
    });
    return panel;
  };

  mixin.openMultiFilterPanel = function (btn, col) {
    const panel = this._hmRenderPanel(col);
    if (!panel) return;
    fitFilterPanel(panel, btn);
    // 鼠标移开弹框自动消失；但如果搜索框正在输入（有焦点），则不关闭，避免打断输入
    panel.onmouseleave = () => {
      const search = document.getElementById(`${idPrefix}-${col}-search`);
      if (search && search === document.activeElement) return;
      panel.style.display = 'none'; panel.onmouseleave = null;
    };
  };

  mixin.applyMultiFilters = function (data) {
    filterDefs.forEach(d => {
      const selected = this[d.prop];
      if (selected && selected.size > 0) {
        const set = new Set(selected);
        const wantBlank = set.has('__BLANK__');
        set.delete('__BLANK__');
        data = data.filter(r => {
          const raw = r[d.field];
          const isBlank = raw == null || String(raw).trim() === '';
          if (isBlank) return wantBlank;
          // 只选了“空白”时，非空白行应排除；同时选项值与数据值均用原始文本比较（避免 escapeHtml 导致 &<>" 不匹配）
          if (set.size === 0) return false;
          return set.has(String(raw).trim());
        });
      }
    });
    return data;
  };

  mixin.clearMultiFilter = function (col) {
    const def = filterDefs.find(d => d.col === col);
    if (def) this[def.prop] = new Set();
    this._hmClosePanel(col);
    this[renderFnName]();
    const uiName = ({ plan: 'PlanUI', op: 'OperationUI', purchase: 'PurchaseUI' })[idPrefix] || idPrefix;
    this._hmUpdateHeaderState(col, uiName);
  };

  mixin.clearAllMultiFilters = function () {
    filterDefs.forEach(d => this[d.prop] = new Set());
    this[renderFnName]();
  };

  return mixin;
}

// ===== 通用 Excel 数值筛选（计划/运营复用，采购页逻辑同构）=====
// idPrefix: 元素 id 前缀（'plan' / 'op'）；filterDefs: 筛选列定义；renderFnName: 应用后重渲染的方法名
// 统一的数字筛选面板 HTML（主表格与需补订单共用）：分段式运算符 + 数字输入框
// opHandler/applyHandler/clearHandler 为可点击时调用的函数名片段（如 'PlanUI.setFilterOp'）
function buildNumericFilterHtml(prefix, which, opHandler, applyHandler, clearHandler, currentOp, v1, v2) {
  const ops = [['all', '全部'], ['gt', '大于'], ['lt', '小于'], ['eq', '等于'], ['between', '介于']];
  const opBtns = ops.map(([op, label]) =>
    `<button type="button" class="nf-op-btn${op === currentOp ? ' active' : ''}" data-op="${op}" onclick="${opHandler}('${which}','${op}')">${label}</button>`
  ).join('');
  const showInputs = currentOp && currentOp !== 'all';
  const showBetween = currentOp === 'between';
  return ''
    + `<div class="nf-op-group" id="${prefix}-${which}-ops">${opBtns}</div>`
    + `<div class="nf-inputs" id="${prefix}-${which}-inputs" style="display:${showInputs ? 'flex' : 'none'}">`
    +   `<input type="number" id="${prefix}-${which}-v1" class="nf-input" placeholder="输入数值" value="${v1 != null ? v1 : ''}" onkeydown="if(event.key==='Enter')${applyHandler}('${which}')">`
    +   `<span class="nf-and" id="${prefix}-${which}-and" style="display:${showBetween ? 'inline' : 'none'}">至</span>`
    +   `<input type="number" id="${prefix}-${which}-v2" class="nf-input" placeholder="输入数值" value="${v2 != null ? v2 : ''}" style="display:${showBetween ? 'inline-block' : 'none'}" onkeydown="if(event.key==='Enter')${applyHandler}('${which}')">`
    + `</div>`
    + `<div class="nf-actions">`
    +   `<button type="button" class="btn-sm nf-clear" onclick="${clearHandler}">清空</button>`
    +   `<button type="button" class="btn-primary btn-sm" onclick="${applyHandler}('${which}')">确定</button>`
    + `</div>`;
}

function numericFilterMixin(idPrefix, filterDefs, renderFnName) {
  const mixin = {};
  filterDefs.forEach(d => { mixin[d.prop] = null; });
  mixin._numericFilterCols = filterDefs.map(d => d.col);

  mixin._nfToNum = function (v) {
    const s = String(v == null ? '' : v).replace(/,/g, '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  mixin._nfMatches = function (rowVal, filter) {
    if (!filter || filter.op === 'all') return true;
    const a = this._nfToNum(rowVal);
    if (a === null) return false;
    const v1 = parseFloat(filter.v1);
    if (isNaN(v1)) return false;
    switch (filter.op) {
      case 'eq': return a === v1;
      case 'neq': return a !== v1;
      case 'gt': return a > v1;
      case 'lt': return a < v1;
      case 'gte': return a >= v1;
      case 'lte': return a <= v1;
      case 'between': {
        const v2 = parseFloat(filter.v2);
        if (isNaN(v2)) return false;
        return Math.min(v1, v2) <= a && a <= Math.max(v1, v2);
      }
      default: return true;
    }
  };
  // 在已有的文本/下拉筛选链之后调用，返回数值筛选后的数据
  mixin.applyNumericFilters = function (data) {
    filterDefs.forEach(d => {
      const flt = this[d.prop];
      if (flt && flt.op !== 'all') data = data.filter(r => this._nfMatches(r[d.field], flt));
    });
    return data;
  };
  // 自动创建数值筛选面板（若不存在）：让表头 ▼ 在缺少预置 HTML 面板时也能正常工作，
  // 彻底消除“点表头筛选没反应”的问题（如采购页 202609/09/10目标、9月现货箱单 等未预置面板的列）。
  mixin.ensureFilterPanel = function (which) {
    const panelId = idPrefix + '-' + which + '-panel';
    let panel = document.getElementById(panelId);
    const def = filterDefs.find(d => d.col === which);
    if (!def) return null;
    const uiName = ({ plan: 'PlanUI', op: 'OperationUI', purchase: 'PurchaseUI' })[idPrefix] || idPrefix;
    const current = this[def.prop] || { op: 'all' };
    const html = buildNumericFilterHtml(
      idPrefix, which,
      uiName + '.setFilterOp',
      uiName + '.applyFilter',
      uiName + ".clearFilter('" + which + "')",
      current.op, current.v1, current.v2
    );
    if (panel) {
      // 关键修复：如果 index.html 里还残留旧版预置面板（如下拉菜单式"等于(E)..."），
      // 直接替换成统一的新按钮式 HTML，让计划/运营页和采购页完全一致。
      panel.innerHTML = html;
      panel.dataset.op = current.op;
      return panel;
    }
    panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'excel-filter-panel';
    panel.style.display = 'none';
    panel.setAttribute('onclick', 'event.stopPropagation()');
    panel.innerHTML = html;
    panel.dataset.op = current.op;
    document.body.appendChild(panel);
    return panel;
  };
  mixin.toggleFilterPanel = function (which) {
    const panel = this.ensureFilterPanel(which);
    if (!panel) return;
    const willOpen = panel.style.display === 'none';
    document.querySelectorAll('.excel-filter-panel').forEach(p => p.style.display = 'none');
    if (willOpen) {
      panel.style.display = 'block';
      const def = filterDefs.find(d => d.col === which);
      const filter = def ? this[def.prop] : null;
      const op = filter ? filter.op : 'all';
      if (filter) {
        this._nfSetInputs(which, op);
        const v1 = document.getElementById(idPrefix + '-' + which + '-v1');
        const v2 = document.getElementById(idPrefix + '-' + which + '-v2');
        if (v1) v1.value = filter.v1 ?? '';
        if (v2) v2.value = filter.v2 ?? '';
      } else {
        this._nfSetInputs(which, 'all');
      }
      panel.querySelectorAll('.nf-op-btn').forEach(b => b.classList.toggle('active', b.dataset.op === op));
    }
  };
  mixin.setFilterOp = function (which, op) {
    const panel = document.getElementById(idPrefix + '-' + which + '-panel');
    if (panel) {
      panel.dataset.op = op;
      panel.querySelectorAll('.nf-op-btn').forEach(b => b.classList.toggle('active', b.dataset.op === op));
    }
    this._nfSetInputs(which, op);
    if (op === 'all') this.applyFilter(which);
  };
  mixin._nfSetInputs = function (which, op) {
    const inputsWrap = document.getElementById(idPrefix + '-' + which + '-inputs');
    const v1 = document.getElementById(idPrefix + '-' + which + '-v1');
    const v2 = document.getElementById(idPrefix + '-' + which + '-v2');
    const and = document.getElementById(idPrefix + '-' + which + '-and');
    if (!inputsWrap) return;
    inputsWrap.style.display = op === 'all' ? 'none' : 'flex';
    if (v2) v2.style.display = op === 'between' ? 'inline-block' : 'none';
    if (and) and.style.display = op === 'between' ? 'inline' : 'none';
    if (v1) v1.focus();
  };
  mixin.applyFilter = function (which) {
    const panel = document.getElementById(idPrefix + '-' + which + '-panel');
    let op = panel?.dataset?.op || 'all';
    const v1Raw = (document.getElementById(idPrefix + '-' + which + '-v1')?.value || '').trim();
    const v2Raw = (document.getElementById(idPrefix + '-' + which + '-v2')?.value || '').trim();
    // 容错：用户只填了数值却没选运算符时，默认按“等于”处理，避免点击确定后“没反应”
    if (op === 'all' && v1Raw !== '') op = 'eq';
    const f = op === 'all' ? null : { op, v1: v1Raw === '' ? null : parseFloat(v1Raw.replace(/,/g, '')), v2: v2Raw === '' ? null : parseFloat(v2Raw.replace(/,/g, '')) };
    const def = filterDefs.find(d => d.col === which);
    if (def) this[def.prop] = f;
    if (panel) panel.style.display = 'none';
    this[renderFnName]();
  };
  mixin.clearFilter = function (which) {
    const def = filterDefs.find(d => d.col === which);
    if (def) this[def.prop] = null;
    const panel = document.getElementById(idPrefix + '-' + which + '-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.dataset.op = 'all';
      panel.querySelectorAll('.nf-op-btn').forEach(b => b.classList.toggle('active', b.dataset.op === 'all'));
    }
    this[renderFnName]();
  };
  mixin.renderFilterStates = function () {
    const labelMap = { all: '全部', eq: '等于', neq: '不等于', gt: '大于', lt: '小于', gte: '大于等于', lte: '小于等于', between: '介于' };
    const fmt = f => {
      if (!f || f.op === 'all') return '全部';
      const sym = labelMap[f.op] || f.op;
      if (f.op === 'between') return sym + ' ' + (f.v1 ?? '') + '~' + (f.v2 ?? '');
      return sym + ' ' + (f.v1 ?? '');
    };
    filterDefs.forEach(d => {
      const el = document.getElementById(idPrefix + '-' + d.col + '-state');
      if (el) el.textContent = fmt(this[d.prop]);
    });
  };
  return mixin;
}

const PlanUI = {
  userName: '', currentPage: 0, filteredData: [], isAdmin: false,

  init(userName) {
    this.userName = userName;
    this.isAdmin = isRoleAdmin('plan', userName);
    this.currentPage = 0;
    // 切换账号时重置数值筛选和多选表头筛选，避免继承上一个账号的筛选状态
    this.augTargetFilter = null; this.deliveryQtyFilter = null; this.remainingDeliveryFilter = null;
    PLAN_MULTI_FILTERS.forEach(d => this[d.prop] = new Set());
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    $('#plan-username').innerHTML = escapeHtml(userName) + badge;
    this.renderLastUpdate();
    // 异步渲染主表格，避免进入工作台时长时间白屏
    requestAnimationFrame(() => { this.renderOverview(); this.renderAlerts(); this.renderBuyerUnfilled(); });
  },

  // 自动刷新专用：只重渲染数据，保留当前页码/搜索/筛选状态
  refresh() {
    if (!this.userName) return;
    this.isAdmin = isRoleAdmin('plan', this.userName);
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    $('#plan-username') && ($('#plan-username').innerHTML = escapeHtml(this.userName) + badge);
    this.renderOverview();
    this.renderAlerts();
    this.renderLastUpdate();
    this.renderBuyerUnfilled();
  },

  renderLastUpdate() {
    const el = $('#plan-last-update');
    if (el) el.textContent = '数据更新: ' + Store.getLastUpdateText();
  },


  renderBuyerFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.planManager, this.userName));
    // priorityBuyer 字段可能本身是 "a, b" 形式，渲染选项时需拆分后再去重，避免同一人名出现多次
    const buyers = [...new Set(source.flatMap(r => String(r.priorityBuyer || '').split(/[,，、\/\n]/).map(x => x.trim()).filter(Boolean)))].sort();
    this.buyerOptions = new Set(buyers);
    const input = $('#plan-search-buyer');
    const list = $('#plan-search-buyer-list');
    const cur = input?.value || '';
    if (list) list.innerHTML = buyers.map(n => `<option value="${escapeHtml(n)}">`).join('');
    if (input) {
      if (cur && !this.buyerOptions.has(cur)) { input.value = ''; }
    }
  },

  renderPlanManagerFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.planManager, this.userName));
    const managers = [...new Set(source.map(r => r.planManager).filter(Boolean))].sort();
    this.planManagerOptions = new Set(managers);
    const input = $('#plan-search-planmanager');
    const list = $('#plan-search-planmanager-list');
    const cur = input?.value || '';
    if (list) list.innerHTML = managers.map(n => `<option value="${escapeHtml(n)}">`).join('');
    if (input) {
      if (cur && !this.planManagerOptions.has(cur)) { input.value = ''; }
    }
  },

  renderCategoryFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.planManager, this.userName));
    const categories = [...new Set(source.map(r => rowCategoryOf(r)).filter(Boolean))].sort();
    MultiSelectUI.setOptions('plan-category-multi', categories);
  },

  renderStatusFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => normalizeText(r.planManager) === normalizeText(this.userName));
    const statuses = [...new Set(source.map(r => r.salesStatus).filter(Boolean))].sort();
    const sel = $('#plan-filter-status');
    const cur = sel?.value || '';
    if (sel) {
      sel.innerHTML = '<option value="">全部状态</option>' + statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  },

  renderPriorityFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => normalizeText(r.planManager) === normalizeText(this.userName));
    const priorities = [...new Set(source.map(r => r.priority).filter(Boolean))].sort();
    const sel = $('#plan-filter-priority');
    const cur = sel?.value || '';
    if (sel) {
      sel.innerHTML = '<option value="">全部优先级</option>' + priorities.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  },

  renderOverview() {
    let data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时结果为空（不能回退全量，否则权限逃逸）
    if (!this.isAdmin) data = data.filter(r => nameMatches(r.planManager, this.userName));

    // SKU搜索
    const skuSearch = ($('#plan-search-sku')?.value || '').trim();
    if (skuSearch) data = data.filter(r => normalizeText(r.channelSku).includes(normalizeText(skuSearch)));
    // 批量 SKU 搜索（或关系，精确匹配）
    if (this.skuBatchSet && this.skuBatchSet.size > 0) {
      data = data.filter(r => this.skuBatchSet.has(normalizeText(r.channelSku)));
    }

    // 表头多选筛选（状态/优先级/计划负责人/采购员/显示名称）
    data = this.applyMultiFilters(data);

    // Excel 数值筛选（9月目标/交付数量/剩余交付）
    data = this.applyNumericFilters(data);

    // 排序：正常优先
    data = Merger.sortByStatus(data);
    this.filteredData = data;
    this.currentPage = Math.min(this.currentPage, Math.ceil(data.length / PAGE_SIZE) - 1);
    if (this.currentPage < 0) this.currentPage = 0;

    const pageData = getPageData(data, this.currentPage);
    const html = renderExpandableTable(COLS.plan, pageData, {
      offset: this.currentPage * PAGE_SIZE, expandPrefix: 'plan', role: 'plan',
      clickHandler: 'PlanUI.showBuyerDetails', headerFilterUI: 'PlanUI'
    });
    setTableHTML('plan-table', html);
    renderPagination('plan-pagination', data.length, this.currentPage, 'PlanUI.goToPage');
    this.renderFilterStates();
    PLAN_MULTI_FILTERS.forEach(d => this._hmUpdateHeaderState(d.col, 'PlanUI'));
  },

  goToPage(page) { this.currentPage = page; this.renderOverview(); },

  clearBuyerFilter() {
    const input = $('#plan-search-buyer');
    if (input) input.value = '';
    this.renderOverview();
  },

  clearPlanManagerFilter() {
    const input = $('#plan-search-planmanager');
    if (input) input.value = '';
    this.renderOverview();
  },

  clearSkuFilter() {
    const input = $('#plan-search-sku');
    if (input) { input.value = ''; input.placeholder = '🔍 搜索SKU'; }
    this.skuBatchSet = new Set();
    this.renderOverview();
  },

  showBuyerDetails(channelSku, buyerName) { OperationUI.showBuyerDetails(channelSku, buyerName); },

  renderAlerts() {
    const supplierData = Store.getData('supplier');
    const merged = Merger.getMergedData();
    const alerts = [];
    const unfilled = supplierData.filter(r => !r.sepDeliveryDate);
    if (unfilled.length > 0) {
      const buyers = [...new Set(unfilled.map(r => r.buyer).filter(Boolean))];
      alerts.push(`<span class="alert-item danger">⚠️ 交期未填写: ${unfilled.length} 条（${buyers.length}个采购员）</span>`);
    }
    const shortage = merged.filter(r => { const d = parseFloat(r.availableDays); return !isNaN(d) && d < 14; });
    if (shortage.length > 0) alerts.push(`<span class="alert-item danger">🔴 缺货预警: ${shortage.length} 个SKU可售<14天</span>`);
    const replenish = Store.getData('replenish');
    const replenishCount = replenish.filter(r => r.buyer).length;
    if (replenish.length > 0) alerts.push(`<span class="alert-item warn">📝 需补订单: ${replenish.length} 条</span>`);
    if (supplierData.length > 0) alerts.push(`<span class="alert-item success">✓ 交期已填: ${supplierData.length - unfilled.length}/${supplierData.length}</span>`);
    $('#plan-alerts').innerHTML = alerts.join('') || '<span style="color:var(--text-muted);font-size:13px;padding:6px 14px">暂无预警</span>';

    // 采购交期未填数量框
    this.renderBuyerUnfilled();
  },

  renderBuyerUnfilled() {
    const supplierData = Store.getData('supplier');
    const unfilled = supplierData.filter(r => !r.sepDeliveryDate);
    const byBuyer = {};
    unfilled.forEach(r => {
      const b = String(r.buyer || '').trim();
      if (b) byBuyer[b] = (byBuyer[b] || 0) + 1;
    });
    const el = $('#plan-buyer-unfilled');
    if (!el) return;
    const entries = Object.entries(byBuyer).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '<span style="font-size:12px;color:var(--text-muted);margin-right:4px">📋 采购交期未填:</span>' +
      entries.map(([name, count]) => `<span class="buyer-unfilled-chip">${escapeHtml(name)} <span class="count">${count}</span></span>`).join('');
  }
};

// ===== 运营界面 =====
const OperationUI = {
  userName: '', currentPage: 0, filteredData: [],

  init(userName) {
    this.userName = userName;
    this.isAdmin = isRoleAdmin('operation', userName);
    this.currentPage = 0;
    // 切换账号时重置数值筛选和多选表头筛选，避免继承上一个账号的筛选状态
    this.augTargetFilter = null; this.deliveryQtyFilter = null; this.remainingDeliveryFilter = null;
    OP_MULTI_FILTERS.forEach(d => this[d.prop] = new Set());
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    $('#op-username').innerHTML = escapeHtml(userName) + badge;
    this.renderChannelFilter();
    this.renderLastUpdate();
    renderOperationAnnouncement();
    // 异步渲染主表格，避免进入工作台时长时间白屏
    requestAnimationFrame(() => { this.renderTable(); });
  },

  // 自动刷新专用：只重渲染数据，保留当前页码/搜索/筛选状态
  refresh() {
    if (!this.userName) return;
    this.isAdmin = isRoleAdmin('operation', this.userName);
    const badge = this.isAdmin ? ` <span class="admin-badge">管理员</span>` : '';
    $('#op-username') && ($('#op-username').innerHTML = escapeHtml(this.userName) + badge);
    this.renderTable();
    this.renderLastUpdate();
    renderOperationAnnouncement();
  },


  renderOpManagerFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.opManager, this.userName));
    const managers = [...new Set(source.map(r => r.opManager).filter(Boolean))].sort();
    this.opManagerOptions = new Set(managers);
    const input = $('#op-search-opmanager');
    const list = $('#op-search-opmanager-list');
    const cur = input?.value || '';
    if (list) list.innerHTML = managers.map(n => `<option value="${escapeHtml(n)}">`).join('');
    if (input) {
      if (cur && !this.opManagerOptions.has(cur)) { input.value = ''; }
    }
  },

  renderCategoryFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.opManager, this.userName));
    const categories = [...new Set(source.map(r => rowCategoryOf(r)).filter(Boolean))].sort();
    MultiSelectUI.setOptions('op-category-multi', categories);
  },

  renderLastUpdate() {
    const el = $('#op-last-update');
    if (el) el.textContent = '数据更新: ' + Store.getLastUpdateText();
  },

  renderChannelFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const channels = [...new Set((this.isAdmin ? data : data.filter(r => nameMatches(r.opManager, this.userName))).map(r => r.channel).filter(Boolean))];
    const sel = $('#op-filter-channel');
    const cur = sel?.value || '';
    if (sel) {
      sel.innerHTML = '<option value="">全部渠道</option>' + channels.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  },

  renderStatusFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.opManager, this.userName));
    const statuses = [...new Set(source.map(r => r.salesStatus).filter(Boolean))].sort();
    const sel = $('#op-filter-status');
    const cur = sel?.value || '';
    if (sel) {
      sel.innerHTML = '<option value="">全部状态</option>' + statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  },

  renderPriorityFilter() {
    const data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时选项为空（不回退全量，避免权限逃逸）
    const source = this.isAdmin ? data : data.filter(r => nameMatches(r.opManager, this.userName));
    const priorities = [...new Set(source.map(r => r.priority).filter(Boolean))].sort();
    const sel = $('#op-filter-priority');
    const cur = sel?.value || '';
    if (sel) {
      sel.innerHTML = '<option value="">全部优先级</option>' + priorities.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  },

  renderTable() {
    let data = Merger.getMergedData();
    // 非管理员只看自己名下的行；名下无数据时结果为空（不能回退全量，否则权限逃逸）
    if (!this.isAdmin) data = data.filter(r => nameMatches(r.opManager, this.userName));

    const channelFilter = $('#op-filter-channel')?.value || '';
    if (channelFilter) data = data.filter(r => r.channel === channelFilter);

    // SKU搜索
    const skuSearch = ($('#op-search-sku')?.value || '').trim();
    if (skuSearch) data = data.filter(r => normalizeText(r.channelSku).includes(normalizeText(skuSearch)));
    // 批量 SKU 搜索（或关系，精确匹配）
    if (this.skuBatchSet && this.skuBatchSet.size > 0) {
      data = data.filter(r => this.skuBatchSet.has(normalizeText(r.channelSku)));
    }

    // 表头多选筛选（状态/优先级/运营负责人/采购员）
    data = this.applyMultiFilters(data);

    // Excel 数值筛选（9月目标/交付数量/剩余交付）
    data = this.applyNumericFilters(data);

    // 排序：正常优先 + 可售天数降序（整行排序，天数多的排前面）
    data = Merger.sortByStatus(data);
    data = data.sort((a, b) => {
      const aNormal = normalizeText(a.salesStatus).includes('正常') ? 0 : 1;
      const bNormal = normalizeText(b.salesStatus).includes('正常') ? 0 : 1;
      if (aNormal !== bNormal) return aNormal - bNormal;
      const aDays = parseFloat(a.availableDays);
      const bDays = parseFloat(b.availableDays);
      const aV = isNaN(aDays) ? -1 : aDays;
      const bV = isNaN(bDays) ? -1 : bDays;
      return bV - aV; // 降序：天数多的排前面
    });
    this.filteredData = data;
    this.currentPage = Math.min(this.currentPage, Math.ceil(data.length / PAGE_SIZE) - 1);
    if (this.currentPage < 0) this.currentPage = 0;

    const pageData = getPageData(data, this.currentPage);
    const html = renderExpandableTable(COLS.operation, pageData, {
      offset: this.currentPage * PAGE_SIZE, expandPrefix: 'op', role: 'op',
      clickHandler: 'OperationUI.showBuyerDetails', headerFilterUI: 'OperationUI'
    });
    setTableHTML('operation-table', html);
    renderPagination('operation-pagination', data.length, this.currentPage, 'OperationUI.goToPage');
    this.renderFilterStates();
    OP_MULTI_FILTERS.forEach(d => this._hmUpdateHeaderState(d.col, 'OperationUI'));
  },

  goToPage(page) { this.currentPage = page; this.renderTable(); },

  clearOpManagerFilter() {
    const input = $('#op-search-opmanager');
    if (input) input.value = '';
    this.renderTable();
  },

  clearSkuFilter() {
    const input = $('#op-search-sku');
    if (input) { input.value = ''; input.placeholder = '🔍 搜索SKU'; }
    this.skuBatchSet = new Set();
    this.renderTable();
  },

  showBuyerDetails(channelSku, buyerName) {
    if (!channelSku && !buyerName) return;
    const supplierData = Store.getData('supplier');
    const supplyList = Store.getData('supply');
    const whitelist = Store.getData('whitelist');
    const skuNorm = normalizeText(channelSku);
    const supplierRows = supplierData.filter(r => normalizeText(r.channelSku) === skuNorm);
    const supplyRows = supplyList.filter(r => normalizeText(r.channelSku) === skuNorm);

    let body = `<p style="margin-bottom:12px;color:var(--text-muted)">SKU: <strong>${escapeHtml(channelSku)}</strong>`;
    if (buyerName) body += ` | 采购负责人: <strong>${escapeHtml(buyerName)}</strong>`;
    body += '</p>';

    body += '<h4>供应商追踪 - 工厂/采购员明细</h4>';
    if (supplierRows.length > 0) {
      body += '<div class="table-scroll"><table class="data-table"><thead><tr><th>供应商</th><th>采购员</th><th>9月可交</th><th>9月交期</th><th>10月可交</th><th>10月交期</th></tr></thead><tbody>';
      supplierRows.forEach(r => {
        body += `<tr><td>${escapeHtml(r.supplier)}</td><td>${escapeHtml(r.buyer)}</td><td>${escapeHtml(r.sepDeliverable)}</td><td>${escapeHtml(r.sepDeliveryDate)}</td><td>${escapeHtml(r.octDeliverable)}</td><td>${escapeHtml(r.octDeliveryDate)}</td></tr>`;
      });
      body += '</tbody></table></div>';
    } else { body += '<p style="color:var(--text-muted)">暂无数据</p>'; }

    body += '<h4 style="margin-top:20px">供货清单</h4>';
    if (supplyRows.length > 0) {
      body += '<div class="table-scroll"><table class="data-table"><thead><tr><th>SKU</th><th>供应商</th><th>起订量</th><th>品类</th><th>状态</th><th>采购负责人</th><th>后补日期</th></tr></thead><tbody>';
      supplyRows.forEach(r => {
        body += `<tr><td>${escapeHtml(r.channelSku)}</td><td>${escapeHtml(r.supplier)}</td><td>${escapeHtml(r.minOrder || '')}</td><td>${escapeHtml(r.category || '')}</td><td>${escapeHtml(r.supplierStatus || '')}</td><td>${escapeHtml(r.buyer)}</td><td>${escapeHtml(r.backupDate || '')}</td></tr>`;
      });
      body += '</tbody></table></div>';
    } else { body += '<p style="color:var(--text-muted)">暂无数据</p>'; }

    // 白名单信息
    const wlSuppliers = [...new Set([...supplierRows.map(r => r.supplier), ...supplyRows.map(r => r.supplier)].filter(Boolean))];
    if (whitelist.length > 0 && wlSuppliers.length > 0) {
      const wlRows = whitelist.filter(w => wlSuppliers.some(s => normalizeText(s) === normalizeText(w.supplier)));
      if (wlRows.length > 0) {
        body += '<h4 style="margin-top:20px">白名单</h4>';
        body += '<div class="table-scroll"><table class="data-table"><thead><tr><th>供应商</th><th>品类</th><th>采购负责人</th><th>供应商状态</th></tr></thead><tbody>';
        wlRows.forEach(r => {
          body += `<tr><td>${escapeHtml(r.supplier)}</td><td>${escapeHtml(r.category || '')}</td><td>${escapeHtml(r.buyer)}</td><td>${escapeHtml(r.supplierStatus || '')}</td></tr>`;
        });
        body += '</tbody></table></div>';
      }
    }

    Modal.show('SKU: ' + channelSku + ' 的工厂/采购员明细', body);
  }
};

// 计划/运营页接入 Excel 数值筛选（表头触发：9月目标、剩余交付）
const PLAN_OP_NUM_FILTERS = [
  { prop: 'augTargetFilter', col: 'aug-target', field: 'augTarget', label: '9月目标' },
  { prop: 'remainingDeliveryFilter', col: 'remaining-delivery', field: 'remainingDelivery', label: '剩余交付' },
  { prop: 'sepDeliverableFilter', col: 'sep-deliverable', field: 'sepDeliverable', label: '9月可交数量' },
];
Object.assign(PlanUI, numericFilterMixin('plan', PLAN_OP_NUM_FILTERS, 'renderOverview'));
Object.assign(OperationUI, numericFilterMixin('op', PLAN_OP_NUM_FILTERS, 'renderTable'));

// ===== 表头搜索筛选（运营/计划：显示名称/9月交期/采购备注；采购：品类）——可输入关键词实时过滤 =====
// 与多选/数值筛选同构：COLS 声明 filter:'search'，openHeaderFilter 路由到 openSearchFilterPanel
function searchFilterMixin(idPrefix, filterDefs, renderFnName) {
  const mixin = {};
  filterDefs.forEach(d => { mixin[d.prop] = ''; });
  mixin._searchFilterCols = filterDefs.map(d => d.col);
  mixin._searchFilterProps = filterDefs.map(d => d.prop);

  const uiNameOf = () => ({ plan: 'PlanUI', op: 'OperationUI', purchase: 'PurchaseUI' })[idPrefix] || idPrefix;

  mixin.openSearchFilterPanel = function (btn, col) {
    const def = filterDefs.find(d => d.col === col);
    if (!def) return;
    const uiName = uiNameOf();
    const panelId = `${idPrefix}-${col}-panel`;
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'excel-filter-panel';
      panel.style.display = 'none';
      panel.setAttribute('onclick', 'event.stopPropagation()');
      document.body.appendChild(panel);
    }
    const cur = this[def.prop] || '';
    panel.innerHTML = `
      <div class="excel-filter-header"><span>${escapeHtml(def.label)} 搜索</span><button type="button" class="btn-sm" onclick="event.stopPropagation(); ${uiName}.clearSearchFilter('${col}')">清空</button></div>
      <div class="excel-filter-search">
        <input type="text" id="${idPrefix}-${col}-search" placeholder="输入关键词…" value="${escapeHtml(cur)}">
      </div>
      <div class="excel-filter-actions"><button type="button" class="btn-primary btn-sm" onclick="event.stopPropagation(); ${uiName}._searchClosePanel('${col}')">确定</button></div>
    `;
    const input = panel.querySelector(`#${idPrefix}-${col}-search`);
    input.addEventListener('input', () => {
      this[def.prop] = input.value;
      this[renderFnName]();
      this._searchUpdateHeaderState(col, uiName);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._searchClosePanel(col); });
    fitFilterPanel(panel, btn);
    panel.onmouseleave = () => {
      if (input === document.activeElement) return;
      panel.style.display = 'none'; panel.onmouseleave = null;
    };
    setTimeout(() => input.focus(), 0);
  };

  mixin._searchClosePanel = function (col) {
    const panel = document.getElementById(`${idPrefix}-${col}-panel`);
    if (panel) panel.style.display = 'none';
  };

  mixin.applySearchFilters = function (data) {
    filterDefs.forEach(d => {
      const term = (this[d.prop] || '').trim().toLowerCase();
      if (term) data = data.filter(r => String(r[d.field] == null ? '' : r[d.field]).toLowerCase().includes(term));
    });
    return data;
  };

  mixin._searchUpdateHeaderState = function (col, uiName) {
    const def = filterDefs.find(d => d.col === col);
    const active = !!(def && this[def.prop] && (this[def.prop] || '').trim().length > 0);
    const btn = document.querySelector(`button[data-header-filter="${uiName}-${col}"]`);
    if (btn) {
      if (active) btn.classList.add('col-filter-active');
      else btn.classList.remove('col-filter-active');
    }
  };

  mixin.clearSearchFilter = function (col) {
    const def = filterDefs.find(d => d.col === col);
    if (def) this[def.prop] = '';
    const input = document.getElementById(`${idPrefix}-${col}-search`);
    if (input) input.value = '';
    this._searchClosePanel(col);
    this[renderFnName]();
    this._searchUpdateHeaderState(col, uiNameOf());
  };

  mixin.clearAllSearchFilters = function () {
    filterDefs.forEach(d => { this[d.prop] = ''; });
    this[renderFnName]();
  };

  return mixin;
}

// 计划/运营页接入表头多选筛选（状态/优先级/负责人/采购员）
const PLAN_MULTI_FILTERS = [
  { col: 'status', prop: 'statusFilter', field: 'salesStatus', label: '销售状态' },
  { col: 'priority', prop: 'priorityFilter', field: 'priority', label: '优先级' },
  { col: 'channel', prop: 'channelFilter', field: 'channel', label: '渠道' },
  { col: 'name', prop: 'nameFilter', field: 'displayName', label: '显示名称' },
  { col: 'country', prop: 'countryFilter', field: 'country', label: '目的国家' },
  { col: 'plan-manager', prop: 'planManagerFilter', field: 'planManager', label: '计划负责人' },
  { col: 'buyer', prop: 'buyerFilter', field: 'priorityBuyer', label: '采购员' },
  { col: 'plan-is-fba', prop: 'planIsFbaFilter', field: 'isFba', label: '是否FBA' },
  { col: 'plan-is-combo', prop: 'planIsComboFilter', field: 'isCombo', label: '是否组合' },
  { col: 'sep-delivery-date', prop: 'sepDeliveryDateFilter', field: 'sepDeliveryDate', label: '9月交期' },
  { col: 'sep-remark', prop: 'sepRemarkFilter', field: 'sepRemark', label: '9月采购备注' },
];
const OP_MULTI_FILTERS = [
  { col: 'status', prop: 'statusFilter', field: 'salesStatus', label: '销售状态' },
  { col: 'priority', prop: 'priorityFilter', field: 'priority', label: '优先级' },
  { col: 'channel', prop: 'channelFilter', field: 'channel', label: '渠道' },
  { col: 'name', prop: 'nameFilter', field: 'displayName', label: '显示名称' },
  { col: 'country', prop: 'countryFilter', field: 'country', label: '目的国家' },
  { col: 'op-manager', prop: 'opManagerFilter', field: 'opManager', label: '运营负责人' },
  { col: 'buyer', prop: 'buyerFilter', field: 'priorityBuyer', label: '采购员' },
  { col: 'op-is-fba', prop: 'opIsFbaFilter', field: 'isFba', label: '是否FBA' },
  { col: 'op-is-combo', prop: 'opIsComboFilter', field: 'isCombo', label: '是否组合' },
  { col: 'sep-delivery-date', prop: 'sepDeliveryDateFilter', field: 'sepDeliveryDate', label: '9月交期' },
  { col: 'sep-remark', prop: 'sepRemarkFilter', field: 'sepRemark', label: '9月采购备注' },
];
Object.assign(PlanUI, headerMultiSelectMixin('plan', PLAN_MULTI_FILTERS, 'renderOverview', 'planManager'));
Object.assign(OperationUI, headerMultiSelectMixin('op', OP_MULTI_FILTERS, 'renderTable', 'opManager'));

// 采购页接入表头多选筛选（渠道/品类/供应商/目的国家/采购员/供应商状态）
const PURCHASE_MULTI_FILTERS = [
  { col: 'channel', prop: 'channelFilter', field: 'channel', label: '渠道' },
  { col: 'name', prop: 'nameFilter', field: 'displayName', label: '显示名称' },
  { col: 'supplier', prop: 'supplierFilter', field: 'supplier', label: '供应商' },
  { col: 'country', prop: 'countryFilter', field: 'country', label: '目的国家' },
  { col: 'buyer', prop: 'buyerFilter', field: 'buyer', label: '采购员' },
  { col: 'supplier-status', prop: 'supplierStatusFilter', field: 'supplierStatus', label: '供应商状态' },
  { col: 'sup-is-combo', prop: 'supIsComboFilter', field: 'isCombo', label: '是否组合' },
  { col: 'sup-is-fba', prop: 'supIsFbaFilter', field: 'isFba', label: '是否FBA' },
  { col: 'cancel-supplier-stock', prop: 'cancelSupplierStockFilter', field: 'cancelSupplierStock', label: '供应商库存' },
  { col: 'sep-delivery-date', prop: 'sepDeliveryDateFilter', field: 'sepDeliveryDate', label: '9月交期' },
  { col: 'sep-remark', prop: 'sepRemarkFilter', field: 'sepRemark', label: '9月采购备注' },
  { col: 'oct-delivery-date', prop: 'octDeliveryDateFilter', field: 'octDeliveryDate', label: '10月交期' },
  { col: 'oct-remark', prop: 'octRemarkFilter', field: 'octRemark', label: '10月采购备注' },
];
Object.assign(PurchaseUI, headerMultiSelectMixin('purchase', PURCHASE_MULTI_FILTERS, 'renderSupplier'));
// 多选面板选项来源用采购自己的富数据（getMyRichData 中已计算好 categoryDisplay 等派生字段）
PurchaseUI._hmGetSourceData = function () {
  if (typeof this.getMyRichData === 'function') return this.getMyRichData();
  if (typeof this.getMySupplierData === 'function') return this.getMySupplierData();
  return Merger.getMergedData();
};

// 采购页接入表头数值筛选（交付数量/剩余交付/202609-10目标/待交付箱单/现货箱单/9月可交数量/9月目标/9月10月可交数量）
const PURCHASE_NUM_FILTERS = [
  { prop: 'sepTargetSupFilter', col: 'sep-target-sup', field: 'sepTargetSup', label: '202609目标' },
  { prop: 'octTargetSupFilter', col: 'oct-target-sup', field: 'octTargetSup', label: '202610目标' },
  { prop: 'novTargetSupFilter', col: 'nov-target-sup', field: 'novTargetSup', label: '202611目标' },
  { prop: 'pendingComboFilter', col: 'pending-combo', field: 'augPendingBoxCombo', label: '9月待交付箱单-组合配件' },
  { prop: 'pendingFilter', col: 'pending', field: 'augPendingBox', label: '9月待交付箱单' },
  { prop: 'augSpotBoxFilter', col: 'aug-spot-box', field: 'augSpotBox', label: '9月现货箱单' },
  { prop: 'sepDeliverableFilter', col: 'sep-deliverable', field: 'sepDeliverable', label: '9月可交数量' },
  { prop: 'octDeliverableFilter', col: 'oct-deliverable', field: 'octDeliverable', label: '10月可交数量' },
];
Object.assign(PurchaseUI, numericFilterMixin('purchase', PURCHASE_NUM_FILTERS, 'renderSupplier'));

// （原表头搜索筛选已合并进多选筛选：每个多选面板顶部自带搜索框，既可列表勾选也可搜索）

// UI 对象注册表：const 声明的对象不会挂到 window 上，故用注册表让 openHeaderFilter / 内联 onclick 能按名字取到
const UI_REGISTRY = { PlanUI, OperationUI, PurchaseUI, AdminUI };
// 同时挂到 window，保证内联 onclick="PlanUI.xxx()" 等写法也能解析
window.PlanUI = PlanUI; window.OperationUI = OperationUI; window.PurchaseUI = PurchaseUI; window.AdminUI = AdminUI;

// ===== 登录与路由 =====
let currentRole = '';
let currentUserName = ''; // 当前登录用户名（全局唯一，解决切换角色后催更归属错误）
const roleLabels = { admin: '管理员', purchase: '采购', plan: '计划', operation: '运营' };

function handleRoleLogin(role) {
  if (role === 'admin') {
    Screen.show('screen-admin-login');
    $('#admin-pwd').focus();
  } else {
    currentRole = role;
    const roleMap = { purchase: '采购', plan: '计划', operation: '运营' };
    $('#name-login-title').textContent = roleMap[role] || role;
    $('#name-login-error').textContent = '';
    $('#user-name-input').value = '';
    const pwdWrap = $('#user-pwd-wrap');
    const pwdInput = $('#user-pwd-input');
    if (pwdWrap) pwdWrap.style.display = role === 'purchase' ? 'block' : 'none';
    if (pwdInput) pwdInput.value = '';
    Screen.show('screen-name-login');
    setTimeout(() => $('#user-name-input').focus(), 50);
  }
}

function isRoleAdmin(role, name) {
  if (!name) return false;
  const nameNorm = normalizeText(name);
  const personnel = Store.getPersonnel();
  const admins = (personnel.admins && personnel.admins[role]) || [];
  return admins.some(n => normalizeText(n) === nameNorm);
}

// 获取品类负责人配置（姓名 + 负责的品类列表）
function getCategoryManager(name) {
  const p = Store.getPersonnel();
  const list = p.categoryManagers || [];
  return list.find(m => normalizeText(m.name) === normalizeText(name)) || null;
}

function checkNameInData(role, name) {
  const nameNorm = normalizeText(name);
  const personnel = Store.getPersonnel();
  const list = personnel[role] || [];
  if (list.length > 0 && list.some(n => normalizeText(n) === nameNorm)) return true;
  // 分页面管理员可直接登录对应工作台
  if (isRoleAdmin(role, name)) return true;

  const sales = Store.getData('sales');
  const supplier = Store.getData('supplier');
  const whitelist = Store.getData('whitelist');

  if (role === 'operation') return sales.some(r => nameMatches(r.opManager, name));
  if (role === 'plan') return sales.some(r => nameMatches(r.planManager, name));
  if (role === 'purchase') {
    return supplier.some(r => nameMatches(r.buyer, name)) ||
           sales.some(r => nameMatches(r.priorityBuyer, name)) ||
           whitelist.some(r => nameMatches(r.buyer, name));
  }
  return false;
}

// 进入对应工作台（抽取复用）
// 清空所有筛选/搜索框的 DOM 输入与数值筛选面板，确保切换账号（同一页面实例）时不互相遗留筛选条件
function clearAllFilterDomInputs() {
  const textIds = [
    'purchase-search-sku', 'purchase-search-channel', 'purchase-search-supplier', 'purchase-search-status',
    'purchase-replenish-search-sku',
    'plan-search-sku', 'plan-search-buyer', 'plan-filter-status',
    'op-search-sku', 'op-filter-status'
  ];
  textIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // 批量 SKU 检索集复位
  [PlanUI, OperationUI, PurchaseUI].forEach(ui => { if (typeof ui !== 'undefined' && ui) ui.skuBatchSet = new Set(); });
  // 多选筛选复位，避免切换账号后沿用上一个账号的选中
  [PlanUI, OperationUI, PurchaseUI].forEach(ui => {
    if (ui && ui.clearAllMultiFilters) ui.clearAllMultiFilters();
  });
  // 数值筛选面板：关闭、清空输入、op 复位为 all
  document.querySelectorAll('.excel-filter-panel').forEach(p => p.style.display = 'none');
  ['purchase', 'plan', 'op'].forEach(prefix => {
    ['aug-target', 'pending', 'pending-combo', 'delivery-qty', 'remaining-delivery'].forEach(which => {
      const op = document.getElementById(prefix + '-' + which + '-op');
      if (op) op.value = 'all';
      const v1 = document.getElementById(prefix + '-' + which + '-v1');
      const v2 = document.getElementById(prefix + '-' + which + '-v2');
      if (v1) v1.value = '';
      if (v2) v2.value = '';
      const inputs = document.getElementById(prefix + '-' + which + '-inputs');
      if (inputs) inputs.style.display = 'none';
      const panel = document.getElementById(prefix + '-' + which + '-panel');
      if (panel) panel.dataset.op = 'all';
    });
  });
  // 采购工厂筛选按钮高亮复位
  document.querySelectorAll('[data-factory-filter]').forEach(b => b.classList.remove('active'));
}

function enterWorkbench(role, name) {
  currentUserName = name;
  // 进入任一工作台前先清空筛选，保证每个账号从干净状态开始（不继承上一个账号的筛选）
  clearAllFilterDomInputs();
  if (role === 'purchase') {
    Screen.show('screen-purchase');
    PurchaseUI.init(name);
  } else if (role === 'plan') {
    Screen.show('screen-plan');
    PlanUI.init(name);
  } else if (role === 'operation') {
    Screen.show('screen-operation');
    OperationUI.init(name);
  }
  // 后台自动拉取云端数据（仅当本地无云端数据表时），不阻塞登录
  maybeAutoPull();
}

function getRequiredUploads(role) {
  // 销量/发货均已改为管理员上传并云端同步，登录时不再强制要求本机上传任何本地大表。
  return [];
}

// 解析采购登录密码：云端密码表为准，云端不可达/无记录时回退本地缓存
async function resolvePurchasePassword(name) {
  const localPwd = Store.getPurchasePassword(name);
  if (typeof Sync !== 'undefined' && Sync.enabled && Sync.client) {
    try {
      // 优先快速拉取云端密码表，3 秒未返回则先用本地缓存继续登录，避免网络抖动时长时间卡死
      const map = await Sync._withTimeout(Sync._pullType('purchase_pwd'), 3000, '读取采购密码');
      if (map && typeof map === 'object') {
        // 云端已有密码表 → 以云端为准（缺失该姓名则默认 123）
        const p = map[normalizeText(name)];
        if (p != null) {
          const cloudPwd = String(p);
          // 若本地缓存与云端不一致，更新本地缓存以便下次秒开
          if (cloudPwd !== localPwd) Store.setPurchasePassword(name, cloudPwd);
          return cloudPwd;
        }
        return '123';
      }
    } catch (e) {
      debugLog('[pwd] 云端读取失败/超时，回退本地: ' + (e && e.message));
    }
  }
  return localPwd;
}

async function handleNameLogin() {
  const name = $('#user-name-input').value.trim();
  if (!name) { $('#name-login-error').textContent = '请输入姓名'; $('#name-login-error').style.display = 'block'; return; }

  const btn = $('#btn-name-login');
  const originalText = '进入';
  const setLoading = (loading) => {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '正在进入...' : originalText;
  };
  setLoading(true);
  $('#name-login-error').style.display = 'none';

  const hasSync = typeof Sync !== 'undefined' && Sync._withTimeout;
  const safeAwait = (promise, ms, label) => hasSync ? Sync._withTimeout(promise, ms, label) : promise;

  try {
    // 采购角色需要密码（默认123，可修改）
    if (currentRole === 'purchase') {
      const pwd = ($('#user-pwd-input')?.value || '').trim();
      const expect = (await safeAwait(resolvePurchasePassword(name), 5000, '密码拉取超时')).trim();
      if (pwd !== expect) {
        $('#name-login-error').textContent = '采购密码错误，默认密码为 123';
        $('#name-login-error').style.display = 'block';
        setLoading(false);
        return;
      }
    }

    // 登录校验前先从云端拉取「人员名单/白名单/供应商」等小表，避免其他电脑因未上传销量表而查不到姓名
    await safeAwait(ensureCloudNameSources(currentRole), 8000, '名单拉取超时');

    if (!checkNameInData(currentRole, name)) {
      $('#name-login-error').textContent = '姓名"' + name + '"不在' + roleLabels[currentRole] + '名单中，请检查后重新输入';
      $('#name-login-error').style.display = 'block';
      setLoading(false);
      return;
    }

    enterWorkbench(currentRole, name);
  } catch (e) {
    debugLog('[handleNameLogin] 登录处理异常: ' + (e && e.message));
    // 超时或异常时允许继续登录：用本地缓存校验
    if (!checkNameInData(currentRole, name)) {
      $('#name-login-error').textContent = '姓名"' + name + '"不在' + roleLabels[currentRole] + '名单中（云端名单拉取失败，请稍后重试）';
      $('#name-login-error').style.display = 'block';
      setLoading(false);
      return;
    }
    enterWorkbench(currentRole, name);
  }
}

function resetLoginButtonState() {
  const btn = $('#btn-name-login');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '进入';
}

async function handleAdminLogin() {
  if ($('#admin-pwd').value === CONFIG.ADMIN_PASSWORD) {
    currentRole = 'admin';
    currentUserName = '';
    AdminUI.updateDataStatus();
    AdminUI.renderPersonnel();
    AdminUI.renderHistory();
    AdminUI.renderUploadSummary();
    const conf = localStorage.getItem('skuv2_supabase');
    if (conf) { try { const c = JSON.parse(conf); $('#supabase-url').value = c.url || ''; $('#supabase-key').value = c.key || ''; } catch (e) {} }
    AdminUI.renderSyncTypeList();
    Screen.show('screen-admin');
    // 管理员：始终从云端恢复人员/数据并刷新界面（避免版本升级清空本地后界面不刷新）
    if (Sync.enabled) {
      Sync.pullAllWithGlobalProgress();
    }
  } else {
    showToast('密码错误，请重新输入', 'error');
  }
}

// 登录后若本地无任何数据，则在后台自动从云端拉取（不阻塞登录）。
// 这样其他人电脑点开链接、登录后就能立刻看到云端数据，无需手动操作。
function maybeAutoPull() {
  if (typeof Sync === 'undefined' || !Sync.enabled) return;
  // 关键修复：不再把 localOnly 的 sales 计入判断（否则本机一旦上传 sales 就永远跳过云端拉取，
  // 导致 cancel/delivery/whitelist 等云端表永不被拉到，表现为“供应商库存匹配不到”“交付列空白”）。
  // 改为：只要任一“云端可同步的关键表”在本机缺失，就后台全量补齐。
  const cloudTypes = SYNC_TYPES.filter(t => !t.localOnly && !t.hidden).map(t => t.key);
  const personnelHasData = (() => {
    const p = Store.getPersonnel();
    return (p.purchase || []).length || (p.plan || []).length || (p.operation || []).length ||
      (p.admins && ((p.admins.purchase || []).length || (p.admins.plan || []).length || (p.admins.operation || []).length));
  })();
  const criticalMissing = cloudTypes.some(t => {
    if (t === 'personnel') return !personnelHasData;
    return Store.getData(t).length === 0;
  });
  if (criticalMissing) {
    debugLog('[Sync] 检测到本机缺失云端数据，后台自动全量补齐');
    Sync.pullAllWithGlobalProgress({ silent: true });
  }
}

// 从本地已上传的 sales/supplier/whitelist 提取负责人姓名，合并进云端同步的「人员名单」
// 这样其他电脑登录时即使本地没有销量大表，也能用云端人员名单校验姓名（运营/计划登录依赖销量表的负责人列）。
function syncPersonnelFromLocalData() {
  try {
    if (typeof Sync === 'undefined' || !Sync.enabled) return;
    const salesData = Store.getData('sales');
    const supplierData = Store.getData('supplier');
    const whitelist = Store.getData('whitelist');
    if (salesData.length === 0 && supplierData.length === 0 && whitelist.length === 0) return;
    const extracted = Merger.extractPersonnel(salesData, supplierData);
    const existing = Store.getPersonnel();
    ['purchase', 'plan', 'operation'].forEach(r => {
      const set = new Set([...(extracted[r] || []), ...(existing[r] || [])]);
      existing[r] = [...set];
    });
    whitelist.forEach(w => { if (w.buyer) existing.purchase.push(w.buyer); });
    existing.purchase = [...new Set(existing.purchase)];
    // 安全兜底：若合并后某角色数组为空，但合并前本地非空，则保留本地原数组，禁止清空
    const before = Store.getPersonnel();
    ['purchase', 'plan', 'operation'].forEach(r => {
      if ((existing[r] || []).length === 0 && (before[r] || []).length > 0) existing[r] = before[r];
    });
    Store.setPersonnel(existing); // 内部会推送到云端（若已启用且勾选同步）
    if (typeof AdminUI !== 'undefined' && AdminUI.renderPersonnel) AdminUI.renderPersonnel();
  } catch (e) {
    debugLog('[syncPersonnelFromLocalData] 失败: ' + (e && e.message));
  }
}

// 把云端拉到的「人员名单」合并进本地（用于登录校验/自动刷新/手动拉取）。
// 关键修复：按 updated_at 时间戳判断“哪边更新”。手动编辑会更新本地时间戳并推送到云端；
// 云端更新（包括从其他设备或数据库直接修改）时间戳更新时，才会覆盖本地。这样既能保证
// 数据上传不会自动改人员名单，又能让数据库侧的新修改在刷新后同步下来。
function applyPersonnelFromRemote(payload) {
  if (!payload || typeof payload !== 'object') return;
  const arr = x => Array.isArray(x) ? x : [];
  // 云端完全没有任何名单数据时，保留本地（避免首次使用/云端空副本清空本地名单）
  const cloudHasAny =
    arr(payload.purchase).length + arr(payload.plan).length + arr(payload.operation).length > 0 ||
    arr(payload.categoryManagers).length > 0 ||
    (payload.admins && (arr(payload.admins.purchase).length + arr(payload.admins.plan).length + arr(payload.admins.operation).length) > 0);
  if (!cloudHasAny) return;
  // 云端权威：人员名单由管理员在云端维护，拉取时直接用云端覆盖本地。
  // 本地编辑会立即 push 到云端（见 Store.setPersonnel），因此本地修改不会丢失；
  // 而“云端改了就要同步下来 / 刷新后变回旧名单”的问题也能彻底解决。
  const out = {
    purchase: arr(payload.purchase),
    plan: arr(payload.plan),
    operation: arr(payload.operation),
    categoryManagers: arr(payload.categoryManagers),
    admins: {
      purchase: arr((payload.admins || {}).purchase),
      plan: arr((payload.admins || {}).plan),
      operation: arr((payload.admins || {}).operation),
    },
  };
  Store._set('personnel', out);
}

// 登录校验前，确保已从云端拉取「人员名单 / 白名单 / 供应商」等用于校验姓名的小表。
// 这些表体量小、云端同步快；拉取后登录校验不再依赖本机是否上传过销量大表。
async function ensureCloudNameSources(role) {
  if (typeof Sync === 'undefined' || !Sync.enabled || !Sync.client) return;
  const types = ['personnel', 'whitelist'];
  if (role === 'purchase') types.push('supplier');
  try {
    // 并发拉取人员名单/白名单/供应商等小表，整体限时 5 秒；任一失败/超时都不阻塞登录
    const jobs = types.filter(t => Sync.shouldSync(t)).map(t =>
      Sync._withTimeout(Sync._pullType(t), 5000, '拉取 ' + t).then(payload => ({ t, payload })).catch(err => {
        debugLog('[ensureCloudNameSources] ' + t + ' 拉取失败/超时: ' + (err && err.message));
        return { t, payload: null, err };
      })
    );
    const results = await Promise.all(jobs);
    for (const { t, payload } of results) {
      if (payload == null) continue;
      if (t === 'personnel') {
        // 并集合并，避免云端空数组覆盖清空本地名单
        applyPersonnelFromRemote(payload);
      } else {
        Store._set('data_' + t, payload);
      }
    }
  } catch (e) {
    debugLog('[ensureCloudNameSources] 拉取失败: ' + (e && e.message));
  }
}

// 根据当前角色刷新对应工作台视图
function refreshCurrentScreen() {
  if (currentRole === 'purchase' && PurchaseUI.userName) PurchaseUI.refresh();
  else if (currentRole === 'plan' && typeof PlanUI !== 'undefined') PlanUI.refresh();
  else if (currentRole === 'operation' && typeof OperationUI !== 'undefined') OperationUI.refresh();
}

// 刷新页面后恢复之前的屏幕与登录状态（不强制跳回主页）
function restoreSession() {
  try {
    const lastScreen = sessionStorage.getItem('skuv2_last_screen');
    const lastRole = sessionStorage.getItem('skuv2_last_role');
    const lastUser = sessionStorage.getItem('skuv2_last_user');

    if (lastScreen === 'screen-admin' && sessionStorage.getItem('skuv2_admin_auth') === '1') {
      currentRole = 'admin';
      currentUserName = '';
      AdminUI.updateDataStatus();
      AdminUI.renderPersonnel();
      AdminUI.renderHistory();
      AdminUI.renderUploadSummary();
      const conf = localStorage.getItem('skuv2_supabase');
      if (conf) { try { const c = JSON.parse(conf); $('#supabase-url').value = c.url || ''; $('#supabase-key').value = c.key || ''; } catch (e) {} }
      AdminUI.renderSyncTypeList();
      Screen.show('screen-admin');
      if (Sync.enabled) Sync.pullAllWithGlobalProgress();
      return;
    }

    if (lastScreen === 'screen-admin-login') {
      Screen.show('screen-admin-login');
      return;
    }

    if (lastScreen === 'screen-name-login' && lastRole) {
      currentRole = lastRole;
      currentUserName = '';
      handleRoleLogin(lastRole);
      return;
    }

    if (['screen-purchase', 'screen-plan', 'screen-operation'].includes(lastScreen) && lastRole && lastUser) {
      currentRole = lastRole;
      currentUserName = lastUser;
      enterWorkbench(lastRole, lastUser);
      return;
    }
  } catch (e) { console.error('[restoreSession]', e); }
  Screen.show('screen-role');
}

// ===== Tab 切换 =====
function setupTabs() {
  $$('#screen-admin .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      $$('#screen-admin .tab').forEach(x => x.classList.remove('active'));
      $$('#screen-admin .tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active'); $('#tab-' + t).classList.add('active');
    });
  });
  $$('#screen-purchase .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const pt = tab.dataset.ptab;
      const ct = tab.dataset.cattab;
      $$('#screen-purchase .tab').forEach(x => x.classList.remove('active'));
      $$('#screen-purchase .tab-content').forEach(c => c.classList.remove('active'));
      $$('#purchase-cat-tab-contents .cat-tab-content').forEach(c => c.classList.remove('active'));
      const catContainer = $('#purchase-cat-tab-contents');
      if (catContainer) catContainer.classList.remove('active');
      tab.classList.add('active');
      if (pt) $('#ptab-' + pt).classList.add('active');
      if (ct) {
        $('#pcat-tab-' + ct).classList.add('active');
        if (catContainer) catContainer.classList.add('active');
      }
    });
  });
}

// ===== 登录页动画 =====
function startRoleAnimation() {
  // 新主页无 splash 遮罩，直接进入即渲染全部排行榜
  renderLeaderboard('all');
}

// 首页 Hero 滚动到角色选择区
function scrollToRoles() {
  const el = $('#home-roles-section');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 页面加载时初始化 Sync（若内置/本地有配置则自动连云端），避免重复调用；登录后若本地无数据再后台自动拉取。
  Sync.init();
  // 一次性清理：移除旧的「9月发货明细底表(delivery)」本地缓存，避免清完云端后被本地旧数据重新推回。
  // 仅执行一次（用 localStorage 标记），后续不受任何影响。
  try {
    if (!localStorage.getItem('skuv2_purge_delivery_v216')) {
      ['data_delivery', 'data_delivery_first', 'data_delivery_diff'].forEach(k => localStorage.removeItem('skuv2_' + k));
      try {
        const ut = JSON.parse(localStorage.getItem('skuv2_update_times') || '{}');
        delete ut['delivery']; delete ut['delivery_first']; delete ut['delivery_diff'];
        localStorage.setItem('skuv2_update_times', JSON.stringify(ut));
      } catch (e2) {}
      localStorage.setItem('skuv2_purge_delivery_v216', '1');
    }
  } catch (e) {}
  // 2026-08-17：人员名单改为手动维护，启动时不再从销量/供应商/白名单中自动提取人员
  // 启动后台定时自动刷新（每 25 秒）：让其他电脑的改动能在这台电脑自动反映（交期/供应商/催更榜）
  Sync.startAutoRefresh(25000);
  // 启动后拉取云端最新使用说明（管理员编辑后所有用户同步看到）
  loadUsageGuideFromCloud();
  // 启动后拉取云端最新采购滚动条公告
  loadAnnouncementFromCloud();
  // 启动后拉取云端最新运营滚动条公告
  loadOperationAnnouncementFromCloud();
  $$('.role-card').forEach(card => card.addEventListener('click', () => handleRoleLogin(card.dataset.role)));
  $('#btn-admin-login').addEventListener('click', handleAdminLogin);
  $('#admin-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminLogin(); });
  $('#btn-name-login').addEventListener('click', handleNameLogin);
  $('#user-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleNameLogin(); });
  const pwdInput = $('#user-pwd-input');
  if (pwdInput) pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleNameLogin(); });
  $('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') Modal.close(); });
  // 表头筛选按钮：统一事件委托（避免 inline onclick 与委托双重触发导致数字面板先开后关）
  document.addEventListener('click', e => {
    const btn = e.target.closest('.col-filter-btn');
    if (!btn) return;
    const uiName = btn.getAttribute('data-filter-ui');
    const col = btn.getAttribute('data-filter-col');
    if (uiName && col) {
      // 阻止同一阶段其它 document 监听（尤其是下面的全局关闭面板）把刚打开的面板立即关掉
      e.stopImmediatePropagation();
      e.preventDefault();
      try {
        openHeaderFilter(btn, uiName, col, e);
      } catch (err) {
        console.error('[headerFilter] delegated click error', err);
      }
      return;
    }
    // 需补订单动态表头筛选
    if (btn.getAttribute('data-action') === 'replenish-filter') {
      e.stopImmediatePropagation();
      e.preventDefault();
      try {
        PurchaseUI.openReplenishFilter(btn, null, null, e);
      } catch (err) {
        console.error('[replenishFilter] delegated click error', err);
      }
    }
  });
  // 点击 Excel 筛选面板外部（且不是点 ▼ 按钮）时关闭所有面板
  document.addEventListener('click', e => {
    if (e.target.closest('.col-filter-btn') || e.target.closest('.excel-filter-panel')) return;
    $$('.excel-filter-panel').forEach(p => p.style.display = 'none');
  });
  setupTabs();
  AdminUI.renderPersonnel();
  AdminUI.renderHistory();
  AdminUI.renderUploadSummary();
  // 每30秒更新一次排行榜（如果停留在角色选择页）
  setInterval(() => {
    const roleScreen = $('#screen-role');
    if (roleScreen && roleScreen.classList.contains('active')) renderLeaderboard('all');
  }, 30000);
  // 刷新后恢复之前的屏幕，不再强制跳回主页
  restoreSession();
});
