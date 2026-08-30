// ==========================================
// フロントエンド制御ロジック (app.js - 最終完全版)
// ==========================================

// 【絶対安全ガード】空データや未ロード状態でのセーブを完全封鎖
window.addEventListener('beforeunload', (event) => {
  if (!isLoadedFromSheets) {
    // まだ読み込みが終わっていないのに閉じようとした場合は警告
    event.preventDefault();
    event.returnValue = '';
  }
});
const GAS_URL = "https://script.google.com/macros/s/AKfycby49KDuUNkFBfJQhBLlXYqKRQRFzl19V7I9YMuufshkdP8IYAI2k9jrLgMbtjzqvjIz/exec";

let storeList = ['1号店', '2号店'];
let currentStore = '1号店';
let isLoadedFromSheets = false;
let autoSaveTimer = null;
let serverLastUpdated = ""; 

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
let calMemoAssignments = {}; 
const DOW_OPTIONS = ['月', '火', '水', '木', '金', '土', '日'];

const TIME_OPTIONS = (() => {
  let arr = [];
  for (let h = 0; h < 24; h++) {
    let hh = String(h).padStart(2, '0');
    arr.push(`${hh}:00`, `${hh}:30`);
  }
  return arr;
})();

const HISTORICAL_6MONTH_DATA = {
  "下城": { prescribed: 106, urgentOff: 1, reqOff: 2, helpCount: 0 },
  "スレンドラ": { prescribed: 120, urgentOff: 0, reqOff: 1, helpCount: 2 }
};

// ==========================================
// ローディング・オーバーレイ制御
// ==========================================
function showLoading(message = "処理中...") {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
      <div style="background:white; padding:24px 32px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.15); display:flex; align-items:center; gap:16px;">
        <div class="spinner"></div>
        <span id="loading-text" style="font-weight:bold; font-size:14px; color:#2d3748;">${message}</span>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    document.getElementById('loading-text').innerText = message;
  }
  overlay.classList.add('active');
}

function hideLoading() {
  let overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('active');
}
// ==========================================
// 💾 手動バックアップ ＆ 復元機能（専用領域への退避と読込）
// ==========================================

function manualBackup() {
  if (!confirm("現在の編集内容を専用のバックアップ領域（手動バックアップ）に保存しますか？")) return;
  if (!slotData || slotData.length === 0) {
    alert("エラー: データが空のためバックアップできません。");
    return;
  }

  showLoading("バックアップを保存中...");

  let payload = {
    action: "backup",
    config: {
      storeName: currentStore
    },
    payload: {
      slotData: slotData,
      staffList: staffList,
      fixedAssignments: fixedAssignments,
      calAssignments: calAssignments,
      offRequestsStore: offRequestsStore,
      calMemoAssignments: calMemoAssignments,
      config: {
        minWage: parseFloat(document.getElementById('min-wage')?.value) || 1057,
        nightRate: parseFloat(document.getElementById('night-rate')?.value) || 1.25,
        storeName: currentStore
      }
    }
  };

  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    hideLoading();
    if (data.status === "success") {
      alert("✅ バックアップの保存に成功しました！");
    } else {
      alert("⚠️ エラー: " + (data.message || "不明なエラー"));
    }
  })
  .catch(err => {
    hideLoading();
    console.error("バックアップエラー:", err);
    alert("通信エラーが発生しました。");
  });
}

function manualRestore() {
  if (!confirm("⚠️ 注意：最後に手動バックアップした安全な状態に戻します。\n（バックアップ以降に行った未保存の変更は失われますがよろしいですか？）")) return;

  showLoading("バックアップから復元中...");

  let payload = {
    action: "restore",
    config: {
      storeName: currentStore
    }
  };

  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    hideLoading();
    if (data.status === "success") {
      alert("🔄 バックアップからの復元に成功しました！データを再読み込みします。");
      loadAllFromSheets(); // メインデータを再読込して画面に反映
    } else {
      alert("⚠️ エラー: " + (data.message || "不明なエラー"));
    }
  })
  .catch(err => {
    hideLoading();
    console.error("復元エラー:", err);
    alert("通信エラーが発生しました。");
  });
}
// ==========================================
// 時間・日付計算ユーティリティ
// ==========================================
function timeToHours(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

function calcDuration(startStr, endStr) {
  let s = timeToHours(startStr);
  let e = timeToHours(endStr);
  if (e <= s) e += 24;
  return e - s;
}

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
  return "";
}

// ==========================================
// 店舗・管理ダイアログ機能
// ==========================================
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

// ==========================================
// 店舗切り替え処理（店舗別データの完全読み込み）
// ==========================================
function switchStore(storeName) {
  if (currentStore === storeName && isLoadedFromSheets) return;
  
  if (confirm(`店舗を「${storeName}」に切り替えますか？\n（※現在編集中の未保存データは切り替え先の店舗データに上書きされます）`)) {
    currentStore = storeName;
    isLoadedFromSheets = false;
    
    // 切り替え前に一旦データを初期化して空表示にする
    fixedAssignments = {};
    calAssignments = {};
    offRequestsStore = {};
    calMemoAssignments = {};
    
    // 選択された店舗のデータをサーバーから新規取得
    loadAllFromSheets();
  } else {
    // キャンセルされた場合はドロップダウンの選択を元の店舗に戻す
    renderStoreSelect();
  }
}

