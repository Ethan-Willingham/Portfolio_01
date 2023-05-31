//---------------------------------------------CANVAS SETUP----------------------------------------

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);

//---------------------------------------------MINER CLASS----------------------------------------

class Miner {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 20;
    this.color = "blue";
  }

  draw() {
    const shakeIntensity = 1;
    const shakeOffsetX = mining ? (Math.random() * shakeIntensity * 2) - shakeIntensity : 0;
    const shakeOffsetY = mining ? (Math.random() * shakeIntensity * 2) - shakeIntensity : 0;

    ctx.fillStyle = this.color;
    ctx.fillRect(this.x + shakeOffsetX, this.y + shakeOffsetY, this.size, this.size);
  }
}

//---------------------------------------------BLOCK CLASS----------------------------------------

class Block {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.size = 20;
    this.type = type;
    this.img = new Image();
    this.img.src = `${this.type}_texture.png`;
  }

  draw() {
    if (this.type !== "sky" && this.type !== "mined") {
      ctx.drawImage(this.img, this.x, this.y, this.size, this.size);
    } else {
      ctx.fillStyle = this.type === "sky" ? "skyblue" : "black";
      ctx.fillRect(this.x, this.y, this.size, this.size);
    }
  }
}

//---------------------------------------------CAMERA CLASS----------------------------------------

class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  update(miner) {
    this.x = miner.x - canvas.width / 2 + miner.size / 2;
    this.y = miner.y - canvas.height / 2 + miner.size / 2;
    this.x = Math.max(0, Math.min(this.x, worldWidth - canvas.width));
    this.y = Math.max(0, Math.min(this.y, worldHeight - canvas.height));
  }
}

//---------------------------------------------WORLD CLASS----------------------------------------

class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.blocks = [];
  }

  generateTerrain() {
    for (let x = 0; x < this.width; x += 20) {
      for (let y = 0; y < this.height; y += 20) {
        const type = this.getBlockType(x, y);
        const block = new Block(x, y, type);
        this.blocks.push(block);
      }
    }
  }

  getBlockType(x, y) {
    if (y < 640) return "sky";
    if (y < 660) return "grass";
  
    const randomValue = Math.random();
    if (randomValue < 0.7) return "dirt";
    if (randomValue < 0.95) return "stone";
  
    const depthFactor = (y - 660) / (this.height - 660);
    const oreTypes = [
      { type: "copper", minDepth: 0, maxDepth: 0.2, chance: 0.1 },
      { type: "iron", minDepth: 0, maxDepth: 0.2, chance: 0.1 },
      { type: "gold", minDepth: 0.2, maxDepth: 0.4, chance: 0.05 },
      { type: "adamantite", minDepth: 0.2, maxDepth: 0.4, chance: 0.05 },
      { type: "mithril", minDepth: 0.4, maxDepth: 0.6, chance: 0.03 },
      { type: "hell_ore", minDepth: 0.6, maxDepth: 0.8, chance: 0.02 },
      { type: "quantum_ore", minDepth: 0.8, maxDepth: 1, chance: 0.01 },
    ];
    const selectedOre = oreTypes.find(
      (ore) =>
        depthFactor >= ore.minDepth &&
        depthFactor <= ore.maxDepth &&
        Math.random() < ore.chance
    );
    return selectedOre ? selectedOre.type : "stone";
  }

  draw() {
    this.blocks.forEach((block) => block.draw());
  }

  getBlockAt(x, y) {
    const blockSize = 20;
    return this.blocks.find(
      (block) =>
        block.x === Math.floor(x / blockSize) * blockSize &&
        block.y === Math.floor(y / blockSize) * blockSize
    );
  }

  mineBlock(block, inventory) {
    if (block.type !== "sky" && block.type !== "mined") {
      if (!inventory[block.type]) {
        inventory[block.type] = 0;
      }
      inventory[block.type]++;
      score += blockPoints[block.type] || 0;
      block.type = "mined";
    }
  }
}

//---------------------------------------------INITIALIZATION----------------------------------------

const worldWidth = 3200;
const worldHeight = 2400;
const world = new World(worldWidth, worldHeight);
world.generateTerrain();

const camera = new Camera();
const miner = new Miner(canvas.width / 0.8, canvas.height / 1);
const inventory = {};

// Add a new gameStarted variable
let gameStarted = false;

// New function to show the start screen
function showStartScreen() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.fillText("Press Enter to Start", canvas.width / 2 - 100, canvas.height / 2);
}

function isCollidingWithSolidBlock(x, y) {
  const block = world.getBlockAt(x, y);
  return block && block.type !== "sky" && block.type !== "mined";
}

// Add mining times for block types
const blockMiningTimes = {
  sky: 0,
  grass: 0.2,
  dirt: 0.2,
  stone: 1,
  copper: 1.5,
  iron: 2,
  gold: 2.5,
  adamantite: 2.8,
  mithril: 3,
  hell_ore: 3.2,
  quantum_ore: 3.5
};

let mining = false;
let miningTimeout = null;

