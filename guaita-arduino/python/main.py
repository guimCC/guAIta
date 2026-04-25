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

# --- Camera status and LED state ---
camera_is_working = False
led_state = False

def loop():
    """Background loop managed natively by App Lab to control the LED."""
    global led_state, camera_is_working
    led_state = not led_state
    try:
        Bridge.call("set_led_state", led_state)
    except Exception:
        pass
    time.sleep(0.1 if camera_is_working else 1.0)

def on_all_detections(detections: dict):
    """Callback function that processes each frame's detections."""
    global camera_is_working
    camera_is_working = True

    for key, values in detections.items():
        for value in values:
            entry = {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
            }
            ui.send_message("frame_detected", entry)

        if key == "0":
            best_confidence = values[0].get("confidence")
            log_entry = {
                "species": "wild_boar",
                "confidence": best_confidence,
                "timestamp": datetime.now(UTC).isoformat(),
            }
            store.store("scan_log", log_entry)
            ui.send_message("boar_detected", log_entry)

            try:
                r = requests.post(
                    f"{SERVER_URL}/api/device/events",
                    json={
                        "stationId": "live-device-01",
                        "source": "device",
                        "species": "wild_boar",
                        "confidence": best_confidence,
                    },
                    headers={
                        "Authorization": f"Bearer {DEVICE_TOKEN}",
                        "Content-Type": "application/json",
                    },
                    timeout=5,
                )
                print(f"[wild_boar] status={r.status_code} body={r.text}")
            except Exception as e:
                print(f"[wild_boar] POST failed: {e}")

def on_list_scans():
    """Callback function that lists the latest 5 detections."""
    scans = store.read("scan_log", order_by="timestamp DESC", limit=5)
    return {"scans": scans if scans else []}

store = SQLStore("code-scanner.db")

detector = VideoObjectDetection(confidence=0.5, debounce_sec=1.5)
detector.on_detect_all(on_all_detections)

ui = WebUI()
ui.expose_api("GET", "/list_scans", on_list_scans)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

App.run(user_loop=loop)