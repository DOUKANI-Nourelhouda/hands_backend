const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const  Post  = require("../models/Post.js");
const { User } = require("../models/User.js");
const Comment = require("../models/Comment.js");
const { verifyToken } = require("../middlewares/verifyToken.js");
const { checkBlocked } = require("../middlewares/checkBlocked");
const { notifyComment,notifyLike } = require("../services/notification_service.js");
const mongoose = require("mongoose");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const Report = require("../models/Report");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }


    cb(
      new Error(
        "Only JPG, PNG, WebP, MP4, MOV, and WebM files are allowed."
      )
    );
  },
  limits: {
    files: 5,
    fileSize: 50 * 1024 * 1024, // 50 MB per file
  },
});


const uploadToCloudinary = (buffer, resourceType) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hands/posts",
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
};


// Escape regex special characters
const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};


// Get users that should be excluded because of blocking
const getBlockedUserIds = async (userId) => {
  const usersWhoBlockedMe = await User.find({
    blockedUsers: userId,
  }).select("_id");

  return usersWhoBlockedMe.map((user) => user._id);
};


// Validate post input
const validatePostInput = ({ category, caption, picture }) => {
  if (
    typeof category !== "string" ||
    !category.trim()
  ) {
    return "Category is required";
  }

  if (
    typeof caption !== "string" ||
    !caption.trim()
  ) {
    return "Caption is required";
  }

  if (category.trim().length > 50) {
    return "Category must not exceed 50 characters";
  }

  if (caption.trim().length > 1000) {
    return "Caption must not exceed 1000 characters";
  }

  if (
    picture !== undefined &&
    picture !== null &&
    typeof picture !== "string"
  ) {
    return "Picture must be a string";
  }

  if (
    typeof picture === "string" &&
    picture.length > 2000
  ) {
    return "Picture is too long";
  }

  return null;
};




// PAGINATION HELPER

const getPagination = (req) => {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 10;

  if (page < 1) {
    page = 1;
  }

  if (limit < 1) {
    limit = 10;
  }

  // Maximum 30 posts per request
  if (limit > 30) {
    limit = 30;
  }

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};
// search post 


