const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "saiflex-db";

// Middleware
app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })
);
app.use(express.json());

let db;
let client;

// Connect to MongoDB Atlas
async function connectDB() {
  try {
    if (!MONGODB_URI) {
      console.error("MONGODB_URI environment variable is missing in .env");
      return;
    }
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`Connected to MongoDB Atlas: ${DB_NAME}`);
  } catch (error) {
    console.error("MongoDB Atlas connection error:", error);
  }
}
connectDB();

// ----------------------------------------------------
// Health Check Endpoint
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    message: "SaiFlex Backend Server Running on Port 5000",
    status: "OK",
    database: DB_NAME,
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// CLASSES ENDPOINTS
// ----------------------------------------------------

// GET /api/classes - Fetch classes (Optional query: category, status, search)
app.get("/api/classes", async (req, res) => {
  try {
    const { category, status, search } = req.query;
    let filter = {};

    if (status) {
      filter.status = status;
    }

    if (category && category !== "All") {
      filter.category = category;
    }

    if (search) {
      filter.className = { $regex: search, $options: "i" };
    }

    const classes = await db.collection("classes").find(filter).toArray();
    const formatted = classes.map((item) => ({
      ...item,
      id: item._id.toString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/classes/:id - Fetch single class by ID
app.get("/api/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { id };

    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { id }] };
    }

    const item = await db.collection("classes").findOne(query);
    if (!item) {
      return res.status(404).json({ success: false, error: "Class not found" });
    }

    res.json({ success: true, data: { ...item, id: item._id.toString() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings/check - Check if user has already booked a specific class
app.get("/api/bookings/check", async (req, res) => {
  try {
    const { userId, classId, email } = req.query;

    if (!classId || (!userId && !email)) {
      return res.status(400).json({ success: false, error: "Missing userId/email or classId parameter" });
    }

    let filter = { classId };
    if (userId && email) {
      filter.$or = [{ userId }, { userEmail: email }, { "user.id": userId }];
    } else if (userId) {
      filter.$or = [{ userId }, { "user.id": userId }];
    } else if (email) {
      filter.userEmail = email;
    }

    const existingBooking = await db.collection("bookings").findOne(filter);

    res.json({
      success: true,
      isBooked: !!existingBooking,
      booking: existingBooking
        ? {
            ...existingBooking,
            id: existingBooking._id.toString(),
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----------------------------------------------------
// FAVORITES ENDPOINTS
// ----------------------------------------------------

// GET /api/favorites/check - Check if a class is in user's favorites
app.get("/api/favorites/check", async (req, res) => {
  try {
    const { userId, classId, email } = req.query;

    if (!classId || (!userId && !email)) {
      return res.status(400).json({ success: false, error: "Missing userId/email or classId parameter" });
    }

    let filter = { classId };
    if (userId && email) {
      filter.$or = [{ userId }, { userEmail: email }, { "user.id": userId }];
    } else if (userId) {
      filter.$or = [{ userId }, { "user.id": userId }];
    } else if (email) {
      filter.userEmail = email;
    }

    const existingFav = await db.collection("favorites").findOne(filter);

    res.json({
      success: true,
      isFavorite: !!existingFav,
      favorite: existingFav ? { ...existingFav, id: existingFav._id.toString() } : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/favorites - Add a class to user's favorites (prevents duplicates)
app.post("/api/favorites", async (req, res) => {
  try {
    const { userId, userEmail, classId, classData } = req.body;

    if (!classId || (!userId && !userEmail)) {
      return res.status(400).json({ success: false, error: "Missing userId/email or classId" });
    }

    // Check for existing entry to prevent duplicates
    let filter = { classId };
    if (userId && userEmail) {
      filter.$or = [{ userId }, { userEmail }, { "user.id": userId }];
    } else if (userId) {
      filter.$or = [{ userId }, { "user.id": userId }];
    } else if (userEmail) {
      filter.userEmail = userEmail;
    }

    const existing = await db.collection("favorites").findOne(filter);
    if (existing) {
      return res.json({
        success: true,
        isFavorite: true,
        message: "Class is already in your favorites!",
        id: existing._id.toString(),
      });
    }

    const favoriteDoc = {
      userId: userId || null,
      userEmail: userEmail || null,
      classId: classId,
      classData: classData || {},
      createdAt: new Date(),
    };

    const result = await db.collection("favorites").insertOne(favoriteDoc);

    res.status(201).json({
      success: true,
      isFavorite: true,
      message: "Successfully added to your favorites!",
      id: result.insertedId.toString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/favorites - Remove a class from user's favorites
app.delete("/api/favorites", async (req, res) => {
  try {
    const { userId, userEmail, classId } = req.query;

    if (!classId || (!userId && !userEmail)) {
      return res.status(400).json({ success: false, error: "Missing userId/email or classId" });
    }

    let filter = { classId };
    if (userId && userEmail) {
      filter.$or = [{ userId }, { userEmail }, { "user.id": userId }];
    } else if (userId) {
      filter.$or = [{ userId }, { "user.id": userId }];
    } else if (userEmail) {
      filter.userEmail = userEmail;
    }

    await db.collection("favorites").deleteOne(filter);

    res.json({
      success: true,
      isFavorite: false,
      message: "Removed from your favorites.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ----------------------------------------------------
// FORUM ENDPOINTS
// ----------------------------------------------------

// GET /api/forum & GET /api/forums - Fetch forum posts from MongoDB Atlas
const getForumsHandler = async (req, res) => {
  try {
    // Check "forums" collection first as requested by user, fallback to "forum_posts"
    let posts = await db.collection("forums").find({}).sort({ createdAt: -1 }).toArray();
    if (!posts || posts.length === 0) {
      posts = await db.collection("forum_posts").find({}).sort({ createdAt: -1 }).toArray();
    }
    const formatted = posts.map((item) => ({
      ...item,
      id: item._id ? item._id.toString() : item.id,
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

app.get("/api/forum", getForumsHandler);
app.get("/api/forums", getForumsHandler);

// GET /api/forum/:id - Fetch single forum post by ID
app.get("/api/forum/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { id };

    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { id }] };
    }

    let post = await db.collection("forums").findOne(query);
    if (!post) {
      post = await db.collection("forum_posts").findOne(query);
    }

    if (!post) {
      return res.status(404).json({ success: false, error: "Forum post not found" });
    }

    res.json({
      success: true,
      data: {
        ...post,
        id: post._id ? post._id.toString() : post.id,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/forum/:id/vote-status - Check user's vote on post
app.get("/api/forum/:id/vote-status", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email } = req.query;

    if (!userId && !email) {
      return res.json({ success: true, userVote: null });
    }

    let filter = { postId: id };
    if (userId && email) {
      filter.$or = [{ userId }, { userEmail: email }];
    } else if (userId) {
      filter.userId = userId;
    } else if (email) {
      filter.userEmail = email;
    }

    const vote = await db.collection("forum_votes").findOne(filter);

    res.json({
      success: true,
      userVote: vote ? vote.voteType : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/forum/:id/vote - Submit Like/Dislike vote (Strict 1 vote per user)
app.post("/api/forum/:id/vote", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userEmail, voteType } = req.body;

    if (!userId && !userEmail) {
      return res.status(401).json({ success: false, error: "Unauthorized. Please log in to vote." });
    }

    if (!["like", "dislike"].includes(voteType)) {
      return res.status(400).json({ success: false, error: "Invalid vote type" });
    }

    let filter = { postId: id };
    if (userId && userEmail) {
      filter.$or = [{ userId }, { userEmail }];
    } else if (userId) {
      filter.userId = userId;
    } else {
      filter.userEmail = userEmail;
    }

    const existingVote = await db.collection("forum_votes").findOne(filter);

    let likesDelta = 0;
    let dislikesDelta = 0;

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // User clicked same vote -> Remove vote
        await db.collection("forum_votes").deleteOne({ _id: existingVote._id });
        if (voteType === "like") likesDelta = -1;
        if (voteType === "dislike") dislikesDelta = -1;

        let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
        await db.collection("forums").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });
        await db.collection("forum_posts").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });

        return res.json({
          success: true,
          userVote: null,
          message: "Your vote has been removed.",
        });
      } else {
        // User switched vote (e.g. dislike -> like)
        await db.collection("forum_votes").updateOne(
          { _id: existingVote._id },
          { $set: { voteType, updatedAt: new Date() } }
        );

        if (voteType === "like") {
          likesDelta = 1;
          dislikesDelta = -1;
        } else {
          likesDelta = -1;
          dislikesDelta = 1;
        }

        let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
        await db.collection("forums").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });
        await db.collection("forum_posts").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });

        return res.json({
          success: true,
          userVote: voteType,
          message: `Vote updated to ${voteType}!`,
        });
      }
    } else {
      // New vote
      const newVote = {
        postId: id,
        userId: userId || null,
        userEmail: userEmail || null,
        voteType,
        createdAt: new Date(),
      };

      await db.collection("forum_votes").insertOne(newVote);

      if (voteType === "like") likesDelta = 1;
      if (voteType === "dislike") dislikesDelta = 1;

      let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
      await db.collection("forums").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });
      await db.collection("forum_posts").updateOne(query, { $inc: { likes: likesDelta, dislikes: dislikesDelta } });

      return res.status(201).json({
        success: true,
        userVote: voteType,
        message: `Successfully ${voteType}d this post!`,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/forum/:id/comments - Fetch comments & replies
app.get("/api/forum/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const comments = await db.collection("forum_comments")
      .find({ postId: id })
      .sort({ createdAt: 1 })
      .toArray();

    const formatted = comments.map((c) => ({
      ...c,
      id: c._id.toString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/forum/:id/comments - Create a new comment or reply
app.post("/api/forum/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorId, authorName, authorImage, authorRole, text, parentCommentId } = req.body;

    if (!authorId || !text || !text.trim()) {
      return res.status(400).json({ success: false, error: "Comment text and author details are required." });
    }

    const newComment = {
      postId: id,
      authorId,
      authorName: authorName || "Member",
      authorImage: authorImage || "https://i.pravatar.cc/150",
      authorRole: authorRole || "user",
      text: text.trim(),
      parentCommentId: parentCommentId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("forum_comments").insertOne(newComment);

    // Update comment count on post
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
    await db.collection("forums").updateOne(query, { $inc: { commentsCount: 1 } });
    await db.collection("forum_posts").updateOne(query, { $inc: { commentsCount: 1 } });

    res.status(201).json({
      success: true,
      message: "Comment posted successfully!",
      comment: {
        ...newComment,
        id: result.insertedId.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/forum/comments/:commentId - Edit own comment
app.patch("/api/forum/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { authorId, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: "Comment text cannot be empty." });
    }

    let query = { _id: ObjectId.isValid(commentId) ? new ObjectId(commentId) : commentId };
    const existing = await db.collection("forum_comments").findOne(query);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Comment not found." });
    }

    if (existing.authorId !== authorId) {
      return res.status(403).json({ success: false, error: "Unauthorized. You can only edit your own comments." });
    }

    await db.collection("forum_comments").updateOne(query, {
      $set: { text: text.trim(), updatedAt: new Date(), isEdited: true },
    });

    res.json({ success: true, message: "Comment updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/forum/comments/:commentId - Delete own comment
app.delete("/api/forum/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { authorId } = req.query;

    let query = { _id: ObjectId.isValid(commentId) ? new ObjectId(commentId) : commentId };
    const existing = await db.collection("forum_comments").findOne(query);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Comment not found." });
    }

    if (existing.authorId !== authorId) {
      return res.status(403).json({ success: false, error: "Unauthorized. You can only delete your own comments." });
    }

    await db.collection("forum_comments").deleteOne(query);

    // Decrement commentsCount on post
    if (existing.postId) {
      let postQuery = { _id: ObjectId.isValid(existing.postId) ? new ObjectId(existing.postId) : existing.postId };
      await db.collection("forums").updateOne(postQuery, { $inc: { commentsCount: -1 } });
      await db.collection("forum_posts").updateOne(postQuery, { $inc: { commentsCount: -1 } });
    }

    res.json({ success: true, message: "Comment deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ----------------------------------------------------
// USER & ROLE MANAGEMENT ENDPOINTS
// ----------------------------------------------------

// GET /api/users - Fetch users
app.get("/api/users", async (req, res) => {
  try {
    const users = await db.collection("user").find({}).toArray();
    const formatted = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role || "user",
      image: u.image,
      createdAt: u.createdAt,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Express Server on Port 5000
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SaiFlex Backend Server running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
