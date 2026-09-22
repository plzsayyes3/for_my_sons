const board = document.querySelector("#board");
const moveCount = document.querySelector("#move-count");
const newPuzzleButton = document.querySelector("#new-puzzle");
const importButton = document.querySelector("#import-button");
const difficultyButtons = [...document.querySelectorAll("[data-size]")];
const celebration = document.querySelector("#celebration");
const clearMoves = document.querySelector("#clear-moves");
const playAgain = document.querySelector("#play-again");
const toast = document.querySelector("#toast");

const customSource = document.querySelector("#custom-source");
const customPreview = document.querySelector("#custom-preview");
const removeCustomButton = document.querySelector("#remove-custom");

const importModal = document.querySelector("#import-modal");
const importCloseButton = document.querySelector("#import-close");
const deviceImportButton = document.querySelector("#device-import");
const fileInput = document.querySelector("#file-input");
const paintGallery = document.querySelector("#paint-gallery");
const galleryEmpty = document.querySelector("#gallery-empty");

const cropModal = document.querySelector("#crop-modal");
const cropPreview = document.querySelector("#crop-preview");
const cropCtx = cropPreview.getContext("2d", { alpha: false });
const cropCloseButton = document.querySelector("#crop-close");
const cropResetButton = document.querySelector("#crop-reset");
const cropConfirmButton = document.querySelector("#crop-confirm");
const cropZoom = document.querySelector("#crop-zoom");

const DB_NAME = "for-my-sons-art";
const STORE_NAME = "drawings";

const EMOJI_ART = [
  "🐶","🐱","🐰","🦊","🐻","🐼","🐸","🐵","🦁","🐯",
  "🐷","🐮","🐨","🐙","🦄","🐲","🍎","🍊","🍋","🍉",
  "🍓","🍒","🥕","🌽","🍩","⚽","🏀","🚗","🚕","🚲",
  "✈️","🚀","⭐","☀️","🌙","🔥","💧","❤️","💎","🎈",
  "🎁","🎵","🌈","🍀","🐝","🦋","🐢","🐳","🍄","👑"
].map((value, index) => ({
  id: "emoji-" + index,
  type: "emoji",
  value
}));

let size = 3;
let pieces = [];
let moves = 0;
let selectedIndex = null;
let pointerState = null;
let activeCustomArt = null;
let toastTimer = null;

let cropSession = null;
const cropPointers = new Map();
let cropGesture = null;
let galleryObjectUrls = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createArtPool(count) {
  const emoji = shuffled(EMOJI_ART);
  if (!activeCustomArt) return emoji.slice(0, count);

  const pool = [
    activeCustomArt,
    ...emoji.slice(0, Math.max(0, count - 1))
  ];
  return shuffled(pool);
}

function makePuzzle(nextSize) {
  const count = nextSize * nextSize;
  const edgeCount = 2 * nextSize * (nextSize - 1);
  const artPool = createArtPool(edgeCount);
  let artIndex = 0;

  const solved = Array.from({ length: count }, (_, index) => ({
    id: "tile-" + index,
    top: null,
    right: null,
    bottom: null,
    left: null
  }));

  for (let row = 0; row < nextSize; row += 1) {
    for (let col = 0; col < nextSize - 1; col += 1) {
      const leftIndex = row * nextSize + col;
      const rightIndex = leftIndex + 1;
      const art = artPool[artIndex++];
      const edge = {
        id: "h-" + row + "-" + col,
        art
      };
      solved[leftIndex].right = edge;
      solved[rightIndex].left = edge;
    }
  }

  for (let row = 0; row < nextSize - 1; row += 1) {
    for (let col = 0; col < nextSize; col += 1) {
      const topIndex = row * nextSize + col;
      const bottomIndex = topIndex + nextSize;
      const art = artPool[artIndex++];
      const edge = {
        id: "v-" + row + "-" + col,
        art
      };
      solved[topIndex].bottom = edge;
      solved[bottomIndex].top = edge;
    }
  }

  let shuffledPieces = shuffled(solved);
  while (shuffledPieces.every((piece, index) => piece.id === solved[index].id)) {
    shuffledPieces = shuffled(solved);
  }

  return shuffledPieces;
}

function makeArtElement(edge, edgeName) {
  if (!edge) return null;

  const mark = document.createElement("span");
  mark.className = "edge-mark edge-" + edgeName;
  mark.dataset.edgeId = edge.id;
  mark.dataset.artType = edge.art.type;
  mark.setAttribute("aria-hidden", "true");

  if (edge.art.type === "image") {
    const image = document.createElement("img");
    image.src = edge.art.value;
    image.alt = "";
    mark.appendChild(image);
  } else {
    mark.textContent = edge.art.value;
  }

  return mark;
}

