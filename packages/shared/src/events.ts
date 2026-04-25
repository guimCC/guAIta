export const SOCKET_EVENTS = {
  detectionCreated: "detection.created",
  alertCreated: "alert.created",
  actionCreated: "action.created",
  actionUpdated: "action.updated",
  stationUpdated: "station.updated",
  scenarioStarted: "scenario.started",
  scenarioPaused: "scenario.paused",
  scenarioResumed: "scenario.resumed",
  scenarioAdvanced: "scenario.advanced",
  scenarioReset: "scenario.reset"
} as const;
