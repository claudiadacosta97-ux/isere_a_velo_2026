const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const ROUTE_Y = 220;
const DEBUG_HITBOXES = false;
const STORAGE_KEY = "isere-bike-2026-scores";
const SUPABASE_URL = "https://egeqeghmseeufyupidgl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnZXFlZ2htc2VldWZ5dXBpZGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDc1NDYsImV4cCI6MjA5MjY4MzU0Nn0.YGR21zsF8CQ2PeRUWjQjtMbGGosDgxqbWT-EAZd0vmw";

ctx.imageSmoothingEnabled = false;

function loadImage(fileName, fallbackName) {
  const img = new Image();
  img.src = "assets/" + fileName;

  if (fallbackName) {
    img.onerror = () => {
      img.onerror = null;
      img.src = "assets/" + fallbackName;
    };
  }

  return img;
}

const images = {
  home: loadImage("Canva.png"),
  logo: loadImage("logo.png"),
  button: loadImage("Bouton.png"),
  validate: loadImage("Valider.png"),
  arrowLeft: loadImage("Fleche_gauche.png"),
  arrowRight: loadImage("Fleche_droite.png"),
  route: loadImage("Route.png"),
  bike: loadImage("Velo_route.png"),
  bikeVtc: loadImage("VTC.png"),
  bikeVtt: loadImage("VTT.png"),
  backgrounds: [
    loadImage("Vercors.png"),
    loadImage("Belledonne.png"),
    loadImage("Chartreuse.png"),
    loadImage("Ecrins.png")
  ],
  obstacles: {
    pierre: loadImage("Pierre.png"),
    travaux: loadImage("Travaux.png"),
    immeuble: loadImage("Immeuble.png"),
    oiseau: loadImage("Oiseau.png")
  }
};

const bikeChoices = [
  { name: "VELO ROUTE", image: images.bike },
  { name: "VTC", image: images.bikeVtc },
  { name: "VTT", image: images.bikeVtt }
];

const decorChoices = [
  { name: "VERCORS", image: images.backgrounds[0] },
  { name: "BELLEDONNE", image: images.backgrounds[1] },
  { name: "CHARTREUSE", image: images.backgrounds[2] },
  { name: "ECRINS", image: images.backgrounds[3] }
];

const ui = {
  homeButton: { x: 390, y: 216, width: 120, height: 40 },
  leftArrow: { x: 314, y: 162, width: 16, height: 20 },
  rightArrow: { x: 570, y: 162, width: 16, height: 20 },
  validateButton: { x: 389, y: 232, width: 122, height: 40 },
  rankingButton: { x: 320, y: 258, width: 260, height: 24 },
  changeCharacterButton: { x: 320, y: 256, width: 250, height: 26 },
  replayButton: { x: 590, y: 256, width: 180, height: 26 },
  howToButton: { x: 390, y: 236, width: 120, height: 40 },
  touchCrouchButton: { x: 18, y: 154, width: 110, height: 42 },
  touchJumpButton: { x: 772, y: 154, width: 110, height: 42 }
};

const obstacleTypes = {
  pierre: {
    image: "pierre",
    width: 40,
    height: 30,
    y: ROUTE_Y - 30,
    hitbox: { x: 8, y: 21, width: 24, height: 8 },
    minScore: 0
  },
  travaux: {
    image: "travaux",
    width: 60,
    height: 30,
    y: ROUTE_Y - 30,
    hitbox: { x: -8, y: 6, width: 76, height: 22 },
    minScore: 200
  },
  immeuble: {
    image: "immeuble",
    width: 40,
    height: 70,
    y: ROUTE_Y - 70,
    hitbox: { x: 4, y: 0, width: 32, height: 69 },
    minScore: 500
  },
  oiseau: {
    image: "oiseau",
    width: 45,
    height: 30,
    y: ROUTE_Y - 70,
    hitbox: { x: 4, y: 5, width: 37, height: 20 },
    minScore: 350
  }
};

