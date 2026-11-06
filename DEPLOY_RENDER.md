# 🚀 Hướng Dẫn Đưa Website Lên Render.com (Miễn Phí 24/7)

Dự án đã được cấu hình sẵn 100% tệp `package.json`, `.gitignore`, `render.yaml` và đã tạo sẵn git commit.

---

### BƯỚC 1: Tạo Repository Trên GitHub
1. Truy cập: **[https://github.com/new](https://github.com/new)** (đăng nhập tài khoản GitHub của bạn).
2. Đặt tên repository: `study-hub` (hoặc tên tùy thích).
3. Chọn chế độ **Public** hoặc **Private** đều được.
4. Nhấn **Create repository**.

---

### BƯỚC 2: Đẩy Code Từ Máy Bạn Lên GitHub
Mở Terminal trong VS Code (`Ctrl + ~`) hoặc PowerShell tại thư mục này và chạy 2 dòng lệnh (thay thế URL bằng link repo GitHub của bạn):

```bash
git remote add origin https://github.com/<TÊN-GITHUB-CỦA-BẠN>/study-hub.git
git push -u origin main
```

---

### BƯỚC 3: Triển Khai Lên Render.com
1. Truy cập **[https://dashboard.render.com](https://dashboard.render.com)** (đăng ký/đăng nhập bằng tài khoản GitHub).
2. Nhấn nút **New +** (màu xanh ở góc trên) -> Chọn **Web Service**.
3. Chọn repository `study-hub` mà bạn vừa đẩy lên ở Bước 2.
4. Render sẽ tự động điền cấu hình (hoặc bạn kiểm tra lại):
   - **Name:** `smartedu-study-hub`
   - **Language:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Nhấn **Deploy Web Service**.

Chờ khoảng 1-2 phút, Render sẽ cấp cho bạn một URL công khai vĩnh viễn dạng:
👉 **`https://smartedu-study-hub-xxxx.onrender.com`**
URL này chạy 24/7 trên toàn thế giới, sinh viên truy cập lúc nào cũng được!
