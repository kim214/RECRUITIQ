const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function defaultDb() {
  const now = new Date().toISOString();
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  return {
    users: [
      { id: uuidv4(), email: 'admin@reqruit.com', password_hash: hash('admin123'), full_name: 'Platform Admin', role: 'admin', company: null, phone: null, created_at: now },
      { id: uuidv4(), email: 'employer@reqruit.com', password_hash: hash('employer123'), full_name: 'Acme Corp HR', role: 'employer', company: 'Acme Corp', phone: null, created_at: now },
      { id: uuidv4(), email: 'applicant@reqruit.com', password_hash: hash('applicant123'), full_name: 'Jane Doe', role: 'applicant', company: null, phone: '+254700000000', created_at: now },
    ],
    jobs: [],
    applications: [],
    ai_analyses: [],
    activity_log: [],
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultDb();
    const employer = db.users.find((u) => u.role === 'employer');
    const jobId = uuidv4();
    db.jobs.push({
      id: jobId,
      employer_id: employer.id,
      title: 'Software Engineer',
      description: 'Build and maintain web applications using modern JavaScript frameworks.',
      location: 'Nairobi, Kenya',
      employment_type: 'full-time',
      salary_min: null,
      salary_max: null,
      required_skills: ['JavaScript', 'React', 'Node.js', 'SQL'],
      required_education: "Bachelor's in Computer Science",
      required_certifications: [],
      experience_years: 2,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const applicant = db.users.find((u) => u.role === 'applicant');
    db.applications.push({
      id: uuidv4(),
      job_id: jobId,
      applicant_id: applicant.id,
      status: 'applied',
      cover_letter: 'I have 3 years of experience with JavaScript, React, and Node.js. Built multiple full-stack web apps.',
      resume_url: null,
      transcript_url: null,
      certificates_url: [],
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

function read() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function write(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function mapUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return {
    id: rest.id,
    email: rest.email,
    fullName: rest.full_name,
    full_name: rest.full_name,
    role: rest.role,
    company: rest.company,
    phone: rest.phone,
    createdAt: rest.created_at,
    created_at: rest.created_at,
  };
}

function mapJob(j, users, appCounts) {
  const employer = users.find((u) => u.id === j.employer_id);
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    location: j.location,
    employmentType: j.employment_type,
    employment_type: j.employment_type,
    requiredSkills: j.required_skills,
    required_skills: j.required_skills,
    requiredEducation: j.required_education,
    required_education: j.required_education,
    requiredCertifications: j.required_certifications,
    required_certifications: j.required_certifications,
    minExperience: j.experience_years,
    experience_years: j.experience_years,
    status: j.status,
    employerId: j.employer_id,
    employer_id: j.employer_id,
    employerName: employer?.full_name || 'Unknown',
    applicationCount: appCounts[j.id] || 0,
    createdAt: j.created_at,
    created_at: j.created_at,
  };
}

function mapStatus(status) {
  const map = {
    applied: 'submitted',
    submitted: 'submitted',
    ai_screening: 'ai_screening',
    shortlisted: 'shortlisted',
    interview: 'interview_scheduled',
    interview_scheduled: 'interview_scheduled',
    hired: 'hired',
    rejected: 'rejected',
  };
  return map[status] || status;
}

function stageLabel(status) {
  const labels = {
    submitted: 'Submitted',
    applied: 'Submitted',
    ai_screening: 'AI Screening',
    shortlisted: 'Shortlisted',
    interview_scheduled: 'Interview',
    interview: 'Interview',
    hired: 'Hired',
    rejected: 'Rejected',
  };
  return labels[status] || status;
}

function mapApplication(a, users, jobs, analyses) {
  const applicant = users.find((u) => u.id === a.applicant_id);
  const job = jobs.find((j) => j.id === a.job_id);
  const analysis = analyses.find((x) => x.application_id === a.id);
  const status = mapStatus(a.status);
  return {
    id: a.id,
    jobId: a.job_id,
    job_id: a.job_id,
    jobTitle: job?.title || 'Unknown',
    applicantId: a.applicant_id,
    applicant_id: a.applicant_id,
    applicantName: applicant?.full_name || 'Unknown',
    applicantEmail: applicant?.email || '',
    status,
    stageLabel: stageLabel(a.status),
    coverLetter: a.cover_letter,
    cover_letter: a.cover_letter,
    resumeUrl: a.resume_url,
    resume_url: a.resume_url,
    transcriptUrl: a.transcript_url,
    certificatesUrl: a.certificates_url,
    aiScore: analysis?.overall_score ?? null,
    aiSummary: analysis?.ai_summary ?? null,
    appliedAt: a.applied_at,
    updatedAt: a.updated_at,
    updated_at: a.updated_at,
    analysis: analysis ? {
      overallScore: analysis.overall_score,
      skillsMatch: analysis.skills_match,
      educationMatch: analysis.education_match,
      experienceMatch: analysis.experience_match,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      recommendation: analysis.recommendation,
      summary: analysis.ai_summary,
    } : null,
  };
}

const localStore = {
  mode: 'local',

  async findUserByEmail(email) {
    const db = read();
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async findUserById(id) {
    const db = read();
    return db.users.find((u) => u.id === id) || null;
  },

  async createUser({ email, password, fullName, role, company }) {
    const db = read();
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('Email already registered');
    }
    const user = {
      id: uuidv4(),
      email,
      password_hash: bcrypt.hashSync(password, 10),
      full_name: fullName,
      role,
      company: company || null,
      phone: null,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    write(db);
    return mapUser(user);
  },

  async verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  },

  async listUsers() {
    const db = read();
    return db.users.map(mapUser);
  },

  async listJobs({ employerId, status, openOnly } = {}) {
    const db = read();
    const counts = {};
    db.applications.forEach((a) => { counts[a.job_id] = (counts[a.job_id] || 0) + 1; });
    let jobs = db.jobs;
    if (employerId) jobs = jobs.filter((j) => j.employer_id === employerId);
    if (status) jobs = jobs.filter((j) => j.status === status);
    if (openOnly) jobs = jobs.filter((j) => j.status === 'open');
    return jobs.map((j) => mapJob(j, db.users, counts));
  },

  async getJob(id) {
    const db = read();
    const counts = {};
    db.applications.forEach((a) => { counts[a.job_id] = (counts[a.job_id] || 0) + 1; });
    const job = db.jobs.find((j) => j.id === id);
    return job ? mapJob(job, db.users, counts) : null;
  },

  async createJob(employerId, data) {
    const db = read();
    const job = {
      id: uuidv4(),
      employer_id: employerId,
      title: data.title,
      description: data.description,
      location: data.location || null,
      employment_type: data.employmentType || 'full-time',
      salary_min: data.salaryMin || null,
      salary_max: data.salaryMax || null,
      required_skills: data.requiredSkills || [],
      required_education: data.requiredEducation || null,
      required_certifications: data.requiredCertifications || [],
      experience_years: data.minExperience || 0,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.jobs.push(job);
    db.activity_log.push({
      id: uuidv4(),
      user_id: employerId,
      action: 'job_created',
      entity_type: 'job',
      entity_id: job.id,
      metadata: { title: job.title },
      created_at: new Date().toISOString(),
    });
    write(db);
    const counts = {};
    return mapJob(job, db.users, counts);
  },

  async listApplications({ jobId, applicantId, employerId } = {}) {
    const db = read();
    let apps = db.applications;
    if (jobId) apps = apps.filter((a) => a.job_id === jobId);
    if (applicantId) apps = apps.filter((a) => a.applicant_id === applicantId);
    if (employerId) {
      const jobIds = new Set(db.jobs.filter((j) => j.employer_id === employerId).map((j) => j.id));
      apps = apps.filter((a) => jobIds.has(a.job_id));
    }
    return apps.map((a) => mapApplication(a, db.users, db.jobs, db.ai_analyses));
  },

  async getApplication(id) {
    const db = read();
    const app = db.applications.find((a) => a.id === id);
    return app ? mapApplication(app, db.users, db.jobs, db.ai_analyses) : null;
  },

  async createApplication(applicantId, data) {
    const db = read();
    if (db.applications.some((a) => a.job_id === data.jobId && a.applicant_id === applicantId)) {
      throw new Error('You have already applied to this job');
    }
    const now = new Date().toISOString();
    const app = {
      id: uuidv4(),
      job_id: data.jobId,
      applicant_id: applicantId,
      status: 'applied',
      cover_letter: data.coverLetter || null,
      resume_url: data.resumeUrl || null,
      transcript_url: data.transcriptUrl || null,
      certificates_url: data.certificatesUrl || [],
      applied_at: now,
      updated_at: now,
    };
    db.applications.push(app);
    const job = db.jobs.find((j) => j.id === data.jobId);
    const applicant = db.users.find((u) => u.id === applicantId);
    db.activity_log.push({
      id: uuidv4(),
      user_id: applicantId,
      action: 'application_submitted',
      entity_type: 'application',
      entity_id: app.id,
      metadata: { jobTitle: job?.title, applicantName: applicant?.full_name },
      created_at: now,
    });
    write(db);
    return mapApplication(app, db.users, db.jobs, db.ai_analyses);
  },

  async updateApplicationStatus(id, status, userId) {
    const db = read();
    const app = db.applications.find((a) => a.id === id);
    if (!app) throw new Error('Application not found');
    const reverseMap = {
      submitted: 'applied',
      interview_scheduled: 'interview',
    };
    app.status = reverseMap[status] || status;
    app.updated_at = new Date().toISOString();
    const job = db.jobs.find((j) => j.id === app.job_id);
    const applicant = db.users.find((u) => u.id === app.applicant_id);
    db.activity_log.push({
      id: uuidv4(),
      user_id: userId,
      action: 'status_updated',
      entity_type: 'application',
      entity_id: app.id,
      metadata: { status: app.status, jobTitle: job?.title, applicantName: applicant?.full_name },
      created_at: app.updated_at,
    });
    write(db);
    return mapApplication(app, db.users, db.jobs, db.ai_analyses);
  },

  async saveAnalysis(analysis) {
    const db = read();
    const idx = db.ai_analyses.findIndex((a) => a.application_id === analysis.application_id);
    const record = {
      id: idx >= 0 ? db.ai_analyses[idx].id : uuidv4(),
      application_id: analysis.application_id,
      job_id: analysis.job_id,
      overall_score: analysis.overall_score,
      skills_match: analysis.skills_match,
      education_match: analysis.education_match,
      experience_match: analysis.experience_match,
      ai_summary: analysis.ai_summary,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      recommendation: analysis.recommendation,
      analyzed_at: new Date().toISOString(),
      model_version: analysis.model_version || 'local',
    };
    if (idx >= 0) db.ai_analyses[idx] = record;
    else db.ai_analyses.push(record);

    const app = db.applications.find((a) => a.id === analysis.application_id);
    if (app && ['applied', 'submitted'].includes(app.status)) {
      app.status = 'ai_screening';
      app.updated_at = new Date().toISOString();
    }
    write(db);
    return record;
  },

  async getAnalysesForJob(jobId) {
    const db = read();
    return db.ai_analyses.filter((a) => a.job_id === jobId);
  },

  async getActivity(employerId) {
    const db = read();
    const jobIds = new Set(db.jobs.filter((j) => j.employer_id === employerId).map((j) => j.id));
    return db.activity_log
      .filter((log) => {
        if (log.entity_type === 'job') return jobIds.has(log.entity_id);
        if (log.entity_type === 'application') {
          const app = db.applications.find((a) => a.id === log.entity_id);
          return app && jobIds.has(app.job_id);
        }
        return false;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map((log) => {
        const app = log.entity_type === 'application'
          ? db.applications.find((a) => a.id === log.entity_id)
          : null;
        const job = app
          ? db.jobs.find((j) => j.id === app.job_id)
          : db.jobs.find((j) => j.id === log.entity_id);
        const applicant = app ? db.users.find((u) => u.id === app.applicant_id) : null;
        return {
          applicationId: app?.id,
          applicantName: log.metadata?.applicantName || applicant?.full_name || 'Unknown',
          jobTitle: log.metadata?.jobTitle || job?.title || 'Unknown',
          stageLabel: app ? stageLabel(app.status) : 'Job Update',
          updatedAt: log.created_at,
        };
      });
  },

  async adminStats() {
    const db = read();
    const employers = db.users.filter((u) => u.role === 'employer').length;
    const applicants = db.users.filter((u) => u.role === 'applicant').length;
    const openJobs = db.jobs.filter((j) => j.status === 'open').length;
    const shortlisted = db.applications.filter((a) => a.status === 'shortlisted').length;
    const analyzed = db.ai_analyses.length;
    const avgAppsPerJob = db.jobs.length
      ? Math.round((db.applications.length / db.jobs.length) * 10) / 10
      : 0;
    return {
      totalUsers: db.users.length,
      employers,
      applicants,
      totalJobs: db.jobs.length,
      openJobs,
      totalApplications: db.applications.length,
      analyzedApplications: analyzed,
      shortlistedTotal: shortlisted,
      avgAppsPerJob,
    };
  },

  async employerStats(employerId) {
    const db = read();
    const jobs = db.jobs.filter((j) => j.employer_id === employerId);
    const jobIds = new Set(jobs.map((j) => j.id));
    const apps = db.applications.filter((a) => jobIds.has(a.job_id));
    const byStage = {};
    apps.forEach((a) => {
      const s = mapStatus(a.status);
      byStage[s] = (byStage[s] || 0) + 1;
    });
    const shortlisted = apps.filter((a) => a.status === 'shortlisted').length;
    const pending = apps.filter((a) => ['applied', 'submitted', 'ai_screening'].includes(a.status)).length;
    const analyzed = db.ai_analyses.filter((a) => jobIds.has(a.job_id)).length;
    const shortlistRate = apps.length ? Math.round((shortlisted / apps.length) * 100) : 0;
    return {
      activeJobs: jobs.filter((j) => j.status === 'open').length,
      totalApplications: apps.length,
      pendingReview: pending,
      shortlisted,
      analyzed,
      shortlistRate,
      byStage,
    };
  },

  async getPipeline(jobId) {
    const db = read();
    const stages = ['submitted', 'ai_screening', 'shortlisted', 'interview_scheduled', 'hired', 'rejected'];
    const apps = db.applications.filter((a) => a.job_id === jobId);
    const pipeline = {};
    stages.forEach((s) => { pipeline[s] = []; });
    apps.forEach((a) => {
      const status = mapStatus(a.status);
      if (pipeline[status]) pipeline[status].push(mapApplication(a, db.users, db.jobs, db.ai_analyses));
      else pipeline.submitted.push(mapApplication(a, db.users, db.jobs, db.ai_analyses));
    });
    return { pipeline };
  },
};

module.exports = localStore;
