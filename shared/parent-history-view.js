((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentHistoryView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STATUS_LABELS = {
    pending: '未対応',
    working: '対応中',
    done: '完了',
    declined: '今回は見送り'
  };

  function decodeJson(content) {
    if (content == null) return null;
    if (typeof content === 'object' && !(content instanceof Uint8Array) && !(content instanceof ArrayBuffer)) {
      return content;
    }
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function timestampOf(record) {
    const values = [record?.reply?.readAt, record?.reply?.repliedAt, record?.createdAt]
      .map(value => Date.parse(value || ''))
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : 0;
  }

  function normalizeRecord(value, path = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = String(value.id || '').trim();
    const profileId = String(value.profileId || '').trim();
    const appId = String(value.appId || '').trim();
    const gameName = String(value.gameName || appId || '').trim();
    const message = String(value.message || '').trim();
    const createdAt = String(value.createdAt || '').trim();
    if (!id || !profileId || !appId || !message || Number.isNaN(Date.parse(createdAt))) return null;
    const reply = value.reply && typeof value.reply === 'object' && !Array.isArray(value.reply)
      ? {
          message: String(value.reply.message || '').trim(),
          repliedAt: value.reply.repliedAt || null,
          readAt: value.reply.readAt || null
        }
      : null;
    return {
      ...value,
      id,
      profileId,
      appId,
      gameName,
      message,
      createdAt,
      status: STATUS_LABELS[value.status] ? value.status : 'pending',
      reply: reply?.message ? reply : null,
      path
    };
  }

  async function requestFiles(sync) {
    const root = await sync.listDirectory('requests');
    const files = root.filter(item => item.type === 'file' && /[.]json$/i.test(item.name));
    const directories = root.filter(item => item.type === 'dir');
    for (const directory of directories) {
      try {
        const children = await sync.listDirectory(directory.path);
        files.push(...children.filter(item => item.type === 'file' && /[.]json$/i.test(item.name)));
      } catch {}
    }
    return files;
  }

  async function loadHistory(api) {
    if (!api?.sync?.listDirectory || !api?.sync?.readPath) throw new TypeError('sync API is required');
    const files = await requestFiles(api.sync);
    const byId = new Map();

    for (const file of files) {
      try {
        const remote = await api.sync.readPath(file.path);
        if (!remote?.exists) continue;
        const record = normalizeRecord(decodeJson(remote.content), file.path);
        if (!record || record.profileId === 'papa') continue;
        const previous = byId.get(record.id);
        if (!previous || timestampOf(record) >= timestampOf(previous)) byId.set(record.id, record);
      } catch {}
    }

    return [...byId.values()].sort((a, b) => timestampOf(b) - timestampOf(a));
  }

  function make(documentRef, tag, className = '', text = '') {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function mount({ container, api, documentRef = globalThis.document } = {}) {
    if (!container || !api || !documentRef) throw new TypeError('container, api and document are required');

    const header = make(documentRef, 'div', 'papa-history-header');
    const titleWrap = make(documentRef, 'div');
    titleWrap.append(
      make(documentRef, 'p', 'eyebrow', 'PAPA INBOX'),
      make(documentRef, 'h2', '', '📬 おねがい履歴')
    );
    const refreshButton = make(documentRef, 'button', 'papa-history-refresh', '更新');
    refreshButton.type = 'button';
    header.append(titleWrap, refreshButton);

    const summary = make(documentRef, 'p', 'papa-history-summary', '');
    const list = make(documentRef, 'div', 'papa-history-list');
    list.setAttribute('aria-live', 'polite');
    container.replaceChildren(header, summary, list);

    let loading = false;

    async function render(records) {
      const profiles = await api.profile.list();
      const names = new Map(profiles.map(profile => [profile.id, profile.label || profile.id]));
      list.replaceChildren();

      if (!records.length) {
        list.append(make(documentRef, 'div', 'papa-history-empty', 'まだおねがいは届いていません。'));
        summary.textContent = '0件';
        return;
      }

      const unreadReplies = records.filter(record => record.reply?.message && !record.reply?.readAt).length;
      const openRequests = records.filter(record => record.status === 'pending' || record.status === 'working').length;
      summary.textContent = records.length + '件 ・ 未対応/対応中 ' + openRequests + '件 ・ 返答未読 ' + unreadReplies + '件';

      for (const record of records) {
        const card = make(documentRef, 'article', 'papa-history-card');
        const top = make(documentRef, 'div', 'papa-history-card-top');
        const who = make(
          documentRef,
          'strong',
          '',
          (names.get(record.profileId) || record.profileId) + ' ・ ' + record.gameName
        );
        const badge = make(documentRef, 'span', 'papa-history-status papa-history-status-' + record.status, STATUS_LABELS[record.status]);
        top.append(who, badge);

        const meta = make(
          documentRef,
          'div',
          'papa-history-meta',
          formatDate(record.createdAt) + ' ・ ' + (record.type === 'problem' ? '😵 こまってる' : '✨ 新しい機能')
        );
        const message = make(documentRef, 'div', 'papa-history-message', record.message);
        card.append(top, meta, message);

        if (record.reply?.message) {
          const reply = make(documentRef, 'div', 'papa-history-reply');
          reply.append(
            make(documentRef, 'span', 'papa-history-reply-label', 'パパの返答'),
            make(documentRef, 'p', '', record.reply.message)
          );
          const readState = make(
            documentRef,
            'span',
            record.reply.readAt ? 'papa-history-read is-read' : 'papa-history-read',
            record.reply.readAt ? '✓ 読んだよ' : '未読'
          );
          reply.append(readState);
          card.append(reply);
        } else {
          card.append(make(documentRef, 'div', 'papa-history-no-reply', 'まだ返答していません'));
        }

        list.append(card);
      }
    }

    async function refresh() {
      const profile = await api.profile.current();
      if (profile.id !== 'papa') {
        container.hidden = true;
        return [];
      }

      container.hidden = false;
      if (loading) return [];
      loading = true;
      refreshButton.disabled = true;
      refreshButton.textContent = '更新中…';
      summary.textContent = 'saveリポジトリを確認しています…';
      list.replaceChildren();

      try {
        if (typeof api.sync.hasToken === 'function' && !(await api.sync.hasToken())) {
          summary.textContent = 'GitHub保存が未接続です。';
          list.append(make(documentRef, 'div', 'papa-history-empty', 'おうちの人設定からGitHub保存を接続してください。'));
          return [];
        }
        const records = await loadHistory(api);
        await render(records);
        return records;
      } catch (error) {
        summary.textContent = '履歴を読み込めませんでした。';
        list.append(make(documentRef, 'div', 'papa-history-empty', '接続を確認して、もう一度「更新」を押してください。'));
        return [];
      } finally {
        loading = false;
        refreshButton.disabled = false;
        refreshButton.textContent = '更新';
      }
    }

    refreshButton.addEventListener('click', refresh);

    return { refresh, loadHistory: () => loadHistory(api) };
  }

  return { STATUS_LABELS, normalizeRecord, loadHistory, mount };
});
