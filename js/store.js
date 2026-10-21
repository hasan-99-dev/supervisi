/* =====================================================================
   STORE — Lapisan data ganda:
   1) Mode DEMO  : localStorage (langsung bisa dicoba / preview)
   2) Mode API   : Google Apps Script + Spreadsheet (produksi)
   ===================================================================== */
'use strict';

const Store = {
  mode: localStorage.getItem(LS_KEYS.mode) || 'demo',
  apiUrl: localStorage.getItem(LS_KEYS.apiUrl) || '',
  session: null,

  /* ---------- session ---------- */
  loadSession() {
    try { this.session = JSON.parse(localStorage.getItem(LS_KEYS.session)) || null; }
    catch (_) { this.session = null; }
    return this.session;
  },
  saveSession(s) {
    this.session = s;
    if (s) localStorage.setItem(LS_KEYS.session, JSON.stringify(s));
    else localStorage.removeItem(LS_KEYS.session);
  },

  /** Sudah terhubung ke database Apps Script? (URL tersimpan & mode API) */
  isConnected() {
    return this.mode === 'api' && !!String(this.apiUrl || '').trim();
  },

  setMode(mode, url) {
    this.mode = mode;
    if (url !== undefined) { this.apiUrl = url; localStorage.setItem(LS_KEYS.apiUrl, url); }
    localStorage.setItem(LS_KEYS.mode, mode);
  },

  /* ---------- API call ---------- */
  async call(action, payload) {
    payload = payload || {};
    if (this.session) { payload._username = this.session.Username; payload._token = this.session.Token; }
    payload.action = action;
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch (_) { throw new Error('Respons server tidak valid. Pastikan URL Web App benar & akses "Anyone".'); }
    if (json.status !== 'ok') throw new Error(json.message || 'Terjadi kesalahan server.');
    return json.data;
  },

  /* ================================================================
     DEMO DB (localStorage)
     ================================================================ */
  _db: null,
  db() {
    if (this._db) return this._db;
    try { this._db = JSON.parse(localStorage.getItem(LS_KEYS.db)) || null; } catch (_) { this._db = null; }
    if (!this._db) { this._db = seedDemoDB(); this.persist(); }
    return this._db;
  },
  persist() { localStorage.setItem(LS_KEYS.db, JSON.stringify(this._db)); },
  resetDemo() { this._db = seedDemoDB(); this.persist(); },

  scopeFilter(entity, list) {
    const me = this.session;
    if (!me) return [];
    const role = me.Role;
    if (role === 'Admin' || role === 'Pengawas Madrasah') return list;
    if (role === 'Kepala Madrasah') {
      if (entity === 'pengawas') return list; // data pengawas tidak terikat 1 madrasah
      const mk = String(me.Madrasah || '').trim().toLowerCase();
      if (!mk || mk === '-') return list;
      // sheet Madrasah memakai kolom "Nama", bukan "Madrasah"
      if (entity === 'madrasah') return list.filter(r => String(r.Nama || '').trim().toLowerCase() === mk);
      return list.filter(r => String(r.Madrasah || '').trim().toLowerCase() === mk);
    }
    if (role === 'Guru') {
      if (entity === 'supervisi') {
        const nm = String(me.Nama || '').trim().toLowerCase();
        return list.filter(r => String(r.Guru || '').trim().toLowerCase() === nm);
      }
      if (entity === 'pengawas') return list; // guru boleh melihat daftar pengawas
      const mk = String(me.Madrasah || '').trim().toLowerCase();
      if (!mk || mk === '-') return [];
      if (entity === 'madrasah') return list.filter(r => String(r.Nama || '').trim().toLowerCase() === mk);
      if (entity === 'guru') {
        const nm = String(me.Nama || '').trim().toLowerCase();
        return list.filter(r => String(r.Nama || '').trim().toLowerCase() === nm);
      }
      return list.filter(r => String(r.Madrasah || '').trim().toLowerCase() === mk);
    }
    return list;
  },
  /**
   * ATURAN BARU: supervisi DILAKUKAN Kepala Madrasah, DIKETAHUI Pengawas Madrasah.
   * Admin: semua. Kepala: supervisi + guru + kokurikuler/ekstra/iklim.
   * Pengawas: master & modul pembinaan; supervisi hanya verifikasi (lihat verifySupervisi).
   */
  canWrite(entity) {
    const me = this.session;
    if (!me) return false;
    if (me.Role === 'Admin') return true;
    if (me.Role === 'Pengawas Madrasah') return entity !== 'supervisi';
    if (me.Role === 'Kepala Madrasah') return ['supervisi', 'iklim', 'guru', 'kokurikuler', 'ekstrakurikuler'].includes(entity);
    return false;
  },

  /** Boleh memverifikasi ("mengetahui") supervisi? */
  canVerify() {
    const me = this.session;
    return !!me && (me.Role === 'Admin' || me.Role === 'Pengawas Madrasah');
  },

  /** Pengawas/Admin menandai supervisi "Diketahui" atau mengembalikan ke "Menunggu". */
  async verifySupervisi(id, payload) {
    if (!this.canVerify()) throw new Error('Hanya Pengawas Madrasah yang dapat memverifikasi supervisi.');
    const data = payload || {};
    if (this.mode === 'api' && this.apiUrl) {
      return this.call('supervisi_verify', { id, status: data.status || 'Diketahui', catatan: data.catatan || '', pengawas: data.pengawas || '' });
    }
    const db = this.db();
    const row = (db.supervisi || []).find(x => x.ID === id);
    if (!row) throw new Error('Data supervisi tidak ditemukan.');
    const status = data.status === 'Menunggu' ? 'Menunggu' : 'Diketahui';
    row.PengawasStatus = status;
    row.PengawasTgl = status === 'Diketahui' ? new Date().toISOString().slice(0, 10) : '';
    row.CatatanPengawas = data.catatan === undefined ? (row.CatatanPengawas || '') : data.catatan;
    if (String(data.pengawas || '').trim()) row.Pengawas = String(data.pengawas).trim();
    else if (this.session.Role === 'Pengawas Madrasah' && !String(row.Pengawas || '').trim()) row.Pengawas = this.session.Nama;
    row.Diupdate = new Date().toISOString();
    this.persist();
    return { message: status === 'Diketahui' ? 'Supervisi ditandai DIKETAHUI oleh Pengawas Madrasah.' : 'Status verifikasi dikembalikan ke Menunggu.', row: row };
  },

  /* ================================================================
     AUTH
     ================================================================ */
  async login(username, password) {
    username = String(username || '').trim();
    if (this.mode === 'api' && this.apiUrl) {
      const d = await this.call('login', { username, password });
      this.saveSession(d.user);
      return d.user;
    }
    // demo
    const db = this.db();
    const u = db.users.find(x => x.Username.toLowerCase() === username.toLowerCase());
    if (!u || u.PasswordHash !== demoHash(password)) throw new Error('Username atau password salah.');
    if (u.Status === 'Pending') throw new Error('Akun Anda masih MENUNGGU persetujuan Admin.');
    if (u.Status !== 'Aktif') throw new Error('Akun Anda dinonaktifkan. Hubungi admin.');
    u.Token = 'demo-' + Date.now();
    this.persist();
    const { PasswordHash, ...pub } = u;
    this.saveSession(pub);
    return pub;
  },

  async register(form) {
    if (this.mode === 'api' && this.apiUrl) {
      return this.call('register', form);
    }
    const db = this.db();
    const { nama, username, password, role, madrasah, nip, nohp } = form;
    if (!nama || !username || !password || !role) throw new Error('Nama, username, password, dan role wajib diisi.');
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) throw new Error('Username 3–30 karakter (huruf/angka/titik/underscore).');
    if (String(password).length < 4) throw new Error('Password minimal 4 karakter.');
    if (!['Pengawas Madrasah', 'Kepala Madrasah', 'Guru'].includes(role)) throw new Error('Role tidak valid.');
    if (db.users.some(x => x.Username.toLowerCase() === username.toLowerCase())) throw new Error('Username sudah dipakai.');
    db.users.push({
      ID: uid('USR'), Username: username, PasswordHash: demoHash(password),
      Nama: nama, Role: role, Madrasah: madrasah || '', NIP: nip || '', NoHP: nohp || '',
      Status: 'Pending', Token: '', Dibuat: new Date().toISOString(),
    });
    this.persist();
    return { message: 'Pendaftaran berhasil. Tunggu persetujuan Admin sebelum bisa login.' };
  },

  async logout() {
    if (this.mode === 'api' && this.apiUrl && this.session) {
      try { await this.call('logout', {}); } catch (_) {}
    }
    this.saveSession(null);
  },

  async changePassword(oldP, newP) {
    if (String(newP).length < 4) throw new Error('Password baru minimal 4 karakter.');
    if (this.mode === 'api' && this.apiUrl) {
      return this.call('change_password', { old_password: oldP, new_password: newP });
    }
    const db = this.db();
    const u = db.users.find(x => x.ID === this.session.ID);
    if (!u || u.PasswordHash !== demoHash(oldP)) throw new Error('Password lama salah.');
    u.PasswordHash = demoHash(newP);
    this.persist();
    return { message: 'Password berhasil diubah.' };
  },

  async profileUpdate(f) {
    if (this.mode === 'api' && this.apiUrl) {
      const r = await this.call('profile_update', f);
      Object.assign(this.session, f);
      this.saveSession(this.session);
      return r;
    }
    const db = this.db();
    const u = db.users.find(x => x.ID === this.session.ID);
    Object.assign(u, { Nama: f.nama, Madrasah: f.madrasah, NIP: f.nip, NoHP: f.nohp });
    Object.assign(this.session, { Nama: f.nama, Madrasah: f.madrasah, NIP: f.nip, NoHP: f.nohp });
    this.persist(); this.saveSession(this.session);
    return { message: 'Profil berhasil diperbarui.' };
  },

  /* ================================================================
     USERS (admin)
     ================================================================ */
  /** Admin melihat semua akun; Kepala Madrasah hanya akun GURU di madrasahnya. */
  async usersList() {
    if (this.mode === 'api' && this.apiUrl) return (await this.call('users_list', {})).users;
    const me = this.session || {};
    const pub = u => { const { PasswordHash, ...p } = u; return p; };
    if (me.Role === 'Kepala Madrasah') {
      const mk = String(me.Madrasah || '').trim().toLowerCase();
      return this.db().users
        .filter(u => u.Role === 'Guru' && mk && String(u.Madrasah || '').trim().toLowerCase() === mk)
        .map(pub).reverse();
    }
    if (me.Role !== 'Admin') return [];
    return this.db().users.map(pub);
  },

  /** Cek apakah akun tertentu boleh dikelola (Admin: semua; Kepala: guru madrasahnya). */
  canManageUser(u) {
    const me = this.session;
    if (!me || !u) return false;
    if (me.Role === 'Admin') return true;
    if (me.Role === 'Kepala Madrasah') {
      const mk = String(me.Madrasah || '').trim().toLowerCase();
      return String(u.Role) === 'Guru' && !!mk && mk === String(u.Madrasah || '').trim().toLowerCase();
    }
    return false;
  },

  /**
   * Buat akun baru.
   *  - Admin  : bebas role & status
   *  - Kepala : otomatis role "Guru", madrasah = madrasahnya, status LANGSUNG AKTIF
   */
  async createUser(form) {
    const me = this.session || {};
    const f = Object.assign({}, form || {});
    if (me.Role === 'Kepala Madrasah') {
      f.role = 'Guru';
      f.madrasah = me.Madrasah || '';
      f.status = 'Aktif';
    }
    if (me.Role !== 'Admin' && me.Role !== 'Kepala Madrasah') throw new Error('Hanya Admin atau Kepala Madrasah yang dapat membuat akun.');
    if (!f.nama || !f.username || !f.password) throw new Error('Nama, username, dan password wajib diisi.');
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(f.username)) throw new Error('Username 3–30 karakter (huruf/angka/titik/underscore).');
    if (String(f.password).length < 4) throw new Error('Password minimal 4 karakter.');
    if (this.mode === 'api' && this.apiUrl) return this.call('user_create', f);

    const db = this.db();
    if (db.users.some(x => x.Username.toLowerCase() === String(f.username).toLowerCase())) throw new Error('Username sudah dipakai. Pilih username lain.');
    const u = {
      ID: uid('USR'), Username: f.username, PasswordHash: demoHash(f.password),
      Nama: f.nama, Role: f.role || 'Guru', Madrasah: f.madrasah || '', NIP: f.nip || '', NoHP: f.nohp || '',
      Status: f.status || 'Aktif', Token: '', Dibuat: new Date().toISOString(),
    };
    db.users.push(u);
    this.persist();
    const { PasswordHash, ...pub } = u;
    return {
      message: me.Role === 'Kepala Madrasah'
        ? 'Akun guru dibuat dan langsung AKTIF. Berikan username & password kepada guru.'
        : 'Akun dibuat dan langsung aktif.',
      user: pub,
    };
  },
  async userSetStatus(id, status) {
    if (this.mode === 'api' && this.apiUrl) return this.call('user_set_status', { id, status });
    const u = this.db().users.find(x => x.ID === id);
    if (!u) throw new Error('User tidak ditemukan.');
    if (!this.canManageUser(u)) throw new Error('Akses ditolak. Anda hanya dapat mengelola akun guru di madrasah Anda.');
    if (u.Username === 'admin' && status !== 'Aktif') throw new Error('Akun admin utama tidak boleh dinonaktifkan.');
    u.Status = status;
    if (status !== 'Aktif') u.Token = '';
    this.persist();
    return { message: 'Status user diperbarui.' };
  },
  async userUpdate(id, f) {
    if (this.mode === 'api' && this.apiUrl) return this.call('user_update', Object.assign({ id }, f));
    const u = this.db().users.find(x => x.ID === id);
    if (!u) throw new Error('User tidak ditemukan.');
    if (!this.canManageUser(u)) throw new Error('Akses ditolak. Anda hanya dapat mengelola akun guru di madrasah Anda.');
    if (u.Username === 'admin' && f.role && f.role !== 'Admin') throw new Error('Role admin utama tidak boleh diubah.');
    if (this.session.Role === 'Kepala Madrasah') {
      if (f.role && f.role !== 'Guru') throw new Error('Kepala Madrasah hanya dapat mengelola akun guru.');
      delete f.madrasah;
    }
    Object.assign(u, { Nama: f.nama || u.Nama, Role: f.role || u.Role, Madrasah: f.madrasah === undefined ? u.Madrasah : f.madrasah, NIP: f.nip === undefined ? u.NIP : f.nip, NoHP: f.nohp === undefined ? u.NoHP : f.nohp });
    this.persist();
    return { message: 'Data user diperbarui.' };
  },
  async userDelete(id) {
    if (this.mode === 'api' && this.apiUrl) return this.call('user_delete', { id });
    const db = this.db();
    const i = db.users.findIndex(x => x.ID === id);
    if (i < 0) throw new Error('User tidak ditemukan.');
    if (!this.canManageUser(db.users[i])) throw new Error('Akses ditolak. Anda hanya dapat mengelola akun guru di madrasah Anda.');
    if (db.users[i].Username === 'admin') throw new Error('Akun admin utama tidak boleh dihapus.');
    if (db.users[i].ID === this.session.ID) throw new Error('Tidak bisa menghapus akun sendiri.');
    db.users.splice(i, 1);
    this.persist();
    return { message: 'User dihapus.' };
  },
  async userResetPassword(id, np) {
    if (String(np).length < 4) throw new Error('Password baru minimal 4 karakter.');
    if (this.mode === 'api' && this.apiUrl) return this.call('user_reset_password', { id, new_password: np });
    const u = this.db().users.find(x => x.ID === id);
    if (!u) throw new Error('User tidak ditemukan.');
    if (!this.canManageUser(u)) throw new Error('Akses ditolak. Anda hanya dapat mengelola akun guru di madrasah Anda.');
    u.PasswordHash = demoHash(np);
    u.Token = '';
    this.persist();
    return { message: 'Password user direset.' };
  },

  /* ================================================================
     GENERIC DATA
     ================================================================ */
  async list(entity, q) {
    if (this.mode === 'api' && this.apiUrl) {
      return (await this.call('data_list', { entity, q: q || '' })).rows;
    }
    let list = (this.db()[entity] || []).slice().reverse();
    if (q) {
      const s = String(q).toLowerCase();
      list = list.filter(r => Object.keys(r).some(k => String(r[k] || '').toLowerCase().includes(s)));
    }
    return this.scopeFilter(entity, list);
  },

  async save(entity, row) {
    if (!this.canWrite(entity)) throw new Error('Akses ditolak untuk role ' + (this.session ? this.session.Role : '-'));
    if (this.mode === 'api' && this.apiUrl) return (await this.call('data_save', { entity, row })).row;
    const db = this.db();
    if (this.session.Role === 'Kepala Madrasah') {
      const mk = String(this.session.Madrasah || '').trim();
      if (entity === 'guru') row.Madrasah = this.session.Madrasah;
      if (mk && mk !== '-' && entity !== 'guru') row.Madrasah = mk;
      if (entity === 'supervisi') {
        if (!String(row.Kepala || '').trim()) row.Kepala = this.session.Nama;
        if (!String(row.PengawasStatus || '').trim()) row.PengawasStatus = 'Menunggu';
      }
    }
    if (entity === 'supervisi') {
      if (row.PengawasStatus !== 'Diketahui' && row.PengawasStatus !== 'Menunggu') row.PengawasStatus = 'Menunggu';
      if (row.PengawasStatus === 'Menunggu') row.PengawasTgl = '';
    }
    if (!row.ID) {
      row.ID = uid('ID');
      row.Dibuat = new Date().toISOString();
      db[entity].push(row);
    } else {
      const i = db[entity].findIndex(x => x.ID === row.ID);
      if (i < 0) db[entity].push(row);
      else db[entity][i] = Object.assign({}, db[entity][i], row);
      db[entity][i].Diupdate = new Date().toISOString();
    }
    this.persist();
    return row;
  },

  async remove(entity, id) {
    if (!this.canWrite(entity)) throw new Error('Akses ditolak untuk role ' + (this.session ? this.session.Role : '-'));
    if (this.mode === 'api' && this.apiUrl) return this.call('data_delete', { entity, id });
    const db = this.db();
    const i = (db[entity] || []).findIndex(x => x.ID === id);
    if (i < 0) throw new Error('Data tidak ditemukan.');
    db[entity].splice(i, 1);
    this.persist();
    return { message: 'Data dihapus.' };
  },

  async stats() {
    if (this.mode === 'api' && this.apiUrl) return this.call('stats', {});
    const db = this.db();
    const sup = this.scopeFilter('supervisi', db.supervisi || []);
    const dist = {};
    let sum = 0, cnt = 0;
    sup.forEach(r => {
      const p = r.Predikat || '-';
      dist[p] = (dist[p] || 0) + 1;
      const n = parseFloat(r.Nilai);
      if (!isNaN(n)) { sum += n; cnt++; }
    });
    return {
      totalSupervisi: sup.length,
      totalMadrasah: this.scopeFilter('madrasah', db.madrasah || []).length,
      totalGuru: this.scopeFilter('guru', db.guru || []).length,
      totalKokurikuler: this.scopeFilter('kokurikuler', db.kokurikuler || []).length,
      totalEkstra: this.scopeFilter('ekstrakurikuler', db.ekstrakurikuler || []).length,
      totalIklim: this.scopeFilter('iklim', db.iklim || []).length,
      rataNilai: cnt ? Math.round((sum / cnt) * 10) / 10 : 0,
      distribusiPredikat: dist,
      pendingUsers: db.users.filter(u => u.Status === 'Pending').length,
      totalUsers: db.users.length,
      menungguVerifikasi: sup.filter(r => (r.PengawasStatus || 'Menunggu') !== 'Diketahui').length,
      sudahVerifikasi: sup.filter(r => r.PengawasStatus === 'Diketahui').length,
    };
  },
};

