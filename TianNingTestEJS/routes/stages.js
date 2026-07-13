// Avan Here, Settings Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("settings.ejs", {title: "Settings"});
});

// ─── LOAD ESP32 SETUP PAGE ──────────────────────────────────────
router.get("/esp32", (req, res, next) => {
    const sqlDevices = `SELECT * FROM ESP32Devices WHERE device_type IN ('tagger', 'counter') OR device_type IS NULL ORDER BY last_seen DESC`;
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
                    SELECT et.tag_id, et.device_id, et.ingredients_id, et.current_status,
                           ed.device_mac, i.ingredients_name
                    FROM ESP32Tags et
                    JOIN ESP32Devices ed ON et.device_id = ed.device_id
                    JOIN ingredients i ON et.ingredients_id = i.ingredients_id
                    ORDER BY et.tag_id DESC
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

// ─── UPDATE ESP32 DEVICE ──────────────────────────────────────
router.post("/esp32/update", (req, res, next) => {
    const { esp32_id, device_mac, ip_address, device_type } = req.body;
    
    if (!esp32_id || !device_mac) {
        return res.status(400).send("Device ID and MAC address are required");
    }
    
    global.db.get(
        `SELECT * FROM ESP32Devices WHERE esp32_id = ?`,
        [esp32_id],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device not found");
            
            global.db.run(
                `UPDATE ESP32Devices 
                 SET device_mac = ?, 
                     ip_address = ?, 
                     device_type = ?
                 WHERE esp32_id = ?`,
                [device_mac, ip_address || null, device_type || null, esp32_id],
                function(err) {
                    if (err) return next(err);
                    console.log(`[UPDATE] Device ${esp32_id} updated successfully`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});

// ─── ASSIGN TAG TO INGREDIENT ──────────────────────────────────
router.post("/esp32/assign-tag", (req, res, next) => {
    const { device_mac, ingredients_id } = req.body;

    if (!device_mac || !ingredients_id) {
        return res.status(400).send("MAC address and ingredient are required");
    }

    // Check if the tag device exists (it should be in ESP32Devices as a passive tag)
    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) {
                return res.status(404).send("Tag MAC not found. Please register the tag first.");
            }

            // Check if this tag is already assigned
            global.db.get(
                `SELECT tag_id FROM ESP32Tags WHERE device_id = ?`,
                [device.device_id],
                (err, existing) => {
                    if (err) return next(err);
                    if (existing) {
                        // Update existing assignment
                        global.db.run(
                            `UPDATE ESP32Tags 
                             SET ingredients_id = ?, current_status = 'Default'
                             WHERE device_id = ?`,
                            [ingredients_id, device.device_id],
                            function(err) {
                                if (err) return next(err);
                                console.log(`[ASSIGN-TAG] Updated: ${device_mac} → ingredient ${ingredients_id}`);
                                res.redirect("/settings/esp32");
                            }
                        );
                    } else {
                        // Create new assignment
                        global.db.run(
                            `INSERT INTO ESP32Tags (device_id, ingredients_id, current_status)
                             VALUES (?, ?, 'Default')`,
                            [device.device_id, ingredients_id],
                            function(err) {
                                if (err) return next(err);
                                console.log(`[ASSIGN-TAG] Created: ${device_mac} → ingredient ${ingredients_id}`);
                                res.redirect("/settings/esp32");
                            }
                        );
                    }
                }
            );
        }
    );
});

// ─── UPDATE TAG ASSIGNMENT ─────────────────────────────────────
router.post("/esp32/update-tag-assignment", (req, res, next) => {
    const { tag_id, device_mac, ingredients_id } = req.body;
    
    if (!tag_id || !device_mac || !ingredients_id) {
        return res.status(400).send("Missing required fields");
    }
    
    // Get the device_id from the MAC
    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) {
                return res.status(404).send("Device MAC not found. Register it first.");
            }
            
            // Update the assignment
            global.db.run(
                `UPDATE ESP32Tags 
                 SET device_id = ?, ingredients_id = ?
                 WHERE tag_id = ?`,
                [device.device_id, ingredients_id, tag_id],
                function(err) {
                    if (err) return next(err);
                    console.log(`[UPDATE-TAG-ASSIGNMENT] Updated assignment ${tag_id}`);
                    res.redirect("/settings/esp32");
                }
            );
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
        `DELETE FROM ESP32Tags WHERE tag_id = ?`,
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