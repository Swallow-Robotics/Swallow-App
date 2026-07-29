import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "uploads")
    # Note: the value actually enforced at runtime is set in
    # app/__init__.py::create_app (MAX_CONTENT_LENGTH_BYTES env var,
    # default 250MB). Kept in sync here for reference only — this Config
    # class is not currently applied by create_app.
    MAX_CONTENT_LENGTH = int(
        os.environ.get("MAX_CONTENT_LENGTH_BYTES", 250 * 1024 * 1024)
    )
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",")

    @staticmethod
    def init_app(app):
        pass
