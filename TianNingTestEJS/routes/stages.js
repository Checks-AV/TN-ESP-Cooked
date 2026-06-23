const express = require("express");
const router = express.Router();
const crypto = require("crypto");

function generateOrderNumber() {
    return "ORD-" + crypto.randomBytes(2).toString("hex").toUpperCase();
}

// ─── GET /stages ─────────────────────────────────────────────
// Render the game board with all pending orders
router.get("/", (req, res, next) => {
    const orderSql = `
        SELECT o.orders_id, o.order_number, o.order_status,
               o.order_time_started, f.food_name, o.food_id
        FROM Orders o
        JOIN food f ON o.food_id = f.food_id
        WHERE o.order_status = 'pending'
        ORDER BY o.order_time_started ASC
    `;

    global.db.all(orderSql, [], (err, orders) => {
        if (err) return next(err);
        if (orders.length === 0) {
            return res.render("stages.ejs", { title: "Game", orders: [] });
        }

        let completed = 0;
        const result = new Array(orders.length);

        orders.forEach((order, idx) => {
            // Get required ingredients + their target status for this food
            const ingSql = `
                SELECT fi.food_ingredients_id,
                       i.ingredients_name,
                       i.ingredients_id,
                       fi.required_amount,
                       ist.ingredientstatus_name AS target_status,
                       ed.device_mac AS tag_mac
                FROM food_ingredients fi
                JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                JOIN ingredientstatus ist ON fi.ingredientstatus_id = ist.ingredientstatus_id
                LEFT JOIN ESP32Tags et ON et.ingredients_id = i.ingredients_id
                LEFT JOIN ESP32Devices ed ON ed.device_id = et.device_id
                WHERE fi.food_id = ?
            `;

            global.db.all(ingSql, [order.food_id], (err, ingredients) => {
                if (err) return next(err);

                if (ingredients.length === 0) {
                    result[idx] = { ...order, ingredients: [] };
                    completed++;
                    if (completed === orders.length) {
                        return res.render("stages.ejs", { title: "Game", orders: result });
                    }
                    return;
                }

                let ingDone = 0;
                const ingredientsWithActions = new Array(ingredients.length);

                ingredients.forEach((ing, ingIdx) => {
                    // Get all actions logged for this tag mac in this order
                    const actionSql = `
                        SELECT action_name, tag_mac, action_time
                        FROM OrderActions
                        WHERE orders_id = ? AND tag_mac = ?
                        ORDER BY action_time ASC
                    `;

                    const tagMac = ing.tag_mac || null;

                    if (!tagMac) {
                        ingredientsWithActions[ingIdx] = { ...ing, actions: [] };
                        ingDone++;
                        if (ingDone === ingredients.length) {
                            result[idx] = { ...order, ingredients: ingredientsWithActions };
                            completed++;
                            if (completed === orders.length) {
                                return res.render("stages.ejs", { title: "Game", orders: result });
                            }
                        }
                        return;
                    }

                    global.db.all(actionSql, [order.orders_id, tagMac], (err, actions) => {
                        if (err) return next(err);
                        ingredientsWithActions[ingIdx] = { ...ing, actions };
                        ingDone++;
                        if (ingDone === ingredients.length) {
                            result[idx] = { ...order, ingredients: ingredientsWithActions };
                            completed++;
                            if (completed === orders.length) {
                                return res.render("stages.ejs", { title: "Game", orders: result });
                            }
                        }
                    });
                });
            });
        });
    });
});

// ─── POST /stages/spawn ───────────────────────────────────────
// Randomly pick a food and create a new pending order
router.post("/spawn", (req, res, next) => {
    global.db.get(`SELECT food_id FROM food ORDER BY RANDOM() LIMIT 1`, [], (err, food) => {
        if (err) return next(err);
        if (!food) return res.status(400).json({ error: "No recipes in DB" });

        const orderNumber = generateOrderNumber();

        global.db.run(
            `INSERT INTO Orders (food_id, order_number) VALUES (?, ?)`,
            [food.food_id, orderNumber],
            function (err) {
                if (err) return next(err);
                res.json({
                    success: true,
                    order_number: orderNumber,
                    orders_id: this.lastID
                });
            }
        );
    });
});

