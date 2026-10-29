function setupDatabase() {
  var ss = SpreadsheetActive_();
  var sheetsConfig = {
    "Config": ["Kunci", "Nilai"],
    "Users": ["Username", "Password", "Role", "Nama", "Kelas"],
    "AKPD_Soal": ["ID_Soal", "Kelas", "Aspek", "Pertanyaan", "Rumusan Kebutuhan", "Tujuan Layanan", "Komponen Program", "Materi Layanan"],
    "AKPD_Jawaban": ["Timestamp", "NISN", "Nama", "Kelas", "Rincian_Jawaban", "Aspek_Dominan"]
  };
  for (var sheetName in sheetsConfig) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheetsConfig[sheetName]);
      if (sheetName === "Config") {
        sheet.appendRow(["namaYayasan", "Nama Yayasan"]);
        sheet.appendRow(["namaSekolah", "Nama Sekolah"]);
        sheet.appendRow(["alamatSekolah", "Alamat Sekolah"]);
        sheet.appendRow(["namaKepala", "Nama Kepala Sekolah"]);
        sheet.appendRow(["namaGuruBK", "Guru BK"]);
        sheet.appendRow(["kotaCetak", "Nama Kota"]);
        sheet.appendRow(["tahunAjaran", "2026/2027"]);
        sheet.appendRow(["logoUrl", "https://via.placeholder.com/150"]);
      } else if (sheetName === "Users") {
        sheet.appendRow(["admin", encode_("admin123"), "guru", "Guru BK", "-"]);
      }
    }
  }
}
function SpreadsheetActive_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Mohon jalankan script ini dari dalam Google Sheets.");
  return ss;
}
// ====================== API (dipanggil dari index.html / app.js) ======================
// Hanya fungsi di daftar ini yang boleh dipanggil dari luar.
var API_ALLOWED_ = [
  'getConfig', 'updateConfig', 'authenticateUser', 'resumeSession', 'changePassword',
  'previewAkhirTahun', 'prosesAkhirTahun', 'listUsers', 'saveUser', 'resetPassword',
  'deleteUser', 'importUsers', 'getSoalAKPD', 'submitAKPD', 'getDashboardData',
  'getAnalisaSiswaData', 'getProfilKelasData', 'getProfilKonseliData',
  'getRumusanKebutuhanData', 'getRumusanTujuanData', 'getKomponenProgramData', 'getActionPlanData'
];
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  return json_({ ok: true, data: 'API AKPD aktif' });
}
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var fn = String(req.fn || '');
    if (API_ALLOWED_.indexOf(fn) === -1) throw new Error('Fungsi tidak dikenal: ' + fn);
    if (fn === 'getConfig') setupDatabase();   // dulu dijalankan tiap halaman dibuka (doGet)
    var result = this[fn].apply(null, req.args || []);
    return json_({ ok: true, data: result === undefined ? null : result });
  } catch (err) {
    return json_({ ok: false, error: (err && err.message) ? err.message : String(err) });
  }
}
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) { config[data[i][0]] = data[i][1]; }
  return config;
}
function updateConfig(token, newConfig) {
  requireGuru_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Config");
  var range = sheet.getDataRange();
  var data = range.getValues();
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    if (newConfig[key] !== undefined) data[i][1] = newConfig[key];
  }
  range.setValues(data);
  return { status: "success" };
}
function hash_(pw, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8);
  return raw.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function encode_(pw) { var salt = Utilities.getUuid().slice(0, 8); return 'h$' + salt + '$' + hash_(String(pw), salt); }
function check_(stored, pw) {
  stored = String(stored);
  if (stored.indexOf('h$') === 0) { var p = stored.split('$'); return hash_(String(pw), p[1]) === p[2]; }
  return stored === String(pw);
}
var DEFAULT_PW_ = '123456'; // password awal semua siswa
function pwFor_(role) { return (role === 'guru' || role === 'admin') ? makePw_() : DEFAULT_PW_; }
function makePw_() {
  var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
function usersSheet_() { return SpreadsheetActive_().getSheetByName("Users"); }
function requireGuru_(token) {
  var role = token ? CacheService.getScriptCache().get('s_' + token) : null;
  if (role !== 'guru' && role !== 'admin') throw new Error('Sesi berakhir. Silakan login ulang.');
}

function authenticateUser(username, password, ingat) {
  var cache = CacheService.getScriptCache(), key = 'f_' + String(username).trim();
  if (parseInt(cache.get(key) || '0') >= 5) return { status: "error", message: "Terlalu banyak percobaan. Coba lagi 10 menit lagi." };
  var sheet = usersSheet_(), data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim() && check_(data[i][1], password)) {
      var stored = String(data[i][1]);
      if (stored.indexOf('h$') !== 0) { stored = encode_(password); sheet.getRange(i + 1, 2).setValue(stored); }
      cache.remove(key);
      var token = Utilities.getUuid();
      cache.put('s_' + token, String(data[i][2]), 21600);
      cache.put('u_' + token, String(data[i][0]).trim(), 21600);
      var out = { status: "success", username: String(data[i][0]).trim(), role: data[i][2], nama: data[i][3], kelas: data[i][4], token: token };
      if (ingat === true) out.rememberToken = makeRemember_(out.username, stored);
      return out;
    }
  }
  cache.put(key, String(parseInt(cache.get(key) || '0') + 1), 600);
  return { status: "error", message: "Username atau Password salah!" };
}

