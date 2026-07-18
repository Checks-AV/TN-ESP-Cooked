const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'database.db');
const schemaPath = path.join(projectRoot, 'db_schema.sql');
const recipesPath = path.join(projectRoot, 'recipe.sqlite3-query');

if (!fs.existsSync(schemaPath)) {
    console.error('❌ Schema file not found:', schemaPath);
    process.exit(1);
}

console.log('📖 Building database...');

// Delete existing database
if (fs.existsSync(dbPath)) {
    console.log('🗑️ Removing existing database...');
    fs.unlinkSync(dbPath);
}

// Combine schema and recipes
let sql = fs.readFileSync(schemaPath, 'utf8');
if (fs.existsSync(recipesPath)) {
    console.log('📖 Found recipes file, including it...');
    const recipes = fs.readFileSync(recipesPath, 'utf8');
    sql += '\n' + recipes; // Append recipes to schema
} else {
    console.warn('⚠️ Recipe file not found, skipping...');
}

const db = new sqlite3.Database(dbPath);

db.exec(sql, (err) => {
    if (err) {
        console.error('❌ Build Error:', err.message);
        db.close();
        process.exit(1);
    } else {
        console.log('✅ Database built successfully!');
        
        // Show summary
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
            if (!err && tables.length > 0) {
                console.log('📊 Tables:', tables.map(t => t.name).join(', '));
            }
            
            db.all("SELECT food_name FROM food ORDER BY food_id", (err, foods) => {
                if (!err && foods && foods.length > 0) {
                    console.log('🍽️ Food items:', foods.map(f => f.food_name).join(', '));
                } else if (!err) {
                    console.log('⚠️ No food items found');
                }
                db.close();
                console.log('✅ Rebuild complete!');
            });
        });
    }
});