// Quiz Engine & Auto-Grading Logic

let currentQuiz = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let flaggedQuestions = new Set();
let timerInterval = null;
let remainingSeconds = 0;
let totalTimeSeconds = 0;

// Direct file upload label change
window.addEventListener('DOMContentLoaded', () => {
  const directInput = document.getElementById('quiz-direct-file-input');
  if (directInput) {
    directInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        document.getElementById('quiz-direct-file-label').innerHTML = `
          <i data-lucide="file-check" class="w-6 h-6 mx-auto mb-1 text-emerald-600"></i>
          Đã chọn: <strong>${file.name}</strong> (${formatBytes(file.size)})
        `;
        lucide.createIcons();
      }
    });
  }
});

async function startQuizFromStorage() {
  const sel = document.getElementById('quiz-file-select');
  const fileId = sel ? sel.value : null;

  if (!fileId) {
    showToast('Vui lòng chọn 1 file đề thi hoặc tài liệu trong kho', 'error');
    return;
  }

  try {
    showToast('Đang trích xuất câu hỏi từ tài liệu...', 'info');
    const res = await fetch(`${API_BASE}/api/quiz/generate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ fileId })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi khi khởi tạo đề thi');

    launchExamRoom(data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startQuizFromDirectUpload() {
  const fileInput = document.getElementById('quiz-direct-file-input');
  if (!fileInput.files || !fileInput.files[0]) {
    showToast('Vui lòng chọn file đề thi trắc nghiệm để tải lên', 'error');
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tag', 'Đề trắc nghiệm ôn thi');
  formData.append('subject', 'Đề thi trắc nghiệm');

  try {
    showToast('Đang tải lên và lưu file an toàn...', 'info');
    // First upload to storage
    const uploadRes = await fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AppState.token}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || 'Lỗi tải lên đề thi');

    // Refresh files list
    loadFiles();
    refreshUserProfile();

    // Now generate quiz
    showToast('Hệ thống đang trích xuất câu hỏi và đáp án...', 'info');
    const genRes = await fetch(`${API_BASE}/api/quiz/generate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ fileId: uploadData.file.id, quizTitle: file.name })
    });
    const quizData = await genRes.json();
    if (!genRes.ok) throw new Error(quizData.error || 'Lỗi khởi tạo đề thi');

    launchExamRoom(quizData);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startQuizFromRawText(text, title) {
  try {
    showToast('Đang tạo bộ câu hỏi trắc nghiệm...', 'info');
    const res = await fetch(`${API_BASE}/api/quiz/generate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ customText: text, quizTitle: title })
    });
    const quizData = await res.json();
    if (!res.ok) throw new Error(quizData.error || 'Lỗi khi tạo đề');

    launchExamRoom(quizData);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function launchExamRoom(quiz) {
  currentQuiz = quiz;
  currentQuestionIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();

  // Switch Views
  document.getElementById('quiz-launcher').classList.add('hidden');
  document.getElementById('quiz-result-view').classList.add('hidden');
  document.getElementById('quiz-exam-room').classList.remove('hidden');

  // Setup Title & Stats
  document.getElementById('exam-quiz-title').textContent = quiz.title;
  document.getElementById('exam-total-questions-count').textContent = quiz.totalQuestions;

  // Setup Timer
  totalTimeSeconds = quiz.durationMinutes * 60;
  remainingSeconds = totalTimeSeconds;
  startTimer();

  // Render Palette & First Question
  renderExamPalette();
  renderCurrentQuestion();
  updateAnsweredStatus();

  showToast(`Phòng thi đã sẵn sàng! Thời gian: ${quiz.durationMinutes} phút`);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerDisplay();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      showToast('Đã hết thời gian làm bài! Tự động nộp bài...', 'info');
      submitQuizAction();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const el = document.getElementById('exam-timer-display');
  if (el) el.textContent = formatted;
}

function renderExamPalette() {
  const grid = document.getElementById('exam-palette-grid');
  if (!grid || !currentQuiz) return;

  grid.innerHTML = currentQuiz.questions.map((q, idx) => {
    const isAnswered = !!userAnswers[q.id];
    const isFlagged = flaggedQuestions.has(q.id);
    const isActive = idx === currentQuestionIndex;

    let classes = 'palette-btn h-9 rounded-lg text-xs font-semibold flex items-center justify-center border ';
    if (isActive) {
      classes += 'active ';
    } else if (isFlagged) {
      classes += 'flagged ';
    } else if (isAnswered) {
      classes += 'answered ';
    } else {
      classes += 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 ';
    }

    return `
      <button onclick="jumpToQuestion(${idx})" class="${classes}" id="palette-btn-${idx}">
        ${idx + 1}
      </button>
    `;
  }).join('');
}

function renderCurrentQuestion() {
  if (!currentQuiz || !currentQuiz.questions[currentQuestionIndex]) return;
  const q = currentQuiz.questions[currentQuestionIndex];

  document.getElementById('current-question-badge').textContent = `Câu hỏi ${currentQuestionIndex + 1} / ${currentQuiz.totalQuestions}`;
  document.getElementById('current-question-text').textContent = q.question;

  // Options
  const container = document.getElementById('current-question-options');
  const selectedKey = userAnswers[q.id] || null;

  container.innerHTML = q.options.map(opt => {
    const isSelected = selectedKey === opt.key;
    const selectedClass = isSelected ? 'selected' : 'border-slate-200 bg-white';
    const radioBg = isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-500';

    return `
      <div onclick="selectAnswer('${q.id}', '${opt.key}')" class="quiz-option-item p-4 rounded-xl border flex items-center gap-3.5 ${selectedClass}">
        <div class="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-xs flex-shrink-0 ${radioBg}">
          ${opt.key}
        </div>
        <div class="text-sm font-medium text-slate-800 leading-snug">
          ${opt.text}
        </div>
      </div>
    `;
  }).join('');

  // Flag button state
  const flagBtn = document.getElementById('btn-flag-question');
  if (flaggedQuestions.has(q.id)) {
    flagBtn.className = 'text-xs text-amber-500 font-bold flex items-center gap-1';
    flagBtn.innerHTML = `<i data-lucide="flag" class="w-4 h-4 fill-amber-500"></i> Đã đặt cờ`;
  } else {
    flagBtn.className = 'text-xs text-slate-400 hover:text-amber-500 flex items-center gap-1';
    flagBtn.innerHTML = `<i data-lucide="flag" class="w-4 h-4"></i> Đặt cờ nghi vấn`;
  }

  // Prev / Next Buttons
  document.getElementById('btn-prev-question').disabled = currentQuestionIndex === 0;
  const nextBtn = document.getElementById('btn-next-question');
  if (currentQuestionIndex === currentQuiz.totalQuestions - 1) {
    nextBtn.innerHTML = `Hoàn tất <i data-lucide="check" class="w-4 h-4"></i>`;
  } else {
    nextBtn.innerHTML = `Câu tiếp theo <i data-lucide="arrow-right" class="w-4 h-4"></i>`;
  }

  renderExamPalette();
  lucide.createIcons();
}

function selectAnswer(questionId, optionKey) {
  userAnswers[questionId] = optionKey;
  renderCurrentQuestion();
  updateAnsweredStatus();
}

function toggleFlagCurrentQuestion() {
  const q = currentQuiz.questions[currentQuestionIndex];
  if (flaggedQuestions.has(q.id)) {
    flaggedQuestions.delete(q.id);
  } else {
    flaggedQuestions.add(q.id);
  }
  renderCurrentQuestion();
}

function navigateQuestion(delta) {
  const newIndex = currentQuestionIndex + delta;
  if (newIndex >= 0 && newIndex < currentQuiz.totalQuestions) {
    currentQuestionIndex = newIndex;
    renderCurrentQuestion();
  }
}

function jumpToQuestion(idx) {
  if (idx >= 0 && idx < currentQuiz.totalQuestions) {
    currentQuestionIndex = idx;
    renderCurrentQuestion();
  }
}

function updateAnsweredStatus() {
  const count = Object.keys(userAnswers).length;
  const total = currentQuiz ? currentQuiz.totalQuestions : 0;
  const el = document.getElementById('exam-answered-status');
  if (el) el.textContent = `Đã làm ${count}/${total} câu`;
}

function confirmSubmitQuiz() {
  const answeredCount = Object.keys(userAnswers).length;
  const total = currentQuiz.totalQuestions;
  const unanswered = total - answeredCount;

  let msg = 'Bạn có chắc chắn muốn nộp bài thi để hệ thống chấm điểm?';
  if (unanswered > 0) {
    msg = `Bạn còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài chứ?`;
  }

  if (confirm(msg)) {
    submitQuizAction();
  }
}

async function submitQuizAction() {
  if (timerInterval) clearInterval(timerInterval);

  const timeSpentSeconds = totalTimeSeconds - remainingSeconds;

  try {
    showToast('Hệ thống đang đối chiếu đáp án và chấm điểm...', 'info');

    const res = await fetch(`${API_BASE}/api/quiz/submit`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        quizId: currentQuiz.quizId,
        answers: userAnswers,
        timeSpentSeconds
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Lỗi khi chấm điểm');

    displayGradingResults(result);
    refreshUserProfile();
    loadQuizHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function displayGradingResults(result) {
  document.getElementById('quiz-exam-room').classList.add('hidden');
  document.getElementById('quiz-result-view').classList.remove('hidden');

  document.getElementById('result-quiz-title').textContent = `Kết Quả: ${currentQuiz.title}`;
  document.getElementById('result-evaluation-badge').textContent = `Nhận xét: ${result.evaluationBadge}`;
  document.getElementById('result-correct-count').textContent = `${result.correctCount}/${result.totalQuestions}`;
  
  const spentMinutes = Math.floor(result.timeSpentSeconds / 60);
  const spentSeconds = result.timeSpentSeconds % 60;
  document.getElementById('result-time-spent').textContent = `${spentMinutes}m ${spentSeconds}s`;
  document.getElementById('result-percentage').textContent = `${result.percentage}%`;
  document.getElementById('result-score-display').textContent = result.score.toFixed(1);
  document.getElementById('result-grade-ranking').textContent = `Xếp loại: ${result.gradeRanking}`;

  // Render Detailed Question-by-Question Review
  const reviewContainer = document.getElementById('result-detailed-questions-container');
  reviewContainer.innerHTML = result.detailedResults.map(q => {
    const isCorrect = q.isCorrect;
    const borderClass = isCorrect ? 'border-emerald-200 bg-emerald-50/20' : 'border-rose-200 bg-rose-50/20';
    const statusBadge = isCorrect 
      ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> Chính xác (+${(10/result.totalQuestions).toFixed(1)}đ)</span>`
      : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1"><i data-lucide="x" class="w-3.5 h-3.5"></i> Chưa chính xác (0đ)</span>`;

    return `
      <div class="p-5 rounded-2xl border ${borderClass} space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase text-slate-500">Câu ${q.index}</span>
          ${statusBadge}
        </div>

        <div class="font-semibold text-slate-800 text-sm sm:text-base">
          ${q.question}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          ${q.options.map(opt => {
            const isStudent = q.studentChoice === opt.key;
            const isActual = q.correctAnswer === opt.key;

            let optStyle = 'border-slate-200 bg-white text-slate-700';
            if (isActual) {
              optStyle = 'border-emerald-400 bg-emerald-100/60 text-emerald-900 font-semibold';
            } else if (isStudent && !isCorrect) {
              optStyle = 'border-rose-400 bg-rose-100/60 text-rose-900 line-through';
            }

            return `
              <div class="p-2.5 rounded-xl border flex items-center gap-2 ${optStyle}">
                <span class="w-5 h-5 rounded-full border flex items-center justify-center font-bold text-[10px] bg-white">${opt.key}</span>
                <span class="flex-1">${opt.text}</span>
                ${isActual ? '<span class="text-[10px] font-bold text-emerald-700 uppercase ml-auto">Đáp án đúng</span>' : ''}
                ${isStudent && !isActual ? '<span class="text-[10px] font-bold text-rose-700 uppercase ml-auto">Bạn chọn</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Explanation box -->
        <div class="p-3 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
          <i data-lucide="lightbulb" class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"></i>
          <div>
            <strong>Lời giải chi tiết:</strong> ${q.explanation}
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function retakeCurrentQuiz() {
  if (currentQuiz) {
    launchExamRoom(currentQuiz);
  }
}

function backToQuizLauncher() {
  document.getElementById('quiz-result-view').classList.add('hidden');
  document.getElementById('quiz-exam-room').classList.add('hidden');
  document.getElementById('quiz-launcher').classList.remove('hidden');
}

// Load Quiz History (Tab 5 & Dashboard)
async function loadQuizHistory() {
  if (!AppState.token) return;

  try {
    const res = await fetch(`${API_BASE}/api/quiz/history`, {
      headers: authHeaders()
    });
    if (!res.ok) return;

    AppState.history = await res.json();
    renderHistoryTable(AppState.history);
    renderDashboardRecentQuizzes(AppState.history);
  } catch (err) {
    console.error('Error fetching quiz history:', err);
  }
}

function renderHistoryTable(records) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400">
          Chưa có bài thi nào được thực hiện.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const dateFormatted = new Date(r.completedAt).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const spentMinutes = Math.floor((r.timeSpentSeconds || 0) / 60);
    const spentSeconds = (r.timeSpentSeconds || 0) % 60;

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="py-3 px-4 font-semibold text-slate-800">${r.quizTitle}</td>
        <td class="py-3 px-3">
          <span class="text-base font-extrabold text-indigo-600">${r.score.toFixed(1)}</span> / 10
        </td>
        <td class="py-3 px-3 text-xs font-medium text-slate-600">${r.correctCount}/${r.totalQuestions} (${r.percentage}%)</td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
            ${r.gradeRanking}
          </span>
        </td>
        <td class="py-3 px-3 text-xs text-slate-500">${spentMinutes}m ${spentSeconds}s</td>
        <td class="py-3 px-4 text-xs text-slate-500">${dateFormatted}</td>
      </tr>
    `;
  }).join('');
}

function renderDashboardRecentQuizzes(records) {
  const container = document.getElementById('dashboard-recent-quizzes');
  if (!container) return;

  if (records.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-xs">Chưa có bài thi nào được hoàn thành. Hãy bắt đầu ngay!</div>`;
    return;
  }

  // Update Average Score in stat card
  const totalScore = records.reduce((acc, r) => acc + r.score, 0);
  const avg = (totalScore / records.length).toFixed(1);
  const avgEl = document.getElementById('stat-avg-score');
  if (avgEl) avgEl.textContent = `${avg} / 10`;

  const badgeEl = document.getElementById('stat-avg-badge');
  if (badgeEl) {
    badgeEl.textContent = avg >= 8.0 ? '🌟 Thành tích xuất sắc' : (avg >= 6.5 ? '👍 Đạt mức khá tốt' : '📖 Cần ôn tập thêm');
  }

  const recent = records.slice(0, 4);
  container.innerHTML = recent.map(r => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 transition border border-slate-100">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
          ${r.score.toFixed(1)}
        </div>
        <div class="truncate text-xs font-semibold text-slate-700">${r.quizTitle}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-[11px] text-slate-400 font-medium">${r.correctCount}/${r.totalQuestions} đúng</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">${r.gradeRanking}</span>
      </div>
    </div>
  `).join('');
}
