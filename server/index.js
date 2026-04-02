import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';
import salaryRoutes from './routes/salary.js';
import profileRoutes from './routes/profiles.js';

dotenv.config();

const app = express();
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : [])
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, origin || allowedOrigins[0]);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/redlime-bidding')
  .then(async () => {
    console.log('MongoDB connected');
    const db = mongoose.connection.db;
    if (db) {
      const r1 = await db.collection('users').updateMany(
        { status: 'pending' },
        { $set: { status: 'pending_admin' } }
      );
      if (r1.modifiedCount > 0) console.log(`Migrated ${r1.modifiedCount} users: pending → pending_admin`);
      const r2 = await db.collection('users').updateMany(
        { $or: [{ status: { $exists: false } }, { status: null }] },
        { $set: { status: 'approved' } }
      );
      if (r2.modifiedCount > 0) console.log(`Migrated ${r2.modifiedCount} users: missing status → approved`);
    }
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/profiles', profileRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
