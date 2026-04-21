// ==========================================
// 1. Core Functions
// ==========================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ระบบแจ้งเตือนคำขอหนังสือบำเหน็จค้ำประกัน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// 2. Setup & Database Functions
// ==========================================
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ชีต requests
  let reqSheet = ss.getSheetByName('requests');
  if (!reqSheet) {
    reqSheet = ss.insertSheet('requests');
    const headers = [
      'id', 'วันที่บันทึก', 'เวลา', 'timestamp', 'ชื่อ', 'นามสกุล', 'ชื่อ-นามสกุล', 
      'ส่วนราชการ', 'เลขบัตรประชาชน', 'เลขบัตรแบบปิดบางส่วน', 'สถานะคำขอ', 
      'ผู้บันทึก', 'หมายเหตุ', 'telegram_status', 'created_at'
    ];
    reqSheet.appendRow(headers);
    reqSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
    reqSheet.setFrozenRows(1);
  }
  
  // 2. ชีต settings
  let setSheet = ss.getSheetByName('settings');
  if (!setSheet) {
    setSheet = ss.insertSheet('settings');
    const headers = ['key', 'value', 'description'];
    setSheet.appendRow(headers);
    setSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
    
    // Default settings
    const defaultSettings = [
      ['TELEGRAM_BOT_TOKEN', 'ใส่_TOKEN_ที่นี่', 'Token จาก BotFather'],
      ['TELEGRAM_CHAT_ID', 'ใส่_CHAT_ID_ที่นี่', 'Chat ID ของกลุ่มหรือบุคคล'],
      ['SEND_FULL_ID', 'FALSE', 'ตั้งเป็น TRUE หากต้องการส่งเลขบัตรเต็มไปใน Telegram'],
      ['APP_TITLE', 'ระบบบำเหน็จค้ำประกัน', 'ชื่อระบบ'],
      ['ENABLE_DASHBOARD', 'TRUE', 'เปิด/ปิด หน้า Dashboard']
    ];
    
    defaultSettings.forEach(row => setSheet.appendRow(row));
    setSheet.setFrozenRows(1);
    setSheet.autoResizeColumns(1, 3);
  }
  
  return "สร้างฐานข้อมูลเริ่มต้นสำเร็จ!";
}

function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('settings');
  if (!sheet) return {};
  
  const data = sheet.getDataRange().getValues();
  let settings = {};
  
  for (let i = 1; i < data.length; i++) {
    // ป้องกัน Error กรณีแถวว่าง และใช้ .toString().trim() เพื่อตัดช่องว่างที่มองไม่เห็นทิ้งทั้งหมด
    if (data[i][0]) {
      let key = data[i][0].toString().trim();
      let value = data[i][1] !== null && data[i][1] !== undefined ? data[i][1].toString().trim() : '';
      settings[key] = value;
    }
  }
  return settings;
}

// ==========================================
// 3. Form Validation & Processing
// ==========================================
function validateCitizenId(id) {
  if (!id || id.length !== 13 || !/^\d{13}$/.test(id)) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id.charAt(i)) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(id.charAt(12));
}

function maskCitizenId(id) {
  if (!id || id.length !== 13) return id;
  // Format: 1-2345-XXXXX-12-3
  return `${id.substring(0,1)}-${id.substring(1,5)}-XXXXX-${id.substring(10,12)}-${id.substring(12,13)}`;
}

function isDuplicateRequest(firstName, lastName, citizenId, dateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('requests');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Check: วันที่บันทึก (1), ชื่อ (4), นามสกุล (5), เลขบัตร (8)
    if (row[1] == dateStr && row[4] == firstName && row[5] == lastName && row[8] == citizenId) {
      return true; // Found duplicate
    }
  }
  return false;
}

