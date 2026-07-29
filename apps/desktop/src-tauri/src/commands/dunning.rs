//! Automatisches Mahnwesen.
//!
//! Nutzt zwei bereits vorhandene, bisher ungenutzte Tabellen:
//! `dunning_level` (Eskalationsstufen mit Frist/Gebuehr/Zinssatz, mit vier
//! Standardstufen vorbelegt) und `dunning_history` (bereits verschickte
//! Mahnungen je Rechnung, damit keine Stufe doppelt verschickt wird).
//!
//! Manuell ausloesbar (kein Hintergrund-Zeitplaner), im selben Muster wie
//! das bestehende Ausgangspostfach (`process_outbox_now`).

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::{NaiveDate, Utc};
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DunningRunResult {
    pub reminders_sent: i64,
    pub skipped: i64,
}

struct Level {
    step: i64,
    name: String,
    days_after_due: i64,
    fee_cents: i64,
    interest_rate_bp: i64,
}

/// Die hoechste konfigurierte Stufe, deren Frist bereits erreicht ist, aber
/// die fuer diese Rechnung noch nicht verschickt wurde. Ueberspringt Stufen,
/// wenn seit dem letzten Lauf mehrere Fristen auf einmal erreicht wurden,
/// statt sie alle nachtraeglich einzeln zu verschicken.
fn next_due_level<'a>(levels: &'a [Level], days_overdue: i64, already_sent_steps: &[i64]) -> Option<&'a Level> {
    levels
        .iter()
        .filter(|level| level.days_after_due <= days_overdue && !already_sent_steps.contains(&level.step))
        .max_by_key(|level| level.step)
}

#[tauri::command]
pub async fn run_dunning() -> Result<DunningRunResult, ErrorPayloadWrapper> {
    let levels: Vec<Level> = sqlx::query(
        "SELECT step, name, days_after_due, fee_cents, interest_rate_bp FROM dunning_level ORDER BY step",
    )
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?
    .into_iter()
    .map(|row| Level {
        step: row.get("step"),
        name: row.get("name"),
        days_after_due: row.get("days_after_due"),
        fee_cents: row.get("fee_cents"),
        interest_rate_bp: row.get("interest_rate_bp"),
    })
    .collect();
    if levels.is_empty() {
        return Ok(DunningRunResult { reminders_sent: 0, skipped: 0 });
    }

    let rows = sqlx::query(
        "SELECT i.id, i.number, i.due_date, i.gross_total_cents, i.paid_cents, c.email AS customer_email
         FROM invoice i JOIN customer c ON c.id = i.customer_id
         WHERE i.status IN ('sent','delivered','partially_paid','overdue') AND i.deleted_at IS NULL
           AND i.gross_total_cents > i.paid_cents AND date(i.due_date) < date('now')",
    )
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?;

    let today = Utc::now().date_naive();
    let mut reminders_sent = 0i64;
    let mut skipped = 0i64;

    for row in rows {
        let invoice_id: String = row.get("id");
        let number: String = row.get("number");
        let due_date: String = row.get("due_date");
        let outstanding = row.get::<i64, _>("gross_total_cents") - row.get::<i64, _>("paid_cents");
        let customer_email: Option<String> = row.get("customer_email");

        let Ok(due) = NaiveDate::parse_from_str(&due_date, "%Y-%m-%d") else {
            skipped += 1;
            continue;
        };
        let days_overdue = (today - due).num_days();

        let already_sent: Vec<i64> = sqlx::query_scalar("SELECT step FROM dunning_history WHERE invoice_id=?1")
            .bind(&invoice_id)
            .fetch_all(db::pool())
            .await
            .map_err(AppError::from)?;

        let Some(level) = next_due_level(&levels, days_overdue, &already_sent) else {
            skipped += 1;
            continue;
        };

        // Einfache Zinsformel: Zinssatz p.a. anteilig auf die ueberfaelligen Tage.
        let interest_cents =
            (outstanding as i128 * level.interest_rate_bp as i128 * days_overdue as i128 / 10_000 / 365) as i64;
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO dunning_history (id, invoice_id, step, sent_at, fee_cents, interest_cents)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )
        .bind(uuid::Uuid::now_v7().to_string())
        .bind(&invoice_id)
        .bind(level.step)
        .bind(&now)
        .bind(level.fee_cents)
        .bind(interest_cents)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;

        sqlx::query(
            "UPDATE invoice SET status='overdue', updated_at=?2
             WHERE id=?1 AND status NOT IN ('paid','cancelled','uncollectible','archived')",
        )
        .bind(&invoice_id)
        .bind(&now)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;

        if let Some(email) = customer_email.filter(|value| !value.trim().is_empty()) {
            let total_due = outstanding + level.fee_cents + interest_cents;
            let mut body = format!(
                "Guten Tag,\n\nfür Rechnung {number} (fällig am {due_date}) steht noch ein Betrag von {} offen.\n",
                money_de(outstanding),
            );
            if level.fee_cents > 0 {
                body.push_str(&format!(
                    "Für diese {} berechnen wir zusätzlich eine Mahngebühr von {}.\n",
                    level.name,
                    money_de(level.fee_cents)
                ));
            }
            if interest_cents > 0 {
                body.push_str(&format!("Zusätzlich berechnen wir Verzugszinsen von {}.\n", money_de(interest_cents)));
            }
            body.push_str(&format!(
                "\nGesamt fällig: {}.\n\nBitte gleichen Sie den Betrag zeitnah aus. Falls die Zahlung bereits erfolgt ist, betrachten Sie dieses Schreiben als gegenstandslos.\n\nMit freundlichen Grüßen",
                money_de(total_due)
            ));
            let subject = format!("{}: Rechnung {number}", level.name);
            if let Err(error) = crate::commands::outbox::queue_dunning_email(&invoice_id, &email, &subject, &body).await {
                tracing::warn!(?error, "Mahnung konnte nicht eingereiht werden");
            }
        }

        reminders_sent += 1;
    }

    Ok(DunningRunResult { reminders_sent, skipped })
}

fn money_de(cents: i64) -> String {
    format!("{:.2} €", cents as f64 / 100.0).replace('.', ",")
}
