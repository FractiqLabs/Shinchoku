/**
 * StockEasy 備品管理アプリ - サーバーサイド（Google Apps Script）
 *
 * 構成:
 *  - doGet  : HTML画面の配信（パラメータ action 付きの場合はJSONを返す読み取りAPI）
 *  - doPost : 書き込みAPI（JSONを受け取りJSONを返す）
 *  - api    : HtmlService の画面から google.script.run 経由で呼ばれる共通エントリ
 *
 * すべての書き込み処理は LockService（ScriptLock）で排他制御しています。
 *
 * 初回セットアップ: エディタ上で setupSheets() を一度実行してください。
 * シートの作成・見出し行・初期データ（admin/1234、初期カテゴリ）が投入されます。
 */

// スタンドアロンスクリプトで使う場合はスプレッドシートIDを設定してください。
// スプレッドシートの「拡張機能 > Apps Script」から作成した場合（推奨）は空のままでOKです。
var SPREADSHEET_ID = '';

var SHEET = {
  ITEMS: 'items',
  HISTORY: 'history',
  STAFF: 'staff',
  CATEGORIES: 'categories',
  LOCATIONS: 'locations',
  ADMINS: 'admins'
};

var ITEM_STATUS = { NORMAL: '正常', REPAIR: '要修理' };

// 備品画像の保存先フォルダ名（Googleドライブに自動作成される）
var IMAGE_FOLDER_NAME = 'StockEasy_Images';

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

/**
 * シートの作成と初期データ投入。エディタから一度だけ実行する。
 * 既存のシート・データがある場合は壊さない（不足分のみ補う）。
 */
function setupSheets() {
  var ss = getSpreadsheet_();
  var defs = [
    { name: SHEET.ITEMS,      headers: ['備品ID', '備品名', 'カテゴリ', '状態', '現在の借用者', '備考', '登録日時', '画像ファイルID', '現在の場所'] },
    { name: SHEET.HISTORY,    headers: ['履歴ID', '備品ID', '備品名', '借用者名', '借用日時', '返却日時', '操作者', '移動先', '返却場所'] },
    { name: SHEET.STAFF,      headers: ['職員ID', '職員名', '登録日時'] },
    { name: SHEET.CATEGORIES, headers: ['カテゴリID', 'カテゴリ名', '登録日時'] },
    { name: SHEET.LOCATIONS,  headers: ['場所ID', '場所名', '登録日時'] },
    { name: SHEET.ADMINS,     headers: ['管理者ID', 'パスワード'] }
  ];

  defs.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) sheet = ss.insertSheet(def.name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, def.headers.length)
        .setValues([def.headers])
        .setFontWeight('bold')
        .setBackground('#E2E8F0');
      sheet.setFrozenRows(1);
    }
  });

  // v1.1〜: 既存シートに後から追加された列の見出しを補う
  var items = ss.getSheetByName(SHEET.ITEMS);
  ensureHeader_(items, 8, '画像ファイルID');   // v1.1
  ensureHeader_(items, 9, '現在の場所');       // v1.2
  var history = ss.getSheetByName(SHEET.HISTORY);
  ensureHeader_(history, 8, '移動先');         // v1.2
  ensureHeader_(history, 9, '返却場所');       // v1.2

  // 初期データ: 管理者 admin / 1234
  var admins = ss.getSheetByName(SHEET.ADMINS);
  if (admins.getLastRow() < 2) {
    admins.appendRow(['admin', '1234']);
  }

  // 初期データ: カテゴリ
  var cats = ss.getSheetByName(SHEET.CATEGORIES);
  if (cats.getLastRow() < 2) {
    var initial = ['移動用具', '医療機器', 'IT機器', '日用品'];
    initial.forEach(function (name) {
      cats.appendRow([nextId_(cats, 'CAT-'), name, now_()]);
    });
  }

  // 初期データ: 場所
  var locs = ss.getSheetByName(SHEET.LOCATIONS);
  if (locs.getLastRow() < 2) {
    var initialLocs = ['事務室', '相談室', '会議室', '倉庫'];
    initialLocs.forEach(function (name) {
      locs.appendRow([nextId_(locs, 'LOC-'), name, now_()]);
    });
  }
}

