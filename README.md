# Aether Craft v4.0 — Pro 3D WebGL Minecraft Launcher

Launcher Minecraft siêu nhẹ, giao diện **Pro Gaming Studio (Emerald Dark & Crystal Daylight)** được thiết kế lại toàn diện từ đầu với **Engine 3D WebGL (`skinview3d` + `Three.js`)** và hình ảnh **Key Art chính thức từ Mojang Studios**.

## Điểm nâng cấp đột phá ở v4.0
1. **Nhân Vật 3D Minecraft Thật 100% (WebGL `skinview3d` + `Three.js`):**
   - Loại bỏ hoàn toàn khối CSS phẳng cũ: Nhân vật trong v4.0 được dựng bằng **WebGL 3D thực thụ** có chiều sâu (Depth Buffer), đổ bóng ánh sáng 3 chiều, đầy đủ **2 lớp Skin (Mũ, Áo khoác, Tay áo, Quần nổi 3D)**.
   - Hỗ trợ kéo chuột xoay 360°, cuộn phóng to/thu nhỏ, chuyển đổi 4 tư thế chuyển động (`Đi bộ`, `Chạy`, `Vẫy tay`, `Đứng thở`) và chọn nhanh các Skin nổi tiếng (`Dream`, `Technoblade`, `Notch`, `Alex`, `Steve`).
2. **Hình Ảnh Bản Cập Nhật Chính Thức Từ Mojang CDN:**
   - Tích hợp trực tiếp hình nền độ phân giải cao từ máy chủ Mojang (`Realms World`, `Wilderness Bound`, `The Garden Awakens 1.21.4`, `Trails & Tales 1.20.4`, `Nether Update 1.16.5`, `Vibrant Visuals 26.3`).
3. **Bố Cục Full-Viewport Không Khoảng Trống (Zero Bottom Whitespace):**
   - Thiết kế chuẩn Pro Gaming (lấy cảm hứng từ Lunar Client & Modrinth App) lấp đầy 100% khung hình, kèm nút chuyển đổi **Chế độ Tối Pro (Emerald Dark)** và **Chế độ Sáng (Crystal Daylight)**.
4. **Chơi Chung Song Song: Crack (Offline + Skin 3D) & Bản Quyền Microsoft OAuth2:**
   - **Crack / Offline:** Tạo UUID v3 chuẩn Mojang (`OfflinePlayer:<username>`) và tự động cấu hình `CustomSkinLoader` để hiển thị Skin trong game.
   - **Bản Quyền Microsoft:** Đăng nhập OAuth2 chính thức (`login.live.com` -> Xbox Live -> XSTS -> `api.minecraftservices.com`).
5. **5 Core Mod Loaders & 920+ Phiên Bản (`1.0` -> `1.21.4` & `26.3`):**
   - Hỗ trợ **Vanilla**, **Fabric**, **Forge**, **Quilt**, và **Legacy Fabric (1.8.9 PvP)**.
   - Tải đa luồng **64-Socket** + **Fast-Skip SHA1** (vào game dưới 1 giây từ lần thứ 2).

## Tải bản `.exe` Portable (Không cần cài đặt)
Tải trực tiếp file **`AetherCraft-Portable-4.0.0.exe`** tại mục **[Releases](https://github.com/buiduchuy2010qn-prog/aether-mine-launcher/releases/latest)**.
