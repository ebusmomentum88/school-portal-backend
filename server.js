import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from your frontend
app.use(cors({
  origin: "https://school-portal-d9om.vercel.app"
}));
app.use(bodyParser.json());

// File uploads
const upload = multer({ storage: multer.memoryStorage() });

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==========================
// CLASSES & SUBJECTS
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
// ADMIN: Create Teacher
// ==========================
app.post("/api/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id, subject_ids } = req.body;
    if (!surname || !first_name) return res.status(400).json({ error: "surname & first_name required" });

    // Create auth user
    const username = surname.toLowerCase() + Math.floor(100 + Math.random() * 900);
    const password = "teacher";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: `${username}@school.com`,
      password,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    // Insert teacher record
    const { data: teacher, error: teacherErr } = await supabase.from("teachers")
      .insert({ first_name, surname, assigned_class_id }).select().single();
    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    // Link to app_users
    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 2,
      ref_id: teacher.id
    });

    // Link subjects
    for (const sid of subject_ids || []) {
      await supabase.from("teacher_subjects").insert({ teacher_id: teacher.id, subject_id: sid });
    }

    res.json({ username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating teacher" });
  }
});

// ==========================
// ADMIN: Create Student
// ==========================
app.post("/api/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender } = req.body;
    if (!first_name || !surname || !class_id) return res.status(400).json({ error: "first_name, surname, class_id required" });

    // Generate student_number
    const { data: lastStudent } = await supabase.from("students").select("student_number").order("id", { ascending: false }).limit(1).single();
    const number = lastStudent ? parseInt(lastStudent.student_number) + 1 : 1;
    const student_number = number.toString().padStart(4, "0");
    const password = "student";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: `${student_number}@school.com`,
      password,
      email_confirm: true
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase.from("students").insert({
      first_name, surname, class_id, gender, student_number
    }).select().single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username: student_number,
      role_id: 3,
      ref_id: student.id
    });

    res.json({ username: student_number, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
  }
});

// ==========================
// UPLOAD LESSON NOTES
// ==========================
app.post("/api/upload-note", upload.single("file"), async (req, res) => {
  try {
    const { teacher_id, subject_id, class_id, title } = req.body;
    if (!req.file) return res.status(400).json({ error: "File required" });

    const { data, error } = await supabase.storage.from("lesson_notes")
      .upload(`${Date.now()}_${req.file.originalname}`, req.file.buffer, { contentType: req.file.mimetype });
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("lesson_notes").insert({
      teacher_id, subject_id, class_id, title, file_path: data.path
    });

    res.json({ message: "Lesson note uploaded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ==========================
// CBT Submission
// ==========================
app.post("/api/submit-cbt", async (req, res) => {
  try {
    const { cbt_id, student_id, answers } = req.body;
    if (!cbt_id || !student_id || !answers) return res.status(400).json({ error: "cbt_id, student_id, answers required" });

    const { data: questions } = await supabase.from("cbt_questions").select("*").eq("cbt_id", cbt_id);
    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i]?.toString().toLowerCase() === q.correct_answer.toString().toLowerCase()) score++;
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

    await supabase.from("cbt_submissions").insert({ cbt_id, student_id, answers, score: percentage, grade });

    res.json({ score: percentage, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CBT submission failed" });
  }
});

// ==========================
// Start Server
// ==========================
app.listen(PORT, () => {
  console.log(`School portal backend running on port ${PORT}`);
});







