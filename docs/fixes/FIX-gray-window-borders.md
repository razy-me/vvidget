# Fix: Graue Ränder um Widgets (DWM System Backdrop Fallback-Rahmen)

- **Status**: IN_PROGRESS
- **Mode**: r-fix-this
- **Symptom**:
  - **Actual**: Um die abgerundeten Widgets herum ist ein eckiger, grauer/dunkler Rand bzw. Kasten sichtbar.
  - **Expected**: Die Widgets haben saubere, transparente, abgerundete Ecken ohne eckigen grauen Hintergrundkasten.
  - **Root Cause**: In WP-01 wurde `DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW (3)` und `DWMWA_WINDOW_CORNER_PREFERENCE` in `win32.rs` hinzugefügt. Auf HWND-Ebene bei `WS_EX_TOOLWINDOW` und `WS_EX_NOACTIVATE` füllt der DWM Backdrop-Typ das gesamte rechteckige HWND-Fenster mit einer undurchsichtigen grauen Tint-Fläche. WebView2 DirectComposition benötigt jedoch ein rein transparentes Fenster (`apply_acrylic_effect` als no-op), damit das CSS-Rendering mit transparentem Alpha-Kanal direkt auf den Desktop composited wird.
- **Success Criterion**:
  - Entfernung von `DWMWA_SYSTEMBACKDROP_TYPE` und `DWMWA_WINDOW_CORNER_PREFERENCE` in `apply_acrylic_effect`.
  - Saubere transparente Fenstergrenzen ohne grauen Kasten um die abgerundeten `rounded-2xl` Cards.
