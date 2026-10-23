const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { enrichJob, requireFutureDeadline, closedMessage } = require('./jobAvailability');
const { hiringMissingError, mapNotification } = require('./hiring');
const { generateApplicantCode, derivedApplicantCode } = require('./privacy');

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
    status: row.status || 'active',
    company: row.company,
    phone: row.phone,
    applicantCode: row.role === 'applicant' ? (row.applicant_code || derivedApplicantCode(row.id)) : null,
    applicant_code: row.role === 'applicant' ? (row.applicant_code || derivedApplicantCode(row.id)) : null,
    createdAt: row.created_at,
    created_at: row.created_at,
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
    applicationDeadline: row.application_deadline || null,
    application_deadline: row.application_deadline || null,
    requirementProfile: row.requirement_profile || null,
    requirement_profile: row.requirement_profile || null,
    embeddingCache: row.embedding_cache || null,
    embedding_cache: row.embedding_cache || null,
    scoringWeights: row.scoring_weights || null,
    scoring_weights: row.scoring_weights || null,
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
    applicantCode: applicant?.applicant_code || derivedApplicantCode(row.applicant_id),
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
    candidateProfile: row.candidate_profile || null,
    candidate_profile: row.candidate_profile || null,
    supportingDocuments: row.supporting_documents || null,
    supporting_documents: row.supporting_documents || null,
    evidence: row.evidence || null,
    embeddingCache: row.embedding_cache || null,
    embedding_cache: row.embedding_cache || null,
    requirementMatches: row.requirement_matches || null,
    requirement_matches: row.requirement_matches || null,
    scoreBreakdown: row.score_breakdown || null,
    score_breakdown: row.score_breakdown || null,
    analysisStatus: row.analysis_status || null,
    analysis_status: row.analysis_status || null,
    aiScore: row.score_breakdown?.overall_score ?? analysis?.overall_score ?? null,
    aiSummary: analysis?.ai_summary ?? null,
    appliedAt: row.applied_at,
    createdAt: row.applied_at,
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
      documentsReviewed: analysis.skills_match?.documentsReviewed || analysis.documents_reviewed || analysis.analysis_audit?.documents?.analyzed || [],
      documentsFailed: analysis.skills_match?.documentsFailed || analysis.documents_failed || analysis.analysis_audit?.documents?.failed || [],
      semanticMatch: analysis.skills_match?.semanticMatch || analysis.semantic_match || null,
      scoreBreakdown: analysis.score_breakdown || analysis.skills_match?.scoreBreakdown || row.score_breakdown || null,
      matchLabel: analysis.score_breakdown?.match_label || analysis.skills_match?.scoreBreakdown?.match_label || row.score_breakdown?.match_label || null,
      modelVersion: analysis.model_version || analysis.analysis_audit?.model || null,
      analysisVersion: analysis.analysis_version || analysis.analysis_audit?.analysis_version || null,
      scoringVersion: analysis.scoring_version || analysis.analysis_audit?.scoring_version || null,
      embeddingModel: analysis.embedding_model || analysis.analysis_audit?.embedding_model || null,
      analyzedAt: analysis.analyzed_at || analysis.analysis_audit?.timestamp || null,
      audit: analysis.analysis_audit || null,
    } : null,
  };
}

