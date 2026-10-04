const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");

const {
  User,
  validateUser,
  validateLogin,
  validateUpdate,
} = require("../models/User.js");

const Residence = require("../models/Residence.js");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

const {
  verifyToken,
  verifyTokenAndAuthorization,
} = require("../middlewares/verifyToken");

const dotenv = require("dotenv");

dotenv.config();

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);


// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

// SEND VERIFICATION EMAIL FUNCTION
async function sendVerificationEmail(user) {

  console.log("SENDING VERIFICATION EMAIL TO:", user.email);

  const token = jwt.sign(
    {
      id: user._id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m",
    }
  );

  const link =
    `${process.env.BASE_URL}/api/auth/verify-email/${user._id}/${token}`;

  try {

    const info = await transporter.sendMail({

      from: process.env.EMAIL,

      to: user.email,

      subject: "Verify your account",

      html: `
        <h3>Welcome!</h3>

        <p>
          Thank you for creating your account.
        </p>

        <p>
          Please verify your email address by clicking the button below:
        </p>

        <a
          href="${link}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#E51B0D;
            color:white;
            text-decoration:none;
            border-radius:6px;
          "
        >
          Verify Email
        </a>

        <p>
          This link will expire in 10 minutes.
        </p>
      `,
    });

    console.log("Verification email sent:", info.response);

  } catch (err) {

    console.error(
      "Verification email sending failed:",
      err
    );
  }
}

// SEND RESET PASSWORD EMAIL FUNCTION
async function sendResetPasswordEmail(user) {

  const token = jwt.sign(
    {
      id: user._id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m",
    }
  );

  const link =
    `${process.env.BASE_URL}/api/auth/reset-password/${user._id}/${token}`;

  await transporter.sendMail({

    from: process.env.EMAIL,

    to: user.email,

    subject: "Reset your password",

    html: `
      <h3>Password Reset Request</h3>

      <p>
        We received a request to reset your password.
      </p>

      <p>
        Click the button below to choose a new password:
      </p>

      <a
        href="${link}"
        style="
          display:inline-block;
          padding:12px 20px;
          background:#E51B0D;
          color:white;
          text-decoration:none;
          border-radius:6px;
        "
      >
        Reset Password
      </a>

      <p>
        This link will expire in 10 minutes.
      </p>
    `,
  });
}

