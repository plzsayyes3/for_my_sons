(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => ({
  owner: 'plzsayyes3',
  repo: 'For-My-Sons-save',
  branch: 'main',
  apiBase: 'https://api.github.com'
}));
