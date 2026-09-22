const SIZE = 9;
const CENTER = (SIZE - 1) / 2;
const BEST_KEY = "merge-block-best-v1";

const COLORS = [
  "#f26b5b",
  "#f3b64a",
  "#62b982",
  "#5f91df",
  "#9a76d9"
];

const SHAPES = [
  { name: "dot", cells: [[0, 0]], weight: 34 },
  { name: "domino", cells: [[0, 0], [1, 0]], weight: 27 },
  { name: "line3", cells: [[0, 0], [1, 0], [2, 0]], weight: 13 },
  { name: "l3", cells: [[0, 0], [0, 1], [1, 1]], weight: 16 },
  { name: "square", cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 10 }
];

const SIDE_LABELS = {
  top: "上から",
  right: "右から",
  bottom: "下から",
  left: "左から"
};

const boardElement = document.querySelector("#board");
const boardWrap = document.querySelector("#board-wrap");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const mergeReadout = document.querySelector("#merge-readout");
const gameStatus = document.querySelector("#game-status");
const currentPreview = document.querySelector("#current-preview");
const nextPreview = document.querySelector("#next-preview");
const rotateLeftButton = document.querySelector("#rotate-left");
const rotateRightButton = document.querySelector("#rotate-right");
const directionButtons = [...document.querySelectorAll("[data-direction]")];
const edgeZones = [...document.querySelectorAll("[data-side]")];
const sideLabel = document.querySelector("#side-label");
const laneInput = document.querySelector("#lane");
const laneValue = document.querySelector("#lane-value");
const placeButton = document.querySelector("#place");
const newGameButton = document.querySelector("#new-game");
const gameOver = document.querySelector("#game-over");
const finalScore = document.querySelector("#final-score");
const playAgainButton = document.querySelector("#play-again");
const toast = document.querySelector("#toast");

let board = [];
let currentPiece = null;
let nextPiece = null;
let direction = "top";
let lane = 0;
let landing = null;
let score = 0;
let bestScore = readBestScore();
let mergeFlash = new Set();
let mergeFlashTimer = null;
let toastTimer = null;
let edgePointerSide = null;

function readBestScore() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    return 0;
  }
}

function saveBestScore() {
  if (score <= bestScore) return;
  bestScore = score;
  try {
    localStorage.setItem(BEST_KEY, String(bestScore));
  } catch (error) {
    console.warn("Best score save failed", error);
  }
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function chooseShape() {
  const total = SHAPES.reduce((sum, shape) => sum + shape.weight, 0);
  let roll = Math.random() * total;

  for (const shape of SHAPES) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }

  return SHAPES[0];
}

function cloneCells(cells) {
  return cells.map((cell) => [cell[0], cell[1]]);
}

