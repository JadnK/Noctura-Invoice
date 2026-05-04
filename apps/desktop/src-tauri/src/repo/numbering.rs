//! Nummernvergabe. Laeuft immer innerhalb der Transaktion des Aufrufers,
//! damit eine Nummer nicht vergeben wird, wenn das Speichern scheitert.

use crate::error::AppError;
use chrono::Datelike;
use sqlx::{Sqlite, Transaction};

pub async fn next_number(
    tx: &mut Transaction<'_, Sqlite>,
    doc_type: &str,
    customer_number: Option<&str>,
) -> Result<String, AppError> {
    let row: (String, i64, i64, String, Option<String>) = sqlx::query_as(
        "SELECT pattern, next_counter, padding, reset_mode, last_reset_period
         FROM number_sequence WHERE doc_type = ?1",
    )
    .bind(doc_type)
    .fetch_one(&mut **tx)
    .await?;

    let (pattern, next_counter, padding, reset_mode, last_period) = row;
    let today = chrono::Utc::now();
    let period = match reset_mode.as_str() {
        "yearly" => Some(format!("{:04}", today.year())),
        "monthly" => Some(format!("{:04}-{:02}", today.year(), today.month())),
        _ => None,
    };
    let resets = period.is_some() && period != last_period;
    let counter = if resets { 1 } else { next_counter };

    let number = pattern
        .replace("{YYYY}", &format!("{:04}", today.year()))
        .replace("{YY}", &format!("{:02}", today.year() % 100))
        .replace("{MM}", &format!("{:02}", today.month()))
        .replace("{DD}", &format!("{:02}", today.day()))
        .replace("{COUNTER}", &format!("{:0width$}", counter, width = padding as usize))
        .replace("{CUSTOMER}", customer_number.unwrap_or(""))
        .replace("{TYPE}", short_type(doc_type));

    sqlx::query(
        "UPDATE number_sequence SET next_counter = ?2, last_reset_period = ?3 WHERE doc_type = ?1",
    )
    .bind(doc_type)
    .bind(counter + 1)
    .bind(&period)
    .execute(&mut **tx)
    .await?;

    Ok(number)
}

fn short_type(doc_type: &str) -> &'static str {
    match doc_type {
        "invoice" => "RE",
        "quote" => "ANG",
        "credit_note" => "GS",
        "cancellation" => "ST",
        "customer" => "KD",
        _ => "PR",
    }
}
