# PHÂN TÍCH TÁC VỤ DỮ LIỆU (TASK ABSTRACTION & TASK IDIOM)
### DỰ ÁN: SURVEILLANCE DỊCH TỄ SỐT XUẤT HUYẾT & BỆNH MÙA MƯA VÀO CÁC TỈNH THÀNH VIỆT NAM

Tài liệu này trình bày chi tiết kết quả phân tích hệ thống trực quan hóa (Visualization) theo khung lý thuyết của **Tamara Munzner** (Visual Analysis and Design), cụ thể hóa cho 4 tác vụ cốt lõi hỗ trợ cán bộ y tế dự phòng trong việc giám sát, cảnh báo sớm dịch sốt xuất huyết (SXH).

---

## TỔNG QUAN HỆ SƠ ĐỒ ĐỊNH DANH DỮ LIỆU
Để đảm bảo tính chính xác trong phân tích **Wat**, dưới đây là bảng ánh xạ các trường thông tin trong cơ sở dữ liệu thực tế (`dataset/dataset.csv`):
*   `location.region`: Khu vực địa lý lớn (`C` - Categorical)
*   `location.name`: Tên tỉnh thành (`C` - Categorical)
*   `periodLabel`: Tháng thời gian giám sát (`O` - Ordinal: từ T5/2024 đến T5/2025)
*   `day`: Ngày trong tháng (`O` - Ordinal: từ 1 đến 31)
*   `day.totalprecip_mm`: Lượng mưa trong ngày (`Q` - Quantitative)
*   `day.avgtemp_c`: Nhiệt độ trung bình ngày (`Q` - Quantitative)
*   `day.avghumidity`: Độ ẩm trung bình ngày (`Q` - Quantitative)
*   `day.daily_chance_of_rain`: Xác suất dự báo mưa (`Q` - Quantitative)
*   `dengueRisk`: Chỉ số nguy cơ sốt xuất huyết tích hợp (`Q` - Quantitative, phân cấp theo mức nguy cơ `O` - Ordinal: Thấp, Trung bình, Cao)

---

# TASK 1: Biểu đồ Bản đồ Nhiệt Lượng mưa (Precipitation Heatmap)
**Mục tiêu của Nhân viên y tế**: Theo dõi xu hướng lượng mưa theo vùng địa lý và từng tháng trong năm để xác định khu vực và thời điểm có nguy cơ tích tụ nước đọng cao (môi trường thuận lợi cho muỗi sinh sản), chủ động phòng dịch trước mùa cao điểm.

### 1. Phân Tích Task Abstraction (Ba cấp độ hành động)

| Cấp độ | Chi tiết tác vụ lâm sàng | Action (Hành động) | Target (Mục tiêu) |
| :---: | :--- | :---: | :---: |
| **Analyze** | Khám phá xu hướng phân bố lượng mưa tích lũy tháng theo từng vùng địa lý và tiến trình thời gian (T5/24 - T5/25) để nhận diện chu kỳ ẩm ướt. | **Discover** | **Trends / Distribution** |
| **Search** | Định vị các ô lưới có lượng mưa đạt giá trị cực đại (ô màu xanh đậm sậm) biểu thị nguy cơ tích nước cực lớn. | **Locate** | **Extremes** |
| **Query** | So sánh tổng lượng mưa lũy kế giữa các vùng địa lý khác nhau trong cùng một mốc tháng cụ thể để phát hiện trọng điểm phòng dịch. | **Compare** | **Distribution** |

### 2. Phân Tích Task Idiom
*   **Wat (Loại dữ liệu)**:
    *   `C` (Categorical - Phân loại): Vùng địa lý lớn (`location.region`) hoặc Tên tỉnh thành (`location.name`).
    *   `O` (Ordinal - Thứ tự): Tiến trình 13 tháng giám sát (`periodLabel` từ T5/2024 đến T5/2025, trục thời gian liên tục).
    *   `Q` (Quantitative - Định lượng): Tổng lượng mưa lũy kế tháng (`day.totalprecip_mm` - đơn vị: mm).
