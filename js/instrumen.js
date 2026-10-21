/* =====================================================================
   KONSTANTA & INSTRUMEN SUPERVISI PM-KBC
   Skor: 1=Kurang  2=Cukup  3=Baik  4=Sangat Baik
   Nilai = (total / (jumlah_butir * 4)) * 100
   ===================================================================== */
'use strict';

const APP_NAME = 'SUPERVISI PM-KBC';
const APP_SUB = 'Pokjawas Madrasah • Neo-Brutalism Edition';
const LS_PREFIX = 'svnb_';
const LS_KEYS = {
  apiUrl: LS_PREFIX + 'api_url',
  mode: LS_PREFIX + 'mode',       // 'demo' | 'api'
  session: LS_PREFIX + 'session',
  db: LS_PREFIX + 'db_v2',   // v2: supervisi oleh Kepala Madrasah + verifikasi Pengawas
};

const ROLES = ['Admin', 'Pengawas Madrasah', 'Kepala Madrasah', 'Guru'];
const ROLE_SHORT = { 'Admin': 'ADMIN', 'Pengawas Madrasah': 'PENGAWAS', 'Kepala Madrasah': 'KEPALA', 'Guru': 'GURU' };
const JENJANG = ['RA', 'MI', 'MTs', 'MA'];
const SKOR_LABEL = { 1: 'Kurang', 2: 'Cukup', 3: 'Baik', 4: 'Sangat Baik' };

/* ---------------- Instrumen Supervisi Pembelajaran (PM-KBC) ---------------- */
const INSTRUMEN_SUPERVISI = [
  {
    kode: 'A', judul: 'A. PERENCANAAN PEMBELAJARAN', warna: '#FF90E8',
    butir: [
      'Guru mencantumkan Dimensi Profil Lulusan (DPL) yang relevan dengan materi.',
      'Guru mencantumkan nilai Panca Cinta yang relevan dengan materi pembelajaran.',
      'Guru menuliskan materi integrasi KBC yang relevan dan kontekstual.',
      'Guru merumuskan tujuan pembelajaran yang spesifik, terukur, dan berpusat pada murid.',
      'Guru merumuskan kerangka pembelajaran (praktik pedagogis, kemitraan, lingkungan, pemanfaatan digital).',
      'Guru menyusun langkah pembelajaran dengan Prinsip Berkesadaran, Bermakna, dan Menggembirakan.',
      'Guru merencanakan strategi inovatif, diferensiasi, media, dan teknologi tepat guna.',
      'Guru menyusun asesmen autentik beserta rubrik, serta rencana remedial/pengayaan dan refleksi.',
    ]
  },
  {
    kode: 'B1', judul: 'B1. PELAKSANAAN — Kegiatan Pembuka', warna: '#7DD3FC',
    butir: [
      'Guru membuka pembelajaran dengan salam, doa, apersepsi, dan refleksi yang menggugah.',
      'Guru memberikan pertanyaan pemantik serta menyampaikan tujuan dikaitkan nilai kehidupan.',
      'Guru membangun kesepakatan kelas dan menerapkan disiplin positif sejak awal.',
    ]
  },
  {
    kode: 'B2', judul: 'B2. PELAKSANAAN — Kegiatan Inti', warna: '#7DD3FC',
    butir: [
      'Guru menerapkan disiplin positif dan komunikasi yang mengedepankan koneksi sebelum koreksi.',
      'Murid terlibat aktif, percaya diri, dan berani mengekspresikan pendapat.',
      'Guru memberi ruang dialog, umpan balik, refleksi, dan berpikir kritis.',
      'Suasana belajar gembira, aman, dan kolaboratif (peer learning) terwujud.',
      'Guru melaksanakan diferensiasi dan personalisasi (visual, audio, kinestetik).',
      'Guru berkeliling dan memberi dukungan sesuai kebutuhan belajar murid.',
      'Guru dan murid melakukan refleksi belajar secara lisan maupun tertulis.',
      'Strategi inovatif, media efektif, dan teknologi tepat guna digunakan secara optimal.',
      'Materi dikaitkan dengan nilai Panca Cinta dan Dimensi Profil Lulusan.',
      'Asesmen proses dilaksanakan sesuai rubrik dan didokumentasikan.',
    ]
  },
  {
    kode: 'B3', judul: 'B3. PELAKSANAAN — Kegiatan Penutup', warna: '#7DD3FC',
    butir: [
      'Guru dan murid menyimpulkan pembelajaran serta melakukan refleksi bersama.',
      'Guru menutup dengan doa kontekstual dan penguatan komitmen aksi nyata.',
      'Guru memberikan afirmasi positif, apresiasi personal, dan informasi pembelajaran berikutnya.',
    ]
  },
  {
    kode: 'C', judul: 'C. PENILAIAN & TINDAK LANJUT', warna: '#86EFAC',
    butir: [
      'Instrumen asesmen autentik, sejalan tujuan, dan dilengkapi rubrik yang jelas.',
      'Asesmen berorientasi proses dan perkembangan (formatif) serta dianalisis hasilnya.',
      'Umpan balik konstruktif diberikan pada hasil karya dan perkembangan murid.',
      'Program remedial/pengayaan direncanakan dan dilaksanakan berdasarkan hasil analisis.',
      'Hasil belajar dikomunikasikan kepada murid dan orang tua/wali secara berkala.',
    ]
  },
];

