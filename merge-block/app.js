const SIZE = 9;
const CENTER = (SIZE - 1) / 2;
const CLEAR_COUNT = 4;

const DIFFICULTIES = {
  easy: { label: "やさしい", colors: 3 },
  normal: { label: "ふつう", colors: 4 },
  hard: { label: "むずかしい", colors: 5 },
  extreme: { label: "超むずかしい", colors: 6 }
};

const PALETTE = [
  "#ef6b5c",
  "#f3b449",
  "#58b47b",
  "#5e8fdd",
  "#9b74d7",
  "#e576a7"
];

const boardElement = document.querySelector("#board");
const boardFrame = document.querySelector("#board-frame");
const boardWrap = document.querySelector("#board-wrap");
const incomingPiece = document.querySelector("#incoming-piece");
const currentPreview = document.querySelector("#current-preview");
const nextPreview = document.querySelector("#next-preview");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const chainElement = document.querySelector("#chain");
const gameStatus = document.querySelector("#game-status");
const dropButton = document.querySelector("#drop");
const moveLeftButton = document.querySelector("#move-left");
const moveRightButton = document.querySelector("#move-right");
const boardLeftButton = document.querySelector("#board-left");
const boardRightButton = document.querySelector("#board-right");
const newGameButton = document.querySelector("#new-game");
const difficultyButtons = [...document.querySelectorAll("[data-level]")];
const gameOver = document.querySelector("#game-over");
const finalScore = document.querySelector("#final-score");
const playAgainButton = document.querySelector("#play-again");
const toast = document.querySelector("#toast");
const setupOverlay = document.querySelector("#setup-overlay");
const setupCancelButton = document.querySelector("#setup-cancel");

let board = [];
let currentPiece = null;
let nextPiece = null;
let dropStart = 3;
let landing = null;
let score = 0;
let difficulty = "easy";
let locked = false;
let clearing = new Set();
let movingCells = new Map();
let toastTimer = 0;
let pointerActive = false;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function indexFor(x, y) {
  return y * SIZE + x;
}

function coordsFor(index) {
  return { x: index % SIZE, y: Math.floor(index / SIZE) };
}

function inside(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function isCore(x, y) {
  return x === CENTER && y === CENTER;
}

function cellAt(x, y, source) {
  if (!inside(x, y)) return null;
  return (source || board)[indexFor(x, y)];
}

function bestKey() {
  return "merge-block-best-v3-" + difficulty;
}

function readBest() {
  try {
    const value = Number(localStorage.getItem(bestKey()));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_) {
    return 0;
  }
}

function saveBest() {
  const currentBest = readBest();
  if (score <= currentBest) return currentBest;
  try {
    localStorage.setItem(bestKey(), String(score));
  } catch (_) {}
  return score;
}

function activeColors() {
  return PALETTE.slice(0, DIFFICULTIES[difficulty].colors);
}

function randomColor() {
  const colors = activeColors();
  return colors[Math.floor(Math.random() * colors.length)];
}

function makePiece() {
  const length = Math.random() < 0.55 ? 2 : 3;
  return {
    colors: Array.from({ length }, () => randomColor())
  };
}

function renderPiecePreview(element, piece) {
  element.replaceChildren();
  if (!piece) return;

  piece.colors.forEach((color) => {
    const block = document.createElement("div");
    block.className = "preview-block";
    block.style.setProperty("--block-color", color);
    element.appendChild(block);
  });
}

function renderIncoming() {
  incomingPiece.replaceChildren();
  if (!currentPiece) return;

  incomingPiece.style.left = (dropStart / SIZE * 100) + "%";
  incomingPiece.style.width = (currentPiece.colors.length / SIZE * 100) + "%";
  incomingPiece.style.gridTemplateColumns = "repeat(" + currentPiece.colors.length + ", 1fr)";
  incomingPiece.classList.toggle("is-invalid", !landing);
  incomingPiece.classList.toggle("is-moving", locked && movingCells.size > 0);

  currentPiece.colors.forEach((color) => {
    const block = document.createElement("div");
    block.className = "incoming-block";
    block.style.setProperty("--block-color", color);
    incomingPiece.appendChild(block);
  });
}

function joinedClasses(x, y, color, previewMap) {
  const classes = [];
  const colorAt = (px, py) => {
    if (!inside(px, py)) return null;
    const key = px + "," + py;
    if (previewMap && previewMap.has(key)) return previewMap.get(key);
    const cell = cellAt(px, py);
    return cell ? cell.color : null;
  };

  if (colorAt(x, y - 1) === color) classes.push("join-top");
  if (colorAt(x + 1, y) === color) classes.push("join-right");
  if (colorAt(x, y + 1) === color) classes.push("join-bottom");
  if (colorAt(x - 1, y) === color) classes.push("join-left");
  return classes;
}

function renderBoard() {
  const previewMap = new Map();
  const pathSet = new Set();

  if (landing && currentPiece && !locked) {
    landing.routes.forEach((route) => {
      previewMap.set(route.final.x + "," + route.final.y, route.color);
      route.path.forEach((point) => pathSet.add(point.x + "," + point.y));
    });
  }

  boardElement.replaceChildren();

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = indexFor(x, y);
      const key = x + "," + y;
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.setAttribute("role", "gridcell");

      if (pathSet.has(key)) cell.classList.add("is-path");

      if (isCore(x, y)) {
        cell.classList.add("is-core");
        boardElement.appendChild(cell);
        continue;
      }

      const data = board[index];
      if (data) {
        const face = document.createElement("div");
        face.className = "block-face";
        face.style.setProperty("--block-color", data.color);
        joinedClasses(x, y, data.color, null).forEach((name) => face.classList.add(name));
        if (clearing.has(index)) face.classList.add("is-clearing");
        cell.appendChild(face);
      }

      const movingColor = movingCells.get(key);
      if (movingColor) {
        const moving = document.createElement("div");
        moving.className = "moving-face";
        moving.style.setProperty("--block-color", movingColor);
        cell.appendChild(moving);
      } else {
        const ghostColor = previewMap.get(key);
        if (ghostColor) {
          const ghost = document.createElement("div");
          ghost.className = "ghost-face";
          ghost.style.setProperty("--block-color", ghostColor);
          joinedClasses(x, y, ghostColor, previewMap).forEach((name) => ghost.classList.add(name));
          cell.appendChild(ghost);
        }
      }

      boardElement.appendChild(cell);
    }
  }

  renderIncoming();
}

