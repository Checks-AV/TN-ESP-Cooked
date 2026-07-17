// routes/ticketrail.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

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

// ============================================
// HELPER: Logging function with SSE broadcast
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
    
    // Broadcast to SSE clients (but avoid infinite loops)
    if (type !== 'sse-broadcast') {
        broadcastToClients('server-log', logEntry);
    }
}

// ============================================
// HELPER: Get formatted order number
// ============================================

function formatOrderNumber(orderNumber) {
    return String(orderNumber).trim().padStart(2, '0');
}

// ============================================
// SSE ENDPOINT
// ============================================

router.get('/api/events', (req, res) => {
    console.log('📡 SSE client connecting...');
    
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
    console.log(`✅ SSE client ${clientId} connected. Total clients: ${sseClients.length}`);
    
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
        console.log(`📡 SSE client ${clientId} disconnected`);
        clearInterval(heartbeatInterval);
        sseClients = sseClients.filter(c => c !== res);
        clientHeartbeats.delete(clientId);
        console.log(`📡 Total clients: ${sseClients.length}`);
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
    logMessage('info', '✅ /api/test endpoint called');
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

    const formattedOrder = formatOrderNumber(order_number);

    if (!/^\d{2}$/.test(formattedOrder)) {
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }

    // Check if food exists
    global.db.get('SELECT food_id FROM food WHERE food_id = ?', [food_id], (err, food) => {
        if (err) {
            logMessage('error', 'Error checking food:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
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

                // Check if there are too many pending orders
                global.db.get(
                    `SELECT COUNT(*) as count FROM Orders WHERE order_status = 'pending'`,
                    (err, result) => {
                        if (err) {
                            logMessage('error', 'Error checking pending count:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        if (result.count >= 10) {
                            logMessage('warn', `⚠️ Too many pending orders (${result.count})`);
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
                                    logMessage('error', 'Error creating order:', err);
                                    return res.status(500).json({ error: 'Database error' });
                                }

                                logMessage('success', `✅ Order ${formattedOrder} created (food_id ${food_id})`);
                                
                                // Broadcast new order via SSE
                                broadcastToClients('order-created', {
                                    order_number: formattedOrder,
                                    display_order_number: '#' + formattedOrder,
                                    food_id: food_id,
                                    orders_id: this.lastID
                                });
                                
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
            }
        );
    });
});

// ============================================
// CLEAR ORDERS ENDPOINT (for reset)
// ============================================

router.post('/api/orders/clear', (req, res) => {
    logMessage('info', '📡 /api/orders/clear endpoint called');
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
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
                logMessage('error', 'Error checking pending orders:', err);
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
                    logMessage('error', 'Error starting transaction:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Reset tag statuses
                global.db.run(
                    `UPDATE RFIDTags SET current_status = 'Default'`,
                    function(err) {
                        if (err) {
                            logMessage('error', '❌ Error resetting tag statuses:', err);
                            global.db.run("ROLLBACK");
                            return res.status(500).json({ 
                                error: 'Database error',
                                message: 'Failed to reset tag statuses'
                            });
                        }
                        
                        logMessage('info', `🔄 Reset ${this.changes || 0} tag statuses to 'Default'`);
                        
                        // Delete all orders
                        global.db.run(
                            `DELETE FROM Orders`,
                            function(err) {
                                if (err) {
                                    logMessage('error', '❌ Error clearing orders:', err);
                                    global.db.run("ROLLBACK");
                                    return res.status(500).json({ 
                                        error: 'Database error',
                                        message: 'Failed to clear orders'
                                    });
                                }
                                
                                const ordersCleared = this.changes || 0;
                                logMessage('success', `✅ Cleared ${ordersCleared} orders from database`);
                                
                                // Clear order actions
                                global.db.run(
                                    `DELETE FROM OrderActions`,
                                    function(err) {
                                        if (err) {
                                            logMessage('warn', '⚠️ Error clearing order actions:', err);
                                        } else {
                                            logMessage('info', `🔄 Cleared ${this.changes || 0} order actions`);
                                        }
                                        
                                        // Commit transaction
                                        global.db.run("COMMIT", (err) => {
                                            if (err) {
                                                logMessage('error', 'Error committing transaction:', err);
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
    logMessage('info', '📡 /api/esp/status endpoint called');
    
    if (!global.db) {
        logMessage('error', '❌ global.db is not available');
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
                logMessage('error', 'Error checking ESP status:', err);
                return res.json({ online: false });
            }
            const online = !!row;
            const lastSeen = row ? row.last_seen : null;
            logMessage('info', `ESP status: ${online ? 'Online ✅' : 'Offline ❌'}`);
            res.json({ online: online, last_seen: lastSeen });
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

    const formattedOrder = formatOrderNumber(order_number);

    if (!/^\d{2}$/.test(formattedOrder)) {
        logMessage('error', `❌ Invalid order number: ${order_number}`);
        return res.status(400).json({
            success: false,
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number, such as "01"'
        });
    }

    // Use transaction to ensure consistency
    global.db.run("BEGIN TRANSACTION", (err) => {
        if (err) {
            logMessage('error', 'Error starting transaction:', err);
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
                    logMessage('error', `❌ Failed to mark order ${formattedOrder} as missed`, err);
                    global.db.run("ROLLBACK");
                    return res.status(500).json({
                        success: false,
                        error: 'Database error',
                        message: err.message
                    });
                }

                if (this.changes === 0) {
                    logMessage('warn', `⚠️ Order ${formattedOrder} was not found or was no longer pending`);
                    global.db.run("ROLLBACK");
                    return res.status(409).json({
                        success: false,
                        error: 'Order not updated',
                        message: `Order ${formattedOrder} was not found or is no longer pending`
                    });
                }

                // Reset tags
                global.db.run(
                    `UPDATE RFIDTags SET current_status = 'Default'`,
                    function(err) {
                        if (err) {
                            logMessage('error', 'Error resetting tags:', err);
                            global.db.run("ROLLBACK");
                            return res.status(500).json({ error: 'Database error' });
                        }

                        global.db.run("COMMIT", (err) => {
                            if (err) {
                                logMessage('error', 'Error committing transaction:', err);
                                global.db.run("ROLLBACK");
                                return res.status(500).json({ error: 'Database error' });
                            }

                            logMessage('success', `✅ Order ${formattedOrder} marked as missed`);
                            
                            // Broadcast missed order via SSE
                            broadcastToClients('order-missed', {
                                order_number: formattedOrder,
                                display_order_number: '#' + String(formattedOrder).padStart(2, '0')
                            });
                            
                            return res.json({
                                success: true,
                                order_number: formattedOrder,
                                order_status: 'missed'
                            });
                        });
                    }
                );
            }
        );
    });
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
    
    // Use a lock to prevent race conditions
    const lockKey = `order_${formatOrderNumber(order_number)}`;
    if (global.orderLocks && global.orderLocks[lockKey]) {
        logMessage('warn', `⚠️ Order ${order_number} is already being processed`);
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
    
    console.log(`📝 Processing submission: Order ${order_number} from device ${device_mac || 'GAME_CLIENT'}`);
    console.log(`📋 Tags received: ${tag_macs.join(', ')}`);
    
    if (!global.db) {
        delete global.orderLocks[lockKey];
        logMessage('error', '❌ global.db is not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
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
                    delete global.orderLocks[lockKey];
                    logMessage('error', 'Error finding device:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (!device) {
                    delete global.orderLocks[lockKey];
                    logMessage('error', `⚠️ Device ${device_mac} not found or has no station assigned`);
                    return res.status(404).json({ 
                        error: 'Device not found',
                        message: 'This ESP32 is not registered or has no station assigned.'
                    });
                }
                if (device.station_name !== 'Counter') {
                    delete global.orderLocks[lockKey];
                    logMessage('error', `⚠️ Device ${device_mac} is at station "${device.station_name}", not Counter`);
                    return res.status(403).json({ 
                        error: 'Invalid device type',
                        message: 'Only devices assigned to the Counter station can submit orders'
                    });
                }
                logMessage('success', `✅ Device ${device_mac} verified as Counter`);
                findOrderAndValidate(order_number, tag_macs, res, next, lockKey);
            }
        );
    } else {
        logMessage('warn', '⚠️ No device_mac provided - allowing game client submission');
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
        logMessage('error', `❌ Invalid order_number format: "${order_number}"`);
        return res.status(400).json({
            error: 'Invalid order_number',
            message: 'order_number must be a 2-digit number (e.g. "01")'
        });
    }

    logMessage('info', `🔍 Looking for order: ${formattedOrder}`);
    
    global.db.all(
        `SELECT orders_id, order_number, order_status, food_id, order_time_started 
         FROM Orders 
         WHERE order_number = ?
         ORDER BY orders_id DESC`,
        [formattedOrder],
        (err, allOrdersWithThisNumber) => {
            if (err) {
                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                logMessage('error', 'Error fetching orders:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (allOrdersWithThisNumber && allOrdersWithThisNumber.length > 0) {
                logMessage('info', `📊 Found ${allOrdersWithThisNumber.length} order(s) with number ${formattedOrder}:`);
                allOrdersWithThisNumber.forEach((o, idx) => {
                    logMessage('info', `  #${idx + 1}: ID=${o.orders_id}, status="${o.order_status}", food_id=${o.food_id}, time=${o.order_time_started}`);
                });
            } else {
                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                logMessage('error', `❌ No orders at all with number ${formattedOrder} found in database`);
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
                        logMessage('error', 'Error finding pending order:', err);
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
                                    logMessage('error', 'Error checking non-pending order:', err2);
                                } else if (nonPendingOrder) {
                                    logMessage('error', `⚠️ Order ${formattedOrder} exists but is "${nonPendingOrder.order_status}" (not pending)`);
                                    return res.status(409).json({
                                        error: 'Order already processed',
                                        message: `Order ${formattedOrder} is already ${nonPendingOrder.order_status}`,
                                        status: nonPendingOrder.order_status,
                                        food: nonPendingOrder.food_name
                                    });
                                } else {
                                    logMessage('error', `⚠️ Order ${formattedOrder} not found in database at all`);
                                    return res.status(404).json({ 
                                        error: 'Order not found',
                                        message: `Order number ${formattedOrder} does not exist in the database.`
                                    });
                                }
                            }
                        );
                        return;
                    }
                    
                    logMessage('success', `📋 Found pending order: ${formattedOrder} (${pendingOrder.food_name})`);
                    logMessage('info', `📋 Order details: ID=${pendingOrder.orders_id}, status="${pendingOrder.order_status}"`);
                    logMessage('info', `📋 Tags received: ${tag_macs.join(', ')}`);
                    
                    // Get recipe with proper joins
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
                    
                    global.db.all(recipeSql, [pendingOrder.food_id], (err, recipe) => {
                        if (err) {
                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                            logMessage('error', 'Error getting recipe:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        if (recipe.length === 0) {
                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                            logMessage('error', `❌ Recipe for ${pendingOrder.food_name} has no ingredients defined`);
                            return res.status(400).json({ 
                                error: 'Invalid recipe',
                                message: 'This food has no ingredients defined'
                            });
                        }
                        
                        logMessage('info', `📋 Recipe requires ${recipe.length} ingredients`);
                        
                        const hasAnyTag = recipe.some(ing => ing.tag_mac !== null);
                        if (!hasAnyTag) {
                            if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                            logMessage('error', '❌ No tags assigned to any ingredients');
                            return res.status(400).json({
                                error: 'No tags assigned',
                                message: 'None of the ingredients have tags assigned.'
                            });
                        }
                        
                        const expectedStatusMap = {};
                        recipe.forEach((ing) => {
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
                        
                        Object.values(expectedStatusMap).forEach((ing) => {
                            let expectedStatus = 'Default';
                            ing.required_actions.forEach(action => {
                                expectedStatus += ' → ' + action;
                            });
                            logMessage('info', `📋 ${ing.name}: requires tag ${ing.tag_mac || 'NOT ASSIGNED'}, expected: ${expectedStatus}, current: ${ing.current_status}`);
                        });
                        
                        const results = [];
                        let allPass = true;
                        const missingTags = [];
                        const wrongStatus = [];
                        
                        Object.values(expectedStatusMap).forEach((ing) => {
                            let expectedStatus = 'Default';
                            ing.required_actions.forEach(action => {
                                expectedStatus += ' → ' + action;
                            });
                            
                            const actualStatus = ing.current_status || 'Default';
                            const pass = actualStatus === expectedStatus;
                            
                            if (!pass) {
                                allPass = false;
                                if (ing.tag_mac === null) {
                                    missingTags.push(ing.name);
                                } else {
                                    wrongStatus.push({
                                        ingredient: ing.name,
                                        expected: expectedStatus,
                                        got: actualStatus,
                                        tag: ing.tag_mac
                                    });
                                }
                            }
                            
                            results.push({
                                ingredient: ing.name,
                                required_chain: expectedStatus,
                                got: actualStatus,
                                pass: pass,
                                tag_mac: ing.tag_mac
                            });
                            
                            logMessage('match', `${ing.name}: expected "${expectedStatus}", got "${actualStatus}" → ${pass ? '✅' : '❌'}`);
                        });
                        
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
                        
                        const requiredTagMacs = recipe.map(r => r.tag_mac).filter(mac => mac !== null);
                        const missingRequiredTags = requiredTagMacs.filter(mac => !tag_macs.includes(mac));
                        if (missingRequiredTags.length > 0) {
                            allPass = false;
                            logMessage('error', `❌ Missing required tags: ${missingRequiredTags.join(', ')}`);
                        }
                        
                        logMessage('info', `📊 Validation summary: ${allPass ? 'ALL PASS ✅' : 'FAILED ❌'}`);
                        
                        // Use transaction for updating order and tags
                        global.db.run("BEGIN TRANSACTION", (err) => {
                            if (err) {
                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                logMessage('error', 'Error starting transaction:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            
                            const newStatus = allPass ? 'completed' : 'failed';
                            const statusMessage = allPass ? 'COMPLETED' : 'FAILED';
                            
                            global.db.run(
                                `UPDATE Orders SET order_status = ? WHERE orders_id = ?`,
                                [newStatus, pendingOrder.orders_id],
                                function(err) {
                                    if (err) {
                                        logMessage('error', 'Error updating order:', err);
                                        global.db.run("ROLLBACK");
                                        if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                        return res.status(500).json({ error: 'Database error' });
                                    }
                                    
                                    // Reset all tag statuses to Default
                                    global.db.run(
                                        `UPDATE RFIDTags SET current_status = 'Default'`,
                                        function(err) {
                                            if (err) {
                                                logMessage('error', 'Error clearing tag statuses:', err);
                                                global.db.run("ROLLBACK");
                                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                return res.status(500).json({ error: 'Database error' });
                                            }
                                            
                                            // Commit transaction
                                            global.db.run("COMMIT", (err) => {
                                                if (err) {
                                                    logMessage('error', 'Error committing transaction:', err);
                                                    global.db.run("ROLLBACK");
                                                    if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                    return res.status(500).json({ error: 'Database error' });
                                                }
                                                
                                                // Release lock
                                                if (lockKey && global.orderLocks) delete global.orderLocks[lockKey];
                                                
                                                const responseData = {
                                                    success: allPass,
                                                    result: allPass ? 'PASS' : 'FAIL',
                                                    order_number: formattedOrder,
                                                    food: pendingOrder.food_name,
                                                    score_earned: allPass ? 100 : 0,
                                                    message: allPass ? '✅ Order completed successfully!' : '❌ Order validation failed. Check ingredient preparation chains.',
                                                    details: results
                                                };
                                                
                                                // Broadcast via SSE
                                                console.log(`📤 Broadcasting SSE: esp-order-complete for ${formattedOrder} (${statusMessage})`);
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
                                                
                                                logMessage('success', `✅ Order ${formattedOrder} ${statusMessage}`);
                                                res.json(responseData);
                                            });
                                        }
                                    );
                                }
                            );
                        });
                    });
                }
            );
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
console.log(`📡 SSE endpoint available at /api/events`);
console.log(`📤 SSE broadcasting to ${sseClients.length} clients`);

module.exports = router;