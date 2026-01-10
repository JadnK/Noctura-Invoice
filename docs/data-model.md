# Datenmodell

Zwei getrennte Datenbanken. Lokal SQLite (WAL, `foreign_keys=ON`), serverseitig
PostgreSQL 16. Keine gemeinsamen Tabellen, keine Replikation.

## Konventionen

- Primaerschluessel: `id TEXT` (UUIDv7, zeitlich sortierbar) lokal, `uuid` serverseitig.
- Zeitstempel: `created_at`, `updated_at` als UTC-ISO-8601-Text bzw. `timestamptz`.
- Geldbetraege: `INTEGER` in kleinster Waehrungseinheit (Cent). Nie REAL.
- Steuersaetze und Rabattprozente: `INTEGER` in Basispunkten (1900 = 19,00 %).
- Loeschstrategie: fachliche Daten `deleted_at` (Papierkorb, 30 Tage), finalisierte
  Belege gar nicht. `ON DELETE RESTRICT` ueberall, wo ein Beleg haengt.

## Lokale Kernentitaeten (Auszug, vollstaendig in `apps/desktop/migrations`)

    company_profile(id, legal_name, legal_form, owner_first, owner_last, vat_id,
                    tax_number, register_court, register_number, ceo, logo_path,
                    stamp_path, signature_path, accent_color, footer_text, ...)
    company_address(id, company_id -> company_profile, kind, street, house_no,
                    addition, postal_code, city, state, country)
    bank_account(id, company_id, holder, bank_name, iban, bic, is_default)
    tax_setting(id, company_id, scheme, default_rate_bp, prices_include_tax,
                show_line_tax, show_tax_summary, small_business_note, ...)

    customer(id, number UNIQUE, type, company, salutation, title, first_name,
             last_name, email, phone, vat_id, tax_status, payment_terms_days,
             discount_bp, preferred_language, preferred_currency, archived_at,
             deleted_at, created_at, updated_at)
      INDEX customer_search (company, last_name, email)
    customer_address(id, customer_id -> customer ON DELETE CASCADE, kind, ...)

    product(id, sku UNIQUE, name, description, kind, net_price_cents,
            tax_rate_bp, unit_id -> unit, default_discount_bp, archived_at)
    unit(id, code UNIQUE, label, is_builtin)
    discount(id, code UNIQUE NULLABLE, kind, value, min_order_cents, max_uses,
             valid_from, valid_to, combinable, active)

    invoice(id, number UNIQUE NULLABLE, status, customer_id -> customer RESTRICT,
            issue_date, service_date, service_period_from, service_period_to,
            due_date, currency, language, template_id, prices_include_tax,
            tax_scheme_snapshot, company_snapshot_json, customer_snapshot_json,
            intro_text, outro_text, internal_note, subtotal_cents,
            discount_total_cents, net_total_cents, tax_total_cents,
            gross_total_cents, paid_cents, pdf_checksum, finalized_at,
            cancelled_by_id -> invoice, deleted_at)
      UNIQUE (number) WHERE number IS NOT NULL
      INDEX invoice_status_due (status, due_date)
    invoice_item(id, invoice_id -> invoice ON DELETE CASCADE, position, kind,
                 product_id -> product SET NULL, description, description_extra,
                 quantity_milli, unit_id, unit_price_cents, tax_rate_bp,
                 discount_kind, discount_value, line_net_cents, line_tax_cents)
    invoice_tax_summary(id, invoice_id, tax_rate_bp, net_cents, tax_cents)
      UNIQUE (invoice_id, tax_rate_bp)
    invoice_payment(id, invoice_id, paid_on, amount_cents, method, reference,
                    bank_account_id, note)
    invoice_attachment(id, invoice_id, file_path, mime, size_bytes, sha256)

    quote / quote_item, credit_note / credit_note_item: gleiche Struktur,
    credit_note.origin_invoice_id -> invoice RESTRICT, Betraege negativ gefuehrt.

    document_template(id, name, version, is_default, layout_json, css_safe)
    email_account(id, host, port, security, username, sender_name, sender_email,
                  reply_to, bcc, secret_ref)   -- secret_ref zeigt in den Keychain
    email_template(id, kind, subject, body_html, body_text)
    email_queue_item(id, kind, document_id, to_addr, attempts, next_attempt_at,
                     status, last_error_code)
    email_log(id, queue_item_id, sent_at, recipients, subject, status, detail)

    number_sequence(id, doc_type UNIQUE, pattern, next_counter, padding,
                    reset_mode, last_reset_period)
    audit_log(id, at, action, object_type, object_id, old_json, new_json,
              user_id, device_id, source, prev_hash, entry_hash)
    backup_record, import_job, license_cache, app_migration, tag, user, role,
    permission, role_permission, user_role

`quantity_milli` haelt Mengen als Integer mit drei Nachkommastellen (1,5 h = 1500).
Damit bleibt auch die Mengenseite frei von Fliesskomma.

## Serverseitige Entitaeten

    license(id, key_hash UNIQUE, key_prefix, product, plan, status, features_json,
            created_at, activated_at, expires_at, max_devices, owner_id, note,
            blocked_reason, last_seen_at)
    license_owner(id, name, email UNIQUE, note)
    license_feature(id, license_id, feature_code)          UNIQUE (license_id, code)
    license_device(id, license_id, device_id, first_seen_at, last_seen_at,
                   app_version, os, deactivated_at)        UNIQUE (license_id, device_id)
    license_activation(id, license_id, device_id, at, ip_hash, result, reason)
    license_validation(id, license_id, device_id, at, result)
    app_release(id, version, channel, notes_md, download_url, min_version,
                critical, published_at, active)
    admin_session(id, token_hash, created_at, expires_at, ip_hash, revoked_at)
    revoked_token(id, jti, revoked_at, reason)
    admin_audit_log(id, at, actor, action, object_type, object_id, diff_json, ip_hash)
    server_setting(key PRIMARY KEY, value_json, updated_at)

Der Lizenzschluessel wird serverseitig nur als HMAC-SHA-256 mit serverseitigem
Pepper gespeichert — der Hash muss zum Nachschlagen deterministisch sein, ein
Salt je Datensatz waere hier unbrauchbar. Dazu ein Praefix von acht Zeichen zur
Wiedererkennung im Admin-Panel. Der Admin-Access-Token, der genau einmal geprueft
und nie gesucht wird, nutzt dagegen scrypt mit Zufallssalt.

## Aufbewahrung

Steuerlich relevante Dokumente werden nie automatisch geloescht. Der Papierkorb
gilt ausschliesslich fuer Entwuerfe, Kunden ohne Belege, Produkte und Vorlagen.
Beim Loeschversuch eines Kunden mit Belegen erscheint der Vorschlag "archivieren"
statt eines Fehlers.
