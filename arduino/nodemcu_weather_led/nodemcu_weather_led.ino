// ============================================
// SmartPlant - NodeMCU ESP8266 Controller
// Handles: WiFi, Weather API, LED Matrix, Serial to Arduino
// ** WITH SECURITY: Rate Limiting, IP Blacklisting, Input Validation **
// ============================================

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include <MD_Parola.h>
#include <MD_MAX72xx.h>
#include <SoftwareSerial.h>

// --- LED Matrix Config ---
#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES 4
#define CLK_PIN   D5   // GPIO14
#define DATA_PIN  D7   // GPIO13
#define CS_PIN    D8   // GPIO15

MD_Parola display = MD_Parola(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);
SoftwareSerial arduinoSerial(D1, D6); // RX=D1(GPIO5), TX=D6(GPIO12)
ESP8266WebServer server(80);

// --- WiFi Credentials (CHANGE THESE!) ---
const char* ssid = "iPhone";
const char* password = "1234567891";

// --- Weather API (Open-Meteo, free, no API key) ---
// Change latitude & longitude to your city!
const String weatherURL = "http://api.open-meteo.com/v1/forecast"
  "?latitude=19.076&longitude=72.8777"
  "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code"
  "&daily=precipitation_sum,uv_index_max"
  "&timezone=auto&forecast_days=2";

// --- State Variables ---
float temperature = 0, humidity = 0, rain = 0, uvIndex = 0;
float rainForecast = 0;
int weatherCode = 0;
int soilMoisture = 50;
bool shouldWater = false;
bool autoMode = true;
String customMessage = "";

String messages[6];
int msgCount = 0;
int currentMsg = 0;
unsigned long lastWeatherFetch = 0;
unsigned long lastSerialComm = 0;

// ============================================
// SECURITY: Rate Limiting & IP Blacklisting
// ============================================
#define MAX_CLIENTS       8      // Track up to 8 unique IPs (ESP8266 RAM is limited)
#define RATE_WINDOW       60000  // 60 seconds window
#define MAX_REQUESTS      30     // Max 30 requests per window per IP
#define BLACKLIST_AFTER   3      // Blacklist after 3 rate-limit violations
#define BLACKLIST_DURATION 300000 // 5 minutes blacklist

struct ClientTracker {
  IPAddress ip;
  unsigned long windowStart;
  int requestCount;
  int violations;
  unsigned long blacklistedUntil;
  bool active;
};

ClientTracker clients[MAX_CLIENTS];
unsigned long totalBlocked = 0;
unsigned long totalRequests = 0;

// Find or create a tracker for this IP
int getClientSlot(IPAddress ip) {
  int emptySlot = -1;
  unsigned long oldest = millis();
  int oldestSlot = 0;

  for (int i = 0; i < MAX_CLIENTS; i++) {
    if (clients[i].active && clients[i].ip == ip) return i;
    if (!clients[i].active && emptySlot == -1) emptySlot = i;
    if (clients[i].windowStart < oldest) {
      oldest = clients[i].windowStart;
      oldestSlot = i;
    }
  }

  // Use empty slot or evict oldest
  int slot = (emptySlot != -1) ? emptySlot : oldestSlot;
  clients[slot].ip = ip;
  clients[slot].windowStart = millis();
  clients[slot].requestCount = 0;
  clients[slot].violations = 0;
  clients[slot].blacklistedUntil = 0;
  clients[slot].active = true;
  return slot;
}

// Returns true if request is ALLOWED, false if BLOCKED
bool checkRateLimit(IPAddress ip) {
  totalRequests++;
  int slot = getClientSlot(ip);
  ClientTracker &c = clients[slot];

  // Check blacklist
  if (c.blacklistedUntil > 0 && millis() < c.blacklistedUntil) {
    totalBlocked++;
    return false; // BLOCKED — IP is blacklisted
  } else if (c.blacklistedUntil > 0 && millis() >= c.blacklistedUntil) {
    // Blacklist expired, reset
    c.blacklistedUntil = 0;
    c.violations = 0;
    c.requestCount = 0;
    c.windowStart = millis();
  }

  // Reset window if expired
  if (millis() - c.windowStart > RATE_WINDOW) {
    c.requestCount = 0;
    c.windowStart = millis();
  }

  c.requestCount++;

  // Check rate limit
  if (c.requestCount > MAX_REQUESTS) {
    c.violations++;
    totalBlocked++;

    // Auto-blacklist after repeated violations
    if (c.violations >= BLACKLIST_AFTER) {
      c.blacklistedUntil = millis() + BLACKLIST_DURATION;
      Serial.println("BLACKLISTED IP: " + ip.toString() + " for 5 minutes");
    }
    return false; // BLOCKED — rate limited
  }

  return true; // ALLOWED
}

