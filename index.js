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

    if (await isUserBlocked(authorId, null)) {
      return res.status(403).json({ success: false, error: "Action restricted by Admin" });
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
// USER DASHBOARD ENDPOINTS
// ----------------------------------------------------

// GET /api/user/dashboard-summary - Get summary counters & trainer application status
app.get("/api/user/dashboard-summary", async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ success: false, error: "Missing userId or email parameter" });
    }

    let userFilter = {};
    if (userId && email) userFilter = { $or: [{ userId }, { userEmail: email }] };
    else if (userId) userFilter = { $or: [{ userId }, { "user.id": userId }] };
    else if (email) userFilter = { userEmail: email };

    // Total bookings count
    const totalBookings = await db.collection("bookings").countDocuments(userFilter);

    // Total favorites count
    const totalFavorites = await db.collection("favorites").countDocuments(userFilter);

    // Trainer Application Status
    let appFilter = {};
    if (userId && email) appFilter = { $or: [{ userId }, { userEmail: email }] };
    else if (userId) appFilter = { userId };
    else if (email) appFilter = { userEmail: email };

    const application = await db.collection("trainer_applications").findOne(appFilter);

    res.json({
      success: true,
      data: {
        totalBookings,
        totalFavorites,
        trainerApplication: application
          ? {
              id: application._id.toString(),
              status: application.status || "Pending",
              feedback: application.feedback || null,
              experience: application.experience || 0,
              specialty: application.specialty || "",
              appliedAt: application.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/user/bookings - Get user's booked classes list
app.get("/api/user/bookings", async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ success: false, error: "Missing userId or email" });
    }

    let filter = {};
    if (userId && email) filter = { $or: [{ userId }, { userEmail: email }] };
    else if (userId) filter = { $or: [{ userId }, { "user.id": userId }] };
    else if (email) filter = { userEmail: email };

    const bookings = await db.collection("bookings").find(filter).sort({ bookedAt: -1 }).toArray();

    const formatted = bookings.map((b) => ({
      id: b._id.toString(),
      classId: b.classId,
      className: b.className || "Fitness Class",
      trainerName: b.trainerName || "Trainer",
      schedule: b.schedule || "Scheduled Session",
      price: b.price || 0,
      paymentStatus: b.paymentStatus || "Paid",
      bookedAt: b.bookedAt || b.createdAt,
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/user/favorites - Get user's favorite classes list
app.get("/api/user/favorites", async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ success: false, error: "Missing userId or email" });
    }

    let filter = {};
    if (userId && email) filter = { $or: [{ userId }, { userEmail: email }] };
    else if (userId) filter = { $or: [{ userId }, { "user.id": userId }] };
    else if (email) filter = { userEmail: email };

    const favs = await db.collection("favorites").find(filter).sort({ createdAt: -1 }).toArray();

    const formatted = favs.map((f) => ({
      id: f._id.toString(),
      classId: f.classId,
      classData: f.classData || {},
      createdAt: f.createdAt,
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trainer-applications - Apply to become a trainer
app.post("/api/trainer-applications", async (req, res) => {
  try {
    const { userId, userEmail, userName, userImage, experience, specialty, bio } = req.body;

    if (!userId && !userEmail) {
      return res.status(400).json({ success: false, error: "Missing user identification" });
    }

    if (!experience || !specialty) {
      return res.status(400).json({ success: false, error: "Experience and Specialty are required." });
    }

    if (await isUserBlocked(userId, userEmail)) {
      return res.status(403).json({ success: false, error: "Action restricted by Admin" });
    }

    let appFilter = {};
    if (userId && userEmail) appFilter = { $or: [{ userId }, { userEmail }] };
    else if (userId) appFilter = { userId };
    else appFilter = { userEmail };

    const existingApp = await db.collection("trainer_applications").findOne(appFilter);

    if (existingApp && (existingApp.status === "Pending" || existingApp.status === "Approved")) {
      return res.status(400).json({
        success: false,
        error: `You already have an active application with status: ${existingApp.status}`,
      });
    }

    const applicationDoc = {
      userId: userId || null,
      userEmail: userEmail || null,
      userName: userName || "Applicant",
      userImage: userImage || "https://i.pravatar.cc/150",
      experience: Number(experience) || 1,
      specialty: specialty,
      bio: bio || "",
      status: "Pending",
      feedback: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingApp && existingApp.status === "Rejected") {
      // Re-apply after rejection
      await db.collection("trainer_applications").updateOne(
        { _id: existingApp._id },
        { $set: applicationDoc }
      );
      return res.json({
        success: true,
        message: "Trainer application re-submitted successfully!",
        status: "Pending",
      });
    } else {
      const result = await db.collection("trainer_applications").insertOne(applicationDoc);
      return res.status(201).json({
        success: true,
        message: "Trainer application submitted successfully!",
        id: result.insertedId.toString(),
        status: "Pending",
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Soft-block check helper: Check if user is blocked in "user" collection
async function isUserBlocked(userId, userEmail) {
  try {
    let filter = {};
    if (userId && userEmail) {
      filter = { $or: [{ _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId }, { email: userEmail }] };
    } else if (userId) {
      filter = { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId };
    } else if (userEmail) {
      filter = { email: userEmail };
    }

    const u = await db.collection("user").findOne(filter);
    return u?.isBlocked === true;
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// ADMIN DASHBOARD ENDPOINTS
// ----------------------------------------------------

// GET /api/admin/stats - High level platform statistics
app.get("/api/admin/stats", async (req, res) => {
  try {
    const totalUsers = await db.collection("user").countDocuments({});
    let totalClasses = await db.collection("classes").countDocuments({});
    const totalBooked = await db.collection("bookings").countDocuments({});

    res.json({
      success: true,
      data: {
        totalUsers,
        totalClasses,
        totalBooked,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/users - Fetch all users with block & role status
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await db.collection("user").find({}).sort({ createdAt: -1 }).toArray();
    const formatted = users.map((u) => ({
      id: u._id.toString(),
      name: u.name || "User",
      email: u.email,
      role: u.role || "user",
      isBlocked: u.isBlocked === true,
      status: u.isBlocked === true ? "Blocked" : "Active",
      image: u.image || "https://i.pravatar.cc/150",
      createdAt: u.createdAt,
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/users/:id/block - Block or Unblock user (Soft Block)
app.patch("/api/admin/users/:id/block", async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
    await db.collection("user").updateOne(query, {
      $set: { isBlocked: !!isBlocked, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: isBlocked ? "User has been blocked." : "User has been unblocked.",
      isBlocked: !!isBlocked,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/users/:id/role - Promote user to Admin or change role
app.patch("/api/admin/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["user", "trainer", "admin"].includes(role)) {
      return res.status(400).json({ success: false, error: "Invalid role" });
    }

    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
    await db.collection("user").updateOne(query, {
      $set: { role, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: `User role updated to ${role}.`,
      role,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/trainer-applications - Pending trainer applications
app.get("/api/admin/trainer-applications", async (req, res) => {
  try {
    const applications = await db.collection("trainer_applications").find({}).sort({ createdAt: -1 }).toArray();
    const formatted = applications.map((app) => ({
      ...app,
      id: app._id.toString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/trainer-applications/:id - Approve or Reject application
app.patch("/api/admin/trainer-applications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status value" });
    }

    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
    const application = await db.collection("trainer_applications").findOne(query);

    if (!application) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    await db.collection("trainer_applications").updateOne(query, {
      $set: {
        status,
        feedback: feedback || null,
        updatedAt: new Date(),
      },
    });

    if (status === "Approved") {
      let userQuery = {};
      if (application.userId) {
        userQuery = { _id: ObjectId.isValid(application.userId) ? new ObjectId(application.userId) : application.userId };
      } else if (application.userEmail) {
        userQuery = { email: application.userEmail };
      }
      await db.collection("user").updateOne(userQuery, { $set: { role: "trainer", updatedAt: new Date() } });
    }

    res.json({
      success: true,
      message: status === "Approved" ? "Trainer application approved! User promoted to Trainer." : "Trainer application rejected.",
      status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/trainers - Active trainers list
app.get("/api/admin/trainers", async (req, res) => {
  try {
    const trainers = await db.collection("user").find({ role: "trainer" }).toArray();
    const formatted = trainers.map((t) => ({
      id: t._id.toString(),
      name: t.name || "Trainer",
      email: t.email,
      role: t.role,
      image: t.image || "https://i.pravatar.cc/150",
      createdAt: t.createdAt,
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/trainers/:id/demote - Demote trainer to user
app.patch("/api/admin/trainers/:id/demote", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("user").updateOne(query, {
      $set: { role: "user", updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Trainer demoted to standard user.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/classes - Fetch all classes
app.get("/api/admin/classes", async (req, res) => {
  try {
    const classesList = await db.collection("classes").find({}).sort({ createdAt: -1 }).toArray();
    const formatted = classesList.map((c) => ({
      ...c,
      id: c._id.toString(),
      status: c.status || "Approved",
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/classes/:id/status - Approve or Reject class
app.patch("/api/admin/classes/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
    await db.collection("classes").updateOne(query, {
      $set: { status, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: `Class status updated to ${status}.`,
      status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/classes/:id - Delete class
app.delete("/api/admin/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("classes").deleteOne(query);

    res.json({
      success: true,
      message: "Class deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/forum - Add Admin Forum Post
app.post("/api/admin/forum", async (req, res) => {
  try {
    const { title, image, description, category, authorName, authorImage, authorRole } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, error: "Title and Description are required." });
    }

    const postDoc = {
      title,
      image: image || "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=800&auto=format&fit=crop",
      description,
      category: category || "General",
      authorName: authorName || "Admin",
      authorRole: authorRole || "Admin",
      authorImage: authorImage || "https://i.pravatar.cc/150?u=admin",
      likes: 0,
      dislikes: 0,
      commentsCount: 0,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      readTime: "3 min read",
      createdAt: new Date(),
    };

    const result = await db.collection("forums").insertOne(postDoc);
    await db.collection("forum_posts").insertOne(postDoc);

    res.status(201).json({
      success: true,
      message: "Forum post published successfully!",
      id: result.insertedId.toString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/forum/:id - Moderate/Delete forum post
app.delete("/api/admin/forum/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("forums").deleteOne(query);
    await db.collection("forum_posts").deleteOne(query);
    await db.collection("forum_comments").deleteMany({ postId: id });

    res.json({
      success: true,
      message: "Forum post deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/transactions - Payment histories
app.get("/api/admin/transactions", async (req, res) => {
  try {
    const bookings = await db.collection("bookings").find({}).sort({ bookedAt: -1 }).toArray();

    const formatted = bookings.map((b) => ({
      id: b._id.toString(),
      transactionId: b.transactionId || `tx_str_${b._id.toString().slice(-8)}`,
      userEmail: b.userEmail || b.email || "user@example.com",
      userName: b.userName || b.name || "Member",
      className: b.className || "Fitness Class",
      amount: b.price || 29.99,
      date: b.bookedAt ? new Date(b.bookedAt).toLocaleDateString() : new Date().toLocaleDateString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ----------------------------------------------------
// TRAINER DASHBOARD ENDPOINTS
// ----------------------------------------------------

// GET /api/trainer/stats - Trainer Overview Statistics
app.get("/api/trainer/stats", async (req, res) => {
  try {
    const { trainerId, email } = req.query;

    let classFilter = {};
    if (trainerId && email) {
      classFilter = { $or: [{ trainerId }, { trainerEmail: email }, { trainerName: email }] };
    } else if (trainerId) {
      classFilter = { $or: [{ trainerId }, { "trainer.id": trainerId }] };
    } else if (email) {
      classFilter = { trainerEmail: email };
    }

    const trainerClasses = await db.collection("classes").find(classFilter).toArray();
    const totalClassesCreated = trainerClasses.length;

    const classIds = trainerClasses.map((c) => c._id.toString());
    const classIdQueries = trainerClasses.map((c) => c.id).filter(Boolean);
    const allIds = [...classIds, ...classIdQueries];

    let totalStudentsEnrolled = 0;
    if (allIds.length > 0) {
      totalStudentsEnrolled = await db.collection("bookings").countDocuments({
        classId: { $in: allIds },
      });
    }

    res.json({
      success: true,
      data: {
        totalClassesCreated,
        totalStudentsEnrolled,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/trainer/classes - Get trainer's owned classes
app.get("/api/trainer/classes", async (req, res) => {
  try {
    const { trainerId, email } = req.query;

    let filter = {};
    if (trainerId && email) filter = { $or: [{ trainerId }, { trainerEmail: email }] };
    else if (trainerId) filter = { trainerId };
    else if (email) filter = { trainerEmail: email };

    const classesList = await db.collection("classes").find(filter).sort({ createdAt: -1 }).toArray();

    // Get student count for each class
    const formatted = await Promise.all(
      classesList.map(async (c) => {
        const id = c._id.toString();
        const altId = c.id;
        const enrolledCount = await db.collection("bookings").countDocuments({
          classId: { $in: [id, altId].filter(Boolean) },
        });

        return {
          ...c,
          id,
          status: c.status || "Pending",
          enrolledCount,
        };
      })
    );

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/trainer/classes - Create new class (Default Status: "Pending")
app.post("/api/trainer/classes", async (req, res) => {
  try {
    const {
      className,
      image,
      category,
      difficulty,
      duration,
      schedule,
      price,
      description,
      trainerId,
      trainerEmail,
      trainerName,
    } = req.body;

    if (!className || !price) {
      return res.status(400).json({ success: false, error: "Class Name and Price are required." });
    }

    if (await isUserBlocked(trainerId, trainerEmail)) {
      return res.status(403).json({ success: false, error: "Action restricted by Admin" });
    }

    const newClassDoc = {
      className,
      image: image || "https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=800&auto=format&fit=crop",
      category: category || "General",
      difficulty: difficulty || "Intermediate",
      duration: duration || "60 mins",
      schedule: schedule || "Monday, Wednesday • 9:00 AM",
      price: Number(price) || 29.99,
      description: description || "",
      status: "Pending", // Note: Newly added classes must have a default status of "Pending"
      trainerId: trainerId || null,
      trainerEmail: trainerEmail || null,
      trainerName: trainerName || "Certified Trainer",
      bookingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("classes").insertOne(newClassDoc);

    res.status(201).json({
      success: true,
      message: "Class created successfully! Status is set to Pending awaiting Admin approval.",
      id: result.insertedId.toString(),
      status: "Pending",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/trainer/classes/:id - Update class details
app.patch("/api/trainer/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { className, image, category, difficulty, duration, schedule, price, description } = req.body;

    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("classes").updateOne(query, {
      $set: {
        className,
        image,
        category,
        difficulty,
        duration,
        schedule,
        price: Number(price),
        description,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, message: "Class updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/trainer/classes/:id - Delete trainer's class
app.delete("/api/trainer/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("classes").deleteOne(query);

    res.json({ success: true, message: "Class deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/trainer/classes/:id/students - View names and emails of booked students
app.get("/api/trainer/classes/:id/students", async (req, res) => {
  try {
    const { id } = req.params;

    const bookings = await db.collection("bookings")
      .find({ classId: { $in: [id, id.toString()] } })
      .sort({ bookedAt: -1 })
      .toArray();

    const students = bookings.map((b) => ({
      id: b._id.toString(),
      name: b.userName || b.name || "Enrolled Student",
      email: b.userEmail || b.email || "student@example.com",
      bookedAt: b.bookedAt ? new Date(b.bookedAt).toLocaleDateString() : new Date().toLocaleDateString(),
    }));

    res.json({ success: true, count: students.length, data: students });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/trainer/forum - Get trainer's own forum posts
app.get("/api/trainer/forum", async (req, res) => {
  try {
    const { trainerId, email } = req.query;

    let filter = {};
    if (trainerId && email) filter = { $or: [{ authorId: trainerId }, { authorEmail: email }, { authorName: email }] };
    else if (trainerId) filter = { authorId: trainerId };
    else if (email) filter = { authorEmail: email };

    const posts = await db.collection("forums").find(filter).sort({ createdAt: -1 }).toArray();

    const formatted = posts.map((p) => ({
      ...p,
      id: p._id.toString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/trainer/forum/:id - Delete trainer's own forum post
app.delete("/api/trainer/forum/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };

    await db.collection("forums").deleteOne(query);
    await db.collection("forum_posts").deleteOne(query);
    await db.collection("forum_comments").deleteMany({ postId: id });

    res.json({ success: true, message: "Forum post deleted successfully." });
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
