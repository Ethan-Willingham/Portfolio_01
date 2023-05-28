// Get the square
var square = document.querySelector('#draggableSquare');

// Create a new instance of Hammer with the reference
var hammerInstance = new Hammer(square);

// initial position
var pos = square.getBoundingClientRect();  // get initial position in pixels
var posX = pos.left, posY = pos.top;

// Create a Pan recognizer
var pan = new Hammer.Pan();

// Add recognizer to the instance
hammerInstance.add(pan);

// get color and size from square
var squareStyle = window.getComputedStyle(square);
var color = squareStyle.getPropertyValue("background-color");
var width = parseInt(squareStyle.getPropertyValue("width"));
var height = parseInt(squareStyle.getPropertyValue("height"));

// Subscribe to pan events
hammerInstance.on('pan', function (e) {
    e.target.style.transform = `translate(${posX + e.deltaX}px, ${posY + e.deltaY}px)`;

    // Create trace element
    var traceElement = document.createElement('div');
    traceElement.style.position = 'absolute';
    traceElement.style.width = `${width}px`;
    traceElement.style.height = `${height}px`;
    traceElement.style.backgroundColor = color;
    traceElement.style.left = `${posX + e.deltaX}px`;
    traceElement.style.top = `${posY + e.deltaY}px`;

    // Append trace element to body
    document.body.appendChild(traceElement);
});

// update position on end
hammerInstance.on('panend', function (e) {
    posX += e.deltaX;
    posY += e.deltaY;
});