/* ---------- demo password hash (SHA-256 sync fallback sederhana) ---------- */
function demoHash(s) {
  // hash sederhana (bukan kriptografi kuat) khusus MODE DEMO lokal
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  const str = 'svnb::' + s;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ str.charCodeAt(i + 1 || 0), 2246822519);
  }
  return ('0000000' + (h1 >>> 0).toString(16)).slice(-8) + ('0000000' + (h2 >>> 0).toString(16)).slice(-8);
}

/* ---------- seed demo ---------- */
function seedDemoDB() {
  const now = new Date().toISOString();
  const db = {
    users: [
      { ID: 'USR-ADMIN', Username: 'admin', PasswordHash: demoHash('admin123'), Nama: 'Administrator', Role: 'Admin', Madrasah: '-', NIP: '-', NoHP: '-', Status: 'Aktif', Token: '', Dibuat: now },
      { ID: 'USR-PWS1', Username: 'pengawas1', PasswordHash: demoHash('pengawas123'), Nama: 'H. Ahmad Fauzi, M.Pd', Role: 'Pengawas Madrasah', Madrasah: '-', NIP: '197501012005011001', NoHP: '081234567890', Status: 'Aktif', Token: '', Dibuat: now },
      { ID: 'USR-KPL1', Username: 'kepala1', PasswordHash: demoHash('kepala123'), Nama: 'Dra. Siti Aminah', Role: 'Kepala Madrasah', Madrasah: 'MI Nurul Huda', NIP: '198002022006042001', NoHP: '081234567891', Status: 'Aktif', Token: '', Dibuat: now },
      { ID: 'USR-GRU1', Username: 'guru1', PasswordHash: demoHash('guru123'), Nama: 'Budi Santoso, S.Pd', Role: 'Guru', Madrasah: 'MI Nurul Huda', NIP: '198805052015031001', NoHP: '081234567892', Status: 'Aktif', Token: '', Dibuat: now },
      { ID: 'USR-GRU2', Username: 'guru2', PasswordHash: demoHash('guru123'), Nama: 'Dewi Lestari, S.Pd', Role: 'Guru', Madrasah: 'MTs Al Hikmah', NIP: '199001012018012001', NoHP: '081234567893', Status: 'Pending', Token: '', Dibuat: now },
    ],
    madrasah: [
      { ID: 'MD-001', NPSN: '60712345', Nama: 'MI Nurul Huda', Jenjang: 'MI', Alamat: 'Jl. Pendidikan No. 10, Surabaya', Kabupaten: 'Surabaya', Kepala: 'Dra. Siti Aminah', NIPKepala: '198002022006042001', Dibuat: now },
      { ID: 'MD-002', NPSN: '60712346', Nama: 'MTs Al Hikmah', Jenjang: 'MTs', Alamat: 'Jl. Raya Menganti No. 55, Gresik', Kabupaten: 'Gresik', Kepala: 'Drs. H. Mahmud', NIPKepala: '197803032006041002', Dibuat: now },
      { ID: 'MD-003', NPSN: '60712347', Nama: 'RA Perwanida', Jenjang: 'RA', Alamat: 'Jl. Taman Siswa No. 3, Sidoarjo', Kabupaten: 'Sidoarjo', Kepala: 'Hj. Fatimah, S.Pd', NIPKepala: '197905052008012003', Dibuat: now },
    ],
    guru: [
      { ID: 'GR-001', NIP: '198805052015031001', Nama: 'Budi Santoso, S.Pd', Madrasah: 'MI Nurul Huda', Mapel: 'Matematika', Jenjang: 'MI', Dibuat: now },
      { ID: 'GR-002', NIP: '198707072011012002', Nama: 'Rina Wulandari, S.Pd', Madrasah: 'MI Nurul Huda', Mapel: 'Tematik', Jenjang: 'MI', Dibuat: now },
      { ID: 'GR-003', NIP: '199001012018012001', Nama: 'Dewi Lestari, S.Pd', Madrasah: 'MTs Al Hikmah', Mapel: 'IPA', Jenjang: 'MTs', Dibuat: now },
      { ID: 'GR-004', NIP: '198512122009032004', Nama: 'Agus Prasetyo, S.Pd.I', Madrasah: 'MTs Al Hikmah', Mapel: 'Akidah Akhlak', Jenjang: 'MTs', Dibuat: now },
    ],
    pengawas: [
      { ID: 'PW-001', NIP: '197501012005011001', Nama: 'H. Ahmad Fauzi, M.Pd', Jabatan: 'Pengawas Madrasah Muda', Pangkat: 'Penata Tk. I / III-d', Kabupaten: 'Surabaya', TempatTugas: 'Pokjawas Surabaya', Instansi: 'Kankemenag Kota Surabaya', Dibuat: now },
    ],
    supervisi: [],
    kokurikuler: [],
    ekstrakurikuler: [],
    iklim: [],
  };
  // contoh 1 data supervisi agar dashboard hidup
  const skor = {};
  flatButir(INSTRUMEN_SUPERVISI).forEach(b => { skor[b.no] = (b.no % 4 === 0) ? 3 : 4; });
  const n = hitungNilai(skor, flatButir(INSTRUMEN_SUPERVISI).length);
  db.supervisi.push({
    ID: 'SV-001', Tanggal: todayISO(), Jenis: 'Pembelajaran',
    Kepala: 'Dra. Siti Aminah', Pengawas: 'H. Ahmad Fauzi, M.Pd',
    PengawasStatus: 'Diketahui', PengawasTgl: todayISO(), CatatanPengawas: 'Tindak lanjuti hasil supervisi melalui kegiatan MGMP madrasah.',
    Madrasah: 'MI Nurul Huda', Guru: 'Budi Santoso, S.Pd', NIPGuru: '198805052015031001',
    Mapel: 'Matematika', Kelas: 'V (Lima)', Materi: 'Pecahan Senilai', SkorJSON: JSON.stringify(skor),
    TotalSkor: n.total, SkorMaks: n.maks, Nilai: n.nilai, Predikat: n.predikat,
    Catatan: autoCatatan(skor, INSTRUMEN_SUPERVISI, 'supervisi pembelajaran'),
    RTL: autoRTL(skor, INSTRUMEN_SUPERVISI, 'supervisi pembelajaran'),
    Status: 'Selesai', Dibuat: now,
  });
  const skor2 = {};
  flatButir(INSTRUMEN_SUPERVISI).forEach(b => { skor2[b.no] = (b.no % 5 === 0) ? 2 : (b.no % 3 === 0 ? 3 : 4); });
  const n2 = hitungNilai(skor2, flatButir(INSTRUMEN_SUPERVISI).length);
  db.supervisi.push({
    ID: 'SV-002', Tanggal: todayISO(), Jenis: 'Pembelajaran',
    Kepala: 'Dra. Siti Aminah', Pengawas: 'H. Ahmad Fauzi, M.Pd',
    PengawasStatus: 'Menunggu', PengawasTgl: '', CatatanPengawas: '',
    Madrasah: 'MI Nurul Huda', Guru: 'Rina Wulandari, S.Pd', NIPGuru: '198707072011012002',
    Mapel: 'Tematik', Kelas: 'II (Dua)', Materi: 'Hidup Rukun', SkorJSON: JSON.stringify(skor2),
    TotalSkor: n2.total, SkorMaks: n2.maks, Nilai: n2.nilai, Predikat: n2.predikat,
    Catatan: autoCatatan(skor2, INSTRUMEN_SUPERVISI, 'supervisi pembelajaran'),
    RTL: autoRTL(skor2, INSTRUMEN_SUPERVISI, 'supervisi pembelajaran'),
    Status: 'Selesai', Dibuat: now,
  });
  return db;
}
