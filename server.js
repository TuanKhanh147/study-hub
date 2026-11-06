const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// JSON Database Helper
const getDbPath = (name) => path.join(DATA_DIR, `${name}.json`);

function readDb(name, defaultVal = []) {
  const file = getDbPath(name);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf-8');
    return defaultVal;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return defaultVal;
  }
}

function writeDb(name, data) {
  const file = getDbPath(name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// Ensure default admin/demo user
const users = readDb('users', []);
if (users.length === 0) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update('123456' + salt).digest('hex');
  users.push({
    id: 'user_demo',
    name: 'Sinh Viên Mẫu',
    email: 'sinhvien@hust.edu.vn',
    studentId: 'SV20268888',
    passwordHash: hash,
    salt: salt,
    createdAt: new Date().toISOString(),
    storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    geminiApiKey: ''
  });
  writeDb('users', users);
}

readDb('files', []);
readDb('quizzes', []);
readDb('results', []);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// Simple Token-based Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const [userId, expiresAt] = Buffer.from(token, 'base64').toString('utf-8').split(':');
    if (!userId || !expiresAt || parseInt(expiresAt) < Date.now()) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
    }
    const allUsers = readDb('users', []);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token xác thực không hợp lệ' });
  }
}

function createToken(userId) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  return Buffer.from(`${userId}:${expiresAt}`).toString('base64');
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userFolder = path.join(UPLOADS_DIR, req.user ? req.user.id : 'temp');
    if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });
    cb(null, userFolder);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const cleanName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, uniqueSuffix + '-' + cleanName.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per file
});

// Helper: Extract text from file (PDF, DOCX, TXT, MD, etc.)
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } catch (e) {
      console.warn('PDF parse fallback or error:', e.message);
      return fs.readFileSync(filePath, 'utf-8').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ' ');
    }
  }

  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (e) {
      console.warn('DOCX parse fallback or error:', e.message);
      return '';
    }
  }

  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return '';
  }
}

// Smart NLP Heuristic for Concept & Focus Extraction (Runs 100% offline!)
function offlineAnalyzeDocument(text, filename) {
  if (typeof text !== 'string') text = String(text || '');
  const lines = text.split(/\r?\n/).map(l => String(l || '').trim()).filter(l => l.length > 0);
  
  // 1. Overview summary
  let overview = `Tài liệu "${filename}" bao gồm khoảng ${lines.length} đoạn văn bản (${text.length} ký tự). Tài liệu cung cấp hệ thống kiến thức lý thuyết, bài tập và ví dụ minh họa phục vụ quá trình học tập và ôn thi chuyên sâu.`;
  const firstMeaningfulParagraphs = lines.slice(0, 5).filter(l => l.length > 30).slice(0, 2);
  if (firstMeaningfulParagraphs.length > 0) {
    overview += ' ' + firstMeaningfulParagraphs.join(' ');
  }

  // 2. Identify Core Concepts & Definitions
  const concepts = [];
  const conceptKeywords = ['là', 'được định nghĩa', 'khái niệm', 'nguyên lý', 'đặc điểm', 'ý nghĩa', 'vai trò', 'quy tắc'];
  
  for (const line of lines) {
    if (concepts.length >= 8) break;
    if (line.length > 25 && line.length < 300) {
      const lower = line.toLowerCase();
      const hasKeyword = conceptKeywords.some(k => lower.includes(k));
      const hasHeading = /^(chương|\d+\.|\*|-|bài|phần|[a-z]\))/i.test(line);
      if (hasKeyword || hasHeading) {
        // Format title & desc
        let term = line;
        let desc = line;
        if (line.includes(':')) {
          const parts = line.split(':');
          term = parts[0].trim();
          desc = parts.slice(1).join(':').trim() || term;
        } else if (line.toLowerCase().includes(' là ')) {
          const parts = line.split(/ là /i);
          term = parts[0].trim();
          desc = 'Là ' + parts.slice(1).join(' là ').trim();
        }
        concepts.push({
          term: String(term).substring(0, 60),
          description: String(desc).substring(0, 250),
          importance: concepts.length < 3 ? 'Cao' : 'Trung bình'
        });
      }
    }
  }

  // Fallback concepts if document was short
  if (concepts.length === 0) {
    const fallbackDesc = (lines[0] && lines[0].length < 250) ? lines[0] : 'Kiến thức cốt lõi của bài học';
    concepts.push({
      term: 'Nội dung trọng tâm',
      description: fallbackDesc,
      importance: 'Cao'
    });
  }

  // 3. Formulas / Key Rules
  const formulas = [];
  for (const line of lines) {
    if (formulas.length >= 5) break;
    if (/(=|\+|-|\*|\/|<|>|≤|≥|∑|∫|%|->|=>)/.test(line) && line.length > 5 && line.length < 150) {
      formulas.push({
        name: 'Quy tắc / Biểu thức ' + (formulas.length + 1),
        expression: line
      });
    }
  }
  if (formulas.length === 0) {
    formulas.push({
      name: 'Nguyên lý áp dụng',
      expression: 'Nắm vững định nghĩa cơ bản kết hợp giải bài tập minh họa mẫu.'
    });
  }

  // 4. Flashcards & Self-study Questions
  const flashcards = [];
  for (let i = 0; i < Math.min(concepts.length, 5); i++) {
    const c = concepts[i];
    flashcards.push({
      question: `Trình bày khái niệm và đặc điểm cốt lõi của "${c.term}"?`,
      answer: c.description
    });
  }

  // 5. Revision Plan
  const roadmap = [
    { phase: 'Giai đoạn 1 (30%)', task: 'Đọc kỹ các định nghĩa trọng tâm và ghi nhớ từ khóa quan trọng.' },
    { phase: 'Giai đoạn 2 (40%)', task: 'Luyện làm đề trắc nghiệm và giải các bài tập vận dụng trong tài liệu.' },
    { phase: 'Giai đoạn 3 (30%)', task: 'Tự kiểm tra bằng Flashcards và rà soát các câu sai để khắc phục lỗ hổng.' }
  ];

  return {
    overview,
    concepts,
    formulas,
    flashcards,
    roadmap,
    mode: 'offline_nlp'
  };
}

