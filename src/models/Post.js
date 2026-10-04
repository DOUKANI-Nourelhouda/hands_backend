const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {

    category : {
      type: String,
      required: true,
      trim: true,
      max: 300,
      default: "General"
    },

     caption : {
      type: String,
      required: true,
      trim: true,
      max: 300
    },

    picture: {
      type: String,
      default: "",
    },
    likes: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
],
    comments: [

      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    residence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Residence",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Post", postSchema);