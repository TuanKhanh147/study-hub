// File Storage & Management Logic

let selectedUploadFile = null;

// Initialize dropzone events
window.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-upload-input');
  const dropZone = document.getElementById('drop-zone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0]);
      }
    });
  }

  // Drag over styling
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-100/50');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-100/50');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }
});

function handleFileSelected(file) {
  selectedUploadFile = file;
  document.getElementById('selected-file-name').textContent = `📄 Đã chọn: ${file.name} (${formatBytes(file.size)})`;
  document.getElementById('upload-meta-bar').classList.remove('hidden');
  document.getElementById('upload-meta-bar').classList.add('flex');
}

function cancelUploadSelection() {
  selectedUploadFile = null;
  const fileInput = document.getElementById('file-upload-input');
  if (fileInput) fileInput.value = '';
  document.getElementById('upload-meta-bar').classList.add('hidden');
  document.getElementById('upload-meta-bar').classList.remove('flex');
}

async function submitUpload() {
  if (!selectedUploadFile) {
    showToast('Vui lòng chọn một file để tải lên', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-upload');
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Đang lưu trữ...`;

  const tag = document.getElementById('upload-tag').value;
  const subject = document.getElementById('upload-subject').value.trim();

  const formData = new FormData();
  formData.append('file', selectedUploadFile);
  formData.append('tag', tag);
  formData.append('subject', subject || 'Chung');

  try {
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AppState.token}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải lên');

    showToast('Đã lưu trữ tài liệu an toàn, bảo vệ ổ C thành công!');
    cancelUploadSelection();
    await loadFiles();
    await refreshUserProfile();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Xác nhận tải lên`;
    lucide.createIcons();
  }
}

async function loadFiles() {
  if (!AppState.token) return;

  try {
    const res = await fetch(`${API_BASE}/api/files`, {
      headers: authHeaders()
    });
    if (!res.ok) return;

    AppState.files = await res.json();
    renderFilesTable(AppState.files);
    renderDashboardRecentFiles(AppState.files);
    populateAnalyzerFileDropdown();
    populateQuizFileDropdown();
  } catch (err) {
    console.error('Error fetching files:', err);
  }
}

function filterFiles() {
  const query = (document.getElementById('search-files-input')?.value || '').toLowerCase();
  const selectedTag = document.getElementById('filter-tag-select')?.value || 'all';

  const filtered = AppState.files.filter(f => {
    const matchName = f.originalName.toLowerCase().includes(query) || (f.subject && f.subject.toLowerCase().includes(query));
    const matchTag = (selectedTag === 'all') || (f.tag === selectedTag);
    return matchName && matchTag;
  });

  renderFilesTable(filtered);
}

function renderFilesTable(files) {
  const tbody = document.getElementById('files-tbody');
  const countBadge = document.getElementById('file-count-badge');
  if (countBadge) countBadge.textContent = `${files.length} file`;

  if (!tbody) return;

  if (files.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-400">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          Không tìm thấy tài liệu phù hợp trong kho.
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = files.map(file => {
    const dateFormatted = new Date(file.uploadedAt).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const isPdf = file.originalName.endsWith('.pdf');
    const isDoc = file.originalName.endsWith('.doc') || file.originalName.endsWith('.docx');
    const iconClass = isPdf ? 'text-rose-500' : (isDoc ? 'text-blue-500' : 'text-emerald-500');

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-medium text-slate-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 ${iconClass}">
            <i data-lucide="file-text" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <div class="truncate max-w-xs font-semibold text-slate-800" title="${file.originalName}">${file.originalName}</div>
            <div class="text-[11px] text-slate-400">Khoảng ${file.textLength || 0} ký tự trích xuất</div>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            ${file.tag || 'Tài liệu'}
          </span>
          <div class="text-[11px] text-slate-500 mt-0.5">${file.subject || 'Chung'}</div>
        </td>
        <td class="py-3 px-3 text-xs font-medium text-slate-600">${formatBytes(file.sizeBytes)}</td>
        <td class="py-3 px-3 text-xs text-slate-500">${dateFormatted}</td>
        <td class="py-3 px-4 text-right">
          <div class="inline-flex items-center gap-1.5">
            <button onclick="analyzeThisFile('${file.id}')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition flex items-center gap-1" title="Phân tích trọng tâm ôn tập">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Phân tích
            </button>
            <button onclick="quizThisFile('${file.id}')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex items-center gap-1" title="Làm đề trắc nghiệm">
              <i data-lucide="play" class="w-3.5 h-3.5"></i> Làm đề thi
            </button>
            <a href="${API_BASE}/api/files/${file.id}/download" target="_blank" class="p-1 text-slate-400 hover:text-indigo-600 rounded transition" title="Tải về máy">
              <i data-lucide="download" class="w-4 h-4"></i>
            </a>
            <button onclick="deleteFile('${file.id}', '${file.originalName}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition" title="Xóa tài liệu và giải phóng dung lượng">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function renderDashboardRecentFiles(files) {
  const container = document.getElementById('dashboard-recent-files');
  if (!container) return;

  if (files.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-xs">Chưa có tài liệu nào. Hãy tải file đầu tiên lên kho lưu trữ!</div>`;
    return;
  }

  const recent = files.slice(0, 4);
  container.innerHTML = recent.map(f => `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/50 transition border border-slate-100">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 flex-shrink-0">
          <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
        </div>
        <div class="truncate text-xs font-semibold text-slate-700">${f.originalName}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-[11px] text-slate-400">${formatBytes(f.sizeBytes)}</span>
        <button onclick="analyzeThisFile('${f.id}')" class="text-xs text-purple-600 hover:underline font-semibold">Phân tích</button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

async function deleteFile(fileId, fileName) {
  if (!confirm(`Bạn có chắc chắn muốn xóa file "${fileName}"? Thao tác này sẽ giải phóng dung lượng lưu trữ trên hệ thống.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa file');

    showToast('Đã xóa tài liệu và giải phóng dung lượng thành công');
    await loadFiles();
    await refreshUserProfile();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function analyzeThisFile(fileId) {
  switchTab('analyzer');
  const sel = document.getElementById('analyzer-file-select');
  if (sel) {
    sel.value = fileId;
    runDocumentAnalysis();
  }
}

function quizThisFile(fileId) {
  switchTab('quiz');
  const sel = document.getElementById('quiz-file-select');
  if (sel) {
    sel.value = fileId;
    startQuizFromStorage();
  }
}

function populateAnalyzerFileDropdown() {
  const sel = document.getElementById('analyzer-file-select');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Chọn tài liệu đã lưu --</option>' + 
    AppState.files.map(f => `<option value="${f.id}">📄 ${f.originalName} (${formatBytes(f.sizeBytes)})</option>`).join('');

  if (currentVal) sel.value = currentVal;
}

function populateQuizFileDropdown() {
  const sel = document.getElementById('quiz-file-select');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Chọn file đề trắc nghiệm hoặc bài học --</option>' + 
    AppState.files.map(f => `<option value="${f.id}">📄 ${f.originalName} (${f.tag})</option>`).join('');

  if (currentVal) sel.value = currentVal;
}
