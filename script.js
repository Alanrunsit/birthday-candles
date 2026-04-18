const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const match = document.querySelector(".match");
const cakeArea = document.querySelector(".cake-area");
const cakeImg = document.querySelector(".cake");
const retryButton = document.getElementById("retry-btn");
let debugLabel = null;
let lastDebugMessage = "";

// Constants
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const WEBCAM_WIDTH = isMobile ? 280 : 520;
const WEBCAM_HEIGHT = isMobile ? 210 : 390;
const BLOW_THRESHOLD = 70; // how sensitive mic is
const BLOW_HOLD_MS = 240; // how long the blow must be held to put out the candle
const LIGHT_DISTANCE = 30; // how close match needs to be to light the candles
let hands = null;

function showRetryButton() {
    if (!retryButton) return;
    retryButton.disabled = false;
    retryButton.classList.add("is-visible");
}

function hideRetryButton() {
    if (!retryButton) return;
    retryButton.disabled = true;
    retryButton.classList.remove("is-visible");
}

function handleRetryPress(event) {
    if (event) event.preventDefault();
    resetGame();
}

function ensureDebugLabel() {
    if (debugLabel) return debugLabel;

    debugLabel = document.getElementById("debug-status");
    if (!debugLabel) {
        debugLabel = document.createElement("p");
        debugLabel.id = "debug-status";
        debugLabel.style.position = "fixed";
        debugLabel.style.top = "10px";
        debugLabel.style.left = "10px";
        debugLabel.style.padding = "6px 10px";
        debugLabel.style.borderRadius = "8px";
        debugLabel.style.background = "rgba(5, 31, 194, 0.1)";
        debugLabel.style.border = "1px solid rgba(5, 31, 194, 0.3)";
        debugLabel.style.color = "#051fc2";
        debugLabel.style.fontFamily = "Inter, sans-serif";
        debugLabel.style.fontSize = "12px";
        debugLabel.style.zIndex = "2000";
        debugLabel.style.pointerEvents = "none";
        document.body.appendChild(debugLabel);
    }

    return debugLabel;
}

function setDebugStatus(message) {
    if (lastDebugMessage === message) return;
    lastDebugMessage = message;
    ensureDebugLabel().textContent = `Debug: ${message}`;
    console.log(`[debug] ${message}`);
}

// Set drawing size for the overlay canvas.
canvas.width = WEBCAM_WIDTH;
canvas.height = WEBCAM_HEIGHT;

// Game state flags (some are placeholders for your next gameplay steps).
let handPosition = false; // stores hand position later (currently placeholder)
let isHandDetected = false; // quick boolean flag (currently placeholder)
let isCakelit = false; // true after candles are lit
let isCandlesBlownOut = false; // true after player blows candles out

function initHands() {
    if (typeof Hands === "undefined") {
        setDebugStatus("MediaPipe Hands failed to load");
        return false;
    }

    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: isMobile ? 0 : 1,
        minDetectionConfidence: isMobile ? 0.6 : 0.7,
        minTrackingConfidence: isMobile ? 0.4 : 0.5
    });

    hands.onResults((results) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            isHandDetected = true;
            setDebugStatus("camera active, hand detected");

            //get index fingertip
            const indexTip = landmarks[8];
            handPosition = {
                x: 1 - indexTip.x,
                y: indexTip.y
            };

            updateMatchPosition();
            checkCandleLight();
        } else {
            isHandDetected = false;
        }
    });

    return true;
}

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

function placeMatchAtStart() {
    if (!match || !cakeArea) return;
    const cakeRect = cakeArea.getBoundingClientRect();
    const matchWidth = match.getBoundingClientRect().width || 40;
    const startX = cakeRect.width / 2 - matchWidth / 2;
    const startY = cakeRect.height * 0.7;
    match.style.left = `${startX}px`;
    match.style.top = `${startY}px`;
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
    showRetryButton();
}

function blowOutCandles() {
    if (!cakeImg) return;
    if (!isCakelit || isCandlesBlownOut) return;

    isCandlesBlownOut = true;
    cakeImg.src = "assets/cake_unlit.gif";
    showRetryButton();
    setDebugStatus("candles blown out - tap Retry");
}

function resetGame() {
    if (!cakeImg || !match) return;
    isCakelit = false;
    isCandlesBlownOut = false;
    isHandDetected = false;
    cakeImg.src = "assets/cake_unlit.gif";
    match.style.display = "block";
    placeMatchAtStart();
    hideRetryButton();
    setDebugStatus("game reset - light the cake again");
}

//Blow Detection
let audioContext = null;
let analyser = null;
let microphone = null;
let isBlowDetectionActive = false;

async function initBlowDetection() {
    try {
        setDebugStatus("requesting microphone permission");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        microphone.connect(analyser);

        isBlowDetectionActive = true;
        setDebugStatus("microphone active");
        detectBlow();
    } catch (error) {
        setDebugStatus(`microphone error: ${error.name || "unknown"}`);
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
        setDebugStatus("requesting camera permission");
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: WEBCAM_WIDTH,
                height: WEBCAM_HEIGHT,
                facingMode: "user"
            },
         });

         video.muted = true;
         video.srcObject = stream;
         setDebugStatus("camera stream received");

         video.onloadedmetadata = async () => {
            setDebugStatus("camera metadata loaded");
            try {
                await video.play();
                setDebugStatus("camera playing");
                startHandTracking();
            } catch (error) {
                setDebugStatus(`video play failed: ${error.name || "unknown"}`);
                console.error("Video play failed:", error);
            }
         };
    } catch (error) {
        setDebugStatus(`camera error: ${error.name || "unknown"}`);
        console.error("Error accessing webcam:", error);
        alert("Could not access webcam. Please check your camera permissions.");
    }
}

//Hand Tracking
function startHandTracking() {
    if (!hands) {
        setDebugStatus("cannot start tracking: Hands not initialized");
        return;
    }
    if (typeof Camera === "undefined") {
        setDebugStatus("MediaPipe Camera utils failed to load");
        return;
    }
    setDebugStatus("starting hand tracking");
    const camera = new Camera(video, {
        onFrame: async () => {
            try {
                await hands.send({ image: video });
            } catch (error) {
                setDebugStatus(`hand tracking error: ${error.name || "unknown"}`);
                console.error("Hand tracking frame failed:", error);
            }
        },
        width: WEBCAM_WIDTH,
        height: WEBCAM_HEIGHT
    });

    camera.start();
    setDebugStatus("hand tracking loop running");
}

window.addEventListener("DOMContentLoaded", async () => {
    ensureDebugLabel();
    setDebugStatus("page loaded");
    if (!video || !canvas || !ctx || !match || !cakeArea || !cakeImg) {
        setDebugStatus("missing required DOM elements");
        return;
    }
    if (!window.isSecureContext) {
        setDebugStatus("insecure context: use http://localhost");
    }
    const handsReady = initHands();
    if (!handsReady) return;
    placeMatchAtStart();
    hideRetryButton();
    if (retryButton) {
        retryButton.addEventListener("click", handleRetryPress);
        retryButton.addEventListener("touchend", handleRetryPress, { passive: false });
    }
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

window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r" && isCandlesBlownOut) {
        resetGame();
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