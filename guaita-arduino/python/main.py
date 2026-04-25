# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import requests
import time
from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection

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
METRICS_INTERVAL = 30

latest_metrics = {
    "temperatureC": None,
    "humidityPct": None,
}

def post_detection(confidence: float):
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
                "model": {"name": "wild-boar-detector", "version": "demo-v1"},
            },
            headers=HEADERS,
            timeout=5,
        )
        print(f"[detection] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[detection] failed: {e}")

def post_telemetry():
    try:
        r = requests.post(
            f"{SERVER_URL}/api/device/telemetry",
            json={
                "stationId": STATION_ID,
                "source": "device",
                "observedAt": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
                "humidityPct": latest_metrics["humidityPct"],
            },
            headers=HEADERS,
            timeout=5,
        )
        print(f"[telemetry] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[telemetry] failed: {e}")

def loop():
    global led_state, camera_is_working, last_metrics_post

    led_state = not led_state
    try:
        Bridge.call("set_led_state", led_state)
    except Exception:
        pass

    try:
        latest_metrics["temperatureC"] = Bridge.call("get_temperature")
        latest_metrics["humidityPct"] = Bridge.call("get_humidity")
    except Exception:
        pass

    now = time.time()
    if now - last_metrics_post >= METRICS_INTERVAL:
        post_telemetry()
        last_metrics_post = now

    time.sleep(0.1 if camera_is_working else 1.0)

def on_all_detections(detections: dict):
    global camera_is_working
    camera_is_working = True

    for key, values in detections.items():
        for value in values:
            ui.send_message("frame_detected", {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
            })

        if key == "0":  # label "0" = wild_boar (as trained in the model)
            best_confidence = values[0].get("confidence")
            ui.send_message("boar_detected", {
                "confidence": best_confidence,
                "timestamp": datetime.now(UTC).isoformat(),
                "temperatureC": latest_metrics["temperatureC"],
                "humidityPct": latest_metrics["humidityPct"],
            })
            post_detection(best_confidence)

ui = WebUI()
detector = VideoObjectDetection(confidence=0.5, debounce_sec=1.5)
detector.on_detect_all(on_all_detections)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

App.run(user_loop=loop)