/** 見出し行の指定列が空なら見出しを設定する（バージョンアップ時の列追加用） */
function ensureHeader_(sheet, col, title) {
  if (sheet.getRange(1, col).getDisplayValue() === '') {
    sheet.getRange(1, col).setValue(title).setFontWeight('bold').setBackground('#E2E8F0');
  }
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

function doGet(e) {
  // ?action=getData のようにアクション指定がある場合はJSON APIとして応答
  if (e && e.parameter && e.parameter.action) {
    return jsonOutput_(handleApi_(e.parameter.action, e.parameter));
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('StockEasy | 備品管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    // JSONでない場合はフォームパラメータにフォールバック
  }
  if (!params.action && e && e.parameter && e.parameter.action) {
    params = e.parameter;
  }
  return jsonOutput_(handleApi_(params.action, params));
}

/**
 * HtmlService の画面（google.script.run）から呼ばれる共通エントリ。
 * @param {Object} p - { action: 'borrow', ... } 形式のパラメータ
 */
function api(p) {
  p = p || {};
  return handleApi_(p.action, p);
}

// ---------------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------------

function handleApi_(action, p) {
  try {
    switch (action) {
      // --- 認証 ---
      case 'login':          return apiLogin_(p);

      // --- 読み取り（ゲスト可）---
      case 'getData':        return apiGetData_();
      case 'getHistory':     return apiGetHistory_();

      // --- 借用・返却・要修理（ゲスト可）---
      case 'borrow':         return withLock_(function () { return apiBorrow_(p); });
      case 'return':         return withLock_(function () { return apiReturn_(p); });
      case 'toggleRepair':   return withLock_(function () { return apiToggleRepair_(p); });

      // --- 設定（管理者のみ）---
      case 'addStaff':       requireAdmin_(p); return withLock_(function () { return apiAddStaff_(p); });
      case 'deleteStaff':    requireAdmin_(p); return withLock_(function () { return apiDeleteStaff_(p); });
      case 'addCategory':    requireAdmin_(p); return withLock_(function () { return apiAddCategory_(p); });
      case 'updateCategory': requireAdmin_(p); return withLock_(function () { return apiUpdateCategory_(p); });
      case 'deleteCategory': requireAdmin_(p); return withLock_(function () { return apiDeleteCategory_(p); });
      case 'addLocation':    requireAdmin_(p); return withLock_(function () { return apiAddLocation_(p); });
      case 'updateLocation': requireAdmin_(p); return withLock_(function () { return apiUpdateLocation_(p); });
      case 'deleteLocation': requireAdmin_(p); return withLock_(function () { return apiDeleteLocation_(p); });
      case 'addItem':        requireAdmin_(p); return withLock_(function () { return apiAddItem_(p); });
      case 'updateItem':     requireAdmin_(p); return withLock_(function () { return apiUpdateItem_(p); });
      case 'deleteItem':     requireAdmin_(p); return withLock_(function () { return apiDeleteItem_(p); });
      case 'changePassword': requireAdmin_(p); return withLock_(function () { return apiChangePassword_(p); });

      default:
        return ng_('不明なアクションです: ' + action);
    }
  } catch (err) {
    return ng_(err.message);
  }
}

// ---------------------------------------------------------------------------
// API: 認証
// ---------------------------------------------------------------------------

function apiLogin_(p) {
  var adminId = trim_(p.adminId);
  var password = trim_(p.password);
  if (!adminId || !password) return ng_('管理者IDとパスワードを入力してください。');
  if (isValidAdmin_(adminId, password)) {
    return ok_({ adminId: adminId });
  }
  return ng_('管理者IDまたはパスワードが正しくありません。');
}

function isValidAdmin_(adminId, password) {
  var sheet = getSheet_(SHEET.ADMINS);
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var rows = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
  return rows.some(function (row) {
    return row[0] === adminId && row[1] === password;
  });
}

/** 管理者専用アクションの認可チェック。失敗時は例外を投げる。 */
function requireAdmin_(p) {
  if (!isValidAdmin_(trim_(p.adminId), trim_(p.password))) {
    throw new Error('管理者権限が必要です。再度ログインしてください。');
  }
}

// ---------------------------------------------------------------------------
// API: 読み取り
// ---------------------------------------------------------------------------

function apiGetData_() {
  return ok_({
    items: readItems_(),
    staff: readStaff_(),
    categories: readCategories_(),
    locations: readLocations_()
  });
}

function apiGetHistory_() {
  var rows = readRows_(SHEET.HISTORY);
  var history = rows.map(function (row) {
    return {
      id: row[0],
      itemId: row[1],
      itemName: row[2],
      borrower: row[3],
      borrowedAt: row[4],
      returnedAt: row[5],
      operator: row[6],
      moveTo: row[7] || '',
      returnPlace: row[8] || ''
    };
  });
  history.reverse(); // 新しい順
  return ok_({ history: history });
}

function readItems_() {
  return readRows_(SHEET.ITEMS).map(function (row) {
    return {
      id: row[0],
      name: row[1],
      category: row[2],
      status: row[3],
      borrower: row[4],
      note: row[5],
      createdAt: row[6],
      imageId: row[7] || '',
      location: row[8] || ''
    };
  });
}

function readStaff_() {
  return readRows_(SHEET.STAFF).map(function (row) {
    return { id: row[0], name: row[1], createdAt: row[2] };
  });
}

function readCategories_() {
  return readRows_(SHEET.CATEGORIES).map(function (row) {
    return { id: row[0], name: row[1], createdAt: row[2] };
  });
}

function readLocations_() {
  return readRows_(SHEET.LOCATIONS).map(function (row) {
    return { id: row[0], name: row[1], createdAt: row[2] };
  });
}

// ---------------------------------------------------------------------------
// API: 借用・返却・要修理
// ---------------------------------------------------------------------------

function apiBorrow_(p) {
  var itemId = trim_(p.itemId);
  var staffName = trim_(p.staffName);
  var location = trim_(p.location);
  var operator = trim_(p.operator) || 'ゲスト';
  if (!itemId) return ng_('備品IDが指定されていません。');
  if (!staffName) return ng_('借用者（職員）を選択してください。');
  if (!location) return ng_('移動先（場所）を選択してください。');

  var sheet = getSheet_(SHEET.ITEMS);
  var row = findRowById_(sheet, itemId);
  if (row < 0) return ng_('対象の備品が見つかりません。');

  var current = sheet.getRange(row, 1, 1, 7).getDisplayValues()[0];
  if (current[4]) {
    return ng_('「' + current[1] + '」は ' + current[4] + ' さんが貸出中のため借用できません。');
  }

  sheet.getRange(row, 5).setValue(staffName);
  sheet.getRange(row, 9).setValue(location);

  var history = getSheet_(SHEET.HISTORY);
  history.appendRow([nextId_(history, 'HIST-'), itemId, current[1], staffName, now_(), '', operator, location, '']);

  return ok_({ message: '「' + current[1] + '」を ' + staffName + ' さんに貸し出しました（移動先：' + location + '）。' });
}

function apiReturn_(p) {
  var itemId = trim_(p.itemId);
  var location = trim_(p.location);
  var operator = trim_(p.operator) || 'ゲスト';
  if (!itemId) return ng_('備品IDが指定されていません。');
  if (!location) return ng_('返却場所を選択してください。');

  var sheet = getSheet_(SHEET.ITEMS);
  var row = findRowById_(sheet, itemId);
  if (row < 0) return ng_('対象の備品が見つかりません。');

  var current = sheet.getRange(row, 1, 1, 7).getDisplayValues()[0];
  if (!current[4]) {
    return ng_('「' + current[1] + '」はすでに返却済みです。');
  }

  sheet.getRange(row, 5).setValue('');
  sheet.getRange(row, 9).setValue(location);

  // 履歴のうち、この備品で返却日時が空の最新行を更新する
  var history = getSheet_(SHEET.HISTORY);
  var last = history.getLastRow();
  if (last >= 2) {
    var rows = history.getRange(2, 1, last - 1, 7).getDisplayValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === itemId && !rows[i][5]) {
        var r = i + 2;
        history.getRange(r, 6).setValue(now_());
        history.getRange(r, 9).setValue(location);
        if (rows[i][6] !== operator) {
          history.getRange(r, 7).setValue(rows[i][6] + ' / 返却: ' + operator);
        }
        break;
      }
    }
  }

  return ok_({ message: '「' + current[1] + '」を返却しました（返却場所：' + location + '）。' });
}

