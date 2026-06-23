const express = require("express");
const router = express.Router();

// ─── POST /esp32comms/register ────────────────────────────────
// ESP32 calls this on boot to announce itself
// Body: { device_mac, device_type, ip_address }
// device_type: 'tagger' | 'tag'
router.post("/register", (req, res, next) => {
    const { device_mac, device_type, ip_address } = req.body;

    if (!device_mac) {
        return res.status(400).json({ error: "Missing device_mac" });
    }

    const now = new Date().toISOString();

    // Upsert: if MAC already exists, just update ip + last_seen
    global.db.run(
        `INSERT INTO ESP32Devices (device_mac, device_type, ip_address, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_mac) DO UPDATE SET
             ip_address = excluded.ip_address,
             last_seen  = excluded.last_seen,
             device_type = COALESCE(excluded.device_type, device_type)`,
        [device_mac, device_type || null, ip_address || null, now],
        function (err) {
            if (err) return next(err);
            console.log(`[REGISTER] ${device_mac} | type: ${device_type} | ip: ${ip_address}`);
            res.json({ success: true, message: "Registered", device_mac });
        }
    );
});

// ─── POST /esp32comms/listen ──────────────────────────────────
// Always-on listener: every ESP32 message comes here
// Body: { device_mac, message_type, payload }
//
// message_type options:
//   "action"  → payload: { order_number, action_name }
//               tag sends its own mac + what was done to it
//   "submit"  → payload: { order_number }
//               special submission ESP sends this
//   "ping"    → payload: {} (just a heartbeat, updates last_seen)
//
router.post("/listen", (req, res, next) => {
    const { device_mac, message_type, payload } = req.body;

    if (!device_mac || !message_type) {
        return res.status(400).json({ error: "Missing device_mac or message_type" });
    }

    const now = new Date().toISOString();

    // Always update last_seen for any message
    global.db.run(
        `UPDATE ESP32Devices SET last_seen = ? WHERE device_mac = ?`,
        [now, device_mac],
        (err) => {
            if (err) return next(err);

            console.log(`[LISTEN] ${device_mac} | ${message_type} | ${JSON.stringify(payload)}`);

            if (message_type === "ping") {
                return res.json({ success: true, message: "pong" });
            }

            if (message_type === "action") {
                return handleAction(req, res, next, device_mac, payload);
            }

            if (message_type === "submit") {
                return handleSubmit(req, res, next, device_mac, payload);
            }

            return res.status(400).json({ error: `Unknown message_type: ${message_type}` });
        }
    );
});

// ─── INTERNAL: handle action ──────────────────────────────────
// tag_mac is the device sending (it IS the tag)
// action_name is what happened to it e.g. "Chopped", "Cooked"
function handleAction(req, res, next, tag_mac, payload) {
    const { order_number, action_name } = payload || {};

    if (!order_number || !action_name) {
        return res.status(400).json({ error: "action needs order_number and action_name in payload" });
    }

    global.db.get(
        `SELECT orders_id FROM Orders WHERE order_number = ? AND order_status = 'pending'`,
        [order_number],
        (err, order) => {
            if (err) return next(err);
            if (!order) return res.status(404).json({ error: "Order not found or not pending" });

            global.db.run(
                `INSERT INTO OrderActions (orders_id, tag_mac, action_name) VALUES (?, ?, ?)`,
                [order.orders_id, tag_mac, action_name],
                function (err) {
                    if (err) return next(err);
                    console.log(`[ACTION] Order ${order_number} | Tag ${tag_mac} | ${action_name}`);
                    res.json({ success: true, action_id: this.lastID });
                }
            );
        }
    );
}

