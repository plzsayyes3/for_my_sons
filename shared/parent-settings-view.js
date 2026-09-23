(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSettingsView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  function renderSettings(container, api) {
    if (!container || !api?.lock || !api?.profile) throw new TypeError('Settings view dependencies are required');
    const make = (tag, attrs = {}, text = '') => {
      const element = container.ownerDocument.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') element.className = value;
        else if (key === 'type' || key === 'autocomplete' || key === 'hidden' || key === 'aria-label') element[key] = value;
        else element.setAttribute(key, value);
      }
      if (text) element.textContent = text;
      return element;
    };
    const panel = make('section', { className: 'parent-settings', hidden: true, 'aria-labelledby': 'parent-settings-title' });
    const title = make('h2', { id: 'parent-settings-title' }, 'おとなの設定');
    const status = make('p', { role: 'status', 'aria-live': 'polite' }, '親PINを設定してください。');
    const pin = make('input', { type: 'password', autocomplete: 'current-password', 'aria-label': '親PIN' });
    pin.inputMode = 'numeric'; pin.maxLength = 32;
    const pinButton = make('button', { type: 'button' }, 'PINを設定');
    const token = make('input', { type: 'password', autocomplete: 'off', 'aria-label': 'GitHub token' });
    token.hidden = true;
    const tokenButton = make('button', { type: 'button', hidden: true }, 'tokenを端末に保存');
    const profileSelect = make('select', { 'aria-label': '利用プロフィール', hidden: true });
    const syncButton = make('button', { type: 'button', hidden: true }, '同期');
    const migrationButton = make('button', { type: 'button', hidden: true }, '旧セーブを選択プロフィールへコピー');
    const close = make('button', { type: 'button' }, '閉じる');
    panel.append(title, status, pin, pinButton, token, tokenButton, profileSelect, migrationButton, syncButton, close);
    container.replaceChildren(panel);
    const autoSync = root.ForMySonsAutoSync?.createAutoSync({
      sync: api.sync,
      profile: api.profile,
      isUnlocked: () => api.lock.isUnlocked(),
      target: root,
      onResult: ({ results, failed }) => {
        if (failed) status.textContent = '自動同期できませんでした。ローカル保存は保持されています。';
        else if (results.some(result => result.status === 'conflict')) status.textContent = '同期に競合があります。ローカルの内容は保持されています。';
        else if (results.some(result => result.status === 'synced')) status.textContent = '自動同期が完了しました。';
      }
    });

    async function unlockOrSetup() {
      try {
        if (await api.lock.isConfigured()) await api.lock.unlock(pin.value);
        else await api.lock.setupPin(pin.value);
        pin.value = '';
        pin.hidden = true;
        pinButton.hidden = true;
        token.hidden = false;
        tokenButton.hidden = false;
        profileSelect.hidden = false;
        migrationButton.hidden = !api.migration;
        syncButton.hidden = false;
        status.textContent = 'ロック解除中。プロフィールを読み込みます。';
        await refreshProfiles();
        autoSync?.resetBackoff();
        await autoSync?.trigger({ force: true });
      } catch {
        status.textContent = 'PINを確認してください。';
      }
    }

    async function refreshProfiles() {
      try {
        const profiles = await api.profile.listProfiles({ refresh: true });
        profileSelect.replaceChildren();
        const placeholder = make('option', { value: '' }, 'プロフィールを選択');
        profileSelect.appendChild(placeholder);
        for (const profile of profiles) {
          const option = make('option', { value: profile.profileId }, profile.label);
          profileSelect.appendChild(option);
        }
        const current = await api.profile.current();
        profileSelect.value = current?.profileId || '';
        migrationButton.disabled = !profileSelect.value;
        syncButton.disabled = !profileSelect.value;
        status.textContent = profiles.length ? `${profiles.length}件のプロフィール` : 'プロフィールがありません。接続を確認してください。';
      } catch {
        status.textContent = 'Privateセーブに接続できません。 tokenと通信状態を確認してください。';
      }
    }

    pinButton.addEventListener('click', unlockOrSetup);
    tokenButton.addEventListener('click', async () => {
      try {
        await api.lock.storeToken(token.value);
        token.value = '';
        status.textContent = 'tokenを暗号化して端末に保存しました。';
        await refreshProfiles();
        autoSync?.resetBackoff();
        await autoSync?.trigger({ force: true });
      } catch (error) {
        token.value = '';
        status.textContent = error.message.includes('origin') ? '専用ドメインが未設定のため、tokenは保存できません。' : 'tokenを保存できませんでした。';
      }
    });
    profileSelect.addEventListener('change', async () => {
      if (!profileSelect.value) { migrationButton.disabled = true; syncButton.disabled = true; status.textContent = 'プロフィールを選んでください。'; return; }
      try {
        await api.profile.switchProfile(profileSelect.value);
        migrationButton.disabled = !api.migration;
        syncButton.disabled = false;
        status.textContent = 'プロフィールを切り替えました。';
        autoSync?.resetBackoff();
        await autoSync?.trigger({ force: true });
      }
      catch { status.textContent = 'プロフィールを切り替えられませんでした。'; }
    });
    migrationButton.addEventListener('click', async () => {
      if (!api.migration) return;
      const profileId = profileSelect.value;
      try {
        const result = await api.migration.copyLegacyProgress(profileId, preview => window.confirm(
          `選択中プロフィールへ旧わんこ大戦争の進行をコピーしますか？\nクリア ${preview.clearedStageCount}面・発見元素 ${preview.discoveredElementCount}個・発見敵 ${preview.discoveredEnemyCount}体\n旧データはこの端末に残します。`
        ));
        status.textContent = result.status === 'copied' ? 'コピーしました。旧データも端末に残っています。'
          : result.status === 'already-exists' ? 'このプロフィールには既にセーブがあります。上書きしません。'
            : result.status === 'no-legacy-data' ? 'コピーできる旧セーブがありません。'
              : 'コピーを中止しました。';
      } catch { status.textContent = '旧セーブをコピーできませんでした。元データは変更していません。'; }
    });
    syncButton.addEventListener('click', async () => {
      const current = await api.profile.current();
      if (!current) { status.textContent = '先にプロフィールを選んでください。'; return; }
      try {
        const results = await api.sync.syncProfile(current.profileId);
        status.textContent = results.some(result => result.status === 'conflict') ? '競合があります。ローカルの内容は保持されています。' : '同期が完了しました。';
      } catch { status.textContent = '同期できませんでした。ローカル保存は保持されています。'; }
    });
    close.addEventListener('click', () => { api.lock.lock(); panel.hidden = true; });
    return { open() { panel.hidden = false; pin.hidden = false; pinButton.hidden = false; api.lock.isConfigured().then(configured => { pinButton.textContent = configured ? 'PINで解除' : 'PINを設定'; }); token.hidden = true; tokenButton.hidden = true; profileSelect.hidden = true; migrationButton.hidden = true; syncButton.hidden = true; status.textContent = '親PINを入力してください。'; pin.focus(); }, close() { api.lock.lock(); panel.hidden = true; } };
  }

  return { renderSettings };
});
