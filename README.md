# DỰ ÁN WEBSITE TEXT TO SPEECH & SPEECH TO TEXT

## 1. Introduction

### 1.1 Project Name

**Polly Voice**

---

### 1.2 Project Objective

Xây dựng một website cho phép người dùng chuyển đổi **Text-to-Speech (TTS)** và **Speech-to-Text (STT)**. Hệ thống hỗ trợ tùy chỉnh giọng đọc, xem trước kết quả, lưu lịch sử chuyển đổi và tải xuống các tệp đã tạo.

---

## 2. Main Features

### 2.1 Text-to-Speech (TTS)

**Description:** Chuyển đổi văn bản thành giọng nói.

#### Features

| Feature        | Description                       |
| -------------- | --------------------------------- |
| Text Input     | Nhập văn bản trực tiếp            |
| Text Upload    | Tải lên file `.txt` *(Optional)*  |
| Language       | Chọn ngôn ngữ (Hiện tại chỉ triển khai tiếng anh)                   |
| Voice          | Chọn giọng đọc                    |
| Preset         | Chọn cấu hình giọng đọc có sẵn    |
| Voice Settings | Điều chỉnh các thông số giọng đọc |
| Preview        | Nghe thử trước khi xuất file      |
| Export         | Xuất file âm thanh                |

#### Voice Settings

> **Engine mặc định:** **Neural** — cung cấp giọng đọc tự nhiên nhất. Một số thông số chỉ khả dụng với Standard engine và sẽ được ghi chú rõ.

| Setting      | SSML Tag                   | Giá trị hợp lệ                                                     | Engine hỗ trợ        | Description                          |
| ------------ | -------------------------- | ------------------------------------------------------------------ | -------------------- | ------------------------------------ |
| Language     | *(API parameter)*          | `en-US`, `en-GB`, `en-AU`, ...                                     | All                  | Ngôn ngữ (hiện tại chỉ tiếng Anh)   |
| Voice        | *(API parameter)*          | Danh sách giọng Polly (vd: `Joanna`, `Matthew`, `Amy`, ...)        | All                  | Giọng đọc                            |
| Engine       | *(API parameter)*          | `neural` *(mặc định)*, `standard`, `long-form`                     | —                    | Bộ máy tổng hợp giọng nói            |
| Preset       | *(combination)*            | Deep Male, Young Male, Soft Female, Expressive Female, MC, Podcast, Audiobook | All     | Cấu hình giọng đọc có sẵn           |
| Speed        | `<prosody rate="...">`     | `x-slow`, `slow`, `medium`, `fast`, `x-fast` hoặc `20%`–`200%`    | All                  | Điều chỉnh tốc độ đọc               |
| Volume       | `<prosody volume="...">`   | `x-soft`, `soft`, `medium`, `loud`, `x-loud` hoặc `+ndB` / `-ndB` | All                  | Điều chỉnh âm lượng                 |
| Pitch        | `<prosody pitch="...">`    | `x-low`, `low`, `medium`, `high`, `x-high` hoặc `+n%` / `-n%`     | **Standard only**    | Điều chỉnh cao độ giọng              |
| Break        | `<break time="...">`       | `0ms` – `10000ms` (vd: `500ms`, `2s`)                              | All                  | Tạm dừng giữa các câu               |
| Emphasis     | `<emphasis level="...">`   | `strong`, `moderate`, `reduced`                                    | **Standard only**    | Nhấn mạnh từ hoặc cụm từ            |
| Domain Style | `<amazon:domain name="...">` | `news`, `conversational`                                         | **Neural only**      | Phong cách đọc (tin tức / hội thoại) |

> **Lưu ý:** Với engine **Neural** (mặc định), `Pitch` và `Emphasis` **không được hỗ trợ** — UI cần ẩn hoặc vô hiệu hóa các thông số này khi chọn Neural engine.

#### Available Presets