function simulateSingleBlock(startX, color, source) {
  if (!inside(startX, 0) || isCore(startX, 0) || cellAt(startX, 0, source)) return null;

  const path = [];
  let x = startX;
  let y = 0;

  while (true) {
    if (!inside(x, y) || isCore(x, y) || cellAt(x, y, source)) return null;
    path.push({ x, y });

    if (y < CENTER) {
      const nextY = y + 1;

      if (isCore(x, nextY) || cellAt(x, nextY, source)) {
        return { color, path, final: { x, y } };
      }

      y = nextY;
      continue;
    }

    // 中心線まで来たら、中心へ向かって横に吸われる。
    // ただし中心線の1段下に土台がある場合は、その場に置ける。
    if (y === CENTER) {
      if (cellAt(x, CENTER + 1, source)) {
        return { color, path, final: { x, y } };
      }

      const dx = x < CENTER ? 1 : x > CENTER ? -1 : 0;
      if (!dx) return null;

      while (true) {
        const nextX = x + dx;
        if (!inside(nextX, CENTER)) return null;

        if (isCore(nextX, CENTER) || cellAt(nextX, CENTER, source)) {
          return { color, path, final: { x, y: CENTER } };
        }

        x = nextX;
        path.push({ x, y: CENTER });
      }
    }

    return null;
  }
}

function simulatePieceDrop(startX, piece, source) {
  if (startX < 0 || startX + piece.colors.length > SIZE) return null;

  const working = source.slice();
  const routes = new Array(piece.colors.length);

  // 2〜3個は「ひとつの横棒」ではなく、同時に来る独立ブロック。
  // 中心に近いものから確定させ、他のブロックは引っ掛からず重力を続ける。
  const order = piece.colors
    .map((color, offset) => ({
      color,
      offset,
      x: startX + offset,
      distance: Math.abs(startX + offset - CENTER)
    }))
    .sort((a, b) => a.distance - b.distance || a.x - b.x);

  for (const item of order) {
    const route = simulateSingleBlock(item.x, item.color, working);
    if (!route) return null;

    routes[item.offset] = route;
    working[indexFor(route.final.x, route.final.y)] = {
      color: item.color,
      transient: true
    };
  }

  return {
    x: startX,
    routes,
    cells: routes.map((route) => ({
      x: route.final.x,
      y: route.final.y,
      color: route.color
    }))
  };
}