function render() {
  board.style.setProperty("--size", String(size));
  board.setAttribute("aria-rowcount", String(size));
  board.setAttribute("aria-colcount", String(size));
  board.replaceChildren();

  pieces.forEach((piece, index) => {
    const row = Math.floor(index / size) + 1;
    const col = (index % size) + 1;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.dataset.index = String(index);
    tile.setAttribute("role", "gridcell");
    tile.setAttribute("aria-rowindex", String(row));
    tile.setAttribute("aria-colindex", String(col));
    tile.setAttribute("aria-label", row + "だん " + col + "ばんのピース");

    if (selectedIndex === index) tile.classList.add("is-selected");

    ["top", "right", "bottom", "left"].forEach((edgeName) => {
      const art = makeArtElement(piece[edgeName], edgeName);
      if (art) tile.appendChild(art);
    });

    board.appendChild(tile);
  });

  moveCount.textContent = String(moves);
  updateEmojiScale();
}

function updateEmojiScale() {
  const width = board.getBoundingClientRect().width;
  if (!width) return;
  const tileWidth = width / size;
  const emojiSize = Math.max(34, Math.min(94, tileWidth * 0.74));
  board.style.setProperty("--emoji-size", emojiSize + "px");
}

function edgeId(edge) {
  return edge ? edge.id : null;
}

function isSolved() {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col;
      const tile = pieces[index];

      if (row === 0 && tile.top !== null) return false;
      if (col === 0 && tile.left !== null) return false;
      if (row === size - 1 && tile.bottom !== null) return false;
      if (col === size - 1 && tile.right !== null) return false;

      if (col < size - 1) {
        const right = pieces[index + 1];
        if (edgeId(tile.right) !== edgeId(right.left)) return false;
      }

      if (row < size - 1) {
        const below = pieces[index + size];
        if (edgeId(tile.bottom) !== edgeId(below.top)) return false;
      }
    }
  }
  return true;
}

function swapPieces(a, b) {
  if (a === b || a < 0 || b < 0 || a >= pieces.length || b >= pieces.length) return;

  [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
  selectedIndex = null;
  moves += 1;
  render();

  if (isSolved()) {
    window.setTimeout(showCelebration, 180);
  }
}

function handleTileTap(index) {
  if (selectedIndex === null) {
    selectedIndex = index;
    render();
    return;
  }

  if (selectedIndex === index) {
    selectedIndex = null;
    render();
    return;
  }

  swapPieces(selectedIndex, index);
}

function startNewPuzzle(nextSize = size) {
  size = nextSize;
  moves = 0;
  selectedIndex = null;
  pieces = makePuzzle(size);
  hideCelebration();

  difficultyButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.size) === size);
  });

  render();
}

function showCelebration() {
  clearMoves.textContent = String(moves);
  celebration.classList.add("is-open");
  celebration.setAttribute("aria-hidden", "false");
  playAgain.focus();
}

function hideCelebration() {
  celebration.classList.remove("is-open");
  celebration.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1800);
}

function beginDrag(event, tile) {
  const index = Number(tile.dataset.index);
  const rect = tile.getBoundingClientRect();

  pointerState = {
    pointerId: event.pointerId,
    index,
    tile,
    startX: event.clientX,
    startY: event.clientY,
    rect,
    dragging: false,
    ghost: null
  };

  tile.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!pointerState || event.pointerId !== pointerState.pointerId) return;

  const dx = event.clientX - pointerState.startX;
  const dy = event.clientY - pointerState.startY;

  if (!pointerState.dragging && Math.hypot(dx, dy) > 8) {
    pointerState.dragging = true;
    const ghost = pointerState.tile.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("is-selected");
    ghost.style.width = pointerState.rect.width + "px";
    ghost.style.height = pointerState.rect.height + "px";
    ghost.style.left = pointerState.rect.left + "px";
    ghost.style.top = pointerState.rect.top + "px";
    document.body.appendChild(ghost);
    pointerState.tile.classList.add("is-drag-source");
    pointerState.ghost = ghost;
  }

  if (pointerState.dragging && pointerState.ghost) {
    pointerState.ghost.style.left = pointerState.rect.left + dx + "px";
    pointerState.ghost.style.top = pointerState.rect.top + dy + "px";
  }
}

