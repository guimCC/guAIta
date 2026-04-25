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
THR_FRAMES = 20

# --- Detection window state ---
confidence_window = []
last_frame = None
last_detections = None
last_stream_poll = 0
last_stream_frame_post = 0

# --- State ---
active = False
show_bounding_boxes = False  # toggled by button B, default off
camera_is_working = False
led_state = False
last_metrics_post = 0
METRICS_INTERVAL = 30
STREAM_POLL_INTERVAL = 1.0
STREAM_FRAME_INTERVAL = 0.5
STREAM_POST_TIMEOUT = 5
stream_active = False
stream_frame_interval = STREAM_FRAME_INTERVAL

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

def encode_frame_image(frame: bytes, detections: dict = None):
    if show_bounding_boxes and detections is not None:
        annotated = draw_bounding_boxes(frame, detections)
        return get_image_bytes(annotated)

    return get_image_bytes(frame)

def post_detection(best_confidence: float, frame: bytes = None, detections: dict = None):
    snapshot = None
    if frame is not None and detections is not None:
        try:
            image_bytes = encode_frame_image(frame, detections)
            
            snapshot = {
                "contentType": "image/jpeg",
                "encoding": "base64",
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            }
        except Exception as e:
            print(f"[DETECTION] snapshot encoding failed: {e}")
    else:
        print(f"[DETECTION] snapshot ommited")

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
        print(f"[DETECTION] status={r.status_code} body={r.text}")
    except Exception as e:
        print(f"[DETECTION] failed: {e}")

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

def poll_stream_state():
    global stream_active, stream_frame_interval

    try:
        r = requests.get(
            f"{SERVER_URL}/api/device/stream-state",
            params={"stationId": STATION_ID},
            headers=HEADERS,
            timeout=3,
        )
        if r.status_code != 200:
            print(f"[stream] state status={r.status_code} body={r.text}")
            return

        stream = r.json().get("stream", {})
        stream_active = bool(stream.get("active"))
        frame_interval_ms = stream.get("frameIntervalMs")
        if isinstance(frame_interval_ms, (int, float)) and frame_interval_ms > 0:
            stream_frame_interval = max(0.25, frame_interval_ms / 1000.0)

        print(f"[stream] active={stream_active} interval={stream_frame_interval:.2f}s")
    except Exception as e:
        print(f"[stream] state poll failed: {e}")

def maybe_post_stream_frame(frame: bytes, detections: dict = None):
    global last_stream_frame_post, stream_active

    if not stream_active or frame is None:
        return

    now = time.time()
    if now - last_stream_frame_post < stream_frame_interval:
        return

    last_stream_frame_post = now

    try:
        image_bytes = encode_frame_image(frame, detections)
        r = requests.post(
            f"{SERVER_URL}/api/device/stream-frames",
            json={
                "stationId": STATION_ID,
                "capturedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "contentType": "image/jpeg",
                "encoding": "base64",
                "data": base64.b64encode(image_bytes).decode("utf-8"),
                "boundingBoxesEnabled": show_bounding_boxes,
            },
            headers=HEADERS,
            timeout=STREAM_POST_TIMEOUT,
        )
        print(f"[stream] frame status={r.status_code}")
        if r.status_code == 202:
            stream_active = False
    except Exception as e:
        print(f"[stream] frame post failed: {e}")

def _bridge_get(key, call_name):
    try:
        latest_metrics[key] = Bridge.call(call_name)
    except Exception as e:
        print(f"[bridge] {call_name} failed: {e}")

def loop():
    global led_state, camera_is_working, last_metrics_post, active, show_bounding_boxes, last_stream_poll

    try:
        active = bool(Bridge.call("get_active_state"))
        show_bounding_boxes = bool(Bridge.call("get_bbox_state"))
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

    print(f"[state] active={active}, show_bbox={show_bounding_boxes}, metrics={latest_metrics}")

    now = time.time()
    if active and now - last_metrics_post >= METRICS_INTERVAL:
        post_telemetry()
        last_metrics_post = now

    if now - last_stream_poll >= STREAM_POLL_INTERVAL:
        poll_stream_state()
        last_stream_poll = now

    time.sleep(0.1 if camera_is_working else 1.0)

def on_all_detections(detections: dict, frame: bytes):
    global camera_is_working, confidence_window, last_frame, last_detections
    camera_is_working = True

    if frame is not None:
        last_frame = frame

    for key, values in detections.items():
        for value in values:
            ui.send_message("frame_detected", {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
            })

    maybe_post_stream_frame(frame, detections)

    if not active:
        return

    # SLIDING WINDOW CONFIDENCE EVALUATION
    # 0 is the class ID for "wild_boar" in our model
    confidence = detections["0"][0].get("confidence") if "0" in detections else 0.0
    confidence_window.append(confidence)

    if len(confidence_window) > THR_FRAMES:
        confidence_window.pop(0)

    if len(confidence_window) == THR_FRAMES:
        avg = sum(confidence_window) / THR_FRAMES
        if avg >= CONFIDENCE_THR:
            print(f"[DETECTION] window avg={avg:.2f} bbox={show_bounding_boxes} — firing")
            ui.send_message("boar_detected", {
                "confidence": avg,
                "timestamp": datetime.now(UTC).isoformat(),
                **latest_metrics,
            })
            post_detection(avg, last_frame, last_detections)
            confidence_window.clear()

    if "0" in detections:
        last_detections = detections


ui = WebUI()
detector = VideoObjectDetection(confidence=0.1, debounce_sec=0.0, camera_preview=True)
detector.on_detect_all(on_all_detections)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

App.run(user_loop=loop)
