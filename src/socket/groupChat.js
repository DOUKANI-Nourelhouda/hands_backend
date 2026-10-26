
const mongoose = require("mongoose");
const {User} = require("../models/User");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMsg");

function sameId(a, b) {
  return a != null && b != null && a.toString() === b.toString();
}

function isMember(group, userId) {
  return group.members.some((id) => sameId(id, userId));
}

function hasBlockBetweenUsers(users) {
  const ids = new Set(users.map((user) => user._id.toString()));

  return users.some((user) =>
    (user.blockedUsers || []).some((id) => ids.has(id.toString()))
  );
}

function registerGroupChatHandlers(io, socket) {
  const userId = socket.data.userId;
console.log("[GROUP SOCKET] Handlers registered:", {
  userId,
  socketId: socket.id,
});
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    socket.disconnect(true);
    return;
  }

  // Join a private room for this authenticated account.
  // This room is useful later for group notifications.
  socket.join(`user:${userId}`);

  // JOIN GROUP ROOM
 socket.on("group:join", async ({ groupId } = {}) => {
  try {
    console.log("[GROUP JOIN] Request received:", {
      userId,
      groupId,
      socketId: socket.id,
    });


      const user = await User.findById(userId).select("residence");

      if (!user) {
        socket.emit("group:error", { message: "User not found." });
        return;
      }

      const group = await Group.findOne({
        _id: groupId,
        members: user._id,
        residence: user.residence,
      }).select("_id");

      if (!group) {
        socket.emit("group:error", {
          message: "You do not have access to this group.",
        });
        return;
      }

    // Actually join the Socket.IO room.
await socket.join(`group:${group._id}`);

console.log(
  "[GROUP JOIN] Successfully joined:",
  `group:${group._id}`
);

socket.emit("group:joined", {
  groupId: group._id.toString(),
    });
  } catch (error) {
    console.error("[SOCKET GROUP JOIN]", error);
    socket.emit("group:error", {
      message: "Could not join group chat.",
    });
  }
});

     

  // LEAVE GROUP ROOM
  socket.on("group:leave", async ({ groupId } = {}) => {
    if (!mongoose.Types.ObjectId.isValid(groupId)) return;

    // Leaving the socket room does not remove the database membership.
    await socket.leave(`group:${groupId}`);
  });

  // SEND GROUP MESSAGE
  socket.on("group:message:send", async (payload = {}) => {
    try {
        console.log("[GROUP SEND] Event received:", payload);
    console.log("[GROUP SEND] User:", userId);
    console.log("[GROUP SEND] Socket:", socket.id);
      const { groupId } = payload;
      const text =
        typeof payload.text === "string" ? payload.text.trim() : "";

      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        socket.emit("group:error", {
          message: "Invalid group ID.",
        });
        return;
      }

      if (!text || text.length > 5000) {
        socket.emit("group:error", {
          message: "Message must contain between 1 and 5000 characters.",
        });
        return;
      }

      const sender = await User.findById(userId).select(
        "residence username profilePicture blockedUsers"
      );

      if (!sender) {
        socket.emit("group:error", { message: "User not found." });
        return;
      }

      const group = await Group.findOne({
        _id: groupId,
        members: sender._id,
        residence: sender.residence,
      });

      if (!group) {
        socket.emit("group:error", {
          message: "You are not a member of this group.",
        });
        return;
      }

      const members = await User.find({
        _id: { $in: group.members },
      }).select("_id blockedUsers residence");

      // Recheck current block relationships before sending. If members
      // have blocked one another since group creation, don't use the
      // group to bypass those blocks.
      if (hasBlockBetweenUsers(members)) {
        socket.emit("group:error", {
          message:
            "This group has a block conflict. An admin must resolve its membership before messaging can continue.",
        });
        return;
      }

       const message = await GroupMessage.create({
      group: group._id,
      sender: sender._id,
      text,
    });

    console.log("[GROUP SEND] Message saved:", message._id);

      await Group.updateOne(
        { _id: group._id },
        {
          $set: {
            lastMessage: message._id,
            lastMessageAt: message.createdAt,
          },
        }
      );

      const populatedMessage = await GroupMessage.findById(message._id)
        .populate("sender", "username profilePicture")
        .lean();

      // Only sockets that have been authorized into this group room
      // receive the message.
      console.log("[GROUP SEND] Broadcasting to:", `group:${group._id}`);

    io.to(`group:${group._id}`).emit(
      "group:message:new",
      populatedMessage
    );

    console.log("[GROUP SEND] Broadcast completed");
  } catch (error) {
    console.error("[SOCKET GROUP MESSAGE]", error);
    socket.emit("group:error", {
      message: "Could not send group message.",
    });
  }
});
}

module.exports = registerGroupChatHandlers;
