((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSettingsView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
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

    const header = make(documentRef, 'div');
    header.className = 'settings-header';
    const titleWrap = make(documentRef, 'div');
    titleWrap.append(make(documentRef, 'p', 'FOR PARENTS'), make(documentRef, 'h2', 'おうちの人設定'));
    const close = make(documentRef, 'button', '×');
    close.type = 'button';
    close.className = 'settings-close';
    close.setAttribute('aria-label', '設定を閉じる');
    header.append(titleWrap, close);

    const locked = make(documentRef, 'div');
    locked.className = 'settings-lock';
    const lockCopy = make(documentRef, 'p', '設定を開くにはPINを入力してください。');
    const pinInput = make(documentRef, 'input');
    pinInput.type = 'password';
    pinInput.inputMode = 'numeric';
    pinInput.autocomplete = 'current-password';
    pinInput.maxLength = 12;
    pinInput.placeholder = 'PIN';
    const unlock = make(documentRef, 'button', '設定をひらく');
    unlock.type = 'button';
    unlock.className = 'settings-primary';
    const lockMessage = make(documentRef, 'p');
    lockMessage.className = 'settings-message';
    locked.append(lockCopy, pinInput, unlock, lockMessage);

    const controls = make(documentRef, 'div');
    controls.hidden = true;
    controls.className = 'settings-controls';

    const githubSection = make(documentRef, 'section');
    githubSection.className = 'settings-section';
    githubSection.append(make(documentRef, 'p', 'GITHUB SAVE'), make(documentRef, 'h3', 'GitHub 保存'));

    const tokenState = make(documentRef, 'p', 'Token: 未設定');
    tokenState.className = 'settings-status';

    const tokenInput = make(documentRef, 'input');
    tokenInput.type = 'password';
    tokenInput.autocomplete = 'off';
    tokenInput.placeholder = 'Fine-grained PAT';
    tokenInput.setAttribute('aria-label', 'GitHub Token');

    const tokenActions = make(documentRef, 'div');
    tokenActions.className = 'settings-actions';
    const saveToken = make(documentRef, 'button', 'Tokenを保存');
    saveToken.type = 'button';
    const testConnection = make(documentRef, 'button', '接続を確認');
    testConnection.type = 'button';
    tokenActions.append(saveToken, testConnection);

    const connectionState = make(documentRef, 'p', '接続: 未確認');
    connectionState.className = 'settings-status';

    const tokenHint = make(documentRef, 'p', 'Fine-grained PAT: Repository access は For-My-Sons-save、Contents は Read and write を推奨。');
    tokenHint.className = 'settings-message';
    githubSection.append(tokenState, tokenInput, tokenActions, connectionState, tokenHint);

    const playerSection = make(documentRef, 'section');
    playerSection.className = 'settings-section';
    playerSection.append(make(documentRef, 'p', 'PLAYER'), make(documentRef, 'h3', 'プレイヤー'));

    const currentPlayer = make(documentRef, 'p', '現在: 未設定');
    currentPlayer.className = 'settings-current-player';

    const profileSelect = make(documentRef, 'select');
    profileSelect.disabled = true;
    profileSelect.setAttribute('aria-label', 'プレイヤーを選ぶ');
    const emptyOption = make(documentRef, 'option', '接続確認後に選べます');
    emptyOption.value = '';
    profileSelect.append(emptyOption);

    const chooseProfile = make(documentRef, 'button', 'このプレイヤーにする');
    chooseProfile.type = 'button';
    chooseProfile.className = 'settings-primary';
    chooseProfile.disabled = true;

    const profileMessage = make(documentRef, 'p');
    profileMessage.className = 'settings-message';

    playerSection.append(currentPlayer, profileSelect, chooseProfile, profileMessage);

    controls.append(githubSection, playerSection);
    panel.append(header, locked, controls);
    container.append(panel);

    let previousFocus = null;

    async function refreshCurrent() {
      const current = await api.profile.current();
      const unset = current.id === 'profile-1' && current.label === 'profile-1';
      currentPlayer.textContent = '現在: ' + (unset ? '未設定' : current.label);
      return current;
    }

    async function refreshTokenState() {
      const configured = await api.sync.hasToken();
      tokenState.textContent = 'Token: ' + (configured ? '設定済み' : '未設定');
      return configured;
    }

    async function populateProfiles(profiles) {
      profileSelect.replaceChildren();
      if (!profiles.length) {
        const option = make(documentRef, 'option', 'ユーザーが見つかりません');
        option.value = '';
        profileSelect.append(option);
        profileSelect.disabled = true;
        chooseProfile.disabled = true;
        return;
      }

      const current = await refreshCurrent();
      for (const item of profiles) {
        const option = make(documentRef, 'option', item.label);
        option.value = item.id;
        option.selected = item.id === current.id;
        profileSelect.append(option);
      }
      if (!profiles.some(item => item.id === current.id)) profileSelect.selectedIndex = 0;
      profileSelect.disabled = false;
      chooseProfile.disabled = false;
    }

    async function loadProfiles() {
      connectionState.textContent = '接続: 確認中…';
      profileMessage.textContent = '';
      try {
        if (!(await api.parent.hasPin())) {
          const setup = await api.sync.installHousehold();
          connectionState.textContent = '✓ 家庭設定とPINをこの端末に反映しました';
          await populateProfiles(setup.profiles);
          return;
        }

        const connection = await api.sync.testConnection();
        const profiles = await api.sync.listProfiles();
        connectionState.textContent = '✓ ' + connection.repo + ' に接続しました';
        await populateProfiles(profiles);
      } catch (error) {
        if (error?.code === 'TOKEN_INVALID') {
          connectionState.textContent = 'Tokenが無効か期限切れです。新しいTokenを登録してください。';
        } else if (error?.code === 'REPO_NOT_VISIBLE') {
          connectionState.textContent = 'Tokenは有効ですが、For-My-Sons-save を見られません。Repository access と Contents 権限を確認してください。';
        } else if (error?.code === 'TOKEN_FORBIDDEN') {
          connectionState.textContent = 'GitHubに拒否されました。少し待ってから再確認するかToken権限を確認してください。';
        } else if (error?.code === 'AUTH_REQUIRED') {
          connectionState.textContent = 'Tokenが未設定です。';
        } else {
          connectionState.textContent = '接続できませんでした: ' + (error?.message || '不明なエラー');
        }
        profileSelect.disabled = true;
        chooseProfile.disabled = true;
      }
    }

    async function showControls() {
      locked.hidden = true;
      controls.hidden = false;
      await Promise.all([refreshCurrent(), refreshTokenState()]);
      if (await api.sync.hasToken()) await loadProfiles();
      else tokenInput.focus();
    }

    async function open() {
      previousFocus = documentRef.activeElement;
      api.parent.lock();
      pinInput.value = '';
      lockMessage.textContent = '';
      container.hidden = false;
      container.setAttribute('aria-hidden', 'false');

      if (await api.parent.hasPin()) {
        controls.hidden = true;
        locked.hidden = false;
        requestAnimationFrame(() => pinInput.focus());
        return;
      }

      locked.hidden = true;
      controls.hidden = false;
      await Promise.all([refreshCurrent(), refreshTokenState()]);
      connectionState.textContent = '初回設定: Tokenを保存すると家庭設定とPINを読み込みます。';
      if (await api.sync.hasToken()) await loadProfiles();
      else requestAnimationFrame(() => tokenInput.focus());
    }

    function closePanel() {
      container.hidden = true;
      container.setAttribute('aria-hidden', 'true');
      api.parent.lock();
      controls.hidden = true;
      locked.hidden = false;
      if (previousFocus?.focus) previousFocus.focus();
    }

    close.addEventListener('click', closePanel);
    container.addEventListener('click', event => {
      if (event.target === container) closePanel();
    });
    documentRef.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !container.hidden) closePanel();
    });

    async function unlockSettings() {
      const ok = await api.parent.verify(pinInput.value);
      if (!ok) {
        lockMessage.textContent = 'PINがちがいます';
        pinInput.select();
        return;
      }
      lockMessage.textContent = '';
      await showControls();
    }

    unlock.addEventListener('click', unlockSettings);
    pinInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlockSettings();
    });

    saveToken.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        connectionState.textContent = '保存するTokenを入力してください。';
        return;
      }
      await api.sync.configure({ token });
      tokenInput.value = '';
      await refreshTokenState();
      connectionState.textContent = 'Tokenをこの端末に保存しました。';
      await loadProfiles();
    });

    testConnection.addEventListener('click', loadProfiles);

    chooseProfile.addEventListener('click', async () => {
      if (!profileSelect.value) return;
      await api.profile.setCurrent(profileSelect.value);
      const current = await refreshCurrent();
      profileMessage.textContent = current.label + ' をこの端末のプレイヤーにしました。';
    });

    return { open, close: closePanel, refresh: refreshCurrent };
  }

  return { renderSettings };
});