| Preset            | Voice mặc định | Engine    | Mô tả                                        |
| ----------------- | -------------- | --------- | -------------------------------------------- |
| Deep Male         | Matthew        | Neural    | Giọng nam trầm, uy quyền                     |
| Young Male        | Kevin          | Neural    | Giọng nam trẻ, năng động                     |
| Soft Female       | Joanna         | Neural    | Giọng nữ nhẹ nhàng, chậm rãi                 |
| Expressive Female | Danielle       | Long-form | Giọng nữ biểu cảm, phù hợp đọc truyện       |
| MC                | Stephen        | Neural    | Giọng MC rõ ràng, tốc độ vừa phải            |
| Podcast           | Matthew        | Neural    | Giọng podcast tự nhiên, Domain conversational |
| Audiobook         | Joanna         | Long-form | Giọng đọc sách, nhịp chậm, rõ ràng           |

---

### 2.2 Speech-to-Text (STT) *(Optional)*

**Description:** Chuyển đổi file âm thanh thành văn bản.

#### Features

| Feature            | Description                    |
| ------------------ | ------------------------------ |
| Audio Upload       | Tải lên file âm thanh          |
| Speech Recognition | Chuyển giọng nói thành văn bản |
| Text Result        | Hiển thị kết quả               |
| Copy               | Sao chép nội dung              |
| Download           | Tải xuống file `.txt`          |

#### Supported Audio Formats

|  Format |  Support  |
| :-----: | :-------: |
|  `.mp3` | Supported |
|  `.wav` |  Optional |
|  `.m4a` |  Optional |
| `.flac` |  Optional |


## 3. Supported File Formats

### Text Files

> **Description:** Các định dạng văn bản được hệ thống hỗ trợ.

| Format | Usage          |
| :----: | -------------- |
| `.txt` | Input / Output |

---

### Audio Files

> **Description:** Các định dạng âm thanh được hệ thống hỗ trợ.

| Format | Usage          |
| :----: | -------------- |
| `.mp3` | Input / Output |

---

## 4. User Roles

### Guest

**Description:** Người dùng chưa đăng nhập.

| Permission                              | Status |
| --------------------------------------- | :----: |
| Sử dụng Text-to-Speech                  |    ✓   |
| Sử dụng Speech-to-Text                  |    ✓   |
| Upload file để chuyển đổi               |    ✓   |
| Giới hạn số ký tự hoặc thời lượng xử lý |   Yes  |
| Lưu lịch sử chuyển đổi                  |   No   |
| Quản lý file                            |   No   |

---

### User

**Description:** Người dùng đã đăng nhập.

| Permission                                   | Status |
| -------------------------------------------- | :----: |
| Sử dụng Text-to-Speech                       |    ✓   |
| Sử dụng Speech-to-Text                       |    ✓   |
| Upload file để chuyển đổi                    |    ✓   |
| Lưu lịch sử chuyển đổi                       |    ✓   |
| Quản lý file                                 |    ✓   |
| Tăng giới hạn số ký tự hoặc thời lượng xử lý |    ✓   |
| Quản lý thông tin cá nhân                    |    ✓   |

---

### Permission Comparison

| Feature         | Guest |  User |
| --------------- | :---: | :---: |
| Text-to-Speech  |   ✓   |   ✓   |
| Speech-to-Text  |   ✓   |   ✓   |
| Upload File     |   ✓   |   ✓   |
| Lưu lịch sử     |   ✗   |   ✓   |
| Quản lý File    |   ✗   |   ✓   |
| Quản lý Profile |   ✗   |   ✓   |
| Giới hạn ký tự  |   Có  | Không |


## 5. User Interface

### 5.1 Text-to-Speech

**Description:** Giao diện chuyển đổi văn bản thành giọng nói.

| Section      | Features                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Input**    | Nhập văn bản trực tiếp hoặc tải lên file (`.txt`)                                                                                  |
| **Settings** | Chọn **Language**, **Voice**, **Engine**, **Preset**, điều chỉnh **Speed**, **Volume**, **Break**; **Pitch** (Standard only), **Emphasis** (Standard only), **Domain Style** (Neural only) |
| **Preview**  | Nút **Generate**, **Play Preview** và trình phát âm thanh                                                                          |
| **Export**   | Chọn định dạng đầu ra (`.mp3`) và tải xuống                                                                                        |

