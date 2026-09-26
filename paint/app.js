const canvas = document.querySelector("#paint-canvas");
const frame = document.querySelector("#canvas-frame");
const stage = document.querySelector("#canvas-stage");
const ctx = canvas.getContext("2d", { alpha: false });

const ratioButtons = [...document.querySelectorAll("[data-ratio]")];
const colorButtons = [...document.querySelectorAll("[data-color]")];
const sizeButtons = [...document.querySelectorAll("[data-size]")];

const brushButton = document.querySelector("#brush");
const eraserButton = document.querySelector("#eraser");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
const clearButton = document.querySelector("#clear");
const puzzleSaveButton = document.querySelector("#puzzle-save");
const phoneSaveButton = document.querySelector("#phone-save");
const wankoSaveButton = document.querySelector("#wanko-save");
const toast = document.querySelector("#toast");

const wankoModal = document.querySelector("#wanko-modal");
const wankoCloseButton = document.querySelector("#wanko-close");
const wankoConfirmButton = document.querySelector("#wanko-confirm");
const wankoLibraryOpenButton = document.querySelector("#wanko-library-open");
const wankoNameInput = document.querySelector("#wanko-name");
const wankoPreviewImg = document.querySelector("#wanko-preview-img");
const wankoFactionButtons = [...document.querySelectorAll("[data-faction]")];
const wankoDetails = document.querySelector("#wanko-details");
const wankoRequestStatus = document.querySelector("#wanko-request-status");
let pendingWankoBlob = null;
let pendingWankoDataUrl = null;
let pendingWankoUrl = null;
let selectedWankoFaction = null;
let requestSubmitInFlight = false;
let sharedForMySons = null;

const cropModal = document.querySelector("#crop-modal");
const cropPreview = document.querySelector("#crop-preview");
const cropCtx = cropPreview.getContext("2d", { alpha: false });
const cropCloseButton = document.querySelector("#crop-close");
const cropResetButton = document.querySelector("#crop-reset");
const cropConfirmButton = document.querySelector("#crop-confirm");
const cropZoom = document.querySelector("#crop-zoom");

const RATIOS = {
  "1:1": { w: 1, h: 1, pixels: [1000, 1000] },
  "3:2": { w: 3, h: 2, pixels: [1200, 800] },
  "2:3": { w: 2, h: 3, pixels: [800, 1200] },
  "16:9": { w: 16, h: 9, pixels: [1280, 720] }
};

const DRAFT_KEY = "for-my-sons-paint-drafts-v1";
const DB_NAME = "for-my-sons-art";
const STORE_NAME = "drawings";

let currentRatio = "1:1";
let tool = "brush";
let color = "#222222";
let brushSize = 24;
let activeStroke = null;
let pointerId = null;
let toastTimer = null;

let cropSession = null;
const cropPointers = new Map();
let cropGesture = null;

const drafts = Object.fromEntries(
  Object.keys(RATIOS).map((ratio) => [ratio, { actions: [], redo: [] }])
);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function restoreDrafts() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    for (const ratio of Object.keys(RATIOS)) {
      if (Array.isArray(saved[ratio]?.actions)) {
        drafts[ratio].actions = saved[ratio].actions;
      }
    }
  } catch (error) {
    console.warn("Draft restore failed", error);
  }
}

function persistDrafts() {
  try {
    const compact = {};
    for (const ratio of Object.keys(RATIOS)) {
      compact[ratio] = { actions: drafts[ratio].actions };
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(compact));
  } catch (error) {
    console.warn("Draft save failed", error);
  }
}

function currentDraft() {
  return drafts[currentRatio];
}

function fitFrame() {
  const ratio = RATIOS[currentRatio];
  const area = stage.getBoundingClientRect();
  if (!area.width || !area.height) return;

  let width = Math.min(area.width, 700);
  let height = width * ratio.h / ratio.w;

  if (height > area.height) {
    height = area.height;
    width = height * ratio.w / ratio.h;
  }

  frame.style.width = Math.floor(width) + "px";
  frame.style.height = Math.floor(height) + "px";
}

function configureCanvas() {
  const [width, height] = RATIOS[currentRatio].pixels;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  redraw();
}

