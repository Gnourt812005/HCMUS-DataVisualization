# Tóm Tắt Chức Năng Dashboard

## 1. Bản đồ nhiệt độ trung bình

-   **Biểu đồ**: Bản đồ địa lý (Leaflet + D3) hiển thị nhiệt độ trung bình qua màu sắc.
-   **Dữ liệu sử dụng**:
    -   `day.avgtemp_c`: Để tính toán và tô màu nhiệt độ trung bình.
    -   `location.name`: Để liên kết dữ liệu với từng tỉnh trên bản đồ.
    -   `date`: Để lọc dữ liệu theo bộ lọc.
-   **Bộ lọc áp dụng**:
    -   `Năm`: Lọc dữ liệu theo năm được chọn.
    -   `Tháng`: Lọc dữ liệu theo tháng được chọn (chỉ áp dụng cho bản đồ).

## 2. Biểu đồ lượng mưa trung bình

-   **Biểu đồ**: Biểu đồ cột (D3) thể hiện lượng mưa trung bình hàng tháng.
-   **Dữ liệu sử dụng**:
    -   `day.totalprecip_mm`: Để tính tổng lượng mưa.
    -   `date`: Để nhóm dữ liệu theo tháng.
-   **Bộ lọc áp dụng**:
    -   `Tỉnh thành`: Lọc dữ liệu cho tỉnh được chọn.
    -   `Năm`: Lọc dữ liệu cho năm được chọn.

## 3. Biểu đồ thời gian mặt trời mọc/lặn

-   **Biểu đồ**: Biểu đồ vùng (D3) thể hiện khoảng thời gian có ánh sáng ban ngày.
-   **Dữ liệu sử dụng**:
    -   `astro.sunrise`: Thời gian mặt trời mọc.
    -   `astro.sunset`: Thời gian mặt trời lặn.
    -   `date`: Để nhóm dữ liệu theo tháng.
-   **Bộ lọc áp dụng**:
    -   `Tỉnh thành`: Lọc dữ liệu cho tỉnh được chọn.
    -   `Năm`: Lọc dữ liệu cho năm được chọn.