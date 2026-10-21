/* =====================================================================
   APP — UI Supervisi PM-KBC Neo-Brutalism
   ===================================================================== */
'use strict';

const S = {
  page: 'dashboard',
  params: {},
  cache: { madrasah: [], guru: [], pengawas: [], users: [] },
  form: null,          // supervisi wizard state
  mini: null,          // kokurikuler/ekstra/iklim form state
  filter: { q: '', madrasah: '', jenis: '', predikat: '' },
  connUnlocked: false, // true = panel koneksi dibuka sementara oleh Admin (tidak disimpan)
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/** Pill status verifikasi "Diketahui oleh Pengawas Madrasah" */
function verifPill(r) {
  const ok = String((r || {}).PengawasStatus || '') === 'Diketahui';
  return `<span class="pill ${ok ? 'p-aktif' : 'p-pending'}">${ok ? '✅ Diketahui' : '⏳ Menunggu'}</span>`;
}

/* ---------------- toast & modal ---------------- */
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}
function openModal(html, wide) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'overlay';
  o.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  o.addEventListener('click', e => { if (e.target === o) closeModal(); });
  $('#modalRoot').appendChild(o);
}
function closeModal() { const o = $('#overlay'); if (o) o.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function confirmBox(title, msg, okLabel, onOk) {
  openModal(`<h3>${esc(title)}</h3><p style="font-weight:600;margin-bottom:16px">${esc(msg)}</p>
    <div class="btnrow"><button class="btn btn-red" id="cfOk">${esc(okLabel || 'Ya, Lanjutkan')}</button>
    <button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
  $('#cfOk').onclick = () => { closeModal(); onOk(); };
}

function loading(on, text) {
  let el = $('#loadingBar');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loadingBar';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:300;background:var(--ink);color:#fff;font-weight:800;text-align:center;padding:8px;font-size:.8rem;letter-spacing:1px';
      document.body.appendChild(el);
    }
    el.textContent = '⏳ ' + (text || 'MEMPROSES…');
    el.style.display = 'block';
  } else if (el) el.style.display = 'none';
}

/* ---------------- helpers ---------------- */
function me() { return Store.session; }
function role() { return me() ? me().Role : ''; }
function parseSkor(row) {
  try {
    if (!row || row.SkorJSON === undefined || row.SkorJSON === null || row.SkorJSON === '') return {};
    if (typeof row.SkorJSON === 'object') return row.SkorJSON;
    return JSON.parse(row.SkorJSON);
  } catch (_) { return {}; }
}
function instrumenFor(jenis) { return jenis === 'RA' ? INSTRUMEN_RA : INSTRUMEN_SUPERVISI; }
function totalButirSupervisi(jenis) { return flatButir(instrumenFor(jenis)).length; }

function svgDonut(dist) {
  const colors = { 'Amat Baik': '#16A34A', 'Sangat Baik': '#86EFAC', 'Baik': '#3B82F6', 'Sedang': '#C4B5FD', 'Cukup': '#FB923C', 'Kurang': '#FF6B6B' };
  const entries = Object.entries(dist || {});
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  let acc = 0, segs = '';
  entries.forEach(([k, v]) => {
    const frac = v / total;
    const a0 = acc * Math.PI * 2 - Math.PI / 2, a1 = (acc + frac) * Math.PI * 2 - Math.PI / 2;
    acc += frac;
    const x0 = 60 + 44 * Math.cos(a0), y0 = 60 + 44 * Math.sin(a0);
    const x1 = 60 + 44 * Math.cos(a1), y1 = 60 + 44 * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    if (v > 0) segs += `<path d="M60,60 L${x0.toFixed(1)},${y0.toFixed(1)} A44,44 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${colors[k] || '#999'}" stroke="#141414" stroke-width="2"/>`;
  });
  const legend = entries.map(([k, v]) => `<span style="background:${colors[k] || '#999'}">${esc(k)}: ${v}</span>`).join('') || '<span>Belum ada data</span>';
  return `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <svg width="130" height="130" viewBox="0 0 120 120">${segs}<circle cx="60" cy="60" r="24" fill="#FFFDF5" stroke="#141414" stroke-width="3"/><text x="60" y="66" text-anchor="middle" font-weight="900" font-size="18">${entries.reduce((a, [, v]) => a + v, 0)}</text></svg>
    <div class="donut-legend">${legend}</div></div>`;
}
function svgBars(items) {
  if (!items.length) return '<div class="empty"><span class="big">📊</span>Belum ada data nilai.</div>';
  const max = Math.max(...items.map(i => i.nilai), 1);
  return items.map(i => `<div class="barrow"><span>${esc(i.label)}</span>
    <div class="bartrack"><div class="barfill" style="width:${Math.round(i.nilai / max * 100)}%"></div></div>
    <b>${i.nilai}</b></div>`).join('');
}

/* =====================================================================
   AUTH VIEW
   ===================================================================== */
function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#apiUrlInput').value = Store.apiUrl || '';
  const m = Store.mode || 'demo';
  $$('input[name=modePick]').forEach(r => { r.checked = (r.value === m); });
  syncConnUI();
}

/**
 * Koneksi terkunci setelah terhubung ke database:
 * panel Sumber Data disembunyikan, hanya tampil badge "Database Terhubung".
 * Membukanya kembali harus verifikasi akun Admin.
 */
function syncConnUI() {
  const locked = Store.isConnected() && !S.connUnlocked;
  const box = $('#connBox'), lk = $('#connLocked');
  if (box) box.style.display = locked ? 'none' : '';
  if (lk) lk.style.display = locked ? '' : 'none';
}

/** "Ubah Koneksi" → verifikasi Admin dulu. */
function unlockConnModal() {
  openModal(`
    <button class="mx" onclick="closeModal()">✕</button>
    <h3>⚙️ Ubah Koneksi Database</h3>
    <div class="hint" style="margin-bottom:12px">Pengaturan koneksi hanya untuk <b>Admin</b>. Masukkan username &amp; password Admin untuk membuka.</div>
    <div class="fgroup"><label>Username Admin</label><input id="ukUser" placeholder="admin"></div>
    <div class="fgroup"><label>Password Admin</label><input id="ukPass" type="password" placeholder="••••••••"></div>
    <div class="btnrow"><button class="btn btn-dark" id="ukGo">🔓 Buka Pengaturan</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`, true);
  const go = async () => {
    const u = $('#ukUser').value.trim(), pw = $('#ukPass').value;
    if (!u || !pw) return toast('Isi username & password.', 'err');
    loading(true, 'MEMVERIFIKASI…');
    try {
      const res = await Store.call('login', { username: u, password: pw });
      if (!res || !res.user || res.user.Role !== 'Admin') return toast('Akun tersebut bukan Admin.', 'err');
      S.connUnlocked = true;
      closeModal(); syncConnUI();
      toast('Pengaturan koneksi dibuka. Kembali terkunci setelah halaman dimuat ulang.', 'ok');
    } catch (e) {
      // Server tidak terjangkau (misal URL berubah) → izinkan buka dengan peringatan
      if (/fetch|network|Failed|Respons server/i.test(e.message || '')) {
        confirmBox('Server Tidak Terjangkau', 'Tidak bisa memverifikasi ke server. Buka pengaturan koneksi secara paksa?', 'Buka Paksa', () => {
          S.connUnlocked = true; closeModal(); syncConnUI();
        });
      } else toast(e.message, 'err');
    } finally { loading(false); }
  };
  $('#ukGo').onclick = go;
  $('#ukPass').onkeydown = ev => { if (ev.key === 'Enter') go(); };
}
function showApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#ucName').textContent = me().Nama;
  $('#ucRole').textContent = ROLE_SHORT[role()] || role();
  $('#marqueeUser').textContent = `★ SUPERVISI PM-KBC ★ ${me().Nama.toUpperCase()} (${(ROLE_SHORT[role()] || role())}) ★ ${Store.mode === 'api' ? 'DATABASE: GOOGLE SPREADSHEET' : 'MODE DEMO (BROWSER)'} ★ `;
  const pill = $('#modePill');
  if (Store.mode === 'api') { pill.className = 'mode-pill mode-api'; pill.textContent = '☁️ SPREADSHEET (APPS SCRIPT)'; }
  else { pill.className = 'mode-pill mode-demo'; pill.textContent = '🧪 MODE DEMO'; }
  buildNav();
  go('dashboard');
}

async function doLogin() {
  const u = $('#liUser').value.trim(), p = $('#liPass').value;
  if (!u || !p) { $('#authCard').classList.add('shake'); setTimeout(() => $('#authCard').classList.remove('shake'), 350); return toast('Isi username & password dulu.', 'err'); }
  const mode = Store.isConnected() ? 'api' : document.querySelector('input[name=modePick]:checked').value;
  const url = Store.isConnected() ? Store.apiUrl : $('#apiUrlInput').value.trim();
  if (mode === 'api' && !url) return toast('Tempel URL Web App Apps Script dulu untuk mode API.', 'err');
  Store.setMode(mode, url);
  loading(true, 'LOGIN…');
  try {
    await Store.login(u, p);
    toast('Selamat datang, ' + me().Nama + '!', 'ok');
    showApp();
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}

async function doRegister() {
  const f = {
    nama: $('#rgNama').value.trim(), username: $('#rgUser').value.trim(),
    password: $('#rgPass').value, role: $('#rgRole').value,
    madrasah: $('#rgMadrasah').value.trim(), nip: $('#rgNip').value.trim(), nohp: $('#rgHp').value.trim(),
  };
  const mode = Store.isConnected() ? 'api' : document.querySelector('input[name=modePick]:checked').value;
  const url = Store.isConnected() ? Store.apiUrl : $('#apiUrlInput').value.trim();
  if (mode === 'api' && !url) return toast('Tempel URL Web App Apps Script dulu untuk mode API.', 'err');
  Store.setMode(mode, url);
  loading(true, 'MENDAFTAR…');
  try {
    const r = await Store.register(f);
    toast(r.message, 'ok');
    $('#registerPane').classList.add('hidden');
    $('#loginPane').classList.remove('hidden');
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}

/* =====================================================================
   NAV
   ===================================================================== */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { sep: 'Data Master' },
  { id: 'pengawas', label: 'Data Pengawas', icon: '🧑‍💼', roles: ['Admin', 'Pengawas Madrasah'] },
  { id: 'madrasah', label: 'Data Madrasah', icon: '🏫', roles: ['Admin', 'Pengawas Madrasah'] },
  { id: 'guru', label: 'Data Guru', icon: '👩‍🏫', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'akunguru', label: 'Akun Guru', icon: '🔐', roles: ['Admin', 'Kepala Madrasah'] },
  { sep: 'Supervisi' },
  { id: 'supervisi', label: 'Daftar Supervisi', icon: '📝', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'supervisi_baru', label: '+ Supervisi Baru', icon: '➕', roles: ['Admin', 'Kepala Madrasah'] },
  { id: 'verifikasi', label: 'Verifikasi Pengawas', icon: '✅', roles: ['Admin', 'Pengawas Madrasah'] },
  { id: 'rekap', label: 'Rekap & Grafik', icon: '📈', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'cetak', label: 'Cetak Laporan', icon: '🖨️', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { sep: 'Pembinaan' },
  { id: 'kokurikuler', label: 'Kokurikuler', icon: '🎭', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'ekstrakurikuler', label: 'Ekstrakurikuler', icon: '⚽', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'iklim', label: 'Iklim Madrasah', icon: '🌤️', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { sep: 'Sistem' },
  { id: 'users', label: 'Kelola Pengguna', icon: '👥', roles: ['Admin'], badge: 'pending' },
  { id: 'koneksi', label: 'Koneksi & Backup', icon: '🔌', roles: ['Admin'], onlyWhenUnconnected: true },
  { id: 'profil', label: 'Profil Saya', icon: '🙋', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: 'panduan', label: 'Panduan', icon: '📖', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'] },
  { id: '__logout', label: 'Logout', icon: '🚪', roles: ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'], danger: true },
];

async function buildNav() {
  let pending = 0;
  if (role() === 'Admin') {
    try { const st = await Store.stats(); pending = st.pendingUsers || 0; } catch (_) {}
  }
  const nav = $('#mainNav');
  nav.innerHTML = '';
  NAV.filter(n => (!n.roles || n.roles.includes(role())) && (!n.onlyWhenUnconnected || !Store.isConnected())).forEach(n => {
    if (n.sep) { const d = document.createElement('div'); d.className = 'sep'; d.textContent = n.sep; nav.appendChild(d); return; }
    const b = document.createElement('button');
    b.innerHTML = `<span class="ico">${n.icon}</span><span>${esc(n.label)}</span>${n.badge && pending ? `<span class="badge">${pending}</span>` : ''}`;
    if (n.danger) b.classList.add('danger');
    if (S.page === n.id || (S.page === 'supervisi_form' && n.id === 'supervisi_baru')) b.classList.add('active');
    b.onclick = () => {
      if (n.id === '__logout') return doLogout();
      if (n.id === 'supervisi_baru') return startSupervisiForm(null);
      go(n.id);
      $('#sidebar').classList.remove('open');
    };
    nav.appendChild(b);
  });
}

async function doLogout() {
  confirmBox('Logout?', 'Anda yakin ingin keluar dari aplikasi?', 'Ya, Logout', async () => {
    await Store.logout();
    location.reload();
  });
}

/* =====================================================================
   ROUTER
   ===================================================================== */
const TITLES = {
  dashboard: '📊 Dashboard', pengawas: '🧑‍💼 Data Pengawas', madrasah: '🏫 Data Madrasah', verifikasi: '✅ Verifikasi Pengawas', akunguru: '🔐 Akun Guru',
  guru: '👩‍🏫 Data Guru', supervisi: '📝 Daftar Supervisi', supervisi_form: '➕ Form Supervisi',
  rekap: '📈 Rekap & Grafik', cetak: '🖨️ Cetak Laporan',
  kokurikuler: '🎭 Kokurikuler', ekstrakurikuler: '⚽ Ekstrakurikuler', iklim: '🌤️ Iklim Madrasah',
  users: '👥 Kelola Pengguna', koneksi: '🔌 Koneksi & Backup', profil: '🙋 Profil Saya', panduan: '📖 Panduan',
};
async function go(page, params) {
  S.page = page; S.params = params || {};
  $('#pageTitle').textContent = TITLES[page] || page;
  buildNav();
  const el = $('#page');
  el.innerHTML = '<div class="card">⏳ Memuat…</div>';
  window.scrollTo(0, 0);
  try {
    if (page === 'dashboard') await pDashboard(el);
    else if (page === 'pengawas') await pMaster(el, 'pengawas');
    else if (page === 'verifikasi') await pVerifikasi(el);
    else if (page === 'akunguru') await pAkunGuru(el);
    else if (page === 'madrasah') await pMaster(el, 'madrasah');
    else if (page === 'guru') await pMaster(el, 'guru');
    else if (page === 'supervisi') await pSupervisiList(el);
    else if (page === 'supervisi_form') pSupervisiForm(el);
    else if (page === 'rekap') await pRekap(el);
    else if (page === 'cetak') await pCetak(el);
    else if (['kokurikuler', 'ekstrakurikuler', 'iklim'].includes(page)) await pMini(el, page);
    else if (page === 'users') await pUsers(el);
    else if (page === 'koneksi') {
      if (role() !== 'Admin') { toast('Halaman koneksi hanya untuk Admin.', 'err'); return go('dashboard'); }
      if (Store.isConnected()) { toast('Pengaturan koneksi dinonaktifkan karena database sudah terhubung.', 'err'); return go('dashboard'); }
      pKoneksi(el);
    }
    else if (page === 'profil') pProfil(el);
    else if (page === 'panduan') pPanduan(el);
  } catch (e) {
    el.innerHTML = `<div class="card"><h3>⚠️ Gagal memuat</h3><p style="font-weight:600">${esc(e.message)}</p>
      <div class="btnrow"><button class="btn btn-yellow" onclick="go(S.page)">🔄 Coba Lagi</button></div></div>`;
  }
}

/* =====================================================================
   DASHBOARD
   ===================================================================== */
async function pDashboard(el) {
  loading(true, 'MEMUAT DASHBOARD…');
  const st = await Store.stats();
  const sup = await Store.list('supervisi', '');
  loading(false);
  const latest = sup.slice(0, 5);
  // rata-rata per madrasah
  const byMad = {};
  sup.forEach(r => {
    const m = r.Madrasah || '-';
    byMad[m] = byMad[m] || { sum: 0, n: 0 };
    const v = parseFloat(r.Nilai);
    if (!isNaN(v)) { byMad[m].sum += v; byMad[m].n++; }
  });
  const bars = Object.entries(byMad).map(([label, o]) => ({ label, nilai: o.n ? Math.round(o.sum / o.n * 10) / 10 : 0 })).sort((a, b) => b.nilai - a.nilai).slice(0, 8);

  el.innerHTML = `
  <div class="card tilt-r">
    <h3>👋 Halo, ${esc(me().Nama)}! <span class="tag">${esc(role())}</span></h3>
    <p style="font-weight:600">Selamat datang di <b>Supervisi PM-KBC</b>. Berikut ringkasan kegiatan supervisi ${
      role() === 'Guru' ? 'yang telah dilakukan terhadap <b>Anda</b>'
      : role() === 'Kepala Madrasah' ? 'yang <b>Anda laksanakan</b> sebagai Kepala Madrasah di madrasah Anda'
      : role() === 'Pengawas Madrasah' ? 'di wilayah binaan Anda (verifikasi &amp; pembinaan)'
      : 'secara keseluruhan'}.</p>
    ${role() === 'Admin' && st.pendingUsers ? `<p style="margin-top:10px"><span class="pill p-pending">🔔 ${st.pendingUsers} pendaftar menunggu persetujuan</span> <button class="btn btn-sm btn-dark" onclick="go('users')">Kelola →</button></p>` : ''}
    ${(role() === 'Admin' || role() === 'Pengawas Madrasah') ? `<p style="margin-top:10px"><span class="pill ${st.menungguVerifikasi ? 'p-pending' : 'p-aktif'}">✅ ${st.menungguVerifikasi || 0} supervisi menunggu verifikasi Pengawas</span> <button class="btn btn-sm btn-dark" onclick="go('verifikasi')">Verifikasi →</button></p>` : ''}
    ${role() === 'Kepala Madrasah' ? `<p style="margin-top:10px"><span class="pill ${st.menungguVerifikasi ? 'p-pending' : 'p-aktif'}">⏳ ${st.menungguVerifikasi || 0} supervisi belum diketahui Pengawas</span></p>` : ''}
  </div>
  <div class="grid4">
    <div class="stat s1"><span class="ico">📝</span><div class="num">${st.totalSupervisi}</div><div class="lbl">Supervisi</div></div>
    <div class="stat s2"><span class="ico">🏫</span><div class="num">${st.totalMadrasah}</div><div class="lbl">Madrasah</div></div>
    <div class="stat s3"><span class="ico">👩‍🏫</span><div class="num">${st.totalGuru}</div><div class="lbl">Guru</div></div>
    <div class="stat s7"><span class="ico">⭐</span><div class="num">${st.rataNilai}</div><div class="lbl">Rata-rata Nilai</div></div>
    <div class="stat s5"><span class="ico">🎭</span><div class="num">${st.totalKokurikuler}</div><div class="lbl">Kokurikuler</div></div>
    <div class="stat s4"><span class="ico">⚽</span><div class="num">${st.totalEkstra}</div><div class="lbl">Ekstrakurikuler</div></div>
    <div class="stat s6"><span class="ico">🌤️</span><div class="num">${st.totalIklim}</div><div class="lbl">Iklim Madrasah</div></div>
    ${role() === 'Admin'
      ? `<div class="stat s8"><span class="ico">👥</span><div class="num">${st.totalUsers}</div><div class="lbl">Pengguna</div></div>`
      : `<div class="stat s8"><span class="ico">✅</span><div class="num">${st.sudahVerifikasi || 0}</div><div class="lbl">Sudah Diketahui Pengawas</div></div>`}
  </div>
  <div class="grid2" style="margin-top:20px">
    <div class="card"><h3>🍩 Distribusi Predikat <span class="tag">SUPERVISI</span></h3><div class="chartbox">${svgDonut(st.distribusiPredikat)}</div></div>
    <div class="card"><h3>📊 Rata-rata Nilai per Madrasah</h3><div class="chartbox">${svgBars(bars)}</div></div>
  </div>
  <div class="card"><h3>🕒 Supervisi Terbaru</h3>
    ${latest.length ? `<div class="twrap"><table class="data"><tr><th>Tanggal</th><th>Guru</th><th>Madrasah</th><th>Pelaksana</th><th>Nilai</th><th>Diketahui Pengawas</th></tr>
      ${latest.map(r => `<tr><td>${fmtTanggal(r.Tanggal)}</td><td><b>${esc(r.Guru)}</b></td><td>${esc(r.Madrasah)}</td><td>${esc(r.Kepala || '-')}</td><td><b>${esc(r.Nilai)}</b></td><td>${verifPill(r)}</td></tr>`).join('')}
      </table></div>` : '<div class="empty"><span class="big">📭</span>Belum ada data supervisi.</div>'}
    <div class="btnrow"><button class="btn btn-dark" onclick="go('supervisi')">Lihat Semua →</button>
    ${Store.canWrite('supervisi') ? '<button class="btn btn-yellow" onclick="startSupervisiForm(null)">➕ Supervisi Baru</button>' : ''}</div>
  </div>`;
}

/* =====================================================================
   MASTER (pengawas / madrasah / guru)
   ===================================================================== */
const MASTER_DEF = {
  pengawas: {
    title: 'Pengawas', addLabel: '+ Tambah Pengawas',
    cols: [['NIP', 'NIP'], ['Nama', 'Nama'], ['Jabatan', 'Jabatan'], ['Kabupaten', 'Kabupaten'], ['TempatTugas', 'Tempat Tugas']],
    fields: [['NIP', 'NIP', 'text'], ['Nama', 'Nama Lengkap', 'text'], ['Jabatan', 'Jabatan', 'text'], ['Pangkat', 'Pangkat/Golongan', 'text'], ['Kabupaten', 'Kabupaten/Kota', 'text'], ['TempatTugas', 'Tempat Tugas', 'text'], ['Instansi', 'Instansi', 'text']],
  },
  madrasah: {
    title: 'Madrasah', addLabel: '+ Tambah Madrasah',
    cols: [['NPSN', 'NPSN'], ['Nama', 'Nama Madrasah'], ['Jenjang', 'Jenjang'], ['Kabupaten', 'Kabupaten'], ['Kepala', 'Kepala Madrasah']],
    fields: [['NPSN', 'NPSN', 'text'], ['Nama', 'Nama Madrasah', 'text'], ['Jenjang', 'Jenjang', 'jenjang'], ['Alamat', 'Alamat', 'text'], ['Kabupaten', 'Kabupaten/Kota', 'text'], ['Kepala', 'Kepala Madrasah', 'text'], ['NIPKepala', 'NIP Kepala', 'text']],
  },
  guru: {
    title: 'Guru', addLabel: '+ Tambah Guru',
    cols: [['NIP', 'NIP'], ['Nama', 'Nama Guru'], ['Madrasah', 'Madrasah'], ['Mapel', 'Mapel'], ['Jenjang', 'Jenjang']],
    fields: [['NIP', 'NIP', 'text'], ['Nama', 'Nama Guru', 'text'], ['Madrasah', 'Madrasah', 'madrasah'], ['Mapel', 'Mata Pelajaran', 'text'], ['Jenjang', 'Jenjang', 'jenjang']],
  },
};

async function pMaster(el, entity) {
  const def = MASTER_DEF[entity];
  const canW = Store.canWrite(entity === 'pengawas' ? 'pengawas' : entity);
  // pengawas entity write rule: ikut master (admin+pengawas)
  const canWriteMaster = (role() === 'Admin' || role() === 'Pengawas Madrasah') || (role() === 'Kepala Madrasah' && entity === 'guru');
  loading(true, 'MEMUAT DATA…');
  const rows = await Store.list(entity, '');
  loading(false);
  el.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <input type="search" id="mq" placeholder="🔍 Cari ${def.title.toLowerCase()}…">
      ${canWriteMaster ? `<button class="btn btn-yellow" id="mAdd">${def.addLabel}</button>` : ''}
      <button class="btn btn-sm btn-grey" id="mCsv">⬇️ CSV</button>
    </div>
    <div class="twrap"><table class="data" id="mTable">
      <tr><th>No</th>${def.cols.map(c => `<th>${c[1]}</th>`).join('')}${canWriteMaster ? '<th>Aksi</th>' : ''}</tr>
      <tbody id="mBody"></tbody>
    </table></div>
  </div>`;
  const render = q => {
    const s = (q || '').toLowerCase();
    const f = rows.filter(r => !s || def.cols.some(c => String(r[c[0]] || '').toLowerCase().includes(s)));
    $('#mBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td>
      ${def.cols.map(c => `<td>${esc(r[c[0]])}</td>`).join('')}
      ${canWriteMaster ? `<td style="white-space:nowrap">
        ${entity === 'guru' && (role() === 'Kepala Madrasah' || role() === 'Admin') ? `<button class="btn btn-sm btn-green" data-akun="${r.ID}" title="Daftarkan akun login guru">🔐</button> ` : ''}
        <button class="btn btn-sm btn-primary" data-e="${r.ID}">✏️</button> <button class="btn btn-sm btn-red" data-d="${r.ID}">🗑️</button></td>` : ''}</tr>`).join('')
      : `<tr><td colspan="10"><div class="empty"><span class="big">📭</span>Belum ada data.</div></td></tr>`;
    $$('#mBody [data-akun]').forEach(b => b.onclick = () => formAkunGuru(rows.find(r => r.ID === b.dataset.akun)));
    $$('#mBody [data-e]').forEach(b => b.onclick = () => masterForm(entity, rows.find(r => r.ID === b.dataset.e)));
    $$('#mBody [data-d]').forEach(b => b.onclick = () => confirmBox('Hapus Data?', `Hapus data ini secara permanen?`, 'Ya, Hapus', async () => {
      try { await Store.remove(entity, b.dataset.d); toast('Data dihapus.', 'ok'); go(S.page); } catch (e) { toast(e.message, 'err'); }
    }));
  };
  render('');
  $('#mq').oninput = e => render(e.target.value);
  if (canWriteMaster) $('#mAdd').onclick = () => masterForm(entity, null);
  $('#mCsv').onclick = () => {
    const headers = def.cols.map(c => c[0]);
    download(`${entity}-${todayISO()}.csv`, toCSV(rows, headers), 'text/csv');
  };
}

async function masterForm(entity, row) {
  const def = MASTER_DEF[entity];
  row = row || {};
  let madOpts = '';
  if (def.fields.some(f => f[2] === 'madrasah')) {
    const ms = await Store.list('madrasah', '');
    madOpts = ms.map(m => `<option ${row.Madrasah === m.Nama ? 'selected' : ''}>${esc(m.Nama)}</option>`).join('');
    if (role() === 'Kepala Madrasah') madOpts = `<option selected>${esc(me().Madrasah)}</option>`;
  }
  openModal(`<h3>${row.ID ? '✏️ Edit' : '➕ Tambah'} ${def.title}</h3>
    ${def.fields.map(f => {
      if (f[2] === 'jenjang') return `<div class="fgroup"><label>${f[1]}</label><select id="mf_${f[0]}">${JENJANG.map(j => `<option ${row[f[0]] === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>`;
      if (f[2] === 'madrasah') return `<div class="fgroup"><label>${f[1]}</label><select id="mf_${f[0]}">${madOpts}</select></div>`;
      return `<div class="fgroup"><label>${f[1]}</label><input id="mf_${f[0]}" value="${esc(row[f[0]] || '')}"></div>`;
    }).join('')}
    <div class="btnrow"><button class="btn btn-primary" id="mfSave">💾 Simpan</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
  $('#mfSave').onclick = async () => {
    const data = { ID: row.ID || '' };
    def.fields.forEach(f => data[f[0]] = $('#mf_' + f[0]).value.trim());
    if (!data.Nama) return toast('Nama wajib diisi.', 'err');
    loading(true, 'MENYIMPAN…');
    try { await Store.save(entity, data); closeModal(); toast('Data tersimpan.', 'ok'); go(S.page); }
    catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
}

/* =====================================================================
   SUPERVISI — DAFTAR
   ===================================================================== */
async function pSupervisiList(el) {
  const canW = Store.canWrite('supervisi');
  loading(true, 'MEMUAT DATA…');
  const rows = await Store.list('supervisi', '');
  const mads = await Store.list('madrasah', '');
  loading(false);
  const madOpts = [...new Set(rows.map(r => r.Madrasah).filter(Boolean))];
  el.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <input type="search" id="sq" placeholder="🔍 Cari guru / madrasah / mapel…">
      <select id="sMad" style="padding:10px;border:var(--bd-sm);border-radius:10px;font-weight:700"><option value="">Semua Madrasah</option>${madOpts.map(m => `<option>${esc(m)}</option>`).join('')}</select>
      <select id="sJen" style="padding:10px;border:var(--bd-sm);border-radius:10px;font-weight:700"><option value="">Semua Jenis</option><option>Pembelajaran</option><option>RA</option></select>
      <select id="sVer" style="padding:10px;border:var(--bd-sm);border-radius:10px;font-weight:700"><option value="">Semua Verifikasi</option><option value="Menunggu">⏳ Menunggu Pengawas</option><option value="Diketahui">✅ Sudah Diketahui</option></select>
      ${canW ? '<button class="btn btn-yellow" onclick="startSupervisiForm(null)">➕ Supervisi Baru</button>' : ''}
      <button class="btn btn-sm btn-grey" id="sCsv">⬇️ CSV</button>
    </div>
    <div class="hint">Supervisi dilaksanakan oleh <b>Kepala Madrasah</b> dan <b>diketahui oleh Pengawas Madrasah</b>${Store.canVerify() ? ' — klik tombol ✅ untuk memverifikasi.' : '.'}</div>
    <div class="twrap"><table class="data"><tr><th>No</th><th>Tanggal</th><th>Guru</th><th>Madrasah</th><th>Pelaksana</th><th>Nilai</th><th>Predikat</th><th>Diketahui Pengawas</th><th>Aksi</th></tr><tbody id="sBody"></tbody></table></div>
  </div>`;
  const render = () => {
    const q = $('#sq').value.toLowerCase(), fm = $('#sMad').value, fj = $('#sJen').value, fv = $('#sVer').value;
    const f = rows.filter(r =>
      (!q || [r.Guru, r.Madrasah, r.Mapel, r.Materi, r.Kepala, r.Pengawas].some(v => String(v || '').toLowerCase().includes(q))) &&
      (!fm || r.Madrasah === fm) && (!fj || r.Jenis === fj) &&
      (!fv || (fv === 'Diketahui' ? r.PengawasStatus === 'Diketahui' : r.PengawasStatus !== 'Diketahui')));
    $('#sBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td>
      <td><b>${esc(r.Guru)}</b><br><span style="font-size:.72rem;opacity:.7">${esc(r.Jenis || '')} • ${esc(r.Kelas || '')}</span></td>
      <td>${esc(r.Madrasah)}</td>
      <td style="font-size:.8rem">${esc(r.Kepala || '-')}</td>
      <td><b style="font-size:1.05rem">${esc(r.Nilai)}</b><br><span class="pill" style="background:var(--yellow);font-size:.65rem">${esc(r.Predikat)}</span></td>
      <td><span class="pill ${r.Status === 'Selesai' ? 'p-aktif' : 'p-draft'}">${esc(r.Status || 'Draft')}</span></td>
      <td>${verifPill(r)}${r.Pengawas ? `<br><span style="font-size:.68rem;opacity:.75">${esc(r.Pengawas)}</span>` : ''}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-dark" data-v="${r.ID}">👁️</button>
      ${Store.canVerify() && r.PengawasStatus !== 'Diketahui' ? `<button class="btn btn-sm btn-green" data-ver="${r.ID}" title="Tandai diketahui">✅</button>` : ''}
      ${canW ? `<button class="btn btn-sm btn-primary" data-e="${r.ID}">✏️</button> <button class="btn btn-sm btn-red" data-d="${r.ID}">🗑️</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="9"><div class="empty"><span class="big">📭</span>Belum ada data supervisi.</div></td></tr>`;
    $$('#sBody [data-v]').forEach(b => b.onclick = () => supervisiDetail(rows.find(r => r.ID === b.dataset.v)));
    $$('#sBody [data-e]').forEach(b => b.onclick = () => startSupervisiForm(rows.find(r => r.ID === b.dataset.e)));
    $$('#sBody [data-ver]').forEach(b => b.onclick = () => verifyModal(rows.find(r => r.ID === b.dataset.ver)));
    $$('#sBody [data-d]').forEach(b => b.onclick = () => confirmBox('Hapus Supervisi?', 'Hapus data supervisi ini permanen?', 'Ya, Hapus', async () => {
      try { await Store.remove('supervisi', b.dataset.d); toast('Data dihapus.', 'ok'); go('supervisi'); } catch (e) { toast(e.message, 'err'); }
    }));
  };
  $('#sq').oninput = render; $('#sMad').onchange = render; $('#sJen').onchange = render; $('#sVer').onchange = render;
  render();
  $('#sCsv').onclick = () => {
    const headers = ['Tanggal', 'Jenis', 'Kepala', 'Pengawas', 'PengawasStatus', 'Madrasah', 'Guru', 'Mapel', 'Kelas', 'Materi', 'Nilai', 'Predikat', 'Status'];
    download(`supervisi-${todayISO()}.csv`, toCSV(rows, headers), 'text/csv');
  };
}

function supervisiDetail(r) {
  if (!r) return;
  const ins = instrumenFor(r.Jenis);
  const skor = parseSkor(r);
  const flat = flatButir(ins);
  const perTahap = ins.map(t => {
    const items = flat.filter(b => b.tahap === t.kode);
    const ts = items.reduce((a, b) => a + (Number(skor[b.no]) || 0), 0);
    return { judul: t.judul, total: ts, maks: items.length * 4, n: items.length };
  });
  openModal(`
    <button class="mx" onclick="closeModal()">✕</button>
    <h3>👁️ Detail Supervisi</h3>
    <div class="rekap" style="margin-top:0"><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div class="score">${esc(r.Nilai)}</div>
      <div><b>${esc(r.Guru)}</b><br><span style="font-weight:700;font-size:.8rem">${esc(r.Madrasah)} • ${esc(r.Mapel)} • ${esc(r.Kelas)}</span><br><span class="pred ${predikatClass(r.Predikat)}">${esc(r.Predikat)}</span></div>
    </div></div>
    <div class="chartbox" style="margin-bottom:12px">
      <b style="font-size:.8rem">Tanggal:</b> ${fmtTanggal(r.Tanggal)} &nbsp;•&nbsp; <b style="font-size:.8rem">Jenis:</b> ${esc(r.Jenis)}<br>
      <b style="font-size:.8rem">Pelaksana:</b> ${esc(r.Kepala || '-')} (Kepala Madrasah)<br>
      <b style="font-size:.8rem">Diketahui:</b> ${esc(r.Pengawas || '-')} (Pengawas Madrasah) ${verifPill(r)}
      ${r.PengawasTgl ? `<br><span style="font-size:.72rem;opacity:.8">Diverifikasi: ${fmtTanggal(r.PengawasTgl)}</span>` : ''}
      ${r.CatatanPengawas ? `<br><b style="font-size:.8rem">Catatan Pengawas:</b> ${esc(r.CatatanPengawas)}` : ''}<br>
      <b style="font-size:.8rem">Materi:</b> ${esc(r.Materi || '-')}
    </div>
    ${perTahap.map(t => `<div class="barrow"><span style="font-size:.7rem">${esc(t.judul)}</span><div class="bartrack"><div class="barfill" style="width:${t.maks ? Math.round(t.total / t.maks * 100) : 0}%"></div></div><b>${t.total}</b></div>`).join('')}
    <div class="fgroup" style="margin-top:12px"><label>Catatan Hasil</label><div class="chartbox" style="font-size:.82rem">${esc(r.Catatan || '-')}</div></div>
    <div class="fgroup"><label>Rencana Tindak Lanjut (RTL)</label><div class="chartbox" style="font-size:.82rem">${esc(r.RTL || '-')}</div></div>
    <div class="btnrow"><button class="btn btn-dark" onclick='printSupervisi(${JSON.stringify(r.ID)})'>🖨️ Cetak</button>
    ${Store.canWrite('supervisi') ? `<button class="btn btn-primary" onclick='closeModal();editSupervisiById(${JSON.stringify(r.ID)})'>✏️ Edit</button>` : ''}
    ${Store.canVerify() ? `<button class="btn btn-green" onclick='closeModal();verifyModal(${JSON.stringify(r.ID)})'>✅ Verifikasi Pengawas</button>` : ''}</div>`, true);
}

/* =====================================================================
   VERIFIKASI PENGAWAS ("Diketahui oleh")
   ===================================================================== */
async function verifyModal(idOrRow) {
  if (!Store.canVerify()) return toast('Hanya Pengawas Madrasah yang dapat memverifikasi.', 'err');
  const rows = await Store.list('supervisi', '');
  const r = typeof idOrRow === 'string' ? rows.find(x => x.ID === idOrRow) : idOrRow;
  if (!r) return toast('Data tidak ditemukan.', 'err');
  const sudah = r.PengawasStatus === 'Diketahui';
  openModal(`
    <button class="mx" onclick="closeModal()">✕</button>
    <h3>✅ Verifikasi Supervisi (Diketahui Pengawas)</h3>
    <div class="chartbox" style="margin-bottom:12px">
      <b>${esc(r.Guru)}</b> — ${esc(r.Madrasah)}<br>
      <span style="font-size:.8rem">Pelaksana: <b>${esc(r.Kepala || '-')}</b> (Kepala Madrasah) • ${fmtTanggal(r.Tanggal)} • Nilai <b>${esc(r.Nilai)}</b> (${esc(r.Predikat)})</span><br>
      <span style="font-size:.8rem">Status saat ini: ${verifPill(r)} ${r.PengawasTgl ? '• ' + fmtTanggal(r.PengawasTgl) : ''}</span>
    </div>
    <div class="fgroup"><label>Pengawas Madrasah</label>
      <input id="vf_Pengawas" value="${esc(r.Pengawas || (role() === 'Pengawas Madrasah' ? me().Nama : ''))}" placeholder="Nama pengawas madrasah"></div>
    <div class="fgroup"><label>Catatan / Rekomendasi Pengawas</label>
      <textarea id="vf_Catatan" rows="3" placeholder="opsional">${esc(r.CatatanPengawas || '')}</textarea></div>
    <div class="hint">Dengan menekan tombol di bawah, laporan supervisi ini dinyatakan <b>diketahui oleh Pengawas Madrasah</b> dan tanggal verifikasi dicatat otomatis.</div>
    <div class="btnrow">
      <button class="btn btn-green" id="vfYes">✅ Tandai Diketahui</button>
      ${sudah ? '<button class="btn btn-red" id="vfNo">↩️ Batalkan Verifikasi</button>' : ''}
      <button class="btn btn-grey" onclick="closeModal()">Tutup</button>
    </div>`, true);

  const doVerify = async (status) => {
    const payload = { status, catatan: $('#vf_Catatan').value, pengawas: status === 'Diketahui' ? $('#vf_Pengawas').value : '' };
    loading(true, 'MENYIMPAN VERIFIKASI…');
    try {
      await Store.verifySupervisi(r.ID, payload);
      toast(status === 'Diketahui' ? 'Supervisi ditandai DIKETAHUI oleh Pengawas.' : 'Verifikasi dibatalkan.', 'ok');
      closeModal();
      go(S.page === 'verifikasi' ? 'verifikasi' : S.page);
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
  $('#vfYes').onclick = () => doVerify('Diketahui');
  if ($('#vfNo')) $('#vfNo').onclick = () => doVerify('Menunggu');
}

async function pVerifikasi(el) {
  loading(true, 'MEMUAT DATA VERIFIKASI…');
  let rows = await Store.list('supervisi', '');
  loading(false);
  const pending = rows.filter(r => r.PengawasStatus !== 'Diketahui');
  const done = rows.filter(r => r.PengawasStatus === 'Diketahui');

  el.innerHTML = `
  <div class="card tilt-l">
    <h3>✅ Verifikasi Pengawas Madrasah</h3>
    <p style="font-weight:700">Supervisi dilaksanakan oleh <b>Kepala Madrasah</b>, kemudian <b>diketahui oleh Pengawas Madrasah</b>. Verifikasi di sini mencatat nama pengawas, tanggal, dan catatan/rekomendasi pada laporan.</p>
  </div>
  <div class="grid3">
    <div class="stat s7"><span class="ico">⏳</span><div class="num">${pending.length}</div><div class="lbl">Menunggu Diketahui</div></div>
    <div class="stat s2"><span class="ico">✅</span><div class="num">${done.length}</div><div class="lbl">Sudah Diketahui</div></div>
    <div class="stat s3"><span class="ico">🏫</span><div class="num">${new Set(rows.map(r => r.Madrasah).filter(Boolean)).size}</div><div class="lbl">Madrasah</div></div>
  </div>
  <div class="card" style="margin-top:20px">
    <h3>📥 Perlu Diverifikasi <span class="tag">${pending.length}</span></h3>
    <div class="toolbar"><input type="search" id="vq" placeholder="🔍 Cari guru / madrasah / kepala…"></div>
    <div class="twrap"><table class="data"><tr><th>No</th><th>Tanggal</th><th>Guru</th><th>Madrasah</th><th>Pelaksana (Kepala)</th><th>Nilai</th><th>Aksi</th></tr><tbody id="vBody"></tbody></table></div>
  </div>
  <div class="card">
    <h3>🗂️ Riwayat Verifikasi <span class="tag">${done.length}</span></h3>
    <div class="twrap"><table class="data"><tr><th>No</th><th>Tanggal Supervisi</th><th>Guru</th><th>Madrasah</th><th>Pelaksana</th><th>Diketahui Oleh</th><th>Tgl Verifikasi</th><th></th></tr><tbody id="vDone"></tbody></table></div>
  </div>`;

  const render = () => {
    const q = $('#vq').value.toLowerCase();
    const f = pending.filter(r => !q || [r.Guru, r.Madrasah, r.Kepala, r.Pengawas].some(v => String(v || '').toLowerCase().includes(q)));
    $('#vBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td><td><b>${esc(r.Guru)}</b></td><td>${esc(r.Madrasah)}</td><td style="font-size:.8rem">${esc(r.Kepala || '-')}</td><td><b>${esc(r.Nilai)}</b><br><span class="pill" style="background:var(--yellow);font-size:.65rem">${esc(r.Predikat)}</span></td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-dark" data-det="${r.ID}">👁️</button> <button class="btn btn-sm btn-green" data-ver="${r.ID}">✅ Verifikasi</button></td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empty"><span class="big">🎉</span>Tidak ada yang menunggu verifikasi.</div></td></tr>';
    $$('#vBody [data-ver]').forEach(b => b.onclick = () => verifyModal(rows.find(r => r.ID === b.dataset.ver)));
    $$('#vBody [data-det]').forEach(b => b.onclick = () => supervisiDetail(rows.find(r => r.ID === b.dataset.det)));
  };
  $('#vDone').innerHTML = done.length ? done.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td><td><b>${esc(r.Guru)}</b></td><td>${esc(r.Madrasah)}</td><td style="font-size:.8rem">${esc(r.Kepala || '-')}</td><td>${esc(r.Pengawas || '-')}</td><td>${fmtTanggal(r.PengawasTgl)}</td><td><button class="btn btn-sm btn-grey" data-back="${r.ID}">↩️</button></td></tr>`).join('')
    : '<tr><td colspan="8"><div class="empty"><span class="big">📭</span>Belum ada riwayat verifikasi.</div></td></tr>';
  $$('#vDone [data-back]').forEach(b => b.onclick = () => verifyModal(rows.find(r => r.ID === b.dataset.back)));
  $('#vq').oninput = render;
  render();
}
async function editSupervisiById(id) {
  const rows = await Store.list('supervisi', '');
  startSupervisiForm(rows.find(r => r.ID === id) || null);
}

/* =====================================================================
   SUPERVISI — FORM WIZARD
   ===================================================================== */
async function startSupervisiForm(existing) {
  if (!Store.canWrite('supervisi')) return toast('Supervisi dilaksanakan oleh Kepala Madrasah. Pengawas Madrasah hanya memverifikasi (mengetahui).', 'err');
  loading(true, 'MENYIAPKAN FORM…');
  const [mads, gurus, pws] = await Promise.all([
    Store.list('madrasah', ''), Store.list('guru', ''), Store.list('pengawas', ''),
  ]);
  loading(false);
  S.form = {
    step: 0,
    editId: existing ? existing.ID : null,
    mads, gurus, pws,
    data: existing ? Object.assign({}, existing) : {
      Tanggal: todayISO(), Jenis: 'Pembelajaran',
      Kepala: role() === 'Kepala Madrasah' ? me().Nama : '',
      Pengawas: (pws[0] || {}).Nama || '',
      PengawasStatus: 'Menunggu',
      Madrasah: role() === 'Kepala Madrasah' ? (me().Madrasah || '') : '',
      Guru: '', NIPGuru: '', Mapel: '', Kelas: '', Materi: '',
      Catatan: '', RTL: '', Status: 'Draft',
    },
    skor: existing ? parseSkor(existing) : {},
    note: {},
    autoNote: true, autoRTL: true,
  };
  // pecah catatan per-butir bila tersimpan? (disimpan gabung; catatan mini hanya sesi ini)
  go('supervisi_form');
}

const WSTEPS = ['1. Info Umum', '2. Perencanaan', '3. Pelaksanaan', '4. Penilaian & Selesai'];

function pSupervisiForm(el) {
  const F = S.form;
  if (!F) { el.innerHTML = '<div class="card">Form tidak siap. <button class="btn btn-yellow" onclick="startSupervisiForm(null)">Buka Form</button></div>'; return; }
  const ins = instrumenFor(F.data.Jenis);
  const flat = flatButir(ins);
  const hit = hitungNilai(F.skor, flat.length);

  let body = '';
  if (F.step === 0) body = wInfo(F);
  else if (F.step === 1) body = wInstrumen(F, ins.filter(t => t.kode === 'A' || t.kode === 'K' && false));
  else if (F.step === 2) body = wInstrumen(F, ins.filter(t => t.kode.startsWith('B') || (F.data.Jenis === 'RA' && t.kode === 'B')));
  else body = wFinish(F, ins, flat, hit);

  el.innerHTML = `
  <div class="wizard">${WSTEPS.map((s, i) => `<div class="wstep${i === F.step ? ' active' : ''}${i < F.step ? ' done' : ''}"><span class="n">${i < F.step ? '✓' : i + 1}</span>${s}</div>`).join('')}</div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <h3 style="margin:0">${F.editId ? '✏️ Edit Supervisi' : '➕ Supervisi Baru'} <span class="tag">${esc(F.data.Jenis)}</span></h3>
      <span class="pill p-pending">Terisi: ${hit.terisi}/${flat.length} • Nilai sementara: <b>${hit.nilai}</b></span>
    </div>
    ${body}
    <div class="btnrow">
      ${F.step > 0 ? '<button class="btn btn-grey" id="wPrev">← Kembali</button>' : ''}
      ${F.step < 3 ? '<button class="btn btn-dark" id="wNext">Lanjut →</button>' : ''}
      ${F.step === 3 ? '<button class="btn btn-green" id="wSave">💾 Simpan Supervisi</button>' : ''}
      <button class="btn btn-red" id="wCancel">✕ Batal</button>
    </div>
  </div>`;

  bindWizard(F, ins, flat);
}

function wInfo(F) {
  const gurusOfMad = F.data.Madrasah ? F.gurus.filter(g => g.Madrasah === F.data.Madrasah) : F.gurus;
  const kepalaLocked = role() === 'Kepala Madrasah';
  const madLocked = kepalaLocked && me().Madrasah && me().Madrasah !== '-';
  const madOpts = madLocked
    ? `<option selected>${esc(me().Madrasah)}</option>`
    : `<option value="">— Pilih —</option>${F.mads.map(m => `<option ${F.data.Madrasah === m.Nama ? 'selected' : ''}>${esc(m.Nama)}</option>`).join('')}`;
  return `
  <div class="frow">
    <div class="fgroup"><label>Tanggal <span class="req">*</span></label><input type="date" id="f_Tanggal" value="${esc(F.data.Tanggal || todayISO())}"></div>
    <div class="fgroup"><label>Jenis Supervisi <span class="req">*</span></label>
      <select id="f_Jenis"><option ${F.data.Jenis === 'Pembelajaran' ? 'selected' : ''}>Pembelajaran</option><option ${F.data.Jenis === 'RA' ? 'selected' : ''}>RA</option></select></div>
  </div>
  <div class="frow">
    <div class="fgroup"><label>Madrasah <span class="req">*</span></label>
      <select id="f_Madrasah" ${madLocked ? 'disabled style="background:var(--grey)"' : ''}>${madOpts}</select>
      ${madLocked ? '<div class="hint" style="margin:4px 0 0">🔒 Terkunci sesuai madrasah Anda.</div>' : ''}</div>
    <div class="fgroup"><label>Kepala Madrasah (Pelaksana Supervisi) <span class="req">*</span></label>
      <input id="f_Kepala" value="${esc(F.data.Kepala || (kepalaLocked ? me().Nama : ''))}" ${kepalaLocked ? 'readonly style="background:var(--grey)"' : ''} placeholder="Nama kepala madrasah">
      ${kepalaLocked ? '<div class="hint" style="margin:4px 0 0">🔒 Anda tercatat sebagai pelaksana.</div>' : ''}</div>
  </div>
  <div class="frow">
    <div class="fgroup"><label>Guru yang Disupervisi <span class="req">*</span></label>
      <select id="f_Guru"><option value="">— Pilih —</option>${gurusOfMad.map(g => `<option value="${esc(g.Nama)}" ${F.data.Guru === g.Nama ? 'selected' : ''}>${esc(g.Nama)} — ${esc(g.Mapel || '')}</option>`).join('')}</select></div>
    <div class="fgroup"><label>NIP Guru</label><input id="f_NIPGuru" value="${esc(F.data.NIPGuru || '')}" readonly style="background:var(--grey)"></div>
  </div>
  <div class="frow">
    <div class="fgroup"><label>Mata Pelajaran</label><input id="f_Mapel" value="${esc(F.data.Mapel || '')}"></div>
    <div class="fgroup"><label>Kelas</label><input id="f_Kelas" value="${esc(F.data.Kelas || '')}" placeholder="cth: V (Lima)"></div>
  </div>
  <div class="fgroup"><label>Materi / Tema Pembelajaran</label><input id="f_Materi" value="${esc(F.data.Materi || '')}" placeholder="cth: Pecahan Senilai"></div>
  <div class="fgroup" style="background:var(--pink);border:var(--bd);border-radius:12px;padding:12px">
    <label style="margin-bottom:6px">✅ Diketahui oleh — Pengawas Madrasah</label>
    <select id="f_Pengawas"><option value="">— Pilih Pengawas —</option>${F.pws.map(p => `<option ${F.data.Pengawas === p.Nama ? 'selected' : ''}>${esc(p.Nama)}</option>`).join('')}</select>
    <div class="hint" style="margin:6px 0 0">Pengawas akan menerima data ini di menu <b>Verifikasi Pengawas</b>. Selama belum diverifikasi, statusnya <b>⏳ Menunggu</b>.</div>
  </div>
  <div class="hint">💡 Skor tiap butir: <b>1</b>=Kurang, <b>2</b>=Cukup, <b>3</b>=Baik, <b>4</b>=Sangat Baik. Nilai akhir &amp; predikat dihitung otomatis.</div>`;
}

function wInstrumen(F, tahaps) {
  const flat = flatButir(instrumenFor(F.data.Jenis));
  let html = '';
  tahaps.forEach(t => {
    const items = flat.filter(b => b.tahap === t.kode);
    const terisi = items.filter(b => F.skor[b.no]).length;
    html += `<div class="tahap" style="background:${t.warna};color:var(--ink);border:3px solid var(--ink)">${esc(t.judul)}<span class="cnt">${terisi}/${items.length}</span></div>`;
    items.forEach(b => {
      const v = Number(F.skor[b.no]) || 0;
      html += `<div class="ins-item"><div class="q"><span class="no">${b.no}</span>${esc(b.teks)}</div>
        <div class="skorrow">${[1, 2, 3, 4].map(s => `<button class="skor${v === s ? ' on-' + s : ''}" data-no="${b.no}" data-s="${s}">${s}</button>`).join('')}
        <span class="skor-lbl">${v ? SKOR_LABEL[v] : '— pilih skor —'}</span></div>
        <input class="catatan-mini" data-note="${b.no}" placeholder="✎ catatan butir (opsional)…" value="${esc(F.note[b.no] || '')}">
      </div>`;
    });
  });
  return html;
}

function wFinish(F, ins, flat, hit) {
  if (F.autoNote && (!F.data.Catatan || F._catAuto)) { F.data.Catatan = autoCatatan(F.skor, ins, 'supervisi ' + F.data.Jenis.toLowerCase()); F._catAuto = true; }
  if (F.autoRTL && (!F.data.RTL || F._rtlAuto)) { F.data.RTL = autoRTL(F.skor, ins, 'supervisi ' + F.data.Jenis.toLowerCase()); F._rtlAuto = true; }
  const pen = ins.filter(t => t.kode === 'C');
  return `
  ${wInstrumen(F, pen)}
  <div class="rekap"><div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <div><div style="font-weight:900;font-size:.75rem;letter-spacing:1px">NILAI AKHIR</div><div class="score">${hit.nilai}</div>
    <span class="pred ${predikatClass(hit.predikat)}">${hit.predikat}</span></div>
    <div style="font-weight:700;font-size:.82rem">Total skor <b>${hit.total}</b> dari maks <b>${hit.maks}</b> (${hit.terisi}/${flat.length} butir terisi)<br>
    Status: <b>${hit.terisi === flat.length ? 'Selesai ✅' : 'Draft ⏳ (masih ada butir kosong)'}</b></div>
  </div></div>
  <div class="fgroup"><label>Catatan Hasil <button class="btn btn-sm btn-grey" id="genCat">✨ Generate Otomatis</button></label>
    <textarea id="f_Catatan" rows="4">${esc(F.data.Catatan || '')}</textarea></div>
  <div class="fgroup"><label>Rencana Tindak Lanjut (RTL) <button class="btn btn-sm btn-grey" id="genRtl">✨ Generate Otomatis</button></label>
    <textarea id="f_RTL" rows="4">${esc(F.data.RTL || '')}</textarea></div>`;
}

function bindWizard(F, ins, flat) {
  const prev = $('#wPrev'), next = $('#wNext'), save = $('#wSave');
  if (prev) prev.onclick = () => { collectStep(F); F.step--; go('supervisi_form'); };
  if (next) next.onclick = () => {
    if (!collectStep(F)) return;
    if (F.step === 0 && (!F.data.Madrasah || !F.data.Guru)) return toast('Pilih madrasah & guru dulu.', 'err');
    F.step++; go('supervisi_form');
  };
  if (save) save.onclick = () => saveSupervisi(F, ins, flat);
  const c = $('#wCancel');
  if (c) c.onclick = () => confirmBox('Batalkan?', 'Perubahan yang belum disimpan akan hilang.', 'Ya, Batalkan', () => go('supervisi'));

  // info bindings
  const madSel = $('#f_Madrasah'), guruSel = $('#f_Guru');
  if (madSel) madSel.onchange = () => {
    collectStep(F);
    const md = F.mads.find(m => m.Nama === F.data.Madrasah);
    const kepalaEl = $('#f_Kepala');
    if (md && kepalaEl && !kepalaEl.readOnly && md.Kepala) { kepalaEl.value = md.Kepala; F.data.Kepala = md.Kepala; }
    const list = F.gurus.filter(g => g.Madrasah === F.data.Madrasah);
    guruSel.innerHTML = '<option value="">— Pilih —</option>' + list.map(g => `<option value="${esc(g.Nama)}">${esc(g.Nama)} — ${esc(g.Mapel || '')}</option>`).join('');
  };
  if (guruSel) guruSel.onchange = () => {
    const g = F.gurus.find(x => x.Nama === guruSel.value);
    if (g) { $('#f_NIPGuru').value = g.NIP || ''; $('#f_Mapel').value = g.Mapel || ''; }
  };
  const jenSel = $('#f_Jenis');
  if (jenSel) jenSel.onchange = () => {
    collectStep(F);
    if (Object.keys(F.skor).length) toast('Jenis diubah — skor sebelumnya dikosongkan.', 'info');
    F.skor = {}; F.note = {};
    go('supervisi_form');
  };

  // skor bindings
  $$('.skor').forEach(b => b.onclick = () => {
    F.skor[Number(b.dataset.no)] = Number(b.dataset.s);
    // update visual tanpa render ulang penuh
    $$(`.skor[data-no="${b.dataset.no}"]`).forEach(x => x.className = 'skor' + (Number(x.dataset.s) === Number(b.dataset.s) ? ' on-' + b.dataset.s : ''));
    b.closest('.ins-item').querySelector('.skor-lbl').textContent = SKOR_LABEL[b.dataset.s];
  });
  $$('[data-note]').forEach(inp => inp.oninput = () => { F.note[Number(inp.dataset.note)] = inp.value; });

  const gc = $('#genCat');
  if (gc) gc.onclick = () => { $('#f_Catatan').value = autoCatatan(F.skor, ins, 'supervisi ' + F.data.Jenis.toLowerCase()); F._catAuto = true; F.autoNote = true; };
  const gr = $('#genRtl');
  if (gr) gr.onclick = () => { $('#f_RTL').value = autoRTL(F.skor, ins, 'supervisi ' + F.data.Jenis.toLowerCase()); F._rtlAuto = true; F.autoRTL = true; };
  const tc = $('#f_Catatan');
  if (tc) tc.oninput = () => { F.autoNote = false; F._catAuto = false; };
  const tr = $('#f_RTL');
  if (tr) tr.oninput = () => { F.autoRTL = false; F._rtlAuto = false; };
}

function collectStep(F) {
  ['Tanggal', 'Jenis', 'Kepala', 'Pengawas', 'PengawasStatus', 'Madrasah', 'Guru', 'NIPGuru', 'Mapel', 'Kelas', 'Materi', 'Catatan', 'RTL'].forEach(k => {
    const elx = $('#f_' + k);
    if (elx) F.data[k] = elx.value;
  });
  return true;
}

async function saveSupervisi(F, ins, flat) {
  collectStep(F);
  F.data.Catatan = ($('#f_Catatan') || {}).value || F.data.Catatan;
  F.data.RTL = ($('#f_RTL') || {}).value || F.data.RTL;
  if (!F.data.Tanggal || !F.data.Madrasah || !F.data.Guru) return toast('Lengkapi info umum (tanggal, madrasah, guru).', 'err');
  if (!F.data.Kepala) return toast('Nama Kepala Madrasah (pelaksana) wajib diisi.', 'err');
  const hit = hitungNilai(F.skor, flat.length);
  const reVerify = !!F.editId && F.data.PengawasStatus === 'Diketahui';
  const row = Object.assign({}, F.data, {
    ID: F.editId || '',
    PengawasStatus: 'Menunggu',
    PengawasTgl: '',
    SkorJSON: JSON.stringify(F.skor),
    TotalSkor: hit.total, SkorMaks: hit.maks, Nilai: hit.nilai, Predikat: hit.predikat,
    Status: hit.terisi === flat.length ? 'Selesai' : 'Draft',
  });
  if (F.saving) return;            // cegah klik ganda
  F.saving = true;
  const btn = $('#wSave');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
  loading(true, 'MENYIMPAN…');
  try {
    await Store.save('supervisi', row);
    toast(`Supervisi tersimpan • Nilai ${hit.nilai} (${hit.predikat})${reVerify ? ' • perlu verifikasi ulang pengawas' : ''}`, 'ok');
    S.form = null;
    go('supervisi');
  } catch (e) { toast(e.message, 'err'); F.saving = false; if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Supervisi'; } }
  finally { loading(false); }
}

/* =====================================================================
   REKAP
   ===================================================================== */
async function pRekap(el) {
  loading(true, 'MEMUAT REKAP…');
  const rows = await Store.list('supervisi', '');
  loading(false);
  const mads = [...new Set(rows.map(r => r.Madrasah).filter(Boolean))];
  const preds = ['Amat Baik', 'Sangat Baik', 'Baik', 'Sedang', 'Cukup', 'Kurang'];
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + (parseFloat(r.Nilai) || 0), 0) / rows.length * 10) / 10 : 0;
  const dist = {};
  rows.forEach(r => { dist[r.Predikat || '-'] = (dist[r.Predikat || '-'] || 0) + 1; });
  const byMad = {};
  rows.forEach(r => {
    const m = r.Madrasah || '-';
    byMad[m] = byMad[m] || { sum: 0, n: 0 };
    const v = parseFloat(r.Nilai);
    if (!isNaN(v)) { byMad[m].sum += v; byMad[m].n++; }
  });
  const bars = Object.entries(byMad).map(([label, o]) => ({ label, nilai: o.n ? Math.round(o.sum / o.n * 10) / 10 : 0 })).sort((a, b) => b.nilai - a.nilai);

  el.innerHTML = `
  <div class="grid3">
    <div class="stat s1"><span class="ico">📝</span><div class="num">${rows.length}</div><div class="lbl">Total Supervisi</div></div>
    <div class="stat s3"><span class="ico">⭐</span><div class="num">${avg}</div><div class="lbl">Rata-rata Nilai</div></div>
    <div class="stat s2"><span class="ico">🏫</span><div class="num">${mads.length}</div><div class="lbl">Madrasah Tersupervisi</div></div>
  </div>
  <div class="grid2" style="margin-top:20px">
    <div class="card"><h3>🍩 Distribusi Predikat</h3><div class="chartbox">${svgDonut(dist)}</div></div>
    <div class="card"><h3>📊 Rata-rata per Madrasah</h3><div class="chartbox">${svgBars(bars)}</div></div>
  </div>
  <div class="card"><h3>📋 Tabel Rekap</h3>
    <div class="toolbar">
      <select id="rMad" style="padding:10px;border:var(--bd-sm);border-radius:10px;font-weight:700"><option value="">Semua Madrasah</option>${mads.map(m => `<option>${esc(m)}</option>`).join('')}</select>
      <select id="rPred" style="padding:10px;border:var(--bd-sm);border-radius:10px;font-weight:700"><option value="">Semua Predikat</option>${preds.map(p => `<option>${p}</option>`).join('')}</select>
      <button class="btn btn-sm btn-grey" id="rCsv">⬇️ CSV</button>
      <button class="btn btn-sm btn-dark" id="rPrint">🖨️ Cetak Rekap</button>
    </div>
    <div class="twrap"><table class="data"><tr><th>No</th><th>Tanggal</th><th>Guru</th><th>Madrasah</th><th>Pelaksana (Kepala)</th><th>Total</th><th>Nilai</th><th>Predikat</th><th>Diketahui Pengawas</th></tr><tbody id="rBody"></tbody></table></div>
  </div>`;
  const render = () => {
    const fm = $('#rMad').value, fp = $('#rPred').value;
    const f = rows.filter(r => (!fm || r.Madrasah === fm) && (!fp || r.Predikat === fp));
    $('#rBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td><td><b>${esc(r.Guru)}</b></td><td>${esc(r.Madrasah)}</td><td style="font-size:.8rem">${esc(r.Kepala || '-')}</td><td>${esc(r.TotalSkor)}/${esc(r.SkorMaks)}</td><td><b>${esc(r.Nilai)}</b></td><td><span class="pill" style="background:var(--yellow)">${esc(r.Predikat)}</span></td><td>${verifPill(r)}</td></tr>`).join('')
      : '<tr><td colspan="9"><div class="empty"><span class="big">📭</span>Tidak ada data.</div></td></tr>';
    return f;
  };
  render();
  $('#rMad').onchange = render; $('#rPred').onchange = render;
  $('#rCsv').onclick = () => {
    const headers = ['Tanggal', 'Guru', 'Madrasah', 'Kepala', 'Pengawas', 'PengawasStatus', 'PengawasTgl', 'Mapel', 'TotalSkor', 'SkorMaks', 'Nilai', 'Predikat'];
    download(`rekap-supervisi-${todayISO()}.csv`, toCSV(render(), headers), 'text/csv');
  };
  $('#rPrint').onclick = () => printRekap(render());
}

/* =====================================================================
   CETAK
   ===================================================================== */
async function pCetak(el) {
  loading(true, 'MEMUAT…');
  const rows = await Store.list('supervisi', '');
  loading(false);
  el.innerHTML = `
  <div class="card"><h3>🖨️ Cetak Laporan Hasil Supervisi</h3>
    <p style="font-weight:600;margin-bottom:12px">Pilih data supervisi untuk dicetak sebagai laporan resmi (kop madrasah/kemenag, tabel skor, catatan &amp; tanda tangan).</p>
    <div class="toolbar"><input type="search" id="cq" placeholder="🔍 Cari guru / madrasah…"></div>
    <div class="twrap"><table class="data"><tr><th>No</th><th>Tanggal</th><th>Guru</th><th>Madrasah</th><th>Nilai</th><th>Predikat</th><th></th></tr><tbody id="cBody"></tbody></table></div>
  </div>`;
  const render = () => {
    const q = $('#cq').value.toLowerCase();
    const f = rows.filter(r => !q || [r.Guru, r.Madrasah].some(v => String(v || '').toLowerCase().includes(q)));
    $('#cBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td><td><b>${esc(r.Guru)}</b></td><td>${esc(r.Madrasah)}</td><td><b>${esc(r.Nilai)}</b></td><td>${esc(r.Predikat)}</td><td><button class="btn btn-sm btn-dark" data-p="${r.ID}">🖨️ Cetak</button></td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empty"><span class="big">📭</span>Belum ada data.</div></td></tr>';
    $$('#cBody [data-p]').forEach(b => b.onclick = () => printSupervisi(b.dataset.p));
  };
  $('#cq').oninput = render;
  render();
}

function kopHTML(judul, sub) {
  return `<div class="print-kop">
    <h2>🏛️ KEMENTERIAN AGAMA REPUBLIK INDONESIA</h2>
    <p><b>POKJA PENGAWAS MADRASAH (POKJAWAS)</b></p>
    <h2 style="margin-top:8px">${esc(judul)}</h2><p>${esc(sub || '')}</p>
  </div>`;
}
/**
 * Blok tanda tangan laporan:
 *  KIRI  = Mengetahui, Pengawas Madrasah
 *  KANAN = Kepala Madrasah (pelaksana supervisi) + tanggal
 */
function ttdHTML(kepala, pengawas, kota) {
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="ttd">
    <div>Mengetahui,<br>Pengawas Madrasah<br><br><br><br><br><b><u>${esc(pengawas || '( ……………………………… )')}</u></b></div>
    <div>${esc(kota || '………………')}, ${tgl}<br>Kepala Madrasah<br><br><br><br><br><b><u>${esc(kepala || '( ……………………………… )')}</u></b></div>
  </div>`;
}

async function printSupervisi(id) {
  const rows = await Store.list('supervisi', '');
  const r = rows.find(x => x.ID === id);
  if (!r) return toast('Data tidak ditemukan.', 'err');
  const ins = instrumenFor(r.Jenis);
  const skor = parseSkor(r);
  const flat = flatButir(ins);
  let kota = '………………';
  try {
    const mads = await Store.list('madrasah', '');
    const md = mads.find(m => m.Nama === r.Madrasah);
    if (md && md.Kabupaten) kota = md.Kabupaten;
  } catch (_) {}
  let no = 0;
  const rowsHtml = ins.map(t => {
    const items = flat.filter(b => b.tahap === t.kode);
    return `<tr><td colspan="3" style="background:#eee"><b>${esc(t.judul)}</b></td></tr>` + items.map(b => {
      no++;
      return `<tr><td style="text-align:center">${b.no}</td><td>${esc(b.teks)}</td><td style="text-align:center"><b>${skor[b.no] || '-'}</b></td></tr>`;
    }).join('');
  }).join('');
  $('#page').innerHTML = `
  <div class="no-print btnrow" style="margin:0 0 16px"><button class="btn btn-grey" onclick="go('cetak')">← Kembali</button><button class="btn btn-dark" onclick="window.print()">🖨️ Print / Simpan PDF</button></div>
  <div class="card">${kopHTML('LAPORAN HASIL SUPERVISI ' + (r.Jenis || '').toUpperCase(), 'Pembelajaran Mendalam — Kurikulum Berbasis Cinta (PM-KBC)')}
    <table class="print" style="margin-bottom:14px">
      <tr><th style="width:220px">Nama Guru</th><td><b>${esc(r.Guru)}</b> ${r.NIPGuru ? '(NIP: ' + esc(r.NIPGuru) + ')' : ''}</td><th style="width:160px">Tanggal</th><td>${fmtTanggal(r.Tanggal)}</td></tr>
      <tr><th>Madrasah</th><td>${esc(r.Madrasah)}</td><th>Jenis Supervisi</th><td>${esc(r.Jenis)}</td></tr>
      <tr><th>Kepala Madrasah (Pelaksana)</th><td>${esc(r.Kepala || '-')}</td><th>Pengawas (Mengetahui)</th><td>${esc(r.Pengawas || '-')}</td></tr>
      <tr><th>Mata Pelajaran / Kelas</th><td>${esc(r.Mapel)} / ${esc(r.Kelas)}</td><th>Materi</th><td>${esc(r.Materi)}</td></tr>
      <tr><th>Status Verifikasi</th><td colspan="3">${r.PengawasStatus === 'Diketahui' ? 'Diketahui oleh Pengawas Madrasah' + (r.PengawasTgl ? ' pada ' + fmtTanggal(r.PengawasTgl) : '') : 'Menunggu verifikasi Pengawas Madrasah'}</td></tr>
    </table>
    <table class="print"><tr><th style="width:40px;text-align:center">No</th><th>Aspek yang Dinilai</th><th style="width:60px;text-align:center">Skor</th></tr>${rowsHtml}
    <tr><td colspan="2" style="text-align:right"><b>JUMLAH SKOR</b></td><td style="text-align:center"><b>${esc(r.TotalSkor)} / ${esc(r.SkorMaks)}</b></td></tr>
    <tr><td colspan="2" style="text-align:right"><b>NILAI AKHIR</b></td><td style="text-align:center"><b>${esc(r.Nilai)}</b></td></tr>
    <tr><td colspan="2" style="text-align:right"><b>PREDIKAT</b></td><td style="text-align:center"><b>${esc(r.Predikat)}</b></td></tr></table>
    <p style="margin-top:12px;font-size:.85rem"><b>Catatan Hasil:</b><br>${esc(r.Catatan || '-')}</p>
    <p style="margin-top:8px;font-size:.85rem"><b>Rencana Tindak Lanjut:</b><br>${esc(r.RTL || '-')}</p>
    ${r.CatatanPengawas ? `<p style="margin-top:8px;font-size:.85rem"><b>Catatan / Rekomendasi Pengawas Madrasah:</b><br>${esc(r.CatatanPengawas)}</p>` : ''}
    ${ttdHTML(r.Kepala, r.Pengawas, kota)}
  </div>`;
  window.scrollTo(0, 0);
}

function printRekap(rows) {
  $('#page').innerHTML = `
  <div class="no-print btnrow" style="margin:0 0 16px"><button class="btn btn-grey" onclick="go('rekap')">← Kembali</button><button class="btn btn-dark" onclick="window.print()">🖨️ Print / Simpan PDF</button></div>
  <div class="card">${kopHTML('REKAP HASIL SUPERVISI PEMBELAJARAN PM-KBC', `Jumlah data: ${rows.length} • Dicetak: ${new Date().toLocaleDateString('id-ID')}`)}
    <table class="print"><tr><th>No</th><th>Tanggal</th><th>Nama Guru</th><th>Madrasah</th><th>Pelaksana (Kepala)</th><th>Skor</th><th>Nilai</th><th>Predikat</th><th>Verifikasi</th></tr>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtTanggal(r.Tanggal)}</td><td>${esc(r.Guru)}</td><td>${esc(r.Madrasah)}</td><td>${esc(r.Kepala || '-')}</td><td style="text-align:center">${esc(r.TotalSkor)}</td><td style="text-align:center"><b>${esc(r.Nilai)}</b></td><td>${esc(r.Predikat)}</td><td style="text-align:center">${r.PengawasStatus === 'Diketahui' ? 'Diketahui' : 'Menunggu'}</td></tr>`).join('')}
    </table>${ttdHTML(role() === 'Kepala Madrasah' ? me().Nama : '', role() === 'Pengawas Madrasah' ? me().Nama : '')}
  </div>`;
  window.scrollTo(0, 0);
}

/* =====================================================================
   MINI MODULES: kokurikuler / ekstrakurikuler / iklim
   ===================================================================== */
const MINI_DEF = {
  kokurikuler: {
    title: 'Kokurikuler', ins: () => INSTRUMEN_KOKURIKULER,
    fields: [['Tanggal', 'Tanggal', 'date'], ['Madrasah', 'Madrasah', 'madrasah'], ['Pembina', 'Pembina / Guru', 'text'], ['Kegiatan', 'Nama Kegiatan / Proyek', 'text']],
    cols: [['Tanggal', 'Tanggal'], ['Madrasah', 'Madrasah'], ['Kegiatan', 'Kegiatan'], ['Nilai', 'Nilai'], ['Predikat', 'Predikat']],
  },
  ekstrakurikuler: {
    title: 'Ekstrakurikuler', ins: () => INSTRUMEN_EKSTRA,
    fields: [['Tanggal', 'Tanggal', 'date'], ['Madrasah', 'Madrasah', 'madrasah'], ['Pembina', 'Pembina / Pelatih', 'text'], ['Kegiatan', 'Nama Ekstrakurikuler', 'text']],
    cols: [['Tanggal', 'Tanggal'], ['Madrasah', 'Madrasah'], ['Kegiatan', 'Kegiatan'], ['Nilai', 'Nilai'], ['Predikat', 'Predikat']],
  },
  iklim: {
    title: 'Iklim Madrasah', ins: () => INSTRUMEN_IKLIM,
    fields: [['Tanggal', 'Tanggal', 'date'], ['Madrasah', 'Madrasah', 'madrasah'], ['Responden', 'Responden / Observer', 'text']],
    cols: [['Tanggal', 'Tanggal'], ['Madrasah', 'Madrasah'], ['Responden', 'Responden'], ['Nilai', 'Nilai'], ['Predikat', 'Predikat']],
  },
};

async function pMini(el, entity) {
  const def = MINI_DEF[entity];
  const canW = Store.canWrite(entity);
  loading(true, 'MEMUAT…');
  const rows = await Store.list(entity, '');
  loading(false);
  el.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <input type="search" id="nq" placeholder="🔍 Cari…">
      ${canW ? `<button class="btn btn-yellow" id="nAdd">➕ Input ${def.title}</button>` : ''}
      <button class="btn btn-sm btn-grey" id="nCsv">⬇️ CSV</button>
    </div>
    <div class="twrap"><table class="data"><tr><th>No</th>${def.cols.map(c => `<th>${c[1]}</th>`).join('')}<th>Aksi</th></tr><tbody id="nBody"></tbody></table></div>
  </div>`;
  const render = () => {
    const q = $('#nq').value.toLowerCase();
    const f = rows.filter(r => !q || def.cols.some(c => String(r[c[0]] || '').toLowerCase().includes(q)));
    $('#nBody').innerHTML = f.length ? f.map((r, i) => `<tr><td>${i + 1}</td>
      ${def.cols.map(c => `<td>${c[0] === 'Tanggal' ? fmtTanggal(r[c[0]]) : c[0] === 'Nilai' ? `<b>${esc(r[c[0]])}</b>` : esc(r[c[0]])}</td>`).join('')}
      <td style="white-space:nowrap"><button class="btn btn-sm btn-dark" data-v="${r.ID}">👁️</button>
      ${canW ? `<button class="btn btn-sm btn-primary" data-e="${r.ID}">✏️</button> <button class="btn btn-sm btn-red" data-d="${r.ID}">🗑️</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty"><span class="big">📭</span>Belum ada data.</div></td></tr>`;
    $$('#nBody [data-v]').forEach(b => b.onclick = () => miniDetail(entity, rows.find(r => r.ID === b.dataset.v)));
    $$('#nBody [data-e]').forEach(b => b.onclick = () => miniForm(entity, rows.find(r => r.ID === b.dataset.e)));
    $$('#nBody [data-d]').forEach(b => b.onclick = () => confirmBox('Hapus?', 'Hapus data ini permanen?', 'Ya, Hapus', async () => {
      try { await Store.remove(entity, b.dataset.d); toast('Dihapus.', 'ok'); go(entity); } catch (e) { toast(e.message, 'err'); }
    }));
  };
  render();
  $('#nq').oninput = render;
  if (canW) $('#nAdd').onclick = () => miniForm(entity, null);
  $('#nCsv').onclick = () => download(`${entity}-${todayISO()}.csv`, toCSV(rows, def.cols.map(c => c[0])), 'text/csv');
}

async function miniForm(entity, row) {
  const def = MINI_DEF[entity];
  const ins = def.ins();
  const flat = flatButir(ins);
  row = row || { Tanggal: todayISO() };
  const mads = await Store.list('madrasah', '');
  const skor = parseSkor(row);
  const madrasahLocked = role() === 'Kepala Madrasah';
  openModal(`<h3>${row.ID ? '✏️ Edit' : '➕ Input'} ${def.title}</h3>
    ${def.fields.map(f => {
      if (f[2] === 'date') return `<div class="fgroup"><label>${f[1]}</label><input type="date" id="nf_${f[0]}" value="${esc(row[f[0]] || todayISO())}"></div>`;
      if (f[2] === 'madrasah') return `<div class="fgroup"><label>${f[1]}</label><select id="nf_${f[0]}">${madrasahLocked ? `<option>${esc(me().Madrasah)}</option>` : mads.map(m => `<option ${row.Madrasah === m.Nama ? 'selected' : ''}>${esc(m.Nama)}</option>`).join('')}</select></div>`;
      return `<div class="fgroup"><label>${f[1]}</label><input id="nf_${f[0]}" value="${esc(row[f[0]] || '')}"></div>`;
    }).join('')}
    ${ins.map(t => `<div class="tahap" style="background:${t.warna};color:var(--ink);border:3px solid var(--ink)">${esc(t.judul)}</div>` +
      flat.filter(b => b.tahap === t.kode).map(b => `<div class="ins-item"><div class="q"><span class="no">${b.no}</span>${esc(b.teks)}</div>
        <div class="skorrow">${[1, 2, 3, 4].map(s => `<button class="skor${Number(skor[b.no]) === s ? ' on-' + s : ''}" data-no="${b.no}" data-s="${s}">${s}</button>`).join('')}</div></div>`).join('')).join('')}
    <div class="rekap" style="padding:14px"><b>Nilai: <span id="nfNilai">-</span></b> • <span id="nfPred">-</span> • Terisi <span id="nfCount">0</span>/${flat.length}</div>
    <div class="fgroup"><label>Catatan</label><textarea id="nf_Catatan">${esc(row.Catatan || '')}</textarea></div>
    <div class="fgroup"><label>Rencana Tindak Lanjut</label><textarea id="nf_RTL">${esc(row.RTL || '')}</textarea></div>
    <div class="btnrow"><button class="btn btn-sm btn-grey" id="nfAuto">✨ Generate Catatan & RTL</button></div>
    <div class="btnrow"><button class="btn btn-green" id="nfSave">💾 Simpan</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`, true);

  const refresh = () => {
    const h = hitungNilai(skor, flat.length);
    $('#nfNilai').textContent = h.nilai;
    $('#nfPred').textContent = h.predikat;
    $('#nfCount').textContent = h.terisi;
  };
  $$('#overlay .skor').forEach(b => b.onclick = () => {
    skor[Number(b.dataset.no)] = Number(b.dataset.s);
    $$(`#overlay .skor[data-no="${b.dataset.no}"]`).forEach(x => x.className = 'skor' + (Number(x.dataset.s) === Number(b.dataset.s) ? ' on-' + b.dataset.s : ''));
    refresh();
  });
  $('#nfAuto').onclick = () => {
    $('#nf_Catatan').value = autoCatatan(skor, ins, def.title.toLowerCase());
    $('#nf_RTL').value = autoRTL(skor, ins, def.title.toLowerCase());
  };
  $('#nfSave').onclick = async () => {
    const data = { ID: row.ID || '' };
    def.fields.forEach(f => data[f[0]] = $('#nf_' + f[0]).value);
    if (!data.Madrasah) return toast('Madrasah wajib dipilih.', 'err');
    const h = hitungNilai(skor, flat.length);
    data.SkorJSON = JSON.stringify(skor);
    data.TotalSkor = h.total; data.SkorMaks = h.maks; data.Nilai = h.nilai; data.Predikat = h.predikat;
    data.Catatan = $('#nf_Catatan').value; data.RTL = $('#nf_RTL').value;
    loading(true, 'MENYIMPAN…');
    try { await Store.save(entity, data); closeModal(); toast(`Tersimpan • Nilai ${h.nilai} (${h.predikat})`, 'ok'); go(entity); }
    catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
  refresh();
}

function miniDetail(entity, r) {
  if (!r) return;
  const def = MINI_DEF[entity];
  openModal(`<button class="mx" onclick="closeModal()">✕</button><h3>👁️ Detail ${def.title}</h3>
    <div class="rekap" style="margin-top:0"><div style="display:flex;gap:18px;align-items:center"><div class="score">${esc(r.Nilai)}</div>
    <div><b>${esc(r.Madrasah)}</b><br><span style="font-size:.8rem;font-weight:700">${fmtTanggal(r.Tanggal)} • ${esc(r.Kegiatan || r.Responden || '')}</span><br><span class="pred ${predikatClass(r.Predikat)}">${esc(r.Predikat)}</span></div></div></div>
    <div class="fgroup"><label>Catatan</label><div class="chartbox" style="font-size:.82rem">${esc(r.Catatan || '-')}</div></div>
    <div class="fgroup"><label>Rencana Tindak Lanjut</label><div class="chartbox" style="font-size:.82rem">${esc(r.RTL || '-')}</div></div>`, true);
}

/* =====================================================================
   USERS (ADMIN)
   ===================================================================== */
async function pUsers(el) {
  loading(true, 'MEMUAT PENGGUNA…');
  const users = await Store.usersList();
  loading(false);
  const pending = users.filter(u => u.Status === 'Pending');
  const active = users.filter(u => u.Status !== 'Pending');
  const rowHtml = u => `<tr><td><b>${esc(u.Nama)}</b><br><span style="font-size:.72rem;opacity:.7">@${esc(u.Username)}</span></td>
    <td><span class="pill" style="background:var(--blue)">${esc(u.Role)}</span></td><td>${esc(u.Madrasah || '-')}</td>
    <td><span class="pill ${u.Status === 'Aktif' ? 'p-aktif' : u.Status === 'Pending' ? 'p-pending' : 'p-nonaktif'}">${esc(u.Status)}</span></td>
    <td style="white-space:nowrap">
      ${u.Status === 'Pending' ? `<button class="btn btn-sm btn-green" data-acc="${u.ID}">✅ Setujui</button> ` : ''}
      ${u.Status === 'Aktif' && u.Username !== 'admin' ? `<button class="btn btn-sm btn-orange" data-off="${u.ID}">⏸️ Nonaktifkan</button> ` : ''}
      ${u.Status === 'Nonaktif' ? `<button class="btn btn-sm btn-green" data-on="${u.ID}">▶️ Aktifkan</button> ` : ''}
      <button class="btn btn-sm btn-primary" data-e="${u.ID}">✏️</button>
      <button class="btn btn-sm btn-grey" data-r="${u.ID}">🔑</button>
      ${u.Username !== 'admin' ? `<button class="btn btn-sm btn-red" data-d="${u.ID}">🗑️</button>` : ''}
    </td></tr>`;
  el.innerHTML = `
  ${pending.length ? `<div class="card" style="background:#FFF3D6"><h3>🔔 Menunggu Persetujuan (${pending.length})</h3>
    <div class="twrap"><table class="data"><tr><th>Nama</th><th>Role</th><th>Madrasah</th><th>Status</th><th>Aksi</th></tr>${pending.map(rowHtml).join('')}</table></div></div>` : ''}
  <div class="card"><h3>👥 Semua Pengguna (${users.length})</h3>
    <div class="toolbar"><input type="search" id="uq" placeholder="🔍 Cari nama / username…">
      <button class="btn btn-yellow" id="uAdd">➕ Buat Akun</button></div>
    <div class="twrap"><table class="data"><tr><th>Nama</th><th>Role</th><th>Madrasah</th><th>Status</th><th>Aksi</th></tr><tbody id="uBody"></tbody></table></div>
  </div>`;
  const render = q => {
    const s = (q || '').toLowerCase();
    const f = users.filter(u => !s || (u.Nama + u.Username + u.Role).toLowerCase().includes(s));
    $('#uBody').innerHTML = f.map(rowHtml).join('');
    bindUserBtns();
  };
  render('');
  $('#uq').oninput = e => render(e.target.value);
  if ($('#uAdd')) $('#uAdd').onclick = () => akunBaruAdmin();
  function bindUserBtns() {
    $$('#page [data-acc]').forEach(b => b.onclick = () => setStatus(b.dataset.acc, 'Aktif'));
    $$('#page [data-on]').forEach(b => b.onclick = () => setStatus(b.dataset.on, 'Aktif'));
    $$('#page [data-off]').forEach(b => b.onclick = () => confirmBox('Nonaktifkan?', 'User tidak bisa login sampai diaktifkan lagi.', 'Ya', () => setStatus(b.dataset.off, 'Nonaktif')));
    $$('#page [data-e]').forEach(b => b.onclick = () => userEdit(users.find(u => u.ID === b.dataset.e)));
    $$('#page [data-r]').forEach(b => b.onclick = () => {
      openModal(`<h3>🔑 Reset Password</h3><div class="fgroup"><label>Password Baru (min. 4 karakter)</label><input id="rpNew" type="text" value="123456"></div>
      <div class="btnrow"><button class="btn btn-primary" id="rpGo">Reset</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
      $('#rpGo').onclick = async () => {
        try { await Store.userResetPassword(b.dataset.r, $('#rpNew').value); closeModal(); toast('Password direset.', 'ok'); go('users'); }
        catch (e) { toast(e.message, 'err'); }
      };
    });
    $$('#page [data-d]').forEach(b => b.onclick = () => confirmBox('Hapus User?', 'User akan dihapus permanen.', 'Ya, Hapus', async () => {
      try { await Store.userDelete(b.dataset.d); toast('User dihapus.', 'ok'); go('users'); } catch (e) { toast(e.message, 'err'); }
    }));
  }
  async function setStatus(id, st) {
    try { await Store.userSetStatus(id, st); toast('Status diperbarui.', 'ok'); go('users'); } catch (e) { toast(e.message, 'err'); }
  }
  function userEdit(u) {
    if (!u) return;
    openModal(`<h3>✏️ Edit Pengguna</h3>
      <div class="fgroup"><label>Nama</label><input id="ueNama" value="${esc(u.Nama)}"></div>
      <div class="fgroup"><label>Role</label><select id="ueRole">${ROLES.map(r => `<option ${u.Role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="fgroup"><label>Madrasah</label><input id="ueMad" value="${esc(u.Madrasah || '')}"></div>
      <div class="frow"><div class="fgroup"><label>NIP</label><input id="ueNip" value="${esc(u.NIP || '')}"></div>
      <div class="fgroup"><label>No HP</label><input id="ueHp" value="${esc(u.NoHP || '')}"></div></div>
      <div class="btnrow"><button class="btn btn-primary" id="ueSave">💾 Simpan</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
    $('#ueSave').onclick = async () => {
      try {
        await Store.userUpdate(u.ID, { nama: $('#ueNama').value, role: $('#ueRole').value, madrasah: $('#ueMad').value, nip: $('#ueNip').value, nohp: $('#ueHp').value });
        closeModal(); toast('User diperbarui.', 'ok'); go('users');
      } catch (e) { toast(e.message, 'err'); }
    };
  }
}

/* =====================================================================
   KONEKSI & BACKUP
   ===================================================================== */
function pKoneksi(el) {
  el.innerHTML = `
  <div class="card"><h3>🔌 Pengaturan Koneksi Database</h3>
    <div class="fgroup"><label>Sumber Data Aktif</label>
      <div style="display:flex;gap:16px;font-weight:800"><label><input type="radio" name="cxMode" value="demo" ${Store.mode === 'demo' ? 'checked' : ''}> 🧪 Demo (Browser)</label>
      <label><input type="radio" name="cxMode" value="api" ${Store.mode === 'api' ? 'checked' : ''}> ☁️ Apps Script + Spreadsheet</label></div></div>
    <div class="fgroup"><label>URL Web App Apps Script</label><input id="cxUrl" value="${esc(Store.apiUrl || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
    <div class="btnrow">
      <button class="btn btn-dark" id="cxSave">💾 Simpan & Terapkan</button>
      <button class="btn btn-grey" id="cxTest">🔌 Tes Koneksi</button>
      <button class="btn btn-green" id="cxInit">🗄️ Init Database (Setup)</button>
    </div>
    <div class="hint">Mengganti sumber data akan <b>logout otomatis</b> dan memuat ulang. Di mode API, login memakai akun yang terdaftar di Spreadsheet (akun Admin dibuat saat menjalankan <b>Init Database</b> / fungsi <b>setup</b>).</div>
  </div>
  <div class="card"><h3>💾 Backup & Restore</h3>
    <div class="btnrow">
      <button class="btn btn-yellow" id="cxBackup">⬇️ Backup Semua Data (JSON)</button>
      <button class="btn btn-orange" id="cxRestoreBtn">⬆️ Restore (Mode Demo)</button>
      <input type="file" id="cxRestore" accept=".json" class="hidden">
      ${Store.mode === 'demo' ? '<button class="btn btn-red" id="cxReset">♻️ Reset Data Demo</button>' : ''}
    </div>
    <div class="hint">Backup mengunduh seluruh data (pengguna tanpa password, master, supervisi, kokurikuler, ekstrakurikuler, iklim). Restore hanya untuk Mode Demo.</div>
  </div>
  <div class="card"><h3>📖 Cara Deploy Backend (Ringkas)</h3>
    <ol style="font-weight:600;line-height:2;padding-left:20px">
      <li>Buat <b>Google Spreadsheet</b> baru.</li>
      <li>Buka <b>Ekstensi → Apps Script</b>, paste isi <b>Code.gs</b>, lalu <b>Save</b>.</li>
      <li>Jalankan fungsi <b>setup</b> sekali (Run) &amp; izinkan akses.</li>
      <li><b>Deploy → New deployment → Web app</b> (Execute as: Me, akses: Anyone) → salin URL.</li>
      <li>Tempel URL di kolom atas → <b>Simpan & Terapkan</b> → login admin.</li>
    </ol>
    <p style="font-weight:700;margin-top:8px">📄 Panduan lengkap ada di file <b>README.md</b> & menu <b>Panduan</b>.</p>
  </div>`;
  $('#cxSave').onclick = async () => {
    const m = document.querySelector('input[name=cxMode]:checked').value;
    const url = $('#cxUrl').value.trim();
    if (m === 'api' && !url) return toast('Isi URL Web App dulu.', 'err');
    Store.setMode(m, url);
    await Store.logout();
    location.reload();
  };
  $('#cxTest').onclick = async () => {
    const url = $('#cxUrl').value.trim() || Store.apiUrl;
    if (!url) return toast('Isi URL dulu.', 'err');
    loading(true, 'TES KONEKSI…');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) });
      const j = JSON.parse(await res.text());
      if (j.status === 'ok') toast('✅ Koneksi OK! Waktu server: ' + j.data.time, 'ok');
      else toast('❌ ' + j.message, 'err');
    } catch (e) { toast('❌ Gagal: ' + e.message, 'err'); }
    finally { loading(false); }
  };
  $('#cxInit').onclick = async () => {
    const url = $('#cxUrl').value.trim() || Store.apiUrl;
    if (!url) return toast('Isi URL dulu.', 'err');
    loading(true, 'INIT DATABASE…');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'setup' }) });
      const j = JSON.parse(await res.text());
      if (j.status === 'ok') toast('✅ ' + j.data.message, 'ok');
      else toast('❌ ' + j.message, 'err');
    } catch (e) { toast('❌ Gagal: ' + e.message, 'err'); }
    finally { loading(false); }
  };
  $('#cxBackup').onclick = async () => {
    loading(true, 'MEMBUAT BACKUP…');
    try {
      const data = {};
      for (const ent of ['madrasah', 'guru', 'pengawas', 'supervisi', 'kokurikuler', 'ekstrakurikuler', 'iklim']) data[ent] = await Store.list(ent, '');
      if (role() === 'Admin') data.users = (await Store.usersList()).map(u => { const c = Object.assign({}, u); delete c.Token; return c; });
      data._meta = { app: APP_NAME, mode: Store.mode, tanggal: new Date().toISOString() };
      download(`backup-supervisi-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('Backup diunduh.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
  $('#cxRestoreBtn').onclick = () => {
    if (Store.mode !== 'demo') return toast('Restore hanya tersedia di Mode Demo.', 'err');
    $('#cxRestore').click();
  };
  $('#cxRestore').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        ['madrasah', 'guru', 'pengawas', 'supervisi', 'kokurikuler', 'ekstrakurikuler', 'iklim'].forEach(ent => { if (Array.isArray(d[ent])) Store.db()[ent] = d[ent]; });
        Store.persist();
        toast('Restore berhasil.', 'ok');
      } catch (_) { toast('File tidak valid.', 'err'); }
    };
    rd.readAsText(f);
  };
  const rs = $('#cxReset');
  if (rs) rs.onclick = () => confirmBox('Reset Demo?', 'Seluruh data demo dikembalikan ke awal.', 'Ya, Reset', () => { Store.resetDemo(); toast('Data demo direset.', 'ok'); go('dashboard'); });
}

/* =====================================================================
   PROFIL
   ===================================================================== */
function pProfil(el) {
  const u = me();
  el.innerHTML = `
  <div class="grid2">
    <div class="card"><h3>🙋 Profil Saya</h3>
      <div class="fgroup"><label>Nama Lengkap</label><input id="pfNama" value="${esc(u.Nama)}"></div>
      <div class="frow"><div class="fgroup"><label>Username</label><input value="${esc(u.Username)}" disabled style="background:var(--grey)"></div>
      <div class="fgroup"><label>Role</label><input value="${esc(u.Role)}" disabled style="background:var(--grey)"></div></div>
      <div class="fgroup"><label>Madrasah / Tempat Tugas</label><input id="pfMad" value="${esc(u.Madrasah || '')}"></div>
      <div class="frow"><div class="fgroup"><label>NIP</label><input id="pfNip" value="${esc(u.NIP || '')}"></div>
      <div class="fgroup"><label>No HP</label><input id="pfHp" value="${esc(u.NoHP || '')}"></div></div>
      <div class="btnrow"><button class="btn btn-primary" id="pfSave">💾 Simpan Profil</button></div>
    </div>
    <div class="card"><h3>🔑 Ubah Password</h3>
      <div class="fgroup"><label>Password Lama</label><input id="pwOld" type="password"></div>
      <div class="fgroup"><label>Password Baru</label><input id="pwNew" type="password"></div>
      <div class="fgroup"><label>Konfirmasi Password Baru</label><input id="pwNew2" type="password"></div>
      <div class="btnrow"><button class="btn btn-dark" id="pwSave">🔑 Ubah Password</button></div>
    </div>
  </div>
  ${role() === 'Admin' && Store.isConnected() ? `
  <div class="card"><h3>💾 Backup Data</h3>
    <p style="font-weight:700;margin-bottom:10px">Unduh salinan seluruh data (JSON). Menu koneksi &amp; restore dinonaktifkan karena database sudah terhubung ke Spreadsheet.</p>
    <div class="btnrow"><button class="btn btn-yellow" id="pfBackup">⬇️ Unduh Backup JSON</button></div>
    <div class="hint">Pencadangan utama tetap disarankan dari Google Spreadsheet: <b>File → Buat salinan</b> atau lihat <b>Riwayat versi</b>.</div>
  </div>` : ''}`;
  $('#pfSave').onclick = async () => {
    try {
      await Store.profileUpdate({ nama: $('#pfNama').value, madrasah: $('#pfMad').value, nip: $('#pfNip').value, nohp: $('#pfHp').value });
      toast('Profil diperbarui.', 'ok');
      $('#ucName').textContent = me().Nama;
    } catch (e) { toast(e.message, 'err'); }
  };
  if ($('#pfBackup')) $('#pfBackup').onclick = async () => {
    loading(true, 'MEMBUAT BACKUP…');
    try {
      const data = {};
      for (const ent of ['madrasah', 'guru', 'pengawas', 'supervisi', 'kokurikuler', 'ekstrakurikuler', 'iklim']) data[ent] = await Store.list(ent, '');
      data.users = (await Store.usersList()).map(u => { const c = Object.assign({}, u); delete c.Token; return c; });
      data._meta = { app: APP_NAME, mode: Store.mode, tanggal: new Date().toISOString() };
      download(`backup-supervisi-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('Backup diunduh.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
  $('#pwSave').onclick = async () => {
    if ($('#pwNew').value !== $('#pwNew2').value) return toast('Konfirmasi password tidak sama.', 'err');
    try {
      await Store.changePassword($('#pwOld').value, $('#pwNew').value);
      toast('Password diubah.', 'ok');
      $('#pwOld').value = $('#pwNew').value = $('#pwNew2').value = '';
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* =====================================================================
   AKUN GURU — didaftarkan oleh Kepala Madrasah (langsung aktif)
   ===================================================================== */
async function pAkunGuru(el) {
  const isKepala = role() === 'Kepala Madrasah';
  loading(true, 'MEMUAT AKUN GURU…');
  const [users, gurus] = await Promise.all([Store.usersList(), Store.list('guru', '')]);
  loading(false);
  const guruku = users.filter(u => u.Role === 'Guru');
  const aktif = guruku.filter(u => u.Status === 'Aktif').length;

  const mapelOf = nama => {
    const g = gurus.find(x => String(x.Nama || '').trim().toLowerCase() === String(nama || '').trim().toLowerCase());
    return g ? (g.Mapel || '') : '';
  };
  const rowHtml = u => `<tr>
    <td><b>${esc(u.Nama)}</b><br><span style="font-size:.72rem;opacity:.7">@${esc(u.Username)}</span></td>
    <td>${esc(u.NIP || '-')}</td>
    <td>${esc(u.Madrasah || '-')}</td>
    <td>${esc(mapelOf(u.Nama) || '-')}</td>
    <td><span class="pill ${u.Status === 'Aktif' ? 'p-aktif' : u.Status === 'Pending' ? 'p-pending' : 'p-nonaktif'}">${esc(u.Status)}</span></td>
    <td style="white-space:nowrap">
      ${u.Status === 'Aktif'
        ? `<button class="btn btn-sm btn-orange" data-off="${u.ID}">⏸️</button>`
        : `<button class="btn btn-sm btn-green" data-on="${u.ID}">▶️</button>`}
      <button class="btn btn-sm btn-grey" data-r="${u.ID}" title="Reset password">🔑</button>
      <button class="btn btn-sm btn-primary" data-edit="${u.ID}" title="Edit data akun">✏️</button>
      <button class="btn btn-sm btn-red" data-d="${u.ID}" title="Hapus akun">🗑️</button>
    </td></tr>`;

  el.innerHTML = `
  <div class="card tilt-r">
    <h3>🔐 Akun Guru — Didaftarkan Kepala Madrasah</h3>
    <p style="font-weight:700">Kepala Madrasah dapat <b>mendaftarkan akun login guru</b> di madrasahnya sendiri. Akun yang dibuat Kepala Madrasah <b>langsung AKTIF</b> — guru bisa langsung login tanpa menunggu persetujuan Admin.</p>
    <div class="hint">Akun guru otomatis terhubung ke <b>Data Guru</b> (nama sama) sehingga guru hanya melihat hasil supervisi miliknya sendiri.</div>
  </div>
  <div class="grid3">
    <div class="stat s1"><span class="ico">👩‍🏫</span><div class="num">${guruku.length}</div><div class="lbl">Akun Guru</div></div>
    <div class="stat s2"><span class="ico">✅</span><div class="num">${aktif}</div><div class="lbl">Aktif</div></div>
    <div class="stat s3"><span class="ico">🏫</span><div class="num">${esc(isKepala ? (me().Madrasah || '-') : new Set(guruku.map(u => u.Madrasah).filter(Boolean)).size)}</div><div class="lbl">${isKepala ? 'Madrasah Anda' : 'Madrasah'}</div></div>
  </div>
  <div class="card" style="margin-top:20px">
    <div class="toolbar">
      <input type="search" id="agq" placeholder="🔍 Cari nama / username…">
      <button class="btn btn-yellow" id="agAdd">➕ Daftarkan Akun Guru</button>
    </div>
    <div class="twrap"><table class="data"><tr><th>Nama / Username</th><th>NIP</th><th>Madrasah</th><th>Mapel</th><th>Status</th><th>Aksi</th></tr><tbody id="agBody"></tbody></table></div>
  </div>`;

  const render = (q) => {
    const s = (q || '').toLowerCase();
    const f = guruku.filter(u => !s || [u.Nama, u.Username, u.NIP, u.Madrasah].some(v => String(v || '').toLowerCase().includes(s)));
    $('#agBody').innerHTML = f.length ? f.map(rowHtml).join('')
      : '<tr><td colspan="6"><div class="empty"><span class="big">📭</span>Belum ada akun guru. Klik <b>➕ Daftarkan Akun Guru</b>.</div></td></tr>';
    bind();
  };
  const bind = () => {
    $$('#agBody [data-off]').forEach(b => b.onclick = () => confirmBox('Nonaktifkan akun?', 'Guru tidak bisa login sampai diaktifkan lagi.', 'Ya', () => setStatus(b.dataset.off, 'Nonaktif')));
    $$('#agBody [data-on]').forEach(b => b.onclick = () => setStatus(b.dataset.on, 'Aktif'));
    $$('#agBody [data-r]').forEach(b => b.onclick = () => resetPw(b.dataset.r));
    $$('#agBody [data-edit]').forEach(b => b.onclick = () => editAkun(users.find(u => u.ID === b.dataset.edit)));
    $$('#agBody [data-d]').forEach(b => b.onclick = () => confirmBox('Hapus akun guru?', 'Akun login akan dihapus permanen (data guru & supervisi tetap ada).', 'Ya, Hapus', async () => {
      try { await Store.userDelete(b.dataset.d); toast('Akun dihapus.', 'ok'); go('akunguru'); } catch (e) { toast(e.message, 'err'); }
    }));
  };
  const setStatus = async (id, st) => {
    try { await Store.userSetStatus(id, st); toast('Status diperbarui.', 'ok'); go('akunguru'); } catch (e) { toast(e.message, 'err'); }
  };
  const resetPw = (id) => {
    openModal(`<h3>🔑 Reset Password Guru</h3>
      <div class="fgroup"><label>Password Baru (min. 4 karakter)</label><input id="rpNew" type="text" value="123456"></div>
      <div class="hint">Berikan password baru ini kepada guru yang bersangkutan.</div>
      <div class="btnrow"><button class="btn btn-primary" id="rpGo">Reset</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
    $('#rpGo').onclick = async () => {
      try { await Store.userResetPassword(id, $('#rpNew').value); closeModal(); toast('Password direset.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    };
  };
  const editAkun = (u) => {
    if (!u) return;
    openModal(`<h3>✏️ Edit Akun Guru</h3>
      <div class="fgroup"><label>Nama Lengkap</label><input id="aeNama" value="${esc(u.Nama)}"></div>
      <div class="frow"><div class="fgroup"><label>NIP</label><input id="aeNip" value="${esc(u.NIP || '')}"></div>
      <div class="fgroup"><label>No HP</label><input id="aeHp" value="${esc(u.NoHP || '')}"></div></div>
      <div class="fgroup"><label>Username</label><input value="@${esc(u.Username)}" readonly style="background:var(--grey)"></div>
      <div class="btnrow"><button class="btn btn-primary" id="aeSave">💾 Simpan</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
    $('#aeSave').onclick = async () => {
      try {
        await Store.userUpdate(u.ID, { nama: $('#aeNama').value, nip: $('#aeNip').value, nohp: $('#aeHp').value });
        closeModal(); toast('Akun diperbarui.', 'ok'); go('akunguru');
      } catch (e) { toast(e.message, 'err'); }
    };
  };

  $('#agq').oninput = e => render(e.target.value);
  $('#agAdd').onclick = () => formAkunGuru();
  render('');
}

/** Form pendaftaran akun guru oleh Kepala Madrasah. */
async function formAkunGuru(prefill) {
  const isKepala = role() === 'Kepala Madrasah';
  let mads = [], akunAda = [];
  try {
    mads = await Store.list('madrasah', '');
    akunAda = await Store.usersList();
  } catch (_) {}
  const p = prefill || {};
  // sudah punya akun? (nama sama)
  const existing = p.Nama ? akunAda.find(u => String(u.Nama || '').trim().toLowerCase() === String(p.Nama).trim().toLowerCase()
    && (!isKepala || String(u.Madrasah || '').toLowerCase() === String(me().Madrasah || '').toLowerCase())) : null;
  if (existing) {
    openModal(`<h3>ℹ️ Guru Sudah Punya Akun</h3>
      <div class="chartbox" style="margin-bottom:12px">
        <b>${esc(existing.Nama)}</b> sudah memiliki akun login:<br>
        Username: <b>@${esc(existing.Username)}</b> • Status: <b>${esc(existing.Status)}</b><br>
        Madrasah: ${esc(existing.Madrasah || '-')}
      </div>
      <div class="hint">Jika guru lupa password, gunakan tombol Reset Password di menu <b>Akun Guru</b>. Untuk mengubah nama/NIP gunakan tombol ✏️.</div>
      <div class="btnrow"><button class="btn btn-primary" onclick="closeModal();go('akunguru')">Ke Akun Guru</button>
      <button class="btn btn-grey" onclick="closeModal()">Tutup</button></div>`, true);
    return;
  }
  openModal(`<h3>➕ Daftarkan Akun Guru</h3>
    <div class="hint" style="margin-bottom:12px">Akun yang didaftarkan Kepala Madrasah langsung <b>AKTIF</b> dan dapat dipakai login.</div>
    <div class="fgroup"><label>Nama Lengkap (sertakan gelar) <span class="req">*</span></label><input id="agNama" value="${esc(p.Nama || '')}" placeholder="cth: Budi Santoso, S.Pd"></div>
    <div class="frow">
      <div class="fgroup"><label>Username <span class="req">*</span></label><input id="agUser" value="${esc(p.username || '')}" placeholder="cth: budi.santoso"></div>
      <div class="fgroup"><label>Password <span class="req">*</span></label>
        <div style="display:flex;gap:8px"><input id="agPass" type="text" value="123456" style="flex:1"><button class="btn btn-sm btn-grey" id="agGen">🎲</button></div></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>NIP</label><input id="agNip" value="${esc(p.NIP || '')}"></div>
      <div class="fgroup"><label>No HP</label><input id="agHp" value="${esc(p.NoHP || '')}"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Mata Pelajaran</label><input id="agMapel" value="${esc(p.Mapel || '')}" placeholder="cth: Matematika"></div>
      <div class="fgroup"><label>Madrasah</label>
        ${isKepala
          ? `<input value="${esc(me().Madrasah || '-')}" readonly style="background:var(--grey)">`
          : `<select id="agMad">${mads.map(m => `<option ${p.Madrasah === m.Nama ? 'selected' : ''}>${esc(m.Nama)}</option>`).join('')}</select>`}
      </div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:.82rem;margin:8px 0 14px">
      <input type="checkbox" id="agWithGuru" checked style="width:18px;height:18px"> Tambahkan / perbarui juga di <b>Data Guru</b>
    </label>
    <div class="btnrow"><button class="btn btn-green" id="agSave">💾 Buat Akun</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);

  const autoUser = () => {
    const u = $('#agUser');
    if (u.value.trim()) return;
    let base = slugUsername($('#agNama').value), cand = base, n = 1;
    while (akunAda.some(x => String(x.Username || '').toLowerCase() === cand)) { n++; cand = base + n; }
    u.value = cand;
  };
  if (!$('#agUser').value.trim()) autoUser();          // terisi otomatis saat dibuka dari Data Guru
  $('#agNama').onblur = autoUser;
  $('#agGen').onclick = () => { $('#agPass').value = 'guru' + Math.floor(1000 + Math.random() * 9000); };

  $('#agSave').onclick = async () => {
    const data = {
      nama: $('#agNama').value.trim(),
      username: $('#agUser').value.trim(),
      password: $('#agPass').value,
      nip: $('#agNip').value.trim(),
      nohp: $('#agHp').value.trim(),
      role: 'Guru',
      status: 'Aktif',
      madrasah: isKepala ? (me().Madrasah || '') : ($('#agMad') ? $('#agMad').value : ''),
    };
    if (!data.nama || !data.username || !data.password) return toast('Nama, username, dan password wajib diisi.', 'err');
    loading(true, 'MEMBUAT AKUN…');
    try {
      const res = await Store.createUser(data);
      if ($('#agWithGuru') && $('#agWithGuru').checked) {
        const gurus = await Store.list('guru', '');
        const ada = gurus.find(g => String(g.Nama || '').trim().toLowerCase() === data.nama.toLowerCase());
        if (!ada) {
          await Store.save('guru', {
            Nama: data.nama, NIP: data.nip, Madrasah: data.madrasah,
            Mapel: $('#agMapel').value.trim(), Jenjang: '',
          });
        }
      }
      closeModal();
      toast(res && res.message ? res.message : 'Akun guru dibuat.', 'ok');
      go('akunguru');
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
}

/** Form buat akun oleh Admin (bebas role & madrasah). */
async function akunBaruAdmin() {
  let mads = [];
  try { mads = await Store.list('madrasah', ''); } catch (_) {}
  openModal(`<h3>➕ Buat Akun Pengguna</h3>
    <div class="fgroup"><label>Nama Lengkap <span class="req">*</span></label><input id="abNama"></div>
    <div class="frow">
      <div class="fgroup"><label>Username <span class="req">*</span></label><input id="abUser"></div>
      <div class="fgroup"><label>Password <span class="req">*</span></label><input id="abPass" type="text" value="123456"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Role</label><select id="abRole">${ROLES.map(r => `<option ${r === 'Guru' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="fgroup"><label>Status</label><select id="abStatus"><option>Aktif</option><option>Pending</option><option>Nonaktif</option></select></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Madrasah</label><select id="abMad"><option value="">-</option>${mads.map(m => `<option>${esc(m.Nama)}</option>`).join('')}</select></div>
      <div class="fgroup"><label>NIP</label><input id="abNip"></div>
    </div>
    <div class="btnrow"><button class="btn btn-green" id="abSave">💾 Buat Akun</button><button class="btn btn-grey" onclick="closeModal()">Batal</button></div>`);
  $('#abNama').onblur = () => { if (!$('#abUser').value.trim()) $('#abUser').value = slugUsername($('#abNama').value); };
  $('#abSave').onclick = async () => {
    loading(true, 'MEMBUAT AKUN…');
    try {
      const r = await Store.createUser({
        nama: $('#abNama').value.trim(), username: $('#abUser').value.trim(), password: $('#abPass').value,
        role: $('#abRole').value, status: $('#abStatus').value,
        madrasah: $('#abMad').value, nip: $('#abNip').value.trim(),
      });
      closeModal(); toast(r.message || 'Akun dibuat.', 'ok'); go('users');
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
}

/** "Budi Santoso, S.Pd" -> "budi.santoso" */
function slugUsername(nama) {
  const bersih = String(nama || '')
    .replace(/,\s*(S\.?Pd.*|M\.?Pd.*|S\.?Ag.*|M\.?Ag.*|S\.?Si.*|S\.?Kom.*|M\.?Si.*)$/i, '')
    .replace(/[^a-zA-Z0-9\s.]/g, ' ')
    .trim().toLowerCase();
  const parts = bersih.split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const u = parts[0] + (parts[1] ? '.' + parts[1] : '');
  return u.slice(0, 30);
}

/* =====================================================================
   PANDUAN
   ===================================================================== */
function pPanduan(el) {
  el.innerHTML = `
  <div class="card"><h3>📖 Panduan Penggunaan</h3>
    <div class="tahap">1️⃣ ALUR AKSES & ROLE</div>
    <div class="twrap"><table class="data"><tr><th>Role</th><th>Cara Dapat Akses</th><th>Hak Akses</th></tr>
      <tr><td><b>Admin</b></td><td>Akun dibuat otomatis saat <b>setup</b> database (kredensial dipegang pengelola)</td><td>Semua menu + kelola pengguna + backup</td></tr>
      <tr><td><b>Kepala Madrasah</b></td><td>Daftar → disetujui Admin</td><td><b>Pelaksana supervisi</b> di madrasahnya: isi supervisi, data guru, kokurikuler, ekstrakurikuler, iklim, dan <b>mendaftarkan akun guru</b> (langsung aktif)</td></tr>
      <tr><td><b>Pengawas Madrasah</b></td><td>Daftar → disetujui Admin</td><td>Master data + <b>verifikasi / "mengetahui" supervisi</b>, pembinaan, rekap &amp; laporan</td></tr>
      <tr><td><b>Guru</b></td><td>Daftar → disetujui Admin</td><td>Melihat hasil supervisi dirinya sendiri</td></tr>
    </table></div>
    <div class="tahap">1️⃣b AKUN GURU (DIDAFTARKAN KEPALA MADRASAH)</div>
    <div class="chartbox" style="background:var(--yellow)">
      <b>Kepala Madrasah</b> membuka menu <b>🔐 Akun Guru</b> → <b>➕ Daftarkan Akun Guru</b> → isi nama, username, password, NIP, mapel →
      akun <b>langsung AKTIF</b> tanpa menunggu Admin → berikan username &amp; password kepada guru.
      <br><br>Bisa juga dari <b>Data Guru</b>: klik tombol <b>🔐</b> pada baris guru untuk membuatkan akunnya (otomatis terisi).
    </div>
    <div class="tahap">2️⃣ ALUR SUPERVISI</div>
    <div class="chartbox" style="background:var(--mint);margin-bottom:12px">
      <b>Alur:</b> Kepala Madrasah melaksanakan supervisi → mengisi instrumen &amp; skor → <b>Pengawas Madrasah memverifikasi (mengetahui)</b> → laporan dicetak dengan tanda tangan keduanya.
    </div>
    <ol style="font-weight:600;line-height:2;padding-left:20px">
      <li>Admin/Pengawas melengkapi <b>Data Pengawas, Madrasah, Guru</b> (isi nama Kepala Madrasah di Data Madrasah agar otomatis terisi).</li>
      <li><b>Kepala Madrasah</b> membuka <b>+ Supervisi Baru</b>, pilih guru, isi info umum → beri skor 1–4 tiap butir.</li>
      <li>Nilai, predikat, catatan &amp; RTL terisi <b>otomatis</b> (bisa diedit). Status verifikasi awal: <b>⏳ Menunggu</b>.</li>
      <li><b>Pengawas Madrasah</b> membuka <b>Verifikasi Pengawas</b> → periksa → <b>✅ Tandai Diketahui</b> (nama pengawas, tanggal, catatan tersimpan).</li>
      <li>Lihat <b>Rekap &amp; Grafik</b>, lalu <b>Cetak Laporan</b> — tanda tangan: kiri <i>Mengetahui, Pengawas Madrasah</i>; kanan <i>Kepala Madrasah</i>.</li>
    </ol>
    <div class="tahap">3️⃣ SKOR & PREDIKAT</div>
    <div class="twrap"><table class="data"><tr><th>Nilai</th><th>Predikat</th><th>Skor Butir</th></tr>
      <tr><td>91–100</td><td>Amat Baik</td><td rowspan="6" style="vertical-align:middle">1=Kurang • 2=Cukup • 3=Baik • 4=Sangat Baik<br><br>Nilai = total ÷ (butir×4) × 100</td></tr>
      <tr><td>81–90</td><td>Sangat Baik</td></tr><tr><td>71–80</td><td>Baik</td></tr>
      <tr><td>61–70</td><td>Sedang</td></tr><tr><td>51–60</td><td>Cukup</td></tr><tr><td>&lt;51</td><td>Kurang</td></tr>
    </table></div>
    <div class="tahap">3️⃣b KEAMANAN KONEKSI</div>
    <div class="chartbox" style="background:var(--mint)">
      Setelah aplikasi <b>terhubung ke Spreadsheet</b> (mode Apps Script + URL tersimpan), menu <b>🔌 Koneksi &amp; Backup</b> dan panel <b>Sumber Data</b> di layar login
      <b>otomatis disembunyikan</b> supaya pengguna lain tidak bisa mengubah database, menginisialisasi ulang, atau me-restore data.
      <br><br>Butuh mengganti database? Klik <b>⚙️ Ubah Koneksi (Admin)</b> di layar login lalu masukkan <b>username &amp; password Admin</b>, atau buka aplikasi dengan <b>?setup=1</b>.
      Backup data tetap tersedia untuk Admin di <b>Profil Saya → 💾 Unduh Backup JSON</b>.
    </div>
    <div class="tahap">4️⃣ DEPLOY SPREADSHEET (APPS SCRIPT)</div>
    <ol style="font-weight:600;line-height:2;padding-left:20px">
      <li>Buat Spreadsheet baru → <b>Ekstensi → Apps Script</b>.</li>
      <li>Paste seluruh isi <b>Code.gs</b> → Save (💾).</li>
      <li>Pilih fungsi <b>setup</b> → <b>Run</b> → izinkan akses (8 sheet + admin otomatis dibuat).</li>
      <li><b>Deploy → New deployment → Web app</b>: Execute as <b>Me</b>, Who has access <b>Anyone</b> → Deploy → salin URL <b>…/exec</b>.</li>
      <li>Di aplikasi: layar Login → pilih <b>Apps Script</b> → tempel URL → Login admin.</li>
      <li>Frontend (folder <b>frontend/</b>) bisa di-host gratis: GitHub Pages / Netlify / Vercel, atau buka langsung <b>index.html</b>.</li>
    </ol>
  </div>`;
}

/* =====================================================================
   INIT
   ===================================================================== */
window.go = go;
window.closeModal = closeModal;
window.startSupervisiForm = startSupervisiForm;
window.editSupervisiById = editSupervisiById;
window.printSupervisi = printSupervisi;

document.addEventListener('DOMContentLoaded', () => {
  Store.loadSession();
  // Mode darurat: buka panel koneksi lewat URL ?setup=1 (mis. URL Web App berubah)
  if (/[?&]setup=1\b/.test(location.search) || location.hash === '#setup') S.connUnlocked = true;
  $('#btnLogin').onclick = doLogin;
  $('#liPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#liUser').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#btnShowRegister').onclick = () => { $('#loginPane').classList.add('hidden'); $('#registerPane').classList.remove('hidden'); };
  $('#btnBackLogin').onclick = () => { $('#registerPane').classList.add('hidden'); $('#loginPane').classList.remove('hidden'); };
  $('#btnRegister').onclick = doRegister;
  $('#btnBurger').onclick = () => $('#sidebar').classList.toggle('open');
  $('#btnUnlockConn').onclick = unlockConnModal;

  $('#btnTestConn').onclick = async () => {
    const url = $('#apiUrlInput').value.trim();
    if (!url) return toast('Tempel URL Web App dulu.', 'err');
    loading(true, 'TES KONEKSI…');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) });
      const j = JSON.parse(await res.text());
      toast(j.status === 'ok' ? '✅ Koneksi OK! ' + j.data.time : '❌ ' + j.message, j.status === 'ok' ? 'ok' : 'err');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
    finally { loading(false); }
  };
  $('#btnInitDB').onclick = async () => {
    const url = $('#apiUrlInput').value.trim();
    if (!url) return toast('Tempel URL Web App dulu.', 'err');
    loading(true, 'INIT DATABASE…');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'setup' }) });
      const j = JSON.parse(await res.text());
      toast(j.status === 'ok' ? '✅ ' + j.data.message : '❌ ' + j.message, j.status === 'ok' ? 'ok' : 'err');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
    finally { loading(false); }
  };

  if (Store.session) showApp();
  else showAuth();
});