*   **How (Mã hóa trực quan & Tương tác)**:
    *   **Mark (Ký hiệu)**: Diện tích hình chữ nhật (**Area marks / Rectangles**) cho các ô lưới.
    *   **Channel (Kênh biểu đạt)**:
        *   *Vị trí 2D phẳng (Position X, Y)*: Trục X biểu diễn thời gian (`O`), Trục Y biểu diễn các phân vùng địa lý (`C`). Trục tọa độ được căn chỉnh rõ ràng.
        *   *Màu sắc (Color/Luminance)*: Dải sắc độ xanh lam nước biển (**Blue color gradient**). Độ sáng/độ bão hòa tỷ lệ thuận với lượng mưa (`Q`) từ xanh nhạt (mưa ít, khô ráo) sang xanh thẫm (mưa rất to).
    *   **Layout (Bố cục phẳng)**: Lưới 2D Bản đồ nhiệt (**2D Grid / Matrix Heatmap**).
    *   **Manipulate (Thao tác)**:
        *   *Hover*: Làm nổi bật biên ô lưới (`white stroke`) và hiển thị tooltip thông tin lượng mưa và thời gian chính xác.
        *   *Click*: Bộ lọc thông minh. Chọn một vùng/tỉnh thành hoặc tháng để đồng bộ hóa và lọc tức thì dữ liệu của 3 biểu đồ còn lại trên Dashboard.
    *   **Arrange (Sắp xếp)**:
        *   *Order*: Sắp xếp trục X theo trình tự thời gian tuyến tính lịch sử thực tế (`temporal order`).
        *   *Separate & Align*: Phân vùng rõ ràng theo khu vực địa lý ở trục Y giúp mắt dễ quét theo hàng ngang.
    *   **Reduce (Giảm thiểu)**:
        *   *Aggregate (Gộp dữ liệu)*: Tích hợp dữ liệu ngày khí tượng thành tổng lượng mưa tháng và lấy trung bình theo quy mô vùng địa lý lớn để giảm mật độ điểm dữ liệu.

---

# TASK 2: Biểu đồ Tương quan Đa biến (Ecological Scatter Plot)
**Mục tiêu của Nhân viên y tế**: Phân tích mối quan hệ giữa nhiệt độ, độ ẩm và lượng mưa nhằm đánh giá mức độ thuận lợi của thời tiết đối với sự bùng phát mật độ muỗi truyền bệnh, nhanh chóng nhận diện các giai đoạn nguy cơ cao để đưa ra cảnh báo sớm cho cộng đồng.

### 1. Phân Tích Task Abstraction (Ba cấp độ hành động)

| Cấp độ | Chi tiết tác vụ lâm sàng | Action (Hành động) | Target (Mục tiêu) |
| :---: | :--- | :---: | :---: |
| **Analyze** | Khám phá cách các yếu tố sinh thái khí tượng (Nhiệt độ, Độ ẩm, Mưa) đồng thời tương tác và tác động lên chỉ số nguy cơ sốt xuất huyết. | **Discover** | **Correlation / Dependency** |
| **Search** | Định vị các ngày khí tượng rơi vào vùng sinh thái nguy hại lớn (vùng biên độ Độ ẩm $\ge 70\%$ và lượng mưa $\ge 5$mm). | **Locate** | **Features / Outliers** |
| **Query** | Xác định và phân loại mức độ nguy cơ sốt xuất huyết của một ngày cụ thể (Thấp - Xanh, Trung bình - Cam, Cao - Đỏ) dựa trên vị trí sinh thái của nó. | **Identify** | **Correlation** |

### 2. Phân Tích Task Idiom
*   **Wat (Loại dữ liệu)**:
    *   `Q` (Quantitative - Định lượng): Độ ẩm trung bình ngày (`day.avghumidity` - %), Lượng mưa ngày (`day.totalprecip_mm` - mm), Nhiệt độ trung bình ngày (`day.avgtemp_c` - °C).
    *   `O` (Ordinal - Thứ tự): Mức phân cấp nguy cơ bùng phát dịch (`dengueRisk` phân loại thành 3 ngưỡng trực quan: Thấp, Trung bình, Cao).