function fillWhite() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawStroke(stroke) {
  if (!stroke.points?.length) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const first = stroke.points[0];

  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x * canvas.width, first.y * canvas.height, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
    for (let i = 1; i < stroke.points.length; i += 1) {
      const p = stroke.points[i];
      ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function redraw() {
  fillWhite();
  for (const action of currentDraft().actions) {
    if (action.type === "clear") {
      fillWhite();
    } else if (action.type === "stroke") {
      drawStroke(action);
    }
  }
  updateHistoryButtons();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  };
}

function startStroke(event) {
  if (pointerId !== null) return;
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);

  const point = canvasPoint(event);
  const pressure = event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.6;
  const effectiveSize = brushSize * (event.pointerType === "pen" ? 0.65 + pressure * 0.75 : 1);

  activeStroke = {
    type: "stroke",
    tool,
    color,
    size: effectiveSize,
    points: [point]
  };

  currentDraft().actions.push(activeStroke);
  currentDraft().redo = [];
  drawStroke(activeStroke);
  updateHistoryButtons();
}

function continueStroke(event) {
  if (event.pointerId !== pointerId || !activeStroke) return;

  const events = typeof event.getCoalescedEvents === "function"
    ? event.getCoalescedEvents()
    : [event];

  const previous = activeStroke.points[activeStroke.points.length - 1];
  const nextPoints = events.map(canvasPoint);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = activeStroke.tool === "eraser" ? "#ffffff" : activeStroke.color;
  ctx.lineWidth = activeStroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(previous.x * canvas.width, previous.y * canvas.height);

  for (const point of nextPoints) {
    activeStroke.points.push(point);
    ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
  }

  ctx.stroke();
  ctx.restore();
}

function endStroke(event) {
  if (event.pointerId !== pointerId) return;

  if (canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }

  pointerId = null;
  activeStroke = null;
  persistDrafts();
  updateHistoryButtons();
}

function setRatio(ratio) {
  if (!RATIOS[ratio] || ratio === currentRatio) return;
  currentRatio = ratio;

  ratioButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ratio === ratio);
  });

  fitFrame();
  configureCanvas();
}

function setTool(nextTool) {
  tool = nextTool;
  brushButton.classList.toggle("is-active", tool === "brush");
  eraserButton.classList.toggle("is-active", tool === "eraser");
  brushButton.setAttribute("aria-pressed", String(tool === "brush"));
  eraserButton.setAttribute("aria-pressed", String(tool === "eraser"));
}

function updateHistoryButtons() {
  undoButton.disabled = currentDraft().actions.length === 0;
  redoButton.disabled = currentDraft().redo.length === 0;
}

function undo() {
  const draft = currentDraft();
  if (!draft.actions.length) return;
  draft.redo.push(draft.actions.pop());
  redraw();
  persistDrafts();
}

function redo() {
  const draft = currentDraft();
  if (!draft.redo.length) return;
  draft.actions.push(draft.redo.pop());
  redraw();
  persistDrafts();
}

function clearCanvas() {
  const draft = currentDraft();
  if (!draft.actions.length) return;
  draft.actions.push({ type: "clear" });
  draft.redo = [];
  redraw();
  persistDrafts();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1900);
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

