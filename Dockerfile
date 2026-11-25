# SaafHawa – small production image for Google Cloud Run (listens on $PORT)
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js ./
COPY src ./src
COPY public ./public
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
