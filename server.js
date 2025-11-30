// server.js
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
// FRONTEND URL
// ==========================
const FRONTEND_URL = process.env.FRONTEND_URL || "https://school-portal-d9om.vercel.app";

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors({
  origin: FRONTEND_URL,
}));
app.use(bodyParser.json());

// ==========================
// MULTER SETUP (file uploads)
// ==========================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ==========================
// SUPABASE CLIENT
// ==========================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==========================
// HELPER FUNCTIONS
// ==========================
function generateTeacherUsername(surname) {
  const randomNum = Math.floor(100 + Math.random() * 900);
  return surname.toLowerCase() + randomNum;
}

let studentCounter = 1;
async function generateStudentUsername() {
  const { data } = await supabase
    .from("students")
    .select("student_number")
    .order("student_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data && data.student_number) {
    studentCounter = parseInt(data.student_number) + 1;
  }
  return studentCounter.toString().padStart(4, "0");
}

// ==========================
// ROUTES
// ==========================

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Backend is running" });
});

// Create teacher
app.post("/api/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id = null, subject_ids = [] } = req.body;
    if (!surname || !first_name) return res.status(400).json({ error: "surname & first_name required" });

    const username = generateTeacherUsername(surname);
    const defaultPassword = "teacher";

    // create auth user
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });

    if (authErr) return res.status(500).json({ error: authErr.message });

    // insert teacher record
    const { data: teacher, error: teacherErr } = await supabase
      .from("teachers")
      .insert({ first_name, surname, assigned_class_id })
      .select()
      .single();

    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    // link teacher to app_users
    const { error: appUserErr } = await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 2, // teacher
      ref_id: teacher.id
    });

    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    // insert teacher_subjects
    for (const subject_id of subject_ids) {
      await supabase.from("teacher_subjects").insert({ teacher_id: teacher.id, subject_id });
    }

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating teacher" });
  }
});

// Create student
app.post("/api/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender = "M" } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    const username = await generateStudentUsername();
    const defaultPassword = "student";

    // create auth user
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });

    if (authErr) return res.status(500).json({ error: authErr.message });

    // insert student record
    const { data: student, error: studentErr } = await supabase.from("students").insert({
      first_name,
      surname,
      class_id,
      gender,
      student_number: username
    }).select().single();

    if (studentErr) return res.status(500).json({ error: studentErr.message });

    // link student to app_users
    const { error: appUserErr } = await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 3, // student
      ref_id: student.id
    });

    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
  }
});

// Upload lesson note
app.post("/api/upload-note", upload.single("file"), async (req, res) => {
  try {
    const { class_id, subject_id, title, teacher_id } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("lesson_notes")
      .upload(`${Date.now()}_${req.file.originalname}`, req.file.buffer);

    if (error) return res.status(500).json({ error: error.message });

    // Save record in DB
    await supabase.from("lesson_notes").insert({
      teacher_id,
      subject_id,
      class_id,
      title,
      file_path: data.path
    });

    res.json({ message: "Note uploaded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error uploading note" });
  }
});

// Submit CBT
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

    // compute WAEC grade
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

    await supabase.from("cbt_submissions").insert({
      cbt_id,
      student_id,
      answers,
      score: percentage,
      grade
    });

    res.json({ score: percentage, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error submitting CBT" });
  }
});

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => {
  console.log(`School portal backend running on port ${PORT}`);
});








