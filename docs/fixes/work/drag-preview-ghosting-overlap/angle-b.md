# Angle B: Environment, Seed State & DPI Scaling

## Core Finding
1. `C:\Users\Razy\AppData\Roaming\Widgetz\config.json` was committed with overlapping coordinates:
   - Spotify: `logical_x`: 480.0, `logical_y`: 256.0, `logical_height`: 256.0 (spans 256..512).
   - Resources: `logical_x`: 480.0, `logical_y`: 384.0, `logical_height`: 384.0 (spans 384..768).
   - The user started the app with widgets already inside each other!
2. Windows scale factor is 200% (2.0):
   - Physical resolution: 2880 x 1800.
   - Logical resolution: 1440 x 900.
   - Left third corresponds to x = 0 to 480.
   - Grid pitch: 120.0 logical x 128.0 logical (240 physical x 256 physical).

## Fix
Update default / current config coordinates to cleanly non-overlapping slots:
- Spotify: (120, 128, 360, 256) - Left third
- Resources: (480, 128, 360, 384) - Middle third
- Weather: (840, 128, 360, 512) - Right third
Ensure bounds clamping uses logical pixels everywhere.