// ─── POST /stages/action ──────────────────────────────────────
// ESP32 sends: { order_number, tag_mac, action_name }
// Server JUST logs it. No validation here.
router.post("/action", (req, res, next) => {
    const { order_number, tag_mac, action_name } = req.body;

    if (!order_number || !tag_mac || !action_name) {
        return res.status(400).json({ error: "Missing order_number, tag_mac or action_name" });
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
                    console.log(`[LOG] Order ${order_number} | Tag ${tag_mac} | ${action_name}`);
                    res.json({ success: true, action_id: this.lastID });
                }
            );
        }
    );
});

// ─── POST /stages/submit ──────────────────────────────────────
// Special submission ESP sends: { order_number, tag_mac }
// Server checks: for each ingredient in the recipe, does the LAST action
// on that tag match the required ingredientstatus for this recipe?
// If ALL match → order complete. Otherwise → fail with details.
router.post("/submit", (req, res, next) => {
    const { order_number, tag_mac } = req.body;
    // tag_mac here is the submitter's own mac (the special submission ESP)
    // order_number is what the participant typed/scanned

    if (!order_number) {
        return res.status(400).json({ error: "Missing order_number" });
    }

    // 1. Find the order + its food
    global.db.get(
        `SELECT o.orders_id, o.food_id, f.food_name
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_number = ? AND o.order_status = 'pending'`,
        [order_number],
        (err, order) => {
            if (err) return next(err);
            if (!order) return res.status(404).json({ error: "Order not found or already submitted" });

            // 2. Get all required ingredients + their required status + the tag mac registered to them
            const recipeSql = `
                SELECT i.ingredients_name,
                       i.ingredients_id,
                       ist.ingredientstatus_name AS required_status,
                       ed.device_mac AS tag_mac
                FROM food_ingredients fi
                JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                JOIN ingredientstatus ist ON fi.ingredientstatus_id = ist.ingredientstatus_id
                LEFT JOIN ESP32Tags et ON et.ingredients_id = i.ingredients_id
                LEFT JOIN ESP32Devices ed ON ed.device_id = et.device_id
                WHERE fi.food_id = ?
            `;

            global.db.all(recipeSql, [order.food_id], (err, recipe) => {
                if (err) return next(err);

                if (recipe.length === 0) {
                    return res.status(400).json({ error: "Recipe has no ingredients" });
                }

                // 3. For each ingredient, get the LAST action logged for its tag in this order
                let checked = 0;
                const results = [];
                let allPass = true;

                recipe.forEach((ing) => {
                    if (!ing.tag_mac) {
                        // No tag registered for this ingredient
                        results.push({
                            ingredient: ing.ingredients_name,
                            required: ing.required_status,
                            got: null,
                            pass: false,
                            reason: "No tag registered for this ingredient"
                        });
                        allPass = false;
                        checked++;
                        if (checked === recipe.length) finalise();
                        return;
                    }

                    // Get last action for this tag in this order
                    global.db.get(
                        `SELECT action_name FROM OrderActions
                         WHERE orders_id = ? AND tag_mac = ?
                         ORDER BY action_time DESC LIMIT 1`,
                        [order.orders_id, ing.tag_mac],
                        (err, lastAction) => {
                            if (err) return next(err);

                            const got = lastAction ? lastAction.action_name : null;

                            // Case-insensitive match between last action and required status
                            const pass = got &&
                                got.toLowerCase() === ing.required_status.toLowerCase();

                            if (!pass) allPass = false;

                            results.push({
                                ingredient: ing.ingredients_name,
                                required:   ing.required_status,
                                got:        got,
                                pass:       pass
                            });

                            checked++;
                            if (checked === recipe.length) finalise();
                        }
                    );
                });

                function finalise() {
                    if (allPass) {
                        // Mark order complete
                        global.db.run(
                            `UPDATE Orders SET order_status = 'completed' WHERE orders_id = ?`,
                            [order.orders_id],
                            (err) => {
                                if (err) return next(err);
                                console.log(`[SUBMIT] ✅ Order ${order_number} COMPLETED`);
                                res.json({
                                    success: true,
                                    result: "PASS",
                                    order_number,
                                    food: order.food_name,
                                    details: results
                                });
                            }
                        );
                    } else {
                        // Mark failed
                        global.db.run(
                            `UPDATE Orders SET order_status = 'failed' WHERE orders_id = ?`,
                            [order.orders_id],
                            (err) => {
                                if (err) return next(err);
                                console.log(`[SUBMIT] ❌ Order ${order_number} FAILED`);
                                res.json({
                                    success: false,
                                    result: "FAIL",
                                    order_number,
                                    food: order.food_name,
                                    details: results
                                });
                            }
                        );
                    }
                }
            });
        }
    );
});

module.exports = router;