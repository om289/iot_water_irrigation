# IoT Smart Water Irrigation System

An automated smart irrigation portal that monitors soil moisture levels using Arduino sensors, transmits data to an Express backend server, and renders real-time dashboard controls to toggle water pumps.

## Features
- Real-time moisture level readings.
- Automated pump switching logic based on moisture thresholds.
- Interactive system logs and manual pump controls.


## Hardware Pin Mappings
- Moisture Sensor: Pin A0
- Water Valve: Pin D2


## Irrigation Cycles Flow
1. Read moisture level
2. Open valve for 5 seconds
3. Wait 1 hour
