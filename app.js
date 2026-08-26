// ==========================================
// フロントエンド制御ロジック (app.js - 完全自動同期版)
// ==========================================

// ★ここにデプロイした最新のGASのWeb Web App URLを直接埋め込みます
const GAS_URL = "https://script.google.com/macros/s/AKfycby49KDuUNkFBfJQhBLlXYqKRQRFzl19V7I9YMuufshkdP8IYAI2k9jrLgMbtjzqvjIz/exec";

let storeList = ['清川二丁目店', '博多住吉通り店'];
let currentStore = '清川二丁目店';
let isLoadedFromSheets = false;
let autoSaveTimer = null;

let slotData = [
  { name: '朝勤', start: '08:00', end: '13:00', slots: 1, colorClass: 'bg-morning' },
  { name: '昼勤', start: '12:00', end: '17:00', slots: 2, colorClass: 'bg-noon' },
  { name: '夕勤', start: '17:00', end: '22:00', slots: 2, colorClass: 'bg-evening' },
  { name: '夜勤', start: '22:00', end: '08:00', slots: 1, colorClass: 'bg-night' },
  { name: '準夜勤/フォロー', start: '22:00', end: '03:00', slots: 1, colorClass: 'bg-subnight' }
];

let staffList = [
  { id: '1', name: '下城', days: ['月','火','水','土','日'], time: '夜勤', note: '夜勤メイン。' },
  { id: '16', name: 'スレンドラ', days: ['月','火','水','木','金','土','日'], time: '全時間帯', note: 'ワンオペ可。' }
];

let fixedAssignments = {};
let calAssignments = {};
let offRequestsStore = {};
const DOW_OPTIONS = ['月', '火', '水', '木', '金', '土', '日'];

