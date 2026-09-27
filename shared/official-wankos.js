(() => {
  const CATALOG = [
    {
      id: "futsuu-no-wanko",
      name: "ふつうのわんこ",
      path: "../official-wankos/futsuu-no-wanko.wanko.json?v=4"
    },
    {
      id: "naganeko",
      name: "長ねこ",
      path: "../official-wankos/naganeko.wanko.json?v=3"
    },
    {
      id: "inusensha",
      name: "いぬせんしゃ",
      path: "../official-wankos/inusensha.wanko.json?v=2"
    },
    {
      id: "kurionen",
      name: "クリオネン",
      path: "../official-wankos/kurionen.wanko.json?v=2"
    },
    {
      id: "nen-o-kometa-snake",
      name: "念を込めたスネーク",
      faction: "ally",
      path: "../official-wankos/nen-o-kometa-snake.wanko.json?v=2"
    },
    {
      id: "bakuhatsu-dama",
      name: "爆発玉",
      faction: "ally",
      path: "../official-wankos/bakuhatsu-dama.wanko.json?v=2"
    },
    {
      id: "hammer",
      name: "ハンマー",
      faction: "ally",
      path: "../official-wankos/hammer.wanko.json?v=2"
    },
    {
      id: "nagaashi",
      name: "強裏長足",
      faction: "ally",
      path: "../official-wankos/nagaashi.wanko.json?v=1"
    },
    {
      id: "big-monster",
      name: "ビックな怪物",
      faction: "ally",
      path: "../official-wankos/big-monster.wanko.json?v=1"
    },
    {
      id: "dorisha",
      name: "ドリ車",
      faction: "ally",
      path: "../official-wankos/dorisha.wanko.json?v=1"
    },
    {
      id: "ebifurai-fura",
      name: "エビフライフラ",
      faction: "ally",
      path: "../official-wankos/ebifurai-fura.wanko.json?v=1"
    }
  ];
  const cache = new Map();

  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    const meta = CATALOG.find(item => item.id === id);
    if (!meta) return null;

    const response = await fetch(meta.path, { cache: "no-store" });
    if (!response.ok) throw new Error("正式わんこの読み込みに失敗しました");

    const source = await response.json();
    const record = {
      id,
      name: source.name || meta.name,
      createdAt: source.createdAt,
      image: source.imagePath || source.image || null,
      placeholder: source.placeholder || "🐾",
      faction: source.faction || meta.faction || "ally",
      stats: source.stats || {},
      behavior: source.behavior || {},
      renderScale: Number(source.renderScale) || 1,
      official: true
    };
    cache.set(id, record);
    return record;
  }

  async function list() {
    const results = await Promise.allSettled(CATALOG.map(item => load(item.id)));
    return results.filter(result => result.status === "fulfilled" && result.value).map(result => result.value);
  }

  window.OfficialWankos = { catalog: CATALOG, load, list };
})();
