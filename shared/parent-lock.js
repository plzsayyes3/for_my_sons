(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STORAGE_KEY = 'parentLock';
  const FORMAT_VERSION = 1;
  const ITERATIONS = 310000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const toBase64 = bytes => {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const fromBase64 = value => {
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  };

  function createParentLock(storage, cryptoProvider = globalThis.crypto, allowedOrigin = '', getOrigin = () => globalThis.location?.origin || '') {
    if (!storage?.get || !storage?.set || !cryptoProvider?.subtle) throw new TypeError('Secure storage and Web Crypto are required');
    let activeKey = null;
    let unlocked = false;

    async function derive(pin, salt) {
      if (typeof pin !== 'string' || pin.length < 4) throw new TypeError('PIN must contain at least four characters');
      const material = await cryptoProvider.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
      return cryptoProvider.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    async function encrypt(key, value) {
      const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
      const ciphertext = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
      return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
    }

    async function decrypt(key, envelope) {
      const bytes = await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
      return decoder.decode(bytes);
    }

    async function setupPin(pin) {
      const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
      const key = await derive(pin, salt);
      const verifier = await encrypt(key, 'for-my-sons-parent-lock-v1');
      await storage.set(STORAGE_KEY, { formatVersion: FORMAT_VERSION, kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: toBase64(salt), verifier });
      activeKey = key;
      unlocked = true;
    }

    async function unlock(pin) {
      const envelope = await storage.get(STORAGE_KEY);
      if (!envelope || envelope.formatVersion !== FORMAT_VERSION || envelope.kdf !== 'PBKDF2-SHA-256') throw new Error('Parent PIN is not configured');
      const key = await derive(pin, fromBase64(envelope.salt));
      const verifier = await decrypt(key, envelope.verifier);
      if (verifier !== 'for-my-sons-parent-lock-v1') throw new Error('Invalid PIN');
      activeKey = key;
      unlocked = true;
      return true;
    }

    function assertOrigin() {
      let expected;
      let actual;
      try { expected = new URL(allowedOrigin); actual = new URL(getOrigin()); }
      catch { throw new Error('A dedicated allowed origin is required'); }
      if (expected.protocol !== 'https:' || expected.origin !== actual.origin || !expected.hostname || expected.hostname === 'github.io' || expected.hostname.endsWith('.github.io')) {
        throw new Error('Token storage is disabled on this origin');
      }
    }

    return {
      setupPin,
      unlock,
      async isConfigured() { return Boolean(await storage.get(STORAGE_KEY)); },
      lock() { activeKey = null; unlocked = false; },
      isUnlocked() { return unlocked; },
      async storeToken(token) {
        if (!unlocked || !activeKey) throw new Error('Parent lock is locked');
        assertOrigin();
        if (typeof token !== 'string' || !token.trim()) throw new TypeError('Token is required');
        const encrypted = await encrypt(activeKey, token);
        const current = await storage.get(STORAGE_KEY);
        await storage.set(STORAGE_KEY, { ...current, token: encrypted });
      },
      async withToken(callback) {
        if (!unlocked || !activeKey) throw new Error('Parent lock is locked');
        if (typeof callback !== 'function') throw new TypeError('A token callback is required');
        assertOrigin();
        const envelope = await storage.get(STORAGE_KEY);
        if (!envelope?.token) throw new Error('No token is configured');
        const token = await decrypt(activeKey, envelope.token);
        try { return await callback(token); }
        finally { /* The decrypted string is scoped to this operation only. */ }
      }
    };
  }

  return { createParentLock };
});
