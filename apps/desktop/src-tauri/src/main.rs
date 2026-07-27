// Kein Konsolenfenster unter Windows im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audit;
mod commands;
mod error;
mod mail;
mod money;
mod pdf;
mod repo;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "noctura=info,sqlx=warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                blake3::derive_key("noctura.stronghold.v1", password.as_bytes()).to_vec()
            })
            .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                commands::db::init(&handle)
                    .await
                    .expect("Datenbank konnte nicht geöffnet werden");
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoice::calculate_preview,
            commands::invoice::finalize_invoice,
            commands::invoice::cancel_invoice,
            commands::documents::list_invoices,
            commands::documents::get_invoice_draft,
            commands::documents::save_invoice_draft,
            commands::documents::delete_invoice_draft,
            commands::documents::register_invoice_payment,
            commands::documents::list_quotes,
            commands::documents::get_quote_draft,
            commands::documents::save_quote_draft,
            commands::documents::delete_quote_draft,
            commands::documents::finalize_quote,
            commands::documents::update_quote_status,
            commands::documents::convert_quote_to_invoice,
            commands::documents::list_credit_notes,
            commands::documents::create_credit_note_from_invoice,
            commands::documents::finalize_credit_note,
            commands::discounts::list_discounts,
            commands::discounts::save_discount,
            commands::discounts::set_discount_active,
            commands::discounts::delete_discount,
            commands::reports::report_data,
            commands::tax::list_expenses,
            commands::tax::save_expense,
            commands::tax::delete_expense,
            commands::tax::tax_year_summary,
            commands::tax::export_tax_package,
            commands::outbox::list_outbox,
            commands::outbox::retry_outbox_item,
            commands::outbox::cancel_outbox_item,
            commands::outbox::process_outbox_now,
            commands::outbox::queue_invoice_email,
            commands::pdf_export::generate_document_pdf,
            commands::search::global_search,
            commands::workspace_settings::get_business_settings,
            commands::workspace_settings::save_business_settings,
            commands::workspace_settings::onboarding_status,
            commands::workspace_settings::complete_onboarding,
            commands::workspace_settings::choose_company_logo,
            commands::workspace_settings::remove_company_logo,
            commands::workspace_settings::company_logo_data_url,
            commands::license::activate_license,
            commands::license::stored_license_key,
            commands::license::license_heartbeat,
            commands::license::license_status,
            commands::backup::create_backup,
            commands::backup::inspect_backup,
            commands::backup::restore_backup,
            commands::company::register_company_account,
            commands::company::login_company_account,
            commands::company::company_session_status,
            commands::company::logout_company_account,
            commands::company::list_company_users,
            commands::company::create_company_user,
            commands::customers::list_customers,
            commands::customers::get_customer,
            commands::customers::create_customer,
            commands::customers::update_customer,
            commands::customers::archive_customer,
            commands::dashboard::dashboard_data,
            commands::products::list_products,
            commands::products::get_product,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::archive_product,
            commands::products::list_units,
            commands::templates::list_templates,
            commands::templates::get_template,
            commands::templates::create_template,
            commands::templates::update_template,
            commands::templates::set_default_template,
            commands::templates::delete_template,
            commands::email_settings::get_email_settings,
            commands::email_settings::save_email_settings,
            commands::email_settings::test_email_connection,
        ])
        .run(tauri::generate_context!())
        .expect("Anwendung konnte nicht gestartet werden");
}
