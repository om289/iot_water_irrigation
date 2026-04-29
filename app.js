// SmartPlant - Main App Entry Point
// Ties all modules together

document.addEventListener('DOMContentLoaded', () => {
  // --- Tab Navigation ---
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });

  // --- Pump Button ---
  const pumpBtn = document.getElementById('pump-btn');
  if (pumpBtn) {
    pumpBtn.addEventListener('click', () => {
      if (!pumpActive) triggerPump('Manual');
    });
  }

  // --- Auto Toggle ---
  const autoToggle = document.getElementById('auto-toggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', async (e) => {
      autoWateringEnabled = e.target.checked;
      if (hardwareIp && isConnectedToHardware) {
        try {
          await fetch(`http://${hardwareIp}/api/auto?state=${autoWateringEnabled}`, { method: 'POST' });
          console.log('Hardware auto-mode set to:', autoWateringEnabled);
        } catch (err) {
          console.error('Failed to update hardware auto-mode:', err);
        }
      }
    });
  }

  // --- Custom Messages ---
  const msgInput = document.getElementById('custom-message');
  const sendBtn = document.getElementById('send-message');
  if (sendBtn && msgInput) {
    const send = async () => {
      const text = msgInput.value.trim();
      if (text) {
        addCustomMessage(text);
        if (typeof hardwareIp !== 'undefined' && hardwareIp) {
          try {
            await fetch(`http://${hardwareIp}/api/message?text=${encodeURIComponent(text)}`, { method: 'POST' });
            console.log('Sent custom message to hardware');
          } catch (e) {
            console.error('Failed to send message:', e);
          }
        }
        msgInput.value = '';
      }
    };
    sendBtn.addEventListener('click', send);
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  }

  // --- Populate Build Guide Code Blocks ---
  populateCodeBlocks();

  // --- Initialize All Systems ---
  initLEDMatrix();
  startScrolling();
  startWeatherUpdates();
  startSoilUpdates();
  startLogicEngine();
  startChartUpdates();

  console.log('🌱 SmartPlant System initialized!');
});