function promptAddNewStore() {
  let name = prompt("追加する新規店舗名を入力してください：");
  if (name && name.trim() !== "") {
    let cleanName = name.trim();
    if (!storeList.includes(cleanName)) {
      storeList.push(cleanName);
      currentStore = cleanName;
      renderStoreSelect();
      slotData = [
        { name: '朝勤', start: '08:00', end: '13:00', slots: 1, colorClass: 'bg-morning' },
        { name: '昼勤', start: '12:00', end: '17:00', slots: 2, colorClass: 'bg-noon' }
      ];
      staffList = [{ id: '1', name: 'スタッフA', days: ['月','火','水','木','金'], time: '全時間帯', note: '' }];
      fixedAssignments = {};
      calAssignments = {};
      offRequestsStore = {};
      calMemoAssignments = {};
      saveAllNow().then(() => {
        loadAllFromSheets();
      });
    } else {
      alert("その店舗名は既に存在します。");
    }
  }
}

// ==========================================
// 店舗名の変更処理（アプリ上の即時反映とサーバー保存）
// ==========================================
function promptRenameStore() {
  let name = prompt(`店舗「${currentStore}」の新しい名称を入力してください：`, currentStore);
  if (name && name.trim() !== "" && name.trim() !== currentStore) {
    let newName = name.trim();
    let idx = storeList.indexOf(currentStore);
    
    if (idx !== -1) {
      // 1. アプリ側の店舗リストの名称を書き換える
      storeList[idx] = newName;
      currentStore = newName;
      
      // 2. ドロップダウンを今すぐ新しいリストに描き直す
      renderStoreSelect();
      
      // 3. サーバー（スプレッドシート）に新しい店舗名で即時保存してデータを確定させる
      saveAllNow().then(() => {
        loadAllFromSheets();
        alert(`店舗名を「${newName}」に変更しました！`);
      });
    } else {
      alert("エラー: 変更対象の店舗が見つかりませんでした。");
    }
  }
}

function triggerPrint() {
  window.print();
}

// ==========================================
// クラウド読み込み・保存
// ==========================================
function loadAllFromSheets() {
  showLoading("クラウドからデータを読み込んでいます...");

  fetch(`${GAS_URL}?store=${encodeURIComponent(currentStore)}`)
    .then(res => res.json())
    .then(data => {
      hideLoading();
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
        if (data.calMemoAssignments) calMemoAssignments = data.calMemoAssignments;
        
        if (data.config) {
          let mw = document.getElementById('min-wage');
          let nr = document.getElementById('night-rate');
          if (mw) mw.value = data.config.minWage || 1057;
          if (nr) nr.value = data.config.nightRate || 1.25;
        }

        isLoadedFromSheets = true;
        serverLastUpdated = data.lastUpdated || ""; 
        recalculateAll();
        renderStaffTable();
        renderFixedShiftTable();
        renderOffInputTab();
        renderHelpTab();
        renderCalendarTab();
      } else {
        console.error("データ取得エラー:", data.message);
      }
    })
    .catch(err => {
      hideLoading();
      console.error("通信エラー:", err);
    });
}

function autoSave() {
  if (!isLoadedFromSheets) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    silentSaveToSheets();
  }, 1000);
}

function silentSaveToSheets() {
  // ★重要：データがロードされていない、または枠データが空っぽの場合は絶対に送信しない
  if (!isLoadedFromSheets || !slotData || slotData.length === 0) {
    console.warn("⚠️ 未ロードまたは空データのため、保存を中止しました。");
    return;}
  let mw = document.getElementById('min-wage');
  let nr = document.getElementById('night-rate');

  let payload = {
    slotData: slotData,
    staffList: staffList,
    fixedAssignments: fixedAssignments,
    calAssignments: calAssignments,
    offRequestsStore: offRequestsStore,
    calMemoAssignments: calMemoAssignments,
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
  }).catch(err => {
    console.error("バックグラウンド保存エラー:", err);
  });
}

function saveAllNow() {
  return new Promise((resolve) => {
    clearTimeout(autoSaveTimer);

    // ★ここにもガードを追加
    if (!isLoadedFromSheets || !slotData || slotData.length === 0) {
      console.warn("⚠️ 未ロードまたは空データのため、保存を中止しました。");
      resolve();
      return;
    }
    showLoading("データを保存しています...");

    let mw = document.getElementById('min-wage');
    let nr = document.getElementById('night-rate');

    let payload = {
      clientLastUpdated: serverLastUpdated,
      slotData: slotData,
      staffList: staffList,
      fixedAssignments: fixedAssignments,
      calAssignments: calAssignments,
      offRequestsStore: offRequestsStore,
      calMemoAssignments: calMemoAssignments,
      config: {
        minWage: mw ? parseFloat(mw.value) : 1057,
        nightRate: nr ? parseFloat(nr.value) : 1.25,
        storeName: currentStore
      }
    };

    fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      hideLoading();
      if (data.status === "conflict") {
        alert("⚠️ 【競合エラー】\n" + data.message);
        loadAllFromSheets();
      } else if (data.status === "success") {
        serverLastUpdated = data.lastUpdated;
      }
      resolve();
    })
    .catch(err => {
      hideLoading();
      console.error("保存エラー:", err);
      resolve();
    });
  });
}

// ==========================================
// 画面遷移（タブ切り替え）ロジック
// ==========================================
async function switchTab(tabId) {
  await saveAllNow();

  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  let targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  
  let btn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
  if (btn) btn.classList.add('active');

  if (tabId === 'tab-calendar') {
    renderCalendarTab();
  } else if (tabId === 'tab-fixed') {
    renderFixedShiftTable();
  } else if (tabId === 'tab-off-input') {
    renderOffInputTab();
  } else if (tabId === 'tab-help') {
    renderHelpTab();
  } else if (tabId === 'tab-slots') {
    recalculateAll();
  }
}

