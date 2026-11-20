import { q, SRC, type Level } from './types';

export const LEVEL5: Level = {
  id: 'l5',
  number: 5,
  title: 'Cấp 5 — Quản trị rủi ro và tâm lý',
  goal: 'Biết đo rủi ro bằng tiền, cắt lỗ như một công cụ quản trị, ghi nhật ký, tránh sai lầm của người mới và nhận diện lừa đảo.',
  lessons: [
    {
      id: 'l5-sizing',
      title: 'Khối lượng vị thế theo % vốn',
      objective: 'Tính số hợp đồng sao cho mức lỗ nếu sai nằm trong ngân sách rủi ro.',
      body: [
        'Thay vì hỏi "mua bao nhiêu hợp đồng", hãy hỏi "tôi chấp nhận mất tối đa bao nhiêu tiền nếu nhận định sai?". Nhiều giáo trình dùng một tỷ lệ nhỏ của vốn cho mỗi lệnh; tỷ lệ phù hợp do bạn tự quyết định.',
        'Số hợp đồng = ngân sách rủi ro ÷ rủi ro mỗi hợp đồng (khoảng cách stop quy ra tiền, cộng phí). Làm tròn xuống.',
        'Nếu một hợp đồng đã vượt ngân sách rủi ro, kết luận hợp lý là không vào lệnh, không phải nới stop.',
      ],
      example: { caption: 'Vốn 10.000 USD, rủi ro 2% (200 USD), stop cách 8 cent (số minh hoạ)', calc: { kind: 'sizing', instrumentId: 'CBOT:ZC', equity: 10000, riskPct: 2, stop: 8, costs: 0 } },
      remember: ['Ngân sách rủi ro tính bằng tiền, trước khi vào lệnh.', 'Một hợp đồng vượt ngân sách: không vào lệnh.'],
      quiz: [
        q('Số hợp đồng được tính từ?', ['Ngân sách rủi ro chia rủi ro mỗi hợp đồng', 'Cảm giác', 'Số tiền còn lại', 'Giá hiện tại'], 0, 'Công thức theo rủi ro.'),
        q('Một hợp đồng đã vượt ngân sách rủi ro nên?', ['Không vào lệnh', 'Nới stop', 'Tăng vốn ngay', 'Bỏ stop'], 0, 'Không nới stop để vừa vặn.'),
        q('Vốn 10.000, rủi ro 1% = ?', ['100', '1.000', '10', '10.000'], 0, '1% của 10.000.'),
      ],
      calculator: 'position-sizing',
      links: [{ module: 'risk', label: 'Rủi ro' }],
      sources: [SRC.cmeEdu],
    },
    {
      id: 'l5-stop',
      title: 'Cắt lỗ là công cụ quản trị rủi ro',
      objective: 'Hiểu khái niệm cắt lỗ và giới hạn của nó (không phải lời khuyên vào lệnh cụ thể).',
      body: [
        'Cắt lỗ (stop-loss) là mức giá đặt trước mà bạn chấp nhận nhận định sai và đóng vị thế. Nó giới hạn mức lỗ dự kiến, không bảo đảm mức lỗ tuyệt đối.',
        'Giá có thể nhảy qua mức stop (gap) hoặc khớp xấu hơn (trượt giá), nhất là khi có tin lớn hoặc thanh khoản mỏng.',
        'Stop nên xuất phát từ biên độ dao động bình thường (ví dụ bội số của ATR) và từ kịch bản "điều gì chứng minh nhận định của tôi sai", không từ số tiền bạn "muốn" mất.',
        'Bài học này giải thích khái niệm; ứng dụng không đưa ra khuyến nghị mua bán cụ thể.',
      ],
      remember: ['Stop giới hạn lỗ dự kiến, không bảo đảm tuyệt đối.', 'Stop đặt trước khi vào lệnh và không dời xa khi lỗ.'],
      quiz: [
        q('Cắt lỗ có bảo đảm mức lỗ tối đa chắc chắn không?', ['Không, có thể gap hoặc trượt giá', 'Có', 'Chỉ khi nhỏ', 'Luôn có'], 0, 'Gap/trượt giá có thể làm lỗ lớn hơn.'),
        q('Stop nên xuất phát từ?', ['Biên độ dao động và kịch bản sai', 'Số may mắn', 'Lời đồn', 'Tiền muốn mất'], 0, 'Dựa trên thị trường và kịch bản.'),
        q('Dời stop xa hơn khi đang lỗ là?', ['Sai kỷ luật quản trị rủi ro', 'Luôn tốt', 'Bắt buộc', 'Bình thường'], 0, 'Phá vỡ kế hoạch ban đầu.'),
      ],
      links: [{ module: 'risk', label: 'Rủi ro' }],
      sources: [SRC.cmeEdu],
    },
    {
      id: 'l5-journal',
      title: 'Nhật ký giao dịch',
      objective: 'Ghi lại quyết định để học từ chính mình.',
      body: [
        'Ghi mỗi lệnh: lý do vào, stop, rủi ro (R), kết quả, cảm xúc khi vào/thoát. Nhật ký giúp bạn nhận ra mẫu hình sai lặp lại.',
        'Đo kết quả bằng R-multiple (lãi/lỗ chia cho rủi ro ban đầu) để so sánh các lệnh khác kích cỡ.',
        'Xem lại hằng tuần: đúng kế hoạch hay phá kế hoạch? Kết quả tốt do làm đúng hay do may?',
      ],
      remember: ['Nhật ký giúp phân biệt kỹ năng và may mắn.', 'R-multiple = lãi/lỗ chia rủi ro ban đầu.'],
      quiz: [
        q('R-multiple là gì?', ['Lãi/lỗ chia rủi ro ban đầu', 'Phí', 'Giá', 'Ký quỹ'], 0, 'So sánh lệnh khác kích cỡ.'),
        q('Mục đích nhật ký?', ['Học từ chính mình', 'Khoe', 'Tính thuế', 'Không có'], 0, 'Phát hiện mẫu hình sai.'),
        q('Nên xem lại nhật ký?', ['Định kỳ', 'Không bao giờ', 'Chỉ khi lãi', 'Chỉ khi lỗ nặng'], 0, 'Định kỳ.'),
      ],
      links: [{ module: 'journal', label: 'Sổ ghi chú' }],
      sources: [SRC.cmeEdu],
    },
    {
      id: 'l5-mistakes',
      title: 'Sai lầm phổ biến của người mới',
      objective: 'Nhận diện những lỗi thường gặp để tránh.',
      body: [
        'Dùng đòn bẩy quá cao, vào lệnh quá lớn so với vốn.',
        'Không đặt stop hoặc dời stop xa khi lỗ; "gỡ gạc" bằng cách tăng khối lượng sau khi thua.',
        'Giao dịch theo tin đồn hoặc nhóm kín, giao dịch quá thường xuyên (phí và trượt giá bào mòn vốn).',
        'Giữ vị thế qua báo cáo lớn mà không hiểu; quên FND/ngày đáo hạn.',
        'Mong lợi nhuận nhanh. Nhiều nhà giao dịch cá nhân dùng đòn bẩy bị lỗ; không có lợi nhuận nào được bảo đảm.',
      ],
      remember: ['Đòn bẩy cao và không kỷ luật là nguyên nhân thường gặp của thua lỗ.', 'Tập trên tài khoản giả lập trước.'],
      quiz: [
        q('"Gỡ gạc" bằng tăng khối lượng sau khi thua là?', ['Sai lầm phổ biến', 'Chiến lược tốt', 'Bắt buộc', 'An toàn'], 0, 'Làm rủi ro tăng đúng lúc đang thua.'),
        q('Giao dịch quá thường xuyên gây?', ['Phí và trượt giá bào mòn vốn', 'Lợi nhuận chắc chắn', 'Giảm rủi ro', 'Không ảnh hưởng'], 0, 'Chi phí tích luỹ.'),
        q('Nên tập trước bằng cách?', ['Tài khoản giả lập (paper trade)', 'Dùng tiền vay', 'Vào lệnh lớn', 'Bỏ stop'], 0, 'Học không mất tiền thật.'),
      ],
      sources: [SRC.cmeEdu],
    },
    {
      id: 'l5-scam',
      title: 'Lừa đảo và "sàn ma"',
      objective: 'Nhận diện sàn/nhóm không phép và biết cách kiểm tra.',
      body: [
        'Chỉ giao dịch hàng hoá MXV qua thành viên của MXV. Hãy tự đối chiếu tên trên website mxv.com.vn thay vì tin lời giới thiệu.',
        'Dấu hiệu lừa đảo: hứa lợi nhuận cố định hoặc "chắc chắn", yêu cầu chuyển tiền vào tài khoản cá nhân, ép nạp thêm tiền, "thầy" gợi ý lệnh qua nhóm kín, phần mềm lạ không thuộc thành viên, không rút được tiền.',
        'Nếu nghi ngờ, dừng chuyển tiền, lưu bằng chứng và hỏi trực tiếp MXV hoặc cơ quan chức năng.',
        'Ứng dụng này không đặt lệnh với broker và không phải môi giới.',
      ],
      remember: ['Chỉ giao dịch qua thành viên MXV, tự kiểm tra trên website MXV.', 'Lợi nhuận cố định là dấu hiệu lừa đảo.'],
      quiz: [
        q('Dấu hiệu lừa đảo rõ nhất?', ['Hứa lợi nhuận cố định', 'Có hợp đồng rõ ràng', 'Có biểu phí', 'Có tên trong danh sách MXV'], 0, 'Không ai bảo đảm lợi nhuận.'),
        q('Nơi nào để kiểm tra thành viên hợp lệ?', ['Website mxv.com.vn', 'Quảng cáo', 'Nhóm kín', 'Người lạ'], 0, 'Nguồn chính thức.'),
        q('Yêu cầu chuyển tiền vào tài khoản cá nhân là?', ['Cảnh báo nghiêm trọng', 'Bình thường', 'Bắt buộc', 'Ưu đãi'], 0, 'Cảnh báo lừa đảo.'),
      ],
      sources: [SRC.mxv, SRC.mxvOverview],
    },
  ],
};
