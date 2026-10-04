const dns = require("dns");

dns.setServers([
  "8.8.8.8",
  "1.1.1.1"
]);

const express = require ('express'); 
const dotenv = require('dotenv');
const logger = require('./middlewares/logger');
dotenv.config({ override: true });
console.log("MONGO_URI exists:", !!process.env.MONGO_URI);
console.log("MONGO_URI starts with:", process.env.MONGO_URI?.substring(0, 15));
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

app.use(express.json());

app.use(logger);
// helmet make the back more secure
app.use(helmet());
// only this domain can use the routes but if u dont want to select just put *
app.use(cors({  origin:"http://localhost:5000"}));

//routez
const residencerouter = require('./routes/residence.js');
const authrouter = require('./routes/auth.js');
const postRoutes = require("./routes/post.js");
const conversationRoutes = require("./routes/conversations.js");
const messageRoutes = require("./routes/messages.js");
const paymentRoutes = require("./routes/payment.js");

app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/posts", postRoutes);
app.use('/api/residences', residencerouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authrouter);


app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    res.status(statusCode).json({
        error: err.message
    });
});



app.listen(process.env.PORT,"0.0.0.0", ()=> {console.log(`server is running on port ${process.env.PORT  || 5000}`)});