// REGISTER
router.post("/register",asyncHandler(async (req, res) => {

    const { error } = validateUser(req.body);

    if (error) {

      return res.status(400).json({
        field: error.details[0].path[0],
        message: error.details[0].message,
      });
    }

    const { residence } = req.body;

    if (!residence) {

      return res.status(400).json({
        message: "Residence is required",
      });
    }


    const residenceExists =
      await Residence.findById(residence);

    if (!residenceExists) {

      return res.status(404).json({
        message: "Residence not found",
      });
    }

    const existingUser = await User.findOne({
      email: req.body.email,
    });


    if (existingUser) {

 
      if (!existingUser.isVerified) {

        return res.status(403).json({
          message: "Email not verified",
        });
      }

        return res.status(409).json({
        message: "Account already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);

    const hashedPassword =
      await bcrypt.hash(req.body.password, salt);

    const newUser = new User({

      username: req.body.username,

      email: req.body.email,

      password: hashedPassword,

      residence: residence,

      posts: [],

      isVerified: false,
    });


    const result = await newUser.save();

    await sendVerificationEmail(result);

    const token = jwt.sign(

      {
        id: result._id,
        username: result.username,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: "30d",
      }
    );
 const userResponse =
      result.toObject();

    delete userResponse.password;

    res.status(201).json({

      ...userResponse,

      token,

      message:
        "Account created. Please verify your email.",
    });
  })
);

// LOGIN
router.post( "/login", asyncHandler(async (req, res) => {

  
    const { error } =
      validateLogin(req.body);

    if (error) {

      return res.status(400).json({
        message:
          error.details[0].message,
      });
    }

    const user =
      await User.findOne({
        email: req.body.email,
      }).populate("residence");


    if (!user) {

      return res.status(400).json({
        message: "User not found",
      });
    }


   
    if (!user.isVerified) {

      return res.status(403).json({
        message:
          "Please verify your email before logging in",
      });
    }


    const validPassword =
      await bcrypt.compare(
        req.body.password,
        user.password
      );


    if (!validPassword) {

      return res.status(400).json({
        message: "Invalid password",
      });
    }


    const token = jwt.sign(

      {
        id: user._id,
        username: user.username,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: "30d",
      }
    );
    const userResponse =
      user.toObject();

    delete userResponse.password;

    res.status(200).json({

      ...userResponse,

      token,
    });
  })
);

// GET CURRENT USER
router.get( "/me", verifyToken, asyncHandler(async (req, res) => {

    const user =
      await User.findById(req.user.id)

        .select("-password")

        .populate("residence")

        .populate("posts");


    if (!user) {

      return res.status(404).json({
        message: "User not found",
      });
    }


    res.status(200).json(user);
  })
);

// RESEND VERIFICATION EMAIL
router.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {

    const { email } = req.body;


    if (!email) {

      return res.status(400).json({
        message: "Email is required",
      });
    }


    const user =
      await User.findOne({
        email,
      });


    if (!user) {

      return res.status(404).json({
        message: "User not found",
      });
    }


    if (user.isVerified) {

      return res.status(400).json({
        message:
          "Email is already verified",
      });
    }


    await sendVerificationEmail(user);


    res.json({
      message:
        "Verification email sent again",
    });
  })
);

// VERIFY EMAIL
router.get(
  "/verify-email/:id/:token",
  asyncHandler(async (req, res) => {

    const {
      id,
      token,
    } = req.params;


    try {

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );


      // Make sure token belongs to this user
      if (decoded.id !== id) {

        return res.status(400).json({
          message: "Invalid token",
        });
      }


      const updatedUser =
        await User.findByIdAndUpdate(

          id,

          {
            isVerified: true,
          },

          {
            new: true,
          }
        );


      if (!updatedUser) {

        return res.status(404).json({
          message: "User not found",
        });
      }


      res.json({
        message:
          "Email verified successfully",
      });

    } catch (err) {

      console.error(
        "JWT VERIFY ERROR:",
        err
      );

      res.status(400).json({
        message:
          "Invalid or expired token",
      });
    }
  })
);

// FORGOT PASSWORD
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {

    const { email } = req.body;


    if (!email) {

      return res.status(400).json({
        message: "Email is required",
      });
    }


    const user =
      await User.findOne({
        email,
      });


    if (!user) {

      return res.status(404).json({
        message: "User not found",
      });
    }


    if (!user.isVerified) {

      return res.status(403).json({
        message:
          "Please verify your email first",
      });
    }


    await sendResetPasswordEmail(user);


    res.json({
      message:
        "Password reset email sent",
    });
  })
);

// RESET PASSWORD PAGE
router.get(
  "/reset-password/:id/:token",
  (req, res) => {

    const {
      id,
      token,
    } = req.params;


    res.send(`

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Reset Password</title>

<style>

body {

  background: #111;

  color: white;

  font-family: Arial, sans-serif;

  display: flex;

  justify-content: center;

  align-items: center;

  height: 100vh;

}

.card {

  width: 350px;

  background: #1a1a1a;

  padding: 30px;

  border-radius: 12px;

  text-align: center;

}

input {

  width: 100%;

  padding: 12px;

  margin-top: 15px;

  margin-bottom: 15px;

  box-sizing: border-box;

}

button {

  width: 100%;

  padding: 12px;

  background: #0dafe5;

  color: white;

  border: none;

  cursor: pointer;

}

</style>

</head>


<body>


<div class="card">

<h2>Reset Password</h2>


<form id="resetForm">

<input

type="password"

id="password"

placeholder="Enter new password"

required

/>


<button type="submit">

Reset Password

</button>

</form>

</div>


<script>

const userId = "${id}";

const userToken = "${token}";


document

.getElementById("resetForm")

.addEventListener("submit", async function(e) {

  e.preventDefault();


  const password =

    document.getElementById("password").value;


  try {


    const response = await fetch(

      "/api/auth/reset-password/" +

      userId +

      "/" +

      userToken,

      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body: JSON.stringify({

          password: password

        })

      }

    );


    const data =
      await response.json();


    alert(data.message);


    if (response.ok) {

      document.body.innerHTML =

        "<h2>Password Reset Successful ✅</h2>";

    }


  } catch (error) {

    console.error(error);

    alert(
      "Something went wrong"
    );

  }

});

</script>


</body>

</html>

`);
  }
);

