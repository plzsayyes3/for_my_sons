((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SkyDashShopSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEFAULT_APP_ID = 'sky-dash';
  const DEFAULT_SAVE_KEY = 'shop-state';
  const MAX_UPGRADE_LEVEL = 5;
  const STAR_DOUBLE_MS = 15000;
  const INVINCIBLE_MS = 5000;
  const START_ENERGY_RECOVERY = 5;

  const SHOP_ITEMS = [
    { id:'star-magnet', type:'upgrade', icon:'🧲', name:'スターじしゃく', description:'星を少し遠くから取りやすくする', effect:'starMagnet', maxLevel:5, prices:[20,40,70,110,160] },
    { id:'boost-tank', type:'upgrade', icon:'⚡', name:'ブーストタンク', description:'ブーストが少し長く続く', effect:'boostTank', maxLevel:5, prices:[20,40,70,110,160] },
    { id:'drink-heal', type:'upgrade', icon:'🥤', name:'げんきアップ', description:'げんきドリンクの回復量が増える', effect:'drinkHeal', maxLevel:5, prices:[20,40,70,110,160] },
    { id:'jump-shoes', type:'upgrade', icon:'👟', name:'ジャンプシューズ', description:'ジャンプが少し高くなる', effect:'jumpShoes', maxLevel:5, prices:[20,40,70,110,160] },
    { id:'safety', type:'upgrade', icon:'🪖', name:'セーフティ', description:'障害物の減点を少し軽くする', effect:'safety', maxLevel:5, prices:[20,40,70,110,160] },

    { id:'score-shield', type:'consumable', icon:'🛡️', name:'スコアガード', description:'次のミス1回の減点を0にする', effect:'scoreGuard', price:20, activation:'auto-hit' },
    { id:'start-energy', type:'consumable', icon:'💚', name:'スタートげんき', description:'最初のミス後に5点だけ自動回復', effect:'startEnergy', price:15, activation:'auto-hit' },
    { id:'star-double', type:'consumable', icon:'✨', name:'スターダブル', description:'15秒間、道中の星が2倍になる', effect:'starDouble', price:30, activation:'manual' },
    { id:'invincible', type:'consumable', icon:'🌈', name:'むてき', description:'5秒間、障害物の減点を受けない', effect:'invincible', price:35, activation:'manual' },
    { id:'boost-bottle', type:'consumable', icon:'🚀', name:'ブーストボトル', description:'ITEMボタンでブーストを発動する', effect:'boostBottle', price:20, activation:'manual' },

    { id:'future-01', type:'placeholder', icon:'？', name:'？？？？', description:'どんなアイテムがほしい？' },
    { id:'future-02', type:'placeholder', icon:'？', name:'？？？？', description:'新しい能力を考えてみよう！' },
    { id:'future-03', type:'placeholder', icon:'？', name:'？？？？', description:'ここに次のアイデアが入るよ' }
  ];

  const UPGRADE_EFFECTS = SHOP_ITEMS.filter(item => item.type === 'upgrade').map(item => item.effect);
  const CONSUMABLE_EFFECTS = SHOP_ITEMS.filter(item => item.type === 'consumable').map(item => item.effect);

  function clampInt(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, Math.trunc(number)));
  }

  function createDefaultState() {
    return {
      version: 1,
      upgrades: Object.fromEntries(UPGRADE_EFFECTS.map(effect => [effect, 0])),
      consumables: Object.fromEntries(CONSUMABLE_EFFECTS.map(effect => [effect, 0])),
      selectedConsumable: null
    };
  }

  function normalizeShopState(value) {
    const base = createDefaultState();
    const input = value && typeof value === 'object' ? value : {};
    for (const effect of UPGRADE_EFFECTS) {
      base.upgrades[effect] = clampInt(input.upgrades?.[effect], 0, MAX_UPGRADE_LEVEL);
    }
    for (const effect of CONSUMABLE_EFFECTS) {
      base.consumables[effect] = clampInt(input.consumables?.[effect], 0, 999);
    }
    const selected = input.selectedConsumable;
    base.selectedConsumable = CONSUMABLE_EFFECTS.includes(selected) && base.consumables[selected] > 0 ? selected : null;
    return base;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function getItem(itemId) {
    return SHOP_ITEMS.find(item => item.id === itemId) || null;
  }

  function getItemByEffect(effect) {
    return SHOP_ITEMS.find(item => item.effect === effect) || null;
  }

  function getUpgradeLevel(state, effect) {
    return clampInt(state?.upgrades?.[effect], 0, MAX_UPGRADE_LEVEL);
  }

  function getConsumableCount(state, effect) {
    return clampInt(state?.consumables?.[effect], 0, 999);
  }

  function getPrice(item, state) {
    if (!item || item.type === 'placeholder') return null;
    if (item.type === 'consumable') return clampInt(item.price, 0, 999999);
    const level = getUpgradeLevel(state, item.effect);
    if (level >= item.maxLevel) return null;
    return clampInt(item.prices?.[level], 0, 999999);
  }

  function getStarPickupRange(state) {
    const level = getUpgradeLevel(state, 'starMagnet');
    return { z: 1.35 + level * 0.22, x: 1.05 + level * 0.14 };
  }

  function getBoostDuration(state, baseSeconds = 1.25) {
    return Number(baseSeconds) + getUpgradeLevel(state, 'boostTank') * 0.18;
  }

  function getDrinkHeal(state) {
    return 5 + getUpgradeLevel(state, 'drinkHeal');
  }

  function getJumpVelocity(state) {
    return 9.3 + getUpgradeLevel(state, 'jumpShoes') * 0.17;
  }

  function getObstacleDamage(state) {
    return Math.max(5, 10 - getUpgradeLevel(state, 'safety'));
  }

  function getRoadStarAmount(activeStarDouble) {
    return activeStarDouble ? 2 : 1;
  }

  function resolveObstacleImpact(options = {}) {
    const state = options.state || createDefaultState();
    const selectedEffect = options.selectedEffect || null;
    const itemUsed = Boolean(options.itemUsed);
    const invincibleActive = Boolean(options.invincibleActive);
    if (invincibleActive) return { damage:0, recovery:0, consumeEffect:null, blockedBy:'invincible' };
    if (!itemUsed && selectedEffect === 'scoreGuard') {
      return { damage:0, recovery:0, consumeEffect:'scoreGuard', blockedBy:'scoreGuard' };
    }
    const damage = getObstacleDamage(state);
    if (!itemUsed && selectedEffect === 'startEnergy') {
      return { damage, recovery:START_ENERGY_RECOVERY, consumeEffect:'startEnergy', blockedBy:null };
    }
    return { damage, recovery:0, consumeEffect:null, blockedBy:null };
  }

  function createShopStore(saveStore, starWallet, options = {}) {
    if (!saveStore?.get || !saveStore?.put) throw new TypeError('save store is required');
    if (!starWallet?.getStars || !starWallet?.spendStars || !starWallet?.addStars || !starWallet?.flush) {
      throw new TypeError('star wallet with spend support is required');
    }
    const profileId = options.profileId;
    if (typeof profileId !== 'string' || !profileId) throw new TypeError('profileId is required');
    const appId = options.appId || DEFAULT_APP_ID;
    const saveKey = options.saveKey || DEFAULT_SAVE_KEY;
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    let state = createDefaultState();
    let loaded = false;
    let writeQueue = Promise.resolve();
    let purchaseQueue = Promise.resolve();
    const purchaseLocks = new Set();

    function notify() {
      onChange(cloneState(state));
    }

    async function loadShopState() {
      const record = await saveStore.get(profileId, appId, saveKey);
      state = normalizeShopState(record?.value);
      loaded = true;
      notify();
      return cloneState(state);
    }

    function saveShopState() {
      if (!loaded) return Promise.reject(new Error('shop state is not loaded'));
      const snapshot = cloneState(state);
      const operation = writeQueue.then(() => saveStore.put(profileId, appId, saveKey, snapshot));
      writeQueue = operation.catch(() => {});
      return operation;
    }

    async function flush() {
      await purchaseQueue.catch(() => {});
      await writeQueue;
      await starWallet.flush();
      return cloneState(state);
    }

    async function purchaseNow(itemId) {
      if (!loaded) throw new Error('shop state is not loaded');
      const item = getItem(itemId);
      if (!item || item.type === 'placeholder') {
        return { ok:false, reason:'unavailable', stars:starWallet.getStars(), state:cloneState(state) };
      }
      const price = getPrice(item, state);
      if (price == null) {
        return { ok:false, reason:'max-level', stars:starWallet.getStars(), state:cloneState(state) };
      }
      if (starWallet.getStars() < price) {
        return { ok:false, reason:'insufficient-stars', stars:starWallet.getStars(), state:cloneState(state) };
      }

      const before = cloneState(state);
      if (!starWallet.spendStars(price)) {
        return { ok:false, reason:'insufficient-stars', stars:starWallet.getStars(), state:cloneState(state) };
      }
      await starWallet.flush();

      if (item.type === 'upgrade') state.upgrades[item.effect] += 1;
      else state.consumables[item.effect] += 1;

      try {
        await saveShopState();
      } catch (error) {
        state = before;
        starWallet.addStars(price);
        await starWallet.flush();
        notify();
        throw error;
      }
      notify();
      return { ok:true, reason:'purchased', stars:starWallet.getStars(), state:cloneState(state), item:{...item} };
    }

    function purchase(itemId) {
      if (purchaseLocks.has(itemId)) {
        return Promise.resolve({ ok:false, reason:'busy', stars:starWallet.getStars(), state:cloneState(state) });
      }
      purchaseLocks.add(itemId);
      const operation = purchaseQueue.then(() => purchaseNow(itemId), () => purchaseNow(itemId));
      purchaseQueue = operation.catch(() => {});
      return operation.finally(() => purchaseLocks.delete(itemId));
    }

    function selectConsumable(effect) {
      if (!loaded) throw new Error('shop state is not loaded');
      if (effect == null) {
        state.selectedConsumable = null;
      } else {
        const item = getItemByEffect(effect);
        if (!item || item.type !== 'consumable' || getConsumableCount(state, effect) <= 0) return false;
        state.selectedConsumable = effect;
      }
      notify();
      saveShopState().catch(onError);
      return true;
    }

    function consumeSelected(expectedEffect) {
      if (!loaded) throw new Error('shop state is not loaded');
      const effect = state.selectedConsumable;
      if (!effect || effect !== expectedEffect || getConsumableCount(state, effect) <= 0) return false;
      state.consumables[effect] -= 1;
      if (state.consumables[effect] <= 0) state.selectedConsumable = null;
      notify();
      saveShopState().catch(onError);
      return true;
    }

    return {
      loadShopState,
      saveShopState,
      flush,
      purchase,
      selectConsumable,
      consumeSelected,
      getState: () => cloneState(state),
      getProfileId: () => profileId
    };
  }

  return {
    DEFAULT_APP_ID,
    DEFAULT_SAVE_KEY,
    MAX_UPGRADE_LEVEL,
    STAR_DOUBLE_MS,
    INVINCIBLE_MS,
    START_ENERGY_RECOVERY,
    SHOP_ITEMS,
    createDefaultState,
    normalizeShopState,
    getItem,
    getItemByEffect,
    getUpgradeLevel,
    getConsumableCount,
    getPrice,
    getStarPickupRange,
    getBoostDuration,
    getDrinkHeal,
    getJumpVelocity,
    getObstacleDamage,
    getRoadStarAmount,
    resolveObstacleImpact,
    createShopStore
  };
});
