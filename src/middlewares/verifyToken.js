const jwt = require("jsonwebtoken");

// Verify that the user is logged in
const verifyToken = (req, res, next) => {
  try {
    const token = req.header("token");

    if (!token) {
      return res.status(401).json({
        message: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};


// Verify that the logged-in user is accessing his own account
const verifyTokenAndAuthorization = (req, res, next) => {
  verifyToken(req, res, () => {

    if (req.user.id !== req.params.id) {
      return res.status(403).json({
        message: "You are not authorized to perform this action.",
      });
    }

    next();
  });
};


module.exports = {
  verifyToken,
  verifyTokenAndAuthorization,
};