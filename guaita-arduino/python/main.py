# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import base64
import requests
import threading
import time
from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from image_utils import draw_boxes_on_frame, encode_upload_image, extract_detection_boxes
from stream_upload import StreamUploader

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

# Detection snapshots are always annotated for the demo assessment path.
DETECTION_SNAPSHOT_BOXES_ALWAYS = True
BOX_COLOR = (250, 204, 21)
BOX_LABEL_COLOR = (12, 10, 9)
BOX_THICKNESS = 3

# --- Detection window state ---
confidence_window = []
last_frame = None
last_detections = None
last_state_print = 0

# --- State ---
active = False
show_bounding_boxes = False  # toggled by button B, default off for live stream overlay
camera_is_working = False
led_state = False
last_metrics_post = 0
METRICS_INTERVAL = 30
STATE_PRINT_INTERVAL = 2.0
STREAM_JPEG_MAX_WIDTH = 320
STREAM_JPEG_QUALITY = 55

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


def best_snapshot_detections(current_detections: dict = None):
    current_boxes = extract_detection_boxes(current_detections)
    if current_boxes:
        return current_detections, current_boxes

    last_boxes = extract_detection_boxes(last_detections)
    if last_boxes:
        return last_detections, last_boxes

    return current_detections, current_boxes


def build_detection_snapshot(frame: bytes = None, detections: dict = None):
    snapshot_detections, boxes = best_snapshot_detections(detections)
    if frame is None or snapshot_detections is None:
        print(f"[DETECTION] snapshot ommited")
        return None

    try:
        snapshot_frame = frame
        if DETECTION_SNAPSHOT_BOXES_ALWAYS:
            snapshot_frame, boxes = draw_boxes_on_frame(
                frame,
                snapshot_detections,
                STREAM_JPEG_MAX_WIDTH,
                STREAM_JPEG_QUALITY,
                BOX_COLOR,
                BOX_LABEL_COLOR,
                BOX_THICKNESS,
            )

        image_bytes, content_type = encode_upload_image(
            snapshot_frame,
            STREAM_JPEG_MAX_WIDTH,
            STREAM_JPEG_QUALITY,
        )
        if content_type is None:
            raise ValueError("camera image bytes are not JPEG or PNG")

        if boxes:
            print(f"[DETECTION] snapshot includes {len(boxes)} bounding boxes")
        else:
            print("[DETECTION] snapshot uploaded without boxes; model did not expose box coordinates for this frame")

        return {
            "contentType": content_type,
            "encoding": "base64",
            "data": base64.b64encode(image_bytes).decode("utf-8"),
        }
    except Exception as e:
        print(f"[DETECTION] snapshot encoding failed: {e}")
        return None


def post_detection(best_confidence: float, frame: bytes = None, detections: dict = None):
    snapshot = build_detection_snapshot(frame, detections)

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


def _bridge_get(key, call_name):
    try:
        latest_metrics[key] = Bridge.call(call_name)
    except Exception as e:
        print(f"[bridge] {call_name} failed: {e}")


def loop():
    global led_state, camera_is_working, last_metrics_post, active, show_bounding_boxes, last_state_print

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

    now = time.time()
    if now - last_state_print >= STATE_PRINT_INTERVAL:
        print(f"[state] active={active}, show_bbox={show_bounding_boxes}, stream={stream_uploader.active}, metrics={latest_metrics}")
        last_state_print = now

    if active and now - last_metrics_post >= METRICS_INTERVAL:
        post_telemetry()
        last_metrics_post = now

    time.sleep(0.1 if camera_is_working else 1.0)


def on_all_detections(detections: dict, frame: bytes):
    global camera_is_working, confidence_window, last_frame, last_detections
    camera_is_working = True

    if frame is not None:
        last_frame = frame
    if "0" in detections:
        last_detections = detections

    for key, values in detections.items():
        for value in values:
            ui.send_message("frame_detected", {
                "content": key,
                "confidence": value.get("confidence"),
                "timestamp": datetime.now(UTC).isoformat(),
            })

    stream_uploader.capture_frame(frame, detections)

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
            post_detection(avg, frame if frame is not None else last_frame, detections)
            confidence_window.clear()


def remember_camera_frame(frame):
    global camera_is_working, last_frame

    camera_is_working = True
    last_frame = frame


stream_uploader = StreamUploader(
    server_url=SERVER_URL,
    device_token=DEVICE_TOKEN,
    station_id=STATION_ID,
    encode_upload_image=encode_upload_image,
    image_max_width=STREAM_JPEG_MAX_WIDTH,
    image_quality=STREAM_JPEG_QUALITY,
    get_bbox_enabled=lambda: show_bounding_boxes,
    get_latest_fallback=lambda: (last_frame, last_detections),
)

ui = WebUI()
detector = VideoObjectDetection(confidence=0.1, debounce_sec=0.0, camera_preview=True)
stream_uploader.attach_camera_tap(
    detector,
    on_frame=remember_camera_frame,
    get_latest_detections=lambda: last_detections,
)
detector.on_detect_all(on_all_detections)
ui.on_message("override_th", lambda sid, threshold: detector.override_threshold(threshold))

threading.Thread(target=stream_uploader.worker_loop, daemon=True).start()
App.run(user_loop=loop)