router.get(
  "/search",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (typeof q !== "string" || !q.trim()) {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const searchQuery = q.trim();

    if (searchQuery.length > 100) {
      return res.status(400).json({
        message: "Search query must not exceed 100 characters",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const blockedByMe = (user.blockedUsers || []).map(
      (id) => id.toString()
    );

    const blockedMe = await getBlockedUserIds(user._id);

    const blockedUserIds = [
      ...new Set([
        ...blockedByMe,
        ...blockedMe.map((id) => id.toString()),
      ]),
    ];

    const safeSearch = escapeRegex(searchQuery);

    const { page, limit, skip } = getPagination(req);

    const filter = {
      residence: user.residence,
      user: {
        $nin: blockedUserIds,
      },
      caption: {
        $regex: safeSearch,
        $options: "i",
      },
    };

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .populate("user", "username profilePicture")
      .populate("likes", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalPosts / limit);

    const postsWithInfo = posts.map((post) => ({
      ...post.toObject(),
      likesCount: post.likes.length,
      commentsCount: post.comments ? post.comments.length : 0,
      likedByMe: post.likes.some(
        (like) =>
          like._id.toString() === user._id.toString()
      ),
    }));

    return res.status(200).json({
      query: searchQuery,
      page,
      limit,
      totalPosts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      count: postsWithInfo.length,
      posts: postsWithInfo,
    });
  })
);
 
// upload media

router.post(
  "/upload-media", 
  verifyToken,
  (req, res, next) => {
   
    upload.array("media", 5)(req, res, (err) => {
      if (err) {
        console.error("[UPLOAD] Multer error:", err.message);
        console.error("[UPLOAD] Error code:", err.code);

        return res.status(400).json({
          message: err.message,
          code: err.code || "UPLOAD_ERROR",
        });
      }

      next();
    });
  },
  asyncHandler(async (req, res) => {
    const files = req.files || [];

   

   

    if (files.length === 0) {
      console.error("[UPLOAD] No files received.");

      return res.status(400).json({
        message: "Please select at least one photo or video.",
      });
    }

    const uploadedMedia = [];

    try {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith("video/");
        const resourceType = isVideo ? "video" : "image";

       

       const result = await uploadToCloudinary(
  file.buffer,
  resourceType
);

       

        uploadedMedia.push({
          url: result.secure_url,
          type: resourceType,
          publicId: result.public_id,
        });
      }

    

      return res.status(201).json({
        message: "Media uploaded successfully.",
        media: uploadedMedia,
      });
    } catch (error) {
 

  await Promise.allSettled(
    uploadedMedia.map((item) =>
      cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.type,
      })
    )
  );

  throw error;
}
  })
);
// CREATE POST
router.post( "/", verifyToken, asyncHandler(async (req, res) => {
   const { category, caption, media = [] } = req.body;

if (
  !Array.isArray(media) ||
  media.length > 5 ||
  media.some(
    (item) =>
      !item ||
      typeof item.url !== "string" ||
      !["image", "video"].includes(item.type)
  )
) {
  return res.status(400).json({
    message: "Invalid media list.",
  });
}

    

    if (!category || !caption) {
      return res.status(400).json({
        message: "Category and caption are required",
      });
    }


    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.residence) {
      return res.status(400).json({
        message:
          "You must have a residence before creating a post",
      });
    }

    const FREE_POST_LIMIT = 3;

    let postType;

    if (user.freePostsUsed < FREE_POST_LIMIT) {
      postType = "free";
    } else if (user.paidPostCredits > 0) {
      postType = "paid";
    } else {
      return res.status(403).json({
        message:
          "You have no post credits left. Please purchase a post package.",
      });
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

  
      let updatedUser;

      if (postType === "free") {
        updatedUser = await User.findOneAndUpdate(
          {
            _id: user._id,
            freePostsUsed: { $lt: FREE_POST_LIMIT },
          },
          {
            $inc: {
              freePostsUsed: 1,
            },
          },
          {
            new: true,
            session,
          }
        );
      } else {
        updatedUser = await User.findOneAndUpdate(
          {
            _id: user._id,
            freePostsUsed: { $gte: FREE_POST_LIMIT },
            paidPostCredits: { $gt: 0 },
          },
          {
            $inc: {
              paidPostCredits: -1,
            },
          },
          {
            new: true,
            session,
          }
        );
      }

     
      if (!updatedUser) {
        await session.abortTransaction();

        return res.status(409).json({
          message:
            "Post credit was already used. Please try again.",
        });
      }

     
      const post = new Post({
        category,
        caption,
       media,
picture: media.find((item) => item.type === "image")?.url || "",
        user: user._id,
        residence: user.residence,
        likes: [],
        comments: [],
      });

      const savedPost = await post.save({ session });

     
      updatedUser.posts.push(savedPost._id);

      await updatedUser.save({ session });

      
      await session.commitTransaction();

      return res.status(201).json({
        message: "Post created successfully",

        postType,

        remainingFreePosts:
          FREE_POST_LIMIT -
          updatedUser.freePostsUsed,

        remainingPaidPostCredits:
          updatedUser.paidPostCredits,

        post: savedPost,
      });

    } catch (error) {
     
      await session.abortTransaction();

      throw error;

    } finally {
      session.endSession();
    }
  })
);



// GET POSTS FROM MY RESIDENCE
// GET /api/posts?page=1&limit=10

