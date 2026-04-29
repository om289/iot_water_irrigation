// Moisture Trend Chart - Canvas-based line chart
let chartCanvas = null;
let chartCtx = null;

function initChart() {
  chartCanvas = document.getElementById('trend-chart');
  if (!chartCanvas) return;
  chartCtx = chartCanvas.getContext('2d');
  resizeChart();
  window.addEventListener('resize', resizeChart);
}

function resizeChart() {
  if (!chartCanvas) return;
  const container = chartCanvas.parentElement;
  chartCanvas.width = container.clientWidth * window.devicePixelRatio;
  chartCanvas.height = container.clientHeight * window.devicePixelRatio;
  chartCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  drawChart();
}

function drawChart() {
  if (!chartCtx || moistureHistory.length < 2) return;

  const w = chartCanvas.width / window.devicePixelRatio;
  const h = chartCanvas.height / window.devicePixelRatio;
  const pad = { top: 20, right: 15, bottom: 30, left: 40 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  chartCtx.clearRect(0, 0, w, h);

  // Use last 144 points (24h at 10-min intervals)
  const data = moistureHistory.slice(-144);
  const minTime = data[0].time;
  const maxTime = data[data.length - 1].time;
  const timeRange = maxTime - minTime || 1;

  // Y axis: 0-100%
  const toX = (t) => pad.left + ((t - minTime) / timeRange) * cw;
  const toY = (v) => pad.top + ch - (v / 100) * ch;

  // Grid lines
  chartCtx.strokeStyle = 'rgba(255,255,255,0.05)';
  chartCtx.lineWidth = 1;
  for (let v = 0; v <= 100; v += 25) {
    const y = toY(v);
    chartCtx.beginPath();
    chartCtx.moveTo(pad.left, y);
    chartCtx.lineTo(w - pad.right, y);
    chartCtx.stroke();

    chartCtx.fillStyle = 'rgba(255,255,255,0.25)';
    chartCtx.font = '10px Inter, sans-serif';
    chartCtx.textAlign = 'right';
    chartCtx.fillText(v + '%', pad.left - 6, y + 3);
  }

  // Time labels
  chartCtx.fillStyle = 'rgba(255,255,255,0.25)';
  chartCtx.textAlign = 'center';
  chartCtx.font = '10px Inter, sans-serif';
  const labelCount = Math.min(6, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (data.length - 1) / (labelCount - 1));
    const d = new Date(data[idx].time);
    const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chartCtx.fillText(label, toX(data[idx].time), h - 8);
  }

  // Gradient fill under line
  const gradient = chartCtx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  gradient.addColorStop(0, 'rgba(0, 230, 118, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 230, 118, 0.0)');

  chartCtx.beginPath();
  chartCtx.moveTo(toX(data[0].time), toY(data[0].value));
  for (let i = 1; i < data.length; i++) {
    chartCtx.lineTo(toX(data[i].time), toY(data[i].value));
  }
  // Close for fill
  chartCtx.lineTo(toX(data[data.length - 1].time), h - pad.bottom);
  chartCtx.lineTo(toX(data[0].time), h - pad.bottom);
  chartCtx.closePath();
  chartCtx.fillStyle = gradient;
  chartCtx.fill();

  // Line
  chartCtx.beginPath();
  chartCtx.moveTo(toX(data[0].time), toY(data[0].value));
  for (let i = 1; i < data.length; i++) {
    chartCtx.lineTo(toX(data[i].time), toY(data[i].value));
  }
  chartCtx.strokeStyle = '#00e676';
  chartCtx.lineWidth = 2;
  chartCtx.lineJoin = 'round';
  chartCtx.stroke();

  // Current value dot
  const last = data[data.length - 1];
  chartCtx.beginPath();
  chartCtx.arc(toX(last.time), toY(last.value), 4, 0, Math.PI * 2);
  chartCtx.fillStyle = '#00e676';
  chartCtx.fill();
  chartCtx.strokeStyle = 'rgba(0,230,118,0.5)';
  chartCtx.lineWidth = 6;
  chartCtx.stroke();

  // Threshold lines
  drawThreshold(35, '#ffd54f', 'DRY', cw, ch, pad, w, toY);
  drawThreshold(70, '#40c4ff', 'WET', cw, ch, pad, w, toY);
}

function drawThreshold(value, color, label, cw, ch, pad, w, toY) {
  const y = toY(value);
  chartCtx.setLineDash([4, 4]);
  chartCtx.strokeStyle = color + '40';
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(pad.left, y);
  chartCtx.lineTo(w - pad.right, y);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  chartCtx.fillStyle = color;
  chartCtx.font = '9px Inter, sans-serif';
  chartCtx.textAlign = 'left';
  chartCtx.fillText(label, w - pad.right + 2, y + 3);
}

function startChartUpdates() {
  initChart();
  setInterval(drawChart, 5000);
}
