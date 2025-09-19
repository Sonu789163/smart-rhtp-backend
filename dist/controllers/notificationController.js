"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationController = void 0;
const Notification_1 = require("../models/Notification");
exports.notificationController = {
    async list(req, res) {
        var _a, _b, _c;
        try {
            const { unread, page, pageSize } = (req.query || {});
            const filter = { userId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b), domain: req.userDomain };
            if (String(unread) === "true")
                filter.isRead = false;
            const p = Math.max(parseInt(page || "1", 10), 1);
            const ps = Math.min(Math.max(parseInt(pageSize || "20", 10), 1), 100);
            const items = await Notification_1.Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip((p - 1) * ps)
                .limit(ps);
            const total = await Notification_1.Notification.countDocuments(filter);
            res.json({ total, page: p, pageSize: ps, items });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to list notifications" });
        }
    },
    async markRead(req, res) {
        var _a, _b, _c;
        try {
            const { id } = req.params;
            await Notification_1.Notification.updateOne({ id, userId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b) }, { $set: { isRead: true } });
            res.json({ message: "Notification marked as read" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to mark read" });
        }
    },
    async markAllRead(req, res) {
        var _a, _b, _c;
        try {
            await Notification_1.Notification.updateMany({ userId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b) }, { $set: { isRead: true } });
            res.json({ message: "All notifications marked as read" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to mark all read" });
        }
    },
    async delete(req, res) {
        var _a, _b, _c;
        try {
            const { id } = req.params;
            const result = await Notification_1.Notification.deleteOne({ id, userId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b) });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: "Notification not found" });
            }
            res.json({ message: "Notification deleted successfully" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to delete notification" });
        }
    },
};