/* ---------------- Instrumen RA ---------------- */
const INSTRUMEN_RA = [
  {
    kode: 'A', judul: 'A. PERENCANAAN (RA)', warna: '#FF90E8',
    butir: [
      'Perencanaan memuat nilai agama-moral, motorik, kognitif, bahasa, sosial-emosional, dan seni.',
      'Tujuan dan kegiatan bermain-belajar sesuai karakteristik anak usia dini.',
      'Media, alat permainan edukatif (APE), dan lingkungan belajar direncanakan aman-menyenangkan.',
      'Asesmen perkembangan anak (anekdot, observasi, hasil karya) direncanakan autentik.',
    ]
  },
  {
    kode: 'B', judul: 'B. PELAKSANAAN (RA)', warna: '#7DD3FC',
    butir: [
      'Pembiasaan pagi (salam, doa, baris, literasi) dilaksanakan hangat dan konsisten.',
      'Kegiatan pembuka memotivasi anak melalui bernyanyi, bercerita, dan apersepsi.',
      'Kegiatan inti berbasis sentra/sudut dengan bermain bermakna dan eksploratif.',
      'Guru mendampingi, memfasilitasi, dan memberi penguatan positif pada setiap anak.',
      'Kegiatan penutup: refleksi, pesan moral, doa, dan komunikasi dengan orang tua.',
    ]
  },
  {
    kode: 'C', judul: 'C. PENILAIAN (RA)', warna: '#86EFAC',
    butir: [
      'Penilaian dilakukan melalui observasi, anekdot, dan dokumentasi hasil karya.',
      'Laporan perkembangan anak disampaikan naratif dan komunikatif ke orang tua.',
      'Tindak lanjut stimulasi sesuai tahap perkembangan tiap anak direncanakan.',
    ]
  },
];

/* ---------------- Kokurikuler ---------------- */
const INSTRUMEN_KOKURIKULER = [
  {
    kode: 'K', judul: 'INSTRUMEN KOKURIKULER (P5RA / Proyek)', warna: '#C4B5FD',
    butir: [
      'Tujuan proyek sesuai tema dan dimensi Profil Pelajar Pancasila-Rahmatan lil Alamin.',
      'Perencanaan proyek (jadwal, peran, sumber daya) tersusun jelas dan realistis.',
      'Pelaksanaan melibatkan murid aktif, kolaboratif, dan bernalar kritis.',
      'Pembina mendampingi, memfasilitasi, dan memberi umpan balik selama proyek.',
      'Produk/aksi proyek bermanfaat dan dikomunikasikan (gelar karya/presentasi).',
      'Refleksi dan asesmen proyek autentik (rubrik, jurnal, portofolio).',
      'Nilai Panca Cinta terintegrasi dalam seluruh tahapan proyek.',
      'Tindak lanjut dan keberlanjutan proyek direncanakan bersama warga madrasah.',
    ]
  },
];

/* ---------------- Ekstrakurikuler ---------------- */
const INSTRUMEN_EKSTRA = [
  {
    kode: 'E', judul: 'INSTRUMEN EKSTRAKURIKULER', warna: '#FB923C',
    butir: [
      'Program kerja ekstrakurikuler tersusun (tujuan, jadwal, pelatih/pembina, sarana).',
      'Rekrutmen dan pembinaan anggota berjalan terbuka dan berkelanjutan.',
      'Latihan dilaksanakan rutin, disiplin, dan menyenangkan.',
      'Prestasi/partisipasi pada event/kompetisi diupayakan dan didokumentasikan.',
      'Pembinaan karakter (religius, mandiri, gotong royong) terintegrasi dalam latihan.',
      'Sarana-prasarana terawat, aman, dan dimanfaatkan optimal.',
      'Evaluasi program berkala dengan melibatkan pembina, murid, dan madrasah.',
      'Laporan kegiatan dan tindak lanjut pengembangan disusun terdokumentasi.',
    ]
  },
];

