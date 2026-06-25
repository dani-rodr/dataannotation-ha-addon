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
RUN npm install --omit=dev

COPY src/ ./src/
COPY rootfs /

RUN chmod a+x /etc/services.d/dataannotation_projects/run
