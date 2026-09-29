async function setupRequestsPage() {
  const indicator = document.querySelector('#current-profile-indicator');
  const settingsButton = document.querySelector('#parent-settings-button');
  const settingsPanel = document.querySelector('#parent-settings-panel');
  const historyContainer = document.querySelector('#parent-request-history');
  if (!window.ForMySonsShared || !window.ForMySonsSettingsView || !window.ForMySonsParentHistoryView) return;

  try {
    const api = await window.ForMySonsShared.createForMySons();
    window.ForMySons = api;
    let historyView = null;

    async function refresh() {
      const profile = await api.profile.current();
      const unset = profile.id === 'profile-1' && profile.label === 'profile-1';
      indicator.textContent = `プレイヤー: ${unset ? '未設定' : profile.label}`;

      if (profile.id !== 'papa') {
        historyView?.destroy?.();
        historyView = null;
        historyContainer.replaceChildren();
        const guard = document.createElement('div');
        guard.className = 'requests-guard';
        guard.textContent = 'ゲーム要望の確認は papa で開いてください。';
        historyContainer.append(guard);
        return;
      }

      if (!historyView) {
        historyView = window.ForMySonsParentHistoryView.mount({ container: historyContainer, api });
      }
      await historyView.refresh();
    }

    window.ForMySonsSettings = window.ForMySonsSettingsView.renderSettings(settingsPanel, api);
    settingsButton.addEventListener('click', () => window.ForMySonsSettings.open());
    window.addEventListener('for-my-sons-profile-changed', refresh);
    await refresh();
  } catch (error) {
    console.warn('Requests page unavailable.', error);
    historyContainer.textContent = '要望を読み込めませんでした。';
  }
}
setupRequestsPage();
