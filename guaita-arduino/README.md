# guAIta — Edge AI Station

> On-device wild boar detection for the Collserola Natural Park, powered by Arduino UNO Q and Edge Impulse.

---

## What This Is

This is the edge layer of the guAIta system. Each station is a low-cost, self-contained device that runs a computer vision model locally, reads environmental sensors, and sends compact event metadata to the central server — no video streaming, no cloud inference.

The key principle is **on-edge decision-making**: the device decides whether a wild boar is present before anything leaves the station. The server only receives meaningful events.

---

## Hardware

| Component | Role |
|---|---|
| Arduino UNO Q | Main board — runs Linux (MPU) + Arduino sketch (MCU) in parallel |
| USB Web Camera | Vision input for the object detection model |
| Modulino Thermo | Temperature and humidity readings |
| Modulino Light | Ambient light level (lux) — used to infer time of day and visibility conditions |
| Modulino Distance | Time-of-Flight proximity sensor — detects presence before full vision inference |
| Modulino Buttons | Physical controls for the operator (see below) |

The Arduino UNO Q's dual-brain architecture is central to the design:

- The **Linux MPU** (Qualcomm QRB2210) runs the Python app, the Edge Impulse vision model, and all network communication.
- The **Arduino MCU** (STM32U585) handles real-time hardware control: sensors, LEDs, buttons.
- The two sides communicate via **The Bridge**, a Remote Procedure Call (RPC) protocol that lets Python call Arduino functions directly, such as reading a sensor or toggling an LED.

---

## On-Edge AI: How Detection Works

The vision model runs entirely on the device using the **Edge Impulse** platform. No frames are sent to the server for inference.

### Model

- Trained on a custom dataset of wild boar images using Edge Impulse's FOMO object detection pipeline.
- Deployed as an `.eim` file directly on the device.
- Class label `"0"` = `wild_boar` (as trained).

### Sliding Window Confidence Filter

A single-frame detection is not enough to trigger an alert. The system uses a **sliding window** over the last `THR_FRAMES` frames (default: 20) and only fires when the **average confidence** across that window exceeds `CONFIDENCE_THR` (default: 0.7).

This means:
- A boar walking briefly through frame does not trigger an alert.
- A boar that is genuinely present for a sustained period does.
- Occasional missed frames (occluded, low light) do not reset the window — they contribute `0.0` to the average, naturally pulling the score down without discarding all prior evidence.

```
Frame 1:  confidence 0.82  →  window: [0.82]
Frame 2:  confidence 0.79  →  window: [0.82, 0.79]
...
Frame 18: confidence 0.00  →  window: [..., 0.00]   ← boar briefly obscured
Frame 19: confidence 0.85  →  window: [..., 0.85]
Frame 20: confidence 0.88  →  window full, avg = 0.74 ≥ 0.70 → FIRE
```

The model runs at a low per-frame confidence gate (`confidence=0.15`) so that nearly all candidate frames enter the window, while the sliding average is the meaningful quality bar.

### What Gets Sent

When the window threshold is crossed, the device sends a **single POST** to the server with:

- Station ID, timestamp, species, confidence score
- Bounding box coordinates
- Environmental telemetry at the moment of detection (temperature, humidity, light, distance)
- An annotated JPEG snapshot with the model's bounding boxes
- Model metadata (name, version)

No video is ever streamed. The entire detection pipeline — inference, filtering, decision — runs locally.

---

## Environmental Sensors

Sensor readings are collected every loop cycle and sent in two ways:

1. **Attached to detection events** — every boar alert includes the current environmental context. This enables future analysis of boar activity patterns relative to temperature, time of day (via light lux), and proximity.

2. **Periodic telemetry POST** — regardless of detections, the device sends a status update every 30 seconds to the `/api/device/telemetry` endpoint. This keeps the server aware of device health and environmental conditions even during quiet periods.

| Metric | Source | Use |
|---|---|---|
| `temperatureC` | Modulino Thermo | Environmental context, device health |
| `humidityPct` | Modulino Thermo | Environmental context |
| `lightLux` | Modulino Light | Time-of-day proxy, visibility estimation |
| `distanceMm` | Modulino Distance | Proximity confirmation, future motion pre-trigger |

---

## Physical Controls (Modulino Buttons)

The station is designed to be operated in the field without a laptop.

| Button | Function | LED Feedback |
|---|---|---|
| **A** | Toggle station active / standby | LED A on = active, off = standby |
| **B** | Reserved for future demo controls | LED B stays on = boxes always enabled |

**Standby mode** (button A off): sensors are still read, but no detection events or telemetry are posted. The built-in LED stops blinking.

**Active mode** (button A on): full pipeline runs — sliding window inference, telemetry POSTs every 30s, detection events on threshold crossing. The built-in LED blinks continuously.

**Bounding boxes**: snapshots and live stream metadata always include the model's bounding boxes when detections provide them. Button B is intentionally not used for this in the demo so every capture keeps visual evidence.

---

## What This Data Enables

Even beyond real-time alerts, the data collected by each station is useful for:

- **Boar behaviour patterns** — time of day (via light lux), temperature and humidity correlations with activity levels, movement frequency over time.
- **Zone risk calibration** — stations near urban boundaries vs. deep forest will accumulate different detection densities, which can be used to adjust alert severity thresholds per zone.
- **Device health monitoring** — periodic telemetry lets the server flag stations that have gone silent, are overheating, or are in unusually dark conditions (camera obstructed).
- **Seasonal and climate analysis** — long-term temperature and humidity data from multiple stations across Collserola can correlate boar movement with climate events, supporting public health and wildlife management decisions.

---

## Architecture Summary

```
┌─────────────────────────────────────────┐
│           Arduino UNO Q                 │
│                                         │
│  ┌─────────────┐     ┌───────────────┐  │
│  │  Linux MPU  │     │  Arduino MCU  │  │
│  │             │◄───►│               │  │
│  │  Python app │RPC  │  sketch.ino   │  │
│  │  Vision AI  │     │  Sensors      │  │
│  │  HTTP POST  │     │  LEDs/Buttons │  │
│  └──────┬──────┘     └───────────────┘  │
│         │ USB Camera                    │
└─────────┼───────────────────────────────┘
          │ JPEG frames (local only)
          ▼
    [Edge Impulse model]
          │ confidence scores
          ▼
    [Sliding window filter]
          │ threshold crossed
          ▼
    POST /api/device/events
    POST /api/device/telemetry
          │
          ▼
    [guAIta Server → Dashboard]
```

---

## Configuration

All deployment-specific settings live at the top of `main.py` — no recompilation needed to change server URL, station ID, or thresholds:

```python
SERVER_URL      = "https://..."       # server tunnel or local dev URL
DEVICE_TOKEN    = "demo-device-token"
STATION_ID      = "collserola-control-02"
CONFIDENCE_THR  = 0.7                 # average confidence to trigger alert
THR_FRAMES      = 20                  # sliding window size
METRICS_INTERVAL = 30                 # seconds between telemetry POSTs
```
