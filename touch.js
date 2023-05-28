// Get the square
var square = document.querySelector('#draggableSquare');

// Create a new instance of Hammer with the reference
var hammerInstance = new Hammer(square);

// initial position
var posX = 0, posY = 0;

// Create a Pan recognizer
var pan = new Hammer.Pan();

// Add recognizer to the instance
hammerInstance.add(pan);

// Subscribe to pan events
hammerInstance.on('pan', function (e) {
    posX = e.deltaX;
    posY = e.deltaY;
    e.target.style.transform = `translate(${posX}px, ${posY}px)`;
});

// reset position on end
hammerInstance.on('panend', function (e) {
    e.target.style.transform = `translate(${posX}px, ${posY}px)`;
});
