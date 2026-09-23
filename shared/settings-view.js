((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSettingsView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function buildSettingsModel({ profile, profiles = [], lock = {}, syncStatus = {} } = {}) {
    return {
      currentProfile: profile ? { id: profile.id, label: profile.label } : null,
      profiles: profiles.map(item => ({ id: item.id, label: item.label })),
      unlocked: Boolean(lock.unlocked),
      sync: {
        state: syncStatus.state || 'idle',
        pending: Number(syncStatus.pending || 0)
      }
    };
  }

  function make(documentRef, tag, text = '') {
    const node = documentRef.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function renderSettings(container, api, documentRef = globalThis.document) {
    if (!container || !api || !documentRef) throw new TypeError('settings container, API, and document are required');
    container.replaceChildren();
    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');

    const panel = make(documentRef, 'section');
    panel.className = 'parent-settings-card';
    const heading = make(documentRef, 'h2', 'おうちの人設定');
    const close = make(documentRef, 'button', 'とじる');
    close.type = 'button';
    close.className = 'settings-close';
    const pinLabel = make(documentRef, 'label', '親PIN');
    const pinInput = make(documentRef, 'input');
    pinInput.type = 'password';
    pinInput.inputMode = 'numeric';
    pinInput.autocomplete = 'current-password';
    pinInput.maxLength = 12;
    pinLabel.append(pinInput);
    const unlock = make(documentRef, 'button', '設定をひらく');
    unlock.type = 'button';
    const message = make(documentRef, 'p');
    message.className = 'settings-message';
    const controls = make(documentRef, 'div');
    controls.hidden = true;
    controls.className = 'settings-controls';

    const profileLabel = make(documentRef, 'label', 'プロフィール');
    const profileSelect = make(documentRef, 'select');
    profileLabel.append(profileSelect);
    const avatarLabel = make(documentRef, 'label', 'プロフィール画像');
    const avatarInput = make(documentRef, 'input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/*';
    avatarLabel.append(avatarInput);
    const repoLabel = make(documentRef, 'label', 'GitHub Repository');
    const repoInput = make(documentRef, 'input');
    repoInput.type = 'text';
    repoInput.autocomplete = 'off';
    repoLabel.append(repoInput);
    const tokenLabel = make(documentRef, 'label', 'Fine-grained PAT');
    const tokenInput = make(documentRef, 'input');
    tokenInput.type = 'password';
    tokenInput.autocomplete = 'off';
    tokenLabel.append(tokenInput);
    const saveConfig = make(documentRef, 'button', '同期設定を保存');
    saveConfig.type = 'button';
    const syncButton = make(documentRef, 'button', '手動同期');
    syncButton.type = 'button';
    const restoreButton = make(documentRef, 'button', 'バックアップ復元');
    restoreButton.type = 'button';
    const status = make(documentRef, 'p', '同期状況: 未確認');
    status.className = 'sync-status';

    controls.append(profileLabel, avatarLabel, repoLabel, tokenLabel, saveConfig, syncButton, restoreButton, status);
    panel.append(heading, close, pinLabel, unlock, message, controls);
    container.append(panel);

    let previousFocus = null;
    async function refresh() {
      const [current, profiles, syncStatus] = await Promise.all([
        api.profile.current(), api.profile.list(), api.sync.status()
      ]);
      profileSelect.replaceChildren();
      for (const item of profiles) {
        const option = make(documentRef, 'option', item.label);
        option.value = item.id;
        option.selected = item.id === current.id;
        profileSelect.append(option);
      }
      status.textContent = `同期状況: ${syncStatus.state} (${syncStatus.pending}件)`;
    }

    async function open() {
      previousFocus = documentRef.activeElement;
      container.hidden = false;
      container.setAttribute('aria-hidden', 'false');
      controls.hidden = !(await api.parent.isUnlocked());
      await refresh();
      (controls.hidden ? pinInput : profileSelect).focus();
    }

    function closePanel() {
      container.hidden = true;
      container.setAttribute('aria-hidden', 'true');
      api.parent.lock();
      if (previousFocus?.focus) previousFocus.focus();
    }

    close.addEventListener('click', closePanel);
    unlock.addEventListener('click', async () => {
      try {
        const hasPin = await api.parent.hasPin();
        const verified = hasPin ? await api.parent.verify(pinInput.value) : await api.parent.setPin(pinInput.value);
        if (!verified && hasPin) throw new Error('PINがちがいます');
        controls.hidden = false;
        message.textContent = '設定をひらきました';
        await refresh();
        profileSelect.focus();
      } catch (error) {
        message.textContent = error.message === 'PINがちがいます' ? error.message : 'PINを確認できませんでした';
      }
    });
    profileSelect.addEventListener('change', async () => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('プロフィールを変更しますか？')) {
        await refresh();
        return;
      }
      await api.profile.setCurrent(profileSelect.value);
      await refresh();
    });
    avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      const current = await api.profile.current();
      await api.profile.setAvatar(current.id, file, file.type);
      message.textContent = 'プロフィール画像を保存しました';
    });
    saveConfig.addEventListener('click', async () => {
      const parts = repoInput.value.split('/').filter(Boolean);
      await api.sync.configure({ owner: parts[0], repo: parts[1], token: tokenInput.value });
      tokenInput.value = '';
      message.textContent = '同期設定を保存しました';
      await refresh();
    });
    syncButton.addEventListener('click', async () => {
      await api.sync.push();
      await refresh();
    });
    restoreButton.addEventListener('click', () => {
      message.textContent = '復元するデータを選択してください';
    });

    return { open, close: closePanel, refresh };
  }

  return { buildSettingsModel, renderSettings };
});
