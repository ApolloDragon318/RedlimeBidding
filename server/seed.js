import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import SalaryConfig from './models/SalaryConfig.js';

dotenv.config();

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/redlime-bidding');
  await User.deleteMany({});
  await SalaryConfig.deleteMany({});

  const users = await User.create([
    { email: 'admin@redlime.com', password: 'admin123', name: 'Admin User', role: 'admin', status: 'approved' },
    { email: 'bid1@redlime.com', password: 'bid123', name: 'John Bid Manager', role: 'bid_manager', status: 'approved' },
    { email: 'bid2@redlime.com', password: 'bid123', name: 'Jane Bid Manager', role: 'bid_manager', status: 'approved' },
    { email: 'inv1@redlime.com', password: 'inv123', name: 'Alice Investigation Manager', role: 'investigation_manager', status: 'approved' },
    { email: 'inv2@redlime.com', password: 'inv123', name: 'Bob Investigation Manager', role: 'investigation_manager', status: 'approved' }
  ]);

  const bidManagers = users.filter(u => u.role === 'bid_manager');
  await SalaryConfig.insertMany(bidManagers.map(bm => ({
    bidManagerId: bm._id,
    bidManagerSalaryPerProfile: 10,
    bidderSalaryPerBid: 0.08
  })));

  console.log('Seed complete. Users: admin@redlime.com/admin123, bid1@redlime.com/bid123, inv1@redlime.com/inv123');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
