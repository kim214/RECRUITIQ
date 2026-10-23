/**
 * Assign public applicant IDs to every existing applicant who does not have one.
 * New signups already get an ID automatically.
 *
 * Usage (from backend folder):
 *   node scripts/assign-applicant-codes.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { derivedApplicantCode } = require('../lib/privacy');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || url.includes('your-project') || key.includes('your-service')) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env first.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, applicant_code')
    .eq('role', 'applicant');

  if (error) {
    if (/applicant_code|schema cache/i.test(String(error.message || ''))) {
      console.error('Run supabase/add-applicant-code.sql in the Supabase SQL Editor first.');
      console.error('That script adds the column AND updates every existing applicant.');
      process.exit(1);
    }
    throw error;
  }

  const missing = (data || []).filter((row) => !row.applicant_code);
  console.log(`Applicants: ${data.length}. Missing IDs: ${missing.length}.`);

  let updated = 0;
  for (const row of missing) {
    const code = derivedApplicantCode(row.id);
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ applicant_code: code })
      .eq('id', row.id);
    if (upErr) {
      console.error(`Failed for ${row.id}: ${upErr.message}`);
      continue;
    }
    updated += 1;
  }

  const { data: after } = await supabase
    .from('profiles')
    .select('id, applicant_code')
    .eq('role', 'applicant');
  const withCode = (after || []).filter((row) => row.applicant_code).length;
  console.log(`Updated now: ${updated}. Applicants with an ID: ${withCode}/${(after || []).length}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
