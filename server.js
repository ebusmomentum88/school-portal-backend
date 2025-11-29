import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

// =========================================
// Config
// =========================================
const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your frontend URL
const FRONTEND_URL = "https://school-portal-peach.vercel.app";

// Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(bodyParser.json());

// Supabase service client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =========================================
// Helpers
// =========================================
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

// =========================================
// Endpoints
// =========================================

// Create Teacher
app.post("/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id = null, subject_ids = [] } =
      req.body;
    if (!surname || !first_name)
      return res.status(400).json({ error: "surname & first_name required" });

    const username = generateTeacherUsername(surname);
    const defaultPassword = "teacher";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true,
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: teacher, error: teacherErr } = await supabase
      .from("teachers")
      .insert({ first_name, surname, assigned_class_id })
      .select()
      .single();
    if (teacherErr) return res.status(500).json({ error: teacherErr.message });

    const { error: appUserErr } = await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 2,
      ref_id: teacher.id,
    });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    for (const subject_id of subject_ids) {
      await supabase.from("teacher_subjects").insert({
        teacher_id: teacher.id,
        subject_id,
      });
    }

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating teacher" });
  }
});

// Create Student
app.post("/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender = "M" } = req.body;
    if (!first_name || !surname || !class_id)
      return res
        .status(400)
        .json({ error: "first_name, surname, class_id required" });

    const username = await generateStudentUsername();
    const defaultPassword = "student";

    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: username + "@school.com",
      password: defaultPassword,
      email_confirm: true,
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase
      .from("students")
      .insert({
        first_name,
        surname,
        class_id,
        gender,
        student_number: username,
      })
      .select()
      .single();
    if (studentErr) return res.status(500).json({ error: studentErr.message });

    const { error: appUserErr } = await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 3,
      ref_id: student.id,
    });
    if (appUserErr) return res.status(500).json({ error: appUserErr.message });

    res.json({ username, password: defaultPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating student" });
  }
});

// Submit CBT
app.post("/submit-cbt", async (req, res) => {
  try {
    const { cbt_id, answers, student_id } = req.body;
    if (!cbt_id || !answers || !student_id)
      return res
        .status(400)
        .json({ error: "cbt_id, answers, student_id required" });

    const { data: questions, error: qErr } = await supabase
      .from("cbt_questions")
      .select("*")
      .eq("cbt_id", cbt_id);
    if (qErr) return res.status(500).json({ error: qErr.message });

    let score = 0;
    questions.forEach((q, i) => {
      if (
        answers[i] &&
        answers[i].toString().toLowerCase() === q.correct_answer.toString().toLowerCase()
      )
        score += 1;
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

    const { data, error: subErr } = await supabase
      .from("cbt_submissions")
      .insert({
        cbt_id,
        student_id,
        answers,
        score: percentage,
        grade,
      })
      .select()
      .single();

    if (subErr) return res.status(500).json({ error: subErr.message });

    res.json({ score: percentage, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error submitting CBT" });
  }
});

// Root
app.get("/", (req, res) => {
  res.send("School Portal backend is running. Frontend URL: " + FRONTEND_URL);
});

// Start server
app.listen(PORT, () => {
  console.log(`School portal backend running on port ${PORT}`);
});





