const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

let supabase;

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
    submitted: 'Submitted', applied: 'Submitted', ai_screening: 'AI Screening',
    shortlisted: 'Shortlisted', interview_scheduled: 'Interview', interview: 'Interview',
    hired: 'Hired', rejected: 'Rejected',
  };
  return labels[status] || status;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    full_name: row.full_name,
    role: row.role,
    company: row.company,
    phone: row.phone,
    createdAt: row.created_at,
    created_at: row.created_at,
    password_hash: row.password_hash,
  };
}

function mapJob(row, employerName, appCount) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    employmentType: row.employment_type,
    employment_type: row.employment_type,
    requiredSkills: row.required_skills,
    required_skills: row.required_skills,
    requiredEducation: row.required_education,
    required_education: row.required_education,
    requiredCertifications: row.required_certifications,
    required_certifications: row.required_certifications,
    minExperience: row.experience_years,
    experience_years: row.experience_years,
    status: row.status,
    employerId: row.employer_id,
    employer_id: row.employer_id,
    employerName: employerName || 'Unknown',
    applicationCount: appCount || 0,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

function mapApplication(row, applicant, job, analysis) {
  const status = mapStatus(row.status);
  return {
    id: row.id,
    jobId: row.job_id,
    job_id: row.job_id,
    jobTitle: job?.title || 'Unknown',
    applicantId: row.applicant_id,
    applicant_id: row.applicant_id,
    applicantName: applicant?.full_name || 'Unknown',
    applicantEmail: applicant?.email || '',
    status,
    stageLabel: stageLabel(row.status),
    coverLetter: row.cover_letter,
    cover_letter: row.cover_letter,
    resumeUrl: row.resume_url,
    resume_url: row.resume_url,
    transcriptUrl: row.transcript_url,
    certificatesUrl: row.certificates_url,
    aiScore: analysis?.overall_score ?? null,
    aiSummary: analysis?.ai_summary ?? null,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
    analysis: analysis ? {
      overallScore: analysis.overall_score,
      skillsMatch: analysis.skills_match,
      educationMatch: analysis.education_match,
      experienceMatch: analysis.experience_match,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      recommendation: analysis.recommendation,
      summary: analysis.ai_summary,
      documentsReviewed: analysis.skills_match?.documentsReviewed || analysis.documents_reviewed || [],
      documentsFailed: analysis.skills_match?.documentsFailed || analysis.documents_failed || [],
    } : null,
  };
}

