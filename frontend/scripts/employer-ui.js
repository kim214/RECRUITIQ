const STAGE_ACTIONS = {
  submitted: [
    { status: 'ai_screening', label: 'Send to AI Screening', class: 'btn-accent' },
    { status: 'shortlisted', label: 'Shortlist', class: 'btn-success' },
    { status: 'rejected', label: 'Reject', class: 'btn-danger' },
  ],
  ai_screening: [
    { status: 'shortlisted', label: 'Shortlist', class: 'btn-success' },
    { status: 'rejected', label: 'Reject', class: 'btn-danger' },
  ],
  shortlisted: [
    { status: 'interview_scheduled', label: 'Schedule Interview', class: 'btn-primary' },
    { status: 'rejected', label: 'Reject', class: 'btn-danger' },
  ],
  interview_scheduled: [
    { status: 'hired', label: 'Mark Hired', class: 'btn-success' },
    { status: 'rejected', label: 'Reject', class: 'btn-danger' },
  ],
};

function setupSearchAndFilters(apps, listEl) {
  const search = document.getElementById('candidate-search');
  const pills = document.querySelectorAll('.filter-pill');
  let filter = 'all';

  function render(filtered) {
    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>No candidates match your filters.</p></div>';
      return;
    }
    listEl.innerHTML = `<table class="data-table"><thead><tr>
      <th>Name</th><th>Email</th><th>Status</th><th>AI Score</th><th>Actions</th>
    </tr></thead><tbody>
      ${filtered.map((a) => `<tr>
        <td><strong>${a.applicantName}</strong></td>
        <td>${a.applicantEmail}</td>
        <td><span class="badge badge-info">${a.stageLabel}</span></td>
        <td>${a.aiScore != null ? `<strong>${Math.round(a.aiScore)}%</strong>` : '—'}</td>
        <td><button class="btn btn-sm btn-outline" data-view="${a.id}">View</button></td>
      </tr>`).join('')}
    </tbody></table>`;
    listEl.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => openCandidateModal(btn.dataset.view));
    });
  }

  function apply() {
    const q = (search?.value || '').toLowerCase();
    let filtered = apps;
    if (filter !== 'all') filtered = filtered.filter((a) => a.status === filter);
    if (q) filtered = filtered.filter((a) =>
      a.applicantName.toLowerCase().includes(q) || a.applicantEmail.toLowerCase().includes(q));
    render(filtered);
  }

  if (search) search.addEventListener('input', apply);
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      filter = pill.dataset.filter;
      apply();
    });
  });
  apply();
}

function renderKanban(pipeline, boardEl, jobId) {
  const columns = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'ai_screening', label: 'AI Screening' },
    { key: 'shortlisted', label: 'Shortlisted' },
    { key: 'interview_scheduled', label: 'Interview' },
    { key: 'hired', label: 'Hired' },
    { key: 'rejected', label: 'Rejected' },
  ];

  boardEl.innerHTML = columns.map((col) => {
    const cards = pipeline[col.key] || [];
    return `<div class="kanban-column">
      <h3>${col.label} <span class="badge badge-primary">${cards.length}</span></h3>
      ${cards.map((c) => `<div class="kanban-card" data-id="${c.id}">
        <div class="name">${c.applicantName}</div>
        <div class="meta">${c.applicantEmail}</div>
        ${c.aiScore != null ? `<div class="score-bar"><div class="score-bar-fill" style="width:${c.aiScore}%"></div></div>` : ''}
      </div>`).join('') || '<p style="font-size:0.8rem;color:var(--text-muted)">Empty</p>'}
    </div>`;
  }).join('');

  boardEl.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('click', () => openCandidateModal(card.dataset.id));
  });
}

