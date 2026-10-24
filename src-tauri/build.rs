fn main() {
    tauri_build::build();
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let resource_path = std::path::Path::new(&out_dir).join("libresource.a");
        if resource_path.exists() {
            println!("cargo:rustc-link-arg={}", resource_path.display());
        }
    }
}
