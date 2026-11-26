use std::sync::OnceLock;
use tokio::sync::broadcast;

static TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

pub fn sender() -> &'static broadcast::Sender<String> {
    TX.get_or_init(|| {
        let (tx, _) = broadcast::channel(64);
        tx
    })
}

pub fn subscribe() -> broadcast::Receiver<String> {
    sender().subscribe()
}

pub fn emit(event_name: &str) {
    let payload = serde_json::json!({
        "type": event_name,
        "ts": chrono::Utc::now().to_rfc3339()
    })
    .to_string();
    let _ = sender().send(payload);
}
