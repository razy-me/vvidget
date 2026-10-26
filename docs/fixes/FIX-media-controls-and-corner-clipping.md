# Fix: Media Controls unten abgeschnitten & Ecken-Clipping bei unteren Buttons

- **Status**: IN_PROGRESS
- **Mode**: r-fix-this
- **Symptome & Ursachen**:
  1. **Media Control Widget unten abgeschnitten**:
     - Das Spotify / Media Controls Widget hat im aktiven Zustand (Track Info + TrackProgress + Controls + Master Volume Slider) eine vertikale Gesamthöhe von ca. 240-250px.
     - Im `WidgetContainer` wurde `p-3` (12px oben + 12px unten) verwendet, und das äußere Fenster hat in `WIDGET_REGISTRY` und `lib.rs` nur eine Höhe von `240px` (bzw. abzüglich des Desktop-Paddings `p-2` im Fenster-Wrapper nur 224px nutzbare Höhe). Dadurch wurde der Lautstärkeregler unten zur Hälfte abgeschnitten!
     - In `SpotifyWidget`: Durch kompaktere Abstände (`gap-1.5` statt `gap-2.5`, `py-1` statt `py-2`, kleineres Albumcover `w-12 h-12` statt `w-14 h-14` oder optimierte Margin `mb-1.5`) passt der gesamte Inhalt inklusive Lautstärke-Slider perfekt und luftig in die 240px Kartenhöhe.
  2. **Buttons unten links und rechts durch Abrundung abgeschnitten**:
     - Betrifft Buttons in `BluetoothWidget` ("Windows Bluetooth-Einstellungen öffnen"), `SpeedtestWidget` ("Test starten" / "Verlauf"), und `BatteryWidget` ("Energieeinstellungen").
     - Der `WidgetContainer` hat `rounded-2xl` mit `overflow-hidden`.
     - Wenn untere Buttons mit `w-full` oder ohne ausreichendes Bottom/Horizontal-Padding platziert sind, schneidet der 16px Radius (`rounded-2xl`) die Ecken der Buttons ab!
     - Durch ein dezentes horizontales Padding (`px-1` oder `px-1.5`) bzw. `pb-1` / `mb-1` und leicht angepasste Corner-Radien der Buttons sitzen die Buttons sauber innerhalb der Wölbung der Karte und berühren oder überschneiden die runde Ecke nicht mehr.

- **Success Criterion**:
  - `SpotifyWidget`: Der Volume-Slider und alle Controls sind zu 100% vollständig sichtbar ohne Scrollen oder vertikales Clipping.
  - Buttons unten in allen Widgets (`BluetoothWidget`, `SpeedtestWidget`, `BatteryWidget`) haben ausreichenden Sicherheitsabstand zur `rounded-2xl` Wölbung und werden an den Ecken nicht mehr abgeschnitten.
