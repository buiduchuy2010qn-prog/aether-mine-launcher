# ⚡ BlockWay Launcher v41.1.0 PRO — Every World, One Place (`blockway-launcher`)

<p align="center">
  <img src="src/ui/app-banner.png" alt="BlockWay Launcher — Every World, One Place" width="100%" style="border-radius:14px;" />
</p>

<p align="center">
  <a href="https://buiduchuy2010qn-prog.github.io/blockway-launcher/"><img src="https://img.shields.io/badge/Official_Website-BlockWay_Launcher-0284c7?style=for-the-badge" alt="Website" /></a>
  <a href="https://github.com/buiduchuy2010qn-prog/blockway-launcher/releases/latest"><img src="https://img.shields.io/badge/Release-v41.1.0_PRO-22c55e?style=for-the-badge" alt="Latest Release" /></a>
  <a href="https://github.com/buiduchuy2010qn-prog/blockway-launcher"><img src="https://img.shields.io/badge/Minecraft_1.7.10_to_26.3-7_Core_Loaders-06b6d4?style=for-the-badge" alt="Loaders" /></a>
</p>

**BlockWay Launcher** (*Every World, One Place* — phát triển bởi **buiduchuy2010qn-prog**) là trình khởi chạy Minecraft thế hệ mới sở hữu tính năng đặc biệt **⚡ Turbo Smooth Core™ — Can Thiệp Sâu 6 Tầng Tệp Cấu Hình Game & Hoàn Tác 1-Click**, **Menu Nhanh Tài Khoản & Ảnh Avatar Hồ Sơ Riêng**, **Trợ Lý OptiFine Đa Nền Tảng (`Fabric` • `Forge` • `NeoForge` • `Quilt` • `OptiFine`)**, **Ảnh bản đồ 16:9 trực quan cho Kho Hạt Giống (Seed Đẹp) & Kho Bản Đồ / Datapack**, **Đóng gói gửi bộ Mod cho bạn bè 2.0**, **Servers 2.0 ping thật & vào thẳng 1-Click**, hỗ trợ đầy đủ cả **Tài khoản Bản quyền Microsoft**, **Chế độ Offline / Crack (chơi miễn phí)** và **Tài khoản Đám mây 24/7** kèm **Mã OTP 6 số gửi thẳng về Gmail**.