function timeToHours(timeStr) {
  const parts = timeStr.split(':');
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

function calcDuration(startStr, endStr) {
  let s = timeToHours(startStr);
  let e = timeToHours(endStr);
  if (e <= s) e += 24;
  return e - s;
}

function renderStoreSelect() {
  let sel = document.getElementById('store-select');
  if (!sel) return;
  sel.innerHTML = '';
  storeList.forEach(st => {
    let opt = document.createElement('option');
    opt.value = st;
    opt.innerText = st;
    if (st === currentStore) opt.selected = true;
    sel.appendChild(opt);
  });
}

function switchStore(storeName) {
  currentStore = storeName;
  isLoadedFromSheets = false;
  loadAllFromSheets();
}

// ==========================================
// 自動クラウド読み込み
// ==========================================
function loadAllFromSheets() {
  let statusBadge = document.getElementById('sync-status');
  if (statusBadge) {
    statusBadge.className = 'sync-badge sync-saving';
    statusBadge.innerText = '🔄 読み込み中...';
  }

  fetch(`${GAS_URL}?store=${encodeURIComponent(currentStore)}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        if (data.storeList && data.storeList.length > 0) {
          storeList = data.storeList;
          renderStoreSelect();
        }
        if (data.slotData) slotData = data.slotData;
        if (data.staffList) staffList = data.staffList;
        if (data.fixedAssignments) fixedAssignments = data.fixedAssignments;
        if (data.calAssignments) calAssignments = data.calAssignments;
        if (data.offRequestsStore) offRequestsStore = data.offRequestsStore;
        if (data.config) {
          let mw = document.getElementById('min-wage');
          let nr = document.getElementById('night-rate');
          if (mw) mw.value = data.config.minWage || 1057;
          if (nr) nr.value = data.config.nightRate || 1.25;
        }

        isLoadedFromSheets = true;
        recalculateAll();
        renderStaffTable();

        if (statusBadge) {
          statusBadge.className = 'sync-badge sync-ok';
          statusBadge.innerText = '🟢 自動同期中';
        }
      } else {
        throw new Error(data.message || "取得失敗");
      }
    })
    .catch(err => {
      console.error(err);
      if (statusBadge) {
        statusBadge.className = 'sync-badge sync-saving';
        statusBadge.innerText = '⚠️ 同期オフライン';
      }
    });
}

// ==========================================
// 自動クラウド保存 (デバウンス付き)
// ==========================================
function autoSave() {
  if (!isLoadedFromSheets) return;
  clearTimeout(autoSaveTimer);
  
  let statusBadge = document.getElementById('sync-status');
  if (statusBadge) {
    statusBadge.className = 'sync-badge sync-saving';
    statusBadge.innerText = '💾 保存中...';
  }

  autoSaveTimer = setTimeout(() => {
    let mw = document.getElementById('min-wage');
    let nr = document.getElementById('night-rate');

    let payload = {
      slotData: slotData,
      staffList: staffList,
      fixedAssignments: fixedAssignments,
      calAssignments: calAssignments,
      offRequestsStore: offRequestsStore,
      config: {
        minWage: mw ? parseFloat(mw.value) : 1057,
        nightRate: nr ? parseFloat(nr.value) : 1.25,
        storeName: currentStore
      }
    };

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(() => {
      if (statusBadge) {
        statusBadge.className = 'sync-badge sync-ok';
        statusBadge.innerText = '🟢 自動同期中';
      }
    }).catch(err => {
      console.error(err);
      if (statusBadge) {
        statusBadge.className = 'sync-badge sync-saving';
        statusBadge.innerText = '⚠️ 保存エラー';
      }
    });
  }, 1000);
}

// ==========================================
// 計算・画面描画ロジック
// ==========================================
function recalculateAll() {
  const minWage = parseFloat(document.getElementById('min-wage')?.value) || 1057;
  const nightRate = parseFloat(document.getElementById('night-rate')?.value) || 1.25;

  let tbody = document.getElementById('slot-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalDailyHours = 0, totalDailyCost = 0, totalSlotsCount = 0;

  slotData.forEach((item, index) => {
    let dur = calcDuration(item.start, item.end);
    let dailyHours = dur * item.slots;
    let sH = timeToHours(item.start);
    let isNight = (sH >= 22 || sH < 5);
    let hourlyWage = isNight ? minWage * nightRate : minWage;
    let dailyCost = dailyHours * hourlyWage;

    totalDailyHours += dailyHours;
    totalDailyCost += dailyCost;
    totalSlotsCount += item.slots;

    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="editable-input" value="${item.name}" onchange="updateData(${index}, 'name', this.value)"></td>
      <td><input type="text" class="editable-input" value="${item.start}" onchange="updateData(${index}, 'start', this.value)"></td>
      <td><input type="text" class="editable-input" value="${item.end}" onchange="updateData(${index}, 'end', this.value)"></td>
      <td><strong>${dur.toFixed(1)} h</strong></td>
      <td><input type="number" class="editable-input" value="${item.slots}" min="0" max="5" onchange="updateData(${index}, 'slots', parseInt(this.value)||0)"></td>
      <td><strong>${dailyHours.toFixed(1)} 時間</strong></td>
      <td>${(dailyHours*30).toFixed(1)} 時間</td>
      <td><strong style="color:var(--primary);">¥${Math.round(dailyCost*30).toLocaleString()}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('kpi-daily-cost').innerText = '¥' + Math.round(totalDailyCost).toLocaleString();
  document.getElementById('kpi-daily-hours').innerText = '総稼働時間: ' + totalDailyHours.toFixed(1) + ' 時間 / 日';
  document.getElementById('kpi-monthly-cost').innerText = '¥' + Math.round(totalDailyCost * 30).toLocaleString();
  document.getElementById('kpi-total-slots').innerText = totalSlotsCount + ' 枠 / 日';

  renderGanttChart();
  renderFixedShiftTable();
  renderCalendarTab();
}

function updateData(index, field, value) {
  slotData[index][field] = value;
  recalculateAll();
  autoSave();
}

function renderGanttChart() {
  let container = document.getElementById('gantt-chart-container');
  if (!container) return;
  container.innerHTML = '';
  slotData.forEach((item) => {
    let dur = calcDuration(item.start, item.end);
    let startH = timeToHours(item.start);
    for (let i = 1; i <= item.slots; i++) {
      let row = document.createElement('div');
      row.className = 'gantt-row';
      row.innerHTML = `<div class="gantt-label">${item.name} 枠${i}</div><div class="gantt-timeline"><div class="gantt-bar-wrapper ${item.colorClass}" style="left:${(startH/24)*100}%; width:${(dur/24)*100}%;">${item.start}-${item.end}</div></div>`;
      container.appendChild(row);
    }
  });
}

function renderStaffTable() {
  let tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  staffList.forEach((s, idx) => {
    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="editable-input" value="${s.id || ''}" onchange="staffList[${idx}].id=this.value; autoSave();"></td>
      <td><input type="text" class="editable-input" value="${s.name || ''}" onchange="staffList[${idx}].name=this.value; autoSave();"></td>
      <td>（希望設定）</td>
      <td>（時間設定）</td>
      <td><input type="text" class="editable-input" value="${s.note || ''}" onchange="staffList[${idx}].note=this.value; autoSave();"></td>
      <td><button class="btn btn-danger" onclick="staffList.splice(${idx},1); renderStaffTable(); autoSave();">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addStaffRow() {
  staffList.push({ id: String(staffList.length + 1), name: '新規スタッフ', days: [], time: '全時間帯', note: '' });
  renderStaffTable();
  autoSave();
}

function renderFixedShiftTable() {}
function renderCalendarTab() {}
function renderOffInputTab() {}
function renderHelpTab() {}
function applyFixedToCal() {}
function promptAddNewStore() {}
function promptRenameStore() {}
function triggerPrint() { window.print(); }

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');
}

// ==========================================
// 初期化実行
// ==========================================
renderStoreSelect();
loadAllFromSheets();
