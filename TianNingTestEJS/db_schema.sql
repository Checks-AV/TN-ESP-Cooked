
-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Create your tables with SQL commands here (watch out for slight syntactical differences with SQLite vs MySQL)

/*CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_accounts (
    email_account_id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_address TEXT NOT NULL,
    user_id  INT, --the user that the email account belongs to
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);*/

-- Station Names here 
CREATE TABLE IF NOT EXISTS station (
    station_id INTEGER PRIMARY KEY AUTOINCREMENT, 
    station_name TEXT NOT NULL UNIQUE -- Name must not be the same. Should allow multiple of the same stations. 
);

-- Ingredients here
CREATE TABLE IF NOT EXISTS ingredients (
    ingredients_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredients_name TEXT NOT NULL UNIQUE -- Rice, Beef, Chicken, Fish, etc
);

-- Food here
CREATE TABLE IF NOT EXISTS food (
    food_id INTEGER PRIMARY KEY AUTOINCREMENT, 
    food_name TEXT NOT NULL UNIQUE -- Food Menu items here //Chicken Burger, Cooked Rice, Sashimi... etc
);

-- FOR MULTIPLE FOOD STATUS FOR ONE INGREDIENT
CREATE TABLE IF NOT EXISTS ingredientstatus(
    ingredientstatus_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredientstatus_name TEXT NOT NULL UNIQUE -- status of ingredients here // Cooked, Sliced, Baked, Default... etc
);

-- Adding Preparation Methods
CREATE TABLE IF NOT EXISTS preparation_method (
    preparation_method_id INTEGER PRIMARY KEY AUTOINCREMENT,
    preparation_method_name TEXT NOT NULL UNIQUE -- cooking station preparations // Chop / Slice / Bake / Cook / Boil / Wash...
);

-- All required ingredients will be put HERE for one food, as long as all ingredients are put in, then it is ok 
-- JOIN TABLE BETWEEN FOOD AND INGREDIENTS
-- Food (1,M) Food_Ingredients
-- Example 
-- 1 -- Chicken Burger (1) -- Bread -- Sliced  -- 1
-- 2 -- Chicken Burger (1) -- Chicken -- Fried -- 1
-- 3 -- Chicken Burger (1) -- Cheese -- Default -- 1
-- 4 -- Chicken Burger (1) -- Lettuce -- Sliced -- 1
-- 5 -- Sashimi (2) -- Fish -- Sliced -- 2
CREATE TABLE IF NOT EXISTS food_ingredients (
    food_ingredients_id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_id INTEGER NOT NULL,
    ingredients_id INTEGER NOT NULL,
    ingredientstatus_id INTEGER NOT NULL,
    required_amount INTEGER NOT NULL, 
    FOREIGN KEY (food_id) REFERENCES food(food_id),
    FOREIGN KEY (ingredientstatus_id) REFERENCES ingredientstatus(ingredientstatus_id),
    FOREIGN KEY (ingredients_id) REFERENCES ingredients(ingredients_id)
    -- UNIQUE(food_id, ingredients_id) -- To consider if this is needed
    -- ingredient_order INTEGER NOT NULL, // No longer needed
    -- UNIQUE(food_id, ingredient_order) // Constraint // NO LONGER NEEDED
);
-- 

-- Table to contain all different cooking methods // 
CREATE TABLE IF NOT EXISTS food_ingredient_preparation(
    food_ingredient_preparation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_ingredients_id INTEGER NOT NULL,
    preparation_method_id INTEGER NOT NULL,
    prep_step_order INTEGER NOT NULL,
    FOREIGN KEY (food_ingredients_id) REFERENCES food_ingredients(food_ingredients_id) ON DELETE CASCADE,
    FOREIGN KEY (preparation_method_id) REFERENCES preparation_method(preparation_method_id) ON DELETE RESTRICT,
    UNIQUE(food_ingredients_id, prep_step_order)
);

-- Table to contain stations and all their allowed methods -- TO REFINE
CREATE TABLE IF NOT EXISTS station_preparation_method(
    station_preparation_method_id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL, 
    preparation_method_id INTEGER NOT NULL,
    FOREIGN KEY (station_id) REFERENCES station(station_id),
    FOREIGN KEY (preparation_method_id) REFERENCES preparation_method(preparation_method_id),
    UNIQUE(station_id, preparation_method_id)
);

-- Crockery HERE // Pans, Pot // TO IMPLEMENT? FOR NOW NO
CREATE TABLE IF NOT EXISTS crockery (
    crockery_id INTEGER,
    crockery_name TEXT NOT NULL UNIQUE
);


