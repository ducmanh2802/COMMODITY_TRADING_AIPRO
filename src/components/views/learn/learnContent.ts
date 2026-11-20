import type { Source } from './curriculum/types';

/** Extra reference content for the Học viện Hàng hoá (money ways and risk warnings). Curriculum lives in ./curriculum/*. */
export type { Source };

const MXV_OVERVIEW: Source = { label: 'MXV – tổng quan', url: 'https://en.mxv.com.vn/overview.html' };

export interface MoneyWay {
  name: string;
  description: string;
  fit: string;
  risk: string;
}

export const MONEY_WAYS: MoneyWay[] = [
  { name: 'Đầu cơ theo xu hướng', description: 'Theo xu hướng trung/dài hạn, cắt lỗ sớm, để lãi chạy.', fit: 'Cá nhân có kỷ luật, vốn đủ chịu chuỗi thua.', risk: 'Thị trường đi ngang, chuỗi thua dài, đòn bẩy.' },
  { name: 'Đầu cơ spread', description: 'Calendar / inter-commodity spread.', fit: 'Người đã vững cấp 2–3.', risk: 'Spread có thể nới rộng mạnh; thanh khoản chân xa.' },
  { name: 'Đầu cơ mùa vụ', description: 'Dựa trên chu kỳ trồng/thu hoạch.', fit: 'Người có dữ liệu nhiều năm.', risk: 'Mùa vụ không lặp lại; thời tiết bất thường.' },
  { name: 'Phòng hộ cho doanh nghiệp', description: 'Nhà nhập khẩu đậu tương, chế biến cà phê khóa giá.', fit: 'Doanh nghiệp có hàng thật.', risk: 'Rủi ro basis và tỷ giá; cần dòng tiền ký quỹ.' },
  { name: 'Arbitrage', description: 'Khai thác chênh lệch giữa sàn/kỳ hạn.', fit: 'Tổ chức (chi phí thấp, hạ tầng nhanh).', risk: 'Cá nhân gần như không có lợi thế.' },
  { name: 'Bán quyền chọn', description: 'Thu phí premium đều đặn.', fit: 'Người hiểu sâu Greeks, vốn lớn.', risk: 'Rủi ro đuôi: lãi nhỏ nhiều lần, một biến cố có thể mất rất lớn.' },
  { name: 'Nghề nghiệp', description: 'Môi giới tại thành viên MXV, phân tích, quản trị rủi ro, trading desk doanh nghiệp.', fit: 'Người học bài bản.', risk: 'Thu nhập ổn định hơn tự giao dịch.' },
  { name: 'Sản phẩm / giáo dục', description: 'Công cụ phân tích, dữ liệu, khóa học.', fit: 'Người có kỹ năng xây dựng/giảng dạy.', risk: 'Phải tôn trọng bản quyền dữ liệu (MXV, Yahoo).' },
];

export const RISK_WARNINGS: { text: string; sources?: Source[] }[] = [
  {
    text: 'Phần lớn nhà giao dịch cá nhân dùng đòn bẩy bị lỗ. Ví dụ: ESMA nêu 74–89% tài khoản CFD cá nhân thua lỗ khi hạn chế CFD năm 2018 (CFD không phải futures MXV; URL chưa kiểm tra lại). Không có thống kê lãi/lỗ công khai cho khách MXV.',
    sources: [{ label: 'ESMA (2018)', url: 'https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors' }],
  },
  {
    text: '~99,5% tài khoản MXV là cá nhân (2025); khối lượng tập trung vào bạc/đồng/bạch kim Micro–Nano — dấu hiệu đầu cơ cao.',
    sources: [
      { label: 'Tạp chí Công Thương (11/02/2026)', url: 'https://tapchicongthuong.vn/nam-2025--thanh-khoan-lap-dinh--thi-truong-giao-dich-hang-hoa-buoc-vao-giai-doan-truong-thanh-436170.htm' },
      { label: 'Đại biểu Nhân dân (16/05/2026)', url: 'https://daibieunhandan.vn/khoi-luong-giao-dich-hang-hoa-tang-hon-140-trong-quy-i-2026-10417083.html' },
    ],
  },
  { text: 'Biến động lớn rơi vào 20:30–02:00 giờ VN (Mỹ mở cửa, báo cáo USDA/EIA).' },
  { text: 'Giao dịch giấy (paper trade) 3–6 tháng với quy tắc rủi ro cấp 4 trước khi dùng tiền thật; ghi nhật ký từng lệnh.' },
  { text: 'Chỉ giao dịch qua thành viên được MXV cấp phép (hoặc công ty chứng khoán cho HNX). Cảnh giác "sàn" hứa lợi nhuận cố định hoặc nhận tiền vào tài khoản cá nhân.', sources: [MXV_OVERVIEW] },
  { text: 'Ứng dụng này là công cụ nghiên cứu/giáo dục, không phải khuyến nghị đầu tư; không đặt lệnh với broker và không tái phân phối giá MXV.' },
];
