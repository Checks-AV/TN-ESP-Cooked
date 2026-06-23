// Avan Here, Settings Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("settings.ejs", {title: "Settings"});
});

// Load the ESP32 setup page and table.
router.get("/esp32", (req, res, next) => {
    const sqlDevices     = `SELECT * FROM ESP32Devices ORDER BY last_seen DESC`;
    const sqlIngredients = `SELECT * FROM ingredients ORDER BY ingredients_name`;
    const sqlStations    = `SELECT * FROM station ORDER BY station_name`;

    global.db.all(sqlDevices, [], (err, devices) => {
        if (err) return next(err);

        global.db.all(sqlIngredients, [], (err, ingredients) => {
            if (err) return next(err);

            global.db.all(sqlStations, [], (err, stations) => {
                if (err) return next(err);

                res.render("esp32setup.ejs", {
                    title: "ESP32 Setup",
                    devices,
                    ingredients,
                    stations
                });
            });
        });
    });
});


router.post("/esp32/update", (req, res, next)=> {
    console.log(req.body);
    res.render("updateesp.ejs", {title: "Update EJS"});
});

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
        // console.log(foods);
        res.render('mainrecipe.ejs', 
        {
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
    const sqlFoods = `SELECT food_id, food_name FROM food ORDER BY food_id DESC`;
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
    // ingredients is expected to be an array of objects
    // each object should look like:
    // {
    //   ingredients_id: "1",
    //   required_amount: "1",
    //   preparation_steps: ["1", "3"]
    // }

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
                    db.run("ROLLBACK");
                    return next(err);
                }

                const foodId = this.lastID;

                let ingredientIndex = 0;

                function insertNextIngredient() {
                    if (ingredientIndex >= ingredients.length) {
                        db.run("COMMIT", (err) => {
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
                                db.run("ROLLBACK");
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
                                            db.run("ROLLBACK");
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

        // 1. Update food name
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

                // 2. Delete old ingredient rows
                // food_ingredient_preparation should delete automatically
                // if ON DELETE CASCADE is set correctly
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

                        // 3. Insert updated ingredients
                        let ingredientIndex = 0;

                        function insertNextIngredient() {
                            if (ingredientIndex >= ingredients.length) {
                                global.db.run("COMMIT");
                                return res.redirect("/settings/recipe");
                            }

                            const ingredient = ingredients[ingredientIndex];

                            // skip empty ingredient rows
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
// Communications to Database HERE

/* router.post('/recipe',(req, res, next)) => {
    
    }; */