// Smart Parser for Multiple Choice Questions from Document
function parseQuizFromText(text) {
  const questions = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  let currentQ = null;
  const questionRegex = /^(câu\s*\d+[\.:\)]?|cau\s*\d+[\.:\)]?|bài\s*\d+[\.:\)]?|bai\s*\d+[\.:\)]?|\d+[\.:\)])\s*(.+)/i;
  const optionRegex = /^([a-d])[\.:\)]\s*(.+)/i;
  const answerRegex = /^(đáp án|dap an|đáp án đúng|dap an dung|key|answer|chọn|chon|da)[\s:]*([a-d])/i;
  const explanationRegex = /^(lời giải|loi giai|giải thích|giai thich|hướng dẫn|huong dan|explanation)[\s:]*(.+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if new Question
    const qMatch = line.match(questionRegex);
    if (qMatch) {
      if (currentQ && currentQ.options.length >= 2) {
        questions.push(finalizeQuestion(currentQ));
      }
      currentQ = {
        id: 'q_' + (questions.length + 1),
        question: line,
        options: [],
        correctAnswer: 'A', // default fallback
        explanation: 'Xem lại phần lý thuyết liên quan trong tài liệu học tập.'
      };
      continue;
    }

    // Check Options
    const optMatch = line.match(optionRegex);
    if (optMatch && currentQ) {
      const key = optMatch[1].toUpperCase();
      const content = optMatch[2].trim();
      currentQ.options.push({ key, text: content });
      continue;
    }

    // Check Answer
    const ansMatch = line.match(answerRegex);
    if (ansMatch && currentQ) {
      currentQ.correctAnswer = ansMatch[2].toUpperCase();
      continue;
    }

    // Check Explanation
    const expMatch = line.match(explanationRegex);
    if (expMatch && currentQ) {
      currentQ.explanation = expMatch[2].trim();
      continue;
    }

    // Append to previous context if multiline
    if (currentQ && currentQ.options.length === 0) {
      currentQ.question += ' ' + line;
    }
  }

  if (currentQ && currentQ.options.length >= 2) {
    questions.push(finalizeQuestion(currentQ));
  }

  // If the document wasn't a pre-made quiz file, generate dynamic questions from the content!
  if (questions.length === 0) {
    return generateDynamicQuizFromText(text);
  }

  return questions;
}

