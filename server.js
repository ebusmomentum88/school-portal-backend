// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://school-portal-d9om.vercel.app/",
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads/" });

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
// ROUTES
// ==========================

// --- Classes & Subjects ---
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

// --- Admin: Create Teacher ---
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

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating teacher" });
  }
});

// --- Admin: Create Student ---
app.post("/api/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender = "M" } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    // Generate student_number
    let student_number = "0001";
    const { data: lastStudent } = await supabase.from("students").select("student_number").order("student_number", { ascending: false }).limit(1).maybeSingle();
    if (lastStudent && lastStudent.student_number) {
      student_number = (parseInt(lastStudent.student_number) + 1).toString().padStart(4, "0");
    }

    const defaultPassword = "student";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: student_number + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase.from("students").insert({
      first_name,
      surname,
      class_id,
      gender,
      student_number
    }).select().single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username: student_number,
      role_id: 3,
      ref_id: student.id
    });

    res.json({ username: student_number, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
  }
});

// --- CBT Submission ---
app.post("/api/submit-cbt", async (req, res) => {
  try {
    const { cbt_id, answers, student_id } = req.body;
    if (!cbt_id || !answers || !student_id) return res.status(400).json({ error: "cbt_id, answers, student_id required" });

    const { data: questions, error: qErr } = await supabase.from("cbt_questions").select("*").eq("cbt_id", cbt_id);
    if (qErr) return res.status(500).json({ error: qErr.message });

    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] && answers[i].toString().toLowerCase() === q.correct_answer.toString().toLowerCase()) score += 1;
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

    await supabase.from("cbt_submissions").insert({
      cbt_id,
      student_id,
      answers,
      score: percentage,
      grade
    }).select().single();

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