// Add mineBlockWithTimeout() function
function mineBlockWithTimeout(block, inventory, time) {
  if (!mining && block.type !== "sky" && block.type !== "mined") {
    mining = true;
    miner.color = "gray";

    miningTimeout = setTimeout(() => {
      world.mineBlock(block, inventory);
      mining = false;
      miner.color = "blue";
    }, time * 1000);
  }
}
function drawInventory() {
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.fillStyle = "rgba(50, 50, 50, 0.7)";
  ctx.fillRect(100, 100, canvas.width - 200, canvas.height - 200);

  let x = 120;
  let y = 120;
  const blockMargin = 10;
  const blockTextMargin = 4;

  for (const type in inventory) {
    const block = new Block(x, y, type);
    block.draw();
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText(inventory[type], x + blockTextMargin, y + block.size - blockTextMargin);
    x += block.size + blockMargin;
    if (x + block.size > canvas.width - 200) {
      x = 120;
      y += block.size + blockMargin;
    }
  }

  ctx.restore();
}

// New variables for inventory management
let inventoryOpen = false;

//---------------------------------------------SCORE AND TIMER----------------------------------------
let timeRemaining = 60;

let score = 0;
const blockPoints = {
  grass: 1,
  dirt: 2,
  stone: 3,
  copper: 5,
  iron: 10,
  gold: 20,
  adamantite: 50,
  mithril: 100,
  hell_ore: 200,
  quantum_ore: 500,
};

function drawScore() {
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.restore();
}



function drawTime() {
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText(`Time: ${timeRemaining}`, 20, 70);  // Use timeRemaining instead of countdownInterval
  ctx.restore();
}

function countdown() {
  countdownInterval = setInterval(() => {
    if (timeRemaining > 0) {
      timeRemaining--;
    } else {
      clearInterval(countdownInterval);
      gameStarted = false;
    }
  }, 1000);
}

let countdownInterval;

function startCountdown() {
  countdownInterval = setInterval(() => {
    if (timeRemaining > 0) {
      timeRemaining--;
    } else {
      // If time runs out, stop the countdown and end the game
      clearInterval(countdownInterval);
      gameStarted = false;
    }
  }, 1000);  // Decrease timeRemaining every 1000 milliseconds (1 second)
}

function resetGame() {
  // Reset game state
  score = 0;
  timeRemaining = 60;
  gameStarted = false;
  inventory = {};
  miner = new Miner(canvas.width / 0.8, canvas.height / 1);
  
  // Regenerate terrain
  world = new World(worldWidth, worldHeight);
  world.generateTerrain();
}

//---------------------------------------------GAME LOOP----------------------------------------


function gameLoop() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  ctx.clearRect(camera.x, camera.y, canvas.width, canvas.height);

  if (gameStarted) {
    camera.update(miner);

    world.draw();
    miner.draw();
    drawScore();
    drawTime();

    // Draw watermark
    ctx.font = "14px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("Press 'i' to open inv", canvas.width - 180 + camera.x, canvas.height - 20 + camera.y);

    if (inventoryOpen) {
      drawInventory();
    }

    // We remove countdown() call from here...
    // countdown(); 

    ctx.restore();
  } else {
    ctx.restore();
    showStartScreen();
    ctx.restore();
    showStartScreen();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();

//---------------------------------------------EVENT HANDLING----------------------------------------



document.addEventListener("keydown", (e) => {
  // Handle game start
  if (e.key === "Enter" && !gameStarted) {
    gameStarted = true;
    startCountdown();
    return;
  }
  

  // Handle miner movement and mining
  const blockSize = 20;
  let block;

  if (miningTimeout) {
    clearTimeout(miningTimeout);
    miningTimeout = null;
    mining = false;
    miner.color = "blue";
  }

  switch (e.key) {
    case "ArrowUp":
      if (miner.y > 0 && !isCollidingWithSolidBlock(miner.x, miner.y - blockSize)) {
        miner.y -= blockSize;
      }
      break;
      case "ArrowDown":
        if (miner.y < worldHeight - blockSize && !isCollidingWithSolidBlock(miner.x, miner.y + blockSize)) {
          miner.y += blockSize;
        } 
        else {
          block = world.getBlockAt(miner.x, miner.y + blockSize);
          mineBlockWithTimeout(block, inventory, blockMiningTimes[block.type]);
          
        }
        break;
      case "ArrowLeft":
        if (miner.x > 0 && !isCollidingWithSolidBlock(miner.x - blockSize, miner.y)) {
          miner.x -= blockSize;
        } 
        else {
          block = world.getBlockAt(miner.x - blockSize, miner.y);
          mineBlockWithTimeout(block, inventory, blockMiningTimes[block.type]);
          
        }
        break;
      case "ArrowRight":
        if (miner.x < worldWidth - blockSize && !isCollidingWithSolidBlock(miner.x + blockSize, miner.y)) {
          miner.x += blockSize;
        } 
        else {
          block = world.getBlockAt(miner.x + blockSize, miner.y);
          mineBlockWithTimeout(block, inventory, blockMiningTimes[block.type]);
          
        }
        break;
    }

  block = world.getBlockAt(miner.x, miner.y);
  mineBlockWithTimeout(block, inventory, blockMiningTimes[block.type]);
  // Handle inventory open and close
  if (e.key === "i" || e.key === "Escape") {
    inventoryOpen = !inventoryOpen;
  }
});