async function openCandidateModal(applicationId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-header"><h2>Candidate</h2><button class="btn btn-ghost btn-sm" id="modal-close">✕</button></div>
    <div class="modal-body" id="modal-body">${loaderMarkup({ message: 'Loading candidate...' })}</div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#modal-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  try {
    const app = await api.getApplication(applicationId);
    const actions = STAGE_ACTIONS[app.status] || [];
    const analysis = app.analysis;

    overlay.querySelector('#modal-body').innerHTML = `
        <p><strong>Email:</strong> ${app.applicantEmail}</p>
        <p><strong>Job:</strong> ${app.jobTitle}</p>
        <p><strong>Status:</strong> <span class="badge badge-info">${app.stageLabel}</span></p>
        ${analysis?.documentsReviewed?.length ? `<p><strong>Documents reviewed:</strong> ${analysis.documentsReviewed.join(', ')}</p>` : ''}
        ${analysis?.documentsFailed?.length ? `<p style="color:var(--warning,#b45309)"><strong>Could not read:</strong> ${analysis.documentsFailed.join(', ')}</p>` : ''}
        ${app.coverLetter ? `<p><strong>Cover Letter:</strong><br>${app.coverLetter}</p>` : ''}
        <div class="doc-links" style="margin:0.75rem 0">
          ${app.resumeUrl ? `<a href="${app.resumeUrl}" target="_blank" class="btn btn-sm btn-outline">📄 Resume</a>` : ''}
          ${app.transcriptUrl ? `<a href="${app.transcriptUrl}" target="_blank" class="btn btn-sm btn-outline">🎓 Transcript</a>` : ''}
          ${(app.certificatesUrl || []).map((u, i) => `<a href="${u}" target="_blank" class="btn btn-sm btn-outline">📜 Cert ${i + 1}</a>`).join('')}
        </div>
        ${app.aiScore != null ? `
          <div class="ai-breakdown">
            <h4>AI Match Score: ${Math.round(app.aiScore)}%</h4>
            ${analysis?.summary ? `<p>${analysis.summary}</p>` : (analysis?.aiSummary ? `<p>${analysis.aiSummary}</p>` : '')}
            ${analysis?.skillsMatch ? `<p><strong>Skills (${Math.round(analysis.skillsMatch.score ?? analysis.skillsMatchScore ?? 0)}%):</strong>
              ${(analysis.skillsMatch.matched || []).map((s) => `<span class="ai-tag match">${s}</span>`).join('')}
              ${(analysis.skillsMatch.partial || []).map((s) => `<span class="ai-tag partial">${s} (partial)</span>`).join('')}
              ${(analysis.skillsMatch.missing || []).map((s) => `<span class="ai-tag miss">${s}</span>`).join('')}
            </p>` : ''}
            ${analysis?.experienceMatch?.details ? `<p><strong>Experience (${Math.round(analysis.experienceMatch.score ?? 0)}%):</strong> ${analysis.experienceMatch.details}</p>` : ''}
            ${analysis?.educationMatch?.details ? `<p><strong>Education (${Math.round(analysis.educationMatch.score ?? 0)}%):</strong> ${analysis.educationMatch.details}</p>` : ''}
            ${analysis?.strengths?.length ? `<p><strong>Strengths:</strong> ${analysis.strengths.join('; ')}</p>` : ''}
            ${analysis?.weaknesses?.length ? `<p><strong>Gaps:</strong> ${analysis.weaknesses.join('; ')}</p>` : ''}
          </div>` : '<p style="color:var(--text-muted)">Not yet analyzed by AI. Run AI Rankings first.</p>'}`;

    overlay.querySelector('.modal').insertAdjacentHTML('beforeend', `
      <div class="modal-footer">
        ${actions.map((a) => `<button class="btn btn-sm ${a.class}" data-status="${a.status}">${a.label}</button>`).join('')}
        <button class="btn btn-sm btn-accent" id="analyze-one">Analyze with AI</button>
      </div>`);

    overlay.querySelector('.modal-header h2').textContent = app.applicantName;

    overlay.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api.updateApplicationStatus(applicationId, btn.dataset.status);
        overlay.remove();
        if (window.onCandidateUpdated) window.onCandidateUpdated();
      });
    });

    const analyzeBtn = overlay.querySelector('#analyze-one');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', async () => {
        setButtonLoading(analyzeBtn, true, 'Analyze with AI', 'Analyzing...');
        await api.analyzeApplication(applicationId);
        overlay.remove();
        openCandidateModal(applicationId);
        if (window.onCandidateUpdated) window.onCandidateUpdated();
      });
    }
  } catch (e) {
    overlay.remove();
    alert(e.message);
  }
}