async function storePuzzleArt(blob) {
  const db = await openDatabase();
  const id = "puzzle-art-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const record = {
    id,
    kind: "puzzle-art",
    source: "paint",
    ratio: "1:1",
    originalRatio: currentRatio,
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

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = (parts[0].match(/data:(.*?);base64/) || [])[1] || "image/png";
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function canvasBlobSync(sourceCanvas) {
  return dataUrlToBlob(sourceCanvas.toDataURL("image/png"));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function canShareFile(file) {
  if (!navigator.share) return false;
  if (!navigator.canShare) return true;
  try {
    return navigator.canShare({ files: [file] });
  } catch (error) {
    return false;
  }
}

async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: "image/png" });

  if (canShareFile(file)) {
    try {
      await navigator.share({
        files: [file],
        title
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      console.warn("Share failed", error);
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
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

function openCropEditor(source, onConfirm) {
  cropSession = {
    source,
    width: source.width || source.naturalWidth,
    height: source.height || source.naturalHeight,
    cx: (source.width || source.naturalWidth) / 2,
    cy: (source.height || source.naturalHeight) / 2,
    zoom: 1,
    onConfirm
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
  const blob = canvasBlobSync(cropped);
  const callback = cropSession.onConfirm;
  closeCropEditor();
  callback?.(blob, cropped);
}

async function saveForPuzzle() {
  openCropEditor(canvas, async (blob) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storePromise = storePuzzleArt(blob);

    const sharePromise = shareOrDownload(
      blob,
      "split-puzzle-" + stamp + ".png",
      "Split Puzzle"
    );

    try {
      await storePromise;
      const result = await sharePromise;
      if (result === "cancelled") {
        showToast("パズルに保存したよ");
      } else {
        showToast("パズルに保存したよ ✓");
      }
    } catch (error) {
      console.error(error);
      showToast("パズルへの保存に失敗しました");
    }
  });
}

function makeWankoCanvas() {
  const output = document.createElement("canvas");
  output.width = 512;
  output.height = 512;
  const out = output.getContext("2d", { alpha: true });
  out.clearRect(0, 0, 512, 512);

  const sourceRatio = canvas.width / canvas.height;
  let drawW = 448;
  let drawH = 448;
  if (sourceRatio > 1) drawH = drawW / sourceRatio;
  else drawW = drawH * sourceRatio;
  const ox = (512 - drawW) / 2;
  const oy = (512 - drawH) / 2;
  const sizeScale = Math.min(drawW / canvas.width, drawH / canvas.height);

  function drawTransparentStroke(stroke) {
    if (!stroke.points?.length) return;
    out.save();
    out.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    out.strokeStyle = stroke.color;
    out.fillStyle = stroke.color;
    out.lineWidth = Math.max(1, stroke.size * sizeScale);
    out.lineCap = "round";
    out.lineJoin = "round";
    const px = (p) => ({ x: ox + p.x * drawW, y: oy + p.y * drawH });
    const first = px(stroke.points[0]);
    if (stroke.points.length === 1) {
      out.beginPath();
      out.arc(first.x, first.y, out.lineWidth / 2, 0, Math.PI * 2);
      out.fill();
    } else {
      out.beginPath();
      out.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        const p = px(stroke.points[i]);
        out.lineTo(p.x, p.y);
      }
      out.stroke();
    }
    out.restore();
  }

  for (const action of currentDraft().actions) {
    if (action.type === "clear") out.clearRect(0, 0, 512, 512);
    if (action.type === "stroke") drawTransparentStroke(action);
  }
  return output;
}

function closeWankoModal() {
  wankoModal.classList.remove("is-open");
  wankoModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (pendingWankoUrl) URL.revokeObjectURL(pendingWankoUrl);
  pendingWankoUrl = null;
  pendingWankoBlob = null;
  pendingWankoDataUrl = null;
  selectedWankoFaction = null;
  wankoFactionButtons.forEach((button) => button.classList.remove("is-selected"));
  wankoDetails.classList.add("is-hidden");
  wankoNameInput.value = "";
  wankoRequestStatus.textContent = "";
  wankoConfirmButton.disabled = true;
}

function openWankoModal() {
  const hasDrawing = currentDraft().actions.some((action) => action.type === "stroke");
  if (!hasDrawing) {
    showToast("まず、わんこを描いてね");
    return;
  }
  const output = makeWankoCanvas();
  pendingWankoDataUrl = output.toDataURL("image/png");
  pendingWankoBlob = dataUrlToBlob(pendingWankoDataUrl);
  if (pendingWankoUrl) URL.revokeObjectURL(pendingWankoUrl);
  pendingWankoUrl = URL.createObjectURL(pendingWankoBlob);
  wankoPreviewImg.src = pendingWankoUrl;
  selectedWankoFaction = null;
  wankoFactionButtons.forEach((button) => button.classList.remove("is-selected"));
  wankoDetails.classList.add("is-hidden");
  wankoNameInput.value = "";
  wankoRequestStatus.textContent = "";
  wankoConfirmButton.disabled = true;
  wankoModal.classList.add("is-open");
  wankoModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => wankoFactionButtons[0]?.focus(), 80);
}

async function confirmWankoRegistration() {
  if (!pendingWankoBlob || !selectedWankoFaction || requestSubmitInFlight) return;
  const name = (wankoNameInput.value || "").trim();
  if (!name) {
    wankoRequestStatus.textContent = "なまえをつけてね";
    wankoNameInput.focus();
    return;
  }

  requestSubmitInFlight = true;
  wankoConfirmButton.disabled = true;

  try {
    if (!window.ForMySonsShared?.createForMySons) throw new Error("REQUEST_SERVICE_UNAVAILABLE");
    sharedForMySons ||= await window.ForMySonsShared.createForMySons();
    const request = await sharedForMySons.characterRequests.create({
      name,
      faction: selectedWankoFaction,
      artwork: pendingWankoBlob
    });
    let result = request;
    try {
      const results = await sharedForMySons.characterRequests.syncPending();
      result = results.find((item) => item.requestId === request.requestId) || request;
    } catch (error) {
      console.warn("Character request sync deferred", error);
    }

    closeWankoModal();
    if (result.syncState === "synced") {
      showToast("登録依頼を送信しました");
    } else if (result.syncState === "auth-required") {
      showToast("認証が必要です");
    } else if (result.syncState === "conflict") {
      showToast("競合しています");
    } else {
      showToast("登録依頼を保存しました。あとで送信します");
    }
  } catch (error) {
    console.warn("Character request save failed", error?.code || "unknown");
    wankoRequestStatus.textContent = "登録依頼を保存できなかったよ。もう一度ためしてね";
    showToast("登録依頼に失敗しました");
  } finally {
    requestSubmitInFlight = false;
    wankoConfirmButton.disabled = false;
  }
}

async function saveToPhone() {
  const blob = canvasBlobSync(canvas);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = await shareOrDownload(
    blob,
    "paint-" + stamp + ".png",
    "ペイント"
  );

  if (result === "shared") showToast("保存メニューをひらいたよ");
  if (result === "downloaded") showToast("画像を書き出したよ");
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  startStroke(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (pointerId === null) return;
  event.preventDefault();
  continueStroke(event);
});

canvas.addEventListener("pointerup", (event) => {
  event.preventDefault();
  endStroke(event);
});

canvas.addEventListener("pointercancel", endStroke);

ratioButtons.forEach((button) => {
  button.addEventListener("click", () => setRatio(button.dataset.ratio));
});

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    color = button.dataset.color;
    setTool("brush");
    colorButtons.forEach((item) => item.classList.toggle("is-active", item === button));
  });
});

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    brushSize = Number(button.dataset.size);
    sizeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
  });
});

