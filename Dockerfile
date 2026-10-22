FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --break-system-packages ortools

WORKDIR /app
# คัดลอกไฟล์จาก Root ของโปรเจกต์โดยตรง
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /web/dist ./public

ENV NODE_ENV=production PYTHON_PATH=python3
EXPOSE 3000
CMD ["node", "src/index.js"]