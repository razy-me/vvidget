use std::collections::HashMap;
use tauri::Manager;
use crate::config::{CalendarNote, ConfigManager};

/// Pure helper to add or update a note in the events map.
pub fn add_note_to_map(
    events: &mut HashMap<String, Vec<CalendarNote>>,
    date: &str,
    note: CalendarNote,
) -> Result<(), String> {
    let date_trimmed = date.trim();
    if date_trimmed.is_empty() {
        return Err("Date cannot be empty".to_string());
    }
    if note.text.trim().is_empty() {
        return Err("Note text cannot be empty".to_string());
    }

    let notes = events.entry(date_trimmed.to_string()).or_default();
    if let Some(existing) = notes.iter_mut().find(|n| !n.id.is_empty() && n.id == note.id) {
        *existing = note;
    } else {
        let mut new_note = note;
        if new_note.id.trim().is_empty() {
            new_note.id = format!(
                "note_{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            );
        }
        notes.push(new_note);
    }
    Ok(())
}

/// Pure helper to remove a note by ID from the events map.
pub fn remove_note_from_map(
    events: &mut HashMap<String, Vec<CalendarNote>>,
    date: &str,
    note_id: &str,
) {
    if let Some(notes) = events.get_mut(date) {
        notes.retain(|n| n.id != note_id);
        if notes.is_empty() {
            events.remove(date);
        }
    }
}

/// Pure helper to toggle completion status of a note.
pub fn toggle_note_in_map(
    events: &mut HashMap<String, Vec<CalendarNote>>,
    date: &str,
    note_id: &str,
) {
    if let Some(notes) = events.get_mut(date) {
        if let Some(note) = notes.iter_mut().find(|n| n.id == note_id) {
            note.completed = Some(!note.completed.unwrap_or(false));
        }
    }
}

/// Retrieves all saved calendar notes grouped by ISO date string (YYYY-MM-DD).
#[tauri::command]
#[specta::specta]
pub async fn get_calendar_events<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<HashMap<String, Vec<CalendarNote>>, String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let config = cm.get_config().await;
        Ok(config.calendar_events)
    } else {
        Err("ConfigManager not available".to_string())
    }
}

/// Adds or updates a calendar note for the specified date string (YYYY-MM-DD).
#[tauri::command]
#[specta::specta]
pub async fn add_calendar_note<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    date: String,
    note: CalendarNote,
) -> Result<(), String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let snapshot = cm
            .update_config(|config| {
                add_note_to_map(&mut config.calendar_events, &date, note)?;
                Ok(config.clone())
            })
            .await?;

        use tauri::Emitter;
        let _ = app.emit("config-changed", &snapshot);
        Ok(())
    } else {
        Err("ConfigManager not available".to_string())
    }
}

/// Removes a calendar note by ID for the specified date string (YYYY-MM-DD).
#[tauri::command]
#[specta::specta]
pub async fn remove_calendar_note<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    date: String,
    note_id: String,
) -> Result<(), String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let snapshot = cm
            .update_config(|config| {
                remove_note_from_map(&mut config.calendar_events, &date, &note_id);
                Ok(config.clone())
            })
            .await?;

        use tauri::Emitter;
        let _ = app.emit("config-changed", &snapshot);
        Ok(())
    } else {
        Err("ConfigManager not available".to_string())
    }
}

/// Toggles the completion status of a calendar note.
#[tauri::command]
#[specta::specta]
pub async fn toggle_calendar_note<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    date: String,
    note_id: String,
) -> Result<(), String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let snapshot = cm
            .update_config(|config| {
                toggle_note_in_map(&mut config.calendar_events, &date, &note_id);
                Ok(config.clone())
            })
            .await?;

        use tauri::Emitter;
        let _ = app.emit("config-changed", &snapshot);
        Ok(())
    } else {
        Err("ConfigManager not available".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_remove_calendar_note() {
        let mut map = HashMap::new();
        let note = CalendarNote {
            id: "n1".to_string(),
            text: "Doctor appointment".to_string(),
            completed: Some(false),
        };

        add_note_to_map(&mut map, "2026-10-26", note).unwrap();
        assert_eq!(map.get("2026-10-26").unwrap().len(), 1);
        assert_eq!(map.get("2026-10-26").unwrap()[0].text, "Doctor appointment");

        // Toggle completion
        toggle_note_in_map(&mut map, "2026-10-26", "n1");
        assert_eq!(map.get("2026-10-26").unwrap()[0].completed, Some(true));

        // Remove note
        remove_note_from_map(&mut map, "2026-10-26", "n1");
        assert!(!map.contains_key("2026-10-26"));
    }

    #[test]
    fn test_validation_empty_note() {
        let mut map = HashMap::new();
        let note = CalendarNote {
            id: "n2".to_string(),
            text: "   ".to_string(),
            completed: Some(false),
        };

        let res = add_note_to_map(&mut map, "2026-10-26", note);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "Note text cannot be empty");

        let valid_note = CalendarNote {
            id: "n3".to_string(),
            text: "Valid text".to_string(),
            completed: Some(false),
        };
        let res_date = add_note_to_map(&mut map, "  ", valid_note);
        assert!(res_date.is_err());
        assert_eq!(res_date.unwrap_err(), "Date cannot be empty");
    }
}
