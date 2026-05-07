// ============================================
// SmartPlant - Security Stress Test Module
// Tests YOUR OWN NodeMCU's DDoS protection
// ============================================

let stressTestRunning = false;
let stressTestAbort = null;
let stressStats = { sent: 0, success: 0, blocked: 0, errors: 0, startTime: 0 };

function initSecurityPanel() {
  const startBtn = document.getElementById('stress-start');
  const stopBtn = document.getElementById('stress-stop');
  if (!startBtn || !stopBtn) return;

  startBtn.addEventListener('click', startStressTest);
  stopBtn.addEventListener('click', stopStressTest);
}

async function startStressTest() {
  const ip = document.getElementById('hardware-ip')?.value?.trim();
  if (!ip) {
    updateStressLog('⚠️ Enter your NodeMCU IP address in the top bar first!', 'warning');
    return;
  }

  const rpsInput = document.getElementById('stress-rps');
  const durationInput = document.getElementById('stress-duration');
  const rps = parseInt(rpsInput?.value) || 50;
  const duration = parseInt(durationInput?.value) || 10;

  stressTestRunning = true;
  stressStats = { sent: 0, success: 0, blocked: 0, errors: 0, startTime: Date.now() };

  document.getElementById('stress-start').disabled = true;
  document.getElementById('stress-stop').disabled = false;
  document.getElementById('stress-start').textContent = '⏳ Running...';

  updateStressUI();
  clearStressLog();
  updateStressLog(`🚀 Starting stress test: ${rps} req/s for ${duration}s against ${ip}`, 'info');
  updateStressLog(`📡 Target: http://${ip}/api/data`, 'info');
  updateStressLog('─'.repeat(50), 'divider');

  const interval = 1000 / rps; // ms between requests
  const endTime = Date.now() + (duration * 1000);
  const controller = new AbortController();
  stressTestAbort = controller;

  const fireRequest = async () => {
    if (!stressTestRunning || Date.now() > endTime) return;

    stressStats.sent++;
    try {
      const res = await fetch(`http://${ip}/api/data`, {
        signal: controller.signal,
        mode: 'cors',
      });

      if (res.status === 200) {
        stressStats.success++;
      } else if (res.status === 429) {
        stressStats.blocked++;
        if (stressStats.blocked === 1) {
          updateStressLog('🛡️ Rate limiter activated! Server returning 429 Too Many Requests', 'success');
        }
      } else if (res.status === 403) {
        stressStats.blocked++;
        if (stressStats.blocked <= 3) {
          updateStressLog(`🚫 IP blocked by server! Status: ${res.status}`, 'success');
        }
      } else {
        stressStats.errors++;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      stressStats.errors++;
      // Connection refused / timeout = server protecting itself
      if (stressStats.errors === 1) {
        updateStressLog('⚡ Connection dropped — server may be rejecting flood', 'warning');
      }
    }
    updateStressUI();
  };

  // Fire requests at the target rate
  const batchSize = Math.max(1, Math.floor(rps / 10));

  const runBatch = async () => {
    if (!stressTestRunning || Date.now() > endTime) {
      finishStressTest();
      return;
    }

    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(fireRequest());
    }
    await Promise.all(promises);

    if (stressTestRunning && Date.now() <= endTime) {
      setTimeout(runBatch, 100);
    } else {
      finishStressTest();
    }
  };

  runBatch();

  // Progress bar animation
  animateProgress(duration);
}

function stopStressTest() {
  stressTestRunning = false;
  if (stressTestAbort) {
    stressTestAbort.abort();
    stressTestAbort = null;
  }
  finishStressTest();
}

function finishStressTest() {
  stressTestRunning = false;
  document.getElementById('stress-start').disabled = false;
  document.getElementById('stress-stop').disabled = true;
  document.getElementById('stress-start').textContent = '⚡ Launch Attack';

  const elapsed = ((Date.now() - stressStats.startTime) / 1000).toFixed(1);
  const actualRps = (stressStats.sent / Math.max(elapsed, 0.1)).toFixed(1);

  updateStressLog('─'.repeat(50), 'divider');
  updateStressLog(`✅ Test complete in ${elapsed}s`, 'info');
  updateStressLog(`📊 Total sent: ${stressStats.sent} | Actual rate: ${actualRps} req/s`, 'info');

  if (stressStats.blocked > 0) {
    updateStressLog(`🛡️ PROTECTED: ${stressStats.blocked} requests were blocked by rate limiter!`, 'success');
    updateVerdict('protected');
  } else if (stressStats.errors > stressStats.sent * 0.5) {
    updateStressLog(`⚡ Server dropped connections under heavy load (defense mechanism)`, 'warning');
    updateVerdict('partial');
  } else {
    updateStressLog(`⚠️ All requests passed — consider enabling rate limiting on firmware`, 'warning');
    updateVerdict('vulnerable');
  }

  updateStressUI();
}

function updateStressUI() {
  const el = (id) => document.getElementById(id);

  el('stat-sent').textContent = stressStats.sent;
  el('stat-success').textContent = stressStats.success;
  el('stat-blocked').textContent = stressStats.blocked;
  el('stat-errors').textContent = stressStats.errors;

  // Update the live bar chart
  const total = Math.max(stressStats.sent, 1);
  const successPct = (stressStats.success / total * 100).toFixed(0);
  const blockedPct = (stressStats.blocked / total * 100).toFixed(0);
  const errorPct = (stressStats.errors / total * 100).toFixed(0);

  el('bar-success').style.width = successPct + '%';
  el('bar-blocked').style.width = blockedPct + '%';
  el('bar-errors').style.width = errorPct + '%';
}

function updateStressLog(message, type = 'info') {
  const log = document.getElementById('stress-log');
  if (!log) return;

  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = message;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function clearStressLog() {
  const log = document.getElementById('stress-log');
  if (log) log.innerHTML = '';
}

function updateVerdict(status) {
  const verdict = document.getElementById('stress-verdict');
  if (!verdict) return;

  if (status === 'protected') {
    verdict.className = 'verdict verdict-protected';
    verdict.innerHTML = '🛡️ <strong>PROTECTED</strong> — Rate limiting is active. DDoS requests were blocked.';
  } else if (status === 'partial') {
    verdict.className = 'verdict verdict-partial';
    verdict.innerHTML = '⚡ <strong>PARTIALLY PROTECTED</strong> — Server dropped flood connections.';
  } else {
    verdict.className = 'verdict verdict-vulnerable';
    verdict.innerHTML = '⚠️ <strong>VULNERABLE</strong> — No rate limiting detected. Flash the secured firmware!';
  }

  verdict.style.display = 'block';
}

function animateProgress(duration) {
  const bar = document.getElementById('stress-progress');
  if (!bar) return;

  bar.style.transition = 'none';
  bar.style.width = '0%';

  requestAnimationFrame(() => {
    bar.style.transition = `width ${duration}s linear`;
    bar.style.width = '100%';
  });
}
