# HackUPC 2026: EdgeAI for a Resilient and Greener Barcelona - Challenge Statement

## 1. The Core Challenge
Barcelona is facing increasing climate challenges: pollution, extreme heatwaves, loss of biodiversity, and water scarcity. This hackathon challenges you to use **EdgeAI** to build a more resilient city. By leveraging **Qualcomm** technologies, you will create on-device decision-making systems that monitor, protect, and enhance our urban environment in real-time, reducing dependence on centralized cloud infrastructure.

## 2. Application Areas & Project Ideas

### Water Scarcity & Management
* **Smart Showers:** Detect and alert if beach showers are left running unnecessarily.
* **Smart Irrigation:** Use FOMO (Object Detection) to assess plant health and soil stress, ensuring water is used only when and where the greenery actually needs it.

### Urban and Coastal Cleanliness
Keep streets, parks, and beaches clean using EdgeAI.
* **Smart Bin & Dumping Monitor:** Use cameras to detect when bins are full or to identify illegal waste dumping in real-time.
* **Beach & Street Optimizer:** Use vision to identify plastic waste on the sand or measure dirt levels on streets via bike-mounted cameras to optimize cleaning routes.

## 3. Judging Criteria
* **Creativity & Relevance:** Originality of the solution for Barcelona's green challenges.
* **Technical Execution:** Efficiency of the EdgeAI model (latency, accuracy).
* **Impact & Scalability:** Potential for real-world deployment in public spaces.

## 4. Hardware Kit & Resources
Each team receives a specialized Edge AI Kit containing:
* **Brain:** Arduino UNO Q.
* **Vision:** USB Web Camera.
* **Sensors and Actuators:** Arduino Modulino Nodes, including plug-and-play components like the Modulino Movement (Accelerometer & Gyroscope) and Modulino Thermo (Temperature & Humidity).
* **Accessories:** USB Type-C cable, QWIIC cables (for daisy-chaining sensors via I2C), and a USB Type-C Hub.

## 5. Technical Architecture & Development
* **Dual-Brain Architecture:** The Arduino UNO Q features a unique "Linux Meets Arduino" architecture. It pairs a Qualcomm® Dragonwing™ QRB2210 (MPU running Linux Debian OS) with an STM32U585 (MCU running the Arduino Core and Sketch).
* **Arduino App Lab:** A development environment that combines Arduino sketches, Python scripts, and AI models into ready-to-run apps. It features "Bricks" (ready-to-use software components) and allows for both Standalone and PC-Connected setups.
* **The Bridge (MPU-MCU Communication):** The system uses "The Bridge" protocol to allow Python scripts on the Linux MPU to control hardware on the Arduino MCU using Remote Procedure Calls (RPC).
* **Edge AI:** Leverage Edge Impulse to build, train, and deploy machine learning models directly on the device, such as using the Modulino Movement to classify continuous motion states (e.g., Up/Down, Snake, Wave, and Idle).