function apiToggleRepair_(p) {
  var itemId = trim_(p.itemId);
  if (!itemId) return ng_('備品IDが指定されていません。');

  var sheet = getSheet_(SHEET.ITEMS);
  var row = findRowById_(sheet, itemId);
  if (row < 0) return ng_('対象の備品が見つかりません。');

  var cell = sheet.getRange(row, 4);
  var next = cell.getDisplayValue() === ITEM_STATUS.REPAIR ? ITEM_STATUS.NORMAL : ITEM_STATUS.REPAIR;
  cell.setValue(next);

  var name = sheet.getRange(row, 2).getDisplayValue();
  return ok_({ message: '「' + name + '」の状態を「' + next + '」に変更しました。', status: next });
}

// ---------------------------------------------------------------------------
// API: 職員管理
// ---------------------------------------------------------------------------

function apiAddStaff_(p) {
  var name = trim_(p.name);
  if (!name) return ng_('職員名を入力してください。');

  var sheet = getSheet_(SHEET.STAFF);
  if (existsInColumn_(sheet, 2, name)) return ng_('同名の職員がすでに登録されています。');

  sheet.appendRow([nextId_(sheet, 'STAFF-'), name, now_()]);
  return ok_({ message: '職員「' + name + '」を追加しました。' });
}