function finalizeQuestion(q) {
  // Ensure we have A, B, C, D
  const standardKeys = ['A', 'B', 'C', 'D'];
  while (q.options.length < 4) {
    const nextKey = standardKeys[q.options.length];
    q.options.push({
      key: nextKey,
      text: `Phương án khác hoặc chưa xác định (${nextKey})`
    });
  }
  return q;
}

// Generate dynamic multiple choice questions from plain notes
function generateDynamicQuizFromText(text) {
  if (typeof text !== 'string') text = String(text || '');
  const analysis = offlineAnalyzeDocument(text, 'Tài liệu');
  const questions = [];
  
  const pool = (analysis.concepts && analysis.concepts.length > 0) ? analysis.concepts : [
    { term: 'Khái niệm cốt lõi', description: 'Định nghĩa cơ bản đã nêu trong bài học' },
    { term: 'Nguyên lý hoạt động', description: 'Quy trình thực hiện theo thứ tự chuẩn' },
    { term: 'Ứng dụng thực tiễn', description: 'Phương pháp áp dụng vào bài toán thực tế' }
  ];

  for (let i = 0; i < Math.min(pool.length, 10); i++) {
    const item = pool[i];
    const itemDesc = (typeof item.description === 'string' ? item.description : 'Định nghĩa trọng tâm của bài học').substring(0, 200);
    const itemTerm = (typeof item.term === 'string' ? item.term : 'Khái niệm ' + (i + 1)).substring(0, 60);

    const otherItems = pool.filter((_, idx) => idx !== i);
    const distractors = otherItems.map(o => (typeof o.description === 'string' ? o.description : 'Phương án bổ sung').substring(0, 200)).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push('Không có phương án nào chính xác trong các câu trên.');
    }

    const options = [
      { key: 'A', text: itemDesc },
      { key: 'B', text: distractors[0] },
      { key: 'C', text: distractors[1] },
      { key: 'D', text: distractors[2] }
    ];

    // Shuffle options so A isn't always correct
    const correctIdx = Math.floor(Math.random() * 4);
    const keys = ['A', 'B', 'C', 'D'];
    const temp = options[0];
    options[0] = options[correctIdx];
    options[correctIdx] = temp;
    options.forEach((opt, idx) => opt.key = keys[idx]);

    questions.push({
      id: 'q_' + (i + 1),
      question: `Câu ${i + 1}: Phát biểu nào sau đây là chính xác nhất khi nói về "${itemTerm}"?`,
      options: options,
      correctAnswer: keys[correctIdx],
      explanation: `Theo tài liệu: "${itemTerm}" có nội dung trọng tâm là: "${itemDesc}".`
    });
  }

  return questions;
}

// ==================== API ROUTES ====================

// --- Authentication ---
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, studentId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu' });
  }

  const allUsers = readDb('users', []);
  if (allUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email này đã được đăng ký tài khoản' });
  }

  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
  const newUser = {
    id: 'user_' + Date.now(),
    name,
    email,
    studentId: studentId || ('SV' + Math.floor(100000 + Math.random() * 900000)),
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
    storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB cloud quota
    geminiApiKey: ''
  };

  allUsers.push(newUser);
  writeDb('users', allUsers);

  const token = createToken(newUser.id);
  res.json({
    message: 'Đăng ký tài khoản thành công',
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      studentId: newUser.studentId
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
  }

  const allUsers = readDb('users', []);
  const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác' });
  }

  const checkHash = crypto.createHash('sha256').update(password + user.salt).digest('hex');
  if (checkHash !== user.passwordHash) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác' });
  }

  const token = createToken(user.id);
  res.json({
    message: 'Đăng nhập thành công',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      studentId: user.studentId
    }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const allFiles = readDb('files', []).filter(f => f.userId === req.user.id);
  const totalSizeBytes = allFiles.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const allResults = readDb('results', []).filter(r => r.userId === req.user.id);
  
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      studentId: req.user.studentId,
      storageQuotaBytes: req.user.storageQuotaBytes || 10 * 1024 * 1024 * 1024,
      usedSizeBytes: totalSizeBytes,
      totalFiles: allFiles.length,
      totalQuizzesTaken: allResults.length,
      hasGeminiKey: !!req.user.geminiApiKey
    }
  });
});

