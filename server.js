import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// CORS — ALLOW ONLY YOUR FRONTEND
// =========================
app.use(cors({
  origin: [
    "https://school-portal-peach.vercel.app",
    "https://your-frontend-url.vercel.app",
    "http://localhost:5500"
  ]
}));

app.use(bodyParser.json());

// =========================
// SUPABASE CONNECTION
// =========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// API ROUTE PREFIX
// =========================
const api = express.Router();
app.use("/api", api);

// =========================
// GET CLASSES
// =========================
api.get("/classes", async (req, res) => {
  const { data, error } = await supabase.from("classes").select("*");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// =========================
// GET SUBJECTS
// =========================
api.get("/subjects", async (req, res) => {
  const { data, error } = await supabase.from("subjects").select("*");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// =========================
// CREATE TEACHER
// =========================
api.post("/create-teacher", async (req, res) => {
  try {
    const { surname, first_name, assigned_class_id, subject_ids } = req.body;

    if (!surname || !first_name)
      return res.status(400).json({ error: "surname & first_name required" });

    const username = surname.toLowerCase() + Math.floor(100 + Math.random() * 900);

    const { data: userData, error: authErr } =
      await supabase.auth.admin.createUser({
        email: `${username}@school.com`,
        password: "teacher",
        email_confirm: true
      });

    if (authErr) return res.status(400).json({ error: authErr.message });

    const { data: teacher, error: insertErr } = await supabase
      .from("teachers")
      .insert({ surname, first_name, assigned_class_id })
      .select()
      .single();

    if (insertErr) return res.status(400).json({ error: insertErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 2,
      ref_id: teacher.id
    });

    for (const sub of subject_ids) {
      await supabase.from("teacher_subjects").insert({
        teacher_id: teacher.id,
        subject_id: sub
      });
    }

    res.json({ username, password: "teacher" });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// CREATE STUDENT
// =========================
api.post("/create-student", async (req, res) => {
  try {
    const { first_name, surname, class_id, gender } = req.body;

    const username = Date.now().toString().slice(-4);

    const { data: userData, error: authErr } =
      await supabase.auth.admin.createUser({
        email: `${username}@school.com`,
        password: "student",
        email_confirm: true
      });

    if (authErr) return res.status(400).json({ error: authErr.message });

    const { data: student, error: studentErr } = await supabase
      .from("students")
      .insert({
        first_name,
        surname,
        class_id,
        gender,
        student_number: username
      })
      .select()
      .single();

    if (studentErr) return res.status(400).json({ error: studentErr.message });

    await supabase.from("app_users").insert({
      auth_uid: userData.user.id,
      username,
      role_id: 3,
      ref_id: student.id
    });

    res.json({ username, password: "student" });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// CBT SUBMISSION
// =========================
api.post("/submit-cbt", async (req, res) => {
  const { cbt_id, student_id, answers } = req.body;

  const { data: questions } = await supabase
    .from("cbt_questions")
    .select("*")
    .eq("cbt_id", cbt_id);

  let score = 0;
  questions.forEach((q, i) => {
    if (answers[i] == q.correct_answer) score++;
  });

  const percent = Math.round((score / questions.length) * 100);

  res.json({ score: percent, grade: percent > 70 ? "A" : "F" });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => console.log("Backend running on PORT", PORT));







