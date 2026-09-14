function appUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://recruitiq-self.vercel.app').replace(/\/$/, '');
}

function fromAddress() {
  return process.env.MAIL_FROM || 'RecruitIQ <noreply@recruitiq.app>';
}

async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'no-recipient' };

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend email failed:', res.status, body.slice(0, 300));
      return { sent: false, reason: `resend-${res.status}` };
    }
    return { sent: true, provider: 'resend' };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from: fromAddress(), to, subject, html, text });
    return { sent: true, provider: 'smtp' };
  }

  console.log(`[mail skipped — set RESEND_API_KEY or SMTP_*] to=${to} subject=${subject}`);
  return { sent: false, reason: 'not-configured' };
}

function roleLabel(role) {
  return { admin: 'Administrator', employer: 'Employer', applicant: 'Applicant' }[role] || role;
}

async function notifyRoleChanged(user, previousRole, newRole) {
  return sendMail({
    to: user.email,
    subject: `Your RecruitIQ role was updated to ${roleLabel(newRole)}`,
    text: `Hello ${user.fullName || user.full_name || ''},\n\nYour RecruitIQ account role changed from ${roleLabel(previousRole)} to ${roleLabel(newRole)}.\n\nSign in: ${appUrl()}/login\n`,
    html: `<p>Hello ${user.fullName || user.full_name || ''},</p>
      <p>Your RecruitIQ account role was updated from <strong>${roleLabel(previousRole)}</strong> to <strong>${roleLabel(newRole)}</strong>.</p>
      <p>The next time you sign in, you will see the matching portal.</p>
      <p><a href="${appUrl()}/login">Sign in to RecruitIQ</a></p>`,
  });
}

async function notifyAccountCreated(user, temporaryPassword) {
  return sendMail({
    to: user.email,
    subject: 'Your RecruitIQ account is ready',
    text: `Hello ${user.fullName || user.full_name || ''},\n\nAn administrator created a RecruitIQ account for you as ${roleLabel(user.role)}.\nEmail: ${user.email}\nTemporary password: ${temporaryPassword}\n\nSign in: ${appUrl()}/login\nPlease change your password after first login if possible.\n`,
    html: `<p>Hello ${user.fullName || user.full_name || ''},</p>
      <p>An administrator created a RecruitIQ account for you as <strong>${roleLabel(user.role)}</strong>.</p>
      <p>Email: <strong>${user.email}</strong><br/>Temporary password: <strong>${temporaryPassword}</strong></p>
      <p><a href="${appUrl()}/login">Sign in to RecruitIQ</a></p>`,
  });
}

async function notifyAccountStatus(user, banned) {
  const subject = banned ? 'Your RecruitIQ account was suspended' : 'Your RecruitIQ account was reinstated';
  const body = banned
    ? 'An administrator suspended your RecruitIQ account. You will not be able to sign in until it is reinstated.'
    : 'An administrator reinstated your RecruitIQ account. You can sign in again.';
  return sendMail({
    to: user.email,
    subject,
    text: `Hello ${user.fullName || user.full_name || ''},\n\n${body}\n\n${appUrl()}/login\n`,
    html: `<p>Hello ${user.fullName || user.full_name || ''},</p><p>${body}</p><p><a href="${appUrl()}/login">RecruitIQ login</a></p>`,
  });
}

module.exports = {
  sendMail,
  notifyRoleChanged,
  notifyAccountCreated,
  notifyAccountStatus,
};