app.post('/api/auth/update-key', authMiddleware, (req, res) => {
  const { apiKey } = req.body;
  const allUsers = readDb('users', []);
  const idx = allUsers.findIndex(u => u.id === req.user.id);
  if (idx !== -1) {
    allUsers[idx].geminiApiKey = (apiKey || '').trim();
    writeDb('users', allUsers);
  }
  res.json({ message: 'Cập nhật API Key thành công' });
});

// --- File Storage Management (Tránh đầy ổ C) ---
app.get('/api/files', authMiddleware, (req, res) => {
  const allFiles = readDb('files', []);
  const userFiles = allFiles.filter(f => f.userId === req.user.id);
  res.json(userFiles);
});

app.post('/api/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không tìm thấy file tải lên' });
  }

  const { tag, subject } = req.body;
  const cleanOriginalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

  // Calculate text preview
  let textLength = 0;
  let textSample = '';
  try {
    const rawText = await extractTextFromFile(req.file.path, cleanOriginalName);
    textLength = rawText.length;
    textSample = rawText.substring(0, 300);
  } catch (err) {
    console.error('Extract preview error:', err);
  }

  const newFile = {
    id: 'file_' + Date.now(),
    userId: req.user.id,
    originalName: cleanOriginalName,
    filename: req.file.filename,
    relativePath: path.relative(BASE_DIR, req.file.path),
    sizeBytes: req.file.size,
    mimeType: req.file.mimetype,
    tag: tag || 'Tài liệu học tập',
    subject: subject || 'Chung',
    textLength: textLength,
    textSample: textSample,
    uploadedAt: new Date().toISOString()
  };

  const allFiles = readDb('files', []);
  allFiles.unshift(newFile);
  writeDb('files', allFiles);

  res.json({
    message: 'Tải lên và lưu trữ an toàn thành công!',
    file: newFile
  });
});

app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const allFiles = readDb('files', []);
  const fileIdx = allFiles.findIndex(f => f.id === req.params.id && f.userId === req.user.id);
  if (fileIdx === -1) {
    return res.status(404).json({ error: 'Không tìm thấy file hoặc bạn không có quyền xóa' });
  }

  const file = allFiles[fileIdx];
  const fullPath = path.join(BASE_DIR, file.relativePath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn('Could not delete physical file:', e.message);
    }
  }

  allFiles.splice(fileIdx, 1);
  writeDb('files', allFiles);

  res.json({ message: 'Đã xóa file thành công và giải phóng dung lượng' });
});

app.get('/api/files/:id/download', authMiddleware, (req, res) => {
  const allFiles = readDb('files', []);
  const file = allFiles.find(f => f.id === req.params.id && f.userId === req.user.id);
  if (!file) {
    return res.status(404).json({ error: 'Không tìm thấy file' });
  }

  const fullPath = path.join(BASE_DIR, file.relativePath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File vật lý không tồn tại trên máy chủ' });
  }

  res.download(fullPath, file.originalName);
});

// --- AI Document Analyzer (Đọc và Phân tích Trọng tâm) ---
app.post('/api/analyze', authMiddleware, async (req, res) => {
  const { fileId, customText } = req.body;

  let textToAnalyze = String(customText || '');
  let filename = 'Văn bản nhập trực tiếp';

  if (fileId) {
    const allFiles = readDb('files', []);
    const file = allFiles.find(f => f.id === fileId && f.userId === req.user.id);
    if (!file) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu yêu cầu' });
    }
    filename = file.originalName;
    const fullPath = path.join(BASE_DIR, file.relativePath);
    try {
      textToAnalyze = await extractTextFromFile(fullPath, file.originalName);
    } catch (err) {
      return res.status(500).json({ error: 'Không thể đọc nội dung file: ' + err.message });
    }
  }

  textToAnalyze = String(textToAnalyze || '');
  if (!textToAnalyze || textToAnalyze.trim().length === 0) {
    return res.status(400).json({ error: 'Tài liệu không có nội dung văn bản để phân tích' });
  }

  // Check if Gemini API is available (user key or env key)
  const apiKey = req.user.geminiApiKey || process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const geminiResult = await callGeminiAnalysis(textToAnalyze, filename, apiKey);
      return res.json({ success: true, filename, analysis: geminiResult });
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local NLP:', err.message);
    }
  }

  // Built-in Smart NLP Engine (Instant & 100% Reliable Offline)
  const analysis = offlineAnalyzeDocument(textToAnalyze, filename);
  res.json({
    success: true,
    filename,
    analysis
  });
});