let state = "home";
let playerName = "";
let currentBackground = images.backgrounds[0];
let selectedBikeIndex = 0;
let selectedDecorIndex = 0;
let selectionFlow = "intro";
let rankingChoice = 1;
let lastTime = 0;
let savedThisRun = false;
let touchControlsActive = "ontouchstart" in window || navigator.maxTouchPoints > 0;
let activeTouchControl = null;

const keys = {
  down: false,
  space: false
};

const player = {
  x: 105,
  y: ROUTE_Y,
  dy: 0,
  width: 60,
  height: 60,
  crouchHeight: 24,
  jumps: 0,
  maxJumps: 2,
  crouching: false,
  crouchFrames: 0,
  holdJumpFrames: 0
};

let obstacles = [];
let score = 0;
let speed = 2.5;
let nextSpawnDistance = 340;
let distanceSinceSpawn = 0;
let routeOffset = 0;

let supabaseClient = null;
let leaderboard = loadScores();

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !window.supabase.createClient) return null;

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function normalizeScores(scores) {
  return (Array.isArray(scores) ? scores : [])
    .map((entry) => ({
      name: String(entry.name || "ANONYME").slice(0, 10),
      score: Number(entry.score) || 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function loadLocalScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return normalizeScores(scores);
  } catch (error) {
    return [];
  }
}

async function refreshScoresFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data, error } = await client
      .from("scores")
      .select("name, score")
      .order("score", { ascending: false })
      .limit(10);

    if (error) throw error;

    leaderboard = normalizeScores(data);
    saveScores();
  } catch (error) {
    console.warn("Classement Supabase indisponible, fallback local.", error);
  }
}

function loadScores() {
  const fallbackScores = loadLocalScores();
  refreshScoresFromSupabase();
  return fallbackScores;
}

function saveScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leaderboard.slice(0, 10)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function selectedBike() {
  return bikeChoices[selectedBikeIndex];
}

function selectedDecor() {
  return decorChoices[selectedDecorIndex];
}

function moveSelection(direction, count, currentIndex) {
  return (currentIndex + direction + count) % count;
}

function pointInRect(x, y, rect) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function setFont(size) {
  ctx.font = size + "px 'Press Start 2P', Arial, sans-serif";
  ctx.textBaseline = "middle";
}

