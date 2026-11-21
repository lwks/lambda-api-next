const nodemailer = require('nodemailer');
const { getEmailConfig, unavailable } = require('../config/email');
const { isLocalHarness } = require('../harness/config');
const { ExternalServiceError } = require('../utils/errors');
const { logger } = require('../utils/logger');

async function sendEmail(message, requestId) {
  if (isLocalHarness()) throw unavailable('Email sending is disabled in the local harness');
  const config = getEmailConfig();
  const startedAt = Date.now();
  let transport;
  try {
    transport = nodemailer.createTransport(config.transport);
    // Never pass caller-controlled transport, envelope, headers or attachments.
    const result = await transport.sendMail({
      from: config.from, to: message.to, subject: message.subject,
      text: message.text, html: message.html,
    });
    if (!result.accepted?.some((address) => address.toLowerCase() === message.to.toLowerCase())
        || result.rejected?.length || !result.messageId) {
      throw new ExternalServiceError('Email was not accepted by the SMTP server');
    }
    logger.info('Email accepted by SMTP server', {
      requestId, messageId: result.messageId, durationMs: Date.now() - startedAt,
    });
    return { status: 'accepted', messageId: result.messageId };
  } catch (error) {
    const timeout = error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT';
    logger.warn('Email submission failed', {
      requestId, reason: timeout ? 'smtp_timeout' : 'smtp_failure', durationMs: Date.now() - startedAt,
    });
    const failure = new ExternalServiceError(timeout
      ? 'SMTP request timed out; acceptance is unknown. Do not retry automatically.'
      : 'Unable to submit email to the SMTP server');
    if (timeout) failure.statusCode = 504;
    throw failure;
  } finally {
    if (transport) transport.close();
  }
}

module.exports = { sendEmail };
