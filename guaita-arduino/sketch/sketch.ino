// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0
#include "Arduino_RouterBridge.h"
#include <Modulino.h>

ModulinoThermo thermo;
ModulinoLight light;
ModulinoDistance distance;

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
    return distance.get();
}


void setup() {
    pinMode(LED_BUILTIN, OUTPUT);
    Modulino.begin();
    thermo.begin();
    light.begin();
    distance.begin();
    Bridge.begin();
    Bridge.provide("set_led_state", set_led_state);
    Bridge.provide("get_temperature", get_temperature);
    Bridge.provide("get_humidity", get_humidity);
    Bridge.provide("get_light", get_light);
    Bridge.provide("get_distance", get_distance);
}

void loop() {
    // Bridge handles everything in the background
}