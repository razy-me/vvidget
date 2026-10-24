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

/// Handler for the `widgetz` URI protocol: `widgetz://album-art?t=<track_id>`
pub fn handle_album_art_protocol<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    use tauri::http::{header, Response, StatusCode};

    let uri = request.uri();
    let query = uri.query().unwrap_or_default();
    
    // Parse track_id from query (?t=<track_id> or ?id=<track_id>)
    let mut track_id = None;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            if k == "t" || k == "id" {
                track_id = Some(v);
                break;
            }
        }
    }

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
}