// ====================== "Ingat saya" (tetap login di perangkat) ======================
// Token bertanda tangan (HMAC). Password tidak pernah disimpan di perangkat.
// Token otomatis tidak berlaku bila password akun diganti/direset atau akun dihapus.
var REMEMBER_DAYS_ = 90;
function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('REMEMBER_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('REMEMBER_SECRET', s); }
  return s;
}
function sig_(payload, stored) {
  var raw = Utilities.computeHmacSha256Signature(payload + '|' + String(stored), secret_());
  return raw.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function makeRemember_(username, stored) {
  var exp = Date.now() + REMEMBER_DAYS_ * 86400000;
  var payload = Utilities.base64EncodeWebSafe(username + '|' + exp, Utilities.Charset.UTF_8);
  return payload + '.' + sig_(payload, stored);
}
function resumeSession(rememberToken) {
  var gagal = { status: "error", message: "Sesi tersimpan sudah tidak berlaku. Silakan login ulang." };
  try {
    var parts = String(rememberToken || '').split('.');
    if (parts.length !== 2) return gagal;
    var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var k = decoded.lastIndexOf('|'), un = decoded.slice(0, k), exp = parseInt(decoded.slice(k + 1), 10);
    if (!un || !(exp > Date.now())) return gagal;
    var data = usersSheet_().getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== un) continue;
      if (sig_(parts[0], data[i][1]) !== parts[1]) return gagal;
      var cache = CacheService.getScriptCache(), token = Utilities.getUuid();
      cache.put('s_' + token, String(data[i][2]), 21600);
      cache.put('u_' + token, un, 21600);
      return { status: "success", username: un, role: data[i][2], nama: data[i][3], kelas: data[i][4], token: token };
    }
  } catch (e) {}
  return gagal;
}

function onOpen() { SpreadsheetApp.getUi().createMenu('AKPD').addItem('Amankan sheet Users', 'amankanUsers').addItem('Rapikan data jawaban', 'rapikanJawaban').addToUi(); }
function amankanUsers() {
  var s = usersSheet_(), n = s.getLastRow();
  s.getRange('A:B').setNumberFormat('@'); s.getRange('E:E').setNumberFormat('@');
  if (n > 1) {
    var r = s.getRange(2, 2, n - 1, 1);
    r.setValues(r.getValues().map(function(x) { var p = String(x[0]); return [p === '' || p.indexOf('h$') === 0 ? p : encode_(p)]; }));
  }
  s.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['siswa', 'guru', 'admin'], true).build());
  if (s.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) s.protect().setWarningOnly(true);
  SpreadsheetApp.getUi().alert('Sheet Users sudah diamankan: password terenkripsi, kolom NISN berformat teks, Role berupa dropdown.');
}

function changePassword(token, oldPw, newPw, ingat) {
  var cache = CacheService.getScriptCache(), un = token ? cache.get('u_' + token) : null;
  if (!un) throw new Error('Sesi berakhir. Silakan login ulang.');
  if (String(newPw).length < 6) throw new Error('Password baru minimal 6 karakter.');
  var s = usersSheet_(), d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (String(d[i][0]).trim() === un) {
    if (!check_(d[i][1], oldPw)) throw new Error('Password saat ini salah.');
    var enc = encode_(newPw);
    s.getRange(i + 1, 2).setValue(enc);
    return ingat === true ? { status: 'success', rememberToken: makeRemember_(un, enc) } : { status: 'success' };
  }
  throw new Error('Pengguna tidak ditemukan.');
}

function tingkat_(k) { var m = String(k).trim().toUpperCase().match(/^(XII|XI|X)(?![A-Z])/); return m ? m[1] : null; }
function previewAkhirTahun(token) {
  requireGuru_(token);
  var d = usersSheet_().getDataRange().getValues(), o = { lulus: 0, naikXI: 0, naikX: 0, tidakDikenali: 0, jawaban: 0 };
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] === '' || d[i][2] !== 'siswa') continue;
    var t = tingkat_(d[i][4]);
    if (t === 'XII') o.lulus++; else if (t === 'XI') o.naikXI++; else if (t === 'X') o.naikX++; else o.tidakDikenali++;
  }
  o.jawaban = Math.max(0, SpreadsheetActive_().getSheetByName('AKPD_Jawaban').getLastRow() - 1);
  o.tahunAjaran = String(getConfig().tahunAjaran || '');
  return o;
}
function prosesAkhirTahun(token, tahunBaru) {
  requireGuru_(token);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var ss = SpreadsheetActive_(), us = usersSheet_(), ans = ss.getSheetByName('AKPD_Jawaban');
    var d = us.getDataRange().getValues(), keep = [], lulus = 0, naik = 0;
    for (var i = 1; i < d.length; i++) {
      var r = d[i]; if (r[0] === '') continue;
      var t = r[2] === 'siswa' ? tingkat_(r[4]) : null;
      if (t === 'XII') { lulus++; continue; }
      var kelas = String(r[4]);
      if (t === 'XI' || t === 'X') { kelas = kelas.trim().replace(/^(XII|XI|X)(?![A-Za-z])/i, t === 'XI' ? 'XII' : 'XI'); naik++; }
      keep.push([String(r[0]), r[1], r[2], r[3], kelas]);
    }
    var old = us.getLastRow();
    if (old > 1) us.getRange(2, 1, old - 1, 5).clearContent();
    if (keep.length) {
      us.getRange(2, 1, keep.length, 2).setNumberFormat('@'); us.getRange(2, 5, keep.length, 1).setNumberFormat('@');
      us.getRange(2, 1, keep.length, 5).setValues(keep);
    }
    var nJawab = Math.max(0, ans.getLastRow() - 1);
    if (nJawab > 0) ans.getRange(2, 1, nJawab, ans.getLastColumn()).clearContent();
    if (tahunBaru) {
      var cs = ss.getSheetByName('Config'), cd = cs.getDataRange().getValues();
      for (var j = 1; j < cd.length; j++) if (cd[j][0] === 'tahunAjaran') cs.getRange(j + 1, 2).setValue(String(tahunBaru));
    }
    return { lulus: lulus, naik: naik, jawaban: nJawab, arsip: [] };
  } finally { lock.releaseLock(); }
}