router.get(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // PAGINATION
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 30) limit = 30;

    const skip = (page - 1) * limit;

    // FIND USERS WHO BLOCKED ME
    const usersWhoBlockedMe = await User.find({
      blockedUsers: req.user.id,
    }).select("_id");

    const blockedByIds = usersWhoBlockedMe.map(
      (user) => user._id
    );

    // COMBINE BLOCKED USERS
    const excludedUsers = [
      ...currentUser.blockedUsers,
      ...blockedByIds,
    ];

    // FIND POSTS REPORTED BY THE CURRENT USER
    const reports = await Report.find({
      reporter: req.user.id,
    }).select("post");

    const reportedPostIds = reports.map(
      (report) => report.post
    );

    // SHARED FILTER FOR COUNT AND POSTS
    const postFilter = {
      residence: currentUser.residence,
      user: {
        $nin: excludedUsers,
      },
      _id: {
        $nin: reportedPostIds,
      },
    };

    // COUNT MATCHING POSTS
    const totalPosts = await Post.countDocuments(
      postFilter
    );

    // GET PAGINATED POSTS
    const posts = await Post.find(postFilter)
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // PAGINATION METADATA
    const totalPages = Math.ceil(totalPosts / limit);

    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return res.status(200).json({
      page,
      limit,
      totalPosts,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      count: posts.length,
      posts,
    });
  })
);



// GET ONE POST(not gonna use it ik ikk )
// GET ONE POST
router.get(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const blockedUserIds = [
      ...user.blockedUsers,
      ...(await getBlockedUserIds(user._id)),
    ];

    const post = await Post.findOne({
      _id: req.params.id,
      residence: user.residence,
      user: {
        $nin: blockedUserIds,
      },
    })
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .populate("likes", "username profilePicture");

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    res.status(200).json({
      ...post.toObject(),

      likesCount: post.likes.length,

      commentsCount: post.comments
        ? post.comments.length
        : 0,

      likedByMe: post.likes.some(
        (like) =>
          like._id.toString() ===
          user._id.toString()
      ),
    });
  })
);


/* UPDATE MY POST */
router.put(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { category, caption, picture, media } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Make sure the post belongs to the current user
    // and is from the same residence.
    const post = await Post.findOne({
      _id: req.params.id,
      user: user._id,
      residence: user.residence,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found or you are not allowed to edit it",
      });
    }

    // Validate the fields being updated.
    const validationError = validatePostInput({
      category: category !== undefined ? category : post.category,
      caption: caption !== undefined ? caption : post.caption,
      picture: picture !== undefined ? picture : post.picture,
    });

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    // Update category.
    if (category !== undefined) {
      post.category = category.trim();
    }

    // Update caption.
    if (caption !== undefined) {
      post.caption = caption.trim();
    }

    // Keep legacy picture support.
    if (picture !== undefined) {
      post.picture = picture.trim();
    }

    // Update photos/videos when Flutter sends the media array.
    if (media !== undefined) {
      if (!Array.isArray(media)) {
        return res.status(400).json({
          message: "Media must be an array",
        });
      }

      post.media = media;
    }

    const updatedPost = await post.save();

    return res.status(200).json({
      message: "Post updated successfully",
      post: updatedPost,
    });
  })
);




// DELETE MY POST
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const user = await User.findById(
        req.user.id
      ).session(session);

      if (!user) {
        await session.abortTransaction();

        return res.status(404).json({
          message: "User not found",
        });
      }

      const post = await Post.findOne({
        _id: req.params.id,
        user: user._id,
        residence: user.residence,
      }).session(session);

      if (!post) {
        await session.abortTransaction();

        return res.status(404).json({
          message:
            "Post not found or you are not allowed to delete it",
        });
      }

      // Delete comments belonging to this post
      await Comment.deleteMany({
        post: post._id,
      }).session(session);

      // Delete the post
      await Post.findByIdAndDelete(
        post._id
      ).session(session);

      // Remove post ID from user's posts array
      user.posts = user.posts.filter(
        (postId) =>
          postId.toString() !==
          post._id.toString()
      );

      await user.save({
        session,
      });

      await session.commitTransaction();

      return res.status(200).json({
        message: "Post deleted successfully",
      });

    } catch (error) {

      await session.abortTransaction();
      throw error;

    } finally {
      session.endSession();
    }
  })
);


