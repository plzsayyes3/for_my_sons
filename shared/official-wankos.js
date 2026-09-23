(() => {
  const CATALOG = [
    {
      id: "futsuu-no-wanko",
      name: "ふつうのわんこ",
      path: "../official-wankos/futsuu-no-wanko.wanko.json"
    }
  ];
  const cache = new Map();

  async function fillInsideWhite(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = image.data;
          const w = canvas.width, h = canvas.height;
          const outside = new Uint8Array(w * h);
          const queue = new Int32Array(w * h);
          let head = 0, tail = 0;
          const threshold = 20;

          const isOpen = (index) => data[index * 4 + 3] <= threshold;
          const push = (index) => {
            if (index < 0 || index >= outside.length || outside[index] || !isOpen(index)) return;
            outside[index] = 1;
            queue[tail++] = index;
          };

          for (let x = 0; x < w; x++) {
            push(x);
            push((h - 1) * w + x);
          }
          for (let y = 0; y < h; y++) {
            push(y * w);
            push(y * w + w - 1);
          }

          while (head < tail) {
            const index = queue[head++];
            const x = index % w;
            const y = (index / w) | 0;
            if (x > 0) push(index - 1);
            if (x + 1 < w) push(index + 1);
            if (y > 0) push(index - w);
            if (y + 1 < h) push(index + w);
          }

          for (let index = 0; index < w * h; index++) {
            if (!outside[index] && isOpen(index)) {
              const p = index * 4;
              data[p] = 255;
              data[p + 1] = 255;
              data[p + 2] = 255;
              data[p + 3] = 255;
            }
          }

          ctx.putImageData(image, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("わんこ画像を読み込めませんでした"));
      img.src = dataUrl;
    });
  }

  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    const meta = CATALOG.find(item => item.id === id);
    if (!meta) return null;
    const response = await fetch(meta.path, { cache: "no-store" });
    if (!response.ok) throw new Error("正式わんこの読み込みに失敗しました");
    const source = await response.json();
    const image = await fillInsideWhite(source.image);
    const record = {
      id,
      name: source.name || meta.name,
      createdAt: source.createdAt,
      image,
      stats: source.stats || {},
      official: true
    };
    cache.set(id, record);
    return record;
  }

  async function list() {
    return Promise.all(CATALOG.map(item => load(item.id)));
  }

  window.OfficialWankos = { catalog: CATALOG, load, list, fillInsideWhite };
})();