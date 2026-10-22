const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Notification = require("../models/Notification.js");
const { User } = require("../models/User.js");
const { verifyToken } = require("../middlewares/verifyToken.js");



//  GET USERS WHO BLOCKED ME
const getBlockedUserIds = async (userId) => {
  const user = await User.findById(userId)
    .select("blockedUsers")
    .lean();

  if (!user) {
    return null;
  }

  const usersWhoBlockedMe = await User.find({
    blockedUsers: userId,
  })
    .select("_id")
    .lean();

  const blockedByIds = usersWhoBlockedMe.map(
    (user) => user._id
  );

  return [
    ...(user.blockedUsers || []),
    ...blockedByIds,
  ];
};



// GET MY NOTIFICATIONS

router.get(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.user.id)
      .select("blockedUsers")
      .lean();

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;

    if (page < 1) page = 1;
    if (limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const skip = (page - 1) * limit;


    // Users I blocked
    const blockedByMe = user.blockedUsers || [];


    // Users who blocked me
    const usersWhoBlockedMe = await User.find({
      blockedUsers: req.user.id,
    })
      .select("_id")
      .lean();

    const blockedByOthers = usersWhoBlockedMe.map(
      (user) => user._id
    );


    // Combine both directions
    const excludedSenders = [
      ...blockedByMe,
      ...blockedByOthers,
    ];


    const filter = {
      recipient: req.user.id,

      sender: {
        $nin: excludedSenders,
      },
    };


    // Total notifications
    const totalNotifications =
      await Notification.countDocuments(filter);


    // Unread notifications
    const unreadCount =
      await Notification.countDocuments({
        ...filter,
        isRead: false,
      });


    // Get notifications
    const notifications =
      await Notification.find(filter)
        .populate(
          "sender",
          "username profilePicture"
        )
        .populate(
          "post",
          "caption picture"
        )
        .populate(
          "comment",
          "text"
        )
        .populate(
          "conversation"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean();


    const totalPages =
      Math.ceil(totalNotifications / limit);


    res.status(200).json({
      page,
      limit,

      count: notifications.length,

      totalNotifications,
      totalPages,

      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,

      unreadCount,

      notifications,
    });
  })
);



// GET UNREAD NOTIFICATION COUNT


router.get(
  "/unread-count",
  verifyToken,
  asyncHandler(async (req, res) => {

    const excludedSenders =
      await getBlockedUserIds(req.user.id);

    if (!excludedSenders) {
      return res.status(404).json({
        message: "User not found",
      });
    }


    const unreadCount =
      await Notification.countDocuments({
        recipient: req.user.id,

        sender: {
          $nin: excludedSenders,
        },

        isRead: false,
      });


    res.status(200).json({
      unreadCount,
    });
  })
);


// ============================================================
// MARK ONE NOTIFICATION AS READ
// ============================================================

router.put(
  "/:notificationId/read",
  verifyToken,
  asyncHandler(async (req, res) => {

    const { notificationId } = req.params;


    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }


    const notification =
      await Notification.findOneAndUpdate(
        {
          _id: notificationId,

          // Important:
          // User can only modify THEIR notification
          recipient: req.user.id,
        },

        {
          $set: {
            isRead: true,
          },
        },

        { returnDocument: 'after' }
      );


    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }


    res.status(200).json({
      message: "Notification marked as read",

      notification,
    });
  })
);


// ============================================================
// MARK ALL NOTIFICATIONS AS READ
// ============================================================

router.put(
  "/read-all",
  verifyToken,
  asyncHandler(async (req, res) => {

    const result =
      await Notification.updateMany(
        {
          recipient: req.user.id,

          isRead: false,
        },

        {
          $set: {
            isRead: true,
          },
        }
      );


    res.status(200).json({
      message: "All notifications marked as read",

      modifiedCount:
        result.modifiedCount,
    });
  })
);


// ============================================================
// MARK SELECTED NOTIFICATIONS AS READ
// ============================================================

router.put(
  "/read-many",
  verifyToken,
  asyncHandler(async (req, res) => {

    const { notificationIds } = req.body;


    if (!Array.isArray(notificationIds)) {
      return res.status(400).json({
        message:
          "notificationIds must be an array",
      });
    }


    if (notificationIds.length === 0) {
      return res.status(400).json({
        message:
          "notificationIds cannot be empty",
      });
    }


    const invalidIds =
      notificationIds.some(
        (id) =>
          !mongoose.Types.ObjectId.isValid(id)
      );


    if (invalidIds) {
      return res.status(400).json({
        message:
          "One or more notification IDs are invalid",
      });
    }


    const result =
      await Notification.updateMany(
        {
          _id: {
            $in: notificationIds,
          },

          // Security:
          // Only mark YOUR notifications
          recipient: req.user.id,

          isRead: false,
        },

        {
          $set: {
            isRead: true,
          },
        }
      );


    res.status(200).json({
      message:
        "Selected notifications marked as read",

      modifiedCount:
        result.modifiedCount,
    });
  })
);


// ============================================================
// DELETE ONE NOTIFICATION
// ============================================================

router.delete(
  "/:notificationId",
  verifyToken,
  asyncHandler(async (req, res) => {

    const { notificationId } = req.params;


    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }


    const notification =
      await Notification.findOneAndDelete({
        _id: notificationId,

        // Security:
        // User can only delete THEIR notification
        recipient: req.user.id,
      });


    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }


    res.status(200).json({
      message:
        "Notification deleted successfully",
    });
  })
);


// ============================================================
// DELETE ALL MY NOTIFICATIONS
// ============================================================

router.delete(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {

    const result =
      await Notification.deleteMany({
        recipient: req.user.id,
      });


    res.status(200).json({
      message:
        "All notifications deleted successfully",

      deletedCount:
        result.deletedCount,
    });
  })
);


module.exports = router;