*   **How (Mã hóa trực quan & Tương tác)**:
    *   **Mark (Ký hiệu)**: Điểm tròn (**Point marks**). Mỗi chấm đại diện cho 1 ngày khí tượng tại khu vực giám sát.
    *   **Channel (Kênh biểu đạt)**:
        *   *Vị trí X (Position X)*: Độ ẩm ngày (`Q`).
        *   *Vị trí Y (Position Y)*: Lượng mưa ngày (`Q`).
        *   *Kích thước đường kính (Size/Radius)*: Ánh xạ từ Nhiệt độ trung bình ngày (`Q`). Chấm to hơn biểu thị nhiệt độ cao hơn (tối ưu hóa sinh trưởng của muỗi).
        *   *Màu sắc (Color Hue)*: Tông màu tín hiệu cảnh báo dịch tễ học tiêu chuẩn: Màu xanh lục (Nguy cơ Thấp), Màu cam (Nguy cơ Trung bình), Màu đỏ (Nguy cơ Cao).
    *   **Layout (Bố cục phẳng)**: Biểu đồ phân tán Cartesian 2D (**Cartesian Scatter Plot**).
    *   **Manipulate (Thao tác)**:
        *   *Filter*: Tự động cập nhật chỉ hiển thị các ngày tương ứng với bộ lọc Tỉnh/Thành và Khoảng thời gian đang được chọn trên Dashboard.
        *   *Hover*: Phóng to điểm tròn và kích hoạt Tooltip hiển thị đầy đủ 5 tham số khí tượng chi tiết của ngày đó.
    *   **Arrange (Sắp xếp)**:
        *   *Express*: Biểu diễn liên tục 2 chiều định lượng trên hệ trục tọa độ vuông góc X, Y.
        *   *Reference marks*: Vẽ thêm một hình chữ nhật ranh giới bằng nét đứt màu đỏ sậm (**Dashed Stroke Red Border**) khoanh vùng chính xác **"Vùng sinh thái báo động đỏ"** (Humid $\ge 70\%$, Precip $\ge 5$mm) để người dùng định vị các ngày nguy cơ cực cao chỉ trong 1 phần mười giây.
    *   **Reduce (Giảm thiểu)**:
        *   *Filter*: Giới hạn vẽ các chấm dữ liệu của duy nhất một tỉnh được lựa chọn để tránh sự chồng chéo (cluttering) của hàng chục ngàn ngày trên cả nước.

---

# TASK 3: Biểu đồ Lượng mưa & Dự báo theo Ngày (Combo Dual-Axis Chart)
**Mục tiêu của Nhân viên y tế**: Theo dõi lượng mưa thực tế, xác suất mưa và các ngưỡng cảnh báo theo từng ngày trong tháng để đưa ra hành động phòng dịch kịp thời như tổ chức chiến dịch diệt lăng quăng, kiểm tra khu vực chứa nước đọng và cảnh báo nguy cơ gia tăng ca SXH.

### 1. Phân Tích Task Abstraction (Ba cấp độ hành động)

| Cấp độ | Chi tiết tác vụ lâm sàng | Action (Hành động) | Target (Mục tiêu) |
| :---: | :--- | :---: | :---: |
| **Analyze** | Trình bày xu hướng dao động, biến thiên song song và so khớp giữa lượng mưa đo được thực tế và xác suất dự báo mưa của từng ngày trong tháng. | **Present** | **Trends / Co-variation** |
| **Search** | Tìm kiếm các ngày cực đoan có lượng mưa thực tế vượt ngưỡng y tế báo động nguy hiểm (20mm) hoặc có xác suất mưa cực kỳ cao. | **Locate** | **Extremes** |
| **Query** | So sánh sự chênh lệch giữa lượng mưa tích tụ thực tế với khả năng xảy ra mưa theo dự báo để đưa ra quyết định hành động y tế thực địa. | **Compare** | **Features / Distribution** |