// ==========================================
// ① シフト枠設定
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

    let startSelectHtml = `<select class="editable-input" onchange="updateSlotData(${index}, 'start', this.value)">`;
    TIME_OPTIONS.forEach(t => {
      let sel = (item.start === t) ? 'selected' : '';
      startSelectHtml += `<option value="${t}" ${sel}>${t}</option>`;
    });
    startSelectHtml += `</select>`;

    let endSelectHtml = `<select class="editable-input" onchange="updateSlotData(${index}, 'end', this.value)">`;
    TIME_OPTIONS.forEach(t => {
      let sel = (item.end === t) ? 'selected' : '';
      endSelectHtml += `<option value="${t}" ${sel}>${t}</option>`;
    });
    endSelectHtml += `</select>`;

    let moveButtons = `
      <button class="btn" style="padding:1px 5px; font-size:10px; margin-right:2px;" ${index === 0 ? 'disabled' : ''} onclick="moveSlot(${index}, -1)">▲</button>
      <button class="btn" style="padding:1px 5px; font-size:10px;" ${index === slotData.length - 1 ? 'disabled' : ''} onclick="moveSlot(${index}, 1)">▼</button>
    `;

    let defaultSlotNames = ['朝勤', '昼勤', '夕勤', '夜勤', '準夜勤/フォロー'];
    let deleteButton = '';
    if (!defaultSlotNames.includes(item.name)) {
      deleteButton = `<button class="btn btn-danger" style="padding:2px 6px; font-size:10px; margin-left:6px;" onclick="deleteSlotRow(${index})">削除</button>`;
    }

    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${moveButtons}</td>
      <td><input type="text" class="editable-input" value="${item.name}" onchange="updateSlotData(${index}, 'name', this.value)"></td>
      <td>${startSelectHtml}</td>
      <td>${endSelectHtml}</td>
      <td><strong>${dur.toFixed(1)} h</strong></td>
      <td><input type="number" class="editable-input" value="${item.slots}" min="0" max="5" onchange="updateSlotData(${index}, 'slots', parseInt(this.value)||0)"></td>
      <td><strong>${dailyHours.toFixed(1)} 時間</strong></td>
      <td>
        <strong style="color:var(--primary);">¥${Math.round(dailyCost*30).toLocaleString()}</strong>
        ${deleteButton}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // KPIカードの更新
  let dc = document.getElementById('kpi-daily-cost');
  let dh = document.getElementById('kpi-daily-hours');
  let mc = document.getElementById('kpi-monthly-cost');
  let ts = document.getElementById('kpi-total-slots');

  if (dc) dc.innerText = '¥' + Math.round(totalDailyCost).toLocaleString();
  if (dh) dh.innerText = '総稼働時間: ' + totalDailyHours.toFixed(1) + ' 時間 / 日';
  if (mc) mc.innerText = '¥' + Math.round(totalDailyCost * 30).toLocaleString();
  if (ts) ts.innerText = totalSlotsCount + ' 枠 / 日';

  // ★ 追加：指定曜日間の人件費試算の計算と反映
  let d1El = document.getElementById('range-day-1');
  let d2El = document.getElementById('range-day-2');
  let rangeCostEl = document.getElementById('custom-range-cost');
  
  if (d1El && d2El && rangeCostEl) {
    const daysOrder = ['月', '火', '水', '木', '金', '土', '日'];
    let i1 = daysOrder.indexOf(d1El.value);
    let i2 = daysOrder.indexOf(d2El.value);
    let dayCount = 0;
    
    if (i1 !== -1 && i2 !== -1) {
      if (i2 >= i1) {
        dayCount = (i2 - i1) + 1;
      } else {
        dayCount = (daysOrder.length - i1) + i2 + 1;
      }
      // 1ヶ月（4週間強＝月4.3週換算、あるいは単純に日数×週数など。既存のロジックに合わせて週数分のコストを算出）
      // ここでは選択された曜日数×4.3週分、または指定日数分の月間トータルとして算出
      let monthlyRangeCost = totalDailyCost * dayCount * 4.3;
      rangeCostEl.innerText = '¥' + Math.round(monthlyRangeCost).toLocaleString();
    }
  }

  renderGanttChart();
}

function updateSlotData(index, field, value) {
  slotData[index][field] = value;
  recalculateAll();
  autoSave();
}

function addSlotRow() {
  slotData.push({ name: '新規シフト', start: '09:00', end: '18:00', slots: 1, colorClass: 'bg-morning' });
  recalculateAll();
  autoSave();
}

function deleteSlotRow(index) {
  let defaultSlotNames = ['朝勤', '昼勤', '夕勤', '夜勤', '準夜勤/フォロー'];
  if (defaultSlotNames.includes(slotData[index].name)) {
    alert("初期シフト枠は削除できません。");
    return;
  }
  if (confirm('このシフト枠を削除しますか？')) {
    slotData.splice(index, 1);
    recalculateAll();
    autoSave();
  }
}

function moveSlot(index, direction) {
  let newIndex = index + direction;
  if (newIndex < 0 || newIndex >= slotData.length) return;
  let temp = slotData[index];
  slotData[index] = slotData[newIndex];
  slotData[newIndex] = temp;
  recalculateAll();
  autoSave();
}