function saveRequest(data) {
  // Prevent double booking via Lock Service
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10 seconds
    
    // 1. Sanitize & Validate
    const fName = data.firstName.trim();
    const lName = data.lastName.trim();
    const citizenId = data.citizenId.trim();
    const agency = data.agency;
    
    if (!fName || !lName || !citizenId || !agency) {
      throw new Error("กรุณากรอกข้อมูลให้ครบถ้วน");
    }
    if (!validateCitizenId(citizenId)) {
      throw new Error("เลขประจำตัวประชาชนไม่ถูกต้อง");
    }
    
    // Date formats
    const now = new Date();
    const timestamp = now.getTime();
    const reqId = "REQ-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd-HHmmss");
    const dateStr = formatThaiDate(now);
    const timeStr = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm:ss");
    
    // 2. Check Duplicate
    if (isDuplicateRequest(fName, lName, citizenId, dateStr)) {
      throw new Error("ตรวจพบการบันทึกข้อมูลซ้ำซ้อนในวันนี้ สำหรับบุคคลนี้");
    }
    
    // 3. Prepare Data
    const maskedId = maskCitizenId(citizenId);
    const fullName = `${fName} ${lName}`;
    const status = "รออนุมัติ";
    const recorder = "เจ้าหน้าที่"; // สามารถเชื่อม Session.getActiveUser().getEmail() ได้ถ้าบังคับ Login
    const note = "-";
    const createdAt = now;
    
    // 4. Send Telegram
    const settings = getSettings();
    const telegramStatus = sendTelegramNotification({
      reqId: reqId,   // <--- เพิ่มบรรทัดนี้เข้ามาครับ เพื่อส่ง ID ไปให้ Telegram
      name: fullName,
      agency: agency,
      citizenId: citizenId,
      maskedId: maskedId,
      date: dateStr,
      time: timeStr,
      status: status,
      settings: settings
    });
    
    // 5. Save to Sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('requests');
    
    sheet.appendRow([
      reqId, dateStr, timeStr, timestamp, fName, lName, fullName, 
      agency, citizenId, maskedId, status, recorder, note, 
      telegramStatus.statusText, createdAt
    ]);
    
    return { success: true, message: "บันทึกข้อมูลสำเร็จ " + telegramStatus.message };
    
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 4. Telegram Integration
// ==========================================
function sendTelegramNotification(payload) {
  try {
    const token = payload.settings['TELEGRAM_BOT_TOKEN'];
    const chatId = payload.settings['TELEGRAM_CHAT_ID'];
    const sendFullId = payload.settings['SEND_FULL_ID'] === 'TRUE';
    
    if (!token || !chatId || token.includes('ใส่_TOKEN')) return { statusText: 'Not Configured', message: '(ไม่ได้ตั้งค่า)' };
    
    const displayId = sendFullId ? payload.citizenId : payload.maskedId;
    
    const message = `🔔 <b>แจ้งเตือนคำขอหนังสือบำเหน็จค้ำประกัน</b>\n\n` +
                    `👤 <b>ชื่อผู้ขอ:</b> ${payload.name}\n` +
                    `🏢 <b>ส่วนราชการ:</b> ${payload.agency}\n` +
                    `🆔 <b>เลขบัตรประชาชน:</b> <code>${displayId}</code>\n` +
                    `📅 <b>วันที่:</b> ${payload.date} ⏰ ${payload.time}\n` +
                    `📌 <b>สถานะ:</b> ${payload.status}`;
    
    // สร้างปุ่มกดใต้ข้อความ (Inline Keyboard)
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📥 รับเรื่องแล้ว", callback_data: `RECEIVE|${payload.reqId}` },
          { text: "⏳ รอพิจารณา", callback_data: `PENDING|${payload.reqId}` }
        ],
        [
          { text: "✅ อนุมัติแล้ว", callback_data: `APPROVE|${payload.reqId}` }
        ]
      ]
    };
                    
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const options = {
      method: 'post',
      payload: {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: JSON.stringify(keyboard) // แปะปุ่มไปกับข้อความ
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) return { statusText: 'Success', message: 'และส่งแจ้งเตือน Telegram แล้ว' };
    else return { statusText: 'Error', message: '(ส่ง Telegram ไม่สำเร็จ)' };
    
  } catch (e) {
    return { statusText: 'Failed', message: '(ข้อผิดพลาด Telegram)' };
  }
}

