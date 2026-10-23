# ⚡ Aether Client v2.0 — Minecraft Launcher (Dual-Auth: Crack & Bản Quyền Microsoft)

Launcher Minecraft giao diện hiện đại phong cách **Lunar / Feather Client** được xây dựng bằng **Electron + Node.js**, tích hợp **Xác thực kép (Dual-Auth)** cho phép chuyển đổi 1 nút giữa **Chế độ Offline (Crack miễn phí)** và **Tài khoản Bản Quyền Microsoft (OAuth2 chính hãng)**, cài đặt tự động **Vanilla / Fabric / Forge**, **Auto-Java Runtime** và **Kho Mod Tăng FPS (Modrinth)**.

---

## ✨ Tính năng nổi bật (Bản v2.0 Dual-Auth)

### 1. 🔐 Xác thực kép (Dual-Auth: Crack + Bản Quyền chung 1 Launcher)
- **🔓 Chế độ Offline (Crack - Miễn Phí):**
  - Nhập tên nhân vật bất kỳ, lưu nhiều hồ sơ để chuyển đổi nhanh.
  - Tự động tính toán **Offline UUID v3** (`OfflinePlayer:<username>`) chuẩn Mojang giúp vào các Server Crack không bị mất đồ.
  - Hỗ trợ cài đặt 1-Click mod **CustomSkinLoader** để hiển thị đầy đủ Skin & Cape ngay cả khi chơi Offline!
- **🛡️ Chế độ Bản Quyền Microsoft (Official MSA / Xbox Game Pass):**
  - Đăng nhập trực tiếp qua cửa sổ **Microsoft OAuth 2.0** chính thức (`login.live.com` $\rightarrow$ Xbox Live XBL $\rightarrow$ XSTS $\rightarrow$ `api.minecraftservices.com`).
  - Tự động lấy **Tên In-game thật**, **Online UUID thật** và **Skin bản quyền** để vào mọi Server quốc tế (**Hypixel, Wynncraft, CubeCraft, Realms**).
  - Lưu kèm `refresh_token` để **tự động gia hạn (Auto-Refresh)** phiên đăng nhập ở những lần mở Launcher tiếp theo.

### 2. 🚀 Đa phiên bản & Đa nền tảng Mod Loader
- Hỗ trợ đầy đủ hơn **920+ phiên bản** từ `1.8.9`, `1.12.2`, `1.16.5`, `1.20.4`, `1.21.4` đến `26.x`.
- Chuyển đổi 1 chạm giữa **Vanilla**, **Fabric** và **Forge**.

### 3. ☕ Tự động tải Java Runtime (Auto-JRE)
- Tự động nhận diện và tải **Eclipse Temurin OpenJDK (Java 8, 17, 21, 25)** tương ứng với phiên bản Minecraft bạn chọn.

### 4. ⚡ Kho Mod Tăng FPS trực tiếp (Modrinth API)
- **Cài đặt 1-Click trọn bộ FPS Boost:** *Fabric API, Sodium, Lithium, CustomSkinLoader, FerriteCore, EntityCulling, Iris Shaders, Mod Menu*.
- Tìm kiếm và cài đặt mọi Mod trên Modrinth tự động khớp phiên bản vào thẳng thư mục `mods/`.

---

## 🛠️ Chạy từ mã nguồn hoặc Đóng gói `.exe`

```bash
git clone https://github.com/buiduchuy2010qn-prog/aether-mine-launcher.git
cd aether-mine-launcher
npm install
npm start
```

Để đóng gói ra file `AetherClient-Portable-2.0.0.exe`:
```bash
npm run build:win
```
