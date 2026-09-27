const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbModule = require('../shared/for-my-sons-db.js');
const profileModule = require('../shared/profile-manager.js');
const saveModule = require('../shared/save-store.js');
const walletModule = require('../sky-dash-sample/star-wallet.js');
const shopModule = require('../sky-dash-sample/shop-system.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'sky-dash-sample', 'index.html'), 'utf8');

async function createContext(profileId, stars = 0, db = dbModule.createMemoryDatabase()) {
  const profiles = profileModule.createProfileManager(db);
  await profiles.setCurrent(profileId);
  const save = saveModule.createSaveStore(db, profiles);
  const wallet = walletModule.createStarWallet(save, { profileId });
  await wallet.loadStarWallet();
  if (stars > 0) {
    wallet.addStars(stars);
    await wallet.flush();
  }
  const shop = shopModule.createShopStore(save, wallet, { profileId });
  await shop.loadShopState();
  return { db, profiles, save, wallet, shop };
}

test('shop has five upgrades, five consumables and at least three future slots', () => {
  assert.equal(shopModule.SHOP_ITEMS.filter(x => x.type === 'upgrade').length, 5);
  assert.equal(shopModule.SHOP_ITEMS.filter(x => x.type === 'consumable').length, 5);
  assert.ok(shopModule.SHOP_ITEMS.filter(x => x.type === 'placeholder').length >= 3);
});

test('insufficient stars never changes wallet or purchase state', async () => {
  const { wallet, shop } = await createContext('soma', 10);
  const result = await shop.purchase('star-magnet');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient-stars');
  assert.equal(wallet.getStars(), 10);
  assert.equal(shop.getState().upgrades.starMagnet, 0);
});

test('normal upgrade purchase spends stars and persists level', async () => {
  const { db, save, wallet, shop } = await createContext('soma', 30);
  const result = await shop.purchase('star-magnet');
  assert.equal(result.ok, true);
  assert.equal(wallet.getStars(), 10);
  assert.equal(shop.getState().upgrades.starMagnet, 1);
  await shop.flush();

  const walletReloaded = walletModule.createStarWallet(save, { profileId:'soma' });
  await walletReloaded.loadStarWallet();
  const shopReloaded = shopModule.createShopStore(save, walletReloaded, { profileId:'soma' });
  await shopReloaded.loadShopState();
  assert.equal(walletReloaded.getStars(), 10);
  assert.equal(shopReloaded.getState().upgrades.starMagnet, 1);
  void db;
});

test('max level purchase consumes no stars and stays at level five', async () => {
  const db = dbModule.createMemoryDatabase();
  const profiles = profileModule.createProfileManager(db);
  await profiles.setCurrent('soma');
  const save = saveModule.createSaveStore(db, profiles);
  const state = shopModule.createDefaultState();
  state.upgrades.starMagnet = 5;
  await save.put('soma', 'sky-dash', 'shop-state', state);
  const wallet = walletModule.createStarWallet(save, { profileId:'soma' });
  await wallet.loadStarWallet();
  wallet.addStars(300);
  await wallet.flush();
  const shop = shopModule.createShopStore(save, wallet, { profileId:'soma' });
  await shop.loadShopState();

  const result = await shop.purchase('star-magnet');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'max-level');
  assert.equal(wallet.getStars(), 300);
  assert.equal(shop.getState().upgrades.starMagnet, 5);
});

test('consumable purchase, selection and use decrement exactly one', async () => {
  const { wallet, shop } = await createContext('sora', 20);
  const bought = await shop.purchase('score-shield');
  assert.equal(bought.ok, true);
  assert.equal(wallet.getStars(), 0);
  assert.equal(shop.getState().consumables.scoreGuard, 1);
  assert.equal(shop.selectConsumable('scoreGuard'), true);
  assert.equal(shop.consumeSelected('scoreGuard'), true);
  assert.equal(shop.getState().consumables.scoreGuard, 0);
  assert.equal(shop.getState().selectedConsumable, null);
});

test('shop state stays separated by profile', async () => {
  const db = dbModule.createMemoryDatabase();
  const soma = await createContext('soma', 30, db);
  await soma.shop.purchase('star-magnet');
  await soma.shop.flush();

  const sora = await createContext('sora', 0, db);
  assert.equal(sora.shop.getState().upgrades.starMagnet, 0);
  assert.equal(sora.wallet.getStars(), 0);
});

test('future placeholder cannot spend stars or mutate state', async () => {
  const { wallet, shop } = await createContext('riku', 100);
  const before = shop.getState();
  const result = await shop.purchase('future-01');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unavailable');
  assert.equal(wallet.getStars(), 100);
  assert.deepEqual(shop.getState(), before);
});

test('star double affects road stars but not clear reward', () => {
  assert.equal(shopModule.getRoadStarAmount(false), 1);
  assert.equal(shopModule.getRoadStarAmount(true), 2);
  assert.equal(walletModule.getClearReward(100), 20);
  assert.equal(walletModule.getClearReward(99), 15);
});

