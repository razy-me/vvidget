use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
pub struct AlbumArtData {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

static ALBUM_ART_CACHE: OnceLock<Mutex<HashMap<String, AlbumArtData>>> = OnceLock::new();

fn get_cache() -> &'static Mutex<HashMap<String, AlbumArtData>> {
    ALBUM_ART_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn set_cached_album_art(track_id: &str, bytes: Vec<u8>, mime_type: String) {
    if let Ok(mut cache) = get_cache().lock() {
        if cache.len() > 30 {
            cache.clear();
        }
        cache.insert(track_id.to_string(), AlbumArtData { bytes, mime_type });
    }
}

pub fn get_cached_album_art(track_id: &str) -> Option<AlbumArtData> {
    if let Ok(cache) = get_cache().lock() {
        cache.get(track_id).cloned()
    } else {
        None
    }
}

pub fn clear_cached_album_art() {
    if let Ok(mut cache) = get_cache().lock() {
        cache.clear();
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
                .body(std::borrow::Cow::Owned(art.bytes))
                .unwrap_or_else(|_| {
                    Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(std::borrow::Cow::Borrowed(EMPTY))
                        .unwrap()
                });
        }
    }

    // 404 Not Found if no art or invalid track id
    Response::builder()
        .status(StatusCode::NOT_FOUND)
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
}
