#[cfg(windows)]
pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
    use windows::Devices::Geolocation::Geolocator;

    let geolocator = Geolocator::new().map_err(|e| format!("Failed to create Geolocator: {e}"))?;

    let async_op = geolocator
        .GetGeopositionAsync()
        .map_err(|e| format!("Failed to request geoposition async: {e}"))?;

    let geoposition = async_op
        .get()
        .map_err(|e| format!("Failed to acquire geoposition from Windows Location API: {e}"))?;

    let coordinate = geoposition
        .Coordinate()
        .map_err(|e| format!("Failed to extract Coordinate: {e}"))?;

    let point = coordinate
        .Point()
        .map_err(|e| format!("Failed to extract Geopoint: {e}"))?;

    let pos = point
        .Position()
        .map_err(|e| format!("Failed to extract BasicGeoposition: {e}"))?;

    Ok((pos.Latitude, pos.Longitude))
}

#[cfg(not(windows))]
pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
    Err("Windows Location API is not supported on this platform".to_string())
}