// GET MY POSTS

router.get(
  "/user/me",
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { page, limit, skip } = getPagination(req);

    const filter = {
      user: user._id,
    };

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .populate("likes", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalPosts / limit);

    const postsWithInfo = posts.map((post) => ({
      ...post.toObject(),

      likesCount: post.likes.length,

      commentsCount: post.comments
        ? post.comments.length
        : 0,

      likedByMe: post.likes.some(
        (like) =>
          like._id.toString() === user._id.toString()
      ),
    }));

    res.status(200).json({
      page,
      limit,
      totalPosts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      count: postsWithInfo.length,
      posts: postsWithInfo,
    });
  })
);




/// GET POSTS OF ANOTHER USER
router.get(
  "/user/:userId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        message: "Current user not found",
      });
    }

    const targetUser = await User.findById(req.params.userId);

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Make sure both users are from the same residence
    if (
      !targetUser.residence ||
      targetUser.residence.toString() !==
        currentUser.residence.toString()
    ) {
      return res.status(403).json({
        message:
          "You can only view users from your residence",
      });
    }

    // Check blocking in both directions
    const blockedUserIds = [
      ...currentUser.blockedUsers,
      ...(await getBlockedUserIds(currentUser._id)),
    ];

    const isBlocked = blockedUserIds.some(
      (id) =>
        id.toString() === targetUser._id.toString()
    );

    if (isBlocked) {
      return res.status(403).json({
        message: "You cannot view this user's posts",
      });
    }

    const { page, limit, skip } = getPagination(req);

    const filter = {
      user: targetUser._id,
      residence: currentUser.residence,
    };

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .populate("user", "username profilePicture")
      .populate("likes", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalPosts / limit);

    const postsWithInfo = posts.map((post) => ({
      ...post.toObject(),

      likesCount: post.likes.length,

      commentsCount: post.comments
        ? post.comments.length
        : 0,

      likedByMe: post.likes.some(
        (like) =>
          like._id.toString() ===
          currentUser._id.toString()
      ),
    }));

    res.status(200).json({
      page,
      limit,
      totalPosts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      count: postsWithInfo.length,
      posts: postsWithInfo,
    });
  })
);


// GET POSTS BY CATEGORY

router.get(
  "/category/:category",
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const category = req.params.category.trim();

    if (!category) {
      return res.status(400).json({
        message: "Category is required",
      });
    }

    const blockedUserIds = [
      ...user.blockedUsers,
      ...(await getBlockedUserIds(user._id)),
    ];

    const { page, limit, skip } = getPagination(req);

    const filter = {
      residence: user.residence,

      category: category,

      user: {
        $nin: blockedUserIds,
      },
    };

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .populate("user", "username profilePicture")
      .populate("likes", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalPosts / limit);

    const postsWithInfo = posts.map((post) => ({
      ...post.toObject(),

      likesCount: post.likes.length,

      commentsCount: post.comments
        ? post.comments.length
        : 0,

      likedByMe: post.likes.some(
        (like) =>
          like._id.toString() === user._id.toString()
      ),
    }));

    res.status(200).json({
      category,

      page,
      limit,

      totalPosts,
      totalPages,

      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,

      count: postsWithInfo.length,

      posts: postsWithInfo,
    });
  })
);



// LIKE POST
// POST /api/posts/:id/like
router.post("/:id/like", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    residence: user.residence
  });

  if (!post) {
    return res.status(404).json({
      message: "Post not found"
    });
  }
const blocked = await checkBlocked(
  req.user.id,
  post.user
);

if (blocked.blocked) {
  return res.status(403).json({
    message: "You cannot interact with this post",
  });
}
  // Check if already liked
  const alreadyLiked = post.likes.some(
    like => like.toString() === user._id.toString()
  );

  if (alreadyLiked) {
    return res.status(400).json({
      message: "You already liked this post"
    });
  }

  post.likes.push(user._id);

  await post.save();
