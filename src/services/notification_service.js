const Notification = require("../models/Notification.js");
const { User } = require("../models/User.js");
const { emitToUser } = require("../sockeet.js");



// CREATE NOTIFICATION
const createNotification = async ({
  recipient,
  sender,
  type,
  post = null,
  comment = null,
  conversation = null,
  message = null,
}) => {

  try {

   
    if (
      recipient.toString() ===
      sender.toString()
    ) {
      return null;
    }


    const users = await User.find({
      _id: {
        $in: [recipient, sender],
      },
    })
      .select("_id blockedUsers")
      .lean();


    const recipientUser = users.find(
      (user) =>
        user._id.toString() ===
        recipient.toString()
    );


    const senderUser = users.find(
      (user) =>
        user._id.toString() ===
        sender.toString()
    );


   
    if (!recipientUser || !senderUser) {
      return null;
    }


   
    const senderBlockedRecipient =
      (senderUser.blockedUsers || []).some(
        (id) =>
          id.toString() ===
          recipient.toString()
      );


    if (senderBlockedRecipient) {

      console.log(
        "Notification skipped: sender blocked recipient"
      );

      return null;
    }


   
    const recipientBlockedSender =
      (recipientUser.blockedUsers || []).some(
        (id) =>
          id.toString() ===
          sender.toString()
      );


    if (recipientBlockedSender) {

      console.log(
        "Notification skipped: recipient blocked sender"
      );

      return null;
    }


  
    const notification =
      await Notification.create({

        recipient,

        sender,

        type,

        post,

        comment,

        conversation,

        message,

        isRead: false,

      });


  
    const populatedNotification =
      await Notification.findById(
        notification._id
      )
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
        .populate(
          "message"
        );


   
    try {

      emitToUser(
        recipient.toString(),
        "notification:new",
        populatedNotification
      );

    } catch (socketError) {

      console.error(
        "Socket notification error:",
        socketError.message
      );

    }


    return populatedNotification;

  } catch (error) {

    console.error(
      "Notification creation error:",
      error.message
    );

  
    return null;
  }
};



const notifyFollow = async ({
  recipient,
  sender,
}) => {

  return createNotification({
    recipient,
    sender,
    type: "follow",
  });
};



const notifyLike = async ({
  recipient,
  sender,
  post,
}) => {

  return createNotification({
    recipient,
    sender,
    type: "like",
    post,
  });
};



const notifyComment = async ({
  recipient,
  sender,
  post,
  comment,
}) => {

  return createNotification({
    recipient,
    sender,
    type: "comment",
    post,
    comment,
  });
};



const notifyMessage = async ({
  recipient,
  sender,
  conversation,
  message,
}) => {

  return createNotification({
    recipient,
    sender,
    type: "message",
    conversation,
    message,
  });
};


module.exports = {
  createNotification,
  notifyFollow,
  notifyLike,
  notifyComment,
  notifyMessage,
};
