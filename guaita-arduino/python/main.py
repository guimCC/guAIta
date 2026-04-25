# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import base64
from io import BytesIO
import json
import requests
import threading
import time
from arduino.app_utils import *
from arduino.app_utils.image import get_image_bytes
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection

try:
    from PIL import Image
except Exception:
    Image = None

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
last_state_print = 0
last_stream_wait_print = 0

# --- State ---
active = False
show_bounding_boxes = False  # toggled by button B, default off
camera_is_working = False
led_state = False
last_metrics_post = 0
METRICS_INTERVAL = 30
STREAM_ACTIVE_POLL_INTERVAL = 1.0
STREAM_IDLE_POLL_INTERVAL = 2.0
STREAM_FRAME_INTERVAL = 0.5
STREAM_CONNECT_TIMEOUT = 0.5
STREAM_READ_TIMEOUT = 1.2
STREAM_WORKER_SLEEP = 0.03
STATE_PRINT_INTERVAL = 2.0
STREAM_WAIT_PRINT_INTERVAL = 2.0
STREAM_UPLOAD_BOUNDARY = "guaita-upload-frame"
STREAM_JPEG_MAX_WIDTH = 320
STREAM_JPEG_QUALITY = 55
stream_active = False
stream_frame_interval = STREAM_FRAME_INTERVAL
stream_lock = threading.Lock()
latest_stream_frame = None
latest_stream_detections = None
latest_stream_captured_at = None
latest_stream_bbox_state = False
latest_stream_sequence = 0
posted_stream_sequence = 0

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

def image_content_type(image_bytes: bytes):
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return None

def jpeg_upload_image(image_bytes: bytes):
    content_type = image_content_type(image_bytes)
    if content_type == "image/jpeg" or Image is None:
        return image_bytes, content_type

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.thumbnail((STREAM_JPEG_MAX_WIDTH, STREAM_JPEG_MAX_WIDTH))
            if image.mode != "RGB":
                image = image.convert("RGB")

            output = BytesIO()
            image.save(output, format="JPEG", quality=STREAM_JPEG_QUALITY, optimize=False)
            jpeg_bytes = output.getvalue()
            if len(jpeg_bytes) < len(image_bytes):
                return jpeg_bytes, "image/jpeg"
    except Exception as e:
        print(f"[stream] jpeg conversion skipped: {e}")

    return image_bytes, content_type

def encode_upload_image(frame: bytes):
    return jpeg_upload_image(get_image_bytes(frame))

def _safe_number(value):
    try:
        number = float(value)
        if number != number:
            return None
        return number
    except Exception:
        return None

def _first_number(record: dict, keys):
    for key in keys:
        value = _safe_number(record.get(key))
        if value is not None:
            return value
    return None

def frame_dimensions(frame):
    shape = getattr(frame, "shape", None)
    if shape is not None and len(shape) >= 2:
        return int(shape[1]), int(shape[0])

    width = getattr(frame, "width", None)
    height = getattr(frame, "height", None)
    if width and height:
        return int(width), int(height)

    size = getattr(frame, "size", None)
    if isinstance(size, tuple) and len(size) >= 2:
        return int(size[0]), int(size[1])

    return None, None

def extract_stream_boxes(detections: dict):
    boxes = []
    if not isinstance(detections, dict):
        return boxes

    for label, values in detections.items():
        if not isinstance(values, list):
            continue

        for value in values:
            if not isinstance(value, dict):
                continue

            source = value.get("bounding_box") or value.get("bbox") or value
            if not isinstance(source, dict):
                xyxy = value.get("bounding_box_xyxy")
                if isinstance(xyxy, (list, tuple)) and len(xyxy) >= 4:
                    source = {
                        "x": xyxy[0],
                        "y": xyxy[1],
                        "x2": xyxy[2],
                        "y2": xyxy[3],
                    }
                else:
                    continue

            x = _first_number(source, ["x", "left", "xmin", "x_min"])
            y = _first_number(source, ["y", "top", "ymin", "y_min"])
            width = _first_number(source, ["width", "w"])
            height = _first_number(source, ["height", "h"])

            if width is None or height is None:
                x2 = _first_number(source, ["x2", "right", "xmax", "x_max"])
                y2 = _first_number(source, ["y2", "bottom", "ymax", "y_max"])
                if x is not None and y is not None and x2 is not None and y2 is not None:
                    width = x2 - x
                    height = y2 - y

            if x is None or y is None or width is None or height is None or width <= 0 or height <= 0:
                continue

            confidence = _first_number(value, ["confidence", "score", "probability"])
            box = {
                "label": str(label),
                "x": x,
                "y": y,
                "width": width,
                "height": height,
            }
            if confidence is not None:
                box["confidence"] = confidence
            boxes.append(box)

            if len(boxes) >= 12:
                return boxes

    return boxes