function listUsers(token) {
  requireGuru_(token);
  var d = usersSheet_().getDataRange().getValues(), o = [];
  for (var i = 1; i < d.length; i++) if (d[i][0] !== '') o.push({ username: String(d[i][0]), role: d[i][2], nama: d[i][3], kelas: String(d[i][4]) });
  return o;
}
function saveUser(token, u, isEdit) {
  requireGuru_(token);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var s = usersSheet_(), d = s.getDataRange().getValues(), un = String(u.username).trim(), nama = String(u.nama).trim();
    var role = u.role === 'guru' ? 'guru' : 'siswa', kelas = role === 'guru' ? '-' : String(u.kelas).trim();
    if (!un || !nama) throw new Error('Username dan nama wajib diisi.');
    if (role === 'siswa' && !kelas) throw new Error('Kelas siswa wajib diisi.');
    var row = -1;
    for (var i = 1; i < d.length; i++) if (String(d[i][0]).trim() === un) { row = i + 1; break; }
    if (isEdit) {
      if (row < 0) throw new Error('Pengguna tidak ditemukan.');
      s.getRange(row, 3, 1, 3).setValues([[role, nama, kelas]]);
      return { status: 'success' };
    }
    if (row > 0) throw new Error('NISN / Username sudah terdaftar.');
    var pw = pwFor_(role);
    s.appendRow([un, encode_(pw), role, nama, kelas]);
    return { status: 'success', password: pw };
  } finally { lock.releaseLock(); }
}
function resetPassword(token, username) {
  requireGuru_(token);
  var s = usersSheet_(), d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (String(d[i][0]).trim() === String(username).trim()) {
    var pw = pwFor_(d[i][2]); s.getRange(i + 1, 2).setValue(encode_(pw));
    return { status: 'success', password: pw };
  }
  throw new Error('Pengguna tidak ditemukan.');
}
function nk_(x) { return String(x).trim().replace(/^0+(?=.)/, ''); }  // bandingkan NISN tanpa terpengaruh angka 0 di depan
function hapusJawabanSiswa_(username, nama, kelas) {
  var ans = SpreadsheetActive_().getSheetByName('AKPD_Jawaban'), n = ans.getLastRow(), c = 0;
  if (n < 2) return 0;
  var d = ans.getRange(2, 1, n - 1, 4).getValues();
  for (var i = d.length - 1; i >= 0; i--) {
    var b = String(d[i][1]).trim();
    // baris baru: NISN cocok. Baris lama (sebelum perbaikan): NISN terisi nama, nama dan kelas cocok.
    if (nk_(b) === nk_(username) || (b === nama && String(d[i][2]).trim() === nama && String(d[i][3]).trim() === kelas)) { ans.deleteRow(i + 2); c++; }
  }
  return c;
}
function deleteUser(token, username) {
  requireGuru_(token);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var s = usersSheet_(), d = s.getDataRange().getValues(), gurus = 0, row = -1, un = String(username).trim();
    for (var i = 1; i < d.length; i++) {
      if (d[i][2] === 'guru' || d[i][2] === 'admin') gurus++;
      if (String(d[i][0]).trim() === un) row = i;
    }
    if (row < 0) throw new Error('Pengguna tidak ditemukan.');
    var role = d[row][2], nama = String(d[row][3]).trim(), kelas = String(d[row][4]).trim();
    if ((role === 'guru' || role === 'admin') && gurus <= 1) throw new Error('Tidak bisa menghapus satu-satunya akun Guru BK.');
    s.deleteRow(row + 1);
    var j = role === 'siswa' ? hapusJawabanSiswa_(un, nama, kelas) : 0;
    return { status: 'success', jawabanDihapus: j };
  } finally { lock.releaseLock(); }
}
// Dijalankan dari menu AKPD di spreadsheet: membersihkan jawaban yatim (siswanya sudah dihapus) dan memperbaiki baris lama yang NISN-nya terisi nama.
function rapikanJawaban() {
  var ans = SpreadsheetActive_().getSheetByName('AKPD_Jawaban'), n = ans.getLastRow(), diperbaiki = 0, dihapus = 0;
  if (n >= 2) {
    ans.getRange(2, 2, n - 1, 1).setNumberFormat('@');
    var us = usersSheet_().getDataRange().getValues(), byNisn = {}, byNK = {};
    for (var i = 1; i < us.length; i++) if (us[i][2] === 'siswa') { var u = String(us[i][0]).trim(); byNisn[nk_(u)] = u; byNK[String(us[i][3]).trim() + '|' + String(us[i][4]).trim()] = u; }
    var d = ans.getRange(2, 1, n - 1, 4).getValues();
    for (var j = d.length - 1; j >= 0; j--) {
      var b = String(d[j][1]).trim(), nm = String(d[j][2]).trim(), asli = byNisn[nk_(b)];
      if (asli) { if (b !== asli) { ans.getRange(j + 2, 2).setValue(asli); diperbaiki++; } continue; }  // NISN benar tapi nol di depan hilang
      var u2 = byNK[nm + '|' + String(d[j][3]).trim()];
      if (u2 && b === nm) { ans.getRange(j + 2, 2).setValue(u2); diperbaiki++; }  // baris lama: NISN terisi nama
      else { ans.deleteRow(j + 2); dihapus++; }
    }
  }
  SpreadsheetApp.getUi().alert('Selesai. ' + dihapus + ' jawaban tanpa siswa dihapus, ' + diperbaiki + ' baris diperbaiki NISN-nya.');
}
function importUsers(token, rows) {
  requireGuru_(token);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var s = usersSheet_(), d = s.getDataRange().getValues(), seen = {}, out = [], created = [], skipped = 0;
    for (var i = 1; i < d.length; i++) seen[String(d[i][0]).trim()] = true;
    rows.forEach(function(r) {
      var un = String(r.username).trim(), nama = String(r.nama).trim(), kelas = String(r.kelas).trim();
      if (!un || !nama || !kelas || seen[un]) { skipped++; return; }
      seen[un] = true; var pw = pwFor_('siswa');
      out.push([un, encode_(pw), 'siswa', nama, kelas]); created.push({ username: un, nama: nama, kelas: kelas, password: pw });
    });
    if (out.length) s.getRange(s.getLastRow() + 1, 1, out.length, 5).setNumberFormat('@').setValues(out);
    return { created: created, skipped: skipped };
  } finally { lock.releaseLock(); }
}

