-- LenzFlix „Meine Statistik“ – SQL-Entwürfe für Playback Reporting (SQLite)
--
-- Ausführen: Jellyfin-Dashboard → Playback Reporting → „Custom Query“ (nur Admin), „Replace UserId“ AUS.
-- Platzhalter vor dem Ausführen ersetzen:
--   <UID>   = 32 Hex-Zeichen OHNE Bindestriche, klein (z. B. des Testkontos; siehe T1, dort steht das echte Format)
--   <RANGE> = eines der Fragmente:
--       7d   : DateCreated >= datetime('now','localtime','-7 days')
--       30d  : DateCreated >= datetime('now','localtime','-30 days')
--       year : DateCreated >= datetime('now','localtime','start of year')
--       all  : 1=1
-- Gemeinsame Bedingung ("COMMON") in Q1–Q6:  UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
-- Im Worker werden UID (strikt ^[0-9a-f]{32}$, aus /Users/Me) und RANGE (Whitelist-Map) zusammengesetzt, nie freie Strings.
-- substr(DateCreated,1,19) vor strftime(): DateCreated hat laut Plugin variable Nachkommastellen (yyyy-MM-dd HH:mm:ss.FFFFFFF).

------------------------------------------------------------------------------------------------
-- T1: Formate prüfen (UserId/ItemId ohne Bindestriche? Episoden-ItemName? PlaybackMethod-Werte? Zeitzone?)
SELECT DateCreated, datetime('now','localtime') AS jetzt_lokal, UserId, ItemId, ItemType, ItemName,
       PlaybackMethod, ClientName, DeviceName, PlayDuration
FROM PlaybackActivity ORDER BY DateCreated DESC LIMIT 8;

-- T2: Datenumfang (Retention) und Zeilenzahl
SELECT MIN(DateCreated) AS aeltester, MAX(DateCreated) AS neuester, COUNT(*) AS zeilen,
       COUNT(DISTINCT UserId) AS nutzer FROM PlaybackActivity;

-- T3: Welche PlaybackMethod-Werte gibt es?
SELECT PlaybackMethod, COUNT(*) AS n FROM PlaybackActivity GROUP BY PlaybackMethod ORDER BY n DESC;

------------------------------------------------------------------------------------------------
-- Q1: Summe/Zähler (eine Zeile) + Ignorierliste
SELECT COALESCE(SUM(PlayDuration),0) AS secs, COUNT(*) AS plays,
       COUNT(DISTINCT substr(DateCreated,1,10)) AS activeDays,
       MIN(DateCreated) AS firstAt, MAX(DateCreated) AS lastAt,
       (SELECT COUNT(*) FROM UserList WHERE UserId = '<UID>') AS ignored
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>;

-- Q2: gezählte Items (Summe pro Item >= 300 s); im Worker auf 3000 Zeilen gedeckelt
SELECT ItemId, ItemType, COUNT(*) AS plays, SUM(PlayDuration) AS secs, MAX(DateCreated) AS lastAt
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY ItemId, ItemType
HAVING SUM(PlayDuration) >= 300
ORDER BY secs DESC
LIMIT 3000;

-- Q2b: exakte Anzahl gezählter Items (unabhängig vom 3000er-Cap)
SELECT ItemType, COUNT(*) AS n FROM (
  SELECT ItemId, ItemType FROM PlaybackActivity
  WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
  GROUP BY ItemId, ItemType HAVING SUM(PlayDuration) >= 300
) GROUP BY ItemType;

-- Q3: Verlauf. Bucket-Ausdruck je Range (Whitelist):
--   7d/30d -> substr(DateCreated,1,10)                           (Tag)
--   year   -> strftime('%Y-%W', substr(DateCreated,1,19))        (Woche)
--   all    -> substr(DateCreated,1,7)                            (Monat)
SELECT substr(DateCreated,1,10) AS bucket, SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY bucket ORDER BY bucket;

-- Q4: Heatmap Wochentag (0=So) × Stunde
SELECT strftime('%w', substr(DateCreated,1,19)) AS dow, strftime('%H', substr(DateCreated,1,19)) AS hr,
       SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY dow, hr;

-- Q5a: Tag mit der meisten Watchtime
SELECT substr(DateCreated,1,10) AS day, SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY day ORDER BY secs DESC LIMIT 1;

-- Q5b: Folgen pro Tag (>= 300 s pro Folge und Tag) – Serien-Zuordnung macht der Worker; Cap 3000
SELECT substr(DateCreated,1,10) AS day, ItemId, SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType = 'Episode' AND <RANGE>
GROUP BY day, ItemId
HAVING SUM(PlayDuration) >= 300
ORDER BY secs DESC
LIMIT 3000;

-- Q6a: Top-Geräte/Clients
SELECT ClientName, DeviceName, COUNT(*) AS plays, SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY ClientName, DeviceName ORDER BY secs DESC LIMIT 5;

-- Q6b: Wiedergabeart (Normalisierung im Worker per Präfix)
SELECT PlaybackMethod, COUNT(*) AS plays, SUM(PlayDuration) AS secs
FROM PlaybackActivity
WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>
GROUP BY PlaybackMethod;

-- Q7: Vergleich – nur Aggregat (n = aktive Nutzer, Ignorierliste ausgenommen; ahead = Nutzer mit MEHR Watchtime als der eigene)
-- Die Antwort enthält keine fremden UserIds. Im Worker: rank = ahead + 1, of = n, avg = avgSecs; null bei n < 3 oder eigener Summe 0 oder ignoriert.
SELECT COUNT(*) AS n, AVG(t) AS avgSecs,
       SUM(CASE WHEN t > (SELECT COALESCE(SUM(PlayDuration),0) FROM PlaybackActivity
                          WHERE UserId = '<UID>' AND ItemType IN ('Movie','Episode') AND <RANGE>) THEN 1 ELSE 0 END) AS ahead
FROM (
  SELECT UserId, SUM(PlayDuration) AS t FROM PlaybackActivity
  WHERE ItemType IN ('Movie','Episode') AND <RANGE> AND UserId NOT IN (SELECT UserId FROM UserList)
  GROUP BY UserId
);