---

### 5.2 Speech-to-Text

**Description:** Giao diện chuyển đổi giọng nói thành văn bản.

| Section        | Features                                    |
| -------------- | ------------------------------------------- |
| **Upload**     | Tải lên file âm thanh (MP3, WAV,...)        |
| **Processing** | Hiển thị trạng thái xử lý                   |
| **Result**     | Hiển thị văn bản sau khi nhận dạng          |
| **Export**     | Tải kết quả dưới dạng file văn bản (`.txt`) |

---

### 5.3 Login *(Optional)*

**Description:** Giao diện xác thực người dùng.

| Features                              |
| ------------------------------------- |
| Đăng nhập bằng Email và Password      |
| Điều hướng đến trang đăng ký (nếu có) |

---

### 5.4 Profile *(Optional)*

**Description:** Quản lý thông tin cá nhân và lịch sử sử dụng.

| Features                      |
| ----------------------------- |
| Hiển thị thông tin người dùng |
| Chỉnh sửa thông tin cá nhân   |
| Xem lịch sử Text-to-Speech    |
| Xem lịch sử Speech-to-Text    |


## 6. Database

### User

**Description:** Lưu trữ thông tin tài khoản của người dùng.

| Field | Data Type | Constraints | Description |
|-------|-----------|-------------|-------------|
| `id` | BIGINT | **PK**, AUTO_INCREMENT, NOT NULL | Mã định danh của người dùng |
| `name` | VARCHAR(100) | NOT NULL | Họ và tên người dùng |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Email dùng để đăng nhập |
| `password` | VARCHAR(255) | NOT NULL | Mật khẩu đã được mã hóa (Hash) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo tài khoản |

#### Constraints

- **Primary Key:** `id`
- **Unique Key:** `email`
- **Password:** Lưu dưới dạng **hash** (ví dụ: BCrypt hoặc Argon2), không lưu mật khẩu dạng văn bản.
- **Timestamp:** `created_at` được tự động gán thời gian khi tạo tài khoản.

#### SQL Schema

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Text History

**Description:** Lưu lịch sử chuyển đổi từ văn bản sang giọng nói (Text-to-Speech). Áp dụng **Hybrid Approach**: các thông số quan trọng lưu thành cột riêng để dễ query, các thông số SSML nâng cao lưu trong `ssml_params` dạng JSON.

#### Cột cố định (Indexed columns)

| Field             | Data Type     | Constraints                           | Description                                              |
| ----------------- | ------------- | ------------------------------------- | -------------------------------------------------------- |
| `id`              | BIGINT        | **PK**, AUTO_INCREMENT, NOT NULL      | Mã lịch sử                                               |
| `user_id`         | BIGINT        | **FK → User(id)**, NOT NULL           | Người thực hiện                                          |
| `text_content`    | TEXT          | NULL                                  | Nội dung văn bản (nếu nhập trực tiếp)                    |
| `text_file_url`   | VARCHAR(512)  | NULL                                  | Đường dẫn file văn bản trên Amazon S3 (nếu upload file)  |
| `voice`           | VARCHAR(100)  | NOT NULL                              | Giọng đọc (vd: `Joanna`, `Matthew`)                      |
| `language`        | VARCHAR(50)   | NOT NULL                              | Ngôn ngữ (vd: `en-US`)                                   |
| `engine`          | VARCHAR(20)   | NOT NULL, DEFAULT `'neural'`          | Bộ máy tổng hợp: `neural`, `standard`, `long-form`       |
| `preset`          | VARCHAR(100)  | NULL                                  | Preset đã chọn (vd: `Podcast`, `Audiobook`)               |
| `speed`           | VARCHAR(20)   | DEFAULT `'medium'`                    | Tốc độ đọc (SSML rate: `x-slow`→`x-fast` hoặc `100%`)   |
| `volume`          | VARCHAR(20)   | DEFAULT `'medium'`                    | Âm lượng (SSML volume: `x-soft`→`x-loud` hoặc `+0dB`)   |
| `output_format`   | VARCHAR(10)   | NOT NULL, DEFAULT `'mp3'`             | Định dạng file xuất: `mp3`, `ogg_vorbis`, `pcm`          |
| `character_count` | INT           | NOT NULL, DEFAULT 0                   | Số ký tự đã xử lý (dùng để kiểm soát giới hạn & chi phí) |
| `ssml_enabled`    | TINYINT(1)    | NOT NULL, DEFAULT 0                   | `1` = request dùng SSML, `0` = plain text                |
| `audio_file_url`  | VARCHAR(512)  | NULL                                  | Đường dẫn file âm thanh trên Amazon S3                   |
| `created_at`      | TIMESTAMP     | DEFAULT CURRENT_TIMESTAMP             | Thời điểm tạo                                            |

