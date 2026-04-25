# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0

from datetime import datetime, UTC
import io
import base64
import requests
import time
from PIL.Image import Image
from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.camera_code_detection import CameraCodeDetection, Detection, draw_bounding_box
from arduino.app_bricks.dbstorage_sqlstore import SQLStore

# --- Device contract config ---
SERVER_URL = "https://uncordial-mathias-infirmly.ngrok-free.dev"
DEVICE_TOKEN = "demo-device-token"

# --- Camera status and LED state ---
camera_is_working = False
led_state = False
detected = False

def loop():
    """Background loop managed natively by App Lab to control the LED."""
    global led_state, camera_is_working
    led_state = not led_state
    try:
        Bridge.call("set_led_state", led_state)
    except Exception:
        pass
    if camera_is_working:
        time.sleep(0.1)
    else:
        time.sleep(1.0)

def on_code_detected(frame: Image, detection: Detection):
    """Callback function that handles a detected code."""
    global detected
    if detected:
        return
    frame = draw_bounding_box(frame, detection)
    buffer = io.BytesIO()
    frame.save(buffer, format="JPEG", quality=100)
    b64_frame = base64.b64encode(buffer.getvalue()).decode("utf-8")
    entry = {
        "content": detection.content,
        "type": detection.type,
        "timestamp": datetime.now(UTC).isoformat(),
        "image": b64_frame,
        "image_type": "image/jpeg",
    }
    store.store("scan_log", entry)
    ui.send_message('code_detected', entry)
    detected = True

def on_frame(frame: Image):
    """Callback function that processes each frame from the camera."""
    global detected, camera_is_working
    camera_is_working = True
    if detected:
        return
    buffer = io.BytesIO()
    frame.save(buffer, format="JPEG", quality=100)
    b64_frame = base64.b64encode(buffer.getvalue()).decode("utf-8")
    entry = {
        "timestamp": datetime.now(UTC).isoformat(),
        "image": b64_frame,
        "image_type": "image/jpeg",
    }
    ui.send_message('frame_detected', entry)

    # --- TEST: post hello on every frame ---
    try:
        r = requests.post(
            f"{SERVER_URL}/api/device/events",
            json={
                "stationId": "live-device-01",
                "source": "device",
                "species": "wild_boar",
                "confidence": 0.99,
            },
            headers={
                "Authorization": f"Bearer {DEVICE_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=5,
        )
        print(f"[on_frame] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[on_frame] FAILED: {e}")



def on_list_scans():
    """Callback function that lists the latest 5 scanned codes."""
    scans = store.read("scan_log", order_by="timestamp DESC", limit=5)
    return {"scans": scans if scans else []}

def reset_detection(_, __):
    """Callback function to reset the detection state."""
    global detected
    detected = False

def on_error(e: Exception):
    """Callback function that handles exceptions from the detector."""
    global camera_is_working
    camera_is_working = False
    ui.send_message('error', str(e))

store = SQLStore("code-scanner.db")

try:
    detector = CameraCodeDetection()
    detector.on_detect(on_code_detected)
    detector.on_frame(on_frame)
    detector.on_error(on_error)
except Exception as e:
    camera_is_working = False
    print(f"Camera Initialization Error: {e}")

ui = WebUI()
ui.expose_api('GET', '/list_scans', on_list_scans)
ui.on_message('reset_detection', reset_detection)

App.run(user_loop=loop)