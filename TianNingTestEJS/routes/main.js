// Avan Here, App Journey Starts here!
// Main page router only for home page

const express = require("express");
const router = express.Router();

router.get('/', (req, res, next) => {
    res.render("index.ejs", {title: "HOME"});
});

// Main Page, no need to check for ESP32 yet

module.exports = router;