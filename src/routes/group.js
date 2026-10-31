const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const {verifyToken} = require("../middlewares/verifyToken");
const {User }= require("../models/User");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMsg");


// GET the authenticated user and their residence.
async function getCurrentUser(userId) {
  return User.findById(userId).select("residence blockedUsers username");
}

function sameId(a, b) {
  return a != null && b != null && a.toString() === b.toString();
}

function isGroupMember(group, userId) {
  return group.members.some((id) => sameId(id, userId));
}

function isGroupAdmin(group, userId) {
  return group.admins.some((id) => sameId(id, userId));
}

// Reject group membership combinations that would bypass a block.
function hasBlockBetweenUsers(users) {
  const ids = new Set(users.map((user) => user._id.toString()));

  return users.some((user) =>
    (user.blockedUsers || []).some((blockedId) =>
      ids.has(blockedId.toString())
    )
  );
}

// CREATE GROUP
router.post("/", verifyToken, async (req, res) => {
  try {
    const name = typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

    const requestedIds = req.body.memberIds ?? [];

    if (!name || name.length < 2 || name.length > 60) {
      return res.status(400).json({
        message: "Group name must contain between 2 and 60 characters.",
      });
    }

    if (
      !Array.isArray(requestedIds) ||
      requestedIds.length > 99 ||
      requestedIds.some(
        (id) => typeof id !== "string" ||
          !mongoose.Types.ObjectId.isValid(id)
      )
    ) {
      return res.status(400).json({
        message: "Invalid group member list.",
      });
    }

    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!currentUser.residence) {
      return res.status(400).json({
        message: "Your account has no residence assigned.",
      });
    }

    // The creator is automatically a member and admin.
    const memberIds = [
      ...new Set([req.user.id, ...requestedIds].map(String)),
    ].map((id) => new mongoose.Types.ObjectId(id));

   const uniqueMemberIds = [
  ...new Set(memberIds.map((id) => id.toString())),
];

if (uniqueMemberIds.length < 3) {
  return res.status(400).json({
    message: "A group must have at least 3 members.",
  });
}
    const users = await User.find({
      _id: { $in: memberIds },
    }).select("_id residence blockedUsers username");

    if (users.length !== memberIds.length) {
      return res.status(400).json({
        message: "One or more selected students do not exist.",
      });
    }

    const wrongResidence = users.some(
      (user) => !sameId(user.residence, currentUser.residence)
    );

    if (wrongResidence) {
      return res.status(403).json({
        message: "All group members must belong to your residence.",
      });
    }

    if (hasBlockBetweenUsers(users)) {
      return res.status(400).json({
        message:
          "This group includes students who have blocked one another. Remove them from the selection.",
      });
    }

    const group = await Group.create({
      name,
      residence: currentUser.residence,
      createdBy: currentUser._id,
      members: memberIds,
      admins: [currentUser._id],
    });

    const populatedGroup = await Group.findById(group._id)
      .populate("members", "username profilePicture")
      .populate("admins", "username profilePicture")
      .populate("createdBy", "username profilePicture");

    return res.status(201).json({
      message: "Group created successfully.",
      group: populatedGroup,
    });
  } catch (error) {
    console.error("[GROUP CREATE]", error);

    return res.status(500).json({
      message: "Could not create group.",
    });
  }
});
// GET MY GROUPS
router.get("/", verifyToken, async (req, res) => {
  try {
    // Get the current user using the ID from your auth middleware.
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    // Use the actual ID of the user we found.
    const userId = currentUser._id;

    console.log("[GROUP LIST] Current user ID:", userId.toString());

    const groups = await Group.find({
      members: userId,
    })
      .populate("members", "username profilePicture")
      .populate("admins", "username profilePicture")
      .populate("createdBy", "username profilePicture")
      .sort({ updatedAt: -1 });

    console.log("[GROUP LIST] Groups found:", groups.length);
    console.log(
      "[GROUP LIST] Group names:",
      groups.map((group) => group.name)
    );

    return res.status(200).json(groups);
  } catch (error) {
    console.error("[GROUP LIST] Error:", error);

    return res.status(500).json({
      message: "Could not load groups.",
    });
  }
});
// GET GROUP MESSAGE HISTORY
router.get("/:groupId/messages", verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID." });
    }

    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const group = await Group.findOne({
      _id: groupId,
      members: currentUser._id,
      residence: currentUser.residence,
    });

    if (!group) {
      return res.status(403).json({
        message: "You do not have access to this group.",
      });
    }
if (group.members.length < 3) {
  return res.status(403).json({
    message: "This group needs at least 3 members to open its chat.",
  });
}
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      100
    );

    const before = req.query.before;
    const filter = { group: group._id };

    if (before) {
      const beforeDate = new Date(before);

      if (Number.isNaN(beforeDate.getTime())) {
        return res.status(400).json({
          message: "Invalid before timestamp.",
        });
      }

      filter.createdAt = { $lt: beforeDate };
    }

    // Fetch newest first, then reverse so messages are chronological.
    const fetchedMessages = await GroupMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username profilePicture")
      .lean();

    return res.json({
      messages: fetchedMessages.reverse(),
      hasMore: fetchedMessages.length === limit,
    });
  } catch (error) {
    console.error("[GROUP MESSAGES]", error);

    return res.status(500).json({
      message: "Could not load group messages.",
    });
  }
});

// ADD MEMBERS — only a group admin can do this.
router.post("/:groupId/members", verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const memberIds = req.body.memberIds;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID." });
    }

    if (
      !Array.isArray(memberIds) ||
      memberIds.length === 0 ||
      memberIds.length > 99 ||
      memberIds.some(
        (id) => typeof id !== "string" ||
          !mongoose.Types.ObjectId.isValid(id)
      )
    ) {
      return res.status(400).json({
        message: "Provide a valid list of members.",
      });
    }

    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const group = await Group.findOne({
      _id: groupId,
      residence: currentUser.residence,
    });

    if (!group || !isGroupMember(group, currentUser._id)) {
      return res.status(404).json({ message: "Group not found." });
    }
