const grid = document.querySelector('#app-grid');
const template = document.querySelector('#app-template');

const fallbackApps = [
  {
    id: 'kids-3d-playgrand',
    name: '3Dこうさく',
    url: './kids-3d-playgrand/?v=5',
    icon: './assets/kids-3d.svg',
    description: 'かたちをつくって、くっつけて、3Dにしよう'
  },
  {
    id: 'minecraft-english',
    name: 'Minecraft English',
    url: 'https://plzsayyes3.github.io/English-for-Minecraft/',
    icon: './assets/minecraft-english.svg',
    description: 'Minecraftにつながる英語をたのしく学ぼう'
  }
];

function createAppTile(app) {
  const fragment = template.content.cloneNode(true);
  const link = fragment.querySelector('.app-tile');
  const icon = fragment.querySelector('.app-icon');
  const label = fragment.querySelector('.app-name');

  link.href = app.url;
  link.dataset.appId = app.id;
  link.setAttribute('aria-label', `${app.name}をひらく。${app.description ?? ''}`);
  icon.src = app.icon;
  icon.alt = '';
  label.textContent = app.name;

  return fragment;
}

function renderApps(apps) {
  grid.replaceChildren();
  apps.forEach((app) => grid.appendChild(createAppTile(app)));
}

async function loadApps() {
  try {
    const response = await fetch('./apps.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`apps.json: ${response.status}`);
    const apps = await response.json();
    renderApps(Array.isArray(apps) && apps.length ? apps : fallbackApps);
  } catch (error) {
    console.warn('Falling back to bundled launcher data.', error);
    renderApps(fallbackApps);
  }
}

loadApps();

async function setupSharedProfile() {
  const indicator = document.querySelector('#current-profile-indicator');
  const settingsButton = document.querySelector('#parent-settings-button');
  const settingsPanel = document.querySelector('#parent-settings-panel');
  const historyContainer = document.querySelector('#parent-request-history');
  const newGameContainer = document.querySelector('#new-game-request');
  if (!window.ForMySonsShared || !window.ForMySonsSettingsView || !indicator || !settingsButton || !settingsPanel) return;
  try {
    const api = await window.ForMySonsShared.createForMySons();
    window.ForMySons = api;
    const historyView = window.ForMySonsParentHistoryView && historyContainer
      ? window.ForMySonsParentHistoryView.mount({ container: historyContainer, api })
      : null;
    const newGameView = window.ForMySonsParentRequestView && newGameContainer && api.parentRequests
      ? window.ForMySonsParentRequestView.mount({
          container: newGameContainer,
          service: api.parentRequests,
          appId: 'new-game-request',
          gameName: '新しいゲーム',
          launchLabel: '🎮 新しいゲームを作ってほしい',
          pendingLaunchLabel: '🎮 まだ送れていないゲーム案',
          titleText: '🎮 どんなゲームをつくってほしい？',
          fixedType: 'feature',
          hideGame: true,
          messageLabelText: 'ゲームのアイデア',
          placeholder: 'どんなゲーム？ どうやって遊ぶ？',
          sendLabel: 'パパにおくる',
          successText: 'ゲームのアイデアをおくったよ！\nパパがあとでみるね 👋',
          allowImage: true
        })
      : null;
    const refreshProfileUi = async () => {
      const profile = await api.profile.current();
      const unset = profile.id === 'profile-1' && profile.label === 'profile-1';
      indicator.textContent = `プレイヤー: ${unset ? '未設定' : profile.label}`;
      if (newGameContainer) newGameContainer.hidden = profile.id === 'papa';
      if (historyView) await historyView.refresh();
      if (newGameView && profile.id !== 'papa') await newGameView.refresh();
    };
    await refreshProfileUi();
    window.ForMySonsSettings = window.ForMySonsSettingsView.renderSettings(settingsPanel, api);
    settingsButton.addEventListener('click', () => window.ForMySonsSettings.open());
    window.addEventListener('for-my-sons-profile-changed', refreshProfileUi);
  } catch (error) {
    console.warn('Shared profile foundation unavailable.', error);
  }
}

setupSharedProfile();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn('Service worker registration failed.', error);
      });
  });
}

let recentWankoObjectUrl = null;
async function renderRecentWanko() {
  if (!window.WankoLibrary) return;
  try {
    const wanko = await WankoLibrary.getLatestWanko();
    const panel = document.querySelector('#recent-wanko');
    if (!panel) return;
    if (!wanko) { panel.hidden = true; return; }
    panel.hidden = false;
    document.querySelector('#recent-wanko-name').textContent = wanko.name || 'うちのわんこ';
    if (recentWankoObjectUrl) URL.revokeObjectURL(recentWankoObjectUrl);
    recentWankoObjectUrl = WankoLibrary.blobUrl(wanko);
    document.querySelector('#recent-wanko-image').src = recentWankoObjectUrl;
  } catch (error) {
    console.warn('Recent wanko render failed.', error);
  }
}
window.addEventListener('wanko-library-changed', renderRecentWanko);
window.addEventListener('wanko-active-changed', renderRecentWanko);
renderRecentWanko();
