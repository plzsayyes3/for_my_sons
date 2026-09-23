(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STORAGE_KEY = 'parentLock';
  const FORMAT_VERSION = 2;
  const ITERATIONS = 310000;
  const encoder = new TextEncoder();
  const toBase64 = bytes => {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const fromBase64 = value => typeof Buffer !== 'undefined'
    ? Uint8Array.from(Buffer.from(value, 'base64'))
    : Uint8Array.from(atob(value), character => character.charCodeAt(0));

  function createParentLock(storage, cryptoProvider = globalThis.crypto) {
    if (!storage?.get || !storage?.set || !cryptoProvider?.subtle) throw new TypeError('Local settings and Web Crypto are required');
    let unlocked = false;

    async function pinDigest(pin, salt) {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) throw new TypeError('PIN must contain exactly six digits');
      const material = await cryptoProvider.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await cryptoProvider.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, 256));
    }

    function equalBytes(left, right) {
      if (left.length !== right.length) return false;
      let diff = 0;
      for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
      return diff === 0;
    }

    async function setupPin(pin) {
      const current = await storage.get(STORAGE_KEY);
      if (current?.pin && !unlocked) throw new Error('Unlock settings before changing the PIN');
      const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
      const digest = await pinDigest(pin, salt);
      await storage.set(STORAGE_KEY, {
        formatVersion: FORMAT_VERSION,
        pin: { kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: toBase64(salt), digest: toBase64(digest) },
        token: current?.token || null,
        failedAttempts: 0,
        lockedUntil: 0
      });
      unlocked = true;
    }

    async function unlock(pin) {
      const current = await storage.get(STORAGE_KEY);
      if (!current?.pin || current.formatVersion !== FORMAT_VERSION || current.pin.kdf !== 'PBKDF2-SHA-256') {
        throw new Error('Parent PIN is not configured');
      }
      if (Date.now() < (current.lockedUntil || 0)) throw new Error('Settings are temporarily locked');
      const digest = await pinDigest(pin, fromBase64(current.pin.salt));
      if (!equalBytes(digest, fromBase64(current.pin.digest))) {
        const failedAttempts = (current.failedAttempts || 0) + 1;
        await storage.set(STORAGE_KEY, {
          ...current,
          failedAttempts,
          lockedUntil: failedAttempts >= 5 ? Date.now() + 30000 : 0
        });
        throw new Error('Invalid PIN');
      }
      await storage.set(STORAGE_KEY, { ...current, failedAttempts: 0, lockedUntil: 0 });
      unlocked = true;
      return true;
    }

    return {
      setupPin,
      unlock,
      async isConfigured() { return Boolean((await storage.get(STORAGE_KEY))?.pin); },
      isUnlocked() { return unlocked; },
      lock() { unlocked = false; },
      async storeToken(token) {
        if (!unlocked) throw new Error('Parent settings are locked');
        if (typeof token !== 'string' || !token.trim()) throw new TypeError('Token is required');
        const current = await storage.get(STORAGE_KEY);
        await storage.set(STORAGE_KEY, { ...current, token });
      },
      async withToken(callback) {
        if (!unlocked) throw new Error('Parent settings are locked');
        if (typeof callback !== 'function') throw new TypeError('A token callback is required');
        const current = await storage.get(STORAGE_KEY);
        if (typeof current?.token !== 'string' || !current.token) throw new Error('No token is configured');
        return callback(current.token);
      }
    };
  }

  return { createParentLock };
});
