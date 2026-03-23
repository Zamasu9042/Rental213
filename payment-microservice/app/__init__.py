from flask import Flask, send_from_directory
import os, stripe
from .config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    stripe.api_key = app.config["STRIPE_SECRET_KEY"]

    from .routes.payments import payments_bp
    app.register_blueprint(payments_bp, url_prefix="/api/payments")

    # Serve frontend at root
    @app.route("/")
    def index():
        return send_from_directory(os.path.join(app.root_path, 'static'), 'index.html')

    return app