function apiDeleteStaff_(p) {
  var staffId = trim_(p.staffId);
  var sheet = getSheet_(SHEET.STAFF);
  var row = findRowById_(sheet, staffId);
  if (row < 0) return ng_('対象の職員が見つかりません。');

  var name = sheet.getRange(row, 2).getDisplayValue();

  // 貸出中の備品の借用者として登録されている場合は削除不可
  var borrowing = readItems_().some(function (item) { return item.borrower === name; });
  if (borrowing) return ng_('「' + name + '」さんは貸出中の備品があるため削除できません。先に返却してください。');

  sheet.deleteRow(row);
  return ok_({ message: '職員「' + name + '」を削除しました。' });
}

// ---------------------------------------------------------------------------
// API: カテゴリ管理
// ---------------------------------------------------------------------------

function apiAddCategory_(p) {
  var name = trim_(p.name);
  if (!name) return ng_('カテゴリ名を入力してください。');

  var sheet = getSheet_(SHEET.CATEGORIES);
  if (existsInColumn_(sheet, 2, name)) return ng_('同名のカテゴリがすでに登録されています。');

  sheet.appendRow([nextId_(sheet, 'CAT-'), name, now_()]);
  return ok_({ message: 'カテゴリ「' + name + '」を追加しました。' });
}

function apiUpdateCategory_(p) {
  var catId = trim_(p.categoryId);
  var name = trim_(p.name);
  if (!name) return ng_('カテゴリ名を入力してください。');

  var sheet = getSheet_(SHEET.CATEGORIES);
  var row = findRowById_(sheet, catId);
  if (row < 0) return ng_('対象のカテゴリが見つかりません。');

  var oldName = sheet.getRange(row, 2).getDisplayValue();
  sheet.getRange(row, 2).setValue(name);

  // 既存備品のカテゴリ名も追従して更新する
  var items = getSheet_(SHEET.ITEMS);
  var last = items.getLastRow();
  if (last >= 2) {
    var range = items.getRange(2, 3, last - 1, 1);
    var values = range.getDisplayValues();
    var changed = false;
    values.forEach(function (v) {
      if (v[0] === oldName) { v[0] = name; changed = true; }
    });
    if (changed) range.setValues(values);
  }

  return ok_({ message: 'カテゴリ名を「' + name + '」に変更しました。' });
}

