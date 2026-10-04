
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { User } = require("../models/User.js");
const Post = require("../models/Post.js");
const { verifyToken } = require("../middlewares/verifyToken");
const { checkBlocked } = require("../middlewares/checkBlocked");


// GET MY PROFILE
router.get(
  "/me",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("residence", "name wilaya");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json(user);
  })
);



// GET USER PROFILE
router.get( "/:userId", verifyToken, asyncHandler(async (req, res) => {

    const user = await User.findById(req.params.userId)
      .select("-password -blockedUsers")
      .populate("residence", "name wilaya");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const currentUser = await User.findById(req.user.id)
      .select("followers following blockedUsers");

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === user._id.toString()
    );

    const isFollowedBy = currentUser.followers.some(
      (id) => id.toString() === user._id.toString()
    );

    const isBlocked = currentUser.blockedUsers.some(
      (id) => id.toString() === user._id.toString()
    );

    res.status(200).json({
      user,
      isFollowing,
      isFollowedBy,
      isBlocked,
      followersCount: user.followers.length,
      followingCount: user.following.length,
    });
  })
);


// UPDATE MY PROFILE
router.put(
  "/me",
  verifyToken,
  asyncHandler(async (req, res) => {

    const {
      username,
      bio,
      profilePicture,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (username !== undefined) {
      user.username = username;
    }

    if (bio !== undefined) {
      user.bio = bio;
    }

    if (profilePicture !== undefined) {
      user.profilePicture = profilePicture;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password -blockedUsers")
      .populate("residence", "name wilaya");

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  })
);

// FOLLOW USER
router.post(
  "/:userId/follow",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        message: "You cannot follow yourself",
      });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const blocked = await checkBlocked(
      currentUserId,
      targetUserId
    );

    if (blocked.blocked) {
      return res.status(403).json({
        message: blocked.reason,
      });
    }

    if (
      currentUser.residence.toString() !==
      targetUser.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only follow users from your residence",
      });
    }

    const alreadyFollowing = currentUser.following.some(
      (id) => id.toString() === targetUserId
    );

    if (alreadyFollowing) {
      return res.status(400).json({
        message: "You are already following this user",
      });
    }

    currentUser.following.push(targetUserId);
    targetUser.followers.push(currentUserId);

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({
      message: "User followed successfully",
    });
  })
);


// UNFOLLOW USER
router.delete(
  "/:userId/follow",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== targetUserId
    );

    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({
      message: "User unfollowed successfully",
    });
  })
);


// ============================================================
// GET FOLLOWERS
// GET /api/users/:userId/followers
// ============================================================

router.get(
  "/:userId/followers",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.params.userId)
      .select("followers")
      .populate(
        "followers",
        "username profilePicture bio residence"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      count: user.followers.length,
      followers: user.followers,
    });
  })
);


// GET FOLLOWING
router.get(
  "/:userId/following",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.params.userId)
      .select("following")
      .populate(
        "following",
        "username profilePicture bio residence"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      count: user.following.length,
      following: user.following,
    });
  })
);



// CHECK FOLLOW STATUS
router.get(
  "/:userId/follow-status",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUser = await User.findById(req.user.id)
      .select("following followers");

    const targetUser = await User.findById(req.params.userId)
      .select("followers following");

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === req.params.userId
    );

    const followsYou = targetUser.following.some(
      (id) => id.toString() === req.user.id
    );

    res.status(200).json({
      isFollowing,
      followsYou,
    });
  })
);

// BLOCK USER

router.post(
  "/:userId/block",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        message: "You cannot block yourself",
      });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const alreadyBlocked = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    if (alreadyBlocked) {
      return res.status(400).json({
        message: "User already blocked",
      });
    }

    // Remove follow relationship
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== targetUserId
    );

    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    // Add to blocked users
    currentUser.blockedUsers.push(targetUserId);

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({
      message: "User blocked successfully",
    });
  })
);



// UNBLOCK USER

router.delete(
  "/:userId/block",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      (id) => id.toString() !== req.params.userId
    );

    await currentUser.save();

    res.status(200).json({
      message: "User unblocked successfully",
    });
  })
);


// GET MY BLOCKED USERS
router.get(
  "/me/blocked",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.user.id)
      .select("blockedUsers")
      .populate(
        "blockedUsers",
        "username profilePicture bio residence"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      count: user.blockedUsers.length,
      blockedUsers: user.blockedUsers,
    });
  })
);


// CHECK BLOCK STATUS
router.get(
  "/:userId/block-status",
  verifyToken,
  asyncHandler(async (req, res) => {

    const currentUser = await User.findById(req.user.id)
      .select("blockedUsers");

    const targetUser = await User.findById(req.params.userId)
      .select("blockedUsers");

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const youBlockedThem = currentUser.blockedUsers.some(
      (id) => id.toString() === req.params.userId
    );

    const theyBlockedYou = targetUser.blockedUsers.some(
      (id) => id.toString() === req.user.id
    );

    res.status(200).json({
      youBlockedThem,
      theyBlockedYou,
    });
  })
);


// GET USER POSTS
router.get(
  "/:userId/posts",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const posts = await Post.find({
      user: req.params.userId,
    })
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: posts.length,
      posts,
    });
  })
);


// SEARCH USERS
router.get(
  "/search",
  verifyToken,
  asyncHandler(async (req, res) => {

    const q = req.query.q;

    if (!q || q.trim() === "") {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const users = await User.find({
      username: {
        $regex: q,
        $options: "i",
      },
    })
      .select(
        "username profilePicture bio residence followers following"
      )
      .populate("residence", "name wilaya")
      .limit(20);

    res.status(200).json(users);
  })
);


module.exports = router;