// Sanitize user input (remove control characters, limit length)
String sanitizeInput(String input, int maxLen) {
  if ((int)input.length() > maxLen) {
    input = input.substring(0, maxLen);
  }
  String clean = "";
  for (unsigned int i = 0; i < input.length(); i++) {
    char c = input.charAt(i);
    if (c >= 32 && c < 127) { // Only printable ASCII
      clean += c;
    }
  }
  return clean;
}

void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);

  // Initialize rate limit tracker
  for (int i = 0; i < MAX_CLIENTS; i++) {
    clients[i].active = false;
  }
  
  // Initialize LED Matrix
  display.begin();
  display.setIntensity(5);
  display.displayClear();
  display.displayScroll("SMARTPLANT STARTING...", PA_CENTER, PA_SCROLL_LEFT, 50);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());
    
    // --- Setup API Endpoints for Dashboard ---

    // GET /api/data — Return sensor data (rate limited)
    server.on("/api/data", HTTP_GET, []() {
      IPAddress clientIP = server.client().remoteIP();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      
      if (!checkRateLimit(clientIP)) {
        int slot = getClientSlot(clientIP);
        if (clients[slot].blacklistedUntil > 0 && millis() < clients[slot].blacklistedUntil) {
          server.send(403, "text/plain", "Forbidden - IP blacklisted");
        } else {
          server.send(429, "text/plain", "Too Many Requests - Rate limited");
        }
        return;
      }

      String json = "{";
      json += "\"soil\":" + String(soilMoisture) + ",";
      json += "\"temp\":" + String(temperature) + ",";
      json += "\"humidity\":" + String(humidity) + ",";
      json += "\"rain\":" + String(rain) + ",";
      json += "\"pump\":" + String(shouldWater ? "true" : "false");
      json += "}";
      server.send(200, "application/json", json);
    });
    
    // POST /api/water — Trigger pump (rate limited)
    server.on("/api/water", HTTP_POST, []() {
      IPAddress clientIP = server.client().remoteIP();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      
      if (!checkRateLimit(clientIP)) {
        server.send(429, "text/plain", "Too Many Requests");
        return;
      }

      shouldWater = true;
      sendCommandToArduino(); // Tell Arduino to run pump
      server.send(200, "text/plain", "Watering triggered by Dashboard!");
    });

    // POST /api/auto — Set auto mode (validated input)
    server.on("/api/auto", HTTP_POST, []() {
      IPAddress clientIP = server.client().remoteIP();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      
      if (!checkRateLimit(clientIP)) {
        server.send(429, "text/plain", "Too Many Requests");
        return;
      }

      if (server.hasArg("state")) {
        String state = server.arg("state");
        // Input validation: only accept "true" or "false"
        if (state == "true" || state == "false") {
          autoMode = (state == "true");
          server.send(200, "text/plain", autoMode ? "Auto ON" : "Auto OFF");
        } else {
          server.send(400, "text/plain", "Invalid state value");
        }
      } else {
        server.send(400, "text/plain", "Missing 'state' parameter");
      }
    });

    // POST /api/message — Set custom LED message (sanitized input)
    server.on("/api/message", HTTP_POST, []() {
      IPAddress clientIP = server.client().remoteIP();
      server.sendHeader("Access-Control-Allow-Origin", "*");
      
      if (!checkRateLimit(clientIP)) {
        server.send(429, "text/plain", "Too Many Requests");
        return;
      }

      if (server.hasArg("text")) {
        String rawText = server.arg("text");
        // Sanitize: limit to 100 chars, only printable ASCII
        customMessage = sanitizeInput(rawText, 100);
        updateMessages(); // Refresh the scroll queue immediately
        server.send(200, "text/plain", "Message received (sanitized)");
      } else {
        server.send(400, "text/plain", "Missing 'text' parameter");
      }
    });

    // GET /api/security — Report security stats (for dashboard)
    server.on("/api/security", HTTP_GET, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      
      String json = "{";
      json += "\"totalRequests\":" + String(totalRequests) + ",";
      json += "\"totalBlocked\":" + String(totalBlocked) + ",";
      json += "\"rateLimitPerIP\":" + String(MAX_REQUESTS) + ",";
      json += "\"windowSeconds\":" + String(RATE_WINDOW / 1000) + ",";
      json += "\"blacklistMinutes\":" + String(BLACKLIST_DURATION / 60000) + ",";
      json += "\"activeClients\":" + String(countActiveClients());
      json += "}";
      server.send(200, "application/json", json);
    });

    // Handle CORS Preflight for the browser
    server.onNotFound([]() {
      if (server.method() == HTTP_OPTIONS) {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
        server.send(204);
      } else {
        server.send(404, "text/plain", "Not found");
      }
    });

    server.begin();
    Serial.println("Web Server Started (with security protections)!");
  } else {
    Serial.println("\nWiFi FAILED - running offline mode");
  }
  
  fetchWeather();
}

