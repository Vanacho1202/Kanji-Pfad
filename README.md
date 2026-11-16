# Kanji-Pfad

JLPT-N5-Kanji-Trainer als Web-App (auch als App auf dem Home-Bildschirm).

- `public/index.html`: die App
- `server.js`: kleiner Node-Server, liefert die App aus und speichert den Fortschritt pro Sync-Code in Postgres (Neon)

Umgebungsvariable: `DATABASE_URL` (Neon-Connection-String).
