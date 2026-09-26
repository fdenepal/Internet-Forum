const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const root = path.join(__dirname, 'public');
const submissionsPath = path.join(__dirname, 'data', 'submissions.jsonl');
const port = Number(process.env.PORT) || 3000;
const maxBodyBytes = 16 * 1024;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};
const allowedTracks = new Set([
  'Access, Infrastructure and Future Connectivity',
  'Data Centres, Digital Transformation & AI Governance',
  'Digital Platform Governance & Trust',
  'Disaster & Emergency Communication Infrastructure',
  'General / cross-track'
]);
const allowedTypes = new Set(['attend', 'speaker', 'session', 'partner']);

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Please submit valid form data.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function validateSubmission(input) {
  const submission = {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    organization: String(input.organization || '').trim(),
    track: String(input.track || '').trim(),
    submissionType: String(input.submissionType || '').trim(),
    message: String(input.message || '').trim()
  };
  const errors = {};

  if (submission.name.length < 2 || submission.name.length > 120) errors.name = 'Enter your full name.';
  if (submission.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) errors.email = 'Enter a valid email address.';
  if (submission.organization.length < 2 || submission.organization.length > 160) errors.organization = 'Enter your organization.';
  if (!allowedTracks.has(submission.track)) errors.track = 'Choose one of the listed tracks.';
  if (!allowedTypes.has(submission.submissionType)) errors.submissionType = 'Choose a submission type.';
  if (submission.message.length > 2000) errors.message = 'Keep your note under 2,000 characters.';

  return { submission, errors };
}

async function deliverSubmission(submission) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpHost && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass }
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || smtpUser,
      to: 'forum@internet.org.np',
      replyTo: submission.email,
      subject: `NIF 2026 ${submission.submissionType} submission: ${submission.name}`,
      text: [
        `Name: ${submission.name}`,
        `Email: ${submission.email}`,
        `Organization: ${submission.organization}`,
        `Track: ${submission.track}`,
        `Submission type: ${submission.submissionType}`,
        `Note: ${submission.message || '(none)'}`
      ].join('\n')
    });
    return 'email';
  }

  await fs.promises.mkdir(path.dirname(submissionsPath), { recursive: true });
  await fs.promises.appendFile(submissionsPath, `${JSON.stringify({ ...submission, receivedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  return 'local';
}

async function handleRegistration(request, response) {
  try {
    const input = await readJson(request);
    if (String(input.website || '').trim()) return sendJson(response, 200, { ok: true, message: 'Thank you. Your submission has been received.' });
    const { submission, errors } = validateSubmission(input);
    if (Object.keys(errors).length) return sendJson(response, 422, { ok: false, errors });

    const delivery = await deliverSubmission(submission);
    const message = delivery === 'email'
      ? 'Thank you. Your submission has been sent to the NIF secretariat.'
      : 'Thank you. Your submission is saved locally; email delivery is not configured on this server yet.';
    sendJson(response, 200, { ok: true, message });
  } catch (error) {
    sendJson(response, error.status || 500, {
      ok: false,
      message: error.status ? error.message : 'We could not receive your submission. Please try again or email forum@internet.org.np.'
    });
  }
}

function serveStatic(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    response.end(contents);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/register') return handleRegistration(request, response);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' }).end();
    return;
  }
  serveStatic(request, response);
});

server.listen(port, () => console.log(`NIF 2026 site running at http://localhost:${port}`));
