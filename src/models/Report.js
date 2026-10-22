const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    // Set this for a post report.
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },

    // Set this for a user report.
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // The user who submitted the report.
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
        "impersonation",
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

// Every report must target exactly one post or one user.
reportSchema.pre("validate", function () {
  const hasPost = this.post != null;
  const hasReportedUser = this.reportedUser != null;

  if (hasPost === hasReportedUser) {
    this.invalidate(
      "post",
      "A report must target either a post or a user, but not both."
    );
  }
});

// One report per user per post.
reportSchema.index(
  { post: 1, reporter: 1 },
  {
    unique: true,
    partialFilterExpression: { post: { $type: "objectId" } },
  }
);

// One report per user per reported account.
reportSchema.index(
  { reportedUser: 1, reporter: 1 },
  {
    unique: true,
    partialFilterExpression: {
      reportedUser: { $type: "objectId" },
    },
  }
);

module.exports = mongoose.model("Report", reportSchema);