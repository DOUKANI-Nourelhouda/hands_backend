const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const Post = require("../models/Post");
const asyncHandler = require("express-async-handler");
const {verifyToken} = require("../middlewares/verifyToken");
const mongoose = require("mongoose");
const {User }= require("../models/User");




// REPORT A POST
router.post(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { reason, details = "" } = req.body;
    const postId = req.params.id;
    const userId = req.user.id;

    const allowedReasons = [
      "inappropriate",
      "scam",
      "spam",
      "harassment",
      "prohibited",
      "other",
    ];

    if (!reason || !allowedReasons.includes(reason)) {
      return res.status(400).json({
        message: "Please select a valid report reason.",
      });
    }

    if (typeof details !== "string" || details.length > 1000) {
      return res.status(400).json({
        message: "Details must be 1000 characters or fewer.",
      });
    }

    if (
      !require("mongoose").isValidObjectId(postId) ||
      !require("mongoose").isValidObjectId(userId)
    ) {
      return res.status(400).json({
        message: "Invalid post or user ID.",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        message: "Post not found.",
      });
    }

    // Users cannot report their own posts.
    if (post.user.toString() === userId.toString()) {
      return res.status(400).json({
        message: "You cannot report your own post.",
      });
    }

    try {
      const report = await Report.create({
        post: post._id,
        reporter: userId,
        reason,
        details: details.trim(),
      });

      return res.status(201).json({
        message: "Report submitted successfully.",
        reportId: report._id,
      });
    } catch (error) {
      // The unique index prevents duplicate reports.
      if (error.code === 11000) {
        return res.status(409).json({
          message: "You have already reported this post.",
        });
      }

      throw error;
    }
  })
);


// Report a user
router.post(
  "/user/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const reportedUserId = req.params.id;
    const reporterId = req.user.id;

    const { reason, details = "" } = req.body;

    const allowedReasons = [
      "inappropriate",
      "scam",
      "spam",
      "harassment",
      "prohibited",
      "impersonation",
      "other",
    ];

    // Validate IDs.
    if (
      !mongoose.isValidObjectId(reportedUserId) ||
      !mongoose.isValidObjectId(reporterId)
    ) {
      return res.status(400).json({
        message: "Invalid user ID.",
      });
    }

    // Validate reason.
    if (!reason || !allowedReasons.includes(reason)) {
      return res.status(400).json({
        message: "Please select a valid report reason.",
      });
    }

    // Validate details.
    if (typeof details !== "string" || details.length > 1000) {
      return res.status(400).json({
        message: "Details must be 1000 characters or fewer.",
      });
    }

    // Users cannot report themselves.
    if (reportedUserId === reporterId.toString()) {
      return res.status(400).json({
        message: "You cannot report your own account.",
      });
    }

    // Make sure the reported account exists.
    const reportedUser = await User.findById(reportedUserId).select("_id");

    if (!reportedUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    try {
      const report = await Report.create({
        reportedUser: reportedUser._id,
        reporter: reporterId,
        reason,
        details: details.trim(),
      });

      return res.status(201).json({
        message: "User report submitted successfully.",
        reportId: report._id,
      });
    } catch (error) {
      // The unique index prevents duplicate reports.
      if (error.code === 11000) {
        return res.status(409).json({
          message: "You have already reported this user.",
        });
      }

      throw error;
    }
  })
);
module.exports = router;