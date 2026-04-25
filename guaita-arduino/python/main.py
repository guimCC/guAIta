# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import base64
import requests
import time
from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from arduino.app_bricks.dbstorage_sqlstore import SQLStore

# --- Device contract config ---
SERVER_URL = "https://uncordial-mathias-infirmly.ngrok-free.dev"
DEVICE_TOKEN = "demo-device-token"
STATION_ID = "live-device-01"

HEADERS = {
    "Authorization": f"Bearer {DEVICE_TOKEN}",
    "Content-Type": "application/json",
}

# --- State ---
camera_is_working = False
led_state = False
last_metrics_post = 0
METRICS_INTERVAL = 30  # seconds between status POSTs

# --- Latest sensor readings (updated in loop, read anywhere) ---
latest_metrics = {
    "temperatureC": None,
    "humidityPct": None,
}

# --- Helpers ---

def post_detection(confidence: float):
    """POST a wild boar detection event, enriched with current telemetry."""
    try:
        r = requests.post(
            f"{SERVER_URL}/api/device/events",
            json={
                "stationId": STATION_ID,
                "source": "device",
                "species": "wild_boar",
                "confidence": confidence,
                "observedAt": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
                "humidityPct": latest_metrics["humidityPct"],
                "model": {
                    "name": "wild-boar-detector",
                    "version": "demo-v1",
                },
            },
            headers=HEADERS,
            timeout=5,
        )
        print(f"[detection POST] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[detection POST] failed: {e}")

def post_metrics():
    """POST a periodic status/telemetry update (no species — metrics only)."""
    try:
        r = requests.post(
            f"{SERVER_URL}/api/device/status",
            json={
                "stationId": STATION_ID,
                "source": "device",
                "observedAt": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
                "humidityPct": latest_metrics["humidityPct"],
                # future modulinos go here: lightLux, batteryPct, etc.
            },
            headers=HEADERS,
            timeout=5,
        )
        print(f"[metrics POST] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[metrics POST] failed: {e}")

# --- Loops and callbacks ---

def loop():
    """Background loop: LED blink + read Modulino Thermo + periodic metrics POST."""
    global led_state, camera_is_working, last_metrics_post

    led_state = not led_state
    try:
        Bridge.call("set_led_state", led_state)
    except Exception:
        pass

    # Read temperature & humidity from Modulino Thermo via Bridge
    try:
        latest_metrics["temperatureC"] = Bridge.call("get_temperature")
        latest_metrics["humidityPct"] = Bridge.call("get_humidity")
    except Exception:
        pass

    # Periodic metrics POST every METRICS_INTERVAL seconds
    now = time.time()
    if now - last_metrics_post >= METRICS_INTERVAL:
        post_metrics()
        last_metrics_post = now

    time.sleep(0.1 if camera_is_working else 1.0)

def on_all_detections(detections: dict):
    """Called every frame with all detected objects."""
    global camera_is_working
    camera_is_working = True

    for key, values in detections.items():
        for value in values:
            ui.send_message("frame_detected", {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
            })

        if key == "0":
            best_confidence = values[0].get("confidence")
            log_entry = {
                "species": "wild_boar",
                "confidence": best_confidence,
                "timestamp": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
                "humidityPct": latest_metrics["humidityPct"],
            }
            store.store("scan_log", log_entry)
            ui.send_message("boar_detected", log_entry)
            post_detection(best_confidence)

def on_list_scans():
    """API: return the latest 5 logged detections."""
    scans = store.read("scan_log", order_by="timestamp DESC", limit=5)
    return {"scans": scans if scans else []}

# --- Init ---
store = SQLStore("code-scanner.db")

detector = VideoObjectDetection(confidence=0.5, debounce_sec=1.5)
detector.on_detect_all(on_all_detections)

ui = WebUI()
ui.expose_api("GET", "/list_scans", on_list_scans)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

App.run(user_loop=loop)