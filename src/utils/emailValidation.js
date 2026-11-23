// Accept one bare mailbox, never a display name, recipient list or header value.
function isEmailAddress(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value)
    && value.split('@')[0].length <= 64;
}

module.exports = { isEmailAddress };
