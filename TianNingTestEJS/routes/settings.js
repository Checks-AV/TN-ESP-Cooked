// Avan Here, Settings Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("settings.ejs", {title: "Settings"});
});

// ─── LOAD ESP32 SETUP PAGE ──────────────────────────────────────
router.get("/esp32", (req, res, next) => {
    const sqlDevices = `
        SELECT ed.*, s.station_name 
        FROM ESP32Devices ed
        LEFT JOIN ESP32Tagger et ON ed.device_id = et.device_id
        LEFT JOIN station s ON et.station_id = s.station_id
        ORDER BY ed.last_seen DESC
    `;
    const sqlIngredients = `SELECT * FROM ingredients ORDER BY ingredients_name`;
    const sqlStations = `SELECT * FROM station ORDER BY station_name`;

    global.db.all(sqlDevices, [], (err, devices) => {
        if (err) return next(err);

        global.db.all(sqlIngredients, [], (err, ingredients) => {
            if (err) return next(err);

            global.db.all(sqlStations, [], (err, stations) => {
                if (err) return next(err);

                // Get tag assignments with ingredient names
                const sqlAssignments = `
                    SELECT rt.tag_id, rt.tag_rfid, rt.ingredients_id, rt.current_status,
                           i.ingredients_name
                    FROM RFIDTags rt
                    JOIN ingredients i ON rt.ingredients_id = i.ingredients_id
                    ORDER BY rt.tag_id DESC
                `;

                global.db.all(sqlAssignments, [], (err, tagAssignments) => {
                    if (err) return next(err);

                    res.render("esp32setup.ejs", {
                        title: "ESP32 Setup",
                        devices,
                        ingredients,
                        stations,
                        tagAssignments: tagAssignments || []
                    });
                });
            });
        });
    });
});

