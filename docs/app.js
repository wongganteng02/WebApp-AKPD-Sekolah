/* =====================================================================
   Jembatan ke Google Apps Script (pengganti google.script.run)
   URL API dibaca dari <meta name="api-url" content="..."> di index.html
   Semua kode di bawahnya tidak diubah dari versi Page.html.
   ===================================================================== */
(function () {
    function apiUrl() {
        var m = document.querySelector('meta[name="api-url"]');
        return m ? (m.getAttribute('content') || '').trim() : '';
    }
    function kirim(fn, args) {
        var url = apiUrl();
        if (!url || url.indexOf('GANTI_DENGAN') !== -1) {
            return Promise.reject(new Error('URL API belum diisi. Isi meta "api-url" di index.html dengan URL Web App Apps Script.'));
        }
        // text/plain = "simple request", tidak memicu preflight CORS yang tidak didukung Apps Script
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ fn: fn, args: args }),
            redirect: 'follow'
        })
        .then(function (r) { return r.text(); })
        .then(function (t) {
            var j;
            try { j = JSON.parse(t); } catch (e) { throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone" dan URL-nya benar.'); }
            if (!j.ok) throw new Error(j.error || 'Terjadi kesalahan pada server.');
            return j.data;
        });
    }
    // Bila sesi (6 jam) habis tetapi "Ingat saya" aktif, login ulang otomatis lalu ulangi permintaan.
    var pemulihan = null;
    function pulihkanSesi() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem('akpd_ingat_saya')); } catch (e) {}
        if (!raw || !raw.token) return Promise.resolve(null);
        if (!pemulihan) {
            pemulihan = kirim('resumeSession', [raw.token])
                .then(function (res) { return res && res.status === 'success' ? res.token : null; })
                .catch(function () { return null; })
                .then(function (t) { setTimeout(function () { pemulihan = null; }, 0); return t; });
        }
        return pemulihan;
    }
    function call(fn, args, onOk, onErr) {
        kirim(fn, args).catch(function (e) {
            if (/^Sesi berakhir/.test(e.message) && fn !== 'resumeSession' && fn !== 'authenticateUser') {
                return pulihkanSesi().then(function (tok) {
                    if (!tok || !currentUser || args[0] !== currentUser.token) throw e;
                    currentUser.token = tok;
                    var args2 = args.slice(); args2[0] = tok;
                    return kirim(fn, args2);
                });
            }
            throw e;
        }).then(onOk, function (e) {
            var msg = (e && e.message) || String(e);
            if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Tidak dapat terhubung ke server. Periksa koneksi internet atau URL API.';
            onErr({ message: msg });
        });
    }
    function Runner(ok, err) {
        var self = this;
        this.withSuccessHandler = function (f) { return new Runner(f, err); };
        this.withFailureHandler = function (f) { return new Runner(ok, f); };
        return new Proxy(this, {
            get: function (t, prop) {
                if (prop === 'withSuccessHandler' || prop === 'withFailureHandler') return t[prop];
                return function () {
                    var args = Array.prototype.slice.call(arguments);
                    call(prop, args, ok || function () {}, err || function (e) { console.error(e); });
                };
            }
        });
    }
    window.google = { script: { run: new Runner(null, null) } };
})();

        let currentUser = null, globalConfig = {}, chartBidangInstance = null, chartKelasInstance = null;
        let globalAnalisaData = [], globalDaftarKelas = [], globalRumusanData = [], globalTujuanData = [], globalKomponenData = [], globalActionPlanData = [];
        document.addEventListener("DOMContentLoaded", function() { loadConfigData(); initIngatSaya(); });
        function showLoader(show) {
            let overlay = document.getElementById("loadingOverlay");
            if (!show && resumingSesi) return;
            if (overlay) overlay.style.display = show ? "flex" : "none";
        }
        
        function changePwUI() {
            Swal.fire({ title: 'Ganti Password', confirmButtonText: 'Simpan', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonColor: '#1d4e89',
                html: '<input id="pw0" type="password" class="swal2-input" placeholder="Password saat ini"><input id="pw1" type="password" class="swal2-input" placeholder="Password baru (min. 6 karakter)"><input id="pw2" type="password" class="swal2-input" placeholder="Ulangi password baru">',
                preConfirm: () => { if (pw1.value.length < 6) return Swal.showValidationMessage('Password baru minimal 6 karakter.'); if (pw1.value !== pw2.value) return Swal.showValidationMessage('Konfirmasi password tidak sama.'); return { o: pw0.value, n: pw1.value }; } }).then(r => {
                if (!r.isConfirmed) return; showLoader(true);
                google.script.run.withSuccessHandler(res => { showLoader(false); const d = bacaIngatSaya(); if (d && res && res.rememberToken) { d.token = res.rememberToken; tulisIngatSaya(d); } Swal.fire({ icon: 'success', title: 'Password diganti', timer: 1500, showConfirmButton: false }); }).withFailureHandler(errUI).changePassword(tk(), r.value.o, r.value.n, !!bacaIngatSaya());
            });
        }
        function akhirTahunUI() {
            showLoader(true);
            google.script.run.withSuccessHandler(p => {
                showLoader(false);
                const m = String(p.tahunAjaran).match(/(\d{4})\D+(\d{4})/), baru = m ? (+m[1] + 1) + '/' + (+m[2] + 1) : '';
                Swal.fire({ title: 'Proses Akhir Tahun Ajaran', width: 560, showCancelButton: true, confirmButtonText: 'Proses', cancelButtonText: 'Batal', confirmButtonColor: '#c0392b',
                    html: `<div class="text-start small"><p class="text-danger fw-semibold mb-2">Permanen dan tanpa arsip. Buat salinan spreadsheet dulu (File → Buat salinan).</p><p class="mb-1">Yang akan dilakukan:</p><ul><li><b>${p.lulus}</b> siswa kelas XII dihapus beserta jawabannya</li><li><b>${p.naikXI}</b> siswa kelas XI naik ke XII</li><li><b>${p.naikX}</b> siswa kelas X naik ke XI</li><li><b>${p.jawaban}</b> jawaban AKPD semua siswa dikosongkan (tidak ada arsip)</li></ul>${p.tidakDikenali ? `<p class="text-danger">${p.tidakDikenali} siswa dengan penulisan kelas tidak dikenali tidak diubah.</p>` : ''}<label class="form-label mb-0">Tahun ajaran baru</label><input id="akT" class="form-control mb-2" value="${esc(baru)}"><label class="form-label mb-0">Ketik <b>PROSES</b> untuk melanjutkan</label><input id="akK" class="form-control"></div>`,
                    preConfirm: () => { if (akK.value.trim().toUpperCase() !== 'PROSES') return Swal.showValidationMessage('Ketik PROSES untuk melanjutkan.'); return akT.value.trim(); } }).then(r => {
                    if (!r.isConfirmed) return; showLoader(true);
                    google.script.run.withSuccessHandler(res => {
                        showLoader(false); loadUsers(); try { loadConfigData(); } catch (e) {}
                        Swal.fire({ icon: 'success', title: 'Selesai', html: `<div class="small text-start">${res.lulus} siswa kelas XII dihapus, ${res.naik} siswa naik kelas, dan ${res.jawaban} jawaban dikosongkan.</div>` });
                    }).withFailureHandler(errUI).prosesAkhirTahun(tk(), r.value);
                });
            }).withFailureHandler(errUI).previewAkhirTahun(tk());
        }
        const fld = (label, inner) => `<div class="mb-3 text-start"><label class="form-label small fw-semibold text-secondary mb-1">${label}</label>${inner}</div>`;
        let globalUsers = [];
        const tk = () => currentUser && currentUser.token;
        const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const errUI = e => { showLoader(false); Swal.fire({ icon: 'error', title: 'Gagal', text: e.message }); };
        function loadUsers() {
            showLoader(true);
            google.script.run.withSuccessHandler(r => {
                showLoader(false); globalUsers = r;
                const ks = [...new Set(r.filter(u => u.role === 'siswa').map(u => u.kelas))].sort();
                document.getElementById('filterUserKelas').innerHTML = '<option value="">Semua Kelas</option>' + ks.map(k => `<option>${esc(k)}</option>`).join('');
                renderUsers();
            }).withFailureHandler(errUI).listUsers(tk());
        }
        function renderUsers() {
            const q = document.getElementById('searchUser').value.toLowerCase(), k = document.getElementById('filterUserKelas').value;
            const rows = globalUsers.map((u, i) => ({ u, i })).filter(({ u }) => (!k || u.kelas === k) && (u.nama + u.username).toLowerCase().includes(q));
            document.getElementById('tabelUserBody').innerHTML = rows.length ? rows.map(({ u, i }) => `<tr><td><b>${esc(u.nama)}</b><div class="small text-muted">${esc(u.username)}</div></td><td>${esc(u.kelas)}<div><span class="badge ${u.role === 'siswa' ? 'bg-secondary' : 'bg-primary'}">${esc(u.role)}</span></div></td><td class="text-center text-nowrap"><button class="btn btn-sm btn-outline-primary" title="Edit" onclick="userForm(${i})"><i class="fas fa-pen"></i></button> <button class="btn btn-sm btn-outline-primary" title="Reset password" onclick="resetPw(${i})"><i class="fas fa-key"></i></button> <button class="btn btn-sm btn-outline-primary" title="Hapus" onclick="delUser(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="3" class="text-center text-muted">Tidak ada data.</td></tr>';
        }
        function userForm(i) {
            const e = i !== undefined, u = e ? globalUsers[i] : { username: '', nama: '', kelas: '', role: 'siswa' };
            Swal.fire({ titleText: e ? 'Edit Pengguna' : 'Tambah Pengguna', width: 480, confirmButtonText: 'Simpan', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonColor: '#1d4e89', focusConfirm: false,
                html: `<div class="text-start">${fld('NISN / Username', `<input id="su" class="form-control" value="${esc(u.username)}" ${e ? 'readonly' : ''}>`)}${fld('Nama lengkap', `<input id="sn" class="form-control" value="${esc(u.nama)}">`)}${fld('Kelas', `<input id="sk" class="form-control" placeholder="Contoh: XI 1 (kosongkan untuk guru)" value="${esc(u.kelas === '-' ? '' : u.kelas)}">`)}${fld('Role', `<select id="sr" class="form-select"><option value="siswa">Siswa</option><option value="guru" ${u.role !== 'siswa' ? 'selected' : ''}>Guru BK</option></select>`)}</div>`,
                preConfirm: () => ({ username: su.value.trim(), nama: sn.value.trim(), kelas: sk.value.trim(), role: sr.value }) }).then(r => {
                if (!r.isConfirmed) return;
                showLoader(true);
                google.script.run.withSuccessHandler(res => { showLoader(false); loadUsers(); if (res.password) showPw([{ username: r.value.username, nama: r.value.nama, kelas: r.value.kelas, password: res.password }]); else Swal.fire({ icon: 'success', title: 'Tersimpan', timer: 1200, showConfirmButton: false }); }).withFailureHandler(errUI).saveUser(tk(), r.value, e);
            });
        }
        function resetPw(i) {
            const u = globalUsers[i];
            Swal.fire({ title: 'Reset password?', text: u.nama, icon: 'question', showCancelButton: true, confirmButtonText: 'Reset', cancelButtonText: 'Batal', confirmButtonColor: '#1d4e89' }).then(r => {
                if (!r.isConfirmed) return; showLoader(true);
                google.script.run.withSuccessHandler(res => { showLoader(false); showPw([{ username: u.username, nama: u.nama, kelas: u.kelas, password: res.password }]); }).withFailureHandler(errUI).resetPassword(tk(), u.username);
            });
        }
        function delUser(i) {
            const u = globalUsers[i];
            Swal.fire({ title: 'Hapus pengguna?', text: u.nama + ' (' + u.username + '). Jawaban AKPD siswa ini ikut dihapus.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', cancelButtonText: 'Batal', confirmButtonColor: '#c0392b' }).then(r => {
                if (!r.isConfirmed) return; showLoader(true);
                google.script.run.withSuccessHandler(() => { showLoader(false); loadUsers(); }).withFailureHandler(errUI).deleteUser(tk(), u.username);
            });
        }
        function importUsersUI() {
            Swal.fire({ title: 'Impor Siswa dari Excel', confirmButtonText: 'Impor', showCancelButton: true, cancelButtonText: 'Batal', confirmButtonColor: '#1d4e89', width: 640,
                html: '<p class="small text-muted text-start mb-2">Salin dari Excel 3 kolom <b>tanpa judul</b>: NISN, Nama, Kelas, lalu tempel di bawah. Password dibuatkan otomatis.</p><textarea id="imp" class="swal2-textarea" rows="8" style="width:90%" placeholder="0012345678&#9;Budi Santoso&#9;XI 1"></textarea>',
                preConfirm: () => imp.value.split('\n').map(l => l.split(/\t|;/).map(x => x.trim())).filter(c => c[0]).map(c => ({ username: c[0], nama: c[1] || '', kelas: c[2] || '' })) }).then(r => {
                if (!r.isConfirmed || !r.value.length) return; showLoader(true);
                google.script.run.withSuccessHandler(res => { showLoader(false); loadUsers(); showPw(res.created, res.skipped); }).withFailureHandler(errUI).importUsers(tk(), r.value);
            });
        }
        function showPw(list, skipped) {
            const rows = list.map(x => `<tr><td>${esc(x.username)}</td><td>${esc(x.nama)}</td><td>${esc(x.kelas)}</td><td><code>${esc(x.password)}</code></td></tr>`).join('');
            Swal.fire({ title: list.length + ' password dibuat', width: 700, showDenyButton: true, denyButtonText: 'Unduh CSV', confirmButtonText: 'Tutup', confirmButtonColor: '#1d4e89', denyButtonColor: '#0f9d8a',
                html: `<p class="small text-danger mb-2">Password hanya tampil sekarang dan disimpan terenkripsi. Unduh atau catat sebelum menutup.${skipped ? ' ' + skipped + ' baris dilewati (duplikat/tidak valid).' : ''}</p><div style="max-height:300px;overflow:auto"><table class="table table-sm text-start"><thead><tr><th>NISN</th><th>Nama</th><th>Kelas</th><th>Password</th></tr></thead><tbody>${rows}</tbody></table></div>` }).then(r => {
                if (r.isDenied) {
                    const csv = 'NISN,Nama,Kelas,Password\n' + list.map(x => [x.username, x.nama, x.kelas, x.password].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
                    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = 'password-siswa.csv'; a.click();
                }
            });
        }
        function loadConfigData() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(config) {
                    globalConfig = config;
                    applyConfigToUI(config);
                    loadSettingsModalValues();
                    showLoader(false);
                })
                .withFailureHandler(function(err) {
                    showLoader(false);
                    Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal memuat konfigurasi: ' + err.message });
                })
                .getConfig();
        }
        function applyConfigToUI(config) {
            document.getElementById("loginYayasan").innerText = config.namaYayasan || "";
            document.getElementById("loginNamaSekolah").innerText = config.namaSekolah || "Aplikasi AKPD";
            document.getElementById("loginAlamatSekolah").innerHTML = `<i class="fas fa-map-marker-alt me-1"></i> ${config.alamatSekolah || ""}`;
            if (config.logoUrl) document.getElementById("loginLogoImg").src = config.logoUrl;
            document.getElementById("navNamaSekolahGuru").innerText = config.namaSekolah || "Panel Guru BK";
            document.getElementById("navYayasanGuru").innerText = config.namaYayasan || "";
            if (config.logoUrl) { document.getElementById("navLogoGuru").src = config.logoUrl; document.getElementById("guruHeaderLogo").src = config.logoUrl; }
            document.getElementById("sbYayasanGuru").innerText = config.namaYayasan || "";
            if (currentUser) document.getElementById("sbUserInfo").innerText = namaGuruSidebar(config, currentUser.nama);
            document.getElementById("sidebarGuruLabel").innerText = config.namaSekolah || "Panel Guru BK";
            if (config.logoUrl) document.getElementById("sbLogoGuru").src = config.logoUrl;
            document.getElementById("guruHeaderYayasan").innerText = config.namaYayasan || "";
            document.getElementById("guruHeaderSekolah").innerText = config.namaSekolah || "";
            document.getElementById("guruHeaderAlamat").innerHTML = `<i class="fas fa-map-marker-alt me-1"></i> ${config.alamatSekolah || ""}`;
            document.getElementById("printNamaSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printKonseliSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printRumusanSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printTujuanSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printKomponenSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            let elYayasan = document.getElementById("printActionYayasan");
            if (elYayasan) elYayasan.innerText = config.namaYayasan || "NAMA YAYASAN";
            document.getElementById("printActionSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printAnalisaSekolah").innerText = config.namaSekolah || "NAMA SEKOLAH";
            document.getElementById("printAnalisaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printAnalisaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("labelAnalisaTahun").innerText = config.tahunAjaran || "-";
            ["printNamaSekolah", "printKonseliSekolah", "printRumusanSekolah", "printTujuanSekolah", "printKomponenSekolah", "printActionSekolah", "printAnalisaSekolah"].forEach(function(id) {
                var h = document.getElementById(id); if (!h) return;
                var box = h.parentElement, im = box.querySelector(".print-logo");
                if (config.logoUrl) {
                    if (!im) { im = document.createElement("img"); im.className = "print-logo"; im.alt = "Logo"; box.insertBefore(im, box.firstChild); }
                    im.src = config.logoUrl; box.classList.add("print-kop");
                } else { if (im) im.remove(); box.classList.remove("print-kop"); }
            });
            document.getElementById("printNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("printKonseliNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printKonseliNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("printRumusanNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printRumusanNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("printTujuanNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printTujuanNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("printKomponenNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printKomponenNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("printActionNamaKepala").innerText = config.namaKepala || "-";
            document.getElementById("printActionNamaGuruBK").innerText = config.namaGuruBK || "-";
            document.getElementById("labelRumusanTahun").innerText = config.tahunAjaran || "-";
            document.getElementById("labelTujuanTahun").innerText = config.tahunAjaran || "-";
            document.getElementById("labelKomponenTahun").innerText = config.tahunAjaran || "-";
            document.getElementById("labelActionTahun").innerText = config.tahunAjaran || "-";
            document.getElementById("navNamaSekolahSiswa").innerText = config.namaSekolah || "AKPD Siswa";
            document.getElementById("navYayasanSiswa").innerText = config.namaYayasan || "";
            if (config.logoUrl) { document.getElementById("navLogoSiswa").src = config.logoUrl; document.getElementById("siswaHeaderLogo").src = config.logoUrl; }
            document.getElementById("siswaHeaderYayasan").innerText = config.namaYayasan || "";
            document.getElementById("siswaHeaderSekolah").innerText = config.namaSekolah || "";
            document.getElementById("siswaHeaderAlamat").innerHTML = `<i class="fas fa-map-marker-alt me-1"></i> ${config.alamatSekolah || ""}`;
        }
        function setRoleTarget(role) {
            document.getElementById("selectedRole").value = role;
            document.getElementById("loginTab").classList.toggle("is-guru", role === "guru");
            terapkanIngatSaya(role);
            let tabMurid = document.getElementById("tab-murid"), tabGuru = document.getElementById("tab-guru"), labelUser = document.getElementById("labelUsername"), inputUser = document.getElementById("username"), btnSubmit = document.getElementById("btnLoginSubmit");
            if (role === 'siswa') {
                tabMurid.className = "nav-link active fw-semibold py-2"; tabGuru.className = "nav-link fw-semibold py-2";
                labelUser.innerText = "NISN / Username Siswa"; inputUser.placeholder = "Masukkan NISN Anda";
                btnSubmit.className = "btn btn-primary w-100 py-2.5 fw-semibold shadow-sm"; btnSubmit.innerHTML = `<i class="fas fa-sign-in-alt me-2"></i> Masuk sebagai Murid`;
            } else {
                tabGuru.className = "nav-link active fw-semibold py-2"; tabMurid.className = "nav-link fw-semibold py-2";
                labelUser.innerText = "Username / ID Guru BK"; inputUser.placeholder = "Masukkan username Guru BK";
                btnSubmit.className = "btn btn-primary w-100 py-2.5 fw-semibold shadow-sm"; btnSubmit.innerHTML = `<i class="fas fa-sign-in-alt me-2"></i> Masuk sebagai Guru BK`;
            }
        }
        function handleLogin(e) {
            e.preventDefault();
            var user = document.getElementById("username").value, pass = document.getElementById("password").value, expectedRole = document.getElementById("selectedRole").value;
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        if (expectedRole === 'siswa' && res.role !== 'siswa') { Swal.fire({ icon: 'warning', title: 'Perhatian', text: "Akun ini bukan akun Siswa." }); return; }
                        if (expectedRole === 'guru' && res.role !== 'guru' && res.role !== 'admin') { Swal.fire({ icon: 'warning', title: 'Perhatian', text: "Akun ini bukan akun Guru BK." }); return; }
                        currentUser = res;
                        simpanIngatSaya(expectedRole, user, res.rememberToken);
                        bukaSesi(res);
                    } else {
                        Swal.fire({ icon: 'error', title: 'Login Gagal', text: res.message });
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .authenticateUser(user, pass, document.getElementById("ingatSaya").checked);
        }
        function logout() {
            currentUser = null;
            hapusIngatSaya();
            document.getElementById("loginSection").style.display = "block";
            document.getElementById("guruSection").style.display = "none";
            document.getElementById("siswaSection").style.display = "none";
            document.getElementById("loginForm").reset();
            setRoleTarget("siswa");
            resetTampilPassword();
            if (chartBidangInstance) chartBidangInstance.destroy();
            if (chartKelasInstance) chartKelasInstance.destroy();
        }
        function switchGuruMenu(menu) {
            const menus = ['dashboard', 'analisa', 'profilKelas', 'profilKonseli', 'rumusan', 'tujuan', 'komponen', 'actionPlan', 'pengguna'];
            menus.forEach(m => {
                document.getElementById(`guruTab${m.charAt(0).toUpperCase() + m.slice(1)}`).style.display = m === menu ? "block" : "none";
                let btn = document.getElementById(`menuBtn${m.charAt(0).toUpperCase() + m.slice(1)}`);
                if (btn) btn.className = m === menu ? "menu-link active" : "menu-link";
                let sb = document.getElementById(`sbBtn${m.charAt(0).toUpperCase() + m.slice(1)}`);
                if (sb) sb.className = m === menu ? "sb-link active" : "sb-link";
            });
            if (menu === 'dashboard') loadDashboard();
            else if (menu === 'analisa') loadAnalisaData();
            else if (menu === 'profilKelas') initFilterKelasProfil();
            else if (menu === 'profilKonseli') initFilterKelasKonseli();
            else if (menu === 'rumusan') loadRumusanKebutuhan();
            else if (menu === 'tujuan') loadRumusanTujuan();
            else if (menu === 'komponen') loadKomponenProgram();
            else if (menu === 'actionPlan') loadActionPlan();
            else if (menu === 'pengguna') loadUsers();
        }
        function loadDashboard() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(data) {
                    showLoader(false);
                    document.getElementById("statTotalSiswa").innerText = data.totalSiswa;
                    document.getElementById("statTotalKelas").innerText = data.totalKelas;
                    document.getElementById("statTotalSelesai").innerText = data.totalSelesai;
                    globalDaftarKelas = data.daftarKelas;
                    let tbody = document.getElementById("tabelMasalahBody");
                    tbody.innerHTML = "";
                    data.daftarKelas.forEach(function(kls) {
                        let m = data.masalahPerKelas[kls], totalAspek = m.TotalAspek || 1;
                        tbody.innerHTML += `<tr><td class="fw-bold text-center">${kls}</td><td class="text-center">${m.Pribadi} <br><small class="text-muted">(${((m.Pribadi/totalAspek)*100).toFixed(1)}%)</small></td><td class="text-center">${m.Belajar} <br><small class="text-muted">(${((m.Belajar/totalAspek)*100).toFixed(1)}%)</small></td><td class="text-center">${m.Sosial} <br><small class="text-muted">(${((m.Sosial/totalAspek)*100).toFixed(1)}%)</small></td><td class="text-center">${m.Karir} <br><small class="text-muted">(${((m.Karir/totalAspek)*100).toFixed(1)}%)</small></td><td class="text-center fw-bold">${m.TotalAspek}</td></tr>`;
                    });
                    if (chartBidangInstance) chartBidangInstance.destroy();
                    chartBidangInstance = new Chart(document.getElementById('chartBidang').getContext('2d'), { type: 'doughnut', data: { labels: ['Pribadi', 'Belajar', 'Sosial', 'Karir'], datasets: [{ data: [data.rekapBidang.Pribadi, data.rekapBidang.Belajar, data.rekapBidang.Sosial, data.rekapBidang.Karir], backgroundColor: ['#0d6efd', '#198754', '#ffc107', '#dc3545'] }] }, options: { responsive: true, maintainAspectRatio: false } });
                    if (chartKelasInstance) chartKelasInstance.destroy();
                    chartKelasInstance = new Chart(document.getElementById('chartKelas').getContext('2d'), { type: 'bar', data: { labels: data.daftarKelas, datasets: [{ label: 'Siswa Selesai AKPD', data: data.daftarKelas.map(k => data.selesaiPerKelas[k]), backgroundColor: '#0dcaf0' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getDashboardData();
        }
        function loadAnalisaData() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(list) {
                    showLoader(false);
                    globalAnalisaData = list;
                    populateFilterKelasAnalisa();
                    renderTabelAnalisa(list);
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getAnalisaSiswaData();
        }
        function populateFilterKelasAnalisa() {
            let select = document.getElementById("filterKelasAnalisa"), currentVal = select.value;
            select.innerHTML = `<option value="SEMUA">Semua Kelas</option>`;
            if (globalDaftarKelas) globalDaftarKelas.forEach(k => select.innerHTML += `<option value="${k}">${k}</option>`);
            select.value = currentVal;
        }
        function cetakAnalisa() {
            document.getElementById("printAnalisaTanggal").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
            var st = document.createElement("style"); st.id = "pageLandscape"; st.textContent = "@page { size: A4 landscape; margin: 1.2cm; }"; document.head.appendChild(st);
            var selesai = function() { var s = document.getElementById("pageLandscape"); if (s) s.remove(); window.removeEventListener("afterprint", selesai); };
            window.addEventListener("afterprint", selesai);
            window.print();
        }
        function renderTabelAnalisa(data) {
            var kf = document.getElementById("filterKelasAnalisa");
            document.getElementById("labelAnalisaKelas").innerText = (kf && kf.value !== "SEMUA") ? kf.value : "Semua Kelas";
            document.getElementById("labelAnalisaTotal").innerText = data.length;
            let tbody = document.getElementById("tabelAnalisaBody");
            tbody.innerHTML = "";
            if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">Belum ada data jawaban AKPD siswa yang masuk.</td></tr>`; return; }
            data.forEach((item, idx) => {
                let badgeColor = item.aspekDominan === 'Belajar' ? 'bg-success' : (item.aspekDominan === 'Sosial' ? 'bg-warning text-dark' : (item.aspekDominan === 'Karir' ? 'bg-danger' : 'bg-primary'));
                tbody.innerHTML += `<tr><td class="text-center">${idx + 1}</td><td class="text-center small">${item.timestamp}</td><td class="text-center">${item.nisn}</td><td class="fw-semibold">${item.nama}</td><td class="text-center">${item.kelas}</td><td class="text-center">${item.rincian.Pribadi || 0}</td><td class="text-center">${item.rincian.Belajar || 0}</td><td class="text-center">${item.rincian.Sosial || 0}</td><td class="text-center">${item.rincian.Karir || 0}</td><td class="text-center"><span class="badge ${badgeColor}">${item.aspekDominan}</span></td></tr>`;
            });
        }
        function filterTabelAnalisa() {
            let keyword = document.getElementById("searchAnalisa").value.toLowerCase(), kelasFilter = document.getElementById("filterKelasAnalisa").value;
            let filtered = globalAnalisaData.filter(item => {
                return (item.nama.toLowerCase().includes(keyword) || item.nisn.toLowerCase().includes(keyword) || item.aspekDominan.toLowerCase().includes(keyword)) &&
                       (kelasFilter === "SEMUA" || item.kelas.toString().trim().toUpperCase() === kelasFilter.toString().trim().toUpperCase());
            });
            renderTabelAnalisa(filtered);
        }
        function initFilterKelasProfil() {
            let select = document.getElementById("filterKelasProfil");
            select.innerHTML = "";
            if (globalDaftarKelas.length === 0) { select.innerHTML = `<option value="">Tidak ada kelas</option>`; return; }
            globalDaftarKelas.forEach(k => select.innerHTML += `<option value="${k}">${k}</option>`);
            loadProfilKelasData();
        }
        function loadProfilKelasData() {
            let klsTarget = document.getElementById("filterKelasProfil").value;
            if (!klsTarget) return;
            document.getElementById("labelKelasAktif").innerText = klsTarget;
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    document.getElementById("labelTotalSiswaKelas").innerText = res.totalSiswa; document.getElementById("labelTotalRespondenKelas").innerText = res.totalResponden;
                    document.getElementById("rekapPribadiVal").innerText = res.persentaseRekapBidang.Pribadi; document.getElementById("rekapBelajarVal").innerText = res.persentaseRekapBidang.Belajar; document.getElementById("rekapSosialVal").innerText = res.persentaseRekapBidang.Sosial; document.getElementById("rekapKarirVal").innerText = res.persentaseRekapBidang.Karir; document.getElementById("printTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                    let tbody = document.getElementById("tabelProfilKelasBody"); tbody.innerHTML = "";
                    if (res.profil.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Belum ada butir angket untuk kelas ini.</td></tr>`; return; }
                    res.profil.forEach(p => {
                        let badgePrioritas = p.prioritas === 'Tinggi' ? 'bg-danger' : (p.prioritas === 'Sedang' ? 'bg-warning text-dark' : 'bg-success');
                        tbody.innerHTML += `<tr><td class="text-center">${p.no}</td><td>${p.pertanyaan}</td><td class="text-center">${p.jmlResponden}</td><td class="text-center fw-semibold">${p.prosentase}</td><td class="text-center"><span class="badge ${badgePrioritas}">${p.prioritas}</span></td><td class="text-center">${p.waktuLayanan}</td></tr>`;
                    });
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getProfilKelasData(klsTarget);
        }
        function initFilterKelasKonseli() {
            let select = document.getElementById("filterKelasKonseli");
            select.innerHTML = "";
            if (globalDaftarKelas.length === 0) { select.innerHTML = `<option value="">Tidak ada kelas</option>`; return; }
            globalDaftarKelas.forEach(k => select.innerHTML += `<option value="${k}">${k}</option>`);
            loadProfilKonseliData();
        }
        function loadProfilKonseliData() {
            let klsTarget = document.getElementById("filterKelasKonseli").value;
            if (!klsTarget) return;
            document.getElementById("labelKonseliKelasAktif").innerText = klsTarget;
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    document.getElementById("labelKonseliTotalResponden").innerText = res.konseli.length; document.getElementById("printKonseliTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                    let tbody = document.getElementById("tabelProfilKonseliBody"); tbody.innerHTML = "";
                    if (res.konseli.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Belum ada data siswa yang mengisi AKPD untuk kelas ini.</td></tr>`; return; }
                    res.konseli.forEach((item, idx) => { tbody.innerHTML += `<tr><td class="text-center">${idx + 1}</td><td class="fw-semibold">${item.nama}</td><td class="text-center">${item.jumlah}</td><td class="text-center fw-semibold">${item.prosentase}</td></tr>`; });
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getProfilKonseliData(klsTarget);
        }
        function loadRumusanKebutuhan() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        globalRumusanData = res.dataRumusan;
                        document.getElementById("printRumusanTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                        filterRumusanByTingkat();
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getRumusanKebutuhanData();
        }
        function filterRumusanByTingkat() {
            let selectedTingkat = document.getElementById("filterTingkatKelasRumusan").value;
            document.getElementById("labelTingkatKelasAktif").innerText = selectedTingkat;
            let filtered = globalRumusanData.filter(item => item.kelas.toUpperCase() === selectedTingkat.toUpperCase());
            let tbody = document.getElementById("tabelRumusanBody");
            tbody.innerHTML = "";
            if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Tidak ada data rumusan untuk tingkat kelas ini.</td></tr>`; return; }
            filtered.forEach((item, idx) => {
                let badgeBidang = item.bidang === 'Belajar' ? 'bg-success' : (item.bidang === 'Sosial' ? 'bg-warning text-dark' : (item.bidang === 'Karir' ? 'bg-danger' : 'bg-primary'));
                tbody.innerHTML += `<tr><td class="text-center">${idx + 1}</td><td class="text-center"><span class="badge ${badgeBidang}">${item.bidang}</span></td><td>${item.asesmenKebutuhan}</td><td>${item.rumusanKebutuhan}</td></tr>`;
            });
        }
        function loadRumusanTujuan() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        globalTujuanData = res.dataTujuan;
                        document.getElementById("printTujuanTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                        filterTujuanByTingkat();
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getRumusanTujuanData();
        }
        function filterTujuanByTingkat() {
            let selectedTingkat = document.getElementById("filterTingkatKelasTujuan").value;
            document.getElementById("labelTingkatTujuanAktif").innerText = selectedTingkat;
            let filtered = globalTujuanData.filter(item => item.kelas.toUpperCase() === selectedTingkat.toUpperCase());
            let tbody = document.getElementById("tabelTujuanBody");
            tbody.innerHTML = "";
            if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Tidak ada data tujuan untuk tingkat kelas ini.</td></tr>`; return; }
            filtered.forEach((item, idx) => {
                let badgeBidang = item.bidang === 'Belajar' ? 'bg-success' : (item.bidang === 'Sosial' ? 'bg-warning text-dark' : (item.bidang === 'Karir' ? 'bg-danger' : 'bg-primary'));
                tbody.innerHTML += `<tr><td class="text-center">${idx + 1}</td><td class="text-center"><span class="badge ${badgeBidang}">${item.bidang}</span></td><td>${item.rumusanKebutuhan}</td><td>${item.tujuanLayanan}</td></tr>`;
            });
        }
        function loadKomponenProgram() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        globalKomponenData = res;
                        document.getElementById("printKomponenTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                        filterKomponenByTingkat();
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getKomponenProgramData();
        }
        function filterKomponenByTingkat() {
            let selectedTingkat = document.getElementById("filterTingkatKelasKomponen").value;
            document.getElementById("labelTingkatKomponenAktif").innerText = selectedTingkat;
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        let tbody = document.getElementById("tabelKomponenBody");
                        tbody.innerHTML = "";
                        if (!res.dataKomponen || res.dataKomponen.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Tidak ada data komponen program untuk tingkat kelas ini.</td></tr>`;
                            document.getElementById("footJumlahTotal").innerText = "0";
                            document.getElementById("footProporsiTotal").innerText = "0%";
                            document.getElementById("footWaktuTotal").innerText = "0 Jam";
                            return;
                        }
                        res.dataKomponen.forEach(item => {
                            tbody.innerHTML += `<tr>
                                <td class="text-center">${item.no}</td>
                                <td class="fw-semibold">${item.komponenProgram}</td>
                                <td>${item.materiLayanan}</td>
                                <td class="text-center">${item.jumlahLayanan}</td>
                                <td class="text-center">${item.proporsi}</td>
                                <td class="text-center">${item.waktuJam}</td>
                            </tr>`;
                        });
                        document.getElementById("footJumlahTotal").innerText = res.totalMateri;
                        document.getElementById("footProporsiTotal").innerText = res.totalProporsi;
                        document.getElementById("footWaktuTotal").innerText = res.totalJam;
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getKomponenProgramData(selectedTingkat);
        }
        function loadActionPlan() {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        globalActionPlanData = res.dataActionPlan;
                        document.getElementById("printActionTanggalCetak").innerText = ((globalConfig.kotaCetak || "Kota") + ", ") + res.tanggalCetak;
                        filterActionPlanByTingkat();
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getActionPlanData();
        }
        function filterActionPlanByTingkat() {
            let selectedTingkat = document.getElementById("filterTingkatKelasAction").value;
            document.getElementById("labelTingkatActionAktif").innerText = selectedTingkat;
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        let tbody = document.getElementById("tabelActionPlanBody");
                        tbody.innerHTML = "";
                        let list = res.dataActionPlan;
                        if (!list || list.length === 0) {
                            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Tidak ada data Action Plan untuk tingkat kelas ini.</td></tr>`;
                            return;
                        }
                        list.forEach((item, idx) => {
                            let badgeBidang = item.bidangLayanan === 'Belajar' ? 'bg-success' : (item.bidangLayanan === 'Sosial' ? 'bg-warning text-dark' : (item.bidangLayanan === 'Karir' ? 'bg-danger' : 'bg-primary'));
                            tbody.innerHTML += `<tr>
                                <td class="text-center">${idx + 1}</td>
                                <td class="fw-semibold">${item.komponenProgram}</td>
                                <td class="text-center"><span class="badge ${badgeBidang}">${item.bidangLayanan}</span></td>
                                <td>${item.tujuanLayanan}</td>
                                <td>${item.materiKegiatan}</td>
                                <td>${item.strategiLayanan}</td>
                                <td class="text-center">${item.sasaran}</td>
                                <td class="text-center">${item.waktuPelaksanaan}</td>
                                <td>${item.evaluasi}</td>
                            </tr>`;
                        });
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getActionPlanData(selectedTingkat);
        }
        function loadSoalAKPD(kelasSiswa) {
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(soals) {
                    showLoader(false);
                    let container = document.getElementById("soalContainer");
                    container.innerHTML = "";
                    if (soals.length === 0) { container.innerHTML = `<div class="alert alert-warning">Belum ada instrumen AKPD yang diatur untuk kelas Anda.</div>`; return; }
                    soals.forEach((s, idx) => {
                        container.innerHTML += `<div class="mb-3 border-bottom pb-3"><div class="form-check"><input class="form-check-input soal-item" type="checkbox" value="Ya" id="soal_${s.id}" data-id="${s.id}" data-aspek="${s.aspek}"><label class="form-check-label text-dark fw-medium" for="soal_${s.id}">${idx + 1}. ${s.pertanyaan}</label></div></div>`;
                    });
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .getSoalAKPD(kelasSiswa);
        }
        function submitAkpdForm(e) {
            e.preventDefault();
            let checkboxes = document.querySelectorAll('.soal-item'), rincianButir = {};
            checkboxes.forEach(cb => rincianButir[cb.getAttribute('data-id')] = cb.checked);
            let formData = { nisn: currentUser.username || currentUser.nama, nama: currentUser.nama, kelas: currentUser.kelas, rincianButir: rincianButir };
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    if (res.status === "success") {
                        Swal.fire({ icon: 'success', title: 'Alhamdulillah!', text: 'Jawaban AKPD Anda berhasil dikirim.', confirmButtonColor: '#198754' }).then(() => logout());
                    } else {
                        Swal.fire({ icon: 'warning', title: 'Perhatian', text: res.message });
                    }
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Error', text: err.message }); })
                .submitAKPD(formData);
        }
        function loadSettingsModalValues() {
            document.getElementById("setYayasan").value = globalConfig.namaYayasan || ""; document.getElementById("setSekolah").value = globalConfig.namaSekolah || ""; document.getElementById("setAlamat").value = globalConfig.alamatSekolah || ""; document.getElementById("setKepala").value = globalConfig.namaKepala || ""; document.getElementById("setGuruBK").value = globalConfig.namaGuruBK || ""; document.getElementById("setKota").value = globalConfig.kotaCetak || ""; document.getElementById("setTahunAjaran").value = globalConfig.tahunAjaran || ""; document.getElementById("setLogo").value = globalConfig.logoUrl || "";
        }
        function saveSettings(e) {
            e.preventDefault();
            let newConfig = { namaYayasan: document.getElementById("setYayasan").value, namaSekolah: document.getElementById("setSekolah").value, alamatSekolah: document.getElementById("setAlamat").value, namaKepala: document.getElementById("setKepala").value, namaGuruBK: document.getElementById("setGuruBK").value, kotaCetak: document.getElementById("setKota").value, tahunAjaran: document.getElementById("setTahunAjaran").value, logoUrl: document.getElementById("setLogo").value };
            showLoader(true);
            google.script.run
                .withSuccessHandler(function(res) {
                    showLoader(false);
                    Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Pengaturan berhasil disimpan!', timer: 2000, showConfirmButton: false });
                    globalConfig = newConfig; applyConfigToUI(newConfig);
                    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
                })
                .withFailureHandler(function(err) { showLoader(false); Swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); })
                .updateConfig(tk(), newConfig);
        }

