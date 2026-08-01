// routes/ticketrail.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Import leaderboard routes
const leaderboardRoutes = require('./leaderboards');

console.log('📦 Loading ticketrail routes...');

// ============================================
// SSE Clients - For real-time browser updates
// ============================================

let sseClients = [];
let clientHeartbeats = new Map();

// ============================================
// HELPER: Broadcast to all SSE clients
// ============================================

function broadcastToClients(type, payload) {
    const data = `data: ${JSON.stringify({ type, payload })}\n\n`;
    console.log(`📤 Broadcasting SSE: ${type}`, payload);
    
    // Remove dead clients and send to alive ones
    const aliveClients = [];
    const now = Date.now();
    
    sseClients.forEach(client => {
        // Check if client is still alive (heartbeat check)
        const clientId = client._clientId;
        const lastHeartbeat = clientHeartbeats.get(clientId) || 0;
        
        // If no heartbeat in 30 seconds, consider client dead
        if (now - lastHeartbeat > 30000) {
            console.log(`❌ Client ${clientId} timed out, removing`);
            clientHeartbeats.delete(clientId);
            try {
                client.end();
            } catch (e) {
                // Ignore
            }
            return;
        }
        
        try {
            client.write(data);
            aliveClients.push(client);
        } catch (e) {
            console.log('❌ SSE client write failed, removing');
            clientHeartbeats.delete(client._clientId);
        }
    });
    sseClients = aliveClients;
    console.log(`📤 Broadcast sent to ${sseClients.length} clients`);
}

// Register broadcast functions with leaderboard routes
leaderboardRoutes.setBroadcastFunctions(
    // Update function
    (entry) => {
        broadcastToClients('leaderboard-update', { entry });
    },
    // Delete function
    (id) => {
        broadcastToClients('leaderboard-deleted', { id });
    },
    // Clear function
    () => {
        broadcastToClients('leaderboard-cleared', {});
    }
);

// Use leaderboard routes
router.use(leaderboardRoutes);

// ============================================
// HELPER: Logging function with SSE broadcast
// ============================================

function logMessage(category, message, data = null, logGroup = 'other') {
    const timestamp = new Date().toISOString();
    
    // Clean category names for frontend compatibility
    // These map directly to your frontend's typeMap keys
    const categoryMap = {
        'info': 'info',
        'error': 'error',
        'success': 'success',
        'warning': 'warning',
        'esp': 'esp',
        'submit': 'submit',
        'match': 'match',
        'order': 'order',
        'database': 'database',
        'peak': 'peak',
        'game': 'game',
        'system': 'system',
        'debug': 'debug',
        'tag': 'tag'
    };
    
    // Use mapped category or fallback to 'info'
    const mappedCategory = categoryMap[category] || 'info';

    // logGroup is separate from category — it tells the frontend which of
    // the 3 log panels this entry belongs to: 'tag' (RFID status changes),
    // 'order' (order lifecycle: created/missed/submitted/passed/failed),
    // or 'other' (everything else). category is still used for icons/colors
    // within a panel; logGroup is what the panel filter is based on.
    const validGroups = ['tag', 'order', 'other'];
    const mappedGroup = validGroups.includes(logGroup) ? logGroup : 'other';
    
    const logEntry = {
        timestamp,
        category: mappedCategory,
        logGroup: mappedGroup,
        message: message,
        data: data || null
    };
    
    // Console log with clean format
    console.log(`[${timestamp}] [${mappedGroup.toUpperCase()}/${mappedCategory.toUpperCase()}] ${message}`, data || '');

    // Only broadcast server logs via SSE (avoid infinite loops)
    if (category !== 'sse-broadcast') {
        broadcastToClients('server-log', logEntry);
    }
}

// ============================================
// INGREDIENT STATUS CHANGE LOGGER
// ============================================

function logIngredientStatusChange(tag_mac, oldStatus, newStatus) {
    if (!global.db) return;

    global.db.get(
        `SELECT rt.ingredients_id, i.ingredients_name
         FROM RFIDTags rt
         JOIN ingredients i ON rt.ingredients_id = i.ingredients_id
         WHERE rt.tag_rfid = ?`,
        [tag_mac],
        (err, row) => {
            if (err || !row) {
                logMessage('error', `Could not resolve ingredient for tag ${tag_mac}`, { error: err?.message }, 'tag');
                return;
            }

            // Find which foods use this ingredient (for context)
            global.db.all(
                `SELECT DISTINCT f.food_name
                 FROM food_ingredients fi
                 JOIN food f ON fi.food_id = f.food_id
                 WHERE fi.ingredients_id = ?`,
                [row.ingredients_id],
                (err2, foodRows) => {
                    const usedIn = (!err2 && foodRows) ? foodRows.map(f => f.food_name) : [];

                    const logData = {
                        tag_mac,
                        ingredient: row.ingredients_name,
                        from: oldStatus,
                        to: newStatus,
                        used_in: usedIn
                    };

                    logMessage(
                        'tag',
                        `Ingredient status change: ${row.ingredients_name} (tag ${tag_mac}) changed from ${oldStatus} to ${newStatus}`,
                        logData,
                        'tag'
                    );

                    // Also push a dedicated event
                    broadcastToClients('ingredient-status-change', logData);
                }
            );
        }
    );
}

// Attach to `router` (not `module.exports`) because this file does
// `module.exports = router` at the bottom, which would otherwise
// overwrite/discard a property set directly on module.exports here.
router.logIngredientStatusChange = logIngredientStatusChange;

// ============================================
// HELPER: Format order number
// ============================================

function formatOrderNumber(orderNumber) {
    return String(orderNumber).trim().padStart(2, '0');
}

