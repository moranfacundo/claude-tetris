'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Power-up bomba: pieza 1x1 que aparece cada BOMB_MIN_MS..BOMB_MAX_MS (aleatorio)
const BOMB_MIN_MS = 30000;
const BOMB_MAX_MS = 60000;
const BOMB_TYPE = 8;
const BOMB_CELL_SCORE = 10;
const BOMB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">
  <defs><radialGradient id="g" cx="35%" cy="35%" r="70%">
    <stop offset="0" stop-color="#6b7280"/><stop offset="1" stop-color="#111827"/>
  </radialGradient></defs>
  <circle cx="14" cy="17" r="10" fill="url(#g)" stroke="#000" stroke-width="1"/>
  <ellipse cx="10.5" cy="13" rx="3" ry="2" fill="#fff" opacity="0.45"/>
  <path d="M19 8 Q22 4 25 5" fill="none" stroke="#a16207" stroke-width="2" stroke-linecap="round"/>
  <circle cx="25.5" cy="4.5" r="2.6" fill="#fbbf24"/>
  <circle cx="25.5" cy="4.5" r="1.2" fill="#ef4444"/>
</svg>`;
const bombImg = new Image();
bombImg.src = 'data:image/svg+xml,' + encodeURIComponent(BOMB_SVG);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const fxEl = document.getElementById('fx');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let bombTimer, bombNextAt;

function randomBombDelay() {
  return BOMB_MIN_MS + Math.random() * (BOMB_MAX_MS - BOMB_MIN_MS);
}

function bombPiece() {
  return { type: BOMB_TYPE, shape: [[BOMB_TYPE]], bomb: true, x: Math.floor(COLS / 2), y: 0 };
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++) {
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (board[r][c]) { board[r][c] = 0; destroyed++; }
    }
  }
  score += destroyed * BOMB_CELL_SCORE * level;
  updateHUD();
  showExplosion(cx, cy);
}

function showExplosion(cx, cy) {
  // el canvas se escala por CSS: usar tamaño real de celda en pantalla
  const cell = canvas.clientWidth / COLS;
  fxEl.style.width = fxEl.style.height = `${cell * 4.5}px`;
  fxEl.style.left = `${canvas.offsetLeft + canvas.clientLeft + (cx + 0.5) * cell}px`;
  fxEl.style.top = `${canvas.offsetTop + canvas.clientTop + (cy + 0.5) * cell}px`;
  fxEl.classList.remove('boom');
  canvas.classList.remove('shake');
  void fxEl.getBoundingClientRect(); // reinicia la animación
  fxEl.classList.add('boom');
  canvas.classList.add('shake');
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.bomb) {
    explode(current.x, current.y);
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins: cada una define colores, grid, fondo y su función de dibujo ----
function drawRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeon(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0; // evita que el glow se filtre a lo siguiente
  context.shadowColor = 'transparent';
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + 5, py + 5, size - 10, 3);
}

function drawPastel(context, px, py, size, color) {
  context.fillStyle = color;
  context.beginPath();
  const x = px + 2, y = py + 2, w = size - 4, r = 7;
  // rectángulo redondeado con arcos (compatible sin roundRect)
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + w, r);
  context.arcTo(x + w, y + w, x, y + w, r);
  context.arcTo(x, y + w, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(x + 6, y + 4, w - 12, 3);
}

function drawPixel(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // textura: cuadrícula 4x4 de sub-píxeles claros/oscuros alternados
  const n = 4, cell = (size - 6) / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2) continue;
      context.fillStyle = (r + c) % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
      context.fillRect(px + 3 + c * cell, py + 3 + r * cell, cell, cell);
    }
  }
  // borde biselado
  context.fillStyle = 'rgba(255,255,255,0.5)';
  context.fillRect(px, py, size, 2);
  context.fillRect(px, py, 2, size);
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px, py + size - 2, size, 2);
  context.fillRect(px + size - 2, py, 2, size);
}

const SKINS = {
  retro: { colors: COLORS, grid: null, bg: null, draw: drawRetro }, // null = variable CSS del tema
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#448aff', '#ff9100'],
    grid: '#1c1c2e', bg: '#000', draw: drawNeon,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#b8e6c1', '#f5b8b8', '#b8c4f0', '#ffd9b0'],
    grid: null, bg: null, draw: drawPastel,
  },
  pixel: {
    colors: [null, '#29b6c5', '#e6b800', '#9c3fb0', '#43a047', '#d32f2f', '#3949ab', '#ef8100'],
    grid: null, bg: null, draw: drawPixel,
  },
};
let skinName = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB_TYPE) {
    context.drawImage(bombImg, x * size + 1, y * size + 1, size - 2, size - 2);
  } else {
    const skin = SKINS[skinName];
    skin.draw(context, x * size, y * size, size, skin.colors[colorIndex]);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skinName].grid || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  bombTimer += dt;
  if (bombTimer >= bombNextAt && !current.bomb && !next.bomb) {
    next = bombPiece();
    drawNext();
    bombTimer = 0;
    bombNextAt = randomBombDelay();
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() dentro de este frame no puede cancelar el frame en curso
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  bombTimer = 0;
  bombNextAt = randomBombDelay();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // el select maneja sus propias teclas
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
canvas.addEventListener('animationend', () => canvas.classList.remove('shake'));

// Tema claro/oscuro: sin elección guardada se sigue el del sistema
const themeToggle = document.getElementById('theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;
  const theme = isDark ? 'light' : 'dark';
  root.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) {}
  themeToggle.blur(); // evita que Space reactive el botón durante el juego
});

// Skins: preferencia en localStorage, aplica sin recargar
const skinSelect = document.getElementById('skin-select');

function setSkin(name, save) {
  if (!SKINS[name]) name = 'retro';
  skinName = name;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  if (save) { try { localStorage.setItem('skin', name); } catch (e) {} }
  draw();
  drawNext();
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value, true);
  skinSelect.blur(); // evita que flechas/Space cambien la skin durante el juego
});

try { const k = localStorage.getItem('skin'); if (SKINS[k]) skinName = k; } catch (e) {}

init();
setSkin(skinName, false);
