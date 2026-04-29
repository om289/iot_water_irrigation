// LED Matrix Display Engine - OPTIMIZED for performance
const LED_COLS = 64;
const LED_ROWS = 8;

let ledCanvas = null;
let ledCtx = null;
let displayBuffer = [];
let scrollOffset = 0;
let currentColumns = [];
let messageQueue = [];
let currentMsgIndex = 0;
let lastScrollTime = 0;
const SCROLL_INTERVAL = 60; // ms between scroll steps

// Initialize LED matrix as a CANVAS (not 512 divs)
function initLEDMatrix() {
  const container = document.getElementById('led-matrix');
  if (!container) return;
  container.innerHTML = '';
  displayBuffer = new Array(LED_COLS).fill(0);

  ledCanvas = document.createElement('canvas');
  ledCanvas.width = LED_COLS * 9; // 7px dot + 2px gap
  ledCanvas.height = LED_ROWS * 9;
  ledCanvas.style.width = '100%';
  ledCanvas.style.height = '100%';
  ledCanvas.style.imageRendering = 'pixelated';
  container.appendChild(ledCanvas);
  ledCtx = ledCanvas.getContext('2d');
}

// Render display buffer to canvas (much faster than DOM)
function renderLED() {
  if (!ledCtx) return;
  const dotSize = 7;
  const gap = 9;

  ledCtx.fillStyle = '#0a120e';
  ledCtx.fillRect(0, 0, ledCanvas.width, ledCanvas.height);

  ledCtx.fillStyle = '#00ff80';
  ledCtx.shadowColor = '#00ff80';
  ledCtx.shadowBlur = 3;

  for (let col = 0; col < LED_COLS; col++) {
    for (let row = 0; row < LED_ROWS; row++) {
      const isOn = (displayBuffer[col] >> row) & 1;
      if (isOn) {
        const x = col * gap + 1;
        const y = row * gap + 1;
        ledCtx.beginPath();
        ledCtx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
        ledCtx.fill();
      }
    }
  }
  ledCtx.shadowBlur = 0;
}

function setDefaultMessages() {
  messageQueue = ['SMARTPLANT - WEATHER AWARE IRRIGATION', 'LOADING DATA...'];
}

function updateLEDMessages(weather, soil, decision) {
  const msgs = [];
  if (weather) {
    msgs.push('TEMP: ' + weather.temp + 'C  HUMIDITY: ' + weather.humidity + '%');
    if (weather.rain > 0) msgs.push('RAIN TODAY - SKIP WATERING!');
    msgs.push('UV INDEX: ' + weather.uv + '  ' + weather.description);
    msgs.push('TOMORROW: ' + weather.forecastDesc);
  }
  if (soil !== null && soil !== undefined) {
    if (soil < 30) msgs.push('SOIL: THIRSTY! NEEDS WATER');
    else if (soil < 60) msgs.push('SOIL: MODERATE - MONITORING');
    else msgs.push('SOIL: HAPPY PLANT!');
    msgs.push('MOISTURE: ' + Math.round(soil) + '%');
  }
  if (decision) msgs.push(decision);

  const now = new Date();
  msgs.push(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' ' + now.toLocaleDateString());

  const custom = messageQueue.filter(m => m._custom);
  messageQueue = msgs.map(m => ({ text: m, _custom: false }));
  messageQueue.push(...custom);
  currentMsgIndex = 0;
}

function addCustomMessage(text) {
  messageQueue.push({ text: text.toUpperCase(), _custom: true });
  updateQueueDisplay();
}

function removeCustomMessage(index) {
  const customs = messageQueue.filter(m => m._custom);
  if (customs[index]) {
    const realIdx = messageQueue.indexOf(customs[index]);
    if (realIdx > -1) messageQueue.splice(realIdx, 1);
  }
  updateQueueDisplay();
}

function updateQueueDisplay() {
  const list = document.getElementById('queue-list');
  if (!list) return;
  const customs = messageQueue.filter(m => m._custom);
  if (customs.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No custom messages</p>';
    return;
  }
  list.innerHTML = customs.map((m, i) =>
    '<div class="queue-item"><span>' + m.text + '</span><button class="remove-msg" onclick="removeCustomMessage(' + i + ')">✕</button></div>'
  ).join('');
}

function startScrolling() {
  setDefaultMessages();
  loadNextMessage();
  requestAnimationFrame(scrollLoop);
}

function loadNextMessage() {
  if (messageQueue.length === 0) return;
  const msg = messageQueue[currentMsgIndex % messageQueue.length];
  currentColumns = textToColumns('   ' + (msg.text || msg.toString()) + '   ');
  scrollOffset = 0;
  currentMsgIndex++;
}

function scrollLoop(timestamp) {
  if (timestamp - lastScrollTime >= SCROLL_INTERVAL) {
    lastScrollTime = timestamp;
    // Shift buffer left
    for (let i = 0; i < LED_COLS - 1; i++) {
      displayBuffer[i] = displayBuffer[i + 1];
    }
    if (scrollOffset < currentColumns.length) {
      displayBuffer[LED_COLS - 1] = currentColumns[scrollOffset];
      scrollOffset++;
    } else {
      displayBuffer[LED_COLS - 1] = 0;
      scrollOffset++;
      if (scrollOffset > currentColumns.length + LED_COLS) {
        loadNextMessage();
      }
    }
    renderLED();
  }
  requestAnimationFrame(scrollLoop);
}
