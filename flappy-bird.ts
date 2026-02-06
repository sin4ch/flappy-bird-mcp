import { App } from "@modelcontextprotocol/ext-apps";

// ── Constants ──────────────────────────────────────────────────────────
const CANVAS_W = 288;
const CANVAS_H = 512;

const GRAVITY = 0.5;
const FLAP_IMPULSE = -8;
const BIRD_X = 60;
const BIRD_W = 34;
const BIRD_H = 24;

const PIPE_W = 52;
const PIPE_GAP = 120;
const PIPE_SPEED = 2;
const PIPE_SPAWN_DIST = 200;

const GROUND_H = 56;
const PLAY_H = CANVAS_H - GROUND_H;

// ── Colors ─────────────────────────────────────────────────────────────
const SKY_COLOR = "#4ec0ca";
const GROUND_COLOR = "#ded895";
const GROUND_STRIPE = "#d2b04c";
const PIPE_COLOR = "#73bf2e";
const PIPE_BORDER = "#558b1b";
const PIPE_CAP_COLOR = "#8bd43a";
const BIRD_BODY = "#f7dc6f";
const BIRD_WING = "#e67e22";
const BIRD_EYE_WHITE = "#fff";
const BIRD_EYE = "#000";
const BIRD_BEAK = "#e74c3c";
const TEXT_COLOR = "#fff";
const TEXT_SHADOW = "#000";
const MEDAL_GOLD = "#f1c40f";
const MEDAL_SILVER = "#bdc3c7";
const MEDAL_BRONZE = "#cd7f32";

// ── Types ──────────────────────────────────────────────────────────────
type GameState = "title" | "playing" | "gameover";

interface Pipe {
  x: number;
  gapY: number; // center of the gap
  scored: boolean;
}

// ── Game State ─────────────────────────────────────────────────────────
let state: GameState = "title";
let birdY = CANVAS_H / 2 - 20;
let birdVel = 0;
let birdAngle = 0;
let score = 0;
let bestScore = 0;
let pipes: Pipe[] = [];
let frameCount = 0;
let groundOffset = 0;
let flashAlpha = 0; // white flash on death

// Wing animation
let wingTimer = 0;
let wingUp = false;

// ── MCP App bridge ─────────────────────────────────────────────────────
const mcpApp = new App({ name: "Flappy Bird", version: "1.0.0" });

mcpApp.ontoolresult = (result) => {
  try {
    const text = result.content?.find(
      (c: { type: string }) => c.type === "text",
    )?.text;
    if (text) {
      const data = JSON.parse(text);
      if (typeof data.highScore === "number") {
        bestScore = Math.max(bestScore, data.highScore);
      }
    }
  } catch {
    // ignore parse errors
  }
};

mcpApp.onteardown = async () => ({ });
mcpApp.onerror = console.error;

mcpApp.connect().catch(() => {
  // Running outside MCP host — that's fine, game still works standalone
  console.log("MCP host not available, running standalone");
});

async function submitScore(s: number) {
  try {
    const result = await mcpApp.callServerTool({
      name: "submit-score",
      arguments: { score: s },
    });
    const text = result.content?.find(
      (c: { type: string }) => c.type === "text",
    )?.text;
    if (text) {
      const data = JSON.parse(text);
      if (typeof data.highScore === "number") {
        bestScore = Math.max(bestScore, data.highScore);
      }
    }
  } catch {
    // MCP not available — local best score only
  }
}

// ── Canvas Setup ───────────────────────────────────────────────────────
const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
canvas.tabIndex = 0;
canvas.style.outline = "none";
const ctx = canvas.getContext("2d")!;

// ── Input ──────────────────────────────────────────────────────────────
function handleInput() {
  if (state === "title") {
    startGame();
  } else if (state === "playing") {
    flap();
  } else if (state === "gameover") {
    // Small delay before allowing restart
    if (frameCount > 30) {
      resetGame();
    }
  }
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.focus();
  handleInput();
});

// Listen on canvas (needs focus) and document as fallback
function onKey(e: KeyboardEvent) {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    e.stopPropagation();
    handleInput();
  }
}
canvas.addEventListener("keydown", onKey);
document.addEventListener("keydown", onKey);

// Auto-focus canvas on load so keyboard works immediately
canvas.focus();

// ── Game Logic ─────────────────────────────────────────────────────────
function resetGame() {
  state = "title";
  birdY = CANVAS_H / 2 - 20;
  birdVel = 0;
  birdAngle = 0;
  score = 0;
  pipes = [];
  frameCount = 0;
  flashAlpha = 0;
}

function startGame() {
  state = "playing";
  birdY = CANVAS_H / 2 - 20;
  birdVel = 0;
  score = 0;
  pipes = [];
  frameCount = 0;
  flashAlpha = 0;
  // Spawn first pipe off-screen to the right
  spawnPipe(CANVAS_W + 100);
}

function flap() {
  birdVel = FLAP_IMPULSE;
}