function finishDrag(event) {
  if (!pointerState || event.pointerId !== pointerState.pointerId) return;

  const state = pointerState;
  pointerState = null;

  if (state.tile.hasPointerCapture(event.pointerId)) {
    state.tile.releasePointerCapture(event.pointerId);
  }

  state.tile.classList.remove("is-drag-source");
  if (state.ghost) state.ghost.remove();

  if (!state.dragging) {
    handleTileTap(state.index);
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const targetTile = target ? target.closest(".tile") : null;

  if (targetTile && board.contains(targetTile)) {
    const targetIndex = Number(targetTile.dataset.index);
    if (targetIndex !== state.index) {
      swapPieces(state.index, targetIndex);
    }
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("kind", "kind");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getPaintArt() {
  const db = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records
    .filter((record) => record?.blob instanceof Blob && (record.kind === "puzzle-art" || record.kind === "paint"))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function clearGalleryUrls() {
  galleryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryObjectUrls = [];
}

async function renderPaintGallery() {
  clearGalleryUrls();
  paintGallery.replaceChildren();

  try {
    const records = await getPaintArt();
    galleryEmpty.hidden = records.length > 0;

    records.forEach((record) => {
      const url = URL.createObjectURL(record.blob);
      galleryObjectUrls.push(url);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-item";
      button.setAttribute("aria-label", "この絵をつかう");

      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      button.appendChild(image);

      button.addEventListener("click", () => {
        closeImportModal();
        openCropFromBlob(record.blob);
      });

      paintGallery.appendChild(button);
    });
  } catch (error) {
    console.error(error);
    galleryEmpty.hidden = false;
    galleryEmpty.textContent = "保存した絵を読みこめませんでした。";
  }
}

function openImportModal() {
  importModal.classList.add("is-open");
  importModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  renderPaintGallery();
}

function closeImportModal() {
  importModal.classList.remove("is-open");
  importModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  clearGalleryUrls();
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      resolve({
        image,
        cleanup: () => URL.revokeObjectURL(url)
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読みこめませんでした"));
    };

    image.src = url;
  });
}

function cropMetrics() {
  const points = [...cropPointers.values()];
  if (!points.length) return null;
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let distance = null;
  if (points.length >= 2) {
    distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  return { x, y, distance };
}

function cropSizeInSource() {
  if (!cropSession) return 0;
  return Math.min(cropSession.width, cropSession.height) / cropSession.zoom;
}

function clampCropCenter() {
  if (!cropSession) return;
  const half = cropSizeInSource() / 2;
  cropSession.cx = clamp(cropSession.cx, half, cropSession.width - half);
  cropSession.cy = clamp(cropSession.cy, half, cropSession.height - half);
}

function renderCrop() {
  if (!cropSession) return;
  const cropSize = cropSizeInSource();
  const sx = cropSession.cx - cropSize / 2;
  const sy = cropSession.cy - cropSize / 2;

  cropCtx.save();
  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, cropPreview.width, cropPreview.height);
  cropCtx.drawImage(
    cropSession.source,
    sx, sy, cropSize, cropSize,
    0, 0, cropPreview.width, cropPreview.height
  );
  cropCtx.restore();
  cropZoom.value = String(cropSession.zoom);
}

function resetCrop() {
  if (!cropSession) return;
  cropSession.cx = cropSession.width / 2;
  cropSession.cy = cropSession.height / 2;
  cropSession.zoom = 1;
  renderCrop();
}

function openCropEditor(source, cleanup) {
  cropSession = {
    source,
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
    cx: (source.naturalWidth || source.width) / 2,
    cy: (source.naturalHeight || source.height) / 2,
    zoom: 1,
    cleanup
  };

  cropPointers.clear();
  cropGesture = null;
  renderCrop();
  cropModal.classList.add("is-open");
  cropModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeCropEditor() {
  cropModal.classList.remove("is-open");
  cropModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  cropPointers.clear();
  cropGesture = null;

  if (cropSession?.cleanup) cropSession.cleanup();
  cropSession = null;
}

function makeCroppedCanvas() {
  const output = document.createElement("canvas");
  output.width = 1000;
  output.height = 1000;
  const outputCtx = output.getContext("2d", { alpha: false });
  const cropSize = cropSizeInSource();
  const sx = cropSession.cx - cropSize / 2;
  const sy = cropSession.cy - cropSize / 2;

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, 1000, 1000);
  outputCtx.drawImage(cropSession.source, sx, sy, cropSize, cropSize, 0, 0, 1000, 1000);
  return output;
}

function confirmCrop() {
  if (!cropSession) return;
  const cropped = makeCroppedCanvas();
  const dataUrl = cropped.toDataURL("image/png");

  activeCustomArt = {
    id: "custom-" + Date.now(),
    type: "image",
    value: dataUrl
  };

  customPreview.src = dataUrl;
  customSource.hidden = false;
  closeCropEditor();
  startNewPuzzle(size);
  showToast("この絵をパズルに入れたよ");
}

async function openCropFromBlob(blob) {
  try {
    const loaded = await loadImageFromBlob(blob);
    openCropEditor(loaded.image, loaded.cleanup);
  } catch (error) {
    console.error(error);
    showToast("画像を読みこめなかった");
  }
}

board.addEventListener("pointerdown", (event) => {
  const tile = event.target.closest(".tile");
  if (!tile || !board.contains(tile)) return;
  event.preventDefault();
  beginDrag(event, tile);
});

board.addEventListener("pointermove", (event) => {
  if (!pointerState) return;
  event.preventDefault();
  moveDrag(event);
});

board.addEventListener("pointerup", (event) => {
  event.preventDefault();
  finishDrag(event);
});

board.addEventListener("pointercancel", (event) => {
  if (!pointerState || event.pointerId !== pointerState.pointerId) return;
  if (pointerState.ghost) pointerState.ghost.remove();
  pointerState.tile.classList.remove("is-drag-source");
  pointerState = null;
});

board.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const tile = event.target.closest(".tile");
  if (!tile) return;
  event.preventDefault();
  handleTileTap(Number(tile.dataset.index));
});

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => startNewPuzzle(Number(button.dataset.size)));
});

