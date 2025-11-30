// ==========================
// SERVER.JS - FULLY INTEGRATED
// ==========================
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// CORS - allow frontend URL
// ==========================
const FRONTEND_URL = process.env.FRONTEND_URL || "https://school-portal-d9om.vercel.app/";
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

// ==========================
// Middleware
// ==========================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ==========================
// Multer setup for file uploads
// ==========================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ==========================
// Supabase
// ==========================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==========================
// HELPER: WAEC grade computation
// ==========================
function computeGrade(total) {
  if (total >= 75) return "A1";
  if (total >= 70) return "B2";
  if (total >= 65) return "B3";
  if (total >= 60) return "C4";
  if (total >= 55) return "C5";
  if (total >= 50) return "C6";
  if (total >= 45) return "D7";
  if (total >= 40) return "E8";
  return "F9";
}

// ==========================
// ROUTES
// ==========================

// Test
app.get("/", (req, res) => {
  res.json({ message: "Backend is running!" });
});

// ==========================
// Classes & Subjects
// ==========================
app.get("/api/classes", async (req, res) => {
  const { data, error } = await supabase.from("classes").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/subjects", async (req, res) => {
  const { data, error } = await supabase.from("subjects").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==========================
// Admin: Create Teacher
// ==========================
app.post("/api/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id = null, subject_ids = [] } = req.body;
    if (!surname || !first_name) return res.status(400).json({ error: "surname & first_name required" });

    const username = surname.toLowerCase() + Math.floor(100 + Math.random() * 900);
    const defaultPassword = "teacher";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: teacher, error: teacherErr } = await supabase.from("teachers")
      .insert({ first_name, surname, assigned_class_id })
      .select().single();
    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    const { error: appUserErr } = await supabase.from("app_users")
      .insert({ auth_uid: userData.user.id, username, role_id: 2, ref_id: teacher.id });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    for (const subject_id of subject_ids) {
      await supabase.from("teacher_subjects").insert({ teacher_id: teacher.id, subject_id });
    }

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating teacher" });
  }
});

// ==========================
// Admin: Create Student
// ==========================
app.post("/api/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender = "M" } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    // Generate student number
    let studentCounter = 1;
    const { data: lastStudent } = await supabase.from("students").select("student_number").order("student_number", { ascending: false }).limit(1).maybeSingle();
    if (lastStudent && lastStudent.student_number) studentCounter = parseInt(lastStudent.student_number) + 1;
    const student_number = studentCounter.toString().padStart(4, "0");

    const defaultPassword = "student";
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: student_number + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase.from("students")
      .insert({ first_name, surname, class_id, gender, student_number })
      .select().single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    const { error: appUserErr } = await supabase.from("app_users")
      .insert({ auth_uid: userData.user.id, username: student_number, role_id: 3, ref_id: student.id });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    res.json({ username: student_number, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
  }
});

// ==========================
// CBT submission
// ==========================
app.post("/api/submit-cbt", async (req, res) => {
  try {
    const { cbt_id, student_id, answers } = req.body;
    if (!cbt_id || !student_id || !answers) return res.status(400).json({ error: "cbt_id, student_id, answers required" });

    const { data: questions, error: qErr } = await supabase.from("cbt_questions").select("*").eq("cbt_id", cbt_id);
    if (qErr) return res.status(500).json({ error: qErr.message });

    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] && answers[i].toString().toLowerCase() === q.correct_answer.toString().toLowerCase()) score += 1;
    });
    const totalQuestions = questions.length;
    const percentage = totalQuestions ? Math.round((score / totalQuestions) * 100) : 0;
    const grade = computeGrade(percentage);

    const { data, error: subErr } = await supabase.from("cbt_submissions")
      .insert({ cbt_id, student_id, answers, score: percentage, grade })
      .select().single();
    if (subErr) return res.status(500).json({ error: subErr.message });

    res.json({ score: percentage, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error submitting CBT" });
  }
});

// ==========================
// Notes upload example
// ==========================
app.post("/api/upload-note", upload.single("file"), async (req, res) => {
  try {
    const { teacher_id, subject_id, class_id, title } = req.body;
    if (!req.file) return res.status(400).json({ error: "File is required" });

    // Store file in Supabase Storage
    const { data, error: storageErr } = await supabase.storage
      .from("lesson_notes")
      .upload(`notes/${Date.now()}_${req.file.originalname}`, req.file.buffer, { upsert: true });
    if (storageErr) return res.status(500).json({ error: storageErr.message });

    const file_path = data.path;
    const { error: noteErr } = await supabase.from("lesson_notes")
      .insert({ teacher_id, subject_id, class_id, title, file_path });
    if (noteErr) return res.status(500).json({ error: noteErr.message });

    res.json({ message: "Note uploaded successfully", path: file_path });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error uploading note" });
  }
});

// ==========================
// Start server
// ==========================
app.listen(PORT, () => {
  console.log(`School portal backend running on port ${PORT}`);
});








