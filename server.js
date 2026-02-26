// server.js
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { query, pool } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized");
} else {
  console.log("⚠️ Firebase Admin not initialized");
} // ========== Middleware: Verify Firebase Token ==========
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    req.user = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ========== Health Check Endpoints ==========
app.get("/api/health-check", (req, res) => {
  res.json({
    status: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    res.json({
      status: "Database connected",
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      status: "Database connection failed",
      error: error.message,
    });
  }
});

// ========== Authentication Routes ==========

// Register user with Firebase (called after Firebase Auth signup)
app.post("/api/auth/firebase-register", verifyToken, async (req, res) => {
  try {
    const { name, age, weight, height, gender } = req.body;
    const { firebaseUid, email } = req.user;

    // Check if user already exists
    let userCheck = await pool.query(
      "SELECT * FROM users WHERE firebase_uid = $1",
      [firebaseUid],
    );

    if (userCheck.rows.length > 0) {
      return res.json({
        success: true,
        message: "User already exists",
        user: userCheck.rows[0],
      });
    }

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, name, age, weight, height, gender, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
       RETURNING user_id, firebase_uid, email, name, age, weight, height`,
      [firebaseUid, email, name, age, weight, height, gender || "male"],
    );

    res.json({
      success: true,
      message: "User registered successfully",
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Firebase token
app.post("/api/auth/verify-firebase", async (req, res) => {
  try {
    const { firebaseToken } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    // Get or create user
    let user = await pool.query("SELECT * FROM users WHERE firebase_uid = $1", [
      firebaseUid,
    ]);

    if (user.rows.length === 0) {
      // Auto-create user if not exists
      user = await pool.query(
        `INSERT INTO users (firebase_uid, email, name, created_at) 
         VALUES ($1, $2, $3, NOW()) 
         RETURNING *`,
        [firebaseUid, email, email.split("@")[0]],
      );
    }

    res.json({
      success: true,
      token: firebaseToken,
      user: user.rows[0],
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Get current user profile
app.get("/api/auth/me", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, firebase_uid, email, name, age, weight, height, gender, created_at FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
app.put("/api/auth/profile", verifyToken, async (req, res) => {
  try {
    const { name, age, weight, height } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET name = $1, age = $2, weight = $3, height = $4, updated_at = NOW()
       WHERE firebase_uid = $5
       RETURNING user_id, email, name, age, weight, height`,
      [name, age, weight, height, req.user.firebaseUid],
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user account
app.delete("/api/auth/account", verifyToken, async (req, res) => {
  try {
    // Delete all user data
    await pool.query(
      "DELETE FROM massage_sessions WHERE user_id = (SELECT user_id FROM users WHERE firebase_uid = $1)",
      [req.user.firebaseUid],
    );
    await pool.query(
      "DELETE FROM preferences WHERE user_id = (SELECT user_id FROM users WHERE firebase_uid = $1)",
      [req.user.firebaseUid],
    );
    await pool.query("DELETE FROM users WHERE firebase_uid = $1", [
      req.user.firebaseUid,
    ]);

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Massage Session Routes ==========

// Save massage session
app.post("/api/sessions", verifyToken, async (req, res) => {
  try {
    const {
      level,
      duration,
      heatEnabled,
      rotateEnabled,
      caloriesBurned,
      notes,
      startedAt,
      endedAt,
    } = req.body;

    // Get user_id
    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    // Convert timestamps
    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);

    const result = await pool.query(
      `INSERT INTO massage_sessions 
       (user_id, level, duration, heat_enabled, rotate_enabled, calories_burned, notes, started_at, ended_at, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
       RETURNING *`,
      [
        userId,
        level,
        duration,
        heatEnabled,
        rotateEnabled,
        caloriesBurned,
        notes,
        startDate,
        endDate,
      ],
    );

    res.json({
      success: true,
      message: "Session saved successfully",
      session: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get massage sessions
app.get("/api/sessions", verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    const result = await pool.query(
      `SELECT session_id, level, duration, heat_enabled as "heatEnabled", 
              rotate_enabled as "rotateEnabled", calories_burned as "caloriesBurned", 
              notes, started_at as "startedAt", ended_at as "endedAt"
       FROM massage_sessions 
       WHERE user_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    res.json({
      success: true,
      count: result.rows.length,
      sessions: result.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session statistics
app.get("/api/sessions/statistics", verifyToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_sessions,
        SUM(duration) as total_minutes,
        SUM(calories_burned) as total_calories,
        AVG(level) as avg_level,
        SUM(CASE WHEN heat_enabled THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100 as heat_usage_percent
       FROM massage_sessions 
       WHERE user_id = $1 AND started_at >= NOW() - INTERVAL '${days} days'`,
      [userId],
    );

    const stats = result.rows[0];

    res.json({
      success: true,
      statistics: {
        totalSessions: parseInt(stats.total_sessions) || 0,
        totalMinutes: parseInt(stats.total_minutes) || 0,
        totalCalories: parseInt(stats.total_calories) || 0,
        avgLevel: parseFloat(stats.avg_level) || 0,
        heatUsagePercent: parseInt(stats.heat_usage_percent) || 0,
        dateRange: days,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Preferences Routes ==========

// Get user preferences
app.get("/api/preferences", verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    let result = await pool.query(
      "SELECT * FROM preferences WHERE user_id = $1",
      [userId],
    );

    // Create default preferences if not exists
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO preferences 
         (user_id, favorite_level, default_duration, enable_heat_by_default, enable_notifications, notification_time, theme, language, created_at) 
         VALUES ($1, 3, 15, false, true, '20:00', 'light', 'vi', NOW()) 
         RETURNING *`,
        [userId],
      );
    }

    const prefs = result.rows[0];

    res.json({
      success: true,
      preferences: {
        favoriteLevel: prefs.favorite_level,
        defaultDuration: prefs.default_duration,
        enableHeatByDefault: prefs.enable_heat_by_default,
        enableNotifications: prefs.enable_notifications,
        notificationTime: prefs.notification_time,
        theme: prefs.theme,
        language: prefs.language,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update preferences
app.put("/api/preferences", verifyToken, async (req, res) => {
  try {
    const {
      favoriteLevel,
      defaultDuration,
      enableHeatByDefault,
      enableNotifications,
      notificationTime,
      theme,
      language,
    } = req.body;

    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (favoriteLevel !== undefined) {
      updates.push(`favorite_level = $${paramCount++}`);
      values.push(favoriteLevel);
    }
    if (defaultDuration !== undefined) {
      updates.push(`default_duration = $${paramCount++}`);
      values.push(defaultDuration);
    }
    if (enableHeatByDefault !== undefined) {
      updates.push(`enable_heat_by_default = $${paramCount++}`);
      values.push(enableHeatByDefault);
    }
    if (enableNotifications !== undefined) {
      updates.push(`enable_notifications = $${paramCount++}`);
      values.push(enableNotifications);
    }
    if (notificationTime !== undefined) {
      updates.push(`notification_time = $${paramCount++}`);
      values.push(notificationTime);
    }
    if (theme !== undefined) {
      updates.push(`theme = $${paramCount++}`);
      values.push(theme);
    }
    if (language !== undefined) {
      updates.push(`language = $${paramCount++}`);
      values.push(language);
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `UPDATE preferences SET ${updates.join(", ")} WHERE user_id = $${paramCount}`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: "Preferences updated successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Analytics Route ==========
app.get("/api/analytics/summary", verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE firebase_uid = $1",
      [req.user.firebaseUid],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userResult.rows[0].user_id;

    const sessionStats = await pool.query(
      `SELECT 
        COUNT(*) as total_sessions,
        SUM(duration) as total_minutes,
        SUM(calories_burned) as total_calories,
        MODE() WITHIN GROUP (ORDER BY level) as most_used_level
       FROM massage_sessions 
       WHERE user_id = $1`,
      [userId],
    );

    const stats = sessionStats.rows[0];

    res.json({
      success: true,
      summary: {
        totalSessions: parseInt(stats.total_sessions) || 0,
        avgHeartRate: 0, // Removed health monitoring
        avgSpO2: 0, // Removed health monitoring
        mostUsedLevel: parseInt(stats.most_used_level) || 3,
        totalMinutes: parseInt(stats.total_minutes) || 0,
        totalCalories: parseInt(stats.total_calories) || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: {
      message: err.message || "Internal Server Error",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on ${PORT}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`\n📝 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/health-check`);
  console.log(`   GET  http://localhost:${PORT}/api/db-test`);
  console.log(`   POST http://localhost:${PORT}/api/auth/firebase-register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/verify-firebase`);
  console.log(`   GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`   POST http://localhost:${PORT}/api/sessions`);
  console.log(`   GET  http://localhost:${PORT}/api/sessions`);
  console.log(`   GET  http://localhost:${PORT}/api/preferences`);
});
