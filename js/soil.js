// Soil Moisture Simulation - mimics real sensor behavior
let soilMoisture = 65; // Start at 65%
let moistureHistory = [];
let lastWateredTime = null;
let soilInterval = null;

function initSoil() {
  // Pre-fill 24 hours of history (one reading per 10 min = 144 points)
  const now = Date.now();
  for (let i = 143; i >= 0; i--) {
    const t = now - i * 10 * 60 * 1000;
    const val = 50 + Math.sin(i * 0.05) * 15 + (Math.random() - 0.5) * 5;
    moistureHistory.push({ time: t, value: Math.max(5, Math.min(95, val)) });
  }
  soilMoisture = moistureHistory[moistureHistory.length - 1].value;
}

let hardwareIp = localStorage.getItem('nodemcu_ip') || '';
let isConnectedToHardware = false;

// Simulate natural soil drying + random fluctuation
async function updateSoilMoisture() {
  if (hardwareIp && isConnectedToHardware) {
    try {
      const response = await fetch(`http://${hardwareIp}/api/data`);
      if (response.ok) {
        const data = await response.json();
        soilMoisture = data.soil;
        // Also update weather if we want, or just let weather.js do its thing
        document.getElementById('system-status').textContent = 'Connected to Hardware';
        document.getElementById('status-dot').style.background = '#00e676';
      }
    } catch (e) {
      console.log('Failed to fetch from hardware:', e);
      document.getElementById('system-status').textContent = 'Hardware Disconnected';
      document.getElementById('status-dot').style.background = '#ff5252';
    }
  } else {
    // Simulated behavior
    const dryRate = (typeof weatherData !== 'undefined' && weatherData.isHot) ? 0.4 : 0.15;
    soilMoisture -= dryRate + (Math.random() - 0.3) * 0.3;

    if (typeof weatherData !== 'undefined' && weatherData.isRainy) {
      soilMoisture += 0.5 + Math.random() * 0.3;
    }
    document.getElementById('system-status').textContent = 'Simulated Mode';
    document.getElementById('status-dot').style.background = '#ffd54f';
  }

  soilMoisture = Math.max(2, Math.min(98, soilMoisture));

  // Add to history
  moistureHistory.push({ time: Date.now(), value: soilMoisture });
  if (moistureHistory.length > 288) moistureHistory.shift(); // Keep 48h max

  updateSoilUI();
  return soilMoisture;
}

async function waterPlant() {
  if (hardwareIp && isConnectedToHardware) {
    try {
      await fetch(`http://${hardwareIp}/api/water`, { method: 'POST' });
      console.log('Sent water command to hardware');
    } catch (e) {
      console.log('Failed to send water command', e);
    }
  } else {
    // Simulated watering
    soilMoisture = Math.min(95, soilMoisture + 25 + Math.random() * 10);
  }
  
  lastWateredTime = Date.now();
  moistureHistory.push({ time: Date.now(), value: soilMoisture });
  updateSoilUI();
}

function updateSoilUI() {
  const pct = Math.round(soilMoisture);
  const gaugeText = document.getElementById('gauge-text');
  const gaugeFill = document.getElementById('gauge-fill');
  const soilMsg = document.getElementById('soil-message');
  const lastW = document.getElementById('last-watered');
  const soilStatus = document.getElementById('soil-status');

  if (gaugeText) gaugeText.textContent = pct + '%';

  // Gauge arc: 270 degrees used out of 360. Circumference = 2*PI*80 ≈ 502
  // 270deg portion = 502 * 0.75 = 376.5
  if (gaugeFill) {
    const arc = 376.5;
    const offset = arc - (arc * pct / 100);
    gaugeFill.style.strokeDasharray = `${arc} ${502 - arc}`;
    gaugeFill.style.strokeDashoffset = offset;

    // Color based on level
    if (pct < 25) gaugeFill.style.stroke = '#ff5252';
    else if (pct < 50) gaugeFill.style.stroke = '#ffd54f';
    else gaugeFill.style.stroke = '#00e676';
  }

  // Status message
  if (soilMsg) {
    if (pct < 20) soilMsg.textContent = '🚨 CRITICALLY DRY!';
    else if (pct < 35) soilMsg.textContent = '😰 Thirsty - needs water';
    else if (pct < 55) soilMsg.textContent = '😐 Moderate - monitor';
    else if (pct < 80) soilMsg.textContent = '😊 Happy plant!';
    else soilMsg.textContent = '💧 Very wet - well hydrated';
  }

  if (soilStatus) soilStatus.textContent = pct < 35 ? 'DRY' : pct < 70 ? 'OK' : 'WET';

  if (lastW && lastWateredTime) {
    const mins = Math.floor((Date.now() - lastWateredTime) / 60000);
    if (mins < 1) lastW.textContent = 'Just now';
    else if (mins < 60) lastW.textContent = mins + ' min ago';
    else lastW.textContent = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm ago';
  }
}

function startSoilUpdates() {
  initSoil();
  updateSoilUI();
  
  const ipInput = document.getElementById('hardware-ip');
  const connectBtn = document.getElementById('connect-btn');
  
  if (ipInput && hardwareIp) {
    ipInput.value = hardwareIp;
    isConnectedToHardware = true;
  }
  
  if (connectBtn && ipInput) {
    connectBtn.addEventListener('click', () => {
      hardwareIp = ipInput.value.trim();
      localStorage.setItem('nodemcu_ip', hardwareIp);
      isConnectedToHardware = !!hardwareIp;
      if (isConnectedToHardware) {
        document.getElementById('system-status').textContent = 'Connecting...';
      } else {
        document.getElementById('system-status').textContent = 'Simulated Mode';
        document.getElementById('status-dot').style.background = '#ffd54f';
      }
      updateSoilMoisture();
    });
  }

  soilInterval = setInterval(() => {
    updateSoilMoisture();
  }, 5000); // Update every 5 seconds
}