function spawnPipe(x: number) {
  const minGapY = PIPE_GAP / 2 + 40;
  const maxGapY = PLAY_H - PIPE_GAP / 2 - 40;
  const gapY = minGapY + Math.random() * (maxGapY - minGapY);
  pipes.push({ x, gapY, scored: false });
}

function update() {
  frameCount++;
  wingTimer++;
  if (wingTimer > 8) {
    wingTimer = 0;
    wingUp = !wingUp;
  }

  if (state === "title") {
    // Bird bobs up and down on title screen
    birdY = CANVAS_H / 2 - 20 + Math.sin(frameCount * 0.08) * 8;
    groundOffset = (groundOffset + PIPE_SPEED) % 24;
    return;
  }

  if (state === "gameover") {
    // Flash fades out
    if (flashAlpha > 0) flashAlpha -= 0.05;
    // Bird falls to ground
    if (birdY + BIRD_H / 2 < PLAY_H) {
      birdVel += GRAVITY;
      birdY += birdVel;
      birdAngle = Math.min(Math.PI / 2, birdAngle + 0.15);
    }
    return;
  }

  // ── Playing state ──
  // Bird physics
  birdVel += GRAVITY;
  birdY += birdVel;

  // Bird rotation
  if (birdVel < 0) {
    birdAngle = Math.max(-0.5, birdVel * 0.07);
  } else {
    birdAngle = Math.min(Math.PI / 2, birdAngle + 0.04);
  }

  // Scroll ground
  groundOffset = (groundOffset + PIPE_SPEED) % 24;

  // Move pipes & check scoring
  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED;
    if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
      pipe.scored = true;
      score++;
    }
  }

  // Remove off-screen pipes
  pipes = pipes.filter((p) => p.x + PIPE_W > -10);

  // Spawn new pipes
  const lastPipe = pipes[pipes.length - 1];
  if (!lastPipe || lastPipe.x < CANVAS_W - PIPE_SPAWN_DIST) {
    spawnPipe(CANVAS_W + 20);
  }

  // ── Collision detection ──
  const birdTop = birdY - BIRD_H / 2;
  const birdBottom = birdY + BIRD_H / 2;
  const birdLeft = BIRD_X - BIRD_W / 2;
  const birdRight = BIRD_X + BIRD_W / 2;

  // Ground / ceiling
  if (birdBottom >= PLAY_H || birdTop <= 0) {
    die();
    return;
  }

  // Pipes
  for (const pipe of pipes) {
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + PIPE_W;
    const gapTop = pipe.gapY - PIPE_GAP / 2;
    const gapBottom = pipe.gapY + PIPE_GAP / 2;

    if (birdRight > pipeLeft && birdLeft < pipeRight) {
      if (birdTop < gapTop || birdBottom > gapBottom) {
        die();
        return;
      }
    }
  }
}

function die() {
  state = "gameover";
  flashAlpha = 1;
  frameCount = 0;
  if (score > bestScore) {
    bestScore = score;
  }
  submitScore(score);
}

// ── Rendering ──────────────────────────────────────────────────────────
function drawSky() {
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, PLAY_H);
}

function drawGround() {
  // Ground body
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, PLAY_H, CANVAS_W, GROUND_H);

  // Stripe at top of ground
  ctx.fillStyle = GROUND_STRIPE;
  ctx.fillRect(0, PLAY_H, CANVAS_W, 4);

  // Ground hash pattern
  ctx.fillStyle = GROUND_STRIPE;
  for (let x = -groundOffset; x < CANVAS_W + 24; x += 24) {
    ctx.fillRect(x, PLAY_H + 6, 12, 4);
    ctx.fillRect(x + 12, PLAY_H + 14, 12, 4);
  }
}

function drawPipe(pipe: Pipe) {
  const gapTop = pipe.gapY - PIPE_GAP / 2;
  const gapBottom = pipe.gapY + PIPE_GAP / 2;
  const capH = 24;
  const capOverhang = 4;

  // Top pipe body
  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(pipe.x, 0, PIPE_W, gapTop - capH);
  // Top pipe border
  ctx.strokeStyle = PIPE_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(pipe.x + 1, 0, PIPE_W - 2, gapTop - capH);

  // Top pipe cap
  ctx.fillStyle = PIPE_CAP_COLOR;
  ctx.fillRect(
    pipe.x - capOverhang,
    gapTop - capH,
    PIPE_W + capOverhang * 2,
    capH,
  );
  ctx.strokeStyle = PIPE_BORDER;
  ctx.strokeRect(
    pipe.x - capOverhang + 1,
    gapTop - capH,
    PIPE_W + capOverhang * 2 - 2,
    capH,
  );

  // Bottom pipe body
  ctx.fillStyle = PIPE_COLOR;
  ctx.fillRect(pipe.x, gapBottom + capH, PIPE_W, PLAY_H - gapBottom - capH);
  ctx.strokeStyle = PIPE_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    pipe.x + 1,
    gapBottom + capH,
    PIPE_W - 2,
    PLAY_H - gapBottom - capH,
  );

  // Bottom pipe cap
  ctx.fillStyle = PIPE_CAP_COLOR;
  ctx.fillRect(
    pipe.x - capOverhang,
    gapBottom,
    PIPE_W + capOverhang * 2,
    capH,
  );
  ctx.strokeStyle = PIPE_BORDER;
  ctx.strokeRect(
    pipe.x - capOverhang + 1,
    gapBottom,
    PIPE_W + capOverhang * 2 - 2,
    capH,
  );
}

