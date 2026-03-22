module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/auth/**/*.js',
    'src/middleware/**/*.js',
    'src/routes/index.js',
    'src/utils/errors.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary'],
};
