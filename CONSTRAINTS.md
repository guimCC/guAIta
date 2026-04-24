# Hackathon Constraints

Source: `Qualcomm - Slack Announcement.docx.pdf`

## Event Theme

HackUPC 2026 challenges teams to build Edge AI systems for a more resilient and greener Barcelona.

The project should address urban environmental resilience topics such as pollution, heatwaves, biodiversity loss, water scarcity, cleanliness, or related city-scale green challenges.

## Core Technical Requirements

- Use Edge AI as the central technical approach.
- Use the Arduino UNO Q and Edge Impulse.
- Collect and process local sensor or camera data on-device.
- Run inference locally on the device.
- Support autonomous decisions and local actions.
- Account for real-world edge constraints, including limited power, memory, and connectivity.
- Reduce dependence on centralized cloud infrastructure.

## Provided Hardware And Software

Each team receives an Edge AI kit with:

- Arduino UNO Q.
- USB web camera.
- Arduino Modulino nodes:
  - Movement.
  - Distance.
  - Thermo.
  - Vibro.
  - Light.
  - Knob.
  - Button.
  - Buzzer.
  - Pixels.
- QWIIC cables.
- USB hub.
- Power supply.
- USB-C cables.
- Arduino App Lab IDE.
- Edge Impulse Studio.

## Submission Requirements

The project must be submitted in all three required locations. Missing any step disqualifies the team from judging.

1. Devpost
   - Register the project on the official HackUPC 2026 Devpost page: https://hackupc-2026.devpost.com/
   - Include the project summary, team members, GitHub repository link, and Arduino Project Hub link.

2. GitHub repository
   - Upload the complete project to a public GitHub account.
   - Include all App Lab application files, including `main.py`, `sketch.ino`, and YAML configs.
   - Include a clear and comprehensive `README.md`.
   - Include a `LICENSE.txt` file using Mozilla Public License 2.0.

3. Arduino Project Hub
   - Create a project page on https://projecthub.arduino.cc/
   - Use the required naming convention: `[HackUPC2026] - Your Project Name`
   - Include:
     - Project description.
     - Hardware lineup.
     - AI model details.
     - Software architecture.
     - Visuals and media.
     - GitHub link.

## Schedule And Deadlines

- Hacking start: April 24, 2026 at 8:30 PM.
- Tech workshops: April 25, 2026 from 10:00 AM to 1:00 PM.
- Hacking stop: April 26, 2026 at 9:00 AM.
- Mandatory submission deadline: April 26, 2026 at 9:15 AM.
- Judging session: April 26, 2026 from 10:15 AM to 1:15 PM.
- Closing ceremony and awards: April 26, 2026 at 3:00 PM.

## Judging Criteria

- Creativity and relevance: originality of the solution for Barcelona's green challenges.
- Technical execution: Edge AI model efficiency, especially latency and accuracy.
- Impact and scalability: real-world deployment potential in public spaces.

## Implications For guAIta

- The boar detection demo must clearly show that detection or classification happens on the Arduino UNO Q, not only on the server.
- The server and dashboard should support the story, but the edge device is the required technical centerpiece.
- The project should document how it uses the provided camera and any relevant Modulino sensors.
- The final README should explain the hardware setup, model, local inference path, event flow, and demo workflow.
- The repo needs a `LICENSE.txt` with MPL-2.0 before submission.
- The Arduino Project Hub page needs images or a short demo video, so the team should capture media during the build.
