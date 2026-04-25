# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import base64
import requests
import time
from arduino.app_utils import *
from arduino.app_utils.image import draw_bounding_boxes, get_image_bytes
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection

# --- Device contract config ---
SERVER_URL = "https://uncordial-mathias-infirmly.ngrok-free.dev"
DEVICE_TOKEN = "demo-device-token"
STATION_ID = "collserola-control-02"

HEADERS = {
    "Authorization": f"Bearer {DEVICE_TOKEN}",
    "Content-Type": "application/json",
}

# --- Detection thresholds ---
CONFIDENCE_THR = 0.7
THR_FRAMES = 10

# --- Detection window state ---
confidence_window = []
last_frame = None
last_detections = None

# --- State ---
active = False
camera_is_working = False
led_state = False
last_metrics_post = 0
METRICS_INTERVAL = 30

latest_metrics = {
    "temperatureC": None,
    "humidityPct": None,
    "lightLux": None,
    "distanceMm": None,
}

def _safe_float(value):
    if value is None:
        return None
    try:
        if value != value:  # NaN
            return None
        if value < 0:       # sentinel from sketch
            return None
        return value
    except Exception:
        return None

def post_detection(best_confidence: float, frame: bytes = None, detections: dict = None):
    snapshot = None
    if frame is not None and detections is not None:
        try:
            annotated = draw_bounding_boxes(frame, detections)
            image_bytes = get_image_bytes(annotated)
            snapshot = {
                "contentType": "image/jpeg",
                "encoding": "base64",
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            }
        except Exception as e:
            print(f"[detection] snapshot encoding failed: {e}")

    try:
        r = requests.post(
            f"{SERVER_URL}/api/device/events",
            json={
                "stationId": STATION_ID,
                "source": "device",
                "species": "wild_boar",
                "confidence": best_confidence,
                "observedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "temperatureC": _safe_float(latest_metrics["temperatureC"]),
                "humidityPct": _safe_float(latest_metrics["humidityPct"]),
                "lightLux": _safe_float(latest_metrics["lightLux"]),
                "distanceMm": _safe_float(latest_metrics["distanceMm"]),
                "model": {"name": "wild-boar-detector", "version": "demo-v1"},
                "snapshot": snapshot,
            },
            headers=HEADERS,
            timeout=10,
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
                "observedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "temperatureC": _safe_float(latest_metrics["temperatureC"]),
                "humidityPct": _safe_float(latest_metrics["humidityPct"]),
                "lightLux": _safe_float(latest_metrics["lightLux"]),
                "distanceMm": _safe_float(latest_metrics["distanceMm"]),
            },
            headers=HEADERS,
            timeout=5,
        )
        print(f"[telemetry] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[telemetry] failed: {e}")

def _bridge_get(key, call_name):
    try:
        latest_metrics[key] = Bridge.call(call_name)
    except Exception as e:
        print(f"[bridge] {call_name} failed: {e}")

def loop():
    global led_state, camera_is_working, last_metrics_post, active

    try:
        active = bool(Bridge.call("get_active_state"))
    except Exception:
        pass

    if active:
        led_state = not led_state
        try:
            Bridge.call("set_led_state", led_state)
        except Exception:
            pass
    else:
        try:
            Bridge.call("set_led_state", False)
        except Exception:
            pass

    _bridge_get("temperatureC", "get_temperature")
    _bridge_get("humidityPct", "get_humidity")
    _bridge_get("lightLux", "get_light")
    _bridge_get("distanceMm", "get_distance")

    print(f"[state] active={active} metrics={latest_metrics}")

    now = time.time()
    if active and now - last_metrics_post >= METRICS_INTERVAL:
        post_telemetry()
        last_metrics_post = now

    time.sleep(0.1 if camera_is_working else 1.0)

def on_all_detections(detections: dict, frame: bytes):
    global camera_is_working, confidence_window, last_frame, last_detections
    camera_is_working = True

    for key, values in detections.items():
        for value in values:
            ui.send_message("frame_detected", {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
            })

    if not active:
        return

    # SLIDING WINDOW CONFIDENCE EVALUATION
    # 0 is the class ID for "wild_boar" in our model
    confidence = detections["0"][0].get("confidence") if "0" in detections else 0.0
    confidence_window.append(confidence)

    # Keep as a sliding window of fixed size
    if len(confidence_window) > THR_FRAMES:
        confidence_window.pop(0)

    # Only evaluate once the window is full
    if len(confidence_window) == THR_FRAMES:
        avg = sum(confidence_window) / THR_FRAMES
        if avg >= CONFIDENCE_THR:
            print(f"[detection] window avg={avg:.2f} — firing")
            ui.send_message("boar_detected", {
                "confidence": avg,
                "timestamp": datetime.now(UTC).isoformat(),
                **latest_metrics,
            })
            post_detection(avg, last_frame, last_detections)
            confidence_window.clear()

    if "0" in detections:
        last_frame = frame
        last_detections = detections


ui = WebUI()
detector = VideoObjectDetection(confidence=0.0, debounce_sec=0.0, camera_preview=True)
detector.on_detect_all(on_all_detections)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

App.run(user_loop=loop)