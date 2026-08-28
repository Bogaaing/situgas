# SITugas - Sistem Informasi Manajemen Tugas

Platform manajemen tugas akademik modern berbasis web untuk Universitas Pamulang (UNPAM).

## Fitur Utama
- **Portal Mahasiswa**: Akses tugas, unggah submission, unduh materi, dan pantau nilai.
- **Portal Dosen**: Kelola mata kuliah, buat tugas & kuis, unggah materi perkuliahan, dan penilaian mahasiswa.
- **Portal Administrator**: Dashboard ringkasan akademik, manajemen data dosen, kontrol mata kuliah global, master mahasiswa, dan audit trail log.
- **Supabase Authentication & RLS**: Autentikasi aman terintegrasi dengan Row Level Security (RLS) pada tabel `public.profiles`.

## Menjalankan Proyek Secara Lokal
```bash
# 1. Install dependencies
npm install

# 2. Jalankan development server
npm run dev
```

## Build Production
```bash
npm run build
```
