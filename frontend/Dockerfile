# Etapa 1: Build
FROM node:22-slim AS builder
LABEL com.centurylinklabs.watchtower.enable="true"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare yarn@3.2.3 --activate


COPY . .

RUN yarn install

ENV VITE_PUBLIC_BACKEND_URL=https://api.aptos.lendoor.xyz

ENV VITE_LENDOOR_ADDRESS="0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a"
ENV VITE_USDC_ADDRESS="0xa8fffd614c952e1b8febb99c4e6a8f394cda619c1591ac12256b33f2df73c7b9"
ENV VITE_ZK_ME_APP_ID="M2025100210938328910000000068668"
ENV VITE_ZK_ME_PROGRAM_NO="202510030002"


RUN yarn build


FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare yarn@3.2.3 --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./

RUN yarn install

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./


EXPOSE 3001

CMD ["yarn", "preview", "--host", "0.0.0.0", "--port", "3001"]