def post_detection(best_confidence: float, frame: bytes = None, detections: dict = None):
    snapshot = None
    if frame is not None and detections is not None:
        try:
            image_bytes, content_type = encode_upload_image(frame)
            if content_type is None:
                raise ValueError("camera image bytes are not JPEG or PNG")
            
            snapshot = {
                "contentType": content_type,
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

def poll_stream_state(session=None):
    global stream_active, stream_frame_interval

    client = session or requests
    try:
        r = client.get(
            f"{SERVER_URL}/api/device/stream-state",
            params={"stationId": STATION_ID},
            headers=HEADERS,
            timeout=(STREAM_CONNECT_TIMEOUT, STREAM_READ_TIMEOUT),
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
    global latest_stream_frame, latest_stream_detections, latest_stream_captured_at
    global latest_stream_bbox_state, latest_stream_sequence

    if not stream_active or frame is None:
        return

    with stream_lock:
        latest_stream_frame = frame
        latest_stream_detections = detections
        latest_stream_captured_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        latest_stream_bbox_state = show_bounding_boxes
        latest_stream_sequence += 1

def build_stream_frame_part():
    global last_stream_frame_post, posted_stream_sequence, last_stream_wait_print

    now = time.time()
    if now - last_stream_frame_post < stream_frame_interval:
        return None

    with stream_lock:
        frame = latest_stream_frame
        detections = latest_stream_detections
        captured_at = latest_stream_captured_at
        bbox_state = latest_stream_bbox_state
        sequence = latest_stream_sequence

    if frame is None and last_frame is not None:
        frame = last_frame
        detections = last_detections
        captured_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        bbox_state = show_bounding_boxes
        sequence = -1

    if frame is None:
        if now - last_stream_wait_print >= STREAM_WAIT_PRINT_INTERVAL:
            print("[stream] active but no camera frame has reached the detection callback yet")
            last_stream_wait_print = now
        return None

    if sequence == posted_stream_sequence and sequence != -1:
        return None

    try:
        image_bytes, content_type = encode_upload_image(frame)
        if content_type is None:
            print("[stream] skipped frame: camera image bytes are not JPEG or PNG")
            return None

        frame_width, frame_height = frame_dimensions(frame)
        boxes = extract_stream_boxes(detections) if bbox_state else []
        headers = [
            f"--{STREAM_UPLOAD_BOUNDARY}",
            f"Content-Type: {content_type}",
            f"Content-Length: {len(image_bytes)}",
            f"X-Guaita-Captured-At: {captured_at or datetime.now(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')}",
            f"X-Guaita-Bounding-Boxes-Enabled: {'true' if bbox_state else 'false'}",
        ]
        if frame_width is not None and frame_height is not None:
            headers.append(f"X-Guaita-Frame-Width: {frame_width}")
            headers.append(f"X-Guaita-Frame-Height: {frame_height}")
        if boxes:
            headers.append(f"X-Guaita-Boxes: {json.dumps(boxes, separators=(',', ':'))}")

        posted_stream_sequence = sequence
        last_stream_frame_post = now
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8") + image_bytes + b"\r\n"
    except Exception as e:
        print(f"[stream] frame build failed: {e}")
        return None

def stream_frame_parts(state_session):
    global last_stream_poll

    frame_count = 0
    while stream_active:
        now = time.time()
        if now - last_stream_poll >= STREAM_ACTIVE_POLL_INTERVAL:
            poll_stream_state(state_session)
            last_stream_poll = now
            if not stream_active:
                break

        part = build_stream_frame_part()
        if part is None:
            time.sleep(STREAM_WORKER_SLEEP)
            continue

        frame_count += 1
        if frame_count == 1 or frame_count % 10 == 0:
            print(f"[stream] pipe sent frames={frame_count}")
        yield part

    yield f"--{STREAM_UPLOAD_BOUNDARY}--\r\n".encode("utf-8")

def stream_worker_loop():
    global last_stream_poll, stream_active

    state_session = requests.Session()
    upload_session = requests.Session()

    while True:
        now = time.time()

        if not stream_active and now - last_stream_poll >= STREAM_IDLE_POLL_INTERVAL:
            poll_stream_state(state_session)
            last_stream_poll = now

        if not stream_active:
            time.sleep(STREAM_WORKER_SLEEP)
            continue

        try:
            print("[stream] opening persistent frame pipe")
            r = upload_session.post(
                f"{SERVER_URL}/api/device/stream-frames/pipe",
                params={"stationId": STATION_ID},
                data=stream_frame_parts(state_session),
                headers={
                    "Authorization": f"Bearer {DEVICE_TOKEN}",
                    "Content-Type": f"multipart/x-mixed-replace; boundary={STREAM_UPLOAD_BOUNDARY}",
                },
                timeout=(STREAM_CONNECT_TIMEOUT, 5.0),
            )
            print(f"[stream] pipe closed status={r.status_code} body={r.text}")
        except Exception as e:
            print(f"[stream] pipe failed: {e}")
            stream_active = False

        time.sleep(STREAM_WORKER_SLEEP)

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
        print(f"[state] active={active}, show_bbox={show_bounding_boxes}, stream={stream_active}, metrics={latest_metrics}")
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

threading.Thread(target=stream_worker_loop, daemon=True).start()
App.run(user_loop=loop)
