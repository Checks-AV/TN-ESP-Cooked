// routes/ticketrail.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('📦 Loading ticketrail routes...');

// ============================================
// DATABASE CONNECTION
// ============================================

const dbPath = path.join(__dirname, '..', 'database.db');
console.log(`📁 Using database: ${dbPath}`);

// Check if database exists
if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found at:', dbPath);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Database connected successfully');
    }
});

// ============================================
// TEST ENDPOINT
// ============================================

router.get('/api/test', (req, res) => {
    console.log('✅ /api/test endpoint called');
    res.json({ 
        status: 'ok', 
        message: 'Ticket rail API is working!',
        database: dbPath,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// RECIPE API ENDPOINTS
// ============================================

// Get all recipes from database
router.get('/api/recipes', (req, res) => {
    console.log('📡 /api/recipes endpoint called');
    
    // First, check if the food table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='food'", (err, tableExists) => {
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
        
        // Simplified query - just get food items without complex joins to avoid errors
        const query = `
            SELECT 
                f.food_id as id,
                f.food_name as name
            FROM food f
            ORDER BY f.food_name
        `;
        
        db.all(query, (err, rows) => {
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
            
            // For each food item, get its ingredients
            const recipes = [];
            let completed = 0;
            
            if (rows.length === 0) {
                return res.json([]);
            }
            
            rows.forEach((row, index) => {
                const ingredientQuery = `
                    SELECT 
                        i.ingredients_name
                    FROM food_ingredients fi
                    JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
                    WHERE fi.food_id = ?
                `;
                
                db.all(ingredientQuery, [row.id], (err, ingredientRows) => {
                    if (err) {
                        console.error('Error getting ingredients:', err);
                    }
                    
                    const ingredients = ingredientRows ? ingredientRows.map(r => r.ingredients_name) : [];
                    
                    recipes.push({
                        id: row.id,
                        name: row.name,
                        prepTimeSeconds: 30,
                        ingredients: ingredients
                    });
                    
                    completed++;
                    
                    // When all recipes are processed, send response
                    if (completed === rows.length) {
                        res.json(recipes);
                    }
                });
            });
        });
    });
});

// Get single recipe by ID
router.get('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    console.log(`📡 /api/recipes/${id} endpoint called`);
    
    // Get food details
    db.get('SELECT food_id as id, food_name as name FROM food WHERE food_id = ?', [id], (err, food) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!food) {
            return res.status(404).json({ error: 'Recipe not found' });
        }
        
        // Get ingredients
        const ingredientQuery = `
            SELECT 
                i.ingredients_id,
                i.ingredients_name,
                fi.required_amount
            FROM food_ingredients fi
            JOIN ingredients i ON fi.ingredients_id = i.ingredients_id
            WHERE fi.food_id = ?
        `;
        
        db.all(ingredientQuery, [id], (err, ingredientRows) => {
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
// INGREDIENTS API
// ============================================

router.get('/api/ingredients', (req, res) => {
    console.log('📡 /api/ingredients endpoint called');
    
    db.all('SELECT * FROM ingredients ORDER BY ingredients_name', (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// ============================================
// STATIONS API
// ============================================

router.get('/api/stations', (req, res) => {
    console.log('📡 /api/stations endpoint called');
    
    db.all('SELECT * FROM station ORDER BY station_name', (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// ============================================
// PREPARATION METHODS API
// ============================================

router.get('/api/preparation-methods', (req, res) => {
    console.log('📡 /api/preparation-methods endpoint called');
    
    db.all('SELECT * FROM preparation_method ORDER BY preparation_method_name', (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// ============================================
// ESP32 API ENDPOINTS (Added back)
// ============================================

// Register ESP32 device
router.post('/api/esp/register', (req, res) => {
    console.log('📡 /api/esp/register endpoint called');
    const { device_mac, device_type, ip_address } = req.body;
    
    if (!device_mac) {
        return res.status(400).json({ error: 'Device MAC required' });
    }
    
    const query = `
        INSERT OR REPLACE INTO ESP32Devices (device_mac, device_type, ip_address, last_seen)
        VALUES (?, ?, ?, datetime('now'))
    `;
    
    db.run(query, [device_mac, device_type || 'tagger', ip_address || null], function(err) {
        if (err) {
            console.error('Error registering ESP:', err);
            return res.status(500).json({ error: 'Failed to register device' });
        }
        
        res.json({ 
            success: true, 
            message: 'ESP registered successfully',
            device_mac: device_mac,
            device_id: this.lastID
        });
    });
});

// ESP32 sends action
router.post('/api/esp/action', (req, res) => {
    console.log('📡 /api/esp/action endpoint called');
    const { tag_mac, action_name, order_number } = req.body;
    
    if (!tag_mac || !action_name) {
        return res.status(400).json({ error: 'Tag MAC and action name required' });
    }
    
    // Find the tag in the database
    const findTagQuery = `
        SELECT 
            et.tag_id,
            et.ingredients_id,
            et.device_id,
            i.ingredients_name
        FROM ESP32Tags et
        JOIN ingredients i ON et.ingredients_id = i.ingredients_id
        WHERE et.device_id = (
            SELECT device_id FROM ESP32Devices WHERE device_mac = ?
        )
    `;
    
    db.get(findTagQuery, [tag_mac], (err, tag) => {
        if (err) {
            console.error('Error finding tag:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!tag) {
            console.log(`⚠️ Tag ${tag_mac} not found in database`);
            return res.status(404).json({ error: 'Tag not found' });
        }
        
        // Record the action
        const query = `
            INSERT INTO OrderActions (orders_id, tag_mac, action_name, action_time)
            VALUES (?, ?, ?, datetime('now'))
        `;
        
        let ordersId = null;
        if (order_number) {
            db.get('SELECT orders_id FROM Orders WHERE order_number = ?', [order_number], (err, order) => {
                if (!err && order) {
                    ordersId = order.orders_id;
                }
                executeAction(ordersId, tag.tag_id, tag_mac, action_name, res);
            });
        } else {
            executeAction(null, tag.tag_id, tag_mac, action_name, res);
        }
    });
});

function executeAction(ordersId, tagId, tagMac, actionName, res) {
    const query = `
        INSERT INTO OrderActions (orders_id, tag_mac, action_name, action_time)
        VALUES (?, ?, ?, datetime('now'))
    `;
    
    db.run(query, [ordersId, tagMac, actionName], function(err) {
        if (err) {
            console.error('Error recording action:', err);
            return res.status(500).json({ error: 'Failed to record action' });
        }
        
        db.run(`UPDATE ESP32Tags SET current_status = ? WHERE tag_id = ?`, [actionName, tagId]);
        
        res.json({
            success: true,
            action_id: this.lastID,
            message: 'Action recorded',
            orders_id: ordersId,
            tag_mac: tagMac,
            action_name: actionName
        });
    });
}

// ============================================
// VIEW ROUTES
// ============================================

router.get('/game', (req, res) => {
    console.log('🎮 Rendering game page');
    res.render('game', {
        title: 'Ticket Rail - Game'
    });
});

router.get('/gamesettings', (req, res) => {
    console.log('⚙️ Rendering game settings page');
    res.render('gamesettings', {
        title: 'Ticket Rail - Controls'
    });
});

console.log('✅ Ticketrail routes loaded successfully');

module.exports = router;