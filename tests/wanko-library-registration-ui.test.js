const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('wanko-library/index.html', 'utf8');

test('library exposes a registration request action for local wankos', () => {
  assert.match(source, /登録依頼を出す/);
  assert.match(source, /markRegistrationRequested/);
  assert.match(source, /wanko-registration-request\.js\?v=1/);
  assert.match(source, /requestPending:Boolean\(w\.registrationRequestId\)/);
});
