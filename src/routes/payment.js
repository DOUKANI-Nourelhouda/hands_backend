const express = require("express");

const router = express.Router();

const {
  createPostPackagePayment,
} = require("../controllers/payment_controllers.js");

const {
  handleChargilyWebhook,
} = require("../controllers/payment_webhook_controller.js");

const {verifyToken} = require("../middlewares/verifyToken.js");

// Create payment
router.post(
  "/create",
  verifyToken,
  createPostPackagePayment
);

// Chargily webhook
router.post(
  "/webhook",
  handleChargilyWebhook
);

module.exports = router;