function drawText(text, x, y, size, color) {
  setFont(size);
  ctx.fillStyle = color || "white";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function drawShadowText(text, x, y, size, color) {
  setFont(size);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color || "white";
  ctx.fillText(text, x, y);
}

function drawCanvaBackground() {
  ctx.drawImage(images.home, 0, 0, 900, 300);
}

function drawHomeBackground() {
  drawCanvaBackground();
  ctx.drawImage(images.logo, 350, 0, 200, 200);
}

function playerBox() {
  const height = player.crouching ? player.crouchHeight : player.height;

  return {
    x: player.x + 8,
    y: player.y - height,
    width: player.width - 16,
    height
  };
}

function obstacleBox(obstacle) {
  return {
    x: obstacle.x + obstacle.hitbox.x,
    y: obstacle.y + obstacle.hitbox.y,
    width: obstacle.hitbox.width,
    height: obstacle.hitbox.height
  };
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function nextSpawnGap() {
  const progress = clamp(score / 3500, 0, 1);
  const minGap = 190 - progress * 55;
  const maxGap = 420 - progress * 120;
  return minGap + Math.random() * (maxGap - minGap);
}

function spawnObstacle() {
  const available = Object.keys(obstacleTypes).filter((type) => {
    return score >= obstacleTypes[type].minScore;
  });

  const type = pickRandom(available);
  const config = obstacleTypes[type];

  obstacles.push({
    type,
    image: config.image,
    x: WIDTH + 20,
    y: config.y,
    width: config.width,
    height: config.height,
    hitbox: config.hitbox,
    passed: false
  });

  nextSpawnDistance = nextSpawnGap();
  distanceSinceSpawn = 0;
}

function resetGame() {
  obstacles = [];
  score = 0;
  speed = 2.5;
  distanceSinceSpawn = 0;
  routeOffset = 0;
  nextSpawnDistance = 420;
  savedThisRun = false;

  player.y = ROUTE_Y;
  player.dy = 0;
  player.jumps = 0;
  player.crouching = false;
  player.crouchFrames = 0;
  player.holdJumpFrames = 0;

  currentBackground = selectedDecor().image;
}

function startGame() {
  resetGame();
  state = "game";
}

function jump() {
  if (player.jumps >= player.maxJumps || player.crouching) return;

  player.dy = player.jumps === 0 ? -8.2 : -10.6;
  player.jumps += 1;
  player.holdJumpFrames = 0;
}

function addScoreFallback(entry) {
  leaderboard.push(entry);
  leaderboard = normalizeScores(leaderboard);
  saveScores();
}

async function endGame() {
  if (!savedThisRun) {
    const entry = {
      name: playerName.trim() || "ANONYME",
      score: Math.floor(score)
    };

    const client = getSupabaseClient();

    savedThisRun = true;

    if (!client) {
      addScoreFallback(entry);
      state = "gameover";
      return;
    }

    try {
      const { error } = await client
        .from("scores")
        .insert(entry);

      if (error) throw error;

      // 🔥 ATTEND VRAIMENT le refresh
      await refreshScoresFromSupabase();

    } catch (error) {
      console.warn("Fallback local", error);
      addScoreFallback(entry);
    }
  }

  state = "gameover";
}

function updatePlayer(deltaScale) {
  const isGrounded = player.y >= ROUTE_Y;

  if (player.crouchFrames > 0) {
    player.crouchFrames -= deltaScale;
  }

  player.crouching = (keys.down || player.crouchFrames > 0) && isGrounded;

  if (keys.space && player.jumps > 0 && player.dy < 0 && player.holdJumpFrames < 26) {
    player.dy -= 0.1 * deltaScale;
    player.holdJumpFrames += deltaScale;
  }

  player.y += player.dy * deltaScale;
  const longJumpFloat = keys.space && player.jumps > 0 && player.dy > -1 && player.dy < 4.5;
  player.dy += (longJumpFloat ? 0.25 : 0.56) * deltaScale;

  if (player.y >= ROUTE_Y) {
    player.y = ROUTE_Y;
    player.dy = 0;
    player.jumps = 0;
  }
}

function updateGame(deltaScale) {
  score += deltaScale;
  speed = 2.5 + Math.min(score * 0.00115, 5.6);
  distanceSinceSpawn += speed * deltaScale;
  routeOffset = (routeOffset + speed * deltaScale) % WIDTH;

  updatePlayer(deltaScale);

  if (distanceSinceSpawn >= nextSpawnDistance) {
    spawnObstacle();
  }

  const pBox = playerBox();

  for (const obstacle of obstacles) {
    obstacle.x -= speed * deltaScale;

    if (intersects(pBox, obstacleBox(obstacle))) {
      endGame();
      break;
    }
  }

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);
}

function drawHitbox(box, color) {
  if (!DEBUG_HITBOXES) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawGame() {
  ctx.drawImage(currentBackground, 0, 0, 900, 300);
  ctx.drawImage(images.route, -routeOffset, ROUTE_Y, 900, 80);
  ctx.drawImage(images.route, WIDTH - routeOffset, ROUTE_Y, 900, 80);

  for (const obstacle of obstacles) {
    ctx.drawImage(
      images.obstacles[obstacle.image],
      obstacle.x,
      obstacle.y,
      obstacle.width,
      obstacle.height
    );
    drawHitbox(obstacleBox(obstacle), "#ff4040");
  }

  const bikeY = player.crouching ? player.y - 30 : player.y - 60;
  ctx.drawImage(selectedBike().image, player.x, bikeY, 60, 60);
  drawHitbox(playerBox(), "#40ff80");

  ctx.textAlign = "left";
  setFont(18);
  ctx.fillStyle = "white";
  ctx.fillText("Score : " + Math.floor(score), 18, 26);

  ctx.textAlign = "right";
  ctx.fillText(playerName || "JOUEUR", WIDTH - 18, 26);

  const bestScore = leaderboard[0];
  const currentScore = Math.floor(score);
  const displayedBest = bestScore && bestScore.score >= currentScore
    ? bestScore
    : { name: playerName || "JOUEUR", score: currentScore };

  if (displayedBest) {
    const bestName = String(displayedBest.name || "ANONYME").slice(0, 10).toUpperCase();
    setFont(8);
    ctx.fillStyle = "black";
    ctx.textAlign = "right";
    ctx.fillText(
      "Meilleur score : " + bestName + " - " + displayedBest.score,
      WIDTH - 12,
      HEIGHT - 12
    );
  }

  drawTouchControls();
}

function drawHome() {
  drawHomeBackground();
  ctx.drawImage(images.button, ui.homeButton.x, ui.homeButton.y, ui.homeButton.width, ui.homeButton.height);
  drawShadowText("Appuie sur espace", WIDTH / 2, 268, 20, "white");
}

function drawValidateButton() {
  ctx.drawImage(
    images.validate,
    ui.validateButton.x,
    ui.validateButton.y,
    ui.validateButton.width,
    ui.validateButton.height
  );
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawActionButton(rect, label, selected) {
  ctx.save();
  roundedRect(rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fillStyle = selected ? "#f39557" : "white";
  ctx.fill();
  drawText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1, 8, selected ? "white" : "#f39557");
  ctx.restore();
}

function drawTouchControls() {
  if (!touchControlsActive) return;

  drawActionButton(ui.touchCrouchButton, "BAS", activeTouchControl === "crouch");
  drawActionButton(ui.touchJumpButton, "SAUT", activeTouchControl === "jump");
}

function drawSelectionControls() {
  ctx.drawImage(images.arrowLeft, ui.leftArrow.x, ui.leftArrow.y, ui.leftArrow.width, ui.leftArrow.height);
  ctx.drawImage(images.arrowRight, ui.rightArrow.x, ui.rightArrow.y, ui.rightArrow.width, ui.rightArrow.height);
  drawValidateButton();
}

function drawBikeSelect() {
  drawCanvaBackground();

  const choice = selectedBike();
  drawShadowText("Choisis ton velo", WIDTH / 2, 46, 18, "#f39557");
  drawShadowText(choice.name, WIDTH / 2, 92, 16, "white");
  ctx.drawImage(choice.image, WIDTH / 2 - 30, 142, 60, 60);
  drawSelectionControls();
}

function drawDecorSelect() {
  const choice = selectedDecor();
  ctx.drawImage(choice.image, 0, 0, 900, 300);

  drawShadowText("Choisis ton massif", WIDTH / 2, 34, 18, "#f39557");
  drawShadowText(choice.name, WIDTH / 2, 76, 16, "white");

  drawSelectionControls();
}

function drawNameInput() {
  drawCanvaBackground();

  ctx.fillStyle = "rgba(243, 149, 87, 0.68)";
  ctx.fillRect(270, 176, 360, 62);

  drawText("Entre ton pseudo", WIDTH / 2, 154, 18, "black");
  drawText((playerName || "_") + (Math.floor(Date.now() / 400) % 2 ? "" : "_"), WIDTH / 2, 207, 24, "white");
  drawText("ESPACE pour valider", WIDTH / 2, 282, 12, "#f39557");
}

function drawHowTo() {
  drawCanvaBackground();

  drawShadowText("Comment jouer", WIDTH / 2, 48, 18, "#f39557");

  ctx.save();
  roundedRect(130, 76, 640, 150, 8);
  ctx.fillStyle = "rgba(243, 149, 87, 0.72)";
  ctx.fill();
  ctx.restore();

  drawText("Espace : sauter", WIDTH / 2, 106, 9, "white");
  drawText("Double espace : double saut", WIDTH / 2, 138, 9, "white");
  drawText("Espace long : saut long", WIDTH / 2, 170, 9, "white");
  drawText("Fleche bas : se baisser", WIDTH / 2, 202, 9, "white");

  ctx.drawImage(
    images.button,
    ui.howToButton.x,
    ui.howToButton.y,
    ui.howToButton.width,
    ui.howToButton.height
  );
}

function drawGameOver() {
  drawHomeBackground();

  drawShadowText("GAME OVER", WIDTH / 2, 214, 18, "#f39557");
  drawText("Score : " + Math.floor(score), WIDTH / 2, 240, 10, "black");
  drawActionButton(ui.rankingButton, "Voir le classement", true);
  drawShadowText("Espace", WIDTH / 2, 294, 10, "white");
}

function drawRanking() {
  drawCanvaBackground();
  ctx.drawImage(images.logo, 42, 54, 180, 180);

  ctx.save();
  roundedRect(300, 38, 548, 210, 8);
  ctx.fillStyle = "rgba(243, 149, 87, 0.78)";
  ctx.fill();
  ctx.restore();

  drawText("CLASSEMENT", 574, 66, 18, "white");

  setFont(12);
  ctx.textAlign = "center";
  ctx.fillStyle = "white";

  const topFive = leaderboard.slice(0, 5);
  if (topFive.length === 0) {
    ctx.fillText("Aucun score", 574, 140);
  } else {
    topFive.forEach((entry, index) => {
      const name = String(entry.name || "ANONYME").slice(0, 10).toUpperCase();
      ctx.fillText(
        `${index + 1}. ${name} - ${entry.score}`,
        574,
        104 + index * 28
      );
    });
  }

  drawActionButton(ui.changeCharacterButton, "Changer perso", rankingChoice === 0);
  drawActionButton(ui.replayButton, "Rejouer", rankingChoice === 1);
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (state === "home") drawHome();
  if (state === "bike") drawBikeSelect();
  if (state === "decor") drawDecorSelect();
  if (state === "name") drawNameInput();
  if (state === "howto") drawHowTo();
  if (state === "game") drawGame();
  if (state === "gameover") drawGameOver();
  if (state === "ranking") drawRanking();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const elapsed = Math.min(timestamp - lastTime, 48);
  lastTime = timestamp;
  const deltaScale = elapsed / 16.6667;

  if (state === "game") {
    updateGame(deltaScale);
  }

  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowDown") {
    event.preventDefault();
  }

  if (state === "home" && event.code === "Space") {
    selectionFlow = "intro";
    state = "bike";
    return;
  }

  if (state === "bike") {
    if (event.code === "ArrowLeft") {
      selectedBikeIndex = moveSelection(-1, bikeChoices.length, selectedBikeIndex);
      return;
    }

    if (event.code === "ArrowRight") {
      selectedBikeIndex = moveSelection(1, bikeChoices.length, selectedBikeIndex);
      return;
    }

    if (event.code === "Space") {
      state = "decor";
      return;
    }
  }

  if (state === "decor") {
    if (event.code === "ArrowLeft") {
      selectedDecorIndex = moveSelection(-1, decorChoices.length, selectedDecorIndex);
      return;
    }

    if (event.code === "ArrowRight") {
      selectedDecorIndex = moveSelection(1, decorChoices.length, selectedDecorIndex);
      return;
    }

    if (event.code === "Space") {
      if (selectionFlow === "change") {
        startGame();
      } else {
        state = "name";
      }
      return;
    }
  }

  if (state === "name") {
    if (event.code === "Space") {
      state = "howto";
      return;
    }

    if (event.code === "Backspace") {
      playerName = playerName.slice(0, -1);
      return;
    }

    if (event.key.length === 1 && playerName.length < 10) {
      const nextChar = event.key.toUpperCase();
      if (/^[A-Z0-9_-]$/.test(nextChar)) {
        playerName += nextChar;
      }
    }

    return;
  }

  if (state === "howto") {
    if (event.code === "Space") {
      startGame();
    }

    return;
  }

  if (state === "game") {
    if (event.code === "Space" && !keys.space) {
      jump();
    }

    if (event.code === "Space") keys.space = true;
    if (event.code === "ArrowDown") {
      keys.down = true;
      player.crouchFrames = 36;
    }
    return;
  }

  if (state === "gameover" && event.code === "Space") {
    rankingChoice = 1;
    state = "ranking";
    return;
  }

  if (state === "ranking") {
    if (event.code === "ArrowLeft") {
      rankingChoice = 0;
      return;
    }

    if (event.code === "ArrowRight") {
      rankingChoice = 1;
      return;
    }

    if (event.code === "Space") {
      if (rankingChoice === 0) {
        selectionFlow = "change";
        state = "bike";
      } else {
        startGame();
      }
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") keys.space = false;
  if (event.code === "ArrowDown") keys.down = false;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" || state !== "game") return;

  event.preventDefault();
  touchControlsActive = true;
  const point = canvasPoint(event);

  if (pointInRect(point.x, point.y, ui.touchCrouchButton) || point.x < WIDTH * 0.35) {
    keys.down = true;
    player.crouchFrames = 42;
    activeTouchControl = "crouch";
    return;
  }

  if (!keys.space) {
    jump();
  }

  keys.space = true;
  activeTouchControl = "jump";
});

function stopTouchControl() {
  if (activeTouchControl === "jump") {
    keys.space = false;
  }

  if (activeTouchControl === "crouch") {
    keys.down = false;
  }

  activeTouchControl = null;
}

canvas.addEventListener("pointerup", stopTouchControl);
canvas.addEventListener("pointercancel", stopTouchControl);
canvas.addEventListener("pointerleave", stopTouchControl);

canvas.addEventListener("click", (event) => {
  const point = canvasPoint(event);
  const x = point.x;
  const y = point.y;

  if (state === "home" && pointInRect(x, y, ui.homeButton)) {
    selectionFlow = "intro";
    state = "bike";
    return;
  }

  if (state === "bike") {
    if (pointInRect(x, y, ui.leftArrow)) {
      selectedBikeIndex = moveSelection(-1, bikeChoices.length, selectedBikeIndex);
      return;
    }

    if (pointInRect(x, y, ui.rightArrow)) {
      selectedBikeIndex = moveSelection(1, bikeChoices.length, selectedBikeIndex);
      return;
    }

    if (pointInRect(x, y, ui.validateButton)) {
      state = "decor";
      return;
    }
  }

  if (state === "decor") {
    if (pointInRect(x, y, ui.leftArrow)) {
      selectedDecorIndex = moveSelection(-1, decorChoices.length, selectedDecorIndex);
      return;
    }

    if (pointInRect(x, y, ui.rightArrow)) {
      selectedDecorIndex = moveSelection(1, decorChoices.length, selectedDecorIndex);
      return;
    }

    if (pointInRect(x, y, ui.validateButton)) {
      if (selectionFlow === "change") {
        startGame();
      } else {
        state = "name";
      }
    }
  }

  if (state === "howto" && pointInRect(x, y, ui.howToButton)) {
    startGame();
    return;
  }

  if (state === "gameover" && pointInRect(x, y, ui.rankingButton)) {
    rankingChoice = 1;
    state = "ranking";
    return;
  }

  if (state === "ranking" && pointInRect(x, y, ui.changeCharacterButton)) {
    rankingChoice = 0;
    selectionFlow = "change";
    state = "bike";
    return;
  }

  if (state === "ranking" && pointInRect(x, y, ui.replayButton)) {
    rankingChoice = 1;
    startGame();
  }
});

requestAnimationFrame(loop);
