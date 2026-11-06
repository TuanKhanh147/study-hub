# 🎓 SmartEdu - Nền Tảng Học Tập, Lưu Trữ & Ôn Thi Trắc Nghiệm Thông Minh

Hệ thống web trợ lý học tập toàn diện được thiết kế chuyên biệt cho sinh viên:
1. **Lưu trữ tài liệu tập trung (Tránh đầy ổ C máy tính)**: Quản lý bài tập, slide, đề thi trên hệ thống server an toàn với đồng hồ giám sát dung lượng bộ nhớ.
2. **Đọc & Trích xuất trọng tâm bài học (AI Document Analyzer)**: Đọc file PDF, Word (.docx), Ghi chú (.txt, .md) và tự động rút gọn thành các khái niệm then chốt, công thức cốt lõi, flashcard ghi nhớ nhanh và lộ trình ôn thi cấp tốc.
3. **Phòng thi trắc nghiệm & Chấm điểm tự động (Auto-Grading Exam Room)**: Đọc file đề trắc nghiệm có sẵn hoặc tự động tạo đề từ tài liệu học tập, mô phỏng phòng thi trực tuyến với đồng hồ đếm ngược, chấm điểm tức thì trên thang điểm 10 kèm lời giải thích chi tiết.
4. **Hệ thống Đăng nhập & Quản lý tiến độ**: Đăng ký/đăng nhập tài khoản sinh viên, lưu lại lịch sử làm bài thi và biểu đồ thống kê điểm số.

---

## 🚀 Hướng Dẫn Khởi Chạy Nhanh

### 1. Mở dự án trong VS Code
Thư mục dự án: `C:\Users\dell\.gemini\antigravity\scratch\study-hub`
```bash
code C:\Users\dell\.gemini\antigravity\scratch\study-hub
```

### 2. Khởi chạy Server
Mở Terminal trong VS Code (`Ctrl + ~`) hoặc PowerShell và chạy:
```bash
node server.js
```
Hệ thống sẽ chạy tại địa chỉ: **http://localhost:3000**

---

## 🌟 Tài Khoản Mẫu Trải Nghiệm Nhanh
- **Email:** `sinhvien@hust.edu.vn`
- **Mật khẩu:** `123456`
*(Bạn cũng có thể tự do bấm nút "Đăng ký" để tạo tài khoản mới bất kỳ lúc nào)*

---

## 📂 Các File Mẫu Có Sẵn Để Trải Nghiệm Ngay
Trong thư mục `sample-data/` đã có sẵn 2 file mẫu:
1. `Triet_Hoc_Mac_Lenin_On_Tap.txt`: Dùng để thử nghiệm tính năng **Phân tích trọng tâm lý thuyết & Flashcards**.
2. `De_Thi_Trac_Nghiem_Kien_Truc_May_Tinh.txt`: Dùng để thử nghiệm tính năng **Tải file đề thi trắc nghiệm & Chấm điểm tự động**.

---

## ⚙️ Cấu Trúc Dự Án
```
study-hub/
├── package.json          # Quản lý thư viện
├── server.js             # Máy chủ Express & Xử lý NLP / AI / Auth
├── .env                  # Cấu hình môi trường & Gemini API Key (tùy chọn)
├── data/                 # Cơ sở dữ liệu JSON (Users, Files, Quizzes, Results)
├── uploads/              # Thư mục lưu trữ bài tập an toàn theo từng sinh viên
├── sample-data/          # File dữ liệu mẫu ôn tập và đề thi
└── public/               # Giao diện Web hiện đại (Tailwind CSS & Lucide Icons)
    ├── index.html        # Giao diện đơn trang Dashboard, Kho, Phân tích, Thi
    ├── css/style.css     # Hiệu ứng chuyển động, Flip card 3D, Giao diện thi
    └── js/
        ├── app.js        # Điều hướng Tab, Quản lý phiên đăng nhập
        ├── files.js      # Kéo thả tải lên, quản lý dung lượng ổ C
        ├── analyzer.js   # Đọc và phân tích trọng tâm ôn tập
        └── quiz.js       # Phòng thi trắc nghiệm, đếm giờ và chấm điểm
```
