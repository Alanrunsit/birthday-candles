const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const match = document.querySelector(".match");
const cakeArea = document.querySelector(".cake-area");
const cakeImg = document.querySelector(".cake");

// Constants
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const WEBCAM_WIDTH = isMobile ? 240 : 300;
const WEBCAM_HEIGHT = isMobile ? 180 : 225;
const BLOW_THRESHOLD = 70; // how sensitive mic is
const BLOW_HOLD_MS = 240; // how long the blow must be held to put out the candle
const LIGHT_DISTANCE = 20; // how close match needs to be to light the candles

// Set drawing size for the overlay canvas.
canvas.width = WEBCAM_WIDTH;
canvas.height = WEBCAM_HEIGHT;

// Game state flags (some are placeholders for your next gameplay steps).
let handPosition = false; // stores hand position later (currently placeholder)
let isHandDetected = false; // quick boolean flag (currently placeholder)
let isCakelit = false; // true after candles are lit
let isCandlesBlownOut = false; // true after player blows candles out

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  // Configure tracker behavior and confidence thresholds.
hands.setOptions({
    maxNumHands: 1, 
    modelComplexity: isMobile ? 0 : 1, 
    minDetectionConfidence: isMobile ? 0.6 : 0.7, 
    minTrackingConfidence: isMobile ? 0.4 : 0.5 
});

//Hand Tracking
hands.onResults((results) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        isHandDetected = true;

        //get index fingertip
        const indexTip = landmarks[8];
        handPosition = {
            x: 1-indexTip.x,
            y: indexTip.y
        };

        updateMatchPosition();
        
        checkCandleLight();
    }   else {
        isHandDetected = false;
    }
});

//Match
function updateMatchPosition() {
    if (!isHandDetected) return;

    const cakeRect = cakeArea.getBoundingClientRect();

    const padding = 20;
    const matchX = padding + handPosition.x * (cakeRect.width - padding * 2 - 40);
    const matchY = padding + handPosition.y * (cakeRect.height - padding * 2 - 60);

    match.style.left = `${matchX}px`;
    match.style.top = `${matchY}px`;
}

//Candle Light
function checkCandleLight() {
    if (!cakeImg) return;
    if (isCakelit || isCandlesBlownOut) return;

    const matchRect = match.getBoundingClientRect();
    const cakeRect = cakeImg.getBoundingClientRect();

    const matchTipX = matchRect.left + matchRect.width / 2;
    const matchTipY = matchRect.top;

    const candleX = cakeRect.left + cakeRect.width / 2;
    const candleY = cakeRect.top + 10;

    const distance = Math.sqrt(
        Math.pow(matchTipX - candleX, 2) + Math.pow(matchTipY - candleY, 2)
    );

    if (distance < LIGHT_DISTANCE) {
        lightCake();
    }
}

//Light Cake
function lightCake() {
    if (!cakeImg) return;
    isCakelit = true;
    cakeImg.src = "assets/cake_lit.gif";
    match.style.display = "none";
}

function blowOutCandles() {
    if (!cakeImg) return;
    if (!isCakelit || isCandlesBlownOut) return;

    isCandlesBlownOut = true;
    cakeImg.src = "assets/cake_unlit.gif";
}

//Blow Detection
let audioContext = null;
let analyser = null;
let microphone = null;
let isBlowDetectionActive = false;

async function initBlowDetection() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        microphone.connect(analyser);

        isBlowDetectionActive = true;
        detectBlow();
    } catch (error) {
        console.error("Error accessing microphone :", error);
    }
}

function detectBlow() {
    if (!isBlowDetectionActive) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const volume = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

    if (volume > BLOW_THRESHOLD && isCakelit && !isCandlesBlownOut) {
        blowOutCandles();
    }
    
    requestAnimationFrame(detectBlow);
}

//Camera
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: WEBCAM_WIDTH,
                height: WEBCAM_HEIGHT,
                facingMode: "user"
            },
         });

         video.srcObject = stream;

         video.onloadedmetadata = () => {
            video.play();
            startHandTracking();
         };
    } catch (error) {
        console.error("Error accessing webcam:", error);
        alert("Could not access webcam. Please check your camera permissions.");
    }
}

//Hand Tracking
function startHandTracking() {
    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: WEBCAM_WIDTH,
        height: WEBCAM_HEIGHT
    });

    camera.start();
}

window.addEventListener("DOMContentLoaded", async () => {
    setupCamera();

    if (isMobile) {
        document.body.addEventListener(
            "click", 
            () => {
                if (!audioContext) {
                    initBlowDetection();
                }
            },
            { once: true }
        );
    } else {
        initBlowDetection();
    }
});

//Candle Blow
 /*       //draw hand landmarks
        drawLandmarks(ctx, landmarks, { color: "#ff8c42", lineWidth: 1 });


 // Aliases for readability in the hand-tracking code.
const webcamEl = video; 
const handCanvas = canvas; 
const handCtx = ctx; // drawing context for handCanvas
const stage = cakeArea; // area used to convert normalized hand coordinates to on-screen coordinates
let hands; 
let camera;

// Central state object for the hand tracker.
const gameState = {
  isHandDetected: false, // whether at least one hand exists in current frame
  fingerPoint: null // {x, y} of index fingertip in stage pixel coordinates
};

// Draw hand bones + points on the overlay canvas each frame.
function drawHandLandmarks(results) {
  handCtx.save(); // save current canvas transform/settings
  handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height); // clear previous frame drawings
  handCtx.translate(handCanvas.width, 0); // move origin to right edge
  handCtx.scale(-1, 1); // flip horizontally so it mirrors the webcam view

  // Only draw if MediaPipe found at least one hand.
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0]; // use first hand only

    // Draw connecting lines between landmark points.
    drawConnectors(handCtx, landmarks, HAND_CONNECTIONS, {
      color: "#ffffff",
      lineWidth: 2
    });

    // Draw each landmark point.
    drawLandmarks(handCtx, landmarks, { color: "#ff8c42", lineWidth: 1 });
  }

  handCtx.restore(); // restore original canvas transform/settings
}

// Handle each set of tracking results from MediaPipe.
function onHandResults(results) {
  // 1) Always draw current hand overlay.
  drawHandLandmarks(results);

  // 2) If no hand is found, reset hand-related state and exit early.
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gameState.isHandDetected = false;
    gameState.fingerPoint = null;
    return;
  }

  // 3) If a hand exists, read its index-fingertip position.
  const landmarks = results.multiHandLandmarks[0];
  const indexTip = landmarks[8]; // landmark 8 = index fingertip in MediaPipe Hands

  // 4) Read the displayed cake area's size in pixels.
  const rect = stage.getBoundingClientRect();

  // 5) Save detection state and convert normalized coords (0..1) to pixel coords.
  // x is mirrored to match the visually mirrored webcam/canvas.
  gameState.isHandDetected = true;
  gameState.fingerPoint = {
    x: (1 - indexTip.x) * rect.width,
    y: indexTip.y * rect.height
  };
}

// Create and start MediaPipe hand tracking + webcam capture.
async function setupHands() {


  // Tell MediaPipe which function should run after every processed frame.
  hands.onResults(onHandResults);

  // Create camera pipeline: every frame, send the current webcam image to MediaPipe.
  camera = new Camera(webcamEl, {
    onFrame: async () => {
      await hands.send({ image: webcamEl });
    },
    width: 640, // capture resolution width
    height: 480 // capture resolution height
  });

  // Start webcam stream and begin tracking loop.
  await camera.start();
}

// Kick off the app.
setupHands(); */