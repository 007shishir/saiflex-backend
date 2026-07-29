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


// ----------------------------------------------------
// FORUM ENDPOINTS
// ----------------------------------------------------

// GET /api/forum - Fetch forum posts
app.get("/api/forum", async (req, res) => {
  try {
    const posts = await db.collection("forum_posts").find({}).sort({ createdAt: -1 }).toArray();
    const formatted = posts.map((item) => ({
      ...item,
      id: item._id.toString(),
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
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