function renderGanttChart() {
  let container = document.getElementById('gantt-chart-container');
  if (!container) return;
  container.innerHTML = '';

  // 朝6時（06:00 = 360分）を起点とした経過分を計算するヘルパー
  let getMinutesFrom06 = (timeStr) => {
    if (!timeStr) return 0;
    let parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    
    // 6時未満（深夜0時〜5時台など）の場合は翌日扱いとして24時間を足す
    if (h < 6) {
      h += 24;
    }
    return (h * 60 + m) - (6 * 60); // 06:00 を 0分 とする
  };

  let totalMinutesInDay = 26 * 60; // 6時〜翌8時までの総分（1560分）

  slotData.forEach((item) => {
    let startMin = getMinutesFrom06(item.start);
    let endMin = getMinutesFrom06(item.end);

    // 夜をまたぐシフト（例: 22:00〜08:00）で終了時間が開始時間より小さくなる場合のケア
    if (endMin <= startMin) {
      endMin += 24 * 60;
    }

    let durMinutes = endMin - startMin;
    let startPct = (startMin / totalMinutesInDay) * 100;
    let widthPct = (durMinutes / totalMinutesInDay) * 100;

    for (let i = 1; i <= item.slots; i++) {
      let row = document.createElement('div');
      row.className = 'gantt-row';
      row.style.margin = '2px 0';
      row.innerHTML = `
        <div class="gantt-label" style="font-size:11px;">${item.name} 枠${i}</div>
        <div class="gantt-timeline" style="position:relative; height:20px;">
          <div class="gantt-bar-wrapper ${item.colorClass}" style="left:${startPct}%; width:${widthPct}%; font-size:10px; padding:1px 4px;">${item.start}-${item.end}</div>
        </div>
      `;
      container.appendChild(row);
    }
  });
}