function apiDeleteCategory_(p) {
  var catId = trim_(p.categoryId);
  var sheet = getSheet_(SHEET.CATEGORIES);
  var row = findRowById_(sheet, catId);
  if (row < 0) return ng_('対象のカテゴリが見つかりません。');

  var name = sheet.getRange(row, 2).getDisplayValue();
  var inUse = readItems_().some(function (item) { return item.category === name; });
  if (inUse) return ng_('カテゴリ「' + name + '」を使用している備品があるため削除できません。');

  sheet.deleteRow(row);
  return ok_({ message: 'カテゴリ「' + name + '」を削除しました。' });
}

// ---------------------------------------------------------------------------
// API: 場所管理
// ---------------------------------------------------------------------------

function apiAddLocation_(p) {
  var name = trim_(p.name);
  if (!name) return ng_('場所名を入力してください。');

  var sheet = getSheet_(SHEET.LOCATIONS);
  if (existsInColumn_(sheet, 2, name)) return ng_('同名の場所がすでに登録されています。');

  sheet.appendRow([nextId_(sheet, 'LOC-'), name, now_()]);
  return ok_({ message: '場所「' + name + '」を追加しました。' });
}

function apiUpdateLocation_(p) {
  var locId = trim_(p.locationId);
  var name = trim_(p.name);
  if (!name) return ng_('場所名を入力してください。');

  var sheet = getSheet_(SHEET.LOCATIONS);
  var row = findRowById_(sheet, locId);
  if (row < 0) return ng_('対象の場所が見つかりません。');

  var oldName = sheet.getRange(row, 2).getDisplayValue();
  sheet.getRange(row, 2).setValue(name);

  // 備品の「現在の場所」も追従して更新する
  var items = getSheet_(SHEET.ITEMS);
  var last = items.getLastRow();
  if (last >= 2) {
    var range = items.getRange(2, 9, last - 1, 1);
    var values = range.getDisplayValues();
    var changed = false;
    values.forEach(function (v) {
      if (v[0] === oldName) { v[0] = name; changed = true; }
    });
    if (changed) range.setValues(values);
  }

  return ok_({ message: '場所名を「' + name + '」に変更しました。' });
}

function apiDeleteLocation_(p) {
  var locId = trim_(p.locationId);
  var sheet = getSheet_(SHEET.LOCATIONS);
  var row = findRowById_(sheet, locId);
  if (row < 0) return ng_('対象の場所が見つかりません。');

  var name = sheet.getRange(row, 2).getDisplayValue();
  var inUse = readItems_().some(function (item) { return item.location === name; });
  if (inUse) return ng_('場所「' + name + '」にある備品が存在するため削除できません。');

  sheet.deleteRow(row);
  return ok_({ message: '場所「' + name + '」を削除しました。' });
}

// ---------------------------------------------------------------------------
// API: 備品管理
// ---------------------------------------------------------------------------

function apiAddItem_(p) {
  var name = trim_(p.name);
  var category = trim_(p.category);
  var note = trim_(p.note);
  if (!name) return ng_('備品名を入力してください。');
  if (!category) return ng_('カテゴリを選択してください。');

  var imageId = '';
  if (p.imageData) {
    imageId = saveImage_(p.imageData, name);
  }

  var sheet = getSheet_(SHEET.ITEMS);
  sheet.appendRow([nextId_(sheet, 'ITEM-'), name, category, ITEM_STATUS.NORMAL, '', note, now_(), imageId, trim_(p.location)]);
  return ok_({ message: '備品「' + name + '」を登録しました。' });
}

