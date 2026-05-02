import mongoose from 'mongoose';
import config from './config.js';
import User from './models/User.js';

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

async function seed() {
  console.log('🔧 Setting up admin account...\n');
  console.log(`Connecting to: ${config.mongoUri}`);

  await mongoose.connect(config.mongoUri);
  console.log('✅ Connected to MongoDB\n');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('ℹ️  Admin already exists, ensuring role is admin...');
    existing.role = 'admin';
    await existing.save();
  } else {
    await User.create({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      full_name: 'Administrateur',
      role: 'admin',
    });
    console.log('✅ Admin account created');
  }

  console.log('\n✅ Admin account ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
