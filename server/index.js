import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';
import salaryRoutes from './routes/salary.js';
import profileRoutes from './routes/profiles.js';
import clientRoutes from './routes/clients.js';
import Client from './models/Client.js';
import ImProfile from './models/ImProfile.js';

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

      try {
        await db.collection('salaryconfigs').dropIndex('bidManagerId_1');
        console.log('Dropped legacy bidManagerId_1 index from salaryconfigs');
      } catch (_) { /* index already gone */ }

      try {
        await db.collection('improfiles').dropIndex('opsLeadId_1_name_1');
        console.log('Dropped legacy opsLeadId_1_name_1 index from improfiles');
      } catch (_) { /* index already gone */ }

      try {
        await db.collection('clients').dropIndex('opsLeadId_1_name_1');
        console.log('Dropped legacy opsLeadId_1_name_1 index from clients');
      } catch (_) { /* index already gone */ }

      try {
        await Client.syncIndexes();
      } catch (e) {
        console.warn('Client.syncIndexes:', e.message);
      }

      /** Strip legacy opsLeadId from existing Client docs. */
      try {
        const r = await db.collection('clients').updateMany(
          { opsLeadId: { $exists: true } },
          { $unset: { opsLeadId: '' } }
        );
        if (r.modifiedCount > 0) console.log(`Removed opsLeadId from ${r.modifiedCount} client doc(s)`);
      } catch (e) {
        console.warn('Client opsLeadId cleanup:', e.message);
      }

      /** Merge legacy InvestigationManager docs into Client, then drop the collection. */
      try {
        const imCol = db.collection('investigationmanagers');
        const profCol = db.collection('improfiles');
        const imCount = await imCol.countDocuments();
        if (imCount > 0) {
          const ims = await imCol.find({}).toArray();
          for (const im of ims) {
            const existing = await Client.findOne({ name: im.name });
            if (existing) {
              if (im.email && !existing.email) {
                existing.email = im.email;
                await existing.save();
              }
            } else {
              await Client.create({
                name: im.name,
                email: (im.email || '').trim()
              });
            }
          }
          const profsWithIm = await profCol.find({ investigationManagerId: { $exists: true, $ne: null } }).toArray();
          for (const raw of profsWithIm) {
            const im = await imCol.findOne({ _id: raw.investigationManagerId });
            if (im && raw.clientId) {
              const cli = await Client.findById(raw.clientId);
              if (cli && im.email && !cli.email) {
                cli.email = im.email;
                await cli.save();
              }
            }
          }
          await profCol.updateMany({}, { $unset: { investigationManagerId: '' } });
          await imCol.drop();
          console.log(`Merged ${imCount} investigation manager record(s) into clients and removed collection`);
        }
      } catch (e) {
        console.warn('Investigation manager migration (optional):', e.message);
      }

      const legacyProfiles = await ImProfile.find({
        $or: [
          { clientId: { $exists: false } },
          { clientId: null }
        ]
      });
      if (legacyProfiles.length > 0) {
        let legacyClient = await Client.findOne({ name: 'Legacy client' });
        if (!legacyClient) {
          legacyClient = await Client.create({ name: 'Legacy client', email: '' });
        }
        for (const p of legacyProfiles) {
          p.clientId = legacyClient._id;
          await p.save();
        }
        console.log(`Migrated ${legacyProfiles.length} profile(s) with default client`);
      }
    }
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/clients', clientRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
