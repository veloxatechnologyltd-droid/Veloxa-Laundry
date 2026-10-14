// Downscale a picked/captured photo to a small JPEG Blob before upload, so
// intake stays fast on mobile data. (Ported from the demo's fileToDataURL.)
export function downscalePhoto(file: File, maxEdge = 1024, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
    };
    img.src = url;
  });
}

/** Storage path; first segment must be the org id (enforced by storage RLS). */
export const photoPath = (orgId: string, orderId: string, itemId: string) =>
  `${orgId}/${orderId}/${itemId}.jpg`;
