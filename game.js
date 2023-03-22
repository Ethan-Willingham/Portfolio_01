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
  }

  draw() {
    ctx.fillStyle = "blue";
    ctx.fillRect(this.x, this.y, this.size, this.size);
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
const miner = new Miner(canvas.width / 2, 0);
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
//---------------------------------------------GAME LOOP----------------------------------------

function gameLoop() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  ctx.clearRect(camera.x, camera.y, canvas.width, canvas.height);

  if (gameStarted) {
    camera.update(miner);

    world.draw();
    miner.draw();

    ctx.restore();
  } else {
    ctx.restore();
    showStartScreen();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();

//---------------------------------------------EVENT HANDLING----------------------------------------


document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !gameStarted) {
    gameStarted = true;
    return;
  }
  });
  document.addEventListener("keydown", (e) => {
    const blockSize = 20;
    let block;
  
    switch (e.key) {
      case "ArrowUp":
        if (miner.y > 0 && !isCollidingWithSolidBlock(miner.x, miner.y - blockSize, miner.size)) {
          miner.y -= blockSize;
        }
        break;
      case "ArrowDown":
        if (miner.y < worldHeight - blockSize && !isCollidingWithSolidBlock(miner.x, miner.y + blockSize, miner.size)) {
          miner.y += blockSize;
        }
        break;
      case "ArrowLeft":
        if (miner.x > 0 && !isCollidingWithSolidBlock(miner.x - blockSize, miner.y, miner.size)) {
          miner.x -= blockSize;
        }
        break;
      case "ArrowRight":
        if (miner.x < worldWidth - blockSize && !isCollidingWithSolidBlock(miner.x + blockSize, miner.y, miner.size)) {
          miner.x += blockSize;
        }
        break;
    }
  
    block = world.getBlockAt(miner.x, miner.y);
    world.mineBlock(block, inventory);
  });