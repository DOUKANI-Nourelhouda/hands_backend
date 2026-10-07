const Purchase = require("../models/Purchase.js");
const POST_PACKAGES = require("../config/post_packages.js");
const { createCheckout } = require("../services/chargily_service.js");

const createPostPackagePayment = async (req, res) => {
  try {
    const userId = req.user.id;

    const { packageId } = req.body;

    // -----------------------------
    // 1. Validate package
    // -----------------------------

    const selectedPackage = POST_PACKAGES[packageId];

    if (!selectedPackage) {
      return res.status(400).json({
        message: "Invalid post package",
      });
    }

    // -----------------------------
    // 2. Create pending purchase
    // -----------------------------

    const purchase = await Purchase.create({
      user: userId,

      packageId,

      postsPurchased: selectedPackage.posts,

      amount: selectedPackage.price,

      currency: "dzd",

      status: "pending",
    });

    // -----------------------------
    // 3. Create Chargily checkout
    // -----------------------------

    const checkout = await createCheckout({
      amount: selectedPackage.price,

      successUrl:
        `${process.env.FRONTEND_URL}/payment/success` +
        `?purchaseId=${purchase._id}`,

      failureUrl:
        `${process.env.FRONTEND_URL}/payment/failure` +
        `?purchaseId=${purchase._id}`,

      webhookEndpoint:
        `${process.env.BACKEND_URL}/api/payments/webhook`,

      description:
        `${selectedPackage.posts} Servisy post credits`,

      metadata: {
  purchaseId: purchase._id.toString(),
  userId: userId.toString(),
  packageId,
  posts: selectedPackage.posts,
},
    });
console.log(JSON.stringify(checkout, null, 2));
    // -----------------------------
    // 4. Save Chargily checkout ID
    // -----------------------------

    purchase.chargilyPaymentId = checkout.id;

    await purchase.save();

    // -----------------------------
    // 5. Return checkout URL
    // -----------------------------

    return res.status(201).json({
      message: "Checkout created successfully",

      purchaseId: purchase._id,

      package: {
        id: packageId,

        posts: selectedPackage.posts,

        price: selectedPackage.price,
      },

      checkout: {
        id: checkout.id,

      url: checkout.checkout_url,
      },
    });
 } catch (error) {
  console.error("========== PAYMENT ERROR ==========");
  console.error("Message:", error.message);
  console.error("Status:", error.response?.status);
  console.error("Chargily response:", error.response?.data);
  console.error("Full error:", error);
  console.error("===================================");

  return res.status(500).json({
    message: "Failed to create payment",
    error: error.response?.data || error.message,
  });
}
};

module.exports = {
  createPostPackagePayment,
};