newPuzzleButton.addEventListener("click", () => startNewPuzzle());
playAgain.addEventListener("click", () => startNewPuzzle());

importButton.addEventListener("click", openImportModal);
importCloseButton.addEventListener("click", closeImportModal);

importModal.addEventListener("click", (event) => {
  if (event.target === importModal) closeImportModal();
});

deviceImportButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  closeImportModal();
  openCropFromBlob(file);
});

removeCustomButton.addEventListener("click", () => {
  activeCustomArt = null;
  customPreview.removeAttribute("src");
  customSource.hidden = true;
  startNewPuzzle(size);
  showToast("絵文字だけにもどしたよ");
});

cropPreview.addEventListener("pointerdown", (event) => {
  if (!cropSession) return;
  event.preventDefault();
  cropPreview.setPointerCapture(event.pointerId);
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  cropGesture = cropMetrics();
});

cropPreview.addEventListener("pointermove", (event) => {
  if (!cropSession || !cropPointers.has(event.pointerId)) return;
  event.preventDefault();

  const before = cropGesture;
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const after = cropMetrics();
  if (!before || !after) {
    cropGesture = after;
    return;
  }

  const rect = cropPreview.getBoundingClientRect();
  const sourceSizeBefore = cropSizeInSource();

  cropSession.cx -= (after.x - before.x) * sourceSizeBefore / rect.width;
  cropSession.cy -= (after.y - before.y) * sourceSizeBefore / rect.height;

  if (before.distance && after.distance) {
    cropSession.zoom = clamp(
      cropSession.zoom * (after.distance / before.distance),
      1,
      6
    );
  }

  clampCropCenter();
  cropGesture = after;
  renderCrop();
});

function releaseCropPointer(event) {
  cropPointers.delete(event.pointerId);
  if (cropPreview.hasPointerCapture(event.pointerId)) {
    cropPreview.releasePointerCapture(event.pointerId);
  }
  cropGesture = cropMetrics();
}

cropPreview.addEventListener("pointerup", releaseCropPointer);
cropPreview.addEventListener("pointercancel", releaseCropPointer);

cropPreview.addEventListener("wheel", (event) => {
  if (!cropSession) return;
  event.preventDefault();
  cropSession.zoom = clamp(cropSession.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 1, 6);
  clampCropCenter();
  renderCrop();
}, { passive: false });

cropZoom.addEventListener("input", () => {
  if (!cropSession) return;
  cropSession.zoom = Number(cropZoom.value);
  clampCropCenter();
  renderCrop();
});

cropResetButton.addEventListener("click", resetCrop);
cropConfirmButton.addEventListener("click", confirmCrop);
cropCloseButton.addEventListener("click", closeCropEditor);

cropModal.addEventListener("click", (event) => {
  if (event.target === cropModal) closeCropEditor();
});

celebration.addEventListener("click", (event) => {
  if (event.target === celebration) hideCelebration();
});

window.addEventListener("resize", updateEmojiScale);

startNewPuzzle(3);