// ==========================================
// ② スタッフ管理
// ==========================================
function renderStaffTable() {
  let tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  staffList.forEach((s, idx) => {
    let tr = document.createElement('tr');
    
    let dowHtml = '<div class="dow-group">';
    DOW_OPTIONS.forEach(d => {
      let checked = (s.days && s.days.includes(d)) ? 'checked' : '';
      dowHtml += `<label class="dow-item"><input type="checkbox" ${checked} onchange="toggleStaffDow(${idx}, '${d}')"> ${d}</label>`;
    });
    dowHtml += '</div>';

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
  staffList.push({ id: String(staffList.length + 1), name: '新規スタッフ', days: ['月','火','水','木','金'], time: '全時間帯', note: '' });
  renderStaffTable();
  autoSave();
}

// ==========================================
// ③ 固定シフト表
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
          let dowCharMap = ['月', '火', '水', '木', '金', '土', '日'];
          let targetDow = dowCharMap[dayIdx];
          let isAvailable = (s.days && s.days.includes(targetDow));

          let daysText = (s.days && s.days.length > 0) ? s.days.join('') : '希望なし';
          let label = `${s.name} (希望:${daysText}${isAvailable ? ' ★出勤可' : ''})`;
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
        <span>(希望曜日: ${(s.days||[]).join('') || 'なし'})</span>
      </div>
    `;
    sidebarContainer.appendChild(card);
  });
}

// ==========================================
// ④ 暦シフト表 (1週間ガント＆1か月カレンダーのスタイル個別分離)
// ==========================================
function initCalendarTabControls() {
  let picker = document.getElementById('cal-month-picker');
  if (!picker) return;
  picker.innerHTML = '';

  let baseInput = document.getElementById('cal-base-date');
  let baseDate = new Date(baseInput ? baseInput.value : Date.now());

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
  if (baseInput) baseInput.value = ym + '-01';
  renderCalendarTab();
  autoSave();
}

function renderCalendarTab() {
  initCalendarTabControls();
  let baseInput = document.getElementById('cal-base-date');
  
  let modeSelect = document.getElementById('cal-mode-select');
  let mode = modeSelect ? modeSelect.value : 'week';

  // ★修正: 未設定の場合は強制的に「今日」の年月日を自動取得してセットする
  if (!baseInput || !baseInput.value) {
    let now = new Date();
    let yyyy = now.getFullYear();
    let mm = String(now.getMonth() + 1).padStart(2, '0');
    let dd = String(now.getDate()).padStart(2, '0');
    if (baseInput) {
      baseInput.value = `${yyyy}-${mm}-${dd}`;
    }
  }

  let baseDate = new Date(baseInput.value);
  let container = document.getElementById('cal-month-days-container');
  if (!container) return;

  if (mode === 'week') {
    container.className = ""; 
    renderWeekGanttCalendar(baseDate);
  } else {
    container.className = "cal-grid"; 
    renderMonthTableCalendar(baseDate);
  }
}

function getFixedAssignmentFallback(curDate, rowIdx) {
  let dow = curDate.getDay();
  let fixedDayIdx = (dow === 0) ? 6 : dow - 1;
  let key = `${rowIdx}_${fixedDayIdx}`;
  return fixedAssignments[key] || '';
}

// 1週間ガントチャート表示 (月曜〜日曜自動算出 ＆ タップでステータス変更プルダウン)
function renderWeekGanttCalendar(baseDate) {
  let titleEl = document.getElementById('cal-month-title');
  let container = document.getElementById('cal-month-days-container');
  if (!container) return;
  container.innerHTML = '';

  let currentDay = new Date(baseDate);
  let dow = currentDay.getDay(); 
  let diffToMonday = (dow === 0) ? -6 : (1 - dow);
  let startOfWeek = new Date(currentDay);
  startOfWeek.setDate(currentDay.getDate() + diffToMonday);

  if (titleEl) {
    let startYMD = `${startOfWeek.getFullYear()}年${startOfWeek.getMonth()+1}月${startOfWeek.getDate()}日`;
    let endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    let endYMD = `${endOfWeek.getMonth()+1}月${endOfWeek.getDate()}日`;
    titleEl.innerText = `📅 1週間ガント表示 (月曜〜日曜: ${startYMD} 〜 ${endYMD})`;
  }

  let dowNames = ['月', '火', '水', '木', '金', '土', '日'];

  let getOffsetPercent = (timeStr) => {
    let h = timeToHours(timeStr);
    if (h < 8) h += 24;
    let adjusted = h - 8;
    return (adjusted / 24) * 100;
  };

  let scrollWrapper = document.createElement('div');
  scrollWrapper.style.cssText = "width: 100%; max-height: 700px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #fafafa; box-sizing: border-box;";

  for (let i = 0; i < 7; i++) {
    let curDate = new Date(startOfWeek);
    curDate.setDate(startOfWeek.getDate() + i);

    let yyyy = curDate.getFullYear();
    let mm = String(curDate.getMonth() + 1).padStart(2, '0');
    let dd = String(curDate.getDate()).padStart(2, '0');
    let dateStr = `${yyyy}-${mm}-${dd}`;

    let holidayName = getHolidayName(curDate);
    let dowNum = curDate.getDay();
    let dateNumStyle = (dowNum === 0 || holidayName) ? 'color:#e53e3e;' : (dowNum === 6 ? 'color:#3182ce;' : '');
    let holidayTagHtml = holidayName ? `<span class="cal-holiday-tag">${holidayName}</span>` : '';

    let dayBox = document.createElement('div');
    dayBox.style.cssText = "width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); box-sizing: border-box;";

    let headerHtml = `
      <div style="border-bottom: 2px solid #edf2f7; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="${dateNumStyle} font-weight: bold; font-size: 15px;">${curDate.getMonth()+1}月${curDate.getDate()}日 (${dowNames[i]})</span>
        ${holidayTagHtml}
      </div>
    `;

    let ganttRowsHtml = '<div style="width: 100%; box-sizing: border-box;"><div style="font-size: 11px; color: gray; font-weight: bold; margin-bottom: 8px;">📊 ガントチャート図 (バーをタップしてステータス変更):</div>';

    let rowIdx = 0;
    slotData.forEach(item => {
      for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
        rowIdx++;
        let key = `${dateStr}_${rowIdx}`;
        let defaultVal = getFixedAssignmentFallback(curDate, rowIdx);
        let assignedVal = (calAssignments[key] !== undefined) ? calAssignments[key] : defaultVal;
        let currentMemo = calMemoAssignments[key] || '';

        let barColor = 'background:#2b6cb0;';
        if (!assignedVal || assignedVal === '') {
          barColor = 'background:#e53e3e;';
          assignedVal = '未設定';
        } else if (assignedVal === '【ヘルプ募集中】') {
          barColor = 'background:#dd6b20;';
        } else {
          let req = offRequestsStore[key];
          if (req && req.finalizedStaff && req.finalizedStaff === assignedVal) {
            barColor = 'background:#38a169;';
          }
        }

        let startPct = getOffsetPercent(item.start);
        let widthPct = (calcDuration(item.start, item.end) / 24) * 100;
        
        ganttRowsHtml += `
          <div style="font-size: 11px; color: #4a5568; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;">
            <span style="width: 130px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;" title="${item.name}">${item.name}:</span>
            <div style="flex-grow: 1; position: relative; height: 26px; background: #edf2f7; border-radius: 3px; width: 100%;">
              <div style="position: absolute; left: ${startPct}%; width: ${widthPct}%; height: 100%; ${barColor} color: white; font-size: 10px; line-height: 26px; text-align: center; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer;" 
                   title="タップしてステータsス変更">
                <span onclick="promptChangeMemo('${key}', '${assignedVal}')" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis;">${assignedVal}${currentMemo ? ` [${currentMemo}]` : ''} ✏️</span>
              </div>
            </div>
          </div>
        `;
      }
    });

    ganttRowsHtml += '</div>';
    dayBox.innerHTML = headerHtml + ganttRowsHtml;
    scrollWrapper.appendChild(dayBox);
  }

  container.appendChild(scrollWrapper);
}

// ★修正: リストから選択式でステータス変更するポップアップダイアログ
function promptChangeMemo(key, staffName) {
  if (staffName === '未設定' || staffName === '【ヘルプ募集中】') {
    alert("スタッフがアサインされている枠のみステータスを変更できます。");
    return;
  }
  let current = calMemoAssignments[key] || '';
  
  // 選択肢リストからのプロンプト入力
  let choice = prompt(`【${staffName} のステータス選択】\n以下の番号または名称を入力してください。\n\n1: 突発休み\n2: 遅刻\n3: 早退\n(クリアする場合は空欄にしてOK)`, current);
  
  if (choice !== null) {
    let clean = choice.trim();
    let newVal = "";
    if (clean === "1" || clean.includes("突発休み")) newVal = "突発休み";
    else if (clean === "2" || clean.includes("遅刻")) newVal = "遅刻";
    else if (clean === "3" || clean.includes("早退")) newVal = "早退";
    else if (clean === "") newVal = "";
    else newVal = clean; // 直接入力された場合も許容

    if (newVal === "") {
      delete calMemoAssignments[key];
    } else {
      calMemoAssignments[key] = newVal;
    }
    renderCalendarTab();
    autoSave();
  }
}

// 1か月テーブルマトリクス表示 (通常のカレンダー体裁・グリッドデザイン)
function renderMonthTableCalendar(baseDate) {
  let year = baseDate.getFullYear();
  let month = baseDate.getMonth();

  let titleEl = document.getElementById('cal-month-title');
  if (titleEl) titleEl.innerText = `📅 ${year}年 ${month + 1}月 マトリクスシフト表`;

  let container = document.getElementById('cal-month-days-container');
  if (!container) return;
  container.innerHTML = '';

  // 1か月表示は従来の通常のカレンダーグリッドレイアウトに戻す
  container.className = "cal-grid";

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
    let dateNumStyle = (dowNum === 0 || holidayName) ? 'color:#e53e3e;' : (dowNum === 6 ? 'color:#3182ce;' : '');
    let holidayTagHtml = holidayName ? `<span class="cal-holiday-tag" style="font-size:9px; padding:1px 4px;">${holidayName}</span>` : '';

    let tableRowsHtml = '';
    let rowIdx = 0;

    slotData.forEach(item => {
      for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
        rowIdx++;
        let key = `${dateStr}_${rowIdx}`;
        let defaultVal = getFixedAssignmentFallback(curDate, rowIdx);
        let assignedVal = (calAssignments[key] !== undefined) ? calAssignments[key] : defaultVal;
        let currentMemo = calMemoAssignments[key] || '';

        let badgeBg = '#ebf8ff';
        let badgeColor = '#2b6cb0';

        if (currentMemo) {
          badgeBg = '#fed7d7'; badgeColor = '#9b2c2c'; 
        } else if (!assignedVal) {
          badgeBg = '#fed7d7'; badgeColor = '#9b2c2c'; assignedVal = '未設定';
        } else if (assignedVal === '【ヘルプ募集中】') {
          badgeBg = '#feebc8'; badgeColor = '#c05621';
        } else {
          let req = offRequestsStore[key];
          if (req && req.finalizedStaff && req.finalizedStaff === assignedVal) {
            badgeBg = '#c6f6d5'; badgeColor = '#22543d';
          }
        }

        let displayText = assignedVal;
        if (currentMemo) {
          displayText += ` (${currentMemo})`;
        }

        tableRowsHtml += `
          <tr>
            <td style="padding:2px 4px; border:1px solid #edf2f7; font-size:10px;">${item.name}</td>
            <td style="padding:2px 4px; border:1px solid #edf2f7; font-size:10px; background:${badgeBg}; color:${badgeColor}; font-weight:bold; text-align:center;">${displayText}</td>
          </tr>
        `;
      }
    });

    let cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    cell.style.padding = '6px';
    cell.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #edf2f7; padding-bottom:2px; margin-bottom:4px;">
        <span style="${dateNumStyle} font-weight:bold; font-size:12px;">${day}</span>
        ${holidayTagHtml}
      </div>
      <table style="width:100%; border-collapse:collapse; margin-top:2px;">
        ${tableRowsHtml}
      </table>
    `;
    container.appendChild(cell);
  }
}

