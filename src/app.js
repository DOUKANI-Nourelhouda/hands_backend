const dns = require("dns");

dns.setServers([
  "8.8.8.8",
  "1.1.1.1"
]);

const express = require ('express'); 
const dotenv = require('dotenv');
const logger = require('./middlewares/logger');
dotenv.config();
console.log("MONGO_URI exists:", !!process.env.MONGO_URI);
console.log("MONGO_URI starts with:", process.env.MONGO_URI?.substring(0, 15));
const http = require("http");
const { initializeSocket } = require("./sockeet.js");
const connectDB = require('./config/db.js');
const helmet = require("helmet");
const cors = require("cors");
connectDB();
 
const app = express();

app.use(
  "/api/payments/webhook",
  express.raw({
    type: "application/json",
  })
);
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Hands backend is running",
  });
});
app.use(express.json());

app.use(logger);
// helmet make the back more secure
app.use(helmet());
// only this domain can use the routes but if u dont want to select just put *
app.use(cors({ }));
const server = http.createServer(app);
//routez
const residenceRouter = require('./routes/residence.js');
const authRouter = require('./routes/auth.js');
const postRoutes = require("./routes/post.js");
const conversationRoutes = require("./routes/conversations.js");
const messageRoutes = require("./routes/messages.js");
const paymentRoutes = require("./routes/payment.js");
const notificationRoutes = require("./routes/notifications.js");
const reportRoutes = require("./routes/report.js");
const userRoutes = require("./routes/user.js");
const groupRoutes = require("./routes/group.js");


app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/posts", postRoutes);
app.use('/api/residences', residenceRouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authRouter);
app.use('/api/notifications', notificationRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/user', userRoutes);
app.use("/api/group", groupRoutes);

app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    res.status(statusCode).json({
        error: err.message
    });
});

const io = initializeSocket(server);

app.set("io", io);

console.log("[SOCKET.IO] Initialized and registered with Express");
server.listen(process.env.PORT,"0.0.0.0", ()=> {console.log(`server is running on port ${process.env.PORT  || 5000}`)
,console.log("SERVER TIME:", new Date().toISOString());
console.log("SERVER TIMESTAMP:", Math.floor(Date.now() / 1000));});