### 2. Phân Tích Task Idiom
*   **Wat (Loại dữ liệu)**:
    *   `O` (Ordinal - Thứ tự): Các ngày trong tháng (`day` từ ngày 1 đến ngày cuối cùng của tháng, xếp tuyến tính).
    *   `Q` (Quantitative - Định lượng): Lượng mưa thực đo (`day.totalprecip_mm` - mm), Xác suất dự báo có mưa (`day.daily_chance_of_rain` - %).
*   **How (Mã hóa trực quan & Tương tác)**:
    *   **Mark (Ký hiệu)**:
        *   Lượng mưa thực tế: Các cột hình chữ nhật đứng (**Rectangle/Bar marks**).
        *   Xác suất mưa: Đường nối liền (**Line marks**) kết hợp các điểm chốt (**Point marks**) tại mỗi ngày.
    *   **Channel (Kênh biểu đạt)**:
        *   *Vị trí X (Position X)*: Ngày trong tháng (`O`).
        *   *Vị trí Y Trục Trái (Position Y Left Axis)*: Độ cao của cột biểu diễn lượng mưa thực tế (`Q`).
        *   *Vị trí Y Trục Phải (Position Y Right Axis)*: Điểm cao thấp của đường biểu diễn xác suất dự báo mưa (`Q`).
        *   *Màu sắc (Color Hue)*: Màu xanh coban đậm chuyển sắc cho cột mưa thực tế, màu xanh ngọc lam (Cyan) phát sáng cho đường xác suất mưa để phân biệt rõ ràng 2 chỉ số định lượng khác nhau.
    *   **Layout (Bố cục phẳng)**: Biểu đồ kết hợp hai trục tung (**Dual-Axis Combo Chart**).
    *   **Manipulate (Thao tác)**:
        *   *Filter*: Cho phép chọn tháng cụ thể thông qua hộp lựa chọn nhanh tích hợp ngay góc biểu đồ.
        *   *Hover*: Thay đổi màu sắc/kích thước tiêu điểm và **cập nhật nội dung động trong hộp khuyến cáo y tế dự phòng (Advice Box)** bên dưới biểu đồ theo logic y tế thời gian thực:
            *   *Mưa > 20mm & Xác suất > 80%*: Cảnh báo khẩn cấp chuẩn bị phòng chống SXH, chuẩn bị dịch truyền lâm sàng.
            *   *Mưa < 20mm nhưng Xác suất > 70%*: Tuyên truyền dọn dẹp lu khạp, bình chứa nước sau cơn mưa nhỏ.
            *   *Mưa > 15mm nhưng Xác suất thấp < 40%*: Mưa đột xuất, lập tức rà soát ao tù đọng nước mới phát sinh.
    *   **Arrange (Sắp xếp)**:
        *   *Align*: Căn lề đồng trục thời gian X để đối chiếu trực tiếp cột (thực tế) và đường (dự báo).
        *   *Threshold*: Vẽ đường giới hạn ngang nét đứt màu đỏ sậm (**Red Dashed Horizontal Threshold Line**) tại mốc 20mm (ngưỡng bắt đầu ngập úng tích lũy tạo ổ bọ gậy) giúp nhận diện tức thì các ngày vi phạm.
    *   **Reduce (Giảm thiểu)**:
        *   *Filter*: Chỉ hiển thị dữ liệu của một tháng được lựa chọn (khoảng 30 ngày) để tập trung cao độ, tránh rối mắt cho nhân viên y tế lâm sàng.

---

# TASK 4: Bản đồ Dịch tễ học Địa lý Việt Nam (Choropleth Map)
**Mục tiêu của Nhân viên y tế**: Xem tổng quan tỷ lệ sốt xuất huyết (ở đây đại diện bằng chỉ số nguy cơ sinh thái SXH tích hợp) của các tỉnh thành ở Việt Nam để chọn ra nhanh khu vực nào có khả năng bùng phát, phát triển mầm bệnh.

### 1. Phân Tích Task Abstraction (Ba cấp độ hành động)

