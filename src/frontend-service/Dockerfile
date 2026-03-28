# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
COPY src/frontend-service/package*.json ./
RUN npm ci
COPY src/frontend-service/ .
RUN npm run generate
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY src/frontend-service/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