function normalizeCells(cells) {
  const minX = Math.min(...cells.map((cell) => cell[0]));
  const minY = Math.min(...cells.map((cell) => cell[1]));
  return cells
    .map((cell) => [cell[0] - minX, cell[1] - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function rotateCells(cells, clockwise) {
  const rotated = cells.map((cell) => {
    const x = cell[0];
    const y = cell[1];
    return clockwise ? [-y, x] : [y, -x];
  });
  return normalizeCells(rotated);
}

function cellsKey(cells) {
  return normalizeCells(cells)
    .map((cell) => cell[0] + "," + cell[1])
    .join("|");
}

function makePiece() {
  const shape = chooseShape();
  let cells = cloneCells(shape.cells);
  const turns = randomInt(4);
  for (let i = 0; i < turns; i += 1) cells = rotateCells(cells, true);

  return {
    name: shape.name,
    cells: normalizeCells(cells),
    color: COLORS[randomInt(COLORS.length)]
  };
}

function boundsFor(cells) {
  const maxX = Math.max(...cells.map((cell) => cell[0]));
  const maxY = Math.max(...cells.map((cell) => cell[1]));
  return { width: maxX + 1, height: maxY + 1 };
}

function indexFor(x, y) {
  return y * SIZE + x;
}

function inside(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function boardColor(x, y) {
  if (!inside(x, y)) return null;
  return board[indexFor(x, y)];
}

function cellsAt(cells, x, y) {
  return cells.map((cell) => ({
    x: x + cell[0],
    y: y + cell[1]
  }));
}

function fits(cells, x, y) {
  for (const cell of cells) {
    const px = x + cell[0];
    const py = y + cell[1];
    if (!inside(px, py)) return false;
    if (board[indexFor(px, py)] !== null) return false;
  }
  return true;
}

function laneMax(side, cells) {
  const bounds = boundsFor(cells);
  return side === "top" || side === "bottom"
    ? SIZE - bounds.width
    : SIZE - bounds.height;
}

function startPosition(side, cells, laneIndex) {
  const bounds = boundsFor(cells);
  if (side === "top") return { x: laneIndex, y: 0 };
  if (side === "bottom") return { x: laneIndex, y: SIZE - bounds.height };
  if (side === "left") return { x: 0, y: laneIndex };
  return { x: SIZE - bounds.width, y: laneIndex };
}

function stepFor(side) {
  if (side === "top") return { x: 0, y: 1 };
  if (side === "bottom") return { x: 0, y: -1 };
  if (side === "left") return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

function distanceToCenter(cells, x, y) {
  const bounds = boundsFor(cells);
  const cx = x + (bounds.width - 1) / 2;
  const cy = y + (bounds.height - 1) / 2;
  const dx = cx - CENTER;
  const dy = cy - CENTER;
  return dx * dx + dy * dy;
}

function findLanding(side, laneIndex, cells) {
  const maxLane = laneMax(side, cells);
  if (laneIndex < 0 || laneIndex > maxLane) return null;

  let position = startPosition(side, cells, laneIndex);
  if (!fits(cells, position.x, position.y)) return null;

  const step = stepFor(side);
  let currentDistance = distanceToCenter(cells, position.x, position.y);

  while (true) {
    const next = {
      x: position.x + step.x,
      y: position.y + step.y
    };

    if (!fits(cells, next.x, next.y)) break;

    const nextDistance = distanceToCenter(cells, next.x, next.y);
    if (nextDistance >= currentDistance - 0.0001) break;

    position = next;
    currentDistance = nextDistance;
  }

  return {
    side,
    lane: laneIndex,
    x: position.x,
    y: position.y,
    cells: cellsAt(cells, position.x, position.y)
  };
}

function sideHasMove(side, cells) {
  const maxLane = laneMax(side, cells);
  for (let candidate = 0; candidate <= maxLane; candidate += 1) {
    if (findLanding(side, candidate, cells)) return true;
  }
  return false;
}

function uniqueRotations(cells) {
  const result = [];
  const seen = new Set();
  let rotated = normalizeCells(cells);

  for (let i = 0; i < 4; i += 1) {
    const key = cellsKey(rotated);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(rotated);
    }
    rotated = rotateCells(rotated, true);
  }

  return result;
}

function canPlacePieceAnywhere(piece) {
  for (const rotation of uniqueRotations(piece.cells)) {
    for (const side of ["top", "right", "bottom", "left"]) {
      if (sideHasMove(side, rotation)) return true;
    }
  }
  return false;
}

function joinedClass(x, y, color, source) {
  const classes = [];
  const colorAt = (px, py) => {
    if (!inside(px, py)) return null;
    const key = px + "," + py;
    if (source && source.has(key)) return source.get(key);
    return boardColor(px, py);
  };

  if (colorAt(x, y - 1) === color) classes.push("join-top");
  if (colorAt(x + 1, y) === color) classes.push("join-right");
  if (colorAt(x, y + 1) === color) classes.push("join-bottom");
  if (colorAt(x - 1, y) === color) classes.push("join-left");
  return classes;
}

function renderBoard() {
  const previewMap = new Map();
  if (landing && currentPiece) {
    for (const cell of landing.cells) {
      previewMap.set(cell.x + "," + cell.y, currentPiece.color);
    }
  }

  boardElement.replaceChildren();

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(y + 1));
      cell.setAttribute("aria-colindex", String(x + 1));

      const color = boardColor(x, y);
      if (color) {
        const face = document.createElement("div");
        face.className = "block-face";
        face.style.setProperty("--block-color", color);

        for (const join of joinedClass(x, y, color, null)) {
          face.classList.add(join);
        }

        if (mergeFlash.has(indexFor(x, y))) {
          face.classList.add("is-merged");
        }

        cell.appendChild(face);
      }

      const previewColor = previewMap.get(x + "," + y);
      if (previewColor) {
        const ghost = document.createElement("div");
        ghost.className = "ghost-face";
        ghost.style.setProperty("--block-color", previewColor);

        for (const join of joinedClass(x, y, previewColor, previewMap)) {
          ghost.classList.add(join);
        }

        cell.appendChild(ghost);
      }

      boardElement.appendChild(cell);
    }
  }
}

function renderPiecePreview(element, piece) {
  element.replaceChildren();
  if (!piece) return;

  const bounds = boundsFor(piece.cells);
  const size = Math.max(3, Math.min(4, Math.max(bounds.width, bounds.height) + 1));
  element.style.setProperty("--preview-size", String(size));

  const offsetX = Math.floor((size - bounds.width) / 2);
  const offsetY = Math.floor((size - bounds.height) / 2);
  const filled = new Set(
    piece.cells.map((cell) => (cell[0] + offsetX) + "," + (cell[1] + offsetY))
  );

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = document.createElement("div");
      cell.className = "preview-cell";
      if (filled.has(x + "," + y)) {
        cell.classList.add("is-block");
        cell.style.setProperty("--block-color", piece.color);
      }
      element.appendChild(cell);
    }
  }
}

