import sys
from pathlib import Path


MAIL_API_DIR = Path(__file__).resolve().parents[1]
if str(MAIL_API_DIR) not in sys.path:
    sys.path.insert(0, str(MAIL_API_DIR))
