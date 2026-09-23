(() => {
  const CATALOG = [
    {
      id: "futsuu-no-wanko",
      name: "ふつうのわんこ",
      path: "../official-wankos/futsuu-no-wanko.wanko.json?v=3"
    },
    {
      id: "naganeko",
      name: "長ねこ",
      path: "../official-wankos/naganeko.wanko.json?v=2"
    },
    {
      id: "inusensha",
      name: "いぬせんしゃ",
      path: "../official-wankos/inusensha.wanko.json?v=1"
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
      image: source.imagePath || source.image,
      stats: source.stats || {},
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
