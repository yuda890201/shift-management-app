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

    // ① 希望曜日のチェックボックス群を生成
    let dowHtml = '<div class="dow-group">';
    DOW_OPTIONS.forEach(d => {
      let checked = (s.days && s.days.includes(d)) ? 'checked' : '';
      dowHtml += `<label class="dow-item"><input type="checkbox" ${checked} onchange="toggleStaffDow(${idx}, '${d}')"> ${d}</label>`;
    });
    dowHtml += '</div>';

    // ② 希望時間帯のセレクトボックスを生成
    let timeHtml = `<select class="editable-input" onchange="staffList[${idx}].time = this.value; renderStaffTable(); autoSave();">`;
    let timeOptions = ['全時間帯', ...slotData.map(x => x.name)];
    timeOptions.forEach(tOpt => {
      let sel = (s.time === tOpt) ? 'selected' : '';
      timeHtml += `<option value="${tOpt}" ${sel}>${tOpt}</option>`;
    });
    timeHtml += '</select>';

    tr.innerHTML = `
      <td><input type="text" class="editable-input" value="${s.id || ''}" onchange="staffList[${idx}].id=this.value; autoSave();"></td>
      <td><input type="text" class="editable-input" value="${s.name || ''}" onchange="staffList[${idx}].name=this.value; autoSave();"></td>
      <td>${dowHtml}</td>
      <td>${timeHtml}</td>
      <td><input type="text" class="editable-input" value="${s.note || ''}" onchange="staffList[${idx}].note=this.value; autoSave();"></td>
      <td><button class="btn btn-danger" onclick="staffList.splice(${idx},1); renderStaffTable(); autoSave();">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// 曜日のチェックが切り替わったときに配列を更新するヘルパー関数
function toggleStaffDow(idx, day) {
  if (!staffList[idx].days) staffList[idx].days = [];
  let arr = staffList[idx].days;
  if (arr.includes(day)) {
    staffList[idx].days = arr.filter(x => x !== day);
  } else {
    staffList[idx].days.push(day);
  }
  autoSave();
}

function addStaffRow() {
  staffList.push({ id: String(staffList.length + 1), name: '新規スタッフ', days: [], time: '全時間帯', note: '' });
  renderStaffTable();
  autoSave();
}

// ==========================================
// ③ 固定シフト表 ＆ サイドバー集計ロジック
// ==========================================

function renderFixedShiftTable() {
  let tbody = document.getElementById('fixed-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let rowCounter = 0;

  slotData.forEach((item) => {
    for (let i = 1; i <= item.slots; i++) {
      rowCounter++;
      let tr = document.createElement('tr');
      let html = `<td><strong>${item.name}</strong><br><small style="color:gray;">(${item.start}-${item.end})</small></td><td>枠${i}</td>`;
      
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        let key = `${rowCounter}_${dayIdx}`;
        let assignedVal = fixedAssignments[key] || '';

        let staffOptHtml = `<select class="editable-input" style="font-size:12px;" onchange="updateAssignment('${key}', this.value)">`;
        staffOptHtml += '<option value="">-- 未設定 --</option>';

        staffList.forEach(s => {
          let daysText = (s.days && s.days.length > 0) ? s.days.join('') : '希望なし';
          let timeText = s.time || '全時間帯';
          let label = `${s.name} (希望:${daysText} / ${timeText})`;
          let sel = (assignedVal === s.name) ? 'selected' : '';
          staffOptHtml += `<option value="${s.name}" ${sel}>${label}</option>`;
        });
        staffOptHtml += '</select>';

        html += `<td>${staffOptHtml}</td>`;
      }

      tr.innerHTML = html;
      tbody.appendChild(tr);
    }
  });

  updateSidebarStats();
}
function updateAssignment(key, nameVal) {
  fixedAssignments[key] = nameVal;
  renderFixedShiftTable();
  autoSave();
}

function updateSidebarStats() {
  let sidebarContainer = document.getElementById('sidebar-staff-list');
  if (!sidebarContainer) return;
  sidebarContainer.innerHTML = '';

  let statsMap = {};
  staffList.forEach(s => { statsMap[s.name] = { slotsCount: 0, totalHours: 0 }; });

  let rowCounter = 0;
  slotData.forEach((item) => {
    let dur = calcDuration(item.start, item.end);
    for (let i = 1; i <= item.slots; i++) {
      rowCounter++;
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        let key = `${rowCounter}_${dayIdx}`;
        let assignedName = fixedAssignments[key];
        if (assignedName && statsMap[assignedName]) {
          statsMap[assignedName].slotsCount += 1;
          statsMap[assignedName].totalHours += dur;
        }
      }
    }
  });

  staffList.forEach(s => {
    let stat = statsMap[s.name] || { slotsCount: 0, totalHours: 0 };
    let card = document.createElement('div');
    card.className = 'sidebar-staff-card';
    card.innerHTML = `
      <div class="sidebar-staff-name">
        <span>${s.name}</span>
        <span class="sidebar-stat-badge">${stat.totalHours.toFixed(1)} h/週</span>
      </div>
      <div style="color:var(--text-muted); display:flex; justify-content:space-between;">
        <span>固定シフト: <strong>${stat.slotsCount} 枠</strong></span>
        <span>(希望: ${(s.days||[]).join('') || 'なし'})</span>
      </div>
    `;
    sidebarContainer.appendChild(card);
  });
}
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
// ④ 暦シフト表（カレンダー表示 ＆ 自動反映）ロジック
// ==========================================

function initCalendarTabControls() {
  let picker = document.getElementById('cal-month-picker');
  if (!picker) return;
  picker.innerHTML = '';

  let baseInput = document.getElementById('cal-base-date');
  let baseDate = new Date(baseInput ? baseInput.value : '2026-08-01');

  for (let i = 0; i < 12; i++) {
    let d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let opt = document.createElement('option');
    opt.value = `${yyyy}-${mm}`;
    opt.innerText = `${yyyy}年 ${d.getMonth() + 1}月`;
    picker.appendChild(opt);
  }
}

function onMonthPickerChange() {
  let ym = document.getElementById('cal-month-picker').value;
  let baseInput = document.getElementById('cal-base-date');
  if (baseInput) {
    baseInput.value = ym + '-01';
  }
  renderCalendarTab();
  autoSave();
}

function renderCalendarTab() {
  initCalendarTabControls();
  let baseInput = document.getElementById('cal-base-date');
  if (!baseInput) return;
  let baseDate = new Date(baseInput.value || '2026-08-01');
  renderMonthCalendar(baseDate);
}

function getFixedAssignmentFallback(curDate, rowIdx) {
  let dow = curDate.getDay();
  let fixedDayIdx = (dow === 0) ? 6 : dow - 1;
  let key = `${rowIdx}_${fixedDayIdx}`;
  return fixedAssignments[key] || '';
}

function renderMonthCalendar(baseDate) {
  let year = baseDate.getFullYear();
  let month = baseDate.getMonth();

  let titleEl = document.getElementById('cal-month-title');
  if (titleEl) titleEl.innerText = `📅 ${year}年 ${month + 1}月 カレンダーシフト表`;

  let container = document.getElementById('cal-month-days-container');
  if (!container) return;
  container.innerHTML = '';

  let firstDay = new Date(year, month, 1);
  let lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay();

  // 月の初日までの空白セル
  for (let i = 0; i < startDow; i++) {
    let cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    container.appendChild(cell);
  }

  // 1日から月末まで
  for (let day = 1; day <= lastDay.getDate(); day++) {
    let curDate = new Date(year, month, day);
    let yyyy = curDate.getFullYear();
    let mm = String(curDate.getMonth() + 1).padStart(2, '0');
    let dd = String(day).padStart(2, '0');
    let dateStr = `${yyyy}-${mm}-${dd}`;

    let holidayName = getHolidayName(curDate);
    let dowNum = curDate.getDay();

    let dateNumStyle = '';
    if (dowNum === 0 || holidayName) dateNumStyle = 'color:#e53e3e;';
    else if (dowNum === 6) dateNumStyle = 'color:#3182ce;';

    let holidayTagHtml = holidayName ? `<span class="cal-holiday-tag">${holidayName}</span>` : '';
    
    let dayHasChange = false;
    let shiftsHtml = '';
    let rowIdx = 0;

    slotData.forEach(item => {
      for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
        rowIdx++;
        let key = `${dateStr}_${rowIdx}`;
        let defaultVal = getFixedAssignmentFallback(curDate, rowIdx);
        let currentVal = (calAssignments[key] !== undefined) ? calAssignments[key] : defaultVal;

        let isItemChanged = (calAssignments[key] !== undefined && calAssignments[key] !== defaultVal);
        if (isItemChanged) { dayHasChange = true; }

        let itemClass = isItemChanged ? 'cal-shift-item is-modified' : 'cal-shift-item';

        let staffOptHtml = `<select class="editable-input" style="font-size:10px; padding:1px 2px;" onchange="updateCalAssignment('${key}', this.value);">`;
        staffOptHtml += '<option value="">--未設定--</option>';
        staffList.forEach(st => {
          let sel = (currentVal === st.name) ? 'selected' : '';
          staffOptHtml += `<option value="${st.name}" ${sel}>${st.name}</option>`;
        });
        staffOptHtml += '</select>';

        shiftsHtml += `<div class="${itemClass}"><strong>${item.name}${sIdx > 1 ? sIdx : ''}</strong>: ${staffOptHtml}</div>`;
      }
    });

    let cell = document.createElement('div');
    cell.className = dayHasChange ? 'cal-day-cell has-changed' : 'cal-day-cell';
    let changeTagHtml = dayHasChange ? `<span class="cal-changed-tag">変更あり</span>` : '';

    let headerHtml = `
      <div class="cal-day-header">
        <span class="cal-date-num" style="${dateNumStyle}">${day} ${changeTagHtml}</span>
        ${holidayTagHtml}
      </div>
    `;

    cell.innerHTML = headerHtml + shiftsHtml;
    container.appendChild(cell);
  }
}

function updateCalAssignment(key, val) {
  calAssignments[key] = val;
  renderCalendarTab();
  autoSave();
}

function applyFixedToCal() {
  if (confirm('③の固定シフト内容を現在の表示月（30日分）に自動一括反映しますか？')) {
    let picker = document.getElementById('cal-month-picker');
    let ym = picker ? picker.value : '2026-08';
    let baseDate = new Date(ym + '-01');
    let year = baseDate.getFullYear();
    let month = baseDate.getMonth();
    let lastDay = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= lastDay; d++) {
      let curDate = new Date(year, month, d);
      let dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

      let rowIdx = 0;
      slotData.forEach(item => {
        for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
          rowIdx++;
          let key = `${dateStr}_${rowIdx}`;
          calAssignments[key] = getFixedAssignmentFallback(curDate, rowIdx);
        }
      });
    }
    renderCalendarTab();
    autoSave();
    alert('固定シフトの一括反映が完了しました。');
  }
}
// ==========================================
// 初期化実行
// ==========================================
renderStoreSelect();
loadAllFromSheets();