/* ===== Sidebar hamburger (layar kecil) ===== */
function sbTutup() {
    var el = document.getElementById('sidebarGuru');
    var oc = bootstrap.Offcanvas.getInstance(el);
    if (oc) oc.hide();
}
function sbMenu(menu) { sbTutup(); switchGuruMenu(menu); window.scrollTo(0, 0); }
function sbBukaPengaturan() { bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show(); }
// Jalankan aksi (modal / popup) setelah sidebar tertutup, supaya fokusnya tidak bentrok
function sbAksi(fn) {
    var el = document.getElementById('sidebarGuru');
    var oc = bootstrap.Offcanvas.getInstance(el);
    if (!oc || !el.classList.contains('show')) { fn(); return; }
    el.addEventListener('hidden.bs.offcanvas', function h() { el.removeEventListener('hidden.bs.offcanvas', h); fn(); });
    oc.hide();
}

/* ===== Lihat password & Ingat saya (halaman login) ===== */
function togglePasswordLogin() {
    var inp = document.getElementById('password'), ico = document.getElementById('iconTogglePw'), btn = document.getElementById('btnTogglePw');
    var tampil = inp.type === 'password';
    inp.type = tampil ? 'text' : 'password';
    ico.className = tampil ? 'fas fa-eye-slash' : 'fas fa-eye';
    btn.setAttribute('aria-label', tampil ? 'Sembunyikan password' : 'Tampilkan password');
    btn.setAttribute('aria-pressed', tampil ? 'true' : 'false');
}
function resetTampilPassword() {
    var inp = document.getElementById('password');
    if (inp && inp.type !== 'password') togglePasswordLogin();
}
// "Ingat saya" = tetap login di perangkat ini. Password TIDAK disimpan; yang disimpan hanya
// token sesi dari server (berlaku 90 hari, otomatis mati bila password diganti/direset).
var INGAT_KEY = 'akpd_ingat_saya';
var resumingSesi = false;
function bacaIngatSaya() { try { return JSON.parse(localStorage.getItem(INGAT_KEY)) || null; } catch (e) { return null; } }
function tulisIngatSaya(d) { try { localStorage.setItem(INGAT_KEY, JSON.stringify(d)); } catch (e) {} }
function hapusIngatSaya() { try { localStorage.removeItem(INGAT_KEY); } catch (e) {} }
function initIngatSaya() {
    var d = bacaIngatSaya();
    if (!d || !d.token) return;
    setRoleTarget(d.role === 'guru' ? 'guru' : 'siswa');
    resumingSesi = true;
    document.getElementById('loginSection').style.display = 'none';
    showLoader(true);
    google.script.run
        .withSuccessHandler(function (res) {
            resumingSesi = false; showLoader(false);
            if (res && res.status === 'success') { currentUser = res; bukaSesi(res); }
            else gagalPulihSesi(true, res && res.message);
        })
        .withFailureHandler(function (err) { resumingSesi = false; showLoader(false); gagalPulihSesi(false, err.message); })
        .resumeSession(d.token);
}
function gagalPulihSesi(hapus, pesan) {
    var role = document.getElementById('selectedRole').value;
    if (hapus) hapusIngatSaya();
    document.getElementById('loginSection').style.display = 'block';
    terapkanIngatSaya(role);
    if (pesan) Swal.fire({ icon: 'info', title: 'Silakan login', text: pesan });
}
function terapkanIngatSaya(role) {
    var d = bacaIngatSaya(), inp = document.getElementById('username'), cb = document.getElementById('ingatSaya');
    if (!inp || !cb) return;
    if (d && d.token && d.role === role) { inp.value = d.username || ''; cb.checked = true; }
    else { if (d && d.username && inp.value === d.username) inp.value = ''; cb.checked = false; }
}
function simpanIngatSaya(role, username, rememberToken) {
    if (document.getElementById('ingatSaya').checked && rememberToken) tulisIngatSaya({ role: role, username: String(username).trim(), token: rememberToken });
    else hapusIngatSaya();
}
function namaGuruSidebar(config, fallback) {
    return (config && String(config.namaGuruBK || '').trim()) || fallback || '';
}

/* ===== Buka dashboard / halaman siswa setelah login atau pemulihan sesi ===== */
function bukaSesi(res) {
    document.getElementById("loginSection").style.display = "none";
    if (res.role === "guru" || res.role === "admin") {
        document.getElementById("guruSection").style.display = "block";
        document.getElementById("userInfoGuru").innerText = res.nama + " (Guru BK)";
        document.getElementById("sbUserInfo").innerText = namaGuruSidebar(globalConfig, res.nama);
        switchGuruMenu('dashboard');
        loadSettingsModalValues();
    } else {
        document.getElementById("siswaSection").style.display = "block";
        document.getElementById("userInfoSiswa").innerText = res.nama + " (" + res.kelas + ")";
        document.getElementById("salamSiswaText").innerText = `Assalamu'alaikum ${res.nama}, selamat datang di Aplikasi AKPD Digital.`;
        loadSoalAKPD(res.kelas);
    }
}
