const board = document.querySelector("#board");
const moveCount = document.querySelector("#move-count");
const newPuzzleButton = document.querySelector("#new-puzzle");
const difficultyButtons = [...document.querySelectorAll("[data-size]")];
const celebration = document.querySelector("#celebration");
const clearMoves = document.querySelector("#clear-moves");
const playAgain = document.querySelector("#play-again");
const timeAttackToggle = document.querySelector("#time-attack-toggle");
const timeReadout = document.querySelector("#time-readout");
const timerDisplay = document.querySelector("#timer");
const bestTimeDisplay = document.querySelector("#best-time");
const countdown = document.querySelector("#countdown");
const countdownText = document.querySelector("#countdown-text");
const clearTimeRow = document.querySelector("#clear-time-row");
const clearTime = document.querySelector("#clear-time");
const clearBest = document.querySelector("#clear-best");

const importButton = document.querySelector("#import-button");
const importModal = document.querySelector("#import-modal");
const importCloseButton = document.querySelector("#import-close");
const deviceImportButton = document.querySelector("#device-import");
const imageInput = document.querySelector("#image-input");
const artLibrary = document.querySelector("#art-library");
const libraryEmpty = document.querySelector("#library-empty");
const emojiOnlyButton = document.querySelector("#emoji-only");
const currentArt = document.querySelector("#current-art");
const currentArtImage = document.querySelector("#current-art-image");
const clearImportButton = document.querySelector("#clear-import");
const toast = document.querySelector("#toast");

const cropModal = document.querySelector("#crop-modal");
const cropPreview = document.querySelector("#crop-preview");
const cropCtx = cropPreview.getContext("2d", { alpha: false });
const cropCloseButton = document.querySelector("#crop-close");
const cropResetButton = document.querySelector("#crop-reset");
const cropConfirmButton = document.querySelector("#crop-confirm");
const cropZoom = document.querySelector("#crop-zoom");

const DB_NAME = "for-my-sons-art";
const STORE_NAME = "drawings";
const BEST_TIME_KEY = "split-puzzle-best-times-v1";

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
let customArt = null;
let customArtUrl = null;
let galleryUrls = [];
let toastTimer = null;

let cropSession = null;
const cropPointers = new Map();
let cropGesture = null;

