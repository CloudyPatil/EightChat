// server/src/utils/fileValidation.ts

export const validateImageSignature = (buffer: Buffer): boolean => {
  if (!buffer || buffer.length < 8) return false;

  const hex = buffer.toString('hex', 0, 8).toUpperCase();

  // Check known image magic bytes
  const signatures = [
    '89504E47', // PNG
    'FFD8FFE0', // JPEG
    'FFD8FFE1', // JPEG EXIF
    'FFD8FFE2', // JPEG
    'FFD8FFE3', // JPEG
    'FFD8FFE8', // JPEG
    '47494638', // GIF (GIF87a or GIF89a)
    '52494646', // WEBP (first 4 bytes RIFF)
  ];

  for (const sig of signatures) {
    if (hex.startsWith(sig)) {
      if (sig === '52494646') {
        // Additional check for WEBP: bytes 8-11 should be 'WEBP'
        const webpFormat = buffer.toString('utf8', 8, 12);
        return webpFormat === 'WEBP';
      }
      return true;
    }
  }

  return false;
};