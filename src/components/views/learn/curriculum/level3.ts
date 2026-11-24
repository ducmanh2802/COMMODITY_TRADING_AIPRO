import { q, SRC, type Lesson, type Level } from './types';

const SPEC_NOTE = 'Khối lượng, tick, giá trị tick hiển thị bên dưới lấy từ Instrument Master của ứng dụng (không nhập tay).';

function group(l: Omit<Lesson, 'remember'> & { remember?: string[] }): Lesson {
  return { remember: ['Mỗi hàng hoá có chu kỳ cung–cầu riêng: học mùa vụ và báo cáo của chính nó.', 'Đặc tả hợp đồng: luôn xem trong Instrument Master / trang sàn.'], ...l, body: [...l.body, SPEC_NOTE] };
}

export const LEVEL3: Level = {
  id: 'l3',
  number: 3,
  title: 'Cấp 3 — Từng nhóm hàng',
  goal: 'Hiểu cung–cầu, mùa vụ, báo cáo quan trọng và mối liên hệ Việt Nam của từng nhóm hàng chính.',
  lessons: [
    group({
      id: 'l3-grains',
      figures: ['a-corn-uses', 'a-grain-calendar'],
      videos: [
        { title: 'Product: Corn', url: 'https://www.youtube.com/watch?v=aQeyOi7LhLw', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: hợp đồng ngô, báo cáo cần theo dõi, cung cầu.' },
      ],
      title: 'Nông sản: ngô và lúa mì',
      objective: 'Nắm yếu tố cung–cầu và mùa vụ của ngô (ZC) và lúa mì (ZW).',
      body: [
        'Ngô dùng cho chăn nuôi, sản xuất ethanol và xuất khẩu. Mỹ là nước sản xuất và xuất khẩu lớn; thời tiết vụ hè (tháng 6 đến tháng 8) rất quan trọng.',
        'Lúa mì có vụ đông và vụ xuân ở nhiều nước (Mỹ, Nga, EU, Úc...). Chính sách xuất khẩu và thời tiết các vùng này ảnh hưởng giá.',
        'Báo cáo quan trọng: WASDE hằng tháng của USDA (cung–cầu, tồn kho), báo cáo diện tích gieo trồng và tồn kho theo quý, báo cáo tiến độ vụ mùa hằng tuần. Lịch cụ thể xem trên usda.gov.',
        'Liên hệ Việt Nam: Việt Nam nhập khẩu ngô và lúa mì làm thức ăn chăn nuôi và bột mì, nên giá thế giới tác động đến chi phí.',
        'Về hợp đồng: ngô ZC và lúa mì ZW cùng có khối lượng 5.000 bushel và tick 0,25 cent (12,5 USD), nên giá đổi 1 cent tương đương 50 USD cho mỗi hợp đồng.',
      ],
      instrumentIds: ['CBOT:ZC', 'CBOT:ZW'],
      links: [{ module: 'commodity-profile', label: 'Hồ sơ hàng hoá' }, { module: 'cot', label: 'Báo cáo COT' }],
      quiz: [
        q('Báo cáo nào của USDA công bố hằng tháng về cung–cầu?', ['WASDE', 'COT', 'EIA', 'PMI'], 0, 'WASDE.'),
        q('Giai đoạn thời tiết nào đặc biệt quan trọng với ngô Mỹ?', ['Vụ hè', 'Giữa mùa đông', 'Chỉ mùa thu', 'Không quan trọng'], 0, 'Giai đoạn sinh trưởng và thụ phấn.'),
        q('Vì sao giá ngô thế giới liên quan Việt Nam?', ['Việt Nam nhập khẩu ngô cho thức ăn chăn nuôi', 'Việt Nam không dùng ngô', 'Không liên quan', 'Chỉ dùng làm cảnh'], 0, 'Chi phí nhập khẩu thức ăn.'),
      ],
      sources: [SRC.wasde, SRC.usda, SRC.cmeAg],
    }),
    group({
      id: 'l3-soy',
      figures: ['a-soy-crush'],
      videos: [
        { title: 'Product: Soybeans', url: 'https://www.youtube.com/watch?v=4vduzKKyneE', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: đậu tương, yếu tố mùa vụ và cung cầu (video cũ, quy cách xem Instrument Master).' },
      ],
      title: 'Nông sản: đậu tương, khô đậu và dầu đậu tương',
      objective: 'Hiểu "bộ ba đậu tương" và quan hệ giữa chúng.',
      body: [
        'Ép đậu tương cho ra khô đậu (ZM, dùng làm thức ăn chăn nuôi) và dầu đậu tương (ZL, dùng thực phẩm và nhiên liệu sinh học). Chênh lệch giữa giá đậu tương và giá hai sản phẩm gọi là biên ép (crush margin).',
        'Yếu tố chính: sản lượng Mỹ, Brazil, Argentina; nhu cầu nhập khẩu của Trung Quốc; chính sách nhiên liệu sinh học ảnh hưởng dầu đậu tương.',
        'Báo cáo: WASDE, báo cáo xuất khẩu hằng tuần của USDA, diện tích gieo trồng.',
        'Liên hệ Việt Nam: Việt Nam nhập khẩu lượng lớn khô đậu và đậu tương cho thức ăn chăn nuôi, nên giá khô đậu tác động trực tiếp đến ngành chăn nuôi.',
        'Khi giá khô đậu và dầu tăng nhanh hơn giá đậu tương, biên ép rộng ra và nhà máy ép có lợi hơn. Đây là quan hệ kinh tế để hiểu thị trường, không phải tín hiệu mua bán. Đậu tương ZS có khối lượng 5.000 bushel, tick 0,25 cent (12,5 USD).',
      ],
      instrumentIds: ['CBOT:ZS', 'CBOT:ZM', 'CBOT:ZL'],
      links: [{ module: 'commodity-profile', label: 'Hồ sơ hàng hoá' }, { module: 'term-structure', label: 'Cấu trúc kỳ hạn' }],
      quiz: [
        q('Ép đậu tương cho ra những sản phẩm nào?', ['Khô đậu và dầu đậu', 'Chỉ đường', 'Cà phê', 'Dầu thô'], 0, 'Khô đậu và dầu đậu tương.'),
        q('Biên ép (crush margin) là gì?', ['Chênh lệch giữa giá sản phẩm ép và giá đậu tương', 'Phí môi giới', 'Ký quỹ', 'Thuế'], 0, 'Lợi nhuận gộp của việc ép.'),
        q('Khô đậu dùng chủ yếu để làm gì?', ['Thức ăn chăn nuôi', 'Nhiên liệu máy bay', 'Kim loại', 'Mỹ phẩm'], 0, 'Protein trong thức ăn chăn nuôi.'),
      ],
      sources: [SRC.wasde, SRC.usda, SRC.cmeAg],
    }),
    group({
      id: 'l3-coffee',
      figures: ['a-coffee-compare'],
      videos: [
        { title: 'Why a Vietnam drought may spike global espresso prices | REUTERS', url: 'https://www.youtube.com/watch?v=oKI6I7DpqMo', source: 'Reuters', lang: 'en', duration: '2:41', note: 'Video tiếng Anh của Reuters: hạn hán ở Việt Nam ảnh hưởng giá robusta toàn cầu ra sao.' },
        { title: 'GIÁ CÀ PHÊ TĂNG MẠNH: ĐIỀU CHỈNH NGẮN HẠN HAY MẶT BẰNG GIÁ MỚI CHO VIỆT NAM?', url: 'https://www.youtube.com/watch?v=ybHoydUtDtY', source: 'MXV (Sở Giao dịch Hàng hóa Việt Nam)', lang: 'vi', duration: '7:58', note: 'Video tiếng Việt từ kênh chính thức của MXV: các yếu tố đẩy giá cà phê. Chỉ để tham khảo, không phải khuyến nghị.' },
      ],
      title: 'Nông sản: cà phê arabica và robusta',
      objective: 'Phân biệt arabica (KC) và robusta (RC), hiểu mùa vụ và rủi ro thời tiết.',
      body: [
        'Arabica (ICE US: KC) chủ yếu từ Brazil, Colombia; robusta (ICE Europe: RC) chủ yếu từ Việt Nam, Brazil, Indonesia. Việt Nam là một trong những nước xuất khẩu robusta lớn nhất thế giới.',
        'Yếu tố chính: thời tiết (sương giá ở Brazil, hạn hán/mưa lớn ở Tây Nguyên), tồn kho, tỷ giá đồng real Brazil, nhu cầu tiêu thụ. Mùa thu hoạch robusta Việt Nam tập trung vào khoảng cuối năm, arabica Brazil khoảng giữa năm.',
        'Nguồn dữ liệu: báo cáo của USDA (Foreign Agricultural Service), tổ chức cà phê quốc tế ICO. Báo cáo COT cho thấy vị thế của quỹ đầu cơ.',
        'Liên hệ Việt Nam: giá robusta thế giới ảnh hưởng thu nhập của nông dân và doanh nghiệp xuất khẩu cà phê Việt Nam.',
        'Lưu ý đơn vị: arabica KC niêm yết bằng cent/lb (37.500 lb mỗi hợp đồng, tick 0,05 cent = 18,75 USD); robusta RC niêm yết bằng USD/tấn (10 tấn mỗi hợp đồng, tick 1 USD = 10 USD). Hai loại không so sánh trực tiếp bằng con số giá.',
      ],
      instrumentIds: ['ICE:KC', 'ICE:RC'],
      links: [{ module: 'commodity-profile', label: 'Hồ sơ hàng hoá' }, { module: 'cot', label: 'Báo cáo COT' }],
      quiz: [
        q('Robusta được giao dịch trên sàn nào trong ứng dụng?', ['ICE Europe (mã RC)', 'COMEX', 'CBOT', 'SGX'], 0, 'RC của ICE Europe.'),
        q('Rủi ro thời tiết điển hình của arabica Brazil?', ['Sương giá', 'Tuyết rơi ở Việt Nam', 'Bão biển Bắc', 'Không có'], 0, 'Sương giá có thể gây thiệt hại mùa vụ.'),
        q('Việt Nam nổi bật ở loại cà phê nào?', ['Robusta', 'Chỉ arabica', 'Không trồng', 'Chỉ cà phê hoà tan'], 0, 'Robusta.'),
      ],
      sources: [SRC.ice, SRC.usda, SRC.cftc],
    }),
    group({
      id: 'l3-softs',
      figures: ['a-softs-cards'],
      videos: [
        { title: 'Why is chocolate set to get more expensive?', url: 'https://www.youtube.com/watch?v=QWBqgPTdBLw', source: 'Reuters', lang: 'en', duration: '1:29', note: 'Video tiếng Anh của Reuters: thời tiết và nguồn cung ở Tây Phi đẩy giá ca cao lên thế nào.' },
      ],
      title: 'Nông sản: đường, ca cao, bông, cao su',
      objective: 'Biết yếu tố riêng của bốn mặt hàng này.',
      body: [
        'Đường (ICE US: SB): Brazil là nhà sản xuất lớn; giá liên quan giá ethanol và dầu thô vì mía có thể chuyển sang sản xuất ethanol. Ấn Độ và Thái Lan là nhân tố quan trọng khác.',
        'Ca cao (ICE US: CC): tập trung ở Tây Phi (Bờ Biển Ngà, Ghana); thời tiết và bệnh cây ảnh hưởng mạnh; thị trường có thể biến động rất lớn.',
        'Bông (ICE US: CT): giá chịu ảnh hưởng từ Mỹ, Trung Quốc, Ấn Độ và nhu cầu ngành dệt may; Việt Nam nhập khẩu bông cho ngành dệt may.',
        'Cao su: Việt Nam là nước sản xuất lớn. Hợp đồng cao su không có trong Instrument Master của ứng dụng; bảng ký quỹ MXV (en.mxv.com.vn/trading/margin.html, kiểm tra 20/11/2026) có liệt kê cao su trong nhóm Softs; hãy xem trang MXV để biết đặc tả: cần kiểm tra lại với MXV/công ty môi giới.',
        'Đơn vị khác nhau: đường SB 112.000 lb, tick 0,01 cent = 11,2 USD; ca cao CC 10 tấn, tick 1 USD = 10 USD; bông CT 50.000 lb, tick 0,01 cent = 5 USD.',
      ],
      instrumentIds: ['ICE:SB', 'ICE:CC', 'ICE:CT'],
      uncertain: ['Hợp đồng cao su: sàn tham chiếu và quy cách cần kiểm tra lại với MXV/công ty môi giới (mxv.com.vn).'],
      links: [{ module: 'commodity-profile', label: 'Hồ sơ hàng hoá' }],
      quiz: [
        q('Vì sao giá đường liên quan giá dầu thô?', ['Mía có thể dùng sản xuất ethanol', 'Đường là nhiên liệu', 'Cùng sàn', 'Không liên quan'], 0, 'Biên giữa đường và ethanol.'),
        q('Ca cao tập trung sản xuất chủ yếu ở đâu?', ['Tây Phi', 'Bắc Cực', 'Úc', 'Canada'], 0, 'Bờ Biển Ngà, Ghana.'),
        q('Ngành nào ở Việt Nam nhập khẩu bông?', ['Dệt may', 'Chăn nuôi', 'Xây dựng', 'Năng lượng'], 0, 'Dệt may.'),
      ],
      sources: [SRC.ice, SRC.usda],
    }),
    group({
      id: 'l3-precious',
      figures: ['a-precious-cards'],
      videos: [
        { title: 'Product: Gold', url: 'https://www.youtube.com/watch?v=ce3QsKAu64A', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: tổng quan hợp đồng vàng (video cũ, quy cách xem Instrument Master).' },
      ],
      title: 'Kim loại quý: vàng, bạc, bạch kim',
      objective: 'Hiểu vì sao kim loại quý được xem là tài sản trú ẩn và khác nhau ở đâu.',
      body: [
        'Vàng (COMEX: GC) thường được coi là tài sản trú ẩn: giá chịu ảnh hưởng từ lãi suất thực, đồng USD, mua vào của ngân hàng trung ương và tâm lý rủi ro.',
        'Bạc (SI) vừa là kim loại đầu tư vừa là kim loại công nghiệp nên biến động mạnh hơn vàng. Bạch kim (PL) liên quan nhiều tới ngành ô tô (xúc tác khí thải) và nguồn cung hạn chế.',
        'Dữ liệu cần theo dõi: lãi suất và dữ liệu kinh tế Mỹ, chỉ số USD, báo cáo COT.',
        'Liên hệ Việt Nam: giá vàng trong nước có thể lệch với giá thế giới do cơ chế thị trường trong nước; đây là điều cần kiểm tra riêng.',
        'Về hợp đồng: vàng GC là 100 troy oz, tick 0,1 USD = 10 USD, nên giá đổi 1 USD/oz tương đương 100 USD cho mỗi hợp đồng. Bạc SI là 5.000 troy oz, tick 0,005 USD = 25 USD.',
      ],
      instrumentIds: ['COMEX:GC', 'COMEX:SI', 'NYMEX:PL'],
      links: [{ module: 'cot', label: 'Báo cáo COT' }, { module: 'charts', label: 'Biểu đồ' }],
      quiz: [
        q('Vàng thường được xem là gì?', ['Tài sản trú ẩn', 'Nông sản', 'Năng lượng', 'Chứng khoán'], 0, 'Tài sản trú ẩn.'),
        q('Vì sao bạc biến động mạnh hơn vàng thường thấy?', ['Vừa đầu tư vừa công nghiệp, thị trường nhỏ hơn', 'Do tick lớn hơn', 'Không có lý do', 'Do thuế'], 0, 'Hai nguồn cầu và quy mô nhỏ hơn.'),
        q('Bạch kim liên quan mạnh tới ngành nào?', ['Ô tô', 'Nông nghiệp', 'Dệt may', 'Giáo dục'], 0, 'Xúc tác khí thải.'),
      ],
      sources: [SRC.cmeMetals, SRC.cftc],
    }),
    group({
      id: 'l3-industrial',
      figures: ['a-copper-chain'],
      videos: [
        { title: 'Products: Copper (HG)', url: 'https://www.youtube.com/watch?v=nNcDU--zIFc', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: hợp đồng đồng COMEX và các yếu tố cung cầu.' },
      ],
      title: 'Kim loại công nghiệp: đồng và quặng sắt',
      objective: 'Hiểu vì sao đồng được xem như phong vũ biểu kinh tế và vai trò của quặng sắt.',
      body: [
        'Đồng (COMEX: HG) dùng rộng trong xây dựng, điện, ô tô; nhu cầu của Trung Quốc rất lớn nên giá hay được coi là chỉ báo kinh tế toàn cầu.',
        'Quặng sắt (CME: TIO, SGX: FEF) là nguyên liệu chính của thép; giá phụ thuộc nhu cầu thép Trung Quốc và nguồn cung từ Úc, Brazil.',
        'Dữ liệu: PMI sản xuất, số liệu bất động sản và sản xuất thép của Trung Quốc, tồn kho kim loại.',
        'Liên hệ Việt Nam: ngành thép Việt Nam phụ thuộc nguyên liệu nhập khẩu, nên giá quặng sắt và than ảnh hưởng giá thép trong nước.',
        'Về hợp đồng: đồng HG là 25.000 lb, tick 0,0005 USD/lb = 12,5 USD, nên giá đổi 1 cent/lb tương đương 250 USD cho mỗi hợp đồng.',
      ],
      instrumentIds: ['COMEX:HG', 'CME:TIO', 'SGX:FEF'],
      links: [{ module: 'markets', label: 'Thị trường' }, { module: 'charts', label: 'Biểu đồ' }],
      quiz: [
        q('Vì sao đồng được gọi là chỉ báo kinh tế?', ['Dùng rộng trong công nghiệp và xây dựng', 'Giá cố định', 'Không ai dùng', 'Do tên'], 0, 'Nhu cầu gắn với hoạt động kinh tế.'),
        q('Quặng sắt chủ yếu dùng để làm gì?', ['Sản xuất thép', 'Sản xuất đường', 'Nhiên liệu', 'Thức ăn chăn nuôi'], 0, 'Nguyên liệu chính của thép.'),
        q('Nhân tố nhu cầu lớn của đồng và quặng sắt?', ['Trung Quốc', 'Bắc Cực', 'Không có', 'Chỉ Việt Nam'], 0, 'Tiêu thụ lớn nhất thế giới.'),
      ],
      sources: [SRC.cmeMetals, SRC.mxv],
    }),
    group({
      id: 'l3-oil',
      figures: ['a-wti-brent'],
      videos: [
        { title: 'What is WTI Crude Oil?', url: 'https://www.youtube.com/watch?v=NgX2HYEYBWw', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: dầu WTI là gì.' },
      ],
      title: 'Năng lượng: dầu WTI và Brent',
      objective: 'Phân biệt WTI và Brent, nắm các yếu tố và báo cáo EIA.',
      body: [
        'WTI (NYMEX: CL) là chuẩn của Mỹ; Brent (ICE: BRN) là chuẩn quốc tế phổ biến. Hai giá thường đi cùng nhau nhưng có chênh lệch.',
        'Yếu tố chính: quyết định sản lượng của OPEC+, sản lượng dầu đá phiến Mỹ, nhu cầu kinh tế, địa chính trị, tồn kho, đồng USD.',
        'Báo cáo quan trọng: báo cáo tồn kho dầu hằng tuần của EIA (thường công bố vào giữa tuần theo giờ Mỹ) và API; báo cáo COT.',
        'Liên hệ Việt Nam: giá dầu thế giới ảnh hưởng giá xăng dầu trong nước và chi phí vận tải.',
        'Về hợp đồng: WTI CL và Brent BRN đều là 1.000 thùng, tick 0,01 USD = 10 USD, nên giá đổi 1 USD/thùng tương đương 1.000 USD cho mỗi hợp đồng.',
      ],
      instrumentIds: ['NYMEX:CL', 'ICE:BRN'],
      links: [{ module: 'news', label: 'Tin tức' }, { module: 'term-structure', label: 'Cấu trúc kỳ hạn' }],
      quiz: [
        q('WTI giao dịch trên sàn nào trong ứng dụng?', ['NYMEX', 'ICE Europe', 'SGX', 'CBOT'], 0, 'CL thuộc NYMEX.'),
        q('Báo cáo nào về tồn kho dầu hằng tuần?', ['EIA', 'WASDE', 'COT', 'CPI'], 0, 'EIA Weekly Petroleum Status Report.'),
        q('Tổ chức nào ảnh hưởng sản lượng dầu?', ['OPEC+', 'MXV', 'HNX', 'USDA'], 0, 'OPEC+.'),
      ],
      sources: [SRC.eia, SRC.cmeEnergy, SRC.ice],
    }),
    group({
      id: 'l3-gas',
      figures: ['a-gas-season'],
      videos: [
        { title: 'Product: Natural Gas', url: 'https://www.youtube.com/watch?v=rgBuC0pt8rQ', source: 'CME Group', lang: 'en', note: 'Video tiếng Anh của CME Group: khí tự nhiên, quy cách và yếu tố cung cầu.' },
      ],
      title: 'Năng lượng: khí tự nhiên',
      objective: 'Hiểu tính mùa vụ và thời tiết của khí tự nhiên (NG).',
      body: [
        'Khí tự nhiên Henry Hub (NYMEX: NG) chịu ảnh hưởng mạnh của thời tiết: mùa đông lạnh tăng nhu cầu sưởi, mùa hè nóng tăng nhu cầu điện làm mát.',
        'Báo cáo tồn kho khí tự nhiên hằng tuần của EIA là sự kiện quan trọng; so sánh với mức trung bình nhiều năm để đánh giá.',
        'Giá khí tự nhiên có thể biến động rất mạnh trong thời gian ngắn, nên rủi ro đòn bẩy đặc biệt cao.',
        'Liên hệ Việt Nam: giá khí thế giới (LNG) liên quan chi phí điện và phân bón khi nhập khẩu, nhưng quan hệ không trực tiếp với Henry Hub.',
        'Về hợp đồng: khí tự nhiên NG là 10.000 MMBtu, tick 0,001 USD = 10 USD, nên giá đổi 0,1 USD/MMBtu tương đương 1.000 USD cho mỗi hợp đồng.',
      ],
      instrumentIds: ['NYMEX:NG'],
      links: [{ module: 'news', label: 'Tin tức' }, { module: 'charts', label: 'Biểu đồ' }],
      quiz: [
        q('Yếu tố nào ảnh hưởng mạnh nhất tới khí tự nhiên ngắn hạn?', ['Thời tiết', 'Màu sắc', 'Tên sàn', 'Không có'], 0, 'Thời tiết quyết định nhu cầu sưởi/làm mát.'),
        q('Báo cáo tồn kho khí tự nhiên do ai công bố?', ['EIA', 'USDA', 'MXV', 'CFTC'], 0, 'EIA.'),
        q('Rủi ro điển hình của NG?', ['Biến động rất mạnh', 'Giá cố định', 'Không có rủi ro', 'Chỉ lãi'], 0, 'Biến động rất mạnh.'),
      ],
      sources: [SRC.eiaGas, SRC.cmeEnergy],
    }),
  ],
};
