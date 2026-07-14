/**
 * Seed Supabase with demo users and a sample job.
 * Run: npm run seed:supabase
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key || url.includes('your-project') || key.includes('your-service')) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env first.');
  process.exit(1);
}

const supabase = createClient(url, key);

const DEMO_USERS = [
  { email: 'admin@reqruit.com', password: 'admin123', full_name: 'Platform Admin', role: 'admin', company: null },
  { email: 'nathankimutai59@gmail.com', password: 'employer123', full_name: 'James Kipsang', role: 'employer', company: 'university' },
  { email: 'applicant@reqruit.com', password: 'applicant123', full_name: 'Jane Doe', role: 'applicant', company: null },
];

async function upsertUser(user) {
  const { data: existing } = await supabase.from('profiles').select('id').eq('email', user.email).maybeSingle();
  const password_hash = bcrypt.hashSync(user.password, 10);
  if (existing) {
    await supabase.from('profiles').update({ password_hash, full_name: user.full_name, role: user.role, company: user.company }).eq('id', existing.id);
    return existing.id;
  }
  const id = uuidv4();
  const { error } = await supabase.from('profiles').insert({ id, email: user.email, password_hash, full_name: user.full_name, role: user.role, company: user.company });
  if (error) throw error;
  return id;
}

async function seed() {
  console.log('Connecting to Supabase...');
  const { error: ping } = await supabase.from('profiles').select('id').limit(1);
  if (ping) {
    console.error('Cannot reach profiles table. Did you run supabase/schema.sql?');
    console.error(ping.message);
    process.exit(1);
  }

  const ids = {};
  for (const u of DEMO_USERS) {
    ids[u.role] = await upsertUser(u);
    console.log(`  ✓ ${u.role}: ${u.email}`);
  }

  const { data: existingJob } = await supabase.from('jobs').select('id').eq('employer_id', ids.employer).limit(1).maybeSingle();
  if (!existingJob) {
    const { error } = await supabase.from('jobs').insert({
      employer_id: ids.employer,
      title: 'Software Engineer',
      description: 'Build and maintain web applications using modern JavaScript frameworks.',
      location: 'Nairobi, Kenya',
      employment_type: 'full-time',
      required_skills: ['JavaScript', 'React', 'Node.js', 'SQL'],
      required_education: "Bachelor's in Computer Science",
      experience_years: 2,
      status: 'open',
    });
    if (error) throw error;
    console.log('  ✓ Sample job created');
  } else {
    console.log('  ✓ Sample job already exists');
  }

  console.log('\nSeed complete! Demo logins:');
  console.log('  admin@reqruit.com / admin123');
  console.log('  nathankimutai59@gmail.com / employer123');
  console.log('  applicant@reqruit.com / applicant123');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
