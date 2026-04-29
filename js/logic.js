// Smart Logic Engine - cross-references weather + soil to make decisions
let currentDecision = null;
let autoWateringEnabled = true;
let pumpActive = false;
let pumpHistory = [];

function evaluateLogic() {
  const soil = Math.round(soilMoisture);
  const w = weatherData;
  let weatherStatus = 'Unknown';
  let soilStatus = 'Unknown';
  let decision = 'WAIT';
  let message = 'Gathering data...';
  let shouldWater = false;

  // Evaluate weather condition
  if (w) {
    if (w.isRainy) weatherStatus = 'Rainy';
    else if (w.isRainForecast) weatherStatus = 'Rain Soon';
    else if (w.isHot) weatherStatus = 'Hot';
    else if (w.isCold) weatherStatus = 'Cold';
    else weatherStatus = 'Good';
  }

  // Evaluate soil condition
  if (soil < 20) soilStatus = 'Critical';
  else if (soil < 35) soilStatus = 'Dry';
  else if (soil < 55) soilStatus = 'Moderate';
  else if (soil < 80) soilStatus = 'Good';
  else soilStatus = 'Wet';

  // Cross-reference decision logic
  if (w && w.isRainy && soil > 20) {
    decision = 'SKIP'; message = '🌧️ RAIN TODAY - NO WATERING NEEDED';
  } else if (w && w.isRainForecast && soil > 30) {
    decision = 'SKIP'; message = '🌦️ RAIN COMING SOON - SKIP WATERING';
  } else if (soil < 20) {
    decision = 'WATER NOW'; message = '🚨 SOIL CRITICALLY DRY - WATERING!';
    shouldWater = true;
  } else if (soil < 35 && w && w.isHot) {
    decision = 'WATER'; message = '🔥 HOT DAY + DRY SOIL - EXTRA WATER';
    shouldWater = true;
  } else if (soil < 35) {
    decision = 'WATER'; message = '💧 SOIL DRY - TIME TO WATER';
    shouldWater = true;
  } else if (w && w.isHot && soil < 50) {
    decision = 'WATER SOON'; message = '☀️ HOT DAY - MONITOR CLOSELY';
  } else if (soil >= 55) {
    decision = 'ALL GOOD'; message = '✅ ALL GOOD - PLANT IS HAPPY!';
  } else {
    decision = 'MONITOR'; message = '👀 MODERATE - KEEP WATCHING';
  }

  currentDecision = { weatherStatus, soilStatus, decision, message, shouldWater };

  // Auto water if needed
  if (shouldWater && autoWateringEnabled && !pumpActive) {
    triggerPump('Auto');
  }

  updateLogicUI();
  updateMoodUI();
  updateLEDMessages(w, soil, message);
  return currentDecision;
}

function updateLogicUI() {
  if (!currentDecision) return;
  const d = currentDecision;

  const el = (id) => document.getElementById(id);
  el('logic-weather').textContent = d.weatherStatus;
  el('logic-soil').textContent = d.soilStatus;
  el('logic-decision').textContent = d.decision;
  el('decision-message').textContent = d.message;

  const badge = el('decision-badge');
  badge.textContent = d.decision;
  badge.style.background = d.shouldWater ? 'var(--red-dim)' : 'var(--green-dim)';
  badge.style.color = d.shouldWater ? 'var(--red-primary)' : 'var(--green-primary)';
}

function updateMoodUI() {
  const emoji = document.getElementById('mood-emoji');
  const text = document.getElementById('mood-text');
  const sub = document.getElementById('mood-subtitle');
  if (!currentDecision || !emoji) return;

  const soil = Math.round(soilMoisture);
  if (soil < 20) {
    emoji.textContent = '🥀'; text.textContent = 'Wilting!';
    sub.textContent = 'Critically dry - needs water urgently';
  } else if (soil < 35) {
    emoji.textContent = '😟'; text.textContent = 'Thirsty Plant';
    sub.textContent = 'Soil is getting dry';
  } else if (soil < 55) {
    emoji.textContent = '🌿'; text.textContent = 'Doing OK';
    sub.textContent = 'Moderate moisture - monitoring';
  } else if (soil < 80) {
    emoji.textContent = '🌱'; text.textContent = 'Happy Plant!';
    sub.textContent = 'Everything is perfect';
  } else {
    emoji.textContent = '💦'; text.textContent = 'Very Hydrated';
    sub.textContent = 'Plenty of water available';
  }

  if (weatherData && weatherData.isRainy) {
    sub.textContent += ' • Rain detected';
  }
}

function triggerPump(source) {
  if (pumpActive) return;
  pumpActive = true;
  waterPlant();

  const entry = {
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    source: source,
    duration: (3 + Math.random() * 4).toFixed(1) + 's'
  };
  pumpHistory.unshift(entry);
  if (pumpHistory.length > 10) pumpHistory.pop();

  updatePumpUI(true);

  // Pump runs for 3-7 seconds
  const dur = parseFloat(entry.duration) * 1000;
  setTimeout(() => {
    pumpActive = false;
    updatePumpUI(false);
  }, dur);
}

function updatePumpUI(isRunning) {
  const btn = document.getElementById('pump-btn');
  const btnText = document.getElementById('pump-btn-text');
  const badge = document.getElementById('pump-status-badge');
  const list = document.getElementById('history-list');

  if (btn) btn.classList.toggle('pumping', isRunning);
  if (btnText) btnText.textContent = isRunning ? 'Pumping...' : 'Water Now';
  if (badge) {
    badge.textContent = isRunning ? 'RUNNING' : 'OFF';
    badge.style.background = isRunning ? 'var(--blue-dim)' : '';
    badge.style.color = isRunning ? 'var(--blue-primary)' : '';
  }

  if (list && pumpHistory.length > 0) {
    list.innerHTML = pumpHistory.map(h =>
      `<div class="history-item"><span class="time">${h.time}</span><span class="action">${h.source} • ${h.duration}</span></div>`
    ).join('');
  }
}

// Run logic evaluation every 5 seconds
function startLogicEngine() {
  setInterval(evaluateLogic, 5000);
  setTimeout(evaluateLogic, 2000); // First eval after 2s
}
