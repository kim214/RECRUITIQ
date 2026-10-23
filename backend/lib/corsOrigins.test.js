const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOrigin, listedOrigins } = require('./corsOrigins');

test('allows same-origin requests with no Origin header', () => {
  assert.equal(isAllowedOrigin(undefined, {}), true);
  assert.equal(isAllowedOrigin('', {}), true);
});

test('allows PUBLIC_APP_URL and local Vite / API hosts', () => {
  const env = { PUBLIC_APP_URL: 'https://recruitiq-self.vercel.app/' };
  assert.equal(isAllowedOrigin('https://recruitiq-self.vercel.app', env), true);
  assert.equal(isAllowedOrigin('http://localhost:5173', env), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3001', env), true);
  assert.ok(listedOrigins(env).includes('https://recruitiq-self.vercel.app'));
});

test('allows extra CORS_ORIGINS and Vercel preview hosts when VERCEL is set', () => {
  const env = {
    CORS_ORIGINS: 'https://custom.example.com, https://other.example.com/',
    VERCEL: '1',
  };
  assert.equal(isAllowedOrigin('https://custom.example.com', env), true);
  assert.equal(isAllowedOrigin('https://other.example.com', env), true);
  assert.equal(isAllowedOrigin('https://recruitiq-git-feat-team.vercel.app', env), true);
});

test('denies unknown browser origins', () => {
  assert.equal(isAllowedOrigin('https://evil.example', { PUBLIC_APP_URL: 'https://app.example' }), false);
  assert.equal(isAllowedOrigin('https://preview.vercel.app', {}), false);
});