await notifyLike({
  recipient: post.user,
  sender: req.user.id,
  post: post._id,
});
  res.status(200).json({
    message: "Post liked successfully",
    likesCount: post.likes.length,
    likedByMe: true
  });

}));


// UNLIKE POST
// DELETE /api/posts/:id/like
router.delete("/:id/like", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    residence: user.residence
  });

  if (!post) {
    return res.status(404).json({
      message: "Post not found"
    });
  }

  post.likes = post.likes.filter(
    like => like.toString() !== user._id.toString()
  );

  await post.save();

  res.status(200).json({
    message: "Post unliked successfully",
    likesCount: post.likes.length,
    likedByMe: false
  });

}));


// GET COMMENTS WITH REPLIES
// GET /api/posts/:id/comments
router.get(
  "/:id/comments",
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const post = await Post.findOne({
      _id: req.params.id,
      residence: user.residence,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    // Get all comments and replies for this post
    const allComments = await Comment.find({
      post: post._id,
      residence: user.residence,
    })
      .populate("user", "username profilePicture")
      .sort({ createdAt: 1 })
      .lean();

    // Keep only top-level comments and attach their replies
    const comments = allComments
      .filter((comment) => !comment.parentComment)
      .map((comment) => ({
        ...comment,
        replies: allComments.filter(
          (reply) =>
            reply.parentComment &&
            reply.parentComment.toString() ===
              comment._id.toString()
        ),
      }));

    return res.status(200).json({
      count: allComments.length,
      comments,
    });
  })
);

// ADD COMMENT
// POST /api/posts/:id/comments
router.post("/:id/comments", verifyToken, asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      message: "Comment text is required",
    });
  }

  const content = text.trim();

  if (content.length > 500) {
    return res.status(400).json({
      message: "Comment cannot exceed 500 characters",
    });
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    residence: user.residence,
  });

  if (!post) {
    return res.status(404).json({
      message: "Post not found",
    });
  }

  const blocked = await checkBlocked(req.user.id, post.user);

  if (blocked.blocked) {
    return res.status(403).json({
      message: "You cannot comment on this post",
    });
  }

  // IMPORTANT: The schema field is "content", not "text".
  const comment = new Comment({
    content,
    user: user._id,
    post: post._id,
    residence: user.residence,
  });

  const savedComment = await comment.save();

  post.comments.push(savedComment._id);
  await post.save();

  const populatedComment = await Comment.findById(savedComment._id)
    .populate("user", "username profilePicture");

  await notifyComment({
    recipient: post.user,
    sender: req.user.id,
    post: post._id,
    comment: savedComment._id,
  });

  return res.status(201).json({
    message: "Comment added successfully",
    comment: populatedComment,
    commentsCount: post.comments.length,
  });
})); 

// PUT /api/posts/:id/comments/:commentId
router.put(
  "/:id/comments/:commentId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        message: "Comment text is required",
      });
    }

    if (text.trim().length > 500) {
      return res.status(400).json({
        message: "Comment cannot exceed 500 characters",
      });
    }

    const comment = await Comment.findOne({
      _id: req.params.commentId,
      post: req.params.id,
      user: req.user.id,
    });

    if (!comment) {
      return res.status(404).json({
        message: "Comment not found or you cannot edit it",
      });
    }

    comment.content = text.trim();
    await comment.save();

    const updatedComment = await Comment.findById(comment._id)
      .populate("user", "username profilePicture");

    return res.json({
      message: "Comment updated successfully",
      comment: updatedComment,
    });
  })
);

