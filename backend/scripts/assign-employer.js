/**
 * Assign existing jobs to your employer account.
 * Usage: npm run assign:employer
 *        ASSIGN_EMPLOYER_EMAIL=you@email.com npm run assign:employer
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const EMPLOYER_EMAIL = process.env.ASSIGN_EMPLOYER_EMAIL || process.argv[2] || 'nathankimutai59@gmail.com';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data: employer, error: e1 } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', EMPLOYER_EMAIL)
    .maybeSingle();

  if (e1 || !employer) {
    console.error(`Employer not found: ${EMPLOYER_EMAIL}. Register first at the app.`);
    process.exit(1);
  }

  const { data: jobs, error: e2 } = await supabase.from('jobs').select('id, title, employer_id');
  if (e2) throw e2;

  if (!jobs?.length) {
    console.log('No jobs found. Creating sample job for your account...');
    const { error } = await supabase.from('jobs').insert({
      employer_id: employer.id,
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
    const { error: e3 } = await supabase
      .from('jobs')
      .update({ employer_id: employer.id })
      .neq('employer_id', employer.id);
    if (e3) throw e3;
    console.log(`  ✓ Transferred ${jobs.length} job(s) to ${EMPLOYER_EMAIL}`);
    jobs.forEach((j) => console.log(`    - ${j.title}`));
  }

  const { data: apps } = await supabase.from('applications').select('id, job_id');
  console.log(`  ✓ ${apps?.length || 0} application(s) now visible to your employer account`);
  console.log(`\nLogin as: ${EMPLOYER_EMAIL}`);
  console.log('Then go to: Candidates / Shortlisting / AI Rankings');
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
