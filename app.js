// ==========================================
// フロントエンド制御ロジック (app.js)
// ==========================================

const DEFAULT_GAS_URL = ""; // 必要に応じて初期URLを指定（またはUIから設定）

let gasUrl = localStorage.getItem('gasUrl') || DEFAULT_GAS_URL;
let storeList = ['博多住吉通り店', '清川二丁目店'];
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
  { id: '1', name: '下城', days: ['月','火','水','土','日'], time: '夜勤', note: '夜勤メイン。トラブル対応可能。' },
  { id: '16', name: 'スレンドラ', days: ['月','火','水','木','金','土','日'], time: '全時間帯', note: '売上貢献高。ワンオペ可。' },
  { id: '31', name: '岡本', days: ['月','火','金'], time: '朝勤', note: 'レジ中心。' },
  { id: '5', name: '山領', days: ['月','火','金','日'], time: '夕勤', note: 'FF・品出し得意。' },
  { id: '29', name: 'プラティ', days: ['月','火','水','木','金'], time: '昼勤', note: '品出し・清掃迅速。' }
];

const HISTORICAL_6MONTH_DATA = {
  '下城': { prescribed: 133, urgentOff: 0, reqOff: 0, helpCount: 0 },
  'スレンドラ': { prescribed: 133, urgentOff: 0, reqOff: 0, helpCount: 0 },
  '岡本': { prescribed: 133, urgentOff: 0, reqOff: 0, helpCount: 0 },
  'プラティ': { prescribed: 133, urgentOff: 0, reqOff: 0, helpCount: 0 },
  '山領': { prescribed: 106, urgentOff: 0, reqOff: 2, helpCount: 0 }
};

// =================================================================
// 日本の祝日（ハッピーマンデー・春分秋分・振替休日対応）自動算出関数
// =================================================================
function getHolidayName(dateObj) {
  let y = dateObj.getFullYear();
  let m = dateObj.getMonth() + 1;
  let d = dateObj.getDate();
  let dayOfWeek = dateObj.getDay();

  if (m === 1 && d === 1) return "元日";
  if (m === 2 && d === 11) return "建国記念の日";
  if (m === 2 && d === 23) return "天皇誕生日";
  if (m === 4 && d === 29) return "昭和の日";
  if (m === 5 && d === 3) return "憲法記念日";
  if (m === 5 && d === 4) return "みどりの日";
  if (m === 5 && d === 5) return "こどもの日";
  if (m === 8 && d === 11) return "山の日";
  if (m === 11 && d === 3) return "文化の日";
  if (m === 11 && d === 23) return "勤労感謝の日";

  let nthMonday = (targetNth) => {
    let firstDayDow = new Date(y, m - 1, 1).getDay();
    let offset = (1 - firstDayDow + 7) % 7;
    return 1 + offset + (targetNth - 1) * 7;
  };

  if (m === 1 && d === nthMonday(2)) return "成人の日";
  if (m === 7 && d === nthMonday(3)) return "海の日";
  if (m === 9 && d === nthMonday(3)) return "敬老の日";
  if (m === 10 && d === nthMonday(2)) return "スポーツの日";

  let shunbunDay = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  let shubunDay = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  if (m === 3 && d === shunbunDay) return "春分の日";
  if (m === 9 && d === shubunDay) return "秋分の日";

  if (dayOfWeek === 1) {
    let yesterday = new Date(y, m - 1, d - 1);
    let yName = getHolidayName(yesterday);
    if (yName && yName !== "振替休日") return "振替休日";
  }

  if (m === 5 && d === 6) {
    let dow53 = new Date(y, 4, 3).getDay();
    let dow54 = new Date(y, 4, 4).getDay();
    let dow55 = new Date(y, 4, 5).getDay();
    if (dow53 === 0 || dow54 === 0 || dow55 === 0) return "振替休日";
  }

  return "";
}

let fixedAssignments = {
  '1_0': '岡本', '2_0': 'プラティ', '3_0': '山領', '4_0': 'スレンドラ', '5_0': '恵良', '6_0': '下城'
};

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