#### Cột JSON (Thông số SSML nâng cao)

| Field         | Data Type | Constraints | Description                                                                     |
| ------------- | --------- | ----------- | ------------------------------------------------------------------------------- |
| `ssml_params` | JSON      | NULL        | Thông số SSML nâng cao, chỉ lưu khi `ssml_enabled = 1`. Xem cấu trúc bên dưới. |

**Cấu trúc `ssml_params` (ví dụ):**

```json
{
  "pitch": "+5%",
  "break_time": "500ms",
  "emphasis": "moderate",
  "domain_style": "conversational"
}
```

> **Lưu ý:** `pitch` và `emphasis` chỉ có giá trị khi `engine = 'standard'`. `domain_style` chỉ có giá trị khi `engine = 'neural'`. Backend cần validate trước khi lưu.

#### Constraints

* **Primary Key:** `id`
* **Foreign Key:** `user_id` → `users(id)`
* **Engine:** Mặc định `neural`; nếu `engine = 'neural'` thì `pitch` và `emphasis` trong `ssml_params` sẽ bị bỏ qua.
* **Character Count:** Tự động tính từ `text_content` hoặc nội dung file, dùng để kiểm soát giới hạn (Guest vs User) và ước tính chi phí AWS Polly.
* **Storage:** Chỉ lưu URL hoặc S3 Key của các file, dữ liệu thực được lưu trên Amazon S3.
* **Timestamp:** `created_at` được tự động gán thời gian khi tạo lịch sử.

#### SQL Schema

```sql
CREATE TABLE text_history (
    id              BIGINT        AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT        NOT NULL,
    text_content    TEXT,
    text_file_url   VARCHAR(512),
    voice           VARCHAR(100)  NOT NULL,
    language        VARCHAR(50)   NOT NULL,
    engine          VARCHAR(20)   NOT NULL DEFAULT 'neural',
    preset          VARCHAR(100),
    speed           VARCHAR(20)   DEFAULT 'medium',
    volume          VARCHAR(20)   DEFAULT 'medium',
    output_format   VARCHAR(10)   NOT NULL DEFAULT 'mp3',
    character_count INT           NOT NULL DEFAULT 0,
    ssml_enabled    TINYINT(1)    NOT NULL DEFAULT 0,
    ssml_params     JSON,
    audio_file_url  VARCHAR(512),
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_text_history_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    CONSTRAINT chk_engine
        CHECK (engine IN ('neural', 'standard', 'long-form')),

    CONSTRAINT chk_output_format
        CHECK (output_format IN ('mp3', 'ogg_vorbis', 'pcm'))
);
```

---

### Speech History

**Description:** Lưu lịch sử chuyển đổi từ giọng nói sang văn bản (Speech-to-Text).

