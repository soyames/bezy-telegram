import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requirePiUser, verifyPiToken } from '../api/pi/_identity.js';

test('Pi UID and username come only from the verified Platform API response', async () => {
  const user = await verifyPiToken('valid-access-token', async (url, options) => {
    assert.equal(url, 'https://api.minepi.com/v2/me');
    assert.equal(options.headers.Authorization, 'Bearer valid-access-token');
    return { ok: true, json: async () => ({ uid: 'pi-uid', username: 'pioneer' }) };
  });
  assert.deepEqual(user, { uid: 'pi-uid', username: 'pioneer' });
});

test('invalid and malformed identity cannot enter Pi endpoints', async () => {
  assert.equal(await verifyPiToken('short', async () => { throw Error('must not fetch'); }), null);
  assert.equal(await verifyPiToken('valid-access-token', async () => ({ ok: false })), null);
  let status;
  let body;
  const user = await requirePiUser({ headers: { authorization: 'Bearer forged-token' }, body: { uid: 'admin' } }, {
    status(code) { status = code; return this; }, json(value) { body = value; }
  }, async () => null);
  assert.equal(user, null);
  assert.equal(status, 401);
  assert.equal(body.error, 'INVALID_SESSION');
});