function getSoalAKPD(kelasSiswa) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AKPD_Soal");
  var data = sheet.getDataRange().getValues();
  var soalList = [];
  if (!kelasSiswa) return soalList;
  var klsSiswaStr = kelasSiswa.toString().trim().toUpperCase();
  var matchTingkat = klsSiswaStr.match(/^[IVXLCDM]+|[0-9]+/i);
  var tingkatKelas = matchTingkat ? matchTingkat[0] : klsSiswaStr;
  var headers = data[0];
  var idxKomponen = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h].toString().toLowerCase().includes("komponen")) { idxKomponen = h; break; }
  }
  for (var i = 1; i < data.length; i++) {
    var targetKelas = data[i][1] ? data[i][1].toString().trim().toUpperCase() : "";
    var pertanyaan = data[i][3] ? data[i][3].toString().trim() : "";
    var kompVal = idxKomponen !== -1 && data[i][idxKomponen] ? data[i][idxKomponen].toString().trim().toLowerCase() : "";
    if (kompVal.includes("dukungan")) continue;
    if (pertanyaan && (targetKelas === "SEMUA" || targetKelas === klsSiswaStr || targetKelas === tingkatKelas)) {
      soalList.push({ 
        id: data[i][0], 
        kelas: targetKelas,
        aspek: data[i][2], 
        pertanyaan: pertanyaan,
        rumusan: data[i][4] || "",
        tujuan: data[i][5] || "Mengembangkan potensi dan kemandirian siswa",
        komponen: data[i][6] || "Layanan Dasar",
        materi: data[i][7] || pertanyaan
      });
    }
  }
  return soalList;
}
function submitAKPD(formData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AKPD_Jawaban");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (nk_(data[i][1]) === nk_(formData.nisn)) {
      return { status: "error", message: "Anda sudah pernah mengisi AKPD sebelumnya." };
    }
  }
  var aspekCount = { "Pribadi": 0, "Belajar": 0, "Sosial": 0, "Karir": 0 };
  var rincianButir = formData.rincianButir || {};
  var soalSheet = ss.getSheetByName("AKPD_Soal");
  var soalData = soalSheet.getDataRange().getValues();
  var soalMap = {};
  for (var s = 1; s < soalData.length; s++) { soalMap[soalData[s][0].toString()] = soalData[s][2]; }
  for (var idSoal in rincianButir) {
    if (rincianButir[idSoal] === true) {
      var aspek = soalMap[idSoal];
      if (aspek && aspekCount[aspek] !== undefined) aspekCount[aspek]++;
    }
  }
  var aspekDominan = "Pribadi", maxVal = -1;
  for (var asp in aspekCount) {
    if (aspekCount[asp] > maxVal) { maxVal = aspekCount[asp]; aspekDominan = asp; }
  }
  var baris = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(baris, 2).setNumberFormat('@');  // NISN harus teks agar angka 0 di depan tidak hilang
  sheet.getRange(baris, 1, 1, 6).setValues([[new Date(), String(formData.nisn), formData.nama, formData.kelas, JSON.stringify({ butir: rincianButir, bidang: aspekCount }), aspekDominan]]);
  return { status: "success", message: "Berhasil mengirimkan data AKPD." };
}
function getDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName("Users");
  var userData = userSheet.getDataRange().getValues();
  var totalSiswa = 0, kelasSet = {}, siswaPerKelas = {};
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][2] === "siswa") {
      totalSiswa++;
      var kls = userData[i][4];
      kelasSet[kls] = true;
      siswaPerKelas[kls] = (siswaPerKelas[kls] || 0) + 1;
    }
  }
  var daftarKelas = Object.keys(kelasSet).sort();
  var ansSheet = ss.getSheetByName("AKPD_Jawaban");
  var ansData = ansSheet.getDataRange().getValues();
  var totalSelesai = ansData.length - 1;
  var selesaiPerKelas = {}, rekapBidang = { "Pribadi": 0, "Belajar": 0, "Sosial": 0, "Karir": 0 }, masalahPerKelas = {};
  daftarKelas.forEach(function(k) {
    selesaiPerKelas[k] = 0;
    masalahPerKelas[k] = { "Pribadi": 0, "Belajar": 0, "Sosial": 0, "Karir": 0, "TotalAspek": 0 };
  });
  for (var j = 1; j < ansData.length; j++) {
    var klsSiswa = ansData[j][3];
    if (selesaiPerKelas[klsSiswa] !== undefined) selesaiPerKelas[klsSiswa]++;
    try {
      var parsed = JSON.parse(ansData[j][4]);
      var bidangObj = parsed.bidang || parsed;
      ["Pribadi", "Belajar", "Sosial", "Karir"].forEach(function(asp) {
        if (bidangObj[asp]) {
          var val = parseInt(bidangObj[asp]) || 0;
          rekapBidang[asp] += val;
          if (masalahPerKelas[klsSiswa]) {
            masalahPerKelas[klsSiswa][asp] += val;
            masalahPerKelas[klsSiswa]["TotalAspek"] += val;
          }
        }
      });
    } catch(e) {}
  }
  return {
    totalSiswa: totalSiswa, totalKelas: daftarKelas.length, totalSelesai: totalSelesai,
    daftarKelas: daftarKelas, siswaPerKelas: siswaPerKelas, selesaiPerKelas: selesaiPerKelas,
    rekapBidang: rekapBidang, masalahPerKelas: masalahPerKelas
  };
}
function getAnalisaSiswaData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ansSheet = ss.getSheetByName("AKPD_Jawaban");
  var data = ansSheet.getDataRange().getValues();
  var listAnalisa = [];
  for (var i = 1; i < data.length; i++) {
    var bidangCount = { Pribadi: 0, Belajar: 0, Sosial: 0, Karir: 0 };
    try {
      var parsed = JSON.parse(data[i][4]);
      if (parsed.bidang) bidangCount = parsed.bidang;
      else if (parsed.Pribadi !== undefined) bidangCount = parsed;
    } catch(e) {}
    listAnalisa.push({
      timestamp: data[i][0] ? Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm") : "-",
      nisn: data[i][1], nama: data[i][2], kelas: data[i][3], rincian: bidangCount, aspekDominan: data[i][5]
    });
  }
  return listAnalisa;
}
function getProfilKelasData(kelasTarget) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName("Users");
  var userData = userSheet.getDataRange().getValues();
  var totalSiswaKelas = 0;
  for (var u = 1; u < userData.length; u++) {
    if (userData[u][2] === "siswa" && userData[u][4].toString().trim().toUpperCase() === kelasTarget.toString().trim().toUpperCase()) totalSiswaKelas++;
  }
  var soalList = getSoalAKPD(kelasTarget);
  var ansSheet = ss.getSheetByName("AKPD_Jawaban");
  var ansData = ansSheet.getDataRange().getValues();
  var respondenPerSoal = {}, totalRespondenKelas = 0;
  var rekapBidangKelas = { Pribadi: 0, Belajar: 0, Sosial: 0, Karir: 0 };
  var semester1 = ["Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var semester2 = ["Januari", "Februari", "Maret", "April", "Mei", "Juni"];
  var semuaBulan = semester1.concat(semester2);
  for (var j = 1; j < ansData.length; j++) {
    if (ansData[j][3].toString().trim().toUpperCase() === kelasTarget.toString().trim().toUpperCase()) {
      totalRespondenKelas++;
      try {
        var parsed = JSON.parse(ansData[j][4]);
        var butirObj = parsed.butir || parsed; 
        for (var soalId in butirObj) {
          if (butirObj[soalId] === true || butirObj[soalId] === "Ya") respondenPerSoal[soalId] = (respondenPerSoal[soalId] || 0) + 1;
        }
        var bidangObj = parsed.bidang || {};
        ["Pribadi", "Belajar", "Sosial", "Karir"].forEach(function(asp) {
          if (bidangObj[asp]) rekapBidangKelas[asp] += parseInt(bidangObj[asp]) || 0;
        });
      } catch(e) {}
    }
  }
  var totalPilihanKelas = rekapBidangKelas.Pribadi + rekapBidangKelas.Belajar + rekapBidangKelas.Sosial + rekapBidangKelas.Karir;
  if (totalPilihanKelas === 0) totalPilihanKelas = 1;
  var persentaseRekapBidang = {
    Pribadi: ((rekapBidangKelas.Pribadi / totalPilihanKelas) * 100).toFixed(1) + "%",
    Belajar: ((rekapBidangKelas.Belajar / totalPilihanKelas) * 100).toFixed(1) + "%",
    Sosial: ((rekapBidangKelas.Sosial / totalPilihanKelas) * 100).toFixed(1) + "%",
    Karir: ((rekapBidangKelas.Karir / totalPilihanKelas) * 100).toFixed(1) + "%"
  };
  var hasilProfil = [];
  soalList.forEach(function(s, index) {
    var jmlResponden = respondenPerSoal[s.id] || 0;
    var prosentaseVal = totalSiswaKelas > 0 ? (jmlResponden / totalSiswaKelas) * 100 : 0;
    var prioritas = "Rendah";
    if (prosentaseVal >= 50) prioritas = "Tinggi";
    else if (prosentaseVal >= 25) prioritas = "Sedang";
    hasilProfil.push({
      no: index + 1, pertanyaan: s.pertanyaan, aspek: s.aspek, jmlResponden: jmlResponden,
      prosentaseVal: prosentaseVal, prosentase: prosentaseVal.toFixed(1) + "%", prioritas: prioritas
    });
  });
  hasilProfil.sort(function(a, b) {
    var order = { "Tinggi": 1, "Sedang": 2, "Rendah": 3 };
    if (order[a.prioritas] !== order[b.prioritas]) return order[a.prioritas] - order[b.prioritas];
    return b.prosentaseVal - a.prosentaseVal;
  });
  var totalProfil = hasilProfil.length;
  hasilProfil.forEach(function(item, idx) {
    item.no = idx + 1;
    var indexBulan = Math.floor((idx * semuaBulan.length) / (totalProfil > 0 ? totalProfil : 1));
    if (indexBulan >= semuaBulan.length) indexBulan = semuaBulan.length - 1;
    item.waktuLayanan = semuaBulan[indexBulan];
  });
  return {
    kelas: kelasTarget, totalSiswa: totalSiswaKelas, totalResponden: totalRespondenKelas,
    persentaseRekapBidang: persentaseRekapBidang, profil: hasilProfil,
    tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy")
  };
}
function getProfilKonseliData(kelasTarget) {
  var ss = SpreadsheetActive_();
  var ansSheet = ss.getSheetByName("AKPD_Jawaban");
  var ansData = ansSheet.getDataRange().getValues();
  var soalList = getSoalAKPD(kelasTarget);
  var totalSoalKelas = soalList.length > 0 ? soalList.length : 1;
  var listKonseli = [];
  for (var i = 1; i < ansData.length; i++) {
    var klsSiswa = ansData[i][3].toString().trim().toUpperCase();
    if (!kelasTarget || klsSiswa === kelasTarget.toString().trim().toUpperCase()) {
      var jumlahDipilih = 0;
      try {
        var parsed = JSON.parse(ansData[i][4]);
        var butirObj = parsed.butir || parsed;
        for (var idSoal in butirObj) { if (butirObj[idSoal] === true || butirObj[idSoal] === "Ya") jumlahDipilih++; }
      } catch(e) {}
      var persentaseVal = (jumlahDipilih / totalSoalKelas) * 100;
      listKonseli.push({ nama: ansData[i][2], kelas: ansData[i][3], jumlah: jumlahDipilih, persentaseVal: persentaseVal, prosentase: persentaseVal.toFixed(1) + "%" });
    }
  }
  listKonseli.sort(function(a, b) { return b.persentaseVal - a.persentaseVal; });
  return { kelas: kelasTarget, konseli: listKonseli, tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy") };
}
function getRumusanKebutuhanData(tingkatKelasFilter) {
  var ss = SpreadsheetActive_();
  var sheetSoal = ss.getSheetByName("AKPD_Soal");
  var data = sheetSoal.getDataRange().getValues();
  var headers = data[0];
  var idxKelas = headers.indexOf("Kelas");
  var idxAspek = headers.indexOf("Aspek");
  var idxPertanyaan = headers.indexOf("Pertanyaan");
  var idxRumusan = headers.indexOf("Rumusan Kebutuhan");
  var idxKomponen = headers.indexOf("Komponen Program");
  if (idxKomponen === -1) idxKomponen = headers.indexOf("Komponen Layanan");
  var hasil = [], nomorUrut = 1;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kelasSoal = idxKelas !== -1 && row[idxKelas] ? row[idxKelas].toString().trim().toUpperCase() : "X";
    if (tingkatKelasFilter && tingkatKelasFilter !== "SEMUA" && kelasSoal !== tingkatKelasFilter.toString().trim().toUpperCase()) continue;
    var kompVal = idxKomponen !== -1 && row[idxKomponen] ? row[idxKomponen].toString().trim().toLowerCase() : "";
    if (kompVal.includes("dukungan")) continue; 
    var rumusan = idxRumusan !== -1 ? row[idxRumusan] : "";
    var asesmen = idxPertanyaan !== -1 ? row[idxPertanyaan] : "";
    if (rumusan || asesmen) {
      hasil.push({ no: nomorUrut++, bidang: (idxAspek !== -1 ? row[idxAspek] : "Pribadi"), asesmenKebutuhan: asesmen, rumusanKebutuhan: rumusan, kelas: kelasSoal });
    }
  }
  return { status: "success", dataRumusan: hasil, tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy") };
}
function getRumusanTujuanData(tingkatKelasFilter) {
  var ss = SpreadsheetActive_();
  var sheetSoal = ss.getSheetByName("AKPD_Soal");
  var data = sheetSoal.getDataRange().getValues();
  var headers = data[0];
  var idxKelas = headers.indexOf("Kelas"), idxAspek = headers.indexOf("Aspek"), idxRumusan = headers.indexOf("Rumusan Kebutuhan"), idxTujuan = headers.indexOf("Tujuan Layanan");
  var idxKomponen = headers.indexOf("Komponen Program");
  if (idxKomponen === -1) idxKomponen = headers.indexOf("Komponen Layanan");
  var hasil = [], nomorUrut = 1;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kelasSoal = idxKelas !== -1 && row[idxKelas] ? row[idxKelas].toString().trim().toUpperCase() : "X";
    if (tingkatKelasFilter && tingkatKelasFilter !== "SEMUA" && kelasSoal !== tingkatKelasFilter.toString().trim().toUpperCase()) continue;
    var kompVal = idxKomponen !== -1 && row[idxKomponen] ? row[idxKomponen].toString().trim().toLowerCase() : "";
    if (kompVal.includes("dukungan")) continue;
    var rumusan = idxRumusan !== -1 ? row[idxRumusan] : "";
    var tujuan = idxTujuan !== -1 ? row[idxTujuan] : "";
    if (rumusan || tujuan) {
      hasil.push({ no: nomorUrut++, bidang: (idxAspek !== -1 ? row[idxAspek] : "Pribadi"), rumusanKebutuhan: rumusan || "-", tujuanLayanan: tujuan || "-", kelas: kelasSoal });
    }
  }
  return { status: "success", dataTujuan: hasil, tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy") };
}
function getKomponenProgramData(tingkatKelasFilter) {
  var ss = SpreadsheetActive_();
  var komponenData = {
    "Layanan Dasar": [],
    "Layanan Responsif": [],
    "Layanan Peminatan/Perencanaan Individual": [],
    "Dukungan Sistem": []
  };
  var sheetSoal = ss.getSheetByName("AKPD_Soal");
  if (sheetSoal) {
    var dataSoal = sheetSoal.getDataRange().getValues();
    var headersSoal = dataSoal[0];
    var idxKelas = headersSoal.indexOf("Kelas");
    var idxAspek = headersSoal.indexOf("Aspek");
    var idxMateri = headersSoal.indexOf("Materi Layanan");
    if (idxMateri === -1) idxMateri = 7; 
    var idxKomponen = headersSoal.indexOf("Komponen Program");
    if (idxKomponen === -1) idxKomponen = headersSoal.indexOf("Komponen Layanan");
    if (idxKomponen === -1) idxKomponen = 6; 
    for (var i = 1; i < dataSoal.length; i++) {
      var row = dataSoal[i];
      var kelasSoal = idxKelas !== -1 && row[idxKelas] ? row[idxKelas].toString().trim().toUpperCase() : "X";
      var materi = idxMateri !== -1 && row[idxMateri] ? row[idxMateri].toString().trim() : "";
      var komponenStr = idxKomponen !== -1 && row[idxKomponen] ? row[idxKomponen].toString().trim().toLowerCase() : "";
      if (materi) {
        var targetKomponen = "";
        if (komponenStr.includes("dukungan")) {
          targetKomponen = "Dukungan Sistem";
        } else {
          if (tingkatKelasFilter && tingkatKelasFilter !== "SEMUA") {
            if (kelasSoal !== "SEMUA" && kelasSoal !== tingkatKelasFilter.toString().trim().toUpperCase()) continue;
          }
          if (komponenStr.includes("responsif")) {
            targetKomponen = "Layanan Responsif";
          } else if (komponenStr.includes("peminatan") || komponenStr.includes("individual")) {
            targetKomponen = "Layanan Peminatan/Perencanaan Individual";
          } else if (komponenStr.includes("dasar")) {
            targetKomponen = "Layanan Dasar";
          } else {
            var aspek = idxAspek !== -1 && row[idxAspek] ? row[idxAspek].toString().trim().toLowerCase() : "";
            if (aspek === "karir") {
              targetKomponen = "Layanan Peminatan/Perencanaan Individual";
            } else {
              targetKomponen = "Layanan Dasar";
            }
          }
        }
        if (targetKomponen && komponenData[targetKomponen]) {
          komponenData[targetKomponen].push(materi);
        }
      }
    }
  }
  var totalMateriGlobal = 0;
  var standarKomponen = ["Layanan Dasar", "Layanan Responsif", "Layanan Peminatan/Perencanaan Individual", "Dukungan Sistem"];
  standarKomponen.forEach(function(komp) {
    totalMateriGlobal += komponenData[komp].length;
  });
  var hasil = [];
  var nomorUrut = 1;
  var totalProporsi = 0;
  var totalJam = 0;
  standarKomponen.forEach(function(komp) {
    var listMateri = komponenData[komp];
    var jumlahLayanan = listMateri.length;
    var proporsiVal = totalMateriGlobal > 0 ? (jumlahLayanan / totalMateriGlobal) : 0;
    var proporsiPersen = (proporsiVal * 100).toFixed(1) + "%";
    var waktuJam = (proporsiVal * 24).toFixed(1);
    totalProporsi += proporsiVal;
    totalJam += parseFloat(waktuJam);
    var formattedMateri = "-";
    if (jumlahLayanan > 0) {
      formattedMateri = '<ol style="padding-left: 18px; margin-bottom: 0;">' + 
        listMateri.map(function(m) { return '<li style="margin-bottom: 4px;">' + m + '</li>'; }).join("") + 
        '</ol>';
    }
    hasil.push({
      no: nomorUrut++,
      komponenProgram: komp,
      materiLayanan: formattedMateri,
      jumlahLayanan: jumlahLayanan,
      proporsi: proporsiPersen,
      waktuJam: waktuJam + " Jam"
    });
  });
  return {
    status: "success",
    dataKomponen: hasil,
    totalMateri: totalMateriGlobal,
    totalProporsi: (totalProporsi * 100).toFixed(0) + "%",
    totalJam: totalJam.toFixed(1) + " Jam",
    tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy")
  };
}
function getActionPlanData(tingkatKelasFilter) {
  var ss = SpreadsheetActive_();
  var sheetSoal = ss.getSheetByName("AKPD_Soal");
  var dataSoal = sheetSoal.getDataRange().getValues();
  var headers = dataSoal[0];
  var idxId = headers.indexOf("ID_Soal");
  var idxKelas = headers.indexOf("Kelas");
  var idxAspek = headers.indexOf("Aspek");
  var idxTujuan = headers.indexOf("Tujuan Layanan");
  var idxKomponen = headers.indexOf("Komponen Program");
  if (idxKomponen === -1) idxKomponen = headers.indexOf("Komponen Layanan");
  var idxMateri = headers.indexOf("Materi Layanan");
  if (idxMateri === -1) idxMateri = 7;
  var targetTingkat = tingkatKelasFilter ? tingkatKelasFilter.toString().trim().toUpperCase() : "X";
  // Hitung jumlah pilihan siswa untuk setiap butir soal di tingkat kelas tersebut
  var ansSheet = ss.getSheetByName("AKPD_Jawaban");
  var ansData = ansSheet.getDataRange().getValues();
  var respondenPerSoal = {};
  var totalSiswaKelasTingkat = 0;
  var userSheet = ss.getSheetByName("Users");
  var userData = userSheet.getDataRange().getValues();
  for (var u = 1; u < userData.length; u++) {
    if (userData[u][2] === "siswa") {
      var klsSiswa = userData[u][4].toString().trim().toUpperCase();
      var matchT = klsSiswa.match(/^[IVXLCDM]+|[0-9]+/i);
      var tingSiswa = matchT ? matchT[0] : klsSiswa;
      if (klsSiswa === targetTingkat || tingSiswa === targetTingkat) {
        totalSiswaKelasTingkat++;
      }
    }
  }
  for (var j = 1; j < ansData.length; j++) {
    var klsAns = ansData[j][3].toString().trim().toUpperCase();
    var matchA = klsAns.match(/^[IVXLCDM]+|[0-9]+/i);
    var tingAns = matchA ? matchA[0] : klsAns;
    if (klsAns === targetTingkat || tingAns === targetTingkat) {
      try {
        var parsed = JSON.parse(ansData[j][4]);
        var butirObj = parsed.butir || parsed;
        for (var idSoal in butirObj) {
          if (butirObj[idSoal] === true || butirObj[idSoal] === "Ya") {
            respondenPerSoal[idSoal] = (respondenPerSoal[idSoal] || 0) + 1;
          }
        }
      } catch(e) {}
    }
  }
  var rawList = [];
  for (var i = 1; i < dataSoal.length; i++) {
    var row = dataSoal[i];
    var idSoal = idxId !== -1 ? row[idxId].toString() : i.toString();
    var kelasSoal = idxKelas !== -1 && row[idxKelas] ? row[idxKelas].toString().trim().toUpperCase() : "X";
    if (kelasSoal !== "SEMUA" && kelasSoal !== targetTingkat) continue;
    var kompVal = idxKomponen !== -1 && row[idxKomponen] ? row[idxKomponen].toString().trim().toLowerCase() : "";
    if (kompVal.includes("dukungan")) continue;
    var materi = idxMateri !== -1 && row[idxMateri] ? row[idxMateri].toString().trim() : "";
    if (materi) {
      var jmlRes = respondenPerSoal[idSoal] || 0;
      var prosentaseVal = totalSiswaKelasTingkat > 0 ? (jmlRes / totalSiswaKelasTingkat) * 100 : 0;
      var prioritas = "Rendah";
      if (prosentaseVal >= 50) prioritas = "Tinggi";
      else if (prosentaseVal >= 25) prioritas = "Sedang";
      rawList.push({
        id: idSoal,
        komponenProgram: row[idxKomponen] || "Layanan Dasar",
        bidangLayanan: idxAspek !== -1 && row[idxAspek] ? row[idxAspek].toString().trim() : "Pribadi",
        tujuanLayanan: idxTujuan !== -1 && row[idxTujuan] ? row[idxTujuan].toString().trim() : "Mengembangkan potensi dan kemandirian siswa",
        materiKegiatan: materi,
        jmlResponden: jmlRes,
        prosentaseVal: prosentaseVal,
        prioritas: prioritas
      });
    }
  }
  // Urutkan berdasarkan prioritas siswa terbanyak (Tinggi -> Sedang -> Rendah, lalu jumlah pemilih terbanyak)
  rawList.sort(function(a, b) {
    var order = { "Tinggi": 1, "Sedang": 2, "Rendah": 3 };
    if (order[a.prioritas] !== order[b.prioritas]) return order[a.prioritas] - order[b.prioritas];
    return b.prosentaseVal - a.prosentaseVal;
  });
  var hasil = [];
  var semester1 = ["Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var semester2 = ["Januari", "Februari", "Maret", "April", "Mei", "Juni"];
  var semuaBulan = semester1.concat(semester2);
  var totalMateri = rawList.length;
  rawList.forEach(function(item, idx) {
    var indexBulan = Math.floor((idx * semuaBulan.length) / (totalMateri > 0 ? totalMateri : 1));
    if (indexBulan >= semuaBulan.length) indexBulan = semuaBulan.length - 1;
    hasil.push({
      no: idx + 1,
      komponenProgram: item.komponenProgram,
      bidangLayanan: item.bidangLayanan,
      tujuanLayanan: item.tujuanLayanan,
      materiKegiatan: item.materiKegiatan,
      strategiLayanan: "Klasikal / Bimbingan Kelompok",
      sasaran: "Kelas " + targetTingkat,
      waktuPelaksanaan: semuaBulan[indexBulan],
      evaluasi: "Proses & Hasil (Laporan Pelaksanaan)"
    });
  });
  return {
    status: "success",
    dataActionPlan: hasil,
    tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy")
  };
}