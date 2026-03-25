from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import stripe

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)

    from .config import Config
    app.config.from_object(Config)

    db.init_app(app)
    stripe.api_key = app.config["STRIPE_SECRET_KEY"]

    from .routes.payments import payments_bp
    app.register_blueprint(payments_bp, url_prefix="/payment")

    with app.app_context():
        db.create_all()

    return app