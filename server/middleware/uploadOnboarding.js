import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NATIONAL_ID_UPLOAD_DIR = path.join(__dirname, '../../uploads/national-ids');
export const PROFILE_PHOTO_UPLOAD_DIR = path.join(__dirname, '../../uploads/profile-photos');

fs.mkdirSync(NATIONAL_ID_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PROFILE_PHOTO_UPLOAD_DIR, { recursive: true });

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
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

/** Registration: national ID + profile photo (both required) */
export const uploadOnboardingFiles = upload.fields([
  { name: 'nationalId', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

/** Profile update: optional replacement files */
export const uploadProfileFiles = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'nationalId', maxCount: 1 }
]);
