export type SlangTag = 'tâm lý' | 'lệnh' | 'rủi ro' | 'phân tích' | 'phái sinh';

export interface SlangTerm {
  id: string;
  term: string;
  /** Nghĩa dễ hiểu, 1-2 câu. */
  meaning: string;
  /** Ví dụ đời thường (nông trại / chợ). */
  example: string;
  /** Chỉ có khi thuật ngữ che giấu rủi ro. */
  warning?: string;
  /** Thuật ngữ chính thức liên quan. */
  related: string;
  tags: SlangTag[];
}

export const SLANG_TAGS: SlangTag[] = ['tâm lý', 'lệnh', 'rủi ro', 'phân tích', 'phái sinh'];

type Row = [id: string, term: string, meaning: string, example: string, related: string, tags: SlangTag[], warning?: string];

const ROWS: Row[] = [
  ['dudinh', 'Đu đỉnh', 'Mua vào ở lúc giá đã tăng rất cao, sát đỉnh, rồi giá quay đầu giảm.', 'Như mua lúa giống ở đúng ngày chợ giá cao nhất, sau đó giá tụt dần.', 'Mua đuổi (chasing)', ['tâm lý', 'rủi ro'], 'Thấy giá tăng nóng rồi mới mua thường là lúc người vào sớm đã chuẩn bị bán.'],
  ['batday', 'Bắt đáy', 'Mua khi cho rằng giá đã giảm tới mức thấp nhất rồi.', 'Thấy cà phê rớt giá liền mua, tưởng đã rẻ nhất; nhưng ngày mai có thể còn rẻ hơn.', 'Mua đảo chiều (bottom picking)', ['tâm lý', 'lệnh'], 'Không ai biết chắc đâu là đáy. Giá giảm có thể còn kéo dài.'],
  ['batdaorroi', 'Bắt dao rơi', 'Mua ngược khi giá đang giảm mạnh, chưa có dấu hiệu dừng.', 'Như đưa tay chụp con dao đang rơi: dễ bị đứt tay.', 'Mua ngược xu hướng (counter-trend)', ['rủi ro', 'lệnh'], 'Giảm mạnh có thể còn giảm tiếp; hãy chờ giá ổn định và luôn đặt mức dừng lỗ.'],
  ['gonglo', 'Gồng lỗ', 'Không chịu bán dù đang lỗ, hy vọng giá quay lại.', 'Giữ mãi bao lúa đã ẩm mốc vì mong giá lên, trong khi hàng ngày một hỏng thêm.', 'Không cắt lỗ (loss aversion)', ['tâm lý', 'rủi ro'], 'Với hợp đồng có đòn bẩy, gồng lỗ có thể dẫn tới bị gọi ký quỹ hoặc mất sạch vốn.'],
  ['gonglai', 'Gồng lãi', 'Tiếp tục giữ vị thế đang có lãi để lãi lớn hơn.', 'Chưa hái ngay quả đã chín vì tin vài hôm nữa còn to hơn.', 'Dừng lỗ dời theo (trailing stop)', ['lệnh', 'tâm lý'], 'Lãi đang có vẫn có thể biến mất nếu giá quay đầu; nên có mức dừng rõ ràng.'],
  ['catlo', 'Cắt lỗ', 'Bán/đóng vị thế khi lỗ tới mức đã định trước để không lỗ thêm.', 'Thấy ruộng bị sâu bệnh nặng thì cắt bỏ phần hỏng, giữ phần còn lại.', 'Dừng lỗ (stop loss)', ['lệnh', 'rủi ro']],
  ['chotloi', 'Chốt lời', 'Bán/đóng vị thế khi đang có lãi để giữ phần lãi.', 'Bán nông sản khi giá tốt thay vì chờ mãi.', 'Lấy lợi nhuận (take profit)', ['lệnh']],
  ['chotnon', 'Chốt non', 'Bán quá sớm: vừa có chút lãi đã bán rồi giá tiếp tục tăng mạnh.', 'Hái xoài khi còn xanh, bán rẻ, rồi thấy người khác bán đắt hơn.', 'Chốt lời sớm', ['tâm lý', 'lệnh']],
  ['chay', 'Cháy tài khoản', 'Mất gần hết hoặc toàn bộ tiền trong tài khoản giao dịch.', 'Như mất trắng cả vụ mùa vì dồn hết vốn vào một ruộng gặp hạn.', 'Mất vốn / thanh lý cưỡng bức (liquidation)', ['rủi ro'], 'Thường do dùng đòn bẩy cao, không đặt dừng lỗ, hoặc vào lệnh quá lớn.'],
  ['callmargin', 'Call margin / bị gọi ký quỹ', 'Khi lỗ làm tiền ký quỹ xuống dưới mức yêu cầu, công ty môi giới đòi bạn nộp thêm tiền hoặc giảm vị thế.', 'Như đặt cọc mua hàng, giá hàng giảm, người bán đòi bạn cọc thêm kẻo huỷ.', 'Margin call', ['rủi ro', 'phái sinh'], 'Không nộp kịp thì vị thế có thể bị đóng cưỡng bức và chốt lỗ thật.'],
  ['fullmargin', 'Full margin', 'Dùng gần hết tiền trong tài khoản làm ký quỹ cho các lệnh đang mở.', 'Đem hết tiền trong nhà đi đặt cọc, không còn đồng dự phòng nào.', 'Sử dụng ký quỹ tối đa', ['rủi ro', 'phái sinh'], 'Chỉ cần giá đi ngược một chút là bị gọi ký quỹ hoặc cháy tài khoản.'],
  ['donbay', 'Đòn bẩy', 'Dùng một khoản tiền nhỏ (ký quỹ) để kiểm soát hợp đồng có giá trị lớn hơn nhiều lần.', 'Đặt cọc 10% để giữ cả lô hàng: giá tăng lãi nhiều, giá giảm lỗ cũng nhiều như vậy.', 'Leverage', ['phái sinh', 'rủi ro'], 'Đòn bẩy khuếch đại cả lãi lẫn lỗ; lỗ có thể vượt số tiền ký quỹ ban đầu.'],
  ['allin', 'All-in', 'Dồn toàn bộ vốn vào một lệnh hoặc một cược.', 'Bán hết đàn gà để mua một con bò duy nhất.', 'Tập trung vốn quá mức', ['rủi ro', 'tâm lý'], 'Một lần sai có thể mất tất cả; nên chỉ rủi ro một phần nhỏ vốn mỗi lệnh.'],
  ['fomo', 'FOMO', 'Nỗi sợ bị bỏ lỡ: thấy giá tăng, ai cũng khoe lãi nên vội mua theo.', 'Thấy cả xóm đổ xô trồng một giống cây rồi mình cũng vội trồng, không tính toán.', 'Fear of missing out', ['tâm lý', 'rủi ro'], 'Mua vì sợ lỡ cơ hội thường khiến mua ở giá cao và thiếu kế hoạch.'],
  ['fud', 'FUD', 'Sợ hãi, nghi ngờ, hoang mang do tin đồn khiến nhiều người bán vội.', 'Nghe tin đồn dịch bệnh chưa kiểm chứng liền bán tháo cả đàn.', 'Fear, Uncertainty, Doubt', ['tâm lý'], 'Hãy kiểm chứng tin từ nguồn đáng tin cậy trước khi hành động.'],
  ['hold', 'Hold / ôm hàng', 'Giữ nguyên vị thế hoặc hàng trong thời gian dài, không bán ra.', 'Cất lúa trong kho chờ giá tốt.', 'Nắm giữ (holding)', ['lệnh', 'tâm lý'], 'Giữ lâu không có nghĩa là an toàn; hợp đồng tương lai còn có ngày đáo hạn và chi phí chuyển kỳ.'],
  ['xahang', 'Xả hàng', 'Bán ra một lượng lớn, thường nhanh, khiến giá giảm.', 'Chủ vựa đổ hàng ra chợ cùng lúc, giá rớt.', 'Bán tháo / phân phối', ['tâm lý', 'phân tích']],
  ['luotsong', 'Lướt sóng', 'Mua bán nhanh trong vài ngày hoặc ngắn hơn để ăn chênh lệch nhỏ.', 'Mua rau buổi sáng, bán buổi chiều kiếm chút chênh lệch.', 'Giao dịch ngắn hạn (short-term trading)', ['lệnh', 'rủi ro'], 'Giao dịch càng nhiều thì phí và trượt giá càng cộng dồn, dễ lỗ.'],
  ['scalping', 'Scalping', 'Vào ra liên tục trong vài giây đến vài phút để kiếm chênh lệch rất nhỏ mỗi lệnh.', 'Như bán lẻ từng gói nhỏ, lãi mỏng nhưng bán rất nhiều lần.', 'Giao dịch siêu ngắn hạn', ['lệnh', 'rủi ro'], 'Đòi hỏi tốc độ và kỷ luật; phí giao dịch có thể ăn hết lãi.'],
  ['swing', 'Swing', 'Giữ vị thế vài ngày đến vài tuần để ăn một nhịp lên hoặc xuống của giá.', 'Mua lúc đầu vụ, bán khi giá lên vài tuần sau.', 'Swing trading', ['lệnh']],
  ['sideway', 'Sideway / đi ngang', 'Giá dao động trong một khoảng hẹp, không rõ tăng hay giảm.', 'Giá gạo lên xuống quanh một mức suốt mấy tuần.', 'Thị trường đi ngang (ranging)', ['phân tích']],
  ['breakout', 'Breakout / phá vỡ', 'Giá vượt khỏi vùng kháng cự hoặc hỗ trợ, thường kèm khối lượng lớn.', 'Nước tràn qua bờ ruộng sau khi đã dâng cao một thời gian.', 'Phá vỡ vùng giá', ['phân tích']],
  ['fakebreakout', 'Fake breakout / bẫy', 'Giá có vẻ phá vỡ nhưng nhanh chóng quay lại vùng cũ, khiến người vào theo bị lỗ.', 'Tưởng nước đã tràn bờ, hoá ra chỉ là sóng bắn lên rồi rút.', 'Phá vỡ giả (false breakout)', ['phân tích', 'rủi ro'], 'Nên chờ xác nhận và đặt dừng lỗ khi vào lệnh theo phá vỡ.'],
  ['thungho', 'Thủng hỗ trợ', 'Giá rơi xuống dưới mức hỗ trợ mà trước đó giá từng bật lên.', 'Nền móng bờ đê bị sạt, nước tràn xuống thấp hơn.', 'Phá vỡ hỗ trợ (support break)', ['phân tích']],
  ['khangcu', 'Kháng cự', 'Mức giá mà giá thường khó vượt qua vì nhiều người muốn bán ở đó.', 'Mức giá mà lần nào lên tới cũng bị người bán chặn lại, như trần nhà.', 'Resistance', ['phân tích']],
  ['daykep', 'Đáy kép', 'Hình dạng giá chạm một mức thấp hai lần rồi bật lên; có thể báo hiệu đảo chiều tăng.', 'Hai lần rớt xuống cùng một mức rồi cùng bật lên, như quả bóng nảy hai lần.', 'Double bottom', ['phân tích'], 'Chỉ là mẫu hình xác suất, không phải lời hứa giá sẽ tăng.'],
  ['dinhkep', 'Đỉnh kép', 'Giá lên chạm một mức cao hai lần rồi giảm; có thể báo hiệu đảo chiều giảm.', 'Hai lần cố leo tới cùng một đỉnh dốc rồi đều tụt xuống.', 'Double top', ['phân tích'], 'Chỉ là mẫu hình xác suất, có thể không xảy ra.'],
  ['phebo', 'Phe bò', 'Những người kỳ vọng giá tăng và mua vào.', 'Bò húc sừng hất lên; phe tin giá sẽ lên.', 'Bulls (phe giá lên)', ['tâm lý', 'phân tích']],
  ['phegau', 'Phe gấu', 'Những người kỳ vọng giá giảm và bán ra.', 'Gấu vỗ tay đè xuống; phe tin giá sẽ xuống.', 'Bears (phe giá xuống)', ['tâm lý', 'phân tích']],
  ['long', 'Long', 'Mua hợp đồng, kiếm lãi khi giá tăng.', 'Đặt mua lúa giá hôm nay, mong tháng sau bán được giá cao hơn.', 'Vị thế mua (long position)', ['lệnh', 'phái sinh']],
  ['short', 'Short / bán khống', 'Bán hợp đồng trước, hy vọng mua lại rẻ hơn sau; lãi khi giá giảm.', 'Ký bán hàng giá hôm nay, chưa có hàng, chờ giá xuống mua về giao.', 'Vị thế bán (short position)', ['lệnh', 'phái sinh', 'rủi ro'], 'Nếu giá tăng, lỗ có thể rất lớn vì giá không có trần.'],
  ['daochieu', 'Đảo chiều', 'Xu hướng giá đổi hướng, từ tăng sang giảm hoặc ngược lại.', 'Dòng sông đột ngột đổi chiều chảy.', 'Reversal', ['phân tích']],
  ['tichluy', 'Tích luỹ', 'Giai đoạn giá đi ngang ở vùng thấp khi người mua gom dần hàng.', 'Thương lái lặng lẽ gom hàng lúc giá thấp trước vụ.', 'Accumulation', ['phân tích']],
  ['phanphoi', 'Phân phối', 'Giai đoạn giá đi ngang ở vùng cao khi người nắm hàng lớn bán dần ra.', 'Chủ vựa bán dần hàng cho người đến sau khi giá đã cao.', 'Distribution', ['phân tích']],
  ['ruhang', 'Rũ hàng', 'Làm giá giảm mạnh để doạ người nhỏ bán ra, rồi mua lại rẻ.', 'Như rung cành cho quả xanh rụng bớt, rồi nhặt lại.', 'Shakeout', ['tâm lý', 'phân tích'], 'Thường chỉ là cách giải thích sau sự việc; đừng tin mù quáng vào thuyết bị thao túng.'],
  ['keoxa', 'Kéo xả', 'Đẩy giá lên cao để thu hút người mua theo, rồi bán ra cho họ.', 'Có người lùa giá hàng lên để dụ mọi người mua, rồi đổ hết hàng của mình.', 'Pump and dump', ['rủi ro', 'tâm lý'], 'Thường gặp ở thị trường nhỏ, ít thanh khoản; thao túng giá là vi phạm pháp luật.'],
  ['caman', 'Cá mập / tay to', 'Nhà đầu tư hoặc tổ chức có vốn rất lớn, có thể ảnh hưởng giá.', 'Thương lái lớn mua cả xe hàng, làm giá chợ nhích lên.', 'Nhà đầu tư lớn (institutional)', ['tâm lý', 'phân tích']],
  ['nhole', 'Nhỏ lẻ', 'Nhà đầu tư cá nhân vốn nhỏ.', 'Người bán rau ngoài chợ so với chủ vựa lớn.', 'Retail trader', ['tâm lý']],
  ['tradingplan', 'Trading plan', 'Kế hoạch giao dịch viết sẵn: khi nào vào, khi nào thoát, lỗ tối đa bao nhiêu, vốn mỗi lệnh.', 'Lịch gieo trồng viết sẵn trước vụ, không chạy theo lời đồn.', 'Kế hoạch giao dịch', ['lệnh', 'tâm lý']],
  ['rr', 'R:R', 'Tỷ lệ lãi kỳ vọng so với mức lỗ chấp nhận; ví dụ 1:2 là chịu rủi ro 1 để mong lãi 2.', 'Bỏ ra 1 triệu rủi ro để mong thu 2 triệu nếu thuận lợi.', 'Risk:Reward ratio', ['lệnh', 'rủi ro'], 'R:R tốt chưa đủ nếu tỷ lệ thắng thấp; phải xét cả hai.'],
  ['stophunt', 'Stop hunt', 'Giá bị đẩy nhanh qua vùng nhiều lệnh dừng lỗ rồi quay đầu, khiến nhiều người bị cắt lỗ oan.', 'Như đuổi bầy chim ra khỏi bụi rồi quay lại chỗ cũ.', 'Quét dừng lỗ (stop run)', ['rủi ro', 'phân tích'], 'Đặt dừng lỗ quá sát hoặc đúng số tròn dễ bị quét.'],
  ['gap', 'Gap / khoảng trống giá', 'Giá mở cửa cách xa giá đóng cửa trước đó, để lại khoảng trống trên biểu đồ.', 'Qua một đêm có tin bão, sáng ra giá chợ nhảy hẳn một bậc.', 'Price gap', ['phân tích', 'rủi ro'], 'Lệnh dừng lỗ có thể khớp ở giá xấu hơn nhiều khi gặp gap.'],
  ['thanhkhoan', 'Thanh khoản', 'Mức độ dễ mua bán nhanh mà giá không bị xê dịch nhiều.', 'Chợ đông người mua bán thì bán nhanh được giá; chợ vắng thì khó.', 'Liquidity', ['phân tích', 'rủi ro'], 'Thanh khoản thấp khiến khó thoát lệnh và chênh lệch mua bán rộng.'],
  ['truotgia', 'Trượt giá', 'Giá khớp lệnh khác giá bạn mong muốn, thường xấu hơn.', 'Định bán 10 nghìn nhưng người mua chỉ trả 9 nghìn 800.', 'Slippage', ['lệnh', 'rủi ro'], 'Hay xảy ra khi thị trường biến động mạnh hoặc ít thanh khoản.'],
  ['roll', 'Roll / chuyển kỳ', 'Đóng hợp đồng sắp đáo hạn và mở hợp đồng cùng loại ở kỳ hạn sau để tiếp tục giữ vị thế.', 'Gia hạn hợp đồng thuê đất sang vụ sau.', 'Rolling futures', ['phái sinh', 'lệnh'], 'Chuyển kỳ có chi phí và chênh lệch giá giữa hai kỳ hạn.'],
  ['daohan', 'Đáo hạn', 'Ngày hợp đồng hết hiệu lực; phải đóng vị thế hoặc thực hiện giao nhận.', 'Ngày đến hạn giao lúa theo hợp đồng đã ký.', 'Expiration', ['phái sinh'], 'Không đóng kịp có thể bị môi giới đóng cưỡng bức; cần nắm quy định của từng hợp đồng.'],
  ['contango', 'Contango', 'Giá kỳ hạn xa cao hơn giá kỳ hạn gần.', 'Giá lúa giao tháng sau đắt hơn giao ngay, vì phải cộng chi phí kho.', 'Đường cong giá dốc lên', ['phái sinh', 'phân tích'], 'Giữ vị thế mua qua nhiều kỳ có thể phát sinh chi phí chuyển kỳ.'],
  ['backwardation', 'Backwardation', 'Giá kỳ hạn gần cao hơn giá kỳ hạn xa, thường khi hàng khan hiếm.', 'Cuối vụ hàng thiếu nên hàng có ngay đắt hơn hàng hứa giao sau.', 'Đường cong giá dốc xuống', ['phái sinh', 'phân tích']],
  ['basis', 'Basis', 'Chênh lệch giữa giá giao ngay và giá hợp đồng tương lai.', 'Giá lúa tại ruộng so với giá hợp đồng giao tháng sau.', 'Cơ sở (basis)', ['phái sinh', 'phân tích']],
  ['hedge', 'Hedge / phòng hộ', 'Mở vị thế ngược lại để giảm rủi ro giá bất lợi với hàng thật đang có hoặc sắp có.', 'Nông dân bán trước vụ thu hoạch để chốt giá.', 'Phòng ngừa rủi ro giá (hedging)', ['phái sinh', 'rủi ro'], 'Phòng hộ giảm biến động nhưng không miễn phí và không xoá hết rủi ro (ví dụ rủi ro cơ sở).'],
  ['spread', 'Spread', 'Chênh lệch giữa hai giá, ví dụ giá mua và giá bán, hoặc giữa hai kỳ hạn.', 'Chênh giữa giá thương lái mua vào và giá bán ra.', 'Chênh lệch giá (spread)', ['phái sinh', 'lệnh']],
  ['quamua', 'Quá mua', 'Giá đã tăng nhanh đến mức chỉ báo (như RSI) cho thấy đà tăng có thể mệt.', 'Chạy quá nhanh nên cần thở, nhưng chưa chắc dừng ngay.', 'Overbought', ['phân tích'], 'Quá mua không có nghĩa là phải giảm; giá có thể quá mua rất lâu.'],
  ['quaban', 'Quá bán', 'Giá đã giảm nhanh đến mức chỉ báo cho thấy đà giảm có thể mệt.', 'Lò xo bị nén nhiều, có thể bật lại nhưng không chắc.', 'Oversold', ['phân tích'], 'Quá bán có thể kéo dài; không phải tín hiệu mua chắc chắn.'],
  ['phanky', 'Phân kỳ', 'Giá và chỉ báo đi ngược hướng nhau, có thể báo xu hướng yếu dần.', 'Xe vẫn chạy nhưng động cơ đã hụt hơi.', 'Divergence', ['phân tích'], 'Phân kỳ có thể kéo dài mà giá vẫn đi tiếp.'],
  ['xuhuong', 'Xu hướng', 'Hướng đi chủ đạo của giá: tăng, giảm hoặc đi ngang.', 'Dòng nước chảy: theo dòng thì nhẹ, ngược dòng thì mệt.', 'Trend', ['phân tích']],
  ['nen', 'Nến', 'Một thanh trên biểu đồ cho biết giá mở, cao nhất, thấp nhất và đóng của một khoảng thời gian.', 'Như dòng sổ ghi giá mở chợ, đắt nhất, rẻ nhất và đóng chợ trong ngày.', 'Candlestick', ['phân tích']],
  ['volume', 'Volume', 'Khối lượng hợp đồng được mua bán trong một khoảng thời gian.', 'Số bao lúa bán qua tay trong một phiên chợ.', 'Khối lượng giao dịch', ['phân tích'], 'Khối lượng thấp thì tín hiệu giá dễ sai lệch.'],
  ['openinterest', 'Open interest', 'Tổng số hợp đồng đang mở, chưa đóng; cho biết có bao nhiêu vị thế còn nằm trong thị trường.', 'Số hợp đồng đặt hàng còn hiệu lực, chưa giao.', 'Khối lượng mở (OI)', ['phái sinh', 'phân tích']],
  ['cot', 'COT', 'Báo cáo hằng tuần của cơ quan quản lý Mỹ (CFTC) cho biết các nhóm đang nắm vị thế mua/bán thế nào trên hợp đồng tương lai.', 'Như bảng thống kê thương lái lớn đang gom hay bán hàng.', 'Commitments of Traders', ['phân tích', 'phái sinh'], 'Dữ liệu công bố chậm vài ngày; chỉ để tham khảo, không dự báo chắc chắn.'],
  ['wasde', 'WASDE', 'Báo cáo hằng tháng của Bộ Nông nghiệp Mỹ (USDA) về cung cầu nông sản toàn cầu; thường làm giá nông sản biến động.', 'Như bản tin dự báo mùa màng quốc tế mà ai cũng chờ nghe.', 'World Agricultural Supply and Demand Estimates', ['phân tích'], 'Giá có thể biến động mạnh quanh giờ công bố; cẩn thận khi giữ lệnh qua sự kiện.'],
  ['eia', 'EIA', 'Cơ quan thông tin năng lượng Mỹ; công bố tồn kho dầu, khí hằng tuần nên hay làm giá năng lượng xê dịch.', 'Như thông báo lượng xăng dầu còn trong kho quốc gia.', 'Energy Information Administration', ['phân tích'], 'Giá thường giật mạnh vào lúc công bố.'],
  ['muavu', 'Mùa vụ', 'Quy luật giá lặp lại theo mùa trong năm, ví dụ vào vụ thu hoạch giá thường mềm hơn.', 'Vào vụ gặt hàng nhiều thì giá hay mềm đi.', 'Seasonality', ['phân tích'], 'Mùa vụ chỉ là xu hướng trung bình; năm nào cũng có ngoại lệ.'],
  ['sanma', 'Sàn ma / lùa gà', 'Nền tảng giao dịch không được cấp phép, giả vờ cho giao dịch nhưng thực chất giữ tiền hoặc làm bạn thua.', 'Như một cái chợ giả: bán hàng xong thì biến mất, không trả lại tiền.', 'Sàn lừa đảo / không có giấy phép', ['rủi ro'], 'CẢNH BÁO: chỉ giao dịch qua đơn vị được cấp phép hợp pháp; hãy nghi ngờ khi ai đó hứa lãi cao, ép nạp thêm tiền, hoặc không cho rút.'],
  ['keo', 'Kèo / hô tín hiệu', 'Lời mời hoặc nhóm chat chia sẻ nên mua/bán gì, giá nào, thường gọi là "kèo thơm".', 'Như người lạ ngoài chợ rỉ tai "cây này chắc ăn" mà không biết họ có lợi gì.', 'Tín hiệu giao dịch (trading signal)', ['rủi ro', 'tâm lý'], 'CẢNH BÁO: nhiều nhóm hô kèo là lừa đảo hoặc bán trước rồi kêu bạn mua. Không ai đảm bảo lãi; đừng chuyển tiền hay làm theo vô điều kiện.'],
];

export const SLANG: SlangTerm[] = ROWS.map(([id, term, meaning, example, related, tags, warning]) => ({
  id,
  term,
  meaning,
  example,
  related,
  tags,
  ...(warning ? { warning } : {}),
}));

export function filterSlang(items: SlangTerm[], query: string, tag: SlangTag | null): SlangTerm[] {
  const n = query.trim().toLowerCase();
  return items
    .filter((s) => (!tag || s.tags.includes(tag)) && (!n || `${s.term} ${s.meaning} ${s.related}`.toLowerCase().includes(n)))
    .sort((a, b) => a.term.localeCompare(b.term, 'vi'));
}
