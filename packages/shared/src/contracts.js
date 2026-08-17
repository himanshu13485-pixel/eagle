"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RT_EVENTS = exports.DEFAULT_AGENT_CONFIG = void 0;
const enums_1 = require("./enums");
exports.DEFAULT_AGENT_CONFIG = {
    periodicScreenshots: true,
    screenshotIntervalMin: 10,
    appSwitchScreenshots: true,
    appSwitchDelayMin: 1,
    webcamPhotos: false,
    idleAfterMin: 5,
    trackingMode: enums_1.TrackingMode.VISIBLE,
    strictTimeTracking: true,
    heartbeatSec: 20,
};
exports.RT_EVENTS = {
    presence: "presence.updated",
    screenshotCreated: "screenshot.created",
    liveFrame: "live.frame",
    liveEnded: "live.ended",
    join: "join",
    liveWatch: "live.watch",
    deviceJoin: "device.join",
    liveStart: "live.start",
    liveStop: "live.stop",
};
//# sourceMappingURL=contracts.js.map