const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { User } = require("../models/User.js");
const Conversation = require("../models/Conversation.js");
const Message = require("../models/Message.js");
const { verifyToken } = require("../middlewares/verifyToken");



// CREATE / GET EXISTING CONVERSATION
// POST /api/conversations
router.post( "/", verifyToken, asyncHandler(async (req, res) => {

    const currentUserId = req.user.id;
    const { userId } = req.body;


    const currentUserBlockedOther =
        currentUser.blockedUsers.some(
       (id) => id.toString() === otherUser._id.toString()
      );

    const otherUserBlockedCurrent =
      otherUser.blockedUsers.some(
     (id) => id.toString() === currentUser._id.toString()
 );

    if (currentUserBlockedOther || otherUserBlockedCurrent) {
       return res.status(403).json({
       message: "You cannot contact this user",
     });
}

/*const blocked = await checkBlocked(
  req.user.id,
  targetUserId
);

if (blocked.blocked) {
  return res.status(403).json({
    message: "You cannot message this user",
  });
}*/
    if (!userId) {
      return res.status(400).json({
        message: "userId is required",
      });
    }

    if (currentUserId === userId) {
      return res.status(400).json({
        message: "You cannot create a conversation with yourself",
      });
    }

    // Get current user
    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      return res.status(404).json({
        message: "Current user not found",
      });
    }

    // Get other user
    const otherUser = await User.findById(userId);

    if (!otherUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    
    // SAME RESIDENCE CHECk
    if (!currentUser.residence || !otherUser.residence) {
      return res.status(400).json({
        message: "Both users must belong to a residence",
      });
    }

    if (
      currentUser.residence.toString() !==
      otherUser.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only contact users from your residence",
      });
    }

    
    // CHECK IF CONVERSATION ALREADY EXISTS
    let conversation = await Conversation.findOne({
      residence: currentUser.residence,
      participants: {
        $all: [currentUserId, userId],
      },
    })
      .populate("participants", "-password");

    if (conversation) {
      return res.status(200).json(conversation);
    }

    // CREATE NEW CONVERSATION
    conversation = await Conversation.create({
      participants: [currentUserId, userId],
      residence: currentUser.residence,
    });

    conversation = await conversation.populate(
      "participants",
      "-password"
    );

    res.status(201).json(conversation);
  })
);



// GET MY CONVERSATIONS
router.get(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {

    const conversations = await Conversation.find({
      participants: req.user.id,
    })
      .populate("participants", "-password")
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "username profilePicture",
        },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  })
);


// GET ONE CONVERSATION
// GET /api/conversations/:id
router.get(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {

    const conversation = await Conversation.findById(req.params.id)
      .populate("participants", "-password")
      .populate("residence");

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    // User must belong to the conversation
    const isParticipant = conversation.participants.some(
      (user) => user._id.toString() === req.user.id
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "You are not part of this conversation",
      });
    }

    res.status(200).json(conversation);
  })
);



// DELETE CONVERSATION
// DELETE /api/conversations/:id
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {

    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    const isParticipant = conversation.participants.some(
      (userId) => userId.toString() === req.user.id
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "You are not part of this conversation",
      });
    }

    await Message.deleteMany({
      conversation: conversation._id,
    });

    await Conversation.findByIdAndDelete(conversation._id);

    res.status(200).json({
      message: "Conversation deleted successfully",
    });
  })
);


module.exports = router;