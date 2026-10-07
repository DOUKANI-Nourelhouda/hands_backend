
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { User } = require("../models/User.js");
const Post = require("../models/Post.js");
const { verifyToken } = require("../middlewares/verifyToken");
const { notifyFollow } = require("../services/notification_service.js");


const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getPagination = (req) => {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 10;

  if (page < 1) page = 1;
  if (limit < 1) limit = 10;
  if (limit > 30) limit = 30;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

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

    if (q.trim().length > 100) {
      return res.status(400).json({
        message: "Search query must not exceed 100 characters",
      });
    }

    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { page, limit, skip } = getPagination(req);

    const safeSearch = escapeRegex(q.trim());

    // Users who blocked me
    const usersWhoBlockedMe = await User.find({
      blockedUsers: currentUser._id,
    }).select("_id");

    const blockedByIds = usersWhoBlockedMe.map((user) => user._id);

    const excludedIds = [
      ...currentUser.blockedUsers,
      ...blockedByIds,
    ];

    const filter = {
      username: {
        $regex: safeSearch,
        $options: "i",
      },

      residence: currentUser.residence,

      _id: {
        $nin: excludedIds,
      },
    };

    const totalUsers = await User.countDocuments(filter);

    const users = await User.find(filter)
      .select("username profilePicture bio residence followers following")
      .populate("residence", "name wilaya")
      .sort({ username: 1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      page,
      limit,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      hasNextPage: page < Math.ceil(totalUsers / limit),
      hasPreviousPage: page > 1,
      count: users.length,
      users,
    });
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

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const currentUser = await User.findById(currentUserId)
      .select("residence following followers blockedUsers");

    const targetUser = await User.findById(targetUserId)
      .select("residence following followers blockedUsers");

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
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

    // Block check
    const youBlockedThem = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    const theyBlockedYou = targetUser.blockedUsers.some(
      (id) => id.toString() === currentUserId
    );

    if (youBlockedThem || theyBlockedYou) {
      return res.status(403).json({
        message: "You cannot follow this user",
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

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      await User.findByIdAndUpdate(
        currentUserId,
        {
          $addToSet: {
            following: targetUserId,
          },
        },
        { session }
      );

      await User.findByIdAndUpdate(
        targetUserId,
        {
          $addToSet: {
            followers: currentUserId,
          },
        },
        { session }
      );
await notifyFollow({
  recipient: userId,
  sender: req.user.id,
});
      await session.commitTransaction();

      res.status(200).json({
        message: "User followed successfully",
        isFollowing: true,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  })
);


// UNFOLLOW USER
router.delete(
  "/:userId/follow",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const currentUser = await User.findById(currentUserId);

    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      await User.findByIdAndUpdate(
        currentUserId,
        {
          $pull: {
            following: targetUserId,
          },
        },
        { session }
      );

      await User.findByIdAndUpdate(
        targetUserId,
        {
          $pull: {
            followers: currentUserId,
          },
        },
        { session }
      );

      await session.commitTransaction();

      res.status(200).json({
        message: "User unfollowed successfully",
        isFollowing: false,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  })
);


// GET FOLLOWERS
router.get(
  "/:userId/followers",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    const user = await User.findById(req.params.userId)
      .select("followers residence blockedUsers");

    if (!currentUser || !user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (
      currentUser.residence.toString() !==
      user.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only view users from your residence",
      });
    }

    // Profile owner blocked the current user
    const ownerBlockedViewer = user.blockedUsers.some(
      (id) => id.toString() === currentUser._id.toString()
    );

    // Current user blocked the profile owner
    const viewerBlockedOwner = currentUser.blockedUsers.some(
      (id) => id.toString() === user._id.toString()
    );

    if (ownerBlockedViewer || viewerBlockedOwner) {
      return res.status(403).json({
        message: "You cannot view this list",
      });
    }

    const usersWhoBlockedMe = await User.find({
      blockedUsers: currentUser._id,
    }).select("_id");

    const blockedByIds = usersWhoBlockedMe.map((u) => u._id);

    const excludedIds = [
      ...currentUser.blockedUsers,
      ...blockedByIds,
      ...user.blockedUsers,
    ];

    const followers = await User.find({
      _id: {
        $in: user.followers,
        $nin: excludedIds,
      },
      residence: currentUser.residence,
    })
      .select("username profilePicture bio residence")
      .populate("residence", "name wilaya");

    res.status(200).json({
      count: followers.length,
      followers,
    });
  })
);

