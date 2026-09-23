((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoGameData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SYMBOLS = [
    'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca',
    'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr',
    'Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd',
    'Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg',
    'Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm',
    'Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'
  ];
  const NAMES_JA = [
    '水素','ヘリウム','リチウム','ベリリウム','ホウ素','炭素','窒素','酸素','フッ素','ネオン',
    'ナトリウム','マグネシウム','アルミニウム','ケイ素','リン','硫黄','塩素','アルゴン','カリウム','カルシウム',
    'スカンジウム','チタン','バナジウム','クロム','マンガン','鉄','コバルト','ニッケル','銅','亜鉛',
    'ガリウム','ゲルマニウム','ヒ素','セレン','臭素','クリプトン','ルビジウム','ストロンチウム','イットリウム','ジルコニウム',
    'ニオブ','モリブデン','テクネチウム','ルテニウム','ロジウム','パラジウム','銀','カドミウム','インジウム','スズ',
    'アンチモン','テルル','ヨウ素','キセノン','セシウム','バリウム','ランタン','セリウム','プラセオジム','ネオジム',
    'プロメチウム','サマリウム','ユウロピウム','ガドリニウム','テルビウム','ジスプロシウム','ホルミウム','エルビウム','ツリウム','イッテルビウム',
    'ルテチウム','ハフニウム','タンタル','タングステン','レニウム','オスミウム','イリジウム','白金','金','水銀',
    'タリウム','鉛','ビスマス','ポロニウム','アスタチン','ラドン','フランシウム','ラジウム','アクチニウム','トリウム',
    'プロトアクチニウム','ウラン','ネプツニウム','プルトニウム','アメリシウム','キュリウム','バークリウム','カリホルニウム','アインスタイニウム','フェルミウム',
    'メンデレビウム','ノーベリウム','ローレンシウム','ラザホージウム','ドブニウム','シーボーギウム','ボーリウム','ハッシウム','マイトネリウム','ダームスタチウム',
    'レントゲニウム','コペルニシウム','ニホニウム','フレロビウム','モスコビウム','リバモリウム','テネシン','オガネソン'
  ];
  const PRIORITY_SYMBOLS = [
    'H','O','C','N','Ca','P','K','S','Na','Cl','Mg','Fe','Si','Al','Cu','Zn','Ti','He','Ne','Ar',
    'Li','F','Br','I','Ag','Sn','Pb','Hg','Ni','Cr','Mn','Co'
  ];
  const prioritySet = new Set(PRIORITY_SYMBOLS);
  const orderedSymbols = [
    ...PRIORITY_SYMBOLS,
    ...SYMBOLS.filter(symbol => symbol !== 'Au' && !prioritySet.has(symbol)),
    'Au'
  ];
  const stageBySymbol = new Map(orderedSymbols.map((symbol, index) => [symbol, `S${String(index + 1).padStart(3, '0')}`]));

  const elements = SYMBOLS.map((symbol, index) => ({
    id: index + 1,
    atomicNumber: index + 1,
    symbol,
    nameJa: NAMES_JA[index],
    stageId: stageBySymbol.get(symbol)
  }));
  const elementById = new Map(elements.map(element => [element.id, element]));
  const elementBySymbol = new Map(elements.map(element => [element.symbol, element]));

  function ally(id, name, role, placeholder, stats, unlockAfterStage = null, legacyWankoId = null) {
    return { id, faction: 'ally', role, name, placeholder, artwork: null, stats, unlockAfterStage, legacyWankoId };
  }
  function foe(id, faction, name, role, placeholder, stats) {
    return { id, faction: faction === 'boss' ? 'enemy' : faction, kind: faction === 'boss' ? 'boss' : 'unit', role, name, placeholder, artwork: null, stats, unlockAfterStage: null, legacyWankoId: null };
  }
  const characters = {
    W01: ally('W01','しばわん','balanced','🐕',{cost:80,hp:115,damage:22,speed:42,range:43,cooldown:.72},null,'futsuu-no-wanko'),
    W02: ally('W02','ダッシュわん','fast','🐶',{cost:150,hp:82,damage:31,speed:76,range:42,cooldown:.58}),
    W03: ally('W03','かべわん','tank','🐢',{cost:180,hp:310,damage:18,speed:24,range:46,cooldown:1.12},'S010','inusensha'),
    W04: ally('W04','はやわん','fast','🐆',{cost:210,hp:105,damage:38,speed:88,range:40,cooldown:.52},'S020'),
    W05: ally('W05','とおくわん','ranged','🦒',{cost:260,hp:135,damage:52,speed:30,range:115,cooldown:1.16},'S035','naganeko'),
    W06: ally('W06','ごりおしわん','attacker','🦍',{cost:320,hp:260,damage:94,speed:26,range:48,cooldown:1.25},'S050'),
    W07: ally('W07','おおきなわん','heavy','🐘',{cost:430,hp:720,damage:130,speed:18,range:58,cooldown:1.55},'S075'),
    W08: ally('W08','きつねわん','balanced','🦊',{cost:500,hp:420,damage:115,speed:45,range:78,cooldown:.78},'S100'),
    E01: foe('E01','enemy','ぷるぷる','basic','👾',{hp:90,damage:17,speed:31,range:39,cooldown:.9}),
    E02: foe('E02','enemy','おにわん','tank','👹',{hp:145,damage:24,speed:23,range:42,cooldown:1.05}),
    E03: foe('E03','enemy','かけぬけ','fast','🦹',{hp:65,damage:13,speed:51,range:35,cooldown:.68}),
    E04: foe('E04','enemy','もこもこ','basic','🐻',{hp:120,damage:22,speed:30,range:44,cooldown:.92}),
    E05: foe('E05','enemy','ながのび','ranged','🦒',{hp:110,damage:34,speed:22,range:92,cooldown:1.2}),
    E06: foe('E06','enemy','いしあたま','tank','🗿',{hp:260,damage:30,speed:16,range:47,cooldown:1.3}),
    E07: foe('E07','enemy','とびはね','fast','🐸',{hp:88,damage:27,speed:59,range:38,cooldown:.72}),
    E08: foe('E08','enemy','からから','basic','💀',{hp:175,damage:38,speed:27,range:45,cooldown:.95}),
    E09: foe('E09','enemy','つのつよ','attacker','🦏',{hp:320,damage:66,speed:21,range:52,cooldown:1.25}),
    E10: foe('E10','enemy','こおりわん','ranged','🐧',{hp:200,damage:46,speed:28,range:105,cooldown:1.1}),
    E11: foe('E11','enemy','かげわん','fast','🐺',{hp:150,damage:50,speed:68,range:42,cooldown:.62}),
    E12: foe('E12','enemy','どっしり','heavy','🦣',{hp:510,damage:78,speed:15,range:56,cooldown:1.45}),
    B01: foe('B01','boss','おおきなおに','boss','👹',{hp:1100,damage:78,speed:17,range:57,cooldown:1.25}),
    B02: foe('B02','boss','からくりボス','boss','🤖',{hp:1350,damage:92,speed:20,range:72,cooldown:1.2}),
    B03: foe('B03','boss','ドラゴンボス','boss','🐉',{hp:1650,damage:118,speed:23,range:65,cooldown:1.15}),
    B04: foe('B04','boss','おばけボス','boss','👻',{hp:1950,damage:130,speed:27,range:88,cooldown:1.1}),
    B05: foe('B05','boss','メカボス','boss','🦾',{hp:2300,damage:160,speed:18,range:68,cooldown:1.35}),
    B06: foe('B06','boss','きょだいボス','boss','🦖',{hp:2700,damage:185,speed:21,range:74,cooldown:1.3}),
    B07: foe('B07','boss','まおうボス','boss','👿',{hp:3150,damage:210,speed:29,range:92,cooldown:1.08}),
    B08: foe('B08','boss','きんのボス','boss','🌟',{hp:3800,damage:260,speed:25,range:102,cooldown:1.02})
  };

  const bossStageNumbers = new Map([[15,'B01'],[30,'B02'],[45,'B03'],[60,'B04'],[75,'B05'],[90,'B06'],[105,'B07'],[118,'B08']]);
  const stages = orderedSymbols.map((symbol, index) => {
    const sequence = index + 1;
    const enemyCount = Math.min(12, 2 + Math.floor((sequence - 1) / 10));
    const enemyId = `E${String(((sequence - 1) % enemyCount) + 1).padStart(2, '0')}`;
    const scale = 1 + (sequence - 1) * .02;
    const enemyEvents = [
      { at: 3, enemyId, count: 2 + Math.floor(sequence / 20), interval: 2.3, hpScale: scale, damageScale: 1 + (sequence - 1) * .008 },
      { at: 17, enemyId: `E${String(Math.min(12, Math.ceil(sequence / 10))).padStart(2, '0')}`, count: 2 + Math.floor(sequence / 24), interval: 1.8, hpScale: scale * 1.12, damageScale: 1 + (sequence - 1) * .01 }
    ];
    const bossId = bossStageNumbers.get(sequence);
    if (bossId) enemyEvents.push({ at: 34, enemyId: bossId, count: 1, interval: 0, hpScale: 1 + sequence * .01, damageScale: 1 + sequence * .007 });
    return {
      id: `S${String(sequence).padStart(3, '0')}`,
      sequence,
      elementId: elementBySymbol.get(symbol).id,
      enemyEvents,
      traits: {
        boneIncomeScale: sequence % 12 === 0 ? 1.2 : 1,
        enemyBaseHpScale: sequence % 10 === 0 ? 1.08 : 1
      },
      baseHp: Math.round(1300 * (1 + (sequence - 1) * .025)),
      unlocks: sequence < 118 ? `S${String(sequence + 1).padStart(3, '0')}` : null
    };
  });
  const stageById = new Map(stages.map(stage => [stage.id, stage]));

  function expandEnemyEvents(events) {
    const expanded = [];
    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex];
      for (let index = 0; index < event.count; index++) {
        expanded.push({ at: event.at + index * event.interval, enemyId: event.enemyId, order: eventIndex });
      }
    }
    expanded.sort((a, b) => a.at - b.at || a.order - b.order);
    return expanded.map(({ at, enemyId }, sequence) => ({ at, enemyId, sequence }));
  }

  function buildStagePlan(stageId) {
    const stage = stageById.get(stageId);
    if (!stage) return null;
    const expanded = stage.enemyEvents.flatMap((sourceEvent, eventIndex) => {
      const source = characters[sourceEvent.enemyId];
      return Array.from({ length: sourceEvent.count }, (_, index) => ({
        at: sourceEvent.at + index * sourceEvent.interval,
        enemyId: sourceEvent.enemyId,
        order: eventIndex,
        stats: {
          ...source.stats,
          hp: Math.round(source.stats.hp * sourceEvent.hpScale),
          damage: Math.round(source.stats.damage * sourceEvent.damageScale * 100) / 100
        }
      }));
    });
    expanded.sort((a, b) => a.at - b.at || a.order - b.order);
    return expanded.map(({ order, ...event }, sequence) => ({ ...event, sequence }));
  }

  function validateDefinitions() {
    const errors = [];
    if (elements.length !== 118 || stages.length !== 118) errors.push('expected 118 elements and stages');
    if (new Set(elements.map(element => element.atomicNumber)).size !== 118) errors.push('duplicate atomic number');
    if (new Set(elements.map(element => element.symbol)).size !== 118) errors.push('duplicate element symbol');
    if (Object.keys(characters).length !== 28) errors.push('expected 28 character slots');
    for (const stage of stages) {
      if (!elementById.has(stage.elementId)) errors.push(`${stage.id}: unknown element`);
      for (const event of stage.enemyEvents) {
        const character = characters[event.enemyId];
        if (!character || !['enemy', 'boss'].includes(character.faction)) errors.push(`${stage.id}: invalid enemy ${event.enemyId}`);
        if (event.at < 0 || event.count < 1 || event.interval < 0 || event.hpScale <= 0 || event.damageScale <= 0) errors.push(`${stage.id}: invalid enemy event`);
      }
    }
    return errors;
  }

  return {
    elements, stages, characters, prioritySymbols: [...PRIORITY_SYMBOLS],
    getElementById: id => elementById.get(Number(id)) || null,
    getElementBySymbol: symbol => elementBySymbol.get(symbol) || null,
    getStage: id => stageById.get(id) || null,
    getCharacter: id => characters[id] || null,
    expandEnemyEvents,
    buildStagePlan,
    validateDefinitions
  };
});
