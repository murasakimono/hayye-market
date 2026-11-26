use crate::bridge::BRIDGE_PORT;
use crate::models::{AlertSettings, TunnelStatus};
use regex::Regex;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct TunnelRuntime {
    child: Option<Child>,
    state: String,
    mode: String,
    public_url: String,
    stable_url: String,
    published: bool,
    error: String,
}

fn tunnel_state() -> &'static Mutex<TunnelRuntime> {
    static TUNNEL: OnceLock<Mutex<TunnelRuntime>> = OnceLock::new();
    TUNNEL.get_or_init(|| {
        Mutex::new(TunnelRuntime {
            child: None,
            state: "off".to_string(),
            mode: "none".to_string(),
            public_url: String::new(),
            stable_url: String::new(),
            published: false,
            error: String::new(),
        })
    })
}

pub fn find_cloudflared_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(&local).join("Kami").join("data").join("tools").join("cloudflared.exe"));
        candidates.push(PathBuf::from(&local).join("HayyeMarket").join("tools").join("cloudflared.exe"));
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        candidates.push(PathBuf::from(&home).join("Projeler").join("kami").join("data").join("tools").join("cloudflared.exe"));
    }
    for p in candidates {
        if p.exists() && std::fs::metadata(&p).map(|m| m.len() > 1_000_000).unwrap_or(false) {
            return Some(p);
        }
    }
    if let Ok(out) = Command::new("where").arg("cloudflared").output() {
        if out.status.success() {
            if let Some(first) = String::from_utf8_lossy(&out.stdout).lines().next() {
                let p = PathBuf::from(first.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    None
}

pub fn get_status() -> TunnelStatus {
    let exe = find_cloudflared_exe();
    let mut rt = tunnel_state().lock().unwrap();
    if let Some(ref mut ch) = rt.child {
        if let Ok(Some(_)) = ch.try_wait() {
            rt.child = None;
            if rt.state == "on" || rt.state == "starting" {
                rt.state = "off".to_string();
            }
        }
    }
    let active_url = if !rt.stable_url.is_empty() && (rt.mode == "named" || rt.published) {
        ensure_app_suffix(&rt.stable_url)
    } else if !rt.public_url.is_empty() {
        ensure_app_suffix(&rt.public_url)
    } else {
        String::new()
    };
    TunnelStatus {
        state: rt.state.clone(),
        mode: rt.mode.clone(),
        active_url,
        public_url: rt.public_url.clone(),
        stable_url: rt.stable_url.clone(),
        published: rt.published,
        error: rt.error.clone(),
        cloudflared_path: exe.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
    }
}

fn ensure_app_suffix(url: &str) -> String {
    let clean = url.trim().trim_end_matches('/');
    if clean.is_empty() {
        return String::new();
    }
    if clean.ends_with("/app") {
        clean.to_string()
    } else {
        format!("{}/app", clean)
    }
}

pub fn stop_tunnel() {
    let mut rt = tunnel_state().lock().unwrap();
    if let Some(mut ch) = rt.child.take() {
        let _ = ch.kill();
        let _ = ch.wait();
    }
    rt.state = "off".to_string();
    rt.mode = "none".to_string();
    rt.public_url.clear();
    rt.published = false;
    rt.error.clear();
}

pub fn start_tunnel(settings: AlertSettings) -> Result<TunnelStatus, String> {
    let exe = find_cloudflared_exe()
        .ok_or_else(|| "cloudflared.exe bulunamadı (Kami araçları veya PATH kontrol edildi).".to_string())?;

    stop_tunnel();

    let token = settings.cloudflare_tunnel_token.trim().to_string();
    let stable = settings.cloudflare_tunnel_url.trim().trim_end_matches('/').to_string();
    let worker_key = settings.cloudflare_worker_key.trim().to_string();

    if !token.is_empty() {
        let mut cmd = Command::new(&exe);
        cmd.args(["tunnel", "--no-autoupdate", "run", "--token", &token])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let child = cmd.spawn().map_err(|e| format!("cloudflared başlatılamadı: {}", e))?;
        let mut rt = tunnel_state().lock().unwrap();
        rt.child = Some(child);
        rt.state = "on".to_string();
        rt.mode = "named".to_string();
        rt.stable_url = stable;
        rt.public_url.clear();
        rt.published = true;
        rt.error.clear();
        drop(rt);
        return Ok(get_status());
    }

    // Quick Tunnel (+ optional permanent Cloudflare Worker auto-publish)
    let mut cmd = Command::new(&exe);
    cmd.args([
        "tunnel",
        "--no-autoupdate",
        "--url",
        &format!("http://127.0.0.1:{}", BRIDGE_PORT),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("cloudflared başlatılamadı: {}", e))?;
    let stderr = child.stderr.take();
    let stdout = child.stdout.take();

    {
        let mut rt = tunnel_state().lock().unwrap();
        rt.child = Some(child);
        rt.state = "starting".to_string();
        rt.mode = if !stable.is_empty() && !worker_key.is_empty() {
            "worker".to_string()
        } else {
            "quick".to_string()
        };
        rt.stable_url = stable.clone();
        rt.public_url.clear();
        rt.published = false;
        rt.error.clear();
    }

    let stable_for_thread = stable.clone();
    let key_for_thread = worker_key.clone();

    if let Some(err_stream) = stderr {
        std::thread::spawn(move || {
            let re = Regex::new(r"https://[a-z0-9-]+\.trycloudflare\.com").unwrap();
            let reader = BufReader::new(err_stream);
            let mut found = false;
            for line in reader.lines().flatten() {
                if !found {
                    if let Some(m) = re.find(&line) {
                        let url = m.as_str().to_string();
                        found = true;
                        {
                            let mut rt = tunnel_state().lock().unwrap();
                            rt.public_url = url.clone();
                            rt.state = "on".to_string();
                        }
                        if !stable_for_thread.is_empty() && !key_for_thread.is_empty() {
                            let s_base = stable_for_thread.clone();
                            let s_key = key_for_thread.clone();
                            let target = url.clone();
                            tauri::async_runtime::spawn(async move {
                                publish_to_worker(&s_base, &s_key, &target).await;
                            });
                        }
                    }
                }
            }
        });
    }
    if let Some(out_stream) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(out_stream);
            for _ in reader.lines() {}
        });
    }

    Ok(get_status())
}

async fn publish_to_worker(base: &str, key: &str, target: &str) {
    let endpoint = format!("{}/_hayye/set", base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();
    for _ in 0..5 {
        let res = client
            .post(&endpoint)
            .header("x-hayye-key", key)
            .json(&serde_json::json!({ "target": target }))
            .send()
            .await;
        if let Ok(r) = res {
            if r.status().is_success() {
                let mut rt = tunnel_state().lock().unwrap();
                rt.published = true;
                rt.error.clear();
                return;
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
    let mut rt = tunnel_state().lock().unwrap();
    rt.error = "Sabit Cloudflare Worker güncellenemedi (geçici trycloudflare linki aktif).".to_string();
}

pub fn auto_start_if_configured() {
    if let Ok(conn) = crate::db::open_db() {
        let settings = crate::db::load_settings(&conn);
        let has_token = !settings.cloudflare_tunnel_token.trim().is_empty();
        let has_worker = !settings.cloudflare_tunnel_url.trim().is_empty()
            && !settings.cloudflare_worker_key.trim().is_empty();
        if has_token || has_worker {
            let _ = start_tunnel(settings);
        }
    }
}
