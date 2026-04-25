// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

#include "Arduino_RouterBridge.h"

// 1. Define the function BEFORE setup() so the compiler recognizes it.
// 2. Change 'void' to 'bool' so the Bridge knows what to return to Python.
bool set_led_state(bool state) {
    // LOW state means LED is ON
    digitalWrite(LED_BUILTIN, state ? LOW : HIGH);
    
    return true; // Return a success signal back across the bridge
}

void setup() {
    pinMode(LED_BUILTIN, OUTPUT);

    Bridge.begin();
    
    // The compiler now successfully recognizes the function
    Bridge.provide("set_led_state", set_led_state);
}

void loop() {
    // The Bridge handles everything automatically in the background
}