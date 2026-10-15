# Sensor.Community

Luftqualität, Lärm und Wetter der Bürgersensoren von
[Sensor.Community](https://sensor.community) (ehemals Luftdaten): deine eigene
airRohr-Box oder die öffentlichen Sensoren rund um dein Zuhause.

> Ohne die Hardware entwickelt: Rückmeldungen willkommen. Die Integration
> wurde mit aufgezeichneten Antworten der öffentlichen API und der
> airRohr-Firmware geschrieben und getestet, nicht mit einer echten Box. Sag
> uns im Gladys-Forum, wie sie sich mit deiner verhält.

Diese Integration ist nicht mit Sensor.Community verbunden.

## Was sie macht

- Liest **öffentliche Sensoren** des Sensor.Community-Netzes über ihre ID,
  ohne Konto und ohne Schlüssel.
- Liest **deine eigene airRohr-Box** direkt in deinem Netzwerk, für Live-Werte
  jede Minute (optional).
- Legt **ein Gerät pro Sensor** an: PM2.5, PM10, PM1 falls gemessen,
  Temperatur, Luftfeuchtigkeit, Luftdruck, Lärm, CO2, je nach Sensor.
- Berechnet den **Europäischen Luftqualitätsindex** (EUA) aus PM2.5 und PM10
  und zeigt das Alter der letzten Messung: ein stummer Sensor wird gemeldet.
- Fügt das Dashboard-Widget **Luftqualität**, den Szenen-Auslöser
  **Luftqualität hat sich geändert** und die Szenen-Aktion **Luftqualität
  abrufen** hinzu.

Nur lesend: die Integration ändert nie etwas an einem Sensor.

## Voraussetzungen

- Gladys Assistant **5.2.0** oder neuer.
- Internetzugang für die öffentlichen Sensoren (die Daten-API von
  Sensor.Community).
- Für deine eigene Box: eine airRohr (oder jede Box mit der
  Sensor.Community-Firmware), von Gladys aus erreichbar, mit einer **festen
  IP-Adresse** (DHCP-Reservierung im Router).
- Für die Suche in der Nähe: der Standort deines Hauses unter **Einstellungen →
  Häuser**. Die Integration fragt auf dem Installationsbildschirm nach Zugriff
  auf die Koordinaten der Häuser; sie nutzt sie nur für diese Suche.

## Konfiguration

### Sensoren auswählen

1. Öffne den Tab **Konfiguration** der Integration.
2. Klicke auf **Sensoren um ein Haus finden**: wähle das Haus (leer: das erste
   Haus mit Standort) und einen Radius (leer: 2 km). Das Ergebnis listet die
   Sensoren auf, die in den letzten 5 Minuten Daten gesendet haben, der nächste
   zuerst, mit Typ, Entfernung und Messwerten, und die IDs zum Kopieren.
3. Kopiere die gewünschten IDs in **Sensor-IDs**, durch Kommas getrennt
   (höchstens 20). Die ID ist auch die Nummer, die beim Klick auf einen Sensor
   der [Karte](https://maps.sensor.community) erscheint.
4. Speichere: die Geräte erscheinen im Tab **Entdecken**, sobald ihre erste
   Messung gelesen ist. Füge sie zu Gladys hinzu.

Tipp: der Feinstaubsensor (SDS011, SPS30…) und der Wettersensor (BME280,
DHT22…) derselben Box haben zwei verschiedene IDs: füge beide hinzu.

### Deine eigene airRohr-Box

Gib ihre IP-Adresse in **Adresse deiner airRohr-Box** ein (zum Beispiel
`192.0.2.20`). Nutze die IP-Adresse: Namen auf `.local` werden aus dem Container
der Integration nicht aufgelöst. Die Box wird jede Minute über ihre Seite
`/data.json` gelesen; ein Passwort ist nicht nötig.

### Weitere Einstellungen

- **Abruf der öffentlichen Sensoren**: alle 5, 10, 15 oder 30 Minuten. Die
  öffentlichen Daten ändern sich alle 5 Minuten, und Sensor.Community bittet um
  Zurückhaltung: höchstens alle 5 Minuten.
- **Sprache**: die Sprache der Funktionsnamen (beim Hinzufügen eines Geräts
  festgelegt) und der an die Szenen gesendeten Texte. Standardmäßig
  Französisch.

Der Button **Sensoren prüfen** liest jeden konfigurierten Sensor und zeigt, was
er antwortet: seinen Typ und das Alter seiner Messung, keine Daten oder einen
Fehler.

## Geräte

### Öffentlicher Sensor

Ein Gerät pro ID, benannt `Sensor.Community #<ID> (<Typ>)`. Seine Funktionen
folgen dem, was der Sensor misst:

| Funktion                      | Einheit | Sensoren                        |
| ----------------------------- | ------- | ------------------------------- |
| PM2.5, PM10                   | µg/m³   | SDS011, SPS30, PMS, HPM, NextPM |
| PM1                           | µg/m³   | SPS30, PMS, NextPM              |
| Temperatur, Luftfeuchtigkeit  | °C, %   | BME280, DHT22, SHT3x, HTU21D    |
| Luftdruck                     | hPa     | BME280, BMP280, BMP180          |
| Luftdruck auf Meereshöhe      | hPa     | BME280, BMP280, BMP180          |
| Lärm (LAeq), Minimum, Maximum | dB      | DNMS                            |
| CO2                           | ppm     | SCD30                           |
| Luftqualitätsindex (EAQI)     | 1–6     | jeder Feinstaubsensor           |
| Alter der Messung             | Min.    | jeder Sensor                    |

Jeder Wert ist der Mittelwert der Messungen der letzten 5 Minuten, wie auf der
Karte von Sensor.Community. PM1 wird als Funktion vom Typ PM2.5 gezeigt
(Gladys hat keine PM1-Kategorie), benannt „PM1“.

### Deine airRohr-Box

Ein Gerät namens `airRohr <Chip-ID>` (zum Beispiel `airRohr esp8266-1234567`),
mit allen Sensoren, die an der Box hängen. Der Name jeder Funktion nennt den
Sensor: „Temperatur (BME280)“, „Temperatur (DHT22)“.

### Luftqualitätsindex

Der **Europäische Luftqualitätsindex** der Europäischen Umweltagentur, von 1
bis 6: gut, ausreichend, mäßig, schlecht, sehr schlecht, extrem schlecht. Der
schlechtere Wert von PM2.5 und PM10 bestimmt die Stufe (2024 überarbeitete
Schwellen: PM2.5 bis 5, 15, 50, 90, 140 µg/m³; PM10 bis 15, 45, 120, 195, 270
µg/m³). Die EUA berechnet ihn aus validierten Mittelwerten von
Referenzstationen: bei einem Bürgersensor und 5 Minuten ist er ein Richtwert.

### Alter der Messung

Die Minuten seit der letzten Messung des Sensors. Nach 15 Minuten ist die
Messung **veraltet**: die Integration sendet ihre Werte nicht mehr (Gladys
zeigt weiter die letzten mit ihrem Datum), das Widget zeigt „Veraltet“, und das
Alter wächst weiter, damit eine Szene dich warnen kann.

## Widget

Füge das Widget **Luftqualität** zu einem Dashboard hinzu.

- Mit einem in den Einstellungen gewählten **Sensor**: Live-Kacheln (PM2.5,
  PM10, Temperatur, Luftfeuchtigkeit), die Stufe des europäischen Index nach
  ihrer Schwelle eingefärbt (grün für gut und ausreichend, orange für mäßig,
  rot darüber) und das Alter der Messung.
- Ohne Sensor: eine Zeile pro Feinstaubsensor, mit seiner Stufe.

## Szenen

### Auslöser: Luftqualität hat sich geändert

Startet die Szene, wenn der europäische Index eines Sensors eine andere Stufe
erreicht, bestätigt durch zwei Messungen in Folge (ein einzelner Rauchstoß löst
ihn nicht aus). Filter: der Sensor und die neuen Stufen, die zählen (zum
Beispiel schlecht, sehr schlecht, extrem schlecht). Variablen für die folgenden
Aktionen: Name des Sensors, Stufe (als Wort in der konfigurierten Sprache),
Stufe 1 bis 6, vorherige Stufe, Schadstoff, der die Stufe bestimmt, PM2.5 und
PM10.

### Aktion: Luftqualität abrufen

Liefert die Luftqualität eines Sensors oder, ohne Sensor, die schlechteste der
in den letzten 15 Minuten gemessenen Sensoren. Ausgaben: eine
**Zusammenfassung** für eine Benachrichtigung („Schlecht · PM2.5 62 µg/m³ ·
PM10 80 µg/m³ · vor 3 Min.“), die Stufe als Wort, ihr Schlüssel und ihre
Nummer, PM2.5, PM10 und das Alter der Messung.

## Szenenbeispiele

- **Fenster schließen, wenn die Luft schlecht wird**: Auslöser „Luftqualität
  hat sich geändert“ mit den Stufen schlecht, sehr schlecht, extrem schlecht →
  Nachricht senden „Luft {{triggerEvent.data.level_label}} bei
  {{triggerEvent.data.sensor_name}}: Fenster schließen“.
- **Morgenbericht**: um 7:30 → Aktion „Luftqualität abrufen“ → die
  Zusammenfassung in der Morgennachricht senden.
- **Stummer Sensor**: Auslöser auf der Funktion „Alter der Messung“ über 60
  Minuten → melden, dass der Sensor (oder das WLAN der Box) ausgefallen ist.
- **Lüftung**: wenn der Index deiner Box wieder gut oder ausreichend ist, die
  Lüftungsanlage starten.

## Fehlerbehebung

- **Kein Gerät im Tab Entdecken**: ein Sensor erscheint, sobald seine erste
  Messung gelesen ist. Klicke auf **Sensoren prüfen**: „keine Daten in den
  letzten 5 Minuten“ heißt, dass der Sensor offline ist oder die ID falsch ist
  (die API antwortet in beiden Fällen gleich). Prüfe die ID auf der Karte.
- **Der Status meldet, dass die API nicht antwortet**: die API von
  Sensor.Community ist ausgefallen oder von Gladys aus nicht erreichbar; die
  Messungen laufen von selbst wieder an.
- **Deine Box antwortet nicht**: prüfe ihre IP-Adresse (eine feste), ihre
  Stromversorgung und dass sie im selben Netzwerk wie Gladys ist, und öffne
  `http://<ihre Adresse>/data.json` in einem Browser.
- **Eine Box mit alter Firmware** (vor 2020) hat keine Seite `/metrics`: ihr
  Gerät wird dann nach ihrer Adresse benannt, und eine neue Adresse ergibt ein
  neues Gerät. Aktualisiere die Firmware.
- Logs: öffne die Logs der Integration in Gladys. Setze `LOG_LEVEL=debug`, um
  jede Messung zu sehen.

## Grenzen

- Daten von Bürgersensoren, nicht von Referenzstationen: günstige
  Feinstaubsensoren messen bei feuchter Luft (Nebel, Regen) zu viel. Lies die
  Werte als Tendenzen.
- Öffentliche Sensoren werden höchstens alle 5 Minuten gelesen, und höchstens
  20 Sensoren.
- Nur PM2.5 und PM10 fließen in den europäischen Index ein: die anderen
  Schadstoffe des offiziellen Index (Ozon, NO2, SO2) messen diese Sensoren
  nicht.
- PM4 und Partikelzählungen (SPS30, IPS-7100) werden nicht angezeigt: Gladys
  hat keine Kategorie dafür.
- Die Integration liest; sie konfiguriert nie eine Box.