function updateLanding() {
  if (!currentPiece) return;

  const maxStart = SIZE - currentPiece.colors.length;
  dropStart = Math.max(0, Math.min(maxStart, dropStart));
  landing = simulatePieceDrop(dropStart, currentPiece, board);

  dropButton.disabled = locked || !landing;
  moveLeftButton.disabled = locked || dropStart <= 0;
  moveRightButton.disabled = locked || dropStart >= maxStart;
  boardLeftButton.disabled = locked;
  boardRightButton.disabled = locked;

  gameStatus.textContent = landing
    ? "DROPすると、それぞれのブロックが重力に沿って確定する。"
    : "この位置からは入れられない。左右へ動かすか、盤面を回そう。";

  renderBoard();
}

function setDropFromPointer(event) {
  if (locked || !currentPiece) return;
  const rect = boardElement.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(0.9999, (event.clientX - rect.left) / rect.width));
  const cellX = Math.floor(ratio * SIZE);
  const centered = Math.round(cellX - (currentPiece.colors.length - 1) / 2);
  dropStart = Math.max(0, Math.min(SIZE - currentPiece.colors.length, centered));
  updateLanding();
}

function rotateBoardData(source, clockwise) {
  const next = Array(SIZE * SIZE).fill(null);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = source[indexFor(x, y)];
      if (!value) continue;

      const nx = clockwise ? SIZE - 1 - y : y;
      const ny = clockwise ? x : SIZE - 1 - x;
      next[indexFor(nx, ny)] = value;
    }
  }

  return next;
}

async function rotateBoard(clockwise) {
  if (locked) return;

  locked = true;
  landing = null;
  renderBoard();

  const angle = clockwise ? 90 : -90;
  try {
    const animation = boardFrame.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(" + angle + "deg)" }],
      { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" }
    );
    await animation.finished;
  } catch (_) {}

  // 確定済みブロックは盤面と一緒に90度回るだけ。
  // 回転したことを理由に、重力で再配置はしない。
  board = rotateBoardData(board, clockwise);
  boardFrame.style.transform = "rotate(0deg)";
  locked = false;
  updateLanding();
}

function neighbors(index) {
  const { x, y } = coordsFor(index);
  const result = [];
  if (y > 0) result.push(indexFor(x, y - 1));
  if (x < SIZE - 1) result.push(indexFor(x + 1, y));
  if (y < SIZE - 1) result.push(indexFor(x, y + 1));
  if (x > 0) result.push(indexFor(x - 1, y));
  return result;
}

function colorGroups() {
  const seen = new Set();
  const groups = [];

  for (let index = 0; index < board.length; index += 1) {
    if (seen.has(index) || !board[index]) continue;

    const color = board[index].color;
    const queue = [index];
    const group = [];
    seen.add(index);

    while (queue.length) {
      const current = queue.shift();
      group.push(current);

      neighbors(current).forEach((next) => {
        if (seen.has(next) || !board[next] || board[next].color !== color) return;
        seen.add(next);
        queue.push(next);
      });
    }

    groups.push(group);
  }

  return groups;
}

function anchoredSet() {
  const anchored = new Set();
  const queue = [];
  const starts = [
    [CENTER, CENTER - 1],
    [CENTER + 1, CENTER],
    [CENTER, CENTER + 1],
    [CENTER - 1, CENTER]
  ];

  starts.forEach(([x, y]) => {
    if (!inside(x, y)) return;
    const index = indexFor(x, y);
    if (board[index] && !anchored.has(index)) {
      anchored.add(index);
      queue.push(index);
    }
  });

  while (queue.length) {
    const current = queue.shift();
    neighbors(current).forEach((next) => {
      if (!board[next] || anchored.has(next)) return;
      anchored.add(next);
      queue.push(next);
    });
  }

  return anchored;
}

function detachedComponents() {
  const anchored = anchoredSet();
  const seen = new Set(anchored);
  const components = [];

  for (let index = 0; index < board.length; index += 1) {
    if (!board[index] || seen.has(index)) continue;

    const queue = [index];
    const component = [];
    seen.add(index);

    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      neighbors(current).forEach((next) => {
        if (!board[next] || seen.has(next)) return;
        seen.add(next);
        queue.push(next);
      });
    }

    components.push(component);
  }

  return components;
}

