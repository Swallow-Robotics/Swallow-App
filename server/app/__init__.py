"""
Flask application factory for Swallow Skyer backend.
"""

import os
from urllib.parse import urlparse
from flask import Flask
from flask_cors import CORS
from app.env_loader import load_app_environment

# Load environment variables early (module import time) so config is available
# regardless of how the server is started (flask run, python app.py, etc).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_app_environment()


def create_app(config_name=None):
    """
    Application factory pattern.

    Args:
        config_name (str): Configuration name ('development', 'production', 'testing')

    Returns:
        Flask: Configured Flask application instance
    """
    app = Flask(__name__)

    app_env = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "development").strip().lower()
    is_production = app_env == "production"

    # Configuration
    secret_key = (os.environ.get("SECRET_KEY") or "").strip()
    if is_production and not secret_key:
        raise RuntimeError("SECRET_KEY is required in production")
    app.config["SECRET_KEY"] = secret_key or "dev-secret-key-change-in-production"

    # Support multiple local dev ports by default; override with FRONTEND_ORIGIN env var
    default_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    env_origins = os.environ.get("FRONTEND_ORIGIN")
    if env_origins:
        raw = [o.strip() for o in env_origins.split(",") if o.strip()]
        # Ensure we store origins (scheme://host[:port]) rather than full URLs with paths.
        origin_list = []
        for item in raw:
            try:
                parsed = urlparse(item)
                if parsed.scheme and parsed.netloc:
                    origin_list.append(f"{parsed.scheme}://{parsed.netloc}")
                else:
                    origin_list.append(item)
            except Exception:
                origin_list.append(item)
    else:
        origin_list = default_origins
    CORS(
        app,
        resources={r"/*": {"origins": origin_list}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # Register blueprints
    from app.routes import main_bp
    from app.routes.projects import projects_bp
    from app.routes.project_members import project_members_bp
    from app.api_routes.v1.photos import bp as photos_v1_bp
    from app.api_routes.v1.profile import bp as profile_v1_bp
    from app.api_routes.v1.locations import bp as locations_v1_bp
    from app.api_routes.files import bp as files_bp
    from app.api_routes.public_links import bp as public_links_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(project_members_bp)
    app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")
    app.register_blueprint(profile_v1_bp, url_prefix="/api/v1/profile")
    app.register_blueprint(locations_v1_bp, url_prefix="/api/v1/locations")
    app.register_blueprint(files_bp)
    app.register_blueprint(public_links_bp)

    @app.route("/api/test/connection", methods=["GET"])
    def test_connection():
        return {
            "status": "success",
            "message": "Backend connected",
            "platform": "v1",
            "exif_mode": "canonical_gps_only",
        }

    return app
