use crate::models::AlertSettings;

pub async fn dispatch_alert(settings: &AlertSettings, title: &str, body: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut sent_channels = Vec::new();

    if !settings.discord_webhook.trim().is_empty() {
        let payload = serde_json::json!({
            "username": "Hayye Market",
            "embeds": [{
                "title": title,
                "description": body,
                "color": 1096065
            }]
        });
        if let Ok(resp) = client.post(settings.discord_webhook.trim()).json(&payload).send().await {
            if resp.status().is_success() {
                sent_channels.push("Discord");
            }
        }
    }

    if !settings.telegram_bot_token.trim().is_empty() && !settings.telegram_chat_id.trim().is_empty() {
        let url = format!(
            "https://api.telegram.org/bot{}/sendMessage",
            settings.telegram_bot_token.trim()
        );
        let payload = serde_json::json!({
            "chat_id": settings.telegram_chat_id.trim(),
            "text": format!("🔔 {}\n\n{}", title, body)
        });
        if let Ok(resp) = client.post(&url).json(&payload).send().await {
            if resp.status().is_success() {
                sent_channels.push("Telegram");
            }
        }
    }

    if !settings.ntfy_topic.trim().is_empty() {
        let topic = settings.ntfy_topic.trim().trim_start_matches("https://ntfy.sh/");
        let url = format!("https://ntfy.sh/{}", topic);
        if let Ok(resp) = client
            .post(&url)
            .header("Title", title)
            .body(body.to_string())
            .send()
            .await
        {
            if resp.status().is_success() {
                sent_channels.push("ntfy");
            }
        }
    }

    if sent_channels.is_empty() {
        Err("Aktif bildirim kanalı ayarlanmadı (Discord, Telegram veya ntfy gir).".to_string())
    } else {
        Ok(format!("Bildirim gönderildi: {}", sent_channels.join(", ")))
    }
}
