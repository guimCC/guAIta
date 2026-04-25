// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0
#include "Arduino_RouterBridge.h"
#include <Modulino.h>

ModulinoThermo thermo;

bool set_led_state(bool state) {
    digitalWrite(LED_BUILTIN, state ? LOW : HIGH);
    return true;
}

float get_temperature() {
    if (thermo.available()) {
        return thermo.getTemperature();
    }
    return -999.0; // sentinel: Python side should treat this as None
}

float get_humidity() {
    if (thermo.available()) {
        return thermo.getHumidity();
    }
    return -999.0;
}

void setup() {
    pinMode(LED_BUILTIN, OUTPUT);
    Modulino.begin();
    thermo.begin();
    Bridge.begin();
    Bridge.provide("set_led_state", set_led_state);
    Bridge.provide("get_temperature", get_temperature);
    Bridge.provide("get_humidity", get_humidity);
}

void loop() {
    // Bridge handles everything in the background
}