// ============================================
// SSE ENDPOINT
// ============================================

router.get('/api/events', (req, res) => {
    logMessage('system', 'SSE client connecting...');
    
    // Generate unique client ID
    const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    // Store client ID on response object
    res._clientId = clientId;
    clientHeartbeats.set(clientId, Date.now());
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
        type: 'connected', 
        payload: { 
            message: 'SSE connected', 
            clientId: clientId,
            timestamp: new Date().toISOString() 
        } 
    })}\n\n`);
    
    // Add client to list
    sseClients.push(res);
    logMessage('system', `SSE client ${clientId} connected. Total clients: ${sseClients.length}`);
    
    // Send current order status to new client
    if (global.db) {
        global.db.all(
            `SELECT order_number, order_status, food_id, order_time_started 
             FROM Orders 
             WHERE order_status IN ('pending', 'completed', 'failed', 'missed')
             ORDER BY orders_id DESC 
             LIMIT 10`,
            (err, orders) => {
                if (!err && orders) {
                    res.write(`data: ${JSON.stringify({ 
                        type: 'initial-state', 
                        payload: { orders } 
                    })}\n\n`);
                }
            }
        );
    }
    
    // Send heartbeat ping every 15 seconds
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(`: heartbeat\n\n`);
            clientHeartbeats.set(clientId, Date.now());
        } catch (e) {
            clearInterval(heartbeatInterval);
        }
    }, 15000);
    
    // Handle client disconnect
    req.on('close', () => {
        logMessage('system', `SSE client ${clientId} disconnected`);
        clearInterval(heartbeatInterval);
        sseClients = sseClients.filter(c => c !== res);
        clientHeartbeats.delete(clientId);
        logMessage('system', `Total SSE clients: ${sseClients.length}`);
    });
});

// ============================================
// CHECK ORDERS ENDPOINT (for polling fallback)
// ============================================

router.get('/api/orders/check', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    
    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    global.db.all(
        `SELECT order_number, order_status, food_id, order_time_started
         FROM Orders 
         WHERE order_status IN ('completed', 'failed', 'missed')
         ORDER BY orders_id DESC 
         LIMIT ?`,
        [limit],
        (err, orders) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ orders });
        }
    );
});

// ============================================
// GET PENDING ORDERS
// ============================================

router.get('/api/orders/pending', (req, res) => {
    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    global.db.all(
        `SELECT o.orders_id, o.order_number, o.food_id, f.food_name, o.order_time_started
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_status = 'pending'
         ORDER BY o.orders_id ASC`,
        (err, orders) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ orders });
        }
    );
});

// ============================================
// TEST ENDPOINT
// ============================================

router.get('/api/test', (req, res) => {
    logMessage('system', 'API test endpoint called');
    res.json({ 
        status: 'ok', 
        message: 'Ticket rail API is working!',
        timestamp: new Date().toISOString(),
        clients: sseClients.length
    });
});

// ============================================
// RECIPE API ENDPOINTS
// ============================================

// Get all recipes from database
router.get('/api/recipes', (req, res) => {
    logMessage('system', 'Fetching all recipes');
    
    if (!global.db) {
        logMessage('error', 'Database not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    global.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='food'", (err, tableExists) => {
        if (err) {
            logMessage('error', 'Error checking table existence', { error: err.message });
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        
        if (!tableExists) {
            logMessage('error', 'Food table does not exist in database');
            return res.status(404).json({ 
                error: 'No recipes found',
                message: 'The "food" table does not exist in the database.'
            });
        }
        
        global.db.all(
            `SELECT food_id as id, food_name as name FROM food ORDER BY food_name`,
            (err, foods) => {
                if (err) {
                    logMessage('error', 'Database query error', { error: err.message });
                    return res.status(500).json({
                        error: 'Database query error',
                        details: err.message
                    });
                }

                if (!foods || foods.length === 0) {
                    logMessage('warning', 'No recipes found in database');
                    return res.status(404).json({
                        error: 'No recipes found',
                        message: 'The database has no food items. Please add some recipes first.'
                    });
                }

                // For each food, pull its ingredients AND the ordered prep
                // chain per ingredient (same shape used by /api/esp/submit),
                // so ingredients[i] and prepMethods[i] line up by index.
                const buildRecipe = (food) => new Promise((resolve, reject) => {
                    const ingredientsSql = `
                        SELECT i.ingredients_id, i.ingredients_name
                        FROM food_ingredients fi
                        JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                        WHERE fi.food_id = ?
                    `;

                    global.db.all(ingredientsSql, [food.id], (err, ingredientRows) => {
                        if (err) return reject(err);

                        if (!ingredientRows || ingredientRows.length === 0) {
                            return resolve({
                                id: food.id,
                                name: food.name,
                                prepTimeSeconds: 30,
                                ingredients: ['No ingredients listed'],
                                prepMethods: ['Ready'],
                                totalPrepSteps: 0
                            });
                        }

                        const stepsSql = `
                            SELECT
                                fi.ingredients_id,
                                pm.preparation_method_name AS required_action
                            FROM food_ingredients fi
                            LEFT JOIN food_ingredient_preparation fip ON fi.food_ingredients_id = fip.food_ingredients_id
                            LEFT JOIN preparation_method pm ON fip.preparation_method_id = pm.preparation_method_id
                            WHERE fi.food_id = ?
                            ORDER BY fip.prep_step_order ASC
                        `;

                        global.db.all(stepsSql, [food.id], (err, stepRows) => {
                            if (err) return reject(err);

                            const stepsByIngredient = {};
                            (stepRows || []).forEach(step => {
                                if (!step.required_action) return;
                                if (!stepsByIngredient[step.ingredients_id]) {
                                    stepsByIngredient[step.ingredients_id] = [];
                                }
                                stepsByIngredient[step.ingredients_id].push(step.required_action);
                            });

                            const ingredients = ingredientRows.map(row => row.ingredients_name);
                            const prepMethods = ingredientRows.map(row => {
                                const chain = stepsByIngredient[row.ingredients_id];
                                return chain && chain.length ? chain.join(' → ') : 'Ready';
                            });

                            // Sum of required prep actions across every ingredient in this
                            // recipe — feeds the difficulty multiplier on the client
                            // (ingredientCount alone doesn't capture a recipe where each
                            // ingredient needs multiple prep steps).
                            const totalPrepSteps = ingredientRows.reduce((sum, row) => {
                                const chain = stepsByIngredient[row.ingredients_id];
                                return sum + (chain ? chain.length : 0);
                            }, 0);

                            resolve({
                                id: food.id,
                                name: food.name,
                                prepTimeSeconds: 30,
                                ingredients,
                                prepMethods,
                                totalPrepSteps
                            });
                        });
                    });
                });

                Promise.all(foods.map(buildRecipe))
                    .then(recipes => {
                        logMessage('success', `Returning ${recipes.length} recipes to client`);
                        res.json(recipes);
                    })
                    .catch(err => {
                        logMessage('error', 'Database query error', { error: err.message });
                        res.status(500).json({
                            error: 'Database query error',
                            details: err.message
                        });
                    });
            }
        );
    });
});

// Get single recipe by ID
router.get('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    logMessage('system', `Fetching recipe with ID: ${id}`);
    
    if (!global.db) {
        logMessage('error', 'Database not available');
        return res.status(500).json({ error: 'Database not available' });
    }
    
    global.db.get('SELECT food_id as id, food_name as name FROM food WHERE food_id = ?', [id], (err, food) => {
        if (err) {
            logMessage('error', 'Database error fetching recipe', { error: err.message });
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
            logMessage('warning', `Recipe ${id} not found`);
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
                logMessage('error', 'Error getting ingredients', { error: err.message });
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
            
            logMessage('success', `Recipe ${id} (${food.name}) returned successfully`);
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
        logMessage('error', 'Missing fields in order creation', { order_number, food_id }, 'order');
        return res.status(400).json({
            error: 'Missing fields',
            message: 'order_number and food_id are required'
        });
    }

    const formattedOrder = formatOrderNumber(order_number);

    if (!/^\d{2}$/.test(formattedOrder)) {
        logMessage('error', `Invalid order number format: ${order_number}`, null, 'order');
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    if (!global.db) {
        logMessage('error', 'Database not available', null, 'order');
        return res.status(500).json({ error: 'Database not available' });
    }

    // Check if food exists (also grab food_name so the created log/broadcast
    // can say what the order actually is, not just its numeric food_id)
    global.db.get('SELECT food_id, food_name FROM food WHERE food_id = ?', [food_id], (err, food) => {
        if (err) {
            logMessage('error', 'Error checking food', { error: err.message }, 'order');
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
            logMessage('error', `Food with ID ${food_id} not found`, null, 'order');
            return res.status(404).json({
                error: 'Food not found',
                message: `Food with ID ${food_id} does not exist`
            });
        }

        // Check for existing pending order with same number
        global.db.get(
            `SELECT orders_id FROM Orders WHERE order_number = ? AND order_status = 'pending'`,
            [formattedOrder],
            (err, existing) => {
                if (err) {
                    logMessage('error', 'Error checking existing order', { error: err.message }, 'order');
                    return res.status(500).json({ error: 'Database error' });
                }
                if (existing) {
                    logMessage('warning', `Order number ${formattedOrder} is already pending`, null, 'order');
                    return res.status(409).json({
                        error: 'Duplicate order_number',
                        message: `Order ${formattedOrder} is already pending. Wait for it to resolve first.`
                    });
                }

                // Check if there are too many pending orders
                global.db.get(
                    `SELECT COUNT(*) as count FROM Orders WHERE order_status = 'pending'`,
                    (err, result) => {
                        if (err) {
                            logMessage('error', 'Error checking pending count', { error: err.message }, 'order');
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        if (result.count >= 10) {
                            logMessage('warning', `Too many pending orders (${result.count})`, null, 'order');
                            return res.status(429).json({
                                error: 'Too many pending orders',
                                message: 'Maximum 10 pending orders allowed'
                            });
                        }

                        global.db.run(
                            `INSERT INTO Orders (food_id, order_number, order_status, order_time_started)
                             VALUES (?, ?, 'pending', datetime('now'))`,
                            [food_id, formattedOrder],
                            function (err) {
                                if (err) {
                                    logMessage('error', 'Error creating order', { error: err.message }, 'order');
                                    return res.status(500).json({ error: 'Database error' });
                                }

                                logMessage('order', `Order ${formattedOrder} created: "${food.food_name}" (food_id ${food_id})`, null, 'order');
                                
                                // Broadcast new order via SSE
                                broadcastToClients('order-created', {
                                    order_number: formattedOrder,
                                    display_order_number: '#' + formattedOrder,
                                    food_id: food_id,
                                    food_name: food.food_name,
                                    orders_id: this.lastID
                                });
                                
                                res.json({
                                    success: true,
                                    orders_id: this.lastID,
                                    order_number: formattedOrder,
                                    food_id,
                                    food_name: food.food_name
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// ============================================
// CLEAR ORDERS ENDPOINT (for reset)
// ============================================

router.post('/api/orders/clear', (req, res) => {
    logMessage('system', 'Clear orders endpoint called');
    
    if (!global.db) {
        logMessage('error', 'Database not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    // Check if there are any pending orders first
    global.db.get(
        `SELECT COUNT(*) as count FROM Orders WHERE order_status = 'pending'`,
        (err, result) => {
            if (err) {
                logMessage('error', 'Error checking pending orders', { error: err.message });
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (result.count === 0) {
                logMessage('info', 'No pending orders to clear');
                return res.json({
                    success: true,
                    message: 'No pending orders to clear',
                    orders_cleared: 0,
                    tags_reset: true
                });
            }
            
            // Begin transaction
            global.db.run("BEGIN TRANSACTION", (err) => {
                if (err) {
                    logMessage('error', 'Error starting transaction', { error: err.message });
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Reset tag statuses
                global.db.run(
                    `UPDATE RFIDTags SET current_status = 'Default'`,
                    function(err) {
                        if (err) {
                            logMessage('error', 'Error resetting tag statuses', { error: err.message });
                            global.db.run("ROLLBACK");
                            return res.status(500).json({ 
                                error: 'Database error',
                                message: 'Failed to reset tag statuses'
                            });
                        }
                        
                        logMessage('tag', `Reset ${this.changes || 0} tag statuses to 'Default'`, null, 'tag');
                        
                        // Delete all orders
                        global.db.run(
                            `DELETE FROM Orders`,
                            function(err) {
                                if (err) {
                                    logMessage('error', 'Error clearing orders', { error: err.message }, 'order');
                                    global.db.run("ROLLBACK");
                                    return res.status(500).json({ 
                                        error: 'Database error',
                                        message: 'Failed to clear orders'
                                    });
                                }
                                
                                const ordersCleared = this.changes || 0;
                                logMessage('order', `Cleared ${ordersCleared} orders from database`, null, 'order');
                                
                                // Clear order actions
                                global.db.run(
                                    `DELETE FROM OrderActions`,
                                    function(err) {
                                        if (err) {
                                            logMessage('warning', 'Error clearing order actions', { error: err.message }, 'order');
                                        } else {
                                            logMessage('order', `Cleared ${this.changes || 0} order actions`, null, 'order');
                                        }
                                        
                                        // Commit transaction
                                        global.db.run("COMMIT", (err) => {
                                            if (err) {
                                                logMessage('error', 'Error committing transaction', { error: err.message });
                                                global.db.run("ROLLBACK");
                                                return res.status(500).json({ error: 'Database error' });
                                            }
                                            
                                            broadcastToClients('orders-cleared', {
                                                orders_cleared: ordersCleared,
                                                tags_reset: true
                                            });
                                            
                                            res.json({
                                                success: true,
                                                message: 'All orders cleared and tags reset to Default',
                                                orders_cleared: ordersCleared,
                                                tags_reset: true
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

// ============================================
// ESP STATUS ENDPOINT
// ============================================

router.get('/api/esp/status', (req, res) => {
    logMessage('system', 'ESP status check requested');
    
    if (!global.db) {
        logMessage('error', 'Database not available');
        return res.json({ online: false, error: 'Database not available' });
    }
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    global.db.get(
        `SELECT ed.device_mac, ed.last_seen
         FROM ESP32Devices ed
         JOIN ESP32Tagger et ON et.device_id = ed.device_id
         JOIN station s ON s.station_id = et.station_id
         WHERE s.station_name = 'Counter' AND ed.last_seen > ?
         LIMIT 1`,
        [fiveMinutesAgo],
        (err, row) => {
            if (err) {
                logMessage('error', 'Error checking ESP status', { error: err.message });
                return res.json({ online: false });
            }
            const online = !!row;
            const lastSeen = row ? row.last_seen : null;
            logMessage('info', `ESP status: ${online ? 'online' : 'offline'}`);
            res.json({ online: online, last_seen: lastSeen });
        }
    );
});

// ============================================
// ORDER MISSED UPDATE DATABASE
// ============================================

router.post('/api/esp/missed', (req, res) => {
    const { order_number } = req.body;

    logMessage('order', `Marking order ${order_number} as missed`, null, 'order');

    if (order_number === undefined || order_number === null || order_number === '') {
        logMessage('error', 'Missing order_number in missed request', null, 'order');
        return res.status(400).json({
            success: false,
            error: 'Missing order_number',
            message: 'order_number is required'
        });
    }

    if (!global.db) {
        logMessage('error', 'Database not available', null, 'order');
        return res.status(500).json({
            success: false,
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }

    const formattedOrder = formatOrderNumber(order_number);

    if (!/^\d{2}$/.test(formattedOrder)) {
        logMessage('error', `Invalid order number format: ${order_number}`, null, 'order');
        return res.status(400).json({
            success: false,
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number, such as "01"'
        });
    }

    // Look up which food this pending order is for, purely so the final
    // log/broadcast can say what was missed instead of just the number.
    // If this lookup fails or finds nothing, foodName just stays null and
    // the rest of the flow below proceeds exactly as before.
    global.db.get(
        `SELECT f.food_name
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_number = ? AND o.order_status = 'pending'
         ORDER BY o.orders_id DESC
         LIMIT 1`,
        [formattedOrder],
        (lookupErr, orderInfo) => {
            const foodName = (!lookupErr && orderInfo) ? orderInfo.food_name : null;

            // Use transaction to ensure consistency
            global.db.run("BEGIN TRANSACTION", (err) => {
                if (err) {
                    logMessage('error', 'Error starting transaction', { error: err.message }, 'order');
                    return res.status(500).json({ error: 'Database error' });
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
                            logMessage('error', `Failed to mark order ${formattedOrder} as missed`, { error: err.message }, 'order');
                            global.db.run("ROLLBACK");
                            return res.status(500).json({
                                success: false,
                                error: 'Database error',
                                message: err.message
                            });
                        }

                        if (this.changes === 0) {
                            logMessage('warning', `Order ${formattedOrder} was not found or was no longer pending`, null, 'order');
                            global.db.run("ROLLBACK");
                            return res.status(409).json({
                                success: false,
                                error: 'Order not updated',
                                message: `Order ${formattedOrder} was not found or is no longer pending`
                            });
                        }

                        // Commit transaction - no tag reset for missed orders
                        global.db.run("COMMIT", (err) => {
                            if (err) {
                                logMessage('error', 'Error committing transaction', { error: err.message }, 'order');
                                global.db.run("ROLLBACK");
                                return res.status(500).json({ error: 'Database error' });
                            }

                            logMessage('order', `Order ${formattedOrder}${foodName ? ` (${foodName})` : ''} marked as missed`, null, 'order');
                            
                            // Broadcast missed order via SSE
                            broadcastToClients('order-missed', {
                                order_number: formattedOrder,
                                display_order_number: '#' + String(formattedOrder).padStart(2, '0'),
                                food_name: foodName
                            });
                            
                            return res.json({
                                success: true,
                                order_number: formattedOrder,
                                order_status: 'missed',
                                food_name: foodName
                            });
                        });
                    }
                );
            });
        }
    );
});

// ============================================
// COUNTER ESP SUBMIT ENDPOINT
// ============================================

router.post('/api/esp/submit', (req, res, next) => {
    const { order_number, device_mac, tag_macs } = req.body;
    
    logMessage(
        'esp',
        `ESP submit request received: order ${order_number}, device ${device_mac || 'GAME_CLIENT'}, ${tag_macs ? tag_macs.length : 0} tag(s): ${tag_macs && tag_macs.length ? tag_macs.join(', ') : 'none'}`,
        null,
        'order'
    );
    
    if (!order_number) {
        logMessage('error', 'Missing order_number in ESP submit', null, 'order');
        return res.status(400).json({ 
            error: 'Missing order_number',
            message: 'order_number is required'
        });
    }
    
    if (!tag_macs || !Array.isArray(tag_macs)) {
        logMessage('error', 'Missing or invalid tag_macs in ESP submit', null, 'order');
        return res.status(400).json({ 
            error: 'Missing tag_macs',
            message: 'tag_macs array is required'
        });
    }
    
    if (tag_macs.length === 0) {
        logMessage('error', 'Empty tag_macs array in ESP submit', null, 'order');
        return res.status(400).json({ 
            error: 'Empty tag_macs',
            message: 'At least one tag MAC is required'
        });
    }
    
    // Use a lock to prevent race conditions
    const lockKey = `order_${formatOrderNumber(order_number)}`;
    if (global.orderLocks && global.orderLocks[lockKey]) {
        logMessage('warning', `Order ${order_number} is already being processed`, null, 'order');
        return res.status(409).json({
            error: 'Order processing in progress',
            message: `Order ${order_number} is currently being processed`
        });
    }
    
    // Initialize locks if not exists
    if (!global.orderLocks) {
        global.orderLocks = {};
    }
    global.orderLocks[lockKey] = true;
    
    // Auto-release lock after 10 seconds (safety)
    setTimeout(() => {
        if (global.orderLocks) {
            delete global.orderLocks[lockKey];
        }
    }, 10000);
    
    console.log(`Processing submission: Order ${order_number} from device ${device_mac || 'GAME_CLIENT'}`);
    console.log(`Tags received: ${tag_macs.join(', ')}`);
    
    if (!global.db) {
        delete global.orderLocks[lockKey];
        logMessage('error', 'Database not available', null, 'order');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    if (device_mac) {
        logMessage('esp', `Verifying device: ${device_mac}`, null, 'order');
        global.db.get(
            `SELECT ed.device_id, s.station_name
             FROM ESP32Devices ed
             JOIN ESP32Tagger et ON et.device_id = ed.device_id
             JOIN station s ON s.station_id = et.station_id
             WHERE ed.device_mac = ?`,
            [device_mac],
            (err, device) => {
                if (err) {
                    delete global.orderLocks[lockKey];
                    logMessage('error', 'Error finding device', { error: err.message }, 'order');
                    return res.status(500).json({ error: 'Database error' });
                }
                if (!device) {
                    delete global.orderLocks[lockKey];
                    logMessage('error', `Device ${device_mac} not found or has no station assigned`, null, 'order');
                    return res.status(404).json({ 
                        error: 'Device not found',
                        message: 'This ESP32 is not registered or has no station assigned.'
                    });
                }
                if (device.station_name !== 'Counter') {
                    delete global.orderLocks[lockKey];
                    logMessage('error', `Device ${device_mac} is at station "${device.station_name}", not Counter`, null, 'order');
                    return res.status(403).json({ 
                        error: 'Invalid device type',
                        message: 'Only devices assigned to the Counter station can submit orders'
                    });
                }
                logMessage('success', `Device ${device_mac} verified as Counter`, null, 'order');
                findOrderAndValidate(order_number, tag_macs, res, next, lockKey);
            }
        );
    } else {
        logMessage('warning', 'No device_mac provided - allowing game client submission', null, 'order');
        findOrderAndValidate(order_number, tag_macs, res, next, lockKey);
    }
});

// ============================================
// INTERNAL: Find Order and Validate
// ============================================

function findOrderAndValidate(order_number, tag_macs, res, next, lockKey) {
    const formattedOrder = formatOrderNumber(order_number);

    if (!/^\d{2}$/.test(formattedOrder)) {
        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
        logMessage('error', `Invalid order number format: ${order_number}`, null, 'order');
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    logMessage('order', `Looking for order: ${formattedOrder}`, null, 'order');

    global.db.all(
        `SELECT orders_id, order_number, order_status, food_id, order_time_started 
         FROM Orders 
         WHERE order_number = ?
         ORDER BY orders_id DESC`,
        [formattedOrder],
        (err, allOrdersWithThisNumber) => {
            if (err) {
                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                logMessage('error', 'Error fetching orders', { error: err.message }, 'order');
                return res.status(500).json({ error: 'Database error' });
            }

            if (allOrdersWithThisNumber && allOrdersWithThisNumber.length > 0) {
                logMessage('info', `Found ${allOrdersWithThisNumber.length} order(s) with number ${formattedOrder}`, null, 'order');
            } else {
                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                logMessage('error', `No orders with number ${formattedOrder} found in database`, null, 'order');
                return res.status(404).json({
                    error: 'Order not found',
                    message: `Order number ${formattedOrder} does not exist in the database.`
                });
            }

            global.db.get(
                `SELECT o.orders_id, o.food_id, f.food_name, o.order_status, o.order_time_started
                 FROM Orders o
                 JOIN food f ON o.food_id = f.food_id
                 WHERE o.order_number = ? AND o.order_status = 'pending'
                 ORDER BY o.orders_id DESC
                 LIMIT 1`,
                [formattedOrder],
                (err, pendingOrder) => {
                    if (err) {
                        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                        logMessage('error', 'Error finding pending order', { error: err.message }, 'order');
                        return res.status(500).json({ error: 'Database error' });
                    }

                    if (!pendingOrder) {
                        global.db.get(
                            `SELECT o.orders_id, o.order_number, o.order_status, f.food_name
                             FROM Orders o
                             JOIN food f ON o.food_id = f.food_id
                             WHERE o.order_number = ?
                             ORDER BY o.orders_id DESC
                             LIMIT 1`,
                            [formattedOrder],
                            (err2, nonPendingOrder) => {
                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                if (err2) {
                                    logMessage('error', 'Error checking non-pending order', { error: err2.message }, 'order');
                                    return res.status(500).json({ error: 'Database error' });
                                } else if (nonPendingOrder) {
                                    logMessage('warning', `Order ${formattedOrder} exists but is "${nonPendingOrder.order_status}" (not pending)`, null, 'order');
                                    return res.status(409).json({
                                        error: 'Order already processed',
                                        message: `Order ${formattedOrder} is already ${nonPendingOrder.order_status}`,
                                        status: nonPendingOrder.order_status,
                                        food: nonPendingOrder.food_name
                                    });
                                } else {
                                    logMessage('error', `Order ${formattedOrder} not found in database`, null, 'order');
                                    return res.status(404).json({
                                        error: 'Order not found',
                                        message: `Order number ${formattedOrder} does not exist in the database.`
                                    });
                                }
                            }
                        );
                        return;
                    }

                    logMessage('order', `Found pending order: ${formattedOrder} (${pendingOrder.food_name})`, null, 'order');

                    // ============================================
                    // STEP 1: Get the ingredients required by this food
                    // ============================================
                    const ingredientsSql = `
                        SELECT i.ingredients_id, i.ingredients_name
                        FROM food_ingredients fi
                        JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                        WHERE fi.food_id = ?
                    `;

                    global.db.all(ingredientsSql, [pendingOrder.food_id], (err, ingredientRows) => {
                        if (err) {
                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                            logMessage('error', 'Error getting ingredients', { error: err.message }, 'order');
                            return res.status(500).json({ error: 'Database error' });
                        }

                        if (!ingredientRows || ingredientRows.length === 0) {
                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                            logMessage('error', `${pendingOrder.food_name} has no ingredients defined`, null, 'order');
                            return res.status(400).json({
                                error: 'Invalid recipe',
                                message: 'This food has no ingredients defined'
                            });
                        }

                        logMessage('order', `Recipe ${pendingOrder.food_name} requires ${ingredientRows.length} ingredient(s): ${ingredientRows.map(r => r.ingredients_name).join(', ')}`, null, 'order');

                        // ============================================
                        // STEP 2: Get required prep chain per ingredient
                        // ============================================
                        const stepsSql = `
                            SELECT
                                fi.ingredients_id,
                                pm.preparation_method_name AS required_action
                            FROM food_ingredients fi
                            LEFT JOIN food_ingredient_preparation fip ON fi.food_ingredients_id = fip.food_ingredients_id
                            LEFT JOIN preparation_method pm ON fip.preparation_method_id = pm.preparation_method_id
                            WHERE fi.food_id = ?
                            ORDER BY fip.prep_step_order ASC
                        `;

                        global.db.all(stepsSql, [pendingOrder.food_id], (err, stepRows) => {
                            if (err) {
                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                logMessage('error', 'Error getting prep steps', { error: err.message }, 'order');
                                return res.status(500).json({ error: 'Database error' });
                            }

                            const expectedByIngredient = {};
                            ingredientRows.forEach(ing => {
                                expectedByIngredient[ing.ingredients_id] = {
                                    name: ing.ingredients_name,
                                    required_actions: []
                                };
                            });
                            stepRows.forEach(step => {
                                if (step.required_action && expectedByIngredient[step.ingredients_id]) {
                                    expectedByIngredient[step.ingredients_id].required_actions.push(step.required_action);
                                }
                            });

                            Object.values(expectedByIngredient).forEach(ing => {
                                ing.expectedStatus = ['Default', ...ing.required_actions].join(' → ');
                                logMessage('match', `${ing.name}: expected status "${ing.expectedStatus}"`, null, 'order');
                            });

                            if (tag_macs.length === 0) {
                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                logMessage('error', 'No tags submitted', null, 'order');
                                return res.status(400).json({
                                    error: 'No tags submitted',
                                    message: 'At least one tag is required'
                                });
                            }

                            // ============================================
                            // STEP 3: Look up what ingredient + status each submitted tag represents
                            // ============================================
                            const placeholders = tag_macs.map(() => '?').join(',');
                            const submittedTagSql = `
                                SELECT tag_rfid AS tag_mac, ingredients_id, current_status
                                FROM RFIDTags
                                WHERE tag_rfid IN (${placeholders})
                            `;

                            global.db.all(submittedTagSql, tag_macs, (err, submittedTagRows) => {
                                if (err) {
                                    if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                    logMessage('error', 'Error looking up submitted tags', { error: err.message }, 'order');
                                    return res.status(500).json({ error: 'Database error' });
                                }

                                // Map: tag_mac -> {ingredients_id, current_status}
                                const tagInfoByMac = new Map();
                                submittedTagRows.forEach(row => {
                                    tagInfoByMac.set(row.tag_mac, {
                                        ingredients_id: row.ingredients_id,
                                        current_status: row.current_status || 'Default'
                                    });
                                });

                                // Any submitted MAC not found in RFIDTags at all = unregistered tag
                                const unregisteredTags = tag_macs.filter(mac => !tagInfoByMac.has(mac));
                                if (unregisteredTags.length > 0) {
                                    logMessage('warning', `Unregistered tags scanned: ${unregisteredTags.join(', ')}`, null, 'order');
                                }

                                // ============================================
                                // STEP 4: Match each required ingredient against the submitted tags
                                // ============================================
                                const results = [];
                                let allPass = true;
                                const claimedMacs = new Set();

                                Object.entries(expectedByIngredient).forEach(([ingredientsId, ing]) => {
                                    const matchingMacs = [...tagInfoByMac.entries()]
                                        .filter(([mac, info]) => String(info.ingredients_id) === String(ingredientsId));

                                    if (matchingMacs.length === 0) {
                                        allPass = false;
                                        results.push({
                                            ingredient: ing.name,
                                            required_chain: ing.expectedStatus,
                                            got: 'NOT SCANNED',
                                            pass: false,
                                            tag_mac: null
                                        });
                                        logMessage('match', `${ing.name}: no tag for this ingredient was scanned`, null, 'order');
                                        return;
                                    }

                                    const correctMatch = matchingMacs.find(([mac, info]) => info.current_status === ing.expectedStatus);
                                    const [chosenMac, chosenInfo] = correctMatch || matchingMacs[0];

                                    claimedMacs.add(chosenMac);
                                    matchingMacs.forEach(([mac]) => {
                                        if (mac !== chosenMac) claimedMacs.add(mac);
                                    });

                                    const pass = chosenInfo.current_status === ing.expectedStatus;
                                    if (!pass) allPass = false;

                                    results.push({
                                        ingredient: ing.name,
                                        required_chain: ing.expectedStatus,
                                        got: chosenInfo.current_status,
                                        pass: pass,
                                        tag_mac: chosenMac
                                    });

                                    logMessage(
                                        'match',
                                        `${ing.name}: required "${ing.expectedStatus}", got "${chosenInfo.current_status}" (tag ${chosenMac}) → ${pass ? 'PASS' : 'FAIL'}`,
                                        {
                                            food: pendingOrder.food_name,
                                            ingredient: ing.name,
                                            required_status: ing.expectedStatus,
                                            submitted_status: chosenInfo.current_status,
                                            submitted_tag: chosenMac,
                                            pass: pass
                                        },
                                        'order'
                                    );

                                    if (matchingMacs.length > 1) {
                                        logMessage('warning', `${ing.name}: ${matchingMacs.length} tags for this ingredient were scanned, expected only 1`, null, 'order');
                                    }
                                });

                                // Check for extra tags
                                const extraMacs = tag_macs.filter(mac => !claimedMacs.has(mac));
                                if (extraMacs.length > 0) {
                                    allPass = false;
                                    results.push({
                                        ingredient: 'Extra tags',
                                        required_chain: 'None',
                                        got: extraMacs.join(', '),
                                        pass: false,
                                        reason: 'Tags not part of this recipe (unregistered or wrong ingredient)'
                                    });
                                    logMessage('error', `Extra/unexpected tags scanned: ${extraMacs.join(', ')}`, null, 'order');
                                }

                                // ============================================
                                // STEP 4.5: Log the validation summary
                                // ============================================
                                const validationSummary = {
                                    order_number: formattedOrder,
                                    food: pendingOrder.food_name,
                                    total_ingredients: Object.keys(expectedByIngredient).length,
                                    results: results
                                };

                                // Log each ingredient match result
                                results.forEach(r => {
                                    if (r.ingredient !== 'Extra tags') {
                                        logMessage(
                                            'match',
                                            `${r.ingredient}: required "${r.required_chain}" -> got "${r.got}"${r.tag_mac ? ` (tag ${r.tag_mac})` : ''} -> ${r.pass ? 'PASS' : 'FAIL'}`,
                                            {
                                                food: pendingOrder.food_name,
                                                ingredient: r.ingredient,
                                                required_status: r.required_chain,
                                                submitted_status: r.got,
                                                submitted_tag: r.tag_mac || null,
                                                pass: r.pass
                                            },
                                            'order'
                                        );
                                    }
                                });

                                // Final validation result
                                if (allPass) {
                                    logMessage('success', `Order ${formattedOrder} (${pendingOrder.food_name}) PASSED validation`, validationSummary, 'order');
                                } else {
                                    logMessage('error', `Order ${formattedOrder} (${pendingOrder.food_name}) FAILED validation`, validationSummary, 'order');
                                }

                                // ============================================
                                // STEP 5: Update order + reset ONLY submitted tags
                                // ============================================
                                global.db.run("BEGIN TRANSACTION", (err) => {
                                    if (err) {
                                        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                        logMessage('error', 'Error starting transaction', { error: err.message }, 'order');
                                        return res.status(500).json({ error: 'Database error' });
                                    }

                                    const newStatus = allPass ? 'completed' : 'failed';
                                    const statusMessage = allPass ? 'COMPLETED' : 'FAILED';

                                    // Update order status
                                    global.db.run(
                                        `UPDATE Orders SET order_status = ? WHERE orders_id = ?`,
                                        [newStatus, pendingOrder.orders_id],
                                        function (err) {
                                            if (err) {
                                                logMessage('error', 'Error updating order', { error: err.message }, 'order');
                                                global.db.run("ROLLBACK");
                                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                return res.status(500).json({ error: 'Database error' });
                                            }

                                            // Reset ONLY the submitted tags to 'Default'
                                            const placeholders = tag_macs.map(() => '?').join(',');
                                            const resetTagsSql = `
                                                UPDATE RFIDTags 
                                                SET current_status = 'Default' 
                                                WHERE tag_rfid IN (${placeholders})
                                            `;

                                            global.db.run(
                                                resetTagsSql,
                                                tag_macs,
                                                function (err) {
                                                    if (err) {
                                                        logMessage('error', 'Error resetting submitted tags', { error: err.message }, 'order');
                                                        global.db.run("ROLLBACK");
                                                        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                        return res.status(500).json({ error: 'Database error' });
                                                    }

                                                    logMessage('tag', `Reset tags to 'Default': ${tag_macs.join(', ')}`, null, 'tag');

                                                    global.db.run("COMMIT", (err) => {
                                                        if (err) {
                                                            logMessage('error', 'Error committing transaction', { error: err.message }, 'order');
                                                            global.db.run("ROLLBACK");
                                                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                            return res.status(500).json({ error: 'Database error' });
                                                        }

                                                        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];

                                                        const responseData = {
                                                            success: allPass,
                                                            result: allPass ? 'PASS' : 'FAIL',
                                                            order_number: formattedOrder,
                                                            food: pendingOrder.food_name,
                                                            score_earned: allPass ? 100 : 0,
                                                            message: allPass ? 'Order completed successfully' : 'Order validation failed. Check ingredient preparation chains.',
                                                            details: results
                                                        };

                                                        logMessage('success', `Order ${formattedOrder} (${pendingOrder.food_name}) ${statusMessage}`, null, 'order');
                                                        
                                                        broadcastToClients('esp-order-complete', {
                                                            order_number: formattedOrder,
                                                            success: allPass,
                                                            details: results,
                                                            score_earned: allPass ? 100 : 0,
                                                            food: pendingOrder.food_name,
                                                            message: allPass ? 'Order completed successfully' : 'Order validation failed'
                                                        });

                                                        broadcastToClients('esp-submit-result', responseData);

                                                        if (!allPass) {
                                                            broadcastToClients('order-failed', {
                                                                order_number: formattedOrder,
                                                                display_order_number: '#' + formattedOrder,
                                                                food: pendingOrder.food_name,
                                                                reason: 'Validation failed'
                                                            });
                                                        }

                                                        res.json(responseData);
                                                    });
                                                }
                                            );
                                        }
                                    );
                                });
                            });
                        });
                    });
                }
            );
        }
    );
}

// ============================================
// CLEAR TAGS STATUS
// ============================================

router.post('/api/rfid/reset', (req,res) => {
    logMessage('info', '📡 /api/rfid/reset endpoint called');
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
        return res.json({ online: false, error: 'Database not available' });
    }
    // Edit ALL RFID tags
    global.db.run(
    `UPDATE RFIDTags
     SET current_status = 'Default'`,
    function (err) {
        if (err) {
            console.error("Failed to reset RFID tags:", err);
            return res.status(500).json({
                    success: false,
                    error: 'Failed to reset RFID tags'
                });
        } else {
            console.log(`Reset ${this.changes} RFID tags.`);
                return res.json({
                success: true,
                tags_reset: this.changes
    });
        }
    }
    );
})

// ============================================
// VIEW ROUTES
// ============================================

router.get('/game', (req, res) => {
    logMessage('system', 'Rendering game page');
    res.render('game', {
        title: 'Ticket Rail - Game'
    });
});

router.get('/game/settings', (req, res) => {
    logMessage('system', 'Rendering game settings page');
    res.render('gamesettings', {
        title: 'Ticket Rail - Controls'
    });
});

// ============================================
// LOG VIEWER ROUTES
// ============================================

router.get('/logviewer', (req, res) => {
    logMessage('system', 'Rendering log viewer page');
    res.render('logviewer', {
        title: 'Ticket Rail - Log Viewer'
    });
});


console.log('✅ Ticketrail routes loaded successfully');
console.log(`📡 SSE endpoint available at /api/events`);
console.log(`📤 SSE broadcasting to ${sseClients.length} clients`);
console.log(`🏆 Leaderboard endpoints available via /api/leaderboard`);
console.log(`📊 Log viewer available at /logviewer and /settings/logs`);

module.exports = router;