/**
 * Create or update a personal admin account in Supabase.
 * The website login page is unchanged — register cannot create admins.
 *
 * Usage (from backend folder):
 *   node scripts/create-admin.js you@email.com YourSecurePassword "Your Name"
 *
 * Or from repo root:
 *   npm run create:admin -- you@email.com YourSecurePassword "Your Name"
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const [emailRaw, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ').trim() || 'Platform Admin';

if (!emailRaw || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [full name]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key || url.includes('your-project') || key.includes('your-service')) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env first.');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const email = emailRaw.trim().toLowerCase();
  const password_hash = bcrypt.hashSync(password, 10);
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const updates = { password_hash, full_name: fullName, role: 'admin', status: 'active' };
    let { error } = await supabase.from('profiles').update(updates).eq('id', existing.id);
    if (error && /status/i.test(String(error.message || ''))) {
      delete updates.status;
      ({ error } = await supabase.from('profiles').update(updates).eq('id', existing.id));
    }
    if (error) throw error;
    console.log(`Updated existing account to admin: ${email}`);
  } else {
    const payload = {
      id: uuidv4(),
      email,
      password_hash,
      full_name: fullName,
      role: 'admin',
      status: 'active',
    };
    let { error } = await supabase.from('profiles').insert(payload);
    if (error && /status/i.test(String(error.message || ''))) {
      delete payload.status;
      ({ error } = await supabase.from('profiles').insert(payload));
    }
    if (error) throw error;
    console.log(`Created admin account: ${email}`);
  }

  console.log('Log in on the normal Login page. You will be sent to the admin portal.');
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
