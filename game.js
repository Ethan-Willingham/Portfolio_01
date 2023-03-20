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
    ctx.fillStyle = this.type === "dirt" ? "saddlebrown" : "gray";
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}


const world = [];

function generateTerrain() {
  for (let x = 0; x < canvas.width; x += 20) {
    for (let y = 0; y < canvas.height; y += 20) {
      const type = Math.random() < 0.8 ? "dirt" : "stone";
      const block = new Block(x, y, type);
      world.push(block);
    }
  }
}

generateTerrain();

const miner = new Miner(canvas.width / 2, 0);

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  world.forEach((block) => block.draw());
  miner.draw();

  requestAnimationFrame(gameLoop);;
}

gameLoop();

document.addEventListener("keydown", (e) => {
  const speed = 5;
  switch (e.key) {
    case "ArrowUp":
      miner.y -= speed;
      break;
    case "ArrowDown":
      miner.y += speed;
      break;
    case "ArrowLeft":
      miner.x -= speed;
      break;
    case "ArrowRight":
      miner.x += speed;
      break;
  }
});
