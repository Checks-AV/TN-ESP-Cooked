// Avan Here, Settings Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("settings.ejs", {title: "Settings"});
});

// Load the ESP32 setup page and table.
router.get("/esp32", (req, res, next) => {
    const sql = `
        SELECT *
        FROM ESP32Devices
        ORDER BY last_seen DESC
    `;

    global.db.all(sql, [], (err, devices) => {
        if (err) return next(err);

        res.render("esp32setup.ejs", {
            title: "ESP32 Setup",
            devices: devices
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
    //   ingredientstatus_id: "2",
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
                         (food_id, ingredients_id, ingredientstatus_id, required_amount)
                         VALUES (?, ?, ?, ?)`,
                        [
                            foodId,
                            ing.ingredients_id,
                            ing.ingredientstatus_id,
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
                                     (food_ingredient_id, preparation_method_id, prep_step_order)
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



module.exports = router;
// Communications to Database HERE

/* router.post('/recipe',(req, res, next)) => {
    
    }; */


