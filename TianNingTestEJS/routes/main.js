const express = require("express");
const router = express.Router();

// Home page
router.get('/', (req, res, next) => {
    res.render("index.ejs", {title: "HOME"});
});

// Game route - Ticket Rail Game
router.get('/game', (req, res, next) => {
    res.render("game.ejs", { 
        title: "Game - Cooking Adventure" 
    });
});

// Game Settings route - Control Dashboard
router.get('/game/settings', (req, res, next) => {
    res.render("gamesettings.ejs", { 
        title: "Game Settings" 
    });
});

// Alternative: Also support /gamesettings (without /game/ prefix)
router.get('/gamesettings', (req, res, next) => {
    res.render("gamesettings.ejs", { 
        title: "Game Settings" 
    });
});

module.exports = router;