// --- Quiz Engine: Parse/Generate Quiz from Document ---
app.post('/api/quiz/generate', authMiddleware, async (req, res) => {
  const { fileId, customText, quizTitle } = req.body;

  let textToParse = String(customText || '');
  let title = quizTitle || 'Đề ôn tập trắc nghiệm';

  if (fileId) {
    const allFiles = readDb('files', []);
    const file = allFiles.find(f => f.id === fileId && f.userId === req.user.id);
    if (!file) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu ôn tập' });
    }
    title = quizTitle || `Đề ôn thi từ: ${file.originalName}`;
    const fullPath = path.join(BASE_DIR, file.relativePath);
    try {
      textToParse = await extractTextFromFile(fullPath, file.originalName);
    } catch (err) {
      return res.status(500).json({ error: 'Không thể đọc nội dung file ôn tập: ' + err.message });
    }
  }

  textToParse = String(textToParse || '');
  if (!textToParse || textToParse.trim().length === 0) {
    return res.status(400).json({ error: 'Không có dữ liệu văn bản để tạo đề thi' });
  }

  // Check if user has Gemini API Key for rich question generation
  const apiKey = req.user.geminiApiKey || process.env.GEMINI_API_KEY;
  let questions = [];

  if (apiKey) {
    try {
      questions = await callGeminiQuizGeneration(textToParse, title, apiKey);
    } catch (err) {
      console.warn('Gemini quiz generation fallback:', err.message);
      questions = parseQuizFromText(textToParse);
    }
  } else {
    questions = parseQuizFromText(textToParse);
  }

  if (questions.length === 0) {
    return res.status(400).json({ error: 'Không thể trích xuất câu hỏi trắc nghiệm từ tài liệu này' });
  }

  const quizId = 'quiz_' + Date.now();
  const newQuiz = {
    id: quizId,
    userId: req.user.id,
    title,
    totalQuestions: questions.length,
    durationMinutes: Math.max(10, Math.ceil(questions.length * 1.5)), // 1.5 mins per question
    questions,
    createdAt: new Date().toISOString()
  };

  const allQuizzes = readDb('quizzes', []);
  allQuizzes.unshift(newQuiz);
  writeDb('quizzes', allQuizzes);

  // Return quiz without revealing correct answers during exam mode!
  const publicQuestions = questions.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options
  }));

  res.json({
    quizId: newQuiz.id,
    title: newQuiz.title,
    totalQuestions: newQuiz.totalQuestions,
    durationMinutes: newQuiz.durationMinutes,
    questions: publicQuestions
  });
});

// --- Quiz Engine: Submit Answers & Auto-Grading (Chấm điểm) ---
app.post('/api/quiz/submit', authMiddleware, (req, res) => {
  const { quizId, answers, timeSpentSeconds } = req.body;
  if (!quizId || !answers) {
    return res.status(400).json({ error: 'Dữ liệu bài làm không hợp lệ' });
  }

  const allQuizzes = readDb('quizzes', []);
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) {
    return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  }

  let correctCount = 0;
  const detailedResults = quiz.questions.map((q, idx) => {
    const studentChoice = answers[q.id] || null;
    const isCorrect = studentChoice && studentChoice.toUpperCase() === q.correctAnswer.toUpperCase();
    if (isCorrect) correctCount++;

    return {
      id: q.id,
      index: idx + 1,
      question: q.question,
      options: q.options,
      studentChoice: studentChoice,
      correctAnswer: q.correctAnswer,
      isCorrect: !!isCorrect,
      explanation: q.explanation || 'Không có giải thích bổ sung.'
    };
  });

  const total = quiz.questions.length;
  const scoreOutOf10 = total > 0 ? parseFloat(((correctCount / total) * 10).toFixed(2)) : 0;
  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  let gradeRanking = 'Yếu';
  let evaluationBadge = 'Cần cố gắng';
  if (scoreOutOf10 >= 9.0) {
    gradeRanking = 'Xuất sắc';
    evaluationBadge = 'Nắm vững kiến thức chuyên sâu';
  } else if (scoreOutOf10 >= 8.0) {
    gradeRanking = 'Giỏi';
    evaluationBadge = 'Nắm chắc kiến thức trọng tâm';
  } else if (scoreOutOf10 >= 6.5) {
    gradeRanking = 'Khá';
    evaluationBadge = 'Cần rà soát lại một số câu lý thuyết';
  } else if (scoreOutOf10 >= 5.0) {
    gradeRanking = 'Trung bình';
    evaluationBadge = 'Cần ôn tập lại các khái niệm cơ bản';
  }

  const resultRecord = {
    id: 'res_' + Date.now(),
    userId: req.user.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: scoreOutOf10,
    correctCount,
    totalQuestions: total,
    percentage,
    gradeRanking,
    evaluationBadge,
    timeSpentSeconds: timeSpentSeconds || 0,
    completedAt: new Date().toISOString()
  };

  const allResults = readDb('results', []);
  allResults.unshift(resultRecord);
  writeDb('results', allResults);

  res.json({
    resultId: resultRecord.id,
    score: scoreOutOf10,
    correctCount,
    totalQuestions: total,
    percentage,
    gradeRanking,
    evaluationBadge,
    timeSpentSeconds: resultRecord.timeSpentSeconds,
    detailedResults
  });
});

