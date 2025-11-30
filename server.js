import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// FRONTEND URL
// ==========================
const FRONTEND_URL = "https://school-portal-d9om.vercel.app/"; 

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors({ origin: FRONTEND_URL }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ==========================
// FILE UPLOAD SETUP
// ==========================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ==========================
// SUPABASE CLIENT
// ==========================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render env variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==========================
// ROUTES
// ==========================

// Test route
app.get("/api", (req, res) => res.json({ message: "Backend is live!" }));

// Fetch classes
app.get("/api/classes", async (req, res) => {
  const { data, error } = await supabase.from("classes").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Fetch subjects
app.get("/api/subjects", async (req, res) => {
  const { data, error } = await supabase.from("subjects").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create teacher
app.post("/api/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id, subject_ids } = req.body;
    if (!surname || !first_name) return res.status(400).json({ error: "surname & first_name required" });

    const username = surname.toLowerCase() + Math.floor(100 + Math.random() * 900);
    const defaultPassword = "teacher";

    // Create Supabase auth user
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    // Insert teacher
    const { data: teacher, error: teacherErr } = await supabase.from("teachers")
      .insert({ first_name, surname, assigned_class_id }).select().single();
    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    // Insert into app_users
    const { error: appUserErr } = await supabase.from("app_users")
      .insert({ auth_uid: userData.user.id, username, role_id: 2, ref_id: teacher.id });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    // Link teacher subjects
    for (const subject_id of subject_ids || []) {
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
    const { first_name, surname, class_id, gender } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    // Generate student number
    const { data: lastStudent } = await supabase.from("students").select("student_number").order("student_number", { ascending: false }).limit(1).maybeSingle();
    let studentNumber = lastStudent?.student_number ? String(parseInt(lastStudent.student_number) + 1).padStart(4, "0") : "0001";

    const defaultPassword = "student";

    // Create Supabase auth user
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: studentNumber + "@school.com",
      password: defaultPassword,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    // Insert student
    const { data: student, error: studentErr } = await supabase.from("students")
      .insert({ first_name, surname, class_id, gender, student_number: studentNumber }).select().single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    // Insert into app_users
    const { error: appUserErr } = await supabase.from("app_users")
      .insert({ auth_uid: userData.user.id, username: studentNumber, role_id: 3, ref_id: student.id });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    res.json({ username: studentNumber, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
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

    const percentage = questions.length ? Math.round((score / questions.length) * 100) : 0;
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
    res.status(500).json({ error: "Server error submitting CBT" });
  }
});

// Start server
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));









