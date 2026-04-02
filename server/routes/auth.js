import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { isValidErc20Address, normalizeErc20Address } from '../utils/erc20Address.js';
import {
  uploadOnboardingFiles,
  uploadProfileFiles,
  fileStoragePath,
  isCloudinary,
  UPLOADS_ROOT
} from '../middleware/uploadOnboarding.js';

const router = express.Router();
const uploadsRootResolved = path.resolve(UPLOADS_ROOT);

function isUrl(p) { return p && (p.startsWith('http://') || p.startsWith('https://')); }

function serveFileOrRedirect(res, filePath) {
  if (isUrl(filePath)) {
    return res.redirect(filePath);
  }
  const full = path.join(uploadsRootResolved, filePath);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(uploadsRootResolved)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(resolved);
}

function issueToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
}

function userResponse(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    level: user.level || null,
    status: user.status,
    rejectionReason: user.rejectionReason || ''
  };
}

/** Step 1: email + password only — then client continues to POST /complete-onboarding */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const local = normalizedEmail.split('@')[0] || 'User';
    const user = await User.create({
      email: normalizedEmail,
      password,
      name: local.charAt(0).toUpperCase() + local.slice(1),
      role: 'applicant',
      status: 'pending_onboarding',
      applicationPath: 'ops_first'
    });

    const token = issueToken(user._id);
    res.status(201).json({
      token,
      user: userResponse(user),
      message: 'Account created. Complete your profile next.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Step 2: full profile + files (requires auth, status pending_onboarding) */
router.post('/complete-onboarding', authenticate, (req, res, next) => {
  uploadOnboardingFiles(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'File upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending_onboarding') {
      return res.status(400).json({ error: 'Profile already submitted or invalid status' });
    }

    const files = req.files || {};
    const idFile = files.nationalId?.[0];
    const photoFile = files.photo?.[0];
    if (!idFile) {
      return res.status(400).json({ error: 'National ID upload is required (image or PDF)' });
    }
    if (!photoFile) {
      return res.status(400).json({ error: 'Profile photo is required (JPG, PNG, WebP, or GIF)' });
    }

    const {
      legalFirstName,
      legalMiddleName,
      legalLastName,
      phone,
      linkedinUrl,
      facebookUrl,
      address,
      nationality,
      country,
      state,
      usdtErc20Wallet,
      onboardingTrack
    } = req.body;

    const track = String(onboardingTrack || 'ops_first').trim();
    if (track !== 'ops_first' && track !== 'admin_direct') {
      return res.status(400).json({ error: 'Invalid application path' });
    }
    const nextStatus = track === 'admin_direct' ? 'pending_admin' : 'pending_ops';
    const applicationPath = track === 'admin_direct' ? 'admin_direct' : 'ops_first';

    if (!legalFirstName?.trim() || !legalLastName?.trim()) {
      return res.status(400).json({ error: 'Legal first name and legal last name are required' });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!address?.trim()) {
      return res.status(400).json({ error: 'Address is required' });
    }
    if (!nationality?.trim() || !country?.trim() || !state?.trim()) {
      return res.status(400).json({ error: 'Nationality, country, and state are required' });
    }

    const raw = normalizeErc20Address(usdtErc20Wallet);
    if (!raw || !isValidErc20Address(raw)) {
      return res.status(400).json({
        error: 'ERC-20 wallet address required: use a valid Ethereum address (0x + 40 hex characters)'
      });
    }

    const displayName = [legalFirstName.trim(), (legalMiddleName || '').trim(), legalLastName.trim()]
      .filter(Boolean)
      .join(' ');

    user.name = displayName;
    user.legalFirstName = legalFirstName.trim();
    user.legalMiddleName = (legalMiddleName || '').trim();
    user.legalLastName = legalLastName.trim();
    user.phone = phone.trim();
    user.linkedinUrl = (linkedinUrl || '').trim();
    user.facebookUrl = (facebookUrl || '').trim();
    user.address = address.trim();
    user.nationality = nationality.trim();
    user.country = country.trim();
    user.state = state.trim();
    user.nationalIdFile = {
      path: fileStoragePath(idFile),
      originalName: idFile.originalname
    };
    user.photoFile = {
      path: fileStoragePath(photoFile),
      originalName: photoFile.originalname
    };
    user.usdtErc20Wallet = raw;
    user.applicationPath = applicationPath;
    user.status = nextStatus;
    user.rejectionReason = '';

    await user.save();

    const msg = track === 'admin_direct'
      ? 'Application submitted. An admin will assign your role and approve your account. You can sign in once approved.'
      : 'Application submitted. An Ops Lead will review, then an admin will approve. You can sign in once approved.';

    res.json({ message: msg, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/profile-photo', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('photoFile');
    if (!user?.photoFile?.path) return res.status(404).json({ error: 'No photo on file' });
    serveFileOrRedirect(res, user.photoFile.path);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/profile', authenticate, (req, res, next) => {
  uploadProfileFiles(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'pending_onboarding') {
      return res.status(400).json({ error: 'Finish onboarding first (Profile wizard).' });
    }

    const b = req.body;
    const str = (v) => (v === undefined || v === null ? undefined : String(v).trim());

    if (b.legalFirstName !== undefined) user.legalFirstName = str(b.legalFirstName) ?? '';
    if (b.legalMiddleName !== undefined) user.legalMiddleName = str(b.legalMiddleName) ?? '';
    if (b.legalLastName !== undefined) user.legalLastName = str(b.legalLastName) ?? '';
    if (b.phone !== undefined) user.phone = str(b.phone) ?? '';
    if (b.linkedinUrl !== undefined) user.linkedinUrl = str(b.linkedinUrl) ?? '';
    if (b.facebookUrl !== undefined) user.facebookUrl = str(b.facebookUrl) ?? '';
    if (b.address !== undefined) user.address = str(b.address) ?? '';
    if (b.nationality !== undefined) user.nationality = str(b.nationality) ?? '';
    if (b.country !== undefined) user.country = str(b.country) ?? '';
    if (b.state !== undefined) user.state = str(b.state) ?? '';

    if (b.usdtErc20Wallet !== undefined && b.usdtErc20Wallet !== '') {
      const raw = normalizeErc20Address(b.usdtErc20Wallet);
      if (!raw || !isValidErc20Address(raw)) {
        return res.status(400).json({ error: 'Invalid ERC-20 wallet address' });
      }
      user.usdtErc20Wallet = raw;
    }

    const files = req.files || {};
    if (files.photo?.[0]) {
      user.photoFile = {
        path: fileStoragePath(files.photo[0]),
        originalName: files.photo[0].originalname
      };
    }
    if (files.nationalId?.[0]) {
      user.nationalIdFile = {
        path: fileStoragePath(files.nationalId[0]),
        originalName: files.nationalId[0].originalname
      };
    }

    const newPw = b.newPassword != null && String(b.newPassword).trim();
    if (newPw) {
      const current = b.currentPassword;
      if (!current || !(await user.comparePassword(current))) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      if (newPw.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      user.password = newPw;
    }

    await user.save();
    const fresh = await User.findById(user._id).select('-password');
    res.json({ user: fresh });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'pending_onboarding') {
      const token = issueToken(user._id);
      return res.json({ token, user: userResponse(user) });
    }
    if (user.status !== 'approved') {
      const msg = user.status === 'pending_ops'
        ? 'Your profile is waiting for an Ops Lead to assign your role and request admin approval.'
        : 'Your application is waiting for final admin approval.';
      return res.status(401).json({ error: msg });
    }
    const token = issueToken(user._id);
    res.json({
      token,
      user: userResponse(user)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
