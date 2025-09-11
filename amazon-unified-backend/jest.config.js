module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|js)'],
  verbose: true,
  maxWorkers: 1,
  forceExit: true,
  testTimeout: 30000,
};