| Cấp độ | Chi tiết tác vụ lâm sàng | Action (Hành động) | Target (Mục tiêu) |
| :---: | :--- | :---: | :---: |
| **Analyze** | Khám phá và bao quát toàn diện phân bố không gian địa lý của chỉ số nguy cơ sốt xuất huyết trung bình trên phạm vi toàn quốc. | **Discover** | **Spatial Distribution** |
| **Search** | Định vị các tỉnh thành hoặc cụm khu vực là điểm nóng (Hotspots) có màu đỏ đậm sậm nhất (nguy cơ bùng dịch khẩn cấp). | **Locate** | **Extremes / Spatial Features** |
| **Query** | So sánh mức độ rủi ro giữa các tỉnh lân cận hoặc giữa các miền địa lý lớn (Bắc - Trung - Nam) để phân bổ tài nguyên y tế. | **Compare** | **Spatial Distribution** |

### 2. Phân Tích Task Idiom
*   **Wat (Loại dữ liệu)**:
    *   `C` (Categorical - Phân loại): Tên ranh giới hành chính của từng tỉnh thành Việt Nam (`properties.Name` trong tệp GeoJSON địa lý).
    *   `Q` (Quantitative - Định lượng): Chỉ số nguy cơ sốt xuất huyết trung bình (`dengueRisk` tính bằng % từ 0% đến 100%).
*   **How (Mã hóa trực quan & Tương tác)**:
    *   **Mark (Ký hiệu)**: Đa giác diện tích vùng (**Area / Polygon marks**) thể hiện hình dáng biên giới hành chính các tỉnh thành.
    *   **Channel (Kênh biểu đạt)**:
        *   *Vị trí địa hình (Spatial Position)*: Tọa độ Kinh độ (Longitude) và Vĩ độ (Latitude) thực tế trên bản đồ hệ thống thông tin địa lý (GIS).
        *   *Màu sắc (Color/Luminance)*: Dải màu đỏ cảnh báo (**Red Alert Gradient**). Từ hồng nhạt (nguy cơ cực thấp, an toàn) sang cam đỏ và đỏ sậm (nguy cơ khẩn cấp y tế).
        *   *Viền vùng (Stroke Weight/Color)*: Viền xám tối mỏng khi ở trạng thái bình thường; viền trắng dày (**White Bold Stroke**) bao quanh tỉnh thành khi được người dùng click chọn (`activeProvince`).
    *   **Layout (Bố cục phẳng)**: Bản đồ phân vùng địa lý (**Geospatial Choropleth Map**).
    *   **Manipulate (Thao tác)**:
        *   *Select*: Cán bộ y tế click trực tiếp vào ranh giới một tỉnh trên bản đồ để kích hoạt bộ lọc tỉnh đó trên toàn bộ Dashboard.
        *   *Navigate (Zoom/Pan)*: **Tự động bay máy quay và thu phóng mượt mà (Leaflet Smooth Zooming & Panning)** đến tâm điểm của tỉnh hoặc vùng địa lý được chọn (`zoomToActiveSelection()`), tối ưu hóa khả năng quan sát cận cảnh thực địa.
        *   *Hover*: Kích hoạt đường viền trắng nổi bật xung quanh đa giác tỉnh thành và hiển thị tooltip thông tin chi tiết (Nguy cơ SXH, Nhiệt độ TB, Độ ẩm TB, Lượng mưa tích lũy và số ngày đỏ báo động).
    *   **Arrange (Sắp xếp)**:
        *   Bố trí không gian thực tế theo chuẩn bản đồ GIS Việt Nam, tích hợp lớp bản đồ nền tối (CartoDB Dark Matter) giúp nổi bật màu sắc phân vùng nguy cơ. Bố trí thanh đo chú giải màu (Colorbar Legend) cố định ở góc bản đồ.
    *   **Reduce (Giảm thiểu)**:
        *   *Filter*: Màu sắc bản đồ thay đổi động tương thích theo khoảng thời gian thời kỳ giám sát được chọn (lấy trung bình chỉ số rủi ro trong khoảng thời gian đó để tô màu).
