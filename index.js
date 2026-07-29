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
