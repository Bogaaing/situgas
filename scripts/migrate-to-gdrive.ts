/**
 * scripts/migrate-to-gdrive.ts
 * Script otomatis untuk memindahkan seluruh berkas tugas mahasiswa dan materi dosen
 * dari Supabase Storage ke Google Drive, lalu menghapus berkas lama dari Supabase
 * agar kuota storage Supabase kembali lega/kosong.
 *
 * Cara menjalankan:
 * npx tsx scripts/migrate-to-gdrive.ts
 *
 * Opsi Dry-run (hanya cek berkas tanpa memindahkan):
 * npx tsx scripts/migrate-to-gdrive.ts --dry-run
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const isDryRun = process.argv.includes('--dry-run');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const gdriveUrl = process.env.GDRIVE_SCRIPT_URL || process.env.VITE_GDRIVE_SCRIPT_URL || '';

if (!supabaseUrl) {
  console.error('❌ Eror: VITE_SUPABASE_URL tidak ditemukan di .env');
  process.exit(1);
}

if (!gdriveUrl) {
  console.error('❌ Eror: GDRIVE_SCRIPT_URL tidak ditemukan di .env');
  process.exit(1);
}

// Gunakan Service Role Key jika ada (agar bebas RLS saat baca/hapus semua storage),
// jika belum ada gunakan anon key.
const activeKey = serviceRoleKey || anonKey;
if (!serviceRoleKey) {
  console.warn('⚠️  Catatan: SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.');
  console.warn('   Menggunakan Anon Key. Jika ada pembatasan RLS pada penghapusan storage,');
  console.warn('   silakan tambahkan SUPABASE_SERVICE_ROLE_KEY di .env dari:');
  console.warn('   Supabase Dashboard -> Settings -> API -> service_role secret\n');
}

const supabase = createClient(supabaseUrl, activeKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function uploadToGDrive(type: 'submission' | 'material', fileName: string, mimeType: string, base64: string) {
  const response = await fetch(gdriveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type, fileName, mimeType, base64 }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google Apps Script error (${response.status}): ${errText}`);
  }

  const result: any = await response.json();
  if (!result.success || !result.fileUrl) {
    throw new Error(result.error || 'Gagal menyimpan ke Google Drive');
  }

  return result;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function cleanStoragePath(filePath: string, bucket: string): string {
  let p = (filePath || '').trim().replace(/^\/+/, '');
  if (p.startsWith(`${bucket}/`)) {
    p = p.substring(bucket.length + 1);
  }
  return p;
}

async function attemptDownload(bucket: string, rawPath: string) {
  const p1 = cleanStoragePath(rawPath, bucket);
  try {
    const res = await supabase.storage.from(bucket).download(p1);
    if (res.data && !res.error) {
      return { blob: res.data, actualPath: p1, error: null };
    }
    if (p1 !== rawPath) {
      const res2 = await supabase.storage.from(bucket).download(rawPath);
      if (res2.data && !res2.error) {
        return { blob: res2.data, actualPath: rawPath, error: null };
      }
      return { blob: null, actualPath: p1, error: res.error || res2.error };
    }
    return { blob: null, actualPath: p1, error: res.error };
  } catch (err: any) {
    return { blob: null, actualPath: p1, error: err };
  }
}

async function runMigration() {
  console.log('===========================================================');
  console.log('   MIGRASI PENYIMPANAN: SUPABASE STORAGE -> GOOGLE DRIVE   ');
  console.log('===========================================================');
  if (isDryRun) {
    console.log('🔍 MODE: DRY-RUN (Hanya simulasi, tidak ada data yang diubah/dihapus)\n');
  } else {
    console.log('🚀 MODE: MIGRASI PENUH (Berkas diunggah ke Drive & dihapus dari Supabase)\n');
  }

  let totalMovedSubmissions = 0;
  let totalMovedMaterials = 0;
  let totalBytesFreed = 0;
  let failedCount = 0;

  // =========================================================================
  // 1. MIGRASI TUGAS MAHASISWA (submissions)
  // =========================================================================
  console.log('📂 [1/2] Memeriksa tugas mahasiswa di tabel "submissions"...');

  const { data: submissions, error: subErr } = await supabase
    .from('submissions')
    .select('id, file_path, submitted_link, student_id, assignment_id');

  if (subErr) {
    console.error('❌ Gagal membaca tabel submissions:', subErr.message);
  } else {
    // Filter hanya berkas yang masih tersimpan di Supabase Storage
    const pendingSubs = (submissions || []).filter(s => {
      if (!s.file_path) return false;
      const path = s.file_path.trim().toLowerCase();
      return !path.startsWith('http://') && !path.startsWith('https://');
    });

    console.log(`   Ditemukan ${pendingSubs.length} berkas tugas di Supabase Storage yang perlu dipindahkan.\n`);

    for (let i = 0; i < pendingSubs.length; i++) {
      const sub = pendingSubs[i];
      const filePath = sub.file_path;
      const cleanFileName = filePath.split('/').pop()?.replace(/^\d+-/, '') || 'tugas-mahasiswa.pdf';

      console.log(`   [${i + 1}/${pendingSubs.length}] Memproses tugas: ${cleanFileName}`);

      if (isDryRun) {
        console.log(`      ↪ (Simulasi) Unduh "${filePath}" -> Upload ke GDrive (Tugas) -> Update DB -> Hapus dari Supabase`);
        totalMovedSubmissions++;
        continue;
      }

      try {
        // 1. Download dari Supabase Storage
        const { blob, actualPath, error: downloadErr } = await attemptDownload('assignment-submissions', filePath);

        if (downloadErr || !blob) {
          throw new Error(`Gagal mengunduh dari Supabase: ${downloadErr?.message || 'File tidak ditemukan (404)'}`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const fileSize = arrayBuffer.byteLength;
        const base64 = bufferToBase64(arrayBuffer);
        const mimeType = blob.type || 'application/octet-stream';

        // 2. Upload ke Google Drive
        const gdriveRes = await uploadToGDrive('submission', cleanFileName, mimeType, base64);
        const newDriveUrl = gdriveRes.fileUrl;

        // 3. Update Database Submissions
        const { error: updateErr } = await supabase
          .from('submissions')
          .update({
            file_path: newDriveUrl,
            submitted_link: sub.submitted_link || newDriveUrl,
          })
          .eq('id', sub.id);

        if (updateErr) {
          throw new Error(`Gagal memperbarui database: ${updateErr.message}`);
        }

        // 4. Hapus dari Supabase Storage untuk mengosongkan kuota
        const pathsToDelete = [actualPath];
        if (actualPath !== filePath) pathsToDelete.push(filePath);
        const { error: deleteErr } = await supabase.storage
          .from('assignment-submissions')
          .remove(pathsToDelete);

        if (deleteErr) {
          console.warn(`      ⚠️  File berhasil ke Drive & DB terupdate, tetapi gagal menghapus dari Supabase: ${deleteErr.message}`);
        } else {
          totalBytesFreed += fileSize;
        }

        console.log(`      ✓ Berhasil dipindahkan ke GDrive: ${newDriveUrl}`);
        totalMovedSubmissions++;
      } catch (err: any) {
        console.error(`      ❌ Gagal memindahkan tugas ${sub.id}:`, err.message);
        failedCount++;
      }
    }
  }

  // =========================================================================
  // 2. MIGRASI MATERI DOSEN (course_materials)
  // =========================================================================
  console.log('\n📚 [2/2] Memeriksa materi perkuliahan di tabel "course_materials"...');

  const { data: materials, error: matErr } = await supabase
    .from('course_materials')
    .select('id, title, material_type, file_path, external_url');

  if (matErr) {
    console.error('❌ Gagal membaca tabel course_materials:', matErr.message);
  } else {
    // Filter materi bertipe 'file' yang masih ada di storage Supabase
    const pendingMats = (materials || []).filter(m => {
      if (m.material_type !== 'file' || !m.file_path) return false;
      const path = m.file_path.trim().toLowerCase();
      return !path.startsWith('http://') && !path.startsWith('https://');
    });

    console.log(`   Ditemukan ${pendingMats.length} berkas materi di Supabase Storage yang perlu dipindahkan.\n`);

    for (let i = 0; i < pendingMats.length; i++) {
      const mat = pendingMats[i];
      const filePath = mat.file_path;
      const cleanFileName = filePath.split('/').pop()?.replace(/^\d+-[a-z0-9]+-/, '') || `${mat.title}.pdf`;

      console.log(`   [${i + 1}/${pendingMats.length}] Memproses materi: "${mat.title}" (${cleanFileName})`);

      if (isDryRun) {
        console.log(`      ↪ (Simulasi) Unduh "${filePath}" -> Upload ke GDrive (Materi) -> Update DB -> Hapus dari Supabase`);
        totalMovedMaterials++;
        continue;
      }

      try {
        // 1. Download dari Supabase Storage
        const { blob, actualPath, error: downloadErr } = await attemptDownload('course-materials', filePath);

        if (downloadErr || !blob) {
          throw new Error(`Gagal mengunduh dari Supabase: ${downloadErr?.message || 'File tidak ditemukan (404)'}`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const fileSize = arrayBuffer.byteLength;
        const base64 = bufferToBase64(arrayBuffer);
        const mimeType = blob.type || 'application/octet-stream';

        // 2. Upload ke Google Drive folder materi
        const gdriveRes = await uploadToGDrive('material', cleanFileName, mimeType, base64);
        const newDriveUrl = gdriveRes.fileUrl;

        // 3. Update Database Course Materials
        const { error: updateErr } = await supabase
          .from('course_materials')
          .update({
            material_type: 'link',
            file_path: newDriveUrl,
            external_url: newDriveUrl,
          })
          .eq('id', mat.id);

        if (updateErr) {
          throw new Error(`Gagal memperbarui database: ${updateErr.message}`);
        }

        // 4. Hapus dari Supabase Storage untuk mengosongkan kuota
        const pathsToDelete = [actualPath];
        if (actualPath !== filePath) pathsToDelete.push(filePath);
        const { error: deleteErr } = await supabase.storage
          .from('course-materials')
          .remove(pathsToDelete);

        if (deleteErr) {
          console.warn(`      ⚠️  Materi tersimpan di Drive, tetapi gagal menghapus dari Supabase: ${deleteErr.message}`);
        } else {
          totalBytesFreed += fileSize;
        }

        console.log(`      ✓ Berhasil dipindahkan ke GDrive: ${newDriveUrl}`);
        totalMovedMaterials++;
      } catch (err: any) {
        console.error(`      ❌ Gagal memindahkan materi ${mat.id}:`, err.message);
        failedCount++;
      }
    }
  }

  // =========================================================================
  // RINGKASAN HASIL
  // =========================================================================
  const mbFreed = (totalBytesFreed / (1024 * 1024)).toFixed(2);
  console.log('\n===========================================================');
  console.log('                   RINGKASAN MIGRASI                      ');
  console.log('===========================================================');
  console.log(`✓ Total tugas mahasiswa dipindahkan : ${totalMovedSubmissions}`);
  console.log(`✓ Total materi dosen dipindahkan    : ${totalMovedMaterials}`);
  console.log(`✓ Estimasi kuota Supabase dibebaskan: ${mbFreed} MB`);
  if (failedCount > 0) {
    console.log(`⚠️ Jumlah berkas gagal diproses     : ${failedCount}`);
  }
  console.log('===========================================================\n');
}

runMigration().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
