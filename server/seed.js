import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import SalaryConfig from './models/SalaryConfig.js';
import ImProfile from './models/ImProfile.js';
import Client from './models/Client.js';
import Report from './models/Report.js';

dotenv.config();

const demoProfile = {
  phone: '+10000000000',
  address: '1 Demo Street',
  nationality: 'US',
  country: 'United States',
  state: 'CA',
  legalFirstName: 'Demo',
  legalMiddleName: '',
  legalLastName: 'User'
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/redlime-bidding');
  await Report.deleteMany({});
  await ImProfile.deleteMany({});
  await Client.deleteMany({});
  await User.deleteMany({});
  await SalaryConfig.deleteMany({});

  const users = await User.create([
    {
      email: 'admin@redlime.com',
      password: 'admin123',
      name: 'Admin User',
      ...demoProfile,
      legalFirstName: 'Admin',
      legalLastName: 'User',
      role: 'admin',
      status: 'approved',
      level: 'staff'
    },
    {
      email: 'ops@redlime.com',
      password: 'ops123',
      name: 'Ops Lead',
      ...demoProfile,
      legalFirstName: 'Ops',
      legalLastName: 'Lead',
      role: 'ops_lead',
      status: 'approved',
      level: 'senior',
      usdtErc20Wallet: '0x1111111111111111111111111111111111111111',
      opsTeamRate: 50
    },
    {
      email: 'bid1@redlime.com',
      password: 'bid123',
      name: 'John Bid Manager',
      ...demoProfile,
      legalFirstName: 'John',
      legalLastName: 'Manager',
      role: 'bid_manager',
      status: 'approved',
      level: 'mid_level',
      usdtErc20Wallet: '0x2222222222222222222222222222222222222222'
    },
    {
      email: 'bid2@redlime.com',
      password: 'bid123',
      name: 'Jane Bid Manager',
      ...demoProfile,
      legalFirstName: 'Jane',
      legalLastName: 'Manager',
      role: 'bid_manager',
      status: 'approved',
      level: 'senior',
      usdtErc20Wallet: '0x3333333333333333333333333333333333333333'
    },
    {
      email: 'bidder1@redlime.com',
      password: 'bidder123',
      name: 'Chris Bidder',
      ...demoProfile,
      legalFirstName: 'Chris',
      legalLastName: 'Bidder',
      role: 'bidder',
      status: 'approved',
      level: 'mid_level',
      salaryPerBid: 0.08,
      usdtErc20Wallet: '0x4444444444444444444444444444444444444444'
    },
    {
      email: 'bidder2@redlime.com',
      password: 'bidder123',
      name: 'Dana Bidder',
      ...demoProfile,
      legalFirstName: 'Dana',
      legalLastName: 'Bidder',
      role: 'bidder',
      status: 'approved',
      level: 'senior',
      salaryPerBid: 0.1,
      usdtErc20Wallet: '0x5555555555555555555555555555555555555555'
    },
    {
      email: 'finance@redlime.com',
      password: 'fin123',
      name: 'Finance User',
      ...demoProfile,
      legalFirstName: 'Finance',
      legalLastName: 'User',
      role: 'financial_manager',
      status: 'approved',
      level: 'senior',
      usdtErc20Wallet: '0x6666666666666666666666666666666666666666'
    }
  ]);

  const opsLead = users.find(u => u.role === 'ops_lead');
  const bm1 = users.find(u => u.email === 'bid1@redlime.com');
  const bm2 = users.find(u => u.email === 'bid2@redlime.com');
  const bidder1 = users.find(u => u.email === 'bidder1@redlime.com');
  const bidder2 = users.find(u => u.email === 'bidder2@redlime.com');

  await User.updateMany({ role: 'bid_manager' }, { $set: { opsLeadId: opsLead._id } });
  await User.updateOne({ _id: bidder1._id }, { $set: { bidManagerId: bm1._id } });
  await User.updateOne({ _id: bidder2._id }, { $set: { bidManagerId: bm2._id } });

  const demoClient = await Client.create({
    name: 'Acme Corp',
    email: 'contact@acme.example'
  });

  await ImProfile.create([
    {
      opsLeadId: opsLead._id,
      clientId: demoClient._id,
      name: 'Alpha Profile',
      assignedBidderId: bidder1._id
    },
    {
      opsLeadId: opsLead._id,
      clientId: demoClient._id,
      name: 'Gamma Profile',
      assignedBidderId: bidder1._id
    },
    {
      opsLeadId: opsLead._id,
      clientId: demoClient._id,
      name: 'Beta Profile',
      assignedBidderId: bidder2._id
    }
  ]);

  await SalaryConfig.insertMany([
    { role: 'bidder', level: 'junior', rate: 0.06 },
    { role: 'bidder', level: 'mid_level', rate: 0.08 },
    { role: 'bidder', level: 'senior', rate: 0.10 },
    { role: 'bidder', level: 'staff', rate: 0.12 },
    { role: 'bid_manager', level: 'junior', rate: 8 },
    { role: 'bid_manager', level: 'mid_level', rate: 10 },
    { role: 'bid_manager', level: 'senior', rate: 12 },
    { role: 'bid_manager', level: 'staff', rate: 15 },
    { role: 'ops_lead', level: 'junior', rate: 30 },
    { role: 'ops_lead', level: 'mid_level', rate: 40 },
    { role: 'ops_lead', level: 'senior', rate: 50 },
    { role: 'ops_lead', level: 'staff', rate: 60 }
  ]);

  console.log('Seed complete. admin@redlime.com/admin123 · ops@redlime.com/ops123 · finance@redlime.com/fin123 · bidder1@redlime.com/bidder123');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
