((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsWankoRegistrationRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  async function createWankoRegistrationRequest({ service, wanko, faction, markRequested } = {}) {
    if (wanko.registrationRequestId) {
      return { requestId: wanko.registrationRequestId, duplicate: true, synced: false };
    }
    if (!service?.create || !service?.syncPending) throw new TypeError('request service is required');
    if (!wanko?.name || !wanko?.blob) throw new TypeError('local wanko artwork is required');

    const request = await service.create({ name: wanko.name, faction, artwork: wanko.blob });
    const results = await service.syncPending();
    const synced = results.some(item => item.requestId === request.requestId && item.syncState === 'synced');
    if (markRequested) await markRequested(wanko.id, request.requestId);
    return { requestId: request.requestId, duplicate: false, synced };
  }

  return { createWankoRegistrationRequest };
});
