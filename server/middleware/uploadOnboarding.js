import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const useCloud = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let storage;

if (useCloud) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const folder = file.fieldname === 'photo'
        ? 'redlime/profile-photos'
        : 'redlime/national-ids';
      const allowed = file.fieldname === 'photo'
        ? ['jpg', 'png', 'webp', 'gif']
        : ['jpg', 'png', 'webp', 'gif', 'pdf'];
      return {
        folder,
        allowed_formats: allowed,
        resource_type: 'auto',
        transformation: file.fieldname === 'photo'
          ? [{ width: 512, height: 512, crop: 'limit', quality: 'auto' }]
          : undefined
      };
    }
  });

  console.log('[uploads] Using Cloudinary storage');
} else {
  const NATIONAL_ID_UPLOAD_DIR = path.join(__dirname, '../../uploads/national-ids');
  const PROFILE_PHOTO_UPLOAD_DIR = path.join(__dirname, '../../uploads/profile-photos');
  fs.mkdirSync(NATIONAL_ID_UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_PHOTO_UPLOAD_DIR, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'photo') cb(null, PROFILE_PHOTO_UPLOAD_DIR);
      else cb(null, NATIONAL_ID_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.bin';
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${ext}`;
      cb(null, safe);
    }
  });

  console.log('[uploads] Using local disk storage (set CLOUDINARY_* env vars for cloud)');
}

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
export const isCloudinary = useCloud;

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'photo') {
      const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      return ok
        ? cb(null, true)
        : cb(new Error('Profile photo must be JPG, PNG, WebP, or GIF'));
    }
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext);
    return ok
      ? cb(null, true)
      : cb(new Error('National ID must be a JPG, PNG, WebP, GIF, or PDF file'));
  }
});

/**
 * Extract a storage path from an uploaded file.
 * - Cloudinary: returns the secure_url (full HTTPS URL).
 * - Disk: returns a relative path under UPLOADS_ROOT.
 */
export function fileStoragePath(file) {
  if (useCloud) {
    return file.path || file.secure_url || file.url || '';
  }
  const uploadsResolved = path.resolve(UPLOADS_ROOT);
  return path.relative(uploadsResolved, file.path).replace(/\\/g, '/');
}

export const uploadOnboardingFiles = upload.fields([
  { name: 'nationalId', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

export const uploadProfileFiles = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'nationalId', maxCount: 1 }
]);
