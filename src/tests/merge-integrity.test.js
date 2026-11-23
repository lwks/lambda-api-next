const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : entry.name.endsWith('.js') ? [filename] : [];
  });
}

test('does not ship unresolved merge markers in application source or configuration examples', () => {
  const files = [...sourceFiles(path.join(root, 'src')), path.join(root, 'README.md'), path.join(root, '.env.example')];
  const marker = /^(?:<{7} |={7}$|>{7} )/m;
  const conflicts = files.filter(file => marker.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(root, file));
  expect(conflicts).toEqual([]);
});

test('keeps the documented SMTP host and port as separate valid environment variables', () => {
  const { parseEnv } = require('node:util');
  const example = parseEnv(fs.readFileSync(path.join(root, '.env.example'), 'utf8'));
  expect(example.SMTP_HOST).toBe('smtp-relay.brevo.com');
  expect(example.SMTP_PORT).toBe('465');
});
