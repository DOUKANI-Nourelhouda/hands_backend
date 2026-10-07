
const express = require("express");
const router = express.Router();

const asyncHandler = require("express-async-handler");

const Message = require("../models/Message.js");
const Conversation = require("../models/Conversation.js");
const { User } = require("../models/User.js");
const { notifyMessage } = require("../services/notification_service.js");
const { verifyToken } = require("../middlewares/verifyToken");



// SEND MESSAGE

router.post(
  "/:conversationId",
  verifyToken,
  asyncHandler(async (req, res) => {

    const { content, picture } = req.body;

    const conversation = await Conversation.findById(
      req.params.conversationId
    );

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

  
    const receiver = conversation.participants.find(
      (userId) => userId.toString() !== req.user.id
    );

    if (!receiver) {
      return res.status(400).json({
        message: "Receiver not found",
      });
    }

    
    if (!content && !picture) {
      return res.status(400).json({
        message: "Message must contain text or picture",
      });
    }

   
    const senderUser = await User.findById(req.user.id);
    const receiverUser = await User.findById(receiver);

    if (!senderUser || !receiverUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (
      !senderUser.residence ||
      !receiverUser.residence ||
      senderUser.residence.toString() !==
        receiverUser.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only message users from your residence",
      });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user.id,
      receiver: receiver,
      content: content || "",
      picture: picture || "",
    });

    // Update last message
    conversation.lastMessage = message._id;
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture");

    await notifyMessage({
      recipient: receiver,
      sender: req.user.id,
      conversation: conversation._id,
      message: message._id
    });

    res.status(201).json(populatedMessage);
  })
);


// ======================================================
// GET MESSAGES
// GET /api/messages/:conversationId
// ======================================================

router.get(
  "/:conversationId",
  verifyToken,
  asyncHandler(async (req, res) => {

    const conversation = await Conversation.findById(
      req.params.conversationId
    );

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    // Check participant
    const isParticipant = conversation.participants.some(
      (userId) => userId.toString() === req.user.id
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "You are not part of this conversation",
      });
    }

    const messages = await Message.find({
      conversation: conversation._id,
    })
      .populate("sender", "username profilePicture")
      .populate("receiver", "username profilePicture")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  })
);


// ======================================================
// MARK MESSAGE AS READ
// PUT /api/messages/:id/read
// ======================================================

router.put(
  "/:id/read",
  verifyToken,
  asyncHandler(async (req, res) => {

    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    // Only receiver can mark it as read
    if (message.receiver.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the receiver can mark this message as read",
      });
    }

    message.isRead = true;

    await message.save();

    res.status(200).json({
      message: "Message marked as read",
    });
  })
);


// ======================================================
// DELETE MESSAGE
// DELETE /api/messages/:id
// ======================================================

router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {

    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    // Only sender can delete
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You can only delete your own messages",
      });
    }

    await Message.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Message deleted successfully",
    });
  })
);


module.exports = router;
