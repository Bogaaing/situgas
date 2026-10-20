/**
 * ====================================================================
 * SI-TUGAS: GOOGLE DRIVE UPLOADER WEB APP (GOOGLE APPS SCRIPT)
 * ====================================================================
 *
 * PANDUAN PEMASANGAN (HANYA 2 MENIT):
 * 1. Buka https://script.google.com/home pada akun Google yang memiliki folder Drive Anda.
 * 2. Klik tombol "New project" (Proyek baru).
 * 3. Hapus kode bawaan (myFunction), lalu paste seluruh kode di bawah ini.
 * 4. Ganti 'MASUKKAN_ID_FOLDER_TUGAS_DISINI' dan 'MASUKKAN_ID_FOLDER_MATERI_DISINI'
 *    dengan ID folder Google Drive Anda yang sebenarnya.
 *    (Tips: ID folder adalah deretan huruf & angka di URL Google Drive setelah /folders/...)
 *    Contoh URL: https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
 *    -> ID-nya adalah: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ
 *
 * 5. Klik tombol "Deploy" di kanan atas -> Pilih "New deployment".
 * 6. Klik ikon Gear (roda gigi) di samping Select type -> Pilih "Web app".
 * 7. Isi pengaturannya:
 *    - Description: SI-TUGAS GDrive Uploader
 *    - Execute as: Me (emailanda@gmail.com)
 *    - Who has access: Anyone (Siapa saja)  <-- PENTING!
 * 8. Klik tombol "Deploy", berikan izin akses akun Google jika diminta (Authorize access -> Advanced -> Go to project (unsafe) -> Allow).
 * 9. Salin URL Web App yang didapat (contoh: https://script.google.com/macros/s/.../exec).
 * 10. Masukkan URL tersebut ke file .env di project Anda:
 *     GDRIVE_SCRIPT_URL=https://script.google.com/macros/s/.../exec
 *     VITE_GDRIVE_SCRIPT_URL=https://script.google.com/macros/s/.../exec
 * ====================================================================
 */

// ID FOLDER GOOGLE DRIVE TERKONFIGURASI:
// (Bisa diisi ID saja atau URL lengkap folder Google Drive):
const FOLDER_SUBMISSIONS_ID = '1HXhfIAWgh8iF5kCLn3eKOHXTIipLqqHr'; // Folder Tugas-Mahasiswa
const FOLDER_MATERIALS_ID   = '1O-KJ1-t0ovU6sAhmKfMiyYbei9b_vpbh'; // Folder Materi-Dosen

/**
 * Ekstraktor ID Folder cerdas:
 * Otomatis mendeteksi ID baik dari link lengkap (https://drive.google.com/.../folders/ID)
 * maupun jika hanya dimasukkan ID bersihnya saja.
 */
function extractFolderId(input) {
  if (!input) return '';
  var str = input.toString().trim();
  var match = str.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return str;
}

/**
 * Menangani permintaan POST pengunggahan berkas dari aplikasi
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'Data payload permintaan kosong.'
      });
    }

    const payload = JSON.parse(e.postData.contents);
    const uploadType = payload.type || 'submission'; // 'submission' (tugas mahasiswa) atau 'material' (materi dosen)
    const rawFileName = payload.fileName || ('berkas-' + new Date().getTime());
    const mimeType = payload.mimeType || 'application/octet-stream';
    const base64Data = payload.base64;

    if (!base64Data) {
      return createJsonResponse({
        success: false,
        error: 'Data berkas (base64) tidak ditemukan.'
      });
    }

    // Tentukan folder tujuan dan bersihkan ID
    const rawTarget = uploadType === 'material' ? FOLDER_MATERIALS_ID : FOLDER_SUBMISSIONS_ID;
    const targetFolderId = extractFolderId(rawTarget);

    if (!targetFolderId || targetFolderId.includes('MASUKKAN_ID_FOLDER')) {
      return createJsonResponse({
        success: false,
        error: 'ID Folder Google Drive belum dikonfigurasi di script Google Apps Script.'
      });
    }

    const targetFolder = DriveApp.getFolderById(targetFolderId);

    // Decode base64 dan simpan file ke folder Google Drive
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, rawFileName);
    const createdFile = targetFolder.createFile(blob);

    // Berikan izin view agar dosen/mahasiswa dapat langsung membuka linknya
    try {
      createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (permErr) {
      // Abaikan jika akun workspace memiliki batasan organisasi
    }

    const fileId = createdFile.getId();
    const fileUrl = createdFile.getUrl();
    const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId;

    return createJsonResponse({
      success: true,
      fileId: fileId,
      fileUrl: fileUrl,
      downloadUrl: downloadUrl,
      fileName: rawFileName
    });

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: 'Gagal memproses unggahan di Google Drive: ' + err.toString()
    });
  }
}

/**
 * Menangani permintaan GET untuk cek status online webhook
 */
function doGet(e) {
  return createJsonResponse({
    status: 'online',
    service: 'SI-TUGAS Google Drive Uploader',
    time: new Date().toISOString()
  });
}

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
