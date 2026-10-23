require('dotenv').config();
const { extractJobRequirementProfile } = require('../lib/jobRequirementAnalyzer');

const CASES = [
  {
    name: 'simple',
    job: {
      title: 'Junior Python Developer',
      description: 'We need a Python developer. Required: Python. Nice to have: Docker. Bachelor degree preferred. One year of experience.',
      requiredSkills: ['Python'],
      minExperience: 1,
    },
  },
  {
    name: 'complex',
    job: {
      title: 'Senior Full-Stack Engineer',
      location: 'Nairobi',
      employmentType: 'full-time',
      requiredSkills: ['JavaScript', 'React'],
      requiredEducation: "Bachelor's in Computer Science",
      requiredCertifications: [],
      minExperience: 5,
      description: `We are hiring a senior engineer to own our hiring platform.

Must have: JavaScript, React, Node.js, PostgreSQL, and production REST APIs.
Preferred: Docker, Kubernetes, AWS, and CI/CD with GitHub Actions.
Education: Bachelor's in Computer Science or equivalent.
Experience: 5+ years building web applications; 2+ years leading a small team.
Certifications: AWS Solutions Architect is a plus.
Responsibilities: design APIs, review PRs, mentor juniors, improve reliability.
Other: willing to work hybrid in Nairobi, strong written communication.`,
    },
  },
  {
    name: 'required-vs-preferred',
    job: {
      title: 'Data Analyst',
      description: 'Required skills: SQL and Excel. Preferred: Python and Tableau. No certifications required.',
      requiredSkills: [],
      minExperience: 0,
    },
  },
  {
    name: 'missing-requirements',
    job: {
      title: 'Office Assistant',
      description: 'Join our team. We will train you. Apply today.',
      requiredSkills: [],
      minExperience: 0,
    },
  },
];

async function main() {
  for (const testCase of CASES) {
    const t0 = Date.now();
    const profile = await extractJobRequirementProfile(testCase.job);
    console.log('\n===', testCase.name, `${Date.now() - t0}ms`, 'model=', profile.model);
    console.log(JSON.stringify({
      required_skills: profile.required_skills,
      preferred_skills: profile.preferred_skills,
      education_requirements: profile.education_requirements,
      experience_requirements: profile.experience_requirements,
      certifications: profile.certifications,
      responsibilities: profile.responsibilities.slice(0, 5),
      other_requirements: profile.other_requirements,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
