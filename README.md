# ⚡ Aether Craft v31.5 PRO — Ultimate Minecraft Launcher (`aether-mine-launcher`)

[![Latest Release](https://img.shields.io/badge/Release-v31.5.0_PRO-22c55e?style=for-the-badge)](https://github.com/buiduchuy2010qn-prog/aether-mine-launcher/releases/latest)
[![Supabase Cloud 24/7](https://img.shields.io/badge/Aether_Cloud_ID-Supabase_PostgreSQL_24%2F7-06b6d4?style=for-the-badge)](https://github.com/buiduchuy2010qn-prog/aether-mine-launcher)
[![Modrinth Store](https://img.shields.io/badge/Modrinth_Store-77%2C600%2B_Mods_%26_Shaders-a855f7?style=for-the-badge)](https://github.com/buiduchuy2010qn-prog/aether-mine-launcher)

**Aether Craft Launcher** (*Aether Mine Launcher* — bởi **buiduchuy2010qn-prog**) là trình khởi chạy Minecraft thế hệ mới tích hợp **Hệ thống Tài khoản Đám mây Aether Cloud 24/7 (Supabase PostgreSQL)**, xác thực **Mã OTP 6 số gửi thẳng về Gmail**, bảo mật **Zero-Trust RPC chống dịch ngược mã nguồn**, mô hình **3D Skin & Cape thực tế**, và kho **77,600+ Mods / Modpacks / Shaders / Resource Packs** từ Modrinth.

---

## 🔥 Tính năng nổi bật trong phiên bản `v31.5.0 PRO`

1. **🛡️ Hệ thống Tài khoản Aether Cloud 24/7 (Supabase PostgreSQL + Gmail OTP thật):**
   - **Tách riêng 3 chế độ trực quan:** `🔑 Đăng Nhập` | `✨ Tạo Tài Khoản` | `🔄 Quên MK` — bấm vào mục nào chỉ hiển thị đúng giao diện của mục đó.
   - **Sở hữu độc quyền Tên nhân vật (Username):** Mỗi tên nhân vật Minecraft thuộc về duy nhất 1 tài khoản trên đám mây, người khác không thể tạo trùng hay đổi sang tên của bạn.
   - **Khôi phục mật khẩu bằng Mã OTP 6 số qua Gmail thật:** Gửi thư xác nhận trực tiếp về hộp thư `mail.google.com`.
   - **Đổi mật khẩu an toàn:** Yêu cầu xác minh đúng **Mật khẩu cũ** trước khi lưu mật khẩu mới.
2. **🔒 Bảo mật Zero-Trust & Chống Bot Spam đa lớp:**
   - **Khóa bảo mật Server-Side RPC (`SECURITY DEFINER`):** Bảng dữ liệu `aether_accounts` trên Supabase khóa hoàn toàn quyền truy cập trực tiếp (`REVOKE ALL`). Dù mã nguồn công khai trên GitHub, không ai có thể đọc trộm danh sách tài khoản, lấy mã băm mật khẩu hay sửa tài khoản của người khác.
   - **Không lưu dữ liệu nhạy cảm trên ổ cứng (`Zero Disk Cache`):** Tự động xóa bỏ mọi file bộ nhớ đệm tài khoản trên máy.
   - **Chống Bot tự động:** Tích hợp phép tính Captcha Toán học, chặn tên miền Email rác/ảo, khóa 60s khi nhập sai 5 lần liên tiếp, và giới hạn tốc độ gửi OTP.
3. **🎨 3D Minecraft Skin & Cape Studio + Kho Modrinth 77,600+:**
   - Xem trước nhân vật 3D tương tác trực tiếp, tải Skin `.png` từ máy và đồng bộ lên Aether Cloud.
   - Cài đặt **Vanilla, Fabric, Forge, Quilt, NeoForge** và tải Mods / Shaders / Resource Packs chỉ với 1 cú nhấp chuột.

---

## 🚀 Cách tải về & Cài đặt

1. Tải bản cài đặt mới nhất tại mục **[Releases (v31.5.0 PRO Latest)](https://github.com/buiduchuy2010qn-prog/aether-mine-launcher/releases/latest)** hoặc bấm nút **Cập nhật** ngay bên trong Launcher.
2. Nếu chạy từ mã nguồn:
   ```bash
   git clone https://github.com/buiduchuy2010qn-prog/aether-mine-launcher.git
   cd aether-mine-launcher
   npm install
   npm start
   ```

---

### 🔍 Từ khóa tìm kiếm (SEO Keywords)
`aether mine launcher`, `aether craft launcher`, `buiduchuy2010qn-prog`, `minecraft launcher vietnam`, `aether cloud id`, `minecraft modrinth launcher`