function componentBounds(component) {
  const coords = component.map(coordsFor);
  return {
    minX: Math.min(...coords.map((cell) => cell.x)),
    maxX: Math.max(...coords.map((cell) => cell.x)),
    minY: Math.min(...coords.map((cell) => cell.y)),
    maxY: Math.max(...coords.map((cell) => cell.y)),
    avgX: coords.reduce((sum, cell) => sum + cell.x, 0) / coords.length
  };
}

function canShift(component, dx, dy) {
  const own = new Set(component);

  for (const index of component) {
    const { x, y } = coordsFor(index);
    const nx = x + dx;
    const ny = y + dy;

    if (!inside(nx, ny) || isCore(nx, ny)) return false;

    const nextIndex = indexFor(nx, ny);
    if (board[nextIndex] && !own.has(nextIndex)) return false;
  }

  return true;
}

function shiftComponent(component, dx, dy) {
  const moving = component.map((index) => {
    const { x, y } = coordsFor(index);
    return {
      value: board[index],
      from: index,
      to: indexFor(x + dx, y + dy)
    };
  });

  moving.forEach((item) => {
    board[item.from] = null;
  });

  moving.forEach((item) => {
    board[item.to] = item.value;
  });
}

async function settleDetached() {
  let safety = 120;

  // 消去で支えを失った塊は、まず画面下方向へ。
  while (safety-- > 0) {
    const components = detachedComponents()
      .sort((a, b) => componentBounds(b).maxY - componentBounds(a).maxY);

    let moved = false;

    for (const component of components) {
      const bounds = componentBounds(component);
      if (bounds.maxY >= CENTER) continue;
      if (!canShift(component, 0, 1)) continue;

      shiftComponent(component, 0, 1);
      moved = true;
    }

    if (!moved) break;
    renderBoard();
    await wait(62);
  }

  safety = 120;

  // 中心線まで来たら、中心へ横移動。
  while (safety-- > 0) {
    const components = detachedComponents();
    let moved = false;

    for (const component of components) {
      const bounds = componentBounds(component);
      const dx =
        bounds.avgX < CENTER - 0.01 ? 1 :
        bounds.avgX > CENTER + 0.01 ? -1 :
        0;

      if (!dx || !canShift(component, dx, 0)) continue;

      shiftComponent(component, dx, 0);
      moved = true;
    }

    if (!moved) break;
    renderBoard();
    await wait(62);
  }
}

async function resolveBoard() {
  let chain = 0;

  while (true) {
    const groups = colorGroups().filter((group) => group.length >= CLEAR_COUNT);
    if (!groups.length) break;

    chain += 1;
    chainElement.textContent = "×" + chain;

    clearing = new Set(groups.flat());
    renderBoard();
    await wait(235);

    let removed = 0;
    clearing.forEach((index) => {
      if (board[index]) {
        board[index] = null;
        removed += 1;
      }
    });
    clearing = new Set();

    score += removed * 25 * chain;
    scoreElement.textContent = String(score);
    bestScoreElement.textContent = String(saveBest());
    renderBoard();

    await wait(80);
    await settleDetached();
  }

  if (!chain) chainElement.textContent = "—";
}

function boardHasMoveForPiece(source, piece) {
  for (let x = 0; x <= SIZE - piece.colors.length; x += 1) {
    if (simulatePieceDrop(x, piece, source)) return true;
  }
  return false;
}

function hasAnyMove(piece) {
  let simulated = board.slice();

  for (let turn = 0; turn < 4; turn += 1) {
    if (boardHasMoveForPiece(simulated, piece)) return true;
    simulated = rotateBoardData(simulated, true);
  }

  return false;
}

async function animateDrop(target) {
  const maxSteps = Math.max(...target.routes.map((route) => route.path.length));

  for (let step = 0; step < maxSteps; step += 1) {
    movingCells = new Map();

    target.routes.forEach((route) => {
      const point = route.path[Math.min(step, route.path.length - 1)];
      movingCells.set(point.x + "," + point.y, route.color);
    });

    renderBoard();
    await wait(58);
  }

  movingCells = new Map();
}

