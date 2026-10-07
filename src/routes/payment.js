const express = require("express");
const { User } = require("../models/User.js");
const Purchase = require("../models/Purchase.js");
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



router.get("/credits", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "freePostsUsed paidPostCredits"
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const FREE_POST_LIMIT = 3;

    return res.status(200).json({
      freePostsRemaining: Math.max(
        FREE_POST_LIMIT - user.freePostsUsed,
        0
      ),
      paidPostCredits: user.paidPostCredits,
      totalAvailablePosts:
        Math.max(FREE_POST_LIMIT - user.freePostsUsed, 0) +
        user.paidPostCredits,
    });
  } catch (error) {
    console.error("Get credits error:", error);

    return res.status(500).json({
      message: "Failed to get post credits",
    });
  }
});

router.get(
  "/purchases",
  verifyToken,
  async (req, res) => {
    try {
      const purchases = await Purchase.find({
        user: req.user.id,
      })
        .sort({ createdAt: -1 })
        .select(
          "packageId postsPurchased amount currency status chargilyPaymentId transactionId paidAt createdAt"
        );

      return res.status(200).json({
        count: purchases.length,
        purchases,
      });
    } catch (error) {
      console.error("Get purchase history error:", error);

      return res.status(500).json({
        message: "Failed to get purchase history",
      });
    }
  }
);

router.get(
  "/summary",
  verifyToken,
  async (req, res) => {
    try {
      const FREE_POST_LIMIT = 3;

      const user = await User.findById(req.user.id).select(
        "freePostsUsed paidPostCredits"
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const purchases = await Purchase.find({
        user: req.user.id,
      }).select(
        "postsPurchased amount currency status"
      );

      const freePostsRemaining = Math.max(
        FREE_POST_LIMIT - user.freePostsUsed,
        0
      );

      const paidPostCredits = user.paidPostCredits || 0;

      const totalAvailablePosts =
        freePostsRemaining + paidPostCredits;

      const paidPurchases = purchases.filter(
        (purchase) => purchase.status === "paid"
      );

      const totalPostsPurchased = paidPurchases.reduce(
        (total, purchase) =>
          total + purchase.postsPurchased,
        0
      );

      const totalMoneySpent = paidPurchases.reduce(
        (total, purchase) =>
          total + purchase.amount,
        0
      );

      return res.status(200).json({
        credits: {
          freePostsRemaining,
          paidPostCredits,
          totalAvailablePosts,
        },

        purchases: {
          total: purchases.length,
          paid: paidPurchases.length,
          totalPostsPurchased,
          totalMoneySpent,
          currency: "DZD",
        },
      });
    } catch (error) {
      console.error("Get payment summary error:", error);

      return res.status(500).json({
        message: "Failed to get payment summary",
      });
    }
  }
);

// Chargily webhook
router.post(
  "/webhook",
  handleChargilyWebhook
);

module.exports = router;