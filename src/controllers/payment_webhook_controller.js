const crypto = require("crypto");

const Purchase = require("../models/Purchase");
const User = require("../models/User");

const handleChargilyWebhook = async (req, res) => {
  try {

    // 1. Get Chargily signature
  

    const receivedSignature = req.headers["signature"];

    if (!receivedSignature) {
      console.log("Chargily webhook: missing signature");

      return res.status(400).json({
        message: "Missing signature",
      });
    }

  
    // 2. Get RAW request body
   

    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      console.error("Chargily webhook: body is not raw Buffer");

      return res.status(400).json({
        message: "Invalid webhook body",
      });
    }

   
    // 3. Calculate HMAC SHA256
  

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.CHARGILY_SECRET_KEY
      )
      .update(rawBody)
      .digest("hex");

   
    // 4. Securely compare signatures
   

    const receivedBuffer = Buffer.from(receivedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      console.log("Chargily webhook: invalid signature");

      return res.status(403).json({
        message: "Invalid signature",
      });
    }

  
    // 5. Parse JSON
   

    const event = JSON.parse(rawBody.toString("utf8"));

    console.log("Chargily webhook event:", event.type);

 
    // 6. Handle successful payment
   

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

    
      // 7. Find purchase
   

      const purchase = await Purchase.findById(
        purchaseId
      );

      if (!purchase) {
        console.error(
          "Chargily webhook: purchase not found:",
          purchaseId
        );

        return res.status(404).json({
          message: "Purchase not found",
        });
      }

     
      // 8. Prevent duplicate credits
     

      if (purchase.status === "paid") {
        console.log(
          "Chargily webhook: payment already processed"
        );

        return res.status(200).json({
          message: "Already processed",
        });
      }

    
      // 9. Find user
   

      const user = await User.findById(
        purchase.user
      );

      if (!user) {
        console.error(
          "Chargily webhook: user not found"
        );

        return res.status(404).json({
          message: "User not found",
        });
      }

   
      // 10. Mark purchase as paid
   

      purchase.status = "paid";
      purchase.chargilyPaymentId = checkout.id;

     
      // 11. Add post credits
  

      user.paidPostCredits =
        (user.paidPostCredits || 0) +
        purchase.postsPurchased;

      await user.save();
      await purchase.save();

      console.log(
        `Payment successful: +${purchase.postsPurchased} posts for user ${user._id}`
      );

      return res.status(200).json({
        message: "Payment processed successfully",
      });
    }

    
    // 12. Handle failed payment
   

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