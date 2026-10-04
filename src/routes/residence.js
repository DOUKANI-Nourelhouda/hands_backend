const express = require("express");
const router = express.Router();
const Residence = require("../models/Residence");

// GET all active residences
router.get("/", async (req, res) => {
  try {
    const residences = await Residence.find({ active: true });

    res.status(200).json(residences);
  } catch (error) {
    console.error("Error getting residences:", error);

    res.status(500).json({
      message: "Failed to get residences",
      error: error.message,
    });
  }
});


// GET residences by wilaya
// Example: /api/residences/wilaya/Oran
router.get("/wilaya/:wilaya", async (req, res) => {
  try {
    const wilaya = req.params.wilaya;

    const residences = await Residence.find({
      wilaya: { $regex: `^${wilaya}$`, $options: "i" },
      active: true,
    });

    res.status(200).json(residences);
  } catch (error) {
    console.error("Error getting residences by wilaya:", error);

    res.status(500).json({
      message: "Failed to get residences",
      error: error.message,
    });
  }
});


// GET residences by gender
// Example: /api/residences/gender/female
router.get("/gender/:gender", async (req, res) => {
  try {
    const gender = req.params.gender.toLowerCase();

    const residences = await Residence.find({
      gender: gender,
      active: true,
    });

    res.status(200).json(residences);
  } catch (error) {
    console.error("Error getting residences by gender:", error);

    res.status(500).json({
      message: "Failed to get residences",
      error: error.message,
    });
  }
});


// SEARCH residences
// Example: /api/residences/search?q=2000
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || query.trim() === "") {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const residences = await Residence.find({
      name: { $regex: query, $options: "i" },
      active: true,
    });

    res.status(200).json(residences);
  } catch (error) {
    console.error("Error searching residences:", error);

    res.status(500).json({
      message: "Failed to search residences",
      error: error.message,
    });
  }
});

// GET one residence by ID
// Example: /api/residences/68abc123...
router.get("/:id", async (req, res) => {
  try {
    const residence = await Residence.findById(req.params.id);

    if (!residence) {
      return res.status(404).json({
        message: "Residence not found",
      });
    }

    res.status(200).json(residence);
  } catch (error) {
    console.error("Error getting residence:", error);

    res.status(500).json({
      message: "Failed to get residence",
      error: error.message,
    });
  }
});

module.exports = router;