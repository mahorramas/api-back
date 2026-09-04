FROM node:22.11.0-slim

# --- VARIABLES DE ENTORNO PARA COOLIFY/STRAPI ---
ARG DATABASE_HOST
ARG DATABASE_PORT
ARG DATABASE_NAME
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD
ARG APP_KEYS
ARG API_TOKEN_SALT
ARG ADMIN_JWT_SECRET
ARG JWT_SECRET
ARG TRANSFER_TOKEN_SALT
ARG NEWSLETTER_API_TOKEN
ARG SMTP_HOST
ARG SMTP_PORT
ARG SMTP_USERNAME
ARG SMTP_PASSWORD
ARG SMTP_SECURE
ARG EMAIL_FROM
ARG EMAIL_REPLY_TO
ARG PRICE_IMPORT_TOKEN

# Instalar dependencias usando apt-get (Debian) para compatibilidad con libvips/sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    autoconf \
    automake \
    zlib1g-dev \
    libpng-dev \
    nasm \
    bash \
    libvips-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /opt/
COPY package.json package-lock.json ./

RUN npm install -g node-gyp
RUN npm config set fetch-retry-maxtimeout 600000 -g && npm install
ENV PATH=/opt/node_modules/.bin:$PATH

WORKDIR /opt/app
COPY . .
RUN chown -R node:node /opt/app

USER node
RUN npm run build

EXPOSE 1337

# Cambiado a 'start' para producción. Usa 'develop' solo si es entorno de pruebas.
CMD ["npm", "run", "start"]
