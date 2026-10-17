
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      required: true,
      enum: [
        "inappropriate",
        "scam",
        "spam",
        "harassment",
        "prohibited",
        "other",
      ],
    },

    details: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "reviewed", "dismissed", "action_taken"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// One report per user per post.
reportSchema.index(
  { post: 1, reporter: 1 },
  { unique: true }
);

module.exports = mongoose.model("Report", reportSchema);