// RESET PASSWORD
router.post(
  "/reset-password/:id/:token",
  asyncHandler(async (req, res) => {

    const {
      id,
      token,
    } = req.params;

    const {
      password,
    } = req.body;


    if (!password) {

      return res.status(400).json({
        message:
          "Password is required",
      });
    }


    try {

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );


      if (decoded.id !== id) {

        return res.status(400).json({
          message:
            "Invalid token",
        });
      }

    } catch (error) {

      return res.status(400).json({
        message:
          "Invalid or expired token",
      });
    }

    const user =
      await User.findById(id);


    if (!user) {

      return res.status(404).json({
        message:
          "User not found",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );


    user.password =
      hashedPassword;


    await user.save();


    res.json({

      message:
        "Password reset successfully",
    });
  })
);



// GOOGLE LOGIN
router.post("/google", asyncHandler(async (req, res) => {

    const {
      idToken,
      residence,
    } = req.body;


    if (!idToken) {

      return res.status(400).json({
        message:
          "Google token is required",
      });
    }

    const ticket =
      await client.verifyIdToken({

        idToken,

        audience:
          process.env.GOOGLE_CLIENT_ID,

      });


    const payload =
      ticket.getPayload();


    const {
      email,
      name,
      picture,
      email_verified,
    } = payload;


    if (!email_verified) {

      return res.status(400).json({
        message:
          "Google email is not verified",
      });
    }


    let user =
      await User.findOne({
        email,
      });

    if (!user) {

      if (!residence) {

        return res.status(400).json({
          message:
            "Residence is required for Google registration",
        });
      }


      const residenceExists =
        await Residence.findById(
          residence
        );


      if (!residenceExists) {

        return res.status(404).json({
          message:
            "Residence not found",
        });
      }


      user = new User({

        username:
          name || email.split("@")[0],

        email,

        profilePicture:
          picture,

        residence,

        posts: [],

        isVerified: true,
      });


      await user.save();

    } else {

  
      // If the user already has a residence,
      // don't overwrite it.

      if (!user.residence && residence) {

        const residenceExists =
          await Residence.findById(
            residence
          );


        if (!residenceExists) {

          return res.status(404).json({
            message:
              "Residence not found",
          });
        }


        user.residence =
          residence;

        await user.save();
      }
    }


    const token =
      jwt.sign(

        {
          id: user._id,
          username: user.username,
        },

        process.env.JWT_SECRET,

        {
          expiresIn: "30d",
        }
      );


 
    const userResponse =
      user.toObject();

    delete userResponse.password;


    res.status(200).json({

      ...userResponse,

      token,
    });
  })
);

// UPDATE USER
router.put( "/:id", verifyTokenAndAuthorization, asyncHandler(async (req, res) => {

    const { error } = validateUpdate(req.body);

    if (error) {
      return res.status(400).json({
        message:
          error.details[0].message,
      });
    }
    const updateData = {
      ...req.body,
    };
    delete updateData.password;

    delete updateData.posts;

    delete updateData.residence;
    const updatedUser =
      await User.findByIdAndUpdate(

        req.params.id,

        {
          $set: updateData,
        },

        {
          new: true,
          runValidators: true,
        }
      )

        .select("-password")

        .populate("residence")

        .populate("posts");


    if (!updatedUser) {

      return res.status(404).json({
        message:
          "User not found",
      });
    }
    res.status(200).json(
      updatedUser
    );
  })
);



// DELETE ACCOUNT
router.delete( "/delete-account", verifyToken, asyncHandler(async (req, res) => {

    const userId = req.user.id;
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        message:
          "User not found",
      });
    }

    res.json({
      message:
        "Account deleted successfully",
    });
  })
);



module.exports = router;