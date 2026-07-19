/**
 * esplisten.js
 *
 * A completely self-contained ESP traffic monitor. It does NOT require
 * any changes to esp32comms.js or ticketrail.js — instead it intercepts
 * requests globally, filtered down to just the ESP-facing paths, so it
 * can be dropped in or removed without touching your existing routes.
 *
 * ─── SETUP ──────────────────────────────────────────────────────────
 * In your index.js, mount this BEFORE esp32comms.js and ticketrail.js:
 *
 *   app.use(require('./routes/esplisten'));
 *   app.use('/esp32comms', require('./routes/esp32comms'));
 *   app.use(require('./routes/ticketrail'));
 *
 * Order matters: this needs to see the request first so it can wrap
 * res.json before the real route handler (in another file) calls it.
 *
 * Then open /esp-monitor.html (a static file in your public/ folder) to
 * watch every ESP32 message live, auto-sorted into a tab per device.
 * ──────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const EventEmitter = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

const HISTORY_LIMIT = 300;
const history = [];

function record(event) {
    history.push(event);
    if (history.length > HISTORY_LIMIT) history.shift();
    bus.emit('esp-message', event);
}

// Only these path prefixes are considered "ESP traffic" — everything
// else (page renders, recipe fetches, settings UI forms, etc.) passes
// through untouched and is never logged or slowed down.
const WATCHED_PREFIXES = ['/esp32comms', '/api/esp'];

function isWatchedPath(path) {
    return WATCHED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ─── GLOBAL CAPTURE MIDDLEWARE ─────────────────────────────────
router.use((req, res, next) => {
    if (!isWatchedPath(req.path)) {
        return next();
    }

    const device_mac = (req.body && req.body.device_mac) || null;
    const message_type = (req.body && req.body.message_type) || null;
    const route = req.path;
    const receivedAt = new Date().toISOString();

    record({
        phase: 'received',
        device_mac,
        route,
        message_type: message_type || route.split('/').pop() || 'unknown',
        payload: req.body,
        timestamp: receivedAt
    });

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        record({
            phase: 'result',
            device_mac: device_mac || (body && body.device_mac) || null,
            route,
            message_type: message_type || route.split('/').pop() || 'unknown',
            status: res.statusCode,
            payload: body,
            timestamp: new Date().toISOString()
        });
        return originalJson(body);
    };

    const originalRedirect = res.redirect.bind(res);
    res.redirect = (...args) => {
        record({
            phase: 'result',
            device_mac,
            route,
            message_type: message_type || route.split('/').pop() || 'unknown',
            status: res.statusCode || 302,
            payload: { redirected: true },
            timestamp: new Date().toISOString()
        });
        return originalRedirect(...args);
    };

    next();
});

// ─── SSE STREAM: every captured message, live ──────────────────
router.get('/api/esp-monitor/stream', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
    });
    res.flushHeaders();

    // Replay recent history so a monitor tab opened mid-service isn't
    // starting from a blank screen.
    history.forEach((event) => {
        res.write(`data: ${JSON.stringify({ type: 'history', event })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ type: 'ready' })}\n\n`);

    const onMessage = (event) => {
        res.write(`data: ${JSON.stringify({ type: 'live', event })}\n\n`);
    };
    bus.on('esp-message', onMessage);

    req.on('close', () => {
        bus.off('esp-message', onMessage);
    });
});

// ─── DEVICE SNAPSHOT: known devices + their stations ───────────
router.get('/api/esp-monitor/devices', (req, res) => {
    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }

    global.db.all(
        `SELECT
            ed.device_mac,
            ed.ip_address,
            ed.last_seen,
            s.station_name
         FROM ESP32Devices ed
         LEFT JOIN ESP32Tagger et ON et.device_id = ed.device_id
         LEFT JOIN station s ON s.station_id = et.station_id
         ORDER BY ed.last_seen DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ devices: rows || [] });
        }
    );
});

module.exports = router;