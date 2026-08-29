// 1か月テーブルマトリクス表示（突発メモの連動反映対応）
function renderMonthTableCalendar(baseDate) {
  let year = baseDate.getFullYear();
  let month = baseDate.getMonth();

  let titleEl = document.getElementById('cal-month-title');
  if (titleEl) titleEl.innerText = `📅 ${year}年 ${month + 1}月 マトリクスシフト表`;

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
        let currentMemo = calMemoAssignments[key] || ''; // 突発メモ（突発休み・遅刻・早退など）

        let badgeBg = '#ebf8ff';
        let badgeColor = '#2b6cb0';

        // ステータスに応じたカラーとバッジの調整
        if (currentMemo) {
          badgeBg = '#fed7d7'; badgeColor = '#9b2c2c'; // 突発メモがある場合は赤系で目立たせる
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

        // 表示テキスト：スタッフ名 ＋ メモがあればバッジ/アイコン表示
        let displayText = assignedVal;
        if (currentMemo) {
          displayText += ` <span style="font-size:9px; background:#e53e3e; color:white; padding:1px 3px; border-radius:2px;">${currentMemo}</span>`;
        }

        tableRowsHtml += `
          <tr>
            <td style="padding:2px 4px; border:1px solid #edf2f7; font-size:10px;">${item.name}</td>
            <td style="padding:2px 4px; border:1px solid #edf2f7; font-size:10px; background:${badgeBg}; color:${badgeColor}; font-weight:bold; text-align:center;" title="${currentMemo ? 'ステータス:'+currentMemo : ''}">${displayText}</td>
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
