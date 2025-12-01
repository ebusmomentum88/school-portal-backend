// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

// ==========================
// CONFIG
// ==========================
const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = "https://school-portal-chi-five.vercel.app";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ==========================
// INIT
// ==========================
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==========================
// MIDDLEWARE
// ==========================
app.use(bodyParser.json());
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST"]
}));
const upload = multer({ storage: multer.memoryStorage() });

// ==========================
// ROUTES
// ==========================

// Test route
app.get("/api", (req, res) => res.json({ msg: "Backend running" }));

// ===== CLASSES =====
app.get("/api/classes", async (req, res) => {
  const { data, error } = await supabase.from("classes").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ===== SUBJECTS =====
app.get("/api/subjects", async (req, res) => {
  const { data, error } = await supabase.from("subjects").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ===== CREATE TEACHER =====
app.post("/api/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id = null, subject_ids = [] } = req.body;
    if (!surname || !first_name) return res.status(400).json({ error: "surname & first_name required" });

    const username = surname.toLowerCase() + Math.floor(100 + Math.random() * 900);
    const password = "teacher";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: teacher, error: teacherErr } = await supabase.from("teachers").insert({
      first_name, surname, assigned_class_id
    }).select().single();
    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 2,
      ref_id: teacher.id
    });

    for (const subject_id of subject_ids) {
      await supabase.from("teacher_subjects").insert({ teacher_id: teacher.id, subject_id });
    }

    res.json({ username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating teacher" });
  }
});

// ===== CREATE STUDENT =====
let studentCounter = 1;
app.post("/api/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender = "M" } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    const { data: lastStudent } = await supabase.from("students")
      .select("student_number").order("student_number", { ascending: false }).limit(1).maybeSingle();
    if (lastStudent?.student_number) studentCounter = parseInt(lastStudent.student_number) + 1;
    const username = studentCounter.toString().padStart(4, "0");
    const password = "student";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase.from("students").insert({
      first_name, surname, class_id, gender, student_number: username
    }).select().single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 3,
      ref_id: student.id
    });

    studentCounter += 1;
    res.json({ username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating student" });
  }
});

// ===== CBT SUBMISSION =====
app.post("/api/submit-cbt", async (req, res) => {
  try {
    const { cbt_id, student_id, answers } = req.body;
    if (!cbt_id || !student_id || !answers) return res.status(400).json({ error: "cbt_id, student_id, answers required" });

    const { data: questions, error: qErr } = await supabase.from("cbt_questions").select("*").eq("cbt_id", cbt_id);
    if (qErr) return res.status(500).json({ error: qErr.message });

    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i]?.toString().toLowerCase() === q.correct_answer.toString().toLowerCase()) score += 1;
    });

    const totalQuestions = questions.length;
    const percentage = totalQuestions ? Math.round((score / totalQuestions) * 100) : 0;

    let grade;
    if (percentage >= 75) grade = "A1";
    else if (percentage >= 70) grade = "B2";
    else if (percentage >= 65) grade = "B3";
    else if (percentage >= 60) grade = "C4";
    else if (percentage >= 55) grade = "C5";
    else if (percentage >= 50) grade = "C6";
    else if (percentage >= 45) grade = "D7";
    else if (percentage >= 40) grade = "E8";
    else grade = "F9";

    const { data, error: subErr } = await supabase.from("cbt_submissions").insert({
      cbt_id, student_id, answers, score: percentage, grade
    }).select().single();
    if (subErr) return res.status(500).json({ error: subErr.message });

    res.json({ score: percentage, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error submitting CBT" });
  }
});

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => {
  console.log(`School portal backend running on port ${PORT}`);
});











