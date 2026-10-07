const mongoose = require("mongoose");
const crypto = require("crypto");

const Purchase = require("../models/Purchase");
const { User } = require("../models/User");

const handleChargilyWebhook = async (req, res) => {
  console.log("🔥 CHARGILY WEBHOOK RECEIVED");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Headers:", req.headers);

  try {
    // =========================================================
    // 1. Get Chargily signature
    // =========================================================

    const receivedSignature = req.headers["signature"];

    if (!receivedSignature) {
      console.log("Chargily webhook: missing signature");

      return res.status(400).json({
        message: "Missing signature",
      });
    }

    // =========================================================
    // 2. Get RAW request body
    // =========================================================

    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      console.error(
        "Chargily webhook: body is not raw Buffer"
      );

      return res.status(400).json({
        message: "Invalid webhook body",
      });
    }

    // =========================================================
    // 3. Calculate HMAC SHA256
    // =========================================================

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.CHARGILY_SECRET_KEY
      )
      .update(rawBody)
      .digest("hex");

    // =========================================================
    // 4. Securely compare signatures
    // =========================================================

    const receivedBuffer = Buffer.from(receivedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      console.log(
        "Chargily webhook: invalid signature"
      );

      return res.status(403).json({
        message: "Invalid signature",
      });
    }

    // =========================================================
    // 5. Parse JSON
    // =========================================================

    const event = JSON.parse(
      rawBody.toString("utf8")
    );

    console.log(
      "Chargily webhook event:",
      event.type
    );

    // =========================================================
    // 6. Handle successful payment
    // =========================================================

    if (event.type === "checkout.paid") {
      const checkout = event.data;

      const purchaseId =
        checkout.metadata?.purchaseId;

      if (!purchaseId) {
        console.error(
          "Chargily webhook: purchaseId missing from metadata"
        );

        return res.status(400).json({
          message: "Purchase ID missing",
        });
      }

      // =======================================================
      // 7. Start MongoDB transaction
      // =======================================================

      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        // =====================================================
        // 8. Find purchase INSIDE transaction
        // =====================================================

        const purchase = await Purchase.findById(
          purchaseId
        ).session(session);

        if (!purchase) {
          console.error(
            "Chargily webhook: purchase not found:",
            purchaseId
          );

          await session.abortTransaction();

          return res.status(404).json({
            message: "Purchase not found",
          });
        }

        // =====================================================
        // 9. Idempotency check
        // =====================================================

        if (purchase.status === "paid") {
          console.log(
            "Chargily webhook: payment already processed"
          );

          await session.abortTransaction();

          return res.status(200).json({
            message: "Already processed",
          });
        }

        // =====================================================
        // 10. Find user INSIDE transaction
        // =====================================================

        const user = await User.findById(
          purchase.user
        ).session(session);

        if (!user) {
          console.error(
            "Chargily webhook: user not found"
          );

          await session.abortTransaction();

          return res.status(404).json({
            message: "User not found",
          });
        }

        // =====================================================
        // 11. Update purchase
        // =====================================================

        purchase.status = "paid";

        purchase.chargilyPaymentId =
          checkout.id;

        purchase.paidAt = new Date();

        // =====================================================
        // 12. Add post credits
        // =====================================================

        user.paidPostCredits =
          (user.paidPostCredits || 0) +
          purchase.postsPurchased;

        // =====================================================
        // 13. Save BOTH using same transaction
        // =====================================================

        await user.save({ session });

        await purchase.save({ session });

        // =====================================================
        // 14. Commit transaction
        // =====================================================

        await session.commitTransaction();

        console.log(
          `Payment successful: +${purchase.postsPurchased} posts for user ${user._id}`
        );

        return res.status(200).json({
          message: "Payment processed successfully",
        });

      } catch (transactionError) {
        // =====================================================
        // Rollback everything
        // =====================================================

        await session.abortTransaction();

        console.error(
          "Chargily webhook transaction failed:",
          transactionError
        );

        return res.status(500).json({
          message: "Payment transaction failed",
        });

      } finally {
        session.endSession();
      }
    }

    // =========================================================
    // 15. Handle failed payment
    // =========================================================

    if (event.type === "checkout.failed") {
      const checkout = event.data;

      const purchaseId =
        checkout.metadata?.purchaseId;

      if (purchaseId) {
        await Purchase.findByIdAndUpdate(
          purchaseId,
          {
            status: "failed",
            chargilyPaymentId: checkout.id,
          }
        );
      }

      return res.status(200).json({
        message: "Payment failure received",
      });
    }

    // =========================================================
    // 16. Unknown event
    // =========================================================

    console.log(
      "Chargily webhook: unhandled event:",
      event.type
    );

    return res.status(200).json({
      message: "Event received",
    });

  } catch (error) {
    console.error(
      "Chargily webhook error:",
      error
    );

    return res.status(500).json({
      message: "Webhook processing failed",
    });
  }
};

module.exports = {
  handleChargilyWebhook,
};