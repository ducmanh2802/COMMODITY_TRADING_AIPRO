import { q, type Lesson, type QuizQuestion } from './types';

/**
 * Bổ sung cho Cấp 1–6: mỗi bài thêm ví dụ tình huống cụ thể và câu đố vận dụng.
 * Mọi giá, ký quỹ, phí, tỷ giá là SỐ MINH HOẠ để học — không phải số thật của MXV.
 * Thông số hợp đồng (ZC 1 cent = 50 USD, KC 1 cent = 375 USD, RC 1 USD/tấn = 10 USD,
 * GC 1 USD/oz = 100 USD, CL 1 USD/thùng = 1.000 USD) khớp server/data/instruments.ts.
 */
export interface LessonExtra {
  examples: { title: string; text: string }[];
  quiz: QuizQuestion[];
}

export const LESSON_EXTRAS: Record<string, LessonExtra> = {
  // ───────────── Cấp 1 — Nền tảng ─────────────
  'l1-commodity': {
    examples: [
      { title: 'Chuỗi tác động: bão ở Brazil → ly cà phê ở Việt Nam', text: 'Tin sương giá ở Minas Gerais (Brazil) → thị trường lo sản lượng arabica giảm → giá arabica (KC) tăng → nhà rang xay chuyển một phần sang robusta → giá robusta (RC) tăng theo → người trồng ở Tây Nguyên được trả giá cao hơn. Một sự kiện thời tiết ở xa ảnh hưởng tới giá trong nước qua quan hệ cung–cầu toàn cầu.' },
    ],
    quiz: [
      q('Kho dầu thô Mỹ tăng mạnh hơn dự kiến trong tuần. Phản ứng thường gặp của giá dầu?', ['Áp lực giảm vì cung dư hơn', 'Chắc chắn tăng', 'Không liên quan', 'Giá vàng giảm 50%'], 0, 'Tồn kho tăng = cung dư so với cầu → thường gây áp lực giảm, dù thị trường còn xét kỳ vọng trước đó.'),
      q('Vì sao hàng hoá dễ chuẩn hoá thành hợp đồng sàn?', ['Hàng cùng loại, cùng chất lượng có thể thay thế nhau', 'Mỗi lô là độc nhất', 'Không có giá', 'Chỉ bán lẻ'], 0, 'Tính đồng nhất (fungible) giúp quy định một chuẩn chung cho mọi lô hàng.'),
    ],
  },
  'l1-spot-futures': {
    examples: [
      { title: 'Mark-to-market qua 3 ngày', text: 'Bạn mua 1 hợp đồng ngô ZC giá 450 cent. Ngày 1 đóng cửa 453 (+3 cent × 50 USD = +150 USD vào tài khoản). Ngày 2 đóng 447 (−6 cent = −300 USD). Ngày 3 đóng 452 (+5 cent = +250 USD). Tổng: +100 USD = (452 − 450) × 50. Lãi lỗ được ghi mỗi ngày, nên dù cuối cùng có lãi, ngày 2 tài khoản vẫn phải đủ tiền chịu lỗ.' },
    ],
    quiz: [
      q('Mua ZC giá 450, ngày hôm sau đóng cửa 446. Tài khoản thay đổi bao nhiêu (1 hợp đồng, 1 cent = 50 USD)?', ['−200 USD', '+200 USD', '−4 USD', '−50 USD'], 0, '(446 − 450) × 50 = −200 USD, được trừ ngay cuối ngày.'),
      q('Giá giao ngay và giá futures tháng gần thường có quan hệ thế nào khi gần đáo hạn?', ['Tiến lại gần nhau', 'Càng xa nhau', 'Không bao giờ gặp', 'Futures luôn gấp đôi'], 0, 'Khi sắp đáo hạn, futures hội tụ về giá giao ngay vì có thể giao hàng thật.'),
    ],
  },
  'l1-contract': {
    examples: [
      { title: 'Đọc một mã và tính giá trị hợp đồng', text: 'KCN6 = Cà phê arabica (KC), tháng 7 (N), năm 2026. Hợp đồng 37.500 pound. Nếu giá 300 cent/pound (3 USD), giá trị danh nghĩa = 37.500 × 3 = 112.500 USD ≈ 2,8 tỷ đồng (tỷ giá minh hoạ 25.000). Giá đi 1 cent → 375 USD. Một hợp đồng nhỏ trên màn hình thực chất là lượng hàng rất lớn.' },
    ],
    quiz: [
      q('Arabica KC: giá tăng 4 cent, 1 hợp đồng long. Lãi bao nhiêu (1 cent = 375 USD)?', ['1.500 USD', '375 USD', '150 USD', '4 USD'], 0, '4 × 375 = 1.500 USD.'),
      q('Mã "RCU6" là gì?', ['Robusta, tháng 9/2026', 'Ngô, tháng 9/2026', 'Robusta, tháng 6/2026', 'Đồng, tháng 9'], 0, 'RC = robusta; U = tháng 9; 6 = 2026.'),
    ],
  },
  'l1-margin': {
    examples: [
      { title: 'Cùng 50 triệu đồng, hai cách dùng', text: 'Cách A: nộp 50 triệu, dùng 40 triệu làm ký quỹ cho 1 hợp đồng ngô (giá trị ≈ 22.500 USD ≈ 560 triệu, đòn bẩy ≈ 14 lần). Giá giảm 3% → lỗ ≈ 17 triệu = 34% tài khoản. Cách B: tài khoản 300 triệu, cũng 1 hợp đồng → lỗ 17 triệu chỉ là 5,7%. Đòn bẩy thật nằm ở giá trị hợp đồng so với TOÀN BỘ tài khoản, không phải ký quỹ sàn yêu cầu. (Số minh hoạ.)' },
    ],
    quiz: [
      q('Hợp đồng giá trị 100.000 USD, ký quỹ 5.000 USD. Đòn bẩy là?', ['20 lần', '5 lần', '50 lần', '2 lần'], 0, '100.000 ÷ 5.000 = 20.'),
      q('Ký quỹ ban đầu 2.000 USD, duy trì 1.600 USD, tài khoản còn 1.500 USD. Bạn cần nộp thêm để về mức nào?', ['Về lại mức ký quỹ ban đầu 2.000 USD (thường gặp)', 'Không cần gì', 'Về 0', 'Về 1.600 rồi thôi, luôn luôn'], 0, 'Thông lệ là nộp đủ về mức ban đầu; quy tắc cụ thể do thành viên/sàn quy định.'),
    ],
  },
  'l1-pnl': {
    examples: [
      { title: 'Short robusta: lãi khi giá giảm', text: 'Bán 2 hợp đồng robusta RC ở 4.500 USD/tấn. Giá giảm về 4.380. Lãi = (4.500 − 4.380) × 10 tấn × 2 = 120 × 20 = 2.400 USD. Trừ phí giả định 2 × 2 lượt × 10 USD = 40 USD → lãi ròng 2.360 USD. Nếu giá tăng lên 4.560 thì lỗ = 60 × 20 = 1.200 USD + phí.' },
    ],
    quiz: [
      q('Long 1 hợp đồng vàng GC ở 2.400, đóng ở 2.385 (1 USD/oz = 100 USD). Kết quả?', ['Lỗ 1.500 USD', 'Lãi 1.500 USD', 'Lỗ 15 USD', 'Lỗ 150 USD'], 0, '(2.385 − 2.400) × 100 = −1.500 USD.'),
      q('Short 3 hợp đồng ngô ở 440, mua lại ở 432 (1 cent = 50 USD). Lãi gộp?', ['1.200 USD', '400 USD', '−1.200 USD', '24 USD'], 0, '8 cent × 50 × 3 = 1.200 USD; short lãi khi giá giảm.'),
    ],
  },
  'l1-expiry-roll': {
    examples: [
      { title: 'Lịch xử lý một vị thế ngô tháng 7', text: 'Bạn giữ ZCN6 (tháng 7). FND của hợp đồng tháng 7 rơi vào cuối tháng 6. Khoảng 5–10 ngày trước FND, thanh khoản dịch sang tháng 9 (ZCU6). Việc cần làm: hoặc đóng hẳn, hoặc bán ZCN6 và mua ZCU6 cùng lúc (roll). Nếu tháng 9 đắt hơn 6 cent (contango), roll 1 hợp đồng mua tốn 6 × 50 = 300 USD chênh lệch. Ngày cụ thể luôn tra lịch sàn/MXV.' },
    ],
    quiz: [
      q('Roll 1 hợp đồng ngô đang SHORT: mua lại tháng gần 450, bán tháng xa 456. Chênh lệch có lợi hay bất lợi?', ['Có lợi 300 USD (bán được giá cao hơn)', 'Bất lợi 300 USD', 'Không đổi', 'Bất lợi 6 USD'], 0, 'Short bán xa cao hơn giá mua lại gần: +6 cent × 50 = 300 USD (trước phí).'),
      q('Thấy khối lượng tháng gần giảm mạnh và tháng sau tăng mạnh, điều đó thường báo hiệu?', ['Thị trường đang roll sang tháng sau', 'Sàn đóng cửa', 'Giá sắp tăng gấp đôi', 'Lỗi dữ liệu chắc chắn'], 0, 'Thanh khoản chuyển dần sang hợp đồng kế tiếp trước FND.'),
    ],
  },
  'l1-hedger-spec': {
    examples: [
      { title: 'Nông dân cà phê phòng hộ bằng short', text: 'Hộ trồng dự kiến thu 10 tấn robusta sau 3 tháng, giá hiện 4.500 USD/tấn. Lo giá giảm, họ (qua doanh nghiệp thu mua) bán trước 1 hợp đồng RC (10 tấn). Nếu giá về 4.000: bán hàng thật thiệt 500 × 10 = 5.000 USD nhưng hợp đồng short lãi ≈ 5.000 USD → tổng gần như khoá ở 4.500. Nếu giá lên 5.000 thì ngược lại: hàng thật được thêm, hợp đồng lỗ. Phòng hộ đổi "cơ hội lãi thêm" lấy "sự chắc chắn".' },
    ],
    quiz: [
      q('Nhà máy thức ăn chăn nuôi cần mua ngô 3 tháng tới, sợ giá tăng. Họ phòng hộ bằng cách?', ['Mua (long) futures ngô', 'Bán (short) futures ngô', 'Không làm gì là phòng hộ', 'Mua vàng'], 0, 'Người sẽ MUA hàng thật phòng hộ bằng long futures.'),
      q('Giá tăng mạnh sau khi nông dân đã short phòng hộ. Kết quả tổng thể?', ['Hợp đồng lỗ, hàng thật bán được giá cao hơn bù lại', 'Lỗ gấp đôi', 'Lãi gấp đôi', 'Bị cấm bán hàng'], 0, 'Hai chân bù trừ nhau; giá bán ròng gần mức đã khoá.'),
    ],
  },

  // ───────────── Cấp 2 — MXV ─────────────
  'l2-mxv': {
    examples: [
      { title: 'Một lệnh đi qua những đâu', text: 'Bạn đặt mua 1 hợp đồng ngô trên phần mềm của công ty môi giới (thành viên MXV) → lệnh qua hệ thống MXV → được liên thông tới CBOT (sàn ngô gốc ở Mỹ) → khớp theo giá quốc tế. Tiền ký quỹ nằm ở thành viên/MXV bằng VND. Vì vậy giá bạn thấy là giá thế giới, nhưng tài khoản và pháp lý là ở Việt Nam.' },
    ],
    quiz: [
      q('Giá robusta bạn thấy khi giao dịch qua MXV đến từ đâu?', ['Sàn quốc tế liên thông (ICE Europe)', 'Giá thu mua ở chợ Đắk Lắk', 'Do công ty môi giới tự đặt', 'Ngẫu nhiên'], 0, 'MXV liên thông giá với sàn gốc; giá trong nước là giá giao ngay khác.'),
      q('Bạn muốn biết danh sách hàng hoá đang được phép giao dịch. Nguồn đúng nhất?', ['Thông báo trên mxv.com.vn', 'Bình luận Facebook', 'Tin nhắn người lạ', 'Đoán theo tên mã'], 0, 'Danh mục có thể thay đổi; luôn xem nguồn chính thức.'),
    ],
  },
  'l2-brokers': {
    examples: [
      { title: 'Kiểm tra một công ty trong 3 phút', text: 'Một người gọi mời "đầu tư cà phê lãi 5%/tháng" với tên công ty X. Bước 1: vào mxv.com.vn → danh sách thành viên → tìm tên X (đúng tên pháp lý, mã số thuế). Bước 2: so số tài khoản nhận tiền — phải là tài khoản công ty, không phải cá nhân. Bước 3: xin biểu phí và hợp đồng mở tài khoản bằng văn bản. "Lãi cố định 5%/tháng" đã là dấu hiệu đủ để dừng.' },
    ],
    quiz: [
      q('Nhân viên tư vấn đề nghị bạn chuyển ký quỹ vào tài khoản cá nhân của họ "cho nhanh". Bạn nên?', ['Từ chối và chỉ nộp vào tài khoản công ty đã xác minh', 'Đồng ý vì nhanh', 'Chuyển một nửa', 'Chuyển qua ví điện tử của họ'], 0, 'Tiền ký quỹ chỉ nộp vào tài khoản pháp nhân thành viên.'),
      q('Trước khi chọn môi giới, so sánh điều gì là hợp lý nhất?', ['Biểu phí, ký quỹ yêu cầu, phần mềm, quy tắc thanh lý', 'Ai hứa lãi cao nhất', 'Ai có quà tặng lớn nhất', 'Ai nhắn tin nhiều nhất'], 0, 'Chi phí và quy tắc rủi ro ảnh hưởng trực tiếp tới kết quả.'),
    ],
  },
  'l2-hours': {
    examples: [
      { title: 'Một ngày của người giao dịch ngô ở Việt Nam', text: 'Phiên ngô CBOT có phiên điện tử gần như cả đêm theo giờ Việt Nam, nhưng sôi động nhất khi phiên Mỹ mở cửa (khoảng 20h30–21h30 giờ VN, tuỳ mùa hè/đông). Báo cáo WASDE công bố lúc 12h giờ Mỹ miền Đông ≈ 23h hoặc 0h giờ VN. Người đi làm ban ngày nên đặt lệnh chờ và cắt lỗ trước khi ngủ thay vì thức canh bảng giá. Giờ chính xác luôn tra MXV/môi giới.' },
    ],
    quiz: [
      q('Tháng 3 nước Mỹ chuyển sang giờ mùa hè. Giờ mở cửa phiên Mỹ theo giờ Việt Nam sẽ?', ['Sớm hơn khoảng 1 tiếng', 'Muộn hơn 1 tiếng', 'Không đổi', 'Lệch 12 tiếng'], 0, 'Mùa hè Mỹ nhanh thêm 1 giờ nên mở cửa sớm hơn 1 giờ theo giờ VN.'),
      q('Bạn không thể theo dõi lúc báo cáo lớn công bố đêm khuya. Cách xử lý hợp lý?', ['Giảm khối lượng hoặc đứng ngoài, luôn có lệnh cắt lỗ', 'Tăng gấp đôi khối lượng', 'Bỏ cắt lỗ', 'Vay thêm tiền'], 0, 'Báo cáo có thể làm giá nhảy mạnh; kiểm soát rủi ro trước.'),
    ],
  },
  'l2-fx-fees': {
    examples: [
      { title: 'Một lệnh lãi nhỏ có thể thành lỗ vì phí', text: 'Lướt 1 hợp đồng ngô, lãi 1 cent = 50 USD. Phí giả định 2 lượt × 12 USD = 24 USD, trượt giá 1 tick mỗi chiều = 25 USD. Còn lại 50 − 24 − 25 = 1 USD. Nếu tỷ giá khi nộp và rút chênh nhau cũng ăn thêm một phần. Kết luận: lệnh mục tiêu quá nhỏ gần như chỉ nuôi phí. (Số minh hoạ — hỏi biểu phí thật.)' },
    ],
    quiz: [
      q('Lãi 300 USD, tỷ giá minh hoạ 25.000 VND/USD. Quy ra VND?', ['7,5 triệu', '75 triệu', '750 nghìn', '3 triệu'], 0, '300 × 25.000 = 7.500.000 VND.'),
      q('Phí 2 chiều 25 USD/hợp đồng, mỗi tháng 40 lệnh 1 hợp đồng. Tổng phí?', ['1.000 USD', '25 USD', '400 USD', '100 USD'], 0, '40 × 25 = 1.000 USD/tháng — giao dịch nhiều là chi phí lớn.'),
    ],
  },
  'l2-account': {
    examples: [
      { title: 'Danh sách việc trước khi nộp tiền', text: '1) Xác minh công ty là thành viên MXV. 2) Đọc hợp đồng: mức ký quỹ, ngưỡng gọi ký quỹ, ngưỡng tự động thanh lý (ví dụ tài khoản còn 30% ký quỹ là bị đóng lệnh). 3) Ghi lại biểu phí từng mặt hàng. 4) Hỏi quy định ngày đóng/roll bắt buộc trước FND. 5) Thử phần mềm ở tài khoản demo. 6) Nộp số tiền nhỏ, thử nộp–rút một lần để chắc quy trình hoạt động.' },
    ],
    quiz: [
      q('Hợp đồng ghi: "tài khoản dưới 30% ký quỹ yêu cầu sẽ bị thanh lý". Điều này nghĩa là?', ['Vị thế có thể bị đóng tự động khi lỗ sâu', 'Được tặng 30%', 'Phí giảm 30%', 'Không ảnh hưởng'], 0, 'Biết ngưỡng thanh lý giúp bạn không bị đóng lệnh bất ngờ.'),
      q('Vì sao nên thử nộp–rút một khoản nhỏ trước?', ['Kiểm tra quy trình và thời gian xử lý thực tế', 'Để được thưởng', 'Vì bắt buộc gấp đôi', 'Không có lý do'], 0, 'Phát hiện sớm vấn đề trước khi đưa số tiền lớn.'),
    ],
  },
  'l2-legal': {
    examples: [
      { title: 'Phân biệt nguồn đáng tin', text: 'Bạn đọc bài "giao dịch hàng hoá là bất hợp pháp". Kiểm tra: văn bản nào được trích? Có số hiệu, ngày ban hành? Tra trên cổng thông tin văn bản pháp luật. Giao dịch qua thành viên MXV khác hoàn toàn với "sàn" nước ngoài không phép. Khi còn nghi ngờ, hỏi trực tiếp MXV hoặc luật sư — ứng dụng này chỉ giáo dục.' },
    ],
    quiz: [
      q('Một nhóm Zalo nói "sàn forex nước ngoài này được cấp phép ở Việt Nam". Cách kiểm chứng?', ['Tra cơ quan quản lý và văn bản gốc, không tin lời nhóm', 'Tin vì đông người', 'Hỏi admin nhóm', 'Xem số lượt thích'], 0, 'Luôn kiểm chứng từ nguồn chính thức.'),
      q('Hàng hoá phái sinh qua MXV và chứng khoán phái sinh qua HNX có giống nhau về khung pháp lý?', ['Không, là hai khung khác nhau', 'Giống hệt', 'Đều không có luật', 'Đều do ngân hàng quản lý'], 0, 'Chứng khoán phái sinh theo NĐ 158/2020; hàng hoá qua Sở giao dịch hàng hoá theo khung riêng.'),
    ],
  },

  // ───────────── Cấp 3 — Từng nhóm hàng ─────────────
  'l3-grains': {
    examples: [
      { title: 'Đọc WASDE như một bài toán', text: 'Giả định WASDE hạ dự báo năng suất ngô Mỹ từ 181 xuống 177 bushel/mẫu do nắng nóng tháng 7. Sản lượng giảm → tồn kho cuối vụ dự kiến giảm → tỷ lệ tồn kho/tiêu thụ thấp hơn → thị trường thường phản ứng tăng giá. Nhưng nếu thị trường ĐÃ kỳ vọng còn 175, con số 177 lại là "tốt hơn dự kiến" và giá có thể giảm. So với kỳ vọng mới là chìa khoá.' },
    ],
    quiz: [
      q('WASDE nâng dự báo tồn kho cuối vụ lúa mì cao hơn kỳ vọng. Phản ứng thường gặp?', ['Áp lực giảm giá', 'Chắc chắn tăng', 'Không liên quan', 'Giá cà phê tăng'], 0, 'Tồn kho nhiều hơn kỳ vọng = cung dồi dào hơn.'),
      q('Tháng 7 nắng nóng, khô hạn ở vành đai ngô Mỹ. Vì sao giá nhạy cảm?', ['Ngô đang thụ phấn, giai đoạn quyết định năng suất', 'Ngô đã thu hoạch xong', 'Mùa đông', 'Không ảnh hưởng'], 0, 'Thụ phấn (tháng 7) quyết định số hạt.'),
    ],
  },
  'l3-soy': {
    examples: [
      { title: 'Biên ép đơn giản hoá', text: '1 bushel đậu tương (~27,2 kg) khi ép cho khoảng 20 kg khô đậu và 5 kg dầu (ước lượng phổ biến). Nếu giá khô đậu và dầu tăng nhanh hơn giá hạt, biên ép mở rộng → nhà máy ép mua hạt nhiều hơn → hỗ trợ giá đậu tương. Với Việt Nam, khô đậu tăng giá kéo chi phí thức ăn chăn nuôi lên.' },
    ],
    quiz: [
      q('Giá dầu đậu tương tăng mạnh do nhu cầu nhiên liệu sinh học. Tác động tới biên ép?', ['Biên ép có xu hướng mở rộng', 'Biên ép chắc chắn bằng 0', 'Không liên quan', 'Giá khô đậu tăng gấp đôi'], 0, 'Sản phẩm ép đắt lên trong khi giá hạt chưa theo kịp.'),
      q('Doanh nghiệp chăn nuôi Việt Nam theo dõi hợp đồng nào nhất?', ['Khô đậu tương (ZM) và ngô', 'Bạch kim', 'Khí tự nhiên', 'Bạc'], 0, 'Đây là hai nguyên liệu chính của thức ăn chăn nuôi.'),
    ],
  },
  'l3-coffee': {
    examples: [
      { title: 'So sánh hai chiều lãi lỗ', text: 'Arabica KC: giá đi 5 cent/pound → 5 × 375 = 1.875 USD/hợp đồng. Robusta RC: giá đi 100 USD/tấn → 100 × 10 = 1.000 USD/hợp đồng. Hai mã khác đơn vị (cent/pound và USD/tấn) nên không so trực tiếp con số giá; hãy luôn quy ra USD/hợp đồng. Chênh lệch arabica–robusta (arbitrage) mở rộng thường do yếu tố riêng của Brazil hoặc Việt Nam.' },
    ],
    quiz: [
      q('Robusta RC tăng 150 USD/tấn, 2 hợp đồng long. Lãi?', ['3.000 USD', '1.500 USD', '300 USD', '150 USD'], 0, '150 × 10 tấn × 2 = 3.000 USD.'),
      q('Tây Nguyên khô hạn kéo dài mùa ra hoa. Mã nào phản ứng trực tiếp nhất?', ['Robusta (RC)', 'Vàng (GC)', 'Dầu (CL)', 'Đồng (HG)'], 0, 'Việt Nam là nước xuất khẩu robusta lớn nhất.'),
    ],
  },
  'l3-softs': {
    examples: [
      { title: 'Đường và dầu: mối nối qua ethanol', text: 'Brazil có thể chia mía cho đường hoặc ethanol. Giá dầu tăng → ethanol hấp dẫn → nhà máy dùng nhiều mía làm ethanol hơn → nguồn cung đường giảm → hỗ trợ giá đường. Cao su tự nhiên lại cạnh tranh với cao su tổng hợp làm từ dầu: dầu đắt → cao su tổng hợp đắt → hỗ trợ cao su tự nhiên.' },
    ],
    quiz: [
      q('Giá dầu giảm mạnh. Tác động thường gặp với giá đường?', ['Áp lực giảm vì ethanol kém hấp dẫn, mía chuyển về làm đường', 'Chắc chắn tăng', 'Không liên quan', 'Đường thành kim loại'], 0, 'Nhiều mía làm đường hơn → cung đường tăng.'),
      q('Bờ Biển Ngà gặp mưa trái mùa gây bệnh trên cây. Mã nào chịu tác động?', ['Ca cao (CC)', 'Bông (CT)', 'Bạc (SI)', 'Khí (NG)'], 0, 'Tây Phi chiếm phần lớn sản lượng ca cao.'),
    ],
  },
  'l3-precious': {
    examples: [
      { title: 'Vàng phản ứng với lãi suất thực', text: 'Vàng không trả lãi. Khi lãi suất thực (lãi suất trừ lạm phát) của Mỹ tăng, giữ trái phiếu hấp dẫn hơn giữ vàng → vàng chịu áp lực. Khi thị trường kỳ vọng Fed hạ lãi suất hoặc có khủng hoảng, dòng tiền trú ẩn vào vàng. Vàng GC: giá đi 20 USD/oz → 20 × 100 = 2.000 USD/hợp đồng.' },
    ],
    quiz: [
      q('Vàng GC giảm 12 USD/oz, bạn short 1 hợp đồng (1 USD/oz = 100 USD). Kết quả?', ['Lãi 1.200 USD', 'Lỗ 1.200 USD', 'Lãi 12 USD', 'Lỗ 120 USD'], 0, 'Short lãi khi giảm: 12 × 100 = 1.200 USD.'),
      q('Lãi suất thực Mỹ tăng mạnh. Tác động thường gặp với vàng?', ['Áp lực giảm', 'Chắc chắn tăng', 'Không liên quan', 'Vàng ngừng giao dịch'], 0, 'Chi phí cơ hội của việc giữ vàng tăng.'),
    ],
  },
  'l3-industrial': {
    examples: [
      { title: 'Theo dấu nhu cầu Trung Quốc', text: 'Dữ liệu PMI sản xuất Trung Quốc dưới 50 và số liệu xây dựng nhà ở giảm → kỳ vọng nhu cầu thép và dây điện giảm → quặng sắt và đồng chịu áp lực. Ngược lại, gói kích thích hạ tầng thường hỗ trợ cả hai. Tồn kho đồng tại các kho LME/SHFE cũng là manh mối cung–cầu.' },
    ],
    quiz: [
      q('Trung Quốc công bố gói kích thích hạ tầng lớn. Mã nào thường được hỗ trợ?', ['Đồng và quặng sắt', 'Ca cao', 'Khí tự nhiên Mỹ', 'Cà phê'], 0, 'Hạ tầng dùng nhiều thép và đồng.'),
      q('PMI sản xuất của một nền kinh tế lớn dưới 50 nghĩa là?', ['Hoạt động sản xuất đang thu hẹp', 'Tăng trưởng mạnh', 'Không có ý nghĩa', 'Giá chắc chắn tăng'], 0, 'PMI 50 là ngưỡng mở rộng/thu hẹp.'),
    ],
  },
  'l3-oil': {
    examples: [
      { title: 'Một tuần tin dầu', text: 'Thứ Hai: OPEC+ giữ nguyên cắt giảm → hỗ trợ giá. Thứ Tư: EIA báo tồn kho dầu thô Mỹ tăng 5 triệu thùng (kỳ vọng giảm 1 triệu) → áp lực giảm. Thứ Sáu: số liệu việc làm Mỹ yếu → lo nhu cầu nhiên liệu → giảm thêm. Dầu CL: giá đi 1 USD/thùng → 1.000 USD/hợp đồng, nên biến động 3 USD trong tuần là 3.000 USD.' },
    ],
    quiz: [
      q('Dầu WTI CL tăng 2,5 USD/thùng, 1 hợp đồng long (1 USD = 1.000 USD). Lãi?', ['2.500 USD', '250 USD', '25 USD', '25.000 USD'], 0, '2,5 × 1.000 = 2.500 USD.'),
      q('EIA báo tồn kho giảm mạnh hơn kỳ vọng. Phản ứng thường gặp?', ['Hỗ trợ giá tăng', 'Chắc chắn giảm', 'Không liên quan', 'Vàng tăng gấp đôi'], 0, 'Tồn kho giảm = cầu mạnh hoặc cung yếu.'),
    ],
  },
  'l3-gas': {
    examples: [
      { title: 'Vì sao khí tự nhiên "nguy hiểm" cho người mới', text: 'Dự báo thời tiết đổi từ "đông ấm" sang "rét đậm" có thể khiến giá khí NG nhảy 8–10% trong một ngày. Với hợp đồng 10.000 MMBtu, giá đi 0,10 USD → 1.000 USD. Biên độ lớn nghĩa là cắt lỗ phải rộng, nên với cùng mức rủi ro, số hợp đồng phải nhỏ hơn nhiều so với ngô.' },
    ],
    quiz: [
      q('Khí NG tăng 0,20 USD/MMBtu, 1 hợp đồng 10.000 MMBtu. Lãi (long)?', ['2.000 USD', '200 USD', '20 USD', '20.000 USD'], 0, '0,20 × 10.000 = 2.000 USD.'),
      q('Dự báo mùa đông ấm hơn bình thường ở Mỹ. Tác động thường gặp tới NG?', ['Áp lực giảm vì nhu cầu sưởi thấp', 'Chắc chắn tăng', 'Không liên quan', 'Ngừng giao dịch'], 0, 'Nhu cầu sưởi là động lực chính mùa đông.'),
    ],
  },

  // ───────────── Cấp 4 — Phân tích ─────────────
  'l4-fundamental': {
    examples: [
      { title: 'Bảng cân đối cung–cầu đơn giản', text: 'Tồn kho đầu vụ 20 + Sản lượng 100 + Nhập 5 = Tổng cung 125. Tiêu thụ 98 + Xuất 12 = Tổng cầu 110. Tồn kho cuối vụ = 15. Tỷ lệ tồn kho/tiêu thụ = 15/110 ≈ 13,6%. Nếu năm trước là 18%, thị trường đang chặt hơn → nền tảng hỗ trợ giá. Đây là cách đọc cơ bản trong báo cáo WASDE. (Số minh hoạ, đơn vị triệu tấn.)' },
    ],
    quiz: [
      q('Tổng cung 125, tổng cầu 110. Tồn kho cuối vụ?', ['15', '235', '110', '-15'], 0, '125 − 110 = 15.'),
      q('Tỷ lệ tồn kho/tiêu thụ giảm từ 18% xuống 12%. Gợi ý?', ['Thị trường chặt hơn, hỗ trợ giá', 'Dư thừa nhiều hơn', 'Giá chắc chắn giảm', 'Không có ý nghĩa'], 0, 'Đệm tồn kho mỏng hơn → giá nhạy với cú sốc cung.'),
    ],
  },
  'l4-technical': {
    examples: [
      { title: 'Dùng ATR để đặt stop', text: 'Ngô có ATR(14) = 8 cent, nghĩa là mỗi ngày dao động trung bình khoảng 8 cent. Đặt stop chỉ 3 cent gần như chắc bị "quét" bởi dao động bình thường. Stop 1,5 × ATR = 12 cent → rủi ro 12 × 50 = 600 USD/hợp đồng. Nếu vốn 30.000 USD, rủi ro 1% = 300 USD → không đủ cho 1 hợp đồng → đứng ngoài hoặc chọn mã nhỏ hơn.' },
    ],
    quiz: [
      q('ATR 10 cent, stop 2 × ATR với ngô (1 cent = 50 USD). Rủi ro mỗi hợp đồng?', ['1.000 USD', '500 USD', '20 USD', '100 USD'], 0, '20 cent × 50 = 1.000 USD.'),
      q('Giá trên MA50 và MA50 đang dốc lên. Điều này gợi ý gì?', ['Xu hướng trung hạn đang tăng (không phải lệnh mua chắc chắn)', 'Chắc chắn lãi', 'Phải bán ngay', 'Thị trường đóng cửa'], 0, 'MA mô tả xu hướng, không dự báo chắc chắn.'),
    ],
  },
  'l4-curve': {
    examples: [
      { title: 'Đọc đường cong ngô', text: 'Tháng 3: 440, tháng 5: 447, tháng 7: 452, tháng 9: 455 → giá tăng dần theo kỳ hạn = contango, thường phản ánh tồn kho đủ và chi phí lưu kho. Nếu thấy tháng 3: 470, tháng 5: 460, tháng 7: 450 → backwardation, thường là hàng hiện tại khan hiếm. Người giữ long lâu dài trong contango mất chi phí mỗi lần roll.' },
    ],
    quiz: [
      q('Dầu: tháng gần 80, tháng sau 78, tháng kế 76. Đây là?', ['Backwardation', 'Contango', 'Đường phẳng', 'Lỗi dữ liệu'], 0, 'Tháng gần đắt hơn tháng xa.'),
      q('Giữ long và roll liên tục trong contango sâu, điều gì xảy ra?', ['Chi phí roll bào mòn lợi nhuận', 'Được lợi mỗi lần roll', 'Không ảnh hưởng', 'Giá chắc chắn tăng'], 0, 'Bán rẻ tháng gần, mua đắt tháng xa mỗi lần roll.'),
    ],
  },
  'l4-cot': {
    examples: [
      { title: 'Khi "ai cũng đã mua"', text: 'Báo cáo COT cho thấy nhóm quỹ (managed money) đang giữ vị thế mua ròng cà phê ở mức cao nhất 3 năm. Điều đó KHÔNG có nghĩa giá phải giảm, nhưng nghĩa là còn ít người mới để mua tiếp; một tin xấu có thể khiến nhiều quỹ cùng chốt → giá giảm nhanh. Dùng như cảnh báo rủi ro đám đông, kết hợp với xu hướng giá.' },
    ],
    quiz: [
      q('COT tính đến thứ Ba, công bố thứ Sáu. Khi đọc, bạn cần nhớ?', ['Dữ liệu đã trễ khoảng 3 ngày', 'Là dữ liệu thời gian thực', 'Là dự báo tuần sau', 'Chỉ áp dụng cho vàng'], 0, 'Độ trễ có thể quan trọng khi thị trường biến động.'),
      q('Quỹ mua ròng kỷ lục trong khi giá bắt đầu phá đáy gần nhất. Rủi ro gì?', ['Nhiều quỹ cùng bán chốt, giá có thể giảm nhanh', 'Giá chắc chắn tăng', 'Không có rủi ro', 'Sàn đóng cửa'], 0, 'Vị thế đông một phía + tín hiệu giá yếu = rủi ro đảo chiều.'),
    ],
  },
  'l4-seasonal': {
    examples: [
      { title: 'Mùa vụ ngô và lý do nó có thể sai', text: 'Trung bình nhiều năm, giá ngô hay tạo đỉnh vào tháng 6–7 (lo thời tiết) và yếu vào mùa thu hoạch tháng 9–10 (nguồn cung về). Nhưng năm 2012 hạn hán khiến giá tăng mạnh suốt mùa hè, còn có những năm thời tiết thuận khiến giá giảm từ tháng 6. Mùa vụ là "bản đồ trung bình", không phải lịch hẹn.' },
    ],
    quiz: [
      q('Biểu đồ mùa vụ cho thấy ngô thường yếu vào mùa thu hoạch, nhưng năm nay hạn hán nặng. Nên làm gì?', ['Ưu tiên dữ kiện cung–cầu hiện tại hơn mẫu hình trung bình', 'Bán theo mùa vụ bằng mọi giá', 'Bỏ qua thời tiết', 'Tăng đòn bẩy'], 0, 'Sự kiện bất thường có thể phá vỡ mẫu hình.'),
      q('Mẫu hình mùa vụ dựa trên 3 năm dữ liệu có đáng tin bằng 15 năm?', ['Không, mẫu quá ngắn dễ là ngẫu nhiên', 'Có, đáng tin hơn', 'Như nhau', 'Không cần dữ liệu'], 0, 'Cần nhiều năm để thấy hành vi lặp lại.'),
    ],
  },
  'l4-correlation': {
    examples: [
      { title: 'Ba lệnh nhưng thực chất là một', text: 'Bạn mua ngô, lúa mì và đậu tương cùng lúc, mỗi lệnh rủi ro 1%. Ba mã này thường tương quan cao (cùng nhóm ngũ cốc, cùng chịu thời tiết Mỹ, USD). Nếu một tin xấu chung xảy ra, cả ba cùng lỗ → bạn thực chất rủi ro gần 3% trên một ý tưởng. Đa dạng hoá thật là kết hợp các nhóm ít liên quan (ví dụ nông sản và kim loại).' },
    ],
    quiz: [
      q('Mua vàng và bạc, mỗi lệnh rủi ro 1%, tương quan +0,85. Rủi ro thực tế gần với?', ['Gần 2% trên cùng một ý tưởng', '0%', '0,5%', 'Đa dạng hoá hoàn toàn'], 0, 'Hai mã đi cùng hướng nên rủi ro cộng dồn.'),
      q('Tương quan âm giữa hai mã nghĩa là?', ['Thường đi ngược hướng', 'Luôn đi cùng hướng', 'Giá bằng nhau', 'Không giao dịch được'], 0, 'Âm = xu hướng ngược chiều (không phải luôn luôn).'),
    ],
  },

  // ───────────── Cấp 5 — Đọc biểu đồ (file level8) ─────────────
  'l8-dow': {
    examples: [
      { title: 'Đếm đỉnh–đáy trên biểu đồ ngày', text: 'Ngô: đáy 420 → đỉnh 445 → đáy 430 → đỉnh 458 → đáy 441. Đỉnh sau cao hơn (458 > 445), đáy sau cao hơn (441 > 430) → xu hướng tăng theo Dow. Mốc theo dõi: đáy gần nhất 441. Nếu giá đóng cửa dưới 441, cấu trúc tăng bị phá và cần đánh giá lại.' },
    ],
    quiz: [
      q('Chuỗi đỉnh: 500, 490, 482; đáy: 470, 462, 455. Theo Dow đây là?', ['Xu hướng giảm', 'Xu hướng tăng', 'Đi ngang', 'Không xác định được bao giờ'], 0, 'Đỉnh và đáy đều thấp dần.'),
      q('Xu hướng tăng với đáy gần nhất 441. Giá đóng cửa 438. Ý nghĩa?', ['Cấu trúc tăng bị phá, cần đánh giá lại', 'Xu hướng tăng mạnh hơn', 'Phải mua thêm', 'Không có ý nghĩa'], 0, 'Phá đáy gần nhất là tín hiệu cảnh báo theo Dow.'),
    ],
  },
  'l8-price-action': {
    examples: [
      { title: 'Một setup pin bar có số liệu', text: 'Robusta có hỗ trợ cũ 4.400. Giá giảm về 4.385 rồi bật lên, đóng cửa 4.430 → nến có bóng dưới dài (pin bar). Kế hoạch: mua khi vượt đỉnh nến 4.440; stop dưới bóng 4.375 (rủi ro 65 USD/tấn × 10 = 650 USD); mục tiêu kháng cự 4.570 (lãi 130 × 10 = 1.300 USD) → tỷ lệ 1:2. Nếu giá không vượt 4.440 thì không vào. (Số minh hoạ.)' },
    ],
    quiz: [
      q('Vào 4.440, stop 4.375, mục tiêu 4.570 (RC). Tỷ lệ lời/lỗ?', ['Khoảng 1:2', '1:1', '3:1 ngược', '1:10'], 0, 'Rủi ro 65, lãi 130 → 1:2.'),
      q('Giá vượt kháng cự 460 rồi đóng cửa lại dưới 455 ngay phiên sau. Đây có thể là?', ['Phá vỡ giả', 'Phá vỡ chắc chắn', 'Đáo hạn', 'Tăng trần'], 0, 'Không giữ được trên vùng phá = dấu hiệu bẫy.'),
    ],
  },
  'l8-volume': {
    examples: [
      { title: 'Đọc bộ ba Giá – Khối lượng – OI', text: 'Tuần 1: giá ngô tăng 15 cent, volume cao, OI tăng 20.000 → tiền mới vào phe mua, xu hướng khoẻ. Tuần 2: giá tăng thêm 5 cent, volume thấp, OI giảm 15.000 → giá tăng chủ yếu do phe bán đóng lệnh, lực mua mới yếu. Tuần 2 là lúc thận trọng với lệnh mua mới, không phải lúc đuổi giá.' },
    ],
    quiz: [
      q('Giá phá kháng cự với khối lượng gấp 2 lần trung bình 20 phiên. Gợi ý?', ['Phá vỡ có lực xác nhận tốt hơn', 'Chắc chắn phá vỡ giả', 'Không có ý nghĩa', 'Sàn lỗi'], 0, 'Khối lượng cao ủng hộ độ tin cậy của phá vỡ.'),
      q('Giá giảm, khối lượng thấp dần, OI giảm. Điều gì đang xảy ra?', ['Phe mua đóng lệnh, lực bán mới không mạnh', 'Tiền mới bán khống mạnh', 'Xu hướng giảm mạnh lên', 'Sắp đáo hạn chắc chắn'], 0, 'OI giảm khi giá giảm = long thoát ra (long liquidation).'),
    ],
  },
  'l8-combine': {
    examples: [
      { title: 'Chạy 5 bước trên một biểu đồ', text: '1) Dow: tuần và ngày đều đỉnh–đáy cao dần → xu hướng tăng. 2) Vùng: giá vừa về hỗ trợ cũ 440 (từng là kháng cự). 3) Price Action: nến búa tại 441. 4) Khối lượng: nhịp giảm về 440 có volume thấp, nến búa volume tăng. 5) Kế hoạch: vào trên đỉnh nến búa, stop dưới 436, mục tiêu đỉnh cũ 460, rủi ro ≤1% vốn. Cả 5 bước đều "có" → setup đủ điều kiện; thiếu một bước → bỏ qua.' },
    ],
    quiz: [
      q('Xu hướng tuần giảm nhưng biểu đồ ngày có nến búa đẹp tại hỗ trợ. Cách nghĩ phù hợp?', ['Tín hiệu ngược xu hướng lớn, giảm khối lượng hoặc chờ thêm', 'Vào lớn vì nến đẹp', 'Bỏ cắt lỗ', 'Bỏ qua khung tuần'], 0, 'Đi ngược xu hướng lớn có xác suất thấp hơn.'),
      q('Setup đẹp nhưng stop hợp lý khiến rủi ro 3% vốn (quy tắc 1%). Nên?', ['Bỏ qua lệnh', 'Kéo stop gần lại cho vừa 1%', 'Vào 3 lần lớn hơn', 'Bỏ stop'], 0, 'Stop đặt theo cấu trúc thị trường, không theo túi tiền; không vừa thì bỏ qua.'),
    ],
  },

  // ───────────── Cấp 6 — Rủi ro & tâm lý (file level5) ─────────────
  'l5-sizing': {
    examples: [
      { title: 'Tính số hợp đồng từng bước', text: 'Vốn 600 triệu ≈ 24.000 USD (tỷ giá minh hoạ 25.000). Rủi ro 1% = 240 USD. Setup ngô: vào 440, stop 436 → 4 cent × 50 = 200 USD + phí 10 USD = 210 USD/hợp đồng. Số hợp đồng = 240 ÷ 210 = 1,14 → làm tròn XUỐNG = 1 hợp đồng. Nếu stop phải là 8 cent (410 USD) thì 240 ÷ 410 < 1 → không vào.' },
    ],
    quiz: [
      q('Vốn 20.000 USD, rủi ro 1%, rủi ro mỗi hợp đồng 90 USD. Tối đa bao nhiêu hợp đồng?', ['2', '3', '1', '22'], 0, '200 ÷ 90 = 2,2 → làm tròn xuống 2.'),
      q('Vì sao luôn làm tròn XUỐNG số hợp đồng?', ['Để không vượt ngân sách rủi ro', 'Để lãi nhiều hơn', 'Sàn bắt buộc làm tròn lên', 'Không quan trọng'], 0, 'Làm tròn lên khiến rủi ro vượt mức đã định.'),
    ],
  },
  'l5-stop': {
    examples: [
      { title: 'Stop bị gap qua', text: 'Bạn short cà phê KC ở 300, stop 305 (rủi ro 5 × 375 = 1.875 USD). Cuối tuần có tin sương giá Brazil, thứ Hai giá mở cửa 312. Lệnh stop khớp quanh 312 → lỗ 12 × 375 = 4.500 USD, gấp 2,4 lần dự kiến. Bài học: stop không phải bảo hiểm tuyệt đối; giảm khối lượng trước cuối tuần/báo cáo lớn với mã biến động mạnh.' },
    ],
    quiz: [
      q('Long ngô 440, stop 434. Giá mở cửa gap xuống 428. Lỗ thực tế khoảng (1 hợp đồng)?', ['600 USD (12 cent)', '300 USD', '0', '6 USD'], 0, 'Stop khớp ở giá mở cửa 428: 12 × 50 = 600 USD.'),
      q('Đặt stop ngay sát giá vào, nhỏ hơn dao động bình thường. Hệ quả?', ['Dễ bị quét dù ý tưởng đúng', 'Lãi chắc chắn', 'Không bao giờ dính stop', 'Giảm phí'], 0, 'Stop phải ngoài vùng nhiễu, thường dựa vào ATR và cấu trúc.'),
    ],
  },
  'l5-journal': {
    examples: [
      { title: 'Một dòng nhật ký mẫu', text: 'Ngày 12/3 | Ngô ZC | Long 1 | Vào 440 | Stop 436 (rủi ro 200 USD = 1R) | Mục tiêu 452 | Thoát 449 | Lãi 450 USD = +2,25R | Lý do vào: pin bar tại hỗ trợ, xu hướng tuần tăng | Cảm xúc: hơi vội, thoát sớm trước mục tiêu | Bài học: giữ theo kế hoạch. Sau 30 lệnh, tính R trung bình để biết hệ thống có kỳ vọng dương không.' },
    ],
    quiz: [
      q('Rủi ro ban đầu 200 USD, lệnh lỗ 300 USD. R-multiple?', ['−1,5R', '−1R', '+1,5R', '−0,67R'], 0, '−300 ÷ 200 = −1,5R — dấu hiệu stop bị trượt hoặc bị dời.'),
      q('10 lệnh: 4 lệnh +2R, 6 lệnh −1R. Tổng kết quả?', ['+2R', '−2R', '+8R', '0R'], 0, '4×2 − 6×1 = +2R: thắng ít hơn thua vẫn có lãi nhờ tỷ lệ lời/lỗ.'),
    ],
  },
  'l5-mistakes': {
    examples: [
      { title: 'Vòng xoáy gỡ gạc', text: 'Thua lệnh 1: −1% (tức giận). Lệnh 2 gấp đôi khối lượng "để gỡ": −2%. Lệnh 3 gấp đôi tiếp, bỏ stop: −6%. Tổng −9% trong một buổi, trong khi kế hoạch chỉ cho phép −1%. Cách chặn: quy tắc dừng giao dịch trong ngày sau 2 lệnh thua hoặc −2% vốn, viết vào kế hoạch trước khi bắt đầu.' },
    ],
    quiz: [
      q('Thua 2 lệnh liên tiếp đúng kế hoạch. Phản ứng tốt nhất?', ['Giữ nguyên quy tắc, nghỉ nếu chạm giới hạn ngày', 'Gấp đôi khối lượng để gỡ', 'Bỏ stop lệnh sau', 'Vay thêm tiền'], 0, 'Thua là một phần của hệ thống; vấn đề là phản ứng cảm xúc.'),
      q('Tài khoản lỗ 50%. Cần lãi bao nhiêu % để về lại vốn ban đầu?', ['100%', '50%', '25%', '75%'], 0, 'Còn 50, cần thêm 50 = 100% số còn lại — vì vậy bảo toàn vốn quan trọng hơn.'),
    ],
  },
  'l5-scam': {
    examples: [
      { title: 'Kịch bản lừa đảo điển hình', text: 'Bạn được thêm vào nhóm "chuyên gia cà phê" có hàng trăm thành viên khoe lãi. Một "trợ lý" nhắn riêng, cho tải app lạ, nạp 5 triệu thấy lãi 30% ngay tuần đầu và rút được 1 triệu. Họ thúc nạp 200 triệu để vào "kèo VIP". Sau đó tài khoản báo lỗ hoặc bị khoá, yêu cầu nộp "phí rút tiền/thuế". Mọi bước đều là dấu hiệu: app không phải của thành viên MXV, lãi bất thường, áp lực nạp thêm, phí để rút.' },
    ],
    quiz: [
      q('Muốn rút tiền nhưng được yêu cầu nộp "phí giải ngân/thuế" trước. Đây là?', ['Dấu hiệu lừa đảo — dừng nộp, báo cơ quan chức năng', 'Quy trình bình thường', 'Ưu đãi', 'Phí bắt buộc của MXV'], 0, 'Đơn vị hợp pháp trừ phí từ tài khoản, không bắt nộp thêm để rút.'),
      q('Một app cho rút thử khoản nhỏ thành công. Điều đó chứng minh app hợp pháp?', ['Không — đây là chiêu tạo lòng tin', 'Có, chắc chắn', 'Chỉ khi rút được 2 lần', 'Có nếu nhiều người dùng'], 0, 'Cho rút nhỏ để dụ nạp lớn là thủ đoạn phổ biến.'),
    ],
  },
};

/** Gắn ví dụ + câu đố bổ sung vào bài học (không sửa file gốc). */
export function withExtras(lesson: Lesson): Lesson {
  const extra = LESSON_EXTRAS[lesson.id];
  if (!extra) return lesson;
  return { ...lesson, examples: [...(lesson.examples ?? []), ...extra.examples], quiz: [...lesson.quiz, ...extra.quiz] };
}