// ─── REGISTER NEW ESP32 DEVICE ─────────────────────────────────
router.post("/esp32/register", (req, res, next) => {
    const { device_mac, ip_address, station_id } = req.body;
    
    if (!device_mac) {
        return res.status(400).send("MAC address is required");
    }
    
    const now = new Date().toISOString();
    
    // First insert or update the device
    global.db.run(
        `INSERT INTO ESP32Devices (device_mac, ip_address, last_seen)
         VALUES (?, ?, ?)
         ON CONFLICT(device_mac) 
         DO UPDATE SET ip_address = excluded.ip_address, last_seen = excluded.last_seen`,
        [device_mac, ip_address || null, now],
        function(err) {
            if (err) return next(err);
            
            // Get the device_id
            global.db.get(
                `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
                [device_mac],
                (err, device) => {
                    if (err) return next(err);
                    if (!device) return res.status(500).send("Device registration failed");
                    
                    // If station_id is provided, assign the device to that station
                    if (station_id) {
                        global.db.run(
                            `INSERT INTO ESP32Tagger (device_id, station_id)
                             VALUES (?, ?)
                             ON CONFLICT(device_id) 
                             DO UPDATE SET station_id = excluded.station_id`,
                            [device.device_id, station_id],
                            function(err) {
                                if (err) return next(err);
                                console.log(`[REGISTER] ${device_mac} registered with station ${station_id}`);
                                res.redirect("/settings/esp32");
                            }
                        );
                    } else {
                        // If no station_id, try to assign to "General" station
                        global.db.get(
                            `SELECT station_id FROM station WHERE station_name = 'General'`,
                            [],
                            (err, generalStation) => {
                                if (err) return next(err);
                                if (generalStation) {
                                    global.db.run(
                                        `INSERT INTO ESP32Tagger (device_id, station_id)
                                         VALUES (?, ?)
                                         ON CONFLICT(device_id) 
                                         DO UPDATE SET station_id = excluded.station_id`,
                                        [device.device_id, generalStation.station_id],
                                        function(err) {
                                            if (err) return next(err);
                                            console.log(`[REGISTER] ${device_mac} auto-assigned to General station`);
                                            res.redirect("/settings/esp32");
                                        }
                                    );
                                } else {
                                    console.log(`[REGISTER] ${device_mac} registered without station assignment`);
                                    res.redirect("/settings/esp32");
                                }
                            }
                        );
                    }
                }
            );
        }
    );
});

// ─── UPDATE ESP32 DEVICE ──────────────────────────────────────
router.post("/esp32/update", (req, res, next) => {
    const { device_id, device_mac, ip_address, station_id } = req.body;
    
    if (!device_id || !device_mac) {
        return res.status(400).send("Device ID and MAC address are required");
    }
    
    global.db.get(
        `SELECT * FROM ESP32Devices WHERE device_id = ?`,
        [device_id],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device not found");
            
            // Update device info
            global.db.run(
                `UPDATE ESP32Devices 
                 SET device_mac = ?, ip_address = ?
                 WHERE device_id = ?`,
                [device_mac, ip_address || null, device_id],
                function(err) {
                    if (err) return next(err);
                    
                    // Update or create station assignment
                    if (station_id) {
                        global.db.run(
                            `INSERT INTO ESP32Tagger (device_id, station_id)
                             VALUES (?, ?)
                             ON CONFLICT(device_id) 
                             DO UPDATE SET station_id = excluded.station_id`,
                            [device_id, station_id],
                            function(err) {
                                if (err) return next(err);
                                console.log(`[UPDATE] Device ${device_id} updated successfully`);
                                res.redirect("/settings/esp32");
                            }
                        );
                    } else {
                        console.log(`[UPDATE] Device ${device_id} updated without station assignment`);
                        res.redirect("/settings/esp32");
                    }
                }
            );
        }
    );
});

// ─── DELETE ESP32 DEVICE ──────────────────────────────────────
router.delete("/esp32/device/:device_id", (req, res, next) => {
    const { device_id } = req.params;
    
    if (!device_id) {
        return res.status(400).json({ success: false, error: "Missing device_id" });
    }
    
    // Start transaction
    global.db.serialize(() => {
        global.db.run("BEGIN TRANSACTION");
        
        // First delete from ESP32Tagger
        global.db.run(
            `DELETE FROM ESP32Tagger WHERE device_id = ?`,
            [device_id],
            function(err) {
                if (err) {
                    global.db.run("ROLLBACK");
                    return next(err);
                }
                
                // Then delete from ESP32Devices
                global.db.run(
                    `DELETE FROM ESP32Devices WHERE device_id = ?`,
                    [device_id],
                    function(err) {
                        if (err) {
                            global.db.run("ROLLBACK");
                            return next(err);
                        }
                        
                        if (this.changes === 0) {
                            global.db.run("ROLLBACK");
                            return res.status(404).json({ 
                                success: false, 
                                error: "Device not found" 
                            });
                        }
                        
                        global.db.run("COMMIT");
                        console.log(`[DELETE] Device ${device_id} removed successfully`);
                        res.json({ 
                            success: true, 
                            message: "Device removed successfully" 
                        });
                    }
                );
            }
        );
    });
});

// ─── RESET TAG STATUS ─────────────────────────────────────────
router.post("/esp32/reset-tag", (req, res, next) => {
    const { tag_rfid } = req.body;
    
    if (!tag_rfid) {
        return res.status(400).json({ 
            success: false, 
            error: "Missing tag_rfid" 
        });
    }
    
    global.db.get(
        `SELECT tag_id, current_status FROM RFIDTags WHERE tag_rfid = ?`,
        [tag_rfid],
        (err, tag) => {
            if (err) return next(err);
            if (!tag) {
                return res.status(404).json({ 
                    success: false, 
                    error: `Tag ${tag_rfid} not found` 
                });
            }
            
            global.db.run(
                `UPDATE RFIDTags SET current_status = 'Default' WHERE tag_id = ?`,
                [tag.tag_id],
                function(err) {
                    if (err) return next(err);
                    
                    console.log(`[RESET-TAG] Tag ${tag_rfid} reset: "${tag.current_status}" → "Default"`);
                    res.json({ 
                        success: true, 
                        message: "Tag reset to Default",
                        tag_rfid,
                        previous_status: tag.current_status,
                        new_status: 'Default'
                    });
                }
            );
        }
    );
});

// ─── ASSIGN TAG TO INGREDIENT ──────────────────────────────────
router.post("/esp32/assign-tag", (req, res, next) => {
    const { tag_rfid, ingredients_id } = req.body;

    if (!tag_rfid || !ingredients_id) {
        return res.status(400).send("Tag RFID and ingredient are required");
    }

    // Check if this tag already exists
    global.db.get(
        `SELECT tag_id FROM RFIDTags WHERE tag_rfid = ?`,
        [tag_rfid],
        (err, existing) => {
            if (err) return next(err);
            
            if (existing) {
                // Update existing tag assignment
                global.db.run(
                    `UPDATE RFIDTags 
                     SET ingredients_id = ?, current_status = 'Default'
                     WHERE tag_rfid = ?`,
                    [ingredients_id, tag_rfid],
                    function(err) {
                        if (err) return next(err);
                        console.log(`[ASSIGN-TAG] Updated: ${tag_rfid} → ingredient ${ingredients_id}`);
                        res.redirect("/settings/esp32");
                    }
                );
            } else {
                // Create new tag assignment
                global.db.run(
                    `INSERT INTO RFIDTags (tag_rfid, ingredients_id, current_status)
                     VALUES (?, ?, 'Default')`,
                    [tag_rfid, ingredients_id],
                    function(err) {
                        if (err) return next(err);
                        console.log(`[ASSIGN-TAG] Created: ${tag_rfid} → ingredient ${ingredients_id}`);
                        res.redirect("/settings/esp32");
                    }
                );
            }
        }
    );
});

// ─── UPDATE TAG ASSIGNMENT ─────────────────────────────────────
router.post("/esp32/update-tag-assignment", (req, res, next) => {
    const { tag_id, tag_rfid, ingredients_id } = req.body;
    
    if (!tag_id || !tag_rfid || !ingredients_id) {
        return res.status(400).send("Missing required fields");
    }
    
    // Update the assignment
    global.db.run(
        `UPDATE RFIDTags 
         SET tag_rfid = ?, ingredients_id = ?
         WHERE tag_id = ?`,
        [tag_rfid, ingredients_id, tag_id],
        function(err) {
            if (err) return next(err);
            console.log(`[UPDATE-TAG-ASSIGNMENT] Updated assignment ${tag_id}`);
            res.redirect("/settings/esp32");
        }
    );
});

// ─── DELETE TAG ASSIGNMENT ─────────────────────────────────────
router.post("/esp32/delete-tag-assignment", (req, res, next) => {
    const { tag_id } = req.body;
    
    if (!tag_id) {
        return res.status(400).json({ error: "Missing tag_id" });
    }
    
    global.db.run(
        `DELETE FROM RFIDTags WHERE tag_id = ?`,
        [tag_id],
        function(err) {
            if (err) return next(err);
            console.log(`[DELETE-TAG-ASSIGNMENT] Deleted assignment ${tag_id}`);
            res.json({ success: true, message: "Assignment deleted successfully" });
        }
    );
});

// ─── RECIPE MANAGEMENT ─────────────────────────────────────────

// Main Recipe page
router.get("/recipe", (req, res, next) => {
    const sql = `
        SELECT food_id, food_name
        FROM food
        ORDER BY food_id ASC
    `;

    global.db.all(sql, [], (err, foods) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.render('mainrecipe.ejs', {
            title: 'Recipe Management',
            foods: foods
        });
    });
});

// Main Add Recipe page
router.get("/recipe/addrecipe", (req, res, next) => {
    const sqlIngredients = `SELECT * FROM ingredients ORDER BY ingredients_name`;
    const sqlStatuses = `SELECT * FROM ingredientstatus ORDER BY ingredientstatus_name`;
    const sqlMethods = `SELECT * FROM preparation_method ORDER BY preparation_method_name`;
    
    global.db.all(sqlIngredients, [], (err, ingredients) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Unable to get Ingredients, or None initialised");
        }

        global.db.all(sqlStatuses, [], (err, statuses) => {
            if (err) return res.status(500).send("Unable to get Statuses, or None Initialised");

            global.db.all(sqlMethods, [], (err, methods) => {
                if (err) return res.status(500).send("No Methods Found!");

                res.render("addrecipe.ejs", {
                    title: "Recipe Management",
                    ingredients,
                    statuses,
                    methods
                });
            });
        });
    });    
});

// Create recipe when form is completed
router.post("/recipe/addrecipe", (req, res, next) => {
    const { food_name, ingredients } = req.body;
    console.log(req.body);
    
    if (!food_name || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).send("Invalid recipe data.");
    }

    global.db.serialize(() => {
        global.db.run("BEGIN TRANSACTION");

        global.db.run(
            `INSERT INTO food (food_name) VALUES (?)`,
            [food_name],
            function (err) {
                if (err) {
                    global.db.run("ROLLBACK");
                    return next(err);
                }

                const foodId = this.lastID;
                let ingredientIndex = 0;

                function insertNextIngredient() {
                    if (ingredientIndex >= ingredients.length) {
                        global.db.run("COMMIT", (err) => {
                            if (err) return next(err);
                            res.redirect("/settings/recipe");
                        });
                        return;
                    }

                    const ing = ingredients[ingredientIndex];

                    global.db.run(
                        `INSERT INTO food_ingredients 
                         (food_id, ingredients_id, required_amount)
                         VALUES (?, ?, ?)`,
                        [
                            foodId,
                            ing.ingredients_id,
                            ing.required_amount
                        ],
                        function (err) {
                            if (err) {
                                global.db.run("ROLLBACK");
                                return next(err);
                            }

                            const foodIngredientId = this.lastID;
                            const prepSteps = (Array.isArray(ing.preparation_steps)
                                ? ing.preparation_steps
                                : [ing.preparation_steps]
                                ).filter(step => step && step.trim() !== '');

                            let stepIndex = 0;

                            function insertNextStep() {
                                if (stepIndex >= prepSteps.length) {
                                    ingredientIndex++;
                                    insertNextIngredient();
                                    return;
                                }

                                global.db.run(
                                    `INSERT INTO food_ingredient_preparation
                                     (food_ingredients_id, preparation_method_id, prep_step_order)
                                     VALUES (?, ?, ?)`,
                                    [
                                        foodIngredientId,
                                        prepSteps[stepIndex],
                                        stepIndex + 1
                                    ],
                                    (err) => {
                                        if (err) {
                                            global.db.run("ROLLBACK");
                                            return next(err);
                                        }

                                        stepIndex++;
                                        insertNextStep();
                                    }
                                );
                            }

                            insertNextStep();
                        }
                    );
                }

                insertNextIngredient();
            }
        );
    });
});

router.post("/recipe/:id/delete", (req, res) => {
    const foodId = req.params.id;

    const sql = `
        DELETE FROM food
        WHERE food_id = ?
    `;

    global.db.run(sql, [foodId], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error deleting recipe");
        }

        res.redirect("/settings/recipe");
    });
});

router.get("/recipe/:id/edit", (req, res) => {
    const foodId = req.params.id;

    const foodSql = `
        SELECT food_id, food_name
        FROM food
        WHERE food_id = ?
    `;

    const foodIngredientsSql = `
        SELECT 
            fi.food_ingredients_id,
            fi.ingredients_id,
            fi.required_amount
        FROM food_ingredients fi
        WHERE fi.food_id = ?
        ORDER BY fi.food_ingredients_id
    `;

    const stepsSql = `
        SELECT
            food_ingredients_id,
            preparation_method_id,
            prep_step_order
        FROM food_ingredient_preparation
        ORDER BY prep_step_order
    `;

    global.db.get(foodSql, [foodId], (err, food) => {
        if (err) return res.status(500).send("Database error");
        if (!food) return res.status(404).send("Recipe not found");

        global.db.all(foodIngredientsSql, [foodId], (err, recipeIngredients) => {
            if (err) return res.status(500).send("Database error");

            global.db.all(stepsSql, [], (err, allSteps) => {
                if (err) return res.status(500).send("Database error");

                recipeIngredients.forEach(ri => {
                    ri.preparation_steps = allSteps
                        .filter(step => step.food_ingredients_id === ri.food_ingredients_id)
                        .map(step => step.preparation_method_id);
                });

                global.db.all("SELECT * FROM ingredients", [], (err, ingredients) => {
                    if (err) return res.status(500).send("Database error");

                    global.db.all("SELECT * FROM preparation_method", [], (err, methods) => {
                        if (err) return res.status(500).send("Database error");

                        res.render("editrecipe.ejs", {
                            title: "Edit Recipe",
                            food,
                            recipeIngredients,
                            ingredients,
                            methods
                        });
                    });
                });
            });
        });
    });
});

router.post("/recipe/:id/edit", (req, res) => {
    const foodId = req.params.id;
    const foodName = req.body.food_name;
    const ingredients = req.body.ingredients || [];

    global.db.serialize(() => {
        global.db.run("BEGIN TRANSACTION");

        global.db.run(
            `
            UPDATE food
            SET food_name = ?
            WHERE food_id = ?
            `,
            [foodName, foodId],
            function (err) {
                if (err) {
                    console.error(err);
                    global.db.run("ROLLBACK");
                    return res.status(500).send("Error updating food");
                }

                global.db.run(
                    `
                    DELETE FROM food_ingredients
                    WHERE food_id = ?
                    `,
                    [foodId],
                    function (err) {
                        if (err) {
                            console.error(err);
                            global.db.run("ROLLBACK");
                            return res.status(500).send("Error deleting old ingredients");
                        }

                        let ingredientIndex = 0;

                        function insertNextIngredient() {
                            if (ingredientIndex >= ingredients.length) {
                                global.db.run("COMMIT");
                                return res.redirect("/settings/recipe");
                            }

                            const ingredient = ingredients[ingredientIndex];

                            if (!ingredient.ingredients_id) {
                                ingredientIndex++;
                                return insertNextIngredient();
                            }

                            global.db.run(
                                `
                                INSERT INTO food_ingredients
                                (food_id, ingredients_id, required_amount)
                                VALUES (?, ?, ?)
                                `,
                                [
                                    foodId,
                                    ingredient.ingredients_id,
                                    ingredient.required_amount || 1
                                ],
                                function (err) {
                                    if (err) {
                                        console.error(err);
                                        global.db.run("ROLLBACK");
                                        return res.status(500).send("Error inserting ingredient");
                                    }

                                    const foodIngredientsId = this.lastID;

                                    let steps = ingredient.preparation_steps || [];

                                    if (!Array.isArray(steps)) {
                                        steps = [steps];
                                    }

                                    steps = steps.filter(step => step !== "");

                                    let stepIndex = 0;

                                    function insertNextStep() {
                                        if (stepIndex >= steps.length) {
                                            ingredientIndex++;
                                            return insertNextIngredient();
                                        }

                                        global.db.run(
                                            `
                                            INSERT INTO food_ingredient_preparation
                                            (
                                                food_ingredients_id,
                                                preparation_method_id,
                                                prep_step_order
                                            )
                                            VALUES (?, ?, ?)
                                            `,
                                            [
                                                foodIngredientsId,
                                                steps[stepIndex],
                                                stepIndex + 1
                                            ],
                                            function (err) {
                                                if (err) {
                                                    console.error(err);
                                                    global.db.run("ROLLBACK");
                                                    return res.status(500).send("Error inserting preparation step");
                                                }

                                                stepIndex++;
                                                insertNextStep();
                                            }
                                        );
                                    }

                                    insertNextStep();
                                }
                            );
                        }

                        insertNextIngredient();
                    }
                );
            }
        );
    });
});

module.exports = router;