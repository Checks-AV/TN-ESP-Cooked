// routes/leaderboards.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

console.log('📦 Loading leaderboard routes...');

// ============================================
// LEADERBOARD JSON FILE STORAGE
// ============================================

const LEADERBOARD_FILE = path.join(__dirname, '../leaderboard.json');

// Load leaderboard from JSON file
function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Error loading leaderboard file:', error);
    }
    return [];
}

// Save leaderboard to JSON file
function saveLeaderboard(data) {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error saving leaderboard file:', error);
        return false;
    }
}

// Initialize leaderboard file if it doesn't exist
if (!fs.existsSync(LEADERBOARD_FILE)) {
    saveLeaderboard([]);
    console.log('✅ Leaderboard file created at:', LEADERBOARD_FILE);
}

// ============================================
// SSE BROADCAST HELPERS
// ============================================

let broadcastUpdateFn = null;
let broadcastDeleteFn = null;
let broadcastClearFn = null;

function broadcastLeaderboardUpdate(entry) {
    if (broadcastUpdateFn) broadcastUpdateFn(entry);
}

function broadcastLeaderboardDeletion(id) {
    if (broadcastDeleteFn) broadcastDeleteFn(id);
}

function broadcastLeaderboardClear() {
    if (broadcastClearFn) broadcastClearFn();
}

// Allow ticketrail.js to register broadcast functions
router.setBroadcastFunctions = function(updateFn, deleteFn, clearFn) {
    broadcastUpdateFn = updateFn;
    broadcastDeleteFn = deleteFn;
    broadcastClearFn = clearFn;
    console.log('✅ Leaderboard broadcast functions registered');
};

// ============================================
// POST /api/leaderboard - Save a score
// ============================================
router.post('/api/leaderboard', (req, res) => {
    try {
        const { name, score, served, missed, failed, timestamp } = req.body;
        
        console.log('📥 Leaderboard save request:', { name, score, served, missed, failed });
        
        // Validate inputs
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name is required' 
            });
        }
        
        if (score === undefined || score === null || isNaN(score)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid score is required' 
            });
        }
        
        if (name.length > 20) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name must be 20 characters or less' 
            });
        }
        
        // Load existing data
        let leaderboardData = loadLeaderboard();
        
        // Create new entry with unique ID
        const entry = {
            id: Date.now() + Math.floor(Math.random() * 1000), // Unique ID
            name: name.trim().substring(0, 20),
            score: parseInt(score) || 0,
            served: parseInt(served) || 0,
            missed: parseInt(missed) || 0,
            failed: parseInt(failed) || 0,
            timestamp: timestamp || new Date().toISOString()
        };
        
        // Add to leaderboard
        leaderboardData.push(entry);
        
        // Sort by score descending, keep top 100
        leaderboardData.sort((a, b) => b.score - a.score);
        if (leaderboardData.length > 100) {
            leaderboardData = leaderboardData.slice(0, 100);
        }
        
        // Save to file
        if (!saveLeaderboard(leaderboardData)) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save leaderboard data' 
            });
        }
        
        const rank = leaderboardData.findIndex(e => e.id === entry.id) + 1;
        
        console.log(`🏆 Leaderboard saved: ${entry.name} - ${entry.score} points (Rank: ${rank})`);
        console.log(`📊 Total entries: ${leaderboardData.length}`);
        
        // Broadcast update
        broadcastLeaderboardUpdate(entry);
        
        res.json({
            success: true,
            entry: entry,
            rank: rank,
            total: leaderboardData.length
        });
        
    } catch (error) {
        console.error('❌ Error saving leaderboard:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error saving score: ' + error.message 
        });
    }
});

// ============================================
// GET /api/leaderboard - Get top scores
// ============================================
router.get('/api/leaderboard', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboardData = loadLeaderboard();
        const topScores = leaderboardData.slice(0, limit);
        
        console.log(`📊 Leaderboard request: returning ${topScores.length} entries`);
        
        res.json({
            success: true,
            count: topScores.length,
            total: leaderboardData.length,
            entries: topScores
        });
        
    } catch (error) {
        console.error('❌ Error fetching leaderboard:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching leaderboard' 
        });
    }
});