const supabaseStore = {
  mode: 'supabase',

  async init() {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
  },

  async findUserByEmail(email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findUserById(id) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async createUser({ email, password, fullName, role, company }) {
    const existing = await this.findUserByEmail(email);
    if (existing) throw new Error('Email already registered');
    const id = uuidv4();
    const { error } = await supabase.from('profiles').insert({
      id,
      email: email.toLowerCase(),
      password_hash: bcrypt.hashSync(password, 10),
      full_name: fullName,
      role,
      company: company || null,
    });
    if (error) throw error;
    return mapUser(await this.findUserById(id));
  },

  async verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  },

  async listUsers() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapUser);
  },

  async listJobs({ employerId, status, openOnly } = {}) {
    let query = supabase.from('jobs').select('*');
    if (employerId) query = query.eq('employer_id', employerId);
    if (status) query = query.eq('status', status);
    if (openOnly) query = query.eq('status', 'open');
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const { data: apps } = await supabase.from('applications').select('job_id');
    const counts = {};
    (apps || []).forEach((a) => { counts[a.job_id] = (counts[a.job_id] || 0) + 1; });

    const employerIds = [...new Set((data || []).map((j) => j.employer_id))];
    const { data: employers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', employerIds.length ? employerIds : ['00000000-0000-0000-0000-000000000000']);
    const employerMap = Object.fromEntries((employers || []).map((e) => [e.id, e.full_name]));

    return (data || []).map((j) => mapJob(j, employerMap[j.employer_id], counts[j.id]));
  },

  async getJob(id) {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('job_id', id);
    const employer = await this.findUserById(data.employer_id);
    return mapJob(data, employer?.full_name, count || 0);
  },

  async employerOwnsJob(employerId, jobId) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, employer_id')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw error;
    return !!data && data.employer_id === employerId;
  },

  async createJob(employerId, data) {
    const { data: row, error } = await supabase.from('jobs').insert({
      employer_id: employerId,
      title: data.title,
      description: data.description,
      location: data.location || null,
      employment_type: data.employmentType || 'full-time',
      required_skills: data.requiredSkills || [],
      required_education: data.requiredEducation || null,
      required_certifications: data.requiredCertifications || [],
      experience_years: data.minExperience || 0,
      status: 'open',
    }).select().single();
    if (error) throw error;
    return mapJob(row, null, 0);
  },

  async listApplications({ jobId, applicantId, employerId } = {}) {
    let query = supabase.from('applications').select('*');
    if (jobId) query = query.eq('job_id', jobId);
    if (applicantId) query = query.eq('applicant_id', applicantId);
    const { data: apps, error } = await query.order('applied_at', { ascending: false });
    if (error) throw error;

    if (!apps?.length) return [];

    const jobIds = [...new Set(apps.map((a) => a.job_id))];
    const applicantIds = [...new Set(apps.map((a) => a.applicant_id))];
    const appIds = apps.map((a) => a.id);

    const [{ data: jobs }, { data: users }, { data: analyses }] = await Promise.all([
      supabase.from('jobs').select('id, title, employer_id').in('id', jobIds),
      supabase.from('profiles').select('id, full_name, email').in('id', applicantIds),
      supabase.from('ai_analyses').select('*').in('application_id', appIds),
    ]);

    let filtered = apps;
    if (employerId) {
      const employerJobIds = new Set((jobs || []).filter((j) => j.employer_id === employerId).map((j) => j.id));
      filtered = apps.filter((a) => employerJobIds.has(a.job_id));
    }

    const jobMap = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
    const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    const analysisMap = Object.fromEntries((analyses || []).map((a) => [a.application_id, a]));

    return filtered.map((a) => mapApplication(a, userMap[a.applicant_id], jobMap[a.job_id], analysisMap[a.id]));
  },

  async getApplication(id) {
    const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [applicant, job, analysis] = await Promise.all([
      this.findUserById(data.applicant_id),
      this.getJob(data.job_id),
      supabase.from('ai_analyses').select('*').eq('application_id', id).maybeSingle().then((r) => r.data),
    ]);
    return mapApplication(data, applicant, job, analysis);
  },

  async createApplication(applicantId, data) {
    const { data: row, error } = await supabase.from('applications').insert({
      job_id: data.jobId,
      applicant_id: applicantId,
      cover_letter: data.coverLetter || null,
      resume_url: data.resumeUrl || null,
      transcript_url: data.transcriptUrl || null,
      certificates_url: data.certificatesUrl || [],
      status: 'applied',
    }).select().single();
    if (error) {
      if (error.code === '23505') throw new Error('You have already applied to this job');
      throw error;
    }
    return this.getApplication(row.id);
  },

  async updateApplicationStatus(id, status, userId) {
    const reverseMap = { submitted: 'applied', interview_scheduled: 'interview' };
    const dbStatus = reverseMap[status] || status;
    const { error } = await supabase.from('applications').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return this.getApplication(id);
  },

  async saveAnalysis(analysis) {
    const { data: existing } = await supabase.from('ai_analyses').select('id').eq('application_id', analysis.application_id).maybeSingle();
    const payload = {
      application_id: analysis.application_id,
      job_id: analysis.job_id,
      overall_score: analysis.overall_score,
      skills_match: {
        ...(analysis.skills_match || {}),
        documentsReviewed: analysis.documents_reviewed || [],
        documentsFailed: analysis.documents_failed || [],
      },
      education_match: analysis.education_match,
      experience_match: analysis.experience_match,
      ai_summary: analysis.ai_summary,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      recommendation: analysis.recommendation,
      model_version: analysis.model_version || 'gpt-4o',
    };
    if (existing) {
      const { data, error } = await supabase.from('ai_analyses').update(payload).eq('id', existing.id).select().single();
      if (error) throw error;
      await supabase.from('applications').update({ status: 'ai_screening' }).eq('id', analysis.application_id).in('status', ['applied']);
      return data;
    }
    const { data, error } = await supabase.from('ai_analyses').insert(payload).select().single();
    if (error) throw error;
    await supabase.from('applications').update({ status: 'ai_screening' }).eq('id', analysis.application_id).in('status', ['applied']);
    return data;
  },

  async getAnalysesForJob(jobId) {
    const { data, error } = await supabase.from('ai_analyses').select('*').eq('job_id', jobId);
    if (error) throw error;
    return data || [];
  },

  async getActivity(employerId) {
    const jobs = await this.listJobs({ employerId });
    const jobIds = jobs.map((j) => j.id);
    const apps = await this.listApplications({ employerId });
    return apps.slice(0, 20).map((a) => ({
      applicationId: a.id,
      applicantName: a.applicantName,
      jobTitle: a.jobTitle,
      stageLabel: a.stageLabel,
      updatedAt: a.updatedAt,
    }));
  },

  async adminStats() {
    const [{ count: totalUsers }, { count: employers }, { count: applicants }, { count: totalJobs }, { count: openJobs }, { count: totalApplications }, { count: analyzed }, { count: shortlisted }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'applicant'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('applications').select('*', { count: 'exact', head: true }),
      supabase.from('ai_analyses').select('*', { count: 'exact', head: true }),
      supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'shortlisted'),
    ]);
    return {
      totalUsers: totalUsers || 0,
      employers: employers || 0,
      applicants: applicants || 0,
      totalJobs: totalJobs || 0,
      openJobs: openJobs || 0,
      totalApplications: totalApplications || 0,
      analyzedApplications: analyzed || 0,
      shortlistedTotal: shortlisted || 0,
      avgAppsPerJob: totalJobs ? Math.round(((totalApplications || 0) / totalJobs) * 10) / 10 : 0,
    };
  },

  async employerStats(employerId) {
    const jobs = await this.listJobs({ employerId });
    const apps = await this.listApplications({ employerId });
    const byStage = {};
    apps.forEach((a) => { byStage[a.status] = (byStage[a.status] || 0) + 1; });
    const shortlisted = apps.filter((a) => a.status === 'shortlisted').length;
    const pending = apps.filter((a) => ['applied', 'submitted', 'ai_screening'].includes(a.status)).length;
    const analyses = await Promise.all(jobs.map((j) => this.getAnalysesForJob(j.id)));
    const analyzed = analyses.flat().length;
    return {
      activeJobs: jobs.filter((j) => j.status === 'open').length,
      totalApplications: apps.length,
      pendingReview: pending,
      shortlisted,
      analyzed,
      shortlistRate: apps.length ? Math.round((shortlisted / apps.length) * 100) : 0,
      byStage,
    };
  },

  async getPipeline(jobId) {
    const apps = await this.listApplications({ jobId });
    const stages = ['submitted', 'ai_screening', 'shortlisted', 'interview_scheduled', 'hired', 'rejected'];
    const pipeline = {};
    stages.forEach((s) => { pipeline[s] = []; });
    apps.forEach((a) => {
      if (pipeline[a.status]) pipeline[a.status].push(a);
      else pipeline.submitted.push(a);
    });
    return { pipeline };
  },
};

module.exports = supabaseStore;