🌐 **Trang chủ chính thức:** **[https://buiduchuy2010qn-prog.github.io/blockway-launcher/](https://buiduchuy2010qn-prog.github.io/blockway-launcher/)**

---

## 📦 Mới trong phiên bản `v41.1.0 PRO`

1. **⚡ Tính Năng Đặc Biệt: Turbo Smooth Core™ — Can Thiệp Sâu 6 Tầng Tệp Cấu Hình Game & Hoàn Tác 1-Click (MỚI `v41.1.0 PRO`):**
   - **Can thiệp trực tiếp vào tệp cấu hình thực của Minecraft & Modpack:** Không chỉ chỉnh tham số khởi chạy bên ngoài, BlockWay đi sâu tối ưu đồng bộ 6 tầng tệp bên trong `.minecraft` hoặc từng gói Modpack riêng:
     1. **`options.txt` (Async Disk I/O & Raw Input 1:1):** Ghi `syncChunkWrites:false` triệt tiêu hiện tượng khựng 0.5s khi lưu chunk trên ổ cứng Windows, tắt phím đọc `Ctrl+B` (`narrator:0`), bật `rawMouseInput:true` và cân chỉnh khung hình.
     2. **`optionsof.txt` + Khóa Bảo Vệ Shader Tự Động:** Bật `ofSmartAnimations`, `ofRenderRegions`, `ofFastMath`, `ofSmoothFps`; đặc biệt **tự động phát hiện gói Shader đang bật** (`iris.properties` / `optionsshaders.txt` / `oculus.properties`) để giữ `ofFastRender:false`, ngăn lỗi đen màn hình hoặc văng game.
     3. **`config/sodium-options.json` & `embeddium-options.json`:** Kích hoạt hoãn dựng chunk đa luồng (`always_defer_chunk_updates`), chỉ vẽ hoạt ảnh trong tầm mắt và hạ hàng đợi `cpu_render_ahead_limit` giảm độ trễ chuột.
     4. **`config/modernfix-mixins.properties`:** Bật `dynamic_resources=true` & `faster_item_rendering=true` giúp giảm **35–50% lượng RAM tiêu thụ** và rút ngắn một nửa thời gian nạp Modpack lớn.
     5. **`config/immediatelyfast.json` & `entityculling.json`:** Gom hàng trăm lệnh vẽ thanh máu/chữ HUD thành 1 lần gọi GPU (`hud_batching`) và ngừng tính toán thực thể khuất sau tường (`tickCulling`).
     6. **Khóa Khựng JVM Safepoint & Ưu Tiên Mạng IPv4:** Chặn Mod gọi `System.gc()` đột ngột, tắt ghi nháp `hsperfdata` ra ổ cứng và ưu tiên kết nối máy chủ qua IPv4.
   - **3 Chế Độ Độ Mượt & Khôi Phục Nguyên Bản 1-Click Không Mất Cài Đặt Cá Nhân:** Chọn nhanh **🍃 Mượt Êm Chuẩn**, **⚡ Siêu Mượt PvP (0ms • 260 FPS)** hoặc **🚀 Cứu Máy Yếu (iGPU • RAM 4–8GB)**. Hệ thống lưu bản gốc theo từng khóa trước khi can thiệp — bấm **↩️ Khôi Phục Nguyên Bản (1-Click)** bất kỳ lúc nào để trả lại 100% file gốc mà vẫn giữ nguyên mọi Phím tắt, Âm lượng hay Góc nhìn FOV người chơi vừa chỉnh trong game!
2. **👤 Menu Nhanh Tài Khoản, Ảnh Avatar Hồ Sơ Riêng & Nhận Diện Khuôn Mặt Skin Thông Minh (`v40.9.6 PRO`):**
   - **Menu nhanh ngay tại góc trên thanh bên (`#sidebarProfileCard`):** Bấm vào thẻ hồ sơ để mở trực tiếp bảng chuyển nhanh giữa **☁ Cloud • 👤 Offline • 👑 Microsoft**, đổi qua lại các tài khoản đã lưu 1-Click, thêm nhanh tên nhân vật mới hoặc đăng xuất ngay tại chỗ mà không bị nhảy trang.
   - **Tải ảnh Avatar hồ sơ riêng (`.PNG` / `.JPG` / `.WEBP`):** Tự do chọn bất kỳ ảnh đại diện cá nhân sắc nét cho hồ sơ Launcher (tách biệt hoàn toàn với trang phục 3D trong game), kèm nút **🔄 Dùng mặt Skin 3D** và **✨ Khôi phục Skin chuẩn** 1-Click.
   - **Nhận diện khuôn mặt UV thông minh & Lọc sạch Kho Skin 3D:** Tự động phát hiện đúng vùng khuôn mặt trên các mẫu Skin phá cách (vẽ mặt ở thân áo) để không bao giờ hiển thị lệch hình, tự lưu giữ Skin đang mặc vào Tủ đồ trước khi thay mới và lọc sạch các mẫu vô danh trong Kho Skin Trực Tuyến.
2. **🔆 Trợ Lý OptiFine Đa Nền Tảng, Tùy Chọn Từng Tính Năng & Hỗ Trợ `OptiFine_*.jar` Mọi Bản MC (`v40.9.5 PRO`):**
   - **Chọn tự do Đích cài đặt, Phiên bản MC & Mod Loader:** Không khóa cứng vào một cấu hình cố định — người chơi chọn ngay **Thư mục chính (`.minecraft`) hoặc bất kỳ gói Modpack đã cài**, chọn **mọi phiên bản Minecraft (`1.7.10 → 26.3`)** và chọn tự do nền tảng **`Core OptiFine`**, **`Fabric`**, **`Forge`**, **`NeoForge`** hoặc **`Quilt`**.
   - **Tích chọn từng tính năng lẻ & chọn Mod Zoom ưa thích:** Tự do bật/tắt riêng từng nhóm (*Tăng FPS êm máy, Chạy mọi gói Shader, Phím Zoom ống nhòm, Đuốc cầm tay phát sáng, Kính & Block nối liền, Fresh Animations & Custom Pack*) và chọn Mod Zoom yêu thích (*Zoomify, Logical Zoom, Zume, WI Zoom / Ok Zoomer*).
   - **Hỗ trợ `OptiFine_*.jar` gốc cho mọi phiên bản MC (Vanilla Độc Lập & Forge):** Tự động chuẩn bị sẵn tệp nền Minecraft để cài **Profile OptiFine Độc Lập** chạy trực tiếp như Vanilla cho mọi phiên bản (`1.7.10` → mới nhất), hoặc gắn thẳng vào `mods/` của **Core OptiFine / Forge** và tự cất gọn Mod trùng render.
2. **🖼️ Ảnh Bản Đồ 16:9 Cho Kho Hạt Giống (Seed Đẹp) & Kho Bản Đồ / Datapack (`v40.9.4+ PRO`):**
   - Toàn bộ 8 hạt giống tuyển chọn trong **🌱 Kho Hạt Giống (Seed Đẹp)** đều hiển thị **ảnh phong cảnh 16:9 sắc nét**, tọa độ nổi bật, tiêu đề đầy đủ dễ đọc và hỗ trợ **🔍 Phóng to xem chi tiết**.
   - Cửa sổ **+ Tạo Thế Giới Mới** tích hợp đầy đủ 8 thẻ chọn nhanh Seed kèm **khung xem trước ảnh bản đồ trực tiếp**, đồng thời **tự động gắn ảnh đại diện (`icon.png` + ảnh bìa rộng 16:9)** vào thư mục `.minecraft/saves` ngay khi tạo thế giới mới.
   - **🗺️ Kho Bản Đồ Xây Sẵn & Datapack** và nhánh **Bản đồ (Map)** trong Kho Modpack đồng bộ hiển thị ảnh chụp màn hình 16:9 từ Modrinth & CurseForge.
2. **📦 Đóng Gói & Gửi Bộ Mod Cho Bạn Bè 2.0 (`v40.9.2+ PRO`):**
   - Nút **📦 Đóng gói gửi bạn** hiển thị rõ ràng ngay đầu tab **Mod & Pack** và trên từng gói **Modpack đã cài**.
   - Cửa sổ đóng gói trực quan cho phép đặt tên bộ Mod, tùy chọn gửi kèm **Mod**, **Shader & Resource Pack**, **Cấu hình tinh chỉnh Mod (`config/`)**, **Phím tắt** và mặc định **tắt `servers.dat`** để giữ riêng tư IP máy chủ cá nhân.
   - Đóng gói xong tự mở sẵn thư mục và bôi đậm tệp `.mrpack` để kéo gửi thẳng qua Zalo / Discord — bạn bè chỉ cần kéo-thả vào cửa sổ BlockWay là tự cài khớp phiên bản MC + Loader + Mod!
3. **🔆 Core `OptiFine` Trực Tiếp 1-Click & Nhận Diện `OptiFine_*.jar` Thông Minh (`v40.9.2+ PRO`):**
   - **Chọn thẳng thẻ `OptiFine (Shader • Zoom)` tại Trang chủ:** Tự động kích hoạt cấu hình `OptiFine` `.jar` gốc (nếu đã cài) hoặc tự trang bị trọn bộ tính năng quen thuộc (*Tăng FPS êm máy, chạy mọi gói Shader, phím Zoom ống nhòm mượt, Đuốc cầm tay phát sáng, Kính nối liền không viền, hỗ trợ Fresh Animations & Custom Resource Pack*).
   - **Trợ lý `OptiFine_*.jar` thông minh:** Khi kéo-thả hoặc chọn tệp `OptiFine_*.jar` tải từ `optifine.net`, Launcher tự động đọc phiên bản MC bên trong tệp — nếu dùng Forge sẽ chép thẳng vào `mods/` và tự động cất gọn các Mod trùng render; nếu đang ở Vanilla / Fabric / NeoForge sẽ mở hộp thoại gợi ý chuyển sang Forge 1-Click hoặc chạy trình cài đặt Java gốc.
4. **📚 Kho Modpack Thông Minh 2.0 (`#tab-packs`, `v40.9.2+ PRO`):**
   - Bổ sung bộ lọc sắp xếp **🔥 Đề xuất (Bản mới & Hot)**, **⬇ Lượt tải cao nhất**, **🆕 Phiên bản MC mới nhất**, **🕒 Mới cập nhật** — tự động ưu tiên các gói `1.20.x` / `1.21+` chất lượng cao lên hàng đầu thay vì gói `1.6.4` / `1.7.10` cũ.
   - Dịch mô tả Tiếng Việt theo lô êm ái (không nghẽn mạng), phân trang chuẩn theo từng nguồn kèm nút **⬇ Xem thêm gói Modpack** hiển thị rõ tổng số gói, và báo rõ trạng thái `CurseForge: chưa gắn Key` thay vì báo lỗi.

---

## 🍃 Tính năng nổi bật trong `v40.8.0 PRO` & `v40.7.0 PRO`

1. **🍃 Chế Độ "Mượt Êm — Không Ép Máy" (bật sẵn, MỚI `v40.8.0 PRO`):**
   - Tự giới hạn FPS theo **tần số quét màn hình** (60–144Hz), chỉnh tầm nhìn / khoảng cách mô phỏng hợp lý và nạp RAM nhẹ nhàng — khung hình đều, **không vắt kiệt CPU/GPU**, máy mát và êm quạt hơn khi chơi lâu. Thêm **ModernFix** vào gói tăng FPS giúp vào game nhanh và nhẹ RAM. Tắt 1-Click là trả lại nguyên cài đặt cũ.
2. **🌐 Servers 2.0 (MỚI `v40.8.0 PRO`):**
   - Ping trực tiếp như màn hình Multiplayer trong game: **độ trễ thật (ms)**, **MOTD**, **logo server**, **phiên bản + cảnh báo lệch bản**, danh sách người đang chơi; **⚡ Vào Thẳng** 1-Click, **📌 Ghim** server yêu thích và **🔄 đồng bộ 2 chiều** với danh sách server trong Minecraft.
3. **📥 Kéo-Thả Cài Mọi Thứ (MỚI `v40.8.0 PRO`):**
   - Thả file **Mod `.jar`**, **Shader / Resource Pack `.zip`**, **Map `.zip`** hoặc **Modpack `.mrpack`** vào cửa sổ Launcher — tự nhận diện, cài đúng thư mục và bật sẵn (Shader tự chuyển sang Fabric nếu cần).
4. **🧺 Tủ Đồ Skin & 🦸 Áo Choàng Riêng (MỚI `v40.8.0 PRO`):**
   - Tự lưu **12 skin gần nhất** để mặc lại 1-Click; tải **áo choàng `.png`** của riêng bạn — bạn bè chơi Offline / LAN cũng nhìn thấy.
5. **📤 Chia Sẻ Log Lỗi 1-Click & 🖼️ Thư Viện Ảnh Chụp Mới:**
   - Bác Sĩ Crash tạo **link nhật ký (mclo.gs)** đã tự che tên máy & IP để gửi nhóm hỗ trợ; thư viện ảnh chụp có **xem toàn màn hình ←/→**, ghi rõ ảnh thuộc Modpack nào và **đặt làm hình nền** được lưu lại.
6. **🛠️ Sửa lỗi & tối ưu:** Mod đã tắt không còn tự bật lại, sửa thẻ Kho Seed / Kho Map, skin bạn bè hiển thị cả trong Modpack, hồi sinh Hardcore giữ nguyên ngày trong game & tự đưa về điểm hồi sinh nếu rơi Void, giao diện Sáng / Trắng Hồng rõ chữ hơn, bản Portable tự cập nhật đúng bản Portable.

---

## 🔥 Tính năng nổi bật trong phiên bản `v40.7.0 PRO`

1. **👕 Kho Skin Trực Tuyến Theo Chủ Đề & Đồng Bộ Thấy Đúng Skin Nhau (MỚI `v40.7.0 PRO`):**
   - **Kho Skin 3D trực tuyến 1-Click:** Duyệt và tìm kiếm hàng ngàn mẫu Skin theo chủ đề (*Anime, Ngầu, Dễ thương, Hiệp sĩ, YouTuber*) hoặc theo tên người chơi bất kỳ, xem trước mô hình và bấm **👕 Mặc Ngay** thẳng lên nhân vật 3D.
   - **Đồng bộ thấy đúng Skin nhau khi chơi chung Offline / LAN:** Trang bị 1-Click bộ **CustomSkinLoader + Lớp Áo Nổi 3D + Áo Choàng** và tự động chia sẻ ảnh Skin tùy chỉnh qua Phòng chơi chung để cả nhóm luôn nhìn thấy đúng trang phục riêng của nhau (không bị trùng Steve/Alex).

2. **⚔️ Chế Độ Chiến Đấu PvP / BedWars 1-Click Phong Cách Lunar Client (MỚI `v40.7.0 PRO`):**
   - Bấm 1 nút duy nhất để trang bị trọn bộ **Bảng phím bấm Keystrokes + tốc độ nhấp CPS, Tự chạy nhanh (`ToggleSprint`), Thanh độ bền Giáp & Hiệu ứng Thuốc, Tâm ngắm động, Phóng to / Góc nhìn 360° (`Freelook`) và Gói Lửa Thấp (`Low Fire`) không che màn hình**; tắt 1-Click là trả lại nguyên vẹn bộ Mod sinh tồn!

3. **🛠️ Trình Cứu Hộ Thế Giới Đang Chơi & Kho Hạt Giống Tuyển Chọn (MỚI `v40.7.0 PRO`):**
   - **Cứu hộ Thế giới & Hồi sinh Hardcore 1-Click:** Đọc trực tiếp mã **Seed**, **tọa độ nhân vật hiện tại (`X, Y, Z`)**, số ngày sinh tồn, lượng máu/kinh nghiệm; hỗ trợ **💖 Hồi sinh khỏi Hardcore khi lỡ tử trận**, **🔓 Mở khóa dùng lệnh**, **🎒 Bật giữ đồ khi chết (`KeepInventory`)** và **🏠 Cứu kẹt đưa nhân vật về Điểm xuất hiện**.
   - **🌱 Kho Hạt Giống (Seed) Đẹp Nhất:** Tuyển chọn sẵn các hạt giống cảnh quan kỳ vĩ (*Thung lũng Anh đào núi tuyết, Đảo Nấm không quái, Biệt thự + Thành cổ, Đảo San hô, Speedrun*) để tạo Map mới 1-Click.

4. **🎬 Studio Quay Lại Trận Đấu 3D & Xuất Video MP4 Tự Động (MỚI `v40.7.0 PRO`):**
   - Trang bị 1-Click trình ghi hình 3D siêu nhẹ (**Flashback / ReplayMod**) + **Camera bay tự do (`Freecam`)** kèm bộ kết xuất Video `.MP4` tự động — chơi mượt không tụt FPS, chơi xong mới xoay góc máy điện ảnh làm clip đăng TikTok / YouTube!

5. **🌍 Hệ Sinh Thái Tự Động Hóa Toàn Diện:**
   - **Gỡ trùng phím tắt Modpack & Sáng hang động Fullbright 1-Click**, **Kho Bản đồ xây sẵn & Datapack**, **Combo Đàm thoại Voice Chat & Tổ đội**, **Cố vấn RAM Generational ZGC**, **Tự động Đảo Void OneBlock / SkyBlock**, **6 Core Loaders** (`1.7.10` đến `26.3`) và **Bác Sĩ Crash Tiếng Việt**.

---

### 🔍 Từ khóa tìm kiếm (SEO Keywords)
`blockway-launcher`, `blockway launcher`, `tải minecraft crack`, `tải minecraft launcher crack`, `minecraft bản quyền và crack`, `minecraft offline miễn phí`, `chơi chung minecraft với bạn bè`, `neoforge launcher`, `aether-mine-launcher`, `aether-craft-launcher`, `buiduchuy2010qn-prog`, `minecraft launcher vietnam`