function clampLane() {
  const maxLane = laneMax(direction, currentPiece.cells);
  lane = Math.max(0, Math.min(maxLane, lane));
  laneInput.min = "1";
  laneInput.max = String(maxLane + 1);
  laneInput.value = String(lane + 1);
  laneValue.textContent = String(lane + 1);
}

function findClosestValidLane(side, requestedLane) {
  const maxLane = laneMax(side, currentPiece.cells);
  const candidates = [];

  for (let offset = 0; offset <= maxLane; offset += 1) {
    const left = requestedLane - offset;
    const right = requestedLane + offset;
    if (left >= 0) candidates.push(left);
    if (offset > 0 && right <= maxLane) candidates.push(right);
  }

  for (const candidate of candidates) {
    if (findLanding(side, candidate, currentPiece.cells)) return candidate;
  }

  return Math.max(0, Math.min(maxLane, requestedLane));
}

function updatePreview() {
  clampLane();
  landing = findLanding(direction, lane, currentPiece.cells);
  placeButton.disabled = !landing;

  const hasMoves = {};
  for (const side of ["top", "right", "bottom", "left"]) {
    hasMoves[side] = sideHasMove(side, currentPiece.cells);
  }

  directionButtons.forEach((button) => {
    const side = button.dataset.direction;
    button.classList.toggle("is-active", side === direction);
    button.disabled = !hasMoves[side];
  });

  edgeZones.forEach((zone) => {
    const side = zone.dataset.side;
    zone.classList.toggle("is-active", side === direction);
    zone.disabled = !hasMoves[side];
  });

  sideLabel.textContent = SIDE_LABELS[direction];
  gameStatus.textContent = landing
    ? SIDE_LABELS[direction] + "、" + (lane + 1) + "ばんから中心へ"
    : SIDE_LABELS[direction] + "は、この位置から入れられない";

  renderBoard();
}

function setDirection(side, requestedLane) {
  if (!currentPiece) return;
  direction = side;

  const maxLane = laneMax(direction, currentPiece.cells);
  const centerLane = Math.floor(maxLane / 2);
  lane = Number.isFinite(requestedLane) ? requestedLane : centerLane;
  lane = findClosestValidLane(direction, lane);
  updatePreview();
}

function rotateCurrent(clockwise) {
  if (!currentPiece) return;
  currentPiece.cells = rotateCells(currentPiece.cells, clockwise);
  lane = Math.floor(laneMax(direction, currentPiece.cells) / 2);
  lane = findClosestValidLane(direction, lane);
  renderPiecePreview(currentPreview, currentPiece);
  updatePreview();
}

function neighbors(index) {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  const result = [];

  if (y > 0) result.push(indexFor(x, y - 1));
  if (x < SIZE - 1) result.push(indexFor(x + 1, y));
  if (y < SIZE - 1) result.push(indexFor(x, y + 1));
  if (x > 0) result.push(indexFor(x - 1, y));

  return result;
}

function groupFrom(startIndex) {
  const color = board[startIndex];
  if (!color) return [];

  const queue = [startIndex];
  const seen = new Set([startIndex]);

  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbors(current)) {
      if (seen.has(next)) continue;
      if (board[next] !== color) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return [...seen];
}