// ==========================================
// 5. Dashboard Functions
// ==========================================
function getRequests() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('requests');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  let requests = [];
  
  // เรียงลำดับจากล่าสุดไปเก่าสุด
  for (let i = data.length - 1; i > 0; i--) {
    let rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      
      // 🛡️ SECURITY FIX: ดักกรองข้อมูล ป้องกันคนกด F12
      // ห้ามส่งคอลัมน์ "เลขบัตรประชาชน" (ตัวเต็ม) ออกไปที่หน้าเว็บเด็ดขาด
      if (headers[j] === 'เลขบัตรประชาชน') {
        continue; // ข้ามการแนบข้อมูลนี้ไปเลย
      }
      
      rowObj[headers[j]] = data[i][j];
    }
    
    // ส่ง id แบบแถวไปเพื่ออ้างอิงตอนอัปเดต 
    rowObj['rowNumber'] = i + 1; 
    requests.push(rowObj);
  }
  
  return requests;
}

function updateRequestStatus(rowNumber, status, note, sendNotification) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('requests');
    
    // Update status (col 11) and note (col 13)
    sheet.getRange(rowNumber, 11).setValue(status);
    sheet.getRange(rowNumber, 13).setValue(note);
    
    if (sendNotification) {
      const data = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
      const settings = getSettings();
      
      const payload = {
        name: data[6], // ชื่อ-นามสกุล
        agency: data[7],
        citizenId: data[8],
        maskedId: data[9],
        date: data[1],
        time: data[2],
        status: status,
        settings: settings
      };
      
      // Send Telegram on status change
      const token = settings['TELEGRAM_BOT_TOKEN'];
      const chatId = settings['TELEGRAM_CHAT_ID'];
      if (token && chatId && !token.includes('ใส่_TOKEN')) {
         const message = `🔄 <b>อัปเดตสถานะคำขอ</b>\n\n` +
                    `👤 <b>ผู้ขอ:</b> ${payload.name}\n` +
                    `📌 <b>สถานะใหม่:</b> <b>${status}</b>\n` +
                    `📝 <b>หมายเหตุ:</b> ${note || '-'}\n`;
                    
        UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'post',
          payload: { chat_id: chatId, text: message, parse_mode: 'HTML' },
          muteHttpExceptions: true
        });
      }
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ==========================================
// 6. Utilities & Dictionaries
// ==========================================
function formatThaiDate(date) {
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const d = date.getDate();
  const m = thaiMonths[date.getMonth()];
  const y = date.getFullYear() + 543;
  return `${d} ${m} ${y}`;
}

