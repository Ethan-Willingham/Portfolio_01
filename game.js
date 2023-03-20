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

const miner = new Miner(canvas.width / 2, 0);

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  miner.draw();

  requestAnimationFrame(gameLoop);
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
