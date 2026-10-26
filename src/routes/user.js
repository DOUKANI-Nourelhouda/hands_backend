
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { User } = require("../models/User.js");
const Post = require("../models/Post.js");
const { verifyToken } = require("../middlewares/verifyToken");
const { notifyFollow } = require("../services/notification_service.js");
const mongoose = require("mongoose");
const Residence = require("../models/Residence");

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


// S
/* =========================
   SEARCH USERS
========================= */
router.get(
  "/search",
  verifyToken,
  asyncHandler(async (req, res) => {
  

    try {
      const q = req.query.q;

      // 1. Validate query
      if (!q || typeof q !== "string" || q.trim() === "") {
      

        return res.status(400).json({
          message: "Search query is required",
        });
      }

      if (q.trim().length > 100) {
      

        return res.status(400).json({
          message: "Search query must not exceed 100 characters",
        });
      }

      const trimmedQuery = q.trim();


      const currentUser = await User.findById(req.user.id)
        .select("residence blockedUsers");

      if (!currentUser) {
      

        return res.status(404).json({
          message: "User not found",
        });
      }

     

      // 3. Pagination
      const { page, limit, skip } = getPagination(req);

      console.log("[USER SEARCH] Pagination:", {
        page,
        limit,
        skip,
      });

      // 4. Prepare search regex
      const safeSearch = escapeRegex(trimmedQuery);

      console.log("[USER SEARCH] Escaped search regex:", safeSearch);

      // 5. Find users who blocked the current user
      console.log("[USER SEARCH] Finding users who blocked current user...");

      const usersWhoBlockedMe = await User.find({
        blockedUsers: currentUser._id,
      }).select("_id");

      const blockedByIds = usersWhoBlockedMe.map((user) => user._id);

      console.log(
        "[USER SEARCH] Users who blocked current user:",
        blockedByIds.map((id) => id.toString())
      );

      // 6. Exclude blocked users
      const excludedIds = [
        ...(currentUser.blockedUsers || []),
        ...blockedByIds,
      ];

      console.log(
        "[USER SEARCH] Excluded user IDs:",
        excludedIds.map((id) => id.toString())
      );

      // 7. Build MongoDB filter
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

      console.log("[USER SEARCH] MongoDB filter:");
      console.dir(filter, { depth: null });

      // 8. Count matching users
      console.log("[USER SEARCH] Counting matching users...");

      const totalUsers = await User.countDocuments(filter);

      console.log("[USER SEARCH] Total matching users:", totalUsers);

      // 9. Fetch matching users
      console.log("[USER SEARCH] Fetching matching users from MongoDB...");

      const users = await User.find(filter)
        .select("username profilePicture bio residence followers following")
        .populate("residence", "name wilaya")
        .sort({ username: 1 })
        .skip(skip)
        .limit(limit);

      console.log("[USER SEARCH] Returned users count:", users.length);

      console.log(
        "[USER SEARCH] Returned users:",
        users.map((user) => ({
          id: user._id.toString(),
          username: user.username,
          residence: user.residence?.name ?? null,
        }))
      );

      // 10. Send response
      const totalPages = Math.ceil(totalUsers / limit);

      const responseData = {
        page,
        limit,
        totalUsers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        count: users.length,
        users,
      };

      console.log("[USER SEARCH] Response summary:", {
        status: 200,
        count: responseData.count,
        totalUsers: responseData.totalUsers,
        totalPages: responseData.totalPages,
      });

      console.log("========== SEARCH USERS SUCCESS ==========\n");

      return res.status(200).json(responseData);
    } catch (error) {
      console.error("[USER SEARCH] DATABASE/ROUTE ERROR:", error);
      console.error("[USER SEARCH] Error message:", error.message);
      console.error("[USER SEARCH] Stack:", error.stack);

      throw error;
    }
  })
);


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
    const { username, bio, profilePicture, residence } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Username
    if (username !== undefined) {
      if (typeof username !== "string" || !username.trim()) {
        return res.status(400).json({
          message: "Username cannot be empty",
        });
      }

      if (username.trim().length > 30) {
        return res.status(400).json({
          message: "Username cannot exceed 30 characters",
        });
      }

      user.username = username.trim();
    }

    // Bio
    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.length > 300) {
        return res.status(400).json({
          message: "Bio must be at most 300 characters",
        });
      }

      user.bio = bio.trim();
    }

    // Profile picture URL
    if (profilePicture !== undefined) {
      if (typeof profilePicture !== "string") {
        return res.status(400).json({
          message: "Profile picture must be a URL string",
        });
      }

      user.profilePicture = profilePicture.trim();
    }

    // Residence and Wilaya
    if (residence !== undefined) {
      if (!mongoose.isValidObjectId(residence)) {
        return res.status(400).json({
          message: "Invalid residence ID",
        });
      }

      const selectedResidence = await Residence.findOne({
        _id: residence,
        active: true,
      });

      if (!selectedResidence) {
        return res.status(400).json({
          message: "Residence not found or inactive",
        });
      }

      user.residence = selectedResidence._id;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password -blockedUsers")
      .populate("residence", "name wilaya");

    return res.status(200).json({
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
  recipient: targetUserId,
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
// BLOCK USER
router.post(
  "/:userId/block",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    // Prevent blocking yourself
    if (currentUserId === targetUserId) {
      return res.status(400).json({
        message: "You cannot block yourself",
      });
    }

    // Validate target user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // Find both users
    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check if already blocked
    const blockedUsers = currentUser.blockedUsers ?? [];

    const alreadyBlocked = blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    if (alreadyBlocked) {
      return res.status(400).json({
        message: "User already blocked",
      });
    }

    // Start transaction
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Add target user to blocked list and remove follow relationships
     
      await User.findByIdAndUpdate(
        currentUserId,
        {
          $addToSet: {
            blockedUsers: new mongoose.Types.ObjectId(targetUserId),
          },
          $pull: {
            following: targetUserId,
            followers: targetUserId,
          },
        },
        { session, new: true }
      );

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

      // Verify the committed data using a fresh database query.
      const savedUser = await User.findById(currentUserId)
        .select("username blockedUsers")
        .lean();

      console.log("[BLOCK] Current user:", savedUser?.username);
      console.log(
        "[BLOCK] Saved blocked IDs:",
        savedUser?.blockedUsers?.map((id) => id.toString())
      );
      console.log("[BLOCK] Target ID:", targetUserId);

      return res.status(200).json({
        message: "User blocked successfully",
        isBlocked: true,
      });

    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      throw error;
    } finally {
      await session.endSession();
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



router.delete(
  "/me/followers/:followerId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { followerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(followerId)) {
      return res.status(400).json({
        message: "Invalid follower ID",
      });
    }

    if (currentUserId === followerId) {
      return res.status(400).json({
        message: "You cannot remove yourself as a follower",
      });
    }

    const [currentUser, follower] = await Promise.all([
      User.findById(currentUserId).select("followers"),
      User.findById(followerId).select("following"),
    ]);

    if (!currentUser || !follower) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isFollower = currentUser.followers.some(
      (id) => id.toString() === followerId
    );

    if (!isFollower) {
      return res.status(400).json({
        message: "This user is not following you",
      });
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      await User.findByIdAndUpdate(
        currentUserId,
        {
          $pull: { followers: followerId },
        },
        { session }
      );

      await User.findByIdAndUpdate(
        followerId,
        {
          $pull: { following: currentUserId },
        },
        { session }
      );

      await session.commitTransaction();

      return res.status(200).json({
        message: "Follower removed successfully",
        removedUserId: followerId,
      });
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      throw error;
    } finally {
      await session.endSession();
    }
  })
);

module.exports = router;
