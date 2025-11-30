// =========================
// FINAL WORKING SERVER.JS
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(express.json());

// =========================
// CORS SETUP — ADD YOUR FRONTEND URL HERE
// =========================
app.use(
  cors({
    origin: [
      "http://localhost:5173",        // Local development
      "https://school-portal-d9om.vercel.app" 
    ],
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type, Authorization"
  })
);

// =========================
// SUPABASE CLIENTS
// =========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // needed for creating logins
);

const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// =========================
// ADMIN — CREATE TEACHER ACCOUNT
// =========================
app.post("/admin/create-teacher", async (req, res) => {
  try {
    const { name, email, password, subject } = req.body;

    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "teacher", name, subject }
      });

    if (authError) throw authError;

    res.json({ success: true, user: authUser });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================
// ADMIN — CREATE STUDENT ACCOUNT
// =========================
app.post("/admin/create-student", async (req, res) => {
  try {
    const { name, classLevel } = req.body;

    // generate student ID (0001 format)
    const studentID = Math.floor(1000 + Math.random() * 9000);

    const email = `student${studentID}@school.com`;
    const password = "123456"; // default password

    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "student",
          name,
          classLevel,
          studentID
        }
      });

    if (authError) throw authError;

    res.json({
      success: true,
      studentID,
      defaultPassword: password,
      user: authUser
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================
// LOGIN HANDLER (ALL ROLES)
// =========================
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    res.json({ success: true, user: data.user });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// =========================
// TEST ROUTE
// =========================
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));








