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
// This avoids creating a new connection

// ============================================
// TEST ENDPOINT
// ============================================

router.get('/api/test', (req, res) => {
    console.log('✅ /api/test endpoint called');
    res.json({ 
        status: 'ok', 
        message: 'Ticket rail API is working!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// RECIPE API ENDPOINTS - FIXED
// ============================================

// Get all recipes from database
router.get('/api/recipes', (req, res) => {
    console.log('📡 /api/recipes endpoint called');
    
    // Check if global.db exists
    if (!global.db) {
        console.error('❌ global.db is not available');
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    // First, check if the food table exists
    global.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='food'", (err, tableExists) => {
        if (err) {
            console.error('Error checking table:', err);
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        
        if (!tableExists) {
            console.error('❌ "food" table does not exist in database');
            return res.status(404).json({ 
                error: 'No recipes found',
                message: 'The "food" table does not exist in the database.'
            });
        }
        
        // Get all food items with their ingredients
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
                console.error('Database query error:', err);
                return res.status(500).json({ 
                    error: 'Database query error', 
                    details: err.message 
                });
            }
            
            console.log(`✅ Found ${rows.length} recipes in database`);
            
            if (rows.length === 0) {
                return res.status(404).json({ 
                    error: 'No recipes found',
                    message: 'The database has no food items. Please add some recipes first.'
                });
            }
            
            // Transform to game format
            const recipes = rows.map(row => {
                const ingredients = row.ingredients_list ? row.ingredients_list.split(', ') : [];
                // Get preparation methods for each ingredient
                return {
                    id: row.id,
                    name: row.name,
                    prepTimeSeconds: 30,
                    ingredients: ingredients.length > 0 ? ingredients : ['No ingredients listed'],
                    prepMethods: []
                };
            });
            
            res.json(recipes);
        });
    });
});

// Get single recipe by ID
router.get('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    console.log(`📡 /api/recipes/${id} endpoint called`);
    
    if (!global.db) {
        return res.status(500).json({ error: 'Database not available' });
    }
    
    global.db.get('SELECT food_id as id, food_name as name FROM food WHERE food_id = ?', [id], (err, food) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
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
                console.error('Error getting ingredients:', err);
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
            
            res.json(recipe);
        });
    });
});

// ============================================
// ESP STATUS ENDPOINT
// ============================================

router.get('/api/esp/status', (req, res) => {
    console.log('📡 /api/esp/status endpoint called');
    
    if (!global.db) {
        return res.json({ online: false, error: 'Database not available' });
    }
    
    // Check if any ESP32 devices are registered and recently seen
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    global.db.get(
        `SELECT device_mac FROM ESP32Devices 
         WHERE device_type = 'counter' AND last_seen > ?
         LIMIT 1`,
        [fiveMinutesAgo],
        (err, row) => {
            if (err) {
                console.error('Error checking ESP status:', err);
                return res.json({ online: false });
            }
            res.json({ online: !!row });
        }
    );
});

// ============================================
// COUNTER ESP SUBMIT ENDPOINT
// ============================================

