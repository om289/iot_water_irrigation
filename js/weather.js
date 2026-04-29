// Weather API - uses Open-Meteo (completely free, no API key)
let weatherData = null;
const WEATHER_CODES = {
  0: ['Clear Sky', '☀️'], 1: ['Mainly Clear', '🌤️'],
  2: ['Partly Cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Foggy', '🌫️'], 48: ['Fog', '🌫️'],
  51: ['Light Drizzle', '🌦️'], 53: ['Drizzle', '🌧️'],
  55: ['Heavy Drizzle', '🌧️'], 56: ['Freezing Drizzle', '🌨️'],
  61: ['Light Rain', '🌦️'], 63: ['Rain', '🌧️'],
  65: ['Heavy Rain', '🌧️'], 66: ['Freezing Rain', '🌨️'],
  71: ['Light Snow', '🌨️'], 73: ['Snow', '❄️'],
  75: ['Heavy Snow', '❄️'], 77: ['Snow Grains', '❄️'],
  80: ['Light Showers', '🌦️'], 81: ['Showers', '🌧️'],
  82: ['Heavy Showers', '⛈️'], 85: ['Snow Showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm+Hail', '⛈️'],
  99: ['Severe Storm', '⛈️']
};

// Default: Mumbai, India (Matches NodeMCU)
let latitude = 19.076;
let longitude = 72.8777;
let cityName = 'Mumbai';

async function fetchWeather() {
  // Geolocation is removed because running index.html locally blocks it
  // and defaults to Mumbai. We will match the NodeMCU location instead!

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max` +
    `&timezone=auto&forecast_days=2`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const c = data.current;
    const d = data.daily;

    // PATCH: Open-Meteo often predicts "Thunderstorms" (code 95) during hot pre-monsoon
    // days even when there is literally 0.00mm of rain. 
    // If it says it's raining but precipitation is 0, we force it back to Sunny!
    if (c.weather_code >= 51 && c.precipitation === 0) {
      c.weather_code = (c.temperature_2m > 28) ? 0 : 1; // 0 = Clear Sky ☀️
    }

    const codeInfo = WEATHER_CODES[c.weather_code] || ['Unknown', '❓'];
    const tmrwCode = WEATHER_CODES[d.weather_code[1]] || ['Unknown', '❓'];

    weatherData = {
      temp: Math.round(c.temperature_2m),
      humidity: c.relative_humidity_2m,
      rain: c.precipitation,
      rainForecast: d.precipitation_sum[1],
      uv: d.uv_index_max[0],
      wind: c.wind_speed_10m,
      weatherCode: c.weather_code,
      description: codeInfo[0],
      icon: codeInfo[1],
      forecastDesc: `${tmrwCode[0]} ${Math.round(d.temperature_2m_max[1])}/${Math.round(d.temperature_2m_min[1])}°C`,
      forecastIcon: tmrwCode[1],
      isRainy: c.precipitation > 0 || c.weather_code >= 51,
      isRainForecast: d.precipitation_sum[1] > 1,
      isHot: c.temperature_2m > 35,
      isCold: c.temperature_2m < 10,
    };

    updateWeatherUI();
    return weatherData;
  } catch (err) {
    console.error('Weather fetch failed:', err);
    document.getElementById('weather-location').textContent = 'Offline';
    return null;
  }
}

function updateWeatherUI() {
  if (!weatherData) return;
  const w = weatherData;
  document.getElementById('weather-location').textContent = cityName;
  document.getElementById('temp-value').textContent = w.temp;
  document.getElementById('weather-icon').textContent = w.icon;
  document.getElementById('humidity-value').textContent = w.humidity + '%';
  document.getElementById('rain-value').textContent = w.rain + ' mm';
  document.getElementById('uv-value').textContent = w.uv;
  document.getElementById('forecast-value').textContent = w.forecastDesc;
}

// Refresh weather every 30 minutes
function startWeatherUpdates() {
  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);
}
