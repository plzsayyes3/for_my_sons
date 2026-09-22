const board = document.querySelector("#board");
const moveCount = document.querySelector("#move-count");
const newPuzzleButton = document.querySelector("#new-puzzle");
const difficultyButtons = [...document.querySelectorAll("[data-size]")];
const celebration = document.querySelector("#celebration");
const clearMoves = document.querySelector("#clear-moves");
const playAgain = document.querySelector("#play-again");

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

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createArtPool(count) {
  return shuffled(EMOJI_ART).slice(0, count);
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

celebration.addEventListener("click", (event) => {
  if (event.target === celebration) hideCelebration();
});

window.addEventListener("resize", updateEmojiScale);

startNewPuzzle(3);
