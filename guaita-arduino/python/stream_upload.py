# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from datetime import datetime, UTC
import json
import threading
import time

import requests

from image_utils import extract_detection_boxes, frame_dimensions


STREAM_ACTIVE_POLL_INTERVAL = 1.0
STREAM_IDLE_POLL_INTERVAL = 2.0
STREAM_FRAME_INTERVAL = 0.5
STREAM_CONNECT_TIMEOUT = 0.5
STREAM_READ_TIMEOUT = 1.2
STREAM_WORKER_SLEEP = 0.03
STREAM_WAIT_PRINT_INTERVAL = 2.0
STREAM_UPLOAD_BOUNDARY = "guaita-upload-frame"
STREAM_PIPE_MAX_SECONDS = 45.0


def _utc_timestamp():
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class StreamUploader:
    def __init__(
        self,
        server_url: str,
        device_token: str,
        station_id: str,
        encode_upload_image,
        image_max_width: int,
        image_quality: int,
        get_bbox_enabled,
        get_latest_fallback,
    ):
        self.server_url = server_url
        self.device_token = device_token
        self.station_id = station_id
        self.encode_upload_image = encode_upload_image
        self.image_max_width = image_max_width
        self.image_quality = image_quality
        self.get_bbox_enabled = get_bbox_enabled
        self.get_latest_fallback = get_latest_fallback

        self.active = False
        self.frame_interval = STREAM_FRAME_INTERVAL
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_detections = None
        self.latest_captured_at = None
        self.latest_bbox_state = False
        self.latest_sequence = 0
        self.posted_sequence = 0
        self.last_poll = 0
        self.last_frame_post = 0
        self.last_wait_print = 0

    def poll_state(self, session=None):
        client = session or requests
        try:
            r = client.get(
                f"{self.server_url}/api/device/stream-state",
                params={"stationId": self.station_id},
                headers={
                    "Authorization": f"Bearer {self.device_token}",
                    "Content-Type": "application/json",
                },
                timeout=(STREAM_CONNECT_TIMEOUT, STREAM_READ_TIMEOUT),
            )
            if r.status_code != 200:
                print(f"[stream] state status={r.status_code} body={r.text}")
                return

            stream = r.json().get("stream", {})
            self.active = bool(stream.get("active"))
            frame_interval_ms = stream.get("frameIntervalMs")
            if isinstance(frame_interval_ms, (int, float)) and frame_interval_ms > 0:
                self.frame_interval = max(0.25, frame_interval_ms / 1000.0)

            print(f"[stream] active={self.active} interval={self.frame_interval:.2f}s")
        except Exception as e:
            print(f"[stream] state poll failed: {e}")

    def capture_frame(self, frame: bytes, detections: dict = None):
        if not self.active or frame is None:
            return

        with self.lock:
            self.latest_frame = frame
            self.latest_detections = detections
            self.latest_captured_at = _utc_timestamp()
            self.latest_bbox_state = bool(self.get_bbox_enabled())
            self.latest_sequence += 1

    def attach_camera_tap(self, detection_stream, on_frame=None, get_latest_detections=None):
        camera = getattr(detection_stream, "_camera", None)
        capture = getattr(camera, "capture", None)

        if camera is None or not callable(capture):
            print("[stream] camera tap unavailable; live stream will wait for detection callback frames")
            return

        def capture_with_stream_tap(*args, **kwargs):
            frame = capture(*args, **kwargs)
            if frame is not None:
                if on_frame is not None:
                    on_frame(frame)
                detections = get_latest_detections() if get_latest_detections is not None else None
                self.capture_frame(frame, detections)
            return frame

        setattr(camera, "capture", capture_with_stream_tap)
        print("[stream] camera tap attached")

    def build_frame_part(self):
        now = time.time()
        if now - self.last_frame_post < self.frame_interval:
            return None

        with self.lock:
            frame = self.latest_frame
            detections = self.latest_detections
            captured_at = self.latest_captured_at
            bbox_state = self.latest_bbox_state
            sequence = self.latest_sequence

        if frame is None:
            frame, detections = self.get_latest_fallback()
            if frame is not None:
                captured_at = _utc_timestamp()
                bbox_state = bool(self.get_bbox_enabled())
                sequence = -1

        if frame is None:
            if now - self.last_wait_print >= STREAM_WAIT_PRINT_INTERVAL:
                print("[stream] active but no camera frame has reached the detection callback yet")
                self.last_wait_print = now
            return None

        if sequence == self.posted_sequence and sequence != -1:
            return None

        try:
            image_bytes, content_type = self.encode_upload_image(
                frame,
                self.image_max_width,
                self.image_quality,
            )
            if content_type is None:
                print("[stream] skipped frame: camera image bytes are not JPEG or PNG")
                return None

            frame_width, frame_height = frame_dimensions(frame)
            boxes = extract_detection_boxes(detections) if bbox_state else []
            headers = [
                f"--{STREAM_UPLOAD_BOUNDARY}",
                f"Content-Type: {content_type}",
                f"Content-Length: {len(image_bytes)}",
                f"X-Guaita-Captured-At: {captured_at or _utc_timestamp()}",
                f"X-Guaita-Bounding-Boxes-Enabled: {'true' if bbox_state else 'false'}",
            ]
            if frame_width is not None and frame_height is not None:
                headers.append(f"X-Guaita-Frame-Width: {frame_width}")
                headers.append(f"X-Guaita-Frame-Height: {frame_height}")
            if boxes:
                headers.append(f"X-Guaita-Boxes: {json.dumps(boxes, separators=(',', ':'))}")

            self.posted_sequence = sequence
            self.last_frame_post = now
            return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8") + image_bytes + b"\r\n"
        except Exception as e:
            print(f"[stream] frame build failed: {e}")
            return None

    def frame_parts(self, state_session):
        frame_count = 0
        started_at = time.time()
        while self.active:
            now = time.time()
            if now - started_at >= STREAM_PIPE_MAX_SECONDS:
                print("[stream] rotating persistent frame pipe")
                break

            if now - self.last_poll >= STREAM_ACTIVE_POLL_INTERVAL:
                self.poll_state(state_session)
                self.last_poll = now
                if not self.active:
                    break

            part = self.build_frame_part()
            if part is None:
                time.sleep(STREAM_WORKER_SLEEP)
                continue

            frame_count += 1
            if frame_count == 1 or frame_count % 10 == 0:
                print(f"[stream] pipe sent frames={frame_count}")
            yield part

        yield f"--{STREAM_UPLOAD_BOUNDARY}--\r\n".encode("utf-8")

    def worker_loop(self):
        state_session = requests.Session()
        upload_session = requests.Session()

        while True:
            now = time.time()

            if not self.active and now - self.last_poll >= STREAM_IDLE_POLL_INTERVAL:
                self.poll_state(state_session)
                self.last_poll = now

            if not self.active:
                time.sleep(STREAM_WORKER_SLEEP)
                continue

            try:
                print("[stream] opening persistent frame pipe")
                r = upload_session.post(
                    f"{self.server_url}/api/device/stream-frames/pipe",
                    params={"stationId": self.station_id},
                    data=self.frame_parts(state_session),
                    headers={
                        "Authorization": f"Bearer {self.device_token}",
                        "Content-Type": f"multipart/x-mixed-replace; boundary={STREAM_UPLOAD_BOUNDARY}",
                    },
                    timeout=(STREAM_CONNECT_TIMEOUT, 5.0),
                )
                print(f"[stream] pipe closed status={r.status_code} body={r.text}")
                if r.status_code >= 400:
                    upload_session.close()
                    upload_session = requests.Session()
            except Exception as e:
                print(f"[stream] pipe failed: {e}")
                upload_session.close()
                upload_session = requests.Session()
                self.active = False

            time.sleep(STREAM_WORKER_SLEEP)
