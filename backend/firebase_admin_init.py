import os
import firebase_admin
from firebase_admin import credentials, firestore, storage

_app = None


def init_firebase():
    global _app
    if _app is not None:
        return
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "./firebase-service-account.json")
    cred = credentials.Certificate(sa_path)
    _app = firebase_admin.initialize_app(cred, {
        "storageBucket": os.getenv("VITE_FIREBASE_STORAGE_BUCKET", "")
    })


def get_db():
    init_firebase()
    return firestore.client()


def get_bucket():
    init_firebase()
    return storage.bucket()
