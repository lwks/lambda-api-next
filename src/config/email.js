const { isEmailAddress } = require('../utils/emailValidation');

function unavailable(message = 'Email service is not configured') {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function getEmailConfig(env = process.env) {
  const host = env.SMTP_HOST || 'smtp-relay.brevo.com';
  const portValue = env.SMTP_PORT || '587';
  const port = Number(portValue);
  const fromName = env.SMTP_FROM_NAME || 'ClusterJobs';
  if (!env.SMTP_USER || !env.SMTP_PASS || !isEmailAddress(env.SMTP_FROM_EMAIL)
    || !/^[a-zA-Z0-9.-]+$/.test(host)
    || !/^\d+$/.test(portValue) || port < 1 || port > 65535
    || /[\r\n\x00]/.test(fromName)) {
    throw unavailable();
  }
  return {
    transport: {
      host, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true,
      pool: false, logger: false, debug: false,
    },
    from: { name: fromName, address: env.SMTP_FROM_EMAIL },
  };
}

module.exports = { getEmailConfig, unavailable };
