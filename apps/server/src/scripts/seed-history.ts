import { GuaitaDatabase } from "../db/database.js";
import { type DetectionEvent, type TelemetryReading } from "@guaita/shared";
import { config } from "../config.js";

const db = new GuaitaDatabase(config.databasePath);
const stations = db.listStations();

console.log(`Generating historical data for ${stations.length} stations...`);

const now = new Date();
const startTime = new Date(now.getTime() - 48 * 60 * 60_000); // 48 hours ago

// Clear old events to start fresh for simulation
db.clearEvents();

// North stations are those with higher latitude
const sortedStations = [...stations].sort((a, b) => b.latitude - a.latitude);
const northStations = sortedStations.slice(0, Math.floor(stations.length / 2));
const southStations = sortedStations.slice(Math.floor(stations.length / 2));

// Generate data hour by hour
for (let h = 0; h < 48; h++) {
  const currentHourTime = new Date(startTime.getTime() + h * 60 * 60_000);
  const hour = currentHourTime.getHours();
  const isDaylight = hour >= 7 && hour <= 20;
  
  for (const station of stations) {
    // Base temperature: Day is hotter, South is hotter
    const isNorth = northStations.includes(station);
    let temp = 15 + Math.sin((hour - 6) * Math.PI / 12) * 10; // 15-25 range
    if (isNorth) temp -= 3; // North side is colder
    if (!isDaylight) temp -= 5; // Night is colder
    
    const humidity = 60 + Math.random() * 20;

    // Telemetry
    const telemetry: TelemetryReading = {
      telemetryId: `hist_tel_${h}_${station.id}`,
      stationId: station.id,
      observedAt: currentHourTime.toISOString(),
      source: "scenario",
      temperatureC: temp + (Math.random() * 2 - 1),
      humidityPct: humidity,
      lightLux: isDaylight ? (500 + Math.random() * 500) : (5 + Math.random() * 10),
      batteryPct: 90 + Math.random() * 10
    };
    db.insertTelemetryReading(telemetry);

    // Boar detection probability
    // Peste Porcina behavior: 
    // 1. Usually nocturnal (low daylight prob)
    // 2. If sick, they look for shade/cold (North) and water
    // 3. Occasionally disoriented in daylight
    
    let detectionProb = 0.05; // Base probability per hour
    if (!isDaylight) detectionProb = 0.15; // Natural nocturnal activity
    if (isDaylight && Math.random() < 0.1) detectionProb = 0.1; // Anomalous daylight activity (sick indicator)
    if (temp > 22 && isNorth) detectionProb *= 2; // Seeking cold

    if (Math.random() < detectionProb) {
      const count = Math.random() > 0.8 ? Math.floor(Math.random() * 5) + 2 : 1;
      const event: DetectionEvent = {
        eventId: `hist_evt_${h}_${station.id}`,
        stationId: station.id,
        observedAt: currentHourTime.toISOString(),
        source: "scenario",
        species: "wild_boar",
        confidence: 0.7 + Math.random() * 0.25,
        count,
        direction: Math.random() > 0.7 ? "towards_city" : "towards_forest",
        temperatureC: temp,
        humidityPct: humidity,
        lightLux: telemetry.lightLux
      };
      db.insertEvent(event);
    }
  }
}

console.log("Data generated successfully.");
db.close();
