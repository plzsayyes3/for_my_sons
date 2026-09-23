((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SETTINGS_KEY = 'parentLock';
  const ITERATIONS = 120000;
  const PIN_PATTERN = /^\d{4,12}$/;

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  function createParentLock(db, cryptoProvider = globalThis.crypto) {
    if (!db?.get || !db?.put) throw new TypeError('database adapter is required');
    if (!cryptoProvider?.subtle || !cryptoProvider?.getRandomValues) throw new TypeError('Web Crypto is required');
    let unlocked = false;

    async function derive(pin, salt, iterations = ITERATIONS) {
      const key = await cryptoProvider.subtle.importKey(
        'raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
      );
      const bits = await cryptoProvider.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
      );
      return new Uint8Array(bits);
    }

    async function record() {
      return db.get('settings', SETTINGS_KEY);
    }

    async function hasPin() {
      return Boolean(await record());
    }

    async function setPin(pin) {
      if (!PIN_PATTERN.test(String(pin))) throw new TypeError('PIN must be 4-12 digits');
      if (await hasPin() && !unlocked) throw new Error('Parent settings must be unlocked');
      const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
      const hash = await derive(String(pin), salt);
      const value = {
        algorithm: 'PBKDF2-SHA-256',
        iterations: ITERATIONS,
        salt: bytesToBase64(salt),
        hash: bytesToBase64(hash)
      };
      await db.put('settings', value, SETTINGS_KEY);
      unlocked = true;
      return true;
    }

    async function verify(pin) {
      const value = String(pin);
      if (!PIN_PATTERN.test(value)) return false;
      const saved = await record();
      if (!saved) return false;
      const derived = await derive(value, base64ToBytes(saved.salt), saved.iterations);
      unlocked = equalBytes(derived, base64ToBytes(saved.hash));
      return unlocked;
    }

    function validateRecord(value) {
      if (!value || value.algorithm !== 'PBKDF2-SHA-256') throw new TypeError('Invalid parent lock record');
      if (!Number.isInteger(Number(value.iterations)) || Number(value.iterations) < 10000) throw new TypeError('Invalid parent lock iterations');
      if (typeof value.salt !== 'string' || typeof value.hash !== 'string') throw new TypeError('Invalid parent lock hash');
      base64ToBytes(value.salt);
      base64ToBytes(value.hash);
      return {
        algorithm: 'PBKDF2-SHA-256',
        iterations: Number(value.iterations),
        salt: value.salt,
        hash: value.hash
      };
    }

    async function importRecord(value) {
      const normalized = validateRecord(value);
      await db.put('settings', normalized, SETTINGS_KEY);
      unlocked = false;
      return true;
    }

    async function exportRecord() {
      const saved = await record();
      return saved ? { ...saved } : null;
    }

    return {
      hasPin,
      setPin,
      verify,
      isUnlocked: () => unlocked,
      lock: () => { unlocked = false; },
      importRecord,
      exportRecord,
      exportRecordForTest: exportRecord
    };
  }

  return { createParentLock };
});