function scorePlacement(placedIndices) {
  const groupKeys = new Set();
  const flashing = new Set();
  let mergeBonus = 0;
  let largest = 1;

  for (const index of placedIndices) {
    const group = groupFrom(index);
    if (!group.length) continue;

    const key = String(Math.min(...group));
    if (groupKeys.has(key)) continue;
    groupKeys.add(key);

    largest = Math.max(largest, group.length);
    if (group.length > 1) {
      mergeBonus += group.length * group.length * 3;
      group.forEach((member) => flashing.add(member));
    }
  }

  score += placedIndices.length * 5 + mergeBonus;
  saveBestScore();

  mergeReadout.textContent = largest > 1 ? "×" + largest : "—";
  scoreElement.textContent = String(score);
  bestScoreElement.textContent = String(bestScore);

  if (flashing.size) {
    mergeFlash = flashing;
    window.clearTimeout(mergeFlashTimer);
    mergeFlashTimer = window.setTimeout(() => {
      mergeFlash = new Set();
      renderBoard();
    }, 320);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-open"), 1500);
}

function placeCurrent() {
  if (!landing || !currentPiece) {
    showToast("ここからは入れられない");
    return;
  }

  const placedIndices = [];
  for (const cell of landing.cells) {
    const index = indexFor(cell.x, cell.y);
    board[index] = currentPiece.color;
    placedIndices.push(index);
  }

  scorePlacement(placedIndices);

  currentPiece = nextPiece;
  nextPiece = makePiece();
  renderPiecePreview(currentPreview, currentPiece);
  renderPiecePreview(nextPreview, nextPiece);

  if (!canPlacePieceAnywhere(currentPiece)) {
    landing = null;
    renderBoard();
    finishGame();
    return;
  }

  const maxLane = laneMax(direction, currentPiece.cells);
  lane = findClosestValidLane(direction, Math.floor(maxLane / 2));
  updatePreview();
}

function finishGame() {
  saveBestScore();
  finalScore.textContent = String(score);
  gameOver.classList.add("is-open");
  gameOver.setAttribute("aria-hidden", "false");
  playAgainButton.focus();
}

function hideGameOver() {
  gameOver.classList.remove("is-open");
  gameOver.setAttribute("aria-hidden", "true");
}

function newGame() {
  board = Array(SIZE * SIZE).fill(null);
  score = 0;
  mergeFlash = new Set();
  mergeReadout.textContent = "—";
  scoreElement.textContent = "0";
  bestScoreElement.textContent = String(bestScore);

  currentPiece = makePiece();
  nextPiece = makePiece();
  direction = "top";

  renderPiecePreview(currentPreview, currentPiece);
  renderPiecePreview(nextPreview, nextPiece);
  hideGameOver();

  const maxLane = laneMax(direction, currentPiece.cells);
  lane = Math.floor(maxLane / 2);
  lane = findClosestValidLane(direction, lane);
  updatePreview();
}

function laneFromPointer(zone, event) {
  if (!currentPiece) return 0;

  const side = zone.dataset.side;
  const rect = zone.getBoundingClientRect();
  const maxLane = laneMax(side, currentPiece.cells);

  let ratio;
  if (side === "top" || side === "bottom") {
    ratio = (event.clientX - rect.left) / rect.width;
  } else {
    ratio = (event.clientY - rect.top) / rect.height;
  }

  ratio = Math.max(0, Math.min(1, ratio));
  return Math.round(ratio * maxLane);
}

directionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setDirection(button.dataset.direction);
  });
});

edgeZones.forEach((zone) => {
  zone.addEventListener("pointerdown", (event) => {
    if (zone.disabled) return;
    event.preventDefault();
    edgePointerSide = zone.dataset.side;
    const requested = laneFromPointer(zone, event);
    setDirection(edgePointerSide, requested);
    zone.setPointerCapture?.(event.pointerId);
  });

  zone.addEventListener("pointermove", (event) => {
    if (edgePointerSide !== zone.dataset.side) return;
    if (!(event.buttons & 1) && event.pointerType === "mouse") return;
    event.preventDefault();
    const requested = laneFromPointer(zone, event);
    lane = findClosestValidLane(direction, requested);
    updatePreview();
  });

  const finish = (event) => {
    if (edgePointerSide !== zone.dataset.side) return;
    edgePointerSide = null;
    try {
      if (zone.hasPointerCapture?.(event.pointerId)) zone.releasePointerCapture(event.pointerId);
    } catch (_) {}
  };

  zone.addEventListener("pointerup", finish);
  zone.addEventListener("pointercancel", finish);
});

laneInput.addEventListener("input", () => {
  lane = Number(laneInput.value) - 1;
  updatePreview();
});

rotateLeftButton.addEventListener("click", () => rotateCurrent(false));
rotateRightButton.addEventListener("click", () => rotateCurrent(true));
placeButton.addEventListener("click", placeCurrent);
newGameButton.addEventListener("click", newGame);
playAgainButton.addEventListener("click", newGame);

gameOver.addEventListener("click", (event) => {
  if (event.target === gameOver) newGame();
});

window.addEventListener("keydown", (event) => {
  if (gameOver.classList.contains("is-open")) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      newGame();
    }
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setDirection("top");
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setDirection("right");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    setDirection("bottom");
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    setDirection("left");
  } else if (event.key === "q") {
    event.preventDefault();
    rotateCurrent(false);
  } else if (event.key === "e") {
    event.preventDefault();
    rotateCurrent(true);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    placeCurrent();
  }
});

bestScoreElement.textContent = String(bestScore);
newGame();
