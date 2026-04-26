# SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
#
# SPDX-License-Identifier: MPL-2.0
from io import BytesIO

from arduino.app_utils.image import compress_to_jpeg, get_image_bytes, resize

try:
    from PIL import Image, ImageDraw
except Exception:
    Image = None
    ImageDraw = None


def image_content_type(image_bytes: bytes):
    if image_bytes is None:
        return None
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return None


def jpeg_upload_image(image_bytes: bytes, max_width: int, quality: int):
    content_type = image_content_type(image_bytes)
    if content_type is None:
        return None, None

    if content_type == "image/jpeg" or Image is None:
        return image_bytes, content_type

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.thumbnail((max_width, max_width))
            if image.mode != "RGB":
                image = image.convert("RGB")

            output = BytesIO()
            image.save(output, format="JPEG", quality=quality, optimize=False)
            jpeg_bytes = output.getvalue()
            if len(jpeg_bytes) < len(image_bytes):
                return jpeg_bytes, "image/jpeg"
    except Exception as e:
        print(f"[stream] jpeg conversion skipped: {e}")

    return image_bytes, content_type


def _bytes_from_encoded_image(encoded_image):
    if encoded_image is None:
        return None
    if isinstance(encoded_image, bytes):
        return encoded_image
    tobytes = getattr(encoded_image, "tobytes", None)
    if callable(tobytes):
        return tobytes()
    try:
        return bytes(encoded_image)
    except Exception:
        return None


def encode_upload_image(frame: bytes, max_width: int, quality: int):
    if isinstance(frame, (bytes, bytearray)):
        return jpeg_upload_image(bytes(frame), max_width, quality)

    shape = getattr(frame, "shape", None)
    if shape is not None and len(shape) >= 2:
        stream_frame = frame
        height = int(shape[0])
        width = int(shape[1])

        if width > max_width:
            target_height = max(1, int(height * (max_width / width)))
            stream_frame = resize(frame, (max_width, target_height), maintain_ratio=False)

        jpeg_bytes = _bytes_from_encoded_image(compress_to_jpeg(stream_frame, quality=quality))
        if jpeg_bytes:
            return jpeg_bytes, "image/jpeg"

    image_bytes = get_image_bytes(frame)
    return jpeg_upload_image(image_bytes, max_width, quality)


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


def extract_detection_boxes(detections: dict):
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
                if isinstance(source, (list, tuple)) and len(source) >= 4:
                    source = {
                        "x": source[0],
                        "y": source[1],
                        "width": source[2],
                        "height": source[3],
                    }
                else:
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

            xyxy = value.get("bounding_box_xyxy")
            if isinstance(xyxy, (list, tuple)) and len(xyxy) >= 4:
                source = {
                    **source,
                    "x": xyxy[0],
                    "y": xyxy[1],
                    "x2": xyxy[2],
                    "y2": xyxy[3],
                }
            else:
                xyxy = value.get("bbox_xyxy")
                if isinstance(xyxy, (list, tuple)) and len(xyxy) >= 4:
                    source = {
                        **source,
                        "x": xyxy[0],
                        "y": xyxy[1],
                        "x2": xyxy[2],
                        "y2": xyxy[3],
                    }

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


def _box_to_pixel_rect(box: dict, width: int, height: int):
    max_box_value = max(abs(box["x"]), abs(box["y"]), abs(box["width"]), abs(box["height"]))
    is_normalized = max_box_value <= 1.5

    x = box["x"] * width if is_normalized else box["x"]
    y = box["y"] * height if is_normalized else box["y"]
    box_width = box["width"] * width if is_normalized else box["width"]
    box_height = box["height"] * height if is_normalized else box["height"]

    x1 = max(0, min(width - 1, int(round(x))))
    y1 = max(0, min(height - 1, int(round(y))))
    x2 = max(0, min(width - 1, int(round(x + box_width))))
    y2 = max(0, min(height - 1, int(round(y + box_height))))

    if x2 <= x1 or y2 <= y1:
        return None

    return x1, y1, x2, y2


def _box_label(box: dict):
    confidence = box.get("confidence")
    if confidence is not None:
        return f"{int(round(confidence * 100))}%"

    return box.get("label") or "boar"


def _draw_boxes_on_array(frame, boxes, box_color, thickness):
    shape = getattr(frame, "shape", None)
    if shape is None or len(shape) < 2:
        return None

    height = int(shape[0])
    width = int(shape[1])
    if width <= 0 or height <= 0:
        return None

    copy_frame = getattr(frame, "copy", None)
    annotated = copy_frame() if callable(copy_frame) else frame
    thickness = max(1, min(thickness, width, height))
    channels = int(shape[2]) if len(shape) >= 3 else 1

    if channels <= 1:
        color = 255
    else:
        color_values = list(box_color[: min(channels, 3)])
        if channels > 3:
            color_values.extend([255] * (channels - 3))
        color = color_values

    for box in boxes:
        rect = _box_to_pixel_rect(box, width, height)
        if rect is None:
            continue

        x1, y1, x2, y2 = rect
        annotated[y1 : min(height, y1 + thickness), x1 : x2 + 1] = color
        annotated[max(0, y2 - thickness + 1) : y2 + 1, x1 : x2 + 1] = color
        annotated[y1 : y2 + 1, x1 : min(width, x1 + thickness)] = color
        annotated[y1 : y2 + 1, max(0, x2 - thickness + 1) : x2 + 1] = color

    return annotated


def _draw_boxes_on_encoded_image(
    frame,
    boxes,
    max_width: int,
    quality: int,
    box_color,
    box_label_color,
    thickness: int,
):
    if Image is None or ImageDraw is None:
        return None

    image_bytes = bytes(frame) if isinstance(frame, (bytes, bytearray)) else get_image_bytes(frame)
    if image_content_type(image_bytes) is None:
        return None

    with Image.open(BytesIO(image_bytes)) as source_image:
        image = source_image.convert("RGB")

    width, height = image.size
    draw = ImageDraw.Draw(image)
    for box in boxes:
        rect = _box_to_pixel_rect(box, width, height)
        if rect is None:
            continue

        draw.rectangle(rect, outline=box_color, width=thickness)
        label = _box_label(box)
        if label:
            text_x, text_y = rect[0], max(0, rect[1] - 16)
            try:
                label_rect = draw.textbbox((text_x, text_y), label)
                draw.rectangle(label_rect, fill=box_color)
            except Exception:
                pass
            draw.text((text_x + 2, text_y), label, fill=box_label_color)

    image.thumbnail((max_width, max_width))
    output = BytesIO()
    image.save(output, format="JPEG", quality=quality, optimize=False)
    return output.getvalue()


def draw_boxes_on_frame(
    frame,
    detections: dict,
    max_width: int,
    quality: int,
    box_color,
    box_label_color,
    thickness: int,
):
    boxes = extract_detection_boxes(detections)
    if not boxes:
        return frame, boxes

    try:
        annotated_array = _draw_boxes_on_array(frame, boxes, box_color, thickness)
        if annotated_array is not None:
            return annotated_array, boxes
    except Exception as e:
        print(f"[DETECTION] array bounding-box draw skipped: {e}")

    try:
        annotated_bytes = _draw_boxes_on_encoded_image(
            frame,
            boxes,
            max_width,
            quality,
            box_color,
            box_label_color,
            thickness,
        )
        if annotated_bytes is not None:
            return annotated_bytes, boxes
    except Exception as e:
        print(f"[DETECTION] encoded bounding-box draw skipped: {e}")

    return frame, boxes
