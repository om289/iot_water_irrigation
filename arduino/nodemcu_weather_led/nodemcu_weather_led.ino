// ============================================
// SmartPlant - NodeMCU ESP8266 Controller
// Handles: WiFi, Weather API, LED Matrix, Serial to Arduino
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

void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);
  
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
    server.on("/api/data", HTTP_GET, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      String json = "{";
      json += "\"soil\":" + String(soilMoisture) + ",";
      json += "\"temp\":" + String(temperature) + ",";
      json += "\"humidity\":" + String(humidity) + ",";
      json += "\"rain\":" + String(rain) + ",";
      json += "\"pump\":" + String(shouldWater ? "true" : "false");
      json += "}";
      server.send(200, "application/json", json);
    });
    
    server.on("/api/water", HTTP_POST, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      shouldWater = true;
      sendCommandToArduino(); // Tell Arduino to run pump
      server.send(200, "text/plain", "Watering triggered by Dashboard!");
    });

    server.on("/api/auto", HTTP_POST, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      if (server.hasArg("state")) {
        autoMode = (server.arg("state") == "true");
      }
      server.send(200, "text/plain", autoMode ? "Auto ON" : "Auto OFF");
    });

    server.on("/api/message", HTTP_POST, []() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      if (server.hasArg("text")) {
        customMessage = server.arg("text");
        updateMessages(); // Refresh the scroll queue immediately
      }
      server.send(200, "text/plain", "Message received");
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
    Serial.println("Web Server Started!");
  } else {
    Serial.println("\nWiFi FAILED - running offline mode");
  }
  
  fetchWeather();
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
      Serial.println("Weather OK: " + String(temperature) + "°C, Rain: " + String(rain) + "mm");
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
