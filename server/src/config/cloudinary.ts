// server/src/config/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';
import { config } from './env';
import stream from 'stream';

if (config.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true,
  });
}

export const uploadImageBuffer = async (buffer: Buffer, folder = 'eightchat'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        if (result && result.secure_url) {
          resolve(result.secure_url);
        } else {
          reject(new Error('Failed to get secure URL from Cloudinary'));
        }
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
};