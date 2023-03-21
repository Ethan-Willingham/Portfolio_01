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
    switch (this.type) {
      case "sky":
        ctx.fillStyle = "skyblue";
        break;
      case "grass":
        ctx.fillStyle = "green";
        break;
      case "dirt":
        ctx.fillStyle = "saddlebrown";
        break;
      case "stone":
        ctx.fillStyle = "gray";
        break;
      default:
        ctx.fillStyle = "gold";
    }
    ctx.fillRect(this.x, this.y, this.size, this.size);
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
          const oreProbabilities = [
            { type: "ore1", prob: 0.5 },
            { type: "ore2", prob: 0.65 },
            { type: "ore3", prob: 0.75 },
            { type: "ore4", prob: 0.85 },
            { type: "ore5", prob: 0.9 },
            { type: "ore6", prob: 0.95 },
            { type: "ore7", prob: 1 },
          ];

          const depthFactor = y / worldHeight;
          const selectedOre = oreProbabilities.find(ore => depthFactor <= ore.prob);
          type = selectedOre.type;
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

document.addEventListener("keydown", (e) => {
  const blockSize = 20;
  switch (e.key) {
    case "ArrowUp":
      miner.y -= blockSize;
      break;
    case "ArrowDown":
      miner.y += blockSize;
      break;
    case "ArrowLeft":
      miner.x -= blockSize;
      break;
    case "ArrowRight":
      miner.x += blockSize;
      break;
  }
});
