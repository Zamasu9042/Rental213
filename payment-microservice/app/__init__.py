from flask import Flask
from .config import Config
import stripe

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    stripe.api_key = app.config["STRIPE_SECRET_KEY"]

    from .routes.payments import payments_bp
    app.register_blueprint(payments_bp, url_prefix="/api/payments")

    return app