if (!sameId(group.createdBy, currentUser._id)) {
  return res.status(403).json({
    message: "Only the group creator can add members.",
  });
}

    const uniqueIds = [...new Set(memberIds.map(String))];

    const users = await User.find({
      _id: { $in: uniqueIds },
    }).select("_id residence blockedUsers username");

    if (users.length !== uniqueIds.length) {
      return res.status(400).json({
        message: "One or more selected students do not exist.",
      });
    }

    if (
      users.some(
        (user) => !sameId(user.residence, currentUser.residence)
      )
    ) {
      return res.status(403).json({
        message: "All members must belong to your residence.",
      });
    }

    const existingIds = new Set(
      group.members.map((id) => id.toString())
    );
    const newUsers = users.filter(
      (user) => !existingIds.has(user._id.toString())
    );
if (group.members.length < 3) {
  return res.status(400).json({
    message: "This group must have at least 3 members.",
  });
}
    if (newUsers.length === 0) {
      return res.status(400).json({
        message: "All selected students are already members.",
      });
    }

    // Check block relationships across existing and proposed members.
    const existingUsers = await User.find({
      _id: { $in: group.members },
    }).select("_id residence blockedUsers username");

    if (hasBlockBetweenUsers([...existingUsers, ...newUsers])) {
      return res.status(400).json({
        message:
          "A block exists between students in this group. Review the member selection.",
      });
    }

    await Group.updateOne(
      { _id: group._id },
      { $addToSet: { members: { $each: newUsers.map((u) => u._id) } } }
    );

    const updatedGroup = await Group.findById(group._id)
      .populate("members", "username profilePicture")
      .populate("admins", "username profilePicture");

    return res.json({
      message: "Members added successfully.",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("[GROUP ADD MEMBERS]", error);

    return res.status(500).json({
      message: "Could not add group members.",
    });
  }
});

router.delete('/:groupId/leave', verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Use the same user ID property as your other routes.
    const userId = req.user?.id;

    console.log('[LEAVE GROUP] Authenticated user ID:', userId);
    console.log('[LEAVE GROUP] Group ID:', groupId);

    if (!userId) {
      return res.status(401).json({
        message: 'User authentication failed.',
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        message: 'Group not found.',
      });
    }

    // Compare MongoDB IDs as strings.
    const userIdString = userId.toString();

    const isMember = group.members.some((member) => {
      const memberId = member?._id
        ? member._id.toString()
        : member?.toString();

      return memberId === userIdString;
    });

    console.log('[LEAVE GROUP] Is member:', isMember);

    if (!isMember) {
      return res.status(400).json({
        message: 'You are not a member of this group.',
      });
    }

    // Remove the user from the members list.
    group.members = group.members.filter((member) => {
      const memberId = member?._id
        ? member._id.toString()
        : member?.toString();

      return memberId !== userIdString;
    });

    // Also remove the user from the admins list if applicable.
    group.admins = group.admins.filter((admin) => {
      const adminId = admin?._id
        ? admin._id.toString()
        : admin?.toString();

      return adminId !== userIdString;
    });

    await group.save();

    console.log('[LEAVE GROUP] Successfully left group:', groupId);

    return res.status(200).json({
      message: 'You left the group successfully.',
    });
  } catch (error) {
    console.error('[LEAVE GROUP ERROR]', error);

    return res.status(500).json({
      message: 'Server error while leaving the group.',
    });
  }
});

// REMOVE MEMBER — only the group creator can do this.
router.delete("/:groupId/members/:memberId", verifyToken, async (req, res) => {
  try {
    const { groupId, memberId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(groupId) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    ) {
      return res.status(400).json({
        message: "Invalid group or member ID.",
      });
    }

    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const group = await Group.findOne({
      _id: groupId,
      residence: currentUser.residence,
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!sameId(group.createdBy, currentUser._id)) {
      return res.status(403).json({
        message: "Only the group creator can remove members.",
      });
    }

    if (sameId(memberId, group.createdBy)) {
      return res.status(400).json({
        message: "The group creator cannot be removed.",
      });
    }

    if (!isGroupMember(group, memberId)) {
      return res.status(404).json({
        message: "This student is not a member of the group.",
      });
    }

    if (group.members.length <= 3) {
      return res.status(400).json({
        message: "A group must have at least 3 members.",
      });
    }

    group.members = group.members.filter(
      (id) => !sameId(id, memberId)
    );

    group.admins = group.admins.filter(
      (id) => !sameId(id, memberId)
    );

    await group.save();

    const updatedGroup = await Group.findById(group._id)
      .populate("members", "username profilePicture")
      .populate("admins", "username profilePicture")
      .populate("createdBy", "username profilePicture");

    return res.json({
      message: "Member removed successfully.",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("[GROUP REMOVE MEMBER]", error);

    return res.status(500).json({
      message: "Could not remove group member.",
    });
  }
});

// GET GROUP DETAILS
router.get("/:groupId", verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID." });
    }

    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const group = await Group.findOne({
      _id: groupId,
      members: currentUser._id,
      residence: currentUser.residence,
    })
      .populate("members", "username profilePicture")
      .populate("createdBy", "username profilePicture");

    if (!group) {
      return res.status(404).json({
        message: "Group not found.",
      });
    }

    return res.json({ group });
  } catch (error) {
    console.error("[GROUP DETAILS]", error);

    return res.status(500).json({
      message: "Could not load group details.",
    });
  }
});

module.exports = router;