-- DO NOT TOUCH BELOW UNTIL TOP IS DONE 
CREATE TABLE IF NOT EXISTS ESP32Devices(
    device_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_mac TEXT NOT NULL UNIQUE,
    device_type TEXT CHECK(device_type IN ('tagger', 'tag') OR device_type IS NULL),
    ip_address TEXT,
    last_seen TEXT
);


-- Mac Address // Status for STATIONS
CREATE TABLE IF NOT EXISTS ESP32Tagger (
    tagger_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL UNIQUE,
    station_id INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES ESP32Devices(device_id),
    FOREIGN KEY (station_id) REFERENCES station(station_id) 
);

-- Mac Address // Status for INGREDIENTS
CREATE TABLE IF NOT EXISTS ESP32Tags (
    tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredients_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL UNIQUE,
    current_status_id INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (device_id) REFERENCES ESP32Devices(device_id),
    FOREIGN KEY (ingredients_id) REFERENCES ingredients(ingredients_id),
    FOREIGN KEY (current_status_id) REFERENCES ingredientstatus(ingredientstatus_id)
);


-- ORDERS ARE PART 3 of the development cycle
/* Orders table for constant updating during the game here */
CREATE TABLE IF NOT EXISTS Orders (
    orders_id INTEGER, --Order Number
    food_id INTEGER, -- Type of Food
    order_status TEXT,
    order_time_started TEXT,
    FOREIGN KEY (food_id) REFERENCES food(food_id)
);


-- Insert default data (if necessary here)
-- To add additional food items via the recipe.ejs file.
-- Want to add additional stations in a separate page? --> Can do for part 1 as part of the front end scoping

/* Input your Stations with Mac Address here */
INSERT INTO station('station_name') VALUES ('Stove');
INSERT INTO station('station_name') VALUES ('Wok');
INSERT INTO station('station_name') VALUES ('Counter');
INSERT INTO station('station_name') VALUES ('Toaster');

/* Insert your food here */
INSERT INTO food('food_name') VALUES ('Chicken Sandwich');
INSERT INTO food('food_name') VALUES ('Fish Sushi');

/* Insert your ingredients here */
INSERT INTO ingredients('ingredients_name') VALUES ('Chicken'); --1
INSERT INTO ingredients('ingredients_name') VALUES ('Onions'); --2
INSERT INTO ingredients('ingredients_name') VALUES ('Lettuce'); --3 
INSERT INTO ingredients('ingredients_name') VALUES ('Beef'); --4 
INSERT INTO ingredients('ingredients_name') VALUES ('Bread'); --5 
INSERT INTO ingredients('ingredients_name') VALUES ('Rice'); --6 
INSERT INTO ingredients('ingredients_name') VALUES ('Cabbage'); --7 
INSERT INTO ingredients('ingredients_name') VALUES ('Fish'); --8

/* Insert your INGREDIENT statuses here! */
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Default'); --1 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Toasted'); --2 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Cooked'); --3 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Boiled'); --4 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Fried'); --5 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Sliced'); --6 
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Diced'); --7
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Chopped'); --8
INSERT INTO ingredientstatus('ingredientstatus_name') VALUES ('Burnt'); --9

/* Insert your station actions here! */
INSERT INTO preparation_method('preparation_method_name') VALUES ('Dice');
INSERT INTO preparation_method('preparation_method_name') VALUES ('Chop');
INSERT INTO preparation_method('preparation_method_name') VALUES ('Cook');
INSERT INTO preparation_method('preparation_method_name') VALUES ('Fry');

/* Dummy Tag Data here */
INSERT INTO ESP32Devices('device_mac', 'ip_address', 'last_seen') VALUES (' 1C:DB:D4:40:35:38', '192.168.10.116', '2026-05-06T10:25:12.663Z');


-- Do we want a login authentication here? 
/* -- Set up three users
INSERT INTO users ('user_name') VALUES ('Simon Star');
INSERT INTO users ('user_name') VALUES ('Dianne Dean');
INSERT INTO users ('user_name') VALUES ('Harry Hilbert');

-- Give Simon two email addresses and Diane one, but Harry has none
INSERT INTO email_accounts ('email_address', 'user_id') VALUES ('simon@gmail.com', 1); 
INSERT INTO email_accounts ('email_address', 'user_id') VALUES ('simon@hotmail.com', 1); 
INSERT INTO email_accounts ('email_address', 'user_id') VALUES ('dianne@yahoo.co.uk', 2);  */

COMMIT;

