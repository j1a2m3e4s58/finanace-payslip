FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=4190 PORTAL_FRONTEND_DIR=/app/public
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends clamav clamav-freshclam \
    && freshclam --stdout \
    && rm -rf /var/lib/apt/lists/*
COPY mail-api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY mail-api/ ./
COPY --from=frontend /app/dist/ ./public/
EXPOSE 4190
CMD ["sh", "-c", "waitress-serve --listen=0.0.0.0:${PORT:-4190} --threads=8 wsgi:application"]
