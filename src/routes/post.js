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



// CREATE POST
router.post( "/", verifyToken, asyncHandler(async (req, res) => {
    const { category, caption, picture } = req.body;

    

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
        picture: picture || "",
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

router.get( "/", verifyToken, asyncHandler(async (req, res) => {
    const currentUser = await User.findById(req.user.id)
      .select("residence blockedUsers");

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }



    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;

   
    if (page < 1) {
      page = 1;
    }

  
    if (limit < 1) {
      limit = 10;
    }

    if (limit > 30) {
      limit = 30;
    }

    const skip = (page - 1) * limit;

   

    const usersWhoBlockedMe = await User.find({
      blockedUsers: req.user.id,
    }).select("_id");

    const blockedByIds = usersWhoBlockedMe.map(
      (user) => user._id
    );

    const excludedUsers = [
      ...currentUser.blockedUsers,
      ...blockedByIds,
    ];

    const totalPosts = await Post.countDocuments({
      residence: currentUser.residence,
      user: {
        $nin: excludedUsers,
      },
    });

  
    const posts = await Post.find({
      residence: currentUser.residence,
      user: {
        $nin: excludedUsers,
      },
    })
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    
    const totalPages = Math.ceil(totalPosts / limit);

    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

  
    res.status(200).json({
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


// UPDATE MY POST
router.put(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { category, caption, picture } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Make sure the post belongs to the current user
    // and is from the same residence
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

    // Validate only the fields that were actually sent
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

    // Update only provided fields
    if (category !== undefined) {
      post.category = category.trim();
    }

    if (caption !== undefined) {
      post.caption = caption.trim();
    }

    if (picture !== undefined) {
      post.picture = picture.trim();
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


// SEARCH POSTS
router.get(
  "/search",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (
      typeof q !== "string" ||
      !q.trim()
    ) {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const searchQuery = q.trim();

    if (searchQuery.length > 100) {
      return res.status(400).json({
        message:
          "Search query must not exceed 100 characters",
      });
    }

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

    // Escape regex characters
    const safeSearch = escapeRegex(searchQuery);

    const { page, limit, skip } = getPagination(req);

    const filter = {
      residence: user.residence,

      user: {
        $nin: blockedUserIds,
      },

      $or: [
        {
          caption: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          category: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ],
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

// GET COMMENTS
// GET /api/posts/:id/comments
router.get("/:id/comments", verifyToken, asyncHandler(async (req, res) => {

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

  const comments = await Comment.find({
    post: post._id,
    residence: user.residence
  })
    .populate("user", "username profilePicture")
    .sort({ createdAt: -1 });

  res.status(200).json({
    count: comments.length,
    comments
  });

}));


// ADD COMMENT
// POST /api/posts/:id/comments
router.post("/:id/comments", verifyToken, asyncHandler(async (req, res) => {

  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      message: "Comment text is required"
    });
  }

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
    message: "You cannot comment on this post",
  });
}
  const comment = new Comment({
    text: text.trim(),
    user: user._id,
    post: post._id,
    residence: user.residence
  });

  const savedComment = await comment.save();

  // Add comment ID to Post
  post.comments.push(savedComment._id);

  await post.save();

  const populatedComment = await Comment.findById(savedComment._id)
    .populate("user", "username profilePicture");
await notifyComment({
  recipient: post.user,
  sender: req.user.id,
  post: post._id,
  comment: comment._id,
});
  res.status(201).json({
    message: "Comment added successfully",
    comment: populatedComment,
    commentsCount: post.comments.length
  });

}));


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


module.exports = router;
