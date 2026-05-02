/**
 * Setup script: Creates the admin account for SalesAI
 * 
 * Usage:
 *   node scripts/setup-admin.mjs
 * 
 * Prerequisites:
 *   - npm install @supabase/supabase-js (already in package.json)
 *   - Set SUPABASE_SERVICE_ROLE_KEY in .env.local or as env var
 *   - Set VITE_SUPABASE_URL in .env.local
 * 
 * This script uses the Supabase service role key to:
 *   1. Create the admin user (admin@admin.com / admin123)
 *   2. Set the profile role to 'admin'
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local not found, rely on environment variables
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - VITE_SUPABASE_URL');
  if (!SERVICE_ROLE_KEY) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nSet them in .env.local or as environment variables.');
  console.error('You can find these in your Supabase Dashboard → Settings → API');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

async function setupAdmin() {
  console.log('🔧 Setting up admin account...\n');

  // 1. Create admin user
  console.log(`Creating user: ${ADMIN_EMAIL}`);
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true, // Auto-confirm email
    user_metadata: { full_name: 'Administrateur' },
  });

  let userId;

  if (createError) {
    if (createError.message.includes('already') || createError.message.includes('exists')) {
      console.log('ℹ️  User already exists, finding ID...');
      const { data: listData } = await supabase.auth.admin.listUsers();
      const admin = listData?.users?.find(u => u.email === ADMIN_EMAIL);
      if (!admin) {
        console.error('❌ Could not find existing admin user');
        process.exit(1);
      }
      userId = admin.id;
    } else {
      console.error('❌ Error creating user:', createError.message);
      process.exit(1);
    }
  } else {
    userId = createData.user.id;
    console.log('✅ User created:', userId);
  }

  // 2. Wait for trigger to create profile
  console.log('Waiting for profile trigger...');
  await new Promise(r => setTimeout(r, 2000));

  // 3. Set role to admin
  console.log('Setting admin role...');
  const { error: updateError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: ADMIN_EMAIL,
      full_name: 'Administrateur',
      role: 'admin',
    });

  if (updateError) {
    console.error('❌ Error setting admin role:', updateError.message);
    console.error('   You may need to run the migration first:');
    console.error('   supabase db push');
    process.exit(1);
  }

  console.log('\n✅ Admin account ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

setupAdmin().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
