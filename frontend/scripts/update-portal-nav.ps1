$employerNav = @'
      <span class="sidebar-badge">Employer Portal</span>
      <nav class="sidebar-nav">
        <a href="dashboard.html" data-page="dashboard"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span> Dashboard</a>
        <a href="create-job.html" data-page="create-job"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span> Post Job</a>
        <a href="candidates.html" data-page="candidates"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Candidates</a>
        <a href="shortlist.html" data-page="shortlist"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span> Shortlisting</a>
        <a href="rankings.html" data-page="rankings"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 17l-6.5 3.5 2-7L2 9h7z"/></svg></span> AI Rankings</a>
        <a href="reports.html" data-page="reports"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg></span> Reports</a>
      </nav>
'@

$applicantNav = @'
      <span class="sidebar-badge">Applicant Portal</span>
      <nav class="sidebar-nav">
        <a href="dashboard.html" data-page="dashboard"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span> Dashboard</a>
        <a href="jobs.html" data-page="jobs"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></span> Browse Jobs</a>
        <a href="applications.html" data-page="applications"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/></svg></span> My Applications</a>
        <a href="profile.html" data-page="profile"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Profile</a>
      </nav>
'@

$adminNav = @'
      <span class="sidebar-badge">Admin Portal</span>
      <nav class="sidebar-nav">
        <a href="dashboard.html" data-page="dashboard"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span> Dashboard</a>
        <a href="users.html" data-page="users"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Users</a>
        <a href="jobs.html" data-page="jobs"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></span> Jobs</a>
        <a href="analytics.html" data-page="analytics"><span class="nav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg></span> Analytics</a>
      </nav>
'@

function Update-PortalFiles($dir, $nav, $portalClass) {
  Get-ChildItem $dir -Filter "*.html" | ForEach-Object {
    $c = Get-Content $_.FullName -Raw
    $c = $c -replace '<body>', "<body class=`"$portalClass`">"
    if ($c -notmatch 'logo-icon\.svg" type="image/svg') {
      $c = $c -replace '(<title>[^<]+</title>)', "`$1`n  <link rel=`"icon`" href=`"../assets/images/logo-icon.svg`" type=`"image/svg+xml`" />"
    }
    if ($c -notmatch 'portal-ui\.js') {
      $c = $c -replace '(<script src="\.\./scripts/loader\.js"></script>)', "`$1`n  <script src=`"../scripts/portal-ui.js`"></script>"
    }
    $c = $c -replace '(?s)<nav class="sidebar-nav">.*?</nav>', $nav.Trim()
    Set-Content $_.FullName -Value $c -NoNewline
  }
}

Update-PortalFiles "C:\Users\HP\Desktop\REQRUITIQ\frontend\employer" $employerNav "portal-employer"
Update-PortalFiles "C:\Users\HP\Desktop\REQRUITIQ\frontend\applicant" $applicantNav "portal-applicant"
Update-PortalFiles "C:\Users\HP\Desktop\REQRUITIQ\frontend\admin" $adminNav "portal-admin"