int countActiveClients() {
  int count = 0;
  for (int i = 0; i < MAX_CLIENTS; i++) {
    if (clients[i].active) count++;
  }
  return count;
}

void loop() {
  server.handleClient(); // Listen for dashboard requests

  // Animate scrolling display
  if (display.displayAnimate()) {
    currentMsg = (currentMsg + 1) % msgCount;
    if (msgCount > 0) {
      display.displayScroll(messages[currentMsg].c_str(), PA_CENTER, PA_SCROLL_LEFT, 40);
    }
  }
  
  // Fetch weather every 30 minutes
  if (millis() - lastWeatherFetch > 1800000UL || lastWeatherFetch == 0) {
    fetchWeather();
    lastWeatherFetch = millis();
  }
  
  // Communicate with Arduino every 5 seconds
  if (millis() - lastSerialComm > 5000) {
    readArduinoData();
    makeDecision();
    sendCommandToArduino();
    lastSerialComm = millis();
  }
}

void fetchWeather() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClient client;
  HTTPClient http;
  http.begin(client, weatherURL);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, http.getString());
    
    if (!err) {
      temperature = doc["current"]["temperature_2m"];
      humidity = doc["current"]["relative_humidity_2m"];
      rain = doc["current"]["precipitation"];
      weatherCode = doc["current"]["weather_code"];
      uvIndex = doc["daily"]["uv_index_max"][0];
      rainForecast = doc["daily"]["precipitation_sum"][1];
      Serial.println("Weather OK: " + String(temperature) + "C, Rain: " + String(rain) + "mm");
    }
  } else {
    Serial.println("Weather HTTP error: " + String(httpCode));
  }
  http.end();
  updateMessages();
}

void readArduinoData() {
  arduinoSerial.println("READ");
  delay(100);
  if (arduinoSerial.available()) {
    String data = arduinoSerial.readStringUntil('\n');
    data.trim();
    int val = data.toInt();
    if (val >= 0 && val <= 100) {
      soilMoisture = val;
      Serial.println("Soil from Arduino: " + String(soilMoisture) + "%");
    }
  }
}

void makeDecision() {
  shouldWater = false;
  if (!autoMode) return; // Skip auto-watering if disabled from dashboard
  
  // Rain detected or forecast → skip watering
  if (rain > 0 && soilMoisture > 20) {
    shouldWater = false;
  }
  else if (rainForecast > 1.0 && soilMoisture > 30) {
    shouldWater = false;
  }
  // Critical dry → always water
  else if (soilMoisture < 20) {
    shouldWater = true;
  }
  // Hot + dry → water
  else if (soilMoisture < 35 && temperature > 35) {
    shouldWater = true;
  }
  // Dry → water
  else if (soilMoisture < 35) {
    shouldWater = true;
  }
  
  updateMessages();
}

void sendCommandToArduino() {
  if (shouldWater) {
    arduinoSerial.println("WATER");
  } else {
    arduinoSerial.println("STOP");
  }
}

void updateMessages() {
  msgCount = 0;
  messages[msgCount++] = "TEMP:" + String((int)temperature) + "C HUM:" + String((int)humidity) + "%";
  
  if (soilMoisture < 30) {
    messages[msgCount++] = "SOIL:" + String(soilMoisture) + "% THIRSTY!";
  } else {
    messages[msgCount++] = "SOIL:" + String(soilMoisture) + "% HAPPY PLANT";
  }
  
  if (rain > 0) {
    messages[msgCount++] = "RAIN TODAY - SKIP WATERING";
  } else if (shouldWater) {
    messages[msgCount++] = "WATERING PLANT NOW";
  } else {
    messages[msgCount++] = "ALL GOOD - PLANT HAPPY";
  }
  
  if (customMessage != "") {
    messages[msgCount++] = ">>> " + customMessage + " <<<";
  }
  
  messages[msgCount++] = "UV:" + String((int)uvIndex) + " SMARTPLANT v1.0";
}
