/**
 * Fehlerkatalog der Oberfläche.
 *
 * Jeder Fehler nennt vier Dinge: was passiert ist, woran es liegt, was der
 * Nutzer tun kann, und ob ein erneuter Versuch sinnvoll ist. Fehler
 * entschuldigen sich nicht und bleiben nie vage.
 */

export interface ErrorInfo {
  readonly code: string;
  readonly title: string;
  readonly cause: string;
  readonly fix: string;
  readonly retryable: boolean;
}

export const ERROR_CATALOG: Readonly<Record<string, ErrorInfo>> = {
  E_SMTP_CONNECT: {
    code: 'E_SMTP_CONNECT', title: 'E-Mail konnte nicht versendet werden',
    cause: 'Der Mailserver hat die Verbindung abgelehnt.',
    fix: 'Host, Port und Verschlüsselung unter Einstellungen → E-Mail prüfen. 465 nutzt TLS, 587 nutzt STARTTLS.',
    retryable: true,
  },
  E_LICENSE_UNREACHABLE: {
    code: 'E_LICENSE_UNREACHABLE', title: 'Lizenzserver nicht erreichbar',
    cause: 'Es besteht derzeit keine Verbindung zu rechnungsapp.jadenk.de.',
    fix: 'Die Anwendung bleibt im Rahmen der Offline-Toleranz voll nutzbar. Die Prüfung wird automatisch wiederholt.',
    retryable: true,
  },
  E_LICENSE_EXPIRED: {
    code: 'E_LICENSE_EXPIRED', title: 'Lizenz abgelaufen',
    cause: 'Der Gültigkeitszeitraum der Lizenz ist überschritten.',
    fix: 'Lizenz verlängern. Bestehende Rechnungen bleiben lesbar und exportierbar.',
    retryable: false,
  },
  E_LICENSE_DEVICE_LIMIT: {
    code: 'E_LICENSE_DEVICE_LIMIT', title: 'Maximale Geräteanzahl erreicht',
    cause: 'Alle Geräteplätze dieser Lizenz sind belegt.',
    fix: 'Ein nicht mehr genutztes Gerät unter Lizenz → Geräte deaktivieren.',
    retryable: false,
  },
  E_PDF_FAILED: {
    code: 'E_PDF_FAILED', title: 'PDF konnte nicht erzeugt werden',
    cause: 'Die Vorlage enthält einen Fehler oder eine Schrift fehlt.',
    fix: 'Andere Vorlage wählen oder die Vorlage im Editor prüfen. Die Rechnungsdaten sind unverändert gespeichert.',
    retryable: true,
  },
  E_EXPORT_DIR: {
    code: 'E_EXPORT_DIR', title: 'Exportordner nicht beschreibbar',
    cause: 'Der eingestellte Ordner existiert nicht oder ist schreibgeschützt.',
    fix: 'Anderen Ordner unter Einstellungen → Allgemein wählen.',
    retryable: true,
  },
  E_BACKUP_CORRUPT: {
    code: 'E_BACKUP_CORRUPT', title: 'Sicherung beschädigt',
    cause: 'Die Prüfsumme der Sicherungsdatei stimmt nicht mit dem Manifest überein.',
    fix: 'Eine andere Sicherung wählen. Der aktuelle Datenbestand wurde nicht verändert.',
    retryable: false,
  },
  E_MIGRATION_FAILED: {
    code: 'E_MIGRATION_FAILED', title: 'Datenbankmigration fehlgeschlagen',
    cause: 'Das Schema konnte nicht auf die neue Version gehoben werden.',
    fix: 'Die Sicherheitskopie vor dem Update wurde behalten und kann wiederhergestellt werden.',
    retryable: false,
  },
  E_IMPORT_ROWS: {
    code: 'E_IMPORT_ROWS', title: 'Import enthält fehlerhafte Zeilen',
    cause: 'Einzelne Zeilen entsprechen nicht dem erwarteten Format.',
    fix: 'Fehlerbericht öffnen; fehlerfreie Zeilen können einzeln übernommen werden.',
    retryable: true,
  },
  E_MISSING_FIELDS: {
    code: 'E_MISSING_FIELDS', title: 'Rechnung ist unvollständig',
    cause: 'Pflichtfelder fehlen.',
    fix: 'Die markierten Felder ausfüllen. Der Entwurf bleibt gespeichert.',
    retryable: false,
  },
  E_DUPLICATE_NUMBER: {
    code: 'E_DUPLICATE_NUMBER', title: 'Rechnungsnummer bereits vergeben',
    cause: 'Der Nummernkreis wurde zwischenzeitlich von einem anderen Vorgang genutzt.',
    fix: 'Die nächste freie Nummer wird vorgeschlagen.',
    retryable: true,
  },
  E_CALC_MISMATCH: {
    code: 'E_CALC_MISMATCH', title: 'Beträge stimmen nicht überein',
    cause: 'Die Neuberechnung beim Finalisieren weicht von der Anzeige ab.',
    fix: 'Die Rechnung wurde nicht finalisiert. Bitte erneut öffnen; die Positionen sind unverändert.',
    retryable: true,
  },
};

export function describeError(code: string): ErrorInfo {
  return ERROR_CATALOG[code] ?? {
    code, title: 'Unerwarteter Fehler',
    cause: 'Die Ursache ist nicht bekannt.',
    fix: 'Technische Details aufklappen und bei Bedarf mit der Fehler-ID melden.',
    retryable: true,
  };
}
