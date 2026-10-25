use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
pub struct AlbumArtData {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

#[derive(Default)]
struct CacheState {
    entries: HashMap<String, AlbumArtData>,
    order: Vec<String>,
}

static ALBUM_ART_CACHE: OnceLock<Mutex<CacheState>> = OnceLock::new();

fn get_cache() -> &'static Mutex<CacheState> {
    ALBUM_ART_CACHE.get_or_init(|| Mutex::new(CacheState::default()))
}

pub fn set_cached_album_art(track_id: &str, bytes: Vec<u8>, mime_type: String) {
    if let Ok(mut cache) = get_cache().lock() {
        if !cache.entries.contains_key(track_id) {
            // Evict oldest entry if at capacity (max 30 items)
            if cache.entries.len() >= 30 && !cache.order.is_empty() {
                let oldest_id = cache.order.remove(0);
                cache.entries.remove(&oldest_id);
            }
            cache.order.push(track_id.to_string());
        }
        cache.entries.insert(track_id.to_string(), AlbumArtData { bytes, mime_type });
    }
}

pub fn get_cached_album_art(track_id: &str) -> Option<AlbumArtData> {
    if let Ok(cache) = get_cache().lock() {
        cache.entries.get(track_id).cloned()
    } else {
        None
    }
}

pub fn clear_cached_album_art() {
    if let Ok(mut cache) = get_cache().lock() {
        cache.entries.clear();
        cache.order.clear();
    }
}

/// Helper extracting track_id from a URI query parameter (?t=<id> or ?id=<id>).
pub fn extract_track_id_from_query(query: &str) -> Option<&str> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            if (k == "t" || k == "id") && !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

/// Handler for the `widgetz` URI protocol: `widgetz://album-art?t=<track_id>`
pub fn handle_album_art_protocol<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    use tauri::http::{header, Response, StatusCode};

    let uri = request.uri();
    let query = uri.query().unwrap_or_default();
    let track_id = extract_track_id_from_query(query);

    static EMPTY: &[u8] = &[];

    if let Some(id) = track_id {
        if let Some(art) = get_cached_album_art(id) {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, art.mime_type)
                .header(header::CACHE_CONTROL, "public, max-age=3600")
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(std::borrow::Cow::Owned(art.bytes))
                .unwrap_or_else(|_| {
                    Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                        .body(std::borrow::Cow::Borrowed(EMPTY))
                        .unwrap()
                });
        }
    }

    // 404 Not Found if no art or invalid track id
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(std::borrow::Cow::Borrowed(EMPTY))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_album_art_cache() {
        clear_cached_album_art();
        assert!(get_cached_album_art("test-id").is_none());

        set_cached_album_art("test-id", vec![1, 2, 3, 4], "image/jpeg".to_string());
        let cached = get_cached_album_art("test-id");
        assert!(cached.is_some());
        let data = cached.unwrap();
        assert_eq!(data.bytes, vec![1, 2, 3, 4]);
        assert_eq!(data.mime_type, "image/jpeg");

        clear_cached_album_art();
        assert!(get_cached_album_art("test-id").is_none());
    }

    #[test]
    fn test_album_art_cache_fifo_eviction() {
        clear_cached_album_art();
        for i in 0..35 {
            set_cached_album_art(&format!("id-{}", i), vec![i as u8], "image/jpeg".to_string());
        }

        // The first 5 should be evicted
        for i in 0..5 {
            assert!(get_cached_album_art(&format!("id-{}", i)).is_none());
        }
        // id-5 to id-34 should be present
        for i in 5..35 {
            assert!(get_cached_album_art(&format!("id-{}", i)).is_some());
        }
    }

    #[test]
    fn test_album_art_cache_overwrite_updates_data_without_duplicating_order() {
        clear_cached_album_art();
        set_cached_album_art("unique-id", vec![1, 1], "image/png".to_string());
        set_cached_album_art("unique-id", vec![2, 2, 2], "image/jpeg".to_string());

        let cached = get_cached_album_art("unique-id").expect("Entry should exist");
        assert_eq!(cached.bytes, vec![2, 2, 2]);
        assert_eq!(cached.mime_type, "image/jpeg");

        // Verify that 29 more items can be inserted without evicting unique-id
        for i in 0..29 {
            set_cached_album_art(&format!("fill-{}", i), vec![i as u8], "image/jpeg".to_string());
        }
        assert!(get_cached_album_art("unique-id").is_some());

        // The 31st item should now evict unique-id (as it was the oldest)
        set_cached_album_art("overflow-item", vec![99], "image/png".to_string());
        assert!(get_cached_album_art("unique-id").is_none());
        assert!(get_cached_album_art("overflow-item").is_some());
    }

    #[test]
    fn test_album_art_cache_concurrent_access() {
        clear_cached_album_art();
        let mut handles = Vec::new();

        for t in 0..8 {
            handles.push(std::thread::spawn(move || {
                for i in 0..20 {
                    let id = format!("thread-{}-id-{}", t, i);
                    set_cached_album_art(&id, vec![t, i as u8], "image/jpeg".to_string());
                    let _ = get_cached_album_art(&id);
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        // Cache must not have panicked or exceeded 30 items
        if let Ok(cache) = get_cache().lock() {
            assert!(cache.entries.len() <= 30);
            assert!(cache.order.len() <= 30);
        }
    }

    #[test]
    fn test_extract_track_id_from_query_variants() {
        assert_eq!(extract_track_id_from_query("t=track123"), Some("track123"));
        assert_eq!(extract_track_id_from_query("id=hash456"), Some("hash456"));
        assert_eq!(extract_track_id_from_query("param=1&t=my_track&foo=bar"), Some("my_track"));
        assert_eq!(extract_track_id_from_query("param=1&id=my_id&foo=bar"), Some("my_id"));
        assert_eq!(extract_track_id_from_query("t="), None); // Empty value
        assert_eq!(extract_track_id_from_query("id="), None);
        assert_eq!(extract_track_id_from_query(""), None);
        assert_eq!(extract_track_id_from_query("other=param"), None);
    }
}