| Field            | Data Type    | Constraints                      | Description                                  |
| ---------------- | ------------ | -------------------------------- | -------------------------------------------- |
| `id`             | BIGINT       | **PK**, AUTO_INCREMENT, NOT NULL | Mã lịch sử                                   |
| `user_id`        | BIGINT       | **FK → User(id)**, NOT NULL      | Người thực hiện                              |
| `audio_file_url` | VARCHAR(512) | NOT NULL                         | Đường dẫn file âm thanh trên Amazon S3       |
| `result_text`    | TEXT         | NOT NULL                         | Văn bản nhận dạng được                       |
| `text_file_url`  | VARCHAR(512) | NULL                             | Đường dẫn file kết quả (.txt) trên Amazon S3 |
| `created_at`     | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP        | Thời điểm tạo                                |

#### Constraints

* **Primary Key:** `id`
* **Foreign Key:** `user_id` → `users(id)`
* **Storage:** Chỉ lưu URL hoặc S3 Key của file âm thanh và file kết quả trên Amazon S3.
* **Timestamp:** `created_at` được tự động gán thời gian khi tạo lịch sử.

#### SQL Schema

```sql
CREATE TABLE speech_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    audio_file_url VARCHAR(512) NOT NULL,
    result_text TEXT NOT NULL,
    text_file_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_speech_history_user
        FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### File

**Description:** Lưu metadata của các file được lưu trên Amazon S3.

| Field               | Data Type    | Constraints                      | Description                        |
| ------------------- | ------------ | -------------------------------- | ---------------------------------- |
| `id`                | BIGINT       | **PK**, AUTO_INCREMENT, NOT NULL | Mã file                            |
| `user_id`           | BIGINT       | **FK → User(id)**, NOT NULL      | Chủ sở hữu                         |
| `text_history_id`   | BIGINT       | **FK → TextHistory(id)**, NULL   | Phiên Text-to-Speech liên quan     |
| `speech_history_id` | BIGINT       | **FK → SpeechHistory(id)**, NULL | Phiên Speech-to-Text liên quan     |
| `file_name`         | VARCHAR(255) | NOT NULL                         | Tên file                           |
| `file_type`         | VARCHAR(50)  | NOT NULL                         | Định dạng file (mp3, wav, txt,...) |
| `s3_key`            | VARCHAR(512) | NOT NULL                         | S3 Key hoặc URL của file           |
| `created_at`        | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP        | Thời điểm tải lên                  |

#### Constraints

* **Primary Key:** `id`
* **Foreign Key:** `user_id` → `users(id)`
* **Foreign Key:** `text_history_id` → `text_history(id)`
* **Foreign Key:** `speech_history_id` → `speech_history(id)`
* **Storage:** Chỉ lưu metadata và S3 Key/URL, nội dung file được lưu trên Amazon S3.
* **Timestamp:** `created_at` được tự động gán thời gian khi tải file lên.

#### SQL Schema

```sql
CREATE TABLE files (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    text_history_id BIGINT NULL,
    speech_history_id BIGINT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_file_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    CONSTRAINT fk_file_text_history
        FOREIGN KEY (text_history_id) REFERENCES text_history(id),

    CONSTRAINT fk_file_speech_history
        FOREIGN KEY (speech_history_id) REFERENCES speech_history(id)
);
```

## 7. Backend

### Authentication

**Description:** Cung cấp các API xác thực và quản lý tài khoản người dùng.

| Method | Endpoint         | Description                       |
| :----: | ---------------- | --------------------------------- |
| `POST` | `/auth/register` | Đăng ký tài khoản mới             |
| `POST` | `/auth/login`    | Đăng nhập                         |
| `POST` | `/auth/logout`   | Đăng xuất                         |
|  `GET` | `/auth/profile`  | Lấy thông tin người dùng hiện tại |

---

### Text-to-Speech (TTS)

**Description:** Chuyển đổi văn bản thành giọng nói và quản lý lịch sử chuyển đổi.

|  Method  | Endpoint       | Description                            |
| :------: | -------------- | -------------------------------------- |
|  `POST`  | `/tts`         | Chuyển văn bản thành giọng nói         |
|  `POST`  | `/tts/preview` | Nghe thử giọng đọc (không lưu lịch sử) |
|   `GET`  | `/tts/history` | Lấy danh sách lịch sử Text-to-Speech   |
|   `GET`  | `/tts/{id}`    | Lấy chi tiết một lần chuyển đổi        |
| `DELETE` | `/tts/{id}`    | Xóa một lịch sử chuyển đổi             |

---

### Speech-to-Text (STT)

**Description:** Chuyển đổi giọng nói thành văn bản và quản lý lịch sử chuyển đổi.

|  Method  | Endpoint       | Description                          |
| :------: | -------------- | ------------------------------------ |
|  `POST`  | `/stt`         | Chuyển file âm thanh thành văn bản   |
|   `GET`  | `/stt/history` | Lấy danh sách lịch sử Speech-to-Text |
|   `GET`  | `/stt/{id}`    | Lấy chi tiết một lần chuyển đổi      |
| `DELETE` | `/stt/{id}`    | Xóa một lịch sử chuyển đổi           |

---

### File

**Description:** Quản lý các tệp được lưu trên Amazon S3.

|  Method  | Endpoint               | Description                         |
| :------: | ---------------------- | ----------------------------------- |
|  `POST`  | `/files/upload`        | Tải file lên Amazon S3              |
|   `GET`  | `/files/{id}`          | Lấy thông tin file                  |
|   `GET`  | `/files/{id}/download` | Tải file từ Amazon S3               |
| `DELETE` | `/files/{id}`          | Xóa file khỏi hệ thống và Amazon S3 |

---

### API Summary

| Module         | Number of APIs |
| -------------- | :------------: |
| Authentication |        4       |
| Text-to-Speech |        5       |
| Speech-to-Text |        4       |
| File           |        4       |
| **Total**      |   **17 APIs**  |

## 8. References

### AWS Polly

Các tài liệu chính thức được sử dụng để tìm hiểu và phát triển chức năng **Text-to-Speech**.

| Resource                        | Description                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS Polly Overview**          | Giới thiệu tổng quan về Amazon Polly và các tính năng hỗ trợ. <br> https://aws.amazon.com/polly                                                                            |
| **Developer Guide**             | Hướng dẫn sử dụng Amazon Polly, cấu hình, Voice Engine và các thẻ SSML được hỗ trợ. <br> https://docs.aws.amazon.com/pdfs/polly/latest/dg/polly-dg.pdf                     |
| **API Reference**               | Tài liệu mô tả các API của Amazon Polly. <br> https://docs.aws.amazon.com/polly/latest/APIReference/API_Operations.html                                                    |
| **SSML Documentation**          | Hướng dẫn sử dụng Speech Synthesis Markup Language (SSML) để điều chỉnh giọng đọc, tốc độ, cao độ và ngắt nghỉ. <br> https://docs.aws.amazon.com/polly/latest/dg/ssml.html |
| **AWS SDK for JavaScript (v3)** | Hướng dẫn tích hợp Amazon Polly bằng AWS SDK for JavaScript. <br> https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide                                        |
| **AWS SDK for Python (Boto3)**  | Hướng dẫn sử dụng Amazon Polly với Python (Boto3). <br> https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/polly.html                              |

---

### Development Workflow

1. Đọc **AWS Polly Overview** để hiểu các tính năng và giới hạn của dịch vụ.
2. Tham khảo **Developer Guide** để cấu hình Polly và lựa chọn Voice Engine.
3. Sử dụng **API Reference** khi xây dựng Backend.
4. Áp dụng **SSML** để tùy chỉnh tốc độ, cao độ và ngữ điệu của giọng đọc.
5. Tích hợp Amazon Polly thông qua **AWS SDK** (JavaScript hoặc Python).

---

### Related AWS Services

* **Amazon Polly** – Chuyển đổi văn bản thành giọng nói (Text-to-Speech).
* **Amazon S3** – Lưu trữ file văn bản và file âm thanh.
* **AWS IAM** – Quản lý quyền truy cập vào các dịch vụ AWS.