function apiUpdateItem_(p) {
  var itemId = trim_(p.itemId);
  var name = trim_(p.name);
  var category = trim_(p.category);
  var note = trim_(p.note);
  if (!name) return ng_('備品名を入力してください。');
  if (!category) return ng_('カテゴリを選択してください。');

  var sheet = getSheet_(SHEET.ITEMS);
  var row = findRowById_(sheet, itemId);
  if (row < 0) return ng_('対象の備品が見つかりません。');

  sheet.getRange(row, 2).setValue(name);
  sheet.getRange(row, 3).setValue(category);
  sheet.getRange(row, 6).setValue(note);
  if (p.location !== undefined) {
    sheet.getRange(row, 9).setValue(trim_(p.location));
  }

  // 画像の差し替え・削除
  var imageCell = sheet.getRange(row, 8);
  var oldImageId = imageCell.getDisplayValue();
  if (p.imageData) {
    imageCell.setValue(saveImage_(p.imageData, name));
    trashImage_(oldImageId);
  } else if (p.removeImage === true || String(p.removeImage) === 'true') {
    imageCell.setValue('');
    trashImage_(oldImageId);
  }

  return ok_({ message: '備品「' + name + '」を更新しました。' });
}

function apiDeleteItem_(p) {
  var itemId = trim_(p.itemId);
  var sheet = getSheet_(SHEET.ITEMS);
  var row = findRowById_(sheet, itemId);
  if (row < 0) return ng_('対象の備品が見つかりません。');

  var current = sheet.getRange(row, 1, 1, 8).getDisplayValues()[0];
  if (current[4]) {
    return ng_('「' + current[1] + '」は貸出中のため削除できません。先に返却してください。');
  }

  sheet.deleteRow(row);
  trashImage_(current[7]);
  return ok_({ message: '備品「' + current[1] + '」を削除しました。' });
}

// ---------------------------------------------------------------------------
// API: 管理者設定
// ---------------------------------------------------------------------------

function apiChangePassword_(p) {
  var adminId = trim_(p.adminId);
  var newPassword = trim_(p.newPassword);
  if (!newPassword) return ng_('新しいパスワードを入力してください。');

  var sheet = getSheet_(SHEET.ADMINS);
  var row = findRowById_(sheet, adminId);
  if (row < 0) return ng_('対象の管理者が見つかりません。');

  sheet.getRange(row, 2).setValue(newPassword);
  return ok_({ message: 'パスワードを変更しました。' });
}

// ---------------------------------------------------------------------------
// 画像（Googleドライブ）
// ---------------------------------------------------------------------------

/**
 * base64のデータURL（data:image/jpeg;base64,...）をドライブに保存し、ファイルIDを返す。
 * 画像はWebアプリの利用者全員が閲覧できるよう「リンクを知っている全員（閲覧者）」で共有される。
 */
function saveImage_(dataUrl, itemName) {
  var m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9+.\-]+);base64,(.+)$/);
  if (!m) throw new Error('画像データの形式が正しくありません。');

  var ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'StockEasy_' + (itemName || 'item') + '.' + ext);

  var file = getImageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

function getImageFolder_() {
  var folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

/** 画像ファイルをゴミ箱へ移動する（存在しない・権限がない場合は何もしない） */
function trashImage_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // 手動削除済みなどで見つからない場合は無視する
  }
}

// ---------------------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------------------

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが見つかりません。SPREADSHEET_ID を設定してください。');
  return ss;
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('シート「' + name + '」が見つかりません。setupSheets() を実行してください。');
  return sheet;
}

/** 見出し行を除く全行を文字列で取得する */
function readRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getDisplayValues();
}

/** A列のIDで行番号（1始まり）を探す。見つからなければ -1 */
function findRowById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2 || !id) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function existsInColumn_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, col, last - 1, 1).getDisplayValues();
  return values.some(function (v) { return v[0] === value; });
}

/** 「PREFIX-001」形式の連番IDを採番する */
function nextId_(sheet, prefix) {
  var last = sheet.getLastRow();
  var max = 0;
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    ids.forEach(function (row) {
      var m = String(row[0]).match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return prefix + ('000' + (max + 1)).slice(-3);
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function trim_(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function ok_(data) {
  return { success: true, data: data === undefined ? null : data };
}

function ng_(message) {
  return { success: false, error: message };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
