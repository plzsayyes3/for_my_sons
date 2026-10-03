const sectionsRoot = document.querySelector('#app-sections');
const recentSection = document.querySelector('#recent-apps-section');
const recentGrid = document.querySelector('#recent-app-grid');
const template = document.querySelector('#app-template');

const RECENT_KEY = 'for-my-sons-recent-apps-v1';
const MAX_RECENT = 4;

const CATEGORY_ORDER = ['game', 'create', 'tool'];
const CATEGORY_META = {
  game: {
    kicker: 'PLAY',
    title: 'ゲーム',
    note: 'あそぶ'
  },
  create: {
    kicker: 'CREATE & LEARN',
    title: 'つくる・まなぶ',
    note: 'つくる・れんしゅう'
  },
  tool: {
    kicker: 'TOOLS',
    title: 'ツール',
    note: 'べんり'
  }
};

const fallbackApps = [
  {
    id: 'kids-3d-playgrand',
    name: '3Dこうさく',
    url: './kids-3d-playgrand/?v=5',
    icon: './assets/kids-3d.svg',
    description: 'かたちをつくって、くっつけて、3Dにしよう',
    category: 'create'
  },
  {
    id: 'minecraft-english',
    name: 'Minecraft English',
    url: 'https://plzsayyes3.github.io/English-for-Minecraft/',
    icon: './assets/minecraft-english.svg',
    description: 'Minecraftにつながる英語をたのしく学ぼう',
    category: 'create'
  }
];

function readRecentIds() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, MAX_RECENT) : [];
  } catch (_) {
    return [];
  }
}

function rememberRecent(appId) {
  if (!appId) return;
  const next = [appId, ...readRecentIds().filter((id) => id !== appId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (_) {}
}

function createAppTile(app, options = {}) {
  const fragment = template.content.cloneNode(true);
  const link = fragment.querySelector('.app-tile');
  const icon = fragment.querySelector('.app-icon');
  const label = fragment.querySelector('.app-name');

  link.href = app.url;
  link.dataset.appId = app.id;
  if (options.recent) link.classList.add('app-tile-recent');
  link.setAttribute('aria-label', `${app.name}をひらく。${app.description ?? ''}`);
  link.addEventListener('click', () => rememberRecent(app.id));
  icon.src = app.icon;
  icon.alt = '';
  label.textContent = app.name;

  return fragment;
}

function renderRecentApps(apps) {
  if (!recentSection || !recentGrid) return;
  const byId = new Map(apps.map((app) => [app.id, app]));
  const recentApps = readRecentIds().map((id) => byId.get(id)).filter(Boolean);
  recentGrid.replaceChildren();

  if (!recentApps.length) {
    recentSection.hidden = true;
    return;
  }

  recentApps.forEach((app) => recentGrid.appendChild(createAppTile(app, { recent: true })));
  recentSection.hidden = false;
}

function createCategorySection(category, apps) {
  const meta = CATEGORY_META[category] || CATEGORY_META.game;
  const section = document.createElement('section');
  section.className = `app-category app-category-${category}`;
  section.setAttribute('aria-labelledby', `category-${category}-title`);

  const heading = document.createElement('div');
  heading.className = 'category-heading';
  heading.innerHTML = `
    <div>
      <p class="category-kicker">${meta.kicker}</p>
      <h2 id="category-${category}-title">${meta.title}</h2>
    </div>
    <span class="category-note">${meta.note}</span>
  `;

  const grid = document.createElement('div');
  grid.className = 'app-grid';
  apps.forEach((app) => grid.appendChild(createAppTile(app)));

  section.append(heading, grid);
  return section;
}

function renderApps(apps) {
  if (!sectionsRoot) return;
  sectionsRoot.replaceChildren();

  CATEGORY_ORDER.forEach((category) => {
    const categoryApps = apps.filter((app) => (app.category || 'game') === category);
    if (categoryApps.length) sectionsRoot.appendChild(createCategorySection(category, categoryApps));
  });

  const known = new Set(CATEGORY_ORDER);
  const otherApps = apps.filter((app) => !known.has(app.category || 'game'));
  if (otherApps.length) sectionsRoot.appendChild(createCategorySection('game', otherApps));

  renderRecentApps(apps);
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