// ─── INTERNAL: handle submit ──────────────────────────────────
// Special submission ESP sends order_number
// Server checks last action on each ingredient tag vs recipe requirement
function handleSubmit(req, res, next, submitter_mac, payload) {
    const { order_number } = payload || {};

    if (!order_number) {
        return res.status(400).json({ error: "submit needs order_number in payload" });
    }

    global.db.get(
        `SELECT o.orders_id, o.food_id, f.food_name
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_number = ? AND o.order_status = 'pending'`,
        [order_number],
        (err, order) => {
            if (err) return next(err);
            if (!order) return res.status(404).json({ error: "Order not found or already submitted" });

            const recipeSql = `
                SELECT i.ingredients_name,
                       i.ingredients_id,
                       ist.ingredientstatus_name AS required_status,
                       ed.device_mac             AS tag_mac
                FROM food_ingredients fi
                JOIN ingredients i      ON fi.ingredients_id      = i.ingredients_id
                JOIN ingredientstatus ist ON fi.ingredientstatus_id = ist.ingredientstatus_id
                LEFT JOIN ESP32Tags et  ON et.ingredients_id      = i.ingredients_id
                LEFT JOIN ESP32Devices ed ON ed.device_id         = et.device_id
                WHERE fi.food_id = ?
            `;

            global.db.all(recipeSql, [order.food_id], (err, recipe) => {
                if (err) return next(err);
                if (recipe.length === 0) {
                    return res.status(400).json({ error: "Recipe has no ingredients" });
                }

                let checked = 0;
                const results = [];
                let allPass = true;

                recipe.forEach((ing) => {
                    if (!ing.tag_mac) {
                        results.push({
                            ingredient: ing.ingredients_name,
                            required:   ing.required_status,
                            got:        null,
                            pass:       false,
                            reason:     "No tag registered for this ingredient"
                        });
                        allPass = false;
                        checked++;
                        if (checked === recipe.length) finalise();
                        return;
                    }

                    global.db.get(
                        `SELECT action_name FROM OrderActions
                         WHERE orders_id = ? AND tag_mac = ?
                         ORDER BY action_time DESC LIMIT 1`,
                        [order.orders_id, ing.tag_mac],
                        (err, lastAction) => {
                            if (err) return next(err);

                            const got  = lastAction ? lastAction.action_name : null;
                            const pass = got &&
                                got.toLowerCase() === ing.required_status.toLowerCase();

                            if (!pass) allPass = false;

                            results.push({
                                ingredient: ing.ingredients_name,
                                required:   ing.required_status,
                                got,
                                pass
                            });

                            checked++;
                            if (checked === recipe.length) finalise();
                        }
                    );
                });

                function finalise() {
                    const newStatus = allPass ? 'completed' : 'failed';

                    global.db.run(
                        `UPDATE Orders SET order_status = ? WHERE orders_id = ?`,
                        [newStatus, order.orders_id],
                        (err) => {
                            if (err) return next(err);

                            console.log(`[SUBMIT] ${allPass ? '✅' : '❌'} Order ${order_number} → ${newStatus}`);

                            res.json({
                                success:      allPass,
                                result:       allPass ? 'PASS' : 'FAIL',
                                order_number,
                                food:         order.food_name,
                                submitter:    submitter_mac,
                                details:      results
                            });
                        }
                    );
                }
            });
        }
    );
}
// ─── POST /esp32comms/assign-tag ──────────────────────────────
// Link a tag device to an ingredient
router.post("/assign-tag", (req, res, next) => {
    const { device_mac, ingredients_id } = req.body;

    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device MAC not found. Register it first.");

            global.db.run(
                `INSERT INTO ESP32Tags (device_id, ingredients_id, current_status_id)
                 VALUES (?, ?, 1)
                 ON CONFLICT(device_id) DO UPDATE SET ingredients_id = excluded.ingredients_id`,
                [device.device_id, ingredients_id],
                (err) => {
                    if (err) return next(err);
                    console.log(`[ASSIGN-TAG] ${device_mac} → ingredient ${ingredients_id}`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});

// ─── POST /esp32comms/assign-tagger ──────────────────────────
// Link a tagger device to a station
router.post("/assign-tagger", (req, res, next) => {
    const { device_mac, station_id } = req.body;

    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device MAC not found. Register it first.");

            global.db.run(
                `INSERT INTO ESP32Tagger (device_id, station_id)
                 VALUES (?, ?)
                 ON CONFLICT(device_id) DO UPDATE SET station_id = excluded.station_id`,
                [device.device_id, station_id],
                (err) => {
                    if (err) return next(err);
                    console.log(`[ASSIGN-TAGGER] ${device_mac} → station ${station_id}`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});
module.exports = router;