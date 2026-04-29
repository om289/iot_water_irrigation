// ============================================
// SmartPlant - Arduino Uno Controller
// Handles: Soil Moisture Sensor + Pump Relay
// ============================================

#include <SoftwareSerial.h>

// Serial connection to NodeMCU
SoftwareSerial nodeSerial(2, 3); // RX=D2, TX=D3

// --- Pin Definitions ---
#define SOIL_PIN      A0    // Analog soil moisture sensor
#define RELAY_PIN     4     // Relay control pin (active LOW)

// --- Calibration Thresholds (for 3.3V power) ---
// At 3.3V, analog values are lower than 5V
// Adjust these after calibrating with YOUR sensor!
#define DRY_THRESHOLD   460   // Analog value when soil is dry (3.3V)
#define WET_THRESHOLD   230   // Analog value when soil is wet (3.3V)

// --- Safety ---
#define MAX_PUMP_TIME   7000  // Maximum pump run time (7 seconds)

// --- State ---
int soilRaw = 0;
int soilPercent = 0;
bool pumpRunning = false;
unsigned long pumpStartTime = 0;
unsigned long lastPrintTime = 0;

void setup() {
  Serial.begin(9600);      // Debug serial (USB)
  nodeSerial.begin(9600);  // Communication with NodeMCU
  
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF (most relay modules are active LOW)
  
  Serial.println("================================");
  Serial.println("SmartPlant Arduino Uno Ready");
  Serial.println("Soil Pin: A0 | Relay Pin: D4");
  Serial.println("================================");
}

void loop() {
  // --- Read Soil Moisture ---
  soilRaw = analogRead(SOIL_PIN);
  
  // Map analog reading to percentage (0-100%)
  // Note: Higher analog = drier, Lower analog = wetter
  soilPercent = map(soilRaw, DRY_THRESHOLD, WET_THRESHOLD, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);
  
  // --- Handle Commands from NodeMCU ---
  if (nodeSerial.available()) {
    String command = nodeSerial.readStringUntil('\n');
    command.trim();
    
    if (command == "READ") {
      // Send soil moisture percentage to NodeMCU
      nodeSerial.println(String(soilPercent));
      Serial.println(">> Sent to NodeMCU: " + String(soilPercent) + "%");
    }
    else if (command == "WATER") {
      if (!pumpRunning) {
        startPump();
      }
    }
    else if (command == "STOP") {
      if (pumpRunning) {
        stopPump();
      }
    }
  }
  
  // --- Safety: Auto-stop pump after timeout ---
  if (pumpRunning && (millis() - pumpStartTime > MAX_PUMP_TIME)) {
    stopPump();
    Serial.println("!! SAFETY: Pump auto-stopped (timeout)");
  }
  
  // --- Debug Print every 2 seconds ---
  if (millis() - lastPrintTime > 2000) {
    Serial.print("Raw: ");
    Serial.print(soilRaw);
    Serial.print(" | Moisture: ");
    Serial.print(soilPercent);
    Serial.print("% | Pump: ");
    Serial.println(pumpRunning ? "ON" : "OFF");
    lastPrintTime = millis();
  }
  
  delay(100);
}

void startPump() {
  digitalWrite(RELAY_PIN, LOW);  // Relay ON (active LOW)
  pumpRunning = true;
  pumpStartTime = millis();
  Serial.println(">>> PUMP STARTED");
}

void stopPump() {
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF
  pumpRunning = false;
  Serial.println(">>> PUMP STOPPED");
}