router.post('/api/esp/submit', (req, res) => {
    console.log('📡 /api/esp/submit endpoint called (COUNTER ESP)');
    const { order_number, device_mac } = req.body;
    
    if (!order_number) {
        return res.status(400).json({ 
            error: 'Missing order_number',
            message: 'order_number is required'
        });
    }
    
    console.log(`📝 Processing submission: Order ${order_number} from device ${device_mac || 'GAME_CLIENT'}`);
    
    if (!global.db) {
        return res.status(500).json({ 
            error: 'Database not available',
            message: 'The database connection is not initialized.'
        });
    }
    
    // STEP 1: Find the pending order
    global.db.get(
        `SELECT o.orders_id, o.food_id, f.food_name
         FROM Orders o
         JOIN food f ON o.food_id = f.food_id
         WHERE o.order_number = ? AND o.order_status = 'pending'`,
        [order_number],
        (err, order) => {
            if (err) {
                console.error('Error finding order:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!order) {
                console.log(`⚠️ Order ${order_number} not found or not pending`);
                return res.status(404).json({ 
                    error: 'Order not found',
                    message: 'Order number not found or already submitted'
                });
            }
            
            console.log(`📋 Found order: ${order_number} (${order.food_name})`);
            
            // STEP 2: Get all required ingredients with their preparation methods
            // AND get the current_status from ESP32Tags
            const recipeSql = `
                SELECT 
                    i.ingredients_id,
                    i.ingredients_name,
                    pm.preparation_method_name AS required_action,
                    ed.device_mac AS tag_mac,
                    et.tag_id,
                    et.current_status
                FROM food_ingredients fi
                JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                JOIN food_ingredient_preparation fip ON fi.food_ingredients_id = fip.food_ingredients_id
                JOIN preparation_method pm ON fip.preparation_method_id = pm.preparation_method_id
                LEFT JOIN ESP32Tags et ON et.ingredients_id = i.ingredients_id
                LEFT JOIN ESP32Devices ed ON ed.device_id = et.device_id
                WHERE fi.food_id = ?
                ORDER BY fip.prep_step_order ASC
            `;
            
            global.db.all(recipeSql, [order.food_id], (err, recipe) => {
                if (err) {
                    console.error('Error getting recipe:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (recipe.length === 0) {
                    return res.status(400).json({ 
                        error: 'Invalid recipe',
                        message: 'This food has no ingredients defined'
                    });
                }
                
                console.log(`📋 Recipe requires ${recipe.length} ingredients`);
                
                // STEP 3: Check each ingredient's current_status against required action
                const results = [];
                let allPass = true;
                
                // Check if any ingredients have tags assigned
                const hasAnyTag = recipe.some(ing => ing.tag_mac !== null);
                if (!hasAnyTag) {
                    console.log(`❌ No tags assigned to any ingredients`);
                    return res.status(400).json({
                        error: 'No tags assigned',
                        message: 'None of the ingredients have tags assigned. Please assign tags first.'
                    });
                }
                
                // Build the expected status chain for each ingredient
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
                
                // Now check each ingredient
                Object.values(expectedStatusMap).forEach((ing) => {
                    // Build the expected full status chain
                    let expectedStatus = 'Default';
                    ing.required_actions.forEach(action => {
                        expectedStatus += ' → ' + action;
                    });
                    
                    const actualStatus = ing.current_status || 'Default';
                    
                    // Check if the actual status matches the expected status exactly
                    const pass = actualStatus === expectedStatus;
                    
                    if (!pass) allPass = false;
                    
                    results.push({
                        ingredient: ing.name,
                        required_chain: expectedStatus,
                        got: actualStatus,
                        pass: pass
                    });
                    
                    console.log(`  ${ing.name}: expected "${expectedStatus}", got "${actualStatus}" → ${pass ? '✅' : '❌'}`);
                });
                
                // STEP 4: Finalise the order
                if (allPass) {
                    // ✅ ALL PASS - Complete the order
                    global.db.run(
                        `UPDATE Orders SET order_status = 'completed' WHERE orders_id = ?`,
                        [order.orders_id],
                        (err) => {
                            if (err) {
                                console.error('Error updating order:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            
                            // STEP 5: Clear ALL tag current_status to 'Default'
                            global.db.run(
                                `UPDATE ESP32Tags SET current_status = 'Default'`,
                                (err) => {
                                    if (err) {
                                        console.error('Error clearing tag statuses:', err);
                                        return res.status(500).json({ error: 'Database error' });
                                    }
                                    
                                    console.log(`✅ Order ${order_number} COMPLETED - All tags reset to Default`);
                                    
                                    res.json({
                                        success: true,
                                        result: 'PASS',
                                        order_number: order_number,
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
                    global.db.run(
                        `UPDATE Orders SET order_status = 'failed' WHERE orders_id = ?`,
                        [order.orders_id],
                        (err) => {
                            if (err) {
                                console.error('Error updating order:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            
                            console.log(`❌ Order ${order_number} FAILED`);
                            
                            res.json({
                                success: false,
                                result: 'FAIL',
                                order_number: order_number,
                                food: order.food_name,
                                message: '❌ Order validation failed. Check ingredient preparation chains.',
                                details: results
                            });
                        }
                    );
                }
            });
        }
    );
});

// ============================================
// VIEW ROUTES
// ============================================

router.get('/game', (req, res) => {
    console.log('🎮 Rendering game page');
    res.render('game', {
        title: 'Ticket Rail - Game'
    });
});

router.get('/game/settings', (req, res) => {
    console.log('⚙️ Rendering game settings page');
    res.render('gamesettings', {
        title: 'Ticket Rail - Controls'
    });
});

console.log('✅ Ticketrail routes loaded successfully');

module.exports = router;
// Add this to your ESP action endpoint
router.post('/api/esp/action', (req, res) => {
    console.log('📡 /api/esp/action endpoint called');
    const { tag_mac, action_name, order_number } = req.body;
    
    // ... existing code ...
    
    // After recording, broadcast to dashboard
    try {
        const channel = new BroadcastChannel('ticket-rail-control');
        channel.postMessage({
            type: 'esp-action',
            payload: {
                tag_mac: tag_mac,
                action_name: action_name,
                tagger_mac: req.body.tagger_mac || 'unknown',
                order_number: order_number || null
            }
        });
    } catch(e) {}
});

// Add this to your submit endpoint
router.post('/api/esp/submit', (req, res) => {
    // ... existing code ...
    
    // During validation, broadcast match checks
    Object.values(expectedStatusMap).forEach((ing) => {
        const pass = ing.current_status === expectedStatus;
        try {
            const channel = new BroadcastChannel('ticket-rail-control');
            channel.postMessage({
                type: 'esp-match-check',
                payload: {
                    ingredient: ing.name,
                    expected: expectedStatus,
                    got: ing.current_status || 'Default',
                    pass: pass
                }
            });
        } catch(e) {}
    });
    
    // After completion
    if (allPass) {
        try {
            const channel = new BroadcastChannel('ticket-rail-control');
            channel.postMessage({
                type: 'esp-submit-result',
                payload: {
                    success: true,
                    order_number: order_number,
                    food: order.food_name,
                    score_earned: 100 // or calculate
                }
            });
        } catch(e) {}
    }
});