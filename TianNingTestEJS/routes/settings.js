// Avan Here, Settings Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("settings.ejs", {title: "Settings"});
});

// ─── LOAD ESP32 SETUP PAGE ──────────────────────────────────────
// ─── LOAD ESP32 SETUP PAGE ──────────────────────────────────────
router.get("/esp32", (req, res, next) => {
    const sqlDevices = `
        SELECT
            ed.device_id,
            ed.device_mac,
            ed.ip_address,
            ed.last_seen,
            et.tagger_id,
            et.station_id,
            s.station_name
        FROM ESP32Devices ed

        LEFT JOIN ESP32Tagger et
            ON ed.device_id = et.device_id

        LEFT JOIN station s
            ON et.station_id = s.station_id

        ORDER BY ed.last_seen DESC
    `;

    const sqlIngredients = `
        SELECT *
        FROM ingredients
        ORDER BY ingredients_name
    `;

    const sqlStations = `
        SELECT *
        FROM station
        ORDER BY station_name
    `;

    const sqlAssignments = `
        SELECT
            rt.tag_id,
            rt.tag_rfid,
            rt.ingredients_id,
            rt.current_status,
            i.ingredients_name
        FROM RFIDTags rt

        JOIN ingredients i
            ON rt.ingredients_id = i.ingredients_id

        ORDER BY rt.tag_id DESC
    `;

    global.db.all(sqlDevices, [], (err, devices) => {
        if (err) return next(err);

        global.db.all(sqlIngredients, [], (err, ingredients) => {
            if (err) return next(err);

            global.db.all(sqlStations, [], (err, stations) => {
                if (err) return next(err);

                global.db.all(
                    sqlAssignments,
                    [],
                    (err, tagAssignments) => {
                        if (err) return next(err);

                        res.render("esp32setup.ejs", {
                            title: "ESP32 Setup",
                            devices: devices || [],
                            ingredients: ingredients || [],
                            stations: stations || [],
                            tagAssignments: tagAssignments || []
                        });
                    }
                );
            });
        });
    });
});

// ─── UPDATE ESP32 DEVICE ──────────────────────────────────────
router.post("/esp32/update", (req, res, next) => {
    const {
        device_id,
        device_mac,
        ip_address,
        station_id
    } = req.body;

    if (!device_id || !device_mac || !station_id) {
        return res.status(400).send(
            "Device ID, MAC address, and station are required"
        );
    }

    // Check whether the ESP32 device exists
    global.db.get(
        `
        SELECT device_id
        FROM ESP32Devices
        WHERE device_id = ?
        `,
        [device_id],
        (err, device) => {
            if (err) return next(err);

            if (!device) {
                return res.status(404).send("Device not found");
            }

            // Update MAC address and IP address
            global.db.run(
                `
                UPDATE ESP32Devices
                SET
                    device_mac = ?,
                    ip_address = ?
                WHERE device_id = ?
                `,
                [
                    device_mac,
                    ip_address || null,
                    device_id
                ],
                function (err) {
                    if (err) {
                        if (err.code === "SQLITE_CONSTRAINT") {
                            return res.status(409).send(
                                "That MAC address is already registered."
                            );
                        }

                        return next(err);
                    }

                    // Update the station assigned to the ESP32
                    global.db.run(
                        `
                        INSERT INTO ESP32Tagger (
                            device_id,
                            station_id
                        )
                        VALUES (?, ?)

                        ON CONFLICT(device_id)
                        DO UPDATE SET
                            station_id = excluded.station_id
                        `,
                        [
                            device_id,
                            station_id
                        ],
                        function (err) {
                            if (err) return next(err);

                            console.log(
                                `[UPDATE] Device ${device_id} updated: ` +
                                `${device_mac} assigned to station ${station_id}`
                            );

                            res.redirect("/settings/esp32");
                        }
                    );
                }
            );
        }
    );
});

// ─── ASSIGN TAG TO INGREDIENT ──────────────────────────────────
router.post("/esp32/assign-tag", (req, res, next) => {
    const { tag_rfid, ingredients_id } = req.body;

    if (!tag_rfid || !ingredients_id) {
        return res.status(400).send(
            "RFID tag and ingredient are required"
        );
    }

    // Insert a new RFID assignment or update the existing one.
    global.db.run(
        `
        INSERT INTO RFIDTags (
            tag_rfid,
            ingredients_id,
            current_status
        )
        VALUES (?, ?, '1')

        ON CONFLICT(tag_rfid)
        DO UPDATE SET
            ingredients_id = excluded.ingredients_id,
            current_status = '1'
        `,
        [tag_rfid, ingredients_id],
        function (err) {
            if (err) return next(err);

            console.log(
                `[ASSIGN-TAG] ${tag_rfid} → ingredient ${ingredients_id}`
            );

            res.redirect("/settings/esp32");
        }
    );
});


// ─── UPDATE TAG ASSIGNMENT ─────────────────────────────────────
router.post("/esp32/update-tag-assignment", (req, res, next) => {
    const {
        tag_id,
        tag_rfid,
        ingredients_id
    } = req.body;

    if (!tag_id || !tag_rfid || !ingredients_id) {
        return res.status(400).send(
            "Tag ID, RFID tag and ingredient are required"
        );
    }

    global.db.run(
        `
        UPDATE RFIDTags
        SET
            tag_rfid = ?,
            ingredients_id = ?
        WHERE tag_id = ?
        `,
        [tag_rfid, ingredients_id, tag_id],
        function (err) {
            if (err) {
                // SQLite unique constraint error if another tag
                // already uses the submitted RFID UID.
                if (err.code === "SQLITE_CONSTRAINT") {
                    return res.status(409).send(
                        "That RFID tag is already assigned."
                    );
                }

                return next(err);
            }

            if (this.changes === 0) {
                return res.status(404).send(
                    "RFID tag assignment not found"
                );
            }

            console.log(
                `[UPDATE-TAG-ASSIGNMENT] Updated assignment ${tag_id}: ` +
                `${tag_rfid} → ingredient ${ingredients_id}`
            );

            res.redirect("/settings/esp32");
        }
    );
});


// ─── DELETE TAG ASSIGNMENT ─────────────────────────────────────
router.post("/esp32/delete-tag-assignment", (req, res, next) => {
    const { tag_id } = req.body;

    if (!tag_id) {
        return res.status(400).json({
            success: false,
            error: "Missing tag_id"
        });
    }

    global.db.run(
        `DELETE FROM RFIDTags WHERE tag_id = ?`,
        [tag_id],
        function (err) {
            if (err) return next(err);

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: "RFID tag assignment not found"
                });
            }

            console.log(
                `[DELETE-TAG-ASSIGNMENT] Deleted assignment ${tag_id}`
            );

            res.json({
                success: true,
                message: "Assignment deleted successfully"
            });
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