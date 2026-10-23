const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('./rateLimit');

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('allows up to max requests then returns 429', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const req = { ip: '1.2.3.4', path: '/login' };
  let allowed = 0;
  for (let i = 0; i < 3; i += 1) {
    const res = mockRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    if (nextCalled) allowed += 1;
    else {
      assert.equal(res.statusCode, 429);
      assert.match(res.body.message, /Too many/);
    }
  }
  assert.equal(allowed, 2);
});