function drawBird() {
  ctx.save();
  ctx.translate(BIRD_X, birdY);
  ctx.rotate(birdAngle);

  // Body (ellipse)
  ctx.fillStyle = BIRD_BODY;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_W / 2, BIRD_H / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c0962e";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Wing
  ctx.fillStyle = BIRD_WING;
  const wingY = wingUp ? -4 : 3;
  ctx.beginPath();
  ctx.ellipse(-4, wingY, 10, 6, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eye white
  ctx.fillStyle = BIRD_EYE_WHITE;
  ctx.beginPath();
  ctx.arc(8, -4, 6, 0, Math.PI * 2);
  ctx.fill();

  // Eye pupil
  ctx.fillStyle = BIRD_EYE;
  ctx.beginPath();
  ctx.arc(10, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = BIRD_BEAK;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(22, 2);
  ctx.lineTo(12, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawScore() {
  const text = score.toString();
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Shadow
  ctx.fillStyle = TEXT_SHADOW;
  ctx.fillText(text, CANVAS_W / 2 + 2, 22);

  // Main
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(text, CANVAS_W / 2, 20);
}

function drawTitleScreen() {
  // Title
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = TEXT_SHADOW;
  ctx.fillText("Flappy Bird", CANVAS_W / 2 + 2, 100 + 2);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText("Flappy Bird", CANVAS_W / 2, 100);

  // Subtitle
  ctx.font = "bold 18px sans-serif";
  const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = TEXT_SHADOW;
  ctx.fillText("Tap or Press Space", CANVAS_W / 2 + 1, 360 + 1);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText("Tap or Press Space", CANVAS_W / 2, 360);
  ctx.globalAlpha = 1;

  // Best score
  if (bestScore > 0) {
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = TEXT_SHADOW;
    ctx.fillText(`Best: ${bestScore}`, CANVAS_W / 2 + 1, 400 + 1);
    ctx.fillStyle = MEDAL_GOLD;
    ctx.fillText(`Best: ${bestScore}`, CANVAS_W / 2, 400);
  }
}

function drawGameOver() {
  // Semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Scoreboard panel
  const panelW = 220;
  const panelH = 160;
  const panelX = (CANVAS_W - panelW) / 2;
  const panelY = 140;

  // Panel background
  ctx.fillStyle = "#deb864";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  // Inner border
  ctx.strokeStyle = "#f5e6a3";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12);

  // "Game Over" text
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = TEXT_SHADOW;
  ctx.fillText("Game Over", CANVAS_W / 2 + 2, panelY - 20 + 2);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText("Game Over", CANVAS_W / 2, panelY - 20);

  // Score
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#5a3a1a";
  ctx.fillText("Score", panelX + 20, panelY + 35);
  ctx.textAlign = "right";
  ctx.fillText(score.toString(), panelX + panelW - 20, panelY + 35);

  // Best
  ctx.textAlign = "left";
  ctx.fillText("Best", panelX + 20, panelY + 70);
  ctx.textAlign = "right";
  ctx.fillText(bestScore.toString(), panelX + panelW - 20, panelY + 70);

  // Medal
  if (score >= 10) {
    const medalColor =
      score >= 40 ? MEDAL_GOLD : score >= 20 ? MEDAL_SILVER : MEDAL_BRONZE;
    const medalX = panelX + 40;
    const medalY = panelY + 110;
    ctx.fillStyle = medalColor;
    ctx.beginPath();
    ctx.arc(medalX, medalY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8b6914";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Star on medal
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", medalX, medalY);
  }

  // Restart prompt
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = TEXT_SHADOW;
  ctx.fillText("Tap to Restart", CANVAS_W / 2 + 1, panelY + panelH + 40 + 1);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText("Tap to Restart", CANVAS_W / 2, panelY + panelH + 40);
  ctx.globalAlpha = 1;
}

function drawFlash() {
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

// ── Main Loop ──────────────────────────────────────────────────────────
function gameLoop() {
  update();

  // Draw
  drawSky();
  for (const pipe of pipes) {
    drawPipe(pipe);
  }
  drawGround();
  drawBird();

  if (state === "title") {
    drawTitleScreen();
  } else if (state === "playing") {
    drawScore();
  } else if (state === "gameover") {
    drawFlash();
    drawGameOver();
  }

  requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();
