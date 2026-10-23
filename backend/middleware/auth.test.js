const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveJwtSecret } = require('./auth');

test('resolveJwtSecret uses a development default when unset', () => {
  const secret = resolveJwtSecret({ NODE_ENV: 'development' });
  assert.equal(typeof secret, 'string');
  assert.ok(secret.length > 8);
});

test('resolveJwtSecret refuses a missing or weak secret in production', () => {
  assert.throws(
    () => resolveJwtSecret({ NODE_ENV: 'production' }),
    /JWT_SECRET must be set/,
  );
  assert.throws(
    () => resolveJwtSecret({ VERCEL: '1', JWT_SECRET: 'change-this-to-a-long-random-secret' }),
    /JWT_SECRET must be set/,
  );
});

test('resolveJwtSecret accepts a strong production secret', () => {
  const secret = resolveJwtSecret({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-long-unique-production-secret',
  });
  assert.equal(secret, 'a-long-unique-production-secret');
});
