const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../shared/wanko-game-data.js');

const SYMBOLS_BY_ATOMIC_NUMBER = [
  'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca',
  'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr',
  'Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd',
  'Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg',
  'Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm',
  'Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'
];
const PRIORITY_ORDER = [
  'H','O','C','N','Ca','P','K','S','Na','Cl','Mg','Fe','Si','Al','Cu','Zn','Ti','He','Ne','Ar',
  'Li','F','Br','I','Ag','Sn','Pb','Hg','Ni','Cr','Mn','Co'
];
const CHARACTER_IDS = [
  ...Array.from({ length: 8 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`)
];

test('defines all real elements once with stable atomic-number IDs', () => {
  assert.equal(game.elements.length, 118);
  assert.deepEqual(
    [...game.elements].sort((a, b) => a.atomicNumber - b.atomicNumber)
      .map(element => [element.atomicNumber, element.symbol]),
    SYMBOLS_BY_ATOMIC_NUMBER.map((symbol, index) => [index + 1, symbol])
  );
  assert.equal(game.getElementBySymbol('H').nameJa, '水素');
  assert.equal(game.getElementBySymbol('Au').nameJa, '金');
  assert.equal(game.getElementBySymbol('Og').nameJa, 'オガネソン');
});

test('orders the familiar elements first, remaining elements by atomic number, and Au last', () => {
  const ordered = [...game.stages].sort((a, b) => a.sequence - b.sequence);
  const symbols = ordered.map(stage => game.getElementById(stage.elementId).symbol);
  assert.deepEqual(symbols.slice(0, PRIORITY_ORDER.length), PRIORITY_ORDER);
  const remaining = symbols.slice(PRIORITY_ORDER.length, -1);
  const atomicNumbers = remaining.map(symbol => game.getElementBySymbol(symbol).atomicNumber);
  assert.deepEqual(atomicNumbers, [...atomicNumbers].sort((a, b) => a - b));
  assert.equal(symbols.length, 118);
  assert.equal(symbols.at(-1), 'Au');
  assert.equal(ordered.at(-1).id, 'S118');
});

test('defines exactly 28 characters with correct factions and separated artwork', () => {
  assert.deepEqual(Object.keys(game.characters).sort(), [...CHARACTER_IDS].sort());
  for (const id of CHARACTER_IDS) {
    const character = game.getCharacter(id);
    const faction = id.startsWith('W') ? 'ally' : 'enemy';
    assert.equal(character.faction, faction, `${id} faction`);
    assert.ok(character.role);
    assert.ok(character.stats.hp > 0);
    assert.ok(character.stats.damage > 0);
    assert.ok(character.placeholder);
    assert.equal(character.artwork, null);
  }
  assert.equal(game.getCharacter('W01').legacyWankoId, 'futsuu-no-wanko');
  assert.equal(game.getCharacter('W05').legacyWankoId, 'naganeko');
  assert.equal(game.getCharacter('W03').legacyWankoId, 'inusensha');
  assert.equal(game.getCharacter('B01').kind, 'boss');
});

test('every stage references real elements and valid enemy events', () => {
  assert.equal(game.stages.length, 118);
  for (const stage of game.stages) {
    assert.ok(game.getElementById(stage.elementId), `${stage.id} element`);
    assert.ok(stage.enemyEvents.length > 0, `${stage.id} events`);
    for (const event of stage.enemyEvents) {
      assert.ok(game.getCharacter(event.enemyId), `${stage.id} ${event.enemyId}`);
      assert.ok(['enemy', 'boss'].includes(game.getCharacter(event.enemyId).faction));
      assert.ok(event.at >= 0 && event.count > 0 && event.interval >= 0);
      assert.ok(event.hpScale > 0 && event.damageScale > 0);
    }
    assert.ok(Number.isFinite(stage.traits.boneIncomeScale));
    assert.ok(Number.isFinite(stage.traits.enemyBaseHpScale));
  }
  assert.equal(game.getStage('S001').elementId, 1);
  assert.equal(game.getStage('S118').elementId, 79);
  assert.equal(game.getStage('missing'), null);
  assert.equal(game.getCharacter('missing'), null);
  assert.deepEqual(game.validateDefinitions(), []);
});

test('expands repeated enemy spawns into deterministic chronological events', () => {
  assert.deepEqual(game.expandEnemyEvents([
    { at: 2, enemyId: 'E01', count: 2, interval: 1 },
    { at: 1, enemyId: 'E02', count: 2, interval: 0.5 }
  ]), [
    { at: 1, enemyId: 'E02', sequence: 0 },
    { at: 1.5, enemyId: 'E02', sequence: 1 },
    { at: 2, enemyId: 'E01', sequence: 2 },
    { at: 3, enemyId: 'E01', sequence: 3 }
  ]);
});

test('builds a stage spawn plan with scaled stats and no undeclared enemies', () => {
  const first = game.buildStagePlan('S001');
  assert.equal(first.length, 4);
  assert.deepEqual(first.map(event => event.at), [3, 5.3, 17, 18.8]);
  assert.ok(first.every(event => ['E01', 'E02'].includes(event.enemyId)));
  assert.ok(first.every(event => event.stats.hp > 0 && event.stats.damage > 0));

  const bossStage = game.buildStagePlan('S015');
  const boss = bossStage.find(event => event.enemyId === 'B01');
  assert.ok(boss);
  assert.equal(boss.at, 34);
  assert.equal(boss.stats.hp, 2915);
  assert.equal(boss.stats.damage, 130.65);
  assert.equal(game.buildStagePlan('missing'), null);
});