// POST /api/posts/:id/comments/:commentId/replies
router.post(
  "/:id/comments/:commentId/replies",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        message: "Reply text is required",
      });
    }

    if (text.trim().length > 500) {
      return res.status(400).json({
        message: "Reply cannot exceed 500 characters",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const post = await Post.findOne({
      _id: req.params.id,
      residence: user.residence,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    const parentComment = await Comment.findOne({
      _id: req.params.commentId,
      post: post._id,
    });

    if (!parentComment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    const blocked = await checkBlocked(req.user.id, post.user);

    if (blocked.blocked) {
      return res.status(403).json({
        message: "You cannot reply to this post",
      });
    }

    const reply = await Comment.create({
      content: text.trim(),
      user: user._id,
      post: post._id,
      residence: user.residence,
      parentComment: parentComment._id,
    });

    const populatedReply = await Comment.findById(reply._id)
      .populate("user", "username profilePicture");

    return res.status(201).json({
      message: "Reply added successfully",
      reply: populatedReply,
    });
  })
);


// DELETE MY COMMENT
// DELETE /api/posts/:id/comments/:commentId
router.delete(
  "/:id/comments/:commentId",
  verifyToken,
  asyncHandler(async (req, res) => {

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const post = await Post.findOne({
      _id: req.params.id,
      residence: user.residence
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    const comment = await Comment.findOne({
      _id: req.params.commentId,
      post: post._id,
      user: user._id,
      residence: user.residence
    });

    if (!comment) {
      return res.status(404).json({
        message: "Comment not found or you are not allowed to delete it"
      });
    }

    await Comment.findByIdAndDelete(comment._id);

    // Remove comment ID from Post
    post.comments = post.comments.filter(
      commentId =>
        commentId.toString() !== comment._id.toString()
    );

    await post.save();

    res.status(200).json({
      message: "Comment deleted successfully",
      commentsCount: post.comments.length
    });

  })
);

// EDIT A REPLY

 // EDIT A REPLY
// PUT /api/posts/:id/comments/:commentId/replies/:replyId

router.put(
  "/:id/comments/:commentId/replies/:replyId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { id, commentId, replyId } = req.params;
    const { text } = req.body;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        message: "Reply text is required",
      });
    }

    if (text.trim().length > 500) {
      return res.status(400).json({
        message: "Reply cannot exceed 500 characters",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const post = await Post.findOne({
      _id: id,
      residence: user.residence,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    // Verify the parent comment belongs to this post.
    const parentComment = await Comment.findOne({
      _id: commentId,
      post: post._id,
      residence: user.residence,
      parentComment: null,
    });

    if (!parentComment) {
      return res.status(404).json({
        message: "Parent comment not found",
      });
    }

    // Replies are separate Comment documents.
    const reply = await Comment.findOne({
      _id: replyId,
      post: post._id,
      residence: user.residence,
      parentComment: parentComment._id,
      user: user._id,
    });

    if (!reply) {
      return res.status(404).json({
        message: "Reply not found or you cannot edit it",
      });
    }

    reply.content = text.trim();
    await reply.save();

    const updatedReply = await Comment.findById(reply._id)
      .populate("user", "username profilePicture")
      .lean();

    return res.status(200).json({
      message: "Reply updated successfully",
      reply: updatedReply,
    });
  })
);


// DELETE A REPLY
// DELETE /api/posts/:id/comments/:commentId/replies/:replyId

router.delete(
  "/:id/comments/:commentId/replies/:replyId",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { id, commentId, replyId } = req.params;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const post = await Post.findOne({
      _id: id,
      residence: user.residence,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    // Verify the parent comment belongs to this post.
    const parentComment = await Comment.findOne({
      _id: commentId,
      post: post._id,
      residence: user.residence,
      parentComment: null,
    });

    if (!parentComment) {
      return res.status(404).json({
        message: "Parent comment not found",
      });
    }

    // Only the reply's author can delete it.
    const reply = await Comment.findOne({
      _id: replyId,
      post: post._id,
      residence: user.residence,
      parentComment: parentComment._id,
      user: user._id,
    });

    if (!reply) {
      return res.status(404).json({
        message: "Reply not found or you cannot delete it",
      });
    }

    await Comment.findByIdAndDelete(reply._id);

    return res.status(200).json({
      message: "Reply deleted successfully",
      replyId: reply._id,
    });
  })
);

module.exports = router;