// Fill the build guide with Arduino code snippets
function populateCodeBlocks() {
  const nodemcuEl = document.getElementById('nodemcu-code');
  const arduinoEl = document.getElementById('arduino-code');

  if (nodemcuEl) {
    nodemcuEl.textContent = `// NodeMCU ESP8266 - Weather + LED Matrix Controller
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <MD_Parola.h>
#include <MD_MAX72xx.h>
#include <SoftwareSerial.h>

#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES 4
#define CLK_PIN   D5  // GPIO14
#define DATA_PIN  D7  // GPIO13
#define CS_PIN    D8  // GPIO15

MD_Parola display = MD_Parola(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);
SoftwareSerial arduinoSerial(D1, D6); // RX=D1, TX=D6

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Open-Meteo API (free, no key needed!)
const String weatherURL = "http://api.open-meteo.com/v1/forecast"
  "?latitude=17.385&longitude=78.4867"
  "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code"
  "&daily=precipitation_sum,uv_index_max"
  "&timezone=auto&forecast_days=2";

float temperature = 0, humidity = 0, rain = 0, uvIndex = 0;
float rainForecast = 0;
int weatherCode = 0;
int soilMoisture = 50;
bool shouldWater = false;

String messages[6];
int msgCount = 0, currentMsg = 0;
unsigned long lastWeather = 0, lastSerial = 0;

void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);
  
  display.begin();
  display.setIntensity(5);
  display.displayClear();
  display.displayScroll("SMARTPLANT STARTING...", PA_CENTER, PA_SCROLL_LEFT, 50);
  
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println(" Connected! IP: " + WiFi.localIP().toString());
  
  fetchWeather();
}

void loop() {
  // Scroll display
  if (display.displayAnimate()) {
    currentMsg = (currentMsg + 1) % msgCount;
    display.displayScroll(messages[currentMsg].c_str(), PA_CENTER, PA_SCROLL_LEFT, 40);
  }
  
  // Fetch weather every 30 minutes
  if (millis() - lastWeather > 1800000 || lastWeather == 0) {
    fetchWeather();
    lastWeather = millis();
  }
  
  // Read soil data from Arduino every 5 seconds
  if (millis() - lastSerial > 5000) {
    readArduinoData();
    makeDecision();
    sendCommandToArduino();
    lastSerial = millis();
  }
}

void fetchWeather() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  http.begin(client, weatherURL);
  int code = http.GET();
  
  if (code == 200) {
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, http.getString());
    temperature = doc["current"]["temperature_2m"];
    humidity = doc["current"]["relative_humidity_2m"];
    rain = doc["current"]["precipitation"];
    weatherCode = doc["current"]["weather_code"];
    uvIndex = doc["daily"]["uv_index_max"][0];
    rainForecast = doc["daily"]["precipitation_sum"][1];
    Serial.println("Weather updated: " + String(temperature) + "C");
  }
  http.end();
  updateMessages();
}

void readArduinoData() {
  arduinoSerial.println("READ");
  delay(100);
  if (arduinoSerial.available()) {
    String data = arduinoSerial.readStringUntil('\\n');
    soilMoisture = data.toInt();
    Serial.println("Soil: " + String(soilMoisture) + "%");
  }
}

void makeDecision() {
  shouldWater = false;
  if (rain > 0 && soilMoisture > 20) shouldWater = false;
  else if (rainForecast > 1 && soilMoisture > 30) shouldWater = false;
  else if (soilMoisture < 20) shouldWater = true;
  else if (soilMoisture < 35 && temperature > 35) shouldWater = true;
  else if (soilMoisture < 35) shouldWater = true;
  updateMessages();
}

void sendCommandToArduino() {
  arduinoSerial.println(shouldWater ? "WATER" : "STOP");
}

void updateMessages() {
  msgCount = 0;
  messages[msgCount++] = "TEMP:" + String((int)temperature) + "C HUM:" + String((int)humidity) + "%";
  messages[msgCount++] = "SOIL:" + String(soilMoisture) + "% " + 
    (soilMoisture < 30 ? "THIRSTY!" : "HAPPY");
  if (rain > 0) messages[msgCount++] = "RAIN TODAY - SKIP WATER";
  if (shouldWater) messages[msgCount++] = "WATERING PLANT NOW";
  else messages[msgCount++] = "ALL GOOD - NO WATER NEEDED";
  messages[msgCount++] = "UV:" + String((int)uvIndex) + " WIND OK";
}`;
  }

  if (arduinoEl) {
    arduinoEl.textContent = `// Arduino Uno - Soil Sensor + Pump Controller
#include <SoftwareSerial.h>

SoftwareSerial nodeSerial(2, 3); // RX=D2, TX=D3

#define SOIL_PIN      A0
#define RELAY_PIN     4
#define DRY_THRESHOLD  700  // Adjust after calibration
#define WET_THRESHOLD  350  // Adjust after calibration

int soilRaw = 0;
int soilPercent = 0;
bool pumpRunning = false;
unsigned long pumpStart = 0;
const unsigned long MAX_PUMP_TIME = 7000; // 7 sec max

void setup() {
  Serial.begin(9600);
  nodeSerial.begin(9600);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF (active LOW)
  Serial.println("Arduino Soil+Pump Ready");
}

void loop() {
  // Read soil sensor
  soilRaw = analogRead(SOIL_PIN);
  soilPercent = map(soilRaw, DRY_THRESHOLD, WET_THRESHOLD, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);
  
  // Check for commands from NodeMCU
  if (nodeSerial.available()) {
    String cmd = nodeSerial.readStringUntil('\\n');
    cmd.trim();
    
    if (cmd == "READ") {
      nodeSerial.println(String(soilPercent));
      Serial.println("Sent soil: " + String(soilPercent) + "%");
    }
    else if (cmd == "WATER" && !pumpRunning) {
      startPump();
    }
    else if (cmd == "STOP" && pumpRunning) {
      stopPump();
    }
  }
  
  // Safety: auto-stop pump after MAX_PUMP_TIME
  if (pumpRunning && (millis() - pumpStart > MAX_PUMP_TIME)) {
    stopPump();
    Serial.println("Pump auto-stopped (timeout)");
  }
  
  // Print readings every 2 seconds
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 2000) {
    Serial.print("Raw: "); Serial.print(soilRaw);
    Serial.print(" | Moisture: "); Serial.print(soilPercent);
    Serial.print("% | Pump: "); Serial.println(pumpRunning ? "ON" : "OFF");
    lastPrint = millis();
  }
  
  delay(100);
}

void startPump() {
  digitalWrite(RELAY_PIN, LOW); // Relay ON
  pumpRunning = true;
  pumpStart = millis();
  Serial.println(">>> PUMP ON");
}

void stopPump() {
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF
  pumpRunning = false;
  Serial.println(">>> PUMP OFF");
}`;
  }
}