test('safety level five reduces obstacle damage to five', () => {
  const state = shopModule.createDefaultState();
  state.upgrades.safety = 5;
  assert.equal(shopModule.getObstacleDamage(state), 5);
  assert.equal(shopModule.resolveObstacleImpact({ state }).damage, 5);
});

test('star magnet expands pickup range gradually', () => {
  const state = shopModule.createDefaultState();
  const base = shopModule.getStarPickupRange(state);
  state.upgrades.starMagnet = 5;
  const max = shopModule.getStarPickupRange(state);
  assert.ok(max.x > base.x && max.z > base.z);
  assert.ok(max.x < 2 && max.z < 3);
});

test('start energy restores five only for the first configured hit', () => {
  const state = shopModule.createDefaultState();
  const first = shopModule.resolveObstacleImpact({ state, selectedEffect:'startEnergy', itemUsed:false });
  assert.equal(first.damage, 10);
  assert.equal(first.recovery, 5);
  assert.equal(first.consumeEffect, 'startEnergy');
  const later = shopModule.resolveObstacleImpact({ state, selectedEffect:'startEnergy', itemUsed:true });
  assert.equal(later.recovery, 0);
  assert.equal(later.consumeEffect, null);
});

test('score guard blocks first configured hit but not a later used hit', () => {
  const state = shopModule.createDefaultState();
  const first = shopModule.resolveObstacleImpact({ state, selectedEffect:'scoreGuard', itemUsed:false });
  assert.equal(first.damage, 0);
  assert.equal(first.consumeEffect, 'scoreGuard');
  const second = shopModule.resolveObstacleImpact({ state, selectedEffect:'scoreGuard', itemUsed:true });
  assert.equal(second.damage, 10);
  assert.equal(second.consumeEffect, null);
});

test('invincible blocks damage only while active', () => {
  const state = shopModule.createDefaultState();
  assert.equal(shopModule.resolveObstacleImpact({ state, invincibleActive:true }).damage, 0);
  assert.equal(shopModule.resolveObstacleImpact({ state, invincibleActive:false }).damage, 10);
  assert.equal(shopModule.INVINCIBLE_MS, 5000);
});

test('boost tank and drink heal scale gently with level', () => {
  const state = shopModule.createDefaultState();
  const baseBoost = shopModule.getBoostDuration(state);
  state.upgrades.boostTank = 5;
  assert.ok(shopModule.getBoostDuration(state) > baseBoost);
  assert.ok(shopModule.getBoostDuration(state) < 3);
  state.upgrades.drinkHeal = 5;
  assert.equal(shopModule.getDrinkHeal(state), 10);
  assert.match(source, /Math\.max\(0,Math\.min\(100,state\.score\+delta\)\)/);
});

test('jump shoes increase jump without a large leap', () => {
  const state = shopModule.createDefaultState();
  const base = shopModule.getJumpVelocity(state);
  state.upgrades.jumpShoes = 5;
  assert.ok(shopModule.getJumpVelocity(state) > base);
  assert.ok(shopModule.getJumpVelocity(state) <= 10.2);
});

test('duplicate concurrent purchase is blocked before a second charge', async () => {
  const { wallet, shop } = await createContext('papa', 100);
  const [a,b] = await Promise.all([shop.purchase('star-magnet'), shop.purchase('star-magnet')]);
  assert.equal([a,b].filter(x => x.ok).length, 1);
  assert.equal([a,b].filter(x => x.reason === 'busy').length, 1);
  assert.equal(wallet.getStars(), 80);
  assert.equal(shop.getState().upgrades.starMagnet, 1);
});

test('shop UI is data-driven, safe-area aware and keeps one ITEM control', () => {
  assert.match(source, /SHOP_ITEMS\.filter\(x=>x\.type==='upgrade'\)/);
  assert.match(source, /SHOP_ITEMS\.filter\(x=>x\.type==='consumable'\)/);
  assert.match(source, /SHOP_ITEMS\.filter\(x=>x\.type==='placeholder'\)/);
  assert.match(source, /id="shopLayer"/);
  assert.match(source, /id="shopStars"/);
  assert.match(source, /id="shopClose"/);
  assert.match(source, /id="itemButton"/);
  assert.match(source, /env\(safe-area-inset-top\)/);
  assert.match(source, /env\(safe-area-inset-right\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /env\(safe-area-inset-left\)/);
  assert.doesNotMatch(source, /localStorage/);
});

test('game integration routes effects through existing wallet, boost and obstacle paths', () => {
  assert.match(source, /function applyObstacleHit\(\)/);
  assert.match(source, /resolveObstacleImpact/);
  assert.match(source, /doBoost\(\)/);
  assert.match(source, /getBoostDuration\(shopState,1\.25\)/);
  assert.match(source, /getStarPickupRange\(shopState\)/);
  assert.match(source, /getRoadStarAmount\(runEffects\.starDoubleUntil>now\)/);
  assert.match(source, /if\(amount===1\)starWallet\.addStars\(1\);else starWallet\.addStars\(amount\)/);
  assert.match(source, /clearRewardGuard\.grant\(stageRunId,state\.score\)/);
});
