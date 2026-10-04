const mongoose = require("mongoose");
const Joi = require("joi");
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isVerified: {
       type: Boolean,
       default: false },

    password: {
      type: String,
      required: true,
    },

    profilePicture: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      default: "",
    },

    
    residence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Residence",
      required: true,
    },

    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default:[],
      },
    ],

    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default:[],
      },
    ],
    blockedUsers: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
],
    posts: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    default: [],
    },
   ],
   freePostsUsed: {
  type: Number,
  default: 0,
  },

  paidPostCredits: {
  type: Number,
  default: 0,
  },
},
  
  {
    timestamps: true,
  }
);

// REGISTER VALIDATION
function validateUser(user) {
  const schema = Joi.object({
    username: Joi.string()
      .min(3)
      .max(30)
      .required(),

    email: Joi.string()
      .email()
      .required(),

    password: Joi.string()
      .min(6)
      .required(),

    residence: Joi.string()
      .required(),
  });

  return schema.validate(user);
}


// LOGIN VALIDATION
function validateLogin(user) {
  const schema = Joi.object({
    email: Joi.string()
      .email()
      .required(),

    password: Joi.string()
      .required(),
  });

  return schema.validate(user);
}


// UPDATE USER VALIDATION
function validateUpdate(user) {
  const schema = Joi.object({
    username: Joi.string()
      .min(3)
      .max(30),

    email: Joi.string()
      .email(),

    password: Joi.string()
      .min(6),

    profilePicture: Joi.string()
      .allow(""),

    bio: Joi.string()
      .max(300)
      .allow(""),

    residence: Joi.string(),
  });

  return schema.validate(user);
}


const User = mongoose.model("User", userSchema);

module.exports = {
  User,
  validateUser,
  validateLogin,
  validateUpdate,
};