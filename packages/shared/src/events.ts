export const SOCKET_EVENTS = {
  detectionCreated: "detection.created",
  eventsCleared: "events.cleared",
  alertCreated: "alert.created",
  actionCreated: "action.created",
  actionUpdated: "action.updated",
  stationUpdated: "station.updated",
  scenarioStarted: "scenario.started",
  scenarioPaused: "scenario.paused",
  scenarioResumed: "scenario.resumed",
  scenarioAdvanced: "scenario.advanced",
  scenarioReset: "scenario.reset",
  scenarioUpdated: "scenario.updated"
} as const;
