FROM node:22-alpine AS deps
WORKDIR /app
COPY src/currency-service/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src/currency-service/src ./src/
EXPOSE 5005
CMD ["node", "src/server.js"]
