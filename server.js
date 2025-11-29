import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// JWT auth
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(403).json({ message: "Invalid token" }); }
}
function authorize(roles = []) { return (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  next();
};}

// LOGIN
app.post("/auth/login", async (req,res)=>{
  const { username, password } = req.body;
  const { data: users } = await supabase.from("users").select("*").eq("username", username);
  const user = users[0];
  if(!user || user.password !== password) return res.status(401).json({message:"Invalid credentials"});
  const token = jwt.sign({ id:user.id, role:user.role }, JWT_SECRET, { expiresIn:"8h" });
  res.json({ token, user });
});

// UPLOAD ASSIGNMENT
app.post("/assignments", authenticate, authorize(["teacher"]), upload.single("file"), async (req,res)=>{
  const { title } = req.body; const file = req.file;
  if(!file) return res.status(400).json({message:"No file uploaded"});
  const fileName = `${Date.now()}_${file.originalname}`;
  const { data, error } = await supabase.storage.from("assignments").upload(fileName, file.buffer, { contentType:file.mimetype });
  if(error) return res.status(500).json({message:error.message});
  const { data: assignmentData, error: tableError } = await supabase.from("assignments").insert([{ title, file_url: data.path, teacher_id: req.user.id }]).select();
  if(tableError) return res.status(500).json({message: tableError.message});
  res.json(assignmentData[0]);
});

// UPLOAD NOTE
app.post("/notes", authenticate, authorize(["teacher"]), upload.single("file"), async (req,res)=>{
  const { title } = req.body; const file = req.file;
  if(!file) return res.status(400).json({message:"No file uploaded"});
  const fileName = `${Date.now()}_${file.originalname}`;
  const { data, error } = await supabase.storage.from("notes").upload(fileName, file.buffer, { contentType:file.mimetype });
  if(error) return res.status(500).json({message:error.message});
  const { data: noteData, error: tableError } = await supabase.from("notes").insert([{ title, file_url: data.path, teacher_id: req.user.id }]).select();
  if(tableError) return res.status(500).json({message: tableError.message});
  res.json(noteData[0]);
});

// Other endpoints (fees, attendance, timetable, reportcards) remain as in previous server.js

app.listen(PORT,()=>{console.log(`Server running on port ${PORT}`);});

