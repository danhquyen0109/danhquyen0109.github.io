// =============================================================================
// CẤU HÌNH — sửa 2 giá trị đầu tiên sau khi tạo project Supabase
// =============================================================================
// Lấy ở: Supabase Dashboard > Project Settings > Data API
//   SUPABASE_URL       = "Project URL"
//   SUPABASE_ANON_KEY  = "anon public" key
//
// Hai giá trị này CÔNG KHAI, không phải bí mật — chúng được thiết kế để nhúng
// vào trình duyệt. Dữ liệu được bảo vệ bằng Row Level Security ở tầng database,
// không phải bằng việc giấu key. Tuyệt đối KHÔNG dán "service_role" key vào đây.
// =============================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://bqmnxeofluonytshegwy.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbW54ZW9mbHVvbnl0c2hlZ3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzEwOTEsImV4cCI6MjEwMTQwNzA5MX0.1O4GPCrUnjECqCktIGHiHKS8_EIdHy39oROvzNBHe90',

  // Tiền tố sinh subId tự động cho sản phẩm mới (dùng để quy đơn về đúng link).
  // Giữ ngắn — Shopee giới hạn độ dài subId.
  SUB_ID_PREFIX: 'dq',

  // Múi giờ dùng để nhóm số liệu theo ngày.
  TIMEZONE: 'Asia/Ho_Chi_Minh',

  // Các nền tảng theo dõi trạng thái đăng bài.
  PLATFORMS: [
    { key: 'tiktok',    label: 'TikTok'    },
    { key: 'facebook',  label: 'Facebook'  },
    { key: 'youtube',   label: 'YouTube'   },
    { key: 'instagram', label: 'Instagram' },
    { key: 'threads',   label: 'Threads'   },
  ],
};

export const isConfigured = () =>
  !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-ANON');
