// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0
#include "Arduino_RouterBridge.h"
#include <Modulino.h>

ModulinoThermo thermo;
ModulinoLight light;
ModulinoDistance distance;
ModulinoButtons buttons;

bool active = false;
bool lastPressed = false;

bool set_led_state(bool state) {
    digitalWrite(LED_BUILTIN, state ? LOW : HIGH);
    return true;
}

float get_temperature() {
    return thermo.getTemperature();
}

float get_humidity() {
    return thermo.getHumidity();
}

float get_light() {
    light.update();
    return light.getLux();
}

float get_distance() {
    if (!distance.available()) return -1.0;
    int d = distance.get();
    if (d < 0) return -1.0;
    return (float)d;
}

// Called by Python every loop — handles toggle logic internally
bool get_active_state() {
    buttons.update();
    bool pressed = buttons.isPressed(0);  // Button A
    if (pressed && !lastPressed) {        // Rising edge only
        active = !active;
        buttons.setLeds(active, false, false);  // LED A mirrors active state
    }
    lastPressed = pressed;
    return active;
}

void setup() {
    pinMode(LED_BUILTIN, OUTPUT);
    Modulino.begin();
    thermo.begin();
    light.begin();
    distance.begin();
    buttons.begin();
    Bridge.begin();
    Bridge.provide("set_led_state", set_led_state);
    Bridge.provide("get_temperature", get_temperature);
    Bridge.provide("get_humidity", get_humidity);
    Bridge.provide("get_light", get_light);
    Bridge.provide("get_distance", get_distance);
    Bridge.provide("get_active_state", get_active_state);
}

void loop() {
    // Bridge handles everything in the background
}