function updateCalMemo(key, val) {
  if (val) {
    calMemoAssignments[key] = val;
  } else {
    delete calMemoAssignments[key];
  }
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
// ⑤ 休み実績・希望休入力ロジック
// ==========================================
function renderOffInputTab() {
  let selectEl = document.getElementById('off-staff-select');
  if (!selectEl) return;
  
  let currentSelected = selectEl.value;
  selectEl.innerHTML = '';

  staffList.forEach(s => {
    let opt = document.createElement('option');
    opt.value = s.name;
    opt.innerText = s.name;
    if (s.name === currentSelected) opt.selected = true;
    selectEl.appendChild(opt);
  });

  let selectedStaff = selectEl.value || (staffList[0] ? staffList[0].name : '');
  let today = new Date();
  today.setHours(0,0,0,0);

  let urgentTbody = document.getElementById('off-urgent-tbody');
  let normalTbody = document.getElementById('off-normal-tbody');
  if (!urgentTbody || !normalTbody) return;

  urgentTbody.innerHTML = '';
  normalTbody.innerHTML = '';

  let dowNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let offset = 0; offset <= 30; offset++) {
    let targetDate = new Date(today.getTime());
    targetDate.setDate(today.getDate() + offset);

    let yyyy = targetDate.getFullYear();
    let mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    let dd = String(targetDate.getDate()).padStart(2, '0');
    let dateStr = `${yyyy}-${mm}-${dd}`;
    let dowStr = dowNames[targetDate.getDay()];

    let rowIdx = 0;
    slotData.forEach(item => {
      for (let sIdx = 1; sIdx <= item.slots; sIdx++) {
        rowIdx++;
        let key = `${dateStr}_${rowIdx}`;
        let assigned = calAssignments[key] || getFixedAssignmentFallback(targetDate, rowIdx);

        if (assigned === selectedStaff) {
          let isUrgent = (offset < 15);
          let isChecked = offRequestsStore[key] ? 'checked' : '';
          let noteVal = offRequestsStore[key] ? (offRequestsStore[key].reason || '') : '';

          let tr = document.createElement('tr');
          if (isUrgent) { tr.style.backgroundColor = '#fff5f5'; }

          tr.innerHTML = `
            <td><strong>${dateStr}</strong></td>
            <td><strong>(${dowStr})</strong></td>
            <td><span class="sidebar-stat-badge">${item.name} (${item.start}-${item.end})</span></td>
            <td>
              <input type="checkbox" ${isChecked} onchange="toggleOffRequest('${key}', '${selectedStaff}', '${dateStr}', '${item.name}', ${isUrgent}, this.checked)">
              <span style="font-size:12px; margin-left:4px; font-weight:bold; ${isUrgent ? 'color:#e53e3e;' : ''}">
                ${isUrgent ? '緊急休み' : '休み希望'}
              </span>
            </td>
            <td>
              <input type="text" class="editable-input" value="${noteVal}" placeholder="フリーコメント欄" onchange="updateOffReason('${key}', this.value)">
            </td>
          `;

          if (isUrgent) { urgentTbody.appendChild(tr); }
          else { normalTbody.appendChild(tr); }
        }
      }
    });
  }

  if (urgentTbody.children.length === 0) {
    urgentTbody.innerHTML = '<tr><td colspan="5" style="color:gray; text-align:center;">※直近15日以内に該当スタッフの勤務予定はありません。</td></tr>';
  }
  if (normalTbody.children.length === 0) {
    normalTbody.innerHTML = '<tr><td colspan="5" style="color:gray; text-align:center;">※16日〜30日後に該当スタッフの勤務予定はありません。</td></tr>';
  }

  renderOffSummaryTable();
}

