// Document Reading & Core Concept Analysis Logic

let lastAnalysisData = null;
let currentAnalyzedFileId = null;

async function runDocumentAnalysis() {
  const fileSelect = document.getElementById('analyzer-file-select');
  const customTextArea = document.getElementById('analyzer-custom-text');
  
  const fileId = fileSelect ? fileSelect.value : null;
  const customText = customTextArea ? customTextArea.value.trim() : '';

  if (!fileId && !customText) {
    showToast('Vui lòng chọn 1 tài liệu trong kho hoặc dán nội dung văn bản để phân tích', 'error');
    return;
  }

  currentAnalyzedFileId = fileId;
  const loadingEl = document.getElementById('analyzer-loading');
  const resultEl = document.getElementById('analyzer-result');
  const btn = document.getElementById('btn-run-analysis');

  loadingEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ fileId, customText })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi phân tích tài liệu');

    lastAnalysisData = data.analysis;
    renderAnalysisResults(data.filename, data.analysis);
    showToast('Đã phân tích trọng tâm ôn tập thành công!');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    loadingEl.classList.add('hidden');
    btn.disabled = false;
    lucide.createIcons();
  }
}

function renderAnalysisResults(filename, analysis) {
  const resultEl = document.getElementById('analyzer-result');
  document.getElementById('analyzer-result-filename').textContent = filename;

  // 1. Overview
  document.getElementById('result-overview').textContent = analysis.overview || 'Không có tóm tắt.';

  // 2. Concepts
  const conceptsContainer = document.getElementById('result-concepts-grid');
  if (analysis.concepts && analysis.concepts.length > 0) {
    conceptsContainer.innerHTML = analysis.concepts.map(c => {
      const isHigh = c.importance === 'Cao';
      const badgeClass = isHigh ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200';
      return `
        <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:shadow-sm transition space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${isHigh ? 'bg-rose-500' : 'bg-blue-500'}"></span>
              ${c.term}
            </h4>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeClass}">
              Ưu tiên: ${c.importance || 'Bình thường'}
            </span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">${c.description}</p>
        </div>
      `;
    }).join('');
  } else {
    conceptsContainer.innerHTML = `<div class="text-slate-400 text-xs">Không trích xuất được khái niệm cụ thể.</div>`;
  }

  // 3. Formulas & Key Rules
  const formulasContainer = document.getElementById('result-formulas-list');
  if (analysis.formulas && analysis.formulas.length > 0) {
    formulasContainer.innerHTML = analysis.formulas.map(f => `
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div class="font-semibold text-xs text-slate-700 flex items-center gap-2">
          <i data-lucide="check" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0"></i>
          <span>${f.name}</span>
        </div>
        <code class="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-indigo-700 font-bold self-stretch sm:self-auto text-center">
          ${f.expression}
        </code>
      </div>
    `).join('');
  } else {
    formulasContainer.innerHTML = `<div class="text-slate-400 text-xs">Tài liệu thuần lý thuyết không có công thức.</div>`;
  }

  // 4. Flashcards
  const flashcardsContainer = document.getElementById('result-flashcards-grid');
  if (analysis.flashcards && analysis.flashcards.length > 0) {
    flashcardsContainer.innerHTML = analysis.flashcards.map((fc, idx) => `
      <div class="flashcard" onclick="toggleFlashcard(this)">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="flex items-center justify-between text-xs font-bold text-amber-700">
              <span>Thẻ ôn tập #${idx + 1}</span>
              <span class="text-[10px] bg-amber-100 px-2 py-0.5 rounded-full">Bấm để lật</span>
            </div>
            <div class="my-auto font-semibold text-slate-800 text-xs sm:text-sm text-center">
              ${fc.question}
            </div>
            <div class="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
              <i data-lucide="repeat" class="w-3 h-3"></i> Xem câu trả lời
            </div>
          </div>
          <div class="flashcard-back">
            <div class="flex items-center justify-between text-xs font-bold text-indigo-700">
              <span>Đáp án gợi ý</span>
              <span class="text-[10px] bg-indigo-100 px-2 py-0.5 rounded-full">Ghi nhớ</span>
            </div>
            <div class="my-auto text-xs text-slate-700 leading-relaxed font-medium">
              ${fc.answer}
            </div>
            <div class="text-[11px] text-indigo-500 text-center flex items-center justify-center gap-1">
              <i data-lucide="check" class="w-3 h-3"></i> Đã nắm kiến thức
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } else {
    flashcardsContainer.innerHTML = `<div class="text-slate-400 text-xs">Chưa có flashcard.</div>`;
  }

  // 5. Revision Roadmap
  const roadmapContainer = document.getElementById('result-roadmap');
  if (analysis.roadmap && analysis.roadmap.length > 0) {
    roadmapContainer.innerHTML = analysis.roadmap.map(rm => `
      <div class="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-1.5">
        <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
          ${rm.phase}
        </span>
        <div class="text-xs text-slate-700 font-medium leading-relaxed">${rm.task}</div>
      </div>
    `).join('');
  }

  resultEl.classList.remove('hidden');
  lucide.createIcons();
}

function toggleFlashcard(el) {
  el.classList.toggle('flipped');
}

function createQuizFromCurrentAnalysis() {
  switchTab('quiz');
  if (currentAnalyzedFileId) {
    const sel = document.getElementById('quiz-file-select');
    if (sel) {
      sel.value = currentAnalyzedFileId;
      startQuizFromStorage();
    }
  } else {
    const customText = document.getElementById('analyzer-custom-text')?.value;
    if (customText) {
      startQuizFromRawText(customText, 'Đề thi tạo từ bài học vừa phân tích');
    }
  }
}