let timeAttackEnabled = false;
let timerRunning = false;
let timerStart = 0;
let elapsedMs = 0;
let timerFrame = null;
let countdownToken = 0;
let playLocked = false;
let lastFinishTime = null;
let lastWasBest = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(ms) {
  const totalTenths = Math.max(0, Math.floor(ms / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + tenths;
}

function readBestTimes() {
  try {
    const saved = JSON.parse(localStorage.getItem(BEST_TIME_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function bestKey() {
  return String(size);
}

function getBestTime() {
  const value = Number(readBestTimes()[bestKey()]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function saveBestTime(ms) {
  const times = readBestTimes();
  const key = bestKey();
  const previous = Number(times[key]);
  const isBest = !Number.isFinite(previous) || previous <= 0 || ms < previous;

  if (isBest) {
    times[key] = Math.round(ms);
    localStorage.setItem(BEST_TIME_KEY, JSON.stringify(times));
  }

  return isBest;
}

function updateBestDisplay() {
  const best = getBestTime();
  bestTimeDisplay.textContent = best ? formatTime(best) : "--:--.-";
}

function cancelTimer() {
  timerRunning = false;
  if (timerFrame !== null) {
    cancelAnimationFrame(timerFrame);
    timerFrame = null;
  }
}

function updateTimer(now = performance.now()) {
  if (!timerRunning) return;
  elapsedMs = now - timerStart;
  timerDisplay.textContent = formatTime(elapsedMs);
  timerFrame = requestAnimationFrame(updateTimer);
}

function stopTimer() {
  if (!timerRunning) return elapsedMs;
  elapsedMs = performance.now() - timerStart;
  cancelTimer();
  timerDisplay.textContent = formatTime(elapsedMs);
  return elapsedMs;
}

function setPlayLocked(locked) {
  playLocked = locked;
  board.classList.toggle("is-locked", locked);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function prepareTimeAttack() {
  countdownToken += 1;
  const token = countdownToken;
  cancelTimer();
  elapsedMs = 0;
  timerDisplay.textContent = formatTime(0);
  lastFinishTime = null;
  lastWasBest = false;
  updateBestDisplay();

  if (!timeAttackEnabled) {
    countdown.hidden = true;
    setPlayLocked(false);
    return;
  }

  setPlayLocked(true);
  countdown.hidden = false;

  for (const label of ["3", "2", "1"]) {
    if (token !== countdownToken || !timeAttackEnabled) return;
    countdownText.textContent = label;
    countdownText.style.animation = "none";
    void countdownText.offsetWidth;
    countdownText.style.animation = "";
    await sleep(650);
  }

  if (token !== countdownToken || !timeAttackEnabled) return;
  countdownText.textContent = "GO!";
  countdownText.style.animation = "none";
  void countdownText.offsetWidth;
  countdownText.style.animation = "";
  await sleep(420);

  if (token !== countdownToken || !timeAttackEnabled) return;
  countdown.hidden = true;
  setPlayLocked(false);
  timerStart = performance.now();
  timerRunning = true;
  timerFrame = requestAnimationFrame(updateTimer);
}

function setTimeAttackEnabled(enabled) {
  timeAttackEnabled = enabled;
  timeAttackToggle.classList.toggle("is-active", enabled);
  timeAttackToggle.setAttribute("aria-pressed", String(enabled));
  timeReadout.hidden = !enabled;

  if (!enabled) {
    countdownToken += 1;
    cancelTimer();
    countdown.hidden = true;
    setPlayLocked(false);
    elapsedMs = 0;
    timerDisplay.textContent = formatTime(0);
    lastFinishTime = null;
    lastWasBest = false;
    showToast("タイムアタック OFF");
  } else {
    showToast("タイムアタック START");
    startNewPuzzle(size);
  }
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1700);
}

function createArtPool(count) {
  const emojis = shuffled(EMOJI_ART);
  if (!customArt || count < 1) return emojis.slice(0, count);
  return [customArt, ...emojis.slice(0, Math.max(0, count - 1))];
}

function makePuzzle(nextSize) {
  const count = nextSize * nextSize;
  const edgeCount = 2 * nextSize * (nextSize - 1);
  const artPool = shuffled(createArtPool(edgeCount));
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
      const edge = { id: "h-" + row + "-" + col, art };
      solved[leftIndex].right = edge;
      solved[rightIndex].left = edge;
    }
  }

  for (let row = 0; row < nextSize - 1; row += 1) {
    for (let col = 0; col < nextSize; col += 1) {
      const topIndex = row * nextSize + col;
      const bottomIndex = topIndex + nextSize;
      const art = artPool[artIndex++];
      const edge = { id: "v-" + row + "-" + col, art };
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
    if (timeAttackEnabled) {
      lastFinishTime = stopTimer();
      lastWasBest = saveBestTime(lastFinishTime);
      updateBestDisplay();
    } else {
      lastFinishTime = null;
      lastWasBest = false;
    }
    setPlayLocked(true);
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
  countdownToken += 1;
  cancelTimer();
  size = nextSize;
  moves = 0;
  selectedIndex = null;
  pieces = makePuzzle(size);
  hideCelebration();

  difficultyButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.size) === size);
  });

  render();
  updateBestDisplay();
  prepareTimeAttack();
}

function showCelebration() {
  clearMoves.textContent = String(moves);

  if (timeAttackEnabled && lastFinishTime !== null) {
    clearTime.textContent = formatTime(lastFinishTime);
    clearTimeRow.hidden = false;
    clearBest.hidden = !lastWasBest;
  } else {
    clearTimeRow.hidden = true;
    clearBest.hidden = true;
  }

  celebration.classList.add("is-open");
  celebration.setAttribute("aria-hidden", "false");
  playAgain.focus();
}

function hideCelebration() {
  celebration.classList.remove("is-open");
  celebration.setAttribute("aria-hidden", "true");
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
    if (targetIndex !== state.index) swapPieces(state.index, targetIndex);
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

async function readPuzzleArt() {
  const db = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return records
    .filter((record) => record.kind === "puzzle-art" && record.blob)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function storePuzzleArt(blob, source = "import") {
  const db = await openDatabase();
  const id = "puzzle-art-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const record = {
    id,
    kind: "puzzle-art",
    source,
    ratio: "1:1",
    createdAt: new Date().toISOString(),
    width: 1000,
    height: 1000,
    blob
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  db.close();
  return record;
}

function cleanupGalleryUrls() {
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryUrls = [];
}

async function renderLibrary() {
  cleanupGalleryUrls();
  artLibrary.replaceChildren();

  try {
    const records = await readPuzzleArt();
    libraryEmpty.hidden = records.length > 0;

    records.forEach((record) => {
      const url = URL.createObjectURL(record.blob);
      galleryUrls.push(url);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "art-card";
      button.setAttribute("aria-label", "この絵をパズルにつかう");

      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      button.appendChild(image);

      button.addEventListener("click", () => {
        selectCustomArt(record.blob, record.id);
        closeImportModal();
        showToast("この絵をパズルに入れたよ");
      });

      artLibrary.appendChild(button);
    });
  } catch (error) {
    console.error(error);
    libraryEmpty.hidden = false;
  }
}

async function openImportModal() {
  await renderLibrary();
  importModal.classList.add("is-open");
  importModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeImportModal() {
  importModal.classList.remove("is-open");
  importModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  cleanupGalleryUrls();
}

function selectCustomArt(blob, id = "custom") {
  if (customArtUrl) URL.revokeObjectURL(customArtUrl);
  customArtUrl = URL.createObjectURL(blob);
  customArt = {
    id,
    type: "image",
    value: customArtUrl
  };
  currentArtImage.src = customArtUrl;
  currentArt.hidden = false;
  startNewPuzzle();
}

function clearCustomArt() {
  if (customArtUrl) URL.revokeObjectURL(customArtUrl);
  customArtUrl = null;
  customArt = null;
  currentArtImage.removeAttribute("src");
  currentArt.hidden = true;
  startNewPuzzle();
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
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

function openCropEditor(source) {
  cropSession = {
    source,
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
    cx: (source.naturalWidth || source.width) / 2,
    cy: (source.naturalHeight || source.height) / 2,
    zoom: 1
  };
  cropPointers.clear();
  cropGesture = null;
  renderCrop();

  importModal.classList.remove("is-open");
  importModal.setAttribute("aria-hidden", "true");
  cleanupGalleryUrls();

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
  cropSession = null;
}

function makeCroppedBlob() {
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

  const dataUrl = output.toDataURL("image/png");
  const parts = dataUrl.split(",");
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

async function confirmCrop() {
  if (!cropSession) return;
  cropConfirmButton.disabled = true;

  try {
    const blob = makeCroppedBlob();
    const record = await storePuzzleArt(blob, "import");
    closeCropEditor();
    selectCustomArt(blob, record.id);
    showToast("正方形で保存してパズルに入れたよ");
  } catch (error) {
    console.error(error);
    showToast("画像を保存できなかった");
  } finally {
    cropConfirmButton.disabled = false;
  }
}

board.addEventListener("pointerdown", (event) => {
  if (playLocked) return;
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
  if (playLocked) return;
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
timeAttackToggle.addEventListener("click", () => {
  setTimeAttackEnabled(!timeAttackEnabled);
});

celebration.addEventListener("click", (event) => {
  if (event.target === celebration) hideCelebration();
});

importButton.addEventListener("click", openImportModal);
importCloseButton.addEventListener("click", closeImportModal);
clearImportButton.addEventListener("click", clearCustomArt);
emojiOnlyButton.addEventListener("click", () => {
  clearCustomArt();
  closeImportModal();
  showToast("絵文字だけにしたよ");
});

importModal.addEventListener("click", (event) => {
  if (event.target === importModal) closeImportModal();
});

deviceImportButton.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (!file) return;

  try {
    const image = await loadImageFromFile(file);
    openCropEditor(image);
  } catch (error) {
    console.error(error);
    showToast("画像をひらけなかった");
  }
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

window.addEventListener("resize", updateEmojiScale);
window.addEventListener("beforeunload", () => {
  cancelTimer();
  countdownToken += 1;
  if (customArtUrl) URL.revokeObjectURL(customArtUrl);
  cleanupGalleryUrls();
});

updateBestDisplay();
startNewPuzzle(3);
