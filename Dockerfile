FROM node:14-slim

WORKDIR /app

COPY --chown=node:node package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY --chown=node:node . .
RUN mkdir -p /app/runtime && chown -R node:node /app

USER node

# Runtime files (config.json, credentials, token, .env) live in the mounted
# /app/runtime directory; application code and dependencies stay read-only.
WORKDIR /app/runtime

ENV NODE_ENV=production
ENV KODAMA_HOME=/app/runtime
ENV DATA_DIR=/app/runtime/data

CMD ["node", "/app/index.js"]