const supabaseStore = {
  mode: 'supabase',

  async init() {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    await this.ensureApplicantCodes().catch((err) => {
      console.warn('Applicant ID backfill skipped:', err.message);
    });
  },

  async ensureApplicantCodes() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, applicant_code')
      .eq('role', 'applicant');
    if (error) {
      if (/applicant_code|schema cache/i.test(String(error.message || ''))) {
        throw new Error('Database is missing applicant_code. Run supabase/add-applicant-code.sql in the SQL Editor.');
      }
      throw error;
    }
    const missing = (data || []).filter((row) => !row.applicant_code);
    let updated = 0;
    for (const row of missing) {
      const code = derivedApplicantCode(row.id);
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ applicant_code: code })
        .eq('id', row.id);
      if (!upErr) {
        updated += 1;
        row.applicant_code = code;
      }
    }
    if (updated) {
      console.log(`Assigned applicant IDs to ${updated} existing applicant(s)`);
    }
    return { total: (data || []).length, updated };
  },

  async findUserByEmail(email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    if (data?.role === 'applicant' && !data.applicant_code) {
      const code = derivedApplicantCode(data.id);
      const { error: codeErr } = await supabase.from('profiles').update({ applicant_code: code }).eq('id', data.id);
      if (!codeErr) data.applicant_code = code;
    }
    return data;
  },

  async findUserById(id) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (data?.role === 'applicant' && !data.applicant_code) {
      const code = derivedApplicantCode(data.id);
      const { error: codeErr } = await supabase.from('profiles').update({ applicant_code: code }).eq('id', data.id);
      if (!codeErr) data.applicant_code = code;
    }
    return data;
  },

  async createUser({ email, password, fullName, role, company }) {
    const existing = await this.findUserByEmail(email);
    if (existing) throw new Error('Email already registered');
    const id = uuidv4();
    const payload = {
      id,
      email: email.toLowerCase(),
      password_hash: bcrypt.hashSync(password, 10),
      full_name: fullName,
      role,
      status: 'active',
      company: company || null,
    };
    if (role === 'applicant') payload.applicant_code = generateApplicantCode();
    let { error } = await supabase.from('profiles').insert(payload);
    if (error && /applicant_code/i.test(String(error.message || ''))) {
      delete payload.applicant_code;
      ({ error } = await supabase.from('profiles').insert(payload));
    }
    if (error && /status/i.test(String(error.message || ''))) {
      delete payload.status;
      ({ error } = await supabase.from('profiles').insert(payload));
    }
    if (error && /applicant_code/i.test(String(error.message || ''))) {
      delete payload.applicant_code;
      ({ error } = await supabase.from('profiles').insert(payload));
    }
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

  async updateUser(id, patch) {
    const current = await this.findUserById(id);
    if (!current) throw new Error('User not found');
    const updates = { updated_at: new Date().toISOString() };
    if (patch.fullName != null) updates.full_name = patch.fullName;
    if (patch.role != null) updates.role = patch.role;
    if (patch.company != null) updates.company = patch.company;
    if (patch.status != null) updates.status = patch.status;
    if (patch.password) updates.password_hash = bcrypt.hashSync(patch.password, 10);
    let { error } = await supabase.from('profiles').update(updates).eq('id', id);
    if (error && String(error.message || '').includes('status')) {
      delete updates.status;
      ({ error } = await supabase.from('profiles').update(updates).eq('id', id));
    }
    if (error) throw error;
    return mapUser(await this.findUserById(id));
  },

  async deleteUser(id) {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  },

  async updateJob(id, patch) {
    const updates = { updated_at: new Date().toISOString() };
    if (patch.status) updates.status = patch.status;
    if (patch.title) updates.title = patch.title;
    if (patch.applicationDeadline !== undefined) updates.application_deadline = patch.applicationDeadline || null;
    if (patch.requirementProfile !== undefined) updates.requirement_profile = patch.requirementProfile;
    if (patch.requiredSkills) updates.required_skills = patch.requiredSkills;
    if (patch.embeddingCache !== undefined) updates.embedding_cache = patch.embeddingCache;
    if (patch.scoringWeights !== undefined) updates.scoring_weights = patch.scoringWeights;
    const { error } = await supabase.from('jobs').update(updates).eq('id', id);
    if (error && /requirement_profile/i.test(String(error.message || ''))) {
      throw new Error('Database is missing requirement_profile. Run supabase/add-job-requirement-profile.sql in the SQL Editor.');
    }
    if (error && /embedding_cache/i.test(String(error.message || ''))) {
      throw new Error('Database is missing embedding_cache. Run supabase/add-embedding-cache.sql in the SQL Editor.');
    }
    if (error && /scoring_weights/i.test(String(error.message || ''))) {
      throw new Error('Database is missing scoring_weights. Run supabase/add-scoring-engine.sql in the SQL Editor.');
    }
    if (error) throw error;
    return this.getJob(id);
  },

  async deleteJob(id) {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  },

  async closeExpiredJobs() {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'closed', updated_at: now })
      .eq('status', 'open')
      .not('application_deadline', 'is', null)
      .lt('application_deadline', now);
    if (error && /application_deadline/i.test(String(error.message || ''))) return;
    if (error) console.warn('closeExpiredJobs:', error.message);
  },

  async listJobs({ employerId, status, openOnly, excludeDraft } = {}) {
    await this.closeExpiredJobs();
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

    let jobs = (data || []).map((j) => enrichJob(mapJob(j, employerMap[j.employer_id], counts[j.id])));
    if (excludeDraft) jobs = jobs.filter((j) => j.status !== 'draft');
    return jobs;
  },

  async getJob(id) {
    await this.closeExpiredJobs();
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('job_id', id);
    const employer = await this.findUserById(data.employer_id);
    return enrichJob(mapJob(data, employer?.full_name, count || 0));
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
    const deadline = requireFutureDeadline(data.applicationDeadline || data.application_deadline);
    const payload = {
      employer_id: employerId,
      title: data.title,
      description: data.description,
      location: data.location || null,
      employment_type: data.employmentType || 'full-time',
      required_skills: data.requiredSkills || [],
      required_education: data.requiredEducation || null,
      required_certifications: data.requiredCertifications || [],
      experience_years: data.minExperience || 0,
      application_deadline: deadline,
      status: 'open',
    };
    const { data: row, error } = await supabase.from('jobs').insert(payload).select().single();
    if (error && /application_deadline/i.test(String(error.message || ''))) {
      throw new Error('Database is missing application_deadline. Run supabase/add-job-deadline.sql in the SQL Editor.');
    }
    if (error) throw error;
    return enrichJob(mapJob(row, null, 0));
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
      supabase.from('profiles').select('id, full_name, email, applicant_code, phone').in('id', applicantIds),
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
    await this.closeExpiredJobs();
    const job = await this.getJob(data.jobId);
    if (!job) throw new Error('Job not found');
    const blocked = closedMessage(job);
    if (blocked) throw new Error(blocked);
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

  async updateApplication(id, patch) {
    const updates = { updated_at: new Date().toISOString() };
    if (patch.candidateProfile !== undefined) updates.candidate_profile = patch.candidateProfile;
    if (patch.supportingDocuments !== undefined) updates.supporting_documents = patch.supportingDocuments;
    if (patch.evidence !== undefined) updates.evidence = patch.evidence;
    if (patch.embeddingCache !== undefined) updates.embedding_cache = patch.embeddingCache;
    if (patch.requirementMatches !== undefined) updates.requirement_matches = patch.requirementMatches;
    if (patch.scoreBreakdown !== undefined) updates.score_breakdown = patch.scoreBreakdown;
    if (patch.analysisStatus !== undefined) updates.analysis_status = patch.analysisStatus;
    const { error } = await supabase.from('applications').update(updates).eq('id', id);
    if (error && /candidate_profile/i.test(String(error.message || ''))) {
      throw new Error('Database is missing candidate_profile. Run supabase/add-candidate-profile.sql in the SQL Editor.');
    }
    if (error && /supporting_documents/i.test(String(error.message || ''))) {
      throw new Error('Database is missing supporting_documents. Run supabase/add-supporting-documents.sql in the SQL Editor.');
    }
    if (error && /column .*evidence/i.test(String(error.message || ''))) {
      throw new Error('Database is missing evidence. Run supabase/add-application-evidence.sql in the SQL Editor.');
    }
    if (error && /embedding_cache/i.test(String(error.message || ''))) {
      throw new Error('Database is missing embedding_cache. Run supabase/add-embedding-cache.sql in the SQL Editor.');
    }
    if (error && /requirement_matches/i.test(String(error.message || ''))) {
      throw new Error('Database is missing requirement_matches. Run supabase/add-requirement-matches.sql in the SQL Editor.');
    }
    if (error && /score_breakdown/i.test(String(error.message || ''))) {
      throw new Error('Database is missing score_breakdown. Run supabase/add-scoring-engine.sql in the SQL Editor.');
    }
    if (error && /analysis_status/i.test(String(error.message || ''))) {
      throw new Error('Database is missing analysis_status. Run supabase/add-analysis-status.sql in the SQL Editor.');
    }
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
        semanticMatch: analysis.semantic_match || null,
        scoreBreakdown: analysis.score_breakdown || null,
      },
      education_match: analysis.education_match,
      experience_match: analysis.experience_match,
      ai_summary: analysis.ai_summary,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      recommendation: analysis.recommendation,
      model_version: analysis.model_version || analysis.analysis_audit?.model || 'ollama',
      analysis_version: analysis.analysis_version || analysis.analysis_audit?.analysis_version || null,
      scoring_version: analysis.scoring_version || analysis.analysis_audit?.scoring_version || null,
      embedding_model: analysis.embedding_model || analysis.analysis_audit?.embedding_model || null,
      analysis_audit: analysis.analysis_audit || null,
      analyzed_at: analysis.analyzed_at || analysis.analysis_audit?.timestamp || new Date().toISOString(),
    };
    if (existing) {
      const { data, error } = await supabase.from('ai_analyses').update(payload).eq('id', existing.id).select().single();
      if (error && /analysis_audit|analysis_version|scoring_version|embedding_model/i.test(String(error.message || ''))) {
        throw new Error('Database is missing analysis audit columns. Run supabase/add-analysis-audit.sql in the SQL Editor.');
      }
      if (error) throw error;
      await supabase.from('applications').update({ status: 'ai_screening' }).eq('id', analysis.application_id).in('status', ['applied']);
      return data;
    }
    const { data, error } = await supabase.from('ai_analyses').insert(payload).select().single();
    if (error && /analysis_audit|analysis_version|scoring_version|embedding_model/i.test(String(error.message || ''))) {
      throw new Error('Database is missing analysis audit columns. Run supabase/add-analysis-audit.sql in the SQL Editor.');
    }
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
      applicantId: a.applicantId,
      applicantCode: a.applicantCode,
      applicantName: a.applicantName,
      jobTitle: a.jobTitle,
      stageLabel: a.stageLabel,
      updatedAt: a.updatedAt,
      createdAt: a.updatedAt,
    }));
  },

  async adminStats() {
    const [
      { count: totalUsers },
      { count: employers },
      { count: applicants },
      { count: admins },
      bannedRes,
      { count: totalJobs },
      { count: openJobs },
      { count: totalApplications },
      { count: analyzed },
      { count: shortlisted },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'applicant'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'banned'),
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
      admins: admins || 0,
      bannedUsers: bannedRes.error ? 0 : (bannedRes.count || 0),
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
      activeJobs: jobs.filter((j) => j.acceptingApplications).length,
      totalApplications: apps.length,
      pendingReview: pending,
      shortlisted,
      hired: byStage.hired || 0,
      rejected: byStage.rejected || 0,
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

  async createNotification({ userId, type, title, body, link, meta }) {
    if (!userId) return null;
    const { data, error } = await supabase.from('notifications').insert({
      user_id: userId,
      type: type || 'info',
      title: title || 'Update',
      body: body || '',
      link: link || null,
      meta: meta || null,
    }).select('*').single();
    if (error) throw hiringMissingError(error);
    return mapNotification(data);
  },

  async listNotifications(userId, { unreadOnly = false } = {}) {
    let q = supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (unreadOnly) q = q.is('read_at', null);
    const { data, error } = await q;
    if (error) throw hiringMissingError(error);
    return (data || []).map(mapNotification);
  },

  async markNotificationRead(id, userId) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (error) throw hiringMissingError(error);
    if (!data) throw new Error('Notification not found');
    return mapNotification(data);
  },

  async markAllNotificationsRead(userId) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw hiringMissingError(error);
    return this.listNotifications(userId);
  },

  async createInterview(fields) {
    const payload = {
      ...fields,
      status: fields.status || 'scheduled',
      applicant_rsvp: fields.applicant_rsvp || 'pending',
    };
    const { data, error } = await supabase.from('interviews').insert(payload).select('*').single();
    if (error) throw hiringMissingError(error);
    return data;
  },

  async updateInterview(id, patch) {
    const { data, error } = await supabase
      .from('interviews')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw hiringMissingError(error);
    if (!data) throw new Error('Interview not found');
    return data;
  },

  async getInterview(id) {
    const { data, error } = await supabase.from('interviews').select('*').eq('id', id).maybeSingle();
    if (error) throw hiringMissingError(error);
    return data || null;
  },

  async listInterviews({ employerId, applicantId, applicationId } = {}) {
    let q = supabase.from('interviews').select('*').order('starts_at', { ascending: true });
    if (employerId) q = q.eq('employer_id', employerId);
    if (applicantId) q = q.eq('applicant_id', applicantId);
    if (applicationId) q = q.eq('application_id', applicationId);
    const { data, error } = await q;
    if (error) throw hiringMissingError(error);
    return data || [];
  },

  async listMessages(applicationId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });
    if (error) throw hiringMissingError(error);
    return data || [];
  },

  async createMessage({ applicationId, senderId, body }) {
    const { data, error } = await supabase.from('messages').insert({
      application_id: applicationId,
      sender_id: senderId,
      body,
    }).select('*').single();
    if (error) throw hiringMissingError(error);
    return data;
  },
};

module.exports = supabaseStore;
