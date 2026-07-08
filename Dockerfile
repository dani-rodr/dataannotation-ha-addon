ARG BUILD_FROM
FROM $BUILD_FROM

WORKDIR /app

RUN apk add --no-cache \
    nodejs \
    npm \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

COPY package.json ./
COPY package-lock.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

COPY rootfs /

RUN chmod a+x /etc/services.d/dataannotation_projects/run