// --- Quiz History ---
app.get('/api/quiz/history', authMiddleware, (req, res) => {
  const allResults = readDb('results', []);
  const userResults = allResults.filter(r => r.userId === req.user.id);
  res.json(userResults);
});

// --- Gemini API Integration Helpers ---
async function callGeminiAnalysis(text, filename, apiKey) {
  const prompt = `Bạn là chuyên gia giáo dục và trợ lý học tập AI. Hãy đọc và phân tích kỹ tài liệu sau: "${filename}".
Nội dung tài liệu:
"""
${text.substring(0, 15000)}
"""

Hãy trả về định dạng JSON thuần túy (không dùng markdown backticks, chỉ JSON) với cấu trúc sau:
{
  "overview": "Tóm tắt súc tích 2-3 câu về nội dung cốt lõi của bài học/tài liệu",
  "concepts": [
    {
      "term": "Tên khái niệm/chủ đề",
      "description": "Giải thích chi tiết, dễ hiểu",
      "importance": "Cao" hoặc "Trung bình"
    }
  ],
  "formulas": [
    {
      "name": "Tên công thức/quy tắc",
      "expression": "Biểu thức hoặc quy tắc ghi nhớ ngắn gọn"
    }
  ],
  "flashcards": [
    {
      "question": "Câu hỏi ôn tập kích thích tư duy",
      "answer": "Gợi ý câu trả lời súc tích"
    }
  ],
  "roadmap": [
    { "phase": "Bước 1", "task": "Nội dung cần ôn" },
    { "phase": "Bước 2", "task": "Nội dung cần ôn" },
    { "phase": "Bước 3", "task": "Nội dung cần ôn" }
  ],
  "mode": "gemini_ai"
}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText);
}

async function callGeminiQuizGeneration(text, title, apiKey) {
  const prompt = `Từ nội dung tài liệu sau, hãy tạo ra 10 câu hỏi trắc nghiệm khách quan chuẩn ôn thi (mỗi câu gồm 4 lựa chọn A, B, C, D, đáp án đúng và lời giải thích chi tiết):
"""
${text.substring(0, 15000)}
"""

Trả về JSON thuần túy (không bọc trong \`\`\`json):
[
  {
    "id": "q_1",
    "question": "Nội dung câu hỏi 1?",
    "options": [
      { "key": "A", "text": "Phương án A" },
      { "key": "B", "text": "Phương án B" },
      { "key": "C", "text": "Phương án C" },
      { "key": "D", "text": "Phương án D" }
    ],
    "correctAnswer": "A",
    "explanation": "Giải thích chi tiết vì sao đáp án này đúng dựa trên tài liệu"
  }
]`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText);
}

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎓 HỆ THỐNG TRỢ LÝ HỌC TẬP & ÔN THI TRẮC NGHIỆM AI`);
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📂 Lưu trữ an toàn, giải phóng ổ đĩa C cho sinh viên`);
  console.log(`====================================================`);
});