brushButton.addEventListener("click", () => setTool("brush"));
eraserButton.addEventListener("click", () => setTool("eraser"));
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
clearButton.addEventListener("click", clearCanvas);
puzzleSaveButton.addEventListener("click", saveForPuzzle);
phoneSaveButton.addEventListener("click", saveToPhone);
wankoSaveButton.addEventListener("click", openWankoModal);
wankoCloseButton.addEventListener("click", closeWankoModal);
wankoConfirmButton.addEventListener("click", confirmWankoRegistration);
wankoLibraryOpenButton.addEventListener("click", () => { window.location.href = "../wanko-library/"; });
wankoModal.addEventListener("click", (event) => { if (event.target === wankoModal) closeWankoModal(); });
wankoFactionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedWankoFaction = button.dataset.faction;
    wankoFactionButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    wankoDetails.classList.remove("is-hidden");
    wankoConfirmButton.disabled = !wankoNameInput.value.trim();
    wankoNameInput.focus();
  });
});
wankoNameInput.addEventListener("input", () => {
  wankoConfirmButton.disabled = !selectedWankoFaction || !wankoNameInput.value.trim() || requestSubmitInFlight;
  if (wankoNameInput.value.trim()) wankoRequestStatus.textContent = "";
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

window.addEventListener("resize", fitFrame);
window.addEventListener("orientationchange", () => window.setTimeout(fitFrame, 100));

async function retryPendingCharacterRequests() {
  if (!window.ForMySonsShared?.createForMySons) return;
  try {
    if (!sharedForMySons) sharedForMySons = await window.ForMySonsShared.createForMySons();
    await sharedForMySons.characterRequests.syncPending();
  } catch (error) {
    console.warn("Character request retry deferred", error?.message || "offline");
  }
}

window.addEventListener("online", retryPendingCharacterRequests);

restoreDrafts();
fitFrame();
configureCanvas();
window.setTimeout(retryPendingCharacterRequests, 0);
