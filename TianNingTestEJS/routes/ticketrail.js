// routes/ticketrail.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

console.log('📦 Loading ticketrail routes...');

// ============================================
// DATABASE CONNECTION - Use global.db
// ============================================

// Use the existing global.db connection from app.js

// ============================================
// HELPER: Logging function
// ============================================

function logMessage(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        message,
        data
    };
    console.log(`[${timestamp}] [${type}] ${message}`, data || '');
    
    // Broadcast to dashboard
    try {
        const channel = new BroadcastChannel('ticket-rail-control');
        channel.postMessage({
            type: 'server-log',
            payload: logEntry
        });
    } catch(e) {
        // Ignore broadcast errors
    }
}

// ============================================
// TEST ENDPOINT
// ============================================

router.get('/api/test', (req, res) => {
    logMessage('info', '✅ /api/test endpoint called');
    res.json({ 
        status: 'ok', 
        message: 'Ticket rail API is working!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// RECIPE API ENDPOINTS
// ============================================

// Get all recipes from database
router.get('/api/recipes', (req, res) => {
    logMessage('info', '📡 /api/recipes endpoint called');
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    global.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='food'", (err, tableExists) => {
        if (err) {
            logMessage('error', 'Error checking table:', err);
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        
        if (!tableExists) {
            logMessage('error', '❌ "food" table does not exist in database');
            return res.status(404).json({ 
                error: 'No recipes found',
                message: 'The "food" table does not exist in the database.'
            });
        }
        
        const query = `
            SELECT 
                f.food_id as id,
                f.food_name as name,
                GROUP_CONCAT(i.ingredients_name, ', ') as ingredients_list
            FROM food f
            LEFT JOIN food_ingredients fi ON f.food_id = fi.food_id
            LEFT JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
            GROUP BY f.food_id
            ORDER BY f.food_name
        `;
        
        global.db.all(query, (err, rows) => {
            if (err) {
                logMessage('error', 'Database query error:', err);
                return res.status(500).json({ 
                    error: 'Database query error', 
                    details: err.message 
                });
            }
            
            logMessage('info', `✅ Found ${rows.length} recipes in database`);
            
            if (rows.length === 0) {
                logMessage('warn', 'No recipes found in database');
                return res.status(404).json({ 
                    error: 'No recipes found',
                    message: 'The database has no food items. Please add some recipes first.'
                });
            }
            
            const recipes = rows.map(row => {
                const ingredients = row.ingredients_list ? row.ingredients_list.split(', ') : [];
                return {
                    id: row.id,
                    name: row.name,
                    prepTimeSeconds: 30,
                    ingredients: ingredients.length > 0 ? ingredients : ['No ingredients listed'],
                    prepMethods: []
                };
            });
            
            logMessage('success', `✅ Returning ${recipes.length} recipes to client`);
            res.json(recipes);
        });
    });
});

// Get single recipe by ID
router.get('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    logMessage('info', `📡 /api/recipes/${id} endpoint called`);
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
        return res.status(500).json({ error: 'Database not available' });
    }
    
    global.db.get('SELECT food_id as id, food_name as name FROM food WHERE food_id = ?', [id], (err, food) => {
        if (err) {
            logMessage('error', 'Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
            logMessage('warn', `Recipe ${id} not found`);
            return res.status(404).json({ error: 'Recipe not found' });
        }
        
        const ingredientQuery = `
            SELECT 
                i.ingredients_id,
                i.ingredients_name,
                fi.required_amount
            FROM food_ingredients fi
            JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
            WHERE fi.food_id = ?
        `;
        
        global.db.all(ingredientQuery, [id], (err, ingredientRows) => {
            if (err) {
                logMessage('error', 'Error getting ingredients:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            const recipe = {
                id: food.id,
                name: food.name,
                ingredients: ingredientRows.map(row => ({
                    id: row.ingredients_id,
                    name: row.ingredients_name,
                    amount: row.required_amount
                }))
            };
            
            logMessage('success', `✅ Recipe ${id} (${food.name}) returned`);
            res.json(recipe);
        });
    });
});

// ============================================
// CREATE ORDER (called by game frontend when a ticket spawns)
// ============================================

router.post('/api/orders', (req, res, next) => {
    const { order_number, food_id } = req.body;

    if (!order_number || !food_id) {
        return res.status(400).json({
            error: 'Missing fields',
            message: 'order_number and food_id are required'
        });
    }

    const formattedOrder = String(order_number).trim().padStart(2, '0');

    if (!/^\d{2}$/.test(formattedOrder)) {
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }

    // order_number is only unique among orders that are still pending —
    // it's fine to reuse "05" once the previous order with that number
    // has completed or failed.
    global.db.get(
        `SELECT orders_id FROM Orders WHERE order_number = ? AND order_status = 'pending'`,
        [formattedOrder],
        (err, existing) => {
            if (err) {
                logMessage('error', 'Error checking existing order:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (existing) {
                logMessage('error', `⚠️ Order number ${formattedOrder} is already pending`);
                return res.status(409).json({
                    error: 'Duplicate order_number',
                    message: `Order ${formattedOrder} is already pending. Wait for it to resolve first.`
                });
            }

            global.db.run(
                `INSERT INTO Orders (food_id, order_number, order_status)
                 VALUES (?, ?, 'pending')`,
                [food_id, formattedOrder],
                function (err) {
                    if (err) {
                        logMessage('error', 'Error creating order:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    logMessage('success', `✅ Order ${formattedOrder} created (food_id ${food_id})`);
                    res.json({
                        success: true,
                        orders_id: this.lastID,
                        order_number: formattedOrder,
                        food_id
                    });
                }
            );
        }
    );
});

// ============================================
// ESP STATUS ENDPOINT
// ============================================

router.get('/api/esp/status', (req, res) => {
    logMessage('info', '📡 /api/esp/status endpoint called');
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
        return res.json({ online: false, error: 'Database not available' });
    }
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // A "Counter" station device counts as the online ESP we care about.
    global.db.get(
        `SELECT ed.device_mac
         FROM ESP32Devices ed
         JOIN ESP32Tagger et ON et.device_id = ed.device_id
         JOIN station s ON s.station_id = et.station_id
         WHERE s.station_name = 'Counter' AND ed.last_seen > ?
         LIMIT 1`,
        [fiveMinutesAgo],
        (err, row) => {
            if (err) {
                logMessage('error', 'Error checking ESP status:', err);
                return res.json({ online: false });
            }
            const online = !!row;
            logMessage('info', `ESP status: ${online ? 'Online ✅' : 'Offline ❌'}`);
            res.json({ online: online });
        }
    );
});


// ============================================
// ORDER MISSED UPDATE DATABASE
// ============================================

router.post('/api/esp/missed', (req, res) => {
    const { order_number } = req.body;

    logMessage(
        'game',
        `📡 /api/esp/missed called for order ${order_number}`,
        { order_number }
    );

    if (order_number === undefined || order_number === null || order_number === '') {
        logMessage('error', '❌ Missing order_number');

        return res.status(400).json({
            success: false,
            error: 'Missing order_number',
            message: 'order_number is required'
        });
    }

    if (!global.db) {
        logMessage('error', '❌ global.db is not available');

        return res.status(500).json({
            success: false,
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }

    // Use the same two-digit format used when the order was created.
    const formattedOrder = String(order_number)
        .trim()
        .padStart(2, '0');

    if (!/^\d{2}$/.test(formattedOrder)) {
        logMessage(
            'error',
            `❌ Invalid order number: ${order_number}`
        );

        return res.status(400).json({
            success: false,
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number, such as "01"'
        });
    }

    const sql = `
        UPDATE Orders
        SET order_status = 'missed'
        WHERE order_number = ?
          AND order_status = 'pending'
    `;

    global.db.run(
        sql,
        [formattedOrder],
        function (err) {
            if (err) {
                logMessage(
                    'error',
                    `❌ Failed to mark order ${formattedOrder} as missed`,
                    err
                );

                return res.status(500).json({
                    success: false,
                    error: 'Database error',
                    message: err.message
                });
            }

            if (this.changes === 0) {
                logMessage(
                    'warn',
                    `⚠️ Order ${formattedOrder} was not found or was no longer pending`
                );

                return res.status(409).json({
                    success: false,
                    error: 'Order not updated',
                    message:
                        `Order ${formattedOrder} was not found or is no longer pending`
                });
            }

            logMessage(
                'success',
                `✅ Order ${formattedOrder} marked as missed`
            );

            return res.json({
                success: true,
                order_number: formattedOrder,
                order_status: 'missed'
            });
        }
    );
});


// ============================================
// COUNTER ESP SUBMIT ENDPOINT
// ============================================

router.post('/api/esp/submit', (req, res, next) => {
    const { order_number, device_mac, tag_macs } = req.body;
    
    logMessage('esp', '📡 /api/esp/submit endpoint called (COUNTER ESP)', {
        order_number,
        device_mac: device_mac || 'GAME_CLIENT',
        tag_count: tag_macs ? tag_macs.length : 0,
        tags: tag_macs || []
    });
    
    // Validate required fields
    if (!order_number) {
        logMessage('error', '❌ Missing order_number');
        return res.status(400).json({ 
            error: 'Missing order_number',
            message: 'order_number is required'
        });
    }
    
    if (!tag_macs || !Array.isArray(tag_macs)) {
        logMessage('error', '❌ Missing tag_macs or not an array');
        return res.status(400).json({ 
            error: 'Missing tag_macs',
            message: 'tag_macs array is required'
        });
    }
    
    if (tag_macs.length === 0) {
        logMessage('error', '❌ Empty tag_macs array');
        return res.status(400).json({ 
            error: 'Empty tag_macs',
            message: 'At least one tag MAC is required'
        });
    }
    
    console.log(`📝 Processing submission: Order ${order_number} from device ${device_mac || 'GAME_CLIENT'}`);
    console.log(`📋 Tags received: ${tag_macs.join(', ')}`);
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    // STEP 1: If device_mac is provided, verify it belongs to the Counter station
    if (device_mac) {
        logMessage('info', `🔍 Verifying device: ${device_mac}`);
        global.db.get(
            `SELECT ed.device_id, s.station_name
             FROM ESP32Devices ed
             JOIN ESP32Tagger et ON et.device_id = ed.device_id
             JOIN station s ON s.station_id = et.station_id
             WHERE ed.device_mac = ?`,
            [device_mac],
            (err, device) => {
                if (err) {
                    logMessage('error', 'Error finding device:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (!device) {
                    logMessage('error', `⚠️ Device ${device_mac} not found or has no station assigned`);
                    return res.status(404).json({ 
                        error: 'Device not found',
                        message: 'This ESP32 is not registered or has no station assigned.'
                    });
                }
                if (device.station_name !== 'Counter') {
                    logMessage('error', `⚠️ Device ${device_mac} is at station "${device.station_name}", not Counter`);
                    return res.status(403).json({ 
                        error: 'Invalid device type',
                        message: 'Only devices assigned to the Counter station can submit orders'
                    });
                }
                logMessage('success', `✅ Device ${device_mac} verified as Counter`);
                // Device is valid, proceed to find order
                findOrderAndValidate(order_number, tag_macs, res, next);
            }
        );
    } else {
        // No device_mac provided - allow for game client testing
        // This can be dangerous, please do note later on. 
        logMessage('warn', '⚠️ No device_mac provided - allowing game client submission');
        findOrderAndValidate(order_number, tag_macs, res, next);
    }
});

// ============================================
// INTERNAL: Find Order and Validate
// THIS IS USED FOR SUBMISSION ONLY
// ============================================

function findOrderAndValidate(order_number, tag_macs, res, next) {
    // Order numbers on the wire are a raw 2-digit string, e.g. "01".
    // Normalize to exactly 2 digits (handles a number or a short string
    // arriving from the ESP) and store/match in that same raw form —
    // no "K-" prefix, no 3-digit padding.
    const formattedOrder = String(order_number).trim().padStart(2, '0');

    if (!/^\d{2}$/.test(formattedOrder)) {
        logMessage('error', `❌ Invalid order_number format: "${order_number}"`);
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    logMessage('info', `🔍 Looking for order: ${formattedOrder}`);
    
    // STEP 2: Find the pending order
    global.db.get(
        `SELECT o.orders_id, o.food_id, f.food_name
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_number = ? AND o.order_status = 'pending'`,
        [formattedOrder],
        (err, order) => {
            if (err) {
                logMessage('error', 'Error finding order:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!order) {
                logMessage('error', `⚠️ Order ${formattedOrder} not found or not pending`);
                return res.status(404).json({ 
                    error: 'Order not found',
                    message: 'Order number not found or already submitted'
                });
            }
            
            logMessage('success', `📋 Found order: ${formattedOrder} (${order.food_name})`);
            logMessage('info', `📋 Tags received: ${tag_macs.join(', ')}`);
            
            // STEP 3: Get all required ingredients with their RFID tag and current status.
            // RFIDTags are passive (no ESP32Devices join needed) — tag_rfid IS the tag identifier.
            const recipeSql = `
                SELECT 
                    i.ingredients_id,
                    i.ingredients_name,
                    pm.preparation_method_name AS required_action,
                    rt.tag_rfid AS tag_mac,
                    rt.current_status
                FROM food_ingredients fi
                JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                JOIN food_ingredient_preparation fip ON fi.food_ingredients_id = fip.food_ingredients_id
                JOIN preparation_method pm ON fip.preparation_method_id = pm.preparation_method_id
                LEFT JOIN RFIDTags rt ON rt.ingredients_id = i.ingredients_id
                WHERE fi.food_id = ?
                ORDER BY fip.prep_step_order ASC
            `;
            
            global.db.all(recipeSql, [order.food_id], (err, recipe) => {
                if (err) {
                    logMessage('error', 'Error getting recipe:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (recipe.length === 0) {
                    logMessage('error', `❌ Recipe for ${order.food_name} has no ingredients defined`);
                    return res.status(400).json({ 
                        error: 'Invalid recipe',
                        message: 'This food has no ingredients defined'
                    });
                }
                
                logMessage('info', `📋 Recipe requires ${recipe.length} ingredients`);
                
                // STEP 4: Check each ingredient against the ESP tag_macs
                const results = [];
                let allPass = true;
                let missingTags = [];
                let wrongStatus = [];
                
                // Check if any ingredients have tags assigned
                const hasAnyTag = recipe.some(ing => ing.tag_mac !== null);
                if (!hasAnyTag) {
                    logMessage('error', '❌ No tags assigned to any ingredients');
                    return res.status(400).json({
                        error: 'No tags assigned',
                        message: 'None of the ingredients have tags assigned.'
                    });
                }
                
                // Build expected status map for each ingredient
                const expectedStatusMap = {};
                const ingredientTagMap = {};
                
                recipe.forEach((ing) => {
                    ingredientTagMap[ing.ingredients_name] = ing.tag_mac;
                    if (!expectedStatusMap[ing.ingredients_id]) {
                        expectedStatusMap[ing.ingredients_id] = {
                            name: ing.ingredients_name,
                            required_actions: [],
                            tag_mac: ing.tag_mac,
                            current_status: ing.current_status || 'Default'
                        };
                    }
                    expectedStatusMap[ing.ingredients_id].required_actions.push(ing.required_action);
                });
                
                // Log ingredient requirements
                Object.values(expectedStatusMap).forEach((ing) => {
                    let expectedStatus = 'Default';
                    ing.required_actions.forEach(action => {
                        expectedStatus += ' → ' + action;
                    });
                    logMessage('info', `📋 ${ing.name}: requires tag ${ing.tag_mac || 'NOT ASSIGNED'}, expected status: ${expectedStatus}`);
                });
                
                // Check each ingredient
                Object.values(expectedStatusMap).forEach((ing) => {
                    // Build expected status chain
                    let expectedStatus = 'Default';
                    ing.required_actions.forEach(action => {
                        expectedStatus += ' → ' + action;
                    });
                    
                    const actualStatus = ing.current_status || 'Default';
                    
                    // Check if the actual status matches the expected status exactly
                    const pass = actualStatus === expectedStatus;
                    
                    if (!pass) {
                        allPass = false;
                        if (ing.tag_mac === null) {
                            missingTags.push(ing.name);
                        } else {
                            wrongStatus.push({
                                ingredient: ing.name,
                                expected: expectedStatus,
                                got: actualStatus
                            });
                        }
                    }
                    
                    results.push({
                        ingredient: ing.name,
                        required_chain: expectedStatus,
                        got: actualStatus,
                        pass: pass
                    });
                    
                    logMessage('match', `${ing.name}: expected "${expectedStatus}", got "${actualStatus}" → ${pass ? '✅' : '❌'}`);
                });
                
                // Check for extra tags that don't belong
                const extraTags = tag_macs.filter(mac => 
                    !recipe.some(r => r.tag_mac === mac)
                );
                
                if (extraTags.length > 0) {
                    allPass = false;
                    results.push({
                        ingredient: 'Extra tags',
                        required_chain: 'None',
                        got: extraTags.join(', '),
                        pass: false,
                        reason: 'Extra tags scanned'
                    });
                    logMessage('error', `❌ Extra tags scanned: ${extraTags.join(', ')}`);
                }
                
                // Check for missing required tags
                const requiredTagMacs = recipe.map(r => r.tag_mac).filter(mac => mac !== null);
                const missingRequiredTags = requiredTagMacs.filter(mac => !tag_macs.includes(mac));
                if (missingRequiredTags.length > 0) {
                    logMessage('error', `❌ Missing required tags: ${missingRequiredTags.join(', ')}`);
                }
                
                // Broadcast match checks to dashboard
                try {
                    const channel = new BroadcastChannel('ticket-rail-control');
                    results.forEach(r => {
                        channel.postMessage({
                            type: 'esp-match-check',
                            payload: {
                                order_number: formattedOrder,
                                ingredient: r.ingredient,
                                expected: r.required_chain,
                                got: r.got || 'null',
                                pass: r.pass
                            }
                        });
                    });
                } catch(e) {
                    logMessage('error', 'Failed to broadcast match checks:', e);
                }
                
                // Log summary
                logMessage('info', `📊 Validation summary: ${allPass ? 'ALL PASS ✅' : 'FAILED ❌'}`);
                if (missingTags.length > 0) {
                    logMessage('error', `  Missing tags: ${missingTags.join(', ')}`);
                }
                if (wrongStatus.length > 0) {
                    logMessage('error', `  Wrong status: ${wrongStatus.map(w => `${w.ingredient} (expected: ${w.expected}, got: ${w.got})`).join('; ')}`);
                }
                if (extraTags.length > 0) {
                    logMessage('error', `  Extra tags: ${extraTags.join(', ')}`);
                }
                
                // STEP 5: Finalise the order — reset ALL tag statuses to Default
                // regardless of pass or fail, then respond.
                if (allPass) {
                    // ✅ ALL PASS - Complete the order
                    logMessage('success', `✅ Order ${formattedOrder} PASSED validation`);
                    global.db.run(
                        `UPDATE Orders SET order_status = 'completed' WHERE orders_id = ?`,
                        [order.orders_id],
                        (err) => {
                            if (err) {
                                logMessage('error', 'Error updating order:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            
                            // STEP 6: Clear ALL tag current_status to 'Default'
                            global.db.run(
                                `UPDATE RFIDTags SET current_status = 'Default'`,
                                (err) => {
                                    if (err) {
                                        logMessage('error', 'Error clearing tag statuses:', err);
                                        return res.status(500).json({ error: 'Database error' });
                                    }
                                    
                                    logMessage('success', `✅ Order ${formattedOrder} COMPLETED - All tags reset to Default`);
                                    
                                    // Broadcast to dashboard
                                    try {
                                        const channel = new BroadcastChannel('ticket-rail-control');
                                        channel.postMessage({
                                            type: 'esp-submit-result',
                                            payload: {
                                                success: true,
                                                result: 'PASS',
                                                order_number: formattedOrder,
                                                food: order.food_name,
                                                score_earned: 100,
                                                details: results
                                            }
                                        });
                                    } catch(e) {
                                        logMessage('error', 'Failed to broadcast to dashboard:', e);
                                    }
                                    
                                    // Broadcast to game
                                    try {
                                        const gameChannel = new BroadcastChannel('ticket-rail-control');
                                        gameChannel.postMessage({
                                            type: 'esp-order-complete',
                                            payload: {
                                                order_number: formattedOrder,
                                                success: true,
                                                details: results
                                            }
                                        });
                                    } catch(e) {
                                        logMessage('error', 'Failed to broadcast to game:', e);
                                    }
                                    
                                    res.json({
                                        success: true,
                                        result: 'PASS',
                                        order_number: formattedOrder,
                                        food: order.food_name,
                                        message: '✅ Order completed successfully! All tags have been reset.',
                                        details: results
                                    });
                                }
                            );
                        }
                    );
                } else {
                    // ❌ FAIL - Order failed
                    logMessage('error', `❌ Order ${formattedOrder} FAILED validation`);
                    global.db.run(
                        `UPDATE Orders SET order_status = 'failed' WHERE orders_id = ?`,
                        [order.orders_id],
                        (err) => {
                            if (err) {
                                logMessage('error', 'Error updating order:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }

                            // Reset ALL tag statuses back to Default, same as on success
                            global.db.run(
                                `UPDATE RFIDTags SET current_status = 'Default'`,
                                (err) => {
                                    if (err) {
                                        logMessage('error', 'Error clearing tag statuses:', err);
                                        return res.status(500).json({ error: 'Database error' });
                                    }

                                    logMessage('error', `❌ Order ${formattedOrder} marked as FAILED - All tags reset to Default`);
                            
                                    // Broadcast to dashboard
                                    try {
                                        const channel = new BroadcastChannel('ticket-rail-control');
                                        channel.postMessage({
                                            type: 'esp-submit-result',
                                            payload: {
                                                success: false,
                                                result: 'FAIL',
                                                order_number: formattedOrder,
                                                food: order.food_name,
                                                details: results
                                            }
                                        });
                                    } catch(e) {
                                        logMessage('error', 'Failed to broadcast to dashboard:', e);
                                    }
                                    
                                    // Broadcast to game
                                    try {
                                        const gameChannel = new BroadcastChannel('ticket-rail-control');
                                        gameChannel.postMessage({
                                            type: 'esp-order-complete',
                                            payload: {
                                                order_number: formattedOrder,
                                                success: false,
                                                details: results
                                            }
                                        });
                                    } catch(e) {
                                        logMessage('error', 'Failed to broadcast to game:', e);
                                    }
                                    
                                    res.json({
                                        success: false,
                                        result: 'FAIL',
                                        order_number: formattedOrder,
                                        food: order.food_name,
                                        message: '❌ Order validation failed. Check ingredient preparation chains.',
                                        details: results
                                    });
                                }
                            );
                        }
                    );
                }
            });
        }
    );
}

// ============================================
// VIEW ROUTES
// ============================================

router.get('/game', (req, res) => {
    logMessage('info', '🎮 Rendering game page');
    res.render('game', {
        title: 'Ticket Rail - Game'
    });
});

router.get('/game/settings', (req, res) => {
    logMessage('info', '⚙️ Rendering game settings page');
    res.render('gamesettings', {
        title: 'Ticket Rail - Controls'
    });
});

console.log('✅ Ticketrail routes loaded successfully');

module.exports = router;