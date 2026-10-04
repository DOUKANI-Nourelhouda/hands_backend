const { User } = require("../models/User.js");

async function checkBlocked(userId1, userId2) {
  const user1 = await User.findById(userId1).select("blockedUsers");
  const user2 = await User.findById(userId2).select("blockedUsers");

  if (!user1 || !user2) {
    return {
      blocked: true,
      reason: "User not found",
    };
  }

  const user1BlockedUser2 = user1.blockedUsers.some(
    (id) => id.toString() === userId2.toString()
  );

  const user2BlockedUser1 = user2.blockedUsers.some(
    (id) => id.toString() === userId1.toString()
  );

  if (user1BlockedUser2 || user2BlockedUser1) {
    return {
      blocked: true,
      reason: "You cannot interact with this user",
    };
  }

  return {
    blocked: false,
  };
}

module.exports = {
  checkBlocked,
};