function getAgencyList() {
  return [
    "สำนักงานประชาสัมพันธ์จังหวัดสกลนคร", "กองอำนวยการรักษาความมั่นคงภายในราชอาณาจักรจังหวัดสกลนคร", "มณฑลทหารบกที่ 29", "โรงพยาบาลค่ายกฤษณ์สีวะรา",
    "สำนักงานธนารักษ์พื้นที่สกลนคร", "สำนักงานคลังจังหวัดสกลนคร", "สำนักงานสรรพสามิตพื้นที่สกลนคร", "สำนักงานสรรพากรพื้นที่สกลนคร",
    "สำนักงานการท่องเที่ยวและกีฬาจังหวัดสกลนคร", "สำนักงานพัฒนาสังคมและความมั่นคงของมนุษย์", "นิคมสร้างตนเองลำน้ำอูน", "บ้านพักเด็กและครอบครัวจังหวัดสกลนคร",
    "สำนักงานเกษตรและสหกรณ์จังหวัดสกลนคร", "โครงการชลประทานจังหวัดสกลนคร", "สำนักงานตรวจบัญชีสหกรณ์สกลนคร", "หน่วยป้องกันและปราบปรามประมงน้ำจืดเขื่อนน้ำอูนสกลนคร",
    "ศูนย์วิจัยและพัฒนาประมงน้ำจืดเขต 3 (สกลนคร)", "สำนักงานประมงจังหวัดสกลนคร", "ศูนย์วิจัยและบำรุงพันธุ์สัตว์สกลนคร", "ศูนย์วิจัยและพัฒนาอาหารสัตว์สกลนคร",
    "สำนักงานปศุสัตว์สกลนคร", "สถานีพัฒนาที่ดินจังหวัดสกลนคร", "ศูนย์วิจัยและพัฒนาการเกษตรสกลนคร", "สำนักงานเกษตรจังหวัดสกลนคร",
    "สำนักงานสหกรณ์จังหวัดสกลนคร", "สำนักงานปฏิรูปที่ดินจังหวัดสกลนคร", "ศูนย์เมล็ดพันธุ์ข้าวสกลนคร", "ศูนย์วิจัยข้าวสกลนคร",
    "ศูนย์หม่อนไหมเฉลิมพระเกียรติสมเด็จพระนางเจ้าสิริกิติ์พระบรมราชินีนาถ สกลนคร", "สำนักงานขนส่งจังหวัดสกลนคร", "สำนักงานทางหลวงที่ 3", "แขวงทางหลวงสกลนครที่ 1 กรมทางหลวง",
    "แขวงทางหลวงสกลนครที่ 2 (สว่างแดนดิน)", "แขวงทางหลวงชนบทจังหวัดสกลนคร", "ท่าอากาศยานสกลนคร", "สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัดสกลนคร",
    "สถานีอุตุนิยมวิทยาสกลนคร", "สำนักงานสถิติจังหวัดสกลนคร", "สำนักงานพลังงานจังหวัดสกลนคร", "สำนักงานพาณิชย์จังหวัดสกลนคร",
    "สำนักงานสาขาชั่งตวงวัด เขต 2-3 สกลนคร", "สำนักงานจังหวัดสกลนคร", "ที่ทำการปกครองจังหวัดสกลนคร", "สำนักงานพัฒนาชุมชนจังหวัดสกลนคร",
    "สำนักงานที่ดินจังหวัดสกลนคร", "ศูนย์ป้องกันและบรรเทาสาธารณภัยเขต 7 สกลนคร", "สำนักงานป้องกันและบรรเทาสาธารณภัยจังหวัดสกลนคร", "สำนักงานโยธาธิการและผังเมืองสกลนคร",
    "สำนักงานส่งเสริมการปกครองท้องถิ่นจังหวัดสกลนคร", "สำนักงานยุติธรรมจังหวัดสกลนคร", "สำนักงานคุมประพฤติจังหวัดสกลนคร", "สำนักงานบังคับคดีจังหวัดสกลนคร",
    "สถานพินิจและคุ้มครองเด็กและเยาวชนจังหวัดสกลนคร", "เรือนจำจังหวัดสกลนคร", "เรือนจำอำเภอสว่างแดนดิน", "สำนักงานแรงงานจังหวัดสกลนคร",
    "สำนักงานจัดหางานจังหวัดสกลนคร", "สำนักงานพัฒนาฝีมือแรงงานสกลนคร", "สำนักงานสวัสดิการและคุ้มครองแรงงานจังหวัดสกลนคร", "สำนักงานประกันสังคมจังหวัดสกลนคร",
    "สำนักงานวัฒนธรรมจังหวัดสกลนคร", "สำนักงานศึกษาธิการภาค 11", "สำนักงานศึกษาธิการจังหวัดสกลนคร", "ศูนย์การศึกษาพิเศษ ประจำจังหวัดสกลนคร",
    "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสกลนคร เขต 1", "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสกลนคร เขต 2", "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสกลนคร เขต 3", "โรงเรียนราชประชานุเคราะห์ 53",
    "โรงเรียนเตรียมอุดมศึกษา ภาคตะวันออกเฉียงเหนือ", "โรงเรียนมัธยมวานรนิวาส", "สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาสกลนคร", "วิทยาลัยเทคนิคสกลนคร",
    "วิทยาลัยอาชีวศึกษาสกลนคร", "วิทยาลัยการอาชีพพรรณานิคม", "วิทยาลัยเทคนิคสว่างแดนดิน", "สถาบันการอาชีวศึกษาภาคตะวันออกเฉียงเหนือ 2",
    "สำนักงานส่งเสริมการเรียนรู้จังหวัดสกลนคร", "สำนักงานสาธารณสุขจังหวัดสกลนคร", "โรงพยาบาลสกลนคร", "โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน",
    "โรงพยาบาลวานรนิวาส", "ศูนย์ควบคุมโรคติดต่อนำโดยแมลงที่ 8.3 สกลนคร", "สำนักงานอุตสาหกรรมจังหวัดสกลนคร", "สำนักงานพระพุทธศาสนาจังหวัดสกลนคร",
    "กองกำกับการตำรวจตระเวนชายแดนที่ 23", "ตำรวจภูธรจังหวัดสกลนคร", "สำนักอำนวยการประจำศาลจังหวัดสกลนคร", "สำนักงานประจำศาลจังหวัดสว่างแดนดิน",
    "สำนักงานประจำศาลเยาวชนและครอบครัวจังหวัดสกลนคร", "สำนักงานอัยการจังหวัดสกลนคร", "สำนักงานอัยการจังหวัดสว่างแดนดิน", "มหาวิทยาลัยราชภัฏสกลนคร",
    "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตสกลนคร", "กลุ่มจังหวัดภาคตะวันออกเฉียงเหนือตอนบน 2", "งบประมาณจังหวัด"
  ];
}

