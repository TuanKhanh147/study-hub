// SmartEdu Core Application Logic & State

const API_BASE = window.location.origin;

// State
const AppState = {
  token: localStorage.getItem('smartedu_token') || null,
  user: null,
  files: [],
  history: [],
  currentTab: 'dashboard'
};

// Toast notification helper
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  const iconEl = document.getElementById('toast-icon');

  if (!toast) return;
  msgEl.textContent = message;
  
  if (type === 'error') {
    iconEl.setAttribute('data-lucide', 'alert-circle');
    iconEl.className = 'w-4 h-4 text-rose-400';
  } else {
    iconEl.setAttribute('data-lucide', 'check-circle');
    iconEl.className = 'w-4 h-4 text-emerald-400';
  }
  lucide.createIcons();

  toast.classList.remove('hidden');
  toast.classList.add('flex');
  setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('flex');
  }, 3500);
}

// Tab Switching
function switchTab(tabName) {
  AppState.currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) {
    activePane.classList.remove('hidden');
    activePane.classList.add('active');
  }

  // Reload icons
  lucide.createIcons();

  // Tab specific refreshes
  if (tabName === 'storage') {
    loadFiles();
  } else if (tabName === 'analyzer') {
    populateAnalyzerFileDropdown();
  } else if (tabName === 'quiz') {
    populateQuizFileDropdown();
  } else if (tabName === 'history') {
    loadQuizHistory();
  } else if (tabName === 'dashboard') {
    refreshUserProfile();
  }
}

// Authentication Helpers
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (AppState.token) {
    headers['Authorization'] = `Bearer ${AppState.token}`;
  }
  return headers;
}

function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  document.getElementById('auth-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function setAuthMode(mode) {
  const loginForm = document.getElementById('form-login');
  const regForm = document.getElementById('form-register');
  const switchLogin = document.getElementById('auth-switch-login');
  const switchReg = document.getElementById('auth-switch-register');

  if (mode === 'login') {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    switchLogin.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition bg-white text-indigo-600 shadow-sm';
    switchReg.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-700';
  } else {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    switchReg.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition bg-white text-indigo-600 shadow-sm';
    switchLogin.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-700';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đăng nhập không thành công');

    AppState.token = data.token;
    localStorage.setItem('smartedu_token', data.token);
    closeAuthModal();
    showToast(`Đăng nhập thành công! Chào ${data.user.name}`);
    await refreshUserProfile();
    loadFiles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const studentId = document.getElementById('reg-student-id').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, studentId, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đăng ký không thành công');

    AppState.token = data.token;
    localStorage.setItem('smartedu_token', data.token);
    closeAuthModal();
    showToast('Tạo tài khoản học tập thành công!');
    await refreshUserProfile();
    loadFiles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logout() {
  AppState.token = null;
  AppState.user = null;
  localStorage.removeItem('smartedu_token');
  updateAuthUI();
  showToast('Đã đăng xuất tài khoản');
  switchTab('dashboard');
}

async function refreshUserProfile() {
  if (!AppState.token) {
    // If no token, auto login with demo credentials
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sinhvien@hust.edu.vn', password: '123456' })
      });
      const data = await res.json();
      if (res.ok) {
        AppState.token = data.token;
        localStorage.setItem('smartedu_token', data.token);
      }
    } catch (e) {
      console.warn('Auto demo login skipped:', e);
    }
  }

  if (!AppState.token) {
    updateAuthUI();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) logout();
      return;
    }
    const data = await res.json();
    AppState.user = data.user;
    updateAuthUI();
    updateDashboardStats(data.user);
  } catch (err) {
    console.error('Fetch user error:', err);
  }
}

function updateAuthUI() {
  const guestBox = document.getElementById('auth-guest');
  const userBox = document.getElementById('auth-user');

  if (AppState.user) {
    guestBox.classList.add('hidden');
    guestBox.classList.remove('flex');
    userBox.classList.remove('hidden');
    userBox.classList.add('flex');

    document.getElementById('user-display-name').textContent = AppState.user.name;
    document.getElementById('user-display-id').textContent = `MSSV: ${AppState.user.studentId}`;
    document.getElementById('user-avatar-initial').textContent = AppState.user.name.charAt(0).toUpperCase();

    // Storage Pill
    const usedMb = (AppState.user.usedSizeBytes / (1024 * 1024)).toFixed(1);
    document.getElementById('storage-pill-text').textContent = `${usedMb} MB / 10 GB (Tiết kiệm ổ C)`;
  } else {
    guestBox.classList.remove('hidden');
    guestBox.classList.add('flex');
    userBox.classList.add('hidden');
    userBox.classList.remove('flex');
  }
  lucide.createIcons();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateDashboardStats(user) {
  const usedFormatted = formatBytes(user.usedSizeBytes);
  const quotaFormatted = formatBytes(user.storageQuotaBytes || 10 * 1024 * 1024 * 1024);
  const percent = ((user.usedSizeBytes / (user.storageQuotaBytes || 10 * 1024 * 1024 * 1024)) * 100).toFixed(1);

  document.getElementById('stat-storage-used').textContent = usedFormatted;
  document.getElementById('stat-total-files').textContent = `${user.totalFiles} tài liệu`;
  document.getElementById('stat-quizzes-taken').textContent = `${user.totalQuizzesTaken} lượt thi`;

  // Storage tab bar
  const storageDetail = document.getElementById('storage-text-detail');
  if (storageDetail) storageDetail.textContent = `${usedFormatted} / ${quotaFormatted}`;
  
  const progressBar = document.getElementById('storage-progress-bar');
  if (progressBar) progressBar.style.width = `${Math.max(1, percent)}%`;

  const percentLabel = document.getElementById('storage-percent-label');
  if (percentLabel) percentLabel.textContent = `${percent}%`;
}

// Initial Bootstrap
window.addEventListener('DOMContentLoaded', async () => {
  await refreshUserProfile();
  loadFiles();
  loadQuizHistory();
});