async function dropCurrent() {
  if (locked || !landing || !currentPiece) {
    if (!locked) showToast("この位置からは入れられない");
    return;
  }

  locked = true;
  const target = landing;
  dropButton.disabled = true;
  moveLeftButton.disabled = true;
  moveRightButton.disabled = true;
  boardLeftButton.disabled = true;
  boardRightButton.disabled = true;

  await animateDrop(target);

  target.cells.forEach((cell) => {
    board[indexFor(cell.x, cell.y)] = {
      color: cell.color
    };
  });

  score += currentPiece.colors.length * 5;
  scoreElement.textContent = String(score);
  bestScoreElement.textContent = String(saveBest());

  landing = null;
  movingCells = new Map();
  renderBoard();

  await resolveBoard();

  currentPiece = nextPiece;
  nextPiece = makePiece();
  renderPiecePreview(currentPreview, currentPiece);
  renderPiecePreview(nextPreview, nextPiece);

  dropStart = Math.floor((SIZE - currentPiece.colors.length) / 2);

  if (!hasAnyMove(currentPiece)) {
    locked = false;
    renderBoard();
    finishGame();
    return;
  }

  locked = false;
  updateLanding();
}

function finishGame() {
  finalScore.textContent = String(score);
  gameOver.classList.add("is-open");
  gameOver.setAttribute("aria-hidden", "false");
  playAgainButton.focus();
}

function hideGameOver() {
  gameOver.classList.remove("is-open");
  gameOver.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1350);
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.level === difficulty);
  });
}

function openSetup() {
  updateDifficultyButtons();
  setupOverlay.classList.add("is-open");
  setupOverlay.setAttribute("aria-hidden", "false");
}

function closeSetup() {
  setupOverlay.classList.remove("is-open");
  setupOverlay.setAttribute("aria-hidden", "true");
}

function newGame(nextDifficulty) {
  if (nextDifficulty && DIFFICULTIES[nextDifficulty]) difficulty = nextDifficulty;

  board = Array(SIZE * SIZE).fill(null);
  score = 0;
  locked = false;
  clearing = new Set();
  movingCells = new Map();
  chainElement.textContent = "—";
  scoreElement.textContent = "0";
  bestScoreElement.textContent = String(readBest());

  currentPiece = makePiece();
  nextPiece = makePiece();
  dropStart = Math.floor((SIZE - currentPiece.colors.length) / 2);

  renderPiecePreview(currentPreview, currentPiece);
  renderPiecePreview(nextPreview, nextPiece);
  updateDifficultyButtons();
  hideGameOver();
  updateLanding();
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeSetup();
    newGame(button.dataset.level);
  });
});

moveLeftButton.addEventListener("click", () => {
  if (locked) return;
  dropStart -= 1;
  updateLanding();
});

moveRightButton.addEventListener("click", () => {
  if (locked) return;
  dropStart += 1;
  updateLanding();
});

boardLeftButton.addEventListener("click", () => rotateBoard(false));
boardRightButton.addEventListener("click", () => rotateBoard(true));
dropButton.addEventListener("click", dropCurrent);
newGameButton.addEventListener("click", openSetup);
setupCancelButton.addEventListener("click", closeSetup);
setupOverlay.addEventListener("click", (event) => {
  if (event.target === setupOverlay) closeSetup();
});
playAgainButton.addEventListener("click", () => newGame());

boardWrap.addEventListener("pointerdown", (event) => {
  if (locked) return;
  pointerActive = true;
  setDropFromPointer(event);
  boardWrap.setPointerCapture?.(event.pointerId);
});

boardWrap.addEventListener("pointermove", (event) => {
  if (!pointerActive || locked) return;
  setDropFromPointer(event);
});

function endPointer(event) {
  pointerActive = false;
  try {
    if (boardWrap.hasPointerCapture?.(event.pointerId)) {
      boardWrap.releasePointerCapture(event.pointerId);
    }
  } catch (_) {}
}

boardWrap.addEventListener("pointerup", endPointer);
boardWrap.addEventListener("pointercancel", endPointer);

window.addEventListener("keydown", (event) => {
  if (gameOver.classList.contains("is-open")) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      newGame();
    }
    return;
  }

  if (locked) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    dropStart -= 1;
    updateLanding();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    dropStart += 1;
    updateLanding();
  } else if (event.key === "q") {
    event.preventDefault();
    rotateBoard(false);
  } else if (event.key === "e") {
    event.preventDefault();
    rotateBoard(true);
  } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    dropCurrent();
  }
});

newGame("easy");
