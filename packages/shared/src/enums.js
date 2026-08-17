"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingMode = exports.DevicePlatform = exports.BillingCycle = exports.PlanTier = exports.UsageType = exports.ScreenshotTrigger = exports.PresenceStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "OWNER";
    UserRole["ADMIN"] = "ADMIN";
    UserRole["MANAGER"] = "MANAGER";
    UserRole["TEAM_LEAD"] = "TEAM_LEAD";
})(UserRole || (exports.UserRole = UserRole = {}));
var PresenceStatus;
(function (PresenceStatus) {
    PresenceStatus["ACTIVE"] = "ACTIVE";
    PresenceStatus["IDLE"] = "IDLE";
    PresenceStatus["OFFLINE"] = "OFFLINE";
    PresenceStatus["INVITED"] = "INVITED";
})(PresenceStatus || (exports.PresenceStatus = PresenceStatus = {}));
var ScreenshotTrigger;
(function (ScreenshotTrigger) {
    ScreenshotTrigger["PERIODIC"] = "PERIODIC";
    ScreenshotTrigger["APP_SWITCH"] = "APP_SWITCH";
    ScreenshotTrigger["WEBCAM"] = "WEBCAM";
    ScreenshotTrigger["ON_DEMAND"] = "ON_DEMAND";
})(ScreenshotTrigger || (exports.ScreenshotTrigger = ScreenshotTrigger = {}));
var UsageType;
(function (UsageType) {
    UsageType["APP"] = "APP";
    UsageType["WEB"] = "WEB";
})(UsageType || (exports.UsageType = UsageType = {}));
var PlanTier;
(function (PlanTier) {
    PlanTier["BASIC"] = "BASIC";
    PlanTier["PROFESSIONAL"] = "PROFESSIONAL";
    PlanTier["BUSINESS"] = "BUSINESS";
})(PlanTier || (exports.PlanTier = PlanTier = {}));
var BillingCycle;
(function (BillingCycle) {
    BillingCycle["MONTHLY"] = "MONTHLY";
    BillingCycle["ANNUALLY"] = "ANNUALLY";
})(BillingCycle || (exports.BillingCycle = BillingCycle = {}));
var DevicePlatform;
(function (DevicePlatform) {
    DevicePlatform["WINDOWS"] = "WINDOWS";
    DevicePlatform["MAC"] = "MAC";
    DevicePlatform["LINUX"] = "LINUX";
})(DevicePlatform || (exports.DevicePlatform = DevicePlatform = {}));
var TrackingMode;
(function (TrackingMode) {
    TrackingMode["VISIBLE"] = "VISIBLE";
    TrackingMode["RESTRICTED"] = "RESTRICTED";
})(TrackingMode || (exports.TrackingMode = TrackingMode = {}));
//# sourceMappingURL=enums.js.map