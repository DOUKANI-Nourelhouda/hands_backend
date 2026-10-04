const User = require("../models/User.js");

const checkPostCredits = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // First 3 posts are free
    if (user.freePostsUsed < 3) {
      req.postPaymentType = "free";
      req.currentUser = user;

      return next();
    }

    // After the first 3, use purchased credits
    if (user.paidPostCredits > 0) {
      req.postPaymentType = "paid_credit";
      req.currentUser = user;

      return next();
    }

    
    return res.status(402).json({
      message: "You have used your 3 free posts. Please purchase a post package.",
      code: "POST_PAYMENT_REQUIRED",
    });
  } catch (error) {
    console.error("Check post credits error:", error);

    return res.status(500).json({
      message: "Failed to check post credits",
    });
  }
};

module.exports = checkPostCredits;