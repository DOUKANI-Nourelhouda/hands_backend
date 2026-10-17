const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {

    category: {
  type: String,
  required: true,
  enum: [
    "Food",
    "Beauty",
    "Sports",
    "Delivery",
    "Printing & Copying",
    "Sewing",
    "Phone & PC Repair",
    "Education",
    "Design",
    "Photography",
    "Video Editing",
    "Hairdressing",
    "Cleaning",
    "Laundry",
    "Handmade",
    "Electronics",
    "Clothing",
    "Jewelry",
    "Translation",
    "Projects",
    "Programming",
    "Trips",
    "Other",
  ],
  trim: true,
  
},

     caption : {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },

   
media: [
  {
    url: {
      type: String,
  
    },
    type: {
      type: String,
      enum: ["image", "video"],
    
    },
    publicId: {
      type: String,
    },
  },
],

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