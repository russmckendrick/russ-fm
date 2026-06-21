//! Small shared helpers.

use chrono::Local;

/// Timestamp in the `YYYYMMDD_HHMMSS` form used for backup filenames (matches the Python tools).
pub fn timestamp() -> String {
    Local::now().format("%Y%m%d_%H%M%S").to_string()
}

/// Current local time as an ISO-8601 / RFC3339-ish string (matches Python `datetime.now().isoformat()`).
pub fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S%.6f").to_string()
}
