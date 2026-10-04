const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { Post } = require("../models/Post.js");
const { User } = require("../models/User.js");
const Comment = require("../models/Comment.js");
const { verifyToken } = require("../middlewares/verifyToken.js");
const { checkBlocked } = require("../middlewares/checkBlocked");


// CREATE POST
router.post("/", verifyToken, asyncHandler(async (req, res) => {

  const { category, caption, picture } = req.body;

  if (!category || !caption) {
    return res.status(400).json({
      message: "Category and caption are required"
    });
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  if (!user.residence) {
    return res.status(400).json({
      message: "You must have a residence before creating a post"
    });
  }

  const post = new Post({
    category,
    caption,
    picture: picture || "",
    user: user._id,
    residence: user.residence,
    likes: [],
    comments: []
  });

  const savedPost = await post.save();

  res.status(201).json({
    message: "Post created successfully",
    post: savedPost
  });

}));



// GET POSTS FROM MY RESIDENCE
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

    const posts = await Post.find({
      residence: currentUser.residence,
      user: {
        $nin: excludedUsers,
      },
    })
      .populate("user", "username profilePicture")
      .populate("residence", "name wilaya")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: posts.length,
      posts,
    });
  })
);


// GET ONE POST(not gonna use it ik ikk )
router.get("/:id", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    residence: user.residence
  })
    .populate("user", "username profilePicture")
    .populate("residence", "name wilaya")
    .populate("likes", "username profilePicture");

  if (!post) {
    return res.status(404).json({
      message: "Post not found"
    });
  }

  res.status(200).json({
    ...post.toObject(),

    likesCount: post.likes.length,

    commentsCount: post.comments
      ? post.comments.length
      : 0,

    likedByMe: post.likes.some(
      like => like._id.toString() === user._id.toString()
    )
  });

}));



// UPDATE MY POST
router.put("/:id", verifyToken, asyncHandler(async (req, res) => {

  const { category, caption, picture } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    user: user._id,
    residence: user.residence
  });

  if (!post) {
    return res.status(404).json({
      message: "Post not found or you are not allowed to edit it"
    });
  }

  if (category !== undefined) {
    post.category = category;
  }

  if (caption !== undefined) {
    post.caption = caption;
  }

  if (picture !== undefined) {
    post.picture = picture;
  }

  const updatedPost = await post.save();

  res.status(200).json({
    message: "Post updated successfully",
    post: updatedPost
  });

}));


// DELETE MY POST
router.delete("/:id", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const post = await Post.findOne({
    _id: req.params.id,
    user: user._id,
    residence: user.residence
  });

  if (!post) {
    return res.status(404).json({
      message: "Post not found or you are not allowed to delete it"
    });
  }

  // Delete all comments belonging to this post
  await Comment.deleteMany({
    post: post._id
  });

  await Post.findByIdAndDelete(post._id);

  res.status(200).json({
    message: "Post deleted successfully"
  });

}));



// GET MY POSTS
router.get("/user/me", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const posts = await Post.find({
    user: user._id
  })
    .populate("user", "username profilePicture")
    .populate("residence", "name wilaya")
    .populate("likes", "username profilePicture")
    .sort({ createdAt: -1 });

  const postsWithInfo = posts.map(post => ({
    ...post.toObject(),

    likesCount: post.likes.length,

    commentsCount: post.comments
      ? post.comments.length
      : 0,

    likedByMe: post.likes.some(
      like => like._id.toString() === user._id.toString()
    )
  }));

  res.status(200).json({
    count: postsWithInfo.length,
    posts: postsWithInfo
  });

}));



// GET POSTS OF ANOTHER USER
router.get("/user/:userId", verifyToken, asyncHandler(async (req, res) => {

  const currentUser = await User.findById(req.user.id);

  if (!currentUser) {
    return res.status(404).json({
      message: "Current user not found"
    });
  }

  const targetUser = await User.findById(req.params.userId);

  if (!targetUser) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  if (
    !targetUser.residence ||
    targetUser.residence.toString() !== currentUser.residence.toString()
  ) {
    return res.status(403).json({
      message: "You can only view users from your residence"
    });
  }

  const posts = await Post.find({
    user: targetUser._id,
    residence: currentUser.residence
  })
    .populate("user", "username profilePicture")
    .populate("likes", "username profilePicture")
    .sort({ createdAt: -1 });

  const postsWithInfo = posts.map(post => ({
    ...post.toObject(),

    likesCount: post.likes.length,

    commentsCount: post.comments
      ? post.comments.length
      : 0,

    likedByMe: post.likes.some(
      like => like._id.toString() === currentUser._id.toString()
    )
  }));

  res.status(200).json({
    count: postsWithInfo.length,
    posts: postsWithInfo
  });

}));



// GET POSTS BY CATEGORY
// GET /api/posts/category/:category
router.get("/category/:category", verifyToken, asyncHandler(async (req, res) => {

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const posts = await Post.find({
    residence: user.residence,
    category: req.params.category
  })
    .populate("user", "username profilePicture")
    .populate("likes", "username profilePicture")
    .sort({ createdAt: -1 });

  const postsWithInfo = posts.map(post => ({
    ...post.toObject(),

    likesCount: post.likes.length,

    commentsCount: post.comments
      ? post.comments.length
      : 0,

    likedByMe: post.likes.some(
      like => like._id.toString() === user._id.toString()
    )
  }));

  res.status(200).json({
    category: req.params.category,
    count: postsWithInfo.length,
    posts: postsWithInfo
  });

}));


// SEARCH POSTS
// GET /api/posts/search?q=...
router.get("/search", verifyToken, asyncHandler(async (req, res) => {

  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      message: "Search query is required"
    });
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const posts = await Post.find({
    residence: user.residence,

    $or: [
      {
        caption: {
          $regex: q,
          $options: "i"
        }
      },
      {
        category: {
          $regex: q,
          $options: "i"
        }
      }
    ]
  })
    .populate("user", "username profilePicture")
    .populate("likes", "username profilePicture")
    .sort({ createdAt: -1 });

  const postsWithInfo = posts.map(post => ({
    ...post.toObject(),

    likesCount: post.likes.length,

    commentsCount: post.comments
      ? post.comments.length
      : 0,

    likedByMe: post.likes.some(
      like => like._id.toString() === user._id.toString()
    )
  }));

  res.status(200).json({
    query: q,
    count: postsWithInfo.length,
    posts: postsWithInfo
  });

}));



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
