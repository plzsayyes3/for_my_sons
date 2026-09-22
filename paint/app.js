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
const saveButton = document.querySelector("#save");
const toast = document.querySelector("#toast");

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

const drafts = Object.fromEntries(
  Object.keys(RATIOS).map((ratio) => [ratio, { actions: [], redo: [] }])
);

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
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
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
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1600);
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

function canvasToBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG creation failed"));
    }, "image/png");
  });
}

async function saveDrawing() {
  saveButton.disabled = true;
  try {
    const blob = await canvasToBlob();
    const db = await openDatabase();
    const id = "paint-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    const record = {
      id,
      kind: "paint",
      ratio: currentRatio,
      createdAt: new Date().toISOString(),
      width: canvas.width,
      height: canvas.height,
      blob
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
    showToast("ほぞんした！ ✓");
  } catch (error) {
    console.error(error);
    showToast("ほぞんできなかった");
  } finally {
    saveButton.disabled = false;
  }
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
saveButton.addEventListener("click", saveDrawing);

window.addEventListener("resize", fitFrame);
window.addEventListener("orientationchange", () => window.setTimeout(fitFrame, 100));

restoreDrafts();
fitFrame();
configureCanvas();
