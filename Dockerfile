FROM node:18-slim

# System deps
RUN apt-get update && apt-get install -y curl && apt-get clean

WORKDIR /usr/src/app

# App deps
COPY package*.json ./
RUN npm install --omit=dev

# App code
COPY public ./public
COPY server ./server
COPY db.js .
COPY server.js .
COPY service-account.json .

# Cloud SQL Proxy v2
ADD https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64 /cloud-sql-proxy
RUN chmod +x /cloud-sql-proxy

# Cloud SQL settings
ENV INSTANCE_CONNECTION_NAME=avid-influence-457813-t0:us-central1:ibc-postgres-db

# Socket dir
RUN mkdir -p /cloudsql && chmod 777 /cloudsql
ENV PGHOST=/cloudsql/${INSTANCE_CONNECTION_NAME}
ENV PGPORT=5432

# Cloud Run uses $PORT (default 8080). Make sure server.js respects this.
EXPOSE 8080

# Run proxy + app
# NOTE: call /cloud-sql-proxy (ABSOLUTE PATH), not ./cloud-sql-proxy
CMD ["sh", "-c", "/cloud-sql-proxy --unix-socket /cloudsql $INSTANCE_CONNECTION_NAME --credentials-file=./service-account.json --structured-logs > /tmp/proxy.log 2>&1 & \
sleep 3 && echo '--- proxy log ---' && cat /tmp/proxy.log && echo '---------------' && ls -al /cloudsql && node server.js"]
