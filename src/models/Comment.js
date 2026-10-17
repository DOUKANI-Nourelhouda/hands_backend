const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },

    residence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Residence",
      required: true,
    },
    parentComment: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Comment",
  default: null,
},
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Comment", commentSchema);

