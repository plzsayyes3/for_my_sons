const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skyDashIndex = fs.readFileSync(path.join(__dirname, '..', 'sky-dash-sample', 'index.html'), 'utf8');

const dbModule = require('../shared/for-my-sons-db.js');
const profileModule = require('../shared/profile-manager.js');
const saveModule = require('../shared/save-store.js');
const walletModule = require('../sky-dash-sample/star-wallet.js');

async function createWallet(profileId) {
  const db = dbModule.createMemoryDatabase();
  const profiles = profileModule.createProfileManager(db);
  await profiles.setCurrent(profileId);
  const save = saveModule.createSaveStore(db, profiles);
  const wallet = walletModule.createStarWallet(save, { profileId });
  await wallet.loadStarWallet();
  return { db, profiles, save, wallet };
}

test('clear reward multiplier and reward values match Sky Dash rules', () => {
  assert.equal(walletModule.BASE_CLEAR_REWARD, 10);
  assert.equal(walletModule.getClearBonusMultiplier(100), 2);
  assert.equal(walletModule.getClearReward(100), 20);
  assert.equal(walletModule.getClearBonusMultiplier(99), 1.5);
  assert.equal(walletModule.getClearReward(99), 15);
  assert.equal(walletModule.getClearBonusMultiplier(80), 1);
  assert.equal(walletModule.getClearReward(80), 10);
  assert.equal(walletModule.getClearBonusMultiplier(69), 0);
  assert.equal(walletModule.getClearReward(69), 0);
});

test('requested wallet scenarios produce 23, 40, 54 and 57 stars', async () => {
  const { wallet } = await createWallet('soma');

  wallet.addStars(3);
  wallet.addStars(walletModule.getClearReward(100));
  assert.equal(wallet.getStars(), 23);

  wallet.addStars(2);
  wallet.addStars(walletModule.getClearReward(99));
  assert.equal(wallet.getStars(), 40);

  wallet.addStars(4);
  wallet.addStars(walletModule.getClearReward(80));
  assert.equal(wallet.getStars(), 54);

  wallet.addStars(3);
  wallet.addStars(walletModule.getClearReward(60));
  assert.equal(wallet.getStars(), 57);

  await wallet.flush();
});

test('clear reward guard grants at most once for the same stage run', async () => {
  const { wallet } = await createWallet('sora');
  const guard = walletModule.createClearRewardGuard(amount => wallet.addStars(amount));

  assert.equal(guard.grant(1, 100), 20);
  assert.equal(guard.grant(1, 100), 0);
  assert.equal(guard.grant(1, 100), 0);
  assert.equal(wallet.getStars(), 20);

  assert.equal(guard.grant(2, 99), 15);
  assert.equal(wallet.getStars(), 35);
  await wallet.flush();
});

test('wallet persists and stays separated by profile', async () => {
  const db = dbModule.createMemoryDatabase();
  const profiles = profileModule.createProfileManager(db);
  const save = saveModule.createSaveStore(db, profiles);

  await profiles.setCurrent('soma');
  const soma = walletModule.createStarWallet(save, { profileId: 'soma' });
  await soma.loadStarWallet();
  soma.addStars(12);
  await soma.flush();

  await profiles.setCurrent('riku');
  const riku = walletModule.createStarWallet(save, { profileId: 'riku' });
  await riku.loadStarWallet();
  assert.equal(riku.getStars(), 0);
  riku.addStars(7);
  await riku.flush();

  const somaReloaded = walletModule.createStarWallet(save, { profileId: 'soma' });
  await somaReloaded.loadStarWallet();
  assert.equal(somaReloaded.getStars(), 12);

  const rikuReloaded = walletModule.createStarWallet(save, { profileId: 'riku' });
  await rikuReloaded.loadStarWallet();
  assert.equal(rikuReloaded.getStars(), 7);
});

test('existing Sky Dash score, progression and countdown rules remain intact', () => {
  assert.match(skyDashIndex, /const PASS_SCORE=70;/);
  assert.match(skyDashIndex, /Math\.max\(0,Math\.min\(100,state\.score\+delta\)\)/);
  assert.match(skyDashIndex, /if\(state\.stageDistance>=STAGE_LENGTH\)triggerClear\(\)/);
  assert.match(skyDashIndex, /pendingNextIndex=state\.stageIndex;/);
  assert.match(skyDashIndex, /state\.score=100;scoreValue\.textContent="100"/);
  assert.match(skyDashIndex, /let count=3;/);
  assert.match(skyDashIndex, /continueBtn\.textContent="もういちど（3秒後スタート）"/);
  assert.match(skyDashIndex, /continueBtn\.textContent="すすむ（3秒後スタート）"/);
});

test('Sky Dash star wallet uses shared storage instead of a new localStorage key', () => {
  assert.match(skyDashIndex, /\.\.\/shared\/for-my-sons-db\.js/);
  assert.match(skyDashIndex, /\.\.\/shared\/profile-manager\.js/);
  assert.match(skyDashIndex, /\.\.\/shared\/save-store\.js/);
  assert.doesNotMatch(skyDashIndex, /localStorage/);
  assert.match(skyDashIndex, /starWallet\.addStars\(1\)/);
  assert.match(skyDashIndex, /createClearRewardGuard/);
});
