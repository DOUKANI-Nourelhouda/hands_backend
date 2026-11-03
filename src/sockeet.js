
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const registerGroupChatHandlers =
  require("./socket/groupChat.js");
let io;


/**
 * Initialize Socket.IO
 */
const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.token;

      if (!token) {
        return next(
          new Error("Authentication token required")
        );
      }


      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );


      if (!decoded || !decoded.id) {
        return next(
          new Error("Invalid authentication token")
        );
      }


      
      socket.userId = decoded.id;


      next();

    } catch (error) {
      console.error(
        "Socket authentication error:",
        error.message
      );

      next(
        new Error("Invalid or expired token")
      );
    }
  });

  io.on("connection", (socket) => {
  

  // Keep the authenticated user's ID consistent.
  socket.data.userId = socket.userId;

  // Join the private user room.
  const userRoom = `user:${socket.userId}`;
  socket.join(userRoom);

 

  // Register group chat events for this socket.
  registerGroupChatHandlers(io, socket);

  socket.on("disconnect", (reason) => {
   
  });

  
});


 return io;
}

const getIO = () => {

  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized"
    );
  }

  return io;
};

const emitToUser = (userId, event, data) => {

  const socketIO = getIO();

  socketIO
    .to(`user:${userId}`)
    .emit(event, data);
};


module.exports = {
  initializeSocket,
  getIO,
  emitToUser,
};