function renderOffSummaryTable() {
  let summaryTbody = document.getElementById('off-summary-tbody');
  if (!summaryTbody) return;
  summaryTbody.innerHTML = '';

  let storeName = document.getElementById('store-select')?.value || currentStore;
  let todayStr = new Date().toISOString().split('T')[0];

  let pStore = document.getElementById('off-summary-store-name');
  let pDate = document.getElementById('off-summary-base-date');
  if (pStore) pStore.innerText = storeName;
  if (pDate) pDate.innerText = todayStr;

  staffList.forEach(s => {
    let hist = HISTORICAL_6MONTH_DATA[s.name] || { prescribed: 106, urgentOff: 0, reqOff: 0, helpCount: 0 };

    let currentUrgentOff = 0;
    let currentReqOff = 0;
    let currentHelpCount = 0;

    Object.keys(offRequestsStore).forEach(key => {
      let req = offRequestsStore[key];
      if (req.staffName === s.name) {
        if (req.isUrgent) currentUrgentOff++;
        else currentReqOff++;
      }
      if (req.finalizedStaff === s.name) {
        currentHelpCount++;
      }
    });

    let totalPrescribed = hist.prescribed;
    let totalUrgentOff = hist.urgentOff + currentUrgentOff;
    let totalReqOff = hist.reqOff + currentReqOff;
    let totalHelpCount = hist.helpCount + currentHelpCount;

    let totalActualDays = Math.max(0, totalPrescribed - totalUrgentOff - totalReqOff + totalHelpCount);
    let urgentOffRate = (totalPrescribed > 0) ? Math.round((totalUrgentOff / totalPrescribed) * 100) : 0;
    let attendRate = (totalPrescribed > 0) ? Math.min(100, Math.round((totalActualDays / totalPrescribed) * 100)) : 100;

    let priorityBadge = '';
    if (attendRate >= 100 && totalUrgentOff === 0) {
      priorityBadge = '<span class="sidebar-stat-badge" style="background:#c6f6d5; color:#22543d;">最優先 (希望通り反映)</span>';
    } else if (totalUrgentOff > 0 || attendRate < 85) {
      priorityBadge = '<span class="sidebar-stat-badge" style="background:#fed7d7; color:#9b2c2c;">調整・削減対象</span>';
    } else {
      priorityBadge = '<span class="sidebar-stat-badge" style="background:#ebf8ff; color:#2b6cb0;">標準設定</span>';
    }

    let tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.id}</strong></td>
      <td><strong>${s.name}</strong></td>
      <td><strong>${totalPrescribed} 日</strong></td>
      <td style="${totalUrgentOff > 0 ? 'color:#e53e3e; font-weight:bold;' : ''}">${totalUrgentOff} 日</td>
      <td>${totalReqOff} 日</td>
      <td><strong>${totalActualDays} 日</strong></td>
      <td><strong style="${urgentOffRate > 0 ? 'color:#e53e3e;' : 'color:#38a169;'}">${urgentOffRate} %</strong></td>
      <td><strong style="${attendRate >= 95 ? 'color:#38a169;' : 'color:#dd6b20;'}">${attendRate} %</strong></td>
      <td>${priorityBadge}</td>
    `;
    summaryTbody.appendChild(tr);
  });
}

function toggleOffRequest(key, staffName, dateStr, slotName, isUrgent, isChecked) {
  if (isChecked) {
    if (!offRequestsStore[key]) {
      offRequestsStore[key] = {
        staffName: staffName,
        dateStr: dateStr,
        slotName: slotName,
        isUrgent: isUrgent,
        reason: '',
        candidates: {},
        finalizedStaff: ''
      };
    }
    calAssignments[key] = '【ヘルプ募集中】';
  } else {
    delete offRequestsStore[key];
    delete calAssignments[key];
  }
  renderCalendarTab();
  renderHelpTab();
  renderOffSummaryTable();
  autoSave();
}

function updateOffReason(key, reasonVal) {
  if (offRequestsStore[key]) {
    offRequestsStore[key].reason = reasonVal;
    renderHelpTab();
    autoSave();
  }
}

// ==========================================
// ⑥ ヘルプ募集・管理機能
// ==========================================
function renderHelpTab() {
  let urgentTbody = document.getElementById('help-urgent-tbody');
  let normalTbody = document.getElementById('help-normal-tbody');
  if (!urgentTbody || !normalTbody) return;

  urgentTbody.innerHTML = '';
  normalTbody.innerHTML = '';

  let keys = Object.keys(offRequestsStore);

  keys.forEach(key => {
    let req = offRequestsStore[key];
    let tr = document.createElement('tr');

    let candHtml = '<div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">';
    staffList.forEach(s => {
      let isCand = req.candidates && req.candidates[s.name];
      let checked = isCand ? 'checked' : '';
      let tsText = isCand ? `<span class="candidate-timestamp" style="font-size:10px; color:gray;">(${req.candidates[s.name]})</span>` : '';

      candHtml += `
        <div class="candidate-item" style="background:#f7fafc; padding:4px 8px; border-radius:4px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:4px;">
          <label style="cursor:pointer; font-weight:normal; display:flex; align-items:center; gap:4px; margin:0; font-size:12px;">
            <input type="checkbox" ${checked} onchange="toggleHelpCandidate('${key}', '${s.name}', this.checked)">
            <strong>${s.name}</strong>
          </label>
          ${tsText}
        </div>
      `;
    });
    candHtml += '</div>';

    let managerHtml = `<div>`;
    let finalized = req.finalizedStaff || '';

    let selHtml = `<select class="editable-input" id="mgr-select-${key}" style="font-size:12px; margin-bottom:4px;" ${finalized ? 'disabled' : ''}>`;
    selHtml += `<option value="">-- 決定スタッフを選択 --</option>`;
    staffList.forEach(s => {
      let isCand = req.candidates && req.candidates[s.name];
      let sel = (finalized === s.name) ? 'selected' : '';
      selHtml += `<option value="${s.name}" ${sel}>${s.name} ${isCand ? '[候補あり]' : ''}</option>`;
    });
    selHtml += `</select>`;

    let isApproved = finalized ? 'checked' : '';
    let approvalBox = `
      <div class="manager-decision-box">
        <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:12px;">
          <input type="checkbox" ${isApproved} onchange="toggleManagerApproval('${key}', this.checked)">
          <span>👑 責任者決定 (確定反映)</span>
        </label>
      </div>
    `;

    managerHtml += selHtml + approvalBox + `</div>`;

    tr.innerHTML = `
      <td>${new Date().toISOString().split('T')[0].replace(/-/g, '/')}</td>
      <td><strong>${req.dateStr}</strong></td>
      <td><strong>${req.staffName}</strong></td>
      <td><span class="sidebar-stat-badge">${req.slotName}</span><br><small style="color:gray;">(${req.reason || 'フリーコメントなし'})</small></td>
      <td>${candHtml}</td>
      <td>${managerHtml}</td>
    `;

    if (req.isUrgent) { urgentTbody.appendChild(tr); }
    else { normalTbody.appendChild(tr); }
  });

  if (urgentTbody.children.length === 0) {
    urgentTbody.innerHTML = '<tr><td colspan="6" style="color:gray; text-align:center;">※現在、直近15日未満の緊急ヘルプ募集はありません。</td></tr>';
  }
  if (normalTbody.children.length === 0) {
    normalTbody.innerHTML = '<tr><td colspan="6" style="color:gray; text-align:center;">※現在、通常のヘルプ募集はありません。</td></tr>';
  }
}

function toggleHelpCandidate(key, staffName, isChecked) {
  if (offRequestsStore[key]) {
    if (!offRequestsStore[key].candidates) {
      offRequestsStore[key].candidates = {};
    }
    if (isChecked) {
      let now = new Date();
      let mm = String(now.getMonth() + 1).padStart(2, '0');
      let dd = String(now.getDate()).padStart(2, '0');
      let hh = String(now.getHours()).padStart(2, '0');
      let min = String(now.getMinutes()).padStart(2, '0');
      let ts = `${mm}/${dd} ${hh}:${min}`;

      offRequestsStore[key].candidates[staffName] = ts;
    } else {
      delete offRequestsStore[key].candidates[staffName];
    }
    renderHelpTab();
    autoSave();
  }
}

function toggleManagerApproval(key, isChecked) {
  if (offRequestsStore[key]) {
    let selectEl = document.getElementById(`mgr-select-${key}`);
    let chosenStaff = selectEl ? selectEl.value : '';

    if (isChecked) {
      if (!chosenStaff) {
        alert('決定するヘルプスタッフをドロップダウンから選択してください。');
        renderHelpTab();
        return;
      }
      offRequestsStore[key].finalizedStaff = chosenStaff;
      calAssignments[key] = chosenStaff;
    } else {
      offRequestsStore[key].finalizedStaff = '';
      calAssignments[key] = '【ヘルプ募集中】';
    }
    renderCalendarTab();
    renderHelpTab();
    renderOffSummaryTable();
    autoSave();
  }
}

// ==========================================
// 初期化実行 (初回ロード時は暦シフト表を開く)
// ==========================================
renderStoreSelect();
loadAllFromSheets();

window.addEventListener('DOMContentLoaded', () => {
  renderStaffTable();
  renderFixedShiftTable();
  renderOffInputTab();
  renderHelpTab();
  
  setTimeout(() => {
    switchTab('tab-calendar');
  }, 100);
});
