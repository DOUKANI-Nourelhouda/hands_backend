const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    packageId: {
      type: String,
      enum: ["5_posts", "10_posts", "20_posts"],
      required: true,
    },

    postsPurchased: {
      type: Number,
      required: true,
      enum: [5, 10, 20],
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "DZD",
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
    },

    chargilyPaymentId: {
  type: String,
  default: null,
  unique: true,
  sparse: true,
},

    transactionId: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Purchase", purchaseSchema);