// ==========================================
// 7. Telegram Webhook & Actions (ULTRA FAST VERSION ⚡)
// ==========================================

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("OK");
  
  try {
    const contents = JSON.parse(e.postData.contents);
    if (!contents.callback_query) return ContentService.createTextOutput("OK");
    
    const cb = contents.callback_query;
    const cbId = cb.id;
    
    // --- 1. สเต็ปความไวแสง: หา Token จาก Cache ทันทีโดยไม่ง้อ Sheet ---
    const cache = CacheService.getScriptCache();
    let token = cache.get('BOT_TOKEN');
    
    if (!token) {
      // ถ้าไม่มีใน Cache ค่อยยอมไปเปิด Sheet (ทำแค่ครั้งเดียวในรอบ 6 ชั่วโมง)
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const setSheet = ss.getSheetByName('settings');
      const setData = setSheet.getDataRange().getValues();
      for (let i = 1; i < setData.length; i++) {
        if (setData[i][0] && setData[i][0].toString().trim() === 'TELEGRAM_BOT_TOKEN') {
          token = setData[i][1].toString().trim();
          cache.put('BOT_TOKEN', token, 21600); // จำไว้ 6 ชั่วโมง
          break;
        }
      }
    }

    // --- 2. สั่ง Telegram หยุดหมุนปุ่ม "ทันที" (จบปัญหาปุ่มค้างตรงนี้ครับ!) ---
    if (token) {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ callback_query_id: cbId }), // ไม่ต้องส่งข้อความเพื่อลดภาระ
        muteHttpExceptions: true
      });
    }
    
    // --- 3. ระบบป้องกันคนมือกดรัว (Anti-Spam) ---
    const cacheKey = 'cb_' + cbId;
    if (cache.get(cacheKey)) return ContentService.createTextOutput("OK");
    cache.put(cacheKey, 'processed', 60);
    
    // --- 4. เตรียมข้อมูลสถานะ ---
    const parts = cb.data.split('|');
    if (parts.length !== 2) return ContentService.createTextOutput("OK");
    
    const action = parts[0];
    const reqId = parts[1];
    
    let newStatus = ""; let icon = ""; let newKeyboard = [];
    
    if (action === 'RECEIVE') {
      newStatus = "รับเรื่องแล้ว"; icon = "📥";
      newKeyboard = [
        [{ text: "⏳ รอพิจารณา", callback_data: `PENDING|${reqId}` }, { text: "✅ อนุมัติแล้ว", callback_data: `APPROVE|${reqId}` }]
      ];
    } else if (action === 'PENDING') {
      newStatus = "รอพิจารณา"; icon = "⏳";
      newKeyboard = [[ { text: "✅ อนุมัติแล้ว", callback_data: `APPROVE|${reqId}` } ]];
    } else if (action === 'APPROVE') {
      newStatus = "อนุมัติแล้ว"; icon = "✅";
      newKeyboard = []; 
    }

    // --- 5. แอบอัปเดตข้อมูลลง Sheet เบื้องหลัง ---
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reqSheet = ss.getSheetByName('requests');
    const data = reqSheet.getDataRange().getValues(); // ดึงข้อมูลมารวดเดียว (เร็วกว่าหาทีละช่อง)
    
    let rowToUpdate = -1;
    let requesterName = "ไม่ทราบชื่อ";
    let agencyName = "-";
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reqId) {
        // เช็กว่าสถานะซ้ำไหม ถ้าซ้ำให้หยุดการทำงาน
        if (data[i][10] === newStatus) return ContentService.createTextOutput("OK");
        
        reqSheet.getRange(i + 1, 11).setValue(newStatus); 
        rowToUpdate = i + 1;
        requesterName = data[i][6] || "-";
        agencyName = data[i][7] || "-";
        break;
      }
    }
    
    // --- 6. ส่งข้อความใหม่ และลบปุ่มเก่าออกรวดเดียว ---
    if (rowToUpdate !== -1) {
      const actionBy = cb.from.first_name + (cb.from.last_name ? ' ' + cb.from.last_name : '');
      const alertMsg = `${icon} <b>อัปเดตสถานะรายการเรียบร้อย</b>\n\n` +
                       `👤 <b>ผู้ขอ:</b> ${requesterName}\n` +
                       `🏢 <b>สังกัด:</b> ${agencyName}\n` +
                       `📌 <b>สถานะปัจจุบัน:</b> <b>${newStatus}</b>\n` +
                       `👨‍💻 <b>ผู้ดำเนินการ:</b> ${actionBy}`;
                       
      const telegramRequests = [
        {
          // ลบปุ่มจากข้อความเดิม
          url: `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }),
          muteHttpExceptions: true
        },
        {
          // ส่งข้อความใหม่พร้อมปุ่มใหม่
          url: `https://api.telegram.org/bot${token}/sendMessage`,
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ chat_id: cb.message.chat.id, text: alertMsg, parse_mode: 'HTML', reply_to_message_id: cb.message.message_id, reply_markup: { inline_keyboard: newKeyboard } }),
          muteHttpExceptions: true
        }
      ];
      UrlFetchApp.fetchAll(telegramRequests); // ยิง 2 API พร้อมกันประหยัดเวลา
    }
    
  } catch (error) {
    console.error(error);
  }
  
  return ContentService.createTextOutput("OK");
}

// ฟังก์ชันสำหรับผูก Webhook (รันแค่ครั้งเดียว)
function setTelegramWebhook() {
  const settings = getSettings();
  const token = settings['TELEGRAM_BOT_TOKEN'];
  
  // นำ URL ของ Web App (เวอร์ชันล่าสุด) มาใส่ตรงนี้ครับ *ต้องลงท้ายด้วย /exec
  const webAppUrl = "https://script.google.com/macros/s/AKfycbw14AYb2sATYnXn7kubIGZOoXdxWfPG5040LZsGpV_tZ5DybAM6ZbyKXlVJoRnaXvpn/exec";
  
  const url = `https://api.telegram.org/bot${token}/setWebhook?url=${webAppUrl}`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}