// ============================================
// DELETE /api/leaderboard/:id - Delete a single entry
// ============================================
router.delete('/api/leaderboard/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid ID is required' 
            });
        }
        
        let leaderboardData = loadLeaderboard();
        
        // Find the entry
        const entryIndex = leaderboardData.findIndex(e => e.id === id);
        
        if (entryIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Entry not found' 
            });
        }
        
        const deletedEntry = leaderboardData[entryIndex];
        
        // Remove the entry
        leaderboardData.splice(entryIndex, 1);
        
        // Save to file
        if (!saveLeaderboard(leaderboardData)) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save leaderboard data' 
            });
        }
        
        console.log(`🗑️ Leaderboard entry deleted: ${deletedEntry.name} - ${deletedEntry.score} points (ID: ${id})`);
        
        // Broadcast deletion
        broadcastLeaderboardDeletion(id);
        
        res.json({
            success: true,
            message: `Deleted entry for ${deletedEntry.name}`,
            deleted: deletedEntry
        });
        
    } catch (error) {
        console.error('❌ Error deleting leaderboard entry:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error deleting entry' 
        });
    }
});

// ============================================
// DELETE /api/leaderboard - Clear all entries
// ============================================
router.delete('/api/leaderboard', (req, res) => {
    try {
        const leaderboardData = loadLeaderboard();
        const count = leaderboardData.length;
        
        // Clear the array
        leaderboardData.length = 0;
        
        // Save to file
        if (!saveLeaderboard(leaderboardData)) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save leaderboard data' 
            });
        }
        
        console.log(`🗑️ Leaderboard cleared: ${count} entries removed`);
        
        // Broadcast clearing
        broadcastLeaderboardClear();
        
        res.json({
            success: true,
            message: `Cleared ${count} entries`,
            cleared: count
        });
        
    } catch (error) {
        console.error('❌ Error clearing leaderboard:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error clearing leaderboard' 
        });
    }
});

// ============================================
// GET /leaderboards - Render leaderboard page
// ============================================
router.get('/leaderboards', (req, res) => {
    try {
        const leaderboardData = loadLeaderboard();
        
        res.render('leaderboards', { 
            title: 'Leaderboard',
            entries: leaderboardData.slice(0, 50)
        });
        
    } catch (error) {
        console.error('❌ Error rendering leaderboard page:', error);
        res.status(500).send('Error loading leaderboard page');
    }
});

// ============================================
// OPTIONAL: GET /api/leaderboard/stats - Get stats
// ============================================
router.get('/api/leaderboard/stats', (req, res) => {
    try {
        const leaderboardData = loadLeaderboard();
        
        const stats = {
            total: leaderboardData.length,
            topScore: leaderboardData.length > 0 ? leaderboardData[0].score : 0,
            averageScore: leaderboardData.length > 0 
                ? Math.round(leaderboardData.reduce((sum, e) => sum + e.score, 0) / leaderboardData.length) 
                : 0,
            totalServed: leaderboardData.reduce((sum, e) => sum + e.served, 0),
            totalMissed: leaderboardData.reduce((sum, e) => sum + e.missed, 0),
            totalFailed: leaderboardData.reduce((sum, e) => sum + e.failed, 0)
        };
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('❌ Error fetching leaderboard stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching stats' 
        });
    }
});

// ============================================
// OPTIONAL: POST /api/leaderboard/backup - Create backup
// ============================================
router.post('/api/leaderboard/backup', (req, res) => {
    try {
        const leaderboardData = loadLeaderboard();
        const backupFile = LEADERBOARD_FILE.replace('.json', `_backup_${Date.now()}.json`);
        
        fs.writeFileSync(backupFile, JSON.stringify(leaderboardData, null, 2));
        
        console.log(`💾 Leaderboard backup created: ${backupFile}`);
        
        res.json({
            success: true,
            message: `Backup created: ${path.basename(backupFile)}`,
            file: backupFile
        });
        
    } catch (error) {
        console.error('❌ Error creating backup:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error creating backup' 
        });
    }
});

console.log('✅ Leaderboard routes loaded successfully');
console.log(`📁 Data stored in: ${LEADERBOARD_FILE}`);
console.log(`📊 Leaderboard endpoints:`);
console.log(`   POST   /api/leaderboard           - Save a score`);
console.log(`   GET    /api/leaderboard           - Get top scores`);
console.log(`   DELETE /api/leaderboard/:id       - Delete a single entry`);
console.log(`   DELETE /api/leaderboard           - Clear all entries`);
console.log(`   GET    /leaderboards              - View leaderboard page`);
console.log(`   GET    /api/leaderboard/stats     - Get statistics`);
console.log(`   POST   /api/leaderboard/backup    - Create backup`);

module.exports = router;