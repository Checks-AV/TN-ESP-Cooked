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
    ingredients_name TEXT NOT NULL UNIQUE -- Ingredients must not be the same. Eg: Rice, Beef, Chicken, Fish, etc
);

-- Food here
-- Menu Item
CREATE TABLE IF NOT EXISTS food (
    food_id INTEGER PRIMARY KEY AUTOINCREMENT, 
    food_name TEXT NOT NULL UNIQUE -- Food Menu items here //Chicken Burger, Cooked Rice, Sashimi... etc
);

-- FOR MULTIPLE FOOD STATUS FOR ONE INGREDIENT
-- TO REMOVE 
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
-- 1 -- Chicken Burger (1) -- Bread  -- 1
-- 2 -- Chicken Burger (1) -- Chicken -- 1
-- 3 -- Chicken Burger (1) -- Cheese  -- 1
-- 4 -- Chicken Burger (1) -- Lettuce -- 1
-- 5 -- Sashimi (2) -- Fish -- 2
CREATE TABLE IF NOT EXISTS food_ingredients (
    food_ingredients_id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_id INTEGER NOT NULL,
    ingredients_id INTEGER NOT NULL,
    required_amount INTEGER NOT NULL, 
    FOREIGN KEY (food_id) REFERENCES food(food_id) ON DELETE CASCADE,
    FOREIGN KEY (ingredients_id) REFERENCES ingredients(ingredients_id)
    -- ingredientstatus_id INTEGER, -- TO REMOVE
    -- FOREIGN KEY (ingredientstatus_id) REFERENCES ingredientstatus(ingredientstatus_id), -- TO REMOVE
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
-- CREATE TABLE IF NOT EXISTS crockery (
--     crockery_id INTEGER,
--     crockery_name TEXT NOT NULL UNIQUE
-- );


-- DO NOT TOUCH BELOW UNTIL TOP IS DONE 
CREATE TABLE IF NOT EXISTS ESP32Devices(
    device_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_mac TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    last_seen TEXT
);


-- Mac Address // Status for STATIONS
CREATE TABLE IF NOT EXISTS ESP32Tagger (
    tagger_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL UNIQUE,
    station_id INTEGER,
    FOREIGN KEY (device_id) REFERENCES ESP32Devices(device_id),
    FOREIGN KEY (station_id) REFERENCES station(station_id) 
);

-- Mac Address // Status for INGREDIENTS
CREATE TABLE IF NOT EXISTS RFIDTags (
    tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_rfid TEXT NOT NULL UNIQUE,
    ingredients_id INTEGER NOT NULL,
    current_status TEXT DEFAULT '1',
    FOREIGN KEY (ingredients_id) REFERENCES ingredients(ingredients_id) ON DELETE RESTRICT
);

-- Orders table — one row per spawned ticket, created automatically by the
-- game frontend (POST /api/orders) the moment a ticket appears on screen.
CREATE TABLE IF NOT EXISTS Orders (
    orders_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    food_id         INTEGER NOT NULL,
    order_number    TEXT NOT NULL UNIQUE,
    order_status    TEXT DEFAULT 'pending',
    order_time_started TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (food_id) REFERENCES food(food_id)
);

-- Append-only action log: ESP32 sends mac + action, server just writes it
CREATE TABLE IF NOT EXISTS OrderActions (
    action_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    orders_id       INTEGER NOT NULL,
    tag_mac         TEXT NOT NULL,
    action_name     TEXT NOT NULL,
    action_time     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (orders_id) REFERENCES Orders(orders_id)
);


-- Insert default data (if necessary here)
-- To add additional food items via the recipe.ejs file.
-- Want to add additional stations in a separate page? --> Can do for part 1 as part of the front end scoping

/* Input your Stations with Mac Address here */
INSERT INTO station('station_name') VALUES ('General'); --1
INSERT INTO station('station_name') VALUES ('Counter'); --2
INSERT INTO station('station_name') VALUES ('Reset'); --3

/* Insert your food here */
-- INSERT INTO food (food_name) VALUES ('Salad');


/* Insert your ingredients here - UPDATED */
INSERT INTO ingredients('ingredients_name') VALUES ('Rice');      --1
INSERT INTO ingredients('ingredients_name') VALUES ('Mushroom');  --2
INSERT INTO ingredients('ingredients_name') VALUES ('Cheese');    --3 
INSERT INTO ingredients('ingredients_name') VALUES ('Lettuce');   --4 
INSERT INTO ingredients('ingredients_name') VALUES ('Fish');      --5
INSERT INTO ingredients('ingredients_name') VALUES ('Beef');      --6
INSERT INTO ingredients('ingredients_name') VALUES ('Potato');    --7
INSERT INTO ingredients('ingredients_name') VALUES ('Chicken');   --8
INSERT INTO ingredients('ingredients_name') VALUES ('Egg');       --9

/* Insert your station actions here - UPDATED */
INSERT INTO preparation_method('preparation_method_name') VALUES ('Chop');  --1
INSERT INTO preparation_method('preparation_method_name') VALUES ('Boil');  --2
INSERT INTO preparation_method('preparation_method_name') VALUES ('Cook');  --3
INSERT INTO preparation_method('preparation_method_name') VALUES ('Fry');   --4
INSERT INTO preparation_method('preparation_method_name') VALUES ('Stew');  --5
INSERT INTO preparation_method('preparation_method_name') VALUES ('Dice');  --6
INSERT INTO preparation_method('preparation_method_name') VALUES ('Bake');  --7

/* Station permissions — which station is allowed to perform which
   preparation method. Without rows here, handleAction() in
   esp32comms.js will reject every action with a 403, since it always
   checks this table before updating a tag's status.

   Counter (station_id 2) intentionally gets NO rows here — it only
   ever submits finished orders via /api/esp/submit, never performs
   prep actions on tags (enforced explicitly in handleAction too). */
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 1); -- General -> Chop
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 2); -- General -> Boil
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 3); -- General -> Cook
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 4); -- General -> Fry
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 5); -- General -> Stew
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 6); -- General -> Dice
INSERT INTO station_preparation_method (station_id, preparation_method_id) VALUES (1, 7); -- General -> Bake

/* Dummy Tag Data here */
-- Insert the ESP32 device for Reset station
INSERT INTO ESP32Devices (device_mac, ip_address, last_seen) 
VALUES ('AA:BB:CC:DD:EE:03', '192.168.10.117', datetime('now'));

-- Insert the ESP32 device for Counter station
INSERT INTO ESP32Devices (device_mac, ip_address, last_seen) 
VALUES ('AA:BB:CC:DD:EE:02', '192.168.10.118', datetime('now'));

-- Now assign them to their respective stations
-- First, get the device_ids and station_ids
-- Assign AA:BB:CC:DD:EE:03 to Reset station (station_id = 3)
INSERT INTO ESP32Tagger (device_id, station_id)
SELECT 
    (SELECT device_id FROM ESP32Devices WHERE device_mac = 'AA:BB:CC:DD:EE:03'),
    (SELECT station_id FROM station WHERE station_name = 'Reset');

-- Assign AA:BB:CC:DD:EE:02 to Counter station (station_id = 2)
INSERT INTO ESP32Tagger (device_id, station_id)
SELECT 
    (SELECT device_id FROM ESP32Devices WHERE device_mac = 'AA:BB:CC:DD:EE:02'),
    (SELECT station_id FROM station WHERE station_name = 'Counter');


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