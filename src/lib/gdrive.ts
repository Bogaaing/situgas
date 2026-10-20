/**
 * src/lib/gdrive.ts
 * Modul untuk upload berkas langsung ke folder Google Drive yang telah disiapkan.
 */

export interface GDriveUploadResult {
  success: boolean;
  fileId: string;
  fileUrl: string;
  downloadUrl: string;
  fileName: string;
}

/**
 * Mengonversi berkas File lokal menjadi string Base64 murni
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Mengonversi Blob lokal menjadi string Base64 murni
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Mengunggah data Base64 ke Google Drive langsung
 */
export async function uploadBase64ToGDrive(
  base64: string,
  fileName: string,
  mimeType: string,
  type: 'submission' | 'material'
): Promise<GDriveUploadResult> {
  const payload = {
    type,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    base64,
  };

  // 1. Coba melalui backend proxy /api/gdrive/upload terlebih dahulu
  try {
    const response = await fetch('/api/gdrive/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.fileUrl) {
        return data as GDriveUploadResult;
      }
      throw new Error(data.error || 'Gagal menyimpan ke Google Drive.');
    }

    const errData = await response.json().catch(() => null);
    if (errData?.error) {
      throw new Error(errData.error);
    }
  } catch (proxyErr: any) {
    // 2. Fallback: jika server proxy belum disetel atau direct URL tersedia
    const directUrl = (import.meta as any).env?.VITE_GDRIVE_SCRIPT_URL;
    if (directUrl) {
      const directResponse = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (directResponse.ok) {
        const directData = await directResponse.json();
        if (directData.success && directData.fileUrl) {
          return directData as GDriveUploadResult;
        }
        throw new Error(directData.error || 'Gagal menyimpan berkas ke Google Drive.');
      }
    }
    throw proxyErr;
  }

  throw new Error('Gagal menghubungi layanan Google Drive Uploader.');
}

/**
 * Mengunggah file ke Google Drive (tipe 'submission' untuk tugas atau 'material' untuk materi dosen)
 */
export async function uploadFileToGDrive(
  file: File,
  type: 'submission' | 'material'
): Promise<GDriveUploadResult> {
  const base64 = await fileToBase64(file);
  return uploadBase64ToGDrive(base64, file.name, file.type || 'application/octet-stream', type);
}
