FROM python:3.12-alpine
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY backend/backend.py backend/ha_bridge.py backend/backup_manager.py backend/firmware_manager.py backend/firmware_patch.py /app/
COPY backend/static /app/static
COPY run.py /run.py
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1
CMD ["python", "/run.py"]
