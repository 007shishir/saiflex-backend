# SaiFlex Backend Server (`saiflex_backend`)

Express.js REST API server for SaiFlex running on **`http://localhost:5000`** connected to MongoDB Atlas (`saiflex-db`).

## Setup & Running

1. **Install Dependencies**:
   ```bash
   cd c:\projects\saiflex_backend
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```
   Or run in watch mode:
   ```bash
   npm run dev
   ```

3. **Server Info**:
   - **URL**: `http://localhost:5000`
   - **Health Check**: `GET http://localhost:5000/`
   - **API Endpoints**:
     - `GET /api/classes` - Fetch classes from MongoDB Atlas
     - `GET /api/classes/:id` - Fetch single class details
     - `POST /api/classes` - Create new fitness class
     - `PATCH /api/classes/:id/status` - Admin approve/reject class status
     - `DELETE /api/classes/:id` - Delete class
     - `GET /api/forum` - Fetch forum posts
     - `POST /api/forum` - Create new forum post
     - `GET /api/users` - Fetch user list and roles (`user`, `trainer`, `admin`)
