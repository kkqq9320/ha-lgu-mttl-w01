FROM python:3.12-alpine
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY backend/backend.py backend/ha_bridge.py backend/backup_manager.py backend/firmware_manager.py backend/firmware_patch.py /app/
COPY backend/static /app/static
COPY run.py /run.py
CMD ["python", "/run.py"]
