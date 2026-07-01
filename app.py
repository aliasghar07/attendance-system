"""
Attendance Register & Percentage Calculator
--------------------------------------------
A Flask + SQLite rebuild of an original 8086 assembly console program.
Same core logic: validate inputs, compute attendance percentage,
classify status, keep a running log of every entry.
"""

from flask import Flask, render_template, request, jsonify
import sqlite3
import os
import logging
import traceback
from datetime import datetime

APP_DIR = os.path.dirname(os.path.abspath(__file__))
# Allow overriding via DATABASE_PATH env var (useful on hosts where the app
# directory isn't reliably writable). Defaults to a file next to app.py.
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(APP_DIR, "attendance.db"))

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("attendance_app")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    try:
        conn = get_db()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL DEFAULT 'General',
                total_classes INTEGER NOT NULL,
                attended INTEGER NOT NULL,
                percentage REAL NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()
        logger.info("Database ready at %s", DB_PATH)
    except Exception:
        logger.error("Failed to initialize database at %s\n%s", DB_PATH, traceback.format_exc())
        raise


# ---------------------------------------------------------------------------
# Core logic (mirrors the original assembly CALC_PCT / status thresholds)
# ---------------------------------------------------------------------------
def classify_status(pct):
    """Same bands as the original SHOW_SHORT / SATISFY / GOOD / EXCEL labels."""
    if pct < 75:
        return "SHORT", "Below 75% - At Risk", "risk"
    elif pct < 80:
        return "SATISFACTORY", "75% - 80%", "satisfactory"
    elif pct < 90:
        return "GOOD", "80% - 90%", "good"
    else:
        return "EXCELLENT", "90% - 100%", "excellent"


def classes_needed_for_target(attended, total, target=75):
    """
    How many more classes (all attended) are needed to reach `target`% ,
    solving: (attended + x) / (total + x) >= target/100
    """
    if total == 0:
        return 0
    current = (attended / total) * 100
    if current >= target:
        return 0
    # x >= (target*total - 100*attended) / (100 - target)
    import math
    numerator = target * total - 100 * attended
    denominator = 100 - target
    x = math.ceil(numerator / denominator)
    return max(x, 0)


def classes_can_skip(attended, total, target=75):
    """
    How many more classes can be missed (total grows, attended stays)
    while staying at/above `target`% ,
    solving: attended / (total + x) >= target/100
    """
    if attended == 0:
        return 0
    x = (attended * 100 / target) - total
    import math
    return max(math.floor(x), 0)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.errorhandler(500)
def handle_server_error(err):
    logger.error("Unhandled exception on %s %s\n%s", request.method, request.path, traceback.format_exc())
    return jsonify({"error": "Something went wrong on the server. Please try again."}), 500


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def calculate():
    data = request.get_json(force=True, silent=True) or {}

    subject = (data.get("subject") or "General").strip()[:60] or "General"
    total_raw = data.get("total_classes")
    attended_raw = data.get("attended")

    # ---- Validation (mirrors READ_NUMBER + error branches in the asm) ----
    try:
        total = int(total_raw)
        attended = int(attended_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Digits only (0-9). Please enter valid whole numbers."}), 400

    if total < 0 or attended < 0:
        return jsonify({"error": "Values cannot be negative."}), 400
    if total == 0:
        return jsonify({"error": "Total classes cannot be zero!"}), 400
    if attended > total:
        return jsonify({"error": "Attended cannot exceed total!"}), 400
    if total > 999 or attended > 999:
        return jsonify({"error": "Maximum of 999 classes supported."}), 400

    percentage = round((attended * 100) / total, 2)
    label, range_text, css_class = classify_status(percentage)

    need = classes_needed_for_target(attended, total, 75)
    can_skip = classes_can_skip(attended, total, 75)

    conn = get_db()
    conn.execute(
        "INSERT INTO records (subject, total_classes, attended, percentage, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (subject, total, attended, percentage, label, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    row_id = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    conn.close()

    return jsonify(
        {
            "id": row_id,
            "subject": subject,
            "total_classes": total,
            "attended": attended,
            "missed": total - attended,
            "percentage": percentage,
            "status": label,
            "status_range": range_text,
            "status_class": css_class,
            "classes_needed_for_75": need,
            "classes_can_skip_for_75": can_skip,
        }
    )


@app.route("/api/history", methods=["GET"])
def history():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM records ORDER BY id DESC LIMIT 100"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/history/<int:record_id>", methods=["DELETE"])
def delete_history(record_id):
    conn = get_db()
    conn.execute("DELETE FROM records WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": record_id})


@app.route("/api/history", methods=["DELETE"])
def clear_history():
    conn = get_db()
    conn.execute("DELETE FROM records")
    conn.commit()
    conn.close()
    return jsonify({"cleared": True})


@app.route("/api/stats", methods=["GET"])
def stats():
    conn = get_db()
    rows = conn.execute("SELECT percentage, status FROM records").fetchall()
    conn.close()
    if not rows:
        return jsonify({"count": 0, "average": 0, "distribution": {}})
    pct_values = [r["percentage"] for r in rows]
    distribution = {}
    for r in rows:
        distribution[r["status"]] = distribution.get(r["status"], 0) + 1
    return jsonify(
        {
            "count": len(rows),
            "average": round(sum(pct_values) / len(pct_values), 2),
            "distribution": distribution,
        }
    )


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
else:
    # ensure DB exists when imported by a WSGI server (e.g. gunicorn on Render)
    init_db()
