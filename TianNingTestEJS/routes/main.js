const express = require("express");
const router = express.Router();

// Import ticket rail routes
const ticketrailRoutes = require('./ticketrail');

// Mount ticket rail routes - this handles /game, /game/settings, /api/*, etc.
router.use('/', ticketrailRoutes);

// Home page - this handles just /
router.get('/', (req, res, next) => {
    res.render("index.ejs", {title: "HOME"});
});

// ESP Dashboard page
router.get('/espdashboard', (req, res) => {
    res.render("espdashboard.ejs", { title: "ESP Dashboard" });
});

// Credits page
router.get('/credits', (req, res) => {
    res.render("credits.ejs", { title: "Credits" });
});

module.exports = router;