// GET FOLLOWING
router.get(
  "/:userId/following",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    const user = await User.findById(req.params.userId)
      .select("following residence blockedUsers");

    if (!currentUser || !user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (
      currentUser.residence.toString() !==
      user.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only view users from your residence",
      });
    }

    const ownerBlockedViewer = user.blockedUsers.some(
      (id) => id.toString() === currentUser._id.toString()
    );

    const viewerBlockedOwner = currentUser.blockedUsers.some(
      (id) => id.toString() === user._id.toString()
    );

    if (ownerBlockedViewer || viewerBlockedOwner) {
      return res.status(403).json({
        message: "You cannot view this list",
      });
    }

    const usersWhoBlockedMe = await User.find({
      blockedUsers: currentUser._id,
    }).select("_id");

    const blockedByIds = usersWhoBlockedMe.map((u) => u._id);

    const excludedIds = [
      ...currentUser.blockedUsers,
      ...blockedByIds,
      ...user.blockedUsers,
    ];

    const following = await User.find({
      _id: {
        $in: user.following,
        $nin: excludedIds,
      },
      residence: currentUser.residence,
    })
      .select("username profilePicture bio residence")
      .populate("residence", "name wilaya");

    res.status(200).json({
      count: following.length,
      following,
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

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        message: "Invalid user ID",
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

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Add target to my blocked list
      await User.findByIdAndUpdate(
        currentUserId,
        {
          $addToSet: {
            blockedUsers: targetUserId,
          },

          // Remove target from my following/followers
          $pull: {
            following: targetUserId,
            followers: targetUserId,
          },
        },
        { session }
      );

      // Remove me from target's following/followers
      await User.findByIdAndUpdate(
        targetUserId,
        {
          $pull: {
            following: currentUserId,
            followers: currentUserId,
          },
        },
        { session }
      );

      await session.commitTransaction();

      res.status(200).json({
        message: "User blocked successfully",
        isBlocked: true,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  })
);


// UNBLOCK USER
router.delete(
  "/:userId/block",
  verifyToken,
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (req.user.id === targetUserId) {
      return res.status(400).json({
        message: "You cannot unblock yourself",
      });
    }

    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        message: "Target user not found",
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $pull: {
        blockedUsers: targetUserId,
      },
    });

    res.status(200).json({
      message: "User unblocked successfully",
      isBlocked: false,
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
  "/:userId/follow-status",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id)
      .select("following followers blockedUsers");

    const targetUser = await User.findById(req.params.userId)
      .select("followers following blockedUsers");

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const targetId = req.params.userId;
    const currentId = req.user.id;

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === targetId
    );

    const followsYou = targetUser.following.some(
      (id) => id.toString() === currentId
    );

    const youBlockedThem = currentUser.blockedUsers.some(
      (id) => id.toString() === targetId
    );

    const theyBlockedYou = targetUser.blockedUsers.some(
      (id) => id.toString() === currentId
    );

    res.status(200).json({
      isFollowing,
      followsYou,
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
    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    const targetUser = await User.findById(req.params.userId)
      .select("residence blockedUsers");

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (
      currentUser.residence.toString() !==
      targetUser.residence.toString()
    ) {
      return res.status(403).json({
        message: "You can only view posts from your residence",
      });
    }

    const youBlockedThem = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUser._id.toString()
    );

    const theyBlockedYou = targetUser.blockedUsers.some(
      (id) => id.toString() === currentUser._id.toString()
    );

    if (youBlockedThem || theyBlockedYou) {
      return res.status(403).json({
        message: "You cannot view these posts",
      });
    }

    const { page, limit, skip } = getPagination(req);

    const filter = {
      user: targetUser._id,
      residence: currentUser.residence,
    };

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      page,
      limit,
      totalPosts,
      totalPages: Math.ceil(totalPosts / limit),
      hasNextPage: page < Math.ceil(totalPosts / limit),
      hasPreviousPage: page > 1,
      count: posts.length,
      posts,
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

    if (!currentUser || !targetUser) {
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

module.exports = router;