function updateStoreNames() {
  let storeName = document.getElementById('store-select').value;
  let pFixed = document.getElementById('preview-store-name');
  let pOff = document.getElementById('off-summary-store-name');
  if (pFixed) pFixed.innerText = storeName;
  if (pOff) pOff.innerText = storeName;
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

function promptAddNewStore() {
  let newName = prompt('追加する新しい店舗名を入力してください:', '');
  if (newName && newName.trim() !== '') {
    newName = newName.trim();
    if (!storeList.includes(newName)) { storeList.push(newName); }
    currentStore = newName;
    renderStoreSelect();
    recalculateAll();
    renderStaffTable();
    autoSave();
  }
}

function promptRenameStore() {
  let newName = prompt(`「${currentStore}」の新しい店舗名を入力してください:`, currentStore);
  if (newName && newName.trim() !== '' && newName.trim() !== currentStore) {
    let oldName = currentStore;
    newName = newName.trim();
    let idx = storeList.indexOf(oldName);
    if (idx !== -1) storeList[idx] = newName;
    currentStore = newName;
    renderStoreSelect();
    autoSave();
  }
}

function switchStore(storeName) {
  currentStore = storeName;
  isLoadedFromSheets = false;
  let offSel = document.getElementById('off-staff-select');
  if (offSel) offSel.innerHTML = '';
  loadAllFromSheets();
}

function recalculateAll() {
  const minWageEl = document.getElementById('min-wage');
  const nightRateEl = document.getElementById('night-rate');
  const minWage = minWageEl ? (parseFloat(minWageEl.value) || 1057) : 1057;
  const nightRate = nightRateEl ? (parseFloat(nightRateEl.value) || 1.25) : 1.25;

  let tbody = document.getElementById('slot-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalDailyHours = 0;
  let totalDailyCost = 0;
  let totalSlotsCount = 0;

  slotData.forEach((item, index) => {
    let dur = calcDuration(item.start, item.end);
    let dailyHours = dur * item.slots;
    
    let sH = timeToHours(item.start);
    let eH = timeToHours(item.end);
    let isNight = (sH >= 22 || eH <= 8 || sH < 5);
    let hourlyWage = isNight ? minWage * nightRate : minWage;

    let dailyCost = dailyHours * hourlyWage;
    let monthlyHours = dailyHours * 30;
    let monthlyCost = dailyCost * 30;

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
      <td>${monthlyHours.toLocaleString()} 時間</td>
      <td><strong style="color:var(--primary);">¥${Math.round(monthlyCost).toLocaleString()}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  const dailyCostEl = document.getElementById('kpi-daily-cost');
  const dailyHoursEl = document.getElementById('kpi-daily-hours');
  const monthlyCostEl = document.getElementById('kpi-monthly-cost');
  const totalSlotsEl = document.getElementById('kpi-total-slots');

  if (dailyCostEl) dailyCostEl.innerText = '¥' + Math.round(totalDailyCost).toLocaleString();
  if (dailyHoursEl) dailyHoursEl.innerText = '総稼働時間: ' + totalDailyHours.toFixed(1) + ' 時間 / 日';
  if (monthlyCostEl) monthlyCostEl.innerText = '¥' + Math.round(totalDailyCost * 30).toLocaleString();
  if (totalSlotsEl) totalSlotsEl.innerText = totalSlotsCount + ' 枠 / 日';

  renderGanttChart();
  renderFixedShiftTable();
  renderCalendarTab();
  renderOffInputTab();
  renderHelpTab();
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

    for (let slotIndex = 1; slotIndex <= item.slots; slotIndex++) {
      let row = document.createElement('div');
      row.className = 'gantt-row';

      let label = document.createElement('div');
      label.className = 'gantt-label';
      label.innerText = `${item.name} 【枠${slotIndex}】`;

      let timeline = document.createElement('div');
      timeline.className = 'gantt-timeline';

      let leftPct = (startH / 24) * 100;
      let widthPct = (dur / 24) * 100;

      let bar = document.createElement('div');
      bar.className = `gantt-bar-wrapper ${item.colorClass}`;
      bar.style.left = leftPct + '%';
      bar.style.width = widthPct + '%';
      bar.innerText = `${item.start} - ${item.end}`;

      timeline.appendChild(bar);
      row.appendChild(label);
      row.appendChild(timeline);
      container.appendChild(row);
    }
  });
}

function renderStaffTable() {
  let tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let uniqList = [];
  let seen = {};
  staffList.forEach(s => {
    let key = (s.id || '') + '_' + (s.name || '');
    if (s.name && !seen[key]) {
      seen[key] = true;
      uniqList.push(s);
    }
  });
  staffList = uniqList;

  staffList.forEach((s, idx) => {
    let tr = document.createElement('tr');

    let dowHtml = '<div class="dow-group">';
    DOW_OPTIONS.forEach(d => {
      let checked = (s.days && s.days.includes(d)) ? 'checked' : '';
      dowHtml += `<label class="dow-item"><input type="checkbox" ${checked} onchange="toggleStaffDow(${idx}, '${d}')"> ${d}</label>`;
    });
    dowHtml += '</div>';

    let timeHtml = `<select class="editable-input" onchange="staffList[${idx}].time = this.value; renderStaffTable(); renderFixedShiftTable(); autoSave();">`;
    let timeOptions = ['全時間帯', ...slotData.map(x => x.name)];
    timeOptions.forEach(tOpt => {
      let sel = (s.time === tOpt) ? 'selected' : '';
      timeHtml += `<option value="${tOpt}" ${sel}>${tOpt}</option>`;
    });
    timeHtml += '</select>';

    tr.innerHTML = `
      <td><input type="text" class="editable-input" value="${s.id || ''}" onchange="staffList[${idx}].id = this.value; renderFixedShiftTable(); autoSave();"></td>
      <td><input type="text" class="editable-input" value="${s.name || ''}" onchange="staffList[${idx}].name = this.value; renderFixedShiftTable(); autoSave();"></td>
      <td>${dowHtml}</td>
      <td>${timeHtml}</td>
      <td><input type="text" class="editable-input" value="${s.note || ''}" placeholder="特記事項など" onchange="staffList[${idx}].note = this.value; autoSave();"></td>
      <td><button class="btn btn-danger" style="padding:3px 8px; font-size:11px;" onclick="removeStaff(${idx})">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleStaffDow(idx, day) {
  if (!staffList[idx].days) staffList[idx].days = [];
  let arr = staffList[idx].days;
  if (arr.includes(day)) { staffList[idx].days = arr.filter(x => x !== day); }
  else { staffList[idx].days.push(day); }
  renderFixedShiftTable();
  autoSave();
}

function addStaffRow() {
  let nextId = (staffList.length + 1).toString();
  staffList.push({ id: nextId, name: '新規スタッフ', days: ['月','火','水','木','金'], time: '全時間帯', note: '' });
  renderStaffTable();
  renderFixedShiftTable();
  renderOffInputTab();
  autoSave();
}

function removeStaff(idx) {
  if (confirm('このスタッフを削除しますか？')) {
    staffList.splice(idx, 1);
    renderStaffTable();
    renderFixedShiftTable();
    renderOffInputTab();
    autoSave();
  }
}

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

function initCalendarTabControls() {
  let picker = document.getElementById('cal-month-picker');
  if (!picker) return;
  picker.innerHTML = '';

  let baseInput = document.getElementById('cal-base-date').value;
  let baseDate = new Date(baseInput || '2026-08-01');

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
  document.getElementById('cal-base-date').value = ym + '-01';
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

  for (let i = 0; i < startDow; i++) {
    let cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    container.appendChild(cell);
  }

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
    let shiftsHtml = '';
    let rowIdx = 0;

    slotData.forEach(item => {
      for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
        rowIdx++;
        let key = `${dateStr}_${rowIdx}`;
        let defaultVal = getFixedAssignmentFallback(curDate, rowIdx);
        let currentVal = (calAssignments[key] !== undefined) ? calAssignments[key] : defaultVal;

        let staffOptHtml = `<select class="editable-input" style="font-size:10px; padding:1px 2px;" onchange="updateCalAssignment('${key}', this.value);">`;
        staffOptHtml += '<option value="">--未設定--</option>';
        staffList.forEach(st => {
          let sel = (currentVal === st.name) ? 'selected' : '';
          staffOptHtml += `<option value="${st.name}" ${sel}>${st.name}</option>`;
        });
        staffOptHtml += '</select>';

        shiftsHtml += `<div class="cal-shift-item"><strong>${item.name}${sIdx > 1 ? sIdx : ''}</strong>: ${staffOptHtml}</div>`;
      }
    });

    let cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    cell.innerHTML = `<div class="cal-day-header"><span class="cal-date-num" style="${dateNumStyle}">${day}</span>${holidayTagHtml}</div>` + shiftsHtml;
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
    let ym = document.getElementById('cal-month-picker').value;
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

function renderOffInputTab() {
  let selectEl = document.getElementById('off-staff-select');
  if (!selectEl) return;
  selectEl.innerHTML = '';
  staffList.forEach(s => {
    let opt = document.createElement('option');
    opt.value = s.name;
    opt.innerText = s.name;
    selectEl.appendChild(opt);
  });
}

function autoSave() {
  if (!gasUrl || !isLoadedFromSheets) return;
  clearTimeout(autoSaveTimer);
  let statusBadge = document.getElementById('sync-status');
  if (statusBadge) {
    statusBadge.className = 'sync-badge sync-saving';
    statusBadge.innerText = 'クラウド自動保存中...';
  }
  autoSaveTimer = setTimeout(() => {
    saveAllToSheets();
  }, 1000);
}

function saveGasUrlAndLoad() {
  let urlInput = document.getElementById('gas-url-input');
  if (!urlInput) return;
  let url = urlInput.value.trim();
  if (!url) { alert('Web App URLを入力してください'); return; }
  gasUrl = url;
  localStorage.setItem('gasUrl', gasUrl);
  loadAllFromSheets();
}

function loadAllFromSheets() {
  if (!gasUrl) return;
  let statusBadge = document.getElementById('sync-status');
  if (statusBadge) {
    statusBadge.className = 'sync-badge sync-saving';
    statusBadge.innerText = 'クラウド読み込み中...';
  }

  fetch(gasUrl + '?store=' + encodeURIComponent(currentStore))
    .then(res => res.json())
    .then(data => {
      if (data.storeList && data.storeList.length > 0) {
        storeList = data.storeList;
        renderStoreSelect();
      }
      if (data.slotData && data.slotData.length > 0) slotData = data.slotData;
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
        statusBadge.innerText = '🟢 自動同期中 (最新データ)';
      }
    })
    .catch(err => {
      console.error(err);
      if (statusBadge) {
        statusBadge.className = 'sync-badge sync-saving';
        statusBadge.innerText = '⚠️ 同期エラー';
      }
    });
}

function saveAllToSheets() {
  if (!gasUrl || !isLoadedFromSheets) return;

  let mw = document.getElementById('min-wage');
  let nr = document.getElementById('night-rate');

  let payload = {
    storeList: storeList,
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

  fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    let statusBadge = document.getElementById('sync-status');
    if (statusBadge) {
      statusBadge.className = 'sync-badge sync-ok';
      statusBadge.innerText = '🟢 自動保存完了';
    }
  }).catch(err => {
    console.error(err);
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  let targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

// 初期化実行
renderStoreSelect();
if (gasUrl) {
  let urlInput = document.getElementById('gas-url-input');
  if (urlInput) urlInput.value = gasUrl;
  loadAllFromSheets();
} else {
  recalculateAll();
  renderStaffTable();
}
