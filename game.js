const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);

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

class Block {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.size = 20;
    this.type = type;
  }

  draw() {
    let img = document.createElement("img");
    img.width = this.size;
    img.height = this.size;

    switch (this.type) {
      case "sky":
        ctx.fillStyle = "skyblue";
        break;
      case "grass":
        img.src = "grass_texture.png";
        break;
      case "dirt":
        img.src = "dirt_texture.png";
        break;
      case "stone":
        img.src = "stone_texture.png";
        break;
      case "copper":
        img.src = "copper_texture.png";
        break;
      case "iron":
        img.src = "iron_texture.png";
        break;
      case "gold":
        img.src = "gold_texture.png";
        break;
      case "adamantite":
        img.src = "adamantite_texture.png";
        break;
      case "mithril":
        img.src = "mithril_texture.png";
        break;
      case "hell_ore":
        img.src = "hell_ore_texture.png";
        break;
      case "quantum_ore":
        img.src = "quantum_ore_texture.png";
        break;
      case "mined":
        ctx.fillStyle = "black";
        break;
      default:
        ctx.fillStyle = "black";
    }
    if (this.type !== "sky" && this.type !== "mined") {
      ctx.drawImage(img, this.x, this.y, this.size, this.size);
    } else {
      ctx.fillRect(this.x, this.y, this.size, this.size);
    }
  }
}

const world = [];
const worldWidth = 3200;
const worldHeight = 2400;

function generateTerrain() {
  for (let x = 0; x < worldWidth; x += 20) {
    for (let y = 0; y < worldHeight; y += 20) {
      let type;

      if (y < 80) {
        type = "sky";
      } else if (y < 100) {
        type = "grass";
      } else {
        const randomValue = Math.random();
        if (randomValue < 0.7) {
          type = "dirt";
        } else if (randomValue < 0.95) {
          type = "stone";
        } else {
          const depthFactor = y / worldHeight;
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
            type = selectedOre ? selectedOre.type : "stone";
          }
        }
      
        const block = new Block(x, y, type);
        world.push(block);
      }
    }
  }
  
  class Camera {
  constructor() {
  this.x = 0;
  this.y = 0;
  }
  
  update() {
  this.x = miner.x - canvas.width / 2 + miner.size / 2;
  this.y = miner.y - canvas.height / 2 + miner.size / 2;
  // Clamp camera to the world bounds
this.x = Math.max(0, Math.min(this.x, worldWidth - canvas.width));
this.y = Math.max(0, Math.min(this.y, worldHeight - canvas.height));
}
}
const camera = new Camera();
const inventory = {};

generateTerrain();

const miner = new Miner(canvas.width / 2, 0);

function gameLoop() {
ctx.clearRect(0, 0, canvas.width, canvas.height);

camera.update();
ctx.save();
ctx.translate(-camera.x, -camera.y);

world.forEach((block) => block.draw());
miner.draw();

ctx.restore();
requestAnimationFrame(gameLoop);
}

gameLoop();

function getBlockAt(x, y) {
return world.find(
(block) =>
block.x === Math.floor(x / 20) * 20 &&
block.y === Math.floor(y / 20) * 20
);
}

function mineBlock(block) {
if (block.type !== "sky" && block.type !== "mined") {
if (!inventory[block.type]) {
inventory[block.type] = 0;
}
inventory[block.type]++;
block.type = "mined";
}
}

document.addEventListener("keydown", (e) => {
const blockSize = 20;
let block;

switch (e.key) {
case "ArrowUp":
if (miner.y > 0) miner.y -= blockSize;
block = getBlockAt(miner.x, miner.y);
mineBlock(block);
break;
case "ArrowDown":
if (miner.y < worldHeight - blockSize) miner.y += blockSize;
block = getBlockAt(miner.x, miner.y);
mineBlock(block);
break;
case "ArrowLeft":
if (miner.x > 0) miner.x -= blockSize;
block = getBlockAt(miner.x, miner.y);
mineBlock(block);
break;
case "ArrowRight":
if (miner.x < worldWidth - blockSize) miner.x += blockSize;
block = getBlockAt(miner.x, miner.y);
mineBlock(block);
break;
}
});