/* ---------------- Iklim Madrasah ---------------- */
const INSTRUMEN_IKLIM = [
  {
    kode: 'I1', judul: 'I. LINGKUNGAN BELAJAR AMAN & INKLUSIF', warna: '#99F6E4',
    butir: [
      'Lingkungan madrasah aman, bersih, sehat, dan bebas perundungan/kekerasan.',
      'Tata tertib disusun partisipatif dan ditegakkan dengan disiplin positif.',
      'Layanan inklusi bagi murid berkebutuhan khusus tersedia dan berjalan.',
      'Sarana ibadah, literasi, dan ruang ekspresi murid tersedia dan aktif.',
    ]
  },
  {
    kode: 'I2', judul: 'II. BUDAYA RELIGIUS & KEBERSAMAAN', warna: '#99F6E4',
    butir: [
      'Pembiasaan religius (shalat berjamaah, tadarus, infak, PHBI) berjalan konsisten.',
      'Hubungan warga madrasah harmonis, saling menghargai, dan kolaboratif.',
      'Komunikasi madrasah dengan orang tua/komite berjalan terbuka dan rutin.',
    ]
  },
  {
    kode: 'I3', judul: 'III. KEPEMIMPINAN & TATA KELOLA', warna: '#99F6E4',
    butir: [
      'Kepala madrasah memberi teladan, supervisi, dan umpan balik pembinaan.',
      'Program kerja, supervisi, dan evaluasi madrasah terdokumentasi rapi.',
      'Budaya literasi, inovasi, dan berbagi praktik baik tumbuh di madrasah.',
    ]
  },
];

/* ---------------- Helpers ---------------- */
function flatButir(instrumen) {
  const out = [];
  instrumen.forEach(t => t.butir.forEach((b, i) => out.push({ tahap: t.kode, judul: t.judul, no: out.length + 1, teks: b })));
  return out;
}
function hitungNilai(skorObj, jumlahButir) {
  const vals = Object.values(skorObj || {}).map(Number).filter(v => v >= 1 && v <= 4);
  const total = vals.reduce((a, b) => a + b, 0);
  const maks = jumlahButir * 4;
  const nilai = maks ? Math.round((total / maks) * 1000) / 10 : 0;
  return { total, maks, terisi: vals.length, nilai, predikat: predikatDariNilai(nilai) };
}
function predikatDariNilai(n) {
  if (n >= 91) return 'Amat Baik';
  if (n >= 81) return 'Sangat Baik';
  if (n >= 71) return 'Baik';
  if (n >= 61) return 'Sedang';
  if (n >= 51) return 'Cukup';
  return 'Kurang';
}
function predikatClass(p) {
  return 'pred-' + String(p || '').toLowerCase().replace(/\s+/g, '-');
}
function autoCatatan(skorObj, instrumen, label) {
  const flat = flatButir(instrumen);
  const baik = [], lemah = [];
  flat.forEach(b => {
    const s = Number((skorObj || {})[b.no]);
    if (!s) return;
    (s >= 3 ? baik : lemah).push({ teks: b.teks, skor: s });
  });
  let c = `Hasil ${label} menunjukkan `;
  if (!baik.length && !lemah.length) return c + 'belum ada skor yang terisi.';
  if (baik.length) c += `aspek yang sudah terlaksana dengan baik antara lain ${baik.slice(0, 3).map(x => x.teks.toLowerCase()).join('; ')}. `;
  if (lemah.length) {
    c += `Namun demikian, masih terdapat ${lemah.length} aspek yang perlu ditingkatkan, yaitu ${lemah.map(x => x.teks.toLowerCase()).join('; ')}. `;
    c += 'Aspek-aspek tersebut memerlukan pembinaan dan pendampingan lebih lanjut.';
  } else {
    c += 'Seluruh aspek sudah terlaksana dengan baik dan menunjukkan kinerja yang memuaskan.';
  }
  return c;
}
function autoRTL(skorObj, instrumen, label) {
  const flat = flatButir(instrumen);
  const lemah = flat.filter(b => { const s = Number((skorObj || {})[b.no]); return s === 1 || s === 2; });
  if (!lemah.length) return `Berdasarkan hasil ${label}, seluruh aspek sudah terlaksana dengan baik. Rencana tindak lanjut adalah mempertahankan kualitas yang sudah tercapai, terus berinovasi, dan berbagi praktik baik dengan rekan sejawat.`;
  const kurang = lemah.filter(b => Number((skorObj || {})[b.no]) === 1);
  let r = `Rencana tindak lanjut ${label}: `;
  if (kurang.length) r += `pembinaan intensif melalui pendampingan langsung terkait ${kurang.map(b => b.teks.toLowerCase()).join('; ')}. `;
  const cukup = lemah.filter(b => Number((skorObj || {})[b.no]) === 2);
  if (cukup.length) r += `Pendampingan berkelanjutan untuk meningkatkan kualitas pada aspek ${cukup.map(b => b.teks.toLowerCase()).join('; ')}. `;
  r += 'Supervisi/pendampingan lanjutan akan dilaksanakan untuk memastikan perbaikan berjalan optimal.';
  return r;
}
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtTanggal(iso) {
  if (!iso) return '-';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function uid(prefix) {
  return (prefix || 'ID') + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toCSV(rows, headers) {
  const q = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
  return [headers.map(q).join(';')].concat(rows.map(r => headers.map(h => q(r[h])).join(';'))).join('\r\n');
}
